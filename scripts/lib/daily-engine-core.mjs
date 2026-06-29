/**
 * Daily Marketing Engine v2 — lightweight, multi-tenant, batch pipeline.
 * Staging only · prepares slim goals/actions · never executes on live site.
 */

export const ENGINE_VERSION = '2.0.0';
export const PAGE_CHUNK = 5;
export const MAX_RUNS = 30;
export const MAX_DRAFTS = 50;
export const MAX_HISTORY = 100;
export const NOTE_MAX = 200;

export const RUNS_KEY = 'dalia-daily-engine-runs-v1';
export const DRAFT_ACTIONS_KEY = 'dalia-daily-engine-draft-actions-v1';
export const KEYWORDS_KEY = 'dalia-daily-engine-keywords-v1';
export const AUTO_MODE_KEY = 'dalia-auto-mode-v1';
export const HISTORY_LITE_KEY = 'dalia-daily-engine-history-lite-v1';
export const PROGRESS_LOG_KEY = 'dalia-work-progress-log';

const SLOW_MS_THRESHOLD = 3000;
const STUCK_DAYS = 7;

/** Default Hebrew fleet-management keywords for dalia-c */
export const DEFAULT_KEYWORDS_DALIA = [
  'ניהול צי רכב',
  'מעקב GPS',
  'תחזוקת רכבים',
  'דלק וצריכה',
  'ביטוח צי',
  'נהגים ורישיונות',
  'טלמטיקה',
  'Fleet management',
  'vehicle tracking',
  'תחזוקה מונעת',
];

export function getDefaultTenants() {
  return [
    {
      clientId: 'dalia-c-official',
      businessId: 'dalia-c',
      siteId: 'site-dalia-c',
      domain: 'dalia-c.com',
      keywords: [...DEFAULT_KEYWORDS_DALIA],
      sources: ['dashboard', 'workPlan', 'crawl', 'gsc', 'ga4', 'manual'],
      schedule: {
        daily: true,
        seoRecheckDays: 14,
        pagespeedDays: 30,
        reportsDaily: true,
        reportsWeekly: true,
      },
    },
  ];
}

function safeArr(v) {
  return Array.isArray(v) ? v : [];
}

function truncateNote(s) {
  const t = String(s || '');
  return t.length > NOTE_MAX ? t.slice(0, NOTE_MAX - 1) + '…' : t;
}

function addDays(iso, days) {
  const d = new Date(iso || Date.now());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function endOfDayUtc(iso) {
  const d = new Date(iso || Date.now());
  d.setUTCHours(23, 59, 59, 999);
  return d.toISOString();
}

export function nextScheduledRun(fromIso) {
  const base = fromIso ? new Date(fromIso) : new Date();
  const next = new Date(base);
  next.setUTCHours(6, 0, 0, 0);
  if (next <= base) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

/** Match page path/content to best keyword */
export function matchKeyword(page, keywords) {
  const kws = safeArr(keywords);
  if (!kws.length) return { keyword: 'כללי', topic: 'SEO' };
  const path = String(page.path || page.url || '').toLowerCase();
  const title = String(page.title || page.name || '').toLowerCase();
  const text = path + ' ' + title;
  for (const kw of kws) {
    const k = String(kw).toLowerCase();
    const parts = k.split(/\s+/).filter(Boolean);
    if (parts.some((p) => text.includes(p)) || text.includes(k)) {
      return { keyword: kw, topic: inferTopic(kw) };
    }
  }
  return { keyword: kws[0], topic: inferTopic(kws[0]) };
}

function inferTopic(kw) {
  const k = String(kw).toLowerCase();
  if (/gps|מעקב|tracking|telematics/.test(k)) return 'מעקב וטלמטיקה';
  if (/תחזוק|maintenance/.test(k)) return 'תחזוקה';
  if (/דלק|fuel/.test(k)) return 'דלק וצריכה';
  if (/ביטוח|insurance/.test(k)) return 'ביטוח';
  if (/נהג|driver/.test(k)) return 'נהגים';
  return 'SEO';
}

function checklistFails(page) {
  const cl = page.checklist || {};
  return Object.keys(cl).filter((k) => cl[k] === 'fail');
}

/** Honest source mapping — skip disconnected in batch */
export function collectDataSources(dashboard, workPlan, crawl, tenant) {
  const conn = (dashboard && dashboard.connections) || {};
  const sourceDefs = [
    { id: 'dashboard', ok: !!dashboard, mode: dashboard ? 'snapshot' : 'missing' },
    { id: 'workPlan', ok: !!(workPlan && workPlan.pages), mode: 'snapshot', pages: safeArr(workPlan && workPlan.pages).length },
    { id: 'crawl', ok: !!(crawl && crawl.crawl), mode: 'crawl-lite', pages: safeArr(crawl && crawl.crawl && crawl.crawl.pages).length },
    { id: 'gsc', ok: !!(conn.searchConsole && conn.searchConsole.ok), mode: 'snapshot' },
    { id: 'ga4', ok: !!(conn.analytics4 && conn.analytics4.ok), mode: 'snapshot' },
    { id: 'gbp', ok: false, mode: 'not_connected' },
    { id: 'ads', ok: false, mode: 'not_connected' },
    { id: 'pageSpeed', ok: false, mode: 'not_connected' },
    { id: 'sheets', ok: !!(conn.sheets && conn.sheets.ok), mode: 'webhook_if_set', webhook: 'empty' },
    { id: 'crm', ok: false, mode: 'local_only' },
    { id: 'aiAgents', ok: false, mode: 'skip_live' },
    { id: 'manual', ok: true, mode: 'button' },
  ];
  const sources = {};
  const connected = [];
  const skipped = [];
  const missing = [];
  sourceDefs.forEach((s) => {
    sources[s.id] = { ok: s.ok, mode: s.mode, pages: s.pages, webhook: s.webhook };
    if (s.ok && (!tenant || safeArr(tenant.sources).includes(s.id) || s.id === 'manual')) {
      connected.push(s.id);
    } else if (!s.ok && s.mode !== 'skip_live') {
      if (s.mode === 'not_connected') missing.push(s.id);
      skipped.push(s.id);
    }
  });
  if (sources.sheets.webhook === 'empty') missing.push('Sheets webhook URL');
  return { sources, connected, skipped, missing };
}

/** Check if schedule phase should run based on lastRunAt */
export function shouldRunPhase(schedule, phase, lastPhaseRunAt, now) {
  const ts = now || new Date().toISOString();
  if (!lastPhaseRunAt) return true;
  const daysSince = (Date.now() - new Date(lastPhaseRunAt).getTime()) / 86400000;
  switch (phase) {
    case 'daily':
      return !lastPhaseRunAt || new Date(lastPhaseRunAt).toDateString() !== new Date(ts).toDateString();
    case 'seo':
      return daysSince >= (schedule.seoRecheckDays || 14);
    case 'pagespeed':
      return daysSince >= (schedule.pagespeedDays || 30);
    case 'reportsDaily':
      return shouldRunPhase(schedule, 'daily', lastPhaseRunAt, ts);
    case 'reportsWeekly':
      return daysSince >= 7;
    default:
      return true;
  }
}

export function computeSla(type, schedule, now) {
  const openedAt = now || new Date().toISOString();
  let dueAt;
  let recheckAt = null;
  switch (type) {
    case 'urgent':
      dueAt = endOfDayUtc(openedAt);
      break;
    case 'large':
      dueAt = addDays(openedAt, 7);
      break;
    case 'seo_followup':
      dueAt = addDays(openedAt, schedule.seoRecheckDays || 14);
      recheckAt = dueAt;
      break;
    case 'normal':
    default:
      dueAt = addDays(openedAt, 2 + Math.floor(Math.random() * 2));
      break;
  }
  return { type: type || 'normal', dueAt, openedAt, recheckAt };
}

function priorityToSlaType(priority) {
  const p = String(priority || '').toLowerCase();
  if (/קריטי|urgent|critical/.test(p)) return 'urgent';
  if (/גבוה|high/.test(p)) return 'normal';
  if (/seo|followup/.test(p)) return 'seo_followup';
  if (/large|גדול/.test(p)) return 'large';
  return 'normal';
}

/** Stage 1: companies */
export function stageCompanies(tenants) {
  const list = safeArr(tenants).length ? tenants : getDefaultTenants();
  return {
    stage: 'companies',
    count: list.length,
    items: list.map((t) => ({ clientId: t.clientId, businessId: t.businessId })),
  };
}

/** Stage 2: sites — one site at a time */
export function stageSites(companies, tenants) {
  const list = safeArr(tenants).length ? tenants : getDefaultTenants();
  return {
    stage: 'sites',
    count: list.length,
    items: list.map((t) => ({
      clientId: t.clientId,
      siteId: t.siteId,
      domain: t.domain,
    })),
    processOneAtATime: true,
  };
}

/** Stage 3: sources — sequential, skip disconnected */
export function stageSources(siteCtx, data, tenant) {
  const ds = collectDataSources(data.dashboard, data.workPlan, data.crawl, tenant);
  const sequential = [];
  for (const id of ['dashboard', 'workPlan', 'crawl', 'gsc', 'ga4', 'sheets', 'crm', 'aiAgents', 'manual']) {
    const s = ds.sources[id];
    if (!s) continue;
    if (s.ok || id === 'manual') sequential.push({ id, ok: s.ok, mode: s.mode });
    else sequential.push({ id, ok: false, mode: s.mode, skipped: true });
  }
  return { stage: 'sources', site: siteCtx, dataSources: ds, sequential };
}

/** Stage 4: analyze — pages in chunks of PAGE_CHUNK */
export function stageAnalyze(siteCtx, data, keywords, chunkIndex, lastRun) {
  const ts = new Date().toISOString();
  const pages = safeArr(data.workPlan && data.workPlan.pages);
  const actions = safeArr(data.workPlan && data.workPlan.actions);
  const crawlPages = safeArr(data.crawl && data.crawl.crawl && data.crawl.crawl.pages);
  const start = (chunkIndex || 0) * PAGE_CHUNK;
  const chunk = pages.slice(start, start + PAGE_CHUNK);

  const pagesDown = [];
  const pagesSlow = [];
  const missingContent = [];
  const seoIssues = [];
  const keywordMatches = [];

  crawlPages.forEach((cp) => {
    if (cp.httpStatus && cp.httpStatus >= 400) pagesDown.push({ path: cp.path, status: cp.httpStatus });
    if (cp.loadTimeMs && cp.loadTimeMs > SLOW_MS_THRESHOLD) {
      pagesSlow.push({ path: cp.path, loadTimeMs: cp.loadTimeMs });
    }
  });

  chunk.forEach((p) => {
    const match = matchKeyword(p, keywords);
    keywordMatches.push({ pageId: p.id, path: p.path || p.url, keyword: match.keyword, topic: match.topic });
    const miss = safeArr(p.missing);
    const issues = safeArr(p.issues);
    if (miss.length || issues.length) {
      missingContent.push({ pageId: p.id, path: p.path || p.url, missing: miss.slice(0, 3), issues: issues.slice(0, 3), keyword: match.keyword });
    }
    const fails = checklistFails(p);
    if (fails.length || (p.seoScore != null && p.seoScore < 5)) {
      seoIssues.push({ pageId: p.id, path: p.path || p.url, seoScore: p.seoScore, checklistFails: fails.slice(0, 5), keyword: match.keyword, topic: match.topic });
    }
  });

  const openActions = [];
  const stuckActions = [];
  actions.forEach((a) => {
    const st = String(a.status || 'pending').toLowerCase();
    if (st !== 'done' && st !== 'completed') openActions.push(a.id);
    if (/in_progress|progress/.test(st) && a.startedAt) {
      const days = (Date.now() - new Date(a.startedAt).getTime()) / 86400000;
      if (days >= STUCK_DAYS) stuckActions.push({ id: a.id, days: Math.floor(days) });
    }
  });

  const totalChunks = Math.ceil(pages.length / PAGE_CHUNK) || 1;
  const diff = { newIssues: [] };
  if (lastRun && lastRun.findings) {
    const prevSeo = new Set(safeArr(lastRun.findings.seoIssues).map((x) => x.pageId));
    seoIssues.forEach((x) => { if (!prevSeo.has(x.pageId)) diff.newIssues.push('seo:' + x.pageId); });
  }

  return {
    stage: 'analyze',
    chunkIndex: chunkIndex || 0,
    totalChunks,
    hasMore: start + PAGE_CHUNK < pages.length,
    checkedAt: ts,
    pagesTotal: pages.length,
    pagesInChunk: chunk.length,
    pagesDown: pagesDown.slice(0, 10),
    pagesSlow: pagesSlow.slice(0, 10),
    missingContent: missingContent.slice(0, 10),
    seoIssues: seoIssues.slice(0, 10),
    keywordMatches: keywordMatches.slice(0, PAGE_CHUNK),
    actions: { open: openActions.length, stuck: stuckActions.slice(0, 5) },
    diff,
  };
}

/** Merge chunk analyze results */
export function mergeAnalyzeChunks(chunks) {
  const merged = {
    pagesTotal: 0,
    pagesDown: [],
    pagesSlow: [],
    missingContent: [],
    seoIssues: [],
    keywordMatches: [],
    actions: { open: 0, stuck: [] },
    diff: { newIssues: [] },
  };
  safeArr(chunks).forEach((c) => {
    merged.pagesTotal = c.pagesTotal || merged.pagesTotal;
    merged.pagesDown = merged.pagesDown.concat(safeArr(c.pagesDown)).slice(0, 20);
    merged.pagesSlow = merged.pagesSlow.concat(safeArr(c.pagesSlow)).slice(0, 20);
    merged.missingContent = merged.missingContent.concat(safeArr(c.missingContent)).slice(0, 20);
    merged.seoIssues = merged.seoIssues.concat(safeArr(c.seoIssues)).slice(0, 20);
    merged.keywordMatches = merged.keywordMatches.concat(safeArr(c.keywordMatches));
    if (c.actions) {
      merged.actions.open = c.actions.open || merged.actions.open;
      merged.actions.stuck = merged.actions.stuck.concat(safeArr(c.actions.stuck)).slice(0, 10);
    }
    merged.diff.newIssues = merged.diff.newIssues.concat(safeArr(c.diff && c.diff.newIssues));
  });
  return merged;
}

export function buildRecommendations(findings) {
  const recs = [];
  if (findings.pagesDown && findings.pagesDown.length) {
    recs.push({
      id: 'rec-down-pages',
      priority: 'קריטי',
      title: findings.pagesDown.length + ' עמודים לא זמינים',
      detail: findings.pagesDown.map((p) => p.path).join(', '),
      source: 'crawl',
      slaType: 'urgent',
    });
  }
  if (findings.seoIssues && findings.seoIssues.length) {
    const top = findings.seoIssues[0];
    recs.push({
      id: 'rec-seo-' + (top.pageId || 'page'),
      priority: 'גבוה',
      title: 'שיפור SEO — ' + (top.path || top.pageId),
      detail: 'ציון ' + top.seoScore + ' · ' + (top.keyword || ''),
      source: 'checklist',
      keyword: top.keyword,
      topic: top.topic,
      slaType: 'seo_followup',
    });
  }
  if (findings.missingContent && findings.missingContent.length) {
    const m = findings.missingContent[0];
    recs.push({
      id: 'rec-content-' + (m.pageId || 'page'),
      priority: 'גבוה',
      title: 'תוכן חסר — ' + (m.path || m.pageId),
      detail: safeArr(m.missing).concat(safeArr(m.issues)).slice(0, 3).join('; '),
      source: 'crawl',
      keyword: m.keyword,
      topic: inferTopic(m.keyword),
      slaType: 'normal',
    });
  }
  if (findings.actions && findings.actions.stuck && findings.actions.stuck.length) {
    recs.push({
      id: 'rec-stuck-actions',
      priority: 'בינוני',
      title: findings.actions.stuck.length + ' פעולות תקועות',
      detail: findings.actions.stuck.map((s) => s.id).join(', '),
      source: 'workbench',
      slaType: 'large',
    });
  }
  if (!recs.length) {
    recs.push({
      id: 'rec-routine-audit',
      priority: 'בינוני',
      title: 'ביקורת יומית שגרתית',
      detail: 'המשך מעקב אחר ' + ((findings.actions && findings.actions.open) || 0) + ' פעולות פתוחות',
      source: 'engine',
      slaType: 'normal',
    });
  }
  return recs.slice(0, 10);
}

/** Stage 5: goals — slim drafts */
export function stageGoals(recommendations, findings, tenant) {
  const goals = recommendations.slice(0, 5).map((rec, i) => {
    const target = findings.seoIssues && findings.seoIssues[i]
      ? findings.seoIssues[i]
      : (findings.missingContent && findings.missingContent[i]) || { pageId: 'page-01', path: '/' };
    const match = matchKeyword(target, tenant.keywords);
    return {
      id: 'goal-daily-' + Date.now() + '-' + i,
      clientId: tenant.clientId,
      siteId: tenant.siteId,
      pageId: target.pageId || 'page-01',
      keyword: rec.keyword || match.keyword,
      topic: rec.topic || match.topic,
      priority: rec.priority,
      reason: truncateNote(rec.detail || rec.title),
      source: rec.source,
      status: 'pending_approval',
    };
  });
  return { stage: 'goals', count: goals.length, items: goals };
}

/** Stage 6: actions — slim drafts with SLA */
export function stageActions(goals, recommendations, findings, tenant, runId, schedule) {
  const sched = schedule || tenant.schedule || {};
  const actions = goals.items.map((goal, i) => {
    const rec = recommendations[i] || recommendations[0] || {};
    const slaType = rec.slaType || priorityToSlaType(rec.priority);
    const sla = computeSla(slaType, sched);
    const target = findings.seoIssues && findings.seoIssues[i]
      ? findings.seoIssues[i]
      : (findings.missingContent && findings.missingContent[i]) || { pageId: goal.pageId, path: '/' };
    return {
      id: 'act-daily-' + runId.slice(-8) + (i ? '-' + i : ''),
      name: rec.title || goal.reason,
      description: truncateNote(rec.detail || goal.reason),
      goalId: goal.id,
      clientId: tenant.clientId,
      siteId: tenant.siteId,
      pageId: goal.pageId,
      pagePath: target.path || '/',
      keyword: goal.keyword,
      topic: goal.topic,
      priority: rec.priority || 'גבוה',
      status: 'pending_approval',
      sla,
      assignee: null,
      completionChecklist: 'בדיקת SEO · אישור תוכן · preview',
      source: rec.source || 'daily-engine',
      createdBy: 'daily-engine',
      created_at: new Date().toISOString(),
      requiresApproval: true,
      executionMode: 'preview',
      runId,
      problem: rec.title,
      detail: rec.detail,
      category: 'title',
      recommendationType: 'title',
    };
  });
  if (!actions.length && recommendations.length) {
    const rec = recommendations[0];
    const goal = goals.items[0] || {
      id: 'goal-daily-' + Date.now(),
      clientId: tenant.clientId,
      siteId: tenant.siteId,
      pageId: 'page-01',
      keyword: tenant.keywords[0],
      topic: 'SEO',
    };
    actions.push({
      id: 'act-daily-' + runId.slice(-8),
      name: rec.title,
      description: truncateNote(rec.detail),
      goalId: goal.id,
      clientId: tenant.clientId,
      siteId: tenant.siteId,
      pageId: goal.pageId,
      pagePath: '/',
      keyword: goal.keyword,
      topic: goal.topic || 'SEO',
      priority: rec.priority,
      status: 'pending_approval',
      sla: computeSla(rec.slaType || 'normal', sched),
      assignee: null,
      completionChecklist: 'בדיקת SEO · אישור תוכן',
      source: rec.source,
      createdBy: 'daily-engine',
      created_at: new Date().toISOString(),
      requiresApproval: true,
      executionMode: 'preview',
      runId,
      problem: rec.title,
      detail: rec.detail,
      category: 'title',
      recommendationType: 'title',
    });
  }
  return { stage: 'actions', count: actions.length, items: actions };
}

/** Stage 7: SLA summary */
export function stageSla(actions) {
  const items = safeArr(actions.items);
  return {
    stage: 'sla',
    count: items.length,
    byType: items.reduce((acc, a) => {
      const t = (a.sla && a.sla.type) || 'normal';
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {}),
    items: items.map((a) => ({ id: a.id, type: a.sla.type, dueAt: a.sla.dueAt, recheckAt: a.sla.recheckAt })),
  };
}

/** Stage 8: history lite */
export function stageHistoryLite(actions, run, tenant) {
  const rows = safeArr(actions.items).map((a) => ({
    client: tenant.clientId,
    site: tenant.domain,
    goalId: a.goalId,
    actionId: a.id,
    status: a.status,
    date: run.finishedAt || new Date().toISOString(),
    who: 'daily-engine',
    result: 'draft_created',
    link: a.pagePath || '',
    commit: '',
    note: truncateNote(a.name),
  }));
  return { stage: 'history-lite', count: rows.length, items: rows };
}

/** Stage 9: report lite — under 50KB, no crawl HTML */
export function stageReportLite(run, pipeline) {
  const goals = pipeline.goals && pipeline.goals.items || [];
  const actions = pipeline.actions && pipeline.actions.items || [];
  return {
    stage: 'report-lite',
    version: ENGINE_VERSION,
    generatedAt: run.finishedAt,
    runId: run.id,
    client: run.client,
    site: run.site,
    status: run.status,
    whatChangedToday: safeArr(run.summary && run.summary.newIssues).slice(0, 10),
    goalsCreated: goals.map((g) => ({ id: g.id, keyword: g.keyword, topic: g.topic, status: g.status })),
    actionsOpened: actions.filter((a) => a.status === 'pending_approval').map((a) => ({
      id: a.id, name: a.name, keyword: a.keyword, sla: a.sla,
    })),
    actionsCompleted: [],
    pendingApproval: actions.filter((a) => a.status === 'pending_approval').length,
    stuck: (pipeline.analyze && pipeline.analyze.actions && pipeline.analyze.actions.stuck) || [],
    tomorrowRecommendation: pipeline.recommendations && pipeline.recommendations[0]
      ? pipeline.recommendations[0].title
      : 'המשך מעקב שגרתי',
    summary: run.summary,
    dataSourcesMissing: (pipeline.sources && pipeline.sources.dataSources && pipeline.sources.dataSources.missing) || [],
    schedule: pipeline.scheduleRecheck || {},
  };
}

/** Stage 10: schedule recheck */
export function stageScheduleRecheck(tenant, run, prevScheduleRuns) {
  const prev = prevScheduleRuns || {};
  const now = run.finishedAt || new Date().toISOString();
  const sched = tenant.schedule || {};
  return {
    stage: 'schedule-recheck',
    lastRunAt: {
      daily: shouldRunPhase(sched, 'daily', prev.daily) ? now : prev.daily,
      seo: shouldRunPhase(sched, 'seo', prev.seo) ? now : prev.seo,
      pagespeed: prev.pagespeed,
      reportsDaily: now,
    },
    nextRecheck: {
      daily: nextScheduledRun(now),
      seo: addDays(now, sched.seoRecheckDays || 14),
      pagespeed: addDays(now, sched.pagespeedDays || 30),
    },
    phasesSkipped: {
      seo: !shouldRunPhase(sched, 'seo', prev.seo),
      pagespeed: !shouldRunPhase(sched, 'pagespeed', prev.pagespeed),
    },
  };
}

export function slimRunSummary(run) {
  return {
    id: run.id,
    client: run.client,
    site: run.site,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    status: run.status,
    dataChecked: run.dataChecked,
    conclusions: (run.conclusions || []).slice(0, 5),
    actionsCreated: run.actionsCreated,
    errors: run.errors,
    summary: run.summary,
    nextRunAt: run.nextRunAt,
    phasesSkipped: run.phasesSkipped,
  };
}

export function mergeRunHistory(existingRuns, run, maxRuns) {
  const runs = safeArr(existingRuns);
  runs.unshift(slimRunSummary(run));
  return runs.slice(0, maxRuns || MAX_RUNS);
}

export function mergeHistoryLite(existing, rows, max) {
  const hist = safeArr(existing);
  const merged = safeArr(rows).concat(hist);
  const capped = merged.slice(0, max || MAX_HISTORY);
  const exportHint = merged.length > (max || MAX_HISTORY)
    ? 'history_overflow_export_to_sheets'
    : null;
  return { items: capped, exportHint };
}

export function buildProgressEntry(run, stage) {
  return {
    id: 'engine-' + run.id + (stage ? '-' + stage : ''),
    title: 'מנוע יומי — ' + (stage || (run.status === 'completed' ? 'הושלם' : 'שגיאה')),
    action: run.status === 'completed' ? 'daily_engine' : 'daily_engine_error',
    module: 'אוטומציה',
    detail: truncateNote((run.conclusions || []).slice(0, 2).join(' · ') || stage || 'ריצה יומית'),
    created_at: run.finishedAt || new Date().toISOString(),
  };
}

export function buildAutoModePatch(run, prev) {
  const base = prev || {};
  return {
    prepared: true,
    enabled: false,
    since: base.since || run.startedAt,
    lastRunAt: run.finishedAt,
    lastRunId: run.id,
    lastRunStatus: run.status,
    nextRunAt: run.nextRunAt,
    active: run.status === 'running',
    counts: {
      recommendations: (run.summary && run.summary.recommendations) || 0,
      goalsCreated: (run.summary && run.summary.goalsCreated) || 0,
      actionsCreated: (run.summary && run.summary.actionsCreated) || 0,
      pendingApproval: (run.summary && run.summary.pendingApproval) || 0,
    },
    lastRunErrors: run.errors || [],
    runCount: (base.runCount || 0) + 1,
    executionMode: 'preview',
    currentStage: null,
  };
}

/** Full pipeline — processes all page chunks synchronously (Node) */
export function runDailyEngine(input) {
  const startedAt = new Date().toISOString();
  const runId = 'run-' + Date.now();
  const errors = [];
  const tenants = input.tenants || getDefaultTenants();
  const tenant = tenants.find((t) => t.clientId === (input.clientId || 'dalia-c-official')) || tenants[0];
  const client = tenant.clientId;
  const site = input.site || tenant.domain;
  const keywords = input.keywords || tenant.keywords || DEFAULT_KEYWORDS_DALIA;
  const prevScheduleRuns = (input.lastRun && input.lastRun.scheduleRuns) || {};

  const pipeline = {};
  let findings = { pagesTotal: 0, actions: { open: 0, stuck: [] }, diff: { newIssues: [] } };
  let recommendations = [];
  let goals = { items: [] };
  let actions = { items: [] };

  try {
    pipeline.companies = stageCompanies(tenants);
    pipeline.sites = stageSites(pipeline.companies, tenants);
    const siteCtx = { clientId: tenant.clientId, siteId: tenant.siteId, domain: tenant.domain };

    pipeline.sources = stageSources(siteCtx, {
      dashboard: input.dashboard,
      workPlan: input.workPlan,
      crawl: input.crawl,
    }, tenant);

    const pages = safeArr(input.workPlan && input.workPlan.pages);
    const totalChunks = Math.ceil(pages.length / PAGE_CHUNK) || 1;
    const chunks = [];
    for (let i = 0; i < totalChunks; i++) {
      chunks.push(stageAnalyze(siteCtx, {
        dashboard: input.dashboard,
        workPlan: input.workPlan,
        crawl: input.crawl,
      }, keywords, i, input.lastRun));
    }
    findings = mergeAnalyzeChunks(chunks);
    pipeline.analyze = { chunks: chunks.length, findings };

    recommendations = buildRecommendations(findings);
    pipeline.recommendations = recommendations;

    if (shouldRunPhase(tenant.schedule, 'daily', prevScheduleRuns.daily, startedAt)) {
      goals = stageGoals(recommendations, findings, tenant);
      actions = stageActions(goals, recommendations, findings, tenant, runId, tenant.schedule);
    } else {
      goals = { stage: 'goals', count: 0, items: [], skipped: true };
      actions = { stage: 'actions', count: 0, items: [], skipped: true };
    }

    pipeline.goals = goals;
    pipeline.actions = actions;
    pipeline.sla = stageSla(actions);
  } catch (e) {
    errors.push(String(e && e.message ? e.message : e));
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
    dataSources: pipeline.sources && pipeline.sources.dataSources,
    dataChecked: pipeline.sources ? pipeline.sources.dataSources.connected : [],
    findings,
    recommendations,
    goals: goals.items,
    actionsCreated: safeArr(actions.items).map((a) => a.id),
    draftActions: actions.items,
    errors,
    summary: {
      pagesChecked: findings.pagesTotal || 0,
      chunksProcessed: pipeline.analyze && pipeline.analyze.chunks || 0,
      recommendations: recommendations.length,
      goalsCreated: safeArr(goals.items).length,
      actionsCreated: safeArr(actions.items).length,
      pendingApproval: safeArr(actions.items).filter((a) => a.status === 'pending_approval').length,
      openActions: (findings.actions && findings.actions.open) || 0,
      pagesDown: safeArr(findings.pagesDown).length,
      seoIssues: safeArr(findings.seoIssues).length,
      newIssues: safeArr(findings.diff && findings.diff.newIssues).length,
    },
    conclusions: recommendations.map((r) => r.title),
    nextRunAt: nextScheduledRun(finishedAt),
    keywordsUsed: keywords.slice(0, 5),
  };

  pipeline.scheduleRecheck = stageScheduleRecheck(tenant, run, prevScheduleRuns);
  run.scheduleRuns = pipeline.scheduleRecheck.lastRunAt;
  run.phasesSkipped = pipeline.scheduleRecheck.phasesSkipped;

  pipeline.historyLite = stageHistoryLite(actions, run, tenant);
  const reportLite = stageReportLite(run, { ...pipeline, recommendations });
  pipeline.reportLite = reportLite;

  return { run, report: reportLite, pipeline, historyLite: pipeline.historyLite.items };
}

export function buildDailyReport(run) {
  return stageReportLite(run, {
    goals: { items: run.goals || [] },
    actions: { items: run.draftActions || [] },
    analyze: { actions: run.findings && run.findings.actions },
    recommendations: run.recommendations,
    sources: { dataSources: run.dataSources },
    scheduleRecheck: { lastRunAt: run.scheduleRuns },
  });
}

/** Estimate localStorage payload sizes (bytes) */
export function estimateStorageSizes(state) {
  const est = (obj) => {
    try { return JSON.stringify(obj || {}).length; } catch { return 0; }
  };
  return {
    runs: est(state.runs),
    drafts: est(state.drafts),
    keywords: est(state.keywords),
    autoMode: est(state.autoMode),
    historyLite: est(state.historyLite),
    total: est(state),
    limits: { maxRuns: MAX_RUNS, maxDrafts: MAX_DRAFTS, maxHistory: MAX_HISTORY, runSummaryTargetKb: 2, reportMaxKb: 50 },
  };
}

/** Export history — POST webhook or CSV download hint */
export function exportHistoryToSheets(history, webhookUrl, fetchFn) {
  const rows = safeArr(history);
  const payload = {
    type: 'daily-engine-history',
    exportedAt: new Date().toISOString(),
    count: rows.length,
    rows,
  };
  if (webhookUrl && fetchFn) {
    return fetchFn(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(() => ({ ok: true, mode: 'webhook', count: rows.length }))
      .catch((e) => ({ ok: false, mode: 'webhook', error: String(e.message || e) }));
  }
  const csvHeader = 'client,site,goalId,actionId,status,date,who,result,link,commit,note\n';
  const csvBody = rows.map((r) =>
    [r.client, r.site, r.goalId, r.actionId, r.status, r.date, r.who, r.result, r.link, r.commit, r.note]
      .map((c) => '"' + String(c || '').replace(/"/g, '""') + '"')
      .join(','),
  ).join('\n');
  return Promise.resolve({ ok: true, mode: 'csv', csv: csvHeader + csvBody, count: rows.length });
}
