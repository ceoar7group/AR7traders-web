#!/usr/bin/env node
// Pure geometry checks for the fixed, body-portalled CRM row-action menu.
import { placeMenu } from '../src/row-actions.jsx';

let pass = 0;
let fail = 0;
function ok(condition, name) {
  if (condition) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error('  ✗ ' + name); }
}
function near(actual, expected, name, epsilon = 0.001) {
  ok(Math.abs(actual - expected) <= epsilon, `${name} (expected ${expected}, got ${actual})`);
}

const scenarios = [
  {
    name: 'menu fits below and right-aligns',
    trigger: { left: 300, right: 340, top: 100, bottom: 132 },
    menu: { width: 224, height: 180 },
    viewport: { width: 800, height: 600 }
  },
  {
    name: 'menu flips above a low trigger',
    trigger: { left: 400, right: 432, top: 560, bottom: 590 },
    menu: { width: 240, height: 240 },
    viewport: { width: 800, height: 600 }
  },
  {
    name: 'menu is clamped at the left edge',
    trigger: { left: 0, right: 12, top: 120, bottom: 152 },
    menu: { width: 224, height: 140 },
    viewport: { width: 390, height: 844 }
  },
  {
    name: 'menu is clamped at the right edge',
    trigger: { left: 350, right: 388, top: 120, bottom: 152 },
    menu: { width: 224, height: 140 },
    viewport: { width: 390, height: 844 }
  },
  {
    name: 'tall menu is capped and clamped vertically',
    trigger: { left: 200, right: 240, top: 420, bottom: 450 },
    menu: { width: 320, height: 1200 },
    viewport: { width: 390, height: 844 }
  },
  {
    name: 'menu shrinks to a narrow viewport',
    trigger: { left: 0, right: 20, top: 0, bottom: 10 },
    menu: { width: 300, height: 400 },
    viewport: { width: 100, height: 120 }
  },
  {
    name: 'safe edges scale down on a very small viewport',
    trigger: { left: 0, right: 20, top: 0, bottom: 10 },
    menu: { width: 80, height: 120 },
    viewport: { width: 60, height: 80 },
    options: { padding: 40, gap: 16 }
  }
];

console.log('\n-- all placements stay within their viewport --');
for (const scenario of scenarios) {
  const result = placeMenu(scenario.trigger, scenario.menu, scenario.viewport, scenario.options);
  const visibleHeight = Math.min(scenario.menu.height, result.maxHeight);
  const prefix = scenario.name;
  ok(result.left >= 0, `${prefix}: left is non-negative`);
  ok(result.top >= 0, `${prefix}: top is non-negative`);
  ok(result.left + result.width <= scenario.viewport.width + 0.001, `${prefix}: right edge is inside the viewport`);
  ok(result.top + visibleHeight <= scenario.viewport.height + 0.001, `${prefix}: rendered height is inside the viewport`);
  ok(result.maxHeight >= 0 && result.maxHeight <= scenario.viewport.height + 0.001, `${prefix}: max-height never exceeds the screen`);
  ok(result.maxWidth >= 0 && result.maxWidth <= scenario.viewport.width + 0.001, `${prefix}: max-width never exceeds the screen`);
}

console.log('\n-- right alignment, flipping, and safe-edge behavior --');
const normal = placeMenu(scenarios[0].trigger, scenarios[0].menu, scenarios[0].viewport);
near(normal.left, 116, 'right edge aligns to the trigger when space allows');
near(normal.top, 138, 'below placement includes the six-pixel gap');
ok(normal.placement === 'bottom', 'a menu with room below stays below');
near(normal.maxHeight, 584, 'default safe edges leave eight pixels above and below');

const flipped = placeMenu(scenarios[1].trigger, scenarios[1].menu, scenarios[1].viewport);
ok(flipped.placement === 'top', 'a menu flips upward when the trigger is near the viewport bottom');
near(flipped.top, 314, 'flipped menu is positioned directly above the trigger');

const leftClamped = placeMenu(scenarios[2].trigger, scenarios[2].menu, scenarios[2].viewport);
near(leftClamped.left, 8, 'left edge is clamped to the safe inset');
const rightClamped = placeMenu(scenarios[3].trigger, scenarios[3].menu, scenarios[3].viewport);
near(rightClamped.left, 158, 'right edge is clamped to the safe inset');

const tall = placeMenu(scenarios[4].trigger, scenarios[4].menu, scenarios[4].viewport);
near(tall.maxHeight, 828, 'oversized menu is capped at viewport height minus safe edges');
near(tall.top, 8, 'capped tall menu cannot escape the top edge');

const narrow = placeMenu(scenarios[5].trigger, scenarios[5].menu, scenarios[5].viewport);
near(narrow.width, 84, 'menu width is reduced to the narrow viewport safe area');
const wide = placeMenu(
  { left: 600, right: 640, top: 100, bottom: 132 },
  { width: 500, height: 120 },
  { width: 1200, height: 800 }
);
near(wide.maxWidth, 320, 'wide menus keep the existing 320px design cap');
near(wide.width, 320, 'measured menu width obeys that cap');

const small = placeMenu(scenarios[6].trigger, scenarios[6].menu, scenarios[6].viewport, scenarios[6].options);
near(small.maxWidth, 0, 'padding never creates a negative safe width');
near(small.maxHeight, 0, 'padding never creates a negative safe height');
near(small.left, 30, 'horizontal inset is capped at half the tiny viewport');
near(small.top, 40, 'vertical inset is capped at half the tiny viewport');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
