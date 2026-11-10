// HTTP 200 can describe a blocked or unreadable supplier, not a healthy run.
//
// 2026-10-11: this checker learned the difference between the two machinery
// jobs, because the failures the owner reported were all reported here first
// and all said the same generic thing:
//
//   • a REFRESH (`?job=machinery`) re-reads stored supplier links. It does not
//     discover stock, and "created: 0" is its normal, healthy answer.
//   • an AUDIT (`?job=machinery-audit`) is read-only and returns counts.
//   • a RECOVERY (`?job=machinery-recover`) republishes stored rows in place.
//   • a DOCTOR (`?job=machinery-doctor`) is the storage preflight: it must
//     never be reported as a successful import just because it answered 200.
//
// Every one of them prints what it actually proved, including the count of
// rows still hidden, so "the workflow went green" is never mistaken for
// "machinery importing works".
import { readFileSync, appendFileSync } from 'node:fs';

const MACHINERY_JOBS = ['machinery', 'machinery-audit', 'machinery-recover', 'machinery-doctor'];

export function syncFailure(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return 'Invalid sync report';
  if (report.error) return [report.error, report.details, report.code, report.hint].filter(Boolean).join(' — ');
  if (report.blocked) return report.note || 'Supplier blocked the crawler';
  if (report.parseMiss && !report.inserted) return report.note || 'Supplier markup could not be parsed';
  // A doctor run that says the storage is missing is a failure, however the
  // HTTP status line read.
  if (report.job === 'machinery-doctor' && report.ok === false)
    return [report.cause, report.ownerAction].filter(Boolean).join(' — ') || 'Machinery storage is not ready';
  if (['machinery', 'machinery-recover'].includes(report.job) && report.failed?.length) return `${report.failed.length} machinery source checks failed`;
  if (!('inserted' in report) && !MACHINERY_JOBS.includes(report.job)) return 'Unrecognized sync response';
  return null; // zero new stock alone is not a failure
}

/** What this report PROVES, in one line per job. Printed, never inferred. */
export function syncSummary(report) {
  if (!report || typeof report !== 'object') return null;
  const inv = report.inventory;
  if (report.job === 'machinery-doctor') {
    const c = report.catalogue || {};
    return `Storage ${report.ok ? 'ready' : 'NOT ready'} · public catalogue source: ${c.publicSource || 'unknown'}`
      + (inv ? ` · stored ${inv.total}, published ${inv.published}, hidden imports ${inv.hiddenImported}` : '');
  }
  if (report.job === 'machinery-audit') {
    return inv ? `Stored ${inv.total} · imported ${inv.imported} · published ${inv.published} · hidden imports ${inv.hiddenImported}`
      + (inv.counts ? ` (eligible to restore ${inv.counts.hiddenEligible}; archived ${inv.counts.archived}, reserved ${inv.counts.reserved}, sold ${inv.counts.sold})` : '')
      : 'Audit returned no inventory counts';
  }
  if (report.job === 'machinery-recover') {
    return `Recovery: restored ${report.restored?.length || 0} in place, failed ${report.failed?.length || 0}, `
      + `excluded ${report.excluded?.length || 0}, remaining ${report.remaining ?? 'unknown'}`
      + (inv ? ` · published now ${inv.published}/${inv.total}` : '');
  }
  if (report.job === 'machinery') {
    const o = report.outcomes || {};
    return `Refresh of stored links: checked ${o.checked ?? report.seen ?? 0}/${report.sources ?? 0} sources · unchanged ${o.unchanged ?? report.unchanged ?? 0}`
      + ` · re-priced ${o.rePriced ?? report.rePriced?.length ?? 0} · flagged withdrawn ${o.flaggedGone ?? report.flagged ?? 0}`
      + ` · unreadable ${o.unreadable ?? 0} · NEW listings saved by this run: 0 (refresh only — new stock is imported in the CRM desk)`;
  }
  if ('inserted' in report) {
    return `Goo-net: page ${report.page ?? '—'} · cards ${report.cardsSeen ?? 0} · inserted ${report.inserted}`
      + (report.blocked ? ' · BLOCKED (nothing was read)' : '');
  }
  return null;
}

if (process.argv[1]?.endsWith('/check-sync-report.mjs')) {
  try {
    const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    const failure = syncFailure(report);
    const summary = syncSummary(report);
    if (summary) console.log('::notice::' + summary);
    if (report.inventory) console.log(`::notice::Machinery inventory: total=${report.inventory.total}, imported=${report.inventory.imported}, published=${report.inventory.published}, hiddenImports=${report.inventory.hiddenImported}`);
    if (report.restored) console.log(`::notice::Recovery: restored=${report.restored.length}, failed=${report.failed?.length || 0}, remaining=${report.remaining}`);
    if (report.modeMeaning) console.log('::notice::' + report.modeLabel + ' — ' + report.modeMeaning);
    if (process.env.GITHUB_STEP_SUMMARY) {
      const inv = report.inventory;
      appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        `## ${report.job || 'Stock sync'}\n\n`
        + (summary ? `${summary}\n\n` : '')
        + (report.modeMeaning ? `_${report.modeMeaning}_\n\n` : '')
        + (inv ? `Stored: ${inv.total}; imported: ${inv.imported}; published: ${inv.published}; hidden imports: ${inv.hiddenImported}.\n\n` : '')
        + `${failure || 'Completed. Review the response for per-row details.'}\n`);
    }
    if (failure) { console.error('::error::' + failure.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')); process.exitCode = 1; }
  } catch (e) { console.error('Invalid sync JSON:', e.message); process.exitCode = 1; }
}
