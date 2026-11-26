// The whole Natural Earth geometry, in one import — used by the tests and by
// scripts/build-world-geo.mjs's own checks. The app never imports this file:
// src/globe-lite.js takes the land only and src/globe-full.js takes both, so a
// small decorative orb does not download borders and named countries it will
// never draw (2026-11-26, see the two files' headers).
export { LAND } from './world-land.js';
export { BORDERS, COUNTRIES } from './world-detail.js';
