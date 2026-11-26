// The non-English dictionaries, one module per language.
//
// This file is the *aggregator*, and nothing in src/ imports it at runtime any
// more: src/i18n.jsx imports the one language the visitor asked for
// (`./i18n-dicts/ur.js`) so an Urdu reader downloads Urdu and not thirteen other
// languages. The aggregator exists for the tests, which audit every language at
// once — scripts/i18n-switch.test.mjs (key parity, trading terms) and
// scripts/machinery-i18n.test.mjs (desk copy).
//
// Adding a language: add it to LANGUAGES in src/i18n.js, add
// src/i18n-dicts/<code>.js, add the loader in src/i18n.jsx, and run
// `npm run test:i18n-switch` — it fails if a language is advertised without a
// dictionary, or a dictionary is missing a key English has.
import ar from './i18n-dicts/ar.js';
import ps from './i18n-dicts/ps.js';
import ur from './i18n-dicts/ur.js';
import fa from './i18n-dicts/fa.js';
import fr from './i18n-dicts/fr.js';
import de from './i18n-dicts/de.js';
import ru from './i18n-dicts/ru.js';
import es from './i18n-dicts/es.js';
import pt from './i18n-dicts/pt.js';
import tr from './i18n-dicts/tr.js';
import zh from './i18n-dicts/zh.js';
import sw from './i18n-dicts/sw.js';
import ha from './i18n-dicts/ha.js';
import ja from './i18n-dicts/ja.js';

export default { ar, ps, ur, fa, fr, de, ru, es, pt, tr, zh, sw, ha, ja };
