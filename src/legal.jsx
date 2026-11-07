// Legal pages: /privacy, /cookies, /terms (terms includes the export policy).
//
// LAZY CHUNK — imported through lazyRetry in main.jsx so the policy text never
// weighs on the first-load JS budget (scripts/bundle-budget.test.mjs).
//
// HONESTY RULES FOR THIS FILE
//   • Every statement here must describe what the site actually does today.
//     The storage table lists the real localStorage/sessionStorage keys in the
//     codebase; the processor list is the real infrastructure (Vercel,
//     Supabase, Resend, Google Gemini for the chat assistant).
//   • The site sets NO advertising or cross-site tracking cookies, and this
//     page says exactly that. Vercel Web Analytics is cookieless.
//   • Contact details come from site settings (the same source as the footer),
//     so a change in the CRM propagates here too.
import React from 'react';
import { Mail, Phone, MessageCircle, ShieldCheck, Clock3, FileCheck, Info } from 'lucide-react';
import { getSettings } from './site-settings.js';
import { linkClick } from './routing.js';
import './legal.css';

const UPDATED = '7 November 2026';

function Toc({ items }) {
  return (
    <nav className="legal-toc" aria-label="On this page">
      <b>ON THIS PAGE</b>
      {items.map(([id, label]) => <a key={id} href={'#' + id}>{label}</a>)}
    </nav>
  );
}

function ContactCard({ s }) {
  return (
    <div className="legal-contact-card">
      <b>Questions about this policy?</b>
      <a href={'mailto:' + s.contact_email}><Mail /> {s.contact_email}</a>
      <a href={'https://wa.me/' + String(s.whatsapp_number || '').replace(/\D/g, '')} target="_blank" rel="noopener noreferrer"><MessageCircle /> WhatsApp {s.whatsapp_number}</a>
      {s.contact_phone && <a href={'tel:' + String(s.contact_phone).replace(/[^+\d]/g, '')}><Phone /> {s.contact_phone}</a>}
    </div>
  );
}

function CrossLinks({ type, navigate }) {
  const links = [
    ['privacy', '/privacy', 'Privacy Policy'],
    ['cookies', '/cookies', 'Cookie Policy'],
    ['terms', '/terms', 'Terms & Export Policy']
  ].filter(l => l[0] !== type);
  return (
    <div className="legal-cross">
      {links.map(([key, href, label]) => <a key={key} href={href} onClick={linkClick(key, navigate)}>{label}</a>)}
      <a href="/contact" onClick={linkClick('contact', navigate)}>Contact us</a>
    </div>
  );
}

// The real browser-storage keys this codebase writes, kept in one table so the
// cookie policy can never drift quietly out of date.
const STORAGE_ROWS = [
  ['ar7-consent-v1', 'localStorage', 'Remembers that you dismissed the cookie notice.', 'Until you clear your browser data'],
  ['ar7-lang', 'localStorage', 'Your chosen website language.', 'Until cleared'],
  ['ar7-display-currency', 'localStorage', 'Your chosen display currency.', 'Until cleared'],
  ['ar7-exchange-rates', 'localStorage', 'A cached copy of exchange rates so prices convert instantly.', 'Refreshed automatically'],
  ['ar7-theme', 'localStorage', 'Colour theme preference (light, dark, blue & gold).', 'Until cleared'],
  ['ar7-favs', 'localStorage', 'Vehicles you marked with the heart icon, on this device.', 'Until cleared'],
  ['ar7-inv-pp', 'localStorage', 'How many vehicles you show per inventory page.', 'Until cleared'],
  ['ar7-recent-q', 'localStorage', 'Your recent searches, shown when you reopen the search bar.', 'Until cleared'],
  ['ar7-inv-q / scroll keys', 'sessionStorage', 'Carries a search from one page to another and restores your scroll position.', 'Current tab only'],
  ['Supabase auth token', 'localStorage', 'Keeps you signed in to your customer account or the staff CRM.', 'Until sign-out'],
];

function PrivacyPage({ navigate, s }) {
  return (
    <article className="legal-article">
      <p className="lead">AR7 Traders exports used vehicles and machinery from Japan. This policy explains what personal data we collect when you use ar7traders.com, why we collect it, where it is stored and what rights you have. We collect the minimum we need to answer your enquiry and deliver your vehicle — and nothing is ever sold to third parties.</p>
      <div className="legal-meta">
        <span><Clock3 /> Last updated: {UPDATED}</span>
        <span><ShieldCheck /> No data sold. No ad tracking.</span>
      </div>

      <section id="who">
        <h2>1. Who we are</h2>
        <p><b>AR7 Traders</b> (AR7 Group Limited) operates this website and the vehicle export service behind it, with buying operations in Japan and customer service reachable on a UK number. For anything in this policy, contact us at <a href={'mailto:' + s.contact_email}>{s.contact_email}</a> or on WhatsApp at {s.whatsapp_number}. We are the data controller for the personal data described below.</p>
      </section>

      <section id="collect">
        <h2>2. What we collect, and why</h2>
        <h3>Enquiries and quotes</h3>
        <p>When you send an enquiry (enquiry form, vehicle offer, contact form or the chat assistant's callback option) we collect your <b>name, email address, phone / WhatsApp number, destination country and your message</b>. We use it to answer you, prepare quotations and arrange the export you asked about. Legal basis: taking steps at your request before entering a contract.</p>
        <h3>Customer accounts</h3>
        <p>If you create an account we store your <b>email address and the profile details you choose to add</b>, so you can track your enquiries and saved vehicles. Legal basis: performing our contract with you.</p>
        <h3>Buying a vehicle</h3>
        <p>Completing an export requires the details every shipment needs: <b>consignee name, delivery address, port, and payment references</b>. Shipping documents (invoice, bill of lading, export certificate) legally must carry some of this data. Legal basis: contract and legal obligation.</p>
        <h3>Chat assistant</h3>
        <p>Messages you type into the on-site assistant are processed to generate an answer, including by our AI provider (Google Gemini). Don't put sensitive personal information in the chat — it is for questions about cars, prices and shipping.</p>
        <h3>What we do NOT collect</h3>
        <p>No advertising identifiers, no cross-site tracking, no data purchased from brokers, and we never ask for card details on this website — payment is arranged by invoice through your named bank.</p>
      </section>

      <section id="processors">
        <h2>3. Where your data lives</h2>
        <p>We use a small set of infrastructure providers, each processing data only on our instructions:</p>
        <ul>
          <li><b>Vercel</b> — hosts this website and its forms.</li>
          <li><b>Supabase</b> — our database, where enquiries and accounts are stored.</li>
          <li><b>Resend</b> — delivers our notification and reply emails.</li>
          <li><b>Google (Gemini)</b> — generates chat-assistant answers from the message you send it.</li>
        </ul>
        <p>These providers may process data outside your country, including in the United States and Japan, under their standard contractual safeguards.</p>
      </section>

      <section id="retention">
        <h2>4. How long we keep it</h2>
        <ul>
          <li><b>Enquiries that do not become orders</b> — kept while we correspond, then deleted from the active CRM during periodic clean-ups.</li>
          <li><b>Completed exports</b> — shipping and invoice records are kept as long as tax and export law requires.</li>
          <li><b>Accounts</b> — kept until you ask us to delete the account.</li>
        </ul>
      </section>

      <section id="rights">
        <h2>5. Your rights</h2>
        <p>Wherever you live, we honour the same set of rights: ask us <b>what we hold</b> about you, have it <b>corrected</b>, have it <b>deleted</b> (unless shipping-document law requires us to keep it), <b>object</b> to any use, and receive a <b>copy</b> of it. One email to <a href={'mailto:' + s.contact_email}>{s.contact_email}</a> is enough — we answer within 30 days. If you are in the UK or EU you can also complain to your data-protection authority.</p>
      </section>

      <section id="cookies-ref">
        <h2>6. Cookies and device storage</h2>
        <p>This site uses no advertising cookies at all. What it does store on your device (your language, currency, saved cars and similar preferences) is listed key-by-key in the <a href="/cookies" onClick={linkClick('cookies', navigate)}>Cookie Policy</a>.</p>
      </section>

      <ContactCard s={s} />
      <CrossLinks type="privacy" navigate={navigate} />
    </article>
  );
}

function CookiesPage({ navigate, s }) {
  return (
    <article className="legal-article">
      <p className="lead">The short version: <b>ar7traders.com sets no advertising or cross-site tracking cookies.</b> We use your browser's storage for practical preferences — the language you picked, the currency you want prices in, the cars you saved — and cookieless, anonymous page-view analytics. Here is the complete list.</p>
      <div className="legal-meta">
        <span><Clock3 /> Last updated: {UPDATED}</span>
        <span><ShieldCheck /> No ad cookies. No cross-site tracking.</span>
      </div>

      <section id="storage">
        <h2>1. Everything this site stores on your device</h2>
        <table className="legal-table">
          <thead><tr><th>Key</th><th>Type</th><th>What it does</th><th>How long</th></tr></thead>
          <tbody>
            {STORAGE_ROWS.map(r => <tr key={r[0]}><td>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td></tr>)}
          </tbody>
        </table>
        <div className="legal-callout"><Info /><p>All of these are <b>functional</b>: they exist so the site remembers your choices. None of them identifies you to advertisers, follows you to other websites, or is shared with anyone.</p></div>
      </section>

      <section id="analytics">
        <h2>2. Analytics</h2>
        <p>We measure page views with <b>Vercel Web Analytics</b>, which is designed to work <b>without cookies</b> and without storing anything on your device. It gives us anonymous, aggregated counts (which pages are read, from which country) and cannot identify individual visitors. There is no Google Analytics, no Facebook pixel, and no advertising tag on this site.</p>
      </section>

      <section id="control">
        <h2>3. How to clear or block storage</h2>
        <ul>
          <li>Clear this site's stored data any time via your browser: <b>Settings → Privacy → Site data → ar7traders.com → Clear</b>. The site keeps working; it simply forgets your preferences.</li>
          <li>Private / incognito windows discard everything when closed.</li>
          <li>If you block storage entirely, browsing and enquiring still work — language and currency just reset on each visit, and you cannot stay signed in to an account.</li>
        </ul>
      </section>

      <section id="changes">
        <h2>4. If this list changes</h2>
        <p>If we ever add a storage key or an analytics tool, this page is updated first and the date above changes. If we ever introduced anything non-essential that does track you, we would ask for your consent before it runs — that is a commitment, not a formality.</p>
      </section>

      <ContactCard s={s} />
      <CrossLinks type="cookies" navigate={navigate} />
    </article>
  );
}

function TermsPage({ navigate, s }) {
  return (
    <article className="legal-article">
      <p className="lead">These terms govern enquiries, quotations and vehicle purchases made through AR7 Traders. They are written to be read — if anything here is unclear, ask us before you commit to anything.</p>
      <div className="legal-meta">
        <span><Clock3 /> Last updated: {UPDATED}</span>
        <span><FileCheck /> Quotation-first: nothing binds you until you confirm a quotation.</span>
      </div>

      <section id="listings">
        <h2>1. Listings, prices and availability</h2>
        <ul>
          <li>Website prices are <b>indicative FOB (Free on Board) figures in USD</b> unless stated otherwise. The binding figure is always the written quotation we send you.</li>
          <li>CIF estimates (freight, insurance, documents) shown on vehicle pages are <b>estimates</b>, confirmed in the quotation for your named port.</li>
          <li>All stock is <b>subject to prior sale</b>. Japanese auction and dealer stock moves daily; a car can sell between your enquiry and your confirmation.</li>
          <li>Vehicle descriptions reflect the auction sheet or the yard inspection available to us, translated in good faith. Ask for the condition report before committing — we will always show you what we have.</li>
        </ul>
      </section>

      <section id="ordering">
        <h2>2. Ordering and payment</h2>
        <ul>
          <li>An order becomes firm when you confirm our written quotation and pay the agreed deposit or full amount by <b>bank transfer to the account named on our invoice</b>. We never ask for card details on this website, and we never change bank details by chat message — verify by phone if you ever receive such a request.</li>
          <li>Auction purchases: once we win a car on your instruction, the purchase is binding at auction and the deposit covers it.</li>
          <li>Balance payments are due before shipment unless the quotation says otherwise.</li>
        </ul>
      </section>

      <section id="shipping">
        <h2>3. Shipping, risk and documents</h2>
        <ul>
          <li>On FOB terms, risk passes to you when the vehicle crosses the ship's rail at the Japanese port; on CIF terms we add marine insurance to the named destination port.</li>
          <li>We provide the export documents the shipment requires — commercial invoice, export certificate with translation, and bill of lading. Original documents are released after full payment.</li>
          <li>Transit times shown on the site are typical, not guaranteed; carriers control sailing schedules.</li>
        </ul>
      </section>

      <section id="export">
        <h2>4. Export policy</h2>
        <ul>
          <li><b>Destination rules are the buyer's responsibility.</b> Import duty, age limits, emissions and roadworthiness rules differ by country and change without notice; our destination guides are practical information, not legal advice. Confirm current rules with your customs authority or clearing agent before ordering.</li>
          <li><b>Sanctions compliance.</b> We do not ship to sanctioned destinations, entities or persons, and we screen transactions where required by Japanese and UK export regulations.</li>
          <li><b>Odometer integrity.</b> We sell vehicles with their auction-verified mileage and never alter odometers or documentation.</li>
          <li>We may decline any transaction that we reasonably believe would breach export, customs or anti-money-laundering rules, with any amounts you paid for that transaction returned.</li>
        </ul>
      </section>

      <section id="liability">
        <h2>5. Liability</h2>
        <p>We are liable for what we control: buying the vehicle you confirmed, describing it honestly from the documents we hold, and shipping it with the agreed documents. We are not liable for delays or costs caused by carriers, ports, customs decisions, or rule changes in the destination country. Nothing in these terms removes rights that your local consumer law grants you and that cannot be excluded.</p>
      </section>

      <section id="disputes">
        <h2>6. Questions and disputes</h2>
        <p>Talk to us first — nearly everything is resolved by the desk that handled your order: <a href={'mailto:' + s.contact_email}>{s.contact_email}</a> or WhatsApp {s.whatsapp_number}. Formal disputes are governed by the law named in your quotation for that transaction.</p>
      </section>

      <ContactCard s={s} />
      <CrossLinks type="terms" navigate={navigate} />
    </article>
  );
}

const META = {
  privacy: { kicker: 'YOUR DATA, PLAINLY', h1a: 'Privacy', h1b: 'Policy', sub: 'What we collect, why, where it lives and how to make us delete it.', toc: [['who', 'Who we are'], ['collect', 'What we collect'], ['processors', 'Where data lives'], ['retention', 'Retention'], ['rights', 'Your rights'], ['cookies-ref', 'Cookies']] },
  cookies: { kicker: 'NO AD TRACKING — HERE IS THE PROOF', h1a: 'Cookie', h1b: 'Policy', sub: 'Every key this site stores on your device, listed and explained.', toc: [['storage', 'Complete storage list'], ['analytics', 'Analytics'], ['control', 'Clearing & blocking'], ['changes', 'If this changes']] },
  terms: { kicker: 'HOW BUYING FROM US WORKS', h1a: 'Terms &', h1b: 'Export Policy', sub: 'Prices, ordering, shipping, and the export rules we follow.', toc: [['listings', 'Listings & prices'], ['ordering', 'Ordering & payment'], ['shipping', 'Shipping & documents'], ['export', 'Export policy'], ['liability', 'Liability'], ['disputes', 'Disputes']] }
};

export default function LegalPage({ type = 'privacy', navigate }) {
  const meta = META[type] || META.privacy;
  const s = getSettings();
  const Body = type === 'cookies' ? CookiesPage : type === 'terms' ? TermsPage : PrivacyPage;
  return (
    <section className="inner-page legal-page">
      <div className="page-hero mini inv-hero">
        <div className="shell">
          <div className="kicker">{meta.kicker}</div>
          <h1>{meta.h1a} <em>{meta.h1b}</em></h1>
          <p>{meta.sub}</p>
        </div>
      </div>
      <div className="shell page-content">
        <div className="legal-body">
          <Toc items={meta.toc} />
          <Body navigate={navigate} s={s} />
        </div>
      </div>
    </section>
  );
}
