#!/usr/bin/env node
// CRM theme-token guard.
//
//   node scripts/crm-theme-vars.test.mjs
//
// The Japan dealer stock panel used the PUBLIC SITE's tokens (--panel, --border,
// --gold, --muted). Those are defined in src/styles.css for the website; the CRM
// shell defines its own --crm-* tokens, so inside the CRM the panel lost its
// background, borders and button colours — worst in the light theme, where the
// import panel became unreadable. This suite fails if a CRM rule ever uses a
// token the CRM does not define, or if one of the three themes stops defining a
// token the others have (a missing light-theme token is exactly how this bug
// shipped).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error('  ✗ ' + name); }
}

const css = readFileSync(fileURLToPath(new URL('../src/crm.css', import.meta.url)), 'utf8');
const read = rel => readFileSync(fileURLToPath(new URL('../' + rel, import.meta.url)), 'utf8');
const used = new Set([...css.matchAll(/var\((--[A-Za-z0-9_-]+)/g)].map(m => m[1]));
const defined = new Set([...css.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)].map(m => m[1]));
const undefinedTokens = [...used].filter(t => !defined.has(t)).sort();

console.log('\n-- every token the CRM uses is a CRM token --');
ok(undefinedTokens.length === 0,
  `no rule uses an undefined custom property${undefinedTokens.length ? ' — found ' + undefinedTokens.join(', ') : ''}`);
for (const publicToken of ['--panel', '--border', '--gold', '--muted', '--ink', '--bg', '--card', '--line']) {
  ok(!used.has(publicToken), `the public-site token ${publicToken} is not used inside src/crm.css`);
}
ok(defined.has('--crm-panel') && defined.has('--crm-border') && defined.has('--crm-gold') && defined.has('--crm-muted'),
  'the CRM tokens the panel needs are defined');

console.log('\n-- all three themes define the same token set --');
const themes = {};
for (const theme of ['emerald', 'dark', 'light']) {
  const block = css.match(new RegExp(`data-crm-theme="${theme}"[^{]*\\{([\\s\\S]*?)\\n\\}`));
  ok(!!block, `the ${theme} theme block exists`);
  themes[theme] = block ? new Set([...block[1].matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)].map(m => m[1])) : new Set();
}
const emeraldTokens = [...themes.emerald].sort();
for (const theme of ['dark', 'light']) {
  const missing = emeraldTokens.filter(t => !themes[theme].has(t));
  ok(missing.length === 0,
    `${theme} defines every token the default theme has${missing.length ? ' — missing ' + missing.join(', ') : ''}`);
}
for (const t of ['--crm-bg', '--crm-panel', '--crm-border', '--crm-ink', '--crm-muted', '--crm-gold', '--crm-primary',
  '--crm-input-bg', '--crm-on-gold', '--crm-danger', '--crm-danger-bg', '--crm-danger-border']) {
  ok(themes.light.has(t) && themes.dark.has(t) && themes.emerald.has(t),
    `all three themes define ${t}`);
}

console.log('\n-- the Japan dealer stock panel is theme-driven --');
const section = css.slice(css.indexOf('/* ================= Japan dealer stock'));
ok(section.length > 500, 'the Japan dealer stock CSS section was found');
for (const rule of ['.crm-goonet-settings{', '.crm-goonet .crm-import-body{', '.crm-goonet .crm-import-toggle{',
  '.crm-goonet .crm-import-actions button{', '.crm-goonet .goonet-actions button{']) {
  const i = section.indexOf(rule);
  ok(i >= 0, `the rule ${rule} exists`);
  if (i >= 0) {
    const body = section.slice(i, section.indexOf('}', i));
    ok(!/var\(--(panel|border|gold|muted)\b/.test(body), `${rule} uses only CRM tokens`);
    ok(!/#071b12|#0a2418|#ffffff14|color:#fff(?!f)/.test(body), `${rule} hardcodes no dark-theme colour`);
  }
}
{
  const i = section.indexOf('.crm-goonet-settings{');
  const body = section.slice(i, section.indexOf('}', i));
  ok(/background:var\(--crm-panel\)/.test(body), 'the settings panel takes its background from the theme');
  ok(/border:1px solid var\(--crm-border\)/.test(body), 'the settings panel takes its border from the theme');
}
{
  const i = section.indexOf('.crm-goonet .crm-tools button.active{');
  const body = section.slice(i, section.indexOf('}', i));
  ok(/var\(--crm-gold\)/.test(body) && /var\(--crm-on-gold\)/.test(body),
    'the active tool button uses the gold token plus its own readable text colour');
}

console.log('\n-- the machinery storage alert is theme-driven and readable --');
{
  // The alert is what an operator sees when the machinery storage was never
  // created. It must carry the same weight in all three themes, take every
  // colour from a token, and keep a real button next to the sentence.
  const at = css.lastIndexOf('.crm-storage-alert {');
  ok(at > 0, 'the machinery storage alert CSS section exists');
  const section = css.slice(at, at + 4000);
  for (const rule of ['.crm-storage-alert {', '.crm-storage-alert p', '.crm-storage-alert .crm-storage-fix',
    '.crm-storage-alert > button', '.crm-storage-report {', '.crm-storage-report li.is-bad b']) {
    const i = section.indexOf(rule);
    ok(i >= 0, `the rule ${rule.trim()} exists`);
    if (i >= 0) {
      const body = section.slice(i, section.indexOf('}', i) + 1);
      ok(!/#[0-9a-f]{3,8}\b/i.test(body) && !/\b(rgba?|hsla?)\(/.test(body),
        `${rule.trim()} hardcodes no colour — it takes one from the theme`);
    }
  }
  const alertRule = section.slice(section.indexOf('.crm-storage-alert {'), section.indexOf('}', section.indexOf('.crm-storage-alert {')));
  ok(/var\(--crm-danger-border\)/.test(alertRule) && /var\(--crm-danger-bg\)/.test(alertRule),
    'the alert is outlined and filled with the danger tokens');
  ok(/role="alert"/.test(read('src/crm.jsx')), 'the alert is announced as a role=alert region');
  const buttonRule = section.slice(section.indexOf('.crm-storage-alert > button'), section.indexOf('}', section.indexOf('.crm-storage-alert > button')) + 1);
  ok(/height:\s*38px/.test(buttonRule), 'its diagnostic button is 38px tall (the measured minimum for the desk)');
  ok(/white-space:\s*nowrap/.test(buttonRule), 'and its label never wraps mid-word');
  ok(/@media \(max-width: 700px\)/.test(section) && /width:\s*100%/.test(section),
    'on a phone the button takes the full width instead of squeezing the sentence');
  // Measured, not guessed (scripts/machinery-alert-shots.mjs): the fix line in
  // --crm-gold read 2.75:1 on the Porcelain Light panel and the 11.5px check
  // detail in bare --crm-muted read 4.61:1 — both flagged by the run.
  const fixRule = section.slice(section.indexOf('.crm-storage-alert .crm-storage-fix'), section.indexOf('}', section.indexOf('.crm-storage-alert .crm-storage-fix')) + 1);
  ok(/var\(--crm-danger\)/.test(fixRule) && !/var\(--crm-gold\)/.test(fixRule),
    'the fix line uses the danger token, not gold (gold measured 2.75:1 on the light panel)');
  const detailRule = section.slice(section.indexOf('.crm-storage-report li span'), section.indexOf('}', section.indexOf('.crm-storage-report li span')) + 1);
  ok(/color-mix\(in srgb, var\(--crm-muted\)/.test(detailRule),
    'the 11.5px check detail mixes muted toward the ink token so it clears AA in light theme');
  const reportFix = section.slice(section.indexOf('.crm-storage-report .crm-storage-fix'), section.indexOf('}', section.indexOf('.crm-storage-report .crm-storage-fix')) + 1);
  ok(/var\(--crm-danger\)/.test(reportFix), 'the report fix lines are danger-coloured too');
}

console.log('\n-- a desk that cannot read the machines offers no writes --');
{
  // Two things must agree: the client hides the "Add all to the desk" button
  // when the storage failure blocks writes, and the server's failure is what
  // tells it so. (The render path is demo mode, where no read can fail, so this
  // is asserted at the source level and by describeLoadFailure's unit tests.)
  const crm = read('src/crm.jsx');
  const bar = crm.slice(crm.indexOf('crm-catalogue-bar') - 400, crm.indexOf('crm-catalogue-bar'));
  ok(/!loadIssues\.machinery\?\.writesBlocked/.test(bar),
    'the catalogue button is gated on writesBlocked, not merely on the failure existing');
  ok(/writesBlocked: missingTable/.test(crm),
    'writesBlocked is derived from a missing table — a transient error must not hide working buttons');
  ok(/buttons that add or change machines are hidden/.test(crm),
    'and the alert explains why those buttons are not there');
}

console.log('\n-- the shared hint line clears AA text size --');
{
  // The base .crm-hint rule is 11px body text on --crm-bg/--crm-panel; bare
  // --crm-muted measured 4.23:1 on the Porcelain Light background.
  const i = css.indexOf('.crm-hint{');
  ok(i > 0, 'the base .crm-hint rule exists');
  const body = css.slice(i, css.indexOf('}', i) + 1);
  ok(/color-mix\(in srgb, var\(--crm-muted\)/.test(body),
    '.crm-hint mixes the muted token toward the ink token rather than using it raw');
  ok(/font-size:11px/.test(body), 'and is still the 11px hint it has always been');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
