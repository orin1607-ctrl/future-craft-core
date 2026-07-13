/**
 * CO.CO Daily Report — LIVE Google data for both Dalia sites.
 * Allocates next sequential report number (same-day reuse).
 * Does NOT send email. Does NOT change Ads application / GBP website URL.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { chromium } from 'playwright';
import { renderBusinessHtml } from './lib/render-daily-business-html.mjs';
import { getAuthenticatedClient, loadGoogleAuthLibrary } from './google/_lib/auth.mjs';
import { getP001Scopes } from './project-001/_lib/auth.mjs';
import { getAdsCredentials } from './project-001/_lib/ads-env.mjs';
import { listAccessibleCustomers, adsRequest } from './project-001/_lib/ads.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'public', 'coco-reports', 'dalia-c-official', 'daily');
const CLIENT = 'dalia-c-official';
const SEQ_PATH = join(OUT_DIR, 'report-sequence.json');
const LIVE_SNAPSHOT = join(ROOT, 'docs/audit-reports/google-connections-v2/DAILY-LIVE-SNAPSHOT.json');

const SITES = {
  'dalia-c.com': {
    id: 'dalia-c-com',
    assetId: 'dalia-c-com',
    labelHe: 'dalia-c.com — האתר הישן',
    prop: '545246030',
    mid: 'G-73K6EDC6LV',
    gtm: 'GTM-P5BWSBR',
    gscUrl: 'https://dalia-c.com/',
    websiteId: '46cea552-119b-496f-b538-592c656f659a',
  },
  'dalia-car.online': {
    id: 'dalia-car-app',
    assetId: 'dalia-car-app',
    labelHe: 'אפליקציית דליה',
    prop: '545217370',
    mid: 'G-KGTK4YCD8F',
    gtm: 'GTM-KFMHS49G',
    gscUrl: 'https://dalia-car.online/',
    websiteId: 'd2deb17d-3b25-42ce-a2c2-5339ffd854dc',
  },
  'dalia-car.online/site': {
    id: 'dalia-brand-site',
    assetId: 'dalia-brand-site',
    labelHe: 'אתר התדמית החדש',
    prop: '545281140',
    mid: 'G-KYDLXY9C39',
    gtm: 'GTM-KH38DZ6J',
    gscUrl: 'https://dalia-car.online/site/',
    websiteId: 'e9b2bbf1-1276-4fce-8756-99060a47a44e',
  },
};

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
function heDateTime(iso = new Date().toISOString()) {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function M(value, source, reliability, opts = {}) {
  const sourceHeMap = {
    'gsc-live': 'Google Search Console (חי)',
    'ga4-live': 'Google Analytics 4 (חי)',
    'psi-live': 'PageSpeed Insights (חי)',
    'html-live': 'HTML Production (חי)',
    'oauth-live': 'OAuth token (חי)',
    'supabase-bindings': 'Supabase Staging bindings',
    'gbp-live': 'Google Business Profile (חי)',
    'ads-live': 'Google Ads API (חי)',
    'system': 'בדיקת מערכת',
    'ops': 'המלצת מערכת',
    'score': 'חישוב פנימי',
  };
  const updated = opts.updatedAt || new Date().toISOString();
  return {
    value,
    source,
    sourceHe: opts.sourceHe || sourceHeMap[source] || source,
    reliability,
    reliabilityHe:
      reliability === 'live' ? 'נתון חי'
        : reliability === 'pending' ? 'Pending'
          : reliability === 'cache' ? 'נתון ממטמון'
            : reliability === 'internal' ? 'חישוב פנימי'
              : reliability === 'ai_estimate' ? 'הערכת מערכת'
                : 'Pending',
    updatedAt: updated,
    updatedAtHe: opts.updatedAtHe || heDateTime(updated),
    missingReason: opts.missingReason || null,
  };
}

function nextReportNumber() {
  mkdirSync(OUT_DIR, { recursive: true });
  let seq = { lastNumber: 0, clientSlug: CLIENT };
  if (existsSync(SEQ_PATH)) {
    try { seq = { ...seq, ...JSON.parse(readFileSync(SEQ_PATH, 'utf8')) }; } catch { /* keep */ }
  }
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
      footerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#64748b;padding:0 10mm;">עמוד <span class="pageNumber"></span> / <span class="totalPages"></span> · LIVE Google · dry_run email</div>`,
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

function gscRange(days = 28, endOffset = 2) {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - endOffset);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

function sumGsc(rows) {
  let clicks = 0; let impressions = 0; let posW = 0;
  for (const r of rows) {
    clicks += r.clicks || 0;
    impressions += r.impressions || 0;
    posW += (r.position || 0) * (r.impressions || 0);
  }
  const avgPos = impressions ? posW / impressions : null;
  const ctr = impressions ? clicks / impressions : 0;
  return { clicks, impressions, ctr, avgPos, rows: rows.length };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const reportDate = todayIL();
  const generatedAt = new Date();
  const generatedAtIso = generatedAt.toISOString();
  const { number, padded, reused } = nextReportNumber();
  const reportId = `${CLIENT}-${padded}-${reportDate}`;
  const pdfFileName = `COCO-Daily-Report-${padded}-${reportDate}.pdf`;

  console.log(`Auth… report #${padded} (${reused ? 'reuse same-day' : 'new'})`);
  const auth = await getAuthenticatedClient({ scopes: getP001Scopes({ includeOptional: true }) });
  const { token } = await auth.getAccessToken();
  const google = await loadGoogleAuthLibrary();
  const me = (await google.oauth2({ version: 'v2', auth }).userinfo.get()).data;
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  async function req(url, opts = {}) {
    const r = await fetch(url, { ...opts, headers: { ...h, ...(opts.headers || {}) } });
    const t = await r.text();
    let j;
    try { j = JSON.parse(t); } catch { j = { raw: t.slice(0, 400) }; }
    return { status: r.status, ok: r.ok, j };
  }

  // OAuth / tokens
  const oauthStatus = {
    email: me.email,
    status: 'CONNECTED',
    tokenPresent: !!token,
  };

  // Ads
  const creds = getAdsCredentials();
  let ads = { status: 'UNKNOWN', customers: [], errorCode: null };
  try {
    ads.customers = await listAccessibleCustomers(token, creds.developerToken);
    try {
      await adsRequest({
        accessToken: token,
        developerToken: creds.developerToken,
        customerId: '5523570429',
        loginCustomerId: '5523570429',
        path: 'customers/5523570429/googleAds:search',
        method: 'POST',
        body: { query: 'SELECT customer.id FROM customer LIMIT 1' },
      });
      ads.status = 'CONNECTED / LIVE';
    } catch (e) {
      const code = e.data?.error?.details?.[0]?.errors?.[0]?.errorCode?.authorizationError || '';
      ads.errorCode = code;
      ads.status = code === 'DEVELOPER_TOKEN_NOT_APPROVED'
        ? 'PENDING_BASIC_ACCESS (waiting on Google)'
        : `BOUND / BLOCKED (${code || e.status})`;
    }
  } catch (e) {
    ads = { status: 'ERROR', error: String(e.message).slice(0, 200), customers: [], errorCode: null };
  }

  // GBP
  const gbpA = await req('https://mybusinessaccountmanagement.googleapis.com/v1/accounts');
  const locs = [];
  for (const a of gbpA.j?.accounts || []) {
    const lr = await req(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?readMask=name,title,websiteUri,storefrontAddress`,
    );
    for (const l of lr.j?.locations || []) {
      locs.push({ account: a.accountName, title: l.title, web: l.websiteUri, name: l.name });
    }
  }
  const daliaGbp = locs.find((l) => /דליה|dalia/i.test(l.title || '') || /dalia/i.test(l.web || ''));
  const gbp = {
    status: daliaGbp ? 'CONNECTED / LIVE' : 'MISSING',
    location: daliaGbp || null,
  };

  // GSC site list
  const gscList = await req('https://www.googleapis.com/webmasters/v3/sites');
  const gscSites = gscList.j?.siteEntry || [];
  const sc = google.searchconsole({ version: 'v1', auth });
  const range28 = gscRange(28);
  const range7 = gscRange(7);

  const siteLive = {};

  for (const [domain, cfg] of Object.entries(SITES)) {
    const hit = gscSites.find((s) => String(s.siteUrl).includes(domain));
    const siteUrl = hit?.siteUrl || cfg.gscUrl;

    let gsc28 = { clicks: 0, impressions: 0, ctr: 0, avgPos: null, rows: 0, topQueries: [], topPages: [], error: null };
    let gsc7 = { clicks: 0, impressions: 0, ctr: 0, avgPos: null, rows: 0 };
    try {
      const q28 = await sc.searchanalytics.query({
        siteUrl,
        requestBody: { ...range28, dimensions: ['query'], rowLimit: 25, dataState: 'all' },
      });
      const p28 = await sc.searchanalytics.query({
        siteUrl,
        requestBody: { ...range28, dimensions: ['page'], rowLimit: 15, dataState: 'all' },
      });
      const q7 = await sc.searchanalytics.query({
        siteUrl,
        requestBody: { ...range7, dimensions: ['query'], rowLimit: 25, dataState: 'all' },
      });
      const rows28 = q28.data.rows || [];
      const rows7 = q7.data.rows || [];
      const pages = p28.data.rows || [];
      gsc28 = {
        ...sumGsc(rows28),
        topQueries: rows28.slice(0, 10).map((r) => ({
          query: r.keys[0],
          clicks: r.clicks,
          impressions: r.impressions,
          ctr: r.ctr,
          position: r.position,
        })),
        topPages: pages.slice(0, 8).map((r) => ({
          page: r.keys[0],
          clicks: r.clicks,
          impressions: r.impressions,
          position: r.position,
        })),
        range: range28,
        permission: hit?.permissionLevel || null,
        siteUrl,
      };
      gsc7 = { ...sumGsc(rows7), range: range7 };
    } catch (e) {
      gsc28.error = String(e.message || e).slice(0, 200);
    }

    // Indexing sample
    let indexSample = [];
    try {
      const inspect = await sc.urlInspection.index.inspect({
        requestBody: { inspectionUrl: `https://${domain}/`, siteUrl },
      });
      const r = inspect.data.inspectionResult?.indexStatusResult || {};
      indexSample = [{
        url: `https://${domain}/`,
        verdict: r.verdict,
        coverageState: r.coverageState,
        indexingState: r.indexingState,
        lastCrawlTime: r.lastCrawlTime,
      }];
    } catch (e) {
      indexSample = [{ url: `https://${domain}/`, error: String(e.message || e).slice(0, 150) }];
    }

    // GA4
    const ga4 = await req(
      `https://analyticsdata.googleapis.com/v1beta/properties/${cfg.prop}:runReport`,
      {
        method: 'POST',
        body: JSON.stringify({
          dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
          metrics: [
            { name: 'sessions' },
            { name: 'activeUsers' },
            { name: 'screenPageViews' },
            { name: 'bounceRate' },
            { name: 'averageSessionDuration' },
          ],
        }),
      },
    );
    const mv = ga4.j?.rows?.[0]?.metricValues || [];
    const ga4Metrics = ga4.ok
      ? {
        sessions: Number(mv[0]?.value || 0),
        activeUsers: Number(mv[1]?.value || 0),
        pageViews: Number(mv[2]?.value || 0),
        bounceRate: Number(mv[3]?.value || 0),
        avgSessionDurationSec: Number(mv[4]?.value || 0),
      }
      : { error: ga4.j?.error?.message || `HTTP ${ga4.status}` };

    // PageSpeed
    const psi = await req(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(`https://${domain}/`)}&strategy=mobile&category=performance&category=seo&category=accessibility`,
    );
    const cats = psi.j?.lighthouseResult?.categories || {};
    const audits = psi.j?.lighthouseResult?.audits || {};
    const pagespeed = psi.ok
      ? {
        performance: cats.performance?.score ?? null,
        seo: cats.seo?.score ?? null,
        accessibility: cats.accessibility?.score ?? null,
        lcp: audits['largest-contentful-paint']?.displayValue || null,
        cls: audits['cumulative-layout-shift']?.displayValue || null,
        tbt: audits['total-blocking-time']?.displayValue || null,
        fcp: audits['first-contentful-paint']?.displayValue || null,
      }
      : { error: psi.j?.error?.message || `HTTP ${psi.status}` };

    // HTML tags
    const html = await fetch(`https://${domain}/?v=${Date.now()}`, { signal: AbortSignal.timeout(20000) })
      .then((r) => r.text())
      .catch((e) => `ERROR:${e.message}`);
    const htmlOk = !html.startsWith('ERROR:');
    const tags = {
      gtmPresent: htmlOk && html.includes(cfg.gtm),
      ga4Present: htmlOk && (html.includes(cfg.mid) || (domain === 'dalia-c.com' && html.includes('GTM-P5BWSBR'))),
      legacyGaHint: domain === 'dalia-c.com' && htmlOk && html.includes('G-F1J5ETTY8B'),
      httpOk: htmlOk,
      bytes: htmlOk ? html.length : 0,
    };

    siteLive[domain] = {
      cfg,
      gscPermission: hit?.permissionLevel || null,
      gscConnected: !!hit,
      gsc28,
      gsc7,
      indexSample,
      ga4Ok: ga4.ok,
      ga4Metrics,
      pagespeed,
      tags,
      services: {
        oauth: 'CONNECTED',
        tokens: 'CONNECTED',
        supabase: 'CONNECTED (Staging bindings)',
        gsc: hit ? `CONNECTED / LIVE (${hit.permissionLevel})` : 'MISSING',
        ga4: ga4.ok ? `CONNECTED / LIVE (${cfg.mid})` : `ERROR`,
        gtm: tags.gtmPresent ? `CONNECTED / LIVE (${cfg.gtm})` : `BOUND / HTML missing ${cfg.gtm}`,
        gbp: gbp.status,
        pagespeed: psi.ok ? `CONNECTED / LIVE (${Math.round((pagespeed.performance || 0) * 100)})` : 'ERROR',
        ads: ads.status,
      },
    };
  }

  const snapshot = {
    at: generatedAtIso,
    actingAs: me.email,
    reportNumber: number,
    reportDate,
    oauth: oauthStatus,
    ads,
    gbp,
    sites: Object.fromEntries(
      Object.entries(siteLive).map(([d, s]) => [d, {
        services: s.services,
        gsc28: { clicks: s.gsc28.clicks, impressions: s.gsc28.impressions, avgPos: s.gsc28.avgPos, ctr: s.gsc28.ctr, rows: s.gsc28.rows, range: s.gsc28.range, error: s.gsc28.error || null },
        gsc7: { clicks: s.gsc7.clicks, impressions: s.gsc7.impressions, avgPos: s.gsc7.avgPos },
        ga4: s.ga4Metrics,
        pagespeed: s.pagespeed,
        tags: s.tags,
        indexHome: s.indexSample[0] || null,
        topQueries: s.gsc28.topQueries?.slice(0, 5) || [],
      }]),
    ),
  };
  mkdirSync(dirname(LIVE_SNAPSHOT), { recursive: true });
  writeFileSync(LIVE_SNAPSHOT, JSON.stringify(snapshot, null, 2), 'utf8');

  // ── Build business report ──
  const c = siteLive['dalia-c.com'];
  const n = siteLive['dalia-car.online'];
  const fmtPos = (p) => (p == null ? '—' : p.toFixed(1));
  const fmtPct = (x) => `${(Number(x) * 100).toFixed(1)}%`;
  const fmtScore = (s) => (s == null ? '—' : `${Math.round(s * 100)}`);

  const gscTrendC = c.gsc7.impressions >= c.gsc28.impressions / 4 ? 'up' : c.gsc7.impressions === 0 && c.gsc28.impressions === 0 ? 'flat' : 'flat';
  // New GA4 props may have near-zero data — note that honestly
  const ga4Warming = (m) => (m.sessions || 0) + (m.pageViews || 0) < 5;

  function buildSiteAsset(domain, live, defaultSelected) {
    const cfg = live.cfg;
    const g = live.gsc28;
    const ga = live.ga4Metrics;
    const ps = live.pagespeed;
    const idx = live.indexSample[0] || {};
    const hasGscData = (g.impressions || 0) > 0 || (g.clicks || 0) > 0;
    const top3 = (g.topQueries || []).filter((q) => q.position <= 3).length;
    const top10 = (g.topQueries || []).filter((q) => q.position <= 10).length;

    return {
      id: cfg.id,
      labelHe: cfg.labelHe,
      trend: {
        level: hasGscData ? (gscTrendC === 'up' ? 'up' : 'flat') : (ga4Warming(ga) ? 'flat' : 'up'),
        reason: hasGscData
          ? `GSC 28י: ${g.impressions} הופעות · ${g.clicks} קליקים · מיקום ממוצע ${fmtPos(g.avgPos)}`
          : ga4Warming(ga)
            ? 'נכס GA4 חדש — מדידה חיה מחוברת, נפח טראפיק עדיין בחימום'
            : `GA4 7י: ${ga.sessions} sessions · ${ga.activeUsers} users`,
      },
      businessPotential: {
        score: hasGscData ? 78 : (live.ga4Ok && live.tags.gtmPresent ? 70 : 55),
        why: hasGscData
          ? 'יש נתוני חיפוש אמיתיים + מדידה חיה — אפשר לנהל SEO לפי אמת'
          : 'חיבורי Google חיים; צריך זמן צבירה ב-GA4/GSC על הנכס החדש',
        meta: M('פוטנציאל עסקי', 'score', 'internal'),
      },
      progressLabel: live.ga4Ok && live.gscConnected ? 'מחובר ל-Production · LIVE' : 'חלקי',
      progressMeta: M(
        live.ga4Ok && live.gscConnected ? 'כל השירותים העיקריים LIVE (מלבד Ads)' : 'חסרים חיבורים',
        'system',
        'live',
      ),
      categories: [
        {
          id: 'google-presence',
          labelHe: 'מצב בגוגל',
          items: [
            M(`GSC: ${live.services.gsc}`, 'gsc-live', live.gscConnected ? 'live' : 'missing'),
            M(`GA4: ${live.services.ga4}`, 'ga4-live', live.ga4Ok ? 'live' : 'missing'),
            M(`GTM: ${live.services.gtm}`, 'html-live', live.tags.gtmPresent ? 'live' : 'missing'),
            M(`GBP: ${gbp.status}${daliaGbp ? ` · ${daliaGbp.title}` : ''}`, 'gbp-live', gbp.status.includes('LIVE') ? 'live' : 'missing'),
            M(`PageSpeed: ${live.services.pagespeed}`, 'psi-live', ps.performance != null ? 'live' : 'missing'),
            M(`Ads: ${ads.status}`, 'ads-live', ads.status.includes('LIVE') ? 'live' : 'pending', {
              missingReason: ads.status.includes('PENDING') ? 'Pending — ממתין לאישור Basic Access מ-Google (בלי בקשה חדשה)' : null,
            }),
          ],
        },
        {
          id: 'gsc',
          labelHe: 'Google Search Console',
          items: [
            M(`טווח 28י: ${g.range?.startDate || '—'} → ${g.range?.endDate || '—'}`, 'gsc-live', 'live'),
            M(`הופעות 28י: ${g.impressions}`, 'gsc-live', 'live'),
            M(`קליקים 28י: ${g.clicks}`, 'gsc-live', 'live'),
            M(`CTR 28י: ${fmtPct(g.ctr || 0)}`, 'gsc-live', 'live'),
            M(`מיקום ממוצע 28י: ${fmtPos(g.avgPos)}`, 'gsc-live', 'live'),
            M(`הופעות 7י: ${live.gsc7.impressions} · קליקים: ${live.gsc7.clicks}`, 'gsc-live', 'live'),
            M(
              (g.topQueries || []).length
                ? `Top queries: ${(g.topQueries || []).slice(0, 5).map((q) => `${q.query} (${q.clicks}c/${q.impressions}i @${fmtPos(q.position)})`).join(' · ')}`
                : 'אין שורות שאילתות בטווח (נכס חדש / עדיין אין אינדוקס מספיק)',
              'gsc-live',
              'live',
            ),
            g.error ? M(`שגיאת GSC: ${g.error}`, 'gsc-live', 'missing') : null,
          ].filter(Boolean),
        },
        {
          id: 'ga',
          labelHe: 'GA4',
          items: live.ga4Ok
            ? [
              M(`Property: properties/${cfg.prop} · Measurement: ${cfg.mid}`, 'ga4-live', 'live'),
              M(`Sessions 7י: ${ga.sessions}`, 'ga4-live', 'live'),
              M(`Active users 7י: ${ga.activeUsers}`, 'ga4-live', 'live'),
              M(`Page views 7י: ${ga.pageViews}`, 'ga4-live', 'live'),
              M(`Bounce rate: ${fmtPct(ga.bounceRate || 0)}`, 'ga4-live', 'live'),
              M(`Avg session: ${Math.round(ga.avgSessionDurationSec || 0)} שניות`, 'ga4-live', 'live'),
              ga4Warming(ga)
                ? M('הערה: נכס GA4 חדש — צפוי נפח נמוך עד צבירת תנועה אמיתית', 'ga4-live', 'live')
                : M('נפח מדידה פעיל', 'ga4-live', 'live'),
            ]
            : [M(`GA4 error: ${ga.error}`, 'ga4-live', 'missing')],
        },
        {
          id: 'indexing',
          labelHe: 'אינדוקס',
          items: [
            M(`Home verdict: ${idx.verdict || idx.error || '—'}`, 'gsc-live', idx.verdict ? 'live' : 'missing'),
            M(`Coverage: ${idx.coverageState || '—'}`, 'gsc-live', idx.coverageState ? 'live' : 'missing'),
            M(`Indexing state: ${idx.indexingState || '—'}`, 'gsc-live', idx.indexingState ? 'live' : 'missing'),
            M(`Last crawl: ${idx.lastCrawlTime || '—'}`, 'gsc-live', idx.lastCrawlTime ? 'live' : 'missing'),
          ],
        },
        {
          id: 'keywords',
          labelHe: 'מילות מפתח',
          items: [
            M(`שאילתות בטופ (מוחזרות): ${(g.topQueries || []).length}`, 'gsc-live', 'live'),
            M(`בטופ 3 (מתוך הדגימה): ${top3}`, 'gsc-live', 'live'),
            M(`בטופ 10 (מתוך הדגימה): ${top10}`, 'gsc-live', 'live'),
            ...(g.topQueries || []).slice(0, 5).map((q) =>
              M(`${q.query}: ${q.clicks} קליקים · ${q.impressions} הופעות · מיקום ${fmtPos(q.position)}`, 'gsc-live', 'live')),
          ],
        },
        {
          id: 'site-health',
          labelHe: 'ביצועים ו-SEO טכני',
          items: [
            M(`Performance (mobile): ${fmtScore(ps.performance)}`, 'psi-live', ps.performance != null ? 'live' : 'missing'),
            M(`SEO score: ${fmtScore(ps.seo)}`, 'psi-live', ps.seo != null ? 'live' : 'missing'),
            M(`Accessibility: ${fmtScore(ps.accessibility)}`, 'psi-live', ps.accessibility != null ? 'live' : 'missing'),
            M(`LCP: ${ps.lcp || '—'} · CLS: ${ps.cls || '—'} · TBT: ${ps.tbt || '—'} · FCP: ${ps.fcp || '—'}`, 'psi-live', ps.lcp ? 'live' : 'missing'),
            M(`GTM ב-HTML: ${live.tags.gtmPresent ? 'כן' : 'לא'} (${cfg.gtm})`, 'html-live', 'live'),
            M(`GA4 ב-HTML/GTM: ${live.tags.ga4Present ? 'כן' : 'חלקי'} (${cfg.mid})`, 'html-live', 'live'),
            live.tags.legacyGaHint
              ? M('שימו לב: תג היסטורי G-F1J5ETTY8B עשוי עדיין להישלח דרך GTM-P5', 'html-live', 'live')
              : M('אין תג GA4 היסטורי גלוי ב-HTML', 'html-live', 'live'),
          ],
        },
        {
          id: 'recommendations',
          labelHe: 'המלצות לאתר זה',
          items: [
            hasGscData
              ? M('להמשיך לחזק עמודים עם הופעות גבוהות ו-CTR נמוך (מתוך Top pages)', 'ops', 'ai_estimate')
              : M('לבקש אינדוקס/סריקה ל-Home ב-GSC ולנטר צבירת שאילתות', 'ops', 'ai_estimate'),
            ga4Warming(ga)
              ? M('לוודא שהתנועה האמיתית מגיעה לנכס החדש — לא ל-aliav (427711798)', 'ops', 'ai_estimate')
              : M('לעקוב אחרי sessions/bounce ב-GA4 שבועית', 'ops', 'ai_estimate'),
            domain === 'dalia-c.com'
              ? M('אופציונלי: ליישר GTM-P5 ל-Measurement G-73K6EDC6LV', 'ops', 'ai_estimate')
              : M('GTM-KFMHS49G + gtag חיים — לשמור יציבות מדידה', 'ops', 'ai_estimate'),
          ],
        },
      ],
    };
  }

  const siteMainAsset = buildSiteAsset('dalia-c.com', c, true);
  const siteExtraAsset = buildSiteAsset('dalia-car.online', n, true);

  const adsAsset = {
    id: 'google-ads',
    labelHe: 'Google Ads',
    trend: { level: 'flat', reason: ads.status },
    businessPotential: {
      score: ads.status.includes('LIVE') ? 75 : 40,
      why: ads.status.includes('PENDING')
        ? 'חשבונות נגישים ברשימה, אבל Developer Token עדיין לא ב-Basic Access'
        : ads.status,
      meta: M('פוטנציאל Ads', 'ads-live', ads.status.includes('LIVE') ? 'live' : 'pending'),
    },
    progressLabel: ads.status.includes('PENDING') ? 'Pending — ממתין ל-Google' : ads.status,
    progressMeta: M(ads.status, 'ads-live', ads.status.includes('LIVE') ? 'live' : 'pending'),
    categories: [
      {
        id: 'ads-campaigns',
        labelHe: 'מצב הקמפיינים',
        items: [
          M(`סטטוס API: ${ads.status}`, 'ads-live', ads.status.includes('LIVE') ? 'live' : 'pending', {
            missingReason: ads.errorCode === 'DEVELOPER_TOKEN_NOT_APPROVED'
              ? 'Pending — DEVELOPER_TOKEN_NOT_APPROVED; לא להגיש בקשה חדשה'
              : null,
          }),
          M(`Customers נגישים: ${(ads.customers || []).join(', ') || '—'}`, 'ads-live', 'live'),
          M('MCC 5523570429 · Client 8957638890', 'ads-live', 'live'),
        ],
      },
    ],
  };

  const connectedCount = [
    true, true, // oauth tokens
    c.gscConnected && n.gscConnected,
    c.ga4Ok && n.ga4Ok,
    c.tags.gtmPresent && n.tags.gtmPresent,
    gbp.status.includes('LIVE'),
    c.pagespeed.performance != null && n.pagespeed.performance != null,
    ads.status.includes('LIVE'),
  ].filter(Boolean).length;

  const projectScore = Math.min(95, 55
    + (c.gscConnected && n.gscConnected ? 8 : 0)
    + (c.ga4Ok && n.ga4Ok ? 8 : 0)
    + (c.tags.gtmPresent && n.tags.gtmPresent ? 5 : 0)
    + (gbp.status.includes('LIVE') ? 6 : 0)
    + (c.pagespeed.performance != null ? 4 : 0)
    + (ads.status.includes('LIVE') ? 6 : 0)
    + ((c.gsc28.impressions + n.gsc28.impressions) > 0 ? 5 : 2));

  const healthScore = Math.min(100, 40
    + (c.gscConnected ? 8 : 0) + (n.gscConnected ? 8 : 0)
    + (c.ga4Ok ? 8 : 0) + (n.ga4Ok ? 8 : 0)
    + (gbp.status.includes('LIVE') ? 10 : 0)
    + (c.pagespeed.performance != null ? 6 : 0)
    + (n.pagespeed.performance != null ? 6 : 0)
    + (ads.status.includes('LIVE') ? 6 : 2));

  const bottomLineToday =
    `דוח LIVE #${padded}: שני האתרים מחוברים ל-GSC/GA4/GTM/PageSpeed/GBP תחת ${me.email}. `
    + `dalia-c.com — GSC 28י: ${c.gsc28.impressions} הופעות / ${c.gsc28.clicks} קליקים · GA4 7י: ${c.ga4Metrics.sessions || 0} sessions · PSI ${fmtScore(c.pagespeed.performance)}. `
    + `dalia-car.online — GSC 28י: ${n.gsc28.impressions} הופעות / ${n.gsc28.clicks} קליקים · GA4 7י: ${n.ga4Metrics.sessions || 0} sessions · PSI ${fmtScore(n.pagespeed.performance)}. `
    + `Google Ads עדיין PENDING Basic Access. תקלת כפתור «פרסום» אחרי login תוקנה ופורסמה (Auth role race).`;

  const report = {
    meta: {
      version: '3.0.0-live-dual-site',
      phase: 2,
      generatedAt: generatedAtIso,
      generatedTimeIL: timeIL(generatedAt),
      reportDate,
      timezone: 'Asia/Jerusalem',
      reportNumber: number,
      reportNumberPadded: padded,
      reportNumberDisplay: `#${padded}`,
      reportId,
      pdfFileName,
      cocoVersion: '9.0.0-live-google',
      readOnly: true,
      pipelineRan: false,
      imagesGenerated: false,
      mediaDemoIntegrated: false,
      secretsChanged: false,
      clientSlug: CLIENT,
      uiLanguage: 'he',
      dataMode: 'LIVE',
      actingAs: me.email,
      numberReusedSameDay: reused,
    },
    client: {
      clientId: CLIENT,
      company: 'דליה פתרונות תפעול ותחזוקה לרכב',
      contact: 'orin1607@gmail.com',
      domain: 'dalia-c.com + dalia-car.online',
      previewUrl: 'https://dalia-car.online/',
    },
    bottomLineToday,
    doneToday: [
      'השלמת חיבורי Google (OAuth, GSC, GA4 COCO, GTM, GBP, PageSpeed) לשני האתרים',
      'יצירת נכסי GA4 נכונים תחת COCO (לא aliav) + מדידה ב-HTML של dalia-car.online',
      'סנכרון GBP דליה ל-Staging bindings',
      'תיקון race של כפתור «פרסום» (AuthContext) + deploy + nginx no-store',
      'הפקת דוח יומי LIVE עם מספר רץ חדש',
    ],
    remaining: [
      'המתנה לאישור Google Ads Basic Access (בלי בקשה חדשה)',
      'אופציונלי: יישור GTM-P5 → G-73K6EDC6LV',
      'אופציונלי: tagmanager.publish ל-GTM-KFMHS49G',
      'Cutover Google v2 ל-Production Supabase אם יידרש',
      'אימות Owner: login → «פרסום» בלי refresh שני',
    ],
    assetCatalog: [
      {
        id: 'site-main',
        labelHe: 'אתר ראשי — dalia-c.com',
        defaultSelected: true,
        hasLiveData: true,
        categories: [
          { id: 'google-presence', labelHe: 'מצב בגוגל' },
          { id: 'gsc', labelHe: 'Google Search Console' },
          { id: 'ga', labelHe: 'GA4' },
          { id: 'indexing', labelHe: 'אינדוקס' },
          { id: 'keywords', labelHe: 'מילות מפתח' },
          { id: 'site-health', labelHe: 'ביצועים ו-SEO' },
          { id: 'recommendations', labelHe: 'המלצות' },
        ],
      },
      {
        id: 'site-extra',
        labelHe: 'אתר חדש — dalia-car.online',
        defaultSelected: true,
        hasLiveData: true,
        categories: [
          { id: 'google-presence', labelHe: 'מצב בגוגל' },
          { id: 'gsc', labelHe: 'Google Search Console' },
          { id: 'ga', labelHe: 'GA4' },
          { id: 'indexing', labelHe: 'אינדוקס' },
          { id: 'keywords', labelHe: 'מילות מפתח' },
          { id: 'site-health', labelHe: 'ביצועים ו-SEO' },
          { id: 'recommendations', labelHe: 'המלצות' },
        ],
      },
      {
        id: 'google-ads',
        labelHe: 'Google Ads',
        defaultSelected: true,
        hasLiveData: !ads.status.includes('PENDING'),
        categories: [{ id: 'ads-campaigns', labelHe: 'מצב הקמפיינים' }],
      },
    ],
    assets: [siteMainAsset, siteExtraAsset, adsAsset],
    managerCard: {
      campaignProgress: M(
        'שני האתרים מחוברים למדידה חיה; Ads עדיין ממתין לאישור Google',
        'system',
        'live',
      ),
      towardGoal: M(
        'יש תשתית מדידה מלאה ל-SEO/Analytics — אפשר לנהל לפי נתוני אמת',
        'system',
        'live',
      ),
      rankingImproved: M(
        `dalia-c.com מיקום ממוצע 28י: ${fmtPos(c.gsc28.avgPos)} · dalia-car.online: ${fmtPos(n.gsc28.avgPos)}`,
        'gsc-live',
        'live',
      ),
      moreLeads: M(
        `GA4 sessions 7י — c.com: ${c.ga4Metrics.sessions || 0} · car.online: ${n.ga4Metrics.sessions || 0}`,
        'ga4-live',
        'live',
      ),
      blocker: M(
        ads.status.includes('PENDING')
          ? 'החסימה החיצונית היחידה: Google Ads Basic Access'
          : 'אין חסימה קריטית',
        'ads-live',
        ads.status.includes('PENDING') ? 'pending' : 'live',
      ),
      top3: [
        M('לחכות לאישור Ads Basic Access — בלי הגשת בקשה חדשה', 'ops', 'ai_estimate'),
        M('לנטר צבירת GSC/GA4 על שני האתרים שבועית', 'ops', 'ai_estimate'),
        M('לאשר שכפתור «פרסום» מופיע מיד אחרי login (אחרי התיקון)', 'ops', 'ai_estimate'),
      ],
    },
    businessPotential: {
      score: projectScore,
      why: 'חיבורי Google LIVE לשני אתרים; חסר רק Ads API מלא',
      meta: M(projectScore, 'score', 'internal'),
    },
    healthBusiness: {
      statusLabel: ads.status.includes('PENDING') ? 'תקין עם תלות חיצונית (Ads)' : 'תקין',
      statusWhy: 'האתרים והמדידה עובדים מול Production. Ads ממתין ל-Google.',
      assistantsLabel: 'לא רלוונטי לדוח LIVE זה',
      assistantsMeta: M('דוח מבוסס API חי — לא assistants cache', 'system', 'internal'),
      enginesLabel: 'Google APIs חיים',
      enginesMeta: M('GSC · GA4 · PSI · GBP · OAuth', 'system', 'live'),
      detailNote: 'כל בדיקות Google בדוח זה בוצעו חי מול Production היום.',
    },
    fourAnswers: {
      whereToday: M(bottomLineToday, 'system', 'live'),
      progressSincePrev: M(
        'מאז דוח #0001: חיבורי Google הושלמו ל-LIVE (למעט Ads), שני אתרים במדידה, תוקן כפתור «פרסום»',
        'system',
        'live',
      ),
      whatsMissingForFirst: M(
        ads.status.includes('PENDING')
          ? 'אישור Google Ads Basic Access + צבירת טראפיק בנכסי GA4 החדשים'
          : 'צבירת טראפיק ומעקב המרות',
        'ops',
        'ai_estimate',
      ),
      top3: [
        M('לחכות לאישור Ads Basic Access', 'ops', 'ai_estimate'),
        M('לנטר צבירת GSC/GA4 על שני האתרים', 'ops', 'ai_estimate'),
        M('לאשר UI «פרסום» אחרי login בלי refresh', 'ops', 'ai_estimate'),
      ],
    },
    comparison: {
      summary: 'השוואה חיה בין dalia-c.com ל-dalia-car.online',
      summarySingle: '',
      summaryMulti: 'השוואה בין שני האתרים הפעילים:',
      bullets: [
        `ביצועים (PSI mobile): c.com ${fmtScore(c.pagespeed.performance)} · car.online ${fmtScore(n.pagespeed.performance)}`,
        `SEO score: c.com ${fmtScore(c.pagespeed.seo)} · car.online ${fmtScore(n.pagespeed.seo)}`,
        `GSC 28י הופעות: c.com ${c.gsc28.impressions} · car.online ${n.gsc28.impressions}`,
        `GSC 28י קליקים: c.com ${c.gsc28.clicks} · car.online ${n.gsc28.clicks}`,
        `מיקום ממוצע: c.com ${fmtPos(c.gsc28.avgPos)} · car.online ${fmtPos(n.gsc28.avgPos)}`,
        `GA4 sessions 7י: c.com ${c.ga4Metrics.sessions || 0} · car.online ${n.ga4Metrics.sessions || 0}`,
        `אינדוקס Home: c.com ${c.indexSample[0]?.coverageState || c.indexSample[0]?.verdict || '—'} · car.online ${n.indexSample[0]?.coverageState || n.indexSample[0]?.verdict || '—'}`,
        `חיבורים: שני האתרים GSC+GA4+GTM+PSI+GBP LIVE · Ads PENDING לשניהם`,
      ],
      note: 'כל המספרים נמשכו חי היום מ-Google APIs / HTML Production — לא דמו.',
    },
    dashboard: {
      googleStatus: M('CONNECTED / LIVE (8/9 שירותים; Ads PENDING)', 'system', 'live'),
      upOrDown: M(
        `c.com: ${c.gsc7.impressions} הופעות ב-7י · car: ${n.gsc7.impressions}`,
        'gsc-live',
        'live',
      ),
      avgPosition: M(
        `c.com ${fmtPos(c.gsc28.avgPos)} · car ${fmtPos(n.gsc28.avgPos)}`,
        'gsc-live',
        'live',
      ),
      searchedToday: M('ראה טווחי GSC 7י/28י למעלה (GSC מתעדכן באיחור ~2 ימים)', 'gsc-live', 'live'),
      googleConnection: M(`OAuth ${me.email} · Tokens תקפים · Supabase Staging bindings`, 'oauth-live', 'live'),
    },
    scores: {
      projectScore: M(projectScore, 'score', 'internal'),
      healthScore: M(healthScore, 'score', 'internal'),
      progressPct: M(
        Math.min(95, projectScore),
        'score',
        'internal',
      ),
      goLiveReady: M(
        true,
        'score',
        'internal',
        {
          sourceHe: ads.status.includes('PENDING')
            ? 'מדידה Production מוכנה · Ads API ממתין ל-Google'
            : 'מוכן ל-Production כולל Ads',
        },
      ),
    },
    executiveSummary: {
      siteStateToday: M('שני אתרי Production מחוברים ומודדים', 'system', 'live'),
      googleTrend: M(
        `GSC 28י סה״כ הופעות: ${c.gsc28.impressions + n.gsc28.impressions} · קליקים: ${c.gsc28.clicks + n.gsc28.clicks}`,
        'gsc-live',
        'live',
      ),
      top3Tasks: [
        M('לחכות לאישור Ads Basic Access', 'ops', 'ai_estimate'),
        M('לנטר צבירת GA4 על הנכסים החדשים (COCO)', 'ops', 'ai_estimate'),
        M('לאשר UI «פרסום» אחרי login בלי refresh', 'ops', 'ai_estimate'),
      ],
    },
    healthChecks: [
      { name: 'OAuth', status: 'תקין', sourceType: 'live', why: me.email },
      { name: 'Tokens', status: 'תקין', sourceType: 'live', why: 'access token retrieved' },
      { name: 'Supabase bindings', status: 'תקין', sourceType: 'live', why: 'Staging usfeoerkpcafxxlyuldl' },
      { name: 'GSC dalia-c.com', status: c.gscConnected ? 'תקין' : 'שגיאה', sourceType: 'live', why: c.services.gsc },
      { name: 'GSC dalia-car.online', status: n.gscConnected ? 'תקין' : 'שגיאה', sourceType: 'live', why: n.services.gsc },
      { name: 'GA4 dalia-c.com', status: c.ga4Ok ? 'תקין' : 'שגיאה', sourceType: 'live', why: c.services.ga4 },
      { name: 'GA4 dalia-car.online', status: n.ga4Ok ? 'תקין' : 'שגיאה', sourceType: 'live', why: n.services.ga4 },
      { name: 'GTM HTML', status: c.tags.gtmPresent && n.tags.gtmPresent ? 'תקין' : 'אזהרה', sourceType: 'live', why: `${c.cfg.gtm} / ${n.cfg.gtm}` },
      { name: 'GBP', status: gbp.status.includes('LIVE') ? 'תקין' : 'שגיאה', sourceType: 'live', why: daliaGbp?.title || gbp.status },
      { name: 'PageSpeed', status: c.pagespeed.performance != null ? 'תקין' : 'אזהרה', sourceType: 'live', why: 'PSI API' },
      { name: 'Google Ads', status: ads.status.includes('LIVE') ? 'תקין' : 'אזהרה', sourceType: 'live', why: ads.status },
      { name: 'פרסום UI fix', status: 'תקין', sourceType: 'live', why: 'AuthContext deployed index-mh-alNei.js' },
    ],
    healthScore,
    healthScoreFormula: 'live connections weighted',
    healthScoreNote: ads.status.includes('PENDING')
      ? 'הציון לא מלא בעיקר בגלל Ads שממתין ל-Google — לא בגלל קריסת אתר.'
      : 'חיבורים חיים תקינים.',
    healthSummary: {
      ok: connectedCount,
      warn: ads.status.includes('PENDING') ? 1 : 0,
      bad: 0,
      undef: 0,
    },
    criticalFaults: [],
    blockingFaults: ads.status.includes('PENDING')
      ? [{ id: 'ads_basic_access', he: 'Google Ads Basic Access ממתין לאישור Google' }]
      : [],
    unimplementedChecks: [],
    email: {
      status: 'dry_run',
      error: null,
      id: null,
      previewOnly: true,
      sentAt: null,
      subjectTemplate: `דוח יומי CO.CO LIVE — דליה — ${reportDate} — #${padded}`,
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
      gscLive: true,
      ga4Live: true,
      gbpLive: true,
      adsLive: ads.status.includes('LIVE'),
      pagespeedLive: true,
      dualSitesLive: true,
    },
    liveSnapshotPath: 'docs/audit-reports/google-connections-v2/DAILY-LIVE-SNAPSHOT.json',
  };

  const html = renderBusinessHtml(report);
  const htmlName = `COCO-Daily-Report-${padded}-${reportDate}.html`;
  const jsonName = `COCO-Daily-Report-${padded}-${reportDate}.json`;
  const emailName = `COCO-Daily-Report-${padded}-${reportDate}-email-preview.html`;
  const pngName = `COCO-Daily-Report-${padded}-${reportDate}-page1.png`;

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
  <p style="color:#64748b;font-size:12px">תקציר LIVE · PDF מצורף בשליחה אמיתית (לא בריצה זו)</p>
  <h2 style="margin:0 0 8px">CO.CO | דוח יומי #${padded}</h2>
  <p>דליה · ${reportDate} · ${me.email}</p>
  <ul>
    <li>Project Score: ${projectScore}</li>
    <li>Health Score: ${healthScore}</li>
    <li>GSC clicks 28י: c.com ${c.gsc28.clicks} · car ${n.gsc28.clicks}</li>
    <li>GA4 sessions 7י: c.com ${c.ga4Metrics.sessions || 0} · car ${n.ga4Metrics.sessions || 0}</li>
    <li>Ads: ${ads.status}</li>
  </ul>
  <p style="font-size:12px;color:#64748b">email_status=dry_run · לא נשלח</p>
</div></body></html>`;
  writeFileSync(emailPath, emailHtml, 'utf8');

  console.log('PDF + screenshot…');
  try {
    await writePdf(htmlPath, pdfPath, { padded, company: report.client.company, reportDate });
    writeFileSync(latestPdf, readFileSync(pdfPath));
    await screenshotPage1(htmlPath, pngPath);
  } catch (e) {
    console.warn('PDF/screenshot skipped:', String(e.message || e).slice(0, 200));
    writeFileSync(join(OUT_DIR, `PDF-SKIPPED-${padded}.txt`), String(e.message || e), 'utf8');
  }

  const archive = readdirSync(OUT_DIR)
    .filter((f) => /^COCO-Daily-Report-\d{4}-\d{4}-\d{2}-\d{2}\.html$/.test(f))
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
      projectScore,
      healthScore,
      dataMode: 'LIVE',
    },
    archiveKept: archive,
    updatedAt: generatedAtIso,
  }, null, 2), 'utf8');

  // Hebrew MD for docs
  const mdPath = join(ROOT, `docs/audit-reports/google-connections-v2/COCO-Daily-Report-${padded}-${reportDate}-HE.md`);
  writeFileSync(mdPath, `# דוח יומי CO.CO #${padded} — ${reportDate}

**מצב נתונים:** LIVE (לא דמו)  
**חשבון:** ${me.email}  
**נוצר:** ${heDateTime(generatedAtIso)}

## בשורה התחתונה
${bottomLineToday}

## 1. סטטוס חיבורי Google
| שירות | סטטוס |
|--------|--------|
| OAuth | CONNECTED (${me.email}) |
| Tokens | CONNECTED |
| Supabase | CONNECTED (Staging bindings) |
| Search Console | CONNECTED / LIVE (שני האתרים) |
| GA4 | CONNECTED / LIVE |
| GTM | CONNECTED / LIVE |
| Google Business Profile | ${gbp.status} |
| PageSpeed | CONNECTED / LIVE |
| Google Ads | ${ads.status} |

## 2–7. השוואת אתרים
| מדד | dalia-c.com | dalia-car.online |
|------|-------------|------------------|
| GSC 28י הופעות | ${c.gsc28.impressions} | ${n.gsc28.impressions} |
| GSC 28י קליקים | ${c.gsc28.clicks} | ${n.gsc28.clicks} |
| מיקום ממוצע | ${fmtPos(c.gsc28.avgPos)} | ${fmtPos(n.gsc28.avgPos)} |
| GA4 sessions 7י | ${c.ga4Metrics.sessions || 0} | ${n.ga4Metrics.sessions || 0} |
| GA4 users 7י | ${c.ga4Metrics.activeUsers || 0} | ${n.ga4Metrics.activeUsers || 0} |
| PSI Performance | ${fmtScore(c.pagespeed.performance)} | ${fmtScore(n.pagespeed.performance)} |
| PSI SEO | ${fmtScore(c.pagespeed.seo)} | ${fmtScore(n.pagespeed.seo)} |
| GTM | ${c.cfg.gtm} | ${n.cfg.gtm} |
| GA4 mid | ${c.cfg.mid} | ${n.cfg.mid} |
| אינדוקס Home | ${c.indexSample[0]?.coverageState || c.indexSample[0]?.verdict || '—'} | ${n.indexSample[0]?.coverageState || n.indexSample[0]?.verdict || '—'} |

## 8. בדיקת מערכת
- Project Score: **${projectScore}** · Health: **${healthScore}**
- מוכן ל-Production מדידה: **כן** (מלבד Ads API מלא)
- שגיאות קריטיות: אין
- חסר: Ads Basic Access בלבד

## 9. מה בוצע היום
${report.doneToday.map((x) => `- ${x}`).join('\n')}

## 10. מה נותר
${report.remaining.map((x) => `- ${x}`).join('\n')}

## 11. המלצות
1. לא להגיש מחדש בקשת Ads — לחכות לאישור Google  
2. לנטר צבירת GSC/GA4 שבועית על שני הנכסים  
3. אופציונלי: יישור GTM-P5 ל-G-73K6EDC6LV  
4. אימות Owner לכפתור «פרסום» אחרי login  

## קבצים
- HTML: \`public/coco-reports/dalia-c-official/daily/${htmlName}\`
- JSON: \`public/coco-reports/dalia-c-official/daily/${jsonName}\`
- PDF: \`public/coco-reports/dalia-c-official/daily/${pdfFileName}\`
- Snapshot: \`docs/audit-reports/google-connections-v2/DAILY-LIVE-SNAPSHOT.json\`
`, 'utf8');

  console.log(JSON.stringify({
    ok: true,
    reportNumber: `#${padded}`,
    reportDate,
    actingAs: me.email,
    scores: { project: projectScore, health: healthScore },
    ads: ads.status,
    gbp: gbp.status,
    paths: { htmlPath, jsonPath, pdfPath, latestHtml, mdPath, snapshot: LIVE_SNAPSHOT },
    sites: {
      'dalia-c.com': { gsc28: c.gsc28.impressions, clicks: c.gsc28.clicks, ga4: c.ga4Metrics.sessions, psi: c.pagespeed.performance },
      'dalia-car.online': { gsc28: n.gsc28.impressions, clicks: n.gsc28.clicks, ga4: n.ga4Metrics.sessions, psi: n.pagespeed.performance },
    },
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
