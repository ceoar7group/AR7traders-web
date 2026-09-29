// Vercel Hobby 12-function cap regression guard (npm run test:functions).
//
// Counts api/*.js files excluding api/_*.js (private helpers like _supabase.js,
// _perm.js) and asserts the count is <= 12. If a 13th function is added, the
// deployment will fail with exceeded_serverless_functions_per_deployment —
// production will stay on an old build, exactly what happened from PR #41
// until PR #42 fixed it.
//
// Failure message explains the cap and points to the consolidation pattern:
// vehicle sitemap logic lives inside api/site-content.js dispatched on
// GET ?sitemap=vehicles, with vercel.json rewriting /api/sitemap-vehicles.xml
// onto it, so the public URL is unchanged but no extra function is created.
//
// See also: api/site-content.js block comment (corrected 2026-09-29), and
// SEO-SUBMIT.md §2 test loop.
import fs from 'node:fs';
import path from 'node:path';

const apiDir = path.resolve('api');
let files = [];
try {
  files = fs.readdirSync(apiDir)
    .filter(f => f.endsWith('.js') && !f.startsWith('_'))
    .sort();
} catch (e) {
  console.error(`✗ api/ directory not readable: ${e.message}`);
  process.exit(1);
}

const count = files.length;
const limit = 12;

console.log(`api/*.js (excluding api/_*.js): ${count} files`);
console.log(`  ${files.join(', ')}`);
console.log(`Vercel Hobby limit: ${limit}`);

if (count > limit) {
  console.error('\n✗ FUNCTION COUNT EXCEEDED — deployment WILL FAIL');
  console.error(`  Found ${count} Serverless Functions, but Vercel Hobby allows only ${limit}.`);
  console.error('  Error you will see on Vercel: exceeded_serverless_functions_per_deployment');
  console.error('  Production will stay on an old build (as it did from PR #41 until PR #42).');
  console.error('');
  console.error('  How to fix:');
  console.error('  - Do NOT add a new api/*.js file. Consolidate the new endpoint into an');
  console.error('    existing function, like the vehicle sitemap pattern:');
  console.error('      • Logic inlined in api/site-content.js');
  console.error('      • Dispatched on GET ?sitemap=vehicles');
  console.error('      • vercel.json rewrite: /api/sitemap-vehicles.xml → /api/site-content?sitemap=vehicles');
  console.error('      • Public URL unchanged, no extra function.');
  console.error('  - api/_*.js files are excluded from the count (private helpers).');
  console.error('  - If you must add a function, remove or consolidate another one first.');
  console.error('  - See api/site-content.js block comment for the full history (corrected 2026-09-29).');
  console.error('');
  process.exit(1);
}

console.log(`\n✓ ${count} ≤ ${limit} — function count OK`);
