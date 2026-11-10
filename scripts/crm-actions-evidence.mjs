// CRM action-discoverability evidence — real Chromium, measured, before/after.
//
// Not part of `npm test` (it needs a real browser, like scripts/page-shots.mjs).
// Run it against a CRM preview/dev server and it answers the question the owner
// actually asked — "is the Edit button findable without hunting?" — with
// numbers instead of a CSS claim:
//
//     VITE_CRM_DEMO=true npx vite --host 0.0.0.0 --port 5199 --strictPort &
//     node scripts/crm-actions-evidence.mjs --out pr-visuals/2026-10-12 --label after-fix
//
// What it measures per viewport, on the real Japan-dealer-stock table:
//   • whether Edit is reachable at scrollLeft = 0, and how wide the pinned
//     action cell is;
//   • whether the open menu is outside the scroll container, fully on-screen,
//     opaque, and has a visible first item (the row-2 regression case);
//   • the tap-target size and keyboard path, including Escape focus return.
// The default run exits non-zero if any menu-visibility check fails, and saves
// a screenshot with the menu open at each requested viewport.
//
// Chromium: set CHROME_PATH, or install the Lambda build which ships the binary
// inside the npm tarball (the sandbox has no egress to Google's CDN):
//     npm i --no-save puppeteer-core @sparticuz/chromium
//     node scripts/chromium-libs.mjs      # extracts the shared libraries it needs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractChromiumLibraries } from './chromium-libs.mjs';

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
    const panel = document.querySelector('[data-row-menu-panel]:not(.is-closed)');
    const enabledItems = [...(panel?.querySelectorAll('[role="menuitem"]:not([disabled])') || [])];
    return {
      rowFound: !!row,
      activeLabel: active ? (active.getAttribute('aria-label') || active.textContent || '').trim().slice(0, 40) : null,
      activeIsPrimary: !!(active && active.matches && active.matches('td.crm-row-actions [data-row-primary]')),
      activeIsMenuTrigger: !!(active && active.matches && active.matches('td.crm-row-actions [data-row-menu]')),
      panelOpen: !!panel,
      panelItems: panel?.querySelectorAll('[role="menuitem"]').length || 0,
      enabledMenuItems: enabledItems.length,
      activeMenuIndex: enabledItems.indexOf(active),
      panelHidden: panel?.getAttribute('aria-hidden') || null,
      closedPanelHidden: document.querySelector('[data-row-menu-panel].is-closed')?.getAttribute('aria-hidden') || null,
      expanded: document.querySelector('td.crm-row-actions [data-row-menu]')?.getAttribute('aria-expanded') || null,
      itemSizes: [...(panel?.querySelectorAll('[role="menuitem"]') || [])]
        .map(b => { const r = b.getBoundingClientRect(); return { label: (b.textContent || '').trim().slice(0, 22), w: Math.round(r.width), h: Math.round(r.height) }; })
    };
  });

  const result = { reachedInTabs: null, focused: null, menuOpened: false, menuItems: 0, arrowMovedFocus: false, arrowUpReturned: false, homeToFirst: false, endToLast: false, menuClosedByEscape: false, focusReturned: false };
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
  result.activeMenuIndexWhenOpen = s.activeMenuIndex;
  result.enabledMenuItems = s.enabledMenuItems;
  if (s.panelOpen) {
    await page.keyboard.press('ArrowDown');
    const afterDown = await state();
    result.arrowMovedFocus = afterDown.activeMenuIndex >= 0 && afterDown.activeMenuIndex !== s.activeMenuIndex;
    await page.keyboard.press('ArrowUp');
    const afterUp = await state();
    result.arrowUpReturned = afterUp.activeMenuIndex === s.activeMenuIndex;
    await page.keyboard.press('Home');
    const afterHome = await state();
    result.homeToFirst = afterHome.activeMenuIndex === 0;
    await page.keyboard.press('End');
    const afterEnd = await state();
    result.endToLast = afterEnd.activeMenuIndex === afterEnd.enabledMenuItems - 1;
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 80));
    const closed = await state();
    result.menuClosedByEscape = !closed.panelOpen;
    result.ariaHiddenWhenClosed = closed.closedPanelHidden;
    result.focusReturned = closed.activeIsMenuTrigger;
  }
  return result;
};

// Open the second visible data row (the historical clipping case) and inspect
// the actual portal, geometry, first action and computed paint in Chromium.
// The menu intentionally stays open so the screenshot records the real result.
const MENU_VISUAL_PROBE = async (page, requestedRow = 1) => {
  const opened = await page.evaluate(rowIndex => {
    const rows = [...document.querySelectorAll('tbody tr')].filter(tr => tr.querySelector('td.crm-row-actions'));
    if (!rows.length) return { opened: false, rowIndex: null, reason: 'no action rows' };
    const actualIndex = Math.min(Math.max(0, rowIndex), rows.length - 1);
    const row = rows[actualIndex];
    const trigger = row.querySelector('[data-row-menu]');
    if (!trigger) return { opened: false, rowIndex: actualIndex, reason: 'no menu trigger' };
    trigger.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    trigger.click();
    return { opened: true, rowIndex: actualIndex };
  }, requestedRow);
  if (!opened.opened) {
    return {
      ...opened,
      panelExists: false,
      panelInsideTableWrap: null,
      panelOnScreen: false,
      firstItemVisible: false,
      opaqueBackground: false,
      checks: { detachedFromTable: false, withinViewport: false, visibleFirstItem: false, opaqueBackground: false, allThemesOpaque: false }
    };
  }

  await page.waitForFunction(() => {
    const panel = document.querySelector('[data-row-menu-portal="1"]');
    return panel && getComputedStyle(panel).visibility === 'visible';
  }, { timeout: 5000 }).catch(() => {});

  return page.evaluate(opened => {
    const panel = document.querySelector('[data-row-menu-portal="1"]');
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    if (!panel) {
      return {
        ...opened,
        panelExists: false,
        panelInsideTableWrap: null,
        panelOnScreen: false,
        firstItemVisible: false,
        opaqueBackground: false,
        checks: { detachedFromTable: false, withinViewport: false, visibleFirstItem: false, opaqueBackground: false, allThemesOpaque: false }
      };
    }
    const rect = panel.getBoundingClientRect();
    const style = getComputedStyle(panel);
    const first = panel.querySelector('.crm-row-menu-item');
    const firstRect = first?.getBoundingClientRect();
    const firstStyle = first ? getComputedStyle(first) : null;
    const background = style.backgroundColor;
    const colorAlpha = color => {
      if (!color || color === 'transparent') return 0;
      if (!/^rgba\(/i.test(color)) return 1;
      const values = color.slice(color.indexOf('(') + 1, color.lastIndexOf(')')).split(',');
      return Number(values[3] ?? 1);
    };
    const backgroundAlpha = colorAlpha(background);
    const originalTheme = panel.getAttribute('data-crm-theme');
    const themeSamples = {};
    for (const theme of ['emerald', 'dark', 'light']) {
      panel.setAttribute('data-crm-theme', theme);
      const themePanel = getComputedStyle(panel);
      const firstItem = panel.querySelector('.crm-row-menu-item');
      themeSamples[theme] = {
        background: themePanel.backgroundColor,
        backgroundAlpha: colorAlpha(themePanel.backgroundColor),
        itemColor: firstItem ? getComputedStyle(firstItem).color : null
      };
    }
    if (originalTheme) panel.setAttribute('data-crm-theme', originalTheme);
    else panel.removeAttribute('data-crm-theme');
    const allThemesOpaque = Object.values(themeSamples).every(sample => sample.backgroundAlpha > 0.05);
    const panelInsideTableWrap = !!panel.closest('.crm-table-wrap');
    const panelOnScreen = rect.width > 0 && rect.height > 0
      && rect.left >= -1 && rect.top >= -1
      && rect.right <= viewport.width + 1 && rect.bottom <= viewport.height + 1;
    const firstItemVisible = !!firstRect && !!firstStyle
      && firstRect.width > 0 && firstRect.height > 0
      && firstStyle.display !== 'none' && firstStyle.visibility !== 'hidden'
      && Number(firstStyle.opacity || 1) > 0
      && firstRect.left >= rect.left - 1 && firstRect.top >= rect.top - 1
      && firstRect.right <= rect.right + 1 && firstRect.bottom <= rect.bottom + 1
      && firstRect.right > 0 && firstRect.left < viewport.width
      && firstRect.bottom > 0 && firstRect.top < viewport.height;
    const opaqueBackground = backgroundAlpha > 0.05 && Number(style.opacity || 1) > 0.05;
    const checks = {
      detachedFromTable: !panelInsideTableWrap,
      withinViewport: panelOnScreen,
      visibleFirstItem: firstItemVisible,
      opaqueBackground,
      allThemesOpaque
    };
    return {
      ...opened,
      panelExists: true,
      parentTag: panel.parentElement?.tagName || null,
      position: style.position,
      theme: panel.getAttribute('data-crm-theme'),
      panelInsideTableWrap,
      panelOnScreen,
      panelRect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      viewport,
      background,
      backgroundAlpha,
      textColor: style.color,
      firstItemColor: firstStyle?.color || null,
      themeSamples,
      allThemesOpaque,
      firstItem: first ? (first.textContent || '').trim() : null,
      firstItemVisible,
      firstItemRect: firstRect ? { left: firstRect.left, top: firstRect.top, right: firstRect.right, bottom: firstRect.bottom, width: firstRect.width, height: firstRect.height } : null,
      opaqueBackground,
      checks
    };
  }, opened);
};

// Prove that the menu follows its source row's lifecycle, too: constrain the
// real table scrollport after the screenshot, scroll row 2 out of it, and make
// sure the body portal is dismissed rather than left floating over other rows.
const MENU_SCROLL_PROBE = async (page, requestedRow = 1) => {
  const prepared = await page.evaluate(rowIndex => {
    const rows = [...document.querySelectorAll('tbody tr')].filter(tr => tr.querySelector('td.crm-row-actions'));
    const actualIndex = Math.min(Math.max(0, rowIndex), Math.max(0, rows.length - 1));
    const row = rows[actualIndex];
    const wrap = row?.closest('.crm-table-wrap');
    const trigger = row?.querySelector('[data-row-menu]');
    const panel = document.querySelector('[data-row-menu-portal="1"]');
    if (!row || !wrap || !trigger || !panel) return { ready: false, rowIndex: actualIndex };

    const originalTriggerTop = trigger.getBoundingClientRect().top;
    const wrapRect = wrap.getBoundingClientRect();
    const rowTop = row.getBoundingClientRect().top - wrapRect.top + wrap.scrollTop;
    const probeHeight = Math.max(120, Math.min(700, Math.max(Math.floor(wrap.scrollHeight * 0.4), Math.ceil(rowTop + 24))));
    wrap.style.height = `${probeHeight}px`;
    wrap.style.maxHeight = `${probeHeight}px`;
    wrap.style.overflow = 'auto';
    const maxScroll = Math.max(0, wrap.scrollHeight - wrap.clientHeight);
    const smallScrollTop = Math.min(maxScroll, (wrap.scrollTop || 0) + Math.min(6, maxScroll));
    wrap.scrollTop = smallScrollTop;
    return { ready: true, rowIndex: actualIndex, originalTriggerTop, smallScrollTop, probeHeight };
  }, requestedRow);
  if (!prepared.ready) {
    return { ...prepared, repositionedOnScroll: false, rowOutsideScrollport: false, menuClosed: false };
  }

  // The row remains visible for this small scroll, so an open menu must follow
  // its trigger instead of either staying at stale coordinates or dismissing.
  await new Promise(resolve => setTimeout(resolve, 100));
  const reposition = await page.evaluate(prepared => {
    const rows = [...document.querySelectorAll('tbody tr')].filter(tr => tr.querySelector('td.crm-row-actions'));
    const row = rows[prepared.rowIndex];
    const trigger = row?.querySelector('[data-row-menu]');
    const panel = document.querySelector('[data-row-menu-portal="1"]');
    if (!row || !trigger || !panel) return { repositionedOnScroll: false, remainedOpenAfterSmallScroll: false };
    const triggerRect = trigger.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const edge = Math.min(8, window.innerWidth / 2);
    const expectedLeft = Math.max(edge, Math.min(triggerRect.right - panelRect.width, window.innerWidth - edge - panelRect.width));
    const maxTop = Math.max(0, window.innerHeight - edge - panelRect.height);
    const belowTop = Math.max(edge, Math.min(triggerRect.bottom + 6, maxTop));
    const aboveTop = Math.max(edge, Math.min(triggerRect.top - 6 - panelRect.height, maxTop));
    const horizontallyAnchored = Math.abs(panelRect.left - expectedLeft) <= 2;
    const verticallyAnchored = Math.abs(panelRect.top - belowTop) <= 2 || Math.abs(panelRect.top - aboveTop) <= 2;
    return {
      triggerMovedPx: Math.abs(triggerRect.top - prepared.originalTriggerTop),
      remainedOpenAfterSmallScroll: true,
      horizontallyAnchored,
      verticallyAnchored,
      repositionedOnScroll: horizontallyAnchored && verticallyAnchored
    };
  }, prepared);

  // Now scroll the source row completely out of the same scrollport. The menu
  // must close, leaving no detached panel behind.
  await page.evaluate(rowIndex => {
    const rows = [...document.querySelectorAll('tbody tr')].filter(tr => tr.querySelector('td.crm-row-actions'));
    const wrap = rows[rowIndex]?.closest('.crm-table-wrap');
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
  }, prepared.rowIndex);
  await page.waitForFunction(() => !document.querySelector('[data-row-menu-portal="1"]'), { timeout: 3000 }).catch(() => {});
  const dismissal = await page.evaluate(prepared => {
    const rows = [...document.querySelectorAll('tbody tr')].filter(tr => tr.querySelector('td.crm-row-actions'));
    const row = rows[prepared.rowIndex];
    const wrap = row?.closest('.crm-table-wrap');
    const trigger = row?.querySelector('[data-row-menu]');
    if (!row || !wrap || !trigger) return { rowOutsideScrollport: false, menuClosed: false };
    const rowRect = row.getBoundingClientRect();
    const portRect = wrap.getBoundingClientRect();
    const portTop = portRect.top + wrap.clientTop;
    const portBottom = portTop + wrap.clientHeight;
    const rowOutsideScrollport = rowRect.bottom <= portTop || rowRect.top >= portBottom;
    const menuClosed = !document.querySelector('[data-row-menu-portal="1"]')
      && trigger.getAttribute('aria-expanded') === 'false';
    return { rowOutsideScrollport, menuClosed, scrollTop: wrap.scrollTop };
  }, prepared);
  return { ...prepared, ...reposition, ...dismissal };
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
    console.error('puppeteer-core is not installed — run: npm i --no-save puppeteer-core @sparticuz/chromium');
    process.exit(1);
  }
  let executablePath = process.env.CHROME_PATH || '/tmp/vchrome/chrome';
  if (!process.env.CHROME_PATH) {
    const chromium = await import('@sparticuz/chromium').catch(() => null);
    if (chromium?.default) {
      executablePath = await chromium.default.executablePath();
      const libs = extractChromiumLibraries();
      process.env.LD_LIBRARY_PATH = [process.env.LD_LIBRARY_PATH, libs].filter(Boolean).join(':');
    }
  }

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
    const focusResult = withKeyboard ? await FOCUS_PROBE(page).catch(e => ({ error: e.message })) : { skipped: 'keyboard probe disabled' };
    const interaction = withKeyboard ? await INTERACTION_PROBE(page).catch(e => ({ error: e.message })) : { skipped: 'interaction probe disabled' };
    const menuVisual = await MENU_VISUAL_PROBE(page, 1).catch(e => ({
      opened: false,
      reason: e.message,
      checks: { detachedFromTable: false, withinViewport: false, visibleFirstItem: false, opaqueBackground: false, allThemesOpaque: false }
    }));
    report.viewports[vp.name] = { opened: clicked, ...measured, focus: focusResult, interaction, menuVisual };
    if (shots) {
      const file = join(outDir, `crm-actions-${label}-${vp.name}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 78 });
      report.viewports[vp.name].screenshot = file;
    }
    report.viewports[vp.name].scrollDismissal = await MENU_SCROLL_PROBE(page, 1).catch(e => ({
      rowOutsideScrollport: false,
      menuClosed: false,
      error: e.message
    }));
    await page.close();
  }
  await browser.close();
  const failures = [];
  for (const [viewport, result] of Object.entries(report.viewports)) {
    for (const [name, passed] of Object.entries(result.menuVisual?.checks || {})) {
      if (!passed) failures.push(`${viewport}: menu check failed — ${name}`);
    }
    for (const name of ['menuOpened', 'arrowMovedFocus', 'arrowUpReturned', 'homeToFirst', 'endToLast', 'menuClosedByEscape', 'focusReturned']) {
      if (!result.focus?.[name]) failures.push(`${viewport}: keyboard check failed — ${name}`);
    }
    if (!result.scrollDismissal?.repositionedOnScroll) failures.push(`${viewport}: scroll check failed — open menu did not remeasure against its trigger`);
    if (!result.scrollDismissal?.remainedOpenAfterSmallScroll) failures.push(`${viewport}: scroll check failed — menu closed while its row was still visible`);
    if (!(result.scrollDismissal?.triggerMovedPx > 0)) failures.push(`${viewport}: scroll check failed — test did not move the trigger`);
    if (!result.scrollDismissal?.rowOutsideScrollport) failures.push(`${viewport}: scroll check failed — row did not leave its scrollport`);
    if (!result.scrollDismissal?.menuClosed) failures.push(`${viewport}: scroll check failed — menu stayed open after its row left view`);
  }
  report.failures = failures;
  const json = join(outDir, `crm-actions-${label}.json`);
  writeFileSync(json, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) {
    console.error(`Menu visibility verification failed:\n- ${failures.join('\n- ')}`);
    process.exitCode = 1;
  }
  console.log('\nmeasurements written to ' + json);
}

main().catch(e => { console.error(e); process.exit(1); });
