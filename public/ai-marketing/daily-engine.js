/**
 * Daily Marketing Engine — browser (Staging only).
 * Prepares recommendations/goals/actions · never deploys to live site.
 */
(function () {
  'use strict';

  var RUNS_KEY = 'dalia-daily-engine-runs-v1';
  var DRAFT_ACTIONS_KEY = 'dalia-daily-engine-draft-actions-v1';
  var AUTO_MODE_KEY = 'dalia-auto-mode-v1';
  var PROGRESS_LOG_KEY = 'dalia-work-progress-log';
  var ENGINE_VERSION = '1.0.0';
  var SLOW_MS = 3000;
  var STUCK_DAYS = 7;

  function readJson(key, fb) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fb;
    } catch (e) { return fb; }
  }

  function writeJson(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
  }

  function nextScheduledRun(fromIso) {
    var base = fromIso ? new Date(fromIso) : new Date();
    var next = new Date(base.getTime());
    next.setUTCHours(6, 0, 0, 0);
    if (next <= base) next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString();
  }

  function safeArr(v) { return Array.isArray(v) ? v : []; }

  function checklistFails(page) {
    var cl = page.checklist || {};
    return Object.keys(cl).filter(function (k) { return cl[k] === 'fail'; });
  }

  function collectDataSources(dashboard, workPlan, crawl) {
    var conn = (dashboard && dashboard.connections) || {};
    var sources = {
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
    var missing = [];
    if (!sources.gsc.ok) missing.push('GSC live API');
    if (!sources.ga4.ok) missing.push('GA4 live API');
    if (!sources.gbp.ok) missing.push('GBP');
    if (!sources.ads.ok) missing.push('Google Ads');
    if (!sources.pageSpeed.ok) missing.push('PageSpeed API');
    if (!sources.crm.ok) missing.push('CRM Supabase');
    if (sources.sheets.webhook === 'empty') missing.push('Sheets webhook URL');
    if (!sources.supabase.ok) missing.push('Supabase remote');
    if (!sources.aiAgents.ok) missing.push('AI agents live API');
    return { sources: sources, missing: missing };
  }

  function analyzeSiteState(opts) {
    var dashboard = opts.dashboard;
    var workPlan = opts.workPlan;
    var crawl = opts.crawl;
    var lastRun = opts.lastRun;
    var ts = opts.now || new Date().toISOString();
    var pages = safeArr(workPlan && workPlan.pages);
    var actions = safeArr(workPlan && workPlan.actions);
    var crawlPages = safeArr(crawl && crawl.crawl && crawl.crawl.pages);
    var pagesDown = [];
    var pagesSlow = [];
    var missingContent = [];
    var seoIssues = [];
    var openActions = [];
    var completedActions = [];
    var stuckActions = [];
    var needsApproval = [];

    crawlPages.forEach(function (cp) {
      if (cp.httpStatus && cp.httpStatus >= 400) pagesDown.push({ path: cp.path, status: cp.httpStatus });
      if (cp.loadTimeMs && cp.loadTimeMs > SLOW_MS) pagesSlow.push({ path: cp.path, loadTimeMs: cp.loadTimeMs });
    });

    pages.forEach(function (p) {
      var miss = safeArr(p.missing);
      var issues = safeArr(p.issues);
      if (miss.length || issues.length) {
        missingContent.push({ pageId: p.id, path: p.path || p.url, missing: miss, issues: issues });
      }
      var fails = checklistFails(p);
      if (fails.length || (p.seoScore != null && p.seoScore < 5)) {
        seoIssues.push({ pageId: p.id, path: p.path || p.url, seoScore: p.seoScore, checklistFails: fails });
      }
    });

    actions.forEach(function (a) {
      var st = String(a.status || 'pending').toLowerCase();
      if (st === 'done' || st === 'completed') completedActions.push(a.id);
      else openActions.push(a.id);
      if (/in_progress|progress/.test(st) && a.startedAt) {
        var days = (Date.now() - new Date(a.startedAt).getTime()) / 86400000;
        if (days >= STUCK_DAYS) stuckActions.push({ id: a.id, days: Math.floor(days) });
      }
      if (st === 'pending' || st === 'open' || st === 'needs_review') needsApproval.push(a.id);
    });

    var diff = { newIssues: [], resolvedIssues: [] };
    if (lastRun && lastRun.findings) {
      var prevDown = {};
      safeArr(lastRun.findings.pagesDown).forEach(function (x) { prevDown[x.path] = true; });
      pagesDown.forEach(function (x) { if (!prevDown[x.path]) diff.newIssues.push('page_down:' + x.path); });
    }

    return {
      checkedAt: ts,
      pagesTotal: pages.length,
      crawlTotal: crawlPages.length,
      pagesDown: pagesDown,
      pagesSlow: pagesSlow,
      missingContent: missingContent.slice(0, 20),
      seoIssues: seoIssues.slice(0, 20),
      actions: {
        open: openActions.length,
        completed: completedActions.length,
        stuck: stuckActions,
        needsApproval: needsApproval.length,
      },
      diff: diff,
      stats: (dashboard && dashboard.stats) || (workPlan && workPlan.summary) || {},
    };
  }

  function buildRecommendations(findings) {
    var recs = [];
    if (findings.pagesDown.length) {
      recs.push({
        id: 'rec-down-pages', priority: 'קריטי',
        title: findings.pagesDown.length + ' עמודים לא זמינים (HTTP 4xx/5xx)',
        detail: findings.pagesDown.map(function (p) { return p.path; }).join(', '),
        source: 'crawl',
      });
    }
    if (findings.seoIssues.length) {
      var top = findings.seoIssues[0];
      recs.push({
        id: 'rec-seo-' + (top.pageId || 'page'), priority: 'גבוה',
        title: 'שיפור SEO — ' + (top.path || top.pageId),
        detail: 'ציון ' + top.seoScore + ' · כשלים: ' + (top.checklistFails || []).join(', '),
        source: 'checklist',
      });
    }
    if (findings.missingContent.length) {
      var m = findings.missingContent[0];
      recs.push({
        id: 'rec-content-' + (m.pageId || 'page'), priority: 'גבוה',
        title: 'תוכן חסר — ' + (m.path || m.pageId),
        detail: safeArr(m.missing).concat(safeArr(m.issues)).slice(0, 3).join('; '),
        source: 'crawl',
      });
    }
    if (findings.actions.stuck.length) {
      recs.push({
        id: 'rec-stuck-actions', priority: 'בינוני',
        title: findings.actions.stuck.length + ' פעולות תקועות מעל ' + STUCK_DAYS + ' ימים',
        detail: findings.actions.stuck.map(function (s) { return s.id; }).join(', '),
        source: 'workbench',
      });
    }
    if (!recs.length) {
      recs.push({
        id: 'rec-routine-audit', priority: 'בינוני',
        title: 'ביקורת יומית שגרתית — אין חריגים קריטיים',
        detail: 'המשך מעקב אחר ' + findings.actions.open + ' פעולות פתוחות',
        source: 'engine',
      });
    }
    return recs;
  }

  function buildGoal(recommendations, findings) {
    var top = recommendations[0];
    return {
      id: 'goal-daily-' + Date.now(),
      title: top ? top.title : 'מטרת יום — שיפור SEO',
      category: 'SEO', status: 'pending',
      priority: top ? top.priority : 'בינוני',
      metric: findings.pagesTotal + ' עמודים · ' + findings.actions.open + ' פעולות פתוחות',
      created_at: new Date().toISOString(),
      source: 'daily-engine', requiresApproval: true,
    };
  }

  function buildDraftAction(recommendations, findings, runId) {
    var top = recommendations[0];
    var target = findings.seoIssues[0] || findings.missingContent[0] || { pageId: 'page-01', path: '/' };
    return {
      id: 'act-daily-' + runId.slice(-8),
      pageId: target.pageId || 'page-01',
      pagePath: target.path || '/',
      category: 'title', recommendationType: 'title',
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
      runId: runId,
    };
  }

  function fetchJson(rel) {
    var base = window.COCO_PAGES_BASE || '/future-craft-core/';
    if (base.charAt(0) !== '/') base = '/' + base.replace(/^\.\//, '');
    return fetch(location.origin + base + rel + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function loadData() {
    if (window.DaliaSite && DaliaSite.getDashboard && DaliaSite.getWorkPlan) {
      var dash = DaliaSite.getDashboard();
      var wp = DaliaSite.getWorkPlan();
      if (dash && wp) {
        return fetchJson('project-001/site-crawl-lite.json').then(function (crawl) {
          return { dashboard: dash, workPlan: wp, crawl: crawl };
        });
      }
      if (DaliaSite.whenReady) {
        return DaliaSite.whenReady().then(function () {
          return fetchJson('project-001/site-crawl-lite.json').then(function (crawl) {
            return {
              dashboard: DaliaSite.getDashboard(),
              workPlan: DaliaSite.getWorkPlan(),
              crawl: crawl,
            };
          });
        });
      }
    }
    return Promise.all([
      fetchJson('project-001/dashboard.json'),
      fetchJson('project-001/site-work-plan.json'),
      fetchJson('project-001/site-crawl-lite.json'),
    ]).then(function (arr) {
      return { dashboard: arr[0], workPlan: arr[1], crawl: arr[2] };
    });
  }

  function persistRun(run, draftAction) {
    var runs = readJson(RUNS_KEY, { runs: [] });
    runs.runs = runs.runs || [];
    runs.runs.unshift({
      id: run.id, client: run.client, site: run.site,
      startedAt: run.startedAt, finishedAt: run.finishedAt, status: run.status,
      dataChecked: run.dataChecked, conclusions: run.conclusions,
      actionsCreated: run.actionsCreated, errors: run.errors,
      summary: run.summary, nextRunAt: run.nextRunAt,
    });
    runs.runs = runs.runs.slice(0, 60);
    runs.lastRun = run;
    writeJson(RUNS_KEY, runs);

    if (draftAction) {
      var drafts = readJson(DRAFT_ACTIONS_KEY, []);
      var exists = drafts.some(function (a) { return a.id === draftAction.id; });
      if (!exists) {
        drafts.unshift(draftAction);
        writeJson(DRAFT_ACTIONS_KEY, drafts.slice(0, 50));
      }
    }

    var progress = readJson(PROGRESS_LOG_KEY, []);
    progress.unshift({
      id: 'engine-' + run.id,
      title: 'מנוע יומי — ' + (run.status === 'completed' ? 'הושלם' : 'שגיאה'),
      action: run.status === 'completed' ? 'daily_engine' : 'daily_engine_error',
      module: 'אוטומציה',
      detail: (run.conclusions || []).slice(0, 2).join(' · ') || 'ריצה יומית',
      created_at: run.finishedAt,
    });
    writeJson(PROGRESS_LOG_KEY, progress.slice(0, 100));

    var autoPrev = readJson(AUTO_MODE_KEY, { prepared: false, enabled: false });
    writeJson(AUTO_MODE_KEY, Object.assign({}, autoPrev, {
      prepared: true, enabled: false,
      since: autoPrev.since || run.startedAt,
      lastRunAt: run.finishedAt, lastRunId: run.id, lastRunStatus: run.status,
      nextRunAt: run.nextRunAt, lastRunSummary: run.summary,
      lastRunErrors: run.errors || [], runCount: (autoPrev.runCount || 0) + 1,
      executionMode: 'preview',
    }));

    if (window.DaliaSite && DaliaSite.getDashboard && DaliaSite.buildLiveBundle) {
      var bundle = DaliaSite.buildLiveBundle(DaliaSite.getDashboard());
      if (window.CocoData && CocoData.setBundle) CocoData.setBundle(bundle);
    }
  }

  function runEngine(opts) {
    opts = opts || {};
    var startedAt = new Date().toISOString();
    var runId = 'run-' + Date.now();
    var client = opts.clientId || 'dalia-c-official';
    var site = opts.site || 'dalia-c.com';

    return loadData().then(function (data) {
      var runsStore = readJson(RUNS_KEY, { runs: [] });
      var lastRun = runsStore.lastRun || (runsStore.runs && runsStore.runs[0]) || null;
      var errors = [];
      var dataSources, findings, recommendations, goal, draftAction;

      try {
        dataSources = collectDataSources(data.dashboard, data.workPlan, data.crawl);
        findings = analyzeSiteState({
          dashboard: data.dashboard, workPlan: data.workPlan, crawl: data.crawl,
          lastRun: lastRun, now: startedAt,
        });
        recommendations = buildRecommendations(findings);
        goal = buildGoal(recommendations, findings);
        draftAction = buildDraftAction(recommendations, findings, runId);
      } catch (e) {
        errors.push(String(e && e.message ? e.message : e));
        findings = { pagesTotal: 0, actions: { open: 0, completed: 0, stuck: [], needsApproval: 0 } };
        recommendations = [];
        goal = null;
        draftAction = null;
        dataSources = { sources: {}, missing: ['engine_error'] };
      }

      var finishedAt = new Date().toISOString();
      var run = {
        id: runId, client: client, site: site,
        mode: 'browser', demo: !!opts.demo,
        status: errors.length ? 'error' : 'completed',
        startedAt: startedAt, finishedAt: finishedAt,
        dataSources: dataSources,
        dataChecked: Object.keys(dataSources.sources || {}).filter(function (k) { return dataSources.sources[k].ok; }),
        findings: findings, recommendations: recommendations, goal: goal,
        actionsCreated: draftAction ? [draftAction.id] : [],
        draftAction: draftAction, errors: errors,
        summary: {
          pagesChecked: findings.pagesTotal || 0,
          recommendations: recommendations.length,
          goalsCreated: goal ? 1 : 0,
          actionsCreated: draftAction ? 1 : 0,
          openActions: (findings.actions && findings.actions.open) || 0,
          pagesDown: (findings.pagesDown && findings.pagesDown.length) || 0,
          seoIssues: (findings.seoIssues && findings.seoIssues.length) || 0,
        },
        conclusions: recommendations.map(function (r) { return r.title; }),
        nextRunAt: nextScheduledRun(finishedAt),
      };

      if (!opts.dryRun) persistRun(run, draftAction);

      var report = {
        version: ENGINE_VERSION, generatedAt: finishedAt, runId: runId,
        client: client, site: site, status: run.status, summary: run.summary,
        dataSources: dataSources, findings: findings,
        recommendations: recommendations, goal: goal,
        actionsCreated: run.actionsCreated, errors: errors,
        mode: 'prepare_only', demo: !!opts.demo,
      };

      return { run: run, report: report };
    });
  }

  function getRuns() {
    return readJson(RUNS_KEY, { runs: [] });
  }

  function getAutoModeStats() {
    return readJson(AUTO_MODE_KEY, { prepared: false, enabled: false });
  }

  function formatRunStats(auto) {
    if (!auto || !auto.lastRunAt) return 'טרם רצה';
    var s = auto.lastRunSummary || {};
    var err = (auto.lastRunErrors && auto.lastRunErrors.length) ? (' · ⚠ ' + auto.lastRunErrors.length) : '';
    return 'אחרון: ' + new Date(auto.lastRunAt).toLocaleString('he-IL') +
      ' · המלצות ' + (s.recommendations || 0) +
      ' · פעולות ' + (s.actionsCreated || 0) + err;
  }

  window.DailyEngine = {
    VERSION: ENGINE_VERSION,
    RUNS_KEY: RUNS_KEY,
    DRAFT_ACTIONS_KEY: DRAFT_ACTIONS_KEY,
    run: runEngine,
    getRuns: getRuns,
    getAutoModeStats: getAutoModeStats,
    formatRunStats: formatRunStats,
    nextScheduledRun: nextScheduledRun,
  };
})();
