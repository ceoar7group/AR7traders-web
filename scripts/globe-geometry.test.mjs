#!/usr/bin/env node
// The globe's geometry is split, and each globe gets only the half it draws.
//
//   node scripts/globe-geometry.test.mjs
//
// 2026-11-26: src/world-geo.js held land, country borders and named-country
// rings in one module, and src/globe3d.js imported all three at the top. The
// header orb — a 56 px ornament that mounts inside the viewport on every page —
// therefore downloaded 49 KiB gzipped of detail it never draws (its own opts
// are detail:0, borders:false, names:false). The geometry is now injected and
// split into world-land.js / world-detail.js.
//
// scripts/bundle-budget.test.mjs proves the resulting CHUNKS behave (an
// ornament's graph excludes the detail graph, measured in gzipped bytes). This
// file proves the SOURCE it is built from still says that, in a second instead
// of a build.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error('  ✗ ' + name); }
};

const land = await import('../src/world-land.js');
const detail = await import('../src/world-detail.js');
const all = await import('../src/world-geo.js');

console.log('\n-- three files, one geometry --');
ok(Array.isArray(land.LAND) && land.LAND.length > 50, `world-land.js carries land (${land.LAND.length} polygons)`);
ok(!('BORDERS' in land) && !('COUNTRIES' in land), 'world-land.js carries nothing else');
ok(Array.isArray(detail.BORDERS) && detail.BORDERS.length > 50, `world-detail.js carries borders (${detail.BORDERS.length} polylines)`);
ok(Array.isArray(detail.COUNTRIES) && detail.COUNTRIES.length > 50, `world-detail.js carries named countries (${detail.COUNTRIES.length})`);
ok(!('LAND' in detail), 'world-detail.js does not duplicate the land');
ok(all.LAND.length === land.LAND.length && all.BORDERS.length === detail.BORDERS.length
  && all.COUNTRIES.length === detail.COUNTRIES.length,
  'the aggregator re-exports exactly the split files');
ok(JSON.stringify(all.LAND[0]).length === JSON.stringify(land.LAND[0]).length
  && all.COUNTRIES[0].n === detail.COUNTRIES[0].n,
  'the aggregator hands back the same data, not a re-parse');

console.log('\n-- the engine is given its geometry, it does not import one --');
const engine = read('src/globe3d.js');
ok(!/from '\.\/world-(geo|land|detail)\.js'/.test(engine),
  'src/globe3d.js imports no geometry (that import is what put the detail in every ornament)');
ok(/export function mountGlobe\(host, opts = \{\}, geo = null\)/.test(engine),
  'mountGlobe takes the geometry set as its third argument');
ok(/const G = prepare\(geo\)/.test(engine) && /PREPARED\.set\(key, built\)/.test(engine),
  'each geometry set is prepared once and cached on itself');
ok(/const hitCountry = \(G, lon, lat\)/.test(engine) && /ctryTris\(G, /.test(engine),
  'the named-country helpers take the set, so an ornament cannot reach the full one');

console.log('\n-- each entry point takes the half it needs --');
const lite = read('src/globe-lite.js');
const full = read('src/globe-full.js');
ok(/from '\.\/world-land\.js'/.test(lite) && !/world-detail/.test(lite),
  'src/globe-lite.js imports land only');
ok(/from '\.\/world-land\.js'/.test(full) && /from '\.\/world-detail\.js'/.test(full),
  'src/globe-full.js imports land and detail');
ok(/mountGlobe\(host, opts, GEO\)/.test(lite) && /mountGlobe\(host, opts, GEO\)/.test(full),
  'both wrappers pass their set to the engine');
ok(/^const GEO = \{ LAND \};/m.test(lite) && /^const GEO = \{ LAND, BORDERS, COUNTRIES \};/m.test(full),
  'the sets are module-level, so the prepared tables are cached across mounts');

console.log('\n-- and the app picks the wrapper per globe --');
const main = read('src/main.jsx');
ok(/import\('\.\/globe-lite\.js'\):import\('\.\/globe-full\.js'\)/.test(main),
  'InteractiveGlobe loads the lite wrapper for ornaments and the full one for the showcase');
ok(/m\.mountGlobeLite\(ref\.current,mountOpts\):m\.mountGlobeFull\(ref\.current,mountOpts\)/.test(main),
  'and calls the matching mount');
ok(!/import\('\.\/globe3d\.js'\)/.test(main), 'nothing still imports the bare engine from the app');
ok(/mountGlobeFull/.test(read('src/network.jsx')), 'the /world page (content, not an ornament) uses the full wrapper');

console.log('\n-- the generator writes the same three files --');
const gen = read('scripts/build-world-geo.mjs');
for (const f of ['world-land.js', 'world-detail.js', 'world-geo.js']) {
  ok(gen.includes(`'../src/${f}'`), `scripts/build-world-geo.mjs writes src/${f}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
