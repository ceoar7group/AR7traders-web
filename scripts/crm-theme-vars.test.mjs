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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
