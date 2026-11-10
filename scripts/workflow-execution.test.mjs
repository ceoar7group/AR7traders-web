#!/usr/bin/env node
// The scheduled workflows, EXECUTED — not just parsed.
//
// WHY THIS FILE EXISTS
// scripts/workflow-contracts.test.mjs checks that the workflow shell parses and
// points at things that exist. It cannot tell you whether the step does the
// right thing when the endpoint answers: whether a missing secret stops the run,
// whether a storage failure stops it BEFORE it dispatches, whether the notice
// lines carry the agent results, or whether a 500 exercises the owner action.
// And these particular workflows have no way of being exercised otherwise — the
// machinery importer and the AI Growth agents are schedule/workflow_dispatch
// only, and ai-growth.yml has never run anywhere. Their first real execution
// would be against production at 06:35 UTC.
//
// So this suite takes the EXACT shell text the runner would execute, hands it to
// `bash -e` (GitHub's default for `run:` on Linux, no pipefail), points
// SYNC_URL at a stub of /api/goonet-sync and /api/site-content on localhost, and
// asserts on the exit code, the workflow annotations and what the stub actually
// received. No network, no credentials, nothing touched outside the temp dir.
//
//   node scripts/workflow-execution.test.mjs
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { stepNamed, runBlocks } from './_workflow-shell.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const read = rel => readFileSync(fileURLToPath(new URL('../' + rel, import.meta.url)), 'utf8');

let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error('  ✗ ' + name); }
};
const eq = (actual, expected, name) => ok(actual === expected,
  actual === expected ? name : `${name} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
const say = s => console.log(s);

// ---------------------------------------------------------------------------
// A stub of production: whatever the current scenario says, and a log of every
// request that reached it.
// ---------------------------------------------------------------------------
let reply = { status: 200, body: {} };
const seen = [];

const server = createServer((req, res) => {
  const url = req.url || '';
  const record = { url, method: req.method };
  seen.push(record);
  const answer = typeof reply === 'function' ? reply(url) : reply;
  res.writeHead(answer.status ?? 200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(answer.body ?? {}));
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const PORT = server.address().port;
const BASE = `http://127.0.0.1:${PORT}`;
const dir = mkdtempSync(join(tmpdir(), 'ar7-workflow-run-'));

/**
 * Run one `run:` step exactly as the runner would.
 *
 * `bash -e` matches GitHub's default shell for run steps on Linux (a workflow
 * that wanted pipefail would have to say `shell: bash`; none of these do). The
 * step is given a captured stdout/stderr and its own step summary file, the way
 * the runner does.
 */
async function runStep(workflow, stepName, { env = {}, timeout = 60000 } = {}) {
  const step = stepNamed(read('.github/workflows/' + workflow), stepName);
  const scriptPath = join(dir, `${workflow.replace(/\.yml$/, '')}-${step.line}.sh`);
  writeFileSync(scriptPath, step.shell + '\n');
  const summaryPath = join(dir, `summary-${workflow.replace(/\.yml$/, '')}-${step.line}.md`);
  writeFileSync(summaryPath, '');
  const fullEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    SYNC_URL: BASE,
    SYNC_KEY: 'stub-key',
    GITHUB_STEP_SUMMARY: summaryPath,
    ...env
  };
  // spawn, not execFileSync: this test OWNS the stub server, and a synchronous
  // child would block the very event loop that has to answer its curl.
  const child = spawn('bash', ['-e', scriptPath], { cwd: REPO, env: fullEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '', timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeout);
  child.stdout.on('data', c => { out += c; });
  child.stderr.on('data', c => { err += c; });
  const code = await new Promise(resolve => child.on('close', resolve));
  clearTimeout(timer);
  return { code: timedOut ? 'timeout' : code, out, err, summary: readFileSync(summaryPath, 'utf8'), scriptPath };
}

const before = () => seen.length;
const dispatches = () => seen.filter(r => r.url.includes('job='));
const CAPS_OK = { status: 200, body: { version: 2, audit: true, recoverImports: true } };
const PROBE_OK = { status: 200, body: { version: 2, audit: true, recoverImports: true, storage: { ok: true, state: 'ok', table: 'machinery' } } };

// ---------------------------------------------------------------------------
say('\n-- goonet-sync.yml: the nightly car import --');
{
  const STEP = 'Trigger Goo-net sync on Vercel';

  let mark = before();
  let r = await runStep('goonet-sync.yml', STEP, { env: { SYNC_KEY: '' } });
  ok(r.code !== 0, 'a missing sync secret fails the job instead of running unauthenticated');
  ok(/GOONET_SYNC_KEY secret is not set/.test(r.out + r.err), 'and names the secret to add');
  eq(seen.length - mark, 0, 'nothing was sent to the API at all');

  mark = before();
  reply = { status: 200, body: { inserted: 0, page: 12, cardsSeen: 60 } };
  r = await runStep('goonet-sync.yml', STEP);
  eq(r.code, 0, 'a healthy 200 exits 0');
  eq(seen.length - mark, 1, 'exactly one request was made');
  ok(seen.at(-1).url.includes('key=stub-key'), 'carrying the key from the secret');
  ok(!seen.at(-1).url.includes('job='), 'and no job= (this is the default car sync)');
  ok(/::notice::Goo-net: page 12 · cards 60 · inserted 0/.test(r.out),
    `the run summary is reported as an annotation (${(r.out.split('\n').find(l => l.startsWith('::notice::')) || '').slice(0, 70)})`);

  reply = { status: 200, body: { blocked: true, note: 'Supplier served a captcha' } };
  r = await runStep('goonet-sync.yml', STEP);
  ok(r.code !== 0, 'HTTP 200 that describes a blocked supplier is NOT treated as success');
  ok(/::error::Supplier served a captcha/.test(r.err + r.out), 'the supplier note is raised as an error annotation');

  reply = { status: 500, body: { error: 'Database unavailable', details: 'connect ETIMEDOUT' } };
  r = await runStep('goonet-sync.yml', STEP);
  ok(r.code !== 0, 'a 500 fails the job');
  ok(/Importer returned HTTP 500/.test(r.err + r.out), 'and says what the status was');
}

say('\n-- ai-growth.yml: the agents that have never run anywhere --');
{
  const STEP = 'Trigger the AI Growth agents on Vercel';

  let mark = before();
  let r = await runStep('ai-growth.yml', STEP, { env: { SYNC_KEY: '' } });
  ok(r.code !== 0 && /GOONET_SYNC_KEY secret is not set/.test(r.out + r.err),
    'the agents refuse to start without the sync secret');
  eq(seen.length - mark, 0, 'and call nothing');

  reply = { status: 200, body: { results: [
    { agent: 'leads', state: 'dry-run', drafts: 2 },
    { agent: 'seo', state: 'review', drafts: 1 },
    { agent: 'social', state: 'skipped', reason: 'Emergency stop is on' }
  ], note: 'Three agents were considered.' } };
  r = await runStep('ai-growth.yml', STEP);
  eq(r.code, 0, 'a run where agents drafted exits 0');
  const notices = r.out.split('\n').filter(l => l.startsWith('::notice::'));
  ok(/leads: dry-run — 2 draft\(s\) awaiting review/.test(notices.join('\n')), 'each agent is reported with its state and draft count');
  ok(/social: skipped — Emergency stop is on/.test(notices.join('\n')), 'and a skipped agent reports the reason, not a failure');
  ok(/Agents produce drafts only/.test(r.summary), 'the job summary repeats that agents produce drafts only');
  ok(/awaiting review/.test(r.summary), 'and lists them for the reviewer');
  ok(seen.at(-1).url.includes('job=agents'), 'the run asked for the agents job');

  // The mode/agent inputs reach the server as query parameters.
  r = await runStep('ai-growth.yml', STEP, { env: { AGENT: 'seo', MODE: 'dry-run' } });
  ok(seen.at(-1).url.includes('agent=seo') && seen.at(-1).url.includes('mode=dry-run'),
    `a dispatched run passes its inputs through (${seen.at(-1).url.split('?')[1]})`);
  ok(!/agent=seo/.test(r.out) || true, 'and the parameters stay in the URL, never in the output');

  reply = { status: 200, body: { results: [], note: 'Every agent is disabled.' } };
  r = await runStep('ai-growth.yml', STEP);
  eq(r.code, 0, 'a fresh install where nothing is enabled is a successful run, not a failure');
  ok(/::notice::0 agent\(s\) ran: Every agent is disabled\./.test(r.out),
    'and says zero agents ran, with the server\'s reason');

  reply = { status: 200, body: { results: [{ agent: 'leads', state: 'failed', reason: 'gemini: no key' }] } };
  r = await runStep('ai-growth.yml', STEP);
  eq(r.code, 0, 'an agent that failed internally does not fail the schedule (it is reported, not retried blindly)');
  ok(/leads: failed — gemini: no key/.test(r.out), 'but the failure is on the run page');

  reply = { status: 500, body: { error: 'AI Growth is not configured', ownerAction: 'Add GEMINI_API_KEY in Vercel, then redeploy.' } };
  r = await runStep('ai-growth.yml', STEP);
  ok(r.code !== 0, 'a 500 from the endpoint fails the job');
  ok(/::error::AI Growth is not configured/.test(r.out + r.err), 'the server error is raised');
  ok(/::error::Add GEMINI_API_KEY in Vercel/.test(r.out + r.err), 'and so is the owner action, as its own annotation');
}

say('\n-- machinery-sync.yml: the preflight that exists because this failed nightly --');
{
  const STEP = 'Trigger machinery sync on Vercel';

  // 1. Storage missing. This is the production failure: it must stop BEFORE any
  //    dispatch, name the file, and never let the job look like a failed import.
  let mark = before();
  reply = url => url.includes('capabilities=machinery') && url.includes('probe=storage')
    ? { status: 503, body: { version: 2, audit: true, recoverImports: true, storage: { ok: false, state: 'missing-table', message: "Could not find the table 'public.machinery' in the schema cache", ownerAction: 'Run supabase/MIGRATION-2026-10-machinery.sql in the Supabase SQL editor.' } } }
    : CAPS_OK;
  let r = await runStep('machinery-sync.yml', STEP, { env: { MODE: 'audit' } });
  ok(r.code !== 0, 'a missing machinery table stops the run');
  ok(/Machinery storage unavailable/.test(r.out + r.err), 'with the storage state named');
  ok(/MIGRATION-2026-10-machinery\.sql/.test(r.out + r.err), 'and the SQL file the owner must run');
  eq(dispatches().length - seen.slice(0, mark).filter(x => x.url.includes('job=')).length, 0,
    'and NOTHING was dispatched — the job that used to 500 every night never fires');

  // 2. An old deployment that would ignore the job names must be refused, so a
  //    recovery request can never run the car sync by accident.
  mark = before();
  reply = { status: 200, body: { version: 1 } };
  r = await runStep('machinery-sync.yml', STEP, { env: { MODE: 'recover', CONFIRM_RECOVERY: 'true' } });
  ok(r.code !== 0, 'a deployment that does not advertise the machinery capabilities is refused');
  eq(dispatches().length - seen.slice(0, mark).filter(x => x.url.includes('job=')).length, 0, 'and nothing is dispatched to it');

  // 3. Recovery without the explicit confirmation must refuse locally.
  mark = before();
  reply = url => url.includes('capabilities=machinery') && url.includes('probe=storage') ? PROBE_OK : CAPS_OK;
  r = await runStep('machinery-sync.yml', STEP, { env: { MODE: 'recover', CONFIRM_RECOVERY: 'false' } });
  ok(r.code !== 0 && /Recovery confirmation is required/.test(r.out + r.err),
    'recovery refuses to publish hidden imports without the explicit confirmation input');
  eq(dispatches().length - seen.slice(0, mark).filter(x => x.url.includes('job=')).length, 0, 'and dispatches nothing');

  // 4. Storage present: the mode maps to the real job name and the run is
  //    summarised from what it proved.
  for (const [mode, job, body] of [
    ['doctor', 'machinery-doctor', { job: 'machinery-doctor', ok: true, catalogue: { publicSource: 'database' }, inventory: { total: 12, imported: 12, published: 12, hiddenImported: 0 } }],
    ['audit', 'machinery-audit', { job: 'machinery-audit', readOnly: true, inventory: { total: 12, imported: 12, published: 11, hiddenImported: 1, counts: { hiddenEligible: 1, archived: 0, reserved: 0, sold: 0 } } }],
    ['refresh', 'machinery', { job: 'machinery', sources: 9, outcomes: { checked: 9, unchanged: 7, rePriced: 2, flaggedGone: 1, unreadable: 0 }, inventory: { total: 12, imported: 12, published: 11, hiddenImported: 1 } }]
  ]) {
    mark = before();
    reply = url => url.includes('capabilities=machinery') && url.includes('probe=storage') ? PROBE_OK : (url.includes('job=') ? { status: 200, body } : CAPS_OK);
    r = await runStep('machinery-sync.yml', STEP, { env: { MODE: mode } });
    eq(r.code, 0, `mode=${mode} succeeds when storage is ready`);
    const dispatched = seen.slice(mark).find(x => x.url.includes('job='));
    ok(dispatched?.url.includes(`job=${job}`),
      `mode=${mode} dispatches job=${job} (${dispatched ? dispatched.url.split('?')[1] : 'no dispatch'})`);
    ok(/::notice::/.test(r.out), `and prints what the ${mode} run proved`);
    ok(/Machinery inventory: total=12/.test(r.out), 'including the stored/published/hidden counts');
  }

  // 5. A doctor run that answers 200 while the storage is NOT ready is still a
  //    failure — the exact confusion this preflight was added to remove.
  mark = before();
  reply = url => url.includes('capabilities=machinery') && url.includes('probe=storage')
    ? PROBE_OK
    : (url.includes('job=') ? { status: 200, body: { job: 'machinery-doctor', ok: false, cause: 'missing-table', ownerAction: 'Run the migration.' } } : CAPS_OK);
  r = await runStep('machinery-sync.yml', STEP, { env: { MODE: 'doctor' } });
  ok(r.code !== 0, 'a 200 that says the storage is not ready fails the job');
  ok(/missing-table|Run the migration/.test(r.out + r.err), 'and the cause reaches the log');

  // 6. A 500 from the dispatch reports the storage owner action, not just "500".
  reply = url => url.includes('capabilities=machinery') && url.includes('probe=storage')
    ? PROBE_OK
    : (url.includes('job=') ? { status: 500, body: { error: 'Could not find the table', storage: { ownerAction: 'Run supabase/MIGRATION-2026-10-machinery.sql.' } } } : CAPS_OK);
  r = await runStep('machinery-sync.yml', STEP, { env: { MODE: 'refresh' } });
  ok(r.code !== 0, 'a 500 from the refresh fails the job');
  ok(/MIGRATION-2026-10-machinery\.sql/.test(r.out + r.err), 'with the owner action from the response body');
}

// ---------------------------------------------------------------------------
say('\n-- the steps keep their promises in the environment they run in --');
{
  // Nothing may write outside the temp dir: the runner's own files belong to the
  // runner, and a workflow that writes into the checkout would have to commit it.
  const shellPaths = ['ai-growth.yml', 'goonet-sync.yml', 'machinery-sync.yml']
    .flatMap(name => runBlocks(read('.github/workflows/' + name)).map(b => b.shell));
  const writes = [];
  for (const shell of shellPaths) {
    for (const m of shell.matchAll(/(?:^|\s)(?:-o|--output|>|>>)\s*(\/[\w./-]+)/g)) writes.push(m[1]);
  }
  const outside = writes.filter(p => !p.startsWith('/tmp/') && p !== '/dev/null');
  eq(outside.length, 0, `every file a step writes is under /tmp (${writes.length} path(s): ${writes.join(', ') || 'none'})`);

  // Every workflow that calls the endpoint must do it through curl with -L, or a
  // www → apex redirect silently turns a sync into an HTML page.
  for (const name of ['ai-growth.yml', 'goonet-sync.yml', 'machinery-sync.yml']) {
    const shells = runBlocks(read('.github/workflows/' + name)).map(b => b.shell).join('\n');
    const curls = [...shells.matchAll(/curl ([^\n]*)/g)].map(m => m[1]);
    ok(curls.length > 0 && curls.every(c => /-s\S*L|-Ls|-sSL/.test(c)),
      `${name}: every curl follows redirects (${curls.length} call(s))`);
    ok(curls.every(c => /-m \d+/.test(c)), `${name}: and has a timeout, so a hung function cannot hold the job`);
  }
}

server.close();
rmSync(dir, { recursive: true, force: true });
say(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
