// Shared core of the "website stock" sync — one implementation, two callers:
//
//   scripts/sync-site-listings.mjs  → CLI, run from a terminal
//   api/site-sync.js                → CRM one-click button, runs on Vercel
//
// Purpose: make Supabase `site_listings` match src/site-content.seed.json
// exactly, i.e. the real stock of 25 cars:
//   • 12 showroom cars (AR7-26001–AR7-26012, with photo galleries)
//   • 13 authentic Goo-net cars (long numeric stock numbers)
//
// Rules:
//   • seed cars missing from the database are INSERTED
//   • seed cars already present are UPDATED by stock_no — every field from
//     the seed, including the `images` gallery, published=true and
//     sort_order = position in the seed file
//   • sort_order 1–12 MUST stay the showroom cars: the public site treats
//     sort_order <= 12 as the showroom section (src/main.jsx isShowroom)
//   • database rows whose stock_no is NOT in the seed are hidden with
//     published=false (reversible — they can be re-published from the CRM),
//     or hard-deleted when hardDelete=true
//
// No dependencies beyond the passed-in Supabase client, so the same file
// bundles cleanly into the Vercel function and runs locally in Node 20+.

// Field order mirrors the columns the CRM exposes for website cars.
const LISTING_FIELDS = [
  'stock_no', 'make', 'model', 'year', 'km', 'fuel', 'body', 'price',
  'image', 'images', 'grade', 'status', 'location', 'tr', 'drv', 'eng',
  'seats', 'col', 'st'
];

// Build the exact row payload a seed car must have at the given position.
export function payloadFor(seedCar, position) {
  const out = {};
  for (const k of LISTING_FIELDS) if (k in seedCar) out[k] = seedCar[k];
  out.published = true;
  out.sort_order = position;
  return out;
}

function sameValue(key, a, b) {
  if (key === 'images' || key === 'gallery') return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  if (key === 'year' || key === 'seats' || key === 'sort_order') return Number(a) === Number(b);
  if (key === 'published') return !!a === !!b;
  return String(a ?? '') === String(b ?? '');
}

// Compare seed vs current database rows and produce a change plan.
// Pure function — safe for --dry-run.
export function computePlan(seedListings, dbRows, { hardDelete = false } = {}) {
  const byStock = new Map();
  for (const r of dbRows || []) byStock.set(String(r.stock_no), r);

  const seedStocks = new Set();
  const toInsert = [];
  const toUpdate = [];
  const unchanged = [];

  seedListings.forEach((car, i) => {
    const payload = payloadFor(car, i + 1);
    seedStocks.add(String(payload.stock_no));
    const existing = byStock.get(String(payload.stock_no));
    if (!existing) return toInsert.push(payload);

    const changes = LISTING_FIELDS.concat('published', 'sort_order')
      .filter(k => !sameValue(k, payload[k], existing[k]));
    if (changes.length) {
      toUpdate.push({ id: existing.id, stock_no: payload.stock_no, changes, payload: { ...payload, updated_at: new Date().toISOString() } });
    } else {
      unchanged.push(payload.stock_no);
    }
  });

  const stale = (dbRows || []).filter(r => !seedStocks.has(String(r.stock_no)));
  // Only rows that are still published need to be flipped.
  const toUnpublish = hardDelete ? [] : stale.filter(r => r.published !== false);
  const toDelete = hardDelete ? stale : [];

  return { toInsert, toUpdate, unchanged, toUnpublish, toDelete, staleCount: stale.length, seedStocks };
}

// Execute a plan against a Supabase client. Throws on the first failure so
// callers can report it; rows are small (<= a few dozen) so per-row updates
// are fine and keep the error messages precise.
export async function applyPlan(db, plan) {
  const done = { inserted: 0, updated: 0, unpublished: 0, deleted: 0 };

  if (plan.toInsert.length) {
    const { error } = await db.from('site_listings').insert(plan.toInsert);
    if (error) throw new Error('insert failed: ' + error.message);
    done.inserted = plan.toInsert.length;
  }

  for (const u of plan.toUpdate) {
    const { error } = await db.from('site_listings').update(u.payload).eq('id', u.id);
    if (error) throw new Error('update failed for ' + u.stock_no + ': ' + error.message);
    done.updated++;
  }

  if (plan.toUnpublish.length) {
    const { error } = await db.from('site_listings')
      .update({ published: false, updated_at: new Date().toISOString() })
      .in('id', plan.toUnpublish.map(r => r.id));
    if (error) throw new Error('unpublish failed: ' + error.message);
    done.unpublished = plan.toUnpublish.length;
  }

  if (plan.toDelete.length) {
    const { error } = await db.from('site_listings').delete().in('id', plan.toDelete.map(r => r.id));
    if (error) throw new Error('delete failed: ' + error.message);
    done.deleted = plan.toDelete.length;
  }

  return done;
}

// One human-readable line for the CLI / CRM notice / activity log.
export function summarize(plan, done) {
  done = done || {};
  const parts = [
    (done.inserted ?? plan.toInsert.length) + ' inserted',
    (done.updated ?? plan.toUpdate.length) + ' updated',
    plan.unchanged.length + ' already in sync'
  ];
  if (plan.toDelete.length) parts.push(plan.toDelete.length + ' deleted (not in seed)');
  else if (plan.toUnpublish.length) parts.push(plan.toUnpublish.length + ' hidden (published=false, not in seed)');
  return parts.join(', ');
}
