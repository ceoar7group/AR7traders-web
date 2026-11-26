// Web call + Call-desk local-time contract tests (npm run test:webcall).
//
// Bundled with esbuild (webcall.jsx is JSX and reads import.meta.env via
// supabase-client). Pins the free-calling promises:
//   • room codes are shareable, URL-safe and unique enough
//   • exactly ONE side of a call creates the offer (no glare)
//   • localTimeFor turns a lead's country into an approximate local clock
//     and an etiquette flag, and stays silent for unknown countries
let pass = 0, fail = 0;
const say = s => process.stdout.write(s + '\n');
const ok = (cond, msg) => { if (cond) { pass++; say('  ✓ ' + msg); } else { fail++; process.stderr.write('  ✗ ' + msg + '\n'); } };

import { makeRoomCode, shouldOffer, micErrorMessage } from '../src/webcall.jsx';
import { localTimeFor } from '../src/call-time.js';

say('1) room codes');
{
  const codes = new Set(Array.from({ length: 200 }, makeRoomCode));
  ok([...codes].every(c => /^ar7-[a-z0-9]{4,8}$/.test(c)), 'codes are URL-safe and recognisable (ar7-…)');
  ok(codes.size >= 199, '200 generated codes are (practically) unique');
}

say('\n2) offer negotiation — exactly one offerer');
{
  ok(shouldOffer('zzz', 'aaa') === true && shouldOffer('aaa', 'zzz') === false, 'higher peer id offers, lower answers');
  ok(shouldOffer('abc', 'abd') !== shouldOffer('abd', 'abc'), 'the rule is antisymmetric — never two offers');
}

say('\n3) localTimeFor — approximate local clock per country');
{
  // 12:00 UTC on a fixed date.
  const noonUtc = new Date('2026-11-03T12:00:00Z');
  ok(localTimeFor('Pakistan', noonUtc).time === '17:00', 'Pakistan is UTC+5 → 17:00');
  ok(localTimeFor('Japan', noonUtc).time === '21:00', 'Japan is UTC+9 → 21:00');
  ok(localTimeFor('Kenya', noonUtc).time === '15:00', 'Kenya is UTC+3 → 15:00');
  ok(localTimeFor('United Kingdom', noonUtc).time === '12:00', 'UK is UTC+0 → 12:00');
  ok(localTimeFor('india', noonUtc).time === '17:30', 'half-hour offsets work (India +5:30)');
  ok(localTimeFor('USA', noonUtc).time === '07:00', 'negative offsets work (US Eastern −5)');
  ok(localTimeFor('Japan', noonUtc).part === 'edge', '21:00 flags as early/late — think before dialling');
  ok(localTimeFor('Kenya', noonUtc).part === 'day', '15:00 is a fair calling hour');
  const lateUtc = new Date('2026-11-03T22:00:00Z');
  ok(localTimeFor('Japan', lateUtc).time === '07:00' && localTimeFor('Japan', lateUtc).part === 'edge', 'day wrap: 22:00 UTC is 07:00 JST next morning (edge hour)');
  ok(localTimeFor('Kenya', lateUtc).part === 'night', '01:00 in Nairobi is flagged asleep');
  ok(localTimeFor('Atlantis') === null, 'unknown country → null (no chip, no guess)');
  ok(localTimeFor('') === null && localTimeFor(null) === null, 'empty country → null');
}

say('\n4) micErrorMessage — the real blocker, named');
{
  // 2026-11-13: production's Permissions-Policy header denied the microphone
  // site-wide, and the old catch-all told the user to re-check a browser
  // permission they had already granted. Each failure mode now gets its own
  // actionable message.
  ok(/https|preview frame|own browser tab/i.test(micErrorMessage({ name: 'NotSupportedError' })),
    'no mediaDevices at all → says to open the link directly over https');
  ok(/no microphone was found/i.test(micErrorMessage({ name: 'NotFoundError' })),
    'NotFoundError → says there is no microphone device');
  ok(/busy in another app/i.test(micErrorMessage({ name: 'NotReadableError' })),
    'NotReadableError → says the device is busy, not that permission was refused');
  ok(/blocked|permission/i.test(micErrorMessage({ name: 'NotAllowedError' })),
    'NotAllowedError → points at the permission');
  ok(typeof micErrorMessage(undefined) === 'string' && micErrorMessage(undefined).length > 20,
    'a malformed error still produces a usable message');
}

say(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
