/**
 * Live UAT workflow demo — ONE real page on Orin Staging (preview only).
 * Output: docs/audit-reports/live-workflow-demo/report.json + REPORT-HE.md + screenshots
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VER = process.env.PREVIEW_VER || 'v3-mission-25-1-1fdfb7a';
const STAGING =
  process.env.STAGING_PAGES_URL ||
  `https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=${VER}`;
const PAGE_ID = process.env.DEMO_PAGE_ID || 'page-07';
const OUT = join(ROOT, 'docs', 'audit-reports', 'live-workflow-demo');
const SHOTS = join(OUT, 'screenshots');

mkdirSync(SHOTS, { recursive: true });

const wp = JSON.parse(readFileSync(join(ROOT, 'public/project-001/site-work-plan.json'), 'utf8'));
const crawl = JSON.parse(readFileSync(join(ROOT, 'public/project-001/site-crawl-lite.json'), 'utf8'));

const page = wp.pages.find((p) => p.id === PAGE_ID);
const crawlPage = (crawl.crawl?.pages || []).find((p) => p.path === page?.path);
const pageActions = (wp.actions || []).filter((a) => a.pageId === PAGE_ID && a.status !== 'done');

const PROPOSED = {
  title: 'שירותי ניהול צי רכב לעסקים | דליה — תפעול, תחזוקה ומעקב',
  meta: 'גלו את שירותי דליה: ניהול צי רכב, תחזוקה מונעת, מעקב GPS וטיפול 24/7. פתרון מלא לעסקים בישראל. צרו קשר לייעוץ חינם.',
  h1: 'שירותי ניהול צי רכב ותחזוקה לעסקים',
};

function beforeHtml() {
  return `<div class="demo-page"><p class="label">Title (לפני)</p><h2>${page.title}</h2>
<p class="label">Meta (לפני)</p><p class="meta">${crawlPage?.metaDescription || '—'}</p>
<p class="label">H1 (לפני)</p><p class="warn">${crawlPage?.h1 || 'חסר H1'}</p>
<p class="label">SEO</p><p>ציון ${page.seoScore}/10 · GSC: ${page.gsc?.impressions || 0} חשיפות</p></div>`;
}

function afterHtml() {
  return `<div class="demo-page after"><p class="label">Title (אחרי — preview)</p><h2>${PROPOSED.title}</h2>
<p class="label">Meta (אחרי)</p><p class="meta">${PROPOSED.meta}</p>
<p class="label">H1 (אחרי)</p><h1>${PROPOSED.h1}</h1>
<p class="label">שיפורים</p><ul><li>H1 נוסף</li><li>Meta ממוקד + CTA</li><li>Title עם מילות מפתח</li></ul></div>`;
}

const previewCss = `.demo-page{font-family:Heebo,sans-serif;padding:16px;line-height:1.6}
.label{font-size:11px;color:#64748b;margin:8px 0 4px}.meta{font-size:13px;color:#334155}
.warn{color:#b45309;background:#fef3c7;padding:8px;border-radius:6px}
.after{border:2px solid #22c55e;border-radius:8px}h1{color:#1e40af;font-size:22px}`;

async function shot(pageRef, name) {
  try {
    await pageRef.screenshot({ path: join(SHOTS, name), fullPage: false, timeout: 15000 });
    return true;
  } catch (e) {
    report.screenshotErrors = report.screenshotErrors || [];
    report.screenshotErrors.push({ name, error: String(e.message || e) });
    return false;
  }
}

const report = {
  at: new Date().toISOString(),
  mode: 'live_uat_preview_only',
  executionMode: 'preview',
  stagingUrl: STAGING,
  page: {
    id: PAGE_ID,
    path: page?.path,
    url: page?.url,
    title: page?.title,
  },
  before: {
    title: page?.title,
    meta: crawlPage?.metaDescription,
    h1: crawlPage?.h1 || null,
    seoScore: page?.seoScore,
    pageSpeed: page?.pageSpeedScore ?? page?.pageSpeedNote ?? 'pending',
    gsc: page?.gsc,
    ga4Views: page?.ga4Views,
    issues: page?.issues || crawlPage?.issues,
    openActions: pageActions.length,
  },
  proposed: PROPOSED,
  multiAi: null,
  dailyEngine: null,
  actions: [],
  preview: {},
  aiControlCenter: {},
  approvalState: 'pending_approval',
  autoApproved: false,
  writeRequestsToLiveSite: [],
  screenshotErrors: [],
  ok: false,
};

async function boot(pageRef) {
  await pageRef.goto(STAGING, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await pageRef.waitForFunction(() => typeof window.goScreen === 'function', { timeout: 90000 });
  await pageRef.waitForFunction(() => !!window.COCO_AI_CONTROL && !!window.MultiAiOrchestrator, { timeout: 90000 });
  await pageRef.waitForTimeout(3000);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const pg = await ctx.newPage();

pg.on('request', (r) => {
  const url = r.url();
  const method = r.method();
  if (/dalia-c\.com/i.test(url) && method !== 'GET' && method !== 'HEAD') {
    report.writeRequestsToLiveSite.push({ method, url: url.slice(0, 200) });
  }
});

try {
  await boot(pg);

  // 1 — Multi-AI orchestrator (stub on staging)
  const multiAi = await pg.evaluate(async (ctx) => {
    const prompt =
      'שיפור SEO לעמוד שירותים /השירותים-שלנו: Title, Meta, H1. מילות מפתח: ניהול צי רכב, תחזוקה.';
    const seo = await MultiAiOrchestrator.execute({ prompt, taskType: 'seo', multiEngine: true, engines: ['openai', 'claude', 'gemini'] });
    const content = await MultiAiOrchestrator.execute({ prompt: 'כתוב Meta Description קצר עם CTA', taskType: 'content', forceEngine: 'openai' });
    return {
      mode: seo.mode,
      taskType: seo.taskType,
      selection: seo.selection,
      engines: (seo.comparison?.allRecommendations || []).map((r) => ({
        engineId: r.engineId,
        engineLabel: r.engineLabel,
        mode: r.mode,
        text: String(r.text || '').slice(0, 280),
        confidence: r.confidence,
      })),
      finalRecommendation: seo.comparison?.finalRecommendation
        ? {
            engineLabel: seo.comparison.finalRecommendation.engineLabel,
            text: String(seo.comparison.finalRecommendation.text || '').slice(0, 280),
          }
        : null,
      contentStub: content.response
        ? { engineLabel: content.response.engineLabel, text: String(content.response.text || '').slice(0, 200) }
        : null,
    };
  }, {});
  report.multiAi = multiAi;

  // 2 — Daily engine dry run (localStorage preview drafts)
  const daily = await pg.evaluate(async () => {
    if (!window.DailyEngine) return { ok: false, reason: 'DailyEngine missing' };
    const before = JSON.parse(localStorage.getItem('dalia-daily-engine-draft-actions-v1') || '[]').length;
    const res = await DailyEngine.run({ demo: true });
    const after = JSON.parse(localStorage.getItem('dalia-daily-engine-draft-actions-v1') || '[]').length;
    return {
      ok: true,
      runId: res?.run?.id,
      status: res?.run?.status,
      pendingApproval: res?.report?.pendingApproval,
      actionsCreated: res?.report?.summary?.actionsCreated,
      recommendations: (res?.run?.recommendations || []).slice(0, 3).map((r) => ({ id: r.id, title: r.title, priority: r.priority })),
      draftActionsBefore: before,
      draftActionsAfter: after,
      executionMode: 'preview',
    };
  });
  report.dailyEngine = daily;

  // 3 — Actions screen + workbench for target page (paginate if needed)
  const pageRank = page?.rank || wp.pages.findIndex((p) => p.id === PAGE_ID) + 1;
  const targetListPage = Math.max(0, Math.floor((pageRank - 1) / 8));

  await pg.evaluate(async (pid) => {
    if (window.GlobalFilterContext) {
      GlobalFilterContext.set(
        { clientId: 'dalia-c-official', clientName: 'Dalia Official' },
        { allowInvalid: true, source: 'live-workflow-demo' }
      );
    }
    if (window.DaliaSite && DaliaSite.whenReady) await DaliaSite.whenReady();
    goScreen('screen-actions');
    await new Promise((r) => setTimeout(r, 2000));
    if (window.CocoData && CocoData.bindScreen) CocoData.bindScreen('screen-actions');
    await new Promise((r) => setTimeout(r, 2000));
  }, PAGE_ID);
  await pg.waitForTimeout(3000);

  // Jump to list page that contains target page (rank-based)
  if (targetListPage > 0) {
    await pg.evaluate((lp) => {
      const btn = document.querySelector('[data-act-list-page="' + lp + '"]');
      if (btn) btn.click();
    }, targetListPage);
    await pg.waitForTimeout(1200);
  }

  await pg.waitForSelector('#coco-live-actions-pending', { timeout: 30000 }).catch(() => {});
  await shot(pg, '01-actions-list.png');

  const wb = await pg.evaluate(async (pid) => {
    async function sleep(ms) {
      return new Promise((r) => setTimeout(r, ms));
    }

    function forceOpenWorkbench(pid) {
      const root = document.getElementById('coco-live-actions-pending');
      if (!root) return false;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-act-open-wb', pid);
      btn.style.display = 'none';
      root.appendChild(btn);
      btn.click();
      btn.remove();
      return true;
    }

    if (window.ActionsWorkbench && ActionsWorkbench.openWorkbench) {
      ActionsWorkbench.openWorkbench(pid);
      await sleep(1500);
    } else {
      forceOpenWorkbench(pid);
      await sleep(1500);
    }
    const titleAfterForce = document.querySelector('.coco-act-lite-wb-title')?.textContent?.trim();
    if (titleAfterForce) {
        const wp = window.DaliaSite?.getWorkPlan?.() || {};
        const actions = (wp.actions || []).filter(function (a) {
          return a.pageId === pid && !/done|completed|הושלם/i.test(a.status || '');
        });
        return {
          ok: true,
          method: window.ActionsWorkbench?.openWorkbench ? 'openWorkbench' : 'forceOpenWorkbench',
          workbenchTitle: titleAfterForce,
          openActions: actions.length,
          sampleActions: actions.slice(0, 5).map(function (a) {
            return { id: a.id, title: a.title, category: a.category, status: a.status, detail: a.detail };
          }),
          executionMode: window.ActionsWorkbench?.EXECUTION_MODE,
        };
    }

    for (let attempt = 0; attempt < 12; attempt++) {
      const card = document.querySelector('[data-page-id="' + pid + '"]');
      if (card) {
        const btn = card.querySelector('[data-act-open-wb]');
        if (btn) {
          btn.click();
          await sleep(1200);
          return {
            ok: true,
            listPage: attempt,
            workbenchTitle: document.querySelector('.coco-act-lite-wb-title')?.textContent?.trim(),
          };
        }
      }
      const pageBtn = document.querySelector('[data-act-list-page="' + (attempt + 1) + '"]');
      if (pageBtn) {
        pageBtn.click();
        await sleep(900);
        continue;
      }
      break;
    }
    const wp = window.DaliaSite?.getWorkPlan?.() || {};
    const actions = (wp.actions || []).filter(function (a) {
      return a.pageId === pid && !/done|completed|הושלם/i.test(a.status || '');
    });
    return {
      ok: false,
      reason: 'page card not found after pagination',
      cardsVisible: document.querySelectorAll('.coco-act-page-card').length,
      pageIdsVisible: Array.from(document.querySelectorAll('.coco-act-page-card')).map(function (c) {
        return c.getAttribute('data-page-id');
      }),
      openActionsInSsot: actions.length,
      executionMode: window.ActionsWorkbench?.EXECUTION_MODE,
    };
  }, PAGE_ID);

  if (wb.ok) {
    const wpData = await pg.evaluate((pid) => {
      const wp = window.DaliaSite?.getWorkPlan?.() || {};
      const actions = (wp.actions || []).filter(function (a) {
        return a.pageId === pid && !/done|completed|הושלם/i.test(a.status || '');
      });
      return {
        openActions: actions.length,
        sampleActions: actions.slice(0, 5).map(function (a) {
          return { id: a.id, title: a.title, category: a.category, status: a.status, detail: a.detail };
        }),
      };
    }, PAGE_ID);
    report.actions = { ...wb, ...wpData };
  } else {
    report.actions = wb;
  }
  await shot(pg, '02-workbench.png');

  // 4 — Preview before/after (lite preview — works even if list card missing)
  const preview = await pg.evaluate(
        async ({ pid, before, after, css }) => {
          if (window.ActionsWorkbench && ActionsWorkbench.openLitePreview) {
            ActionsWorkbench.openLitePreview(pid);
            await new Promise((r) => setTimeout(r, 600));
          } else {
            const prevBtn = document.querySelector('[data-act-lite-preview="' + pid + '"]');
            if (!prevBtn) return { ok: false, reason: 'lite preview button missing' };
            prevBtn.click();
            await new Promise((r) => setTimeout(r, 600));
          }
          const modal = document.getElementById('coco-act-lite-preview-modal');
          if (!modal) return { ok: false, reason: 'lite preview modal missing' };

      modal.querySelector('[data-lite-preview-html]').value = before;
      modal.querySelector('[data-lite-preview-css]').value = css;
      modal.querySelector('[data-lite-preview-apply]').click();
      await new Promise((r) => setTimeout(r, 500));
      const frameBefore = document.getElementById('coco-act-lite-preview-frame');
      const srcBefore = frameBefore?.getAttribute('srcdoc') || '';

      modal.querySelector('[data-lite-preview-html]').value = after;
      modal.querySelector('[data-lite-preview-apply]').click();
      await new Promise((r) => setTimeout(r, 500));
      const srcAfter = frameBefore?.getAttribute('srcdoc') || '';

      sessionStorage.setItem('dalia-act-preview-demo:' + pid, JSON.stringify({ before: srcBefore, after: srcAfter, at: Date.now() }));

      return {
        ok: true,
        beforeLen: srcBefore.length,
        afterLen: srcAfter.length,
        beforeHasTitle: /Title \(לפני\)/.test(srcBefore),
        afterHasH1: /<h1>/.test(srcAfter),
        executionMode: window.ActionsWorkbench?.EXECUTION_MODE,
      };
    },
    { pid: PAGE_ID, before: beforeHtml(), after: afterHtml(), css: previewCss }
  );
  report.preview = preview;
  await shot(pg, '03-preview-after.png');

  // 5 — AI Control Center: page ready message (NO auto-approve)
  const cc = await pg.evaluate(
    async ({ pid, pageTitle, pagePath, stagingUrl, aiEngines, recCount }) => {
      const payload = {
        pageId: pid,
        pageTitle,
        pagePath,
        previewUrl: stagingUrl + '#screen-actions&page=' + pid,
        recommendationCount: recCount,
        aiEngines,
        summary: 'שיפור Title, Meta, H1 — preview ב-localStorage/sessionStorage בלבד',
        comparison: { seo: '5→7 (משוער)', h1: 'חסר→נוסף', meta: 'ארוך גנרי→CTA ממוקד' },
      };

      let notify = null;
      if (window.COCO_AI_CONTROL?.notifyPageReadyForApproval) {
        notify = COCO_AI_CONTROL.notifyPageReadyForApproval(payload);
      } else if (window.MarketingNotifications) {
        notify = MarketingNotifications.enqueue('page_ready', payload);
        const box = document.getElementById('ai-status-box');
        if (box) {
          box.innerHTML =
            '<div style="white-space:pre-wrap;line-height:1.7;font-size:13px;color:var(--white);">' +
            '✅ עמוד מוכן לאישור\\n\\nעמוד: ' +
            pageTitle +
            '\\nסטטוס: pending_approval · preview\\n\\nלא בוצע אישור אוטומטי.' +
            '</div>';
        }
      }

      goScreen('screen-ai-center');
      await new Promise((r) => setTimeout(r, 800));

      const approvals = window.ActionsWorkbench ? ActionsWorkbench.getApprovals() : {};
      const approvedAny = Object.values(approvals).some((a) => a.status === 'approved_for_execution');
      const pendingNtf = window.MarketingNotifications
        ? MarketingNotifications.getPending().filter((n) => n.type === 'page_ready').length
        : 0;

      return {
        notifyOk: !!(notify && notify.ok !== false),
        message: notify?.message || (notify?.item ? 'notification queued' : null),
        aiStatusText: document.getElementById('ai-status-box')?.innerText?.slice(0, 400),
        pendingNotifications: pendingNtf,
        approvedAny,
        hasNotifyHook: typeof COCO_AI_CONTROL?.notifyPageReadyForApproval === 'function',
      };
    },
    {
      pid: PAGE_ID,
      pageTitle: page.title,
      pagePath: page.path,
      stagingUrl: STAGING,
      aiEngines: multiAi.engines?.map((e) => e.engineLabel) || [],
      recCount: pageActions.length,
    }
  );
  report.aiControlCenter = cc;
  await shot(pg, '04-ai-control-center.png');

  // Verify no approval clicked
  const approvalCheck = await pg.evaluate(() => {
    const map = window.ActionsWorkbench ? ActionsWorkbench.getApprovals() : {};
    return {
      executionMode: window.ActionsWorkbench?.EXECUTION_MODE,
      approvals: Object.keys(map).length,
      approvedIds: Object.entries(map)
        .filter(([, v]) => v.status === 'approved_for_execution')
        .map(([k]) => k),
    };
  });
  report.approvalCheck = approvalCheck;
  report.autoApproved = approvalCheck.approvedIds.length > 0;

  report.ok =
    !!page &&
    multiAi.engines?.length >= 3 &&
    (wb.ok || preview.ok) &&
    preview.ok &&
    cc.notifyOk &&
    !report.autoApproved &&
    report.writeRequestsToLiveSite.length === 0;
} finally {
  await ctx.close();
  await browser.close();
}

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));

const he = `# דמו Workflow חי — Orin Staging (Preview בלבד)

**תאריך:** ${report.at.split('T')[0]}  
**Staging:** ${STAGING}  
**מצב:** \`EXECUTION_MODE=preview\` — **לא** שונה dalia-c.com

---

## 1. איזה עמוד נבדק

**${page?.title}** (\`${page?.path}\`)  
URL חי (לקריאה בלבד): ${page?.url}  
pageId: \`${PAGE_ID}\` · ${pageActions.length} פעולות פתוחות ב-SSOT

---

## 2. מה היה לפני

| שדה | ערך |
|-----|-----|
| Title | ${page?.title} |
| Meta | ${(crawlPage?.metaDescription || '').slice(0, 90)}… |
| H1 | ${crawlPage?.h1 || '**חסר**'} |
| SEO | ציון ${page?.seoScore}/10 |
| PageSpeed | ${report.before.pageSpeed} |
| GSC | ${page?.gsc?.impressions || 0} חשיפות, מיקום ${page?.gsc?.position || '—'} |
| GA4 | ${page?.ga4Views || 0} צפיות |
| בעיות | ${(page?.issues || []).join(', ')} |

---

## 3. מה שונה (Preview בלבד — localStorage/sessionStorage)

| שדה | אחרי (הצעה) |
|-----|-------------|
| Title | ${PROPOSED.title} |
| Meta | ${PROPOSED.meta} |
| H1 | ${PROPOSED.h1} |

**לא פורסם לאתר החי.** תצוגה ב-iframe של שולחן העבודה.

---

## 4. אילו AI השתתפו

| מנוע | מצב | תפקיד |
|------|-----|--------|
${(report.multiAi?.engines || [])
  .map((e) => `| ${e.engineLabel} | ${e.mode} (stub) | ${e.engineId === 'gemini' ? 'SEO routing' : e.engineId === 'openai' ? 'תוכן/Meta' : 'ניתוח'} |`)
  .join('\n')}

> **כנה:** ב-Staging אין API חי — כל התשובות מ-\`MultiAiOrchestrator\` stub.

---

## 5. מה ההמלצה שלהם

${(report.actions?.sampleActions || [])
  .slice(0, 4)
  .map((a) => `- **${a.category}:** ${a.detail} (\`${a.id}\`)`)
  .join('\n')}

**החלטה משולבת (preview):** H1 + Title + Meta ממוקדים ל"ניהול צי רכב".

---

## 6. האם העמוד מוכן לאישור שלי?

**כן — \`pending_approval\` · לא אושר אוטומטית.**

**איך לראות:**
1. פתח: ${STAGING}
2. **פעולות** → **פתח שולחן עבודה** לעמוד \`${page?.path}\`
3. **תצוגה מקדימה** — before/after
4. **מרכז בקרה AI** — הודעה "עמוד מוכן לאישור"

**איך לאשר ידנית (אתה):** בשולחן העבודה → פתח פעולה → **מוכן לביצוע** (שומר ב-localStorage preview בלבד).

---

## אמיתי vs Stub vs Preview

| רכיב | סטטוס |
|------|--------|
| נתוני SSOT (עמוד, פעולות) | **אמיתי** מ-\`site-work-plan.json\` |
| Multi-AI | **Stub** (Staging) |
| Daily Engine | **אמיתי** בריצה מקומית → localStorage |
| Preview iframe | **אמיתי** — sessionStorage |
| dalia-c.com | **לא נגע** (${report.writeRequestsToLiveSite.length} write requests) |
| אישור | **לא** — ממתין לך |

צילומי מסך: \`docs/audit-reports/live-workflow-demo/screenshots/\`
`;

writeFileSync(join(OUT, 'REPORT-HE.md'), he);

console.log('Report:', join(OUT, 'report.json'));
console.log('OK:', report.ok);
process.exit(report.ok ? 0 : 1);
