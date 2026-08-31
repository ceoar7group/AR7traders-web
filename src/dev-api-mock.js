// Dev-only mock for /api/goonet-stock so the "Japan dealer stock" page has
// something to show in local previews (no Supabase keys needed). Never used
// in production — Vercel routes /api/* to the real serverless functions.
//
// The rows are not hand-written: they are built from a real goo-net capture
// (scripts/fixtures/goonet-capture-2026-08-31.json) through the same
// goonet-core maths the live importer uses, so the preview shows exactly what
// `node scripts/goonet-seed.mjs --push` writes to Supabase.
import { readCapture, buildSeedRows } from '../scripts/goonet-seed.mjs';

let STOCK = [];
try {
  // Imported a day apart from each other, newest first, like real runs.
  const rows = buildSeedRows(readCapture());
  STOCK = rows.map((r, i) => {
    const importedAt = new Date(Date.now() - (i + 1) * 864e5).toISOString();
    const { total_price_jpy, quality_pass, quality_reasons, repair_history, shop, ...row } = r;
    return { ...row, imported_at: importedAt, last_seen_at: importedAt, updated_at: importedAt };
  });
} catch (e) {
  console.warn('[ar7-dev-api-mock] could not build goo-net seed rows:', e.message);
}

export function devApiMock() {
  return {
    name: 'ar7-dev-api-mock',
    configureServer(server) {
      server.middlewares.use('/api/goonet-stock', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(STOCK));
      });
    }
  };
}
