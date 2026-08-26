// ---------------------------------------------------------------------------
//  AR7 Traders — all-in-one single-file build
//
//  Produces ONE self-contained HTML file containing the entire application:
//  public website, customer portal, staff CRM (demo mode, localStorage), the
//  multi-currency engine, every stylesheet, every font and every local image —
//  all inlined as data URIs. No external JS/CSS/asset requests are left
//  (only remote https:// images such as goo-net stock photos remain remote).
//
//  Usage:  node scripts/build-all-in-one.mjs
//  Output: dist/AR7-Traders-ALL-IN-ONE.html
//
//  The rewritten bundle uses a runtime asset map (window.__AR7_MEDIA__) so
//  even *dynamically constructed* paths (brand logos, model photo galleries)
//  resolve to inlined data URIs.
// ---------------------------------------------------------------------------
import { build } from 'vite';
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_ASSETS = path.join(root, 'public', 'assets');

const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', svg: 'image/svg+xml', ico: 'image/x-icon',
  woff2: 'font/woff2', woff: 'font/woff2', ttf: 'font/ttf'
};

function dataUri(file) {
  const ext = file.split('.').pop().toLowerCase();
  return `data:${MIME[ext] || 'application/octet-stream'};base64,${readFileSync(file).toString('base64')}`;
}

// Map every public/assets file -> data URI, keyed by its site path.
function buildAssetMap() {
  const map = {};
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir)) {
      const p = path.join(dir, entry);
      if (statSync(p).isDirectory()) walk(p, prefix + entry + '/');
      else map['/assets/' + prefix + entry] = dataUri(p);
    }
  };
  walk(PUBLIC_ASSETS, '');
  return map;
}

// Vite plugin: provides the runtime asset map and rewrites the few source
// expressions that build asset paths dynamically, so they resolve through it.
function mediaPlugin(map) {
  return {
    name: 'ar7-media-single-file',
    resolveId(id) {
      if (id === 'virtual:ar7-media') return '\0ar7-media';
    },
    load(id) {
      if (id === '\0ar7-media') {
        return `const IMG=${JSON.stringify(map)};\nwindow.__AR7_MEDIA__=IMG;\nexport const media=p=>IMG[p]||p;`;
      }
    },
    transform(code, id) {
      if (id !== path.join(root, 'src/main.jsx')) return;
      let c = `import { media } from 'virtual:ar7-media';\n` + code;
      // Brand logo paths are built from the make name at runtime:
      c = c.replace(
        "m=>'/assets/logos/'+m.toLowerCase()+'.png'",
        "m=>media('/assets/logos/'+m.toLowerCase()+'.png')"
      );
      // Model photo galleries are built with padStart templates at runtime:
      c = c.replace(
        "n=>`/assets/gallery/audi-r8-v10-${String(n).padStart(2,'0')}.webp`",
        "n=>media(`/assets/gallery/audi-r8-v10-${String(n).padStart(2,'0')}.webp`)"
      );
      c = c.replace(
        "n=>`/assets/gallery/lexus-lc-500-${String(n).padStart(2,'0')}.jpg`",
        "n=>media(`/assets/gallery/lexus-lc-500-${String(n).padStart(2,'0')}.jpg`)"
      );
      return c;
    }
  };
}

async function main() {
  process.env.VITE_CRM_DEMO = 'true';   // CRM runs fully in demo mode (localStorage)

  const map = buildAssetMap();
  const files = Object.keys(map);
  console.log(`Inlining ${files.length} assets (${(Object.values(map).join('').length / 1e6).toFixed(1)} MB of data URIs)`);

  const baseConfig = (await import(path.join(root, 'vite.config.js'))).default;
  const config = {
    ...baseConfig,
    configFile: false,
    root,
    logLevel: 'warn',
    plugins: [mediaPlugin(map), ...(baseConfig.plugins || [])]
  };

  console.log('Building (VITE_CRM_DEMO=true, production)...');
  await build(config);

  const outDir = path.join(root, 'dist');
  const htmlFile = path.join(outDir, 'index.html');
  const jsFiles = readdirSync(path.join(outDir, 'assets')).filter(f => f.endsWith('.js'));
  const cssFiles = readdirSync(path.join(outDir, 'assets')).filter(f => f.endsWith('.css'));
  if (jsFiles.length !== 1 || cssFiles.length !== 1) {
    throw new Error(`Expected exactly one JS+CSS chunk, got ${jsFiles.join(',')} / ${cssFiles.join(',')}`);
  }

  let html = readFileSync(htmlFile, 'utf8');
  let js = readFileSync(path.join(outDir, 'assets', jsFiles[0]), 'utf8');
  let css = readFileSync(path.join(outDir, 'assets', cssFiles[0]), 'utf8');

  // --- JS: turn every backtick-quoted "/assets/<file>" literal into a lookup
  // against the runtime map (keeps ONE copy of each asset, no double-inlining).
  let jsHits = 0;
  js = js.replace(/`(\/assets\/[^`]+)`/g, (m, key) => {
    if (Object.prototype.hasOwnProperty.call(map, key)) { jsHits++; return `window.__AR7_MEDIA__[${JSON.stringify(key)}]`; }
    return m;
  });

  // --- CSS: inline url(...) asset references.
  let cssHits = 0;
  css = css.replace(/url\((['"]?)(\/assets\/[^)'"]+)\1\)/g, (m, _q, p) => {
    if (Object.prototype.hasOwnProperty.call(map, p)) { cssHits++; return `url(${map[p]})`; }
    return m;
  });

  // --- HTML: remove preload/modulepreload links and external bundle tags.
  html = html.replace(/<link rel="(?:preload|modulepreload)"[^>]*>/g, '');
  html = html.replace(/<link rel="preconnect"[^>]*>/g, '');
  html = html.replace(/<link rel="stylesheet"[^>]*>/g, '');
  html = html.replace(/<script type="module"[^>]*src="[^"]*"[^>]*><\/script>/g, '');
  // Inline the CSS right after <title> block / at the start of <head>.
  // NOTE: must use a FUNCTION replacement — string replacements interpret
  // "$&" / "$`" / "$'" / "$1" patterns, and the JS bundle is full of them
  // (React internals), which would re-expand the entire HTML many times over.
  html = html.replace('<head>', () => '<head>\n<style>\n' + css + '\n</style>');
  // Inline the JS right before </body> (function replacement, same reason):
  const safeJs = js.replace(/<\/script>/gi, '<\\/script>');
  html = html.replace('</body>', () => '<script type="module">\n' + safeJs + '\n</script>\n</body>');
  // Favicon / spinner placeholders → data URIs.
  html = html.replace(/(href|src)="\/assets\/([^"]+)"/g, (m, attr, p) => {
    const key = '/assets/' + p;
    return map[key] ? `${attr}="${map[key]}"` : m;
  });

  const finalFile = path.join(outDir, 'AR7-Traders-ALL-IN-ONE.html');
  writeFileSync(finalFile, html, 'utf8');

  // --- Verification ---------------------------------------------------------
  const problems = [];
  // Every /assets/ literal that names a real, existing file MUST have been
  // rewritten to a runtime map lookup. Leftover occurrences that do NOT name
  // real files are fine (e.g. placeholder example text shown in input fields).
  const leftoverKeys = [];
  const backtickRe = new RegExp('`(/assets/[^`]+)`', 'g');
  let m;
  while ((m = backtickRe.exec(js)) !== null) {
    if (Object.prototype.hasOwnProperty.call(map, m[1])) leftoverKeys.push(m[1]);
  }
  if (leftoverKeys.length) problems.push(`JS still has un-inlined file references: ${[...new Set(leftoverKeys)].slice(0, 5).join(' | ')}`);
  if (!/window\.__AR7_MEDIA__=/.test(js)) problems.push('Runtime asset map assignment (window.__AR7_MEDIA__=...) missing in JS');
  if (jsHits === 0) problems.push('No /assets/ literals were rewritten in JS');
  if (/\burl\((['"]?)\/assets\//.test(css)) problems.push('CSS still has /assets/ url() references');
  if (/<script[^>]*src=|<link[^>]*stylesheet/i.test(html)) problems.push('HTML still has external script/stylesheet tags');
  if (/ (src|href)="\/assets\//.test(html)) problems.push('HTML still has /assets/ references');
  if ((html.match(/<style>/g) || []).length !== 1) problems.push(`Expected exactly 1 inline <style>, found ${(html.match(/<style>/g) || []).length}`);
  if ((html.match(/<script type="module">/g) || []).length !== 1) problems.push('Expected exactly 1 inline module <script>');

  const sizeMB = (Buffer.byteLength(html) / 1e6).toFixed(1);
  if (sizeMB > 60) problems.push(`Final file is very large (${sizeMB} MB)`);

  console.log(`\nJS asset literals rewritten: ${jsHits}; CSS url() rewritten: ${cssHits}`);
  console.log(`Final file: ${finalFile} (${sizeMB} MB)`);
  if (problems.length) {
    console.error('\nVERIFICATION PROBLEMS:\n' + problems.map(p => ' - ' + p).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('✓ All verification checks passed.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });