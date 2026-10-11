// ---------------------------------------------------------------------------
// Gemini failure classification — one place that turns a provider answer into
// something a human can act on.
// ---------------------------------------------------------------------------
// Split out of api/_gemini.js so that the error mapping can be unit-tested
// directly (scripts/ai-growth.test.mjs) without a network, and so no caller has
// to re-implement "was that a quota error or a bad key?".
//
// The states, and what each one means for the operator:
//
//   no-key              GEMINI_API_KEY is not set in this environment.
//   invalid-key         The key was rejected (401/403, API_KEY_INVALID…).
//   model-unavailable   The model id is not available to this key/tier (404).
//   quota-exhausted     The free-tier daily/rate allowance is spent (429). NOT
//                       retried into a storm — the caller stops for the day.
//   rate-limited        A per-minute limit (429 with a retry hint). Retried a
//                       bounded number of times.
//   timeout             The request exceeded its budget, or the provider hung.
//   truncated           The model hit the output ceiling (finishReason
//                       MAX_TOKENS). Not retried: the same request would
//                       truncate again.
//   safety-refusal      The model refused on safety grounds.
//   empty-output        A 200 with no text.
//   malformed           The response body was not the expected JSON shape.
//   provider-unavailable 5xx from Google, or a network failure.
//   unknown             Anything else. Reported as-is, never hidden.

export class GoogleGeminiError extends Error {
  constructor(message, { state = 'unknown', status = 502, retryable = false, model = null, detail = null, ownerAction = null } = {}) {
    super(message);
    this.name = 'GoogleGeminiError';
    this.state = state;
    this.status = status;
    this.retryable = retryable;
    this.model = model;
    this.detail = detail;
    this.ownerAction = ownerAction || OWNER_ACTION[state] || null;
  }
}

export const OWNER_ACTION = {
  'no-key': 'Add GEMINI_API_KEY in Vercel → Settings → Environment Variables (Production, Preview and Development), then redeploy. It is server-only: never a VITE_* variable, never in Git.',
  'invalid-key': 'The key was rejected. Create a fresh key in Google AI Studio (aistudio.google.com/apikey) and replace GEMINI_API_KEY in Vercel. Do not enable billing to "fix" this.',
  'model-unavailable': 'Set SEO_GEMINI_MODEL (or GOONET_GEMINI_MODEL) in Vercel to a model this key can use — gemini-3.8-flash is the verified free-tier default on 2026-10-11.',
  'quota-exhausted': 'The free-tier allowance for today is spent. Nothing was saved; the no-key formatter still works. Try again after the quota resets (midnight Pacific), or raise the tier deliberately — do not enable billing to make an error go away.',
  'rate-limited': 'Too many requests in a short window. The code retries a bounded number of times; if this repeats, lower the agent concurrency in CRM → AI Growth.',
  timeout: 'The provider did not answer inside the request budget. Nothing was saved. Retry later; if it repeats, the provider may be degraded.',
  truncated: 'The draft hit the output ceiling and was discarded rather than saved half-written. Shorten the topic or the supplied facts and retry.',
  'safety-refusal': 'The model declined on safety grounds. Reword the request or supply neutral, factual notes. Nothing was saved.',
  'empty-output': 'The provider returned no text. Nothing was saved; try again.',
  malformed: 'The provider returned something other than the expected JSON. Nothing was saved; retry, or use the factual formatter.',
  'provider-unavailable': 'Google’s API was unreachable or returned a server error. Nothing was saved; retry later.',
  unknown: 'Check the Vercel function log for the provider response.'
};

/** Map an HTTP status and/or a thrown error onto one of the states above. */
export function classifyGeminiFailure({ status = 0, payload = null, error = null, model = null } = {}) {
  const providerStatus = String(payload?.error?.status || '').toUpperCase();
  const providerMessage = String(payload?.error?.message || error?.message || '').trim();
  const detail = providerMessage || null;
  const make = (state, message, extra = {}) =>
    new GoogleGeminiError(message, { state, model, detail, ...extra });

  if (error && (error.name === 'AbortError' || /aborted|timeout|timed out/i.test(error.message || ''))) {
    return make('timeout', 'The Gemini request timed out; nothing was saved.', { status: 504, retryable: true });
  }
  if (error && !status) {
    return make('provider-unavailable', `Could not reach the Gemini API (${error.message || 'network error'}).`, { status: 502, retryable: true });
  }
  if (providerStatus === 'RESOURCE_EXHAUSTED' || status === 429) {
    // A daily free-tier quota does not reset by waiting a second; a per-minute
    // rate limit does. Distinguish them by the provider's own wording.
    const daily = /per day|daily|RPD|free_tier_requests/i.test(providerMessage);
    return daily
      ? make('quota-exhausted', 'The Gemini free-tier quota for today is exhausted; nothing was saved.', { status: 429, retryable: false })
      : make('rate-limited', 'Gemini rate-limited this request; nothing was saved.', { status: 429, retryable: true });
  }
  if (providerStatus === 'UNAUTHENTICATED' || providerStatus === 'PERMISSION_DENIED' || status === 401 || status === 403) {
    return make('invalid-key', 'Gemini rejected the API key; nothing was saved.', { status: 401 });
  }
  if (status === 404 || /not found|is not supported|not available/i.test(providerMessage)) {
    return make('model-unavailable', `Gemini has no usable model at that id${model ? ` (${model})` : ''}; nothing was saved.`, { status: 404 });
  }
  if (status === 400 && /API key not valid|invalid api key/i.test(providerMessage)) {
    return make('invalid-key', 'Gemini rejected the API key; nothing was saved.', { status: 401 });
  }
  if (status >= 500 || providerStatus === 'INTERNAL' || providerStatus === 'UNAVAILABLE') {
    return make('provider-unavailable', `Gemini returned HTTP ${status || 'unknown'}; nothing was saved.`, { status: 502, retryable: true });
  }
  return make('unknown', `Gemini request failed${status ? ` (HTTP ${status})` : ''}; nothing was saved.`, { status: 502 });
}
