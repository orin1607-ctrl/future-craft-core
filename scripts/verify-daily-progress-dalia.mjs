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
  ok('manager card', !!report.managerCard?.top3?.length);
  ok('assets catalog', (report.assetCatalog || []).length >= 3);
  ok('business potential', report.businessPotential?.score != null);
  ok('trend present', !!report.assets?.[0]?.trend?.level);
  ok('hebrew reliability', report.dashboard?.avgPosition?.reliabilityHe === 'אין נתון חי');
  ok('html has viewport', /name="viewport"[^>]*width=device-width/.test(html));
  ok('html has compact asset button', /id="btnAssets"/.test(html) && /סוג נכס/.test(html) && /בחירה…/.test(html));
  ok('html no single-select asset control', !/id="fAssetType"/.test(html) && !/<select[^>]*asset/i.test(html) && !/type="radio"/.test(html));
  ok('html has multi asset checkboxes', /type="checkbox"[^>]*name="asset"/.test(html) || /name="asset"[^>]*type="checkbox"/.test(html));
  ok('html opens popup from button', /btnAssets/.test(html) && /openModal/.test(html));
  ok('html has client identity', /id="clientIdentity"/.test(html) && /יוני אטיאס/.test(html) && /דליה פתרונות תפעול ותחזוקה לרכב/.test(html));
  ok('html filter controls report sections', /data-report-section="overview"/.test(html) && /id="healthCard"/.test(html) && /isFullReportView/.test(html));
  ok('html has decision card', /מה חשוב לדעת עכשיו/.test(html));
  ok('html has category popup', /id="assetModal"/.test(html) && /בחירת נכסים וקטגוריות/.test(html));
  ok('html has site categories', /מילות מפתח/.test(html) && /אינדוקס/.test(html) && /בריאות המערכת/.test(html));
  ok('html has Google Search Console label', /Google Search Console/.test(html));
  ok('html has ads categories defs', /Google Ads/.test(html) && /לידים ממודעות/.test(html));
  ok('html has media system asset', /מערכת מדיה — תמונות וסרטונים/.test(html) && /media-system/.test(html));
  ok('html has media filter categories', /אחסון מדיה/.test(html) && /תמונות ללא Alt/.test(html) && /קישורים שבורים/.test(html));
  ok('media manifest present', existsSync(join(ROOT, 'public', 'coco-media', 'dalia-c-official', 'manifest.json')));
  ok('media health present', existsSync(join(ROOT, 'public', 'coco-media', 'dalia-c-official', 'health.json')));
  ok('multi asset ready', (report.assets || []).length >= 3);
  ok('html no LCP jargon', !/\bLCP\b|\bTTFB\b|\bLatency\b/.test(html));
  ok('bottom line today', !!report.bottomLineToday && /בשורה התחתונה להיום/.test(html));
  ok('decision before health', html.indexOf('מה חשוב לדעת עכשיו') < html.indexOf('בריאות המערכת'));
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
