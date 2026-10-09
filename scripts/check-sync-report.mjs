// HTTP 200 can describe a blocked or unreadable supplier, not a healthy run.
import { readFileSync, appendFileSync } from 'node:fs';
export function syncFailure(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return 'Invalid sync report';
  if (report.error) return [report.error, report.details, report.code, report.hint].filter(Boolean).join(' — ');
  if (report.blocked) return report.note || 'Supplier blocked the crawler';
  if (report.parseMiss && !report.inserted) return report.note || 'Supplier markup could not be parsed';
  if (['machinery','machinery-recover'].includes(report.job) && report.failed?.length) return `${report.failed.length} machinery source checks failed`;
  if (!('inserted' in report) && !['machinery', 'machinery-audit', 'machinery-recover'].includes(report.job)) return 'Unrecognized sync response';
  return null; // zero new stock alone is not a failure
}
if (process.argv[1]?.endsWith('/check-sync-report.mjs')) {
  try {
    const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    const failure = syncFailure(report);
    if (report.inventory) console.log(`::notice::Machinery inventory: total=${report.inventory.total}, imported=${report.inventory.imported}, published=${report.inventory.published}, hiddenImports=${report.inventory.hiddenImported}`);
    if (report.restored) console.log(`::notice::Recovery: restored=${report.restored.length}, failed=${report.failed?.length || 0}, remaining=${report.remaining}`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      const inv = report.inventory;
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## ${report.job || 'Stock sync'}\n\n${inv ? `Stored: ${inv.total}; imported: ${inv.imported}; published: ${inv.published}; hidden imports: ${inv.hiddenImported}.` : 'No inventory count available.'}\n\n${failure || 'Completed. Review the response for per-row details.'}\n`);
    }
    if (failure) { console.error('::error::' + failure.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')); process.exitCode = 1; }
  } catch (e) { console.error('Invalid sync JSON:', e.message); process.exitCode = 1; }
}
