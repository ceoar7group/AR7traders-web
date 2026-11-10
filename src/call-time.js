// Approximate local time for a lead's country — so the Call Desk shows
// whether it is a sensible hour to dial BEFORE the agent calls.
//
// Honesty by design: these are standard-time UTC offsets for the capital /
// main business city, without DST rules (keeping a DST database honest is a
// job for a timezone library, not a hand-written table). The chip therefore
// says "≈" and can be off by one hour in DST countries for part of the year
// — still enough to stop a 3 a.m. cold call. Countries spanning several
// zones use the main business city's zone. Unknown country → no chip.

const OFFSETS = {
  // Core markets first (mirrors the lead form's country options).
  'pakistan': 5, 'kenya': 3, 'uae': 4, 'united arab emirates': 4,
  'united kingdom': 0, 'uk': 0, 'tanzania': 3, 'uganda': 3, 'zambia': 2,
  'zimbabwe': 2, 'mozambique': 2, 'malawi': 2, 'botswana': 2, 'south africa': 2,
  'nigeria': 1, 'ghana': 0, 'drc': 1, 'congo': 1, 'rwanda': 2, 'burundi': 2,
  'ethiopia': 3, 'somalia': 3, 'sudan': 2, 'south sudan': 2,
  'japan': 9, 'china': 8, 'hong kong': 8, 'singapore': 8, 'malaysia': 8,
  'thailand': 7, 'myanmar': 6.5, 'bangladesh': 6, 'sri lanka': 5.5, 'india': 5.5,
  'nepal': 5.75, 'afghanistan': 4.5, 'iran': 3.5, 'iraq': 3, 'oman': 4,
  'qatar': 3, 'bahrain': 3, 'kuwait': 3, 'saudi arabia': 3, 'yemen': 3,
  'jordan': 3, 'lebanon': 2, 'turkey': 3, 'cyprus': 2, 'malta': 1,
  'ireland': 0, 'germany': 1, 'france': 1, 'netherlands': 1, 'belgium': 1,
  'poland': 1, 'russia': 3, 'georgia': 4, 'armenia': 4, 'azerbaijan': 4,
  'kazakhstan': 5, 'uzbekistan': 5, 'kyrgyzstan': 6, 'tajikistan': 5,
  'turkmenistan': 5, 'mongolia': 8, 'philippines': 8, 'indonesia': 7,
  'vietnam': 7, 'cambodia': 7, 'laos': 7, 'south korea': 9,
  'australia': 10, 'new zealand': 12, 'fiji': 12, 'papua new guinea': 10,
  'png': 10, 'solomon islands': 11, 'vanuatu': 11, 'samoa': 13, 'tonga': 13,
  'usa': -5, 'united states': -5, 'canada': -5, 'mexico': -6,
  'jamaica': -5, 'trinidad': -4, 'trinidad and tobago': -4, 'guyana': -4,
  'suriname': -3, 'bahamas': -5, 'barbados': -4, 'chile': -4, 'peru': -5,
  'bolivia': -4, 'paraguay': -4, 'uruguay': -3, 'brazil': -3, 'argentina': -3,
  'mauritius': 4, 'seychelles': 4, 'madagascar': 3, 'comoros': 3,
  'angola': 1, 'namibia': 2, 'lesotho': 2, 'eswatini': 2, 'swaziland': 2,
  'cameroon': 1, 'senegal': 0, 'gambia': 0, 'sierra leone': 0, 'liberia': 0,
  'ivory coast': 0, "cote d'ivoire": 0, 'benin': 1, 'togo': 0, 'mali': 0,
  'burkina faso': 0, 'niger': 1, 'chad': 1, 'libya': 2, 'egypt': 2,
  'morocco': 1, 'algeria': 1, 'tunisia': 1, 'eritrea': 3, 'djibouti': 3
};

/**
 * "≈ 14:32" plus a day-part flag for the given country, or null when the
 * country is unknown. `now` is injectable for tests.
 */
export function localTimeFor(country, now = new Date()) {
  const key = String(country || '').trim().toLowerCase();
  if (!key || !(key in OFFSETS)) return null;
  const offset = OFFSETS[key];
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const dayMin = ((utcMin + Math.round(offset * 60)) % 1440 + 1440) % 1440;
  const h = Math.floor(dayMin / 60), m = dayMin % 60;
  const hh = String(h).padStart(2, '0'), mm = String(m).padStart(2, '0');
  // Calling etiquette: 09:00–20:59 is fair game, 07–09 and 21–22 are edge,
  // anything else is "asleep".
  const part = h >= 9 && h < 21 ? 'day' : (h >= 7 && h < 9) || (h >= 21 && h < 22) ? 'edge' : 'night';
  return { time: `${hh}:${mm}`, part, offset };
}
