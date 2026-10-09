// Staff-only Search Console / IndexNow workflows. This is a shared module
// dispatched by api/site-content.js, so it adds no Vercel Serverless Function.
// Every provider call is explicit, uses real API responses, and logs only a
// short non-secret audit summary in the existing activities table.
import {sign as signData} from 'node:crypto';
import {send} from './_supabase.js';
import {keywordIdeas, safeDraftSeo, generateEditorialDraft} from './_seo-content.js';
import {NEWS, articleSlug} from '../src/news-data.js';
import {
  SITE_CANONICAL_ORIGIN, SITE_SITEMAP_PATHS, canonicalSiteUrl,
  filterIndexingCandidates
} from '../src/seo-url.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_API = 'https://searchconsole.googleapis.com/webmasters/v3';
const GOOGLE_INSPECTION_API = 'https://searchconsole.googleapis.com/v1';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/webmasters';
const SEARCH_HOST = new URL(SITE_CANONICAL_ORIGIN).hostname;
const text = value => String(value ?? '').trim();
const safeResponse = async response => {
  try { return await response.json(); } catch { return {}; }
};

function envOf(injected) {
  return injected.env || process.env;
}

function fetchOf(injected) {
  return injected.fetch || globalThis.fetch;
}

function canonicalSitemapSources(input) {
  const allowed = new Set(SITE_SITEMAP_PATHS.map(path => new URL(path, SITE_CANONICAL_ORIGIN).href));
  const values = input == null
    ? SITE_SITEMAP_PATHS.map(path => new URL(path, SITE_CANONICAL_ORIGIN).href)
    : Array.isArray(input) ? input : [];
  return [...new Set(values.map(value => canonicalSiteUrl(value)).filter(url => url && allowed.has(url)))];
}

async function googleToken(fetchImpl, env, now = Date.now()) {
  let credentials;
  try { credentials = JSON.parse(text(env.GOOGLE_SERVICE_ACCOUNT_JSON)); }
  catch { return {configured: false, error: 'Google service-account JSON is missing or invalid.'}; }
  if (!credentials?.client_email || !credentials?.private_key) {
    return {configured: false, error: 'Google service-account JSON needs client_email and private_key.'};
  }
  const siteUrl = text(env.GSC_SITE_URL);
  if (!siteUrl) return {configured: false, error: 'GSC_SITE_URL is not configured.'};
  let property;
  try {
    property = new URL(siteUrl);
    if (property.origin !== SITE_CANONICAL_ORIGIN || !['https:', 'http:'].includes(property.protocol)) {
      // Domain properties use the literal `sc-domain:ar7traders.com` instead.
      if (siteUrl !== `sc-domain:${SEARCH_HOST}`) throw new Error('wrong property');
    }
  } catch {
    if (siteUrl !== `sc-domain:${SEARCH_HOST}`) {
      return {configured: true, error: 'GSC_SITE_URL must be the canonical site property or sc-domain:ar7traders.com.'};
    }
  }

  const iat = Math.floor(now / 1000);
  const b64 = value => Buffer.from(value).toString('base64url');
  const unsigned = `${b64(JSON.stringify({alg: 'RS256', typ: 'JWT'}))}.${b64(JSON.stringify({
    iss: credentials.client_email,
    scope: GOOGLE_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat,
    exp: iat + 3600
  }))}`;
  let assertion;
  try { assertion = `${unsigned}.${signData('RSA-SHA256', Buffer.from(unsigned), credentials.private_key).toString('base64url')}`; }
  catch { return {configured: true, error: 'Google service-account private key could not sign an OAuth assertion.'}; }

  try {
    const response = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion
      }).toString(),
      redirect: 'error'
    });
    const payload = await safeResponse(response);
    if (!response.ok || !payload.access_token) {
      return {configured: true, error: `Google OAuth token request failed (HTTP ${response.status}).`};
    }
    return {configured: true, accessToken: payload.access_token, siteUrl};
  } catch (error) {
    return {configured: true, error: `Google OAuth request failed: ${String(error?.message || 'network error').slice(0, 180)}.`};
  }
}

function propertyMatches(configured, actual) {
  const a = text(configured).replace(/\/$/, '');
  const b = text(actual).replace(/\/$/, '');
  return a === b || (a === `https://${SEARCH_HOST}` && b === `https://${SEARCH_HOST}/`) ||
    (a === `sc-domain:${SEARCH_HOST}` && b === `sc-domain:${SEARCH_HOST}`);
}

async function googleSites(fetchImpl, accessToken) {
  const response = await fetchImpl(`${GOOGLE_API}/sites`, {
    headers: {Authorization: `Bearer ${accessToken}`, Accept: 'application/json'},
    redirect: 'error'
  });
  const payload = await safeResponse(response);
  if (!response.ok) throw new Error(`Search Console sites request failed (HTTP ${response.status}).`);
  return Array.isArray(payload.siteEntry) ? payload.siteEntry : [];
}

async function googleConnection(fetchImpl, env, now) {
  const token = await googleToken(fetchImpl, env, now);
  if (!token.accessToken) {
    return {
      public: {
        configured: !!token.configured,
        ready: false,
        state: token.configured ? 'error' : 'not_configured',
        property: text(env.GSC_SITE_URL) || null,
        detail: token.error || 'Search Console credentials are not configured.'
      },
      accessToken: null,
      siteUrl: text(env.GSC_SITE_URL)
    };
  }
  try {
    const sites = await googleSites(fetchImpl, token.accessToken);
    const authorized = sites.some(site => propertyMatches(token.siteUrl, site.siteUrl));
    return {
      public: {
        configured: true,
        ready: authorized,
        state: authorized ? 'connected' : 'property_not_authorized',
        property: token.siteUrl,
        detail: authorized
          ? 'Search Console API access confirmed for the configured property.'
          : 'The API returned no matching property. Add the service account as a verified property user and check GSC_SITE_URL.'
      },
      accessToken: token.accessToken,
      siteUrl: token.siteUrl
    };
  } catch (error) {
    return {
      public: {
        configured: true, ready: false, state: 'error', property: token.siteUrl,
        detail: String(error?.message || 'Search Console authorization failed.').slice(0, 220)
      },
      accessToken: null,
      siteUrl: token.siteUrl
    };
  }
}

async function indexNowConnection(fetchImpl, env) {
  const key = text(env.AR7_INDEXNOW_KEY);
  if (!key) return {
    public: {configured: false, ready: false, state: 'not_configured', keyFile: null,
      detail: 'Set AR7_INDEXNOW_KEY in the deployment environment and publish the matching key file.'},
    key: null
  };
  if (!/^[a-z0-9-]{8,128}$/i.test(key)) return {
    public: {configured: true, ready: false, state: 'invalid_key', keyFile: null,
      detail: 'AR7_INDEXNOW_KEY must be 8–128 letters, numbers or hyphens.'},
    key: null
  };
  const keyFile = `${SITE_CANONICAL_ORIGIN}/${key}.txt`;
  try {
    const response = await fetchImpl(keyFile, {cache: 'no-store', redirect: 'error'});
    const body = response.ok ? text(await response.text()) : '';
    const matched = response.ok && body === key;
    return {
      public: {
        configured: true, ready: matched, state: matched ? 'connected' : 'key_file_missing', keyFile,
        detail: matched
          ? 'The public key file matches the configured key.'
          : `The public key file did not verify (HTTP ${response.status}); publish a file whose name and contents match the key.`
      },
      key: matched ? key : null
    };
  } catch {
    return {
      public: {configured: true, ready: false, state: 'verification_unavailable', keyFile,
        detail: 'Could not verify the public key file from this server. No IndexNow submission was attempted.'},
      key: null
    };
  }
}

async function connectorStates(fetchImpl, env, now) {
  const [google, indexNow] = await Promise.all([
    googleConnection(fetchImpl, env, now),
    indexNowConnection(fetchImpl, env)
  ]);
  return {google, indexNow};
}

async function articlePublicationState(db) {
  const {data, error} = await db.from('site_articles').select('title,published');
  if (error) throw new Error(`Could not verify article publication state: ${error.message || 'database read failed'}`);
  const rows = Array.isArray(data) ? data : [];
  const published = new Set(NEWS.map(articleSlug).filter(Boolean));
  const drafts = new Set();
  for (const row of rows) {
    const slug = articleSlug(row);
    if (!slug) continue;
    if (row.published === false) drafts.add(slug);
    else published.add(slug);
  }
  // A published entry wins if old draft rows happen to share its title slug.
  for (const slug of published) drafts.delete(slug);
  return {publishedNewsSlugs: [...published], draftSlugs: [...drafts]};
}

async function makePreview(body, db, fetchImpl, env, now) {
  const sitemapSources = canonicalSitemapSources(body.sitemaps);
  const urls = Array.isArray(body.urls) ? body.urls : [];
  const publication = await articlePublicationState(db);
  const filtered = filterIndexingCandidates(urls, {
    ...publication,
    noindexUrls: Array.isArray(body.noindexUrls) ? body.noindexUrls : []
  });
  const providers = await connectorStates(fetchImpl, env, now);
  return {
    sitemapSources,
    eligibleUrls: filtered.eligibleUrls,
    excluded: filtered.excluded,
    providers: {google: providers.google.public, indexNow: providers.indexNow.public},
    note: 'Preview only. Google sitemap submission and IndexNow notifications request a crawl; neither guarantees indexing.'
  };
}

async function submitGoogleSitemaps(fetchImpl, accessToken, siteUrl, sitemapSources) {
  const results = [];
  for (const sitemap of sitemapSources) {
    const endpoint = `${GOOGLE_API}/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemap)}`;
    try {
      const response = await fetchImpl(endpoint, {
        method: 'PUT',
        headers: {Authorization: `Bearer ${accessToken}`, Accept: 'application/json'},
        redirect: 'error'
      });
      results.push({sitemap, state: response.ok ? 'accepted' : 'error', httpStatus: response.status,
        detail: response.ok
          ? `Search Console accepted the sitemap submission request (HTTP ${response.status}).`
          : `Search Console rejected the sitemap request (HTTP ${response.status}).`});
    } catch (error) {
      results.push({sitemap, state: 'error', httpStatus: null,
        detail: `Search Console request failed: ${String(error?.message || 'network error').slice(0, 150)}.`});
    }
  }
  return results;
}

async function submitIndexNow(fetchImpl, key, urls) {
  if (!urls.length) return {state: 'skipped', httpStatus: null, submitted: 0, detail: 'No eligible URLs to notify.'};
  const payload = {
    host: SEARCH_HOST,
    key,
    keyLocation: `${SITE_CANONICAL_ORIGIN}/${key}.txt`,
    urlList: urls.slice(0, 10000)
  };
  try {
    const response = await fetchImpl('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: {'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json'},
      body: JSON.stringify(payload),
      redirect: 'error'
    });
    const accepted = response.ok || response.status === 202;
    return {
      state: accepted ? (response.status === 202 ? 'validation_pending' : 'accepted') : 'error',
      httpStatus: response.status,
      submitted: accepted ? payload.urlList.length : 0,
      detail: accepted
        ? `IndexNow accepted the notification request for ${payload.urlList.length} URL(s) (HTTP ${response.status}); this is not an indexing confirmation.`
        : `IndexNow rejected the notification request (HTTP ${response.status}).`
    };
  } catch (error) {
    return {state: 'error', httpStatus: null, submitted: 0,
      detail: `IndexNow request failed: ${String(error?.message || 'network error').slice(0, 150)}.`};
  }
}

async function auditSubmission(db, auth, summary) {
  const providerSummary = [
    `Search Console ${summary.google.state}`,
    `IndexNow ${summary.indexNow.state}`
  ].join('; ');
  const action = `SEO crawl notifications requested: ${summary.eligibleCount} eligible URL(s), ` +
    `${summary.sitemapCount} sitemap(s); ${providerSummary}`;
  try {
    await db.from('activities').insert({
      action,
      actor: auth?.user?.email || auth?.profile?.email || auth?.profile?.full_name || 'Staff',
      entity_type: 'seo_indexing',
      entity_id: null
    });
  } catch (error) {
    return {saved: false, detail: String(error?.message || 'Activity log write failed').slice(0, 160)};
  }
  return {saved: true, action};
}

async function inspectUrl(body, db, fetchImpl, env, now) {
  const url = canonicalSiteUrl(body.url);
  if (!url || !filterIndexingCandidates([url], {noindexUrls: Array.isArray(body.noindexUrls) ? body.noindexUrls : []}).eligibleUrls.length) {
    return {status: 400, body: {error: 'Inspect a canonical, public HTTPS URL without a query string. Staff/noindex URLs are excluded.'}};
  }
  const connection = await googleConnection(fetchImpl, env, now);
  if (!connection.public.ready || !connection.accessToken) {
    return {status: 200, body: {state: connection.public.state, detail: connection.public.detail, configured: connection.public.configured}};
  }
  const endpoint = `${GOOGLE_INSPECTION_API}/urlInspection/index:inspect`;
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {Authorization: `Bearer ${connection.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json'},
      body: JSON.stringify({inspectionUrl: url, siteUrl: connection.siteUrl, languageCode: 'en-US'}),
      redirect: 'error'
    });
    const payload = await safeResponse(response);
    if (!response.ok) return {status: 200, body: {
      state: 'error', httpStatus: response.status,
      detail: `Search Console URL inspection failed (HTTP ${response.status}).`
    }};
    const result = payload.inspectionResult?.indexStatusResult || {};
    return {status: 200, body: {
      state: 'inspected',
      inspectedAt: new Date(now).toISOString(),
      url,
      verdict: result.verdict || null,
      coverageState: result.coverageState || null,
      indexingState: result.indexingState || null,
      pageFetchState: result.pageFetchState || null,
      robotsTxtState: result.robotsTxtState || null,
      lastCrawlTime: result.lastCrawlTime || null,
      googleCanonical: result.googleCanonical || null,
      userCanonical: result.userCanonical || null,
      detail: 'Live URL Inspection result from Search Console. It reports Google’s last known state; it does not submit or force indexing.'
    }};
  } catch (error) {
    return {status: 200, body: {state: 'error', detail: `Search Console URL inspection failed: ${String(error?.message || 'network error').slice(0, 160)}.`}};
  }
}

export async function handleSeoWorkflow(req, res, action, {db, auth, injected = {}} = {}) {
  const method = String(req.method || 'GET').toUpperCase();
  const fetchImpl = fetchOf(injected);
  const env = envOf(injected);
  const now = injected.now ? Number(injected.now) : Date.now();

  if (action === 'generate' && method === 'POST') {
    try { return send(res, 200, await generateEditorialDraft(req.body || {}, {env, fetch: fetchImpl})); }
    catch (e) { return send(res, e.status || 502, {error:e.name === 'TimeoutError' ? 'AI request timed out; nothing was saved.' : e.message}); }
  }
  if (action === 'optimize-draft' && method === 'POST') {
    return send(res, 200, safeDraftSeo(req.body || {}));
  }
  if (action === 'keywords' && method === 'POST') {
    const ideas = keywordIdeas();
    const result = {ideas, opportunities:[], source:'catalogue-only', note:'Ideas are not measured search volume. Connect Search Console to see actual queries.'};
    if (env.GOOGLE_SERVICE_ACCOUNT_JSON && env.GSC_SITE_URL) {
      try {
        const token = await googleToken(fetchImpl, env, now);
        if (!token.accessToken) throw new Error(token.error);
        const endDate = new Date(now - 3*86400000).toISOString().slice(0,10);
        const startDate = new Date(now - 31*86400000).toISOString().slice(0,10);
        const response = await fetchImpl(`${GOOGLE_API}/sites/${encodeURIComponent(token.siteUrl)}/searchAnalytics/query`, {
          method:'POST', redirect:'error', signal:AbortSignal.timeout(15000),
          headers:{Authorization:`Bearer ${token.accessToken}`, 'Content-Type':'application/json'},
          body:JSON.stringify({startDate,endDate,dimensions:['query','page'],rowLimit:100,dataState:'final'})
        });
        if (!response.ok) throw new Error(`Search Console query failed (HTTP ${response.status})`);
        const payload = await response.json();
        result.opportunities = (payload.rows || []).map(r => ({query:r.keys?.[0],url:r.keys?.[1],clicks:r.clicks,impressions:r.impressions,ctr:r.ctr,position:r.position}))
          .filter(r => r.query && r.impressions > 0).sort((a,b) => b.impressions-a.impressions);
        result.source='search-console'; result.startDate=startDate; result.endDate=endDate;
        result.note='Real query impressions, not total market search volume. Review high-impression, low-CTR pages and positions 4–20 first.';
      } catch (e) {result.providerError=e.message;}
    }
    return send(res, 200, result);
  }

  if (action === 'status' && method === 'GET') {
    const states = await connectorStates(fetchImpl, env, now);
    return send(res, 200, {
      checkedAt: new Date(now).toISOString(),
      localAudit: {available: true, source: 'src/seo-audit.js', note: 'Local/shared-engine metadata audit only; not Search Console, a live crawl, or an index status.'},
      google: states.google.public,
      indexNow: states.indexNow.public
    });
  }

  if (action === 'audit' && method === 'GET') {
    try {
      const {data, error} = await db.from('activities').select('id,action,actor,entity_type,created_at')
        .eq('entity_type', 'seo_indexing').order('created_at', {ascending: false}).limit(20);
      if (error) throw new Error(error.message || 'Audit history read failed.');
      return send(res, 200, Array.isArray(data) ? data : []);
    } catch (error) {
      return send(res, 500, {error: String(error?.message || 'Audit history is unavailable.')});
    }
  }

  if (action === 'preview' && method === 'POST') {
    try {
      return send(res, 200, await makePreview(req.body || {}, db, fetchImpl, env, now));
    } catch (error) {
      return send(res, 500, {error: String(error?.message || 'Indexing preview failed.')});
    }
  }

  if (action === 'inspect' && method === 'POST') {
    const result = await inspectUrl(req.body || {}, db, fetchImpl, env, now);
    return send(res, result.status, result.body);
  }

  if (action === 'submit' && method === 'POST') {
    try {
      const preview = await makePreview(req.body || {}, db, fetchImpl, env, now);
      const {google, indexNow} = await connectorStates(fetchImpl, env, now);
      let googleResult;
      if (google.public.ready && google.accessToken) {
        const results = await submitGoogleSitemaps(fetchImpl, google.accessToken, google.siteUrl, preview.sitemapSources);
        googleResult = {
          state: results.some(row => row.state === 'accepted') ? 'accepted' : (results.length ? 'error' : 'skipped'),
          submitted: results.filter(row => row.state === 'accepted').length,
          results,
          detail: 'Sitemap submission asks Google to process these sitemap files; it does not force indexing.'
        };
      } else {
        googleResult = {state: google.public.state, submitted: 0, results: [], detail: google.public.detail};
      }
      const indexNowResult = indexNow.key
        ? await submitIndexNow(fetchImpl, indexNow.key, preview.eligibleUrls)
        : {state: indexNow.public.state, submitted: 0, httpStatus: null, detail: indexNow.public.detail};
      const result = {
        submittedAt: new Date(now).toISOString(),
        eligibleCount: preview.eligibleUrls.length,
        excludedCount: preview.excluded.length,
        sitemapCount: preview.sitemapSources.length,
        google: googleResult,
        indexNow: indexNowResult
      };
      result.audit = await auditSubmission(db, auth, result);
      return send(res, 200, result);
    } catch (error) {
      return send(res, 500, {error: String(error?.message || 'Search notification failed.')});
    }
  }

  res.setHeader('Allow', action === 'status' || action === 'audit' ? 'GET' : 'POST');
  return send(res, 405, {error: `SEO workflow ${action || '(none)'} does not support ${method}.`});
}
