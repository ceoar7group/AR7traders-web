// Free browser-to-browser voice call — /call/<room>.
//
// WHY this exists: real virtual phone numbers (UK/JP/CN) are never free, and
// AI voice telephony is a paid product with consent rules. What IS free is a
// direct WebRTC audio call between two browsers: the agent opens the room
// from the Call Desk, sends the customer the same link on WhatsApp/SMS, and
// both talk — no app install, no SIM, no per-minute cost.
//
// Signaling rides the Supabase Realtime channel the app already pays nothing
// for (broadcast only — no table rows, nothing stored). ICE uses Google's
// public STUN servers. There is deliberately NO TURN relay: a relay costs
// money, so on the rare strict corporate/CGNAT network where a direct path
// cannot be punched, the page says so honestly instead of silently eating
// minutes of "connecting…".
//
// The room id is a one-off shared secret in the URL (noindex, not in any
// sitemap or nav). Two participants maximum; a third visitor is told the
// room is full rather than letting them listen in.

import React, { useEffect, useRef, useState } from 'react';
import { supabase, hasSupabase } from './supabase-client.js';
import { PhoneCall, PhoneOff, Mic, MicOff, Copy, Check, ShieldCheck, Users } from 'lucide-react';

const STUN = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] };

/** Random, shareable room code — exported for the Call Desk and tests. */
export function makeRoomCode() {
  const a = () => Math.random().toString(36).slice(2, 6);
  return 'ar7-' + a() + a();
}

/** Deterministic "who sends the offer" rule: higher peer id offers. Pure, tested. */
export function shouldOffer(myId, otherId) {
  return String(myId) > String(otherId);
}

/** Honest, actionable message for each way getUserMedia actually fails.
 *  Exported for tests: the generic "access was refused" used to hide the real
 *  blocker (a page-level permissions policy) behind advice about browser
 *  settings the caller had already checked. */
export function micErrorMessage(e) {
  const name = e?.name || '';
  if (name === 'NotSupportedError') {
    return 'This page cannot reach a microphone at all — it must be opened over https, directly (not inside a preview frame). Open the call link in its own browser tab and try again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No microphone was found on this device. Plug in or enable a microphone and press Join again.';
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return 'The microphone is busy in another app (a meeting, another tab, voice software). Close whatever is using it and press Join again.';
  }
  // NotAllowedError and anything unrecognised: either the browser permission
  // or the page's own permissions policy said no.
  return 'Microphone access was blocked. Check the microphone permission for this site in your browser, close other tabs using the mic, then press Join again.';
}

export default function WebCallPage({ room }) {
  const code = String(room || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  const [stage, setStage] = useState('lobby'); // lobby|joining|waiting|connecting|live|ended|failed|full
  const [muted, setMuted] = useState(false);
  const [secs, setSecs] = useState(0);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');
  const pcRef = useRef(null), chRef = useRef(null), streamRef = useRef(null), audioRef = useRef(null);
  const myIdRef = useRef(Math.random().toString(36).slice(2, 12));
  const offeredRef = useRef(false);
  const stageRef = useRef('lobby');
  const setPhase = s => { stageRef.current = s; setStage(s); };

  useEffect(() => () => hangup(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (stage !== 'live') return;
    const t = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [stage]);

  const link = (typeof location !== 'undefined' ? location.origin : 'https://ar7traders.com') + '/call/' + code;

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* http context */ }
  };

  function hangup(announce = true) {
    try { if (announce && chRef.current) chRef.current.send({ type: 'broadcast', event: 'signal', payload: { kind: 'bye', from: myIdRef.current } }); } catch { }
    try { pcRef.current?.close(); } catch { }
    try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch { }
    try { if (chRef.current) supabase?.removeChannel(chRef.current); } catch { }
    pcRef.current = null; chRef.current = null; streamRef.current = null;
    if (announce) setPhase('ended');
  }

  const sendSignal = payload => chRef.current?.send({ type: 'broadcast', event: 'signal', payload: { ...payload, from: myIdRef.current } });

  async function handleSignal(p) {
    const pc = pcRef.current;
    if (!pc || !p || p.from === myIdRef.current) return;
    try {
      if (p.kind === 'offer' && p.to === myIdRef.current) {
        await pc.setRemoteDescription(p.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal({ kind: 'answer', to: p.from, sdp: pc.localDescription });
      } else if (p.kind === 'answer' && p.to === myIdRef.current) {
        await pc.setRemoteDescription(p.sdp);
      } else if (p.kind === 'ice' && p.candidate) {
        await pc.addIceCandidate(p.candidate).catch(() => { });
      } else if (p.kind === 'bye') {
        hangup(false); setPhase('ended');
      }
    } catch { /* a malformed signal must not crash the call page */ }
  }

  async function maybeOffer(otherId) {
    const pc = pcRef.current;
    if (!pc || offeredRef.current || !shouldOffer(myIdRef.current, otherId)) return;
    offeredRef.current = true;
    setPhase('connecting');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal({ kind: 'offer', to: otherId, sdp: pc.localDescription });
  }

  async function join() {
    setErr('');
    if (!hasSupabase) { setErr('Calling is not available right now — the connection service is not configured on this deployment.'); return; }
    setPhase('joining');
    let stream;
    try {
      // getUserMedia only exists in a secure context (https) outside any
      // iframe that withholds the microphone permission. Surfacing THAT as
      // its own message matters: for weeks the real blocker in production
      // was the site-wide `Permissions-Policy: microphone=()` header — the
      // user HAD granted permission, and "access was refused" sent them
      // digging through browser settings that were already correct.
      if (!navigator.mediaDevices?.getUserMedia) {
        throw Object.assign(new Error('no mediaDevices'), { name: 'NotSupportedError' });
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      setPhase('lobby');
      setErr(micErrorMessage(e));
      return;
    }
    streamRef.current = stream;
    const pc = new RTCPeerConnection(STUN);
    pcRef.current = pc;
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    pc.ontrack = e => { if (audioRef.current) { audioRef.current.srcObject = e.streams[0]; audioRef.current.play().catch(() => { }); } };
    pc.onicecandidate = e => { if (e.candidate) sendSignal({ kind: 'ice', candidate: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setPhase('live');
      else if (['failed', 'disconnected'].includes(pc.connectionState) && stageRef.current !== 'ended') setPhase('failed');
    };

    const ch = supabase.channel('webcall-' + code, {
      config: { broadcast: { self: false }, presence: { key: myIdRef.current } }
    });
    chRef.current = ch;
    ch.on('broadcast', { event: 'signal' }, ({ payload }) => handleSignal(payload));
    ch.on('presence', { event: 'sync' }, () => {
      const ids = Object.keys(ch.presenceState());
      if (ids.length > 2 && ids.sort().indexOf(myIdRef.current) >= 2) { hangup(false); setPhase('full'); return; }
      const other = ids.find(id => id !== myIdRef.current);
      if (other) maybeOffer(other).catch(() => setPhase('failed'));
      else if (stageRef.current === 'joining' || stageRef.current === 'connecting') setPhase('waiting');
    });
    ch.subscribe(async status => {
      if (status === 'SUBSCRIBED') { await ch.track({ at: Date.now() }); if (stageRef.current === 'joining') setPhase('waiting'); }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { setPhase('failed'); }
    });
  }

  const toggleMute = () => {
    const next = !muted;
    streamRef.current?.getAudioTracks().forEach(t => { t.enabled = !next; });
    setMuted(next);
  };

  const mins = String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0');

  return (
    <div className="webcall-page">
      <style>{`
        .webcall-page{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:#0d1a14;color:#eef5f0;font-family:Manrope,system-ui,sans-serif;padding:24px;text-align:center}
        .webcall-page .wc-brand{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:.08em}
        .webcall-page .wc-brand img{width:46px;height:29px}
        .webcall-page .wc-card{background:#13241c;border:1px solid #27483a;border-radius:16px;padding:28px 26px;max-width:460px;width:100%;display:flex;flex-direction:column;gap:14px;align-items:center}
        .webcall-page h1{font-size:1.25rem;margin:0}
        .webcall-page p{margin:0;color:#aac4b6;font-size:.92rem;line-height:1.55}
        .webcall-page .wc-room{font-family:ui-monospace,monospace;background:#0d1a14;border:1px dashed #3a5c4b;border-radius:8px;padding:6px 12px;color:#d9c08a;font-size:.9rem}
        .webcall-page button{display:inline-flex;align-items:center;gap:8px;border:0;border-radius:999px;padding:12px 22px;font-weight:700;cursor:pointer;font-size:.95rem}
        .webcall-page .wc-join{background:#2f9e68;color:#fff}
        .webcall-page .wc-join:hover{background:#37b377}
        .webcall-page .wc-end{background:#b23a3a;color:#fff}
        .webcall-page .wc-ghost{background:#1d352a;color:#cfe3d7;border:1px solid #2f5342}
        .webcall-page .wc-row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
        .webcall-page .wc-timer{font-size:1.8rem;font-weight:800;font-variant-numeric:tabular-nums}
        .webcall-page .wc-note{font-size:.78rem;color:#7d998c;max-width:420px}
        .webcall-page .wc-err{color:#f0b9b9;font-size:.88rem;background:#3a1d1d;border:1px solid #6b3030;border-radius:8px;padding:8px 12px}
        .webcall-page .wc-pulse{width:14px;height:14px;border-radius:50%;background:#37b377;animation:wcp 1.2s infinite}
        @keyframes wcp{0%{box-shadow:0 0 0 0 rgba(55,179,119,.5)}70%{box-shadow:0 0 0 12px rgba(55,179,119,0)}100%{box-shadow:0 0 0 0 rgba(55,179,119,0)}}
      `}</style>
      <div className="wc-brand"><img src="/assets/ar7-mark-128.webp" alt="AR7" width="46" height="29" /> AR7 TRADERS · VOICE CALL</div>
      <div className="wc-card">
        {!code ? (<>
          <h1>No call room in this link</h1>
          <p>A call link looks like <span className="wc-room">/call/ar7-xxxxxxxx</span>. Ask the person who invited you to resend it, or <a href="/contact" style={{ color: '#d9c08a' }}>contact us</a>.</p>
        </>) : stage === 'lobby' || stage === 'joining' ? (<>
          <h1>Free voice call</h1>
          <p>Talk directly through your browser — nothing to install, no phone charges. Your microphone is used only while you are in the call; the conversation is browser-to-browser and is not recorded.</p>
          <span className="wc-room">{code}</span>
          {err && <span className="wc-err">{err}</span>}
          <button type="button" className="wc-join" onClick={join} disabled={stage === 'joining'}><PhoneCall size={17} /> {stage === 'joining' ? 'Joining…' : 'Join the call'}</button>
          <span className="wc-note"><ShieldCheck size={12} /> Works on normal home/mobile networks. Some strict office networks block direct calls — if it will not connect, we will call you on WhatsApp instead.</span>
        </>) : stage === 'waiting' ? (<>
          <div className="wc-pulse" aria-hidden="true" />
          <h1>Waiting for the other person…</h1>
          <p>Share this link so they can join:</p>
          <span className="wc-room">{link}</span>
          <div className="wc-row">
            <button type="button" className="wc-ghost" onClick={copyLink}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy link'}</button>
            <button type="button" className="wc-end" onClick={() => hangup(true)}><PhoneOff size={15} /> Leave</button>
          </div>
        </>) : stage === 'connecting' ? (<>
          <div className="wc-pulse" aria-hidden="true" />
          <h1>Connecting…</h1>
          <p>Setting up the direct audio line.</p>
          <button type="button" className="wc-end" onClick={() => hangup(true)}><PhoneOff size={15} /> Cancel</button>
        </>) : stage === 'live' ? (<>
          <span className="wc-timer">{mins}</span>
          <h1>You are connected</h1>
          <div className="wc-row">
            <button type="button" className="wc-ghost" onClick={toggleMute}>{muted ? <MicOff size={15} /> : <Mic size={15} />} {muted ? 'Unmute' : 'Mute'}</button>
            <button type="button" className="wc-end" onClick={() => hangup(true)}><PhoneOff size={15} /> End call</button>
          </div>
        </>) : stage === 'full' ? (<>
          <Users size={28} />
          <h1>This room is full</h1>
          <p>A call room holds two people. Ask for a fresh link.</p>
        </>) : stage === 'failed' ? (<>
          <h1>The call could not connect</h1>
          <p>This usually means a strict office network is blocking direct calls. No cost was incurred. Message us on WhatsApp and we will call you there instead.</p>
          <div className="wc-row">
            <button type="button" className="wc-join" onClick={() => { hangup(false); offeredRef.current = false; setPhase('lobby'); }}><PhoneCall size={15} /> Try again</button>
          </div>
        </>) : (<>
          <h1>Call ended</h1>
          <p>Thank you for talking with AR7 Traders.</p>
          <div className="wc-row">
            <a href="/"><button type="button" className="wc-ghost">Back to the website</button></a>
          </div>
        </>)}
      </div>
      <audio ref={audioRef} autoPlay playsInline />
    </div>
  );
}
