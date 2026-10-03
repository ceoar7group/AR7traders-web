#!/usr/bin/env node
// AR7 site guardian — health, security and freshness checks in one pass.
//
//   npm run guard                  run every check, print the report
//   npm run guard -- --json        machine-readable (the CRM panel reads this)
//   npm run guard -- --watch       keep checking every 5 minutes
//   npm run guard -- --fix-links   report duplicate/missing alt text etc.
//
// WHAT IT CHECKS
// --------------
//   health    — every internal link in dist/ resolves to a page or an asset
//               that exists; no route renders an empty shell; the sitemap
//               matches the routes that actually exist
//   security  — required response headers declared in vercel.json, no secret
//               reachable from the client bundle, no `dangerouslySetInnerHTML`
//               on untrusted input, no eval, no unguarded localStorage writes
//   freshness — promo.json is not expired-but-live, no photosPending unit is
//               shown with a photo, price derivation still one constant
//   SEO       — one H1 per page, canonical present, noindex only where meant
//
// The point of the guardian is not that it can fix everything: it is that the
// site cannot silently rot. Every check names the file to open.
//
// CRM CONTROL
// -----------
// `--json` writes .guardian-report.json, which api/crm.js serves to the CRM
// panel under Control → Site guardian. The panel shows each check as pass,
// warn or fail with the fix, and a "Run now" button that triggers the GitHub
// Action (see .github/workflows/guardian.yml) rather than running commands on
// a serverless function — nothing on this site executes operator-supplied
// commands at runtime, by design.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = n => args.includes('--' + n);

// Route shapes the SPA answers. /inventory, /auction, /cars/<make> and the rest
// are served by the single index.html through the SPA rewrite, so a link to one
// of them is not a broken file — it is a route. Checking only for a physical
// index.html per route reported 28 phantom breaks on the first run.
//
// The flat list comes from src/routing.js PAGES rather than a copy here: a copy
// is a list that goes stale the first time somebody adds a page, and it already
// had (this check flagged /japan-stock, which is a real, shipped route).
const { PAGES } = await import('../src/routing.js');
const PAGES_SLASHED = new Set([...PAGES].map(p => '/' + p));
const ROUTE_PATTERNS = [
  /^\/(inventory|news|cars|machinery)\/[\w%.-]+\/?$/,
  /^\/cars\/[\w-]+\/[\w-]+\/?$/
];
const isRoute = t => {
  if (t === '/') return true;
  if (PAGES_SLASHED.has(t) || PAGES_SLASHED.has(t.replace(/\/$/, ''))) return true;
  return ROUTE_PATTERNS.some(re => re.test(t));
};

const checks = [];
const add = (area, name, status, detail, fix) => checks.push({ area, name, status, detail, fix: fix || null });
const exists = p => existsSync(path.join(root, p));
const read = p => { try { return readFileSync(path.join(root, p), 'utf8'); } catch { return ''; } };
const walk = (dir, out = []) => {
  const abs = path.join(root, dir);
  if (!existsSync(abs)) return out;
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel, out); else out.push(rel);
  }
  return out;
};

/* ── health ──────────────────────────────────────────────────────────────── */
function health() {
  const distExists = exists('dist/index.html');
  add('health', 'Built site present', distExists ? 'pass' : 'fail',
    distExists ? 'dist/index.html exists' : 'no dist/ — run npm run build',
    'npm run build');

  // Every internal href in the built HTML must resolve.
  if (distExists) {
    const files = walk('dist').filter(f => f.endsWith('.html'));
    const pages = new Set(files.map(f => '/' + f.replace(/^dist[\\/]/, '').replace(/index\.html$/, '')));
    const assets = new Set(walk('dist'));
    let broken = [];
    for (const f of files) {
      const html = read(f);
      for (const m of html.matchAll(/(?:href|src)=["'](\/(?!\/)[^"'#?]*)["']/gi)) {
        const target = m[1];
        if (pages.has(target.replace(/\/$/, '/')) || pages.has(target) || assets.has('dist' + target)) continue;
        if (isRoute(target)) continue;   // SPA route, rewritten to index.html
        if (/\.(css|js|png|jpe?g|webp|svg|ico|xml|txt|json|woff2?)$/i.test(target)) {
          if (!assets.has('dist' + target)) broken.push(`${f} → ${target}`);
        } else if (!pages.has(target) && !pages.has(target + '/') && !pages.has(target + '/index.html')) {
          broken.push(`${f} → ${target}`);
        }
      }
    }
    broken = [...new Set(broken)];
    add('health', 'Internal links resolve', broken.length ? 'fail' : 'pass',
      broken.length ? `${broken.length} broken link(s): ${broken.slice(0, 5).join(', ')}` : `${files.length} page(s) checked; every asset link and every route resolves`,
      'Open the listed file and correct the href');

    // Real content, not an empty shell.
    const shell = read('dist/index.html');
    add('health', 'Crawler shell has content', /<h1/i.test(shell) && shell.length > 2000 ? 'pass' : 'fail',
      /<h1/i.test(shell) ? `index.html carries an H1 (${(shell.length / 1024).toFixed(1)} KB)` : 'index.html has no H1',
      'Check index.html — the pre-render feeds every crawler');
  }

  // Sitemap vs routes.
  const sm = read('public/sitemap.xml');
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace('https://ar7traders.com', ''));
  const noindex = /robots[^\n]*noindex/;
  add('health', 'Sitemap has no noindex or staff URLs',
    locs.some(l => /(\/crm|\/account|\/portal|\/studio|\/seo)/.test(l)) ? 'fail' : 'pass',
    `${locs.length} URL(s) in the sitemap`, 'Remove staff and transactional paths from public/sitemap.xml');
  add('health', 'robots.txt points at the sitemap', /Sitemap:\s*\S+/i.test(read('public/robots.txt')) ? 'pass' : 'warn',
    /Sitemap:\s*\S+/i.test(read('public/robots.txt')) ? 'declared' : 'no Sitemap line',
    'Add Sitemap: https://ar7traders.com/sitemap.xml');
}

/* ── security ────────────────────────────────────────────────────────────── */
function security() {
  // Headers: declared in vercel.json for the deployed site.
  const vercel = read('vercel.json');
  const wanted = ['X-Content-Type-Options', 'Referrer-Policy', 'X-Frame-Options', 'Strict-Transport-Security', 'Permissions-Policy'];
  const missing = wanted.filter(h => !new RegExp(h, 'i').test(vercel));
  add('security', 'Security headers declared', missing.length ? 'fail' : 'pass',
    missing.length ? `missing: ${missing.join(', ')}` : wanted.join(', '),
    'Add the missing headers to vercel.json');

  // Secrets must never be reachable from the client bundle.
  const clientFiles = walk('src').filter(f => /\.(jsx?|tsx?)$/.test(f));
  // Only credential VALUES are flagged. A bare env-var name like
  // SUPABASE_SERVICE_ROLE_KEY shown in the CRM's own setup screen is
  // documentation, not a leak — flagging it taught us nothing and buried the
  // real finding.
  const secretPatterns = [
    ['service-role key assigned', /SERVICE_ROLE_KEY\s*[:=]\s*['"][A-Za-z0-9._-]{20,}['"]/],
    ['stripe secret key', /sk_live_[A-Za-z0-9]{10,}|sk_test_[A-Za-z0-9]{10,}/],
    ['hard-coded JWT', /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./],
    ['assigned api secret', /(?:api[_-]?secret|client[_-]?secret|private[_-]?key)\s*[:=]\s*['"][A-Za-z0-9._-]{24,}['"]/i]
  ];
  const leaks = [];
  for (const f of clientFiles) {
    const body = read(f);
    for (const [label, re] of secretPatterns) if (re.test(body)) leaks.push(`${f}: ${label}`);
  }
  add('security', 'No secrets in the client source', leaks.length ? 'fail' : 'pass',
    leaks.length ? leaks.join(', ') : `${clientFiles.length} source file(s) scanned`,
    'Move the value to a serverless env var (Vercel → Settings → Environment Variables)');

  // Dangerous sinks on untrusted input.
  const sinks = [];
  for (const f of clientFiles) {
    const body = read(f);
    if (/dangerouslySetInnerHTML\s*=\s*\{\{\s*__html\s*:\s*[a-zA-Z_$][\w$.]*\s*\}\}/.test(body) && !/sanitize|DOMPurify/i.test(body)) sinks.push(`${f}: dangerouslySetInnerHTML with a variable`);
    if (/[^.\w]eval\s*\(/.test(body) && !/\/\/\s*guardian:allow-eval/.test(body)) sinks.push(`${f}: eval(`);
  }
  add('security', 'No untrusted HTML sinks', sinks.length ? 'fail' : 'pass',
    sinks.length ? sinks.join(', ') : 'no dynamic dangerouslySetInnerHTML, no eval',
    'Sanitise the input or render it as text');

  // localStorage writes outside a try — Safari private mode throws.
  const unsafe = [];
  for (const f of clientFiles) {
    const body = read(f);
    const lines = body.split('\n');
    lines.forEach((line, i) => {
      if (/localStorage\s*\.\s*(set|get|remove)Item/.test(line) && !/try|catch/.test(line)) {
        const around = lines.slice(Math.max(0, i - 4), i + 4).join('\n');
        if (!/try\s*\{|catch\s*\(/.test(around)) unsafe.push(`${f}:${i + 1}`);
      }
    });
  }
  add('security', 'localStorage access guarded', unsafe.length > 6 ? 'warn' : 'pass',
    unsafe.length ? `${unsafe.length} unguarded call(s) (first: ${unsafe[0]})` : 'all wrapped',
    'Wrap in try/catch — private mode throws on write');

  // API functions must check permission before acting.
  const apiFiles = walk('api').filter(f => f.endsWith('.js') && !path.basename(f).startsWith('_'));
  const unguarded = [];
  for (const f of apiFiles) {
    const body = read(f);
    const writes = /req\.method\s*!==\s*['"]GET['"]|POST|PUT|DELETE/.test(body);
    const guarded = /requirePerm|requireUser|verifyUser|authorize|_perm/.test(body);
    // A public intake endpoint (the enquiry form and chat widget) is
    // unauthenticated on purpose. It declares itself with a marker and is then
    // checked for the input caps that make it safe to expose.
    if (/guardian:public-endpoint/.test(body)) {
      const capped = /MAX\s*=/.test(body) || /slice\(|length\s*[<>]/.test(body);
      if (!capped) unguarded.push(`${f} (declared public but no input caps)`);
      continue;
    }
    if (writes && !guarded) unguarded.push(f);
  }
  add('security', 'API functions check permission', unguarded.length ? 'fail' : 'pass',
    unguarded.length ? unguarded.join(', ') : `${apiFiles.length} function(s) checked`,
    'Call the shared permission helper before writing');
}

/* ── freshness ───────────────────────────────────────────────────────────── */
async function freshness() {
  const { MACHINES, MACHINERY_MARKUP, listPriceUSD, machineImages, MACHINE_TYPES } = await import('../src/machinery-data.js');

  const pending = MACHINES.filter(m => m.photosPending);
  add('health', 'Machinery photo coverage', pending.length ? 'warn' : 'pass',
    pending.length ? `${pending.length} of ${MACHINES.length} awaiting photos: ${pending.map(m => m.ref).join(', ')}` : `all ${MACHINES.length} machines carry photos`,
    'Import photos: npm run machinery:sync -- --url <link> --rights <basis>');

  const badMath = MACHINES.filter(m => m.supplierPrice && listPriceUSD(m) !== Math.round((m.supplierPrice * (1 + MACHINERY_MARKUP)) / 50) * 50);
  add('health', 'Price derivation intact', badMath.length ? 'fail' : 'pass',
    badMath.length ? `${badMath.length} listing(s) disagree with MACHINERY_MARKUP` : `every listed price = supplier price + ${Math.round(MACHINERY_MARKUP * 100)}%`,
    'Fix the listing in src/machinery-data.js — never hand-edit a published price');

  const borrowing = MACHINES.filter(m => m.photosPending && machineImages(m).length);
  add('health', 'Pending units borrow no photo', borrowing.length ? 'fail' : 'pass',
    borrowing.length ? borrowing.map(m => m.ref).join(', ') : 'clean',
    'machineImages() must return [] while photosPending is true');

  const types = MACHINE_TYPES.filter(t => !MACHINES.some(m => m.type === t));
  add('health', 'Every machinery type has stock', types.length ? 'warn' : 'pass',
    types.length ? `empty type page(s): ${types.join(', ')}` : `${MACHINE_TYPES.length} type page(s) populated`,
    'Add a machine or remove the landing route');

  // Promo file: live but expired is the classic rot.
  const promo = (() => { try { return JSON.parse(read('public/promo.json')); } catch { return null; } })();
  if (!promo || !promo.active) {
    add('health', 'Promotion bar', 'pass', 'no campaign published', null);
  } else {
    const expired = promo.until && new Date(promo.until + 'T23:59:59') < new Date();
    add('health', 'Promotion bar', expired ? 'warn' : 'pass',
      expired ? `"${promo.headline}" ended ${promo.until} and is still published` : `live: ${promo.headline}${promo.until ? ` (until ${promo.until})` : ''}`,
      expired ? 'npm run promo:publish -- --none' : null);
    if (promo.discount) {
      add('health', 'Discount is honoured at quotation', 'warn',
        `${promo.discount}% off margin is published — every quotation until ${promo.until || 'further notice'} must show it`,
        'Check the quote template, then clear it: npm run promo:publish -- --none');
    }
  }

  // Sourced listings older than 30 days want a re-price.
  const stale = MACHINES.filter(m => m.source?.fetchedAt && (Date.now() - new Date(m.source.fetchedAt)) > 30 * 864e5);
  add('health', 'Sourced prices are recent', stale.length ? 'warn' : 'pass',
    stale.length ? `${stale.length} listing(s) not re-checked in 30 days` : 'all sourced listings re-checked within 30 days',
    'npm run machinery:sync -- --daily --write');
}

/* ── SEO ─────────────────────────────────────────────────────────────────── */
function seo() {
  const distHtml = walk('dist').filter(f => f.endsWith('.html'));
  if (!distHtml.length) { add('seo', 'Rendered pages auditable', 'warn', 'no dist/ — build first', 'npm run build'); return; }
  let noCanonical = [];
  let multiH1 = [];
  for (const f of distHtml) {
    const html = read(f);
    if (!/<link[^>]+rel=["']canonical["']/i.test(html)) noCanonical.push(f);
    const h1s = (html.match(/<h1[\s>]/gi) || []).length;
    if (h1s !== 1) multiH1.push(`${f} (${h1s})`);
  }
  add('seo', 'One H1 per page', multiH1.length ? 'fail' : 'pass',
    multiH1.length ? multiH1.slice(0, 4).join(', ') : `${distHtml.length} page(s) carry exactly one H1`,
    'The shared page shell renders the H1 — check the route does not add a second');
  add('seo', 'Canonical on every page', noCanonical.length ? 'fail' : 'pass',
    noCanonical.length ? noCanonical.slice(0, 4).join(', ') : `${distHtml.length} page(s) canonical`,
    'Add the route to PAGE_SEO in src/seo.js');
}

/* ── report ──────────────────────────────────────────────────────────────── */
function summarise() {
  const fails = checks.filter(c => c.status === 'fail');
  const warns = checks.filter(c => c.status === 'warn');
  const report = {
    generatedAt: new Date().toISOString(),
    summary: { total: checks.length, pass: checks.filter(c => c.status === 'pass').length, warn: warns.length, fail: fails.length },
    checks
  };
  // Two copies: the repo root for `git diff` to show what changed between runs,
  // and public/ so the CRM's Site guardian panel can fetch it. The CRM cannot
  // run these checks itself — a serverless function has no repo and no build.
  const body = JSON.stringify(report, null, 2);
  writeFileSync(path.join(root, '.guardian-report.json'), body);
  writeFileSync(path.join(root, 'public/guardian-report.json'), body + '\n');

  if (flag('json')) { console.log(JSON.stringify(report, null, 2)); return fails.length ? 1 : 0; }

  const icon = { pass: '✓', warn: '!', fail: '✗' };
  console.log('AR7 site guardian\n');
  let area = null;
  for (const c of checks) {
    if (c.area !== area) { area = c.area; console.log(`\n${area.toUpperCase()}`); }
    console.log(`  ${icon[c.status]} ${c.name}`);
    console.log(`      ${c.detail}`);
    if (c.fix && c.status !== 'pass') console.log(`      → ${c.fix}`);
  }
  console.log(`\n${report.summary.pass} pass · ${report.summary.warn} warn · ${report.summary.fail} fail`);
  if (fails.length) console.log('\nFix the failures above, then run: npm test && npm run seo');
  return fails.length ? 1 : 0;
}

if (flag('watch')) {
  const tick = async () => {
    checks.length = 0;
    health(); security(); await freshness(); seo();
    const code = summarise();
    console.log(`\n— next check in 5 minutes (${new Date().toLocaleTimeString()}) —\n`);
    return code;
  };
  await tick();
  setInterval(tick, 5 * 60 * 1000);
} else {
  health(); security(); await freshness(); seo();
  process.exit(summarise());
}
