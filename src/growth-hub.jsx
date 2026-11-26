// Growth studio — ONE place for everything that grows the business online.
//
// Owner's request (2026-11-07): "make these seo desk and ai growth easier for
// me to understand and operate … you can merge both things in one page if it
// makes it more easier, efficient and make sense."
//
// So the two desks became one sidebar tab with three views:
//   • Start here — plain-language cards, each one job, one button. This is
//     the view a non-technical operator needs: it says what to do and why,
//     and jumps straight to the right tool.
//   • Website & SEO — the full SEO desk (audit, Topic Scout, indexing).
//   • AI agents — the full AI Growth desk (agents, advisor, history & undo).
//
// NOTHING was removed or re-implemented: SeoDesk and AiGrowth render here
// unchanged, so every existing test and workflow still holds. This file only
// adds the simple front door.
import React, { useState } from 'react';
import { Rocket, Search, Bot, Sparkles, HeartPulse, History, ArrowRight, BookOpenCheck } from 'lucide-react';
import SeoDesk from './seo-desk.jsx';
import AiGrowth from './ai-growth.jsx';

const CARDS = [
  {
    id: 'publish', icon: Sparkles, go: 'seo',
    title: 'Publish a fresh guide',
    text: 'Topic Scout suggests ready-made article topics from your live stock. Pick one, press “Approve & publish”, and the AI writes, checks and publishes it — about a minute.',
    button: 'Open Topic Scout', why: 'Fresh guides are the single biggest reason Google sends new buyers.'
  },
  {
    id: 'health', icon: HeartPulse, go: 'seo',
    title: 'Check website health',
    text: '“Run full crawl” tests every public page the way Google sees it. You get a score per page and a copy-paste report: what you can fix yourself, and what to send to your developer agent.',
    button: 'Open the health check', why: 'Run it after every publish — broken pages lose rankings quietly.'
  },
  {
    id: 'agents', icon: Bot, go: 'agents',
    title: 'Run your AI workers',
    text: 'Three agents — Lead Gen, SEO Engine, Social — draft replies, articles and posts on a schedule. Everything waits for your approval; nothing is sent or published on its own.',
    button: 'Open the agents', why: 'The Upgrade Advisor tab also suggests what to improve next.'
  },
  {
    id: 'history', icon: History, go: 'agents', workspace: 'history',
    title: 'See what automation did — and undo it',
    text: 'Every publish and change lands in one history, in plain sentences. If something shouldn’t have happened, an administrator presses Undo and the previous version comes back.',
    button: 'Open History & undo', why: 'This is the safety net that makes one-click publishing safe.'
  }
];

export default function GrowthHub({
  token, notify = () => {}, goDesk = null, liveCars = [],
  canPublish = false, canPromote = false, canWrite = false,
  initialView = 'start'
}) {
  const [view, setView] = useState(initialView);
  // Which AiGrowth workspace to open; a key change remounts it on target.
  const [agentsFocus, setAgentsFocus] = useState(initialView === 'agents' ? 'overview' : null);

  const open = (target, workspace) => {
    if (target === 'agents') setAgentsFocus(workspace || 'overview');
    setView(target);
  };

  return (
    <div className="growth-hub">
      <div className="crm-subtabs growth-hub-nav" role="tablist" aria-label="Growth studio areas">
        {[['start', 'Start here', Rocket], ['seo', 'Website & SEO', Search], ['agents', 'AI agents', Bot]].map(([id, label, Icon]) => (
          <button key={id} role="tab" aria-selected={view === id} className={view === id ? 'active' : ''}
            onClick={() => open(id, id === 'agents' ? agentsFocus || 'overview' : undefined)} type="button">
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {view === 'start' && (
        <section className="crm-panel growth-start" aria-label="Start here">
          <div className="growth-start-head">
            <h3><Rocket size={16} /> Four jobs. One button each.</h3>
            <p className="crm-hint">
              This studio is your whole online growth operation: the website’s visibility (SEO), the AI workers,
              and the history of everything they did. You never need to remember where things live — start from a card.
            </p>
          </div>
          <div className="growth-start-grid">
            {CARDS.map(card => (
              <article key={card.id} className="growth-card">
                <card.icon size={20} aria-hidden="true" />
                <b>{card.title}</b>
                <p>{card.text}</p>
                <small><BookOpenCheck size={11} /> {card.why}</small>
                <button type="button" onClick={() => open(card.go, card.workspace)}>
                  {card.button} <ArrowRight size={13} />
                </button>
              </article>
            ))}
          </div>
          <p className="crm-hint growth-start-foot">
            A rhythm that works: <b>Monday</b> — approve one Topic Scout guide · <b>after any publish</b> — run the health check ·
            <b> any time</b> — glance at History to see what your automation has been doing.
          </p>
        </section>
      )}

      {view === 'seo' && (
        <SeoDesk token={token} canPublish={canPublish} canPromote={canPromote} notify={notify} liveCars={liveCars} />
      )}

      {view === 'agents' && (
        <AiGrowth key={agentsFocus || 'overview'} token={token} canWrite={canWrite} notify={notify}
          goDesk={goDesk} siteCars={liveCars} initialWorkspace={agentsFocus || 'overview'} />
      )}
    </div>
  );
}
