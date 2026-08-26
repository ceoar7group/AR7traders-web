import { createServer } from 'node:http';
import { readFileSync, statSync, existsSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';

const PORT = 8080;
const ROOT = new URL('.', import.meta.url).pathname;
const FILE = join(ROOT, 'AR7-Traders-ALL-IN-ONE.html');
const SIZE = statSync(FILE).size;

const MIME = {
  '.html': 'text/html',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json'
};

createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // ---- Landing / download page (served at "/") ----
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const host = req.headers.host || 'localhost';
    const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>AR7 Traders — All-in-One Deployable File</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Manrope, system-ui, -apple-system, Segoe UI, sans-serif; background: radial-gradient(1200px 600px at 80% -10%, #0e5c3c 0%, #063f29 45%, #042a1d 100%); min-height: 100vh; color: #eef4ef; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .card { max-width: 640px; width: 100%; background: rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.14); border-radius: 22px; padding: 40px 36px; backdrop-filter: blur(10px); box-shadow: 0 30px 80px rgba(0,0,0,.45); }
  .mark { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
  .mark img { width: 46px; height: 46px; border-radius: 10px; }
  .mark b { font-size: 15px; letter-spacing: .18em; }
  .mark small { display: block; color: #9fc7b2; letter-spacing: .06em; margin-top: 2px; }
  h1 { font-size: 28px; line-height: 1.2; margin-bottom: 10px; font-weight: 800; }
  h1 em { color: #e5b553; font-style: normal; }
  p { color: #c8dcd2; line-height: 1.65; font-size: 14.5px; margin-bottom: 18px; }
  .tick { color: #7ddfa8; font-weight: 800; }
  ul { list-style: none; margin: 0 0 24px; }
  ul li { padding: 7px 0; border-top: 1px solid rgba(255,255,255,.08); font-size: 14px; }
  ul li span { color: #8fb8a4; font-size: 12.5px; }
  .btn { display: inline-flex; align-items: center; gap: 10px; background: linear-gradient(135deg, #e5b553, #c9942f); color: #0a2b1d; font-weight: 800; font-size: 17px; padding: 15px 26px; border-radius: 14px; text-decoration: none; letter-spacing: .02em; box-shadow: 0 10px 28px rgba(229,181,83,.35); transition: transform .12s ease, box-shadow .12s ease; }
  .btn:hover { transform: translateY(-2px); box-shadow: 0 14px 34px rgba(229,181,83,.45); }
  .btn small { opacity: .75; font-weight: 600; }
  .meta { margin-top: 20px; font-size: 12.5px; color: #8fb8a4; }
  .meta b { color: #c8dcd2; }
  .routes { background: rgba(0,0,0,.22); border-radius: 12px; padding: 14px 16px; font-size: 13px; margin-bottom: 22px; }
  .routes code { color: #e5b553; background: rgba(0,0,0,.3); padding: 2px 7px; border-radius: 6px; font-size: 12.5px; }
</style>
</head>
<body>
<div class="card">
  <div class="mark">
    <img src="/assets/ar7-mark.png" alt="AR7 Traders"/>
    <b>AR7 TRADERS<small>Website + CRM + Portal + Multi-Currency</small></b>
  </div>
  <h1>Your complete site,<br/>ready in <em>one file.</em></h1>
  <p>Everything is inside <b>AR7-Traders-ALL-IN-ONE.html</b> — the marketing website, staff CRM, customer portal and the multi-currency engine with all 11 currencies. Click the button and your browser will save it (21.9&nbsp;MB). Open it from your computer any time; no server, no internet required.</p>
  <div class="routes">
    <code>#home</code> Public website &nbsp;·&nbsp; <code>#crm</code> Staff CRM (demo, auto-login) &nbsp;·&nbsp; <code>#account</code> Customer portal
  </div>
  <p><a class="btn" href="/download">⬇&nbsp; Download&nbsp; AR7-Traders-ALL-IN-ONE.html <small>· 21.9 MB</small></a></p>
  <ul>
    <li><span class="tick">✔</span> Public website — Home, Inventory, Auction, World network, News &amp; more</li>
    <li><span class="tick">✔</span> Staff CRM — Dashboard, Leads, Customers, Inventory, Quotes, Settings (exchange-rate manager)</li>
    <li><span class="tick">✔</span> Customer portal — sign in, orders, payments, shipments</li>
    <li><span class="tick">✔</span> Multi-currency — JPY, USD, EUR, GBP, PKR, AUD, NZD, CAD, AED, SAR, KES</li>
    <li><span class="tick">✔</span> 74 images &amp; 5 fonts inlined — works offline, single file</li>
  </ul>
  <p class="meta">Already downloaded? <b>Open it in any browser</b> — or live-preview it running right here: <b><a href="/preview" style="color:#e5b553">Open the live site ↗</a></b></p>
</div>
</body>
</html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(page) });
    res.end(page);
    return;
  }

  // ---- Download endpoint: forces the browser to save the file ----
  if (url.pathname === '/download' || url.pathname === '/AR7-Traders-ALL-IN-ONE.html') {
    const buf = readFileSync(FILE);
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Content-Disposition': 'attachment; filename="AR7-Traders-ALL-IN-ONE.html"',
      'Content-Length': buf.length,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store'
    });
    res.end(buf);
    console.log(`Download served: ${(buf.length / 1e6).toFixed(1)} MB`);
    return;
  }

  // ---- Live site preview: serve dist/index.html (built output) ----
  if (url.pathname === '/preview' || url.pathname === '/site' || (existsSync(join(ROOT, 'dist')) && false)) {
    const file = join(ROOT, 'dist', 'index.html');
    if (existsSync(file)) {
      const buf = readFileSync(file);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': buf.length });
      res.end(buf);
      return;
    }
  }

  // ---- Static assets (for the landing page + site preview) ----
  let file = join(ROOT, url.pathname === '/preview' ? 'dist/index.html' : url.pathname.replace(/^\//, ''));
  if (!url.pathname.startsWith('/preview')) {
    if (url.pathname === '/assets/ar7-mark.png' && !existsSync(file)) file = join(ROOT, 'public', url.pathname.replace(/^\//, ''));
  }
  if (!existsSync(file) || statSync(file).isDirectory()) {
    // fall back to dist for built assets (hashed JS/CSS etc.)
    file = join(ROOT, 'dist', url.pathname.replace(/^\//, ''));
  }
  if (!existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }

  const ext = extname(file).toLowerCase();
  let buf;
  try { buf = readFileSync(file); } catch { buf = null; }
  if (!buf) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': buf.length,
    'Access-Control-Allow-Origin': '*'
  });
  res.end(buf);
}).listen(PORT, '0.0.0.0', () => {
  console.log(`\n  🌐  Server running at http://0.0.0.0:${PORT}`);
  console.log(`  📥  /download   → saves AR7-Traders-ALL-IN-ONE.html (${(SIZE / 1e6).toFixed(1)} MB)`);
  console.log(`  🌍  /preview    → live site preview`);
  console.log(`  🏠  /           → download landing page\n`);
});