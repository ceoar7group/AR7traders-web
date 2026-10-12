// AI Growth — the CRM management area for the three growth agents.
//
// WHAT THIS IS
// A management area, not three Run buttons. It shows which agents are enabled
// or paused, when they last ran and when they run next, what is queued, what is
// waiting for review, what failed, and how the provider is configured — with a
// clear DRY-RUN / REVIEW / PRODUCTION distinction everywhere, because the one
// thing an operator must never be able to do is mistake a draft for something
// that has already happened.
//
// The three workspaces are the places work actually gets reviewed:
//   • Lead Gen & CRM — enquiry summary, consent, matching stock, score with its
//     evidence, the reply draft and the follow-up actions.
//   • SEO Engine — keyword opportunities with their evidence source, drafts and
//     briefs, technical findings classified safe / review-required, and
//     submission evidence.
//   • Social Media — the approval calendar, exact channel captions, downloadable
//     media, account connection state and submission outcomes.
//
// Every action goes through the CRM's permission model (`canWrite`) and every
// server call is authenticated with the session token. Nothing is published,
// sent or posted from this file: approving unlocks execution, and execution
// records what actually happened.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bot, Play, Pause, Square, ShieldAlert, Check, X, RefreshCw, Sparkles,
  AlertTriangle, Clock, ListChecks, Users, Search, Megaphone, Download,
  Copy, ExternalLink, Ban, Eye, KeyRound, Wifi, WifiOff, CircleSlash, Send
} from 'lucide-react';
import { RowActions } from './row-actions.jsx';

const AGENT_META = {
  leads: { label: 'Lead Gen & CRM', icon: Users, blurb: 'Enquiry ingestion, stock matching, CIF estimates, readiness scoring and WhatsApp reply drafts.' },
  seo: { label: 'SEO Engine', icon: Search, blurb: 'Evidence-based destination guides, market-watch drafts, keyword opportunities and safe technical checks.' },
  social: { label: 'Social Media', icon: Megaphone, blurb: 'Daily featured machine, channel captions, specification cards, alt text and the approval queue.' }
};

const STATUS_TONE = {
  queued: 'dormant', running: 'active', awaiting_review: 'active', approved: 'active',
  executing: 'active', completed: 'active', rejected: 'dormant', cancelled: 'dormant',
  failed: 'danger', partially_completed: 'danger', executed: 'active'
};

const MODE_LABEL = {
  'dry-run': 'DRY RUN — nothing external happens',
  review: 'REVIEW — drafts only, awaiting approval',
  execute: 'PRODUCTION — approved actions execute'
};

async function callApi(token, path, { method = 'GET', body = null } = {}) {
  const response = await fetch(path, {
    method,
    cache: 'no-store',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `HTTP ${response.status}`);
    error.body = payload;
    throw error;
  }
  return payload;
}

const when = value => {
  if (!value) return '—';
  try { return new Date(value).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return '—'; }
};

export default function AiGrowth({ token, canWrite = false, notify = () => {}, navigate = null }) {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [workspace, setWorkspace] = useState('overview');
  const [detail, setDetail] = useState(null);
  const [providerTest, setProviderTest] = useState(null);
  const [mode, setMode] = useState('dry-run');
  const [activeAgentFilter, setActiveAgentFilter] = useState('all');

  const load = useCallback(async () => {
    try {
      setError('');
      const data = await callApi(token, '/api/site-content?agents=overview&limit=40');
      setOverview(data);
    } catch (e) {
      setError(e.message);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // The server is explicit about why something did not happen (disabled,
  // paused, emergency stop, duplicate, limit reached). Those reasons are shown
  // verbatim instead of a generic "done", because "nothing ran" and "it ran"
  // must never look the same to an operator.
  const describe = (out, label) => {
    if (out?.reason) return `${label}: ${out.state || 'not run'} — ${out.reason}`;
    if (out?.state && out.state !== 'completed' && out.state !== 'ok') return `${label}: ${out.state}`;
    if (typeof out?.message === 'string') return out.message;
    if (Array.isArray(out?.drafts) && out.drafts.length) return `${label}: ${out.drafts.length} draft(s) awaiting review — nothing published, sent or posted.`;
    return `${label} done.`;
  };

  const act = async (label, path, options) => {
    setBusy(label);
    try {
      const out = await callApi(token, path, options);
      notify(describe(out, label));
      return out;
    } catch (e) {
      const ownerAction = e.body?.ownerAction ? ` ${e.body.ownerAction}` : '';
      setError(`${e.message}.${ownerAction}`);
      return null;
    } finally {
      setBusy('');
      await load();
    }
  };

  const agents = overview?.agents || [];
  const runs = overview?.runs || [];
  const drafts = overview?.drafts || [];
  const settings = overview?.settings || {};
  const counts = overview?.counts || {};

  const pendingDrafts = useMemo(
    () => drafts.filter(d => d.status === 'awaiting_review' && (activeAgentFilter === 'all' || d.agent === activeAgentFilter)),
    [drafts, activeAgentFilter]
  );
  const approvedDrafts = drafts.filter(d => d.status === 'approved');
  const recentRuns = runs.filter(r => activeAgentFilter === 'all' || r.agent === activeAgentFilter);

  const nextRunFor = agent => {
    const config = agents.find(a => a.agent === agent);
    if (!config) return 'Not configured';
    if (!config.enabled) return 'Disabled';
    if (config.paused) return 'Paused';
    return config.schedule_cron ? `${config.schedule_cron} (${config.timezone || 'UTC'})` : 'Manual only';
  };

  const toggleAgent = (agent, patch) => act(`${agent} updated`, '/api/site-content?agents=config-update', {
    method: 'POST', body: { agent, ...patch }
  });

  const globalPatch = patch => act('settings updated', '/api/site-content?agents=config-update', { method: 'POST', body: { global: patch } });

  const runNow = agent => act(`${AGENT_META[agent]?.label || agent} run`, '/api/site-content?agents=run', {
    method: 'POST',
    body: { agent, mode, idempotencyKey: `${agent}:${new Date().toISOString().slice(0, 16)}:${mode}` }
  });

  const reviewDraft = (id, approve, note = '') => act(approve ? 'Draft approved' : 'Draft rejected', '/api/site-content?agents=approve', {
    method: 'POST', body: { id, approve, note }
  });

  const executeDraftById = id => act('Draft executed', '/api/site-content?agents=execute', { method: 'POST', body: { id } });
  const cancelDraftById = id => act('Draft cancelled', '/api/site-content?agents=cancel', { method: 'POST', body: { id, reason: 'cancelled in AI Growth' } });

  const openDetail = async id => {
    setBusy('draft');
    try { setDetail(await callApi(token, `/api/site-content?agents=draft&id=${encodeURIComponent(id)}`)); }
    catch (e) { setError(e.message); }
    finally { setBusy(''); }
  };

  const copyText = async (text, label = 'Copied') => {
    try { await navigator.clipboard.writeText(text || ''); notify(label); }
    catch { notify('Copy failed — select the text and copy it manually.'); }
  };

  const testProvider = async () => {
    setBusy('provider');
    try {
      const out = await callApi(token, '/api/site-content?seo=ai-status&test=1', { method: 'POST', body: { test: true } });
      setProviderTest(out.connectionTest || out);
    } catch (e) {
      setProviderTest({ ok: false, state: e.body?.state || 'error', message: e.message, ownerAction: e.body?.ownerAction });
    } finally { setBusy(''); }
  };

  if (!canWrite) {
    return (
      <div className="crm-empty">
        <ShieldAlert />
        <h3>AI Growth needs the “Edit the public website” permission</h3>
        <p>The agents produce public content and outbound drafts, so they are gated by the same permission as listings and articles. Ask an administrator.</p>
      </div>
    );
  }

  return (
    <div className="crm-ai-growth">
      <div className="crm-page-head">
        <div>
          <p>
            Lead Gen &amp; CRM, SEO Engine and Social Media, managed from one place. Agents only ever produce
            drafts; publishing, sending and posting each require a separate approval, and sending additionally
            requires an authorised, connected account.
          </p>
        </div>
        <div className="crm-tools">
          <button onClick={load} title="Reload the dashboard" type="button"><RefreshCw size={13} /> Refresh</button>
          <button onClick={testProvider} disabled={busy === 'provider'} type="button" title="Test the configured AI provider (no draft is generated or saved)">
            <Wifi size={13} /> {busy === 'provider' ? 'Testing…' : 'Test provider'}
          </button>
        </div>
      </div>

      {error && (
        <div className="crm-alert" role="alert">
          <AlertTriangle size={14} /> <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Dismiss"><X size={13} /></button>
        </div>
      )}

      {/* ---- Live state banner: the three modes must never be confusable ---- */}
      <div className={`ai-banner ${settings.emergencyStop ? 'is-stopped' : settings.enabled ? 'is-live' : 'is-off'}`} role="status">
        <b>{settings.emergencyStop ? 'EMERGENCY STOP IS ON' : settings.enabled ? 'AI Growth is enabled' : 'AI Growth is switched off'}</b>
        <span>
          {settings.emergencyStop
            ? 'No agent will run and nothing may execute until it is switched off.'
            : `Provider: ${overview?.provider?.name || 'unknown'} · model ${overview?.provider?.model || '—'} · tier ${overview?.provider?.tier || '—'}. Drafts are never presented as published.`}
        </span>
        {!settings.emergencyStop && (
          <div className="ai-banner-actions">
            <button className="crm-del" type="button" onClick={() => globalPatch({ ai_growth_emergency_stop: true })}><Square size={13} /> Emergency stop</button>
            {!settings.enabled && <button type="button" onClick={() => globalPatch({ ai_growth_enabled: true })}><Play size={13} /> Switch on</button>}
          </div>
        )}
        {settings.emergencyStop && (
          <div className="ai-banner-actions">
            <button type="button" onClick={() => globalPatch({ ai_growth_emergency_stop: false })}><Play size={13} /> Resume all agents</button>
          </div>
        )}
      </div>

      {overview?.ownerAction && (
        <div className="crm-alert" role="alert"><AlertTriangle size={14} /><span>{overview.ownerAction}</span></div>
      )}
      {overview?.error && (
        <div className="crm-alert" role="alert">
          <AlertTriangle size={14} />
          <span>{overview.error}{overview.ownerAction ? ` ${overview.ownerAction}` : ''}</span>
        </div>
      )}

      <div className="crm-subtabs ai-tabs" role="tablist" aria-label="AI Growth areas">
        {[['overview', 'Overview'], ['leads', 'Lead workspace'], ['seo', 'SEO workspace'], ['social', 'Social workspace']].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={workspace === id} className={workspace === id ? 'active' : ''} onClick={() => setWorkspace(id)} type="button">{label}</button>
        ))}
      </div>

      {workspace === 'overview' && (
        <>
          <div className="ai-kpis">
            <article><ListChecks size={16} /><b>{counts.awaitingReview ?? 0}</b><span>awaiting review</span></article>
            <article><Check size={16} /><b>{counts.approved ?? 0}</b><span>approved, not executed</span></article>
            <article><Play size={16} /><b>{counts.running ?? 0}</b><span>running now</span></article>
            <article className={(counts.failed ?? 0) ? 'is-alert' : ''}><AlertTriangle size={16} /><b>{counts.failed ?? 0}</b><span>failed / partial runs</span></article>
          </div>

          <div className="ai-agents">
            {agents.map(agent => {
              const meta = AGENT_META[agent.agent] || {};
              const Icon = meta.icon || Bot;
              const last = runs.find(r => r.agent === agent.agent);
              return (
                <article key={agent.agent} className={'ai-agent' + (agent.enabled && !agent.paused ? ' is-on' : '')}>
                  <header>
                    <i><Icon size={16} /></i>
                    <div>
                      <b>{meta.label || agent.label}</b>
                      <span>{meta.blurb}</span>
                    </div>
                    <em className={'crm-status ' + (agent.enabled && !agent.paused ? 'active' : 'dormant')}>
                      {agent.paused ? 'Paused' : agent.enabled ? 'Enabled' : 'Disabled'}
                    </em>
                  </header>
                  <dl>
                    <div><dt>Mode</dt><dd>{agent.dry_run ? 'Dry run — no external effects' : 'Review — drafts for approval'}</dd></div>
                    <div><dt>Last run</dt><dd>{last ? `${when(last.created_at)} · ${last.status}` : 'Never'}</dd></div>
                    <div><dt>Next run</dt><dd>{nextRunFor(agent.agent)}</dd></div>
                    <div><dt>Limits</dt><dd>{agent.max_items_per_run} item(s)/run · {agent.max_runs_per_day} runs/day</dd></div>
                    <div><dt>Approval</dt><dd>{agent.require_approval ? 'Required' : 'Not required'} · unattended send {agent.autopublish ? 'AUTHORISED' : 'not authorised'}</dd></div>
                  </dl>
                  <footer>
                    <label className="ai-switch">
                      <input type="checkbox" checked={!!agent.enabled} onChange={e => toggleAgent(agent.agent, { enabled: e.target.checked })} />
                      <span>Enabled</span>
                    </label>
                    <label className="ai-switch">
                      <input type="checkbox" checked={!!agent.paused} onChange={e => toggleAgent(agent.agent, { paused: e.target.checked })} />
                      <span>Paused</span>
                    </label>
                    <label className="ai-switch">
                      <input type="checkbox" checked={!!agent.dry_run} onChange={e => toggleAgent(agent.agent, { dry_run: e.target.checked })} />
                      <span>Dry run</span>
                    </label>
                    <label className="ai-switch" title="Only switch this on when an authorised provider connection is configured. Drafts still require approval.">
                      <input type="checkbox" checked={!!agent.autopublish} onChange={e => toggleAgent(agent.agent, { autopublish: e.target.checked })} />
                      <span>Unattended send authorised</span>
                    </label>
                  </footer>
                </article>
              );
            })}
          </div>

          <div className="ai-runbar">
            <label>
              Run mode
              <select value={mode} onChange={e => setMode(e.target.value)}>
                <option value="dry-run">dry-run (no external effects)</option>
                <option value="review">review (drafts for approval)</option>
              </select>
            </label>
            <span className="crm-hint">{MODE_LABEL[mode] || ''}</span>
            {agents.map(agent => (
              <button key={agent.agent} className="crm-add" type="button" disabled={!!busy || !agent.enabled || agent.paused || settings.emergencyStop}
                onClick={() => runNow(agent.agent)} title={!agent.enabled ? 'Enable this agent first' : 'Run one bounded, leased, idempotent pass'}>
                <Play size={13} /> Run {AGENT_META[agent.agent]?.label || agent.agent} now
              </button>
            ))}
          </div>

          {providerTest && (
            <div className={`ai-provider-test ${providerTest.ok ? 'is-ok' : 'is-bad'}`} role="status">
              {providerTest.ok ? <Wifi size={14} /> : <WifiOff size={14} />}
              <b>{providerTest.ok ? 'Provider connected' : `Provider not usable (${providerTest.state || 'error'})`}</b>
              <span>
                Model {providerTest.model} · key {providerTest.keyHint || 'not set'} · {providerTest.latencyMs != null ? `${providerTest.latencyMs} ms` : 'no response'}
                {providerTest.message ? ` · ${providerTest.message}` : ''}
              </span>
              {providerTest.ownerAction && <span className="ai-owner-action">{providerTest.ownerAction}</span>}
            </div>
          )}

          <section className="ai-panel">
            <h3><Bot size={15} /> Jobs</h3>
            <p className="crm-hint">Input scope, timing, step outcomes and provider usage for every run. Retry and cancel are per job; nothing here publishes.</p>
            <div className="ai-table-wrap crm-cards-sm">
              <table>
                <thead>
                  <tr><th>Agent</th><th>Status</th><th>Mode</th><th>Started</th><th>Counts</th><th>Provider</th><th className="th-actions">Actions</th></tr>
                </thead>
                <tbody>
                  {recentRuns.map(run => (
                    <tr key={run.id}>
                      <td data-label="Agent"><b>{AGENT_META[run.agent]?.label || run.agent}</b><br /><small>{String(run.id).slice(0, 8)} · {run.trigger}</small></td>
                      <td data-label="Status">
                        <em className={'crm-status ' + (STATUS_TONE[run.status] || 'dormant')}>{run.status}</em>
                        {run.error && <small className="ai-err"> {run.error}</small>}
                      </td>
                      <td data-label="Mode">{run.mode}</td>
                      <td data-label="Started">{when(run.started_at || run.created_at)}</td>
                      <td data-label="Counts">
                        attempted {run.counts?.attempted ?? 0} · succeeded {run.counts?.succeeded ?? 0} · skipped {run.counts?.skipped ?? 0} · failed {run.counts?.failed ?? 0} · drafted {run.counts?.drafted ?? 0}
                      </td>
                      <td data-label="Provider">{run.provider?.name || '—'}{run.provider?.usage?.totalTokens != null ? ` · ${run.provider.usage.totalTokens} tok` : ''}</td>
                      <td className="crm-row-actions" data-label="Actions">
                        <RowActions
                          label={`Run actions for ${run.agent}`}
                          primary={{ key: 'open', label: 'Open', icon: <Eye size={13} />, title: 'Open the runs’ drafts', onSelect: () => setWorkspace(run.agent) }}
                          items={[
                            { key: 'retry', label: 'Retry this run', icon: <RefreshCw size={13} />, title: 'Start a fresh bounded run (idempotency still applies)',
                              onSelect: () => runNow(run.agent) },
                            { divider: true },
                            { key: 'cancel', label: 'Cancel / release lease', icon: <Ban size={13} />, danger: true,
                              title: 'Mark the job cancelled and release its lease',
                              disabled: ['completed', 'failed', 'cancelled'].includes(run.status),
                              onSelect: () => act('Run cancelled', '/api/site-content?agents=cancel', { method: 'POST', body: { runId: run.id, reason: 'cancelled in AI Growth' } }) }
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                  {!recentRuns.length && <tr><td colSpan={7}><div className="crm-empty"><Clock /><h3>No runs yet</h3><p>Enable an agent and press Run now, or wait for the scheduled runner.</p></div></td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="ai-panel">
            <h3><Sparkles size={15} /> Review queue</h3>
            <p className="crm-hint">Drafts awaiting a decision. Approving unlocks execution; rejecting keeps the record for the audit trail. Nothing here has been published, sent or posted.</p>
            <ul className="ai-drafts">
              {pendingDrafts.map(draft => (
                <li key={draft.id}>
                  <div className="ai-draft-head">
                    <em className={'crm-status ' + (STATUS_TONE[draft.status] || 'dormant')}>{draft.status}</em>
                    <b>{draft.title}</b>
                    <small>{AGENT_META[draft.agent]?.label || draft.agent} · {draft.kind} · {when(draft.created_at)}</small>
                  </div>
                  {draft.meta?.warnings?.length > 0 && (
                    <ul className="ai-warnings">{draft.meta.warnings.map((w, i) => <li key={i}><AlertTriangle size={12} /> {w}</li>)}</ul>
                  )}
                  <div className="ai-draft-actions">
                    <button type="button" onClick={() => openDetail(draft.id)}><Eye size={13} /> Open</button>
                    <button className="save" type="button" disabled={!!busy} onClick={() => reviewDraft(draft.id, true)}><Check size={13} /> Approve</button>
                    <button className="crm-del" type="button" disabled={!!busy} onClick={() => reviewDraft(draft.id, false, 'rejected in AI Growth')}><X size={13} /> Reject</button>
                  </div>
                </li>
              ))}
              {!pendingDrafts.length && <li className="ai-empty"><ListChecks size={16} /> Nothing is waiting for review.</li>}
            </ul>
          </section>

          {approvedDrafts.length > 0 && (
            <section className="ai-panel">
              <h3><Send size={15} /> Approved — not yet executed</h3>
              <p className="crm-hint">An approval is a decision, not an execution. Executing records exactly what happened; sending still needs an authorised connection.</p>
              <ul className="ai-drafts">
                {approvedDrafts.map(draft => (
                  <li key={draft.id}>
                    <div className="ai-draft-head"><em className="crm-status active">approved</em><b>{draft.title}</b><small>{draft.kind}</small></div>
                    <div className="ai-draft-actions">
                      <button type="button" onClick={() => openDetail(draft.id)}><Eye size={13} /> Open</button>
                      <button className="save" type="button" disabled={!!busy} onClick={() => executeDraftById(draft.id)}><Play size={13} /> Execute</button>
                      <button className="crm-del" type="button" disabled={!!busy} onClick={() => cancelDraftById(draft.id)}><Ban size={13} /> Cancel</button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="ai-panel">
            <h3><KeyRound size={15} /> Provider usage and quota</h3>
            <p className="crm-hint">
              Requests and tokens actually reported by the provider. Cost estimates are shown only when numbers were supplied — nothing is estimated.
              Free-tier content may be used by Google to improve their products: never send customer contact details, supplier pricing or documents.
            </p>
            <div className="ai-usage">
              {(overview?.usage || []).map(row => (
                <article key={row.id || `${row.provider}-${row.feature}-${row.day}`}>
                  <b>{row.provider} · {row.feature}</b>
                  <span>{row.day} · {row.requests} request(s) · in {row.tokens_in} / out {row.tokens_out} tokens</span>
                  {row.last_state && <em className={/exhaust|invalid|limit/i.test(row.last_state) ? 'is-alert' : ''}>{row.last_state}</em>}
                  {row.errors > 0 && <em className="is-alert">{row.errors} error(s)</em>}
                </article>
              ))}
              {!(overview?.usage || []).length && <p className="crm-hint">No provider usage recorded yet.</p>}
            </div>
          </section>
        </>
      )}

      {(workspace === 'leads' || workspace === 'seo' || workspace === 'social') && (
        <AgentWorkspace
          agent={workspace}
          drafts={drafts.filter(d => d.agent === workspace)}
          onOpen={openDetail}
          onApprove={id => reviewDraft(id, true)}
          onReject={id => reviewDraft(id, false, 'rejected in workspace')}
          onExecute={executeDraftById}
          onCancel={cancelDraftById}
          onCopy={copyText}
          busy={busy}
          navigate={navigate}
        />
      )}

      {detail && (
        <div className="crm-modal-bg" onMouseDown={() => setDetail(null)}>
          <div className="crm-editor wide ai-detail" role="dialog" aria-modal="true" aria-label="Draft detail" onMouseDown={e => e.stopPropagation()}>
            <header>
              <div>
                <small>{AGENT_META[detail.draft.agent]?.label || detail.draft.agent} · {detail.draft.kind}</small>
                <h2>{detail.draft.title}</h2>
              </div>
              <button type="button" onClick={() => setDetail(null)} aria-label="Close"><X /></button>
            </header>
            <div className="ai-detail-body">
              <section>
                <h4>Draft</h4>
                <pre>{detail.draft.body}</pre>
              </section>
              <aside>
                <h4>Job</h4>
                {detail.run ? (
                  <dl className="ai-facts">
                    <div><dt>Status</dt><dd>{detail.run.status}</dd></div>
                    <div><dt>Mode</dt><dd>{detail.run.mode} ({MODE_LABEL[detail.run.mode] || '—'})</dd></div>
                    <div><dt>Started</dt><dd>{when(detail.run.started_at)}</dd></div>
                    <div><dt>Finished</dt><dd>{when(detail.run.finished_at)}</dd></div>
                    <div><dt>Requested by</dt><dd>{detail.run.requested_by || '—'}</dd></div>
                    <div><dt>Approved by</dt><dd>{detail.draft.approved_by || '—'}</dd></div>
                    <div><dt>Executed by</dt><dd>{detail.draft.executed_by || '—'}</dd></div>
                    <div><dt>Provider</dt><dd>{detail.run.provider?.name || '—'} {detail.run.provider?.model || ''}</dd></div>
                    <div><dt>Provider usage</dt><dd>{detail.run.provider?.usage ? `${detail.run.provider.usage.totalTokens ?? '?'} tokens` : 'not supplied'}</dd></div>
                  </dl>
                ) : <p className="crm-hint">No run record.</p>}
                <h4>Steps and per-item outcomes</h4>
                <ul className="ai-steps">
                  {(detail.run?.steps || []).map((s, i) => (
                    <li key={i} className={'state-' + (s.state || 'ok')}><b>{s.step}</b><span>{s.state} — {s.detail}</span></li>
                  ))}
                  {!(detail.run?.steps || []).length && <li>No steps recorded.</li>}
                </ul>
                {detail.draft.meta?.warnings?.length > 0 && (
                  <>
                    <h4>Warnings</h4>
                    <ul className="ai-warnings">{detail.draft.meta.warnings.map((w, i) => <li key={i}><AlertTriangle size={12} /> {w}</li>)}</ul>
                  </>
                )}
                {detail.messages?.length > 0 && (
                  <>
                    <h4>Messages / posts</h4>
                    <ul className="ai-messages">
                      {detail.messages.map(m => (
                        <li key={m.id}><b>{m.channel}</b> · state <em>{m.state}</em>{m.error ? ` · ${m.error}` : ''}</li>
                      ))}
                    </ul>
                  </>
                )}
                {detail.draft.result && (
                  <>
                    <h4>Execution result</h4>
                    <pre>{JSON.stringify(detail.draft.result, null, 2)}</pre>
                  </>
                )}
              </aside>
            </div>
            <footer>
              <button type="button" onClick={() => copyText(detail.draft.body, 'Draft copied')}><Copy size={13} /> Copy draft</button>
              {detail.draft.status === 'awaiting_review' && <>
                <button className="save" type="button" onClick={async () => { await reviewDraft(detail.draft.id, true); setDetail(null); }}><Check size={13} /> Approve</button>
                <button className="crm-del" type="button" onClick={async () => { await reviewDraft(detail.draft.id, false, 'rejected'); setDetail(null); }}><X size={13} /> Reject</button>
              </>}
              {detail.draft.status === 'approved' && (
                <button className="save" type="button" onClick={async () => { await executeDraftById(detail.draft.id); setDetail(null); }}><Play size={13} /> Execute</button>
              )}
              <button type="button" onClick={() => setDetail(null)}>Close</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

/** The three review workspaces — each shows the evidence behind the draft. */
function AgentWorkspace({ agent, drafts, onOpen, onApprove, onReject, onExecute, onCancel, onCopy, busy, navigate }) {
  const meta = AGENT_META[agent] || {};
  if (!drafts.length) {
    return (
      <div className="crm-empty">
        <CircleSlash />
        <h3>Nothing from {meta.label} yet</h3>
        <p>{meta.blurb} Enable the agent and press Run now in the Overview tab; drafts appear here for review.</p>
      </div>
    );
  }
  return (
    <div className="ai-workspace">
      <p className="crm-hint">{meta.blurb}</p>
      <ul className="ai-drafts">
        {drafts.map(draft => (
          <li key={draft.id}>
            <div className="ai-draft-head">
              <em className={'crm-status ' + (draft.meta?.provider ? 'active' : 'dormant')}>{draft.kind}</em>
              <b>{draft.title}</b>
              <small>{draft.status} · {draft.meta?.provider?.model || 'no provider used'} · {when(draft.created_at)}</small>
            </div>

            {agent === 'leads' && draft.meta?.score && (
              <div className="ai-lead">
                <div className="ai-score">
                  <b>{draft.meta.score.score}/10</b>
                  <span>readiness ({draft.meta.score.rubric})</span>
                </div>
                <p>{draft.meta.enquirySummary}</p>
                <ul>
                  {(draft.meta.score.evidence || []).map((e, i) => <li key={i}>+{e.points} — {e.reason}</li>)}
                </ul>
                {draft.meta.score.missing?.length > 0 && <p className="ai-missing">Still needed: {draft.meta.score.missing.join('; ')}</p>}
                <p className="crm-hint">Consent: {draft.meta.score.consent?.state} · {draft.meta.score.disclaimer}</p>
                <p className="crm-hint">CIF: {draft.meta.cif?.available ? `USD ${Math.round(draft.meta.cif.cif).toLocaleString('en-US')} (indicative)` : `quotation required — missing ${draft.meta.cif?.missing?.join(', ')}`}</p>
                {(draft.meta.stock?.matches || []).length > 0 && (
                  <ul className="ai-stock">
                    {draft.meta.stock.matches.map(m => (
                      <li key={m.ref}>
                        <a href={m.href} target="_blank" rel="noreferrer">{m.ref} — {m.name}</a>
                        <small>{m.priceBasis} · checked {when(m.checkedAt)}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {agent === 'seo' && (
              <div className="ai-evidence">
                <p><b>Intent</b> {draft.meta?.opportunity?.intent || '—'} · <b>Evidence</b> {draft.meta?.measured ? 'measured (Search Console)' : 'catalogue-derived idea — no volume claimed'}</p>
                {(draft.meta?.sources || []).length > 0 && (
                  <ul>{draft.meta.sources.map((s, i) => <li key={i}>{s.url} — {s.note}</li>)}</ul>
                )}
              </div>
            )}

            {agent === 'social' && (
              <div className="ai-social">
                <p><b>Selection</b> {draft.meta?.selection?.rationale}</p>
                {['instagram', 'linkedin', 'whatsapp'].map(channel => (
                  <details key={channel} open={channel === 'instagram'}>
                    <summary>{channel} caption</summary>
                    <pre>{draft.meta?.captions?.[channel] || '—'}</pre>
                    <button type="button" onClick={() => onCopy(draft.meta?.captions?.[channel] || '', `${channel} caption copied`)}><Copy size={12} /> Copy</button>
                  </details>
                ))}
                <p className="crm-hint">Spec card, alt text and hashtags: {draft.meta?.hashtagBasis}</p>
                <pre className="ai-spec">{draft.meta?.specCard}</pre>
                {(draft.meta?.media || []).length > 0 && (
                  <div className="ai-media">
                    {draft.meta.media.map(src => (
                      <figure key={src}>
                        <img src={src} alt={draft.meta.altText || ''} loading="lazy" />
                        <figcaption><a href={src} download target="_blank" rel="noreferrer"><Download size={12} /> Download</a></figcaption>
                      </figure>
                    ))}
                  </div>
                )}
                <p className="crm-hint">Accounts: {Object.entries(draft.meta?.accounts || {}).map(([k, v]) => `${k} ${v}`).join(' · ')}</p>
                {draft.meta?.publicationBlockers?.length > 0 && (
                  <ul className="ai-warnings">{draft.meta.publicationBlockers.map((b, i) => <li key={i}><AlertTriangle size={12} /> {b}</li>)}</ul>
                )}
              </div>
            )}

            <div className="ai-draft-actions">
              <button type="button" onClick={() => onOpen(draft.id)}><Eye size={13} /> Open</button>
              <button type="button" onClick={() => onCopy(draft.body, 'Draft copied')}><Copy size={13} /> Copy</button>
              {navigate && agent === 'seo' && <button type="button" onClick={() => navigate('articles')}><ExternalLink size={13} /> News &amp; guides</button>}
              {draft.status === 'awaiting_review' && <>
                <button className="save" type="button" disabled={!!busy} onClick={() => onApprove(draft.id)}><Check size={13} /> Approve</button>
                <button className="crm-del" type="button" disabled={!!busy} onClick={() => onReject(draft.id)}><X size={13} /> Reject</button>
              </>}
              {draft.status === 'approved' && <>
                <button className="save" type="button" disabled={!!busy} onClick={() => onExecute(draft.id)}><Play size={13} /> Execute</button>
                <button className="crm-del" type="button" disabled={!!busy} onClick={() => onCancel(draft.id)}><Ban size={13} /> Cancel</button>
              </>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
