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
