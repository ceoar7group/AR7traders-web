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
export async function waWebhook(req, res, { db, env, send }) {
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
        const { error } = await db.from('wa_messages').insert({
          wa_id: e.wa_id, profile_name: e.profile_name, direction: 'in',
          body: e.body, msg_type: e.msg_type, msg_id: e.msg_id,
          lead_id: leadIdForNumber(e.wa_id, leads), actor: e.profile_name || 'Customer'
        });
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
export async function waDesk(req, res, { db, profile, user, env, send, log, fetchImpl }) {
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
    return send(res, 200, { configured, number_id: configured ? String(env.WHATSAPP_PHONE_ID).slice(0, 6) + '…' : null, conversations: [...seen.values()] });
  }
  if (req.method === 'POST') {
    const b = req.body || {};
    if (b.ai === 'draft') {
      const waId = String(b.wa_id || '').replace(/\D/g, '');
      if (!waId) return send(res, 400, { error: 'wa_id is required' });
      const draft = await draftReply({ db, waId, env, fetchImpl: fetchImpl || globalThis.fetch });
      return send(res, 200, draft);
    }
    const to = String(b.to || '').replace(/\D/g, '');
    const body = String(b.body || '').trim();
    if (!to || !body) return send(res, 400, { error: 'Recipient and message are required' });
    if (!configured) return send(res, 503, { error: 'WhatsApp is not connected yet — add WHATSAPP_TOKEN, WHATSAPP_PHONE_ID and WHATSAPP_VERIFY_TOKEN in Vercel, then redeploy. See WHATSAPP-DESK.md.' });
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
