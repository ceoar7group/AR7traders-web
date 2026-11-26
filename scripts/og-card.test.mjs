// The vehicle share card (npm run test:og-card).
//
// A shared /inventory/<ref> link is forwarded between buyers, so its preview is
// the most-seen image this business owns. This suite pins the contract of
// api/_og-card.js and the ?og= branch of api/site-content.js:
//   • the card is always 1200×630 JPEG, small enough for every messenger;
//   • it says only what the listing says (name, specs, price) — no price, no
//     pill; no photo, the brand backdrop;
//   • a card is produced for a real car, an unknown ref and a dead database —
//     a share preview must never be a broken image;
//   • every string from the record is XML-escaped before it reaches the SVG;
//   • the head publishes the same URL the endpoint serves.
//
// No network, no real database: the photo is a generated buffer and the lookup
// uses the same in-memory Supabase shape as scripts/sitemap-vehicles.test.mjs.
let pass = 0, fail = 0;
const say = s => process.stdout.write(s + '\n');
const bad = s => process.stderr.write(s + '\n');
const ok = (cond, msg) => { if (cond) { pass++; say('  ✓ ' + msg); } else { fail++; bad('  ✗ ' + msg); } };

const {
  CARD, CARD_META, cardPath, cardUrl, cardContent, machineryCardContent, buildCardSvg,
  wrapLines, hasGlyphInk, measureText, renderShareCard, stripCaptionBand, xmlEscape
} = await import('../api/_og-card.js');
const { SHARE_CARD, shareCardPath, shareCardUrl, machineCardPath, machineCardUrl } =
  await import('../src/share-card.js');
const { buildVehicleHeadHtml, ogCardImage, cardPriceLabel } = await import('../api/site-content.js');
const { buildMachineryHeadHtml, loadMachineForCard } = await import('../api/_crawler-render.js');
const { MACHINES } = await import('../src/machinery-data.js');
const sharp = (await import('sharp')).default;
const { readFileSync } = await import('node:fs');

// ---- helpers ---------------------------------------------------------------
function fakeRes() {
  return {
    statusCode: 0, headers: {}, body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(b) { this.body = b; }
  };
}

/** A real (if synthetic) JPEG so sharp's pipeline is exercised end to end. */
async function photoFixture(width = 900, height = 1200) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 120, g: 130, b: 140 } }
  }).composite([{
    input: Buffer.from(`<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#6b7785"/>` +
      `<circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 3}" fill="#d9dde2"/></svg>`),
    top: 0, left: 0
  }]).jpeg().toBuffer();
}

function memDb(rows, opts = {}) {
  const tables = {
    site_listings: rows.map(r => ({ ...r })),
    japan_dealer_stock: (opts.dealerRows || []).map(r => ({ ...r }))
  };
  return {
    from(name) {
      if (!(name in tables)) throw new Error(`unexpected table ${name}`);
      if (opts.error) {
        const failed = { data: null, error: { message: opts.error, code: 'XX000' } };
        const chain = { select: () => chain, eq: () => chain, limit: () => chain, then: r => r(failed) };
        return chain;
      }
      const table = tables[name];
      let filter = () => true;
      const chain = {
        select: () => chain,
        eq: (col, value) => { filter = row => String(row[col]) === String(value); return chain; },
        limit: () => chain,
        then: resolve => resolve({ data: table.filter(filter), error: null })
      };
      return chain;
    }
  };
}

/** A Supabase-shaped client holding machinery rows — readMachineryRows only
 *  needs from().select().order()[.eq()] to resolve. */
function machDb(rows, { error = null } = {}) {
  return {
    from() {
      const chain = {
        select: () => chain, order: () => chain, eq: () => chain,
        then: resolve => resolve(error ? { data: null, error } : { data: rows, error: null })
      };
      return chain;
    }
  };
}

const CAR = {
  id: 7, stock_no: 'AR7-0007', make: 'Toyota', model: 'Vezel "Z"', year: 2019,
  km: '42,000', fuel: 'Hybrid', tr: 'AT', grade: '4.5', price: 12500,
  image: '/assets/inventory/700052000730260404001.webp', status: 'In Stock', published: true
};

say('-- the card has one fixed, messenger-safe shape --');
{
  ok(CARD.width === 1200 && CARD.height === 630,
    `the card is 1200×630 (${CARD.width}×${CARD.height}) — the size every messenger crops predictably`);
  ok(CARD_META.type === 'image/jpeg' && /s-maxage=\d+/.test(CARD_META.cache),
    'it is served as JPEG and cached at the edge for a day');
  ok(SHARE_CARD.width === CARD.width && SHARE_CARD.height === CARD.height &&
    shareCardPath('AR7-0007') === cardPath('AR7-0007'),
    'the browser-safe module and the renderer agree on URL and size');
  ok(cardUrl('https://ar7traders.com', 'AR7-0007') === 'https://ar7traders.com/api/og/AR7-0007',
    'the absolute URL is /api/og/<ref>');
  ok(cardPath('AR7 001/../x') === '/api/og/AR7%20001%2F..%2Fx',
    'a ref is URL-encoded, so a hostile ref cannot climb out of the path');
  ok(shareCardUrl('https://ar7traders.com', 'GN-700912345').endsWith('/api/og/GN-700912345'),
    'imported dealer refs use the same endpoint');
  ok(machineCardPath('AR7-MC-001') === '/api/og/m/AR7-MC-001' &&
    machineCardUrl('https://ar7traders.com', 'AR7-MC-001') === 'https://ar7traders.com/api/og/m/AR7-MC-001',
    'machinery uses its own segment, so the two catalogues cannot resolve each other\'s refs');
  ok(machineCardPath('A B') === '/api/og/m/A%20B', 'and a machinery ref is URL-encoded too');
}

say('\n-- the card says only what the listing says --');
{
  const content = cardContent({ ...CAR, priceLabel: '$12,500' }, 'AR7-0007');
  ok(content.name === '2019 Toyota Vezel "Z"', `the name is year + make + model (${content.name})`);
  ok(content.specs === '2019 · 42,000 km · Hybrid · AT · Grade 4.5',
    `the spec line reuses the record only (${content.specs})`);
  ok(content.price === '$12,500' && content.ref === 'STOCK AR7-0007' &&
    content.kicker === 'AR7 TRADERS · JAPAN EXPORT' && content.host === 'ar7traders.com',
    'price, stock reference, kicker and host are all set');

  const noPrice = cardContent({ make: 'Nissan', model: 'Note', year: 2017, km: 31000 }, 'AR7-9');
  ok(noPrice.price === '' && !buildCardSvg(noPrice).includes('FOB'),
    'a listing with no price gets no price pill — never a made-up number');
  ok(noPrice.specs === '2017 · 31,000 km', `a numeric mileage is formatted, not invented (${noPrice.specs})`);
  ok(!/undefined|null|NaN/.test(buildCardSvg(noPrice)), 'missing fields never render as undefined/null/NaN');

  const empty = cardContent(null, '');
  ok(empty.name === 'Cars and machinery for export' && !empty.price && !empty.ref &&
    empty.kicker === 'AR7 TRADERS · JAPAN & CHINA EXPORT',
    'the generic card describes the business, not a car');
  ok(cardContent({ price: 'Ask us' }, 'X').price === '',
    'prose is not turned into a price');
}

say('\n-- machinery says "indicative", because that is what the page says --');
{
  const machine = MACHINES.find(m => m.ref === 'AR7-MC-001') || MACHINES[0];
  const content = machineryCardContent(machine, machine.ref);
  ok(content.name === machine.name, `the card is named after the machine (${content.name})`);
  ok(content.kicker === 'AR7 TRADERS · CHINA MACHINERY', 'and says China, not Japan');
  ok(content.ref === `REF ${machine.ref}`, 'the machine reference is on the card, labelled REF');
  ok(/\d{4}/.test(content.specs) && /h$|km$/.test(content.specs.split(' · ')[1] || ''),
    `the spec line carries year and usage hours (${content.specs})`);
  const priceUsd = Number(String(content.price).replace(/[^0-9]/g, ''));
  ok(priceUsd > 0 && String(content.price).startsWith('US$'),
    `the price is the machine's own indicative figure (${content.price})`);
  ok(content.priceTag === 'INDICATIVE FOB',
    'and the pill is tagged INDICATIVE FOB — a share card must not upgrade it to a firm quote');
  const svg = buildCardSvg(content, { priceWidth: 180 });
  ok(svg.includes('INDICATIVE FOB') && svg.includes('CHINA MACHINERY'),
    'both labels reach the rendered SVG');
  const noPrice = machineryCardContent({ ...machine, price: 0, supplierPrice: 0 }, machine.ref);
  ok(noPrice.price === '' && !buildCardSvg(noPrice).includes('INDICATIVE FOB'),
    'a machine with no price carries no pill at all');
  const unnamed = machineryCardContent(null, '');
  ok(unnamed.name === 'Machinery and equipment for export' && !unnamed.ref,
    'the generic machinery card describes the desk, not a machine');
}

say('\n-- the machinery template\'s own caption band is dropped, once --');
{
  // Our machinery photos ship as a 900×491 template with a green caption band
  // along the bottom. Left in place the card prints that caption twice.
  const tpl = await sharp({
    create: { width: 900, height: 491, channels: 3, background: { r: 200, g: 200, b: 200 } }
  }).composite([{
    input: Buffer.from('<svg width="900" height="491"><rect y="439" width="900" height="52" fill="#0b4a33"/></svg>'),
    top: 0, left: 0
  }]).png().toBuffer();
  const stripped = await stripCaptionBand(tpl);
  const strippedMeta = await sharp(stripped).metadata();
  ok(strippedMeta.width === 900 && strippedMeta.height === 439,
    `the template's caption band is cropped off (491 → ${strippedMeta.height}px)`);
  ok(strippedMeta.height / strippedMeta.width === 439 / 900,
    'and the crop keeps the template\'s own aspect, so the machine is not distorted');

  const other = await photoFixture(1000, 700);
  const untouched = await sharp(await stripCaptionBand(await sharp(other).png().toBuffer())).metadata();
  ok(untouched.width === 1000 && untouched.height === 700,
    'a photo that is not the template passes through completely untouched');

  const broken = Buffer.from('not an image');
  ok(Buffer.compare(await stripCaptionBand(broken), broken) === 0,
    'unreadable bytes are returned as they came, never thrown');

  const content = machineryCardContent(MACHINES[0], MACHINES[0].ref);
  const rendered = await renderShareCard(content, { photoBuffer: tpl, cropCaptionBand: true });
  ok((await sharp(rendered).metadata()).height === 630,
    'the finished machinery card is still exactly 630 px tall');
  const plain = await renderShareCard(content, { photoBuffer: tpl });
  ok(Buffer.compare(rendered, plain) !== 0,
    'the crop is applied only when the caller asks for it');
}

say('\n-- a long price tag sizes its own pill --');
{
  const content = { ...machineryCardContent(MACHINES[0], MACHINES[0].ref) };
  const pillWidth = svg => Number((svg.match(/<rect x="56" y="\d+" width="(\d+)" height="62"/) || [])[1]);
  const narrow = pillWidth(buildCardSvg({ ...content, price: 'US$1' }, { priceWidth: 20, tagWidth: 40 }));
  const wide = pillWidth(buildCardSvg({ ...content, price: 'US$1' }, { priceWidth: 20, tagWidth: 200 }));
  ok(Number.isFinite(narrow) && Number.isFinite(wide) && wide > narrow,
    'the pill grows with the measured tag, so "INDICATIVE FOB" stays inside it');
  ok(pillWidth(buildCardSvg(content, { priceWidth: 180 })) > 200,
    'and an unmeasured tag still gets a workable fallback width');
}

say('\n-- wrapping and escaping keep the copy inside the card --');
{
  const long = wrapLines('2021 Mercedes-Benz G-Class G 63 AMG Night Package Edition 1',
    { maxWidth: 780, fontSize: 50, factor: 0.6, maxLines: 2 });
  ok(long.length === 2 && long.join(' ').endsWith('…'),
    `a long name is fitted to two lines and its truncation is marked (${long.join(' / ')})`);
  ok(long.every(l => l.length * 50 * 0.6 <= 780 + 40), 'and no fitted line overruns the text column');
  const short = wrapLines('2019 Toyota Vezel', { maxWidth: 780, fontSize: 50, factor: 0.6, maxLines: 2 });
  ok(short.length === 1 && !short[0].includes('…'), 'a short name stays on one line, untruncated');
  ok(wrapLines('', {}).length === 0, 'empty text wraps to nothing');

  ok(xmlEscape('<script>&"\'').includes('&lt;script&gt;') &&
    !xmlEscape('<script>&"\'').includes('<script'),
    'record text is XML-escaped before it can reach the SVG');
  const hostile = buildCardSvg(cardContent({
    make: '<script>alert(1)</script>', model: 'x&y', year: '2020', priceLabel: '<b>$1</b>'
  }, 'R<EF>'));
  ok(!hostile.includes('<script>alert') && !hostile.includes('</svg></svg>'),
    'a hostile record cannot inject markup into the card');
  ok(hostile.includes('&lt;script&gt;') || hostile.includes('&amp;'),
    'and the escaped text still shows what the record says');
}

say('\n-- the renderer always produces a real image --');
{
  const photo = await photoFixture();
  const content = cardContent({ ...CAR, priceLabel: '$12,500' }, 'AR7-0007');

  const withPhoto = await renderShareCard(content, { photoBuffer: photo });
  const meta = await sharp(withPhoto).metadata();
  ok(meta.format === 'jpeg' && meta.width === 1200 && meta.height === 630,
    `a card with a photo is a 1200×630 JPEG (${meta.width}×${meta.height})`);
  ok(withPhoto.length < 400 * 1024, `and stays small enough for WhatsApp (${Math.round(withPhoto.length / 1024)} kB)`);

  const brandOnly = await renderShareCard(cardContent(null, ''), {});
  const brandMeta = await sharp(brandOnly).metadata();
  ok(brandMeta.width === 1200 && brandMeta.height === 630 && brandOnly.length > 5000,
    'with no photo at all the brand card is still a real image');

  const broken = await renderShareCard(content, { photo: 'https://example.invalid/x.jpg' });
  ok((await sharp(broken).metadata()).width === 1200,
    'an unreachable photo degrades to the brand card instead of throwing');

  ok(await hasGlyphInk(buildCardSvg(content)), 'the runtime in CI can draw the card text');
  ok(!(await hasGlyphInk('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')),
    'and the ink guard recognises a render with no glyphs');
  ok((await measureText('$202,810', 34)) > (await measureText('$1', 34)),
    'text widths are measured from real glyphs, so the price pill can size itself');
  ok((await measureText('', 34)) === 0, 'measuring empty text is safe');
  ok(cardContent(CAR, 'AR7-0007').price === '',
    'a row whose price label has not been resolved draws no pill');
  ok(cardPriceLabel({ price: 12500 }) === 'US$12,500', 'a numeric price becomes a labelled US$ figure');
  ok(cardPriceLabel({ price: '$5,400' }) === '$5,400', 'a published string is shown as written');
  ok(cardPriceLabel({ price: '¥540,000' }) === '¥540,000', 'a non-USD price keeps its own currency');
  ok(cardPriceLabel({ price: 'Contact us 24 hours' }) === '' &&
    cardPriceLabel({ price: '10,000–15,000' }) === '' && cardPriceLabel({}) === '',
    'prose and ranges never become a price on the card');
}

say('\n-- the endpoint never fails a crawler --');
{
  const photo = await photoFixture(800, 600);
  const fetchOk = async () => ({
    ok: true, headers: { get: () => String(photo.length) },
    arrayBuffer: async () => photo.buffer.slice(photo.byteOffset, photo.byteOffset + photo.byteLength)
  });
  const run = async (query, { db, method = 'GET', fetch: fetchImpl = fetchOk } = {}) => {
    const res = fakeRes();
    const realError = console.error;
    console.error = () => {};
    try { await ogCardImage({ method, query }, res, { db, fetch: fetchImpl }); }
    finally { console.error = realError; }
    return res;
  };

  const live = await run({ og: 'AR7-0007' }, { db: memDb([CAR]) });
  ok(live.statusCode === 200 && live.headers['content-type'] === 'image/jpeg',
    'a published car answers 200 image/jpeg');
  ok(Buffer.isBuffer(live.body) && live.body[0] === 0xff && live.body[1] === 0xd8,
    'the body is a real JPEG (SOI marker), not an error page');
  ok(/s-maxage/.test(live.headers['cache-control'] || '') && live.headers['content-length'],
    'it is edge-cached and declares its length');
  ok((await sharp(live.body).metadata()).width === 1200, 'served at the declared 1200 px width');

  const unknown = await run({ og: 'NOPE-404' }, { db: memDb([CAR]) });
  ok(unknown.statusCode === 200 && Buffer.isBuffer(unknown.body),
    'an unknown ref still answers 200 with the generic card');
  ok(Buffer.compare(unknown.body, live.body) !== 0,
    'and it is not another car\'s card — no other listing leaks into it');

  const down = await run({ og: 'AR7-0007' }, { db: memDb([CAR], { error: 'boom' }) });
  ok(down.statusCode === 200 && Buffer.isBuffer(down.body),
    'a database outage still yields a card (a share preview is not an error page)');

  const noPhoto = await run({ og: 'AR7-0007' }, { db: memDb([CAR]), fetch: async () => { throw new Error('offline'); } });
  ok(noPhoto.statusCode === 200 && (await sharp(noPhoto.body).metadata()).height === 630,
    'an unreachable listing photo still yields the brand card');

  const sold = await run({ og: 'AR7-SOLD' }, { db: memDb([{ ...CAR, stock_no: 'AR7-SOLD', status: 'Sold' }]) });
  const soldPixels = await sharp(sold.body).raw().toBuffer();
  ok(sold.statusCode === 200 && soldPixels.length > 0, 'a sold car still shares a card');
  const draft = await run({ og: 'AR7-DRAFT' }, { db: memDb([{ ...CAR, stock_no: 'AR7-DRAFT', published: false }]) });
  ok(draft.statusCode === 200, 'a draft still shares a card');

  const post = await run({ og: 'AR7-0007' }, { db: memDb([CAR]), method: 'POST' });
  ok(post.statusCode === 405 && post.headers.allow === 'GET', 'POST is refused');
}

say('\n-- machinery heads and the /api/og/m endpoint agree --');
{
  const machine = MACHINES.find(m => m.ref === 'AR7-MC-001') || MACHINES[0];
  const head = buildMachineryHeadHtml(machine, { ref: machine.ref, type: machine.type });
  ok(head.includes(`content="https://ar7traders.com/api/og/m/${machine.ref}"`),
    'machinery og:image is the machine card');
  ok(head.includes('<meta property="og:image:width" content="1200"/>') &&
    head.includes('<meta property="og:image:height" content="630"/>') &&
    head.includes('<meta property="og:image:type" content="image/jpeg"/>'),
    'the machinery card declares its size and encoding');
  ok(/<meta property="product:price:amount" content="\d+"/.test(head),
    'and the indicative price is machine-readable');
  const full = buildMachineryHeadHtml(machine, { ref: machine.ref, type: machine.type, full: true });
  ok(/<img src="https:\/\/ar7traders\.com\/assets\/machinery\//.test(full),
    'while the body still shows the real machine photo (content parity)');
  const missing = buildMachineryHeadHtml(null, { ref: 'NOPE', type: 'Excavators' });
  ok(!missing.includes('/api/og/m/'),
    'an unknown machine ref publishes no card URL');

  const photo = await photoFixture(1000, 700);
  const fetchOk = async () => ({
    ok: true, headers: { get: () => String(photo.length) },
    arrayBuffer: async () => photo.buffer.slice(photo.byteOffset, photo.byteOffset + photo.byteLength)
  });
  const run = async (query, opts = {}) => {
    const res = fakeRes();
    const realError = console.error;
    console.error = () => {};
    try { await ogCardImage({ method: 'GET', query }, res, { fetch: fetchOk, ...opts }); }
    finally { console.error = realError; }
    return res;
  };
  // The lookup itself: a database row is mapped the same way the page maps it.
  const MACH_ROW = {
    id: 1, ref: machine.ref, brand: 'Doosan', model: 'DX300LC-9C', type: 'Excavators',
    year: 2019, hours: 6800, price: 62500, published: true,
    images: [{ src: '/assets/machinery/doosan-dx300lc-1.webp', basis: 'own' }]
  };
  const found = await loadMachineForCard(machine.ref, 'Excavators', { db: machDb([MACH_ROW]) });
  ok(found && found.name === 'Doosan DX300LC-9C' && found.ref === machine.ref,
    'the card lookup maps a database row exactly like the page does');
  ok((await loadMachineForCard('NOPE-404', '', { db: machDb([MACH_ROW]) })) === null,
    'an unknown machine ref resolves to nothing');
  ok((await loadMachineForCard(machine.ref, 'Loaders', { db: machDb([MACH_ROW]) })) === null,
    'a ref opened under the wrong category resolves to nothing (no misleading card)');
  const thin = await loadMachineForCard(machine.ref, 'Excavators', {
    db: machDb([{ id: 1, ref: machine.ref, type: 'Excavators', published: true }])
  });
  ok(thin && thin.name, 'a thin catalogue row borrows the bundled record so the card can still name the machine');

  const card = await run({ og: machine.ref, ogkind: 'machinery' }, { db: machDb([MACH_ROW]) });
  const meta = Buffer.isBuffer(card.body) ? await sharp(card.body).metadata() : {};
  ok(card.statusCode === 200 && card.headers['content-type'] === 'image/jpeg' &&
    meta.width === 1200 && meta.height === 630,
    'the machinery card endpoint answers with a 1200×630 JPEG');
  const unknown = await run({ og: 'NOPE-404', ogkind: 'machinery' }, { db: machDb([MACH_ROW]) });
  ok(unknown.statusCode === 200 && Buffer.isBuffer(unknown.body) &&
    Buffer.compare(unknown.body, card.body) !== 0,
    'an unknown machine ref still gets the generic card, not another machine\'s');
  const down = await run({ og: machine.ref, ogkind: 'machinery' }, { db: machDb([], { error: { message: 'boom' } }) });
  ok(down.statusCode === 200 && Buffer.isBuffer(down.body),
    'a machinery database outage still yields a card');
  const vehicleKind = await run({ og: 'NOPE-404' });
  ok(vehicleKind.statusCode === 200 && Buffer.isBuffer(vehicleKind.body),
    'and the vehicle branch is unaffected by the machinery one');
}

say('\n-- the head points at the endpoint the endpoint serves --');
{
  const html = buildVehicleHeadHtml({ ...CAR }, 'AR7-0007');
  ok(html.includes('<meta property="og:image" content="https://ar7traders.com/api/og/AR7-0007"/>'),
    'og:image is the card for this ref');
  ok(html.includes('<meta name="twitter:image" content="https://ar7traders.com/api/og/AR7-0007"/>'),
    'twitter:image matches it');
  ok(html.includes('<meta property="og:image:width" content="1200"/>') &&
    html.includes('<meta property="og:image:height" content="630"/>'),
    'and declares the real size');
  ok(html.includes('<meta property="product:price:amount" content="12500"/>'),
    'the price rides along in machine-readable form');
  const generic = buildVehicleHeadHtml(null, 'NOPE-404');
  ok(!generic.includes('/api/og/') && generic.includes('used-japanese-cars-auction-export-toyota-3'),
    'an unknown ref keeps the plain fallback photo — no card is invented for a car that is not there');
  ok(!generic.includes('product:price'), 'and states no price at all');

  // The rewrite that makes /api/og/<ref> work, and proof it shadows nothing.
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const rule = (config.rewrites || []).find(r => r.source === '/api/og/:ref');
  ok(rule && rule.destination === '/api/site-content?og=:ref',
    '/api/og/:ref rewrites to the existing site-content function (no new Vercel Function)');
  const machRule = (config.rewrites || []).find(r => r.source === '/api/og/m/:ref');
  ok(machRule && machRule.destination === '/api/site-content?og=:ref&ogkind=machinery',
    '/api/og/m/:ref does the same for machinery');
  ok((config.rewrites || []).indexOf(machRule) < (config.rewrites || []).indexOf(rule),
    'the machinery rule sits first, so /api/og/m/<ref> is never read as a vehicle ref');
  const index = (config.rewrites || []).indexOf(rule);
  const earlier = (config.rewrites || []).slice(0, index)
    .filter(r => !r.has && new RegExp(`^${r.source}$`).test('/api/og/AR7-0007'));
  ok(earlier.length === 0, 'no earlier rewrite swallows the card URL');
  const spa = (config.rewrites || []).find(r => r.destination === '/index.html');
  ok(!new RegExp(`^${spa.source}$`).test('/api/og/AR7-0007'),
    'and the SPA catch-all never serves it as a page');
}

say(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
