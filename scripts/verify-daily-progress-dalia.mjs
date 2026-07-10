/**
 * Verify Phase 1 Daily BI sample (Dalia) — local artifacts only.
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DAILY = join(ROOT, 'public', 'coco-reports', 'dalia-c-official', 'daily');
const checks = [];
function ok(name, pass, detail) {
  checks.push({ name, pass: !!pass, detail: detail || '' });
}

function main() {
  ok('latest.html', existsSync(join(DAILY, 'latest.html')));
  ok('latest.json', existsSync(join(DAILY, 'latest.json')));
  ok('latest.pdf', existsSync(join(DAILY, 'latest.pdf')));
  ok('index.json', existsSync(join(DAILY, 'index.json')));
  ok('report-sequence.json', existsSync(join(DAILY, 'report-sequence.json')));

  const report = JSON.parse(readFileSync(join(DAILY, 'latest.json'), 'utf8'));
  const index = JSON.parse(readFileSync(join(DAILY, 'index.json'), 'utf8'));
  const html = readFileSync(join(DAILY, 'latest.html'), 'utf8');

  ok('phase 1', report.meta?.phase === 1);
  ok('report number', !!report.meta?.reportNumberPadded);
  ok('pdf file name pattern', /^COCO-Daily-Report-\d{4}-\d{4}-\d{2}-\d{2}\.pdf$/.test(report.meta?.pdfFileName || ''));
  ok('pdf exists', existsSync(join(DAILY, report.meta.pdfFileName)));
  ok('email dry_run', report.email?.status === 'dry_run');
  ok('no real email', report.readOnlyGuarantees?.realEmailSent === false);
  ok('no cron', report.readOnlyGuarantees?.cronEnabled === false);
  ok('no gsc live', report.readOnlyGuarantees?.gscLive === false);
  ok('pipeline false', report.meta?.pipelineRan === false);
  ok('dashboard present', !!report.dashboard?.googleStatus);
  ok('health >= 20', (report.healthChecks || []).length >= 20, String(report.healthChecks?.length));
  ok('html has Download PDF', /הורד PDF/.test(html));
  ok('html has page1', /id="page1"/.test(html));
  ok('html truth tags', /tag-missing/.test(html) && /tag-ai_estimate|tag-internal/.test(html));
  ok('index latest only', !!index.latest && !index.reports);
  ok('metric has reliability', report.dashboard.avgPosition?.reliability === 'missing');

  const failed = checks.filter((c) => !c.pass);
  console.log(JSON.stringify({
    ok: failed.length === 0,
    reportNumber: report.meta?.reportNumberDisplay,
    pdfFileName: report.meta?.pdfFileName,
    healthScore: report.healthScore,
    projectScore: report.scores?.projectScore?.value,
    checks,
    failed: failed.map((f) => f.name),
  }, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main();
