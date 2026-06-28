/**
 * Actions Workbench — Staging preview only. Approvals stored in localStorage; no live site writes.
 */
(function () {
  'use strict';

  var EXECUTION_MODE = 'preview';
  var APPROVAL_KEY = 'dalia-action-approvals-v1';
  var WORKBENCH_KEY = 'dalia-actions-workbench-v1';
  var SEQ_KEY = 'dalia-actions-seq-v1';

  var _crawlCache = null;
  var _crawlPromise = null;
  var _lastRenderActions = [];
  var _previewMsgBound = false;
  var _htmlMemCache = {};
  var _lazyGen = 0;
  var LAZY_INITIAL_CARDS = 6;
  var LAZY_BATCH_SIZE = 4;
  var HTML_CACHE_PREFIX = 'dalia-act-html-v1:';
  var HTML_CACHE_TTL_MS = 30 * 60 * 1000;

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

  var PREVIEW_MARKER_CSS =
    '.coco-change-wrap{position:relative;display:block;outline:2px dashed transparent;transition:outline .2s,background .2s;border-radius:4px}' +
    '.coco-change-wrap.coco-change-active,.coco-change-wrap:hover{outline-color:#8b5cf6;background:rgba(139,92,246,.1)}' +
    '.coco-change-marker{position:absolute;top:-11px;right:4px;z-index:9999;background:#7c3aed;color:#fff;font:bold 11px/1 Heebo,Arial,sans-serif;padding:3px 8px;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.3);pointer-events:none}' +
    '[data-change-id]{cursor:pointer}' +
    '.coco-tech-pin{position:relative;border:2px dashed #f59e0b;border-radius:8px;padding:10px 36px 10px 12px;margin:8px 0;background:#fffbeb;font-size:13px}' +
    '.coco-tech-pin .coco-change-marker{top:6px;right:6px}' +
    '.coco-pv-banner{background:#fef3c7;border:1px solid #f59e0b;padding:8px 12px;border-radius:8px;font-size:12px;margin-bottom:12px}' +
    '.coco-pv-site-header{background:#1e293b;color:#fff;padding:12px 16px;font-size:14px;font-weight:700}' +
    '.coco-pv-nav{display:flex;gap:12px;padding:8px 16px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569;flex-wrap:wrap}' +
    '.coco-pv-hero{padding:24px 16px;background:linear-gradient(135deg,#f8fafc,#e2e8f0)}' +
    '.coco-pv-hero h1{font-size:24px;margin:0 0 12px;color:#0f172a;line-height:1.3}' +
    '.coco-pv-intro{font-size:14px;color:#334155;line-height:1.6;margin:0 0 16px}' +
    '.coco-pv-section{padding:16px;border-top:1px solid #e2e8f0}' +
    '.coco-pv-section h2{font-size:18px;margin:0 0 8px;color:#1e293b}' +
    '.coco-pv-section p{font-size:13px;color:#475569;margin:0;line-height:1.5}' +
    '.coco-pv-serp{background:#f1f5f9;border-radius:8px;padding:10px;margin:12px 16px}' +
    '.coco-pv-serp-url{font-size:12px;color:#15803d}.coco-pv-serp-title{font-size:16px;color:#1d4ed8;margin:4px 0}' +
    '.coco-pv-serp-meta{font-size:13px;color:#475569}' +
    '.coco-pv-tech{margin:16px;padding:12px;background:#fff7ed;border:1px solid #fdba74;border-radius:8px}' +
    '.coco-pv-tech h3{font-size:13px;margin:0 0 8px;color:#9a3412}' +
    '.coco-pv-compare{display:grid;grid-template-columns:1fr 1fr;gap:0;min-height:100%}' +
    '.coco-pv-compare-pane{border-left:1px solid #e2e8f0;overflow:auto}' +
    '.coco-pv-compare-pane:first-child{border-left:0}' +
    '.coco-pv-pane-label{font-size:11px;font-weight:700;padding:8px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;color:#64748b;text-transform:uppercase}' +
    '.coco-pv-pane-label.before{background:#fff5f5;color:#b91c1c}' +
    '.coco-pv-pane-label.after{background:#f0fdf4;color:#15803d}' +
    '@media(max-width:700px){.coco-pv-compare{grid-template-columns:1fr}}';

  var PREVIEW_BRIDGE_SCRIPT =
    '(function(){window.addEventListener("message",function(e){' +
    'if(!e.data||e.data.type!=="coco-act-highlight")return;' +
    'var el=document.querySelector(\'[data-change-id="\'+e.data.changeId+\'"]\');' +
    'if(!el)return;el.scrollIntoView({behavior:"smooth",block:"center"});' +
    'document.querySelectorAll(".coco-change-active").forEach(function(x){x.classList.remove("coco-change-active");});' +
    'el.classList.add("coco-change-active");});' +
    'document.addEventListener("click",function(e){' +
    'var m=e.target.closest("[data-change-id]");if(!m)return;e.preventDefault();' +
    'parent.postMessage({type:"coco-act-preview-select",changeId:m.getAttribute("data-change-id")},"*");});})();';

  var SOURCE_LABELS = {
    checklist: 'Checklist',
    crawl: 'Crawl',
    gsc: 'GSC',
    GSC: 'GSC',
    ga4: 'GA4',
    GA4: 'GA4',
    ai: 'AI',
    AI: 'AI',
    chatgpt: 'ChatGPT',
    ChatGPT: 'ChatGPT',
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
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { /* ignore */ }
  }

  function getApprovals() {
    return readJson(APPROVAL_KEY, {});
  }

  function saveApproval(actionId, status) {
    var map = getApprovals();
    map[actionId] = { status: status, at: new Date().toISOString(), mode: EXECUTION_MODE };
    writeJson(APPROVAL_KEY, map);
  }

  function approvalStatus(actionId) {
    var a = getApprovals()[actionId];
    return a && a.status ? a.status : null;
  }

  function getWorkbenchStore() {
    return readJson(WORKBENCH_KEY, { items: {}, pages: {} });
  }

  function saveWorkbenchStore(store) {
    writeJson(WORKBENCH_KEY, store);
  }

  function getActionFeedback(actionId) {
    var store = getWorkbenchStore();
    if (!store.items[actionId]) {
      store.items[actionId] = {
        liked: '',
        disliked: '',
        changeRequests: '',
        userNotes: '',
        chat: [],
        revisionRound: 1,
        updatedAt: null,
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

  function getSeqState() {
    return readJson(SEQ_KEY, { nextActionItemNumber: 1, assignments: {} });
  }

  function saveSeqState(state) {
    writeJson(SEQ_KEY, state);
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
    var state = getSeqState();
    return state.assignments[actionId] || null;
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

  function bumpRevisionRound(pageId, actions) {
    var store = getWorkbenchStore();
    var next = getPageRevisionRound(pageId, actions) + 1;
    store.pages[pageId] = store.pages[pageId] || {};
    store.pages[pageId].revisionRound = next;
    (actions || []).forEach(function (a) {
      saveActionFeedback(a.id, { revisionRound: next });
    });
    saveWorkbenchStore(store);
    return next;
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

  function actionStatusBadge(action) {
    var appr = approvalStatus(action.id);
    if (appr === 'approved_for_execution') {
      return '<span class="badge badge-green">✓ מאושר לביצוע</span>';
    }
    var s = action.status || 'pending';
    if (/done|completed|בוצע/.test(s)) return '<span class="badge badge-green">● הושלם</span>';
    if (/in_progress|progress/.test(s)) return '<span class="badge badge-purple">📝 בביצוע</span>';
    return '<span class="badge badge-yellow">⏳ ממתין</span>';
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
    return '<div class="coco-act-impact-badges' + (compact ? ' coco-act-impact-compact' : '') + '" data-impact-fields="' + items.length + '">' +
      items.map(function (row) {
        return '<span class="coco-act-impact-item" title="' + esc(row[1]) + '" data-impact-key="' + escAttr(row[1]) + '">' +
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
      '<button type="button" class="btn btn-primary coco-act-btn-sm coco-act-chat-send" data-chat-send="' + escAttr(action.id) + '" ' +
      'data-page-id="' + escAttr(page.id || '') + '">שלח</button>' +
      '</div></div></div>';
  }

  function fbField(field, label, value, actionId) {
    return '<label class="coco-act-fb-field">' +
      '<span class="coco-act-fb-label">' + esc(label) + '</span>' +
      '<textarea rows="2" class="coco-act-fb-input" data-fb-field="' + field + '" data-fb-action="' + escAttr(actionId) + '">' +
      esc(value || '') + '</textarea></label>';
  }

  function renderActionItem(action, page, idx, deferFeedback) {
    var ba = buildBeforeAfterFallback(page, action);
    var appr = approvalStatus(action.id);
    var approved = appr === 'approved_for_execution';
    var itemNum = getActionNumber(action.id);
    var impact = parseImpactFields(ba, action);
    var fbHtml = deferFeedback
      ? '<div class="coco-act-fb-deferred" data-fb-defer="' + escAttr(action.id) + '" data-page-id="' + escAttr(page.id || '') + '" data-item-num="' + (itemNum || '') + '"></div>'
      : renderFeedbackPanel(action, page, itemNum);

    return '<div class="coco-act-item action-card" data-action-id="' + escAttr(action.id) + '" data-page-id="' + escAttr(action.pageId || '') + '">' +
      '<div class="coco-act-item-head">' +
      '<div class="coco-act-item-title">' +
      (itemNum ? '<span class="coco-act-num-tag">#' + itemNum + '</span> ' : '') +
      esc(action.category || action.title) +
      ' <span class="badge badge-blue coco-act-work-badge" title="זמן עבודה משוער">⏱ ' + esc(impact.workFormatted) + '</span></div>' +
      '<div class="coco-act-item-badges">' + sourceBadge(action.source) + ' ' +
      priorityBadge(action.urgency || action.priority) + ' ' + actionStatusBadge(action) + '</div></div>' +
      renderBeforeAfter(ba, itemNum, action) +
      fbHtml +
      '<div class="coco-act-item-footer">' +
      (approved
        ? '<span class="badge badge-green" style="font-size:12px;">✓ מאושר לביצוע · ' + esc(new Date(getApprovals()[action.id].at).toLocaleString('he-IL')) + '</span>' +
          ' <button type="button" class="btn btn-ghost coco-act-btn-sm" data-act-revoke="' + escAttr(action.id) + '" onclick="CocoActRevokeApproval(\'' + escAttr(action.id) + '\')">↩ בטל אישור</button>'
        : '<button type="button" class="btn btn-green coco-act-btn-sm" data-act-approve="' + escAttr(action.id) + '" onclick="CocoActApprove(\'' + escAttr(action.id) + '\',this)">✅ אישור לביצוע</button>') +
      ' <span class="coco-act-approval-note">לא משנה את dalia-c.com · Staging בלבד</span>' +
      '</div></div>';
  }

  function hydratePagePanel(panel) {
    if (!panel || panel.getAttribute('data-hydrated') === 'true') return;
    var pageId = panel.getAttribute('data-lazy-page-id');
    var idx = Number(panel.getAttribute('data-page-idx') || 0);
    var entry = _lastRenderActions.find(function (g) { return g.page && g.page.id === pageId; });
    if (!entry) return;
    var actions = entry.items || [];
    panel.innerHTML = actions.length
      ? actions.map(function (a, i) { return renderActionItem(a, entry.page, idx * 100 + i, true); }).join('')
      : '<div class="alert alert-ok" style="margin:0;">אין פעולות פתוחות לעמוד זה 🎉</div>';
    panel.setAttribute('data-hydrated', 'true');
    hydrateDeferredFeedback(panel);
  }

  function hydrateDeferredFeedback(container) {
    (container || document).querySelectorAll('[data-fb-defer]').forEach(function (slot) {
      if (slot.getAttribute('data-fb-ready')) return;
      var actionId = slot.getAttribute('data-fb-defer');
      var pageId = slot.getAttribute('data-page-id');
      var itemNum = slot.getAttribute('data-item-num');
      var ctx = findActionAndPage(actionId);
      if (!ctx.action || !ctx.page) return;
      slot.outerHTML = renderFeedbackPanel(ctx.action, ctx.page, itemNum ? Number(itemNum) : null);
      slot.setAttribute('data-fb-ready', 'true');
    });
  }

  function togglePagePanel(panelId, btn) {
    var panel = document.getElementById(panelId);
    if (!panel) return;
    var open = panel.style.display !== 'none';
    if (!open) hydratePagePanel(panel);
    panel.style.display = open ? 'none' : 'block';
    if (btn) {
      var ch = btn.querySelector('.coco-act-chevron');
      if (ch) ch.textContent = open ? '▼' : '▲';
    }
  }

  function renderPageCard(page, actions, idx) {
    var panelId = 'coco-act-page-panel-' + idx;
    var openCount = actions.length;
    var gsc = page.gsc || {};
    var gscLine = gsc.impressions ? (gsc.clicks || 0) + ' קליקים · ' + gsc.impressions + ' חשיפות' : 'GSC: —';
    var revRound = getPageRevisionRound(page.id, actions);
    var approvedCount = actions.filter(function (a) { return approvalStatus(a.id) === 'approved_for_execution'; }).length;
    var pageTime = computeTimeSummary(actions);

    return '<div class="coco-act-page-card card" data-page-id="' + escAttr(page.id) + '" data-page-idx="' + idx + '">' +
      '<div class="coco-act-page-head">' +
      '<div class="coco-act-page-info">' +
      '<div class="coco-act-page-title">#' + (page.rank || idx + 1) + ' · ' + esc(page.title || page.path) + '</div>' +
      '<div class="coco-act-page-meta">' +
      '<a href="' + esc(page.url || page.pageUrl || '#') + '" target="_blank" rel="noopener" class="coco-act-path-link">' + esc(page.path) + ' ↗</a>' +
      ' · SEO ' + esc(page.seoScore != null ? page.seoScore + '/10' : '—') +
      ' · ' + esc(gscLine) +
      ' · <strong>' + openCount + '</strong> פעולות' +
      (openCount ? ' · <span class="badge badge-blue" style="font-size:10px;">⏱ ' + esc(formatHebrewDuration(pageTime.totalMin)) + '</span>' : '') +
      ' · <span class="badge badge-gray" style="font-size:10px;">סבב ' + revRound + '</span>' +
      (approvedCount ? ' · <span class="badge badge-green" style="font-size:10px;">' + approvedCount + ' מאושרים</span>' : '') +
      '</div>' +
      (openCount ? renderTimeSummaryBar(pageTime, true) : '') +
      '</div>' +
      '<div class="coco-act-page-btns">' +
      '<a href="' + esc(page.url || page.pageUrl || '#') + '" target="_blank" rel="noopener" class="btn btn-ghost coco-act-btn-sm">👁️ צפה בעמוד</a>' +
      '<button type="button" class="btn btn-primary coco-act-btn-preview coco-act-btn-sm" data-act-preview="' + escAttr(page.id) + '" data-page-idx="' + idx + '" title="פתח סביבת עבודה — תצוגה מקדימה עם סימון שינויים">' +
      '🔍 תצוגה מקדימה — לפני/אחרי</button>' +
      '<button type="button" class="btn btn-ghost coco-act-btn-sm" data-act-toggle="' + escAttr(panelId) + '" onclick="CocoActTogglePage(\'' + escAttr(panelId) + '\',this)">' +
      '📋 פירוט תיקונים <span class="coco-act-chevron">▼</span></button>' +
      '</div>' +
      '<div class="coco-act-page-tools">' +
      '<label class="coco-act-compare-toggle">' +
      '<input type="checkbox" data-act-compare="' + escAttr(page.id) + '"> השוואה לפני/אחרי בתצוגה מקדימה</label>' +
      '<span class="badge badge-yellow coco-act-preview-status" data-preview-status="' + escAttr(page.id) + '">תצוגה: מוכן</span>' +
      '</div></div>' +
      '<div id="' + panelId + '" class="coco-act-page-panel" style="display:none;" data-lazy-page-id="' + escAttr(page.id) + '" data-page-idx="' + idx + '" data-hydrated="false">' +
      '<div class="coco-act-panel-placeholder">לחץ «פירוט תיקונים» לטעינת ' + openCount + ' פעולות</div></div></div>';
  }

  function scheduleLazyPageCards(pageGroups, startIdx) {
    _lazyGen += 1;
    var myGen = _lazyGen;
    var idx = startIdx;
    function renderBatch() {
      if (myGen !== _lazyGen) return;
      if (idx >= pageGroups.length) {
        var root = document.getElementById('coco-live-actions-pending');
        if (root && myGen === _lazyGen) root.setAttribute('data-coco-act-ready', 'true');
        return;
      }
      var lazyRoot = document.getElementById('coco-act-lazy-root');
      if (!lazyRoot || myGen !== _lazyGen) return;
      var end = Math.min(idx + LAZY_BATCH_SIZE, pageGroups.length);
      var batch = pageGroups.slice(idx, end).map(function (grp, i) {
        return renderPageCard(grp.page, grp.items, idx + i);
      }).join('');
      lazyRoot.insertAdjacentHTML('beforebegin', batch);
      idx = end;
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(renderBatch, { timeout: 120 });
      } else {
        setTimeout(renderBatch, 20);
      }
    }
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(renderBatch, { timeout: 250 });
    } else {
      setTimeout(renderBatch, 30);
    }
  }

  function pagesBase() {
    var base = window.COCO_PAGES_BASE || '/future-craft-core/';
    if (base.charAt(0) !== '/') base = '/' + base.replace(/^\.\//, '');
    return location.origin + base;
  }

  function loadCrawlData() {
    if (_crawlCache) return Promise.resolve(_crawlCache);
    if (_crawlPromise) return _crawlPromise;
    var base = pagesBase() + 'project-001/';
    _crawlPromise = Promise.all([
      fetch(base + 'site-crawl-lite.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }),
      fetch(base + 'site-pages-index.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
    ]).then(function (results) {
      var lite = results[0];
      var index = results[1];
      if (lite && index && index.pages && index.pages.business) {
        var byPath = {};
        index.pages.business.forEach(function (p) { byPath[String(p.path || '/').replace(/\/$/, '') || '/'] = p; });
        if (lite.crawl && lite.crawl.pages) {
          lite.crawl.pages.forEach(function (p) {
            var key = String(p.path || '/').replace(/\/$/, '') || '/';
            var extra = byPath[key];
            if (extra) Object.keys(extra).forEach(function (k) { if (!p[k]) p[k] = extra[k]; });
          });
        }
      }
      _crawlCache = lite;
      return lite;
    }).catch(function () { return null; });
    return _crawlPromise;
  }

  function findCrawlPage(crawl, page) {
    if (!crawl || !crawl.crawl || !crawl.crawl.pages) return null;
    var path = String(page.path || '/').replace(/\/$/, '') || '/';
    return crawl.crawl.pages.find(function (p) {
      var cp = String(p.path || '/').replace(/\/$/, '') || '/';
      return cp === path || p.url === page.url || p.url === page.pageUrl;
    }) || null;
  }

  function mapTypeToTarget(type) {
    var t = String(type || '').toLowerCase();
    if (t === 'title') return 'title';
    if (t === 'meta') return 'meta';
    if (t === 'h1') return 'h1';
    if (t === 'h2') return 'h2';
    if (t === 'content') return 'content';
    return 'technical';
  }

  function getCachedPageHtml(pageId) {
    if (!pageId) return null;
    if (_htmlMemCache[pageId]) return _htmlMemCache[pageId];
    try {
      var raw = sessionStorage.getItem(HTML_CACHE_PREFIX + pageId);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (Date.now() - parsed.at < HTML_CACHE_TTL_MS && parsed.html) {
        _htmlMemCache[pageId] = parsed.html;
        return parsed.html;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function setCachedPageHtml(pageId, html) {
    if (!pageId || !html) return;
    _htmlMemCache[pageId] = html;
    try {
      sessionStorage.setItem(HTML_CACHE_PREFIX + pageId, JSON.stringify({ at: Date.now(), html: html }));
    } catch (e) { /* ignore quota */ }
  }

  function fetchPageHtml(url, pageId) {
    if (!url) return Promise.resolve(null);
    var cached = pageId ? getCachedPageHtml(pageId) : null;
    if (cached) return Promise.resolve(cached);
    var proxies = [
      'https://api.allorigins.win/raw?url=',
      'https://corsproxy.io/?',
    ];
    function tryProxy(i) {
      if (i >= proxies.length) return Promise.resolve(null);
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 8000) : null;
      return fetch(proxies[i] + encodeURIComponent(url), {
        cache: 'no-store',
        signal: ctrl ? ctrl.signal : undefined,
      })
        .then(function (r) { return r.ok ? r.text() : null; })
        .then(function (html) {
          if (timer) clearTimeout(timer);
          if (html && html.length > 500 && /<html/i.test(html)) {
            if (pageId) setCachedPageHtml(pageId, html);
            return html;
          }
          return tryProxy(i + 1);
        })
        .catch(function () {
          if (timer) clearTimeout(timer);
          return tryProxy(i + 1);
        });
    }
    return tryProxy(0);
  }

  function applyPreviewRender(modal, state, pageId, statusEl, selectFirst) {
    var sidebar = document.getElementById('coco-act-wb-sidebar');
    modal._previewState = state;
    if (sidebar) sidebar.innerHTML = renderPreviewSidebar(state, modal._selectedChangeId);
    setPreviewMode(modal, modal._previewMode || 'after');
    if (selectFirst && state.changes.length && !modal._selectedChangeId) {
      selectPreviewChange(state.changes[0].id);
    } else if (modal._selectedChangeId) {
      highlightPreviewChange(modal._selectedChangeId);
    }
    if (statusEl) {
      statusEl.textContent = state.rawHtml ? 'תצוגה: HTML מלא ✓' : 'תצוגה: crawl+SSOT ✓';
      statusEl.className = 'badge badge-green coco-act-preview-status';
    }
    var modeBadge = document.getElementById('coco-act-preview-mode');
    if (modeBadge) {
      var labels = { current: 'קיים', after: 'אחרי שינויים', compare: 'השוואה' };
      modeBadge.textContent = (state.htmlSource === 'proxy-html' ? 'HTML מלא · ' : 'crawl+SSOT · ') +
        (labels[modal._previewMode] || modal._previewMode);
    }
  }

  function buildPagePreviewState(page, actions, crawlPage, rawHtml) {
    var changes = [];
    (actions || []).forEach(function (action) {
      var ba = buildBeforeAfterFallback(page, action);
      var num = getActionNumber(action.id);
      var afterVal = ba.after || ba.proposed;
      if (!afterVal || afterVal === '—') afterVal = ba.proposed || ba.current;
      changes.push({
        id: action.id,
        num: num,
        type: action.recommendationType || action.category,
        category: action.category || action.title,
        target: mapTypeToTarget(action.recommendationType),
        beforeValue: ba.current || '—',
        afterValue: afterVal,
        ba: ba,
        impact: parseImpactFields(ba, action),
        action: action,
      });
    });
    changes.sort(function (a, b) { return (a.num || 0) - (b.num || 0); });
    return {
      page: page,
      changes: changes,
      crawlPage: crawlPage || {},
      rawHtml: rawHtml || null,
      htmlSource: rawHtml ? 'proxy-html' : 'reconstructed',
      url: page.url || page.pageUrl || '',
    };
  }

  function effectiveFieldValue(state, field, variant) {
    var crawl = state.crawlPage || {};
    var page = state.page || {};
    var base = {
      title: crawl.title || page.title || page.path || 'דליה',
      meta: crawl.metaDescription || '—',
      h1: crawl.h1 || page.title || '—',
      content: page.aiSummary || crawl.metaDescription || page.contentStatus || 'תוכן העמוד',
    };
    var val = base[field] || '—';
    (state.changes || []).forEach(function (ch) {
      if (ch.target !== field) return;
      val = variant === 'after' ? (ch.afterValue || val) : (ch.beforeValue || val);
    });
    return val;
  }

  function wrapChangeMarker(changeId, num, innerHtml, showMarkers) {
    if (!showMarkers || !changeId) return innerHtml;
    return '<div class="coco-change-wrap" data-change-id="' + escAttr(changeId) + '">' +
      '<span class="coco-change-marker">#' + esc(String(num || '?')) + '</span>' +
      innerHtml + '</div>';
  }

  function findChangeByTarget(state, target) {
    return (state.changes || []).find(function (c) { return c.target === target; }) || null;
  }

  function buildReconstructedBody(state, variant, showMarkers) {
    var page = state.page || {};
    var title = effectiveFieldValue(state, 'title', variant);
    var meta = effectiveFieldValue(state, 'meta', variant);
    var h1 = effectiveFieldValue(state, 'h1', variant);
    var content = effectiveFieldValue(state, 'content', variant);
    var h2s = (state.crawlPage && state.crawlPage.h2 && state.crawlPage.h2.slice)
      ? state.crawlPage.h2.slice(0, 6)
      : (page.improvements || []).slice(0, 4).map(function (x) { return String(x).slice(0, 90); });
    if (!h2s.length) h2s = ['השירותים שלנו', 'למה לבחור בדליה?', 'צור קשר'];

    var h2Change = (state.changes || []).find(function (c) { return c.target === 'h2'; });
    if (h2Change && variant === 'after') h2s[0] = h2Change.afterValue || h2s[0];
    else if (h2Change && variant === 'before') h2s[0] = h2Change.beforeValue || h2s[0];

    var titleCh = findChangeByTarget(state, 'title');
    var metaCh = findChangeByTarget(state, 'meta');
    var h1Ch = findChangeByTarget(state, 'h1');
    var contentCh = findChangeByTarget(state, 'content');

    var serpTitleInner = '<div class="coco-pv-serp-title">' + esc(title) + '</div>';
    var serpMetaInner = '<div class="coco-pv-serp-meta">' + esc(meta) + '</div>';
    if (showMarkers && titleCh) serpTitleInner = wrapChangeMarker(titleCh.id, titleCh.num, serpTitleInner, true);
    if (showMarkers && metaCh) serpMetaInner = wrapChangeMarker(metaCh.id, metaCh.num, serpMetaInner, true);
    var serpHtml = '<div class="coco-pv-serp"><div class="coco-pv-serp-url">' + esc(state.url || 'dalia-c.com') + '</div>' +
      serpTitleInner + serpMetaInner + '</div>';

    var h1Inner = '<h1 data-coco-field="h1">' + esc(String(h1).replace(/\n/g, ' ')) + '</h1>';
    var h1Html = wrapChangeMarker(h1Ch && h1Ch.id, h1Ch && h1Ch.num, h1Inner, showMarkers && h1Ch);

    var introInner = '<p class="coco-pv-intro" data-coco-field="content">' + esc(content) + '</p>';
    var introHtml = wrapChangeMarker(contentCh && contentCh.id, contentCh && contentCh.num, introInner, showMarkers && contentCh);

    var sectionsHtml = h2s.map(function (h2, idx) {
      var ch = idx === 0 ? h2Change : null;
      var inner = '<h2 data-coco-field="h2">' + esc(String(h2).replace(/\n/g, ' ')) + '</h2>' +
        '<p>' + esc(page.aiSummary || 'תוכן מקטע — מבוסס נתוני crawl ו-SSOT') + '</p>';
      if (ch && showMarkers) {
        return '<section class="coco-pv-section">' +
          wrapChangeMarker(ch.id, ch.num, inner, true) + '</section>';
      }
      return '<section class="coco-pv-section">' + inner + '</section>';
    }).join('');

    var techChanges = (state.changes || []).filter(function (c) { return c.target === 'technical'; });
    var techHtml = techChanges.length
      ? '<div class="coco-pv-tech"><h3>שינויים טכניים מסומנים (' + techChanges.length + ')</h3>' +
        techChanges.map(function (ch) {
          var pin = '<strong>' + esc(ch.category) + '</strong><br>' +
            '<span style="font-size:12px;color:#78350f">' + esc(ch.afterValue) + '</span>';
          if (!showMarkers) return '<div class="coco-tech-pin">' + pin + '</div>';
          return '<div class="coco-tech-pin coco-change-wrap" data-change-id="' + escAttr(ch.id) + '">' +
            '<span class="coco-change-marker">#' + esc(String(ch.num)) + '</span>' + pin + '</div>';
        }).join('') + '</div>'
      : '';

    return '<div class="coco-pv-banner">📄 תצוגת עמוד מלאה — ' +
      (state.htmlSource === 'proxy-html' ? 'HTML מ-crawl/proxy' : 'מבוסס crawl+SSOT') +
      ' · Staging preview · לא האתר החי</div>' +
      '<header class="coco-pv-site-header">דליה — פתרונות תפעול ותחזוקה לרכב</header>' +
      '<nav class="coco-pv-nav"><span>דף הבית</span><span>שירותים</span><span>צור קשר</span></nav>' +
      serpHtml +
      '<div class="coco-pv-hero">' + h1Html + introHtml + '</div>' +
      sectionsHtml + techHtml;
  }

  function sanitizePreviewHtml(html) {
    return String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
      .replace(/on\w+="[^"]*"/gi, '')
      .replace(/on\w+='[^']*'/gi, '');
  }

  function injectMarkersIntoRawHtml(html, state, variant, showMarkers) {
    if (!html || typeof DOMParser === 'undefined') return null;
    try {
      var clean = sanitizePreviewHtml(html);
      var doc = new DOMParser().parseFromString(clean, 'text/html');
      var base = doc.createElement('base');
      base.href = 'https://dalia-c.com/';
      if (doc.head.firstChild) doc.head.insertBefore(base, doc.head.firstChild);
      else doc.head.appendChild(base);

      var banner = doc.createElement('div');
      banner.className = 'coco-pv-banner';
      banner.innerHTML = '📄 HTML מלא מ-crawl/proxy · שינויים מסומנים · Staging preview';
      if (doc.body.firstChild) doc.body.insertBefore(banner, doc.body.firstChild);
      else doc.body.appendChild(banner);

      (state.changes || []).forEach(function (ch) {
        var val = variant === 'after' ? ch.afterValue : ch.beforeValue;
        var el = null;
        if (ch.target === 'title') {
          doc.title = val;
          el = doc.querySelector('h1') || doc.body;
        } else if (ch.target === 'meta') {
          el = doc.querySelector('meta[name="description"]');
          if (el) el.setAttribute('content', val);
          else {
            var m = doc.createElement('meta');
            m.name = 'description';
            m.content = val;
            doc.head.appendChild(m);
          }
          el = doc.querySelector('p') || doc.body;
        } else if (ch.target === 'h1') {
          el = doc.querySelector('h1');
          if (el) el.textContent = val;
        } else if (ch.target === 'h2') {
          el = doc.querySelector('h2');
          if (el) el.textContent = val;
        } else if (ch.target === 'content') {
          el = doc.querySelector('main p, article p, .entry-content p, p');
          if (el) el.textContent = val;
        }
        if (!el && ch.target === 'technical') {
          var pin = doc.createElement('div');
          pin.className = 'coco-tech-pin';
          pin.setAttribute('data-change-id', ch.id);
          pin.innerHTML = '<span class="coco-change-marker">#' + ch.num + '</span><strong>' +
            esc(ch.category) + '</strong><br>' + esc(val);
          doc.body.appendChild(pin);
          return;
        }
        if (!el || !showMarkers) return;
        if (el.getAttribute('data-change-id')) return;
        var wrap = doc.createElement('div');
        wrap.className = 'coco-change-wrap';
        wrap.setAttribute('data-change-id', ch.id);
        var badge = doc.createElement('span');
        badge.className = 'coco-change-marker';
        badge.textContent = '#' + ch.num;
        el.parentNode.insertBefore(wrap, el);
        wrap.appendChild(badge);
        wrap.appendChild(el);
      });

      var style = doc.createElement('style');
      style.textContent = PREVIEW_MARKER_CSS;
      doc.head.appendChild(style);
      var script = doc.createElement('script');
      script.textContent = PREVIEW_BRIDGE_SCRIPT;
      doc.body.appendChild(script);
      return '<!DOCTYPE html><html' + (doc.documentElement.getAttribute('lang') ? ' lang="' + doc.documentElement.getAttribute('lang') + '"' : '') +
        ' dir="' + (doc.documentElement.getAttribute('dir') || 'rtl') + '"><head>' + doc.head.innerHTML + '</head><body>' + doc.body.innerHTML + '</body></html>';
    } catch (e) {
      return null;
    }
  }

  function buildPreviewDocument(state, mode) {
    mode = mode || 'after';
    var showMarkers = true;

    function singleDoc(variant, label) {
      var bodyHtml;
      if (state.rawHtml) {
        bodyHtml = injectMarkersIntoRawHtml(state.rawHtml, state, variant, showMarkers);
      }
      if (!bodyHtml) {
        bodyHtml = '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8">' +
          '<meta name="viewport" content="width=device-width,initial-scale=1">' +
          '<title>' + esc(effectiveFieldValue(state, 'title', variant)) + '</title>' +
          '<style>body{font-family:Heebo,Arial,sans-serif;margin:0;padding:0;background:#fff;color:#0f172a;line-height:1.5}' +
          PREVIEW_MARKER_CSS + '</style></head><body>' +
          buildReconstructedBody(state, variant, showMarkers) +
          '<script>' + PREVIEW_BRIDGE_SCRIPT + '<\/script></body></html>';
      }
      if (label) {
        return '<div class="coco-pv-compare-pane"><div class="coco-pv-pane-label ' + (variant === 'before' ? 'before' : 'after') + '">' +
          esc(label) + '</div>' + bodyHtml.replace('<!DOCTYPE html>', '').replace(/<html[^>]*>/, '<div class="coco-pv-inner">').replace('</html>', '</div>') + '</div>';
      }
      return bodyHtml;
    }

    if (mode === 'compare') {
      var beforeInner = state.rawHtml
        ? (injectMarkersIntoRawHtml(state.rawHtml, state, 'before', showMarkers) || '')
        : '';
      var afterInner = state.rawHtml
        ? (injectMarkersIntoRawHtml(state.rawHtml, state, 'after', showMarkers) || '')
        : '';
      if (!beforeInner || !afterInner) {
        return '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8">' +
          '<meta name="viewport" content="width=device-width,initial-scale=1">' +
          '<title>השוואה — ' + esc(state.page.title || '') + '</title>' +
          '<style>body{margin:0;font-family:Heebo,Arial,sans-serif}' + PREVIEW_MARKER_CSS +
          '</style></head><body><div class="coco-pv-compare">' +
          '<div class="coco-pv-compare-pane"><div class="coco-pv-pane-label before">העמוד הקיים</div>' +
          buildReconstructedBody(state, 'before', showMarkers) + '</div>' +
          '<div class="coco-pv-compare-pane"><div class="coco-pv-pane-label after">לאחר השינויים</div>' +
          buildReconstructedBody(state, 'after', showMarkers) + '</div></div>' +
          '<script>' + PREVIEW_BRIDGE_SCRIPT + '<\/script></body></html>';
      }
      return beforeInner; // fallback — compare via dual frames in parent
    }

    if (mode === 'current') return singleDoc('before');
    return singleDoc('after');
  }

  function renderPreviewSidebar(state, selectedId) {
    var changes = state.changes || [];
    if (!changes.length) {
      return '<div class="coco-act-wb-empty">אין שינויים מוצעים לעמוד זה</div>';
    }
    return changes.map(function (ch) {
      var a = ch.action || {};
      var ba = ch.ba || {};
      var src = a.source || ba.source || '';
      var pri = a.urgency || a.priority || 'בינוני';
      var appr = approvalStatus(ch.id);
      var sel = ch.id === selectedId ? ' coco-act-wb-change-active' : '';
      return '<button type="button" class="coco-act-wb-change' + sel + '" data-wb-change="' + escAttr(ch.id) + '">' +
        '<div class="coco-act-wb-change-head">' +
        '<span class="coco-act-wb-change-num">#' + (ch.num || '?') + '</span>' +
        '<span class="coco-act-wb-change-title">' + esc(ch.category) + '</span></div>' +
        '<div class="coco-act-wb-change-badges">' + sourceBadge(src) + ' ' + priorityBadge(pri) +
        (appr === 'approved_for_execution' ? ' <span class="badge badge-green">✓ מאושר</span>' : '') +
        '</div>' +
        '<div class="coco-act-wb-change-detail">' +
        '<div class="coco-act-wb-row"><span class="lbl">נוכחי:</span> ' + esc(truncate(ch.beforeValue, 90)) + '</div>' +
        '<div class="coco-act-wb-row"><span class="lbl">שינוי:</span> ' + esc(truncate(ch.afterValue, 90)) + '</div>' +
        '<div class="coco-act-wb-row"><span class="lbl">למה:</span> ' + esc(truncate(ba.why, 100)) + '</div>' +
        '</div>' +
        renderImpactBadges(ch.impact, true) +
        '</button>';
    }).join('');
  }

  function truncate(s, n) {
    s = String(s == null ? '' : s);
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  function renderPreviewFeedbackBar(action, page, itemNum) {
    if (!action || !page) {
      return '<div class="coco-act-wb-fb-empty">בחר שינוי מהרשימה או לחץ על סימון # בתצוגה</div>';
    }
    var appr = approvalStatus(action.id);
    var approved = appr === 'approved_for_execution';
    var footer = '<div class="coco-act-wb-fb-footer">' +
      (approved
        ? '<span class="badge badge-green">✓ מוכן לביצוע · Staging בלבד</span> ' +
          '<button type="button" class="btn btn-ghost coco-act-btn-sm" onclick="CocoActRevokeApproval(\'' + escAttr(action.id) + '\')">↩ בטל אישור</button>'
        : '<button type="button" class="btn btn-green coco-act-btn-sm" onclick="CocoActApprove(\'' + escAttr(action.id) + '\',this)">✅ מוכן לביצוע</button>') +
      ' <span class="coco-act-approval-note">לא משנה את dalia-c.com</span></div>';
    return renderFeedbackPanel(action, page, itemNum) + footer;
  }

  function ensurePreviewModal() {
    var existing = document.getElementById('coco-act-preview-modal');
    if (existing && !existing.querySelector('.coco-act-wb-body')) {
      existing.remove();
      existing = null;
    }
    if (existing) return existing;
    var screen = document.getElementById('screen-actions');
    var wrap = document.createElement('div');
    wrap.id = 'coco-act-preview-modal';
    wrap.className = 'coco-act-preview-overlay';
    wrap.style.display = 'none';
    wrap.innerHTML =
      '<div class="coco-act-preview-dialog coco-act-wb-dialog" role="dialog" aria-modal="true" aria-label="סביבת עבודה — תצוגה מקדימה">' +
      '<div class="coco-act-preview-head">' +
      '<div><div class="coco-act-preview-title">🔍 סביבת עבודה — תצוגה מקדימה</div>' +
      '<div class="coco-act-preview-sub" id="coco-act-preview-sub"></div></div>' +
      '<button type="button" class="btn-icon coco-act-preview-close" aria-label="סגור">✕</button></div>' +
      '<div class="coco-act-wb-tabs" role="tablist">' +
      '<button type="button" class="coco-act-wb-tab" data-preview-mode="current" role="tab">העמוד הקיים</button>' +
      '<button type="button" class="coco-act-wb-tab coco-act-wb-tab-active" data-preview-mode="after" role="tab">העמוד לאחר השינויים</button>' +
      '<button type="button" class="coco-act-wb-tab" data-preview-mode="compare" role="tab">השוואה לפני/אחרי</button>' +
      '<span class="badge badge-yellow" id="coco-act-preview-mode">טוען…</span></div>' +
      '<div class="coco-act-wb-body">' +
      '<aside class="coco-act-wb-sidebar" id="coco-act-wb-sidebar" aria-label="רשימת שינויים"></aside>' +
      '<div class="coco-act-wb-main">' +
      '<div class="coco-act-wb-frames" id="coco-act-wb-frames">' +
      '<iframe id="coco-act-preview-frame" class="coco-act-preview-frame" title="תצוגה מקדימה" sandbox="allow-scripts allow-same-origin"></iframe>' +
      '</div></div></div>' +
      '<div class="coco-act-wb-feedback" id="coco-act-wb-feedback"></div>' +
      '</div>';
    (screen || document.body).appendChild(wrap);
    wrap.querySelector('.coco-act-preview-close').addEventListener('click', closePreviewModal);
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap) closePreviewModal();
      var tab = e.target.closest('[data-preview-mode]');
      if (tab) {
        setPreviewMode(wrap, tab.getAttribute('data-preview-mode'));
        return;
      }
      var chBtn = e.target.closest('[data-wb-change]');
      if (chBtn) {
        selectPreviewChange(chBtn.getAttribute('data-wb-change'));
        return;
      }
      var send = e.target.closest('[data-chat-send]');
      if (send) sendScopedChat(send.getAttribute('data-chat-send'));
    });
    wrap.addEventListener('input', function (e) {
      var ta = e.target.closest('[data-fb-field]');
      if (!ta) return;
      scheduleFeedbackSave(ta.getAttribute('data-fb-action'), ta.getAttribute('data-fb-field'), ta.value);
    });
    wrap.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var input = e.target.closest('[data-chat-input]');
      if (input) {
        e.preventDefault();
        sendScopedChat(input.getAttribute('data-chat-input'));
      }
    });
    bindPreviewMessaging();
    return wrap;
  }

  function bindPreviewMessaging() {
    if (_previewMsgBound) return;
    _previewMsgBound = true;
    window.addEventListener('message', function (e) {
      if (!e.data || e.data.type !== 'coco-act-preview-select') return;
      var modal = document.getElementById('coco-act-preview-modal');
      if (!modal || modal.style.display === 'none') return;
      selectPreviewChange(e.data.changeId);
    });
  }

  function setPreviewMode(modal, mode) {
    modal = modal || document.getElementById('coco-act-preview-modal');
    if (!modal || !modal._previewState) return;
    modal._previewMode = mode;
    modal.querySelectorAll('[data-preview-mode]').forEach(function (btn) {
      btn.classList.toggle('coco-act-wb-tab-active', btn.getAttribute('data-preview-mode') === mode);
    });
    renderPreviewFrames(modal._previewState, mode);
    var modeBadge = document.getElementById('coco-act-preview-mode');
    if (modeBadge) {
      var labels = { current: 'קיים', after: 'אחרי שינויים', compare: 'השוואה' };
      modeBadge.textContent = (modal._previewState.htmlSource === 'proxy-html' ? 'HTML מלא · ' : 'crawl+SSOT · ') +
        (labels[mode] || mode);
    }
  }

  function renderPreviewFrames(state, mode) {
    var framesWrap = document.getElementById('coco-act-wb-frames');
    if (!framesWrap) return;
    mode = mode || 'after';

    if (mode === 'compare') {
      framesWrap.innerHTML =
        '<iframe id="coco-act-preview-frame-before" class="coco-act-preview-frame coco-act-preview-frame-split" title="לפני" sandbox="allow-scripts allow-same-origin"></iframe>' +
        '<iframe id="coco-act-preview-frame-after" class="coco-act-preview-frame coco-act-preview-frame-split" title="אחרי" sandbox="allow-scripts allow-same-origin"></iframe>';
      var beforeF = document.getElementById('coco-act-preview-frame-before');
      var afterF = document.getElementById('coco-act-preview-frame-after');
      if (beforeF) beforeF.srcdoc = buildPreviewDocument(state, 'current');
      if (afterF) afterF.srcdoc = buildPreviewDocument(state, 'after');
    } else {
      framesWrap.innerHTML =
        '<iframe id="coco-act-preview-frame" class="coco-act-preview-frame" title="תצוגה מקדימה" sandbox="allow-scripts allow-same-origin"></iframe>';
      var frame = document.getElementById('coco-act-preview-frame');
      if (frame) frame.srcdoc = buildPreviewDocument(state, mode);
    }
  }

  function highlightPreviewChange(changeId) {
    var frames = document.querySelectorAll('#coco-act-wb-frames iframe');
    frames.forEach(function (frame) {
      try {
        if (frame.contentWindow) {
          frame.contentWindow.postMessage({ type: 'coco-act-highlight', changeId: changeId }, '*');
        }
      } catch (e) { /* ignore */ }
    });
  }

  function selectPreviewChange(changeId) {
    var modal = document.getElementById('coco-act-preview-modal');
    if (!modal || !modal._previewState) return;
    modal._selectedChangeId = changeId;
    var sidebar = document.getElementById('coco-act-wb-sidebar');
    if (sidebar) {
      sidebar.innerHTML = renderPreviewSidebar(modal._previewState, changeId);
    }
    var ch = (modal._previewState.changes || []).find(function (c) { return c.id === changeId; });
    var fb = document.getElementById('coco-act-wb-feedback');
    if (fb) {
      fb.innerHTML = ch
        ? renderPreviewFeedbackBar(ch.action, modal._previewState.page, ch.num)
        : renderPreviewFeedbackBar(null, null, null);
    }
    highlightPreviewChange(changeId);
    var activeBtn = sidebar && sidebar.querySelector('[data-wb-change="' + changeId + '"]');
    if (activeBtn) activeBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function closePreviewModal() {
    var modal = document.getElementById('coco-act-preview-modal');
    if (modal) modal.style.display = 'none';
  }

  function openPagePreview(pageId, pageIdx) {
    var page = null;
    var actions = [];
    _lastRenderActions.forEach(function (entry) {
      if (entry.page && entry.page.id === pageId) {
        page = entry.page;
        actions = entry.items || [];
      }
    });
    if (!page) return;

    var modal = ensurePreviewModal();
    var sub = document.getElementById('coco-act-preview-sub');
    if (sub) {
      sub.textContent = (page.path || '') + ' · ' + actions.length + ' תיקונים · לחץ על # בתצוגה או ברשימה';
    }
    modal.style.display = 'flex';
    modal._previewMode = 'after';
    modal._selectedChangeId = null;

    var statusEl = document.querySelector('[data-preview-status="' + pageId + '"]');
    if (statusEl) {
      statusEl.textContent = 'תצוגה: טוען…';
      statusEl.className = 'badge badge-purple coco-act-preview-status';
    }

    var sidebar = document.getElementById('coco-act-wb-sidebar');
    if (sidebar) sidebar.innerHTML = '<div class="coco-act-wb-loading">טוען נתוני עמוד…</div>';
    var fb = document.getElementById('coco-act-wb-feedback');
    if (fb) fb.innerHTML = renderPreviewFeedbackBar(null, null, null);

    var pageUrl = page.url || page.pageUrl || '';

    loadCrawlData().then(function (crawl) {
      var crawlPage = findCrawlPage(crawl, page);
      if (!crawlPage) {
        crawlPage = { title: page.title, h1: page.title, metaDescription: page.metaDescription || '' };
      }
      var state = buildPagePreviewState(page, actions, crawlPage, null);
      modal._previewActions = actions;
      modal._previewPage = page;
      applyPreviewRender(modal, state, pageId, statusEl, true);

      fetchPageHtml(pageUrl, pageId).then(function (rawHtml) {
        if (!rawHtml || modal.style.display === 'none') return;
        state.rawHtml = rawHtml;
        state.htmlSource = 'proxy-html';
        applyPreviewRender(modal, state, pageId, statusEl, false);
      });
    });
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
        'זו תצוגת Staging — לאחר אישורך בלבד יוכלו ליישם בעתיד. ' +
        'לשינוי נוסף — מלא «מה צריך לשנות» ולחץ שמור.',
      local: true,
    });
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

  var _fbSaveTimer = null;
  function scheduleFeedbackSave(actionId, field, value) {
    clearTimeout(_fbSaveTimer);
    _fbSaveTimer = setTimeout(function () {
      var patch = {};
      patch[field] = value;
      saveActionFeedback(actionId, patch);
    }, 350);
  }

  function bindWorkbenchEvents() {
    var root = document.getElementById('coco-live-actions-pending');
    if (!root || root._actWorkbenchBound) return;
    root._actWorkbenchBound = true;

    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-act-toggle]');
      if (t) {
        togglePagePanel(t.getAttribute('data-act-toggle'), t);
        return;
      }
      var prev = e.target.closest('[data-act-preview]');
      if (prev) {
        openPagePreview(prev.getAttribute('data-act-preview'), prev.getAttribute('data-page-idx'));
        return;
      }
      var appr = e.target.closest('[data-act-approve]');
      if (appr) {
        window.CocoActApprove(appr.getAttribute('data-act-approve'), appr);
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

    root.addEventListener('input', function (e) {
      var ta = e.target.closest('[data-fb-field]');
      if (!ta) return;
      scheduleFeedbackSave(ta.getAttribute('data-fb-action'), ta.getAttribute('data-fb-field'), ta.value);
    });

    root.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var input = e.target.closest('[data-chat-input]');
      if (input) {
        e.preventDefault();
        sendScopedChat(input.getAttribute('data-chat-input'));
      }
    });

    root.addEventListener('change', function (e) {
      var cmp = e.target.closest('[data-act-compare]');
      if (!cmp) return;
      var modal = document.getElementById('coco-act-preview-modal');
      if (modal && modal.style.display !== 'none' && modal._previewState) {
        setPreviewMode(modal, cmp.checked ? 'compare' : 'after');
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

    var wp = (bundle && bundle.workPlan) || (window.DaliaSite && DaliaSite.getWorkPlan && DaliaSite.getWorkPlan());
    var pages = (wp && wp.pages) ? wp.pages.slice() : [];
    pages.sort(function (a, b) { return (a.rank || 999) - (b.rank || 999); });

    var allActions = applyCtxFilter(deriveActions(bundle), function (a) {
      return { action: a.category, status: a.status, campaign: a.campaignId };
    });
    bootstrapSequenceNumbers(allActions);

    var pending = allActions.filter(function (a) {
      return a.status !== 'done' && a.status !== 'completed';
    });
    var done = allActions.filter(function (a) {
      return a.status === 'done' || a.status === 'completed';
    });

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

    var totalTime = computeTimeSummary(pending);

    var pendingHeader = previewBanner() +
      renderTimeSummaryBar(totalTime) +
      '<div class="alert alert-info" style="margin-bottom:14px;">⚙️ ' +
      pending.length + ' פעולות פתוחות · ' + pages.length + ' עמודים · מספור יציב #' +
      (getSeqState().nextActionItemNumber - 1) + ' · קמפיין: ' +
      esc((wp && wp.campaign && wp.campaign.name) || 'SEO') + '</div>';

    var initialGroups = pageGroups.slice(0, LAZY_INITIAL_CARDS);
    var cardsHtml = initialGroups.map(function (grp, idx) {
      return renderPageCard(grp.page, grp.items, idx);
    }).join('');
    cardsHtml += '<div id="coco-act-lazy-root" aria-hidden="true"></div>';

    setHtml('coco-live-actions-pending', pages.length ? pendingHeader + cardsHtml : emptyStatus('אין עמודים ב-SSOT'));

    if (pageGroups.length > LAZY_INITIAL_CARDS) {
      scheduleLazyPageCards(pageGroups, LAZY_INITIAL_CARDS);
    } else {
      var rootEl = document.getElementById('coco-live-actions-pending');
      if (rootEl) rootEl.setAttribute('data-coco-act-ready', 'true');
    }

    setHtml('coco-live-actions-done', done.length ? done.slice(0, 50).map(function (a) {
      var num = getActionNumber(a.id);
      return '<tr><td>' + (num ? '#' + num + ' ' : '') + esc(a.title) + '</td><td>' + esc(a.pagePath || '—') + '</td><td>' + esc(a.category) + '</td><td>' + esc(a.source) + '</td><td>' + (statusBadge ? statusBadge('done') : 'done') + '</td></tr>';
    }).join('') : '<tr><td colspan="5">אין פעולות שהושלמו עדיין</td></tr>');

    var sub = document.querySelector('#screen-actions .page-subtitle');
    if (sub && isLiveGoalsActionsMode && isLiveGoalsActionsMode()) {
      sub.textContent = pending.length + ' פעולות · ' + pages.length + ' עמודים · מסך עבודה (תצוגה בלבד)';
    }

    bindWorkbenchEvents();
    return pending.length;
  }

  window.CocoActTogglePage = function (panelId, btn) {
    togglePagePanel(panelId, btn);
  };

  window.CocoActOpenPreview = function (pageId, pageIdx) {
    openPagePreview(pageId, pageIdx);
  };

  window.CocoActApprove = function (actionId, btn) {
    if (EXECUTION_MODE !== 'preview') return;
    saveApproval(actionId, 'approved_for_execution');
    if (typeof showToast === 'function') showToast('✓ אושר לביצוע (Staging בלבד — לא שונה באתר החי)');
    if (window.CocoData && CocoData.bindScreen) CocoData.bindScreen('screen-actions');
  };

  window.CocoActRevokeApproval = function (actionId) {
    var map = getApprovals();
    delete map[actionId];
    writeJson(APPROVAL_KEY, map);
    if (typeof showToast === 'function') showToast('אישור בוטל');
    if (window.CocoData && CocoData.bindScreen) CocoData.bindScreen('screen-actions');
  };

  window.ActionsWorkbench = {
    render: render,
    getApprovals: getApprovals,
    getSeqState: getSeqState,
    getActionNumber: getActionNumber,
    getActionFeedback: getActionFeedback,
    buildPagePreviewState: buildPagePreviewState,
    buildPreviewDocument: buildPreviewDocument,
    parseImpactFields: parseImpactFields,
    getEstimatedWorkMinutes: getEstimatedWorkMinutes,
    formatHebrewDuration: formatHebrewDuration,
    computeTimeSummary: computeTimeSummary,
    selectPreviewChange: selectPreviewChange,
    openPagePreview: openPagePreview,
    EXECUTION_MODE: EXECUTION_MODE,
    APPROVAL_KEY: APPROVAL_KEY,
    WORKBENCH_KEY: WORKBENCH_KEY,
    SEQ_KEY: SEQ_KEY,
  };
})();
