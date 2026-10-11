// ---------------------------------------------------------------------------
// Google Gemini — the shared, server-only AI client.
// ---------------------------------------------------------------------------
// NOT a Serverless Function: files named api/_*.js are shared modules and do
// not count against the Vercel Hobby cap of 12 (scripts/function-count.test.mjs).
// This is the single place that talks to Gemini, so the SEO desk, the car
// importer and the growth agents all share one set of rules:
//
//   • server only — GEMINI_API_KEY is never read in the browser, never in a
//     VITE_* variable and never returned in a response;
//   • free tier only — no billing is enabled by this code, and a 429/quota
//     error is reported as "free quota reached", never retried into a storm;
//   • bounded — a request timeout, a bounded number of retries with backoff
//     and a hard output-token ceiling;
//   • honest — every failure mode (missing key, invalid key, model not
//     available, quota, timeout, truncated output, safety refusal, provider
//     outage) becomes a distinct, actionable error, and NOTHING is silently
//     substituted with a paid provider.
//
// MODELS (verified against the official docs on 2026-10-11 —
// https://ai.google.dev/gemini-api/docs/models and …/docs/pricing):
//   • gemini-3.8-flash  — stable, "Free of charge" on the Free tier for input
//     and output tokens; 1,048,576-token input limit, 65,536-token output
//     limit. This is the default.
//   • gemini-3.6-flash  — the previous-generation stable Flash model, also
//     "Free of charge" on the Free tier. Kept as a fallback id.
//   • gemini-2.5-flash / gemini-2.5-flash-lite — previous models, still listed
//     on the pricing page.
// A model id is NOT hard-coded into the callers: SEO_GEMINI_MODEL (editorial)
// and GOONET_GEMINI_MODEL (car importer) are read from site_settings or the
// server environment, so tuning editorial generation cannot change what the
// car importer uses.
//
// PRIVACY WARNING (Free tier): Google states that on the free tier content is
// "used to improve our products". Do not send customer names, contact details,
// supplier pricing or any confidential document to a free-tier model. The
// callers in this repo send editorial notes and public catalogue facts only.

import { GoogleGeminiError, classifyGeminiFailure } from './_gemini-errors.js';

export { GoogleGeminiError, classifyGeminiFailure };

/** The default model: stable, free-tier eligible, verified 2026-10-11. */
export const GEMINI_DEFAULT_MODEL = 'gemini-3.8-flash';

/** Fallbacks tried only when the configured model itself is unavailable. */
export const GEMINI_FALLBACK_MODELS = ['gemini-3.6-flash', 'gemini-2.5-flash'];

/** Token ceiling per request. Bounded output is a cost and latency control. */
export const GEMINI_MAX_OUTPUT_TOKENS = 2400;

/** Per-request timeout. A hung provider must not hold a serverless function. */
export const GEMINI_TIMEOUT_MS = 30000;

/** Retry policy: transient failures only, bounded, with backoff. */
export const GEMINI_MAX_ATTEMPTS = 3;
export const GEMINI_BACKOFF_MS = [600, 1800];

/** The API version and host. Official endpoint, no third-party proxy. */
export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** Is there a key at all? The no-key path keeps working everywhere. */
export function geminiConfigured(env = process.env) {
  return !!String(env.GEMINI_API_KEY || '').trim();
}

/** Which model this feature should use; never inferred from another feature. */
export function geminiModelFor(feature, { env = process.env, settings = {} } = {}) {
  const key = feature === 'goonet' ? 'GOONET_GEMINI_MODEL' : 'SEO_GEMINI_MODEL';
  const fromSettings = feature === 'goonet' ? settings.goonet_gemini_model : settings.seo_gemini_model;
  return String(env[key] || fromSettings || settings.gemini_model || '').trim() || GEMINI_DEFAULT_MODEL;
}

/** Never log or return the key. This is the only safe way to describe it. */
export function geminiKeyHint(env = process.env) {
  const key = String(env.GEMINI_API_KEY || '').trim();
  if (!key) return { configured: false, hint: null };
  return { configured: true, hint: `${key.slice(0, 4)}…${key.slice(-4)} (${key.length} chars)` };
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * One Gemini call, with the retry policy applied.
 *
 * Returns { text, model, usage } on success. Throws GoogleGeminiError with a
 * `state` from classifyGeminiFailure() on failure — the caller decides what to
 * tell the operator, and nothing is retried that could not succeed.
 */
export async function geminiGenerate(prompt, {
  env = process.env,
  fetch: fetchImpl = globalThis.fetch,
  model = null,
  system = null,
  maxOutputTokens = GEMINI_MAX_OUTPUT_TOKENS,
  timeoutMs = GEMINI_TIMEOUT_MS,
  json = false,
  maxAttempts = GEMINI_MAX_ATTEMPTS,
  sleep: sleepImpl = sleep,
  feature = 'seo'
} = {}) {
  const key = String(env.GEMINI_API_KEY || '').trim();
  if (!key) {
    throw new GoogleGeminiError(
      'GEMINI_API_KEY is not set in the server environment. The no-key factual formatter still works; add the key in Vercel → Settings → Environment Variables (never a VITE_* variable).',
      { state: 'no-key', status: 503 }
    );
  }
  if (typeof fetchImpl !== 'function') {
    throw new GoogleGeminiError('This runtime has no fetch available for the Gemini call.', { state: 'provider-unavailable', status: 500 });
  }

  const configured = model || geminiModelFor(feature, { env });
  const body = {
    contents: [{ role: 'user', parts: [{ text: String(prompt || '') }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: Math.max(64, Math.min(8192, Number(maxOutputTokens) || GEMINI_MAX_OUTPUT_TOKENS)),
      ...(json ? { responseMimeType: 'application/json' } : {})
    },
    // The free tier has no safety-filter override; the defaults are kept.
    ...(system ? { systemInstruction: { parts: [{ text: String(system) }] } } : {})
  };

  let lastError = null;
  for (let attempt = 0; attempt < Math.max(1, maxAttempts); attempt++) {
    if (attempt > 0) await sleepImpl(GEMINI_BACKOFF_MS[Math.min(attempt - 1, GEMINI_BACKOFF_MS.length - 1)]);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${GEMINI_API_BASE}/models/${encodeURIComponent(configured)}:generateContent`, {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body)
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const error = classifyGeminiFailure({ status: response.status, payload, model: configured, env });
        error.attempt = attempt + 1;
        // Only transient states are retried; a bad key or a quota block is not.
        if (error.retryable && attempt + 1 < maxAttempts) { lastError = error; continue; }
        throw error;
      }
      const candidate = payload?.candidates?.[0];
      const text = (candidate?.content?.parts || []).map(p => p?.text || '').join('').trim();
      const blocked = candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'PROHIBITED_CONTENT'
        || candidate?.promptFeedback?.blockReason;
      if (blocked) {
        throw new GoogleGeminiError(
          `Gemini refused to answer (${candidate?.finishReason || payload?.promptFeedback?.blockReason}). Nothing was saved — reword the request or supply more neutral facts.`,
          { state: 'safety-refusal', status: 502, model: configured }
        );
      }
      if (!text) {
        throw new GoogleGeminiError('Gemini returned an empty response; nothing was saved.', { state: 'empty-output', status: 502, model: configured });
      }
      if (candidate?.finishReason === 'MAX_TOKENS') {
        throw new GoogleGeminiError(
          'Gemini stopped because the output limit was reached — the response is truncated, so nothing was saved. Shorten the request and retry.',
          { state: 'truncated', status: 502, model: configured, text }
        );
      }
      return {
        text,
        model: configured,
        usage: payload?.usageMetadata ? {
          promptTokens: payload.usageMetadata.promptTokenCount ?? null,
          outputTokens: payload.usageMetadata.candidatesTokenCount ?? null,
          totalTokens: payload.usageMetadata.totalTokenCount ?? null
        } : null,
        finishReason: candidate?.finishReason || null
      };
    } catch (e) {
      const error = e instanceof GoogleGeminiError ? e : classifyGeminiFailure({ error: e, model: configured, env });
      if (error.retryable && attempt + 1 < maxAttempts) { lastError = error; continue; }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new GoogleGeminiError('Gemini request failed', { state: 'unknown', status: 502 });
}

/** Parse a JSON object out of a model response, tolerating code fences. */
export function parseJsonLoose(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(raw); } catch { /* fall through */ }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch { /* fall through */ }
  }
  return null;
}

/**
 * Is Gemini actually reachable and is this key allowed to use this model?
 * Used by the CRM's "Test connection" button and by the growth dashboard's
 * provider panel. It sends the smallest possible request and reports the model
 * and latency — never the key.
 */
export async function geminiConnectionTest({
  env = process.env, fetch: fetchImpl = globalThis.fetch, model = null, feature = 'seo', timeoutMs = 15000
} = {}) {
  const hint = geminiKeyHint(env);
  const chosen = model || geminiModelFor(feature, { env });
  if (!hint.configured) {
    return {
      ok: false, state: 'no-key', model: chosen, keyHint: null, latencyMs: null,
      ownerAction: 'Create a key in Google AI Studio (aistudio.google.com/apikey) and add it in Vercel → Settings → Environment Variables as GEMINI_API_KEY. Do not prefix it with VITE_ and do not put it in Git.'
    };
  }
  const started = Date.now();
  try {
    const out = await geminiGenerate('Reply with the single word: ok', {
      env, fetch: fetchImpl, model: chosen, feature, timeoutMs,
      maxOutputTokens: 16, maxAttempts: 1, json: false
    });
    return {
      ok: true, state: 'connected', model: out.model, keyHint: hint.hint,
      latencyMs: Date.now() - started, usage: out.usage,
      tier: 'free (billing not required by this code — no paid fallback exists)',
      note: 'Free-tier content may be used by Google to improve their products; send editorial notes and public catalogue facts only.'
    };
  } catch (e) {
    return {
      ok: false, state: e.state || 'unknown', model: chosen, keyHint: hint.hint,
      latencyMs: Date.now() - started, message: e.message,
      ownerAction: e.ownerAction || 'Check the Vercel function log for the provider response.'
    };
  }
}
