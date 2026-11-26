// The decorative orb: land, and nothing else.
//
//   import('./globe-lite.js').then(m => m.mountGlobeLite(el, opts))
//
// 2026-11-26: the header orb is a 56 px ornament that mounts inside the viewport
// on every page, and it used to load the whole Natural Earth set — 142 kB of
// country borders and named-country rings it never draws (detail:0,
// borders:false, names:false). This wrapper hands the engine the land alone, so
// the chunk graph for an ornament is engine + land instead of engine + land +
// the detail a hover-named globe needs.
//
// Keep the geometry object module-level: the engine caches its prepared sin/cos
// tables on it, and a fresh literal per call would rebuild them every mount.
import { mountGlobe } from './globe3d.js';
import { LAND } from './world-land.js';

const GEO = { LAND };

export const mountGlobeLite = (host, opts) => mountGlobe(host, opts, GEO);
