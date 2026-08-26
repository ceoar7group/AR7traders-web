// Pure-logic smoke test for the multi-currency engine (no DOM needed).
// Bundled with esbuild (css imports emptied) and run with node.
import {
  CURRENCIES, CURRENCY_CODES, BASE_CURRENCY, DEFAULT_RATES,
  normalizeRates, convert, convertFrom, formatMoney, formatInCurrency, parsePriceUsd
} from '../src/currency.jsx';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error('FAIL:', msg); } else console.log('ok  :', msg); };

ok(CURRENCY_CODES.length === 11, `11 currencies defined (${CURRENCY_CODES.join(',')})`);
for (const c of ['JPY','USD','EUR','GBP','PKR','AUD','NZD','CAD','AED','SAR','KES'])
  ok(CURRENCY_CODES.includes(c), `${c} present`);
ok(BASE_CURRENCY === 'USD', 'base currency is USD');
ok(formatMoney(58900, 'USD') === '$58,900', `USD formatting (${formatMoney(58900, 'USD')})`);
ok(formatMoney(58900, 'JPY') === '¥9,129,500', `JPY conversion 58900*155 (${formatMoney(58900, 'JPY')})`);
ok(formatMoney(10000, 'JPY') === '¥1,550,000', `JPY 0 decimals (${formatMoney(10000, 'JPY')})`);
ok(formatMoney(10000, 'AED') === 'AED 36,725', `AED code prefix (${formatMoney(10000, 'AED')})`);
ok(formatMoney(10000, 'KES') === 'KSh 1,290,000', `KSh prefix 0dp (${formatMoney(10000, 'KES')})`);
ok(formatMoney(10000, 'GBP') === '£7,900', `GBP (${formatMoney(10000, 'GBP')})`);
ok(formatMoney(10000, 'SAR') === 'SAR 37,500', `SAR (${formatMoney(10000, 'SAR')})`);
ok(formatMoney(1234.5, 'EUR', { ...DEFAULT_RATES, EUR: 0.92 }) === '€1,135.74', `EUR with decimals (${formatMoney(1234.5, 'EUR')})`);
ok(convert(100, 'JPY') === 15500, 'convert USD→JPY');
ok(Math.abs(convertFrom(15500, 'JPY') - 100) < 1e-9, 'convertFrom JPY→USD');
ok(normalizeRates('{"JPY":200,"BOGUS":5}').JPY === 200, 'normalizeRates accepts JSON string');
ok(normalizeRates('{"JPY":200}').EUR === DEFAULT_RATES.EUR, 'normalizeRates merges defaults');
ok(normalizeRates(null).USD === 1, 'normalizeRates tolerates null');
ok(normalizeRates('not json').JPY === DEFAULT_RATES.JPY, 'normalizeRates tolerates garbage');
ok(parsePriceUsd('$58,900') === 58900, 'parsePriceUsd $58,900');
ok(parsePriceUsd('USD 1,234.50') === 1234.5, 'parsePriceUsd USD 1,234.50');
ok(formatInCurrency(2400000, 'JPY') === '¥2,400,000', 'formatInCurrency no conversion');
ok(formatMoney(0, 'USD') === '$0', 'zero formats');

console.log(failed ? `\n${failed} FAILURE(S)` : '\nALL PASS');
process.exit(failed ? 1 : 0);
