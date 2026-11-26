// The full globe: land, country borders, named countries.
//
//   import('./globe-full.js').then(m => m.mountGlobeFull(el, opts))
//
// Used by the showcase globe on the home page and by the /world page, both of
// which draw borders, name the country under the pointer and highlight it.
// The geometry is split so that the decorative orbs (src/globe-lite.js) never
// pull this file's 142 kB of detail (2026-11-26).
import { mountGlobe } from './globe3d.js';
import { LAND } from './world-land.js';
import { BORDERS, COUNTRIES } from './world-detail.js';

const GEO = { LAND, BORDERS, COUNTRIES };

export const mountGlobeFull = (host, opts) => mountGlobe(host, opts, GEO);
