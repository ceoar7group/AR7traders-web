// CRM action-discoverability evidence — real Chromium, measured, before/after.
//
// Not part of `npm test` (it needs a real browser, like scripts/page-shots.mjs).
// Run it against a CRM preview/dev server and it answers the question the owner
// actually asked — "is the Edit button findable without hunting?" — with
// numbers instead of a CSS claim:
//
//     VITE_CRM_DEMO=true npx vite --host 0.0.0.0 --port 5199 --strictPort &
//     node scripts/crm-actions-evidence.mjs --out pr-visuals/2026-10-11 --label before
//
// What it measures per viewport, on the real Japan-dealer-stock table:
//   • does the row's action cell sit inside the scrollport at scrollLeft = 0
//     (i.e. can it be reached without horizontal scrolling)?
//   • how far past the right edge of the scroller the Edit button is;
//   • whether the action cell covers row content it should not;
//   • the tap-target size of every action button;
//   • the keyboard path: Tab until Edit is focused, Enter opens the row menu,
//     Escape closes it, and focus returns to the trigger.
// Plus a screenshot of the viewport for each size.
//
// Chromium: set CHROME_PATH, or install the Lambda build which ships the binary
// inside the npm tarball (the sandbox has no egress to Google's CDN):
//     npm i --no-save puppeteer-core @sparticuz/chromium
//     node scripts/chromium-libs.mjs      # extracts the shared libraries it needs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes('--' + name) ? args[args.indexOf('--' + name) + 1] : fallback);
const BASE = opt('base', process.env.BASE_URL || 'http://127.0.0.1:5199');
const outDir = opt('out', 'pr-visuals/2026-10-11');
const label = opt('label', 'run');
const shots = !args.includes('--no-shots');
// `--no-keyboard` skips the keyboard/interaction probes. Used to capture a
// geometry-only baseline from the PREVIOUS release, whose rows have no
// `[data-row-primary]` and no row menu to open.
const withKeyboard = !args.includes('--no-keyboard');
const tab = opt('tab', 'Japan dealer stock');
const viewports = String(opt('viewports', '1440x900,1024x768,768x1024,390x844')).split(',').filter(Boolean)
  .map(v => { const [w, h] = v.split('x').map(Number); return { name: v, width: w, height: h }; });

const MEASURE = (tabLabel) => {
  const out = { rows: 0, found: null, warnings: [] };
  const wrap = document.querySelector('.crm-goonet .crm-table-wrap') || document.querySelector('.crm-table-wrap');
  if (!wrap) { out.warnings.push('no table wrapper found'); return out; }
  const scroller = wrap.getBoundingClientRect();
  out.scroller = { left: Math.round(scroller.left), right: Math.round(scroller.right), width: Math.round(scroller.width), scrollWidth: wrap.scrollWidth, clientWidth: wrap.clientWidth };

  const row = [...document.querySelectorAll('tbody tr')].find(tr => tr.querySelector('td.crm-row-actions'));
  if (!row) { out.warnings.push('no row with an action cell'); return out; }
  out.rows = document.querySelectorAll('tbody tr').length;

  // The canonical "Edit" control, wherever the markup puts it now.
  const edit = [...row.querySelectorAll('button, a[href], [role="menuitem"]')]
    .find(el => /^edit/i.test((el.getAttribute('aria-label') || el.textContent || '').trim()));
  const actionCell = row.querySelector('td.crm-row-actions');
  const cellRect = actionCell.getBoundingClientRect();
  const primary = row.querySelector('[data-row-primary]') || edit;
  const primaryRect = primary ? primary.getBoundingClientRect() : null;

  out.actions = {
    trigger: !!row.querySelector('[data-row-menu]'),
    // Where the primary control is relative to the scroller's visible area.
    editInViewportNoScroll: !!primaryRect && primaryRect.left >= scroller.left - 1 && primaryRect.right <= scroller.right + 1,
    editRightOverflowPx: primaryRect ? Math.max(0, Math.round(primaryRect.right - scroller.right)) : null,
    editLeftOfScroller: primaryRect ? Math.round(primaryRect.left - scroller.left) : null,
    actionCell: { left: Math.round(cellRect.left), right: Math.round(cellRect.right), width: Math.round(cellRect.width) },
    tapTargets: [...row.querySelectorAll('button')].map(b => {
      const r = b.getBoundingClientRect();
      return { label: (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) };
    }),
    // Does the pinned cell cover the row's own content?
    coversRowContent: (() => {
      const cells = [...row.querySelectorAll('td')].filter(td => td !== actionCell);
      const last = cells[cells.length - 1];
      if (!last) return null;
      const r = last.getBoundingClientRect();
      return Math.round(Math.max(0, r.right - cellRect.left));
    })()
  };

  // Row menu (if the design has one): is it labelled, and does it open?
  const menuBtn = row.querySelector('[data-row-menu]');
  if (menuBtn) {
    out.actions.menuLabel = menuBtn.getAttribute('aria-label') || menuBtn.textContent.trim();
    out.actions.menuExpanded = menuBtn.getAttribute('aria-expanded');
    out.actions.menuHaspopup = menuBtn.getAttribute('aria-haspopup');
  }
  return out;
};

// Keyboard path, driven by REAL key events (puppeteer's keyboard), because a
// synthetic KeyboardEvent does not move focus in Chromium and would prove
// nothing. Records: how many Tab presses it takes to reach the row's primary
// action, whether Enter opens the overflow menu, which item the Arrow keys
// land on, and whether Escape closes the menu and returns focus to the trigger.
const FOCUS_PROBE = async (page) => {
  const state = () => page.evaluate(() => {
    const row = [...document.querySelectorAll('tbody tr')].find(tr => tr.querySelector('td.crm-row-actions'));
    const active = document.activeElement;
    return {
      rowFound: !!row,
      activeLabel: active ? (active.getAttribute('aria-label') || active.textContent || '').trim().slice(0, 40) : null,
      activeIsPrimary: !!(active && active.matches && active.matches('td.crm-row-actions [data-row-primary]')),
      activeIsMenuTrigger: !!(active && active.matches && active.matches('td.crm-row-actions [data-row-menu]')),
      panelOpen: !!document.querySelector('[data-row-menu-panel]:not(.is-closed)'),
      panelItems: document.querySelectorAll('[data-row-menu-panel]:not(.is-closed) [role="menuitem"]').length,
      panelHidden: document.querySelector('[data-row-menu-panel]')?.getAttribute('aria-hidden') || null,
      expanded: document.querySelector('td.crm-row-actions [data-row-menu]')?.getAttribute('aria-expanded') || null,
      itemSizes: [...document.querySelectorAll('[data-row-menu-panel]:not(.is-closed) [role="menuitem"]')]
        .map(b => { const r = b.getBoundingClientRect(); return { label: (b.textContent || '').trim().slice(0, 22), w: Math.round(r.width), h: Math.round(r.height) }; })
    };
  });

  const result = { reachedInTabs: null, focused: null, menuOpened: false, menuItems: 0, arrowMovedFocus: false, menuClosedByEscape: false, focusReturned: false };
  await page.evaluate(() => document.body.focus());
  for (let i = 1; i <= 60; i++) {
    await page.keyboard.press('Tab');
    const s = await state();
    if (s.activeIsPrimary) { result.reachedInTabs = i; result.focused = s.activeLabel; break; }
    if (s.activeIsMenuTrigger && result.reachedInTabs === null) { result.reachedInTabs = i; result.focused = s.activeLabel; break; }
  }
  // Walk to the menu trigger explicitly, then open it with Enter.
  for (let i = 0; i < 4; i++) {
    const s = await state();
    if (s.activeIsMenuTrigger) break;
    await page.keyboard.press('Tab');
  }
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 80));
  let s = await state();
  result.menuOpened = s.panelOpen;
  result.menuItems = s.panelItems;
  result.itemSizes = s.itemSizes;
  result.expandedWhenOpen = s.expanded;
  result.ariaHiddenWhenOpen = s.panelHidden;
  if (s.panelOpen) {
    await page.keyboard.press('ArrowDown');
    const after = await state();
    result.arrowMovedFocus = after.activeLabel !== s.activeLabel || !!after.activeLabel;
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 80));
    const closed = await state();
    result.menuClosedByEscape = !closed.panelOpen;
    result.ariaHiddenWhenClosed = closed.panelHidden;
    result.focusReturned = closed.activeIsMenuTrigger;
  }
  return result;
};

// Interaction probe: does the primary action actually open the editor, and does
// a destructive item really ask for confirmation before it fires? Only a real
// browser can answer that; a CSS assertion cannot.
const INTERACTION_PROBE = async (page) => {
  const out = { editOpenedEditor: false, editorTitle: null, deleteAskedForConfirmation: null, menuItemClicked: null };
  await page.evaluate(() => {
    window.__ar7Confirms = [];
    const real = window.confirm;
    window.__ar7ConfirmsReal = real;
    window.confirm = message => { window.__ar7Confirms.push(String(message)); return false; };
  });
  const row = await page.$('tbody tr td.crm-row-actions');
  if (!row) return out;
  const primary = await row.$('[data-row-primary]') || await row.$('button');
  if (primary) {
    await primary.click();
    await new Promise(r => setTimeout(r, 200));
    const modal = await page.$('.crm-modal-bg');
    out.editOpenedEditor = !!modal;
    out.editorTitle = modal ? (await modal.evaluate(el => (el.querySelector('h2')?.textContent || el.querySelector('header')?.textContent || '').trim().slice(0, 60))) : null;
    if (modal) await modal.evaluate(el => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    await new Promise(r => setTimeout(r, 150));
  }
  // Destructive path: open the menu and click the item marked danger.
  const opened = await page.evaluate(() => {
    const trigger = document.querySelector('td.crm-row-actions [data-row-menu]');
    if (!trigger) return false;
    trigger.click();
    return true;
  });
  await new Promise(r => setTimeout(r, 120));
  if (opened) {
    const clicked = await page.evaluate(() => {
      const item = [...document.querySelectorAll('[data-row-menu-panel]:not(.is-closed) .crm-row-menu-item.danger')]
        .filter(b => !b.disabled).pop();
      if (!item) return null;
      item.click();
      return (item.textContent || '').trim();
    });
    out.menuItemClicked = clicked;
    await new Promise(r => setTimeout(r, 200));
    out.deleteAskedForConfirmation = await page.evaluate(() => (window.__ar7Confirms || []).length > 0 ? window.__ar7Confirms[0].slice(0, 90) : false);
    await page.evaluate(() => { if (window.__ar7ConfirmsReal) window.confirm = window.__ar7ConfirmsReal; });
  }
  return out;
};

async function main() {
  const { default: puppeteer } = await import('puppeteer-core').catch(() => ({ default: null }));
  if (!puppeteer) {
    console.log('puppeteer-core is not installed — run: npm i --no-save puppeteer-core @sparticuz/chromium');
    process.exit(0);
  }
  let executablePath = process.env.CHROME_PATH || '/tmp/vchrome/chrome';
  try {
    const chromium = (await import('@sparticuz/chromium')).default;
    executablePath = await chromium.executablePath();
    process.env.LD_LIBRARY_PATH = [process.env.LD_LIBRARY_PATH, '/tmp/chromelibs'].filter(Boolean).join(':');
  } catch { /* a system chrome at CHROME_PATH is fine too */ }

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
    env: { ...process.env }
  });
  const report = { base: BASE, label, generatedAt: new Date().toISOString(), viewports: {} };
  mkdirSync(outDir, { recursive: true });

  for (const vp of viewports) {
    const page = await browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.goto(BASE + '/#crm', { waitUntil: 'networkidle2', timeout: 45000 });
    // The CRM mounts client-side; wait for the sidebar, then open the desk.
    await page.waitForFunction(() => !!document.querySelector('.crm-side, nav'), { timeout: 20000 }).catch(() => {});
    const clicked = await page.evaluate(label => {
      // Nav labels wrap onto two lines ("Japan dealer\nstock"), so compare
      // normalised whitespace rather than the raw textContent.
      const norm = t => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const link = [...document.querySelectorAll('.crm-side button, .crm-side a, nav button, nav a')]
        .find(el => norm(el.textContent).startsWith(label.toLowerCase()));
      if (link) { link.click(); return true; }
      return false;
    }, tab);
    await new Promise(r => setTimeout(r, 900));
    const measured = await page.evaluate(MEASURE, tab);
    const focusResult = withKeyboard ? await FOCUS_PROBE(page).catch(e => ({ error: e.message })) : { skipped: 'geometry-only run' };
    const interaction = withKeyboard ? await INTERACTION_PROBE(page).catch(e => ({ error: e.message })) : { skipped: 'geometry-only run' };
    report.viewports[vp.name] = { opened: clicked, ...measured, focus: focusResult, interaction };
    if (shots) {
      const file = join(outDir, `crm-actions-${label}-${vp.name}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 78 });
      report.viewports[vp.name].screenshot = file;
    }
    await page.close();
  }
  await browser.close();
  const json = join(outDir, `crm-actions-${label}.json`);
  writeFileSync(json, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log('\nmeasurements written to ' + json);
}

main().catch(e => { console.error(e); process.exit(1); });
