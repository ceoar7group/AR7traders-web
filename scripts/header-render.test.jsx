// Render smoke test for the site header (src/site-header.jsx).
// The header is the part of the site that broke silently before: nav link
// styles targeted `button` while the links were `<a>`s, "Calculators" crowded
// the row, and the More panel's two-column shape depended on an even item
// count. These assertions pin all three down. Run:
//   npm run test:header
import React from 'react';
import { renderToString } from 'react-dom/server';
import { SiteHeader, MORE_LINKS, NavDropdown, logoOnError } from '../src/site-header.jsx';
import { CurrencyProvider } from '../src/currency.jsx';

const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k)
};
globalThis.fetch = () => Promise.resolve({ ok: false, json: async () => ({}) });

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error('FAIL:', msg); } else console.log('ok  :', msg); };

const brands = [
  { name: 'Toyota', count: 18, models: ['Harrier'] },
  { name: 'Mercedes-Benz', count: 2, models: ['AMG GT'] },
  { name: 'Honda', count: 3, models: ['N-BOX'] }
];

const render = (props = {}) => renderToString(
  <CurrencyProvider>
    <SiteHeader page="inventory" navigate={() => {}} brands={brands}
      vehicleCount={23} logoFor={m => '/assets/logos/' + m.toLowerCase() + '.png'} {...props}/>
  </CurrencyProvider>
);

const html = render();

// ---- the primary row -------------------------------------------------------
ok(html.includes('>Inventory</a>'), 'Inventory is in the primary nav');
ok(html.includes('>Japan dealer stock</a>'), 'Japan dealer stock is in the primary nav');
ok(html.includes('href="/japan-stock"'), 'Japan dealer stock is a real link (new-tab safe)');
ok(html.includes('>Auction access</a>'), 'Auction access is in the primary nav');
ok(html.includes(' Contact</a>'), 'Contact is in the primary nav');
ok(!/>Calculators</.test(html.split('nav-drop-panel more-panel')[0]), 'Calculators is no longer a top-level nav link');

// ---- Brands dropdown ------------------------------------------------------
ok(html.includes('nav-brands'), 'the Brands dropdown renders');
ok(html.includes('Brands in inventory'), 'the Brands panel says what it lists');
ok(html.includes('href="/inventory?make=Toyota"'), 'brand links carry ?make= so they are shareable');
ok(html.includes('href="/inventory?make=Mercedes-Benz"'), 'hyphenated brands survive into the href');
ok(/3<!-- --> makes · <!-- -->23<!-- --> vehicles live/.test(html), 'the Brands panel reports makes and live vehicle count');
ok(html.includes('src="/assets/logos/mercedes-benz.png"'), 'brand logos come from the brand name');
ok(html.includes('href="/brands"'), 'the Brands panel links to the full brands page');

// ---- More dropdown keeps its shape ---------------------------------------
// Everything between the More panel opening and the next top-level link.
const morePanel = (html.split('nav-drop-panel more-panel')[1] || '').split('auction-link')[0];
const moreItems = (morePanel.match(/<i>/g) || []).length;
ok(MORE_LINKS.length % 2 === 0, `the More menu has an even item count (${MORE_LINKS.length}) so the 2-column grid stays even`);
ok(moreItems === MORE_LINKS.length, `the More panel rendered ${MORE_LINKS.length} links`);
ok(morePanel.includes('>Calculators</span>'), 'Calculators is in the More dropdown');
ok(morePanel.includes('href="/tools"'), 'the Calculators entry points at /tools');
ok(morePanel.includes('>Japan dealer stock</span>'), 'Japan dealer stock is in the More dropdown too');
ok(morePanel.includes('>Client portal</span>'), 'the client portal is reachable from More');
ok(new Set(MORE_LINKS.map(x => x[2])).size === MORE_LINKS.length, 'no duplicate entries in the More menu');

// ---- both dropdowns share one component ----------------------------------
const dropCount = (html.match(/class="nav-drop /g) || []).length;
ok(dropCount === 2, 'exactly two dropdowns (Brands + More) render');
ok(html.includes('aria-expanded="false"'), 'dropdown buttons expose aria-expanded');
ok(renderToString(<NavDropdown label="X" panel="p">child</NavDropdown>).includes('nav-drop-panel p'), 'NavDropdown accepts plain children too');

// ---- active-page highlight ----------------------------------------------
ok(render({ page: 'japan-stock' }).includes('class=" current" href="/japan-stock"'), 'the Japan dealer stock link marks the current page');
ok(render({ page: 'inventory', makeFilter: 'Toyota' }).includes('class=" current" href="/inventory?make=Toyota"'), 'the filtered brand is marked current');
ok(!render({ page: 'inventory', vehicleId: '43' }).includes('class=" current" href="/inventory"'), 'a vehicle deep link does not highlight the inventory tab');
ok(render({ menu: true }).includes('navlinks open'), 'the mobile menu state reaches the nav');

// ---- a make with no logo file degrades instead of breaking ---------------
{
  const el = { dataset: {}, src: '/assets/logos/isuzu.png', alt: 'Isuzu logo' };
  logoOnError({ currentTarget: el });
  ok(el.src === '/assets/ar7-mark.png', 'a missing brand logo falls back to the AR7 mark');
  ok(el.dataset.logoFb === '1', 'the fallback is flagged so it cannot loop');
  const again = { dataset: { logoFb: '1' }, src: '/assets/logos/isuzu.png', alt: '' };
  logoOnError({ currentTarget: again });
  ok(again.src === '/assets/logos/isuzu.png', 'a second error does not overwrite the fallback');
  logoOnError({ currentTarget: null });
  ok(true, 'logoOnError survives a null target');
}

console.log(failed ? `\n${failed} FAILURES` : '\nALL PASS');
process.exit(failed ? 1 : 0);
