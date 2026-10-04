#!/usr/bin/env node
// Keep Vercel's SPA rewrite aligned with the routes the client router serves.
// A route that works after an in-app click can still 404 on refresh unless its
// pathname is rewritten to index.html at the edge.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PAGES, parseRoute } from '../src/routing.js';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const spaRewrite = (config.rewrites || []).find(rule => rule.destination === '/index.html');
assert.ok(spaRewrite, 'vercel.json must rewrite app routes to /index.html');

// The current Vercel source uses the path-regex subset supported by both
// Vercel and JavaScript RegExp. Exercise it against every client page so a new
// entry in PAGES cannot silently become a refresh-time 404.
const matches = new RegExp(`^${spaRewrite.source}$`);
const requiredPaths = [...PAGES].map(page => `/${page}`);
requiredPaths.push(
  '/cars/toyota',
  '/cars/toyota/land-cruiser',
  '/machinery/excavators',
  '/machinery/excavators/AR7-MC-001'
);

for (const pathname of requiredPaths) {
  assert.ok(matches.test(pathname), `${pathname} must match the Vercel SPA rewrite`);
}

assert.deepEqual(
  (({ page, make }) => ({ page, make }))(parseRoute({ pathname: '/cars/toyota' })),
  { page: 'inventory', make: 'Toyota' },
  '/cars/toyota must resolve to the Toyota inventory landing page'
);
assert.deepEqual(
  (({ page, machineType, machineRef }) => ({ page, machineType, machineRef }))(
    parseRoute({ pathname: '/machinery/excavators/AR7-MC-001' })
  ),
  { page: 'machinery', machineType: 'excavators', machineRef: 'AR7-MC-001' },
  'a machinery detail URL must keep its type and reference'
);
assert.equal(parseRoute({ pathname: '/seo' }).page, 'seo', '/seo must resolve to the SEO desk');

console.log(`Vercel SPA rewrite covers ${requiredPaths.length} client and deep-link paths.`);
