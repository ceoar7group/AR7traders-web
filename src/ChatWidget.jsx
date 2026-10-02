import React, {useEffect, useImperativeHandle, useRef, useState} from 'react';
import {MessageCircle, X, Send} from 'lucide-react';
import {getSettings} from './site-settings.js';

// ---------------------------------------------------------------------------
// On-site AI assistant — a floating chat for buyers.
//
// Every message POSTs {action:'chat'} to the EXISTING /api/leads function —
// the Vercel Hobby plan caps us at 12 serverless functions, so the assistant
// lives inside the enquiry endpoint rather than as a 13th file. Server-side,
// GEMINI_API_KEY (or OPENAI_API_KEY) grounds the answer in live site_listings
// and the contact settings; without a key a canned playbook answers. The
// widget itself is stateless and dependency-free — all intelligence lives in
// the function, so the bundle stays small and answers can't drift.
//
// Opening it from elsewhere (the vehicle page's "Chat Now"): render
//   <ChatWidget ref={chatRef} />   and call   chatRef.current.open()
// The widget keeps owning its own state, so opening it never re-renders the
// page that asked, and calling open() while it is already up just focuses the
// message box instead of silently doing nothing.
// ---------------------------------------------------------------------------
const WIDGET_CSS = `
.aw-float{position:fixed;right:24px;bottom:92px;z-index:130;width:52px;height:52px;border-radius:50%;
  border:0;cursor:pointer;display:grid;place-items:center;color:#fff;
  background:linear-gradient(145deg,#0b5c3d,#043f28);
  box-shadow:0 12px 30px rgba(4,63,40,.38),0 3px 8px rgba(0,0,0,.18);
  transition:transform .25s cubic-bezier(.2,.8,.3,1),box-shadow .25s}
.aw-float:hover{transform:translateY(-3px);box-shadow:0 18px 40px rgba(4,63,40,.5)}
.aw-float:focus-visible{outline:3px solid #ffd77a;outline-offset:3px}
.aw-panel{position:fixed;right:24px;bottom:156px;z-index:131;width:min(360px,calc(100vw - 32px));
  height:min(460px,calc(100vh - 200px));display:flex;flex-direction:column;overflow:hidden;
  background:#fff;color:#14231c;border-radius:18px;
  box-shadow:0 30px 70px rgba(10,25,18,.35),0 4px 14px rgba(0,0,0,.12);
  font-family:Manrope,system-ui,sans-serif;
  transform-origin:100% 100%;animation:aw-pop .24s cubic-bezier(.2,.8,.3,1) both}
@keyframes aw-pop{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:none}}
.aw-head{display:flex;align-items:center;gap:10px;padding:14px 14px 12px;color:#fff;
  background:linear-gradient(145deg,#0b5c3d,#043f28)}
.aw-head>div{flex:1;min-width:0}
.aw-head b{display:block;font-size:14px;letter-spacing:.2px}
.aw-head small{display:block;font-size:11px;opacity:.85;margin-top:2px}
.aw-head button{flex:none;width:30px;height:30px;border-radius:9px;border:0;cursor:pointer;
  background:rgba(255,255,255,.14);color:#fff;display:grid;place-items:center}
.aw-head button:hover{background:rgba(255,255,255,.26)}
.aw-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#f4f7f4}
.aw-msg{max-width:82%;padding:9px 12px;border-radius:14px;font-size:13.5px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word}
.aw-msg.bot{align-self:flex-start;background:#fff;color:#1c2b22;border:1px solid #e2e9e2;border-bottom-left-radius:4px}
.aw-msg.me{align-self:flex-end;background:#0b5c3d;color:#fff;border-bottom-right-radius:4px}
.aw-msg p{margin:0}
.aw-typing{display:flex;gap:5px;align-items:center;padding:12px 14px}
.aw-typing span{width:7px;height:7px;border-radius:50%;background:#9db3a5;animation:aw-blink 1.2s infinite ease-in-out}
.aw-typing span:nth-child(2){animation-delay:.15s}
.aw-typing span:nth-child(3){animation-delay:.3s}
@keyframes aw-blink{0%,80%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}
.aw-foot{display:flex;gap:8px;padding:10px;background:#fff;border-top:1px solid #e7ece7}
.aw-foot input{flex:1;min-width:0;height:40px;border-radius:12px;border:1px solid #d5ded5;padding:0 14px;
  font:inherit;font-size:13.5px;color:#14231c;background:#f7faf7;outline:none}
.aw-foot input:focus{border-color:#0b5c3d;box-shadow:0 0 0 3px rgba(11,92,61,.12)}
.aw-foot button{flex:none;width:40px;height:40px;border-radius:12px;border:0;cursor:pointer;
  background:#0b5c3d;color:#fff;display:grid;place-items:center}
.aw-foot button:disabled{opacity:.45;cursor:default}
@media (max-width:480px){.aw-float{right:16px;bottom:88px}.aw-panel{right:16px;bottom:152px}}
@media (prefers-reduced-motion:reduce){
  .aw-panel{animation:none}
  .aw-float{transition:none}.aw-float:hover{transform:none}
  .aw-typing span{animation:none;opacity:.6}
}
`;

export function ChatWidget({ref}) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef(null);
  const inputRef = useRef(null);
  const toggleRef = useRef(null);
  const openerRef = useRef(null); // whatever had focus when the panel opened
  const openRef = useRef(false);  // `open`, readable from the imperative handle

  useImperativeHandle(ref, () => ({
    open() {
      if (openRef.current) inputRef.current?.focus({preventScroll: true});
      else setOpen(true);
    }
  }), []);

  // Dialog focus management (WAI-ARIA authoring practices): move into the panel
  // when it opens and give focus back to whatever opened it when it closes — the
  // floating toggle, or the page's own "Chat Now" button.
  useEffect(() => {
    const wasOpen = openRef.current;
    openRef.current = open;
    if (open && !wasOpen) {
      const active = document.activeElement;
      openerRef.current = active && active !== document.body ? active : null;
      inputRef.current?.focus({preventScroll: true});
    } else if (!open && wasOpen) {
      // Focus only needs restoring when it was lost with the panel. If the
      // visitor closed it by clicking the floating toggle, focus is already there.
      const active = document.activeElement;
      if (!active || active === document.body) {
        const back = openerRef.current;
        (back && back.isConnected ? back : toggleRef.current)?.focus({preventScroll: true});
      }
      openerRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (open && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [msgs, open, busy]);

  async function send(e) {
    if (e) e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setBusy(true);
    const next = [...msgs, { role: 'user', content: text }];
    setMsgs(next);
    try {
      const r = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'chat', message: text, history: next.slice(0, -1).slice(-8) })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'The assistant is unavailable right now.');
      setMsgs(m => [...m, { role: 'assistant', content: j.reply || 'Sorry, I could not answer that — email us and the team will reply.' }]);
    } catch (err) {
      const s = getSettings();
      setMsgs(m => [...m, {
        role: 'assistant',
        content: 'Sorry — I could not reach the assistant. Email ' + s.contact_email + ' or continue on WhatsApp and we will pick this up.'
      }]);
    } finally {
      setBusy(false);
    }
  }

  return <>
    <style>{WIDGET_CSS}</style>
    {open && (
      <div
        className="aw-panel"
        role="dialog"
        aria-label="AR7 Traders assistant"
        onKeyDown={e => {
          // Escape closes the panel and must not also close a lightbox beneath it.
          if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
        }}
      >
        <div className="aw-head">
          <div><b>AR7 Assistant</b><small>Live Japan stock · shipping · pricing</small></div>
          <button onClick={() => setOpen(false)} aria-label="Close chat"><X size={15} /></button>
        </div>
        <div className="aw-body" ref={bodyRef}>
          {msgs.length === 0 && (
            <div className="aw-msg bot"><p>Hi! Ask me about our Japan stock, shipping to your country, or prices.</p></div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={'aw-msg ' + (m.role === 'user' ? 'me' : 'bot')}><p>{m.content}</p></div>
          ))}
          {busy && <div className="aw-msg bot aw-typing" aria-label="Assistant is typing"><span /><span /><span /></div>}
        </div>
        <form className="aw-foot" onSubmit={send}>
          <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} placeholder="Type your question…" aria-label="Message the assistant" disabled={busy} maxLength={2000} />
          <button type="submit" disabled={busy || !input.trim()} aria-label="Send message"><Send size={15} /></button>
        </form>
      </div>
    )}
    <button
      ref={toggleRef}
      className={'aw-float' + (open ? ' open' : '')}
      onClick={() => setOpen(v => !v)}
      aria-label={open ? 'Close the AR7 assistant chat' : 'Chat with the AR7 assistant'}
      aria-expanded={open}
    >
      {open ? <X size={22} /> : <MessageCircle size={22} />}
    </button>
  </>;
}
