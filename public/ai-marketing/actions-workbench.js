/**
 * Actions Workbench Lite — Staging only. List + per-page workbench; no live site writes.
 */
(function () {
  'use strict';

  var EXECUTION_MODE = 'preview';
  var APPROVAL_KEY = 'dalia-action-approvals-v1';
  var WORKBENCH_KEY = 'dalia-actions-workbench-v1';
  var SEQ_KEY = 'dalia-actions-seq-v1';
  var CONFIG_KEY = 'dalia-actions-export-config-v1';
  var AUTO_MODE_KEY = 'dalia-auto-mode-v1';
  var QA_DEMO_SEED_KEY = 'dalia-qa-demo-seed-v1';
  var QA_DEMO_DEFAULT = {
    version: 1,
    actionId: 'act-page-01-title',
    label: 'FINAL STRICT QA — Demo אושר',
    at: '2026-06-29T00:00:00.000Z',
    session: {
      html: '<div id="dalia-qa-demo-v1" role="status" style="padding:12px;background:#065f46;color:#fff;border-radius:8px;font-weight:700;text-align:center;">✓ FINAL STRICT QA Demo — Staging · אימות מחר בבוקר</div>',
      css: '#dalia-qa-demo-v1{font-family:Heebo,sans-serif}',
      js: '',
    },
    approved: true,
  };
  var _qaDemoActive = null;

  function isOrinStagingHost() {
    try { return /orin1607-ctrl\.github\.io/i.test(location.hostname); } catch (e) { return false; }
  }

  function readQaDemoSeed() {
    if (!isOrinStagingHost()) return null;
    try {
      var raw = localStorage.getItem(QA_DEMO_SEED_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return QA_DEMO_DEFAULT;
  }

  function applyQaDemoSeed(allActions) {
    var seed = readQaDemoSeed();
    if (!seed || !seed.actionId) return;
    _qaDemoActive = seed;
    if (window.ActionsDemoCode) {
      if (seed.session) ActionsDemoCode.setDemo(seed.actionId, seed.session);
      if (seed.approved && ActionsDemoCode.approveDemo) ActionsDemoCode.approveDemo(seed.actionId);
    }
    try { localStorage.setItem(QA_DEMO_SEED_KEY, JSON.stringify(seed)); } catch (e) { /* ignore */ }
  }

  function renderQaDemoBanner() {
    if (!_qaDemoActive) return '';
    return '<div class="alert alert-ok" data-qa-demo-banner="true" style="margin-bottom:12px;border:2px solid var(--green);">' +
      '🎯 <strong>QA Demo:</strong> ' + esc(_qaDemoActive.label || 'Final Strict QA') +
      ' · פעולה <code>' + esc(_qaDemoActive.actionId) + '</code></div>';
  }

  function getAutoModeState() {
    return readJson(AUTO_MODE_KEY, {
      prepared: false, enabled: false, since: null,
      lastRunAt: null, nextRunAt: null, lastRunId: null, lastRunStatus: null,
      lastRunSummary: null, lastRunErrors: [], runCount: 0, executionMode: 'preview',
    });
  }

  function prepareAutoMode() {
    var prev = getAutoModeState();
    writeJson(AUTO_MODE_KEY, Object.assign({}, prev, {
      prepared: true, enabled: false,
      since: prev.since || new Date().toISOString(),
      executionMode: 'preview',
    }));
  }

  function formatAutoModeTitle(auto) {
    if (auto && auto.active) {
      var stage = auto.currentStage ? (' · ' + auto.currentStage) : '';
      var pct = auto.progress != null ? (' ' + auto.progress + '%') : '';
      return 'פעיל' + stage + pct;
    }
    if (!auto || !auto.lastRunAt) return 'תשתית בלבד — לחץ להרצה ידנית';
    var s = auto.counts || auto.lastRunSummary || {};
    var err = (auto.lastRunErrors && auto.lastRunErrors.length) ? (' · שגיאות ' + auto.lastRunErrors.length) : '';
    return 'ריצה ' + (auto.runCount || 1) +
      ' · המלצות ' + (s.recommendations || 0) +
      ' · מטרות ' + (s.goalsCreated || 0) +
      ' · פעולות ' + (s.actionsCreated || 0) +
      ' · ממתין ' + (s.pendingApproval || 0) + err;
  }

  var PREVIEW_TTL_MS = 2 * 60 * 60 * 1000;
  var PAGE_SIZE = 8;

  var _lastRenderActions = [];
  var _lastAllActions = [];
  var _lastBundle = null;
  var _renderDeps = null;
  var _view = 'list';
  var _workbenchPageId = null;
  var _listPage = 0;
  var _expandedActionId = null;
  var _fbSaveTimer = null;

  var WORK_MINUTES_BY_TYPE = {
    title: 15, meta: 20, h1: 25, h2: 30, content: 90, alt: 45, schema: 40,
    cta: 25, forms: 35, internalLinks: 30, pageSpeed: 60, mobile: 45, ux: 50,
    accessibility: 55, performance: 60, conversion: 40, aiAdditional: 30,
    keywords: 20, externalLinks: 25, businessFit: 30,
  };

  var AUTOMATION_FACTOR_BY_TYPE = {
    title: 0.75, meta: 0.75, h1: 0.7, h2: 0.7, content: 0.45, alt: 0.85,
    schema: 0.8, cta: 0.65, forms: 0.5, internalLinks: 0.7, pageSpeed: 0.55,
    mobile: 0.6, ux: 0.5, accessibility: 0.6, performance: 0.55, conversion: 0.5,
    aiAdditional: 0.7, keywords: 0.8, externalLinks: 0.75, businessFit: 0.65,
  };

  var IMPACT_DEFAULTS_BY_TYPE = {
    title: { seo: 'גבוה', ux: 'בינוני', performance: '—', accessibility: '—', leads: 'בינוני', conversions: '—', googleRanking: 'גבוה' },
    meta: { seo: 'גבוה', ux: 'נמוך', performance: '—', accessibility: '—', leads: 'בינוני', conversions: '—', googleRanking: 'גבוה' },
    h1: { seo: 'גבוה', ux: 'גבוה', performance: '—', accessibility: '—', leads: 'בינוני', conversions: '—', googleRanking: 'גבוה' },
    h2: { seo: 'בינוני', ux: 'גבוה', performance: '—', accessibility: '—', leads: '—', conversions: '—', googleRanking: 'בינוני' },
    content: { seo: 'גבוה', ux: 'בינוני', performance: '—', accessibility: '—', leads: 'גבוה', conversions: 'בינוני', googleRanking: 'גבוה' },
    alt: { seo: 'גבוה', ux: 'בינוני', performance: '—', accessibility: 'גבוה', leads: '—', conversions: '—', googleRanking: 'בינוני' },
    schema: { seo: 'גבוה', ux: 'נמוך', performance: '—', accessibility: '—', leads: '—', conversions: '—', googleRanking: 'גבוה' },
    cta: { seo: '—', ux: 'גבוה', performance: '—', accessibility: '—', leads: 'גבוה', conversions: 'גבוה', googleRanking: '—' },
    forms: { seo: '—', ux: 'גבוה', performance: '—', accessibility: 'בינוני', leads: 'גבוה', conversions: 'גבוה', googleRanking: '—' },
    internalLinks: { seo: 'גבוה', ux: 'בינוני', performance: '—', accessibility: '—', leads: '—', conversions: '—', googleRanking: 'גבוה' },
    pageSpeed: { seo: 'בינוני', ux: 'גבוה', performance: 'גבוה', accessibility: '—', leads: '—', conversions: 'בינוני', googleRanking: 'גבוה' },
    mobile: { seo: 'בינוני', ux: 'גבוה', performance: 'גבוה', accessibility: 'בינוני', leads: '—', conversions: 'בינוני', googleRanking: 'בינוני' },
    ux: { seo: '—', ux: 'גבוה', performance: '—', accessibility: 'בינוני', leads: 'בינוני', conversions: 'גבוה', googleRanking: '—' },
    accessibility: { seo: 'בינוני', ux: 'גבוה', performance: '—', accessibility: 'גבוה', leads: '—', conversions: '—', googleRanking: '—' },
    performance: { seo: 'בינוני', ux: 'גבוה', performance: 'גבוה', accessibility: '—', leads: '—', conversions: 'בינוני', googleRanking: 'גבוה' },
    conversion: { seo: '—', ux: 'גבוה', performance: '—', accessibility: '—', leads: 'גבוה', conversions: 'גבוה', googleRanking: '—' },
    keywords: { seo: 'גבוה', ux: '—', performance: '—', accessibility: '—', leads: 'בינוני', conversions: '—', googleRanking: 'גבוה' },
    externalLinks: { seo: 'גבוה', ux: '—', performance: '—', accessibility: '—', leads: '—', conversions: '—', googleRanking: 'בינוני' },
    businessFit: { seo: 'בינוני', ux: 'בינוני', performance: '—', accessibility: '—', leads: 'גבוה', conversions: 'בינוני', googleRanking: 'בינוני' },
    aiAdditional: { seo: 'בינוני', ux: 'בינוני', performance: '—', accessibility: '—', leads: 'בינוני', conversions: 'בינוני', googleRanking: 'בינוני' },
  };

  var IMPACT_FALLBACK = {
    seo: 'בינוני', ux: 'בינוני', performance: '—', accessibility: '—',
    leads: '—', conversions: '—', googleRanking: 'בינוני',
  };

  var SOURCE_LABELS = {
    checklist: 'Checklist', crawl: 'Crawl', gsc: 'GSC', GSC: 'GSC',
    ga4: 'GA4', GA4: 'GA4', ai: 'AI', AI: 'AI', chatgpt: 'ChatGPT', ChatGPT: 'ChatGPT',
  };

  var STATUS_META = {
    pending: { label: '⏳ ממתין', cls: 'badge-yellow' },
    in_progress: { label: '📝 בביצוע', cls: 'badge-purple' },
    approved_for_execution: { label: '✓ מאושר לביצוע', cls: 'badge-green' },
    done: { label: '● הושלם', cls: 'badge-green' },
    not_done: { label: '✗ לא בוצע', cls: 'badge-red' },
    deferred: { label: '⏸ נדחה', cls: 'badge-gray' },
    needs_review: { label: '👁 דורש בדיקה', cls: 'badge-yellow' },
    error: { label: '⚠ שגיאה', cls: 'badge-red' },
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escAttr(s) {
    return esc(s).replace(/'/g, '&#39;');
  }

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
  }

  function getApprovals() { return readJson(APPROVAL_KEY, {}); }

  function saveApproval(actionId, status) {
    var map = getApprovals();
    map[actionId] = { status: status, at: new Date().toISOString(), mode: EXECUTION_MODE };
    writeJson(APPROVAL_KEY, map);
  }

  function approvalStatus(actionId) {
    var a = getApprovals()[actionId];
    return a && a.status ? a.status : null;
  }

  function getWorkbenchStore() { return readJson(WORKBENCH_KEY, { items: {}, pages: {} }); }

  function saveWorkbenchStore(store) { writeJson(WORKBENCH_KEY, store); }

  function getActionFeedback(actionId) {
    var store = getWorkbenchStore();
    if (!store.items[actionId]) {
      store.items[actionId] = {
        liked: '', disliked: '', changeRequests: '', userNotes: '',
        chat: [], revisionRound: 1, updatedAt: null,
        assignee: '', openedAt: null, completedAt: null, workflowStatus: null,
        filesNote: '',
      };
    }
    return store.items[actionId];
  }

  function saveActionFeedback(actionId, patch) {
    var store = getWorkbenchStore();
    var fb = getActionFeedback(actionId);
    Object.keys(patch || {}).forEach(function (k) { fb[k] = patch[k]; });
    fb.updatedAt = new Date().toISOString();
    store.items[actionId] = fb;
    saveWorkbenchStore(store);
  }

  function getSeqState() { return readJson(SEQ_KEY, { nextActionItemNumber: 1, assignments: {} }); }

  function saveSeqState(state) { writeJson(SEQ_KEY, state); }

  function getExportConfig() { return readJson(CONFIG_KEY, { sheetsWebhookUrl: '' }); }

  function saveExportConfig(patch) {
    var cfg = getExportConfig();
    Object.keys(patch || {}).forEach(function (k) { cfg[k] = patch[k]; });
    writeJson(CONFIG_KEY, cfg);
    return cfg;
  }

  function sortActionsForNumbering(actions) {
    return actions.slice().sort(function (a, b) {
      var pa = String(a.pagePath || a.pageId || '');
      var pb = String(b.pagePath || b.pageId || '');
      if (pa !== pb) return pa.localeCompare(pb);
      var ra = String(a.recommendationType || a.category || '');
      var rb = String(b.recommendationType || b.category || '');
      if (ra !== rb) return ra.localeCompare(rb);
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
  }

  function bootstrapSequenceNumbers(allActions) {
    var state = getSeqState();
    var sorted = sortActionsForNumbering(allActions);
    var changed = false;
    sorted.forEach(function (a) {
      if (!a.id || state.assignments[a.id]) return;
      state.assignments[a.id] = state.nextActionItemNumber;
      state.nextActionItemNumber += 1;
      changed = true;
    });
    if (changed) saveSeqState(state);
    return state;
  }

  function getActionNumber(actionId) {
    return getSeqState().assignments[actionId] || null;
  }

  function getPageRevisionRound(pageId, actions) {
    var max = 1;
    (actions || []).forEach(function (a) {
      var fb = getActionFeedback(a.id);
      if (fb.revisionRound > max) max = fb.revisionRound;
    });
    var store = getWorkbenchStore();
    if (store.pages[pageId] && store.pages[pageId].revisionRound > max) {
      max = store.pages[pageId].revisionRound;
    }
    return max;
  }

  function isDoneStatus(s) {
    return s === 'done' || s === 'completed';
  }

  function resolveActionStatus(action) {
    var appr = approvalStatus(action.id);
    if (appr === 'approved_for_execution') return 'approved_for_execution';
    var fb = getActionFeedback(action.id);
    if (fb.workflowStatus && STATUS_META[fb.workflowStatus]) return fb.workflowStatus;
    var s = String(action.status || 'pending').toLowerCase();
    if (isDoneStatus(s)) return 'done';
    if (STATUS_META[s]) return s;
    if (/in_progress|progress/.test(s)) return 'in_progress';
    if (/not_done|not done/.test(s)) return 'not_done';
    if (/deferred/.test(s)) return 'deferred';
    if (/needs_review|review/.test(s)) return 'needs_review';
    if (/error|fail/.test(s)) return 'error';
    return 'pending';
  }

  function sourceBadge(src) {
    var label = SOURCE_LABELS[src] || src || '—';
    var cls = 'badge-gray';
    if (/gsc/i.test(label)) cls = 'badge-green';
    else if (/ga4/i.test(label)) cls = 'badge-purple';
    else if (/crawl/i.test(label)) cls = 'badge-yellow';
    else if (/checklist/i.test(label)) cls = 'badge-blue';
    else if (/ai|chatgpt/i.test(label)) cls = 'badge-purple';
    return '<span class="badge ' + cls + '">' + esc(label) + '</span>';
  }

  function priorityBadge(p) {
    var s = String(p || 'בינוני');
    if (/גבוה|קריטי|high/i.test(s)) return '<span class="badge badge-red">' + esc(s) + '</span>';
    if (/נמוך|low/i.test(s)) return '<span class="badge badge-gray">' + esc(s) + '</span>';
    return '<span class="badge badge-yellow">' + esc(s) + '</span>';
  }

  function statusBadgeFor(code) {
    var m = STATUS_META[code] || STATUS_META.pending;
    return '<span class="badge ' + m.cls + '">' + esc(m.label) + '</span>';
  }

  function actionStatusBadge(action) {
    return statusBadgeFor(resolveActionStatus(action));
  }

  function buildBeforeAfterFallback(page, action) {
    if (action.beforeAfter && action.beforeAfter.current) {
      var ba = action.beforeAfter;
      var enriched = parseImpactFields(ba, action);
      ba.impact = formatImpactString(enriched);
      return ba;
    }
    var rec = (page.recommendations || []).find(function (r) {
      return r.typeId === action.recommendationType;
    });
    var stub = {
      current: action.detail || 'מצב נוכחי — ראה פירוט',
      problem: rec ? (rec.status === 'fail' ? rec.labelHe + ' לא תקין' : rec.detail) : action.detail,
      proposed: action.detail || '—',
      after: action.detail || 'יושם לפי ההמלצה',
      why: action.detail || 'שיפור מומלץ לפי ביקורת',
      impact: '',
      source: action.source,
    };
    stub.impact = formatImpactString(parseImpactFields(stub, action));
    return stub;
  }

  function formatHebrewDuration(minutes) {
    var m = Math.max(0, Math.round(Number(minutes) || 0));
    if (m < 60) return m + ' דק׳';
    var h = Math.floor(m / 60);
    var r = m % 60;
    if (r === 0) return h + ' שע׳';
    return h + ' שע׳ ' + r + ' דק׳';
  }

  function getEstimatedWorkMinutes(action) {
    if (!action) return 30;
    if (action.estimatedWorkMinutes) return Number(action.estimatedWorkMinutes);
    if (action.estimatedMinutes) return Number(action.estimatedMinutes);
    if (action.estHours) return Math.round(Number(action.estHours) * 60);
    var type = String(action.recommendationType || action.category || '').toLowerCase();
    var base = WORK_MINUTES_BY_TYPE[type] || 30;
    var pri = String(action.urgency || action.priority || 'בינוני');
    if (/גבוה|קריטי|high/i.test(pri)) base = Math.round(base * 1.2);
    else if (/נמוך|low/i.test(pri)) base = Math.round(base * 0.85);
    return base;
  }

  function getAutomationFactor(action) {
    if (!action) return 0.7;
    var type = String(action.recommendationType || action.category || '').toLowerCase();
    return AUTOMATION_FACTOR_BY_TYPE[type] != null ? AUTOMATION_FACTOR_BY_TYPE[type] : 0.7;
  }

  function computeTimeSummary(actions) {
    var totalMin = 0;
    var savedMin = 0;
    (actions || []).forEach(function (a) {
      var w = getEstimatedWorkMinutes(a);
      totalMin += w;
      savedMin += Math.round(w * getAutomationFactor(a));
    });
    return { totalMin: totalMin, savedMin: savedMin, manualMin: Math.max(0, totalMin - savedMin) };
  }

  function renderTimeSummaryBar(summary, compact) {
    if (!summary || !summary.totalMin) return '';
    return '<div class="coco-act-time-summary' + (compact ? ' coco-act-time-compact' : '') + '" role="status">' +
      '<span class="coco-act-time-item"><strong>⏱ סה״כ עבודה:</strong> ' + formatHebrewDuration(summary.totalMin) + '</span>' +
      '<span class="coco-act-time-item"><strong>🤖 חיסכון אוטומציה:</strong> ' + formatHebrewDuration(summary.savedMin) + '</span>' +
      '<span class="coco-act-time-item"><strong>👤 ידני:</strong> ' + formatHebrewDuration(summary.manualMin) + '</span>' +
      '</div>';
  }

  function coalesceImpact(parsed, fallback) {
    return parsed && parsed !== '—' ? parsed : (fallback || 'בינוני');
  }

  function formatImpactString(impact) {
    if (!impact) return '—';
    return 'SEO: ' + impact.seo + ' · UX: ' + impact.ux + ' · ביצועים: ' + impact.performance +
      ' · נגישות: ' + impact.accessibility + ' · לידים: ' + impact.leads +
      ' · המרות: ' + impact.conversions + ' · דירוג בגוגל: ' + impact.googleRanking;
  }

  function previewBanner() {
    return '<div class="coco-act-preview-banner" role="status">' +
      '⚠️ <strong>מצב תצוגה בלבד</strong> — אישור ביצוע לא משנה את האתר החי · Staging preview · ' +
      '<code style="font-size:10px;opacity:0.85;">' + esc(EXECUTION_MODE) + '</code></div>';
  }

  function extractImpactLevel(text, keys) {
    var s = String(text || '');
    var i;
    for (i = 0; i < keys.length; i++) {
      var re = new RegExp(keys[i] + '\\s*[:：]?\\s*(גבוה|בינוני|נמוך|high|medium|low)', 'i');
      var m = s.match(re);
      if (m) return m[1];
      if (new RegExp(keys[i], 'i').test(s) && /גבוה|high/i.test(s)) return 'גבוה';
    }
    return '—';
  }

  function parseImpactFields(ba, action) {
    var s = [ba.impact, ba.why, action && action.detail, action && action.problem].filter(Boolean).join(' · ');
    var type = String((action && action.recommendationType) || (action && action.category) || '').toLowerCase();
    var defaults = IMPACT_DEFAULTS_BY_TYPE[type] || IMPACT_FALLBACK;
    var work = getEstimatedWorkMinutes(action);
    return {
      workMinutes: work,
      workFormatted: formatHebrewDuration(work),
      seo: coalesceImpact(extractImpactLevel(s, ['SEO', 'seo']), defaults.seo),
      ux: coalesceImpact(extractImpactLevel(s, ['UX', 'ux']), defaults.ux),
      performance: coalesceImpact(extractImpactLevel(s, ['ביצועים', 'performance', 'מהירות', 'pageSpeed', 'Performance']), defaults.performance),
      accessibility: coalesceImpact(extractImpactLevel(s, ['נגישות', 'accessibility', 'a11y', 'alt']), defaults.accessibility),
      leads: coalesceImpact(extractImpactLevel(s, ['לידים', 'leads']), defaults.leads),
      conversions: coalesceImpact(extractImpactLevel(s, ['המרות', 'conversion', 'המרה', 'conversions']), defaults.conversions),
      googleRanking: coalesceImpact(extractImpactLevel(s, ['דירוג בגוגל', 'דירוג', 'ranking', 'google', 'גוגל']), defaults.googleRanking),
      raw: ba.impact || formatImpactString(defaults),
    };
  }

  function impactLevelClass(level) {
    if (/גבוה|high/i.test(String(level))) return 'badge-red';
    if (/נמוך|low/i.test(String(level))) return 'badge-gray';
    if (level && level !== '—') return 'badge-yellow';
    return 'badge-gray';
  }

  function renderImpactBadges(impact, compact) {
    if (!impact) return '';
    var items = [
      ['⏱', 'זמן עבודה', impact.workFormatted || formatHebrewDuration(impact.workMinutes), 'badge-blue'],
      ['SEO', 'SEO', impact.seo, impactLevelClass(impact.seo)],
      ['UX', 'UX', impact.ux, impactLevelClass(impact.ux)],
      ['⚡', 'ביצועים', impact.performance, impactLevelClass(impact.performance)],
      ['♿', 'נגישות', impact.accessibility, impactLevelClass(impact.accessibility)],
      ['📈', 'לידים', impact.leads, impactLevelClass(impact.leads)],
      ['🎯', 'המרות', impact.conversions, impactLevelClass(impact.conversions)],
      ['🔍', 'דירוג בגוגל', impact.googleRanking, impactLevelClass(impact.googleRanking)],
    ];
    return '<div class="coco-act-impact-badges' + (compact ? ' coco-act-impact-compact' : '') + '">' +
      items.map(function (row) {
        return '<span class="coco-act-impact-item" title="' + esc(row[1]) + '">' +
          '<span class="badge ' + row[3] + ' coco-act-impact-badge">' +
          row[0] + ' ' + esc(String(row[2])) + '</span></span>';
      }).join('') + '</div>';
  }

  function renderBeforeAfter(ba, itemNum, action) {
    var impact = parseImpactFields(ba, action);
    var numBadge = itemNum
      ? '<span class="coco-act-item-num badge badge-purple" title="מספר פריט יציב">#' + itemNum + '</span> '
      : '';
    return numBadge +
      '<div class="coco-act-ba-grid">' +
      '<div class="coco-act-ba-box coco-act-ba-before">' +
      '<div class="coco-act-ba-label">מצב נוכחי</div>' +
      '<div class="coco-act-ba-text">' + esc(ba.current) + '</div>' +
      '<div class="coco-act-ba-sub"><strong>הבעיה:</strong> ' + esc(ba.problem) + '</div>' +
      '</div>' +
      '<div class="coco-act-ba-box coco-act-ba-after">' +
      '<div class="coco-act-ba-label">אחרי התיקון (צפי)</div>' +
      '<div class="coco-act-ba-text">' + esc(ba.after) + '</div>' +
      '<div class="coco-act-ba-sub"><strong>המלצה:</strong> ' + esc(ba.proposed) + '</div>' +
      '</div></div>' +
      '<div class="coco-act-ba-meta">' +
      '<div><strong>למה:</strong> ' + esc(ba.why) + '</div>' +
      renderImpactBadges(impact) +
      '</div>';
  }

  function fbField(field, label, value, actionId) {
    return '<label class="coco-act-fb-field">' +
      '<span class="coco-act-fb-label">' + esc(label) + '</span>' +
      '<textarea rows="2" class="coco-act-fb-input" data-fb-field="' + field + '" data-fb-action="' + escAttr(actionId) + '">' +
      esc(value || '') + '</textarea></label>';
  }

  function renderFeedbackPanel(action, page, itemNum) {
    var fb = getActionFeedback(action.id);
    var ba = buildBeforeAfterFallback(page, action);
    var aiRec = [ba.proposed, ba.why, ba.impact].filter(Boolean).join(' · ');
    var chatHtml = (fb.chat || []).slice(-6).map(function (m) {
      var cls = m.role === 'user' ? 'coco-act-chat-user' : 'coco-act-chat-ai';
      return '<div class="coco-act-chat-msg ' + cls + '">' + esc(m.text) + '</div>';
    }).join('');

    return '<div class="coco-act-feedback" data-action-id="' + escAttr(action.id) + '">' +
      '<div class="coco-act-fb-head">' +
      '<span class="coco-act-fb-title">💬 משוב ושיחה · פריט #' + (itemNum || '—') + '</span>' +
      '<span class="badge badge-gray coco-act-rev-badge">סבב ' + fb.revisionRound + '</span>' +
      '</div>' +
      '<div class="coco-act-fb-grid">' +
      fbField('liked', 'מה אהבתי', fb.liked, action.id) +
      fbField('disliked', 'מה לא אהבתי', fb.disliked, action.id) +
      fbField('changeRequests', 'מה צריך לשנות', fb.changeRequests, action.id) +
      fbField('userNotes', 'הערות שלי', fb.userNotes, action.id) +
      '</div>' +
      '<div class="coco-act-ai-rec-box">' +
      '<div class="coco-act-ai-rec-label">🤖 המלצות AI</div>' +
      '<div class="coco-act-ai-rec-text">' + esc(aiRec || action.detail || '—') + '</div>' +
      '</div>' +
      '<div class="coco-act-page-chat">' +
      '<div class="coco-act-page-chat-label">שיחה עם AI על העמוד בלבד</div>' +
      '<div class="coco-act-chat-log" data-chat-log="' + escAttr(action.id) + '">' +
      (chatHtml || '<div class="coco-act-chat-empty">שאל על השינוי המוצע, ההשפעה, או בקש תיקון לפריט #' + (itemNum || '') + '</div>') +
      '</div>' +
      '<div class="coco-act-chat-input-row">' +
      '<input type="text" class="coco-act-chat-input filter-input" data-chat-input="' + escAttr(action.id) + '" ' +
      'placeholder="שאל על ' + escAttr(page.path || 'העמוד') + '…" aria-label="שיחה עם AI">' +
      '<button type="button" class="btn btn-primary coco-act-btn-sm coco-act-chat-send" data-chat-send="' + escAttr(action.id) + '">שלח</button>' +
      '</div></div></div>';
  }

  function getPagePriorityLabel(actions) {
    var high = false;
    var low = false;
    (actions || []).forEach(function (a) {
      var p = String(a.urgency || a.priority || 'בינוני');
      if (/גבוה|קריטי|high/i.test(p)) high = true;
      if (/נמוך|low/i.test(p)) low = true;
    });
    if (high) return 'גבוה';
    if (low && !high) return 'נמוך';
    return 'בינוני';
  }

  function getPageStatusSummary(actions) {
    var counts = {};
    (actions || []).forEach(function (a) {
      var st = resolveActionStatus(a);
      counts[st] = (counts[st] || 0) + 1;
    });
    var parts = Object.keys(counts).map(function (k) {
      return (STATUS_META[k] ? STATUS_META[k].label : k) + ' ×' + counts[k];
    });
    return parts.length ? parts.join(' · ') : '—';
  }

  function renderLitePageCard(page, openActions, doneCount, idx) {
    var pageTime = computeTimeSummary(openActions);
    var approvedCount = openActions.filter(function (a) {
      return approvalStatus(a.id) === 'approved_for_execution';
    }).length;
    var pageUrl = page.url || page.pageUrl || '#';

    return '<div class="coco-act-lite-card coco-act-page-card card" data-page-id="' + escAttr(page.id) + '" data-page-idx="' + idx + '">' +
      '<div class="coco-act-lite-card-head">' +
      '<div class="coco-act-lite-card-info">' +
      '<div class="coco-act-lite-card-title">#' + (page.rank || idx + 1) + ' · ' + esc(page.title || page.path) + '</div>' +
      '<div class="coco-act-lite-card-meta">' +
      '<a href="' + esc(pageUrl) + '" target="_blank" rel="noopener" class="coco-act-path-link">' + esc(page.path) + ' ↗</a>' +
      '</div>' +
      '<div class="coco-act-lite-card-stats">' +
      '<span class="coco-act-lite-stat"><strong>פתוח:</strong> ' + openActions.length + '</span>' +
      '<span class="coco-act-lite-stat"><strong>הושלם:</strong> ' + doneCount + '</span>' +
      '<span class="coco-act-lite-stat">' + priorityBadge(getPagePriorityLabel(openActions)) + '</span>' +
      '<span class="coco-act-lite-stat coco-act-lite-status-line">' + esc(getPageStatusSummary(openActions)) + '</span>' +
      (pageTime.totalMin ? '<span class="coco-act-lite-stat"><strong>⏱</strong> ' + esc(formatHebrewDuration(pageTime.totalMin)) + '</span>' : '') +
      (approvedCount ? '<span class="badge badge-green" style="font-size:10px;">' + approvedCount + ' מאושרים</span>' : '') +
      '</div></div>' +
      '<div class="coco-act-lite-card-btns">' +
      '<a href="' + esc(pageUrl) + '" target="_blank" rel="noopener" class="btn btn-ghost coco-act-btn-sm">👁️ עמוד חי</a>' +
      '<button type="button" class="btn btn-primary coco-act-btn-sm" data-act-open-wb="' + escAttr(page.id) + '">פתח שולחן עבודה</button>' +
      '</div></div>';
  }

  function renderPagination(totalItems, currentPage) {
    var totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    if (totalPages <= 1) return '';
    var html = '<nav class="coco-act-lite-pagination" aria-label="דפדוף עמודים">';
    for (var p = 0; p < totalPages; p++) {
      html += '<button type="button" class="coco-act-lite-page-btn' + (p === currentPage ? ' coco-act-lite-page-active' : '') + '" data-act-list-page="' + p + '">' + (p + 1) + '</button>';
    }
    html += '<span class="coco-act-lite-page-info">' + (currentPage + 1) + '/' + totalPages + ' · ' + totalItems + ' עמודים</span></nav>';
    return html;
  }

  function renderExportBar() {
    var cfg = getExportConfig();
    var auto = getAutoModeState();
    var autoBadge = '';
    if (auto.lastRunAt) {
      autoBadge = ' <span class="badge badge-gray" style="font-size:9px;">' + esc(formatAutoModeTitle(auto)) + '</span>';
    } else if (auto.prepared) {
      autoBadge = ' <span class="badge badge-gray" style="font-size:9px;">תשתית</span>';
    }
    var nextHint = auto.nextRunAt ? (' · הבא: ' + formatDateHe(auto.nextRunAt)) : '';
    return '<div class="coco-act-lite-export-bar">' +
      '<button type="button" class="btn btn-ghost coco-act-btn-sm" data-act-export-csv>📥 ייצוא CSV</button>' +
      '<button type="button" class="btn btn-ghost coco-act-btn-sm" data-act-auto-mode title="' + escAttr(formatAutoModeTitle(auto) + nextHint) + '">' +
      '🤖 מצב אוטומטי' + autoBadge + '</button>' +
      '<label class="coco-act-lite-sheets-label">' +
      '<span>Google Sheets webhook:</span>' +
      '<input type="url" class="filter-input coco-act-lite-sheets-input" data-act-sheets-url placeholder="https://script.google.com/…" value="' + escAttr(cfg.sheetsWebhookUrl || '') + '">' +
      '</label></div>';
  }

  function ensureActionOpened(actionId) {
    var fb = getActionFeedback(actionId);
    if (!fb.openedAt) saveActionFeedback(actionId, { openedAt: new Date().toISOString() });
  }

  function markActionDone(actionId) {
    saveActionFeedback(actionId, {
      workflowStatus: 'done',
      completedAt: new Date().toISOString(),
    });
    if (typeof showToast === 'function') showToast('✓ המשימה סומנה כהושלמה');
    rerender();
  }

  function formatDateHe(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }); }
    catch (e) { return iso; }
  }

  function renderActionNav(sorted, currentId) {
    if (!currentId || !sorted.length) return '';
    var idx = sorted.findIndex(function (a) { return a.id === currentId; });
    if (idx < 0) return '';
    var prev = idx > 0 ? sorted[idx - 1] : null;
    var next = idx < sorted.length - 1 ? sorted[idx + 1] : null;
    return '<div class="coco-act-work-nav">' +
      (prev
        ? '<button type="button" class="btn btn-ghost coco-act-btn-sm" data-act-nav="' + escAttr(prev.id) + '">← #' + getActionNumber(prev.id) + '</button>'
        : '<span class="coco-act-work-nav-spacer"></span>') +
      '<span class="coco-act-work-nav-pos">' + (idx + 1) + ' / ' + sorted.length + '</span>' +
      (next
        ? '<button type="button" class="btn btn-ghost coco-act-btn-sm" data-act-nav="' + escAttr(next.id) + '">#' + getActionNumber(next.id) + ' →</button>'
        : '<span class="coco-act-work-nav-spacer"></span>') +
      '</div>';
  }

  function renderActionWorkCardBody(action, page, sorted, ba, approved, itemNum, fb, st, taskName, taskDesc, taskGoal) {
    var panelId = 'coco-act-acc-' + escAttr(action.id);
    return '<div id="' + panelId + '" class="coco-act-work-card-body coco-act-lite-acc-panel">' +
      renderActionNav(sorted, action.id) +
      '<div class="coco-act-work-grid">' +
      '<div class="coco-act-work-field coco-act-work-field-full">' +
      '<span class="coco-act-work-label">שם המשימה</span>' +
      '<div class="coco-act-work-value">' + esc(taskName) + '</div></div>' +
      '<div class="coco-act-work-field coco-act-work-field-full">' +
      '<span class="coco-act-work-label">תיאור המשימה</span>' +
      '<div class="coco-act-work-value">' + esc(taskDesc) + '</div></div>' +
      '<div class="coco-act-work-field coco-act-work-field-full">' +
      '<span class="coco-act-work-label">מטרת המשימה</span>' +
      '<div class="coco-act-work-value">' + esc(taskGoal) + '</div></div>' +
      '<div class="coco-act-work-field"><span class="coco-act-work-label">סדר ביצוע</span>' +
      '<div class="coco-act-work-value"><strong>#' + (itemNum || '—') + '</strong></div></div>' +
      '<div class="coco-act-work-field"><span class="coco-act-work-label">מקור</span>' +
      '<div class="coco-act-work-value">' + sourceBadge(action.source) + ' ' + priorityBadge(action.urgency || action.priority) + '</div></div>' +
      '<div class="coco-act-work-field"><span class="coco-act-work-label">סטטוס</span>' +
      '<select class="filter-select coco-act-work-select" data-act-status="' + escAttr(action.id) + '">' +
      ['pending', 'in_progress', 'done', 'needs_review', 'deferred', 'not_done'].map(function (k) {
        return '<option value="' + k + '"' + (st === k ? ' selected' : '') + '>' + (STATUS_META[k] ? STATUS_META[k].label : k) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="coco-act-work-field"><span class="coco-act-work-label">מי ביצע</span>' +
      '<input class="filter-input" data-act-meta="assignee" data-act-meta-id="' + escAttr(action.id) + '" value="' + escAttr(fb.assignee || '') + '" placeholder="שם המבצע"></div>' +
      '<div class="coco-act-work-field"><span class="coco-act-work-label">תאריך פתיחה</span>' +
      '<div class="coco-act-work-value">' + formatDateHe(fb.openedAt) + '</div></div>' +
      '<div class="coco-act-work-field"><span class="coco-act-work-label">תאריך סיום</span>' +
      '<div class="coco-act-work-value">' + formatDateHe(fb.completedAt) + '</div></div>' +
      '</div>' +
      '<div class="coco-act-work-section">' +
      '<span class="coco-act-work-section-title">הערות</span>' +
      fbField('userNotes', 'הערות עבודה', fb.userNotes, action.id) +
      fbField('changeRequests', 'בקשות שינוי', fb.changeRequests, action.id) +
      '</div>' +
      '<div class="coco-act-work-section">' +
      '<span class="coco-act-work-section-title">קישור / קובץ (טקסט בלבד)</span>' +
      '<label class="coco-act-fb-field"><span class="coco-act-fb-label">קישור או תיאור קובץ</span>' +
      '<input class="filter-input" data-act-meta="filesNote" data-act-meta-id="' + escAttr(action.id) + '" value="' + escAttr(fb.filesNote || '') + '"></label>' +
      '</div>' +
      (window.ActionsDemoCode ? ActionsDemoCode.renderDemoSection(action.id, true) : '') +
      renderBeforeAfter(ba, itemNum, action) +
      renderFeedbackPanel(action, page, itemNum) +
      '<div class="coco-act-work-actions">' +
      '<button type="button" class="btn btn-green coco-act-btn-sm" data-act-mark-done="' + escAttr(action.id) + '">✓ סמן הושלם</button>' +
      '<button type="button" class="btn btn-ghost coco-act-btn-sm" data-demo-open="' + escAttr(action.id) + '">📋 קוד לדemo</button>' +
      (approved
        ? '<span class="badge badge-green">✓ מאושר לביצוע · ' + esc(formatDateHe(getApprovals()[action.id].at)) + '</span>' +
          ' <button type="button" class="btn btn-ghost coco-act-btn-sm" data-act-revoke="' + escAttr(action.id) + '">↩ בטל אישור</button>'
        : '<button type="button" class="btn btn-primary coco-act-btn-sm" data-act-approve="' + escAttr(action.id) + '">✅ אישור לביצוע</button>') +
      ' <span class="coco-act-approval-note">Staging בלבד · לא משנה dalia-c.com</span>' +
      '</div></div>';
  }

  function renderActionWorkCard(action, page, expanded, sorted) {
    var ba = buildBeforeAfterFallback(page, action);
    var appr = approvalStatus(action.id);
    var approved = appr === 'approved_for_execution';
    var itemNum = getActionNumber(action.id);
    var fb = getActionFeedback(action.id);
    var st = resolveActionStatus(action);
    var panelId = 'coco-act-acc-' + escAttr(action.id);
    var impact = parseImpactFields(ba, action);
    var taskName = action.category || action.title || 'משימה';
    var taskDesc = action.detail || ba.proposed || ba.current || '—';
    var taskGoal = ba.why || action.problem || 'שיפור לפי המלצות המטרות';

    if (expanded) ensureActionOpened(action.id);

    var html = '<article class="coco-act-work-card coco-act-lite-acc-item' + (expanded ? ' coco-act-lite-acc-open' : '') + '" data-action-id="' + escAttr(action.id) + '">' +
      '<button type="button" class="coco-act-lite-acc-head coco-act-work-card-head" data-act-acc-toggle="' + escAttr(action.id) + '" aria-expanded="' + (expanded ? 'true' : 'false') + '"' +
      (expanded ? ' aria-controls="' + panelId + '"' : '') + '>' +
      '<span class="coco-act-lite-acc-chevron">' + (expanded ? '▲' : '▼') + '</span>' +
      (itemNum ? '<span class="coco-act-num-tag">#' + itemNum + '</span>' : '') +
      '<span class="coco-act-work-card-name">' + esc(taskName) + '</span>' +
      '<span class="badge badge-blue coco-act-work-badge">⏱ ' + esc(impact.workFormatted) + '</span> ' +
      statusBadgeFor(st) +
      '<span class="coco-act-work-card-order">סדר: ' + (itemNum || '—') + '</span>' +
      '</button>';

    if (expanded) {
      html += renderActionWorkCardBody(action, page, sorted, ba, approved, itemNum, fb, st, taskName, taskDesc, taskGoal);
    }

    return html + '</article>';
  }

  function renderActionAccordionItem(action, page, expanded, sorted) {
    return renderActionWorkCard(action, page, expanded, sorted || []);
  }

  function renderWorkbenchView(page, openActions) {
    var pageUrl = page.url || page.pageUrl || '#';
    var pageTime = computeTimeSummary(openActions);
    var revRound = getPageRevisionRound(page.id, openActions);
    var sorted = openActions.slice().sort(function (a, b) {
      return (getActionNumber(a.id) || 9999) - (getActionNumber(b.id) || 9999);
    });

    return '<div class="coco-act-lite-wb">' +
      '<div class="coco-act-lite-wb-top">' +
      '<button type="button" class="btn btn-ghost coco-act-btn-sm" data-act-back-list>← חזרה לרשימה</button>' +
      '<div class="coco-act-lite-wb-head">' +
      '<div class="coco-act-lite-wb-title">שולחן עבודה · ' + esc(page.title || page.path) + '</div>' +
      '<div class="coco-act-lite-wb-meta">' +
      '<a href="' + esc(pageUrl) + '" target="_blank" rel="noopener" class="coco-act-path-link">' + esc(page.path) + ' ↗ עמוד חי</a>' +
      ' · <strong>' + openActions.length + '</strong> פעולות · <span class="badge badge-gray">סבב ' + revRound + '</span>' +
      '</div>' +
      renderTimeSummaryBar(pageTime, true) +
      '</div>' +
      '<div class="coco-act-lite-wb-tools">' +
      '<button type="button" class="btn btn-ghost coco-act-btn-sm" data-act-lite-preview="' + escAttr(page.id) + '">🔍 תצוגה מקדימה (HTML/CSS/JS)</button>' +
      '</div>' +
      renderExportBar() +
      '</div>' +
      '<div class="coco-act-lite-acc-list">' +
      (sorted.length
        ? sorted.map(function (a) {
          return renderActionAccordionItem(a, page, _expandedActionId === a.id, sorted);
        }).join('')
        : '<div class="alert alert-ok">אין פעולות פתוחות לעמוד זה 🎉</div>') +
      '</div>' +
      (window.ActionsDemoCode
        ? '<div class="coco-act-demo-history-panel card">' +
          '<div class="coco-act-demo-history-head">📜 היסטוריית העלאות (קלה · ללא קוד)</div>' +
          ActionsDemoCode.renderHistoryHtml(10) + '</div>'
        : '') +
      '</div>';
  }

  function renderListView(pageGroups, wp, pending) {
    var totalTime = computeTimeSummary(pending);
    var slice = pageGroups.slice(_listPage * PAGE_SIZE, (_listPage + 1) * PAGE_SIZE);

    var header = previewBanner() + renderQaDemoBanner() + renderTimeSummaryBar(totalTime) +
      '<div class="alert alert-info" style="margin-bottom:14px;">⚙️ ' +
      pending.length + ' פעולות פתוחות · ' + pageGroups.length + ' עמודים · מספור #' +
      (getSeqState().nextActionItemNumber - 1) + ' · קמפיין: ' +
      esc((wp && wp.campaign && wp.campaign.name) || 'SEO') + '</div>' +
      renderExportBar();

    var cards = slice.map(function (grp, i) {
      var doneCount = (_lastAllActions || []).filter(function (a) {
        return a.pageId === grp.page.id && isDoneStatus(a.status);
      }).length;
      return renderLitePageCard(grp.page, grp.items, doneCount, _listPage * PAGE_SIZE + i);
    }).join('');

    return header +
      '<div class="coco-act-lite-list">' + cards + '</div>' +
      renderPagination(pageGroups.length, _listPage);
  }

  function getPreviewStore(pageId) {
    try {
      var raw = sessionStorage.getItem(PREVIEW_KEY_PREFIX + pageId);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (Date.now() - parsed.at > PREVIEW_TTL_MS) {
        sessionStorage.removeItem(PREVIEW_KEY_PREFIX + pageId);
        return null;
      }
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function savePreviewStore(pageId, html, css, js) {
    try {
      sessionStorage.setItem(PREVIEW_KEY_PREFIX + pageId, JSON.stringify({
        at: Date.now(), html: html || '', css: css || '', js: js || '',
      }));
    } catch (e) { /* ignore quota */ }
  }

  function deletePreviewStore(pageId) {
    try { sessionStorage.removeItem(PREVIEW_KEY_PREFIX + pageId); } catch (e) { /* ignore */ }
  }

  function buildLitePreviewSrcdoc(html, css, js) {
    return '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<style>body{font-family:Heebo,Arial,sans-serif;margin:0;padding:16px;line-height:1.5}' +
      (css || '') + '</style></head><body>' +
      (html || '<p style="color:#64748b;font-style:italic">הדבק HTML לתצוגה מקדימה</p>') +
      '<script>' + (js || '') + '<\/script></body></html>';
  }

  function ensureLitePreviewModal() {
    var existing = document.getElementById('coco-act-lite-preview-modal');
    if (existing) return existing;
    var screen = document.getElementById('screen-actions');
    var wrap = document.createElement('div');
    wrap.id = 'coco-act-lite-preview-modal';
    wrap.className = 'coco-act-lite-preview-overlay';
    wrap.style.display = 'none';
    wrap.innerHTML =
      '<div class="coco-act-lite-preview-dialog" role="dialog" aria-modal="true" aria-label="תצוגה מקדימה">' +
      '<div class="coco-act-lite-preview-head">' +
      '<div><div class="coco-act-lite-preview-title">🔍 תצוגה מקדימה — Staging בלבד</div>' +
      '<div class="coco-act-lite-preview-sub" id="coco-act-lite-preview-sub"></div></div>' +
      '<button type="button" class="btn-icon coco-act-lite-preview-close" aria-label="סגור">✕</button></div>' +
      '<div class="coco-act-lite-preview-body">' +
      '<div class="coco-act-lite-preview-editors">' +
      '<label class="coco-act-lite-editor-label">HTML<textarea rows="4" class="coco-act-lite-editor" data-lite-preview-html placeholder="&lt;div&gt;…&lt;/div&gt;"></textarea></label>' +
      '<label class="coco-act-lite-editor-label">CSS<textarea rows="3" class="coco-act-lite-editor" data-lite-preview-css placeholder="body { … }"></textarea></label>' +
      '<label class="coco-act-lite-editor-label">JS<textarea rows="2" class="coco-act-lite-editor" data-lite-preview-js placeholder="// optional"></textarea></label>' +
      '<div class="coco-act-lite-preview-actions">' +
      '<button type="button" class="btn btn-primary coco-act-btn-sm" data-lite-preview-apply>הצג בתצוגה</button>' +
      '<button type="button" class="btn btn-ghost coco-act-btn-sm" data-lite-preview-delete>🗑 מחק תצוגה</button>' +
      '</div></div>' +
      '<iframe id="coco-act-lite-preview-frame" class="coco-act-lite-preview-frame" title="תצוגה מקדימה" sandbox="allow-scripts"></iframe>' +
      '</div></div>';
    (screen || document.body).appendChild(wrap);
    wrap.querySelector('.coco-act-lite-preview-close').addEventListener('click', closeLitePreview);
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap) closeLitePreview();
    });
    return wrap;
  }

  function applyLitePreviewFrame(modal) {
    var html = modal.querySelector('[data-lite-preview-html]').value;
    var css = modal.querySelector('[data-lite-preview-css]').value;
    var js = modal.querySelector('[data-lite-preview-js]').value;
    var frame = document.getElementById('coco-act-lite-preview-frame');
    if (frame) frame.srcdoc = buildLitePreviewSrcdoc(html, css, js);
    if (modal._previewPageId) savePreviewStore(modal._previewPageId, html, css, js);
  }

  function openLitePreview(pageId) {
    var entry = _lastRenderActions.find(function (g) { return g.page && g.page.id === pageId; });
    if (!entry) return;
    var modal = ensureLitePreviewModal();
    modal._previewPageId = pageId;
    var sub = document.getElementById('coco-act-lite-preview-sub');
    if (sub) sub.textContent = (entry.page.path || '') + ' · לא משנה את האתר החי · פג תוקף 2 שעות';
    var stored = getPreviewStore(pageId);
    modal.querySelector('[data-lite-preview-html]').value = stored ? stored.html : '';
    modal.querySelector('[data-lite-preview-css]').value = stored ? stored.css : '';
    modal.querySelector('[data-lite-preview-js]').value = stored ? stored.js : '';
    modal.style.display = 'flex';
    applyLitePreviewFrame(modal);
  }

  function closeLitePreview() {
    var modal = document.getElementById('coco-act-lite-preview-modal');
    if (modal) modal.style.display = 'none';
    var frame = document.getElementById('coco-act-lite-preview-frame');
    if (frame) frame.srcdoc = 'about:blank';
  }

  function getDemoStagingMeta(action, page) {
    var fb = getActionFeedback(action.id);
    var ver = '';
    try {
      var m = document.querySelector('meta[name="ui-version"]');
      if (m) ver = m.getAttribute('content') || '';
    } catch (e) { /* ignore */ }
    return {
      actionId: action.id,
      taskName: (action.category || action.title || 'משימה') + ' #' + (getActionNumber(action.id) || ''),
      pagePath: page.path || '',
      assignee: fb.assignee || '',
      uiVersion: ver,
      stagingUrl: 'https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=' + (ver || 'staging'),
      note: 'אושר מהכרטיס',
    };
  }

  function openDemoForAction(actionId) {
    if (!window.ActionsDemoCode) return;
    var ctx = findActionAndPage(actionId);
    if (!ctx.action || !ctx.page) return;
    ActionsDemoCode._stagingMeta = getDemoStagingMeta(ctx.action, ctx.page);
    ActionsDemoCode.openDemoModal(actionId, ActionsDemoCode._stagingMeta);
  }

  function requestStagingUpload(actionId) {
    if (!window.ActionsDemoCode) return;
    if (!ActionsDemoCode.isDemoApproved(actionId)) {
      if (typeof showToast === 'function') showToast('יש לאשר את הדemo לפני העלאה ל-Staging');
      return;
    }
    var ok = window.confirm(
      'אישור סופי להעלאה ל-Staging:\n\n• Orin Staging בלבד\n• לא Production\n• לא dalia-c.com\n• Deploy ידני — לא אוטומטי\n• הקוד לא נשמר בהיסטוריה\n\nלהמשיך?'
    );
    if (!ok) return;
    var ctx = findActionAndPage(actionId);
    if (!ctx.action || !ctx.page) return;
    var meta = getDemoStagingMeta(ctx.action, ctx.page);
    var res = ActionsDemoCode.approveStagingUpload(meta);
    if (res.ok && typeof showToast === 'function') {
      showToast('✓ נרשם לאישור Staging · Deploy יתבצע רק ידנית');
    }
    rerender();
  }

  function findActionAndPage(actionId) {
    var found = { action: null, page: null, items: [] };
    _lastRenderActions.forEach(function (entry) {
      (entry.items || []).forEach(function (a) {
        if (a.id === actionId) {
          found.action = a;
          found.page = entry.page;
          found.items = entry.items;
        }
      });
    });
    return found;
  }

  function buildActionSystemPrompt(action, page) {
    var ba = buildBeforeAfterFallback(page, action);
    var num = getActionNumber(action.id);
    var fb = getActionFeedback(action.id);
    return [
      'אתה עוזר SEO לעמוד בודד ב-dalia-c.com — Staging בלבד, ללא שינוי באתר החי.',
      'עמוד: ' + (page.path || page.url || '—'),
      'פריט פעולה #' + (num || '?') + ': ' + (action.category || action.title),
      'לפני: ' + ba.current,
      'אחרי מוצע: ' + ba.after,
      'למה: ' + ba.why,
      'משוב משתמש — אהבתי: ' + (fb.liked || '—'),
      'לא אהבתי: ' + (fb.disliked || '—'),
      'לבקש שינוי: ' + (fb.changeRequests || '—'),
      'ענה בעברית, קצר וממוקד לפריט זה בלבד.',
    ].join('\n');
  }

  function apiScopedChat(action, page, prompt, history) {
    var system = buildActionSystemPrompt(action, page);
    var api = window.COCO_API;
    if (api && api.hasApi) {
      return api.fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assistant: true,
          module: 'actions-workbench',
          system: system,
          prompt: prompt,
          history: history || [],
          max_tokens: 700,
        }),
      }).then(function (r) {
        return { ok: r.ok && r.data && r.data.ok, text: r.data && r.data.text, message: r.data && r.data.message };
      }).catch(function (e) {
        return { ok: false, message: e.message };
      });
    }
    var ba = buildBeforeAfterFallback(page, action);
    return Promise.resolve({
      ok: true,
      text: 'פריט #' + (getActionNumber(action.id) || '?') + ' — ' + (action.category || '') +
        ': ההמלצה היא «' + (ba.proposed || ba.after) + '». ' +
        (ba.why ? 'סיבה: ' + ba.why + '. ' : '') +
        'זו תצוגת Staging — לאחר אישורך בלבד יוכלו ליישם בעתיד.',
      local: true,
    });
  }

  function sendScopedChat(actionId) {
    var input = document.querySelector('[data-chat-input="' + actionId + '"]');
    if (!input) return;
    var text = (input.value || '').trim();
    if (!text) return;
    var ctx = findActionAndPage(actionId);
    if (!ctx.action || !ctx.page) return;

    var fb = getActionFeedback(actionId);
    fb.chat = fb.chat || [];
    fb.chat.push({ role: 'user', text: text, at: new Date().toISOString() });
    saveActionFeedback(actionId, { chat: fb.chat });
    input.value = '';

    var log = document.querySelector('[data-chat-log="' + actionId + '"]');
    if (log) {
      log.innerHTML = fb.chat.slice(-6).map(function (m) {
        var cls = m.role === 'user' ? 'coco-act-chat-user' : 'coco-act-chat-ai';
        return '<div class="coco-act-chat-msg ' + cls + '">' + esc(m.text) + '</div>';
      }).join('');
      log.scrollTop = log.scrollHeight;
    }

    var hist = fb.chat.slice(-8).map(function (m) {
      return { role: m.role === 'user' ? 'user' : 'assistant', content: m.text };
    });

    apiScopedChat(ctx.action, ctx.page, text, hist.slice(0, -1)).then(function (res) {
      var reply = res.ok && res.text ? res.text : (res.message || 'לא ניתן להתחבר ל-AI כרגע — המשוב נשמר.');
      fb.chat.push({ role: 'ai', text: reply, at: new Date().toISOString(), local: !!res.local });
      saveActionFeedback(actionId, { chat: fb.chat });
      if (log) {
        log.innerHTML = fb.chat.slice(-6).map(function (m) {
          var cls = m.role === 'user' ? 'coco-act-chat-user' : 'coco-act-chat-ai';
          return '<div class="coco-act-chat-msg ' + cls + '">' + esc(m.text) + '</div>';
        }).join('');
        log.scrollTop = log.scrollHeight;
      }
    });
  }

  function scheduleFeedbackSave(actionId, field, value) {
    clearTimeout(_fbSaveTimer);
    _fbSaveTimer = setTimeout(function () {
      var patch = {};
      patch[field] = value;
      saveActionFeedback(actionId, patch);
    }, 350);
  }

  function csvEscape(val) {
    var s = String(val == null ? '' : val);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function exportActionsCsv() {
    var rows = [['#', 'Page', 'URL', 'Category', 'Source', 'Priority', 'Status', 'Minutes', 'Detail']];
    (_lastAllActions || []).forEach(function (a) {
      var page = (_lastRenderActions.find(function (g) { return g.page && g.page.id === a.pageId; }) || {}).page;
      rows.push([
        getActionNumber(a.id) || '',
        a.pagePath || (page && page.path) || '',
        (page && (page.url || page.pageUrl)) || a.pageUrl || '',
        a.category || a.title || '',
        a.source || '',
        a.urgency || a.priority || '',
        resolveActionStatus(a),
        getEstimatedWorkMinutes(a),
        a.detail || '',
      ].map(csvEscape));
    });
    var csv = rows.map(function (r) { return r.join(','); }).join('\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'dalia-actions-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);

    var webhook = getExportConfig().sheetsWebhookUrl;
    if (webhook) {
      fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: csv,
        mode: 'no-cors',
      }).catch(function () { /* optional webhook */ });
      if (typeof showToast === 'function') showToast('CSV הורד · נשלח ל-webhook (אם מוגדר)');
    } else if (typeof showToast === 'function') {
      showToast('CSV הורד בהצלחה');
    }
  }

  function syncDemoFieldsFromDom() {
    if (!window.ActionsDemoCode) return;
    document.querySelectorAll('[data-demo-inline]').forEach(function (ta) {
      var aid = ta.getAttribute('data-demo-inline-id');
      var field = ta.getAttribute('data-demo-inline');
      if (!aid || !field) return;
      var p = {};
      p[field] = ta.value;
      ActionsDemoCode.setDemo(aid, p);
    });
  }

  var _lastActionsScrollAt = 0;
  var _actScrollIdleTimer = null;
  var _rerenderDebounceTimer = null;
  var _deferBindTimer = null;
  var _deferredBindFn = null;
  var SCROLL_IDLE_MS = 550;

  function getActionsScrollEl() {
    return document.querySelector('#screen-actions .content') || document.getElementById('screen-actions');
  }

  function isUserScrolling() {
    return Date.now() - _lastActionsScrollAt < SCROLL_IDLE_MS;
  }

  function needsDemoDomSync() {
    if (!window.ActionsDemoCode) return false;
    if (_view === 'list') return false;
    if (_view === 'workbench' && _expandedActionId) return true;
    return !!document.querySelector('#coco-live-actions-pending [data-demo-inline]');
  }

  function deferBind(fn) {
    _deferredBindFn = fn;
    clearTimeout(_deferBindTimer);
    _deferBindTimer = setTimeout(function () {
      var f = _deferredBindFn;
      _deferredBindFn = null;
      if (!f) return;
      if (isUserScrolling()) deferBind(f);
      else f();
    }, SCROLL_IDLE_MS);
  }

  function bindActionsScrollGuard() {
    var el = getActionsScrollEl();
    if (!el || el._actScrollGuard) return;
    el._actScrollGuard = true;
    var mark = function () {
      _lastActionsScrollAt = Date.now();
      clearTimeout(_actScrollIdleTimer);
      _actScrollIdleTimer = setTimeout(function () { /* idle */ }, SCROLL_IDLE_MS);
    };
    el.addEventListener('scroll', mark, { passive: true });
    el.addEventListener('touchstart', mark, { passive: true });
    el.addEventListener('touchmove', mark, { passive: true });
    el.addEventListener('touchend', mark, { passive: true });
  }

  function refreshPendingDom(setHtml, emptyStatus, wp, pageGroups, pending, done, statusBadge) {
    if (needsDemoDomSync()) syncDemoFieldsFromDom();
    var scrollEl = getActionsScrollEl();
    var savedScroll = scrollEl ? scrollEl.scrollTop : 0;
    var html;
    if (_view === 'workbench' && _workbenchPageId) {
      var entry = pageGroups.find(function (g) { return g.page && g.page.id === _workbenchPageId; });
      html = previewBanner() + (entry
        ? renderWorkbenchView(entry.page, entry.items)
        : '<div class="alert alert-warn">עמוד לא נמצא · <button type="button" class="btn btn-ghost coco-act-btn-sm" data-act-back-list>← חזרה</button></div>');
    } else {
      html = pageGroups.length ? renderListView(pageGroups, wp, pending) : emptyStatus('אין עמודים ב-SSOT');
    }
    setHtml('coco-live-actions-pending', html);
    if (scrollEl && savedScroll > 0 && isUserScrolling()) {
      requestAnimationFrame(function () {
        if (scrollEl.scrollTop < savedScroll - 8) scrollEl.scrollTop = savedScroll;
      });
    }
    var rootEl = document.getElementById('coco-live-actions-pending');
    if (rootEl) rootEl.setAttribute('data-coco-act-ready', 'true');

    setHtml('coco-live-actions-done', done.length ? done.slice(0, 50).map(function (a) {
      var num = getActionNumber(a.id);
      return '<tr><td>' + (num ? '#' + num + ' ' : '') + esc(a.title) + '</td><td>' + esc(a.pagePath || '—') + '</td><td>' + esc(a.category) + '</td><td>' + esc(a.source) + '</td><td>' + (statusBadge ? statusBadge('done') : 'done') + '</td></tr>';
    }).join('') : '<tr><td colspan="5">אין פעולות שהושלמו עדיין</td></tr>');

    if (needsDemoDomSync() && window.ActionsDemoCode && ActionsDemoCode.restoreInlineFields) {
      requestAnimationFrame(function () {
        ActionsDemoCode.restoreInlineFields(document.getElementById('coco-live-actions-pending'));
      });
    }
  }

  function rerender() {
    if (isUserScrolling()) {
      clearTimeout(_rerenderDebounceTimer);
      _rerenderDebounceTimer = setTimeout(function () { rerender(); }, SCROLL_IDLE_MS);
      return;
    }
    if (_renderDeps && _lastBundle) {
      render(_lastBundle, _renderDeps);
    } else if (window.CocoData && CocoData.bindScreen) {
      CocoData.bindScreen('screen-actions');
    }
  }

  function bindWorkbenchEvents() {
    var root = document.getElementById('coco-live-actions-pending');
    if (!root || root._actWorkbenchBound) return;
    root._actWorkbenchBound = true;

    root.addEventListener('click', function (e) {
      var openWb = e.target.closest('[data-act-open-wb]');
      if (openWb) {
        _view = 'workbench';
        _workbenchPageId = openWb.getAttribute('data-act-open-wb');
        _expandedActionId = null;
        rerender();
        return;
      }
      var back = e.target.closest('[data-act-back-list]');
      if (back) {
        _view = 'list';
        _workbenchPageId = null;
        _expandedActionId = null;
        rerender();
        return;
      }
      var pageBtn = e.target.closest('[data-act-list-page]');
      if (pageBtn) {
        _listPage = Number(pageBtn.getAttribute('data-act-list-page') || 0);
        rerender();
        return;
      }
      var acc = e.target.closest('[data-act-acc-toggle]');
      if (acc) {
        var aid = acc.getAttribute('data-act-acc-toggle');
        if (_expandedActionId === aid) {
          if (needsDemoDomSync()) syncDemoFieldsFromDom();
          _expandedActionId = null;
        } else {
          _expandedActionId = aid;
          ensureActionOpened(_expandedActionId);
        }
        rerender();
        return;
      }
      var nav = e.target.closest('[data-act-nav]');
      if (nav) {
        _expandedActionId = nav.getAttribute('data-act-nav');
        ensureActionOpened(_expandedActionId);
        rerender();
        if (!(window.matchMedia && window.matchMedia('(max-width: 767px)').matches)) {
          var el = document.querySelector('[data-action-id="' + _expandedActionId + '"]');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        return;
      }
      var doneBtn = e.target.closest('[data-act-mark-done]');
      if (doneBtn) {
        markActionDone(doneBtn.getAttribute('data-act-mark-done'));
        return;
      }
      var demoOpen = e.target.closest('[data-demo-open]');
      if (demoOpen) {
        openDemoForAction(demoOpen.getAttribute('data-demo-open'));
        return;
      }
      var demoOk = e.target.closest('[data-demo-inline-ok]');
      if (demoOk) {
        var idOk = demoOk.getAttribute('data-demo-inline-ok');
        if (window.ActionsDemoCode) {
          ActionsDemoCode.approveDemo(idOk);
          if (typeof showToast === 'function') showToast('✓ הדemo אושר');
          rerender();
        }
        return;
      }
      var demoStaging = e.target.closest('[data-demo-inline-staging]');
      if (demoStaging) {
        requestStagingUpload(demoStaging.getAttribute('data-demo-inline-staging'));
        return;
      }
      var demoClear = e.target.closest('[data-demo-inline-clear]');
      if (demoClear) {
        var idCl = demoClear.getAttribute('data-demo-inline-clear');
        if (window.ActionsDemoCode) {
          ActionsDemoCode.clearDemo(idCl);
          ActionsDemoCode.purgePreviewFrame();
          if (typeof showToast === 'function') showToast('קוד נמחק מהזיכרון');
          rerender();
        }
        return;
      }
      var prev = e.target.closest('[data-act-lite-preview]');
      if (prev) {
        openLitePreview(prev.getAttribute('data-act-lite-preview'));
        return;
      }
      var exp = e.target.closest('[data-act-export-csv]');
      if (exp) {
        exportActionsCsv();
        return;
      }
      var autoBtn = e.target.closest('[data-act-auto-mode]');
      if (autoBtn) {
        prepareAutoMode();
        if (window.DailyEngine && typeof DailyEngine.run === 'function') {
          autoBtn.disabled = true;
          var runFn = DailyEngine.runBatched || DailyEngine.run;
          runFn({
            demo: false,
            onProgress: function (stage, current, total) {
              var label = stage === 'analyze' && total
                ? ('ניתוח ' + current + '/' + total)
                : (stage === 'sources' ? 'מקורות' : (stage === 'goals' ? 'מטרות' : (stage === 'actions' ? 'פעולות' : stage)));
              if (typeof showToast === 'function') showToast('מנוע יומי: ' + label, 'info');
              rerender();
            },
          }).then(function (res) {
            autoBtn.disabled = false;
            var run = res && res.run;
            var s = run && run.summary;
            var msg = run && run.status === 'completed'
              ? '✓ מנוע יומי — ' + (s && s.recommendations) + ' המלצות · ' +
                (s && s.goalsCreated) + ' מטרות · ' + (s && s.actionsCreated) + ' פעולות · ממתין לאישור'
              : '⚠ מנוע יומי — שגיאה או נתונים חסרים';
            if (typeof showToast === 'function') showToast(msg, run && run.status === 'completed' ? 'success' : 'warn');
            rerender();
            if (window.CocoData && CocoData.bindScreen && window.goScreen) {
              try { CocoData.bindScreen('screen-actions'); CocoData.bindScreen('screen-history'); } catch (e) { /* ignore */ }
            }
          }).catch(function () {
            autoBtn.disabled = false;
            if (typeof showToast === 'function') showToast('שגיאה בהרצת מנוע יומי', 'warn');
            rerender();
          });
        } else {
          if (typeof showToast === 'function') {
            showToast('תשתית מצב אוטומטי מוכנה — מנוע יומי לא נטען');
          }
          rerender();
        }
        return;
      }
      var appr = e.target.closest('[data-act-approve]');
      if (appr) {
        window.CocoActApprove(appr.getAttribute('data-act-approve'));
        return;
      }
      var rev = e.target.closest('[data-act-revoke]');
      if (rev) {
        window.CocoActRevokeApproval(rev.getAttribute('data-act-revoke'));
        return;
      }
      var send = e.target.closest('[data-chat-send]');
      if (send) sendScopedChat(send.getAttribute('data-chat-send'));
    });

    root.addEventListener('paste', function (e) {
      var ta = e.target.closest('[data-demo-inline]');
      if (!ta || !window.ActionsDemoCode) return;
      setTimeout(function () {
        var aid = ta.getAttribute('data-demo-inline-id');
        var field = ta.getAttribute('data-demo-inline');
        if (!aid || !field) return;
        var p = {};
        p[field] = ta.value;
        ActionsDemoCode.setDemo(aid, p);
      }, 0);
    });

    root.addEventListener('input', function (e) {
      var ta = e.target.closest('[data-fb-field]');
      if (ta) {
        scheduleFeedbackSave(ta.getAttribute('data-fb-action'), ta.getAttribute('data-fb-field'), ta.value);
        return;
      }
      var meta = e.target.closest('[data-act-meta]');
      if (meta) {
        var patch = {};
        patch[meta.getAttribute('data-act-meta')] = meta.value;
        saveActionFeedback(meta.getAttribute('data-act-meta-id'), patch);
        return;
      }
      var demoIn = e.target.closest('[data-demo-inline]');
      if (demoIn && window.ActionsDemoCode) {
        clearTimeout(_fbSaveTimer);
        _fbSaveTimer = setTimeout(function () {
          var aid = demoIn.getAttribute('data-demo-inline-id');
          var field = demoIn.getAttribute('data-demo-inline');
          var p = {};
          p[field] = demoIn.value;
          ActionsDemoCode.setDemo(aid, p);
        }, 400);
        return;
      }
      var sheets = e.target.closest('[data-act-sheets-url]');
      if (sheets) saveExportConfig({ sheetsWebhookUrl: sheets.value.trim() });
    });

    root.addEventListener('change', function (e) {
      var st = e.target.closest('[data-act-status]');
      if (st) {
        var id = st.getAttribute('data-act-status');
        var val = st.value;
        var patch = { workflowStatus: val };
        if (val === 'done') patch.completedAt = new Date().toISOString();
        saveActionFeedback(id, patch);
        rerender();
      }
    });

    root.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var input = e.target.closest('[data-chat-input]');
      if (input) {
        e.preventDefault();
        sendScopedChat(input.getAttribute('data-chat-input'));
      }
    });

    document.addEventListener('click', function (e) {
      var modal = document.getElementById('coco-act-lite-preview-modal');
      if (!modal || modal.style.display === 'none') return;
      if (e.target.closest('[data-lite-preview-apply]')) {
        applyLitePreviewFrame(modal);
        return;
      }
      if (e.target.closest('[data-lite-preview-delete]')) {
        if (modal._previewPageId) deletePreviewStore(modal._previewPageId);
        modal.querySelector('[data-lite-preview-html]').value = '';
        modal.querySelector('[data-lite-preview-css]').value = '';
        modal.querySelector('[data-lite-preview-js]').value = '';
        applyLitePreviewFrame(modal);
        if (typeof showToast === 'function') showToast('תצוגה מקדימה נמחקה');
      }
    });
  }

  function render(bundle, deps) {
    deps = deps || {};
    var applyCtxFilter = deps.applyCtxFilter;
    var deriveActions = deps.deriveActions;
    var setHtml = deps.setHtml;
    var statusBadge = deps.statusBadge;
    var emptyStatus = deps.emptyStatus;
    var isLiveGoalsActionsMode = deps.isLiveGoalsActionsMode;

    if (!applyCtxFilter || !deriveActions || !setHtml) return 0;

    _lastBundle = bundle;
    _renderDeps = {
      applyCtxFilter: applyCtxFilter,
      deriveActions: deriveActions,
      setHtml: setHtml,
      statusBadge: statusBadge,
      emptyStatus: emptyStatus,
      isLiveGoalsActionsMode: isLiveGoalsActionsMode,
    };

    var wp = (bundle && bundle.workPlan) || (window.DaliaSite && DaliaSite.getWorkPlan && DaliaSite.getWorkPlan());
    var pages = (wp && wp.pages) ? wp.pages.slice() : [];
    pages.sort(function (a, b) { return (a.rank || 999) - (b.rank || 999); });

    var allActions = applyCtxFilter(deriveActions(bundle), function (a) {
      return { action: a.category, status: a.status, campaign: a.campaignId };
    });
    bootstrapSequenceNumbers(allActions);
    applyQaDemoSeed(allActions);
    _lastAllActions = allActions;

    var pending = allActions.filter(function (a) { return !isDoneStatus(a.status); });
    var done = allActions.filter(function (a) { return isDoneStatus(a.status); });

    var actionsByPage = {};
    pending.forEach(function (a) {
      var key = a.pageId || a.pagePath || 'other';
      if (!actionsByPage[key]) actionsByPage[key] = [];
      actionsByPage[key].push(a);
    });

    var pageGroups = pages.map(function (page) {
      return { page: page, items: actionsByPage[page.id] || [] };
    });
    _lastRenderActions = pageGroups;

    var maxPage = Math.max(0, Math.ceil(pageGroups.length / PAGE_SIZE) - 1);
    if (_listPage > maxPage) _listPage = maxPage;

    refreshPendingDom(setHtml, emptyStatus, wp, pageGroups, pending, done, statusBadge);

    var sub = document.querySelector('#screen-actions .page-subtitle');
    if (sub && isLiveGoalsActionsMode && isLiveGoalsActionsMode()) {
      sub.textContent = _view === 'workbench'
        ? 'שולחן עבודה · ' + pending.length + ' פעולות (תצוגה בלבד)'
        : pending.length + ' פעולות · ' + pageGroups.length + ' עמודים · מסך קל';
    }

    bindWorkbenchEvents();
    bindActionsScrollGuard();
    ensureQaDemoSeed();
    return pending.length;
  }

  function ensureQaDemoSeed() {
    try {
      var raw = localStorage.getItem('dalia-qa-demo-seed-v1');
      if (!raw || !window.ActionsDemoCode) return;
      var seed = JSON.parse(raw);
      if (!seed.actionId) return;
      var demo = seed.session || seed.demo || {
        html: '<div class="qa-demo-banner" style="padding:12px;background:#1e3a5f;border-radius:8px;color:#fff;">✅ דוגמת QA — מוכנה לבדיקה מחר בבוקר</div>',
        css: '.qa-demo-banner{font-family:Heebo,sans-serif}',
        js: '',
      };
      ActionsDemoCode.setDemo(seed.actionId, demo);
      if (seed.approved !== false) ActionsDemoCode.approveDemo(seed.actionId);
    } catch (e) { /* ignore */ }
  }

  window.CocoActApprove = function (actionId) {
    if (EXECUTION_MODE !== 'preview') return;
    saveApproval(actionId, 'approved_for_execution');
    if (typeof showToast === 'function') showToast('✓ אושר לביצוע (Staging בלבד — לא שונה באתר החי)');
    rerender();
  };

  window.CocoActRevokeApproval = function (actionId) {
    var map = getApprovals();
    delete map[actionId];
    writeJson(APPROVAL_KEY, map);
    if (typeof showToast === 'function') showToast('אישור בוטל');
    rerender();
  };

  window.ActionsWorkbench = {
    render: render,
    rerender: rerender,
    isUserScrolling: isUserScrolling,
    deferBind: deferBind,
    getApprovals: getApprovals,
    getSeqState: getSeqState,
    getActionNumber: getActionNumber,
    getActionFeedback: getActionFeedback,
    parseImpactFields: parseImpactFields,
    getEstimatedWorkMinutes: getEstimatedWorkMinutes,
    formatHebrewDuration: formatHebrewDuration,
    computeTimeSummary: computeTimeSummary,
    resolveActionStatus: resolveActionStatus,
    exportActionsCsv: exportActionsCsv,
    openLitePreview: openLitePreview,
    openPreview: function (pageId) { return openLitePreview(pageId); },
    EXECUTION_MODE: EXECUTION_MODE,
    APPROVAL_KEY: APPROVAL_KEY,
    WORKBENCH_KEY: WORKBENCH_KEY,
    SEQ_KEY: SEQ_KEY,
    CONFIG_KEY: CONFIG_KEY,
    QA_DEMO_SEED_KEY: QA_DEMO_SEED_KEY,
    getExportConfig: getExportConfig,
    readQaDemoSeed: readQaDemoSeed,
    getAutoModeState: getAutoModeState,
    prepareAutoMode: prepareAutoMode,
    AUTO_MODE_KEY: AUTO_MODE_KEY,
  };
})();
