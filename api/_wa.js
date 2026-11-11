// WhatsApp Cloud API desk — shared module.
//
// Files named api/_*.js are shared modules, not Serverless Functions, so this
// does not count against the Vercel Hobby 12-function cap
// (see scripts/function-count.test.mjs). The two counted functions that use it:
//
//   api/leads.js  ?wa=webhook&key=…  — Meta's webhook (GET verify handshake,
//                                      POST message/status events). Public by
//                                      necessity; guarded by the verify token
//                                      carried in the registered callback URL.
//   api/crm.js    ?entity=wa         — the staff desk (list conversations,
//                                      read a thread, send a reply, AI draft).
//                                      Signed-in staff only.
//
// WHY the Cloud API and not a bolted-on phone: Meta's own API is the only
// WhatsApp automation that does not risk the number being banned, and its
// service conversations (replies within 24h of a customer's message) are
// free. Business-INITIATED template messages are billed by Meta — this desk
// therefore only sends free-form replies inside the service window and keeps
// the first contact on the agent's own phone via the Call Desk wa.me links.
//
// Env (all four required before the desk reports configured:true):
//   WHATSAPP_TOKEN         — permanent System User access token
//   WHATSAPP_PHONE_ID      — the business phone-number ID (not the number)
//   WHATSAPP_VERIFY_TOKEN  — any secret string; used in the webhook URL + handshake
//   (optional) WHATSAPP_GRAPH_VERSION — defaults to v21.0
//
// AI replies: drafts reuse the same Gemini/OpenAI helper as the on-site chat
// (scripts/goonet-core.mjs). Automatic replies are OFF unless the
// site_settings row wa_auto_reply === 'on' — an explicit owner decision,
// never a default.

const GRAPH = env => 'https://graph.facebook.com/' + (env.WHATSAPP_GRAPH_VERSION || 'v21.0');

export const waConfigured = env =>
  !!(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_ID && env.WHATSAPP_VERIFY_TOKEN);

// Direct connect (2026-11-11 owner request): credentials pasted into the desk
// are stored in site_settings (wa_cloud_token / wa_cloud_phone_id /
// wa_cloud_verify_token) so connecting needs NO Vercel env edit and NO
// redeploy. The overlay only applies when all three rows exist — a partial
// save can never half-shadow a working env config. Secrets safety: these keys
// are not in api/settings.js PUBLIC_KEYS (never readable anonymously), not in
// WRITABLE_KEYS (the generic settings PATCH cannot write them — only the
// admin-gated connect action below), and the authenticated settings GET
// masks their values.
export async function resolveWaEnv(db, env) {
  try {
    const { data } = await db.from('site_settings').select('key,value');
    const s = Object.fromEntries((data || []).map(r => [r.key, r.value]));
    if (s.wa_cloud_token && s.wa_cloud_phone_id && s.wa_cloud_verify_token) {
      return {
        ...env,
        WHATSAPP_TOKEN: s.wa_cloud_token,
        WHATSAPP_PHONE_ID: s.wa_cloud_phone_id,
        WHATSAPP_VERIFY_TOKEN: s.wa_cloud_verify_token,
        WA_SOURCE: 'desk'
      };
    }
    return waConfigured(env) ? { ...env, WA_SOURCE: 'env' } : env;
  } catch {
    // The settings read failing must never take the webhook down — fall back
    // to the environment, exactly the pre-2026-11-11 behaviour.
    return env;
  }
}

/** Flatten Meta's nested webhook payload into plain events. Pure. */
export function parseWebhookEvents(payload) {
  const out = [];
  for (const entry of payload?.entry || []) {
    for (const ch of entry?.changes || []) {
      const v = ch?.value || {};
      for (const m of v.messages || []) {
        const name = (v.contacts || []).find(c => c?.wa_id === m?.from)?.profile?.name || null;
        let body = '';
        if (m?.type === 'text') body = String(m.text?.body || '');
        else if (m?.type === 'button') body = String(m.button?.text || '');
        else if (m?.type === 'interactive') body = String(m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '');
        else if (m?.type === 'reaction') body = String(m.reaction?.emoji || '');
        else body = '[' + String(m?.type || 'unsupported') + ' message]';
        out.push({
          kind: 'message',
          wa_id: String(m?.from || '').replace(/\D/g, ''),
          msg_id: m?.id || null,
          msg_type: String(m?.type || 'text').slice(0, 24),
          body: body.slice(0, 4000),
          profile_name: name ? String(name).slice(0, 120) : null
        });
      }
      for (const s of v.statuses || []) {
        if (s?.id) out.push({ kind: 'status', msg_id: s.id, status: String(s?.status || '').slice(0, 24) });
      }
    }
  }
  return out;
}

/** Match a WhatsApp number to an existing lead by phone-tail. Pure. */
export function leadIdForNumber(waId, leads) {
  const tail = String(waId || '').replace(/\D/g, '').slice(-9);
  if (tail.length < 7) return null;
  const hit = (leads || []).find(l => String(l?.phone || '').replace(/\D/g, '').endsWith(tail));
  return hit?.id || null;
}

/** Send one free-form text via the Cloud API. Returns the Meta message id. */
export async function sendText({ to, body, env, fetch }) {
  const r = await fetch(`${GRAPH(env)}/${env.WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.WHATSAPP_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: String(to).replace(/\D/g, ''), type: 'text', text: { preview_url: true, body: String(body).slice(0, 4000) } })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    // Meta's error text can include the recipient number — keep logs clean.
    const code = j?.error?.code || r.status;
    throw Object.assign(new Error('WhatsApp did not accept the message (code ' + code + '). Check the token, the phone-number ID and that the customer wrote to you within the last 24 hours.'), { status: 502 });
  }
  return j?.messages?.[0]?.id || null;
}

/** Draft a reply with the shared LLM helper; deterministic fallback without a key. */
async function draftReply({ db, waId, env, fetchImpl }) {
  const { data: msgs } = await db.from('wa_messages').select('direction,body,created_at')
    .eq('wa_id', waId).order('created_at', { ascending: false }).limit(12);
  const thread = (msgs || []).reverse();
  const lastIn = [...thread].reverse().find(m => m.direction === 'in');
  let stock = [];
  try {
    const { data } = await db.from('site_listings').select('make,model,year,km,price,published').limit(40);
    stock = (data || []).filter(r => r.published !== false).slice(0, 8);
  } catch { /* stock is garnish, not a requirement */ }

  const { askLlm, llmConfigured } = await import('../scripts/goonet-core.mjs');
  if (llmConfigured()) {
    try {
      const r = await askLlm({
        system: 'You are a WhatsApp sales agent for AR7 Traders, a Japan/China vehicle exporter. Write ONE short reply (under 90 words, no markdown, no emojis beyond one at most) to the customer\'s last message. Be honest: never invent prices, stock or duty rates. If asked for a price, point to a written quotation. Current published stock sample: '
          + stock.map(s => `${s.year} ${s.make} ${s.model} ($${s.price})`).join('; '),
        messages: [{ role: 'user', content: thread.map(m => (m.direction === 'in' ? 'Customer: ' : 'AR7: ') + m.body).join('\n') || 'Customer: (no message)' }],
        maxTokens: 400
      });
      const text = String(r?.text || '').trim();
      if (text) return { text: text.slice(0, 1200), source: 'ai' };
    } catch { /* fall through to the honest canned draft */ }
  }
  return {
    text: lastIn
      ? 'Thank you for your message! A member of our Japan export desk is reading it now and will reply shortly. If it is urgent, you can also call us — we are available Mon–Sat, 09:00–19:00 JST.'
      : 'Hello! This is AR7 Traders — how can we help with your vehicle import today?',
    source: 'canned'
  };
}

/**
 * Public webhook — mounted by api/leads.js on ?wa=webhook.
 * GET  — Meta's one-time verify handshake (hub.challenge echo).
 * POST — message/status events. Always answers 200 once the key matches,
 *        because Meta retries non-200s and would hammer the function.
 */
export async function waWebhook(req, res, { db, env: rawEnv, send }) {
  // Desk-stored credentials (direct connect) win over Vercel env when all
  // three are saved; otherwise this is exactly the old env-only behaviour.
  const env = await resolveWaEnv(db, rawEnv);
  const token = String(env.WHATSAPP_VERIFY_TOKEN || '');
  if (req.method === 'GET') {
    const q = req.query || {};
    if (token && q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === token) {
      res.statusCode = 200; res.setHeader('Content-Type', 'text/plain');
      res.end(String(q['hub.challenge'] || '')); return;
    }
    return send(res, 403, { error: 'Webhook verification failed' });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  // The callback URL registered with Meta carries &key=<verify token>; a POST
  // without it is not Meta. (Signature checking needs the raw body, which the
  // platform's JSON parser has already consumed — the URL key is the honest,
  // testable equivalent and the URL itself is secret.)
  if (!token || String(req.query?.key || '') !== token) return send(res, 403, { error: 'Bad webhook key' });

  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b || '{}'); } catch { b = {}; } }
  const events = parseWebhookEvents(b);
  let leads = null;
  const autoReplies = [];
  for (const e of events) {
    try {
      if (e.kind === 'message' && e.wa_id) {
        if (!leads) { try { leads = (await db.from('leads').select('id,phone').limit(500)).data || []; } catch { leads = []; } }
        const leadId = leadIdForNumber(e.wa_id, leads);
        const { error } = await db.from('wa_messages').insert({
          wa_id: e.wa_id, profile_name: e.profile_name, direction: 'in',
          body: e.body, msg_type: e.msg_type, msg_id: e.msg_id,
          lead_id: leadId, actor: e.profile_name || 'Customer'
        });
        // Auto-capture (2026-11): an UNKNOWN number writing to the business
        // number is a real enquiry — file it as a lead automatically so the
        // contact lands in the pipeline and the Call desk with zero typing.
        // Consent-sound by construction: only people who messaged US first.
        // Runs only when the message row stored (a Meta retry errors on the
        // duplicate msg_id above, so a retried event cannot duplicate the lead).
        if (!error && !leadId) {
          try {
            const { data: created } = await db.from('leads').insert({
              name: e.profile_name || 'WhatsApp +' + e.wa_id,
              phone: '+' + e.wa_id,
              country: 'Other',
              vehicle_interest: 'WhatsApp enquiry',
              source: 'WhatsApp',
              status: 'new',
              notes: 'Auto-captured from the first inbound WhatsApp message.'
                + (e.body ? '\nFirst message: ' + e.body.slice(0, 500) : '')
            }).select().single();
            if (created?.id) {
              leads.push({ id: created.id, phone: '+' + e.wa_id });
              if (e.msg_id) await db.from('wa_messages').update({ lead_id: created.id }).eq('msg_id', e.msg_id);
              await db.from('activities').insert({ action: 'New WhatsApp enquiry (auto-captured)', actor: 'WhatsApp desk', entity_type: 'lead', entity_id: created.id });
            }
          } catch { /* capture failure must never fail the webhook */ }
        }
        // Duplicate msg_id = Meta retry of an event we already stored. Skip
        // the auto-reply too, or every retry would message the customer again.
        if (!error && e.msg_type === 'text') autoReplies.push(e.wa_id);
      } else if (e.kind === 'status' && e.msg_id) {
        await db.from('wa_messages').update({ status: e.status }).eq('msg_id', e.msg_id);
      }
    } catch { /* one bad event must not fail the batch — Meta would retry all of it */ }
  }

  // Optional AI auto-reply — only when the owner flipped wa_auto_reply ON.
  if (autoReplies.length && waConfigured(env)) {
    try {
      const { data } = await db.from('site_settings').select('key,value').eq('key', 'wa_auto_reply');
      if ((data || [])[0]?.value === 'on') {
        for (const waId of [...new Set(autoReplies)]) {
          const draft = await draftReply({ db, waId, env, fetchImpl: globalThis.fetch });
          const msgId = await sendText({ to: waId, body: draft.text, env, fetch: globalThis.fetch });
          await db.from('wa_messages').insert({
            wa_id: waId, direction: 'out', body: draft.text, msg_type: 'text',
            msg_id: msgId, status: 'sent', actor: draft.source === 'ai' ? 'AI agent' : 'Auto-reply'
          });
        }
      }
    } catch { /* auto-reply failures never fail the webhook */ }
  }
  return send(res, 200, { ok: true, received: events.length });
}

/**
 * Staff desk — mounted by api/crm.js on ?entity=wa (auth already done there).
 * GET            → { configured, number, conversations:[…] }
 * GET &with=<id> → { configured, messages:[…] }
 * POST {to,body} → send a reply (requires leads.write — enforced by caller)
 * POST {ai:'draft',wa_id} → AI reply draft; nothing is sent or stored.
 */
export async function waDesk(req, res, { db, profile, user, env: rawEnv, send, log, fetchImpl }) {
  const env = await resolveWaEnv(db, rawEnv);
  const configured = waConfigured(env);
  if (req.method === 'GET') {
    const withId = String(req.query?.with || '').replace(/\D/g, '');
    if (withId) {
      const { data, error } = await db.from('wa_messages').select('*')
        .eq('wa_id', withId).order('created_at', { ascending: true }).limit(500);
      if (error) throw error;
      return send(res, 200, { configured, messages: data || [] });
    }
    const { data, error } = await db.from('wa_messages').select('wa_id,profile_name,direction,body,created_at')
      .order('created_at', { ascending: false }).limit(1000);
    if (error) throw error;
    const seen = new Map();
    for (const m of data || []) {
      const c = seen.get(m.wa_id) || { wa_id: m.wa_id, name: null, last: '', last_at: m.created_at, last_dir: m.direction, count: 0 };
      if (!c.last) { c.last = m.body; c.last_at = m.created_at; c.last_dir = m.direction; }
      if (!c.name && m.profile_name) c.name = m.profile_name;
      c.count++;
      seen.set(m.wa_id, c);
    }
    return send(res, 200, { configured, source: configured ? (env.WA_SOURCE || 'env') : null, number_id: configured ? String(env.WHATSAPP_PHONE_ID).slice(0, 6) + '…' : null, conversations: [...seen.values()] });
  }
  if (req.method === 'POST') {
    const b = req.body || {};
    // Direct connect (2026-11-11): paste the Meta credentials straight into
    // the desk — validated against the Graph API BEFORE anything is stored,
    // so a typo'd token can never shadow a working config. settings.write
    // only (enforced in api/crm.js). Nothing is saved when Meta says no.
    if (b.connect) {
      const tok = String(b.connect.token || '').trim();
      const phoneId = String(b.connect.phone_id || '').replace(/\D/g, '');
      const verify = String(b.connect.verify_token || '').trim();
      if (!tok || !phoneId || !verify) return send(res, 400, { error: 'All three values are required: access token, phone-number ID and a verify token.' });
      if (verify.length < 6) return send(res, 400, { error: 'Pick a verify token of at least 6 characters — it guards your public webhook URL.' });
      try {
        const f = fetchImpl || globalThis.fetch;
        const r = await f(`${GRAPH(rawEnv)}/${phoneId}?fields=display_phone_number,verified_name,quality_rating`, {
          headers: { Authorization: 'Bearer ' + tok }
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          return send(res, 200, { ok: false, error: 'Meta refused these credentials (' + (j?.error?.code || r.status) + '): ' + (j?.error?.message || 'unknown error') + '. Nothing was saved — check the access token (not expired?) and the phone-number ID (the long ID under the number, not the number itself).' });
        }
        const now = new Date().toISOString();
        const rows = [['wa_cloud_token', tok], ['wa_cloud_phone_id', phoneId], ['wa_cloud_verify_token', verify]]
          .map(([key, value]) => ({ key, value, updated_at: now }));
        const { error } = await db.from('site_settings').upsert(rows, { onConflict: 'key' });
        if (error) throw error;
        if (log) await log(db, profile, 'WhatsApp connected from the desk (number ID ' + phoneId.slice(0, 6) + '…)', 'wa', null);
        return send(res, 200, { ok: true, connected: true, number: j.display_phone_number || null, name: j.verified_name || null, quality: j.quality_rating || null });
      } catch (err) {
        return send(res, 200, { ok: false, error: 'Could not reach Meta: ' + (err?.message || 'network error') + '. Nothing was saved — try again in a moment.' });
      }
    }
    if (b.disconnect) {
      for (const key of ['wa_cloud_token', 'wa_cloud_phone_id', 'wa_cloud_verify_token']) {
        const { error } = await db.from('site_settings').delete().eq('key', key);
        if (error) throw error;
      }
      if (log) await log(db, profile, 'WhatsApp desk credentials removed', 'wa', null);
      return send(res, 200, { ok: true, connected: false });
    }
    // Live connection test (2026-11): asks Meta's Graph API about the
    // configured phone-number ID and reports the REAL connected number (or
    // Meta's exact error), so "is it connected?" never needs guesswork.
    // Always answers 200 with an ok flag — a failed test is a result, not a
    // server error.
    if (b.test) {
      if (!configured) {
        const missing = ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID', 'WHATSAPP_VERIFY_TOKEN'].filter(k => !env[k]);
        return send(res, 200, { ok: false, configured: false, error: 'Not connected yet — missing: ' + missing.join(', ') + '. Paste the credentials into Connect directly below (no redeploy), or add them in Vercel (step 3 of the wizard) and redeploy, then test again.' });
      }
      try {
        const f = fetchImpl || globalThis.fetch;
        const r = await f(`${GRAPH(env)}/${env.WHATSAPP_PHONE_ID}?fields=display_phone_number,verified_name,quality_rating`, {
          headers: { Authorization: 'Bearer ' + env.WHATSAPP_TOKEN }
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          return send(res, 200, { ok: false, configured: true, error: 'Meta refused the credentials (' + (j?.error?.code || r.status) + '): ' + (j?.error?.message || 'unknown error') + '. Check WHATSAPP_TOKEN (not expired?) and WHATSAPP_PHONE_ID (the phone-number ID, not the number itself).' });
        }
        return send(res, 200, { ok: true, configured: true, number: j.display_phone_number || null, name: j.verified_name || null, quality: j.quality_rating || null });
      } catch (err) {
        return send(res, 200, { ok: false, configured: true, error: 'Could not reach Meta: ' + (err?.message || 'network error') });
      }
    }
    if (b.ai === 'draft') {
      const waId = String(b.wa_id || '').replace(/\D/g, '');
      if (!waId) return send(res, 400, { error: 'wa_id is required' });
      const draft = await draftReply({ db, waId, env, fetchImpl: fetchImpl || globalThis.fetch });
      return send(res, 200, draft);
    }
    const to = String(b.to || '').replace(/\D/g, '');
    const body = String(b.body || '').trim();
    if (!to || !body) return send(res, 400, { error: 'Recipient and message are required' });
    if (!configured) return send(res, 503, { error: 'WhatsApp is not connected yet — use Connect directly on the desk (paste the Meta credentials, no redeploy), or add WHATSAPP_TOKEN, WHATSAPP_PHONE_ID and WHATSAPP_VERIFY_TOKEN in Vercel and redeploy. See WHATSAPP-DESK.md.' });
    const msgId = await sendText({ to, body, env, fetch: fetchImpl || globalThis.fetch });
    const { data, error } = await db.from('wa_messages').insert({
      wa_id: to, direction: 'out', body, msg_type: 'text', msg_id: msgId,
      status: 'sent', actor: profile?.full_name || profile?.email || 'Staff'
    }).select().single();
    if (error) throw error;
    if (log) await log(db, profile, 'WhatsApp reply sent', 'wa', data.id);
    return send(res, 201, data);
  }
  return send(res, 405, { error: 'Method not allowed' });
}
