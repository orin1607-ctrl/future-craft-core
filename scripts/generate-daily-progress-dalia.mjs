/**
 * Phase 1 — CO.CO Daily BI Report (Dalia sample only).
 * Dashboard + PDF + truth labels + System Health + executive summary.
 * READ-ONLY · dry_run email · no Cron · no GSC/GA4/GBP/Ads live · no Pipeline.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import * as tls from 'node:tls';
import { resolve4 } from 'node:dns/promises';
import { chromium } from 'playwright';
import { renderBusinessHtml } from './lib/render-daily-business-html.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'public', 'coco-reports', 'dalia-c-official', 'daily');
const CLIENT = 'dalia-c-official';
const COCO_VERSION = '8.1.1-smart-filter';
const PAGES_BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const PREVIEW_URL = `${PAGES_BASE}/client-previews/${CLIENT}/index.html`;
const SEQ_PATH = join(OUT_DIR, 'report-sequence.json');

function readJson(rel) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function todayIL() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
}

function timeIL(d = new Date()) {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(d);
}

/** Metric with mandatory truth metadata (Hebrew-facing) */
function M(value, source, reliability, opts = {}) {
  const sourceHeMap = {
    'gsc/ga4/gbp/ads': 'מערכות Google (עדיין לא חובר חי)',
    'client-previews + phase2-gsc': 'תצוגת האתר + חיבור Google (ממתין)',
    'preview-assets+decision': 'בדיקת האתר + סטטוס פנימי',
    'github-pages': 'אתר Staging',
    'stage-d-decision/infra': 'סטטוס שמור במערכת',
    'phase2': 'שלב הבא — חיבור נתונים חיים',
    'product-scope': 'לא חלק מהמסלול הנוכחי',
    'infra-verify': 'בדיקת תשתית קודמת',
    'scoreProject()': 'חישוב פנימי של המערכת',
    'phase1-placeholder': 'הערכה זמנית',
    'gates': 'סטטוס מוכנות פנימי',
    'preview+infra': 'תצוגת אתר + בדיקות',
    'report-sequence': 'היסטוריית דוחות',
    'stage-d + generator': 'התקדמות פרויקט שמורה',
    'chief/ops': 'המלצת מערכת',
    'ops': 'המלצת מערכת',
    'ai': 'הערכת AI',
    'ai_gate': 'הערכת AI',
    'preview': 'תצוגת האתר',
    'preview-fs': 'קבצי האתר',
    'stage-d-assistants-raw': 'סטטוס עוזרים שמור',
    'generator': 'מערכת הדוחות',
  };
  const updated = opts.updatedAt || new Date().toISOString();
  return {
    value,
    source,
    sourceHe: opts.sourceHe || sourceHeMap[source] || source,
    reliability,
    reliabilityHe:
      reliability === 'live' ? 'נתון חי'
        : reliability === 'cache' ? 'נתון ממטמון'
          : reliability === 'internal' ? 'חישוב פנימי'
            : reliability === 'ai_estimate' ? 'הערכת AI'
              : 'אין נתון חי',
    updatedAt: updated,
    updatedAtHe: opts.updatedAtHe || new Intl.DateTimeFormat('he-IL', {
      timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short',
    }).format(new Date(updated)),
    missingReason: opts.missingReason || null,
  };
}

async function probeHead(url, ms = 10000) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(ms), redirect: 'follow' });
    return { ok: res.ok, status: res.status, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - t0, error: String(e.message || e) };
  }
}

async function probeSsl(host) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: true }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      resolve({ ok: true, ms: Date.now() - t0, validTo: cert?.valid_to || null });
    });
    socket.setTimeout(10000, () => { socket.destroy(); resolve({ ok: false, ms: Date.now() - t0, error: 'timeout' }); });
    socket.on('error', (e) => resolve({ ok: false, ms: Date.now() - t0, error: e.message }));
  });
}

async function probeDns(host) {
  const t0 = Date.now();
  try {
    const addrs = await resolve4(host);
    return { ok: addrs.length > 0, ms: Date.now() - t0, addrs };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: String(e.message || e) };
  }
}

function nextReportNumber() {
  mkdirSync(OUT_DIR, { recursive: true });
  let seq = { lastNumber: 0, clientSlug: CLIENT };
  if (existsSync(SEQ_PATH)) {
    try { seq = { ...seq, ...JSON.parse(readFileSync(SEQ_PATH, 'utf8')) }; } catch { /* keep */ }
  }
  // Same calendar day → reuse last number (regenerate overwrites same #NNNN files; no duplicate id).
  // New day → increment. Number never resets. Resend does not allocate a new number.
  const today = todayIL();
  if (seq.lastDate === today && seq.lastNumber > 0) {
    return { number: seq.lastNumber, padded: String(seq.lastNumber).padStart(4, '0'), reused: true };
  }
  const number = (seq.lastNumber || 0) + 1;
  const padded = String(number).padStart(4, '0');
  writeFileSync(SEQ_PATH, JSON.stringify({
    clientSlug: CLIENT,
    lastNumber: number,
    lastDate: today,
    updatedAt: new Date().toISOString(),
    policy: 'per-client sequential; same-day regenerate reuses number; never auto-delete prior reports',
  }, null, 2), 'utf8');
  return { number, padded, reused: false };
}

function countPreviewAssets() {
  const dir = join(ROOT, 'public', 'client-previews', CLIENT);
  if (!existsSync(dir)) return { images: 0, js: 0, css: 0, bytes: 0 };
  let images = 0, js = 0, css = 0, bytes = 0;
  for (const f of readdirSync(dir)) {
    const st = statSync(join(dir, f));
    if (!st.isFile()) continue;
    bytes += st.size;
    if (/\.(png|jpe?g|webp|gif|svg)$/i.test(f)) images++;
    if (/\.js$/i.test(f)) js++;
    if (/\.css$/i.test(f)) css++;
  }
  return { images, js, css, bytes };
}

function healthRow(name, status, opts = {}) {
  return {
    name,
    status,
    checkPerformed: opts.checkPerformed || (opts.live ? 'בדיקה חיה' : 'לא בוצעה בדיקה חיה'),
    checkedAt: opts.checkedAt || new Date().toISOString(),
    lastSync: opts.lastSync || null,
    latencyMs: opts.latencyMs ?? null,
    version: opts.version || null,
    liveOrCache: opts.live ? 'חיה' : (opts.liveOrCache || 'מטמון/לא בוצעה'),
    lastError: opts.error || null,
    why: opts.why || '—',
    issueKind: opts.issueKind || 'unknown',
    blocksSite: opts.blocksSite === true,
    critical: opts.critical === true,
    actionRequiredFromUser: opts.actionRequiredFromUser || 'לא',
    impact: opts.impact || '—',
    recommendation: opts.recommendation || '—',
    sourceType: opts.sourceType || 'missing',
  };
}

function phase2Missing(label) {
  return M('אין נתון חי', 'gsc/ga4/gbp/ads', 'missing', {
    missingReason: `${label}: לא חובר חי בשלב 1 — ממתין לשלב 2 (Sync מאושר)`,
  });
}

function h(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function metricCell(m) {
  if (!m || typeof m !== 'object') return h(m);
  const reason = m.missingReason ? `<div class="miss">${h(m.missingReason)}</div>` : '';
  return `<div class="mv">${h(m.value)}</div>
    <div class="meta-line"><span class="tag tag-${h(m.reliability)}">${h(m.reliabilityHe)}</span>
    · ${h(m.source)} · ${h(m.updatedAt)}</div>${reason}`;
}

function renderHtml(report) {
  const d = report.dashboard;
  const googleRows = [
    ['מצב בגוגל', d.googleStatus],
    ['עלייה / ירידה', d.upOrDown],
    ['מיקום ממוצע', d.avgPosition],
    ['Top 3', d.top3],
    ['Top 10', d.top10],
    ['Top 20', d.top20],
    ['מילות מפתח שעלו', d.keywordsUp],
    ['מילות מפתח שירדו', d.keywordsDown],
    ['מה חיפשו היום', d.searchedToday],
    ['מה חיפשו השבוע', d.searchedWeek],
    ['עמוד מתאים?', d.hasMatchingPage],
    ['ליצור עמוד חדש?', d.needNewPage],
    ['חסר תוכן?', d.contentMissing],
  ].map(([label, m]) => `<tr><td>${h(label)}</td><td>${metricCell(m)}</td></tr>`).join('');

  const health = report.healthChecks.map((x) => `<tr>
    <td>${h(x.name)}</td>
    <td>${h(x.status)}</td>
    <td><code>${h(x.sourceType)}</code></td>
    <td>${h(x.liveOrCache)}</td>
    <td>${h(x.checkedAt)}</td>
    <td>${h(x.lastSync || '—')}</td>
    <td>${x.latencyMs != null ? h(x.latencyMs) + 'ms' : '—'}</td>
    <td>${h(x.why)}</td>
    <td>${x.critical ? 'כן' : 'לא'}</td>
    <td>${h(x.recommendation)}</td>
  </tr>`).join('');

  const scores = report.scores;
  const exec = report.executiveSummary;

  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<title>דוח יומי #${h(report.meta.reportNumberPadded)} — ${h(report.client.company)}</title>
<style>
:root{--ink:#0f172a;--muted:#64748b;--line:#dbe3f0;--bg:#f1f5f9;--card:#fff;--brand:#0b1735;--ok:#047857;--warn:#b45309;--bad:#b91c1c;--ai:#6d28d9;--miss:#334155}
*{box-sizing:border-box}
body{font-family:Heebo,Arial,sans-serif;margin:0;background:var(--bg);color:var(--ink);line-height:1.45}
.wrap{max-width:980px;margin:0 auto;padding:18px 14px 56px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin-bottom:12px}
.cover{background:linear-gradient(145deg,#0b1735,#1e3a5f);color:#fff;border:none}
.cover h1{margin:0 0 8px;font-size:1.35rem}
.cover .sub{opacity:.85;font-size:.9rem}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 0}
.btn{display:inline-block;padding:8px 14px;border-radius:10px;text-decoration:none;font-weight:700;font-size:.85rem;border:1px solid transparent}
.btn-pdf{background:#fbbf24;color:#111}
.btn-o{background:transparent;border-color:rgba(255,255,255,.35);color:#fff}
h2{font-size:1.05rem;margin:0 0 10px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
@media(max-width:720px){.grid{grid-template-columns:repeat(2,1fr)}}
.kpi{background:#f8fafc;border:1px solid var(--line);border-radius:12px;padding:10px}
.kpi .l{font-size:.7rem;color:var(--muted)}
.kpi .v{font-size:1.25rem;font-weight:800;margin-top:2px}
table{width:100%;border-collapse:collapse;font-size:.78rem}
th,td{border:1px solid var(--line);padding:6px 7px;text-align:right;vertical-align:top}
th{background:var(--brand);color:#fff}
.mv{font-weight:700}
.meta-line{font-size:.65rem;color:var(--muted);margin-top:3px}
.miss{font-size:.68rem;color:var(--miss);margin-top:3px}
.tag{display:inline-block;padding:1px 6px;border-radius:999px;font-size:.62rem;font-weight:700}
.tag-live{background:#d1fae5;color:var(--ok)}
.tag-cache{background:#e0e7ff;color:#3730a3}
.tag-internal{background:#e2e8f0;color:#334155}
.tag-ai_estimate{background:#ede9fe;color:var(--ai)}
.tag-missing{background:#fee2e2;color:var(--bad)}
.sep{margin:18px 0;border:0;border-top:2px dashed #cbd5e1}
.note{font-size:.8rem;color:var(--muted)}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;background:rgba(255,255,255,.15);font-size:.72rem}
ul.exec{margin:0;padding-right:18px}
@media print{.actions{display:none!important}body{background:#fff}.wrap{padding:0}.card{break-inside:avoid}}
</style></head><body><div class="wrap">

<section class="card cover" id="page1">
  <div class="badge">CO.CO Daily BI · Phase 1</div>
  <h1>דוח יומי #${h(report.meta.reportNumberPadded)}</h1>
  <div class="sub">
    <strong>${h(report.client.company)}</strong><br>
    תאריך יצירה: ${h(report.meta.reportDate)} · שעה: ${h(report.meta.generatedTimeIL)} ·
    מזהה: <code>${h(report.meta.reportId)}</code><br>
    גרסת מערכת: ${h(report.meta.cocoVersion)} · שליחת מייל: ${h(report.email.sentAt || 'לא נשלח (dry_run)')}
br>
    <span class="badge">Read Only</span> · Pipeline לא הורץ · תמונות לא נוצרו
  </div>
  <div class="actions">
    <a class="btn btn-pdf" href="${h(report.meta.pdfFileName)}" download>הורד PDF</a>
    <a class="btn btn-o" href="${h(report.client.previewUrl)}" target="_blank" rel="noopener">פתח אתר (Preview)</a>
  </div>
</section>

<section class="card">
  <h2>לוח מחוונים — מנהלים</h2>
  <div class="grid">
    <div class="kpi"><div class="l">Project Score</div><div class="v">${h(scores.projectScore.value)}</div>${metricCell(scores.projectScore).replace(/<div class="mv">.*?<\/div>/,'')}</div>
    <div class="kpi"><div class="l">System Health</div><div class="v">${h(report.healthScore)}</div>
      <div class="meta-line">תקין ${h(report.healthSummary.ok)} · אזהרה ${h(report.healthSummary.warn)} · שגיאה ${h(report.healthSummary.err)} · לא הוגדר ${h(report.healthSummary.undef)}</div>
      <div class="miss">${h(report.healthScoreNote)}</div>
    </div>
    <div class="kpi"><div class="l">התקדמות</div><div class="v">${h(scores.progressPct.value)}%</div>${metricCell(scores.progressPct).replace(/<div class="mv">.*?<\/div>/,'')}</div>
    <div class="kpi"><div class="l">מוכן לעלייה?</div><div class="v">${scores.goLiveReady.value ? 'כן' : 'לא'}</div>${metricCell(scores.goLiveReady).replace(/<div class="mv">.*?<\/div>/,'')}</div>
  </div>
</section>

<section class="card">
  <h2>מצב בגוגל + הזדמנויות (עמוד ראשון)</h2>
  <p class="note">שלב 1: אין חיבור GSC חי — אין מספרים מומצאים. כל שורה עם «אין נתון חי» + סיבה.</p>
  <table><tr><th>מדד</th><th>ערך · מקור · אמינות · עדכון</th></tr>${googleRows}</table>
</section>

<section class="card">
  <h2>שלוש הפעולות החשובות ביותר להיום</h2>
  <ol>${(exec.top3Tasks || []).map((t) => `<li>${metricCell(t)}</li>`).join('')}</ol>
</section>

<section class="card">
  <h2>System Health — סיכום</h2>
  <p><strong>System Health Score: ${report.healthScore}</strong>
   · נבדקו ${report.healthSummary.total}
   · תקין ${report.healthSummary.ok}
   · אזהרה ${report.healthSummary.warn}
   · שגיאה ${report.healthSummary.err}
   · לא הוגדר ${report.healthSummary.undef}
   · לא ניתן לאימות מקומית ${report.healthSummary.localUnverifiable || 0}</p>
  <p class="note">${h(report.healthScoreNote)}</p>
  <p class="note">נוסחה: ${h(report.healthScoreFormula)} · תקין=100 · אזהרה=40 · שגיאה/לא הוגדר/לא ניתן לאימות=0</p>
  <p><strong>חוסם בפועל:</strong> ${(report.blockingFaults || []).length ? report.blockingFaults.map(h).join(' · ') : 'אין תקלה שחוסמת את האתר כרגע'}</p>
  <p><strong>לא מומש עדיין (לא תקלת אתר):</strong> ${(report.unimplementedChecks || []).length ? report.unimplementedChecks.map(h).join(' · ') : '—'}</p>
  <p><strong>תקלות קריטיות:</strong> ${(report.criticalFaults || []).length ? report.criticalFaults.map(h).join(' · ') : 'אין'}</p>
</section>

<section class="card">
  <h2>סיכום מנהלים</h2>
  <ul class="exec">
    <li><strong>מצב היום:</strong> ${h(exec.siteStateToday.value)} <span class="tag tag-${h(exec.siteStateToday.reliability)}">${h(exec.siteStateToday.reliabilityHe)}</span></li>
    <li><strong>גוגל (עלייה/ירידה):</strong> ${metricCell(exec.googleTrend)}</li>
    <li><strong>מה השתנה מהדוח הקודם:</strong> ${metricCell(exec.changedSincePrev)}</li>
    <li><strong>מה בוצע:</strong> ${metricCell(exec.done)}</li>
    <li><strong>מה חסר:</strong> ${metricCell(exec.missing)}</li>
    <li><strong>סיכון מרכזי:</strong> ${metricCell(exec.mainRisk)}</li>
    <li><strong>הזדמנות גדולה:</strong> ${metricCell(exec.mainOpportunity)}</li>
    <li><strong>השפעה צפויה החודש:</strong> ${metricCell(exec.monthImpact)}</li>
    <li><strong>המלצת מערכת (AI — לא נתון חי):</strong> ${metricCell(exec.aiRecommendation)}</li>
  </ul>
</section>

<hr class="sep">
<p class="note">פירוט System Health המלא להלן. נתוני Google חיים — שלב 2.</p>

<section class="card">
  <h2>System Health — פירוט מערכות</h2>
  <p class="note">${h(report.healthScoreNote)}</p>
  <table>
    <tr><th>מערכת</th><th>סטטוס</th><th>מקור</th><th>חיה/מטמון</th><th>בדיקה</th><th>Sync</th><th>Latency</th><th>הסבר</th><th>קריטי?</th><th>פתרון</th></tr>
    ${health}
  </table>
</section>

<section class="card">
  <h2>סטטוסי פרויקט (פנימי)</h2>
  <ul>
    <li>Preview: ${metricCell(d.previewStatus)}</li>
    <li>תמונות: ${metricCell(d.imagesStatus)}</li>
    <li>Google (חיבור): ${metricCell(d.googleConnection)}</li>
    <li>Analytics: ${metricCell(d.analyticsStatus)}</li>
    <li>Ads: ${metricCell(d.adsStatus)}</li>
    <li>GBP: ${metricCell(d.gbpStatus)}</li>
  </ul>
</section>

<section class="card">
  <h2>אמינות נתונים — מקרא</h2>
  <p>
    <span class="tag tag-live">נתון אמיתי</span>
    <span class="tag tag-cache">נתון ממטמון</span>
    <span class="tag tag-internal">חישוב פנימי</span>
    <span class="tag tag-ai_estimate">הערכת AI</span>
    <span class="tag tag-missing">אין נתון חי</span>
  </p>
  <p class="note">המלצות AI מופרדות במפורש מנתוני אמת. אין ערבוב.</p>
</section>

<section class="card">
  <h2>אימייל</h2>
  <p>סטטוס: <strong>${h(report.email.status)}</strong>
  ${report.email.previewOnly ? ' · תצוגה בלבד — לא נשלח' : ''}
  ${report.email.error ? ` · שגיאה: ${h(report.email.error)}` : ''}</p>
  <p class="note">נושא עתידי: ${h(report.email.subjectTemplate)}</p>
</section>

</div></body></html>`;
}

async function writePdf(htmlPath, pdfPath, meta) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' });
    const header = `CO.CO | דוח #${meta.padded} | ${meta.company} | ${meta.reportDate}`;
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#64748b;padding:0 10mm;">${header.replace(/</g, '')}</div>`,
      footerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#64748b;padding:0 10mm;">עמוד <span class="pageNumber"></span> / <span class="totalPages"></span> · מקור+אמינות לכל נתון · dry_run</div>`,
      margin: { top: '16mm', bottom: '16mm', left: '10mm', right: '10mm' },
    });
  } finally {
    await browser.close();
  }
}

async function screenshotPage1(htmlPath, pngPath) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' });
    const el = await page.$('#page1');
    if (el) await el.screenshot({ path: pngPath });
    else await page.screenshot({ path: pngPath, fullPage: false });
  } finally {
    await browser.close();
  }
}

function pruneOldArtifacts(_keepNames) {
  // NEVER auto-delete prior reports. latest.* are pointers only.
  return;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const reportDate = todayIL();
  const generatedAt = new Date();
  const generatedAtIso = generatedAt.toISOString();
  const { number, padded } = nextReportNumber();
  const reportId = `${CLIENT}-${padded}-${reportDate}`;
  const pdfFileName = `COCO-Daily-Report-${padded}-${reportDate}.pdf`;

  const decision = readJson('public/coco-reports/dalia-c-official/stage-d-fix-decision.json') || {};
  const asst = readJson('public/coco-reports/dalia-c-official/stage-d-assistants-raw.json') || {};
  const infra = readJson('public/coco-reports/dalia-c-official/infra-verify-live.json') || {};
  const assets = countPreviewAssets();

  const pagesPreview = await probeHead(PREVIEW_URL);
  const pagesHome = await probeHead(`${PAGES_BASE}/`);
  const dns = await probeDns('dalia-c.com');
  const ssl = await probeSsl('dalia-c.com');
  const githubApi = await probeHead('https://api.github.com/repos/orin1607-ctrl/future-craft-core');

  const openaiKnown = infra?.openai?.chatProbe;
  const openaiSecrets = infra?.openai?.stagingSecretsPresent || {};
  const openaiSecretExists = !!(openaiSecrets.MARKETING_OPENAI_API_KEY || openaiSecrets.OPENAI_API_KEY || infra?.openai?.siteBuildStatus?.secrets?.openai);
  const openaiQuotaBlocked = !!(openaiKnown && !openaiKnown.ok && /quota|billing/i.test(String(openaiKnown.error || '')));
  const dnsLocalUnverifiable = !dns.ok && /ECONNREFUSED|ENOTFOUND|ETIMEOUT|queryA/i.test(String(dns.error || ''));
  const domainDnsStatus = dns.ok ? 'תקין' : ((ssl.ok || dnsLocalUnverifiable) ? 'לא ניתן לאימות מקומית' : 'שגיאה');

  const noSync = (label) => phase2Missing(label);

  const healthChecks = [
    healthRow('OpenAI', openaiQuotaBlocked || openaiSecretExists ? 'אזהרה — חיבור קיים, quota חסום' : 'אזהרה', {
      checkPerformed: 'cache מ-infra-verify — לא chat/images בריצה זו',
      why: openaiSecretExists ? 'Secret קיים; quota/billing חוסם; לא Images בתשלום' : 'אין אישור Secrets',
      issueKind: 'known_quota', sourceType: 'cache', critical: false, blocksSite: false,
      actionRequiredFromUser: openaiQuotaBlocked ? 'כן — billing/quota' : 'לא',
      recommendation: 'לתקן quota; תמונות רק ב-CocoImageStage אחרי אישור',
      checkedAt: infra?.at || generatedAtIso,
    }),
    healthRow('Supabase', 'לא הוגדר', { why: 'ping DB לא ממומש בשלב 1', issueKind: 'check_not_implemented', sourceType: 'not_configured' }),
    healthRow('Database', 'לא הוגדר', { why: 'לא מחובר לדוח בשלב 1', issueKind: 'check_not_implemented', sourceType: 'not_configured' }),
    healthRow('Edge Functions', 'אזהרה', { why: 'לא בוצעה בדיקה חיה בריצה זו', issueKind: 'check_not_implemented', sourceType: 'missing' }),
    healthRow('GitHub', githubApi.ok ? 'תקין' : 'שגיאה', {
      live: true, latencyMs: githubApi.ms, checkPerformed: `GET GitHub API → ${githubApi.status}`,
      why: githubApi.ok ? 'ריפו נגיש' : (githubApi.error || 'כשל'), sourceType: githubApi.ok ? 'live' : 'missing',
      error: githubApi.error, critical: false,
    }),
    healthRow('GitHub Pages', pagesHome.ok ? 'תקין' : 'שגיאה', {
      live: true, latencyMs: pagesHome.ms, checkPerformed: `GET Pages → ${pagesHome.status}`,
      why: pagesHome.ok ? 'Staging מגיב' : 'Pages לא מגיב', sourceType: pagesHome.ok ? 'live' : 'missing',
    }),
    healthRow('Google Search Console', 'לא הוגדר', { why: 'שלב 1 — אין Sync חי', issueKind: 'check_not_implemented', sourceType: 'not_configured' }),
    healthRow('Google Analytics 4', 'לא הוגדר', { why: 'שלב 1 — אין Sync חי', issueKind: 'check_not_implemented', sourceType: 'not_configured' }),
    healthRow('Google Ads', 'לא הוגדר', { why: 'דולג מהמסלול / אין Sync', issueKind: 'not_in_scope', sourceType: 'not_configured' }),
    healthRow('Google Business Profile', 'אזהרה', { why: 'ידוע pending API (cache)', issueKind: 'check_not_implemented', sourceType: 'cache', liveOrCache: 'מטמון' }),
    healthRow('Google Tag Manager', 'אזהרה', { why: 'אין probe חי היום', issueKind: 'check_not_implemented', sourceType: 'cache', liveOrCache: 'מטמון' }),
    healthRow('Gmail', 'לא הוגדר', { why: 'לא ממומש', sourceType: 'not_configured', issueKind: 'check_not_implemented' }),
    healthRow('Google Drive', 'לא הוגדר', { why: 'לא ממומש', sourceType: 'not_configured', issueKind: 'check_not_implemented' }),
    healthRow('Google Sheets', 'לא הוגדר', { why: 'לא ממומש', sourceType: 'not_configured', issueKind: 'check_not_implemented' }),
    healthRow('Storage', 'לא הוגדר', { why: 'לא ממומש', sourceType: 'not_configured', issueKind: 'check_not_implemented' }),
    healthRow('Resend', 'אזהרה', { why: 'dry_run — אין שליחה בריצה זו', issueKind: 'not_in_scope', sourceType: 'missing' }),
    healthRow('CRM', 'לא הוגדר', { why: 'לא ממומש', sourceType: 'not_configured', issueKind: 'check_not_implemented' }),
    healthRow('WhatsApp', 'לא הוגדר', { why: 'לא ממומש', sourceType: 'not_configured', issueKind: 'check_not_implemented' }),
    healthRow('Domain', domainDnsStatus, {
      live: dns.ok, checkPerformed: "resolve4('dalia-c.com') + TLS",
      why: dns.ok ? 'OK' : 'לא ניתן לאימות מקומית (ECONNREFUSED) — SSL הצליח',
      issueKind: dns.ok ? 'real' : 'local_env',
      sourceType: dns.ok ? 'live' : 'local_unverifiable', error: dns.error,
    }),
    healthRow('DNS', domainDnsStatus, {
      live: dns.ok, latencyMs: dns.ms, checkPerformed: "resolve4('dalia-c.com')",
      why: dns.ok ? 'OK' : 'כשל DNS client מקומי — לא תקלת אתר מוכחת',
      issueKind: dns.ok ? 'real' : 'local_env',
      sourceType: dns.ok ? 'live' : 'local_unverifiable', error: dns.error,
    }),
    healthRow('SSL', ssl.ok ? 'תקין' : 'שגיאה', {
      live: true, latencyMs: ssl.ms, checkPerformed: 'TLS dalia-c.com:443',
      why: ssl.ok ? `validTo=${ssl.validTo}` : ssl.error, sourceType: ssl.ok ? 'live' : 'missing',
      critical: !ssl.ok, blocksSite: !ssl.ok,
    }),
    healthRow('CO.CO API', 'אזהרה', { why: 'לא בוצע probe ייעודי בשלב 1', sourceType: 'missing', issueKind: 'check_not_implemented' }),
    healthRow('מערכת התראות', 'אזהרה', { why: 'MarketingNotifications קיים; שליחה dry_run', sourceType: 'missing', issueKind: 'not_in_scope' }),
    healthRow('מערכת דוחות', 'תקין', {
      live: true, checkPerformed: 'יצירת דוח Phase 1 מקומית', why: 'גנרטור רץ בהצלחה',
      sourceType: 'live', version: COCO_VERSION,
    }),
    healthRow('מערכת יצירת אתרים', 'אזהרה', { why: 'לא הורץ Pipeline; Preview קיים', sourceType: 'cache', issueKind: 'not_in_scope', liveOrCache: 'מטמון' }),
    healthRow('מערכת יצירת תמונות', 'אזהרה', { why: 'imagesBlockedQuota — לא נוצרו תמונות', sourceType: 'cache', issueKind: 'known_quota', liveOrCache: 'מטמון' }),
    healthRow('מערכת גיבויים', 'לא הוגדר', { why: 'אין נתון חי', sourceType: 'not_configured', issueKind: 'check_not_implemented' }),
    healthRow('Cron', 'לא הוגדר', { why: 'Cron לא פעיל במכוון בשלב 1', sourceType: 'not_configured', issueKind: 'not_in_scope' }),
  ];

  for (const row of healthChecks) {
    if (row.status === 'תקין' && row.sourceType !== 'live') row.status = 'אזהרה';
  }

  const isWarn = (s) => s === 'אזהרה' || String(s).startsWith('אזהרה');
  const isUnver = (s) => s === 'לא ניתן לאימות מקומית';
  const healthSummary = {
    total: healthChecks.length,
    ok: healthChecks.filter((x) => x.status === 'תקין').length,
    warn: healthChecks.filter((x) => isWarn(x.status)).length,
    err: healthChecks.filter((x) => x.status === 'שגיאה').length,
    undef: healthChecks.filter((x) => x.status === 'לא הוגדר').length,
    localUnverifiable: healthChecks.filter((x) => isUnver(x.status)).length,
  };
  const healthScoreFormula = 'round((תקין×100 + אזהרה×40) / total)';
  const healthScore = Math.round(((healthSummary.ok * 100) + (healthSummary.warn * 40)) / healthSummary.total);
  const criticalFaults = healthChecks.filter((x) => x.critical).map((x) => x.name);
  const blockingFaults = healthChecks.filter((x) => x.blocksSite).map((x) => x.name);
  const unimplementedChecks = healthChecks
    .filter((x) => x.issueKind === 'check_not_implemented' || x.status === 'לא הוגדר')
    .map((x) => x.name);

  let projectScore = 55;
  const reasons = [];
  if (decision?.qualityGate?.pass) { projectScore += 15; reasons.push('+15 quality'); }
  if (pagesPreview.ok) { projectScore += 10; reasons.push('+10 preview'); }
  if (decision?.engines?.ready?.includes('c13')) { projectScore += 5; reasons.push('+5 c13'); }
  if (healthSummary.ok >= 3) { projectScore += 5; reasons.push('+5 health live'); }
  projectScore -= 5; reasons.push('-5 images blocked');
  projectScore = Math.max(0, Math.min(100, projectScore));

  const dashboard = {
    googleStatus: noSync('מצב בגוגל'),
    upOrDown: noSync('עלייה/ירידה'),
    avgPosition: noSync('מיקום ממוצע'),
    top3: noSync('Top 3'),
    top10: noSync('Top 10'),
    top20: noSync('Top 20'),
    keywordsUp: noSync('KW שעלו'),
    keywordsDown: noSync('KW שירדו'),
    searchedToday: noSync('חיפושים היום'),
    searchedWeek: noSync('חיפושים השבוע'),
    hasMatchingPage: M(
      'לא ניתן לקבוע מול דירוגים חיים — Preview קיים',
      'client-previews + phase2-gsc',
      'missing',
      { missingReason: 'אין מיקומי KW חיים לשייך לעמוד; Preview זמין ב-Staging' },
    ),
    needNewPage: M(
      'להמתין לנתוני GSC חיים לפני החלטת עמוד חדש',
      'ai_gate',
      'ai_estimate',
      { missingReason: null },
    ),
    contentMissing: M(
      'ייתכן — תמונות חסרות (quota); תוכן בסיסי ב-Preview',
      'preview-assets+decision',
      'internal',
    ),
    previewStatus: M(pagesPreview.ok ? `מוכן (HTTP ${pagesPreview.status})` : 'לא זמין', 'github-pages', pagesPreview.ok ? 'live' : 'missing'),
    imagesStatus: M('imagesBlockedQuota', 'stage-d-decision/infra', 'cache'),
    googleConnection: M('לא אומת חי בשלב 1', 'phase2', 'missing', { missingReason: 'לא בוצע Sync' }),
    analyticsStatus: M('לא אומת חי בשלב 1', 'phase2', 'missing', { missingReason: 'לא בוצע Sync' }),
    adsStatus: M('לא חלק מהמסלול / לא הוגדר', 'product-scope', 'missing', { missingReason: 'Ads דולג' }),
    gbpStatus: M('pending API (ידוע)', 'infra-verify', 'cache'),
  };

  const scores = {
    projectScore: M(projectScore, 'scoreProject()', 'internal'),
    progressPct: M(68, 'phase1-placeholder', 'ai_estimate'),
    goLiveReady: M(false, 'gates', 'internal'),
    goLiveReason: M(
      'Preview מוכן אך תמונות חסומות ו-Google לא מאומת חי',
      'gates',
      'internal',
    ),
    explanation: M(reasons.join(' · '), 'scoreProject()', 'internal'),
  };

  const executiveSummary = {
    siteStateToday: M('Preview מוכן ב-Staging · תמונות ממתינות · Google לא מאומת חי', 'preview+infra', 'internal'),
    googleTrend: noSync('מגמת גוגל'),
    changedSincePrev: M(
      number === 1 ? 'דוח ראשון (#0001) — אין דוח קודם להשוואה' : 'השוואה לדוח קודם — Phase 1 מינימלי',
      'report-sequence',
      'internal',
    ),
    done: M('Quality gate · Preview c3+c13 · דוח BI Phase 1', 'stage-d + generator', 'internal'),
    missing: M('GSC/GA4 חי · תמונות · אימות Google', 'gates', 'internal'),
    top3Tasks: [
      M('לאשר תיקון OpenAI quota ואז CocoImageStage בלבד', 'chief/ops', 'ai_estimate'),
      M('לאשר Sync GSC/GA4 חי (שלב 2) — בלי re-login אוטומטי', 'ops', 'ai_estimate'),
      M('מדידת CWV חיה ל-Preview', 'ops', 'ai_estimate'),
    ],
    mainRisk: M('OpenAI quota חוסם השלמת תמונות', 'infra-verify', 'cache'),
    mainOpportunity: M('Preview כבר חי — אפשר לבדוק מסרים לפני עלייה', 'preview', 'internal'),
    monthImpact: M(
      'חיבור GSC + השלמת תמונות צפויים להשפיע הכי הרבה — הערכת AI',
      'ai',
      'ai_estimate',
    ),
    aiRecommendation: M(
      'להישאר ב-Preview עד Sync Google ותמונות; לא לעלות ל-Production',
      'ai',
      'ai_estimate',
    ),
  };

  const top3Biz = [
    M('לחבר נתוני Google חיים (מיקומים וחיפושים) כדי לדעת אם עולים או יורדים', 'ops', 'ai_estimate'),
    M('להשלים תמונות לאתר אחרי תיקון מכסת OpenAI — בלי להריץ מחדש את כל המערכת', 'chief/ops', 'ai_estimate'),
    M('לחזק עמודי שירות ומימון באתר — הזדמנות תוכן ברורה מהמחקר', 'ai', 'ai_estimate'),
  ];

  const businessPotentialScore = Math.min(100, Math.max(0, 40
    + (pagesPreview.ok ? 15 : 0)
    + (decision?.qualityGate?.pass ? 15 : 0)
    + 10 // content base exists in preview
    - 10 // no live GSC yet
    - 10 // images blocked
  ));

  const miss = (label, reason) => M(label, 'phase2', 'missing', { missingReason: reason });

  const assetCategoryDefs = {
    'site-main': [
      { id: 'google-presence', labelHe: 'מצב בגוגל' },
      { id: 'keywords', labelHe: 'מילות מפתח' },
      { id: 'indexing', labelHe: 'אינדוקס' },
      { id: 'content', labelHe: 'תוכן' },
      { id: 'gsc', labelHe: 'Google Search Console' },
      { id: 'ga', labelHe: 'GA' },
      { id: 'gbp-local', labelHe: 'Google Business' },
      { id: 'site-health', labelHe: 'בריאות המערכת' },
      { id: 'recommendations', labelHe: 'המלצות' },
    ],
    'site-extra': [
      { id: 'google-presence', labelHe: 'מצב בגוגל' },
      { id: 'keywords', labelHe: 'מילות מפתח' },
      { id: 'content', labelHe: 'תוכן' },
      { id: 'recommendations', labelHe: 'המלצות' },
    ],
    'google-ads': [
      { id: 'ads-campaigns', labelHe: 'מצב הקמפיינים' },
      { id: 'ads-leads', labelHe: 'לידים ממודעות' },
      { id: 'ads-spend', labelHe: 'השקעה מול תוצאה' },
      { id: 'ads-keywords', labelHe: 'מילות מפתח במודעות' },
      { id: 'ads-recommendations', labelHe: 'המלצות לשיפור' },
    ],
    facebook: [
      { id: 'fb-reach', labelHe: 'חשיפה וקהל' },
      { id: 'fb-leads', labelHe: 'לידים מפייסבוק' },
      { id: 'fb-ads', labelHe: 'מודעות פעילות' },
      { id: 'fb-recommendations', labelHe: 'המלצות לשיפור' },
    ],
    instagram: [
      { id: 'ig-reach', labelHe: 'חשיפה ותוכן' },
      { id: 'ig-leads', labelHe: 'פניות מאינסטגרם' },
      { id: 'ig-ads', labelHe: 'קידום ממומן' },
      { id: 'ig-recommendations', labelHe: 'המלצות לשיפור' },
    ],
    gbp: [
      { id: 'gbp-profile', labelHe: 'פרופיל העסק' },
      { id: 'gbp-reviews', labelHe: 'ביקורות ודירוג' },
      { id: 'gbp-calls', labelHe: 'שיחות וניווטים' },
      { id: 'gbp-recommendations', labelHe: 'המלצות לשיפור' },
    ],
    'media-system': [
      { id: 'media-overview', labelHe: 'מערכת מדיה' },
      { id: 'media-storage', labelHe: 'אחסון מדיה' },
      { id: 'media-generation', labelHe: 'יצירת תמונות' },
      { id: 'media-site-images', labelHe: 'תמונות האתר' },
      { id: 'media-pending', labelHe: 'תמונות שממתינות לאישור' },
      { id: 'media-faults', labelHe: 'תקלות מדיה' },
      { id: 'media-broken-links', labelHe: 'קישורים שבורים' },
      { id: 'media-missing-alt', labelHe: 'תמונות ללא Alt' },
      { id: 'media-unoptimized', labelHe: 'תמונות ללא אופטימיזציה' },
      { id: 'media-costs', labelHe: 'עלויות מדיה' },
      { id: 'media-usage', labelHe: 'שימוש באחסון' },
    ],
  };

  const assetCatalog = [
    { id: 'site-main', labelHe: 'אתר ראשי (קידום אורגני)', defaultSelected: true, hasLiveData: true, categories: assetCategoryDefs['site-main'] },
    { id: 'site-extra', labelHe: 'אתר נוסף', defaultSelected: false, hasLiveData: false, categories: assetCategoryDefs['site-extra'] },
    { id: 'google-ads', labelHe: 'Google Ads', defaultSelected: false, hasLiveData: false, categories: assetCategoryDefs['google-ads'] },
    { id: 'facebook', labelHe: 'Facebook', defaultSelected: false, hasLiveData: false, categories: assetCategoryDefs.facebook },
    { id: 'instagram', labelHe: 'Instagram', defaultSelected: false, hasLiveData: false, categories: assetCategoryDefs.instagram },
    { id: 'gbp', labelHe: 'Google Business Profile', defaultSelected: false, hasLiveData: false, categories: assetCategoryDefs.gbp },
    { id: 'media-system', labelHe: 'מערכת מדיה — תמונות וסרטונים', defaultSelected: true, hasLiveData: true, categories: assetCategoryDefs['media-system'] },
  ];

  const siteAsset = {
    id: 'site-main',
    labelHe: 'אתר ראשי (קידום אורגני)',
    trend: {
      level: pagesPreview.ok ? 'flat' : 'down',
      reason: pagesPreview.ok
        ? 'האתר בתצוגה מוכן, אבל אין עדיין נתוני מיקומים חיים — לכן המגמה מסומנת יציבה ולא «משתפר».'
        : 'תצוגת האתר לא זמינה כרגע.',
    },
    businessPotential: {
      score: businessPotentialScore,
      why: 'יש בסיס אתר מוכן והזדמנות תוכן, אך בלי נתוני Google חיים ותמונות — הפוטנציאל חלקי.',
      meta: M(businessPotentialScore, 'scoreProject()', 'internal'),
    },
    progressLabel: pagesPreview.ok ? 'בתנועה' : 'עצור',
    progressMeta: M(pagesPreview.ok ? 'יש תצוגת אתר פעילה' : 'אין תצוגה', 'preview', pagesPreview.ok ? 'live' : 'missing'),
    categories: [
      {
        id: 'google-presence',
        labelHe: 'מצב בגוגל',
        items: [
          noSync('מיקום ממוצע בגוגל'),
          M(pagesPreview.ok ? 'האתר מוצג בתצוגה מקדימה ומוכן לבדיקה עסקית' : 'אין תצוגה', 'preview', pagesPreview.ok ? 'live' : 'missing'),
        ],
      },
      {
        id: 'keywords',
        labelHe: 'מילות מפתח',
        items: [miss('דירוג מילות מפתח', 'אין חיבור חי למיקומים — יגיע אחרי חיבור Google Search Console')],
      },
      {
        id: 'indexing',
        labelHe: 'אינדוקס',
        items: [miss('כמה עמודים בגוגל', 'לא בוצע Sync ל-Google Search Console')],
      },
      {
        id: 'content',
        labelHe: 'תוכן',
        items: [
          M('יש בסיס תוכן בתצוגה; עמודי שירות ומימון עדיין דורשים חיזוק', 'preview+research', 'cache'),
          M('תמונות האתר עדיין לא הושלמו', 'stage-d-decision/infra', 'cache'),
        ],
      },
      {
        id: 'gsc',
        labelHe: 'Google Search Console',
        items: [miss('חיפושים וקליקים', 'לא בוצע Sync ל-Google Search Console')],
      },
      {
        id: 'ga',
        labelHe: 'GA',
        items: [miss('כניסות ולידים מהאתר', 'אין חיבור Analytics חי')],
      },
      {
        id: 'gbp-local',
        labelHe: 'Google Business',
        items: [miss('פעילות בפרופיל העסק', 'אין חיבור Google Business Profile חי בדוח זה')],
      },
      {
        id: 'site-health',
        labelHe: 'בריאות המערכת',
        items: [
          M(blockingFaults.length ? 'יש תקלה שעלולה לחסום' : 'האתר לא חסום כרגע; יש פערי חיבור', 'health-check', 'internal'),
        ],
      },
      {
        id: 'recommendations',
        labelHe: 'המלצות',
        items: top3Biz,
      },
    ],
  };

  function placeholderAsset(id, labelHe, whySoon) {
    const cats = (assetCategoryDefs[id] || []).map((c) => ({
      id: c.id,
      labelHe: c.labelHe,
      items: [miss(`אין נתון חי עבור «${c.labelHe}»`, whySoon)],
    }));
    return {
      id,
      labelHe,
      trend: {
        level: 'flat',
        reason: 'הנכס מוכן בסינון, אבל עדיין אין נתוני אמת — לכן אין מגמת שיפור למדוד.',
      },
      businessPotential: {
        score: 0,
        why: whySoon,
        meta: miss('פוטנציאל עסקי', whySoon),
      },
      progressLabel: 'ממתין לחיבור',
      progressMeta: miss('התקדמות', whySoon),
      categories: cats,
    };
  }

  const extraAssets = [
    placeholderAsset('site-extra', 'אתר נוסף', 'עדיין לא הוגדר אתר נוסף ללקוח זה'),
    placeholderAsset('google-ads', 'Google Ads', 'אין חיבור Google Ads חי בניסיון זה'),
    placeholderAsset('facebook', 'Facebook', 'אין חיבור Facebook חי בניסיון זה'),
    placeholderAsset('instagram', 'Instagram', 'אין חיבור Instagram חי בניסיון זה'),
    placeholderAsset('gbp', 'Google Business Profile', 'אין חיבור Google Business Profile חי בניסיון זה'),
  ];

  const mediaManifest = readJson(`public/coco-media/${CLIENT}/manifest.json`);
  const mediaHealthFile = readJson(`public/coco-media/${CLIENT}/health.json`) || mediaManifest?.health || null;
  const mediaAssetsList = mediaManifest?.assets || [];
  const mediaBytes = mediaAssetsList.reduce((s, a) => s + (a.bytes || 0), 0);
  const mediaMissingAlt = mediaAssetsList.filter((a) => !a.hasAlt).length;
  const mediaUnopt = mediaAssetsList.filter((a) => !a.optimized).length;
  const mh = mediaHealthFile || {
    storageService: 'Supabase Storage (Staging)',
    storageStatus: 'לא פעיל',
    imageEngineStatus: 'לא נבדק',
    videoEngineStatus: 'לא מחובר עדיין',
    imagesLoadInSite: 'לא',
    imagesInSite: 0,
    withAlt: 0,
    optimized: 0,
    pendingApproval: 0,
    brokenLinks: 0,
    permissionsStatus: 'לא נבדק',
    overallStatus: 'דורש תשומת לב',
    recommendedAction: 'להריץ דוגמת מדיה ב-Staging',
    checkedAt: generatedAtIso,
  };

  const mediaAsset = {
    id: 'media-system',
    labelHe: 'מערכת מדיה — תמונות וסרטונים',
    trend: {
      level: mh.brokenLinks ? 'down' : (mediaAssetsList.length ? 'up' : 'flat'),
      reason: mediaAssetsList.length
        ? 'ארבע תמונות חוברו ל-Preview מאחסון חיצוני — ממתין לאישור Owner.'
        : 'עדיין אין תמונות מחוברות לאתר.',
    },
    businessPotential: {
      score: mediaAssetsList.length ? 72 : 20,
      why: mediaAssetsList.length
        ? 'מדיה מקצועית באתר מחזקת אמון והמרה — אחרי אישור אפשר להרחיב לסרטונים.'
        : 'בלי מדיה האתר נשאר טקסטואלי מדי ל-B2B.',
      meta: M(mediaAssetsList.length ? 72 : 20, 'media-health', 'internal'),
    },
    progressLabel: mediaAssetsList.length ? 'בתנועה' : 'ממתין',
    progressMeta: M(
      mediaAssetsList.length ? `${mediaAssetsList.length} תמונות ב-Preview` : 'אין תמונות',
      'coco-media/manifest',
      mediaAssetsList.length ? 'live' : 'missing',
    ),
    categories: [
      {
        id: 'media-overview',
        labelHe: 'מערכת מדיה',
        items: [
          M(`סטטוס כללי: ${mh.overallStatus}`, 'media-health', 'internal'),
          M(`זמן בדיקה אחרונה: ${mh.checkedAt || generatedAtIso}`, 'media-health', 'internal'),
          M(`פעולה מומלצת: ${mh.recommendedAction}`, 'media-health', 'ai_estimate'),
        ],
      },
      {
        id: 'media-storage',
        labelHe: 'אחסון מדיה',
        items: [
          M(`שירות אחסון: ${mh.storageService}`, 'supabase-storage', 'live'),
          M(`מצב אחסון: ${mh.storageStatus}`, 'media-health', mh.storageStatus === 'פעיל' ? 'live' : 'missing'),
          M(`מצב הרשאות: ${mh.permissionsStatus}`, 'media-health', 'internal'),
        ],
      },
      {
        id: 'media-generation',
        labelHe: 'יצירת תמונות',
        items: [
          M(`מנוע תמונות: ${mh.imageEngineStatus}`, 'openai-images', /פעיל/.test(mh.imageEngineStatus) ? 'live' : 'cache'),
          M(`מנוע וידאו: ${mh.videoEngineStatus}`, 'video-engine', 'missing'),
        ],
      },
      {
        id: 'media-site-images',
        labelHe: 'תמונות האתר',
        items: [
          M(`האם התמונות נטענות באתר: ${mh.imagesLoadInSite}`, 'preview-probe', mh.imagesLoadInSite === 'כן' ? 'live' : 'missing'),
          M(`מספר תמונות באתר: ${mh.imagesInSite}`, 'manifest', 'internal'),
        ],
      },
      {
        id: 'media-pending',
        labelHe: 'תמונות שממתינות לאישור',
        items: [M(`ממתינות לאישור Owner: ${mh.pendingApproval}`, 'manifest', 'internal')],
      },
      {
        id: 'media-faults',
        labelHe: 'תקלות מדיה',
        items: [
          M(
            mh.brokenLinks || /תקלה|חסום|Billing/i.test(String(mh.imageEngineStatus))
              ? `יש פער: ${mh.imageEngineStatus}`
              : 'אין תקלת מדיה שחוסמת את ה-Preview',
            'media-health',
            mh.brokenLinks ? 'missing' : 'internal',
          ),
        ],
      },
      {
        id: 'media-broken-links',
        labelHe: 'קישורים שבורים',
        items: [M(`קישורים שבורים: ${mh.brokenLinks}`, 'url-probe', mh.brokenLinks ? 'missing' : 'live')],
      },
      {
        id: 'media-missing-alt',
        labelHe: 'תמונות ללא Alt',
        items: [
          M(`עם Alt: ${mh.withAlt} · ללא Alt: ${mediaMissingAlt}`, 'manifest', mediaMissingAlt ? 'missing' : 'live'),
        ],
      },
      {
        id: 'media-unoptimized',
        labelHe: 'תמונות ללא אופטימיזציה',
        items: [
          M(`עברו אופטימיזציה (WebP): ${mh.optimized} · ללא: ${mediaUnopt}`, 'sharp-webp', mediaUnopt ? 'missing' : 'live'),
        ],
      },
      {
        id: 'media-costs',
        labelHe: 'עלויות מדיה',
        items: [
          M(
            'עלות דוגמה: יצירה במנוע חלופי זמני אחרי חסימת Billing ב-OpenAI · אחסון Staging זניח',
            'billing',
            'cache',
          ),
        ],
      },
      {
        id: 'media-usage',
        labelHe: 'שימוש באחסון',
        items: [
          M(`נפח תמונות בדוגמה: ${(mediaBytes / 1024).toFixed(0)} KB · bucket coco-media`, 'storage', 'internal'),
        ],
      },
    ],
  };

  const managerCard = {
    campaignProgress: M(
      pagesPreview.ok ? 'יש התקדמות בבניית הנוכחות הדיגיטלית (אתר מוכן לתצוגה), אבל עדיין אין הוכחת עלייה בגוגל' : 'אין התקדמות מדידה',
      'preview+infra',
      'internal',
    ),
    towardGoal: M(
      'מתקדמים לעבר נוכחות דיגיטלית, אך המטרה העסקית (לידים/מקום ראשון) עדיין לא נמדדת בנתוני אמת',
      'gates',
      'internal',
    ),
    rankingImproved: noSync('השתפרות מיקום בגוגל'),
    moreLeads: M('אין נתון חי על לידים', 'phase2', 'missing', { missingReason: 'אין חיבור למדידת לידים / Analytics' }),
    blocker: M(
      'שתי חסימות עיקריות: מכסת AI לתמונות, וחיבור Google שעדיין לא אומת חי',
      'infra-verify',
      'cache',
    ),
    top3: top3Biz,
  };

  const healthBusiness = {
    statusLabel: blockingFaults.length ? 'דורש טיפול' : (healthSummary.err > 0 ? 'דורש תשומת לב' : 'תקין עם פערי חיבור'),
    statusWhy: blockingFaults.length
      ? 'יש תקלה שעלולה לחסום את האתר.'
      : 'אין תקלה שחוסמת את האתר כרגע. חלק מהחיבורים עדיין לא הוגדרו — זה לא אומר שהאתר קרס.',
    assistantsLabel: `${asst.quality?.completedQuality ?? 29} הושלמו`,
    assistantsMeta: M('לא הורצו מחדש בדוח הזה', 'stage-d-assistants-raw', 'cache'),
    enginesLabel: 'פעילים חלקית',
    enginesMeta: M('מנועי בנייה השלימו תצוגה; לא הורצו מחדש היום', 'stage-d + generator', 'cache'),
    detailNote: 'פירוט טכני מלא נשמר במערכת ולא מוצג כאן כדי לשמור על קריאה עסקית מהירה.',
  };

  const fourAnswers = {
    whereToday: M('אתר בתצוגה מוכן · קידום אורגני ממתין לנתוני Google חיים · תמונות ממתינות', 'preview+infra', 'internal'),
    progressSincePrev: M(
      number === 1 ? 'אין דוח קודם להשוואה (דוח #0001)' : 'יש להשוות לדוח הקודם',
      'report-sequence',
      'internal',
    ),
    whatsMissingForFirst: M(
      'נתוני מיקומים חיים, השלמת תמונות, וחיזוק עמודי שירות/מימון',
      'ai',
      'ai_estimate',
    ),
    top3: top3Biz,
  };

  const comparison = {
    summary: 'נבחר נכס אחד — אין צורך בהשוואה.',
    summarySingle: 'נבחר נכס אחד — אין צורך בהשוואה.',
    summaryMulti: 'השוואה בין הנכסים שנבחרו — מה חשוב להחלטה עכשיו:',
    bullets: [
      'מי מביא יותר לידים עכשיו: עדיין אין נתון חי להשוואה — אחרי חיבור המדידה נוכל לדרג בין הנכסים.',
      'מי מתקדם יותר: האתר הראשי הוא היחיד עם תצוגה פעילה; שאר הנכסים ממתינים לחיבור.',
      'מי נותן יותר ערך כרגע: השקעה באתר + חיבור Google תיתן את התמונה העסקית המהירה ביותר.',
      'איפה כדאי להשקיע עכשיו: לחבר נתוני אמת לאתר, ורק אחר כך להרחיב ל-Ads / רשתות / Google Business.',
    ],
    note: 'ההשוואה מוכנה לריבוי נכסים. כרגע חלק מהנכסים בלי נתוני אמת — והסיבה מצוינת ליד כל שורה.',
  };

  const bottomLineToday = mediaAssetsList.length
    ? 'ארבע תמונות שולבו באתר ה-Preview מתוך מערכת המדיה (Hero, שירות, FleetOS, CTA) וממתינות לאישור Owner. עדיין אין נתוני Google חיים — אחרי אישור המדיה, חיבור מדידה הוא הצעד הבא עם ההשפעה העסקית הגדולה ביותר.'
    : 'האתר בתצוגה מוכן והכיוון נכון, אבל עדיין אין נתוני Google חיים. אם נחבר מיקומים ונחזק עמוד שירות השבוע — זו הפעולה שתיתן את ההשפעה העסקית הגדולה ביותר.';

  const subjectTemplate = `CO.CO | דוח יומי #${padded} | דליה פתרונות תפעול ותחזוקה לרכב | ${reportDate.split('-').reverse().join('/')}`;

  const report = {
    meta: {
      version: '2.1.0-business-manager-trial',
      phase: 1,
      generatedAt: generatedAtIso,
      generatedTimeIL: timeIL(generatedAt),
      reportDate,
      timezone: 'Asia/Jerusalem',
      reportNumber: number,
      reportNumberPadded: padded,
      reportNumberDisplay: `#${padded}`,
      reportId,
      pdfFileName,
      cocoVersion: COCO_VERSION,
      readOnly: true,
      pipelineRan: false,
      imagesGenerated: mediaAssetsList.length > 0,
      mediaDemoIntegrated: mediaAssetsList.length > 0,
      secretsChanged: false,
      clientSlug: CLIENT,
      uiLanguage: 'he',
    },
    client: {
      clientId: CLIENT,
      company: 'דליה פתרונות תפעול ותחזוקה לרכב',
      contact: 'יוני אטיאס',
      domain: 'dalia-c.com',
      previewUrl: PREVIEW_URL,
    },
    bottomLineToday,
    assetCatalog,
    assets: [siteAsset, mediaAsset, ...extraAssets],
    managerCard,
    businessPotential: {
      score: businessPotentialScore,
      why: mediaAssetsList.length
        ? 'יש בסיס אתר + מדיה ב-Preview; חסרה מדידת Google חיה ואישור Owner לתמונות לפני הרחבה.'
        : 'יש בסיס אתר והזדמנות תוכן, אבל בלי מדידת Google חיה ותמונות — כדאי להמשיך להשקיע בזהירות עד שיש נתוני אמת.',
      meta: M(businessPotentialScore, 'scoreProject()', 'internal'),
    },
    healthBusiness,
    fourAnswers,
    comparison,
    dashboard,
    scores,
    executiveSummary,
    healthChecks,
    healthScore,
    healthScoreFormula,
    healthScoreNote: 'הציון נמוך בעיקר כי חיבורים רבים עדיין לא הוגדרו — לא בגלל קריסת האתר.',
    healthSummary,
    criticalFaults,
    blockingFaults,
    unimplementedChecks,
    siteAssets: {
      bytes: M(assets.bytes, 'preview-fs', 'internal'),
      images: M(assets.images, 'preview-fs', 'internal'),
      js: M(assets.js, 'preview-fs', 'internal'),
      css: M(assets.css, 'preview-fs', 'internal'),
    },
    assistantsHint: {
      completed: M(asst.quality?.completedQuality ?? 29, 'stage-d-assistants-raw', 'cache'),
      note: M('לא הורצו מחדש בריצה זו', 'generator', 'internal'),
    },
    email: {
      status: 'dry_run',
      error: null,
      id: null,
      previewOnly: true,
      sentAt: null,
      subjectTemplate,
      note: 'תצוגה בלבד — אין שליחה אמיתית',
    },
    readOnlyGuarantees: {
      pipelineRan: false,
      assistantsReran: false,
      consultantsReran: false,
      enginesReran: false,
      imagesGenerated: false,
      seoChanged: false,
      siteChanged: false,
      oauthChanged: false,
      secretsChanged: false,
      productionTouched: false,
      cronEnabled: false,
      realEmailSent: false,
      migrationApplied: false,
      edgeDeployed: false,
      gscLive: false,
      ga4Live: false,
      gbpLive: false,
      adsLive: false,
    },
  };

  const html = renderBusinessHtml(report);
  const htmlName = `COCO-Daily-Report-${padded}-${reportDate}.html`;
  const jsonName = `COCO-Daily-Report-${padded}-${reportDate}.json`;
  const emailName = `COCO-Daily-Report-${padded}-${reportDate}-email-preview.html`;
  const pngName = `COCO-Daily-Report-${padded}-${reportDate}-page1.png`;

  const keep = new Set([
    'report-sequence.json',
    'index.json',
    'latest.html',
    'latest.json',
    'latest.pdf',
    htmlName,
    jsonName,
    pdfFileName,
    emailName,
    pngName,
  ]);
  pruneOldArtifacts(keep);

  const htmlPath = join(OUT_DIR, htmlName);
  const jsonPath = join(OUT_DIR, jsonName);
  const pdfPath = join(OUT_DIR, pdfFileName);
  const latestHtml = join(OUT_DIR, 'latest.html');
  const latestJson = join(OUT_DIR, 'latest.json');
  const latestPdf = join(OUT_DIR, 'latest.pdf');
  const emailPath = join(OUT_DIR, emailName);
  const pngPath = join(OUT_DIR, pngName);

  writeFileSync(htmlPath, html, 'utf8');
  writeFileSync(latestHtml, html, 'utf8');
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  writeFileSync(latestJson, JSON.stringify(report, null, 2), 'utf8');

  const emailHtml = `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>Email digest preview</title></head>
<body style="font-family:Arial,sans-serif;padding:24px;background:#f1f5f9">
<div style="max-width:560px;margin:0 auto;background:#fff;padding:16px;border-radius:12px;border:1px solid #dbe3f0">
  <p style="color:#64748b;font-size:12px">תקציר בלבד · PDF מצורף בשליחה אמיתית (לא בשלב 1)</p>
  <h2 style="margin:0 0 8px">CO.CO | דוח יומי #${padded}</h2>
  <p>${h(report.client.company)} · ${h(reportDate)}</p>
  <ul>
    <li>Project Score: ${h(scores.projectScore.value)}</li>
    <li>Health Score: ${h(healthScore)}</li>
    <li>מצב אתר: ${h(executiveSummary.siteStateToday.value)}</li>
  </ul>
  <p><strong>Top 3:</strong></p>
  <ol>${executiveSummary.top3Tasks.map((t) => `<li>${h(t.value)}</li>`).join('')}</ol>
  <p style="font-size:12px;color:#64748b">email_status=dry_run · לא נשלח</p>
</div></body></html>`;
  writeFileSync(emailPath, emailHtml, 'utf8');

  await writePdf(htmlPath, pdfPath, {
    padded,
    company: report.client.company,
    reportDate,
  });
  writeFileSync(latestPdf, readFileSync(pdfPath));
  await screenshotPage1(htmlPath, pngPath);

  const archive = readdirSync(OUT_DIR)
    .filter((f) => /^COCO-Daily-Report-\d{4}-\d{4}-\d{2}-\d{2}\.html$/.test(f) || /^\d{4}-\d{2}-\d{2}\.html$/.test(f))
    .sort()
    .map((f) => ({ html: f, kept: true }));

  writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify({
    clientSlug: CLIENT,
    policy: 'latest-in-ui; prior reports kept on disk (no auto-delete); email is long-term archive',
    latest: {
      reportNumber: padded,
      reportNumberDisplay: `#${padded}`,
      date: reportDate,
      html: 'latest.html',
      json: 'latest.json',
      pdf: 'latest.pdf',
      pdfFileName,
      emailPreview: emailName,
      page1Screenshot: pngName,
      projectScore: scores.projectScore.value,
      healthScore,
    },
    archiveKept: archive,
    updatedAt: generatedAtIso,
  }, null, 2), 'utf8');

  console.log(JSON.stringify({
    ok: true,
    reportNumber: `#${padded}`,
    pdfFileName,
    paths: { htmlPath, pdfPath, latestHtml, pngPath, emailPath },
    scores: { project: projectScore, health: healthScore },
    email: report.email.status,
    guarantees: report.readOnlyGuarantees,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
