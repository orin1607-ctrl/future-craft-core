/**
 * Daily Marketing Engine v2 — browser (Staging only).
 * Lightweight · batch pipeline · multi-tenant shape · preview only.
 */
(function () {
  'use strict';

  var ENGINE_VERSION = '2.0.0';
  var PAGE_CHUNK = 5;
  var MAX_RUNS = 30;
  var MAX_DRAFTS = 50;
  var MAX_HISTORY = 100;
  var NOTE_MAX = 200;
  var SLOW_MS = 3000;
  var STUCK_DAYS = 7;

  var RUNS_KEY = 'dalia-daily-engine-runs-v1';
  var DRAFT_ACTIONS_KEY = 'dalia-daily-engine-draft-actions-v1';
  var KEYWORDS_KEY = 'dalia-daily-engine-keywords-v1';
  var AUTO_MODE_KEY = 'dalia-auto-mode-v1';
  var HISTORY_LITE_KEY = 'dalia-daily-engine-history-lite-v1';
  var PROGRESS_LOG_KEY = 'dalia-work-progress-log';

  var DEFAULT_KEYWORDS = [
    'ניהול צי רכב', 'מעקב GPS', 'תחזוקת רכבים', 'דלק וצריכה', 'ביטוח צי',
    'נהגים ורישיונות', 'טלמטיקה', 'Fleet management', 'vehicle tracking', 'תחזוקה מונעת',
  ];

  function readJson(key, fb) {
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fb; } catch (e) { return fb; }
  }
  function writeJson(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* quota */ }
  }
  function safeArr(v) { return Array.isArray(v) ? v : []; }
  function truncateNote(s) {
    var t = String(s || '');
    return t.length > NOTE_MAX ? t.slice(0, NOTE_MAX - 1) + '…' : t;
  }
  function addDays(iso, days) {
    var d = new Date(iso || Date.now());
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString();
  }
  function endOfDayUtc(iso) {
    var d = new Date(iso || Date.now());
    d.setUTCHours(23, 59, 59, 999);
    return d.toISOString();
  }
  function nextScheduledRun(fromIso) {
    var base = fromIso ? new Date(fromIso) : new Date();
    var next = new Date(base.getTime());
    next.setUTCHours(6, 0, 0, 0);
    if (next <= base) next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString();
  }
  function yieldTick() {
    return new Promise(function (resolve) {
      if (typeof requestIdleCallback === 'function') requestIdleCallback(function () { resolve(); }, { timeout: 50 });
      else setTimeout(resolve, 0);
    });
  }
  function inferTopic(kw) {
    var k = String(kw).toLowerCase();
    if (/gps|מעקב|tracking|telematics|טלמטיקה/.test(k)) return 'מעקב וטלמטיקה';
    if (/תחזוק|maintenance/.test(k)) return 'תחזוקה';
    if (/דלק|fuel/.test(k)) return 'דלק וצריכה';
    if (/ביטוח|insurance/.test(k)) return 'ביטוח';
    if (/נהג|driver/.test(k)) return 'נהגים';
    return 'SEO';
  }
  function matchKeyword(page, keywords) {
    var kws = safeArr(keywords);
    if (!kws.length) return { keyword: 'כללי', topic: 'SEO' };
    var text = (String(page.path || page.url || '') + ' ' + String(page.title || page.name || '')).toLowerCase();
    for (var i = 0; i < kws.length; i++) {
      var kw = kws[i];
      var k = String(kw).toLowerCase();
      if (text.indexOf(k) >= 0 || k.split(/\s+/).some(function (p) { return p && text.indexOf(p) >= 0; })) {
        return { keyword: kw, topic: inferTopic(kw) };
      }
    }
    return { keyword: kws[0], topic: inferTopic(kws[0]) };
  }
  function checklistFails(page) {
    var cl = page.checklist || {};
    return Object.keys(cl).filter(function (k) { return cl[k] === 'fail'; });
  }
  function getTenant(opts) {
    return {
      clientId: opts.clientId || 'dalia-c-official',
      businessId: 'dalia-c',
      siteId: 'site-dalia-c',
      domain: opts.site || 'dalia-c.com',
      keywords: getKeywords(opts.clientId),
      schedule: { daily: true, seoRecheckDays: 14, pagespeedDays: 30, reportsDaily: true, reportsWeekly: true },
    };
  }
  function getKeywords(clientId) {
    var store = readJson(KEYWORDS_KEY, {});
    if (store[clientId || 'dalia-c-official']) return store[clientId || 'dalia-c-official'];
    return DEFAULT_KEYWORDS.slice();
  }
  function collectDataSources(dashboard, workPlan, crawl) {
    var conn = (dashboard && dashboard.connections) || {};
    var sources = {
      dashboard: { ok: !!dashboard, mode: 'snapshot' },
      workPlan: { ok: !!(workPlan && workPlan.pages), pages: safeArr(workPlan && workPlan.pages).length },
      crawl: { ok: !!(crawl && crawl.crawl), mode: 'crawl-lite', pages: safeArr(crawl && crawl.crawl && crawl.crawl.pages).length },
      gsc: { ok: !!(conn.searchConsole && conn.searchConsole.ok), mode: 'snapshot' },
      ga4: { ok: !!(conn.analytics4 && conn.analytics4.ok), mode: 'snapshot' },
      gbp: { ok: false, mode: 'not_connected' },
      ads: { ok: false, mode: 'not_connected' },
      pageSpeed: { ok: false, mode: 'not_connected' },
      sheets: { ok: !!(conn.sheets && conn.sheets.ok), mode: 'webhook_if_set', webhook: 'empty' },
      crm: { ok: false, mode: 'local_only' },
      aiAgents: { ok: false, mode: 'skip_live' },
      manual: { ok: true, mode: 'button' },
    };
    var missing = [];
    if (!sources.gbp.ok) missing.push('GBP');
    if (!sources.ads.ok) missing.push('Google Ads');
    if (!sources.pageSpeed.ok) missing.push('PageSpeed API');
    if (sources.sheets.webhook === 'empty') missing.push('Sheets webhook URL');
    if (!sources.aiAgents.ok) missing.push('AI agents live API');
    return { sources: sources, connected: Object.keys(sources).filter(function (k) { return sources[k].ok; }), missing: missing };
  }
  function analyzeChunk(data, keywords, chunkIndex, lastRun) {
    var pages = safeArr(data.workPlan && data.workPlan.pages);
    var actions = safeArr(data.workPlan && data.workPlan.actions);
    var crawlPages = safeArr(data.crawl && data.crawl.crawl && data.crawl.crawl.pages);
    var start = chunkIndex * PAGE_CHUNK;
    var chunk = pages.slice(start, start + PAGE_CHUNK);
    var pagesDown = [], pagesSlow = [], missingContent = [], seoIssues = [], keywordMatches = [];
    crawlPages.forEach(function (cp) {
      if (cp.httpStatus && cp.httpStatus >= 400) pagesDown.push({ path: cp.path, status: cp.httpStatus });
      if (cp.loadTimeMs && cp.loadTimeMs > SLOW_MS) pagesSlow.push({ path: cp.path, loadTimeMs: cp.loadTimeMs });
    });
    chunk.forEach(function (p) {
      var match = matchKeyword(p, keywords);
      keywordMatches.push({ pageId: p.id, path: p.path || p.url, keyword: match.keyword, topic: match.topic });
      var miss = safeArr(p.missing), issues = safeArr(p.issues);
      if (miss.length || issues.length) {
        missingContent.push({ pageId: p.id, path: p.path || p.url, missing: miss.slice(0, 3), issues: issues.slice(0, 3), keyword: match.keyword });
      }
      var fails = checklistFails(p);
      if (fails.length || (p.seoScore != null && p.seoScore < 5)) {
        seoIssues.push({ pageId: p.id, path: p.path || p.url, seoScore: p.seoScore, checklistFails: fails.slice(0, 5), keyword: match.keyword, topic: match.topic });
      }
    });
    var openCount = 0, stuck = [];
    actions.forEach(function (a) {
      var st = String(a.status || 'pending').toLowerCase();
      if (st !== 'done' && st !== 'completed') openCount++;
      if (/in_progress|progress/.test(st) && a.startedAt) {
        var days = (Date.now() - new Date(a.startedAt).getTime()) / 86400000;
        if (days >= STUCK_DAYS) stuck.push({ id: a.id, days: Math.floor(days) });
      }
    });
    var diff = { newIssues: [] };
    if (lastRun && lastRun.findings) {
      var prevSeo = {};
      safeArr(lastRun.findings.seoIssues).forEach(function (x) { prevSeo[x.pageId] = true; });
      seoIssues.forEach(function (x) { if (!prevSeo[x.pageId]) diff.newIssues.push('seo:' + x.pageId); });
    }
    return {
      pagesTotal: pages.length, pagesDown: pagesDown, pagesSlow: pagesSlow,
      missingContent: missingContent, seoIssues: seoIssues, keywordMatches: keywordMatches,
      actions: { open: openCount, stuck: stuck }, diff: diff,
      chunkIndex: chunkIndex, totalChunks: Math.ceil(pages.length / PAGE_CHUNK) || 1,
    };
  }
  function mergeChunks(chunks) {
    var m = { pagesTotal: 0, pagesDown: [], pagesSlow: [], missingContent: [], seoIssues: [], keywordMatches: [], actions: { open: 0, stuck: [] }, diff: { newIssues: [] } };
    safeArr(chunks).forEach(function (c) {
      m.pagesTotal = c.pagesTotal || m.pagesTotal;
      m.pagesDown = m.pagesDown.concat(safeArr(c.pagesDown)).slice(0, 20);
      m.pagesSlow = m.pagesSlow.concat(safeArr(c.pagesSlow)).slice(0, 20);
      m.missingContent = m.missingContent.concat(safeArr(c.missingContent)).slice(0, 20);
      m.seoIssues = m.seoIssues.concat(safeArr(c.seoIssues)).slice(0, 20);
      m.keywordMatches = m.keywordMatches.concat(safeArr(c.keywordMatches));
      if (c.actions) { m.actions.open = c.actions.open || m.actions.open; m.actions.stuck = m.actions.stuck.concat(safeArr(c.actions.stuck)).slice(0, 10); }
      m.diff.newIssues = m.diff.newIssues.concat(safeArr(c.diff && c.diff.newIssues));
    });
    return m;
  }
  function buildRecommendations(findings) {
    var recs = [];
    if (findings.pagesDown.length) recs.push({ id: 'rec-down', priority: 'קריטי', title: findings.pagesDown.length + ' עמודים לא זמינים', detail: findings.pagesDown.map(function (p) { return p.path; }).join(', '), source: 'crawl', slaType: 'urgent' });
    if (findings.seoIssues.length) {
      var top = findings.seoIssues[0];
      recs.push({ id: 'rec-seo-' + top.pageId, priority: 'גבוה', title: 'שיפור SEO — ' + (top.path || top.pageId), detail: 'ציון ' + top.seoScore + ' · ' + (top.keyword || ''), source: 'checklist', keyword: top.keyword, topic: top.topic, slaType: 'seo_followup' });
    }
    if (findings.missingContent.length) {
      var m = findings.missingContent[0];
      recs.push({ id: 'rec-content-' + m.pageId, priority: 'גבוה', title: 'תוכן חסר — ' + (m.path || m.pageId), detail: safeArr(m.missing).concat(safeArr(m.issues)).slice(0, 3).join('; '), source: 'crawl', keyword: m.keyword, topic: inferTopic(m.keyword), slaType: 'normal' });
    }
    if (findings.actions.stuck.length) recs.push({ id: 'rec-stuck', priority: 'בינוני', title: findings.actions.stuck.length + ' פעולות תקועות', detail: findings.actions.stuck.map(function (s) { return s.id; }).join(', '), source: 'workbench', slaType: 'large' });
    if (!recs.length) recs.push({ id: 'rec-routine', priority: 'בינוני', title: 'ביקורת יומית שגרתית', detail: 'המשך מעקב אחר ' + findings.actions.open + ' פעולות פתוחות', source: 'engine', slaType: 'normal' });
    return recs.slice(0, 10);
  }
  function computeSla(type, schedule, now) {
    var openedAt = now || new Date().toISOString();
    var dueAt, recheckAt = null;
    if (type === 'urgent') dueAt = endOfDayUtc(openedAt);
    else if (type === 'large') dueAt = addDays(openedAt, 7);
    else if (type === 'seo_followup') { dueAt = addDays(openedAt, (schedule && schedule.seoRecheckDays) || 14); recheckAt = dueAt; }
    else dueAt = addDays(openedAt, 2);
    return { type: type || 'normal', dueAt: dueAt, openedAt: openedAt, recheckAt: recheckAt };
  }
  function buildGoals(recs, findings, tenant) {
    return recs.slice(0, 5).map(function (rec, i) {
      var target = findings.seoIssues[i] || findings.missingContent[i] || { pageId: 'page-01', path: '/' };
      var match = matchKeyword(target, tenant.keywords);
      return {
        id: 'goal-daily-' + Date.now() + '-' + i,
        clientId: tenant.clientId, siteId: tenant.siteId, pageId: target.pageId || 'page-01',
        keyword: rec.keyword || match.keyword, topic: rec.topic || match.topic,
        priority: rec.priority, reason: truncateNote(rec.detail || rec.title),
        source: rec.source, status: 'pending_approval',
      };
    });
  }
  function buildActions(goals, recs, findings, tenant, runId) {
    return goals.map(function (goal, i) {
      var rec = recs[i] || recs[0] || {};
      var target = findings.seoIssues[i] || findings.missingContent[i] || { pageId: goal.pageId, path: '/' };
      var slaType = rec.slaType || 'normal';
      return {
        id: 'act-daily-' + runId.slice(-8) + (i ? '-' + i : ''),
        name: rec.title || goal.reason, description: truncateNote(rec.detail || goal.reason),
        goalId: goal.id, clientId: tenant.clientId, siteId: tenant.siteId,
        pageId: goal.pageId, pagePath: target.path || '/',
        keyword: goal.keyword, topic: goal.topic, priority: rec.priority || 'גבוה',
        status: 'pending_approval',
        sla: computeSla(slaType, tenant.schedule),
        assignee: null, completionChecklist: 'בדיקת SEO · אישור תוכן · preview',
        source: rec.source || 'daily-engine', createdBy: 'daily-engine',
        created_at: new Date().toISOString(), requiresApproval: true, executionMode: 'preview', runId: runId,
        problem: rec.title, detail: rec.detail, category: 'title', recommendationType: 'title',
      };
    });
  }
  function buildHistoryLite(actions, run, tenant) {
    return safeArr(actions).map(function (a) {
      return {
        client: tenant.clientId, site: tenant.domain, goalId: a.goalId, actionId: a.id,
        status: a.status, date: run.finishedAt, who: 'daily-engine', result: 'draft_created',
        link: a.pagePath || '', commit: '', note: truncateNote(a.name),
      };
    });
  }
  function fetchJson(rel) {
    var base = window.COCO_PAGES_BASE || '/future-craft-core/';
    if (base.charAt(0) !== '/') base = '/' + base.replace(/^\.\//, '');
    return fetch(location.origin + base + rel + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function loadData() {
    if (window.DaliaSite && DaliaSite.getDashboard && DaliaSite.getWorkPlan) {
      var dash = DaliaSite.getDashboard(), wp = DaliaSite.getWorkPlan();
      if (dash && wp) return fetchJson('project-001/site-crawl-lite.json').then(function (crawl) { return { dashboard: dash, workPlan: wp, crawl: crawl }; });
      if (DaliaSite.whenReady) {
        return DaliaSite.whenReady().then(function () {
          return fetchJson('project-001/site-crawl-lite.json').then(function (crawl) {
            return { dashboard: DaliaSite.getDashboard(), workPlan: DaliaSite.getWorkPlan(), crawl: crawl };
          });
        });
      }
    }
    return Promise.all([
      fetchJson('project-001/dashboard.json'),
      fetchJson('project-001/site-work-plan.json'),
      fetchJson('project-001/site-crawl-lite.json'),
    ]).then(function (arr) { return { dashboard: arr[0], workPlan: arr[1], crawl: arr[2] }; });
  }
  function persistState(run, draftActions, historyRows) {
    var runsStore = readJson(RUNS_KEY, { runs: [] });
    runsStore.runs = runsStore.runs || [];
    runsStore.runs.unshift({
      id: run.id, client: run.client, site: run.site,
      startedAt: run.startedAt, finishedAt: run.finishedAt, status: run.status,
      dataChecked: run.dataChecked, conclusions: (run.conclusions || []).slice(0, 5),
      actionsCreated: run.actionsCreated, errors: run.errors,
      summary: run.summary, nextRunAt: run.nextRunAt, phasesSkipped: run.phasesSkipped,
    });
    runsStore.runs = runsStore.runs.slice(0, MAX_RUNS);
    runsStore.lastRun = run;
    writeJson(RUNS_KEY, runsStore);

    if (draftActions && draftActions.length) {
      var drafts = readJson(DRAFT_ACTIONS_KEY, []);
      draftActions.forEach(function (a) {
        if (!drafts.some(function (d) { return d.id === a.id; })) drafts.unshift(a);
      });
      writeJson(DRAFT_ACTIONS_KEY, drafts.slice(0, MAX_DRAFTS));
    }

    var histMerge = safeArr(historyRows).concat(readJson(HISTORY_LITE_KEY, [])).slice(0, MAX_HISTORY);
    writeJson(HISTORY_LITE_KEY, histMerge);

    var progress = readJson(PROGRESS_LOG_KEY, []);
    progress.unshift({
      id: 'engine-' + run.id, title: 'מנוע יומי — הושלם',
      action: run.status === 'completed' ? 'daily_engine' : 'daily_engine_error',
      module: 'אוטומציה', detail: (run.conclusions || []).slice(0, 2).join(' · ') || 'ריצה יומית',
      created_at: run.finishedAt,
    });
    writeJson(PROGRESS_LOG_KEY, progress.slice(0, 100));

    var autoPrev = readJson(AUTO_MODE_KEY, { prepared: false, enabled: false });
    writeJson(AUTO_MODE_KEY, {
      prepared: true, enabled: false, active: false,
      since: autoPrev.since || run.startedAt,
      lastRunAt: run.finishedAt, lastRunId: run.id, lastRunStatus: run.status,
      nextRunAt: run.nextRunAt, currentStage: null,
      counts: {
        recommendations: run.summary.recommendations || 0,
        goalsCreated: run.summary.goalsCreated || 0,
        actionsCreated: run.summary.actionsCreated || 0,
        pendingApproval: run.summary.pendingApproval || 0,
      },
      lastRunErrors: run.errors || [], runCount: (autoPrev.runCount || 0) + 1,
      executionMode: 'preview',
    });

    if (window.DaliaSite && DaliaSite.buildLiveBundle) {
      var bundle = DaliaSite.buildLiveBundle(DaliaSite.getDashboard());
      if (window.CocoData && CocoData.setBundle) CocoData.setBundle(bundle);
    }
  }
  function setAutoProgress(stage, total) {
    var auto = readJson(AUTO_MODE_KEY, {});
    auto.active = true;
    auto.currentStage = stage;
    auto.progress = total;
    writeJson(AUTO_MODE_KEY, auto);
  }
  function runEngineBatched(opts) {
    opts = opts || {};
    var startedAt = new Date().toISOString();
    var runId = 'run-' + Date.now();
    var tenant = getTenant(opts);
    var onProgress = opts.onProgress || function () {};
    var errors = [];

    writeJson(AUTO_MODE_KEY, Object.assign(readJson(AUTO_MODE_KEY, {}), { active: true, currentStage: 'loading', enabled: false }));

    return loadData().then(function (data) {
      onProgress('sources', 1);
      setAutoProgress('sources', 1);
      var dataSources = collectDataSources(data.dashboard, data.workPlan, data.crawl);
      var runsStore = readJson(RUNS_KEY, { runs: [] });
      var lastRun = runsStore.lastRun || (runsStore.runs && runsStore.runs[0]) || null;
      var pages = safeArr(data.workPlan && data.workPlan.pages);
      var totalChunks = Math.ceil(pages.length / PAGE_CHUNK) || 1;
      var chunks = [];
      var chain = Promise.resolve();
      for (var ci = 0; ci < totalChunks; ci++) {
        (function (idx) {
          chain = chain.then(function () {
            return yieldTick().then(function () {
              onProgress('analyze', idx + 1, totalChunks);
              setAutoProgress('analyze ' + (idx + 1) + '/' + totalChunks, Math.round(((idx + 1) / totalChunks) * 60));
              chunks.push(analyzeChunk(data, tenant.keywords, idx, lastRun));
            });
          });
        })(ci);
      }
      return chain.then(function () {
        onProgress('goals', 1);
        setAutoProgress('goals', 70);
        var findings = mergeChunks(chunks);
        var recommendations = buildRecommendations(findings);
        var goals = buildGoals(recommendations, findings, tenant);
        onProgress('actions', 1);
        setAutoProgress('actions', 85);
        var draftActions = buildActions(goals, recommendations, findings, tenant, runId);
        var finishedAt = new Date().toISOString();
        var run = {
          id: runId, client: tenant.clientId, site: tenant.domain,
          mode: 'browser', demo: !!opts.demo, status: errors.length ? 'error' : 'completed',
          startedAt: startedAt, finishedAt: finishedAt,
          dataSources: dataSources, dataChecked: dataSources.connected,
          findings: findings, recommendations: recommendations, goals: goals,
          actionsCreated: draftActions.map(function (a) { return a.id; }),
          draftActions: draftActions, errors: errors,
          summary: {
            pagesChecked: findings.pagesTotal, chunksProcessed: totalChunks,
            recommendations: recommendations.length, goalsCreated: goals.length,
            actionsCreated: draftActions.length, pendingApproval: draftActions.length,
            openActions: findings.actions.open, pagesDown: findings.pagesDown.length,
            seoIssues: findings.seoIssues.length, newIssues: safeArr(findings.diff.newIssues).length,
          },
          conclusions: recommendations.map(function (r) { return r.title; }),
          nextRunAt: nextScheduledRun(finishedAt),
          phasesSkipped: { seo: false, pagespeed: true },
        };
        var historyRows = buildHistoryLite(draftActions, run, tenant);
        if (!opts.dryRun) persistState(run, draftActions, historyRows);
        onProgress('done', 1);
        setAutoProgress(null, 100);
        var report = {
          version: ENGINE_VERSION, generatedAt: finishedAt, runId: runId,
          client: tenant.clientId, site: tenant.domain, status: run.status,
          summary: run.summary, goalsCreated: goals.map(function (g) { return { id: g.id, keyword: g.keyword, topic: g.topic }; }),
          actionsOpened: draftActions.map(function (a) { return { id: a.id, name: a.name, keyword: a.keyword, sla: a.sla }; }),
          pendingApproval: draftActions.length, tomorrowRecommendation: recommendations[0] ? recommendations[0].title : 'מעקב שגרתי',
          mode: 'prepare_only',
        };
        return { run: run, report: report };
      });
    }).catch(function (e) {
      writeJson(AUTO_MODE_KEY, Object.assign(readJson(AUTO_MODE_KEY, {}), { active: false, lastRunErrors: [String(e.message || e)] }));
      throw e;
    });
  }
  function exportHistoryToSheets(webhookUrl) {
    var history = readJson(HISTORY_LITE_KEY, []);
    var payload = { type: 'daily-engine-history', exportedAt: new Date().toISOString(), count: history.length, rows: history };
    if (webhookUrl) {
      return fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function () { return { ok: true, mode: 'webhook', count: history.length }; })
        .catch(function (e) { return { ok: false, mode: 'webhook', error: String(e.message || e) }; });
    }
    var csvHeader = 'client,site,goalId,actionId,status,date,who,result,link,commit,note\n';
    var csvBody = history.map(function (r) {
      return [r.client, r.site, r.goalId, r.actionId, r.status, r.date, r.who, r.result, r.link, r.commit, r.note]
        .map(function (c) { return '"' + String(c || '').replace(/"/g, '""') + '"'; }).join(',');
    }).join('\n');
    var blob = new Blob([csvHeader + csvBody], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'daily-engine-history-' + Date.now() + '.csv';
    a.click();
    return Promise.resolve({ ok: true, mode: 'csv', count: history.length });
  }
  function getRuns() { return readJson(RUNS_KEY, { runs: [] }); }
  function getAutoModeStats() { return readJson(AUTO_MODE_KEY, { prepared: false, enabled: false }); }
  function formatRunStats(auto) {
    if (!auto || !auto.lastRunAt) return 'טרם רצה';
    var c = auto.counts || auto.lastRunSummary || {};
    var err = (auto.lastRunErrors && auto.lastRunErrors.length) ? (' · ⚠ ' + auto.lastRunErrors.length) : '';
    return 'אחרון: ' + new Date(auto.lastRunAt).toLocaleString('he-IL') +
      ' · המלצות ' + (c.recommendations || 0) + ' · פעולות ' + (c.actionsCreated || 0) + err;
  }

  window.DailyEngine = {
    VERSION: ENGINE_VERSION, PAGE_CHUNK: PAGE_CHUNK,
    RUNS_KEY: RUNS_KEY, DRAFT_ACTIONS_KEY: DRAFT_ACTIONS_KEY,
    KEYWORDS_KEY: KEYWORDS_KEY, HISTORY_LITE_KEY: HISTORY_LITE_KEY,
    run: runEngineBatched, runBatched: runEngineBatched,
    getRuns: getRuns, getAutoModeStats: getAutoModeStats, formatRunStats: formatRunStats,
    nextScheduledRun: nextScheduledRun, exportHistoryToSheets: exportHistoryToSheets,
    getKeywords: getKeywords, DEFAULT_KEYWORDS: DEFAULT_KEYWORDS,
  };
})();
