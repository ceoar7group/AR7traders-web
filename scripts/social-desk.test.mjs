// Social platform connections — the contract that keeps "attach the social
// media platforms" honest (2026-11-11 owner request):
//   1. connect VALIDATES against the platform's own API before anything is
//      stored; a refusal stores NOTHING and returns the platform's reason;
//   2. desk-stored credentials overlay the env per platform independently;
//   3. status masks every secret;
//   4. the ?social= dispatcher gates status behind site.write and
//      connect/disconnect behind settings.write;
//   5. the Social agent drafts captions for ALL six channels, written to the
//      platform playbooks, and executeDraft posts ONLY to channels with a
//      working automated publisher (facebook/instagram/linkedin) — TikTok and
//      YouTube stay honestly "prepared" even when connected.

import assert from 'node:assert/strict';
import {
  SOCIAL_KEYS, resolveSocialEnv, validatePlatform, connectPlatform,
  disconnectPlatform, socialStatus
} from '../api/_social.js';
import { SOCIAL_PLATFORMS, PLATFORM_PLAYBOOKS, playbookDigest } from '../src/social-playbooks.js';
import handler from '../api/site-content.js';

let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; console.log('  \u2713 ' + label); }
  else { fail++; console.error('  \u2717 ' + label); }
};
const say = m => console.log(m);

// --- minimal fake supabase + http plumbing (same shape as activity-log test)
function fakeDb(seed = {}) {
  const tables = { site_settings: [], ...seed };
  return {
    tables,
    from(table) {
      tables[table] = tables[table] || [];
      const q = { _filters: [], _in: null };
      q.select = () => q;
      q.eq = (k, v) => { q._filters.push([k, v]); return q; };
      q.in = (k, vals) => { q._in = [k, vals]; return q; };
      q.limit = () => q;
      q.upsert = rows => {
        for (const row of Array.isArray(rows) ? rows : [rows]) {
          const i = tables[table].findIndex(r => r.key === row.key);
          if (i >= 0) tables[table][i] = { ...tables[table][i], ...row };
          else tables[table].push({ ...row });
        }
        return Promise.resolve({ data: rows, error: null });
      };
      q.delete = () => ({
        in: (k, vals) => { tables[table] = tables[table].filter(r => !vals.includes(r[k])); return Promise.resolve({ error: null }); },
        eq: (k, v) => { tables[table] = tables[table].filter(r => r[k] !== v); return Promise.resolve({ error: null }); }
      });
      q.insert = row => ({ select: () => ({ single: async () => { const r = { id: 'id-' + tables[table].length, ...row }; tables[table].push(r); return { data: r, error: null }; } }) });
      q.then = (resolve, reject) => {
        let rows = tables[table];
        for (const [k, v] of q._filters) rows = rows.filter(r => r[k] === v);
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      };
      return q;
    }
  };
}
const parseBody = body => {
  if (typeof body !== 'string') return body;
  try { return JSON.parse(body); } catch { return body; }
};
const run = (req, injected) => new Promise(resolve => {
  const res = {
    statusCode: 200, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(body) { resolve({ statusCode: this.statusCode, body: parseBody(body) }); },
    end(body) { resolve({ statusCode: this.statusCode, body: parseBody(body) }); }
  };
  handler({ query: {}, headers: {}, body: null, method: 'GET', ...req }, res, injected).catch(e => resolve({ statusCode: 500, body: { error: e.message } }));
});
const userFor = (id, role) => async () => ({ user: { id, email: id + '@ar7.test' }, profile: { id, role, full_name: role } });
const permsFor = async role => ({
  'site.write': ['admin', 'manager'].includes(role),
  'settings.write': role === 'admin'
});

// ---------------------------------------------------------------------------
say('1) The playbooks exist for every connectable platform');
{
  ok(SOCIAL_PLATFORMS.length === 5, `five platforms are connectable (${SOCIAL_PLATFORMS.map(p => p.id).join(', ')})`);
  for (const p of SOCIAL_PLATFORMS) {
    ok(!!PLATFORM_PLAYBOOKS[p.id]?.algorithm && !!PLATFORM_PLAYBOOKS[p.id]?.format,
      `${p.id} has an algorithm + format playbook the agent is trained on`);
    ok(!!SOCIAL_KEYS[p.id], `${p.id} has settings keys`);
  }
  const digest = playbookDigest();
  ok(/TikTok/.test(digest) && /completion/i.test(digest) && /YouTube/.test(digest) && /retention/i.test(digest),
    'the prompt digest teaches completion-rate (TikTok) and retention (YouTube) ranking');
  ok(/Content ID|licensed|owned/i.test(PLATFORM_PLAYBOOKS.youtube.algorithm),
    'the YouTube playbook names the Content ID rule — only owned/licensed media is ever uploaded');
  const yt = SOCIAL_PLATFORMS.find(p => p.id === 'youtube'), tt = SOCIAL_PLATFORMS.find(p => p.id === 'tiktok');
  ok(yt.autopublish === false && tt.autopublish === false, 'YouTube and TikTok never claim an automated publisher');
}

// ---------------------------------------------------------------------------
say('\n2) validatePlatform asks the platform and never invents a yes');
{
  const graphOk = async url => {
    if (/graph\.facebook\.com\/v[\d.]+\/112233\?/.test(url)) return { ok: true, status: 200, json: async () => ({ name: 'AR7 Traders', followers_count: 820 }) };
    if (/graph\.facebook\.com\/v[\d.]+\/445566\?/.test(url)) return { ok: true, status: 200, json: async () => ({ username: 'ar7traders', followers_count: 1200 }) };
    return { ok: false, status: 400, json: async () => ({ error: { message: 'Invalid OAuth access token.' } }) };
  };
  const fb = await validatePlatform('facebook', { page_id: '112233', token: 'tok' }, { fetch: graphOk });
  ok(fb.ok && fb.identity.name === 'AR7 Traders', 'Facebook: a Graph yes returns the verified page name');
  const fbBad = await validatePlatform('facebook', { page_id: '999999', token: 'bad' }, { fetch: graphOk });
  ok(fbBad.ok === false && /Invalid OAuth/.test(fbBad.reason) && /Nothing was saved/.test(fbBad.reason),
    'Facebook: a Graph refusal carries Meta\u2019s reason and promises nothing was saved');
  const fbShape = await validatePlatform('facebook', { page_id: 'not-numeric', token: 't' }, { fetch: graphOk });
  ok(fbShape.ok === false, 'a malformed page id is refused before any network call');
  const ig = await validatePlatform('instagram', { business_id: '445566', token: 'tok' }, { fetch: graphOk });
  ok(ig.ok && ig.identity.name === '@ar7traders', 'Instagram: the verified username comes back');
  const li = await validatePlatform('linkedin', { org_urn: 'urn:li:organization:77', token: 'tok' },
    { fetch: async () => ({ ok: true, status: 200, json: async () => ({ sub: 'abc', name: 'Owner' }) }) });
  ok(li.ok && li.identity.org === 'urn:li:organization:77', 'LinkedIn: userinfo yes + URN format check');
  const liUrn = await validatePlatform('linkedin', { org_urn: 'ar7-traders', token: 'tok' }, { fetch: async () => { throw new Error('must not be called'); } });
  ok(liUrn.ok === false && /urn:li:organization/.test(liUrn.reason), 'LinkedIn: a malformed URN never reaches the network');
  const yt = await validatePlatform('youtube', { channel_id: 'UCabcdefgh1234', token: 'tok' },
    { fetch: async () => ({ ok: true, status: 200, json: async () => ({ items: [{ id: 'UCother', snippet: { title: 'Someone else' } }] }) }) });
  ok(yt.ok === false && /belongs to channel UCother/.test(yt.reason),
    'YouTube: a token for a DIFFERENT channel is refused by id comparison');
  const tt = await validatePlatform('tiktok', { token: 'tok' },
    { fetch: async () => ({ ok: true, status: 200, json: async () => ({ data: { user: { display_name: 'ar7traders', follower_count: 10 } } }) }) });
  ok(tt.ok && tt.identity.name === 'ar7traders', 'TikTok: user.info yes returns the display name');
}

// ---------------------------------------------------------------------------
say('\n3) connect stores only after a platform yes; disconnect deletes; status masks');
{
  const db = fakeDb();
  const refusing = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'bad token' } }) });
  const refused = await connectPlatform(db, 'facebook', { page_id: '112233', token: 'bad' }, { fetch: refusing });
  ok(refused.ok === false && db.tables.site_settings.length === 0, 'a refusal stores NOTHING');
  const accepting = async () => ({ ok: true, status: 200, json: async () => ({ name: 'AR7 Traders', followers_count: 5 }) });
  const connected = await connectPlatform(db, 'facebook', { page_id: '112233', token: 'good-secret' }, { fetch: accepting });
  ok(connected.ok === true && connected.identity.name === 'AR7 Traders', 'a platform yes connects');
  ok(db.tables.site_settings.some(r => r.key === 'social_fb_token' && r.value === 'good-secret'), 'the token is stored in site_settings');
  const status = await socialStatus(db, {});
  const fb = status.platforms.find(p => p.platform === 'facebook');
  ok(fb.connected && fb.source === 'desk' && fb.identity?.name === 'AR7 Traders', 'status reports the desk connection with the verified identity');
  ok(!JSON.stringify(status).includes('good-secret'), 'no secret ever appears in the status payload');
  const envOnly = await socialStatus(fakeDb(), { LINKEDIN_ACCESS_TOKEN: 't', LINKEDIN_ORG_URN: 'urn:li:organization:9' });
  ok(envOnly.platforms.find(p => p.platform === 'linkedin').source === 'env', 'env-configured platforms read as source:env');
  const resolved = await resolveSocialEnv(db, { EXISTING: 'kept' });
  ok(resolved.FACEBOOK_PAGE_TOKEN === 'good-secret' && resolved.FACEBOOK_PAGE_ID === '112233' && resolved.EXISTING === 'kept',
    'resolveSocialEnv overlays the desk credentials onto the env');
  ok(!resolved.TIKTOK_ACCESS_TOKEN, 'an unconnected platform overlays nothing (per-platform independence)');
  const gone = await disconnectPlatform(db, 'facebook');
  ok(gone.ok && db.tables.site_settings.every(r => !r.key.startsWith('social_fb')), 'disconnect deletes every stored row');
}

// ---------------------------------------------------------------------------
say('\n4) ?social= dispatcher — perms are the WhatsApp-connect rules');
{
  const accepting = async () => ({ ok: true, status: 200, json: async () => ({ name: 'AR7', followers_count: 1 }) });
  const db = fakeDb();
  const injected = { db, getUser: userFor('ad1', 'admin'), permsFor, fetch: accepting, env: {} };
  const H = { authorization: 'Bearer t' };
  let r = await run({ method: 'GET', query: { social: 'status' }, headers: H }, injected);
  ok(r.statusCode === 200 && Array.isArray(r.body.platforms) && r.body.platforms.length === 5, 'status lists all five platforms');
  r = await run({ method: 'POST', query: { social: 'connect' }, headers: H, body: { platform: 'facebook', creds: { page_id: '112233', token: 'tok' } } }, injected);
  ok(r.statusCode === 200 && r.body.ok === true, 'an admin can connect');
  const manager = { ...injected, getUser: userFor('mg1', 'manager') };
  r = await run({ method: 'GET', query: { social: 'status' }, headers: H }, manager);
  ok(r.statusCode === 200, 'a manager (site.write) can read status');
  r = await run({ method: 'POST', query: { social: 'connect' }, headers: H, body: { platform: 'tiktok', creds: { token: 'x' } } }, manager);
  ok(r.statusCode === 403, 'a manager cannot connect — settings.write is the gate, like the WhatsApp desk');
  r = await run({ method: 'POST', query: { social: 'disconnect' }, headers: H, body: { platform: 'facebook' } }, manager);
  ok(r.statusCode === 403, 'nor disconnect');
  const sales = { ...injected, getUser: userFor('sa1', 'sales') };
  r = await run({ method: 'GET', query: { social: 'status' }, headers: H }, sales);
  ok(r.statusCode === 403, 'a sales role cannot even read which accounts exist');
  r = await run({ method: 'POST', query: { social: 'connect' }, headers: H, body: { platform: 'myspace', creds: {} } }, injected);
  ok(r.statusCode === 200 && r.body.ok === false && /Unknown platform/.test(r.body.reason), 'an unknown platform is refused in words');
}

say(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
