#!/usr/bin/env node
// Machinery link import & daily sync — the Goo-net equivalent for China.
//
//   npm run machinery:sync -- --url https://…            import one product
//   npm run machinery:sync -- --file links.txt           import a list
//   npm run machinery:sync -- --daily                    re-price everything sourced
//   npm run machinery:sync -- --url … --rights dropship-authorized --write
//
// Flags
//   --url <link>        a product page to import (repeatable)
//   --file <path>       a text file of links, one per line
//   --rights <basis>    dropship-authorized | supplier-permission | own-photo
//   --facts-only        import price and specification, leave photos pending
//   --adapter <name>    force an adapter (see src/machinery-source.js)
//   --daily             refresh every listing that came from a source URL
//   --write             merge the results into src/machinery-data.js
//   --check             validate only, never write
//
// HOW THE FETCH WORKS
// -------------------
// Same shape as scripts/goonet-crawl.mjs: a direct fetch with a browser user
// agent, and if the page comes back empty or gated, a retry through the Jina
// reader relay (JINA_API_KEY), which returns the page as text. Supplier sites
// in China frequently block datacentre IPs, so without the relay many pages
// will come back empty — that is a network fact, not a bug in the parser.
//
// WHAT IT WILL NOT DO
// -------------------
// It will not strip a watermark, and it will not publish a product photo
// without a recorded rights basis. With no basis it imports the listing —
// real price, real specification — and marks the machine `photosPending`.
// Facts are facts; photographs belong to whoever took them. Details:
// MACHINERY-SOURCES.md.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = path.join(root, 'src/machinery-data.js');
const PHOTO_DIR = path.join(root, 'public/assets/machinery');
const STAGING = path.join(root, 'machinery-suppliers/imported');
const BRAND_SCRIPT = path.join(root, 'scripts/brand-machine-photo.sh');

const args = process.argv.slice(2);
const flag = n => args.includes('--' + n);
const opt = n => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };
const opts = n => args.reduce((acc, a, i) => (a === '--' + n ? [...acc, args[i + 1]] : acc), []);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const RELAY = 'https://r.jina.ai/';

const { extractProduct, toMachine, chooseAdapter, ADAPTERS, RIGHTS, rightsAreUsable, reviewPhotos, PHOTO_STANDARD } = await import('../src/machinery-source.js');
const { MACHINERY_MARKUP, MACHINES } = await import('../src/machinery-data.js');

/* ---------------------------------------------------------------------------
   Fetch — direct first, relay second (mirrors scripts/goonet-crawl.mjs)
   --------------------------------------------------------------------------- */
async function fetchPage(url) {
  const attempt = async (target, headers) => {
    const res = await fetch(target, { headers, redirect: 'follow' });
    const html = await res.text();
    return { ok: res.ok, status: res.status, html };
  };

  try {
    const direct = await attempt(url, { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' });
    // A marketplace gate page is small and says so; treat it as a miss.
    const gated = direct.html.length < 6000 && /captcha|verify|robot|滑动|安全/i.test(direct.html);
    if (direct.ok && direct.html.length > 6000 && !gated) return { ...direct, via: 'direct' };
  } catch (e) {
    if (!process.env.JINA_API_KEY) {
      return { ok: false, status: 0, html: '', via: 'direct', error: e.message };
    }
  }

  if (process.env.JINA_API_KEY) {
    try {
      const relayed = await attempt(RELAY + url, {
        'User-Agent': UA, 'Accept': 'text/plain', 'Authorization': `Bearer ${process.env.JINA_API_KEY}`
      });
      if (relayed.ok && relayed.html.length > 800) return { ...relayed, via: 'relay' };
    } catch (e) {
      return { ok: false, status: 0, html: '', via: 'relay', error: e.message };
    }
  }
  return { ok: false, status: 0, html: '', via: 'none', error: 'unreachable (set JINA_API_KEY for the relay fallback)' };
}

/* ---------------------------------------------------------------------------
   Alibaba Open Platform adapter
   ---------------------------------------------------------------------------
   The sanctioned route. Requires ALIBABA_APP_KEY + ALIBABA_APP_SECRET from an
   approved application on the Alibaba.com Open Platform. The request shape
   below follows that protocol; it cannot be exercised without credentials, so
   it fails loudly rather than pretending to work.
   --------------------------------------------------------------------------- */
async function viaAlibabaOpen(url) {
  const key = process.env.ALIBABA_APP_KEY;
  const secret = process.env.ALIBABA_APP_SECRET;
  if (!key || !secret) throw new Error('ALIBABA_APP_KEY and ALIBABA_APP_SECRET are required for the alibaba-open adapter');
  const productId = (String(url).match(/(\d{8,})/) || [])[1];
  if (!productId) throw new Error('no product id in that URL');
  const { createHash } = await import('node:crypto');
  const params = {
    method: 'alibaba.icbu.product.get',
    app_key: key,
    timestamp: String(Date.now()),
    format: 'json',
    v: '2.0',
    sign_method: 'md5',
    product_id: productId
  };
  const sign = createHash('md5')
    .update(secret + Object.keys(params).sort().map(k => k + params[k]).join('') + secret)
    .digest('hex').toUpperCase();
  const res = await fetch('https://gw.api.alibaba.com/openapi/param2/2/icbu.product.get/' + key, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: new URLSearchParams({ ...params, sign }).toString()
  });
  const json = await res.json().catch(() => null);
  if (!json) throw new Error(`Alibaba API returned ${res.status}`);
  if (json.error_response) throw new Error('Alibaba API: ' + (json.error_response.msg || JSON.stringify(json.error_response)));
  const p = json.result || json.product || {};
  return {
    url,
    title: p.subject || p.name || '',
    priceOriginal: p.price ?? null,
    currency: 'USD',
    priceUSD: Number(p.price) || null,
    images: (p.image?.images || p.images || []).map(i => (typeof i === 'string' ? i : i?.url)).filter(Boolean),
    specs: Object.entries(p.attributes || p.sku || {}).map(([k, v]) => [k, String(v)]),
    year: null,
    fields: { title: !!p.subject, price: !!p.price, images: (p.image?.images || []).length, specs: 0 }
  };
}

/* ---------------------------------------------------------------------------
   Photos: download, brand, publish — only with a recorded basis
   --------------------------------------------------------------------------- */
async function publishPhotos(machine, rights, slug) {
  if (!rightsAreUsable(rights) || !machine.images?.length) return [];
  const dir = path.join(STAGING, slug);
  mkdirSync(dir, { recursive: true });
  const out = [];
  let n = 0;
  for (const src of machine.images.slice(0, 4)) {
    try {
      const res = await fetch(src, { headers: { 'User-Agent': UA, 'Referer': machine.source?.url || '' } });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 8000) continue;           // placeholder or error image
      n++;
      const raw = path.join(dir, `unit-${n}.jpg`);
      writeFileSync(raw, buf);
      try {
        execFileSync('bash', [BRAND_SCRIPT, raw, `${slug}-${n}`, machine.name, machine.ref], { cwd: root, stdio: 'pipe' });
        out.push(`/assets/machinery/${slug}-${n}.webp`);
      } catch {
        // No branding available: publish nothing rather than an unbranded copy.
        console.log(`    ! could not brand photo ${n} — skipped (ImageMagick required)`);
      }
    } catch { /* one dead image URL must not lose the listing */ }
  }
  return out;
}

/* ---------------------------------------------------------------------------
   Run
   --------------------------------------------------------------------------- */
const slugify = v => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

function linksFromArgs() {
  const urls = opts('url');
  const file = opt('file');
  if (file && existsSync(file)) {
    return urls.concat(readFileSync(file, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#')));
  }
  return urls;
}

async function importOne(url, { rights, forceAdapter, factsOnly }) {
  const adapter = factsOnly ? 'facts-only' : chooseAdapter(url, { on: forceAdapter });
  console.log(`\n→ ${url}\n  adapter: ${ADAPTERS[adapter]?.label || adapter}${rights ? ` · rights: ${rights}` : ' · no rights recorded (facts only)'}`);

  let product;
  if (adapter === 'alibaba-open') {
    product = await viaAlibabaOpen(url);
  } else {
    const page = await fetchPage(url);
    if (!page.ok) {
      console.log(`  ✗ could not fetch: ${page.error || 'HTTP ' + page.status}`);
      if (!process.env.JINA_API_KEY) console.log('    tip: set JINA_API_KEY to enable the reader-relay fallback for Chinese supplier sites');
      return { ok: false };
    }
    product = extractProduct(page.html, url);
    console.log(`  fetched via ${page.via} · ${(page.html.length / 1024).toFixed(0)} KB`);
  }

  console.log(`  found: title=${product.fields?.title ? 'yes' : 'no'}, price=${product.priceUSD ? '$' + product.priceUSD.toLocaleString('en-US') : 'no'}, specs=${product.fields?.specs ?? product.specs.length}, photos=${(product.images || []).length}`);
  if (!product.title && !product.priceUSD) {
    console.log('  ✗ nothing usable on that page — the layout may have changed, or the page is a search result rather than a product');
    return { ok: false };
  }

  const usable = !factsOnly && rightsAreUsable(rights);
  let machine = toMachine(product, { markup: MACHINERY_MARKUP, rights: usable ? rights : null, adapter });
  machine.ref = 'AR7-MC-' + String(MACHINES.length + 1).padStart(3, '0');

  // The photo standard runs on the candidate gallery before anything is
  // published. Rights ask *may we use this photo*; the screen asks *is this a
  // machine we want to be judged by* — current, clean, whole in frame.
  const screen = reviewPhotos(machine);
  machine.photoFlags = screen.flags.length ? screen.flags : undefined;
  if (screen.flags.length) {
    console.log(`  ! photo standard: ${screen.flags.join('; ')}`);
    console.log(`    standard: ${screen.note}`);
  } else if (machine.images.length) {
    console.log(`  ✓ photo standard: ${machine.images.length} candidate photo(s) pass`);
  }

  if (usable && machine.images.length) {
    const blocked = screen.flags.length && !flag('allow-photo-flags');
    const published = blocked ? [] : await publishPhotos(machine, rights, slugify(machine.name) || machine.id);
    if (published.length) {
      machine.images = published;
      machine.image = published[0];
      machine.photosPending = false;
      console.log(`  ✓ published ${published.length} branded photo(s)`);
    } else {
      machine.images = [];
      machine.image = null;
      machine.photosPending = true;
      if (blocked) console.log(`  · flagged by the photo standard — not publishing these. Replace them with recent photos of a clean, whole machine (or re-run with --allow-photo-flags once a human has checked). See MACHINERY-SOURCES.md, "Photo standards".`);
      else console.log('  · no photo could be published; listing goes live awaiting photos');
    }
  } else {
    machine.images = [];
    machine.image = null;
    machine.photosPending = true;
    machine.source.rights = null;
    if (!factsOnly && !rights) console.log('  · importing facts only. Add --rights dropship-authorized (or supplier-permission) to publish photos.');
  }

  console.log(`  ${machine.name} — ${machine.brand}, ${machine.type}, ${machine.year}`);
  console.log(`  supplier ${machine.supplierPrice ? '$' + machine.supplierPrice.toLocaleString('en-US') : '?'} → list ${machine.listPrice ? '$' + machine.listPrice.toLocaleString('en-US') : '?'} (+${Math.round(MACHINERY_MARKUP * 100)}%)`);
  return { ok: true, machine, product };
}

/** Re-fetch every listing that carries a source URL and report price moves. */
async function daily() {
  const sourced = MACHINES.filter(m => m.source?.url);
  if (!sourced.length) {
    console.log('No machine in the catalogue carries a source URL yet.');
    console.log('Import one first:  npm run machinery:sync -- --url <link> --rights dropship-authorized --write');
    return 0;
  }
  console.log(`Re-checking ${sourced.length} sourced listing(s)…\n`);
  let moved = 0;
  for (const m of sourced) {
    const page = await fetchPage(m.source.url);
    if (!page.ok) { console.log(`  ? ${m.ref} ${m.name}: unreachable`); continue; }
    const product = extractProduct(page.html, m.source.url);
    const now = product.priceUSD;
    if (now && now !== m.supplierPrice) {
      const pct = ((now - m.supplierPrice) / m.supplierPrice) * 100;
      console.log(`  ${pct > 0 ? '↑' : '↓'} ${m.ref} ${m.name}: $${m.supplierPrice.toLocaleString('en-US')} → $${now.toLocaleString('en-US')} (${pct.toFixed(1)}%)`);
      m.supplierPrice = now;
      moved++;
    } else {
      console.log(`  = ${m.ref} ${m.name}: unchanged`);
    }
  }
  console.log(`\n${moved} price change(s). Run with --write to apply them to src/machinery-data.js.`);
  return 0;
}

function mergeIntoData(machines) {
  if (!machines.length) return 0;
  const current = readFileSync(DATA_FILE, 'utf8');
  const existing = new Set(MACHINES.map(m => m.id));
  const fresh = machines.filter(m => !existing.has(m.id));
  if (!fresh.length) return 0;
  const entries = fresh.map(m => '  ' + JSON.stringify({
    id: m.id, ref: m.ref, name: m.name, brand: m.brand, type: m.type, year: m.year,
    hours: m.hours, supplierPrice: m.supplierPrice, price: m.listPrice, origin: m.origin,
    location: m.location, status: m.status, photosPending: m.photosPending || undefined,
    photoFlags: m.photoFlags,
    image: m.image, images: m.images, summary: m.summary, specs: m.specs, source: m.source,
    needsReview: true
  }, null, 2).replace(/\n/g, '\n  ')).join(',\n');
  const marker = 'export const MACHINES = [\n';
  const at = current.indexOf(marker);
  if (at < 0) throw new Error('could not find MACHINES in src/machinery-data.js');
  writeFileSync(DATA_FILE, current.slice(0, at + marker.length) + entries + ',\n' + current.slice(at + marker.length));
  return fresh.length;
}

const run = async () => {
  if (flag('daily')) return daily();

  const links = linksFromArgs();
  if (!links.length) {
    console.log(`Machinery import — paste a link, get a listing.

  npm run machinery:sync -- --url <product link>                       facts only
  npm run machinery:sync -- --url <link> --rights dropship-authorized   with photos
  npm run machinery:sync -- --file links.txt --rights supplier-permission
  npm run machinery:sync -- --daily                                     re-price everything

Rights flags (${RIGHTS.join(' | ')}):
  dropship-authorized   the supplier or programme grants resale use of the images
  supplier-permission   the supplier sent you the photos to sell from
  own-photo             AR7 or its inspector took them

Without a rights flag the listing still imports — real price, real specification —
and stays photoless until photos arrive.

Photo standard: recent machine, clean paint, whole unit in frame, at least ${PHOTO_STANDARD.minPhotos} photos,
nothing older than ${PHOTO_STANDARD.maxAgeYears} years unless the photos show its current condition. A flagged
gallery is never published automatically — a human replaces it or passes
--allow-photo-flags. See MACHINERY-SOURCES.md, "Photo standards".`);
    return 0;
  }

  const rights = opt('rights');
  if (rights && !rightsAreUsable(rights)) {
    console.log(`✗ unknown --rights '${rights}'. Use one of: ${RIGHTS.join(', ')}`);
    return 1;
  }

  const results = [];
  for (const url of links) {
    const r = await importOne(url, { rights, forceAdapter: opt('adapter'), factsOnly: flag('facts-only') });
    if (r.ok) results.push(r.machine);
  }

  console.log(`\n${results.length} of ${links.length} imported.`);
  if (flag('check')) return results.length === links.length ? 0 : 1;
  if (!results.length) return 1;

  if (flag('write')) {
    const n = mergeIntoData(results);
    console.log(`Merged ${n} new listing(s) into src/machinery-data.js.`);
    console.log('They carry status "' + results[0].status + '". Review the price and specification, then set status to Available.');
    console.log('Now run: npm test && npm run seo');
  } else {
    console.log('\nDry run. Add --write to merge into src/machinery-data.js.');
    console.log(JSON.stringify(results[0], null, 2).slice(0, 1200));
  }
  return 0;
};

process.exit(await run());
