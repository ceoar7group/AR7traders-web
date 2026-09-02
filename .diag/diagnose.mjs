// TEMPORARY diagnostic — run from .github/workflows/scraper-diagnosis.yml on a
// GitHub runner (the dev sandbox cannot reach goo-net directly).
//
// Probes goo-net with the importer's own core (same fetchPage + parsers +
// quality gate), saves the raw HTML it got, and writes a summary.json that is
// committed back to the branch for offline analysis.
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  fetchPage, parseListingPage, parseDetailPage, mergeCardAndDetail, qualityScore,
  pageDiagnostics, DEFAULT_SEARCH_URL, FALLBACK_SEARCH_URL, UA
} from '../scripts/goonet-core.mjs';

const OUT = '.diag/out';
mkdirSync(OUT, { recursive: true });

const PROD_SEARCH = 'https://www.goo-net.com/usedcar/'; // what site_settings.goonet_search_url holds on production
const summary = { capturedAt: new Date().toISOString(), node: process.version, targets: {}, detail: null, relay: null };

const slim = c => ({
  stock_no: c.stock_no, make: c.make, model: c.model, year: c.year, km: c.km,
  price_jpy: c.price_jpy, photos: (c.images || []).length, url: c.url
});

async function probe(name, url) {
  const f = await fetchPage(url, { timeoutMs: 25000 });
  writeFileSync(`${OUT}/${name}.html`, f.html || '');
  const page = parseListingPage(f.html || '', url);
  const firstCard = page.cars[0];
  summary.targets[name] = {
    url, ok: f.ok, status: f.status, error: f.error || null, via: f.via || 'direct',
    htmlBytes: (f.html || '').length,
    diagnostics: pageDiagnostics(f.html || ''),
    parsedCards: page.cars.length,
    pagination: page.pagination,
    firstCards: page.cars.slice(0, 6).map(c => ({ ...slim(c), quality: qualityScore(c, { minPhotos: 5, minYear: 2000 }) })),
    detailOfFirstCard: null
  };
  return { f, page };
}

const prod = await probe('prod-usedcar', PROD_SEARCH);
await probe('default-price-100-300', DEFAULT_SEARCH_URL);
await probe('fallback-price--100', FALLBACK_SEARCH_URL);

// Detail-page probe: does the detail parser still read specs + gallery?
const card = (prod.page.cars || []).find(c => c.url);
if (card) {
  const d = await fetchPage(card.url, { timeoutMs: 15000 });
  writeFileSync(`${OUT}/detail.html`, d.html || '');
  const detail = d.ok ? parseDetailPage(d.html, card.url) : null;
  const merged = detail ? mergeCardAndDetail(card, detail) : card;
  summary.detail = {
    url: card.url, ok: d.ok, status: d.status, via: d.via || 'direct', error: d.error || null,
    htmlBytes: (d.html || '').length,
    card: slim(card),
    detailParsed: detail ? {
      make: detail.make, model: detail.model, year: detail.year, km: detail.km,
      fuel: detail.fuel, body: detail.body, price_jpy: detail.price_jpy,
      photos: (detail.images || []).length
    } : null,
    merged: {
      make: merged.make, model: merged.model, year: merged.year, km: merged.km,
      fuel: merged.fuel, body: merged.body, price_jpy: merged.price_jpy,
      photos: (merged.images || []).length
    },
    quality: qualityScore(merged, { minPhotos: 5, minYear: 2000 })
  };
  summary.targets['prod-usedcar'].detailOfFirstCard = summary.detail;
}

// Relay probe: what production falls back to when its own IP is bot-gated.
try {
  const res = await fetch('https://r.jina.ai/' + DEFAULT_SEARCH_URL, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      'X-Return-Format': 'html',
      'X-No-Cache': 'true'
    },
    signal: AbortSignal.timeout(25000)
  });
  const text = await res.text();
  writeFileSync(`${OUT}/relay-price-100-300.html`, text);
  summary.relay = {
    url: 'https://r.jina.ai/' + DEFAULT_SEARCH_URL,
    status: res.status, bytes: text.length,
    spreadLinks: (text.match(/spread\/goo/g) || []).length
  };
} catch (e) {
  summary.relay = { url: 'https://r.jina.ai/' + DEFAULT_SEARCH_URL, error: e.message };
}

writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
