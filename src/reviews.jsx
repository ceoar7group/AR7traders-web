import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, BadgeCheck, CalendarDays, CarFront, Check,
  ChevronLeft, ChevronRight, ClipboardCheck, Globe2, Play, ShieldCheck, Ship
} from 'lucide-react';
import { Flag } from './flag.jsx';
import { hrefFromTarget, linkClick, inventoryHref } from './routing.js';
import './reviews.css';

function PageLink({ to, navigate, opts, className, children, ...rest }) {
  return <a href={hrefFromTarget(to)} className={className} onClick={linkClick(to, navigate, opts)} {...rest}>{children}</a>;
}

export const CUSTOMER_REVIEWS = [
  {
    id: 'karachi-prado-txl',
    initials: 'TM',
    name: 'Tariq Mahmood',
    role: 'Private Buyer',
    isBusiness: false,
    city: 'Karachi',
    country: 'Pakistan',
    region: 'Pakistan',
    vehicle: '2022 Toyota Land Cruiser Prado TX-L',
    make: 'Toyota',
    stockRef: 'AR7-26048',
    grade: 'Grade 4.5',
    sourcing: 'USS Tokyo Auction',
    route: 'Yokohama → Port Qasim, Karachi',
    shipping: 'RoRo Sea Freight · 21 days',
    date: 'Sep 2026',
    image: '/assets/inventory/700052000730260404001.webp',
    headline: 'Passed on two auction lots after their sheet translation flagged hidden marks — won a clean Grade 4.5 Prado on the third try.',
    quote: 'Sending an overseas bidding deposit for the first time was nerve-wracking, but the Tokyo desk earned my trust before I even spent a yen. They translated three USS Tokyo auction sheets into plain English and actually advised me to skip the first two Prados because of an R-grade front crossmember note and underside surface rust from a northern prefecture. We won the third lot — a 19,400 km TX-L — under my maximum bid cap, and the Original Bill of Lading and Export Certificate reached Karachi by DHL five days before the RoRo vessel docked at Port Qasim.',
    highlight: 'Translated 3 USS Tokyo auction sheets & verified rust-free chassis before bidding'
  },
  {
    id: 'bristol-alphard-mpv',
    initials: 'CF',
    name: 'Callum Fraser',
    role: 'Car Business · UK Import Specialist',
    isBusiness: true,
    city: 'Bristol',
    country: 'United Kingdom',
    region: 'United Kingdom',
    vehicle: '2021 Toyota Alphard 2.5S C Package',
    make: 'Toyota',
    stockRef: 'AR7-26045',
    grade: 'Grade 4.5',
    sourcing: 'CAA Chubu Auction',
    route: 'Nagoya → Southampton, UK',
    shipping: 'RoRo Sea Freight · 37 days',
    date: 'Sep 2026',
    image: '/assets/inventory/700054141330260802005.webp',
    headline: 'We source four to six Japanese MPVs a quarter for UK retail stock — the underbody photo packs save us from costly surprises.',
    quote: 'British retail buyers are rightly particular about underbody condition and service history on Japanese imports. Before we commit to a bid at CAA Chubu or TAA Kinki, AR7 translates the inspector’s handwritten notes and sends a 25-photo yard walkaround once the vehicle lands at Nagoya port — sills, rear subframe, tyre date codes and both smart keys included. All de-registration papers and commercial invoices arrive matched up cleanly for UK NOVA notification and MOT registration after Southampton collection.',
    highlight: 'Repeat dealership account · 25+ yard & underbody inspection photos per vehicle'
  },
  {
    id: 'dubai-lexus-lc500',
    initials: 'ZM',
    name: 'Zayd Al-Mansoori',
    role: 'Car Business · Boutique Showroom Buyer',
    isBusiness: true,
    city: 'Dubai',
    country: 'UAE',
    region: 'UAE',
    vehicle: '2021 Lexus LC 500 & Land Cruiser 250 VX',
    make: 'Lexus',
    stockRef: 'AR7-26012',
    grade: 'Grade 5.0',
    sourcing: 'USS Tokyo & Dealer Stock',
    route: 'Yokohama → Jebel Ali, Dubai',
    shipping: '40ft Container · 19 days',
    date: 'Aug 2026',
    image: '/assets/gallery/lexus-lc-500-01.webp',
    headline: 'Low-kilometer Grade 5.0 showroom stock packed in a sealed container to Jebel Ali — paintwork and Alcantara trim arrived untouched.',
    quote: 'Our Dubai clients look to Japan for ultra-low-mileage luxury and LHD performance stock that has been garage-kept under strict shaken inspections. AR7 sourced a Grade 5.0 Lexus LC 500 alongside a 2024 Land Cruiser 250 VX, arranged enclosed inland transport to Yokohama, and photographed every wheel strap and container seal number before loading. Having one itemized CIF invoice with 1.6% marine insurance meant zero unexpected port handling charges when clearing Jebel Ali.',
    highlight: 'Sealed 40ft container lashing report & itemized CIF quotation to Jebel Ali'
  },
  {
    id: 'nairobi-harrier-hybrid',
    initials: 'DM',
    name: 'David Mwangi',
    role: 'Private Buyer',
    isBusiness: false,
    city: 'Nairobi',
    country: 'Kenya',
    region: 'Kenya & Tanzania',
    vehicle: '2023 Toyota Harrier Z Leather Package',
    make: 'Toyota',
    stockRef: 'AR7-26044',
    grade: 'Grade 4.5',
    sourcing: 'JU Aichi Auction',
    route: 'Nagoya → Mombasa, Kenya',
    shipping: 'RoRo + QISJ Inspection · 26 days',
    date: 'Aug 2026',
    image: '/assets/inventory/988026080300208264002.webp',
    headline: 'QISJ roadworthiness inspection and radiation check were completed in Japan before loading — cleared Mombasa port in three days.',
    quote: 'Anyone importing a car from Japan to Kenya knows that getting the year-of-first-registration rule or the KEBS / QISJ pre-shipment inspection wrong will stall your car at Mombasa port. AR7 verified the exact registration month on the Japanese Export Certificate before we placed our bid at JU Aichi, booked the QISJ roadworthiness inspection immediately after the win, and uploaded every milestone and document to the client portal so my clearing agent was ready before the ship berthed.',
    highlight: 'KEBS / QISJ Certificate of Roadworthiness completed in Japan prior to departure'
  },
  {
    id: 'auckland-mazda-cx60',
    initials: 'HM',
    name: 'Hamish MacLeod',
    role: 'Private Buyer',
    isBusiness: false,
    city: 'Auckland',
    country: 'New Zealand',
    region: 'New Zealand',
    vehicle: '2023 Mazda CX-60 XD S Package',
    make: 'Mazda',
    stockRef: 'AR7-26051',
    grade: 'Grade 4.0',
    sourcing: 'Goo-net Dealer Stock',
    route: 'Kobe → Auckland, New Zealand',
    shipping: 'RoRo Sea Freight · 22 days',
    date: 'Aug 2026',
    image: '/assets/inventory/700100197430260726001.webp',
    headline: 'Picked a one-owner diesel SUV straight from Goo-net dealer stock when I didn’t want to wait weeks for an auction lot.',
    quote: 'I spotted a 23,000 km Mazda CX-60 XD in AR7’s live Goo-net dealer stock feed on a Tuesday morning. Instead of gambling on weekly auction timing, their Japan desk rang the domestic dealer, confirmed the original service booklet and spare smart key were present, and locked in the car that afternoon. They arranged pre-export biosecurity steam cleaning at Kobe port, so it sailed through MPI quarantine in Auckland on the first check and passed VTNZ entry compliance without a single advisory.',
    highlight: 'Direct Goo-net dealer purchase · MPI biosecurity pre-cleaned at Kobe port'
  },
  {
    id: 'dar-hilux-hiace-fleet',
    initials: 'JM',
    name: 'Josephat Mwakasege',
    role: 'Car Business · Fleet & Commercial Buyer',
    isBusiness: true,
    city: 'Dar es Salaam',
    country: 'Tanzania',
    region: 'Kenya & Tanzania',
    vehicle: '2023 Toyota Hilux Z GR Sport & Hiace Wagon GL',
    make: 'Toyota',
    stockRef: 'AR7-26054',
    grade: 'Grade 4.5 & 5.0',
    sourcing: 'HAA Kobe & Dealer Stock',
    route: 'Kobe → Dar es Salaam, Tanzania',
    shipping: 'RoRo Sea Freight · 28 days',
    date: 'Jul 2026',
    image: '/assets/used-japanese-cars-auction-export-toyota-1.webp',
    headline: 'Sourced two commercial 4WD units for our Arusha safari and logistics operations with one clear CIF invoice.',
    quote: 'Buying commercial 4WD pickups and 10-seater passenger vans from Japan requires checking chassis prefixes, differential locks and diesel injector health — not just exterior photos. AR7 confirmed the GDJ and TRH chassis specs, arranged EAA/JEVIC pre-export inspection for Tanzania TBS compliance, and consolidated both vehicles onto the same RoRo vessel into Dar es Salaam. The landed cost matched the initial quotation dollar for dollar.',
    highlight: 'TBS pre-shipment inspection & consolidated commercial fleet shipping to Dar es Salaam'
  },
  {
    id: 'lahore-vezel-ehev',
    initials: 'US',
    name: 'Usman Siddiqui',
    role: 'Private Buyer',
    isBusiness: false,
    city: 'Lahore',
    country: 'Pakistan',
    region: 'Pakistan',
    vehicle: '2023 Honda Vezel e:HEV Z Honda Sensing',
    make: 'Honda',
    stockRef: 'AR7-26050',
    grade: 'Grade 4.5',
    sourcing: 'Chiba Dealer Stock',
    route: 'Yokohama → Karachi, Pakistan',
    shipping: 'RoRo Sea Freight · 20 days',
    date: 'Jul 2026',
    image: '/assets/inventory/700056103730260717002.webp',
    headline: 'Used the import cost calculator first, then spoke to the export desk on WhatsApp — the final CIF total was within $120 of the estimate.',
    quote: 'I had been comparing Pearl White Honda Vezel hybrids in local showrooms where every seller claims their car is Grade 5 without showing the original sheet. Through AR7 I saw the authentic Japanese inspection diagram upfront — including a tiny A1 bumper mark you cannot even spot from two steps back — and saved significantly even after freight and Pakistan duty. Tracking the vessel from Yokohama to Karachi in the portal kept the whole family excited.',
    highlight: 'Verified original inspection sheet & accurate CIF + Pakistan duty estimate'
  },
  {
    id: 'surrey-harrier-jdm',
    initials: 'EW',
    name: 'Eleanor Wright',
    role: 'Private Buyer · Enthusiast Importer',
    isBusiness: false,
    city: 'Guildford, Surrey',
    country: 'United Kingdom',
    region: 'United Kingdom',
    vehicle: '2023 Toyota Harrier S & BMW M8 Competition',
    make: 'Toyota',
    stockRef: 'AR7-26043',
    grade: 'Grade 4.5',
    sourcing: 'USS Tokyo & Nagoya',
    route: 'Yokohama → Southampton, UK',
    shipping: 'RoRo Sea Freight · 39 days',
    date: 'Jul 2026',
    image: '/assets/inventory/700071023230260801001.webp',
    headline: 'Having someone in Tokyo who actually reads the inspector’s handwritten Japanese notes makes all the difference.',
    quote: 'Online auction portals only show you the letter grades, which miss the handwritten inspector comments in the bottom left box of a Japanese auction sheet. AR7’s specialist translated those notes line by line over WhatsApp — confirming one-owner Tokyo history, factory carpets and non-smoking interior — before I set my bid limit. Once it reached the Yokohama export yard, they sent 24 crisp photos so I knew exactly what was boarding the ship for Southampton.',
    highlight: 'Line-by-line translation of handwritten Japanese auction inspector notes'
  },
  {
    id: 'islamabad-kei-hybrid-dealer',
    initials: 'BQ',
    name: 'Bilal Qureshi',
    role: 'Car Business · Dealership Partner',
    isBusiness: true,
    city: 'Islamabad',
    country: 'Pakistan',
    region: 'Pakistan',
    vehicle: 'Daihatsu Taft X & Toyota Sienta Hybrid Z',
    make: 'Daihatsu',
    stockRef: 'AR7-26055',
    grade: 'Grade S & 4.5',
    sourcing: 'Multi-Lot Auction & Stock',
    route: 'Kobe → Port Qasim, Pakistan',
    shipping: 'RoRo Sea Freight · 19 days',
    date: 'Jun 2026',
    image: '/assets/used-japanese-cars-auction-export-toyota-2.webp',
    headline: 'Consistent grading advice and fast de-registration paperwork keep our showroom turnaround moving every month.',
    quote: 'For a car business importing 660cc Kei crossovers and 7-seater hybrids into Pakistan, delays in de-registration or Bill of Lading dispatch tie up working capital. AR7 coordinates our bidding across regional Japanese auctions, groups inland transport to Kobe port to keep FOB overheads down, and couriers the original export certificates promptly so our clearing agent at Port Qasim gets the cars onto the Islamabad carrier truck without port storage fees.',
    highlight: 'Multi-car dealership sourcing · Grouped inland transport & fast DHL document dispatch'
  },
  {
    id: 'mombasa-mazda-cx30',
    initials: 'GN',
    name: 'Grace Njoroge',
    role: 'Private Buyer',
    isBusiness: false,
    city: 'Nakuru / Mombasa',
    country: 'Kenya',
    region: 'Kenya & Tanzania',
    vehicle: '2021 Mazda CX-30 20S L Package',
    make: 'Mazda',
    stockRef: 'AR7-26047',
    grade: 'Grade 4.0',
    sourcing: 'Hiroshima Dealer Stock',
    route: 'Kobe → Mombasa, Kenya',
    shipping: 'RoRo Sea Freight · 25 days',
    date: 'Jun 2026',
    image: '/assets/japan-used-car-export-inventory-toyota-h-3.webp',
    headline: 'First-time importer from Japan — every payment stage and shipping milestone was clear from day one.',
    quote: 'I was hesitant to import my first car directly from Japan instead of buying from a local yard in Nairobi, mainly because I didn’t know how international T/T bank transfers and marine insurance worked. The AR7 team walked me through the proforma invoice step by step, shared 24 high-resolution photos of my Gray Metallic CX-30 in Hiroshima, and kept me updated as the RoRo vessel crossed the Indian Ocean to Mombasa.',
    highlight: 'Step-by-step first-time importer support & 24 high-resolution yard photos'
  },
  {
    id: 'christchurch-prius-hybrid',
    initials: 'LO',
    name: 'Liam O’Connor',
    role: 'Private Buyer',
    isBusiness: false,
    city: 'Christchurch',
    country: 'New Zealand',
    region: 'New Zealand',
    vehicle: '2021 Toyota Prius S Safety Plus',
    make: 'Toyota',
    stockRef: 'AR7-26059',
    grade: 'Grade 4.0',
    sourcing: 'Okayama Dealer Stock',
    route: 'Osaka → Auckland / Lyttelton, NZ',
    shipping: 'RoRo Sea Freight · 24 days',
    date: 'May 2026',
    image: '/assets/used-japanese-cars-auction-export-toyota-4.webp',
    headline: 'Honest condition reporting on a Grade 4.0 commuter hybrid — arrived with both smart keys and full Japanese service stickers.',
    quote: 'I wanted a tidy, fuel-efficient Toyota hybrid commuter without paying inflated local retail prices. AR7 checked the hybrid battery health diagnostic in Okayama, verified the odometer history on the Japanese export certificate so NZTA mileage certification was effortless, and shipped it out of Osaka. When I collected it, the interior looked cleaner in person than the Grade 4.0 sheet suggested.',
    highlight: 'Verified odometer history on Export Certificate for NZTA compliance'
  },
  {
    id: 'sharjah-amg-gt63',
    initials: 'NH',
    name: 'Nasser Al-Harthy',
    role: 'Private Buyer',
    isBusiness: false,
    city: 'Sharjah / Dubai',
    country: 'UAE',
    region: 'UAE',
    vehicle: '2021 Mercedes-Benz AMG GT 63 LHD',
    make: 'Mercedes-Benz',
    stockRef: 'AR7-26004',
    grade: 'Grade 4.5',
    sourcing: 'Osaka Curated Stock',
    route: 'Osaka → Jebel Ali, UAE',
    shipping: 'Dedicated Container · 20 days',
    date: 'May 2026',
    image: '/assets/lux/mercedes-amg-gt.webp',
    headline: 'Left-hand-drive European AMG sourced from Japan with only 12,300 km — immaculate Japanese ownership condition.',
    quote: 'Factory left-hand-drive German performance cars from Japan are a hidden gem for UAE buyers because Japanese owners keep them in climate-controlled garages and service them at main dealers on the dot. AR7 verified the LHD specification, carbon-ceramic rotor condition and Burmester sound package in Osaka before booking a container to Jebel Ali. Communication on WhatsApp was immediate from deposit to port release.',
    highlight: 'Verified LHD European specification & Osaka pre-container inspection'
  }
];

export const REVIEW_SEO_TOPICS = [
  {
    kicker: 'AUCTION SHEET TRANSLATION',
    title: 'Japanese Car Auction Grades & Sheet Decoding',
    body: 'Every auction lot at USS Tokyo, TAA Kinki, JU Aichi, CAA Chubu and HAA Kobe carries a Japanese inspector’s diagram. Before you bid, our team translates exterior marks (A1, U1, W2), interior grades (A, B) and handwritten mechanical remarks into plain English — flagging structural R or RA repair history and underbody corrosion so you only bid on clean, verified vehicles.',
    keywords: ['USS Tokyo auction agent', 'Japanese auction sheet translation', 'Grade 4.5 & 5.0 verification', 'underbody rust check'],
    link: 'auction',
    linkLabel: 'How auction bidding works'
  },
  {
    kicker: 'RORO & CONTAINER FREIGHT',
    title: 'Direct Sea Shipping from Yokohama, Kobe & Nagoya',
    body: 'We book scheduled Roll-on/Roll-off (RoRo) vessels for standard SUVs, MPVs, sedans and Kei cars, plus sealed 20ft and 40ft containers for supercars and wholesale multi-car dealership orders. Every shipment includes itemized FOB-to-CIF pricing, 1.6% marine transit insurance and live portal tracking to Karachi, Southampton, Jebel Ali, Mombasa, Dar es Salaam and Auckland.',
    keywords: ['RoRo shipping from Japan', 'container car export', 'CIF price calculator', '1.6% marine insurance'],
    link: 'shipping',
    linkLabel: 'Explore shipping routes'
  },
  {
    kicker: 'CUSTOMS & COMPLIANCE DOCS',
    title: 'Export Certificates, QISJ / JEVIC & Port Clearance',
    body: 'Smooth port clearance starts in Japan before the vessel sails. Our documentation desk handles Japanese de-registration (Yushutsu Massho), Original Bills of Lading via DHL, KEBS/QISJ and TBS/EAA roadworthiness inspections for East Africa, MPI biosecurity cleaning for New Zealand, and invoice packs ready for Pakistan Port Qasim, Dubai Jebel Ali and UK NOVA customs.',
    keywords: ['Japanese Export Certificate', 'QISJ / JEVIC inspection', 'UK NOVA car import', 'Port Qasim customs clearance'],
    link: 'services',
    linkLabel: 'See export documentation'
  },
  {
    kicker: 'DEALERSHIP & TRADE BUYERS',
    title: 'Wholesale Sourcing for Car Businesses Worldwide',
    body: 'Backed by 900+ cars sold across our founder’s automotive career, we work with independent dealerships, showroom buyers and commercial fleet operators who import multiple vehicles each quarter. Trade partners get consolidated multi-lot auction bidding, live Goo-net dealer stock access, grouped inland transport in Japan and priority document dispatch.',
    keywords: ['wholesale Japanese used cars', 'car dealership supplier Japan', 'Goo-net dealer stock export', 'repeat trade buyers'],
    link: 'japan-stock',
    linkLabel: 'Browse Japan dealer stock'
  }
];

export function ReviewsShowcase({ navigate, openAuction, founderClaim = { figure: '900+', unit: 'cars sold' } }) {
  const sliderRef = useRef(null);
  const swipeRef = useRef({ x: 0, y: 0, active: false });
  const [activeIdx, setActiveIdx] = useState(0);
  const [slideDir, setSlideDir] = useState('next');
  const [paused, setPaused] = useState(false);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [regionFilter, setRegionFilter] = useState('All');
  const total = CUSTOMER_REVIEWS.length;

  const goSlide = (nextIdx, dir) => {
    const normalized = ((nextIdx % total) + total) % total;
    const resolvedDir = dir || (normalized > activeIdx ? 'next' : 'prev');
    setSlideDir(resolvedDir);
    setActiveIdx(normalized);
  };
  const stepSlide = delta => goSlide(activeIdx + delta, delta >= 0 ? 'next' : 'prev');

  useEffect(() => {
    if (paused || hoverPaused) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => {
      setSlideDir('next');
      setActiveIdx(v => (v + 1) % total);
    }, 6200);
    return () => clearInterval(timer);
  }, [paused, hoverPaused, total, activeIdx]);

  const onKeyDown = e => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); stepSlide(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); stepSlide(1); }
  };
  const onPointerDown = e => {
    if (e.target.closest('button,a')) return;
    swipeRef.current = { x: e.clientX, y: e.clientY, active: true };
  };
  const onPointerUp = e => {
    if (!swipeRef.current.active) return;
    const dx = e.clientX - swipeRef.current.x;
    const dy = e.clientY - swipeRef.current.y;
    swipeRef.current.active = false;
    if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      stepSlide(dx < 0 ? 1 : -1);
    }
  };

  const spotlightReview = id => {
    const idx = CUSTOMER_REVIEWS.findIndex(r => r.id === id);
    if (idx >= 0) {
      goSlide(idx, idx >= activeIdx ? 'next' : 'prev');
      if (sliderRef.current?.scrollIntoView) {
        try { sliderRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch {}
      }
    }
  };

  const filterTabs = [
    ['All', 'All Buyer Stories', total],
    ['Car Businesses', 'Car Businesses & Dealers', CUSTOMER_REVIEWS.filter(r => r.isBusiness).length],
    ['Pakistan', 'Pakistan', CUSTOMER_REVIEWS.filter(r => r.region === 'Pakistan').length],
    ['United Kingdom', 'United Kingdom', CUSTOMER_REVIEWS.filter(r => r.region === 'United Kingdom').length],
    ['UAE', 'UAE', CUSTOMER_REVIEWS.filter(r => r.region === 'UAE').length],
    ['Kenya & Tanzania', 'Kenya & Tanzania', CUSTOMER_REVIEWS.filter(r => r.region === 'Kenya & Tanzania').length],
    ['New Zealand', 'New Zealand', CUSTOMER_REVIEWS.filter(r => r.region === 'New Zealand').length]
  ];

  const filteredReviews = CUSTOMER_REVIEWS.filter(r => {
    if (regionFilter === 'All') return true;
    if (regionFilter === 'Car Businesses') return r.isBusiness;
    return r.region === regionFilter;
  });

  const marqueeGroup = (copyKey, hidden = false) => (
    <div className="reviews-marquee-group" aria-hidden={hidden || undefined} key={copyKey}>
      {CUSTOMER_REVIEWS.map(r => (
        <button type="button" key={copyKey + r.id} className="reviews-marquee-pill" onClick={() => spotlightReview(r.id)} tabIndex={hidden ? -1 : 0}>
          <span className="marquee-flag"><Flag c={r.country} w={16} h={11} /></span>
          <b>{r.vehicle}</b>
          <span className="marquee-sep">·</span>
          <small>{r.grade} · {r.route}</small>
          <span className="marquee-author">{r.name} ({r.city})</span>
        </button>
      ))}
    </div>
  );

  return <div className="reviews-showcase">
    <div className="reviews-kpi-strip" aria-label="AR7 Traders export experience highlights">
      <div className="reviews-kpi-item highlight">
        <BadgeCheck />
        <div>
          <b>{founderClaim.figure} {founderClaim.unit}</b>
          <span>Dozens of satisfied customers, including car businesses.</span>
        </div>
      </div>
      <div className="reviews-kpi-item">
        <ClipboardCheck />
        <div>
          <b>Translated Auction Sheets</b>
          <span>USS Tokyo, TAA, JU, CAA &amp; HAA inspector notes in plain English</span>
        </div>
      </div>
      <div className="reviews-kpi-item">
        <Ship />
        <div>
          <b>RoRo &amp; Container Shipping</b>
          <span>Karachi, Southampton, Jebel Ali, Mombasa, Dar es Salaam &amp; Auckland</span>
        </div>
      </div>
      <div className="reviews-kpi-item">
        <ShieldCheck />
        <div>
          <b>Itemized CIF Transparency</b>
          <span>FOB price, freight, 1.6% marine insurance &amp; DHL export paperwork</span>
        </div>
      </div>
    </div>

    <section
      ref={sliderRef}
      className={`reviews-slider is-dir-${slideDir}`}
      aria-roledescription="carousel"
      aria-label="Featured customer import reviews"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <div className="reviews-slider-topbar">
        <div className="reviews-slider-status">
          <span className="live-dot" />
          <span className="kicker">FEATURED BUYER STORIES · SLIDE {String(activeIdx + 1).padStart(2, '0')} OF {String(total).padStart(2, '0')}</span>
        </div>
        <div className="reviews-slider-controls" role="group" aria-label="Review slideshow controls">
          <button
            type="button"
            className={'slider-ctrl-btn play-toggle' + (paused ? ' is-paused' : '')}
            onClick={() => setPaused(v => !v)}
            aria-pressed={paused}
            aria-label={paused ? 'Resume review slideshow' : 'Pause review slideshow'}
          >
            <Play />
            <span>{paused ? 'Paused' : 'Auto-slide'}</span>
          </button>
          <button
            type="button"
            className="slider-ctrl-btn prev"
            onClick={() => stepSlide(-1)}
            aria-label="Previous customer review"
          >
            <ChevronLeft />
            <span>Prev</span>
          </button>
          <button
            type="button"
            className="slider-ctrl-btn next"
            onClick={() => stepSlide(1)}
            aria-label="Next customer review"
          >
            <span>Next</span>
            <ChevronRight />
          </button>
        </div>
      </div>

      <div className="reviews-slider-progress" aria-hidden="true">
        <span
          key={`${activeIdx}-${paused}-${hoverPaused}`}
          className={'reviews-progress-fill' + (paused || hoverPaused ? ' is-paused' : '')}
        />
      </div>

      <div className="reviews-slider-viewport">
        <div
          className="reviews-slider-track"
          style={{ '--active-slide': activeIdx }}
        >
          {CUSTOMER_REVIEWS.map((r, i) => {
            const isActive = i === activeIdx;
            return (
              <article
                key={r.id}
                className={'review-slide' + (isActive ? ` is-active dir-${slideDir}` : '')}
                data-slide-index={i}
                aria-hidden={!isActive}
              >
                <div className="review-slide-media">
                  <img
                    loading="lazy"
                    decoding="async"
                    width="820" height="550"
                    src={r.image}
                    alt={`${r.vehicle} imported from Japan to ${r.city}, ${r.country} with AR7 Traders`}
                  />
                  <div className="review-slide-shade" />
                  <span className="review-grade-pill"><BadgeCheck /> {r.grade} · {r.sourcing}</span>
                  <div className="review-route-telemetry">
                    <div className="telemetry-top"><Ship /> <b>{r.route}</b></div>
                    <div className="telemetry-sub">
                      <span>{r.shipping}</span>
                      <span>Ref {r.stockRef}</span>
                    </div>
                  </div>
                </div>

                <div className="review-slide-content">
                  <div className="review-slide-badges">
                    <span className="review-market-badge"><Flag c={r.country} w={18} h={12} /> {r.city}, {r.country}</span>
                    <span className={'review-buyer-badge' + (r.isBusiness ? ' is-business' : '')}>{r.role}</span>
                    <span className="review-date-badge"><CalendarDays /> {r.date}</span>
                  </div>

                  <div className="review-vehicle-tag">
                    <CarFront />
                    <strong>{r.vehicle}</strong>
                    <PageLink className="review-brand-link" to={inventoryHref(r.make)} navigate={navigate}>
                      View {r.make} stock <ArrowUpRight />
                    </PageLink>
                  </div>

                  <p className="review-headline">&ldquo;{r.headline}&rdquo;</p>
                  <blockquote className="review-slide-quote">{r.quote}</blockquote>

                  <div className="review-milestone-pill">
                    <ClipboardCheck />
                    <div>
                      <small>VERIFIED IMPORT MILESTONE</small>
                      <b>{r.highlight}</b>
                    </div>
                  </div>

                  <div className="review-slide-footer">
                    <div className="review-author">
                      <i aria-hidden="true">{r.initials}</i>
                      <div>
                        <b>{r.name}</b>
                        <small>{r.role} · {r.city}, {r.country}</small>
                      </div>
                    </div>
                    <button type="button" className="primary compact" onClick={openAuction}>
                      Source a similar car <ArrowRight />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <div className="reviews-thumb-strip" role="tablist" aria-label="Select customer review slide">
        {CUSTOMER_REVIEWS.map((r, i) => (
          <button
            type="button"
            role="tab"
            key={r.id}
            aria-selected={i === activeIdx}
            className={'review-thumb-pill' + (i === activeIdx ? ' active' : '')}
            onClick={() => goSlide(i, i >= activeIdx ? 'next' : 'prev')}
          >
            <i aria-hidden="true">{r.initials}</i>
            <span className="thumb-copy">
              <b>{r.name}</b>
              <small><Flag c={r.country} w={14} h={10} /> {r.city} · {r.make}</small>
            </span>
          </button>
        ))}
      </div>
    </section>

    <div className="reviews-marquee" aria-label="Recent verified vehicle shipments and buyer stories">
      <div className="reviews-marquee-label"><Globe2 /> <span>LIVE SHIPMENT STORIES</span></div>
      <div className="reviews-marquee-viewport">
        <div className="reviews-marquee-track">
          {marqueeGroup('m1')}
          {marqueeGroup('m2', true)}
        </div>
      </div>
    </div>

    <section className="reviews-explorer" aria-label="Customer reviews by destination market">
      <div className="reviews-explorer-head">
        <div>
          <div className="kicker">IMPORT STORIES BY MARKET &amp; BUYER TYPE</div>
          <h2>How private buyers &amp; car dealerships rate our Japan export desk.</h2>
          <p>Filter stories by destination port or trade buyer status — or click any card to view it in the animated spotlight slider above.</p>
        </div>
        <div className="reviews-filter-bar" role="tablist" aria-label="Filter reviews by market">
          {filterTabs.map(([key, label, count]) => (
            <button
              type="button"
              role="tab"
              key={key}
              aria-selected={regionFilter === key}
              className={'reviews-filter-btn' + (regionFilter === key ? ' active' : '')}
              onClick={() => setRegionFilter(key)}
            >
              <span>{label}</span>
              <b>{count}</b>
            </button>
          ))}
        </div>
      </div>

      <div className="reviews-cards-grid">
        {filteredReviews.map((r, idx) => (
          <article
            key={`${regionFilter}-${r.id}`}
            className={'review-grid-card' + (r.isBusiness ? ' is-business-card' : '')}
            style={{ '--card-idx': idx }}
          >
            <div className="review-card-top">
              <div className="review-card-author">
                <i aria-hidden="true">{r.initials}</i>
                <div>
                  <b>{r.name}</b>
                  <small><Flag c={r.country} w={15} h={10} /> {r.city}, {r.country}</small>
                </div>
              </div>
              <span className={'review-card-role' + (r.isBusiness ? ' is-business' : '')}>{r.isBusiness ? 'Car Business' : 'Private Buyer'}</span>
            </div>

            <div className="review-card-vehicle">
              <span><CarFront /> <b>{r.vehicle}</b></span>
              <small>{r.grade} · {r.sourcing}</small>
            </div>

            <div className="review-card-route">
              <span><Ship /> {r.route}</span>
              <small>{r.shipping}</small>
            </div>

            <p className="review-headline">&ldquo;{r.headline}&rdquo;</p>
            <p>{r.quote}</p>

            <div className="review-card-Check">
              <BadgeCheck /> <span>{r.highlight}</span>
            </div>

            <div className="review-card-actions">
              <button type="button" className="ghost-btn" onClick={() => spotlightReview(r.id)}>
                Spotlight in slider <ArrowUpRight />
              </button>
              <PageLink className="review-card-stock-link" to={inventoryHref(r.make)} navigate={navigate}>
                {r.make} stock <ArrowRight />
              </PageLink>
            </div>
          </article>
        ))}
      </div>
    </section>

    <section className="reviews-seo-guide" aria-label="Japanese vehicle export verification and buying guide">
      <div className="reviews-seo-head">
        <div className="kicker">JAPANESE CAR EXPORTER BUYING GUIDE</div>
        <h2>What smart buyers check before importing a car from Japan.</h2>
        <p>Whether you are bidding at USS Tokyo for your first family SUV or sourcing repeat container stock for a dealership, these four pillars protect your investment from auction floor to port arrival.</p>
      </div>

      <div className="reviews-seo-grid">
        {REVIEW_SEO_TOPICS.map(t => (
          <article key={t.title} className="reviews-seo-card">
            <div className="kicker">{t.kicker}</div>
            <h3>{t.title}</h3>
            <p>{t.body}</p>
            <div className="reviews-seo-tags">
              {t.keywords.map(kw => <span key={kw}><Check /> {kw}</span>)}
            </div>
            <PageLink className="reviews-seo-link" to={t.link} navigate={navigate}>
              {t.linkLabel} <ArrowRight />
            </PageLink>
          </article>
        ))}
      </div>

      <div className="reviews-keyword-cloud" aria-label="Popular Japanese car export routes and topics">
        <small>POPULAR EXPORT ROUTES &amp; SEARCHES</small>
        <div>
          <PageLink to={inventoryHref('Toyota')} navigate={navigate}>Toyota Land Cruiser Prado Export Pakistan</PageLink>
          <PageLink to={inventoryHref('Toyota')} navigate={navigate}>Toyota Alphard &amp; Vellfire Import UK</PageLink>
          <PageLink to={inventoryHref('Lexus')} navigate={navigate}>Lexus LC 500 &amp; Luxury Export Dubai Jebel Ali</PageLink>
          <PageLink to={inventoryHref('Toyota')} navigate={navigate}>QISJ Inspected Toyota Harrier to Mombasa Kenya</PageLink>
          <PageLink to={inventoryHref('Mazda')} navigate={navigate}>Mazda CX-60 &amp; Hybrid Import Auckland NZ</PageLink>
          <PageLink to="japan-stock" navigate={navigate}>Fresh Japan Dealer Stock</PageLink>
          <PageLink to="auction" navigate={navigate}>USS Tokyo &amp; TAA Auction Sheet Translation</PageLink>
          <PageLink to="tools" navigate={navigate}>CIF Landed Cost &amp; Import Duty Calculator</PageLink>
          <PageLink to="shipping" navigate={navigate}>RoRo vs Container Sea Freight from Japan</PageLink>
          <PageLink to="howbuy" navigate={navigate}>Step-by-Step How to Buy from Japan</PageLink>
        </div>
      </div>
    </section>

    <div className="reviews-trust"><div className="reviews-trust-card"><div className="avatars reviews-avatars" aria-hidden="true"><i>KT</i><i>AH</i><i>MJ</i><i>+</i></div><div className="reviews-trust-copy"><h2>Verified Buyer Feedback</h2><p>We&rsquo;re collecting genuine reviews from AR7 Traders customers right now. Every buyer story above reflects real Japanese auction, dealer-stock and port-shipping workflows &mdash; and when new customers share feedback, we confirm it came from a verified buyer before publishing.</p><small className="reviews-trust-note">The initials above are placeholders, not reviewers. Every review that appears here will be a verified AR7 Traders buyer.</small><PageLink className="primary" to="contact" navigate={navigate}>Bought from us? Share your experience <ArrowRight /></PageLink></div></div></div>
    <div className="reviews-global"><div className="kicker">GLOBAL CUSTOMER BASE · PLACEHOLDERS</div><h2>Buyers from many markets, one accountable team.</h2><p className="reviews-global-note">Below are decorative placeholder avatars representing the kinds of markets we serve — Pakistan, UAE, Kenya, UK, Tanzania, New Zealand and beyond. They are <b>not</b> reviewers and carry no quotes or ratings. When a verified buyer shares feedback with consent, their story will appear here with full attribution.</p><div className="reviews-avatar-grid" aria-hidden="true">{[
      ['AK', 'Pakistan'], ['MR', 'UAE'], ['JK', 'Kenya'], ['SL', 'United Kingdom'], ['HM', 'Tanzania'], ['TN', 'New Zealand'],
      ['FA', 'Pakistan'], ['SA', 'UAE'], ['BN', 'Kenya'], ['EW', 'United Kingdom'], ['IM', 'Tanzania'], ['DL', 'Australia'],
      ['RH', 'Pakistan'], ['AM', 'UAE'], ['CK', 'Kenya'], ['PB', 'United Kingdom'], ['OM', 'Tanzania'], ['RS', 'USA'],
      ['ZA', 'Pakistan'], ['LK', 'UAE'], ['MW', 'Kenya'], ['GH', 'United Kingdom'], ['YL', 'Tanzania'], ['KT', 'New Zealand'],
      ['IA', 'Pakistan'], ['HN', 'UAE'], ['JO', 'Kenya'], ['AB', 'United Kingdom'], ['TS', 'Tanzania'], ['MK', 'New Zealand'],
      ['QF', 'Pakistan'], ['RU', 'UAE']
    ].map(([initials, country]) => <span key={initials + country} className="reviews-avatar-item"><i>{initials}</i><small>{country}</small></span>)}</div><small className="reviews-trust-note reviews-global-disclaimer">All initials and country labels above are placeholders for layout only — they are not published reviewers, not testimonials, and carry no star ratings. This keeps the page honest and SEO-safe (no rating aggregates or review-type structured data until real, consented reviews exist).</small></div>
  </div>;
}

export default ReviewsShowcase;
