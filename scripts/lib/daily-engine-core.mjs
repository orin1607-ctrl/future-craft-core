/**
 * Daily Marketing Engine — shared analysis core (Node + browser parity).
 * Staging only · prepares recommendations/goals/actions · never executes on live site.
 */

export const ENGINE_VERSION = '1.0.0';
export const RUNS_KEY = 'dalia-daily-engine-runs-v1';
export const DRAFT_ACTIONS_KEY = 'dalia-daily-engine-draft-actions-v1';
export const AUTO_MODE_KEY = 'dalia-auto-mode-v1';
export const PROGRESS_LOG_KEY = 'dalia-work-progress-log';

const SLOW_MS_THRESHOLD = 3000;
const STUCK_DAYS = 7;

export function nextScheduledRun(fromIso) {
  const base = fromIso ? new Date(fromIso) : new Date();
  const next = new Date(base);
  next.setUTCHours(6, 0, 0, 0);
  if (next <= base) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

function safeArr(v) {
  return Array.isArray(v) ? v : [];
}

function pageKey(p) {
  return p.id || p.path || p.url || '';
}

function checklistFails(page) {
  const cl = page.checklist || {};
  return Object.keys(cl).filter((k) => cl[k] === 'fail');
}

export function collectDataSources(dashboard, workPlan, crawl) {
  const conn = (dashboard && dashboard.connections) || {};
  const sources = {
    dashboard: { ok: !!dashboard, at: dashboard && dashboard.generatedAt },
    workPlan: { ok: !!(workPlan && workPlan.pages), pages: safeArr(workPlan && workPlan.pages).length },
    crawl: { ok: !!(crawl && crawl.crawl), pages: safeArr(crawl && crawl.crawl && crawl.crawl.pages).length },
    gsc: { ok: conn.searchConsole && conn.searchConsole.ok, mode: 'snapshot' },
    ga4: { ok: conn.analytics4 && conn.analytics4.ok, mode: 'snapshot' },
    gbp: { ok: conn.businessProfile && conn.businessProfile.ok, mode: 'snapshot' },
    ads: { ok: conn.googleAds && conn.googleAds.ok, mode: 'snapshot' },
    pageSpeed: { ok: false, mode: 'missing' },
    crm: { ok: false, mode: 'not_connected_staging' },
    sheets: { ok: !!(conn.sheets && conn.sheets.ok), webhook: 'empty' },
    supabase: { ok: false, mode: 'not_connected_staging' },
    aiAgents: { ok: false, live: 0 },
    manual: { ok: true },
  };
  const missing = [];
  if (!sources.gsc.ok) missing.push('GSC live API');
  if (!sources.ga4.ok) missing.push('GA4 live API');
  if (!sources.gbp.ok) missing.push('GBP');
  if (!sources.ads.ok) missing.push('Google Ads');
  if (!sources.pageSpeed.ok) missing.push('PageSpeed API');
  if (!sources.crm.ok) missing.push('CRM Supabase');
  if (sources.sheets.webhook === 'empty') missing.push('Sheets webhook URL');
  if (!sources.supabase.ok) missing.push('Supabase remote');
  if (!sources.aiAgents.ok) missing.push('AI agents live API');
  return { sources, missing };
}

export function analyzeSiteState({ dashboard, workPlan, crawl, lastRun, now }) {
  const ts = now || new Date().toISOString();
  const pages = safeArr(workPlan && workPlan.pages);
  const actions = safeArr(workPlan && workPlan.actions);
  const crawlPages = safeArr(crawl && crawl.crawl && crawl.crawl.pages);
  const crawlByPath = Object.fromEntries(crawlPages.map((p) => [p.path || p.url, p]));

  const pagesDown = [];
  const pagesSlow = [];
  const missingContent = [];
  const seoIssues = [];
  const openActions = [];
  const completedActions = [];
  const stuckActions = [];
  const needsApproval = [];

  crawlPages.forEach((cp) => {
    if (cp.httpStatus && cp.httpStatus >= 400) pagesDown.push({ path: cp.path, status: cp.httpStatus });
    if (cp.loadTimeMs && cp.loadTimeMs > SLOW_MS_THRESHOLD) {
      pagesSlow.push({ path: cp.path, loadTimeMs: cp.loadTimeMs });
    }
  });

  pages.forEach((p) => {
    const miss = safeArr(p.missing);
    const issues = safeArr(p.issues);
    if (miss.length || issues.length) {
      missingContent.push({
        pageId: p.id,
        path: p.path || p.url,
        missing: miss,
        issues,
      });
    }
    const fails = checklistFails(p);
    if (fails.length || (p.seoScore != null && p.seoScore < 5)) {
      seoIssues.push({
        pageId: p.id,
        path: p.path || p.url,
        seoScore: p.seoScore,
        checklistFails: fails,
      });
    }
  });

  actions.forEach((a) => {
    const st = String(a.status || 'pending').toLowerCase();
    if (st === 'done' || st === 'completed') completedActions.push(a.id);
    else openActions.push(a.id);
    if (/in_progress|progress/.test(st) && a.startedAt) {
      const days = (Date.now() - new Date(a.startedAt).getTime()) / 86400000;
      if (days >= STUCK_DAYS) stuckActions.push({ id: a.id, days: Math.floor(days) });
    }
    if (st === 'pending' || st === 'open' || st === 'needs_review') {
      needsApproval.push(a.id);
    }
  });

  const diff = { newIssues: [], resolvedIssues: [] };
  if (lastRun && lastRun.findings) {
    const prevDown = new Set(safeArr(lastRun.findings.pagesDown).map((x) => x.path));
    pagesDown.forEach((x) => { if (!prevDown.has(x.path)) diff.newIssues.push('page_down:' + x.path); });
    const prevSeo = new Set(safeArr(lastRun.findings.seoIssues).map((x) => x.pageId));
    seoIssues.forEach((x) => { if (!prevSeo.has(x.pageId)) diff.newIssues.push('seo:' + x.pageId); });
  }

  return {
    checkedAt: ts,
    pagesTotal: pages.length,
    crawlTotal: crawlPages.length,
    pagesDown,
    pagesSlow,
    missingContent: missingContent.slice(0, 20),
    seoIssues: seoIssues.slice(0, 20),
    actions: {
      open: openActions.length,
      completed: completedActions.length,
      stuck: stuckActions,
      needsApproval: needsApproval.length,
    },
    diff,
    stats: (dashboard && dashboard.stats) || (workPlan && workPlan.summary) || {},
  };
}

export function buildRecommendations(findings) {
  const recs = [];
  if (findings.pagesDown.length) {
    recs.push({
      id: 'rec-down-pages',
      priority: 'קריטי',
      title: findings.pagesDown.length + ' עמודים לא זמינים (HTTP 4xx/5xx)',
      detail: findings.pagesDown.map((p) => p.path).join(', '),
      source: 'crawl',
    });
  }
  if (findings.seoIssues.length) {
    const top = findings.seoIssues[0];
    recs.push({
      id: 'rec-seo-' + (top.pageId || 'page'),
      priority: 'גבוה',
      title: 'שיפור SEO — ' + (top.path || top.pageId),
      detail: 'ציון ' + top.seoScore + ' · כשלים: ' + (top.checklistFails || []).join(', '),
      source: 'checklist',
    });
  }
  if (findings.missingContent.length) {
    const m = findings.missingContent[0];
    recs.push({
      id: 'rec-content-' + (m.pageId || 'page'),
      priority: 'גבוה',
      title: 'תוכן חסר — ' + (m.path || m.pageId),
      detail: (m.missing || []).concat(m.issues || []).slice(0, 3).join('; '),
      source: 'crawl',
    });
  }
  if (findings.actions.stuck.length) {
    recs.push({
      id: 'rec-stuck-actions',
      priority: 'בינוני',
      title: findings.actions.stuck.length + ' פעולות תקועות מעל ' + STUCK_DAYS + ' ימים',
      detail: findings.actions.stuck.map((s) => s.id).join(', '),
      source: 'workbench',
    });
  }
  if (!recs.length) {
    recs.push({
      id: 'rec-routine-audit',
      priority: 'בינוני',
      title: 'ביקורת יומית שגרתית — אין חריגים קריטיים',
      detail: 'המשך מעקב אחר ' + findings.actions.open + ' פעולות פתוחות',
      source: 'engine',
    });
  }
  return recs;
}

export function buildGoal(recommendations, findings) {
  const top = recommendations[0];
  return {
    id: 'goal-daily-' + Date.now(),
    title: top ? top.title : 'מטרת יום — שיפור SEO',
    category: 'SEO',
    status: 'pending',
    priority: top ? top.priority : 'בינוני',
    metric: findings.pagesTotal + ' עמודים · ' + findings.actions.open + ' פעולות פתוחות',
    created_at: new Date().toISOString(),
    source: 'daily-engine',
    requiresApproval: true,
  };
}

export function buildDraftAction(recommendations, findings, runId) {
  const top = recommendations[0];
  const target = findings.seoIssues[0] || findings.missingContent[0] || { pageId: 'page-01', path: '/' };
  return {
    id: 'act-daily-' + runId.slice(-8),
    pageId: target.pageId || 'page-01',
    pagePath: target.path || '/',
    category: 'title',
    recommendationType: 'title',
    status: 'pending',
    priority: (top && top.priority) || 'גבוה',
    urgency: (top && top.priority) || 'גבוה',
    source: (top && top.source) || 'engine',
    detail: top ? top.detail : 'פעולה יומית אוטומטית — דורשת אישור',
    problem: top ? top.title : 'ביקורת יומית',
    createdBy: 'daily-engine',
    created_at: new Date().toISOString(),
    requiresApproval: true,
    executionMode: 'preview',
    runId,
  };
}

export function buildDailyReport(run) {
  return {
    version: ENGINE_VERSION,
    generatedAt: run.finishedAt || new Date().toISOString(),
    runId: run.id,
    client: run.client,
    site: run.site,
    status: run.status,
    summary: run.summary,
    dataSources: run.dataSources,
    findings: run.findings,
    recommendations: run.recommendations,
    goal: run.goal,
    actionsCreated: run.actionsCreated,
    errors: run.errors || [],
    mode: run.mode || 'prepare_only',
    demo: run.demo || false,
  };
}

/**
 * @param {object} input
 * @param {object} [input.dashboard]
 * @param {object} [input.workPlan]
 * @param {object} [input.crawl]
 * @param {object} [input.lastRun]
 * @param {string} [input.clientId]
 * @param {string} [input.site]
 * @param {string} [input.mode] browser|headless
 * @param {boolean} [input.demo]
 */
export function runDailyEngine(input) {
  const startedAt = new Date().toISOString();
  const runId = 'run-' + Date.now();
  const errors = [];
  const client = input.clientId || 'dalia-c-official';
  const site = input.site || 'dalia-c.com';

  let dataSources;
  let findings;
  let recommendations;
  let goal;
  let draftAction;

  try {
    dataSources = collectDataSources(input.dashboard, input.workPlan, input.crawl);
    findings = analyzeSiteState({
      dashboard: input.dashboard,
      workPlan: input.workPlan,
      crawl: input.crawl,
      lastRun: input.lastRun,
      now: startedAt,
    });
    recommendations = buildRecommendations(findings);
    goal = buildGoal(recommendations, findings);
    draftAction = buildDraftAction(recommendations, findings, runId);
  } catch (e) {
    errors.push(String(e && e.message ? e.message : e));
    dataSources = { sources: {}, missing: ['engine_error'] };
    findings = { checkedAt: startedAt, pagesTotal: 0, actions: { open: 0, completed: 0, stuck: [], needsApproval: 0 } };
    recommendations = [];
    goal = null;
    draftAction = null;
  }

  const finishedAt = new Date().toISOString();
  const run = {
    id: runId,
    client,
    site,
    mode: input.mode || 'headless',
    demo: !!input.demo,
    status: errors.length ? 'error' : 'completed',
    startedAt,
    finishedAt,
    dataSources,
    dataChecked: Object.keys(dataSources.sources || {}).filter((k) => dataSources.sources[k].ok),
    findings,
    recommendations,
    goal,
    actionsCreated: draftAction ? [draftAction.id] : [],
    draftAction,
    errors,
    summary: {
      pagesChecked: findings.pagesTotal || 0,
      recommendations: recommendations.length,
      goalsCreated: goal ? 1 : 0,
      actionsCreated: draftAction ? 1 : 0,
      openActions: (findings.actions && findings.actions.open) || 0,
      pagesDown: (findings.pagesDown && findings.pagesDown.length) || 0,
      seoIssues: (findings.seoIssues && findings.seoIssues.length) || 0,
    },
    conclusions: recommendations.map((r) => r.title),
    nextRunAt: nextScheduledRun(finishedAt),
  };

  const report = buildDailyReport(run);
  return { run, report };
}

export function mergeRunHistory(existingRuns, run, maxRuns) {
  const runs = safeArr(existingRuns);
  runs.unshift({
    id: run.id,
    client: run.client,
    site: run.site,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    status: run.status,
    dataChecked: run.dataChecked,
    conclusions: run.conclusions,
    actionsCreated: run.actionsCreated,
    errors: run.errors,
    summary: run.summary,
    nextRunAt: run.nextRunAt,
  });
  return runs.slice(0, maxRuns || 60);
}

export function buildProgressEntry(run) {
  return {
    id: 'engine-' + run.id,
    title: 'מנוע יומי — ' + (run.status === 'completed' ? 'הושלם' : 'שגיאה'),
    action: run.status === 'completed' ? 'daily_engine' : 'daily_engine_error',
    module: 'אוטומציה',
    detail: (run.conclusions || []).slice(0, 2).join(' · ') || 'ריצה יומית',
    created_at: run.finishedAt || new Date().toISOString(),
  };
}

export function buildAutoModePatch(run, prev) {
  const base = prev || {};
  return Object.assign({}, base, {
    prepared: true,
    enabled: false,
    since: base.since || run.startedAt,
    lastRunAt: run.finishedAt,
    lastRunId: run.id,
    lastRunStatus: run.status,
    nextRunAt: run.nextRunAt,
    lastRunSummary: run.summary,
    lastRunErrors: run.errors || [],
    runCount: (base.runCount || 0) + 1,
    executionMode: 'preview',
  });
}
