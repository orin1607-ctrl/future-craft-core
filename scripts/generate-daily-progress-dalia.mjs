/**
 * Generate CO.CO Daily Progress Report sample for Dalia (READ-ONLY).
 * - Reads existing coco-reports / local state
 * - Optional light live probes (Pages HEAD, SSL) — never pipeline / images / OAuth write
 * - Does NOT send email (dry_run preview only)
 * - Does NOT write to Supabase unless --persist-db (default off)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as tls from 'node:tls';
import { resolve4 } from 'node:dns/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'public', 'coco-reports', 'dalia-c-official', 'daily');
const CLIENT = 'dalia-c-official';
const COCO_VERSION = '7.0.0-preview-images-split';
const PAGES_BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const PREVIEW_URL = `${PAGES_BASE}/client-previews/${CLIENT}/index.html`;

function readJson(rel) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function todayIL() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
}

async function probeHead(url, ms = 10000) {
  const t0 = Date.now();
  try {
    const ctrl = AbortSignal.timeout(ms);
    const res = await fetch(url, { method: 'GET', signal: ctrl, redirect: 'follow' });
    return { ok: res.ok, status: res.status, ms: Date.now() - t0, live: true };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - t0, live: true, error: String(e.message || e) };
  }
}

async function probeSsl(host) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: true }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      resolve({
        ok: true,
        live: true,
        ms: Date.now() - t0,
        validTo: cert?.valid_to || null,
        subject: cert?.subject?.CN || null,
      });
    });
    socket.setTimeout(10000, () => { socket.destroy(); resolve({ ok: false, live: true, ms: Date.now() - t0, error: 'timeout' }); });
    socket.on('error', (e) => resolve({ ok: false, live: true, ms: Date.now() - t0, error: e.message }));
  });
}

async function probeDns(host) {
  const t0 = Date.now();
  try {
    const addrs = await resolve4(host);
    return { ok: addrs.length > 0, live: true, ms: Date.now() - t0, addrs };
  } catch (e) {
    return { ok: false, live: true, ms: Date.now() - t0, error: String(e.message || e) };
  }
}

function healthRow(name, status, opts = {}) {
  return {
    name,
    status,
    checkPerformed: opts.checkPerformed || opts.checkType || (opts.live ? 'בדיקה חיה' : 'לא בוצעה בדיקה חיה'),
    checkType: opts.live ? 'חיה' : (opts.checkType || 'לא בוצעה בדיקה חיה'),
    checkedAt: opts.checkedAt || new Date().toISOString(),
    lastSync: opts.lastSync || null,
    lastError: opts.error || null,
    why: opts.why || '—',
    issueKind: opts.issueKind || 'unknown', // real | check_not_implemented | local_env | known_quota | not_in_scope
    blocksSite: opts.blocksSite === true,
    actionRequiredFromUser: opts.actionRequiredFromUser || 'לא',
    impact: opts.impact || '—',
    recommendation: opts.recommendation || '—',
    sourceType: opts.sourceType || (status === 'תקין' ? 'live' : status === 'לא הוגדר' ? 'not_configured' : 'missing'),
  };
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

function buildStages(decision, asst, dump) {
  const q = asst?.quality || {};
  const gates = decision?.gates || dump?.gates || {};
  const img = decision?.openaiImagesConfigured === false ? 'imagesBlockedQuota' : 'imagesPending';
  return [
    { id: 'intake', name: 'אפיון', status: 'הושלם', source: 'internal', note: 'Pack + intake' },
    { id: 'seo-q', name: 'שאלון SEO', status: 'הושלם', source: 'internal', note: 'Part A–B' },
    { id: 'competitors', name: 'מחקר מתחרים', status: 'הושלם', source: 'internal', note: 'C-rev2' },
    { id: 'keywords', name: 'מחקר מילות מפתח', status: 'הושלם', source: 'internal', note: 'נפחים = הערכה' },
    { id: 'assistants', name: '50 העוזרים', status: `${q.completedQuality || 0} הושלמו / ${q.inProgress || 0} בתהליך`, source: 'internal' },
    { id: 'consultants', name: '10 היועצים', status: 'אושר עם תיקון (רוב)', source: 'internal' },
    { id: 'orchestrator', name: 'Orchestrator', status: gates.quality ? 'quality PASS' : 'ממתין', source: 'internal' },
    { id: 'engines', name: '13 המנועים', status: `${(decision?.engines?.ready || []).length}/13 מוכנים`, source: 'internal' },
    { id: 'build', name: 'בניית האתר', status: 'הושלם (c3+c13)', source: 'internal' },
    { id: 'preview', name: 'Preview', status: gates.sitePreviewReady !== false ? 'מוכן — תמונות ממתינות' : 'ממתין', source: 'internal' },
    { id: 'images', name: 'תמונות', status: img, source: 'internal' },
    { id: 'seo', name: 'SEO', status: 'בתהליך', source: 'internal', note: 'אין נתון חי למיקומים' },
    { id: 'google', name: 'Google', status: 'לא אומת חי', source: 'missing' },
    { id: 'analytics', name: 'Analytics', status: 'אין נתון חי', source: 'missing' },
  ];
}

function buildSeo(research) {
  const cats = research?.keywordCategories;
  let terms = [];
  if (Array.isArray(cats)) {
    terms = cats.flatMap((c) => (c.keywords || c.items || [c]).map((k) => (typeof k === 'string' ? { term: k } : k)));
  } else if (cats && typeof cats === 'object') {
    terms = Object.values(cats).flatMap((arr) =>
      (Array.isArray(arr) ? arr : []).map((k) => (typeof k === 'string' ? { term: k } : k)),
    );
  } else if (Array.isArray(research?.keywords)) {
    terms = research.keywords.map((k) => (typeof k === 'string' ? { term: k } : k));
  }
  terms = terms.slice(0, 12);
  if (!terms.length) {
    terms = [
      { term: 'ניהול צי רכב' },
      { term: 'תחזוקת צי רכב' },
      { term: 'תפעול צי רכב לעסקים' },
      { term: 'מימון צי רכב' },
      { term: 'מוסך צי רכב' },
    ];
  }
  return {
    keywords: terms.map((t) => ({
      term: t.term || t.kw || t.name || String(t),
      position: 'אין נתון חי',
      changeYesterday: 'אין נתון חי',
      changeWeek: 'אין נתון חי',
      trend: '—',
      forecast1m: { value: 'שיפור הדרגתי אפשרי', tag: 'הערכה' },
      forecast3m: { value: 'פוטנציאל לעמוד 1 בביטויים ארוכים', tag: 'הערכה' },
      forecast6m: { value: 'תחרות מול CarGeek — תלוי תוכן+E-E-A-T', tag: 'הערכה' },
      forecast12m: { value: 'יעד Top 10 בביטויי ליבה — הערכה בלבד', tag: 'הערכה' },
      sourceType: 'missing',
    })),
    newKeywordsNote: 'לא בוצע מחקר KW חדש היום — מבוסס C-rev2 שמור',
    forecastsLabel: 'כל התחזיות מסומנות הערכה',
  };
}

function buildCompetitors(research) {
  const active = research?.activeRanked || [];
  const researchedAt = research?.updatedAt || research?.verifiedAt || null;
  const today = todayIL();
  const researchDay = researchedAt ? String(researchedAt).slice(0, 10) : null;
  const fresh = researchDay === today;
  return {
    researchedToday: fresh,
    note: fresh ? 'מחקר מעודכן היום' : 'לא בוצע מחקר חדש',
    peers: active.filter((c) => c.id !== 'operational-leasing-category').map((c) => ({
      id: c.id,
      name: c.fullName || c.id,
      threat: c.threatScore ?? c.threat,
      url: c.url || null,
    })),
    stronger: ['שילוב תפעול+תחזוקה+מוסך בבעלות+מימון', 'בעלות הרכב אצל הלקוח'],
    weaker: ['CarGeek — מיקור חוץ מלא כמתחרה מרכזי'],
    opportunities: ['עמודי מימון ומוסך', 'בידול מול ליסינג תפעולי כקטגוריה'],
    newKeywords: ['מימון צי רכב לעסקים'],
    servicesToAdd: ['הדגשת מימון באתר'],
    pagesToStrengthen: ['דף הבית', 'שירותים', 'מימון'],
    source: 'C-rev2 / stage-c-research-v1',
  };
}

function scoreProject(decision, healthSummary) {
  let score = 55;
  const reasons = [];
  if (decision?.qualityGate?.pass) { score += 15; reasons.push('+15 quality gate'); }
  if (decision?.gates?.sitePreviewReady !== false) { score += 10; reasons.push('+10 preview ready'); }
  if (decision?.engines?.ready?.includes('c13')) { score += 5; reasons.push('+5 c13'); }
  if ((healthSummary.ok || 0) >= 3) { score += 5; reasons.push('+5 health live ok'); }
  if (decision?.readyForStageE === false) { score -= 5; reasons.push('-5 images blocked'); }
  score = Math.max(0, Math.min(100, score));
  return {
    projectScore: score,
    projectScoreFormula: 'base 55 + qualityGate(+15) + previewReady(+10) + c13(+5) + healthLiveOk≥3(+5) + imagesBlocked(−5); clamp 0–100',
    progressPct: 68,
    progressPctSource: 'estimate',
    progressPctNote: 'הערכה קבועה בשלב 1 — אין עדיין נוסחה משוקללת לפי שלבים; לא נתון חי',
    goLiveReady: false,
    goLiveReason: 'Preview מוכן אך תמונות חסומות (quota) ו-Google לא מאומת חי',
    explanation: reasons.join(' · ') || 'חישוב פנימי',
    top3ToImprove: [
      'תיקון OpenAI quota והשלמת תמונות (CocoImageStage בלבד)',
      'אימות GSC/GA4 חי (sync מאושר, בלי re-login אוטומטי)',
      'מדידת CWV חיה ל-Preview',
    ],
    sourceType: 'internal',
  };
}

function renderHtml(report) {
  const h = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const stages = report.stages.map((s) => `<tr><td>${h(s.name)}</td><td>${h(s.status)}</td><td><code>${h(s.source)}</code></td><td>${h(s.note || '—')}</td></tr>`).join('');
  const health = report.healthChecks.map((x) => `<tr>
    <td>${h(x.name)}</td><td>${h(x.status)}</td><td><code>${h(x.sourceType)}</code></td>
    <td>${h(x.checkPerformed || x.checkType)}</td>
    <td>${h(x.why || '—')}</td>
    <td>${h(x.issueKind || '—')}</td>
    <td>${x.blocksSite ? 'כן' : 'לא'}</td>
    <td>${h(x.actionRequiredFromUser || 'לא')}</td>
    <td>${h(x.lastError || '—')}</td>
    <td>${h(x.recommendation)}</td></tr>`).join('');
  const kws = (report.seoIntelligence.keywords || []).map((k) => `<tr>
    <td>${h(k.term)}</td><td>${h(k.position)}</td><td>${h(k.changeYesterday)}</td><td>${h(k.changeWeek)}</td><td>${h(k.trend)}</td>
    <td>${h(k.forecast1m.value)} <span class="est">${h(k.forecast1m.tag)}</span></td>
    <td>${h(k.forecast3m.value)} <span class="est">${h(k.forecast3m.tag)}</span></td>
    <td>${h(k.forecast6m.value)} <span class="est">${h(k.forecast6m.tag)}</span></td>
    <td>${h(k.forecast12m.value)} <span class="est">${h(k.forecast12m.tag)}</span></td>
  </tr>`).join('');
  const cons = (report.consultantsSummary.items || []).map((c) => `<tr>
    <td>${h(c.id)}</td><td>${h(c.name)}</td><td>${h(c.status)}</td><td>${h(c.decision || '—')}</td></tr>`).join('');

  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<title>דוח יומי — ${h(report.client.company)}</title>
<style>
body{font-family:Heebo,Arial,sans-serif;margin:0;background:#f4f7fb;color:#111;line-height:1.5}
.wrap{max-width:980px;margin:0 auto;padding:20px 14px 48px}
.card{background:#fff;border:1px solid #dbe3f0;border-radius:12px;padding:14px 16px;margin-bottom:12px}
h1{font-size:1.25rem;margin:0 0 6px}h2{font-size:1.05rem;margin:0 0 8px}
.meta{color:#64748b;font-size:.85rem}
table{width:100%;border-collapse:collapse;font-size:.72rem}
th,td{border:1px solid #e2e8f0;padding:5px 6px;text-align:right;vertical-align:top}
th{background:#0b1735;color:#fff}
.ok{color:#047857;font-weight:700}.warn{color:#b45309;font-weight:700}.bad{color:#b91c1c;font-weight:700}
.est{background:#ffedd5;color:#9a3412;font-size:.65rem;padding:1px 5px;border-radius:999px}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;background:#e2e8f0;font-size:.7rem}
</style></head><body><div class="wrap">
<h1>דוח התקדמות יומי — ${h(report.client.company)}</h1>
<p class="meta">${h(report.meta.reportDate)} · הופק: ${h(report.meta.generatedAt)} · <span class="badge">Read Only</span>
 · Pipeline לא הורץ · תמונות לא נוצרו</p>

<div class="card"><h2>פרטי לקוח</h2>
<p><strong>${h(report.client.company)}</strong><br>
clientId: <code>${h(report.client.clientId)}</code> · איש קשר: ${h(report.client.contact)} · אתר: ${h(report.client.domain)}</p>
<p><a href="${h(report.client.previewUrl)}">פתח אתר</a></p></div>

<div class="card"><h2>סיכום מנהלים</h2><p>${h(report.executiveSummary)}</p></div>

<div class="card"><h2>סטטוס שלבים</h2>
<table><tr><th>שלב</th><th>סטטוס</th><th>מקור</th><th>הערה</th></tr>${stages}</table></div>

<div class="card"><h2>50 עוזרים</h2>
<p>הושלמו: <strong>${report.assistantsSummary.completed}</strong> · בתהליך: <strong>${report.assistantsSummary.inProgress}</strong>
 · דולגו: <strong>${report.assistantsSummary.skipped}</strong> · ניתוח אמיתי: <strong>${report.assistantsSummary.realAnalysis}</strong></p>
<ul>${(report.assistantsSummary.topRecommendations || []).map((x) => `<li>${h(x)}</li>`).join('')}</ul></div>

<div class="card"><h2>10 יועצים</h2>
<table><tr><th>ID</th><th>שם</th><th>סטטוס</th><th>החלטה</th></tr>${cons}</table></div>

<div class="card"><h2>המלצת Chief</h2>
<p><strong>${h(report.chiefRecommendation.status)}</strong> — ${h(report.chiefRecommendation.reason)}</p></div>

<div class="card"><h2>SEO Intelligence</h2>
<p class="warn">${h(report.seoIntelligence.forecastsLabel)} · ${h(report.seoIntelligence.newKeywordsNote)}</p>
<table><tr><th>KW</th><th>מיקום</th><th>Δ אתמול</th><th>Δ שבוע</th><th>מגמה</th><th>1ח׳</th><th>3ח׳</th><th>6ח׳</th><th>12ח׳</th></tr>${kws}</table></div>

<div class="card"><h2>מתחרים</h2>
<p><strong>${h(report.competitors.note)}</strong></p>
<p>נבדקים: ${(report.competitors.peers || []).map((p) => h(p.name)).join(' · ') || '—'}</p>
<ul>
<li>חזקים: ${(report.competitors.stronger || []).map(h).join('; ')}</li>
<li>חלשים מול: ${(report.competitors.weaker || []).map(h).join('; ')}</li>
<li>הזדמנויות: ${(report.competitors.opportunities || []).map(h).join('; ')}</li>
</ul></div>

<div class="card"><h2>Health Check</h2>
<p>נבדקו: ${report.healthSummary.total} · תקין: ${report.healthSummary.ok} · אזהרה: ${report.healthSummary.warn}
 · שגיאה: ${report.healthSummary.err} · לא הוגדר: ${report.healthSummary.undef}
 · לא ניתן לאימות מקומית: ${report.healthSummary.localUnverifiable || 0}
 · <strong>Health Score: ${report.healthScore ?? '—'}</strong></p>
<p class="warn">${h(report.healthScoreNote || 'הציון נמוך בעיקר כי בדיקות רבות עדיין לא הוגדרו או לא ממומשות — לא בגלל קריסת האתר.')}</p>
<p class="meta">${h(report.healthScoreFormula || '')}</p>
<table><tr><th>ממשק</th><th>סטטוס</th><th>מקור</th><th>בדיקה בפועל</th><th>למה</th><th>סוג בעיה</th><th>חוסם אתר?</th><th>נדרש ממך?</th><th>שגיאה/הודעה</th><th>המלצה</th></tr>${health}</table></div>

<div class="card"><h2>ביצועים עסקיים</h2>
<p class="warn">${h(report.businessMetrics.note)}</p>
<ul>${Object.entries(report.businessMetrics.metrics || {}).map(([k, v]) => `<li>${h(k)}: ${h(v.value)} <code>${h(v.source)}</code></li>`).join('')}</ul></div>

<div class="card"><h2>ביצועי אתר</h2>
<p class="warn">${h(report.sitePerformance.note)}</p>
<ul>${Object.entries(report.sitePerformance.metrics || {}).map(([k, v]) => `<li>${h(k)}: ${h(typeof v === 'object' ? v.value : v)}${v?.delta != null ? ` (Δ ${h(v.delta)})` : ''} <code>${h(v?.source || 'internal')}</code></li>`).join('')}</ul></div>

<div class="card"><h2>אבטחה / גרסאות</h2>
<ul>${Object.entries(report.security || {}).map(([k, v]) => `<li>${h(k)}: ${h(typeof v === 'object' ? JSON.stringify(v) : v)}</li>`).join('')}</ul></div>

<div class="card"><h2>סיכום מנהל</h2>
<ul>
<li>מצב: ${h(report.scores.projectState)}</li>
<li>התקדמות: ${h(report.scores.progressPct)}%</li>
<li>מה השתנה מאתמול: ${h(report.diffFromYesterday.summary)}</li>
<li>בעיה חשובה: ${h(report.scores.topProblem)}</li>
<li>משימה למחר: ${h(report.scores.topTaskTomorrow)}</li>
<li>מוכן לעלייה: ${report.scores.goLiveReady ? 'כן' : 'לא'} — ${h(report.scores.goLiveReason)}</li>
<li>Project Score: <strong>${h(report.scores.projectScore)}</strong> (${h(report.scores.explanation)})</li>
<li>Top 3 לשיפור ציון: ${(report.scores.top3ToImprove || []).map(h).join(' · ')}</li>
</ul></div>

<div class="card"><h2>אימייל</h2>
<p>סטטוס: <strong>${h(report.email.status)}</strong>
${report.email.error ? ` · שגיאה: ${h(report.email.error)}` : ''}
${report.email.previewOnly ? ' · נוצרה תצוגת אימייל בלבד (לא נשלח)' : ''}</p></div>

<p class="meta">מקורות: live=בדיקה חיה · cache=cache · missing=אין נתון חי · estimate=הערכה · internal=חישוב פנימי · not_configured=לא הוגדר · local_unverifiable=לא ניתן לאימות מקומית (לא תקלת אתר)</p>
</div></body></html>`;
}

function renderEmail(report) {
  return `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111">
  <h2 style="margin:0 0 8px">דוח יומי CO.CO — ${report.client.company}</h2>
  <p style="color:#64748b;font-size:13px">${report.meta.reportDate} · Project Score ${report.scores.projectScore} · Health ${report.healthScore ?? '—'}</p>
  <p><strong>סיכום:</strong> ${report.executiveSummary}</p>
  <p><strong>Preview:</strong> ${report.scores.goLiveReady ? 'מוכן לעלייה' : 'לא מוכן לעלייה'} — ${report.scores.goLiveReason}</p>
  <p><strong>משימה למחר:</strong> ${report.scores.topTaskTomorrow}</p>
  <p><a href="${report.client.reportHtmlUrl || '#'}">פתח דוח מלא</a> · <a href="${report.client.previewUrl}">פתח אתר</a></p>
  <p style="font-size:12px;color:#64748b">Read Only · לא הורץ Pipeline · אימייל: ${report.email.status}</p>
</div>`;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const reportDate = todayIL();
  const generatedAt = new Date().toISOString();

  const decision = readJson('public/coco-reports/dalia-c-official/stage-d-fix-decision.json') || {};
  const asst = readJson('public/coco-reports/dalia-c-official/stage-d-assistants-raw.json') || {};
  const dump = readJson('public/coco-reports/dalia-c-official/stage-d-pipeline-dump.json') || {};
  const research = readJson('public/coco-reports/dalia-c-official/stage-c-research-v1.json') || {};
  const infra = readJson('public/coco-reports/dalia-c-official/infra-verify-live.json') || {};
  const verifySplit = readJson('public/coco-reports/dalia-c-official/preview-images-split-verify.json') || {};

  const assets = countPreviewAssets();

  // Live probes (read-only)
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
  // SSL succeeded for same host → domain is reachable; Node resolve4 failure is local DNS client, not site outage
  const domainDnsStatus = dns.ok
    ? 'תקין'
    : (ssl.ok || dnsLocalUnverifiable)
      ? 'לא ניתן לאימות מקומית'
      : 'שגיאה';

  const healthChecks = [
    healthRow('OpenAI', openaiKnown?.ok ? 'תקין' : (openaiQuotaBlocked || openaiSecretExists ? 'אזהרה — חיבור קיים, quota חסום' : 'אזהרה'), {
      live: false,
      checkPerformed: 'קריאת infra-verify-live.json (אימות קודם) — לא בוצע chat/images בריצה זו',
      checkType: 'cache / אימות קודם שמור',
      error: openaiKnown?.error || null,
      why: openaiSecretExists
        ? 'Secret קיים (MARKETING_OPENAI_API_KEY / OPENAI_API_KEY). החיבור מזוהה. Chat probe קודם החזיר quota/billing. לא מדובר במפתח חסר. לא בוצעה קריאת Images בתשלום בריצה זו.'
        : 'אין אישור Secrets בקובץ האימות',
      issueKind: openaiQuotaBlocked ? 'known_quota' : (openaiSecretExists ? 'known_quota' : 'check_not_implemented'),
      blocksSite: false,
      actionRequiredFromUser: openaiQuotaBlocked ? 'כן — לתקן billing/quota ב-OpenAI (לא Secrets)' : 'לא',
      impact: 'חוסם תמונות / AI chat — לא חוסם Preview HTML',
      recommendation: 'לתקן quota/billing; תמונות רק דרך CocoImageStage אחרי אישור',
      sourceType: 'cache',
      checkedAt: infra?.at || generatedAt,
    }),
    healthRow('Supabase', 'לא הוגדר', {
      checkPerformed: 'לא בוצע ping DB',
      why: 'בדיקת חיבור DB עדיין לא ממומשת בדוח היומי',
      issueKind: 'check_not_implemented',
      blocksSite: false,
      actionRequiredFromUser: 'לא',
      recommendation: 'להוסיף ping DB ב-Edge בשלב מאוחר',
      impact: 'דוחות/CRM',
      sourceType: 'not_configured',
    }),
    healthRow('Edge Functions', 'אזהרה', {
      checkPerformed: 'לא בוצעה בדיקה חיה בריצה זו',
      why: 'הבדיקה עדיין לא ממומשת בדוגמה המקומית',
      issueKind: 'check_not_implemented',
      blocksSite: false,
      actionRequiredFromUser: 'לא',
      recommendation: 'probe status מ-cron אחרי אישור תשתית',
      impact: 'AI/Google sync',
      sourceType: 'missing',
    }),
    healthRow('GitHub', githubApi.ok ? 'תקין' : 'שגיאה', {
      live: true,
      checkPerformed: `GET api.github.com/repos/orin1607-ctrl/future-craft-core → HTTP ${githubApi.status || 0}`,
      error: githubApi.error,
      why: githubApi.ok ? 'הריפו נגיש בקריאה חיה' : 'כשל בקריאת GitHub API',
      issueKind: githubApi.ok ? 'real' : 'real',
      blocksSite: false,
      actionRequiredFromUser: 'לא',
      impact: 'קוד/Deploy Staging',
      recommendation: githubApi.ok ? '—' : 'לבדוק API/rate limit',
      sourceType: githubApi.ok ? 'live' : 'missing',
    }),
    healthRow('GitHub Pages', pagesHome.ok ? 'תקין' : 'שגיאה', {
      live: true,
      checkPerformed: `GET ${PAGES_BASE}/ → HTTP ${pagesHome.status || 0}`,
      error: pagesHome.error,
      why: pagesHome.ok ? 'Staging Pages מגיב' : 'Pages לא מגיב',
      issueKind: 'real',
      blocksSite: false,
      actionRequiredFromUser: 'לא',
      impact: 'Staging בלבד',
      recommendation: '—',
      sourceType: pagesHome.ok ? 'live' : 'missing',
    }),
    healthRow('Google Search Console', 'לא הוגדר', {
      checkPerformed: 'לא בוצע sync/probe חי בריצה זו',
      why: 'אין נתון חי בדוח — לא סומן כמחובר',
      issueKind: 'check_not_implemented',
      blocksSite: false,
      actionRequiredFromUser: 'לא כרגע (sync מאושר בנפרד)',
      impact: 'מיקומי KW',
      recommendation: 'sync מאושר — בלי re-login אוטומטי',
      sourceType: 'not_configured',
    }),
    healthRow('Google Analytics 4', 'לא הוגדר', {
      checkPerformed: 'לא בוצע probe חי',
      why: 'אין נתון חי בדוח',
      issueKind: 'check_not_implemented',
      blocksSite: false,
      actionRequiredFromUser: 'לא כרגע',
      impact: 'תנועה/המרות',
      recommendation: 'אימות חי בנפרד',
      sourceType: 'not_configured',
    }),
    healthRow('Google Business Profile', 'אזהרה', {
      checkPerformed: 'קריאת infra-verify קודם (pending API)',
      checkType: 'cache',
      why: 'ידוע מאימות קודם: ממתין לאישור Google API — לא בדיקה חיה היום',
      issueKind: 'check_not_implemented',
      blocksSite: false,
      actionRequiredFromUser: 'כן — אישור Google API אם רוצים Local SEO חי',
      impact: 'Local SEO',
      recommendation: 'אישור Google API',
      sourceType: 'cache',
    }),
    healthRow('Google Ads', 'לא הוגדר', {
      checkPerformed: 'לא רלוונטי למסלול',
      why: 'Ads דולג מהמסלול — לא חלק מהתוכנית',
      issueKind: 'not_in_scope',
      blocksSite: false,
      actionRequiredFromUser: 'לא',
      impact: 'מסלול Ads לא פעיל',
      sourceType: 'not_configured',
    }),
    healthRow('Google Tag Manager', 'אזהרה', {
      checkPerformed: 'לא בוצע probe חי בריצה זו; ידוע probe קודם',
      checkType: 'cache',
      why: 'אין אימות חי היום — לא מספיק ל«תקין»',
      issueKind: 'check_not_implemented',
      blocksSite: false,
      actionRequiredFromUser: 'לא',
      impact: 'תגיות',
      recommendation: 'probe חי ב-cron אחרי אישור',
      sourceType: 'cache',
    }),
    healthRow('Gmail', 'לא הוגדר', {
      checkPerformed: 'לא בוצעה בדיקה',
      why: 'בדיקה לא ממומשת',
      issueKind: 'check_not_implemented',
      blocksSite: false,
      actionRequiredFromUser: 'לא',
      impact: 'מייל נכנס',
      sourceType: 'not_configured',
    }),
    healthRow('Google Drive', 'לא הוגדר', {
      checkPerformed: 'לא בוצעה בדיקה',
      why: 'בדיקה לא ממומשת',
      issueKind: 'check_not_implemented',
      blocksSite: false,
      actionRequiredFromUser: 'לא',
      sourceType: 'not_configured',
    }),
    healthRow('Google Sheets', 'לא הוגדר', {
      checkPerformed: 'לא בוצעה בדיקה',
      why: 'בדיקה לא ממומשת',
      issueKind: 'check_not_implemented',
      blocksSite: false,
      actionRequiredFromUser: 'לא',
      sourceType: 'not_configured',
    }),
    healthRow('Storage', 'לא הוגדר', {
      checkPerformed: 'לא בוצע list bucket',
      why: 'בדיקה לא ממומשת',
      issueKind: 'check_not_implemented',
      blocksSite: false,
      actionRequiredFromUser: 'לא',
      recommendation: 'list bucket read-only בשלב מאוחר',
      sourceType: 'not_configured',
    }),
    healthRow('Resend', 'אזהרה', {
      checkPerformed: 'לא נשלח מייל; נוצרה תצוגת dry_run בלבד',
      why: 'שליחה אמיתית חסומה במכוון עד אישור',
      issueKind: 'not_in_scope',
      blocksSite: false,
      actionRequiredFromUser: 'לא — להשאיר dry_run',
      impact: 'דוח יומי באימייל',
      recommendation: 'dry_run עד אישור שליחה',
      sourceType: 'missing',
    }),
    healthRow('CRM', 'לא הוגדר', {
      checkPerformed: 'לא בוצעה בדיקה',
      why: 'בדיקה לא ממומשת',
      issueKind: 'check_not_implemented',
      blocksSite: false,
      actionRequiredFromUser: 'לא',
      sourceType: 'not_configured',
    }),
    healthRow('WhatsApp', 'לא הוגדר', {
      checkPerformed: 'לא בוצעה בדיקה',
      why: 'בדיקה לא ממומשת',
      issueKind: 'check_not_implemented',
      blocksSite: false,
      actionRequiredFromUser: 'לא',
      sourceType: 'not_configured',
    }),
    healthRow('Domain', domainDnsStatus, {
      live: dns.ok,
      checkPerformed: `dns.promises.resolve4('dalia-c.com') + הקשר SSL ל-dalia-c.com:443`,
      error: dns.ok ? null : String(dns.error || 'resolve failed'),
      why: dns.ok
        ? 'רזולוציית A הצליחה'
        : (ssl.ok
          ? 'Node resolve4 נכשל בסביבה המקומית (ECONNREFUSED), אך TLS ל-dalia-c.com הצליח — זו בעיית סביבת בדיקה, לא תקלה באתר'
          : 'לא ניתן לאמת מקומית'),
      issueKind: dns.ok ? 'real' : 'local_env',
      blocksSite: false,
      actionRequiredFromUser: 'לא — אין שינוי DNS',
      impact: 'אתר חי (לא Staging Preview)',
      recommendation: dns.ok ? '—' : 'לא ניתן לאימות מקומית — לא לשנות DNS',
      sourceType: dns.ok ? 'live' : 'local_unverifiable',
    }),
    healthRow('DNS', domainDnsStatus, {
      live: dns.ok,
      checkPerformed: `dns.promises.resolve4('dalia-c.com')`,
      error: dns.ok ? null : String(dns.error || 'resolve failed'),
      why: dns.ok
        ? 'רשומות A התקבלו'
        : 'queryA ECONNREFUSED — כשל ב-DNS client המקומי של Node, לא שינוי/תקלה מוכחת ב-DNS של הדומיין',
      issueKind: dns.ok ? 'real' : 'local_env',
      blocksSite: false,
      actionRequiredFromUser: 'לא — אין שינוי DNS',
      impact: 'רזולוציה',
      recommendation: 'לא ניתן לאימות מקומית — אין לגעת ב-DNS',
      sourceType: dns.ok ? 'live' : 'local_unverifiable',
    }),
    healthRow('SSL', ssl.ok ? 'תקין' : 'שגיאה', {
      live: true,
      checkPerformed: `TLS connect dalia-c.com:443 (קריאה בלבד)`,
      error: ssl.error,
      why: ssl.ok ? `תעודה תקינה · validTo=${ssl.validTo}` : 'כשל TLS',
      issueKind: 'real',
      blocksSite: !ssl.ok,
      actionRequiredFromUser: ssl.ok ? 'לא' : 'כן — לבדוק תעודה (בלי שינוי אוטומטי)',
      impact: 'אבטחה',
      recommendation: ssl.ok ? `validTo=${ssl.validTo}` : 'לבדוק תעודה ידנית',
      sourceType: ssl.ok ? 'live' : 'missing',
    }),
  ];

  // Never mark תקין without live
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
  // Formula: only תקין=100 and אזהרה=40; שגיאה / לא הוגדר / לא ניתן לאימות = 0
  const healthScoreFormula =
    'round((תקין×100 + אזהרה×40 + שגיאה×0 + לא_הוגדר×0 + לא_ניתן_לאימות×0) / total)';
  const healthScore = healthSummary.total
    ? Math.round(((healthSummary.ok * 100) + (healthSummary.warn * 40)) / healthSummary.total)
    : null;

  const consultants = (asst.consultants || []).map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    decision: c.decisionReason || c.recommended || '',
    approved: (c.approvedItems || []).length,
    rejected: (c.rejectedItems || []).length,
  }));
  const chief = consultants.find((c) => c.id === 'b10') || {};

  const scores = {
    ...scoreProject({ ...decision, gates: { ...decision.gates, sitePreviewReady: pagesPreview.ok } }, healthSummary),
    projectState: 'Preview מוכן — תמונות ממתינות (quota)',
    topProblem: 'OpenAI Images quota / תמונות לא הושלמו',
    topTaskTomorrow: 'לאשר תיקון quota ואז CocoImageStage בלבד (בלי Pipeline מלא)',
  };

  const report = {
    meta: {
      version: '1.0.0-daily-progress',
      generatedAt,
      reportDate,
      timezone: 'Asia/Jerusalem',
      readOnly: true,
      pipelineRan: false,
      imagesGenerated: false,
      secretsChanged: false,
      clientSlug: CLIENT,
    },
    client: {
      clientId: CLIENT,
      company: 'דליה פתרונות תפעול ותחזוקה לרכב',
      contact: 'יוני אטיאס',
      domain: 'dalia-c.com',
      previewUrl: PREVIEW_URL,
      reportHtmlUrl: `${PAGES_BASE}/coco-reports/${CLIENT}/daily/${reportDate}.html`,
    },
    stages: buildStages(decision, asst, dump),
    executiveSummary:
      'האתר ב-Preview מוכן דרך c3+c13. Quality Gate עבר. תמונות חסומות ב-quota. חיבורי Google לא אומתו חי. המערכת ממשיכה בלי לעצור את ה-Preview.',
    assistantsSummary: {
      total: 50,
      completed: asst.quality?.completedQuality ?? 29,
      inProgress: asst.quality?.inProgress ?? 17,
      skipped: asst.quality?.skippedAds ?? 4,
      realAnalysis: asst.quality?.realAnalysisCount ?? 46,
      topRecommendations: [
        'להשלים אימות Google חי לפני סימון Local SEO כהושלם',
        'לא להריץ Ads — דולג מהמסלול',
        'תמונות רק דרך CocoImageStage אחרי quota',
      ],
    },
    consultantsSummary: { items: consultants },
    chiefRecommendation: {
      status: chief.status || decision.chief?.status,
      reason: chief.decision || decision.chief?.decisionReason || decision.qualityMetrics?.chiefReason,
      score: chief.score ?? decision.chief?.score,
    },
    seoIntelligence: buildSeo(research),
    competitors: buildCompetitors(research),
    healthChecks,
    healthScore,
    healthScoreFormula,
    healthScoreNote:
      'הציון נמוך בעיקר כי בדיקות רבות עדיין לא הוגדרו או לא ממומשות — לא בגלל קריסת האתר.',
    healthSummary,
    businessMetrics: {
      note: 'אין נתון חי ללידים/המרות בריצה זו',
      metrics: {
        leads: { value: 'אין נתון חי', source: 'missing' },
        inquiries: { value: 'אין נתון חי', source: 'missing' },
        calls: { value: 'אין נתון חי', source: 'missing' },
        forms: { value: 'אין נתון חי', source: 'missing' },
        whatsapp: { value: 'אין נתון חי', source: 'missing' },
        conversions: { value: 'אין נתון חי', source: 'missing' },
        conversionRate: { value: 'אין נתון חי', source: 'missing' },
        trafficSources: { value: 'אין נתון חי', source: 'missing' },
      },
    },
    sitePerformance: {
      note: 'CWV/Lighthouse/PageSpeed — אין נתון חי; ספירת קבצי Preview = חישוב פנימי',
      metrics: {
        cwv: { value: 'אין נתון חי', source: 'missing', delta: 'אין נתון חי' },
        lighthouse: { value: 'אין נתון חי', source: 'missing', delta: 'אין נתון חי' },
        pagespeed: { value: 'אין נתון חי', source: 'missing', delta: 'אין נתון חי' },
        loadTime: { value: 'אין נתון חי', source: 'missing', delta: 'אין נתון חי' },
        siteBytes: { value: assets.bytes, source: 'internal', delta: 'אין דוח אתמול' },
        images: { value: assets.images, source: 'internal', delta: 'אין דוח אתמול' },
        jsFiles: { value: assets.js, source: 'internal', delta: 'אין דוח אתמול' },
        cssFiles: { value: assets.css, source: 'internal', delta: 'אין דוח אתמול' },
        previewHttp: { value: pagesPreview.ok ? `HTTP ${pagesPreview.status}` : 'שגיאה', source: 'live', delta: '—' },
      },
    },
    security: {
      ssl: ssl.ok ? { status: 'תקין', validTo: ssl.validTo, source: 'live' } : { status: 'שגיאה', error: ssl.error, source: 'live' },
      dns: dns.ok
        ? { status: 'תקין', addrs: dns.addrs, source: 'live' }
        : {
            status: 'לא ניתן לאימות מקומית',
            error: dns.error,
            note: 'Node resolve4 ECONNREFUSED — סביבה מקומית; SSL ל-dalia-c.com הצליח',
            source: 'local_unverifiable',
          },
      lastBackup: { value: 'אין נתון חי', source: 'missing' },
      lastCommit: { value: verifySplit?.result?.orchestratorVersion ? 'ראה Git history מקומי' : 'אין נתון חי בדוח', source: 'internal' },
      lastDeploy: { value: pagesHome.ok ? 'GitHub Pages מגיב' : 'אין נתון חי', source: pagesHome.ok ? 'live' : 'missing' },
      siteVersion: { value: 'client-previews/dalia-c-official', source: 'internal' },
      cocoVersion: { value: COCO_VERSION, source: 'internal' },
    },
    diffFromYesterday: {
      summary: 'אין דוח אתמול שמור — זו ריצת בסיס ראשונה',
      completedTasks: [],
      newTasks: ['הפעלת מנגנון דוח יומי'],
      issuesFound: ['OpenAI quota', 'Google לא מאומת חי'],
      issuesResolved: [],
      blockers: ['imagesBlockedQuota'],
    },
    scores,
    email: {
      status: 'dry_run',
      error: null,
      id: null,
      previewOnly: true,
      note: 'לא נשלח אימייל — נוצרה תצוגה בלבד לפני Commit',
    },
    sourcesLegend: {
      live: 'בדיקה חיה',
      cache: 'cache/ידוע — לא מספיק ל«תקין»',
      estimate: 'הערכה',
      internal: 'חישוב פנימי',
      missing: 'אין נתון חי',
      not_configured: 'לא הוגדר',
      local_unverifiable: 'לא ניתן לאימות בסביבה המקומית — לא תקלת אתר',
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
    },
  };

  const html = renderHtml(report);
  const emailHtml = renderEmail(report);
  const jsonPath = join(OUT_DIR, `${reportDate}.json`);
  const htmlPath = join(OUT_DIR, `${reportDate}.html`);
  const emailPath = join(OUT_DIR, `${reportDate}-email-preview.html`);
  const latestJson = join(OUT_DIR, 'latest.json');
  const latestHtml = join(OUT_DIR, 'latest.html');
  const indexPath = join(OUT_DIR, 'index.json');

  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  writeFileSync(htmlPath, html, 'utf8');
  writeFileSync(emailPath, `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>Email Preview</title></head><body style="background:#f4f7fb;padding:24px">${emailHtml}</body></html>`, 'utf8');
  writeFileSync(latestJson, JSON.stringify(report, null, 2), 'utf8');
  writeFileSync(latestHtml, html, 'utf8');
  writeFileSync(indexPath, JSON.stringify({
    clientSlug: CLIENT,
    reports: [{ date: reportDate, json: `${reportDate}.json`, html: `${reportDate}.html`, emailPreview: `${reportDate}-email-preview.html`, projectScore: scores.projectScore, healthScore }],
    updatedAt: generatedAt,
  }, null, 2), 'utf8');

  console.log(JSON.stringify({
    ok: true,
    reportDate,
    paths: { jsonPath, htmlPath, emailPath, latestHtml },
    scores: { project: scores.projectScore, health: healthScore, progress: scores.progressPct },
    healthSummary,
    email: report.email,
    readOnly: report.readOnlyGuarantees,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
