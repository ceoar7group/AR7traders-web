// Site translations.
//
// The markets that import machinery and cars from China and Japan through AR7
// are the reason this exists: a buyer in Dubai, Algiers, Moscow, Berlin,
// Peshawar or Kabul should be able to read the enquiry page in their own
// language before they message us.
//
// HOW IT WORKS
// ------------
// `t('key')` looks the key up in the active dictionary and falls back to
// English. Nothing is machine-translated at runtime — a wrong price or a wrong
// shipping term in a language the owner cannot check is worse than English.
//
// Keys are grouped by screen. Add a key here, add it to the dictionaries that
// matter, and the English text is the guarantee that no screen goes blank.
//
// RTL: `dir` in the language table drives `document.documentElement.dir`, and
// src/i18n.css flips the layout for Arabic, Pashto and Urdu.

export const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English', dir: 'ltr' },
  { code: 'ar', label: 'Arabic', native: 'العربية', dir: 'rtl' },
  { code: 'ps', label: 'Pashto', native: 'پښتو', dir: 'rtl' },
  { code: 'ur', label: 'Urdu', native: 'اردو', dir: 'rtl' },
  { code: 'fa', label: 'Persian / Dari', native: 'فارسی', dir: 'rtl' },
  { code: 'fr', label: 'French', native: 'Français', dir: 'ltr' },
  { code: 'de', label: 'German', native: 'Deutsch', dir: 'ltr' },
  { code: 'ru', label: 'Russian', native: 'Русский', dir: 'ltr' },
  { code: 'es', label: 'Spanish', native: 'Español', dir: 'ltr' },
  { code: 'pt', label: 'Portuguese', native: 'Português', dir: 'ltr' },
  { code: 'tr', label: 'Turkish', native: 'Türkçe', dir: 'ltr' },
  { code: 'zh', label: 'Chinese', native: '中文', dir: 'ltr' },
  { code: 'sw', label: 'Swahili', native: 'Kiswahili', dir: 'ltr' },
  { code: 'ha', label: 'Hausa', native: 'Hausa', dir: 'ltr' }
];

export const DEFAULT_LANG = 'en';
export const LANG_KEY = 'ar7-lang';

export const langMeta = code => LANGUAGES.find(l => l.code === code) || LANGUAGES[0];
export const isRtl = code => langMeta(code).dir === 'rtl';

// ---------------------------------------------------------------------------
// English is the source of truth: every key lives here.
// ---------------------------------------------------------------------------
const en = {
  'nav.machinery': 'Machinery',
  'nav.inventory': 'Inventory',
  'nav.contact': 'Contact',
  'nav.language': 'Language',

  'machinery.kicker': 'CHINA MACHINERY DESK',
  'machinery.h1': 'Machines sourced from China, quoted to your port.',
  'machinery.intro': 'Excavators, wheel loaders, tippers and cranes sourced to order from vetted Chinese suppliers — inspected, photographed and shipped to your port with the paperwork handled.',
  'machinery.quote': 'Request a quotation',
  'machinery.call': 'Call the desk',
  'machinery.whatsapp': 'WhatsApp',
  'machinery.all': 'All machines',
  'machinery.photos': 'photos',
  'machinery.indicative': 'INDICATIVE FOB',
  'machinery.ref': 'REF',
  'machinery.location': 'Location',
  'machinery.year': 'Model year',
  'machinery.usage': 'Usage',
  'machinery.specs': 'Specifications',
  'machinery.requestQuote': 'Request a quotation',
  'machinery.askWhatsapp': 'Ask on WhatsApp',
  'machinery.detailNote': 'Photos show the unit offered. A cold-start video, hour-meter close-up and full walkaround are sent before any payment, and the quotation confirms the final price and freight to your port.',
  'machinery.note': 'Sourced to order from vetted Chinese suppliers. Prices are indicative FOB and confirmed by written quotation, with inspection and loading photos before shipment.',
  'machinery.cantSee': "Can't see the machine you need?",
  'machinery.tellUs': "Tell us the model — we'll find the unit.",
  'machinery.tellUsBody': 'Send the make, model and year you are looking for. We check our Chinese supplier network, confirm availability and send a quotation with photos and shipping cost to your port.',
  'machinery.process': 'How machinery reaches you',
  'machinery.step1': 'Enquiry & quotation',
  'machinery.step1Body': 'You send the model and destination; we reply with the unit, price and freight options.',
  'machinery.step2': 'Inspection & video',
  'machinery.step2Body': 'We visit the machine, verify hours and take photos and video before any payment.',
  'machinery.step3': 'Loading & documents',
  'machinery.step3Body': 'Flat-rack, container or breakbulk loading with export documents and loading photos.',
  'machinery.step4': 'Arrival & support',
  'machinery.step4Body': 'We share arrival documents and help with spare parts and manuals after delivery.',

  'type.excavators': 'Excavators',
  'type.loaders': 'Wheel loaders',
  'type.trucks': 'Tipper trucks',
  'type.cranes': 'Cranes',

  'common.close': 'Close',
  'common.email': 'Email',
  'common.phone': 'Phone / WhatsApp',
  'common.shippingTo': 'Shipping to',
  'common.port': 'your port',

  // ---- Home hero -----------------------------------------------------------
  // The first six screens a buyer meets are translated as a set, because
  // together they are the whole first impression: what we sell, how to search
  // it, how to ask, how to reach us, the footer that stays on every page, and
  // the machinery desk's "tell us the machine" fallback.
  'hero.eyebrow': 'Japan auctions · China cars & machinery',
  'hero.h1a': 'RHD & LHD cars from Japan & China,', // 2026-11-09 owner: headline must carry both drive sides
  'hero.h1b': 'machinery for every market.',
  'hero.lead': "Right-hand-drive and left-hand-drive cars exported from both Japan and China, plus heavy machinery and equipment from vetted factories — inspected, priced to your port, and delivered", // 2026-11-09 owner: we export RHD AND LHD from BOTH countries
  'hero.leadEm': 'anywhere in the world',
  'hero.explore': 'Explore vehicles',
  'hero.browseMachinery': 'Browse machinery',
  'hero.howBidding': 'See how bidding works',
  'hero.scrollCue': 'SCROLL TO DISCOVER',
  'hero.searchPlaceholder': 'Search our stock — Alphard, Prado, Jimny…',
  'hero.searchBtn': 'Search',

  // ---- Inventory toolbar ---------------------------------------------------
  'inv.kicker': 'LIVE JAPAN STOCK',
  'inv.kickerLanding': 'JAPAN AUCTION & DEALER STOCK',
  'inv.h1a': 'Find your next',
  'inv.h1b': 'vehicle.',
  'inv.h1Landing': 'for export.',
  'inv.searchPlaceholder': 'Search make, model or stock no.',
  // Rendered right after a bold <b>{list.length}</b>, so the sentence starts
  // with "of / von / de …" rather than repeating the number it follows.
  'inv.matchCount': 'of {total} vehicles match',
  'inv.landingNote': 'sourced through Japanese auctions and dealer listings — price in USD, shipping quoted to your port.',
  'inv.stockNote': 'verified vehicles · real dealer stock in Japan, updated daily.',
  'inv.clearAll': 'Clear all filters',
  'inv.resultsNote': '{showroom} showroom · {japan} Japan stock · prices FOB Japan · shipping quoted to your port',
  'inv.vehicles': 'vehicles',
  'inv.vehicle': 'vehicle',
  'inv.noMatches': 'No matches',
  'inv.noMatchesBody': 'Try clearing the filters or ask our team to source it.',
  'inv.requestSearch': 'Request a search',
  'inv.compareClear': 'clear',
  'inv.allInventory': 'All inventory',

  // ---- Enquiry form --------------------------------------------------------
  // The auction-access modal is the only place a buyer hands over their name
  // and email, so it is translated in full — including the privacy line.
  'enq.kicker': 'JOIN THE AUCTION',
  'enq.h2': 'Get free auction access.',
  'enq.body': "Tell us where you are and what you're looking for.",
  'enq.yourName': 'YOUR NAME',
  'enq.namePlaceholder': 'Full name',
  'enq.email': 'EMAIL',
  'enq.destination': 'DESTINATION',
  'enq.vehicle': "VEHICLE YOU'RE LOOKING FOR",
  'enq.vehiclePlaceholder': 'e.g. Toyota Land Cruiser, 2022+',
  'enq.submit': 'Request access',
  'enq.sending': 'Sending…',
  'enq.privacy': 'Your details stay private. No spam, ever.',
  'enq.successTitle': 'Request received.',
  'enq.successBody': 'Our auction specialist will contact you with your access details.',
  'enq.backToSite': 'Back to site',

  // ---- Contact block -------------------------------------------------------
  'contact.getInTouch': 'GET IN TOUCH',
  'contact.whatsapp': 'WhatsApp',
  'contact.hours': 'Mon–Sat',
  'contact.hoursValue': '09:00–19:00 JST · live chat on WhatsApp',

  // ---- Footer ---------------------------------------------------------------
  'footer.newsKicker': 'STOCK ALERTS · NO SPAM',
  'footer.newsH2a': 'Fresh Japan stock,',
  'footer.newsH2b': 'before it hits the market.',
  'footer.newsBody': "Get new arrivals, price drops and auction highlights in your inbox — matched to what you're looking for.",
  'footer.newsPlaceholder': 'you@email.com',
  'footer.subscribe': 'Subscribe',
  'footer.tagline': 'Reliable vehicles. Transparent process. Worldwide delivery from Japan.',
  'footer.trustSecure': 'Secure payments',
  'footer.trustSheets': 'Auction sheet translations',
  'footer.trustDelivery': 'Worldwide delivery',
  'footer.explore': 'EXPLORE',
  'footer.company': 'COMPANY',
  'footer.inventory': 'Inventory',
  'footer.auction': 'Auction access',
  'footer.machinery': 'Machinery & equipment',
  'footer.services': 'Services',
  'footer.brands': 'Brands',
  'footer.destinations': 'Destinations',
  'footer.tools': 'Calculators',
  'footer.world': 'World network',
  'footer.howToBuy': 'How to buy',
  'footer.news': 'News & guides',
  'footer.about': 'About us',
  'footer.reviews': 'Customer stories',
  'footer.faq': 'Help & FAQ',
  'footer.myAccount': 'My account',
  'footer.portal': 'Portal tour',
  'footer.crm': 'Staff CRM',
  'footer.signUp': 'Customer sign up',
  'footer.backToTop': 'Back to top',
  'footer.copyright': '© {year} AR7 Traders. All rights reserved.',
  'footer.privacy': 'Privacy',
  'footer.terms': 'Terms',
  'footer.exportPolicy': 'Export policy',
  'footer.verifiedStock': 'Verified stock',

  // 2026-11-11: header navigation + world-network screen (owner: "translations not fully working")
  'nav.auction': 'Auction access',
  'nav.brands': 'Brands',
  'nav.more': 'More',
  'nav.allInventory': 'All Inventory',
  'nav.machineryEquip': 'Machinery & equipment',
  'nav.world': 'World network',
  'nav.liveAuctions': 'Live auctions',
  'nav.calculators': 'Calculators',
  'nav.services': 'Services',
  'nav.shipping': 'Shipping',
  'nav.destinations': 'Destinations',
  'nav.howToBuy': 'How to buy',
  'nav.news': 'News & guides',
  'nav.reviews': 'Reviews',
  'nav.faq': 'Help & FAQ',
  'nav.about': 'About AR7',
  'nav.portal': 'Client portal',
  'nav.brandsInInventory': 'Brands in inventory',
  'nav.allBrands': 'All brands & models',
  'nav.fullInventory': 'Full inventory',
  'nav.signIn': 'Sign in',
  'nav.signUp': 'Sign up',
  'nav.myAccount': 'My account',
  'nav.menu': 'MENU',
  'nav.closeMenu': 'Close menu',
  'nav.dayMode': 'Day mode',
  'nav.nightMode': 'Night mode',
  'nav.blueGold': 'Blue & gold',
  'world.kicker': 'AR7 GLOBAL EXPORT NETWORK',
  'world.title': 'Where AR7',
  'world.titleEm': 'ships.',
  'world.intro1': 'Spin the globe. Every gold route is a sample AR7 lane from Japan to the world\'s ports — ',
  'world.introClick': 'click Japan',
  'world.intro2': ' to browse the inventory, or press any country to open its market guide.',
  'world.browse': 'Browse inventory',
  'world.guides': 'Market guides',
  'world.statPorts': 'Ports of discharge',
  'world.statPortal': 'Portal access',
  'world.statCost': 'Cost transparency',
  'world.routesKicker': 'FEATURED ROUTES',
  'world.routesTitle': 'From Japan to',
  'world.routesTitleEm': 'your port.',
  'world.routesIntro': 'Eight featured lanes with estimated transit — 27 market guides in total. Click any card to open that market\'s guide.',
  'world.marketGuide': 'Market guide',
  'world.transit': 'transit',
  'world.flyTo': 'Fly the globe to a market',
  'world.dragHint': 'DRAG · PINCH OR CTRL+SCROLL TO ZOOM · HOVER A COUNTRY FOR ITS NAME',
  'world.dragSmall': 'DRAG TO ROTATE · CLICK TO EXPLORE',

  // 2026-11-11 ("proceed to the next upgrades of translations"): home-page
  // sections + car-card chrome. Status/filter DATA stays English (drives CSS
  // slugs and filter state); only the DISPLAY strings translate.
  'card.grade': 'Grade',
  'card.priceFrom': 'EXPORT PRICE FROM',
  'card.statusInStock': 'In Stock',
  'card.statusAuction': 'Auction',
  'card.statusNew': 'New Arrival',
  'card.statusSold': 'Sold',
  'home.motionKicker': 'THE AR7 GLOBAL SUPPLY NETWORK',
  'home.motionH2a': 'Cars in motion.',
  'home.motionH2b': 'Trade without borders.',
  'home.motionBody': 'Watch a sample route from auction floor to destination port. Every vehicle, document and milestone stays visible.',
  'home.motionAuctions': 'Japanese auction houses',
  'home.motionShipping': 'Container shipping',
  'home.motionTeam': 'Accountable team',
  'home.legendRoute': 'Sample route',
  'home.legendVessel': 'Sample vessel',
  'home.legendPorts': 'Destination ports',
  'home.originLabel': 'ORIGIN',
  'home.sampleShipment': 'SAMPLE SHIPMENT',
  'home.trackWon': 'AUCTION WON',
  'home.trackBooked': 'VESSEL BOOKED',
  'home.stockKicker': 'PREMIUM JAPAN STOCK',
  'home.stockH2a': 'Flagships in the',
  'home.stockH2b': 'showroom.',
  'home.stockBody': 'Ferrari to Century — every showroom car is a real vehicle in Japan with live export pricing. The slide keeps running through live stock.',
  'home.filterAll': 'All',
  'home.searchVehicles': 'Search vehicles',
  'home.viewAll': 'View complete inventory',
  'home.soldKicker': 'RECENTLY SOLD',
  'home.soldH2a': 'Already on',
  'home.soldH2b': 'their way.',
  'home.soldBody': 'Cars buyers secured recently — marked sold the moment a deal closes. Tell us your target car and yours is next.',
  'home.soldCta': 'Source one like these',
  'home.mchKicker': 'CHINA DESK · LHD CARS & MACHINERY',
  'home.mchH2a': 'LHD cars, excavators',
  'home.mchH2b': '& trucks.',
  'home.mchBody': 'Left-hand-drive cars and heavy equipment sourced to order from vetted Chinese suppliers — the same inspection, documentation and shipping desk that moves our Japan cars.',
  'home.mchDetails': 'Details',
  'home.mchBrowseAll': 'Browse all machinery',
  'home.mchRequestLhd': 'Request an LHD car',
  'home.worldKicker': 'GLOBAL REACH, LOCAL CARE',
  'home.worldH2a': 'Japan to',
  'home.worldH2em': 'everywhere.',
  'home.worldBody': 'We ship through trusted carriers to ports worldwide. Spin the globe — tap Japan to browse stock, or any country for its market guide.',
  'home.worldExplore': 'Explore destinations',
  'home.budgetKicker': 'BROWSE BY MAKE & BUDGET',
  'home.budgetH2a': 'Every brand.',
  'home.budgetH2b': 'Every budget.',
  'home.budgetBody': 'Popular Japanese models with live export price ranges — tap a make to open its stock.',
  'home.budgetRange': 'EXPORT PRICE RANGE',
  'home.budgetOnRequest': 'On request',
  'home.budgetReady': 'ready to export',
  'home.budgetBrowse': 'Browse {make} stock',
  'home.budgetCar': 'car',
  'home.budgetCars': 'cars',
  'home.processKicker': 'YOUR JOURNEY, SIMPLIFIED',
  'home.processH2a': 'From auction floor',
  'home.processH2b': 'to your',
  'home.processH2em': 'door.',
  'home.processBody': 'A transparent, four-step flow. You stay informed from the first bid to final delivery.',
  'home.step1t': 'Tell us what you want',
  'home.step1p': 'Share your make, model, budget and destination. We shortlist the best matches.',
  'home.step2t': 'Bid with confidence',
  'home.step2p': 'Get live auction access, translated sheets, expert advice and a clear bidding limit.',
  'home.step3t': 'Inspect & prepare',
  'home.step3p': 'We verify, photograph, service and prepare your vehicle for international shipment.',
  'home.step4t': 'Track to your port',
  'home.step4p': 'Follow your car with live shipment updates until it safely reaches your destination.',
  'home.processPortal': 'Secure client portal included',
  'home.processStart': 'Start sourcing',
  'home.auctionKicker': 'AUCTION ACCESS',
  'home.auctionH2a': 'The auction room,',
  'home.auctionH2b': 'in your',
  'home.auctionH2em': 'pocket.',
  'home.auctionBody': "Browse 100,000+ weekly listings from Japan's top auction houses. View translated inspection sheets, place bids, and track results—all in one place.",
  'home.auctionLi1': 'Real-time vehicle listings',
  'home.auctionLi2': 'Translated auction sheets',
  'home.auctionLi3': 'Expert bid recommendations',
  'home.auctionCta': 'Request free access',
  'home.ctaKicker': 'READY WHEN YOU ARE',
  'home.ctaH2a': 'Let’s find your',
  'home.ctaH2b': 'next',
  'home.ctaH2em': 'vehicle.',
  'home.ctaBody': 'Tell us what you’re looking for. Our Japan team will reply with suitable options.',
  'home.ctaBtn': 'Start your search',

  // 2026-11-12 (next translation round): inner-page heroes, About body and the
  // full FAQ. FAQ questions/answers key by index into seo.js FAQ_ITEMS; the
  // FAQPage JSON-LD keeps the English source (site default language).
  'page.servicesKicker': 'WHAT WE DO',
  'page.servicesH1a': 'Complete vehicle',
  'page.servicesH1b': 'sourcing solutions.',
  'page.servicesBody': 'Auction bidding, dealer sourcing, inspection, logistics and export paperwork—managed by one accountable team.',
  'page.destinationsKicker': 'WORLDWIDE EXPORT',
  'page.destinationsH1a': 'Routes built for',
  'page.destinationsH1b': 'your market.',
  'page.destinationsBody': 'Destination guides, estimated transit windows and popular vehicles for every region we serve.',
  'page.reviewsKicker': 'CUSTOMER STORIES & IMPORT REVIEWS',
  'page.reviewsH1a': 'Real reviews,',
  'page.reviewsH1b': 'global buyers.',
  'page.reviewsBody': 'Verified import stories from private buyers and car businesses — translated auction sheets, USS Tokyo bidding, Goo-net dealer stock and RoRo or container shipping to your port.',
  'page.faqKicker': 'HELP CENTER',
  'page.faqH1a': 'Clear answers.',
  'page.faqH1b': 'Confident buying.',
  'page.faqBody': 'Everything you need to know about Japanese auctions, payment, inspection and international shipping.',
  'page.portalKicker': 'CLIENT PORTAL PREVIEW',
  'page.portalH1a': 'Every update.',
  'page.portalH1b': 'One dashboard.',
  'page.portalBody': 'Explore a working preview of the AR7 customer portal for bids, payments, documents and shipments.',
  'page.talkTeam': 'Talk to our team',
  'page.openAccount': 'Open my real account',
  'page.brandsKicker': 'BROWSE BY BRAND',
  'page.brandsH1a': 'Every brand.',
  'page.brandsH1b': 'One doorway.',
  'page.brandsBody': 'Jump straight to the make you want — inventory, popular models and market notes for each brand.',
  'page.howbuyKicker': 'HOW IT WORKS',
  'page.howbuyH1a': 'From Tokyo auction',
  'page.howbuyH1b': 'to your garage.',
  'page.howbuyBody': 'The complete AR7 purchase flow — bidding, inspection, payment, paperwork and shipping, step by step.',
  'page.toolsKicker': 'CALCULATORS',
  'page.toolsH1a': 'Know your numbers',
  'page.toolsH1b': 'before you buy.',
  'page.toolsBody': 'Estimate freight, CIF cost and import duty to your port with our planning calculators.',
  'page.newsKicker': 'AR7 NEWS & GUIDES',
  'page.newsH1a': 'Market insight.',
  'page.newsH1b': 'Buying confidence.',
  'page.newsBody': 'Auction analysis, buying guides and logistics explainers from our Japan team.',
  'page.auctionKicker': 'LIVE AUCTION ACCESS',
  'page.auctionH1a': 'Bid in Japan.',
  'page.auctionH1em': 'From anywhere.',
  'page.auctionBody': 'Your direct window into 100,000+ vehicles every week, with translated sheets and an expert beside you.',
  'page.shippingKicker': 'GLOBAL LOGISTICS',
  'page.shippingH1a': 'From Japan',
  'page.shippingH1b': 'to your',
  'page.shippingH1em': 'port.',
  'page.shippingBody': 'Reliable RoRo and container shipping with documentation, insurance and live milestone updates.',
  'page.aboutKicker': 'ABOUT AR7 TRADERS',
  'page.aboutH1a': 'Your team',
  'page.aboutH1b': 'on the ground',
  'page.aboutH1em': 'in Japan.',
  'page.aboutBody': 'We are vehicle sourcing specialists built around transparency, quality and long-term customer relationships.',
  'page.contactKicker': 'TALK TO OUR TEAM',
  'page.contactH1a': 'Start your',
  'page.contactH1em': 'car journey.',
  'page.contactBody': 'Tell us your market, budget and preferred vehicle. Our Japan export desk will reply with suitable options.',
  'page.getStarted': 'Get started',
  'page.sendEnquiry': 'Send an enquiry',
  'about.h2': 'Built to be your trusted partner.',
  'about.body': 'AR7 Traders connects buyers worldwide to the depth and quality of the Japanese vehicle market.',
  'about.story': 'Our team sources through major Japanese auction houses and trusted dealer networks. Every vehicle is selected with careful inspection, clear communication and full cost transparency.',
  'faq.kicker': 'POPULAR QUESTIONS',
  'faq.h2': 'Buying from Japan, explained.',
  'faq.body': 'Practical answers on Japanese auctions, dealer stock, pricing, shipping and port clearance — grouped by topic.',
  'faq.ask': 'Ask another question',
  'faq.topicAuctions': 'Auctions & condition',
  'faq.topicPricing': 'Pricing & payment',
  'faq.topicShipping': 'Shipping & documents',
  'faq.topicArrival': 'Customs & arrival',
  'faq.q1': 'How do Japanese car auctions work?',
  'faq.a1': 'Licensed trade members inspect and bid on vehicles at wholesale auction houses across Japan. AR7 shortlists suitable lots, translates the inspector notes and places your agreed maximum bid on your behalf.',
  'faq.q2': 'Can I see the auction sheet before bidding?',
  'faq.a2': 'For auction-sourced lots, yes — we share the Japanese auction sheet and a plain-English summary of the grades and marks before you commit to a bid. For dealer-stock vehicles, condition is reviewed from the dealer report and yard photographs.',
  'faq.q3': 'What do Japanese auction grades like 4.5, 4.0 and R mean?',
  'faq.a3': 'Grades S, 5, 4.5 and 4.0 indicate overall condition and mileage Band, while panel codes like A1 (small scratch), U1 (minor dent) and W2 (paint wave) mark individual panels. An R or RA grade means repaired accident history — we flag those clearly before you decide.',
  'faq.q4': 'How is dealer stock different from an auction vehicle?',
  'faq.a4': 'Auction vehicles sell on a scheduled bidding day at a hammer price in Japanese yen, whereas dealer-stock vehicles are already priced at Japanese dealerships for immediate reservation without waiting for an auction session.',
  'faq.q5': 'Can AR7 source a specific model?',
  'faq.a5': 'Yes. Share your target make, model, year range, mileage cap, preferred colour and destination port. We monitor daily auction lists and Japanese dealer networks until a matching vehicle appears.',
  'faq.q6': 'What is included in the export price?',
  'faq.a6': 'The listed vehicle price is an FOB (Free on Board) starting estimate in Japan. Your written quotation itemizes the vehicle price, Japanese inland transport and export preparation, ocean freight and marine transit insurance (CIF).',
  'faq.q7': 'What is the difference between FOB and CIF pricing?',
  'faq.a7': 'FOB covers the vehicle and export preparation up to loading at the Japanese port. CIF (Cost, Insurance and Freight) adds sea freight to your destination port and marine transit insurance so you see the landed port cost before customs.',
  'faq.q8': 'How do I pay for a vehicle and what currencies are accepted?',
  'faq.a8': 'Purchases are settled by international bank transfer (T/T) against an itemized proforma invoice, typically in USD or JPY. For auction bidding, a refundable deposit activates your bidding limit and the balance is invoiced after a successful purchase.',
  'faq.q9': 'Are the calculator numbers on the website final quotes?',
  'faq.a9': 'No — all calculator outputs and transit windows on the website are planning estimates. Before you commit, our Japan export desk issues a written quotation with current carrier freight and documentation costs for your specific vehicle.',
  'faq.q10': 'How long does shipping take?',
  'faq.a10': 'Sea transit depends on your destination port, carrier schedule and whether the vessel sails direct or transships. Typical planning windows range from roughly 18 to 42 days after loading in Japan.',
  'faq.q11': 'Should I choose RoRo or container shipping?',
  'faq.a11': 'RoRo (Roll-on/Roll-off) is the standard, cost-effective choice for drivable cars, SUVs and vans. Dedicated or shared containers suit high-value supercars, low-clearance vehicles or multi-car dealership orders.',
  'faq.q12': 'Which export documents will I receive?',
  'faq.a12': 'Every shipment is prepared with a Commercial Invoice, original Bill of Lading, Japanese Export Certificate (de-registration certificate) and marine insurance certificate, plus pre-shipment inspection certificates (such as QISJ, JEVIC or EAA) where required by your market.',
  'faq.q13': 'How do I track my vehicle?',
  'faq.a13': 'Clients receive portal and WhatsApp updates covering yard arrival photos in Japan, pre-export inspection, vessel booking, Bill of Lading dispatch by courier and estimated port arrival.',
  'faq.q14': 'Who calculates import duty and clears the car at my port?',
  'faq.a14': 'Import duty, local taxes and registration fees are always assessed by your own country’s customs authority under local rules. Your licensed clearing agent at the destination port submits the original documents we courier to you and confirms the exact duty payable.',
};

// ---------------------------------------------------------------------------
// Dictionary registry
// ---------------------------------------------------------------------------
// English is the source of truth and lives here so no screen can ever be
// blank. Other languages are registered at runtime by src/i18n.jsx when the
// visitor chooses one.
// ---------------------------------------------------------------------------
const registry = { en };

/** Called once by the language provider after the lazy dictionaries load. */
export function registerDicts(dicts) {
  for (const [code, dict] of Object.entries(dicts || {})) {
    if (dict && typeof dict === 'object') registry[code] = { ...en, ...dict };
  }
}

/**
 * Look up a key. Falls back to English, then to the key itself, so a missing
 * string shows the English text rather than an empty gap.
 */
export function translate(code, key, vars) {
  const dict = registry[code] || en;
  let out = dict[key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  return out;
}

/** Languages with a dictionary loaded right now (English is always there). */
export const loadedLangs = () => Object.keys(registry);

/** Which keys a language is missing, so a gap is visible rather than silent. */
export function missingKeys(code) {
  if (code === DEFAULT_LANG || !registry[code]) return [];
  return Object.keys(en).filter(k => !(k in registry[code]));
}
