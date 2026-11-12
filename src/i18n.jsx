// Language context + the switcher.
//
// The chosen language is stored in localStorage and, where the browser exposes
// one, seeded from the visitor's own language the first time they arrive — a
// buyer in Algiers should not have to find the menu to read Arabic.
//
// Switching updates `document.documentElement.lang` and `.dir` so screen
// readers, search engines and the browser's own hyphenation all follow, and it
// emits an `ar7:language` event that the SEO module listens to (src/seo.js).
//
// 2026-11 (international SEO): the language is also in the URL. `?lang=ur` on
// any page opens it in Urdu — so a shared link arrives in the reader's
// language, and so Google can crawl and rank each language variant (applySeo
// publishes the hreflang set and a self-canonical per variant). English stays
// on the clean URL and is the x-default. The URL wins over localStorage on
// arrival; switching rewrites the address bar in place (replaceState — a
// language choice is not a navigation). The catalogue, prices and stock
// references stay identical in every language.

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { LANGUAGES, DEFAULT_LANG, LANG_KEY, LANG_PARAM, langFromSearch, translate, isRtl, langMeta, registerDicts, loadedLangs } from './i18n.js';
import { Globe2, Check } from 'lucide-react';

// The default context is complete on purpose: components rendered outside the
// provider (the isolated render tests, the CRM bundle) must degrade to English
// rather than crash on a missing field.
const LangContext = createContext({
  code: DEFAULT_LANG,
  dir: 'ltr',
  rtl: false,
  ready: true,
  meta: langMeta(DEFAULT_LANG),
  setLang: () => {},
  t: (key, vars) => translate(DEFAULT_LANG, key, vars)
});

const browserDefault = () => {
  // A language named in the URL wins: it is what the sender of the link (or
  // the search result the visitor clicked) explicitly asked this page to be.
  try {
    const fromUrl = langFromSearch(location.search);
    if (fromUrl) return fromUrl;
  } catch { /* no URL to read (isolated render tests) */ }
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored && LANGUAGES.some(l => l.code === stored)) return stored;
    const nav = String(navigator.language || '').slice(0, 2).toLowerCase();
    if (LANGUAGES.some(l => l.code === nav)) return nav;
  } catch { /* private mode: stay on English */ }
  return DEFAULT_LANG;
};

export function LanguageProvider({ children }) {
  const [code, setCode] = useState(browserDefault);
  const [ready, setReady] = useState(false);   // dictionaries loaded

  /**
   * Load the dictionaries once, then keep them. English is already in the
   * bundle; everything else arrives as its own chunk the first time somebody
   * needs it — which is the only moment it is worth downloading.
   */
  useEffect(() => {
    let alive = true;
    (async () => {
      const start = browserDefault();
      if (start === DEFAULT_LANG) { if (alive) setReady(true); return; }
      try {
        const mod = await import('./i18n-dicts.js');
        registerDicts(mod.default);
      } catch { /* stay on English if the chunk cannot load */ }
      if (alive) setReady(true);
    })();
    return () => { alive = false; };
  }, []);

  const chooseLang = useMemo(() => async next => {
    if (next === DEFAULT_LANG) { setCode(DEFAULT_LANG); return; }
    if (!loadedLangs().includes(next)) {
      try {
        const mod = await import('./i18n-dicts.js');
        registerDicts(mod.default);
      } catch { return; }   // dictionary unavailable: keep the current language
    }
    setCode(next);
  }, []);

  useEffect(() => {
    const meta = langMeta(code);
    const root = document.documentElement;
    root.lang = code;
    root.dir = meta.dir;
    root.setAttribute('data-lang', code);
    try { localStorage.setItem(LANG_KEY, code); } catch { /* ignore */ }
    // Keep the address bar naming the language (?lang=ur) so the URL someone
    // copies opens in their language. English means the clean URL. Rewritten
    // in place — switching languages is not a navigation, so no history entry.
    try {
      const params = new URLSearchParams(String(location.search || '').replace(/^\?/, ''));
      if (code === DEFAULT_LANG) params.delete(LANG_PARAM);
      else params.set(LANG_PARAM, code);
      const search = params.toString();
      const next = location.pathname + (search ? '?' + search : '') + (location.hash || '');
      const now = location.pathname + (location.search || '') + (location.hash || '');
      if (next !== now) history.replaceState(history.state, '', next);
    } catch { /* no history to write (isolated render tests) */ }
    try { window.dispatchEvent(new CustomEvent('ar7:language', { detail: { code } })); } catch { /* ignore */ }
    // Keep any server-rendered/static copy in step with the choice.
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) metaDescription.setAttribute('data-lang', code);
  }, [code]);

  const value = useMemo(() => ({
    code,
    // While the chunk is in flight the page renders in the stored language as
    // soon as it arrives; until then English is shown rather than nothing.
    dir: langMeta(ready ? code : DEFAULT_LANG).dir,
    rtl: isRtl(ready ? code : DEFAULT_LANG),
    meta: langMeta(code),
    ready,
    setLang: chooseLang,
    t: (key, vars) => translate(ready ? code : DEFAULT_LANG, key, vars)
  }), [code, ready, chooseLang]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);

/** The header dropdown. Renders the language list with native names. */
export function LanguageSwitcher({ compact = false }) {
  const { code, setLang, t, meta } = useLang();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = e => { if (!e.target.closest?.('.lang-switch')) setOpen(false); };
    const esc = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('click', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div className="lang-switch">
      {/* 2026-11-07 redesign (owner request): a clear language pill — gold
          globe chip + the language's own short code — instead of a plain
          icon-box that read as "settings". Same panel, same behaviour. */}
      <button type="button" className="lang-btn" aria-haspopup="listbox"
        aria-expanded={open} aria-label={`${t('nav.language')}: ${meta.native}`}
        title={`${t('nav.language')} — ${meta.label}`} onClick={() => setOpen(v => !v)}>
        <i className="lang-globe" aria-hidden="true"><Globe2/></i>
        <span className="lang-code">{code.toUpperCase()}</span>
        <svg className="lang-chev" aria-hidden="true" width="8" height="8" viewBox="0 0 10 10"><path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
      </button>
      {open && (
        <div className="lang-panel" role="listbox" aria-label={t('nav.language')}>
          <div className="lang-panel-head">{t('nav.language')}</div>
          {LANGUAGES.map(l => (
            <button key={l.code} type="button" role="option" aria-selected={l.code === code}
              className={l.code === code ? 'active' : ''}
              dir={l.dir}
              onClick={() => { setLang(l.code); setOpen(false); }}>
              <span className="lang-native">{l.native}</span>
              {!compact && <small>{l.label}</small>}
              {l.code === code && <Check size={13}/>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
