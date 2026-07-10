/**
 * Verify Daily Progress Report sample (Dalia) — local Staging artifacts.
 * Read-only checks; does not run pipeline / send email / touch production.
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
  const latestJson = join(DAILY, 'latest.json');
  const latestHtml = join(DAILY, 'latest.html');
  const indexPath = join(DAILY, 'index.json');

  ok('latest.json exists', existsSync(latestJson));
  ok('latest.html exists', existsSync(latestHtml));
  ok('index.json exists', existsSync(indexPath));

  if (!existsSync(latestJson)) {
    console.log(JSON.stringify({ ok: false, checks }, null, 2));
    process.exit(1);
  }

  const report = JSON.parse(readFileSync(latestJson, 'utf8'));
  const html = readFileSync(latestHtml, 'utf8');
  const index = JSON.parse(readFileSync(indexPath, 'utf8'));

  ok('meta.readOnly', report.meta?.readOnly === true);
  ok('meta.pipelineRan=false', report.meta?.pipelineRan === false);
  ok('meta.imagesGenerated=false', report.meta?.imagesGenerated === false);
  ok('meta.secretsChanged=false', report.meta?.secretsChanged === false);
  ok('clientId dalia', report.client?.clientId === 'dalia-c-official');
  ok('company name', /דליה/.test(report.client?.company || ''));
  ok('healthChecks >= 18', (report.healthChecks || []).length >= 18, String(report.healthChecks?.length));
  ok('seo keywords present', (report.seoIntelligence?.keywords || []).length >= 3);
  ok('email dry_run', report.email?.status === 'dry_run' && report.email?.previewOnly === true);
  ok('guarantees all false side-effects', Object.values(report.readOnlyGuarantees || {}).every((v) => v === false));
  ok('html has Read Only', /Read Only/.test(html));
  ok('html no pipeline claim', !/Pipeline הורץ|pipelineRan.:.?true/.test(html));
  ok('index has reports', (index.reports || []).length >= 1);

  const emailPreview = join(DAILY, `${report.meta.reportDate}-email-preview.html`);
  ok('email preview exists', existsSync(emailPreview));

  // No תקין without live source
  const badOk = (report.healthChecks || []).filter((h) => h.status === 'תקין' && h.sourceType !== 'live');
  ok('no תקין without live', badOk.length === 0, badOk.map((x) => x.name).join(',') || 'none');

  const openai = (report.healthChecks || []).find((h) => h.name === 'OpenAI');
  ok('OpenAI not config-error', openai && !/^שגיאה$/.test(openai.status) && /quota|אזהרה/.test(openai.status), openai?.status);
  ok('OpenAI cache source', openai?.sourceType === 'cache');

  const domain = (report.healthChecks || []).find((h) => h.name === 'Domain');
  const dnsRow = (report.healthChecks || []).find((h) => h.name === 'DNS');
  ok('Domain not false site error', domain && domain.status !== 'שגיאה', domain?.status);
  ok('DNS not false site error', dnsRow && dnsRow.status !== 'שגיאה', dnsRow?.status);
  const failed = checks.filter((c) => !c.pass);
  const result = {
    ok: failed.length === 0,
    reportDate: report.meta?.reportDate,
    scores: report.scores,
    healthScore: report.healthScore,
    healthSummary: report.healthSummary,
    checks,
    failed: failed.map((f) => f.name),
  };
  console.log(JSON.stringify(result, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main();
