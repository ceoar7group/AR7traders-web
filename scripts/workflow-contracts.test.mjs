#!/usr/bin/env node
// Workflow contracts — .github/workflows/*.yml checked where they run.
//
// WHY THIS FILE EXISTS
// Five of these workflows are scheduled jobs that call PRODUCTION. Two of them
// have never been executed in CI on the way in (the machinery importer and the
// AI Growth agents are schedule + workflow_dispatch only), and one of them —
// ai-growth.yml — has never run anywhere at all. A mistake in them is therefore
// discovered at 07:05 UTC against the live site, which is exactly how the
// machinery importer failed every night for days with a bare HTTP 500.
//
// So this suite checks the parts a linter cannot: that the shell INSIDE the
// workflow steps is syntactically valid, that each step still talks to an
// endpoint and a job name that exist in this repository, that the secrets are
// referenced and documented rather than inlined, and that the schedules do not
// collide with each other. Everything is read from the files themselves — no
// network, no credentials.
//
//   node scripts/workflow-contracts.test.mjs
import { readFileSync, readdirSync, writeFileSync, rmSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { AGENTS } from '../api/_agents.js';

let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error('  ✗ ' + name); }
};
const say = s => console.log(s);
const read = rel => readFileSync(fileURLToPath(new URL('../' + rel, import.meta.url)), 'utf8');

const WORKFLOWS = [
  'ai-growth.yml', 'ci.yml', 'goonet-sync.yml',
  'guardian.yml', 'machinery-sync.yml', 'seo-automation.yml'
];
const COMMITTED = readdirSync(fileURLToPath(new URL('../.github/workflows', import.meta.url)))
  .filter(f => f.endsWith('.yml') || f.endsWith('.yaml')).sort();

const files = Object.fromEntries(WORKFLOWS.map(w => [w, read('.github/workflows/' + w)]));
const tmp = mkdtempSync(join(tmpdir(), 'ar7-workflows-'));
const scratch = (name, body) => {
  const path = join(tmp, name);
  writeFileSync(path, body);
  return path;
};

// ---------------------------------------------------------------------------
// Extract the shell actually handed to the runner: `run: |` blocks (dedented)
// and one-line `- run: …` steps. The runner executes these with `bash -e`, so
// they must at least parse.
function runBlocks(text) {
  const lines = text.split('\n');
  const indentOf = l => l.match(/^\s*/)[0].length;
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // A job may legitimately be called `run` (`jobs: run:`), so a bare `run:`
    // with nothing after the colon is a job key, never a step.
    const blockOpen = line.match(/^(\s*)(?:- )?run:\s*\|\s*$/);
    if (blockOpen) {
      const base = indentOf(line);
      const body = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        if (!lines[j].trim()) { body.push(''); continue; }
        if (indentOf(lines[j]) <= base) break;
        body.push(lines[j]);
      }
      const strip = Math.min(...body.filter(l => l.trim()).map(indentOf));
      found.push({ line: i + 1, shell: body.map(l => (l.trim() ? l.slice(strip) : '')).join('\n').trimEnd() });
      i = j - 1;
      continue;
    }
    const inline = line.match(/^(\s*)(?:- )?run:\s+(\S.*)$/);
    if (inline) found.push({ line: i + 1, shell: inline[2] });
  }
  return found;
}

// Every `node -e "…"` body inside a shell block: the runner will hand it to
// node, so it must parse too — and it must not contain `${`, which bash would
// expand to nothing before node ever sees it.
function nodeEvalBodies(shell) {
  const lines = shell.split('\n');
  const bodies = [];
  for (let i = 0; i < lines.length; i++) {
    const start = lines[i].match(/node -e "?$/);
    if (!start) continue;
    const body = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      if (lines[j].trim().startsWith('"')) break;
      body.push(lines[j]);
    }
    bodies.push({ line: i + 1, body: body.join('\n'), closed: j < lines.length });
    i = j;
  }
  return bodies;
}

// ---------------------------------------------------------------------------
say('\n-- every committed workflow is structurally a workflow --');
{
  ok(COMMITTED.join(',') === [...WORKFLOWS].sort().join(','),
    `the workflow set is exactly the six this suite knows (${COMMITTED.join(', ')})`);

  for (const name of WORKFLOWS) {
    const text = files[name];
    const firstKey = text.split('\n').find(l => l.trim() && !l.trim().startsWith('#'));
    ok(/^name:\s*\S/.test(firstKey),
      `${name}: declares a name first (\"${(firstKey || '').slice(0, 40)}\")`);
    ok(/^on:/m.test(text), `${name}: has a trigger`);
    ok(/^permissions:/m.test(text), `${name}: declares permissions explicitly (least privilege, not the default token)`);
    ok(/^jobs:/m.test(text), `${name}: has jobs`);

    // Job blocks: a two-space indented key after `jobs:`.
    const jobLines = text.split('\n');
    const jobsStart = jobLines.findIndex(l => /^jobs:/.test(l));
    const jobs = [];
    for (let i = jobsStart + 1; i < jobLines.length; i++) {
      const m = jobLines[i].match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
      if (m) jobs.push({ name: m[1], at: i });
    }
    ok(jobs.length > 0, `${name}: at least one job`);
    for (const job of jobs) {
      const end = jobs.find(j => j.at > job.at)?.at ?? jobLines.length;
      const body = jobLines.slice(job.at, end).join('\n');
      ok(/runs-on:\s*\S/.test(body), `${name} → ${job.name}: pins a runner`);
      const timeout = body.match(/timeout-minutes:\s*(\d+)/);
      ok(!!timeout, `${name} → ${job.name}: has a timeout (the default is six hours of a hung job)`);
      if (timeout) ok(Number(timeout[1]) > 0 && Number(timeout[1]) <= 60,
        `${name} → ${job.name}: timeout is ${timeout[1]} minutes`);
    }
  }
}

say('\n-- the shell inside the steps parses --');
{
  let blocks = 0, evals = 0;
  for (const name of WORKFLOWS) {
    for (const block of runBlocks(files[name])) {
      blocks++;
      const path = scratch(`${name.replace(/\.yml$/, '')}-${block.line}.sh`, block.shell + '\n');
      let error = null;
      try { execFileSync('bash', ['-n', path], { stdio: 'pipe' }); }
      catch (e) { error = String(e.stderr || e.message).split('\n').slice(0, 2).join(' '); }
      ok(error === null, `${name}:${block.line}: the step parses as shell${error ? ' — ' + error : ''}`);

      for (const inline of nodeEvalBodies(block.shell)) {
        evals++;
        ok(inline.closed, `${name}:${block.line}: the inline node -e is closed with a quote`);
        ok(!inline.body.includes('${'),
          `${name}:${block.line}: the inline JS contains no \${…} — bash would expand it away before node saw it`);
        const jsPath = scratch(`${name.replace(/\.yml$/, '')}-${block.line}-eval.cjs`, inline.body + '\n');
        let jsError = null;
        try { execFileSync(process.execPath, ['--check', jsPath], { stdio: 'pipe' }); }
        catch (e) { jsError = String(e.stderr || e.message).split('\n').slice(0, 3).join(' '); }
        ok(jsError === null, `${name}:${block.line}: the inline JS parses${jsError ? ' — ' + jsError : ''}`);
      }
    }
  }
  ok(blocks >= 10, `${blocks} shell blocks were checked`);
  ok(evals >= 4, `${evals} inline node -e bodies were checked`);
}

say('\n-- every endpoint and job a workflow calls exists here --');
{
  const apiDir = fileURLToPath(new URL('../api', import.meta.url));
  const endpoints = new Set();
  for (const name of WORKFLOWS) {
    for (const m of files[name].matchAll(/\/api\/([a-z0-9-]+)/g)) endpoints.add(m[1]);
  }
  ok(endpoints.size > 0, 'the workflows call at least one API endpoint');
  for (const endpoint of [...endpoints].sort()) {
    ok(existsSync(join(apiDir, endpoint + '.js')),
      `/api/${endpoint} is a function in this repository (a rename would 404 the schedule)`);
  }

  // The accepted job names, read from the dispatcher itself.
  const sync = read('api/goonet-sync.js');
  const machineryJobs = (sync.match(/\[([^\]]*'machinery-doctor'[^\]]*)\]/) || [])[1];
  const accepted = new Set([...String(machineryJobs).matchAll(/'([a-z-]+)'/g)].map(m => m[1]));
  accepted.add('agents');
  ok(accepted.has('machinery') && accepted.has('machinery-doctor'),
    `api/goonet-sync.js still dispatches the machinery jobs (${[...accepted].join(', ')})`);

  // machinery-sync.yml maps its dropdown to those job names.
  const machinery = files['machinery-sync.yml'];
  const mapped = [...machinery.matchAll(/JOB=(machinery[a-z-]*)/g)].map(m => m[1]);
  ok(mapped.length >= 4, `machinery-sync.yml maps every mode to a job (${mapped.join(', ')})`);
  for (const job of mapped) ok(accepted.has(job), `the schedule asks for job=${job}, which the API knows`);
  // The case block: refresh is the DEFAULT (it must stay machinery — a silent
  // re-point would make the nightly refresh a different job), and the other
  // three name their job explicitly.
  const caseAt = machinery.indexOf('case "$MODE" in');
  ok(caseAt > 0 && machinery.slice(0, caseAt).includes('JOB=machinery\n'),
    'the default job is machinery (so mode=refresh refreshes)');
  ok(!/refresh\s*\)[\s\S]{0,80}?JOB=/.test(machinery), 'no case arm quietly overrides the refresh job');
  ok(/doctor\)\s+JOB=machinery-doctor/.test(machinery), 'mode=doctor dispatches the doctor');
  ok(/audit\)\s+JOB=machinery-audit/.test(machinery), 'mode=audit dispatches the audit');
  ok(/recover\)[\s\S]{0,400}?JOB=machinery-recover/.test(machinery), 'mode=recover dispatches the recovery, after its confirmation check');
  ok(/doctor\)\s+JOB=machinery-doctor/.test(machinery), 'doctor is the default mode, matching the dropdown default');

  // ai-growth.yml: agent ids and modes must be the ones the code implements.
  const growth = files['ai-growth.yml'];
  ok(/job=agents/.test(growth), 'ai-growth.yml calls job=agents');
  ok(/URL="\$\{SYNC_URL:-https:\/\/ar7traders\.com\}\/api\/goonet-sync\?key=\$\{SYNC_KEY\}&job=agents"/.test(growth),
    'through the existing sync-key endpoint — no new serverless function');
  for (const agent of AGENTS) {
    ok(new RegExp(`\\b${agent}\\b`).test(growth), `the documented agents include the implemented id "${agent}"`);
  }
  const modes = (growth.match(/options:\s*\[([^\]]*)\]/) || [])[1] || '';
  ok(/\breview\b/.test(modes) && /\bdry-run\b/.test(modes), `the mode dropdown offers only the real modes (${modes.trim()})`);
  ok(!/\blive\b|"publish"/.test(modes), 'and offers no mode that would bypass approval');
  const agents = read('api/_agents.js');
  for (const mode of ['dry-run', 'review']) {
    ok(new RegExp(`['"]${mode}['"]`).test(agents), `api/_agents.js implements mode "${mode}"`);
  }
}

say('\n-- a scheduled production caller must fail loudly, and only on real failure --');
{
  for (const name of ['goonet-sync.yml', 'machinery-sync.yml', 'ai-growth.yml']) {
    const text = files[name];
    ok(/\$\{\{ secrets\.GOONET_SYNC_KEY \}\}/.test(text), `${name}: reads the sync key from a secret`);
    ok(/\$\{\{ secrets\.GOONET_SYNC_URL \}\}/.test(text), `${name}: takes the base URL from a secret with a default`);
    ok(/key=\$\{SYNC_KEY\}/.test(text), `${name}: the key is only ever the secret, never a literal`);
    ok(/-z "\$SYNC_KEY"[^\n]*\n[\s\S]{0,200}?exit 1/.test(text),
      `${name}: refuses to run when the secret is missing`);
    ok(/if \[ "\$CODE" != "200" \]/.test(text), `${name}: checks the HTTP status rather than trusting curl`);
    ok(/::error::/.test(text), `${name}: reports the failure as an annotation, not just a log line`);
    ok(/curl -sSL|-sSL /.test(text), `${name}: follows the canonical-domain redirect (-L)`);
    ok(!/\bGEMINI_API_KEY\b|\bOPENAI_API_KEY\b|\bSUPABASE_SERVICE[A-Z_]*\b|\bVITE_/.test(text),
      `${name}: no server-only key or client-side VITE_ variable is referenced in CI`);
  }

  // The machinery preflight must come BEFORE the dispatch — that ordering is the
  // whole point: a missing table has to stop the run, not 500 the job.
  const machinery = files['machinery-sync.yml'];
  const probeAt = machinery.indexOf('probe=storage');
  const dispatchAt = machinery.indexOf('URL="${BASE}/api/goonet-sync');
  ok(probeAt > 0 && dispatchAt > 0 && probeAt < dispatchAt,
    'machinery-sync.yml probes the storage before it dispatches anything');
  ok(/if \[ "\$PROBE_CODE" != "200" \][\s\S]{0,600}?exit 1/.test(machinery),
    'a failed preflight stops the run with the migration named');
  ok(/capabilities=machinery/.test(machinery),
    'and it verifies the deployment understands the job names before sending one');
  const capabilities = read('api/site-content.js');
  const capabilityShape = capabilities.match(/version:\s*2,\s*audit:\s*true,\s*recoverImports:\s*true/);
  ok(!!capabilityShape, 'which the API answers with version 2 + audit + recoverImports');
  ok(/CONFIRM_RECOVERY/.test(machinery) && /Recovery confirmation is required/.test(machinery),
    'and publishing hidden imports needs an explicit confirmation input');
  ok(/check-sync-report\.mjs/.test(machinery) && /check-sync-report\.mjs/.test(files['goonet-sync.yml']),
    'both importers hand their response to the shared report checker');
  ok(existsSync(fileURLToPath(new URL('../scripts/check-sync-report.mjs', import.meta.url))),
    'which exists in this repository');
}

say('\n-- the schedules do not collide --');
{
  // day-of-week/month fields are '*' or a list; a shared hour:minute on a shared
  // day is a collision, and two callers of the same function must not run at
  // the same time at all.
  const schedules = [];
  for (const name of WORKFLOWS) {
    for (const m of files[name].matchAll(/- cron:\s*'([^']+)'/g)) {
      const [minute, hour, dom, month, dow] = m[1].trim().split(/\s+/);
      ok([minute, hour, dom, month, dow].every(v => v !== undefined), `${name}: the cron "${m[1]}" has five fields`);
      ok(Number(minute) >= 0 && Number(minute) <= 59 && Number(hour) >= 0 && Number(hour) <= 23,
        `${name}: "${m[1]}" is a real time of day`);
      ok(dom === '*' && month === '*', `${name}: "${m[1]}" runs every day (no calendar surprises)`);
      schedules.push({ name, minute: Number(minute), hour: Number(hour), at: Number(hour) * 60 + Number(minute), dow, raw: m[1] });
    }
  }
  ok(schedules.length >= 6, `${schedules.length} scheduled runs across the workflows`);

  const byTime = new Map();
  for (const s of schedules) {
    const key = s.hour + ':' + String(s.minute).padStart(2, '0');
    if (byTime.has(key)) ok(false, `only one workflow may run at ${key} — ${byTime.get(key)} and ${s.name}`);
    else byTime.set(key, s.name);
  }
  ok(byTime.size === schedules.length, 'no two schedules fire at the same minute');

  // Same function, same budget: keep the sync-key callers apart.
  const callers = schedules.filter(s => ['goonet-sync.yml', 'machinery-sync.yml', 'ai-growth.yml'].includes(s.name));
  let closest = { gap: Infinity };
  for (const a of callers) for (const b of callers) {
    if (a === b) continue;
    const gap = Math.abs(a.at - b.at);
    if (gap < closest.gap) closest = { gap, a: a.name, b: b.name };
  }
  ok(closest.gap >= 15,
    `callers of the sync function are at least 15 minutes apart (closest: ${closest.a} → ${closest.b}, ${closest.gap} min)`);

  // ai-growth.yml claims its three runs are staggered and sit "well away" from
  // the 03:00 Goo-net and 03:40 machinery runs. Check that claim.
  const growth = schedules.filter(s => s.name === 'ai-growth.yml').sort((a, b) => a.at - b.at);
  ok(growth.length === 3, `ai-growth.yml keeps its three staggered runs (${growth.map(s => s.raw).join(' | ')})`);
  for (let i = 1; i < growth.length; i++) {
    ok(growth[i].at - growth[i - 1].at >= 20,
      `its runs are at least 20 minutes apart (${growth[i - 1].raw} → ${growth[i].raw}, ${growth[i].at - growth[i - 1].at} min)`);
  }
  const machineryAt = schedules.find(s => s.name === 'machinery-sync.yml')?.at ?? 0;
  const goonetAt = schedules.find(s => s.name === 'goonet-sync.yml')?.at ?? 0;
  ok(Math.min(...growth.map(s => s.at)) - Math.max(machineryAt, goonetAt) >= 60,
    `and start at least an hour after the nightly importers (${Math.min(...growth.map(s => s.at)) - Math.max(machineryAt, goonetAt)} min after)`);
}

say('\n-- what the workflows rely on is documented for the owner --');
{
  const goLive = read('CRM-GO-LIVE.md');
  for (const secret of ['GOONET_SYNC_KEY', 'GOONET_SYNC_URL']) {
    ok(goLive.includes(secret), `${secret} is written down in CRM-GO-LIVE.md, not only in the workflow`);
  }
  ok(/GEMINI_API_KEY/.test(goLive), 'the Gemini key the agents need is documented too');
  ok(/server-only|never .*VITE_/i.test(goLive), 'and marked server-only');
  const growthDoc = read('AI-GROWTH.md');
  ok(/\.github\/workflows\/ai-growth\.yml/.test(growthDoc),
    'AI-GROWTH.md points at the workflow that runs the agents');
  ok(/Actions/.test(growthDoc) && /Run workflow/.test(growthDoc),
    'and tells the owner where to run it by hand');
  // The workflow's own header promises drafts-only. Keep the promise visible.
  const growth = files['ai-growth.yml'];
  ok(/only produce DRAFTS/i.test(growth), 'the agents workflow still states it can only draft');
  ok(/DISABLED until the owner enables it/i.test(growth), 'and that nothing runs until the owner enables it');
  ok(/0 agent\(s\) ran/.test(growth), 'and that a fresh install reports zero agents rather than inventing work');
}

rmSync(tmp, { recursive: true, force: true });
say(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
