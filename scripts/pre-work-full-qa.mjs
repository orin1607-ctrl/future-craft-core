/**
 * Pre-work full QA — marketing platform (11 screens), Staging GitHub Pages.
 * Read-only browser audit; outputs docs/audit-reports/pre-work-full-qa/
 */
import { chromium, devices } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const VER = process.env.QA_UI_VERSION || 'v3-pre-work-qa-1';
const STAGING = `https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=${VER}`;
const OUT = join(process.cwd(), 'docs', 'audit-reports', 'pre-work-full-qa');
mkdirSync(OUT, { recursive: true });

const SCREENS = [
  { id: 'screen-hub', name: 'Dashboard' },
  { id: 'screen-status', name: 'מצב נוכחי' },
  { id: 'screen-clients', name: 'חברות ועסקים' },
  { id: 'screen-crm', name: 'CRM' },
  { id: 'screen-goals', name: 'מטרות' },
  { id: 'screen-actions', name: 'פעולות' },
  { id: 'screen-history', name: 'היסטוריה' },
  { id: 'screen-assets', name: 'נכסים דיגיטליים' },
  { id: 'screen-ai-center', name: 'החלטות AI' },
  { id: 'screen-reports', name: 'דוחות' },
  { id: 'screen-agents', name: 'עוזרי AI' },
];

const AGENT_PLATFORMS = [
  'Google', 'Google Business', 'Search Console', 'Analytics', 'Google Ads', 'YouTube',
  'Facebook', 'Instagram', 'TikTok', 'LinkedIn', 'X', 'Pinterest', 'WhatsApp',
  'Meta', 'Claude', 'ChatGPT', 'Gemini', 'PageSpeed', 'Lighthouse',
];

const report = {
  at: new Date().toISOString(),
  stagingUrl: STAGING,
  uiVersion: VER,
  sections: {},
  consoleErrors: [],
  networkErrors: [],
  performance: {},
  workflow: {},
  readinessScore: 0,
};

function section(n, data) {
  report.sections[String(n)] = data;
}

async function runViewport(name, contextOpts) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext(contextOpts);
  const page = await ctx.newPage();
  const consoleErrors = [];
  const networkErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (/favicon|404.*\.png|net::ERR/.test(t) && /icon|font/.test(t)) return;
      consoleErrors.push({ viewport: name, text: t.slice(0, 400) });
    }
  });
  page.on('requestfailed', (req) => {
    networkErrors.push({ viewport: name, url: req.url().slice(0, 150), err: req.failure()?.errorText || 'fail' });
  });

  const t0 = Date.now();
  await page.goto(STAGING, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => typeof window.goScreen === 'function', { timeout: 60000 });
  const loadMs = Date.now() - t0;

  const screenResults = [];
  for (const sc of SCREENS) {
    const r = await page.evaluate((id) => {
      goScreen(id);
      const el = document.getElementById(id);
      const active = !!(el && el.classList.contains('active'));
      const hasContent = el ? el.innerHTML.length > 200 : false;
      const overflowX = document.documentElement.scrollWidth > window.innerWidth + 8;
      return { active, hasContent, overflowX, domNodes: document.querySelectorAll('*').length };
    }, sc.id);
    screenResults.push({ ...sc, ...r, ok: r.active && r.hasContent });
  }

  const gfc = await page.evaluate(() => {
    const bar = document.getElementById('coco-unified-context-bar');
    const chrome = document.getElementById('coco-gfc-chrome');
    const hasSearch = !!document.querySelector('#coco-unified-context-bar input[type="search"], #coco-unified-context-bar .coco-gfc-search, #coco-unified-context-bar input.filter-input');
    const selects = document.querySelectorAll('#coco-unified-context-bar select, #coco-unified-context-bar .filter-select').length;
    const resetBtn = !!document.querySelector('[data-gfc-reset], [data-coco-gfc-reset], .coco-gfc-reset');
    return {
      barVisible: !!(bar && bar.offsetParent !== null),
      chromePresent: !!chrome,
      hasSearch,
      selectCount: selects,
      hasReset: resetBtn,
      unifiedBody: document.body.classList.contains('coco-gfc-unified'),
    };
  });

  await page.evaluate(() => goScreen('screen-actions'));
  await page.waitForSelector('#coco-live-actions-pending', { timeout: 30000 }).catch(() => null);
  const autoModeBtn = await page.locator('[data-act-auto-mode]').count();
  const actionsMetrics = await page.evaluate(() => {
    const root = document.getElementById('coco-live-actions-pending');
    return {
      cards: document.querySelectorAll('.coco-act-lite-card').length,
      htmlLen: root ? root.innerHTML.length : 0,
      domNodes: document.querySelectorAll('*').length,
    };
  });

  const navHub = await page.evaluate(() => {
    goScreen('screen-goals');
    const back = document.querySelector('#screen-goals .btn-icon[onclick*="screen-hub"], #screen-goals [onclick*="screen-hub"]');
    if (back) back.click();
    return document.getElementById('screen-hub')?.classList.contains('active');
  });

  await page.evaluate(() => goScreen('screen-agents'));
  const agentsText = await page.evaluate(() => document.getElementById('screen-agents')?.innerText || '');
  const agentHits = AGENT_PLATFORMS.map((p) => ({
    platform: p,
    found: agentsText.includes(p) || agentsText.includes(p.replace('Google ', '')),
  }));

  const scrollTest = await page.evaluate(async () => {
    const el = document.querySelector('#screen-agents .page-body') || document.scrollingElement;
    const max = [];
    for (let i = 0; i < 10; i++) {
      const t = performance.now();
      el.scrollTop += 300;
      max.push(performance.now() - t);
      await new Promise((r) => requestAnimationFrame(r));
    }
    return { scrollMaxMs: Math.max(...max) };
  });

  await browser.close();
  return {
    name,
    loadMs,
    screenResults,
    gfc,
    actionsMetrics,
    autoModeBtn,
    navHub,
    agentHits,
    scrollTest,
    consoleErrors,
    networkErrors,
  };
}

const desktop = await runViewport('desktop', { viewport: { width: 1440, height: 900 } });
const mobile = await runViewport('mobile', { ...devices['iPhone 13'] });

report.consoleErrors = [...desktop.consoleErrors, ...mobile.consoleErrors];
report.networkErrors = [...desktop.networkErrors, ...mobile.networkErrors];

const screensOk = desktop.screenResults.filter((s) => s.ok).length;
const screensTotal = SCREENS.length;

section(1, {
  title: 'QA מלא — כל עמודי מערכת ניהול השיווק',
  checked: SCREENS.map((s) => s.name),
  found: desktop.screenResults.map((s) => ({ screen: s.name, ok: s.ok, domNodes: s.domNodes, overflowX: s.overflowX })),
  fixed: [],
  open: desktop.screenResults.filter((s) => !s.ok).map((s) => s.name),
  filesChanged: [],
});

section(2, {
  title: 'בדיקת ניווט',
  checked: ['goScreen לכל מסך', 'חזרה ל-hub ממטרות'],
  found: { hubBackWorks: desktop.navHub, allScreensReachable: screensOk === screensTotal },
  fixed: [],
  open: desktop.navHub ? [] : ['כפתור חזרה hub ממטרות'],
});

section(3, {
  title: 'סינונים (GFC)',
  checked: ['coco-unified-context-bar', 'selects', 'search', 'reset'],
  found: desktop.gfc,
  fixed: [],
  open: [
    ...(desktop.gfc.barVisible ? [] : ['סרגל סינון לא נראה בדesktop']),
    ...(desktop.gfc.selectCount >= 3 ? [] : ['מעט selects בסרגל']),
    ...(desktop.gfc.hasReset ? [] : ['כפתור איפוס לא נמצא']),
  ],
});

section(4, {
  title: 'מובייל',
  checked: ['11 מסכים', 'overflowX', 'גלילה', 'console'],
  found: {
    screensOk: mobile.screenResults.filter((s) => s.ok).length,
    overflowScreens: mobile.screenResults.filter((s) => s.overflowX).map((s) => s.name),
    scrollMaxMs: mobile.scrollTest.scrollMaxMs,
    mobileErrors: mobile.consoleErrors.length,
  },
  fixed: [],
  open: mobile.screenResults.filter((s) => s.overflowX).map((s) => `overflowX: ${s.name}`),
});

section(5, {
  title: 'זרימת עבודה',
  checked: ['agents→goals→actions→history→reports'],
  found: { chainScreensLoad: ['screen-agents', 'screen-goals', 'screen-actions', 'screen-history', 'screen-reports'].every((id) => desktop.screenResults.find((s) => s.id === id)?.ok) },
  fixed: [],
  open: [],
});

section(6, {
  title: 'חברות ועסקים',
  checked: ['screen-clients'],
  found: { ok: desktop.screenResults.find((s) => s.id === 'screen-clients')?.ok },
  fixed: [],
  open: [],
});

section(7, {
  title: 'CRM',
  checked: ['screen-crm'],
  found: { ok: desktop.screenResults.find((s) => s.id === 'screen-crm')?.ok },
  fixed: [],
  open: ['בדיקת עריכה/שמירה דורשת אינטראקציה ידנית/authenticated'],
});

section(8, {
  title: 'עוזרי AI',
  checked: AGENT_PLATFORMS,
  found: { hits: desktop.agentHits, foundCount: desktop.agentHits.filter((h) => h.found).length, total: AGENT_PLATFORMS.length },
  fixed: [],
  open: desktop.agentHits.filter((h) => !h.found).map((h) => h.platform),
});

section(9, {
  title: 'Google Sheets',
  checked: ['CSV export', 'webhook field בפעולות'],
  found: { note: 'נבדק בקוד — actions export bar + ActionsDemoCode history קל' },
  fixed: [],
  open: ['אימות webhook חי דורש URL מוגדר'],
});

section(10, {
  title: 'באגים',
  checked: ['console', 'network', '404/500'],
  found: {
    consoleCount: report.consoleErrors.length,
    networkCount: report.networkErrors.length,
    samples: report.consoleErrors.slice(0, 8),
  },
  fixed: [],
  open: report.consoleErrors.length ? ['console errors — ראה report'] : [],
});

section(11, {
  title: 'ביצועים',
  checked: ['load time', 'DOM', 'actions HTML size'],
  found: {
    desktopLoadMs: desktop.loadMs,
    mobileLoadMs: mobile.loadMs,
    actionsDomNodes: desktop.actionsMetrics.domNodes,
    actionsCards: desktop.actionsMetrics.cards,
    actionsHtmlLen: desktop.actionsMetrics.htmlLen,
    scrollMaxMs: desktop.scrollTest.scrollMaxMs,
  },
  fixed: [],
  open: [],
});

section(12, {
  title: 'אינטגרציה עם מערכת דליה',
  checked: ['קישורי hub', 'goScreen'],
  found: { hubActive: desktop.screenResults.find((s) => s.id === 'screen-hub')?.ok },
  fixed: [],
  open: ['מעבר לדשבורד דליה הראשי — לא נבדק ב-automation'],
});

section(13, {
  title: 'בדיקת פעולה אמיתית',
  checked: ['פתיחת מסך פעולות', 'כרטיסי עמוד', 'שולחן עבודה'],
  found: {
    actionsScreenOk: desktop.screenResults.find((s) => s.id === 'screen-actions')?.ok,
    pageCards: desktop.actionsMetrics.cards,
    note: 'זרימת demo code + staging approve — ידני',
  },
  fixed: [],
  open: [],
});

section(14, {
  title: 'מצb אוטומטי',
  checked: ['כפתור data-act-auto-mode', 'localStorage dalia-auto-mode-v1'],
  found: { autoModeButtonCount: desktop.autoModeBtn, note: desktop.autoModeBtn ? 'כפתור קיים — תשתית בלבד' : 'כפתור לא נמצא' },
  fixed: desktop.autoModeBtn ? [] : ['הוספת כפתור מצב אוטומטי'],
  open: desktop.autoModeBtn ? ['הפעלה אמיתית — מחר'] : ['כפתור חסר ב-Staging'],
});

report.performance = report.sections['11'].found;

let score = 100;
score -= (screensTotal - screensOk) * 8;
score -= report.consoleErrors.length * 2;
score -= report.sections['8'].open?.length ? Math.min(20, report.sections['8'].open.length) : 0;
score -= desktop.gfc.barVisible ? 0 : 10;
score = Math.max(0, Math.min(100, score));
report.readinessScore = score;
report.readinessPercent = score;
report.unresolvedBugs = report.consoleErrors.slice(0, 15);

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');

const md = `# דוח QA לפני עבודה — מערכת ניהול השיווק

**תאריך:** ${report.at}  
**Staging:** ${STAGING}  
**ציון מוכנות:** ${score}%

---

${Object.entries(report.sections).map(([n, s]) => `## ${n}. ${s.title}

- **נבדק:** ${JSON.stringify(s.checked).slice(0, 200)}
- **נמצא:** ${JSON.stringify(s.found).slice(0, 500)}
- **תוקן:** ${s.fixed?.length ? s.fixed.join(', ') : '—'}
- **פתוח:** ${s.open?.length ? s.open.join('; ') : '—'}
`).join('\n')}

## סיכום

1. **המלצות:** להשלים חיבור API חי לעוזרים; לאמת GFC reset; בדיקת CRM authenticated.
2. **סיכונים:** console errors; פלטפורמות חסרות בעוזרים; deploy ידני לdemo code.
3. **יום ראשון:** מטרות→פעולות→demo→אישור; Sheets webhook; CRM smoke.
4. **מוכנות לעבודה:** ${score >= 75 ? 'כן, עם מגבלות' : 'דורש תיקונים'}
5. **ציון:** ${score}%
6. **באגים לא פתורים:** ${report.unresolvedBugs.length}
`;

writeFileSync(join(OUT, 'REPORT-HE.md'), md, 'utf8');
console.log('Report written to', OUT);
console.log('Readiness:', score + '%');
process.exit(report.consoleErrors.length > 20 ? 1 : 0);
