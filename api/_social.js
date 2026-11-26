// Social platform connections — the desk-stored credential layer for the
// Social Media agent (api/_agents.js) and the AI Growth desk.
//
// 2026-11-11 owner request: "attach the social media platforms so the AI
// growth agents can manage them automatically". Same contract as the
// WhatsApp direct connect (api/_wa.js, 2026-11-11):
//   • Credentials pasted into the desk are VALIDATED against the platform's
//     own API BEFORE anything is stored. A refusal returns 200 {ok:false}
//     with the platform's reason, and nothing is saved.
//   • Stored in site_settings (social_<platform>_* keys) so connecting needs
//     no Vercel env edit and no redeploy. Desk credentials win over env.
//   • Disconnect deletes the rows. Status masks every secret.
//   • Connection alone never posts anything: publishing still requires an
//     approved draft AND the agent's autopublish switch (executeDraft).
//
// No new Serverless Function: dispatched from api/site-content.js?social=…

import { SOCIAL_PLATFORMS } from '../src/social-playbooks.js';

const GRAPH = env => 'https://graph.facebook.com/' + (env?.META_GRAPH_VERSION || 'v21.0');

/** site_settings keys per platform — single source of truth. */
export const SOCIAL_KEYS = {
  facebook: { page_id: 'social_fb_page_id', token: 'social_fb_token' },
  instagram: { business_id: 'social_ig_business_id', token: 'social_ig_token' },
  tiktok: { token: 'social_tt_token' },
  linkedin: { org_urn: 'social_li_org_urn', token: 'social_li_token' },
  youtube: { channel_id: 'social_yt_channel_id', token: 'social_yt_token' }
};

/** Env var names each platform's publisher/configured-check reads. */
const ENV_NAMES = {
  facebook: { page_id: 'FACEBOOK_PAGE_ID', token: 'FACEBOOK_PAGE_TOKEN' },
  instagram: { business_id: 'INSTAGRAM_BUSINESS_ID', token: 'META_GRAPH_TOKEN' },
  tiktok: { token: 'TIKTOK_ACCESS_TOKEN' },
  linkedin: { org_urn: 'LINKEDIN_ORG_URN', token: 'LINKEDIN_ACCESS_TOKEN' },
  youtube: { channel_id: 'YOUTUBE_CHANNEL_ID', token: 'YOUTUBE_ACCESS_TOKEN' }
};

const isPlatform = p => Object.prototype.hasOwnProperty.call(SOCIAL_KEYS, p);

async function readSettings(db) {
  const { data } = await db.from('site_settings').select('key,value');
  return Object.fromEntries((data || []).map(r => [r.key, r.value]));
}

/**
 * Overlay desk-stored social credentials onto the environment, per platform
 * independently (unlike WhatsApp's all-three rule: platforms are unrelated
 * accounts, a half-connected TikTok must not block a connected Facebook).
 * Never throws — a failed settings read falls back to the env, so an agent
 * run cannot be taken down by a storage hiccup.
 */
export async function resolveSocialEnv(db, env = process.env) {
  let s;
  try { s = await readSettings(db); } catch { return env; }
  const out = { ...env };
  for (const [platform, keys] of Object.entries(SOCIAL_KEYS)) {
    const complete = Object.values(keys).every(k => String(s[k] || '').trim());
    if (!complete) continue;
    for (const [field, settingKey] of Object.entries(keys)) {
      out[ENV_NAMES[platform][field]] = String(s[settingKey]).trim();
    }
    out['SOCIAL_SOURCE_' + platform.toUpperCase()] = 'desk';
  }
  return out;
}

/**
 * Ask the platform itself whether these credentials work. Returns
 * {ok:true, identity} or {ok:false, reason} — never throws for a refusal,
 * only for malformed input. No secret ever appears in the result.
 */
export async function validatePlatform(platform, creds = {}, { env = process.env, fetch: f = globalThis.fetch } = {}) {
  const c = Object.fromEntries(Object.entries(creds).map(([k, v]) => [k, String(v || '').trim()]));
  const fail = reason => ({ ok: false, reason });
  const jsonOf = async res => { try { return await res.json(); } catch { return {}; } };

  if (platform === 'facebook') {
    if (!c.page_id || !c.token) return fail('Both the Page ID and the Page access token are required.');
    if (!/^\d{5,20}$/.test(c.page_id)) return fail('The Page ID must be the numeric ID from the Page\u2019s About panel.');
    const res = await f(`${GRAPH(env)}/${c.page_id}?fields=name,followers_count&access_token=${encodeURIComponent(c.token)}`);
    const j = await jsonOf(res);
    if (!res.ok || !j.name) return fail(`Meta refused the credentials (HTTP ${res.status}): ${j?.error?.message || 'no page name returned'}. Nothing was saved.`);
    return { ok: true, identity: { name: j.name, followers: j.followers_count ?? null } };
  }
  if (platform === 'instagram') {
    if (!c.business_id || !c.token) return fail('Both the IG business account ID and the Meta Graph token are required.');
    if (!/^\d{5,20}$/.test(c.business_id)) return fail('The IG business account ID must be numeric (the instagram_business_account id).');
    const res = await f(`${GRAPH(env)}/${c.business_id}?fields=username,followers_count&access_token=${encodeURIComponent(c.token)}`);
    const j = await jsonOf(res);
    if (!res.ok || !j.username) return fail(`Meta refused the credentials (HTTP ${res.status}): ${j?.error?.message || 'no username returned'}. Nothing was saved.`);
    return { ok: true, identity: { name: '@' + j.username, followers: j.followers_count ?? null } };
  }
  if (platform === 'tiktok') {
    if (!c.token) return fail('The TikTok access token is required.');
    const res = await f('https://open.tiktokapis.com/v2/user/info/?fields=display_name,follower_count', {
      headers: { Authorization: 'Bearer ' + c.token }
    });
    const j = await jsonOf(res);
    const user = j?.data?.user;
    if (!res.ok || !user?.display_name) return fail(`TikTok refused the token (HTTP ${res.status}): ${j?.error?.message || j?.error?.code || 'no user returned'}. Nothing was saved.`);
    return { ok: true, identity: { name: user.display_name, followers: user.follower_count ?? null } };
  }
  if (platform === 'linkedin') {
    if (!c.org_urn || !c.token) return fail('Both the organization URN and the access token are required.');
    if (!/^urn:li:organization:\d+$/.test(c.org_urn)) return fail('The organization URN must look like urn:li:organization:12345678.');
    const res = await f('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: 'Bearer ' + c.token } });
    const j = await jsonOf(res);
    if (!res.ok || !(j.sub || j.name)) return fail(`LinkedIn refused the token (HTTP ${res.status}): ${j?.message || 'no profile returned'}. Nothing was saved.`);
    return { ok: true, identity: { name: j.name || ('member ' + j.sub), org: c.org_urn } };
  }
  if (platform === 'youtube') {
    if (!c.channel_id || !c.token) return fail('Both the channel ID and the OAuth access token are required.');
    if (!/^UC[\w-]{10,}$/.test(c.channel_id)) return fail('The channel ID must be the UC\u2026 id from YouTube Studio \u2192 Advanced settings.');
    const res = await f('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', {
      headers: { Authorization: 'Bearer ' + c.token }
    });
    const j = await jsonOf(res);
    const ch = (j.items || [])[0];
    if (!res.ok || !ch) return fail(`YouTube refused the token (HTTP ${res.status}): ${j?.error?.message || 'no channel returned'}. Nothing was saved.`);
    if (ch.id !== c.channel_id) return fail(`The token belongs to channel ${ch.id} ("${ch.snippet?.title}"), not ${c.channel_id}. Nothing was saved.`);
    return { ok: true, identity: { name: ch.snippet?.title || ch.id, followers: Number(ch.statistics?.subscriberCount) || null } };
  }
  return fail(`Unknown platform "${platform}".`);
}

/** Validate, then store. Refusal stores NOTHING. */
export async function connectPlatform(db, platform, creds = {}, { env = process.env, fetch: f = globalThis.fetch } = {}) {
  if (!isPlatform(platform)) return { ok: false, reason: `Unknown platform "${platform}".` };
  const verdict = await validatePlatform(platform, creds, { env, fetch: f });
  if (!verdict.ok) return verdict;
  const stamp = new Date().toISOString();
  const rows = Object.entries(SOCIAL_KEYS[platform]).map(([field, key]) => ({
    key, value: String(creds[field] || '').trim(), updated_at: stamp
  }));
  rows.push({ key: `social_${platform}_identity`, value: JSON.stringify(verdict.identity), updated_at: stamp });
  const { error } = await db.from('site_settings').upsert(rows, { onConflict: 'key' });
  if (error) return { ok: false, reason: `The platform accepted the credentials but saving failed: ${error.message}` };
  return { ok: true, connected: true, platform, identity: verdict.identity };
}

export async function disconnectPlatform(db, platform) {
  if (!isPlatform(platform)) return { ok: false, reason: `Unknown platform "${platform}".` };
  const keys = [...Object.values(SOCIAL_KEYS[platform]), `social_${platform}_identity`];
  const { error } = await db.from('site_settings').delete().in('key', keys);
  if (error) return { ok: false, reason: error.message };
  return { ok: true, disconnected: true, platform };
}

/** Per-platform status for the desk. Secrets are never returned. */
export async function socialStatus(db, env = process.env) {
  let s = {};
  try { s = await readSettings(db); } catch { /* an unreadable store reads as "nothing connected from the desk" */ }
  const platforms = SOCIAL_PLATFORMS.map(p => {
    const keys = SOCIAL_KEYS[p.id];
    const deskComplete = Object.values(keys).every(k => String(s[k] || '').trim());
    const envComplete = Object.values(ENV_NAMES[p.id]).every(name => String(env?.[name] || '').trim());
    let identity = null;
    try { identity = s[`social_${p.id}_identity`] ? JSON.parse(s[`social_${p.id}_identity`]) : null; } catch { identity = null; }
    return {
      platform: p.id, label: p.label,
      source: deskComplete ? 'desk' : envComplete ? 'env' : 'none',
      connected: deskComplete || envComplete,
      identity: deskComplete ? identity : null,
      autopublish: p.autopublish,
      autopublishNote: p.autopublishNote || null,
      fields: p.fields.map(f => ({ ...f, saved: f.secret && s[keys[f.key]] ? '\u2022\u2022\u2022saved' : undefined })),
      connectHelp: p.connectHelp
    };
  });
  return { platforms, connectedCount: platforms.filter(p => p.connected).length };
}
