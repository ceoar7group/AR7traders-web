#!/usr/bin/env node
// Pins the vehicle-photo alt text in src/car-alt.js.
//
//   node scripts/car-alt.test.mjs
//
// The alt on a vehicle photo is the only description a screen-reader user and
// an image search get. It has to name the car, and it must never invent a
// detail the row does not carry (see CLAIMS-POLICY.md).
import { carAlt } from '../src/car-alt.js';

let pass = 0, fail = 0;
const say = s => process.stdout.write(s + '\n');
const bad = s => process.stderr.write(s + '\n');
const ok = (cond, msg) => { if (cond) { pass++; say('  ✓ ' + msg); } else { fail++; bad('  ✗ ' + msg); } };
const eq = (got, want, msg) => ok(got === want, `${msg} — got ${JSON.stringify(got)}`);

// ---- it names the car -------------------------------------------------------
eq(carAlt({ make: 'Honda', model: 'Vezel', year: 2019 }), '2019 Honda Vezel',
  'year, make and model, in the order people search');
eq(carAlt({ make: 'Rolls-Royce', model: 'Ghost', year: 2023, col: 'Two-tone' }),
  '2023 Rolls-Royce Ghost in Two-tone', 'the colour is appended when the row states one');

// ---- nothing is invented -----------------------------------------------------
eq(carAlt({ make: 'Honda', model: 'Vezel' }), 'Honda Vezel',
  'no year is fabricated when the row has none');
eq(carAlt({ make: 'Honda', model: 'Vezel', col: null }), 'Honda Vezel',
  'a null colour adds no "in null"');
eq(carAlt({ make: 'Honda', model: 'Vezel', col: '   ' }), 'Honda Vezel',
  'a blank colour is dropped');
eq(carAlt({ make: 'Honda', model: 'Vezel', year: '' }), 'Honda Vezel',
  'an empty year is dropped');
eq(carAlt({ make: ' Honda ', model: ' Vezel ', year: 2019 }), '2019 Honda Vezel',
  'padded fields are trimmed');

// ---- degenerate input never crashes the page ---------------------------------
eq(carAlt(null), '', 'a null car gives an empty alt');
eq(carAlt(undefined), '', 'an undefined car gives an empty alt');
eq(carAlt({}), '', 'a car with no make/model gives an empty alt');
eq(carAlt({ make: 'Mazda' }), 'Mazda', 'a make alone still renders');
eq(carAlt({ year: 2019 }), '2019', 'a year alone still renders');
eq(carAlt({ make: 0, model: 0 }), '0 0',
  'numeric zeros are real values, not missing ones');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
