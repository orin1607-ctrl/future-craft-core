/**
 * AI Question Engine — Smart Filters + Natural Language Queries (Mission 23.12)
 * Parses Hebrew/English questions, applies FilterEngine, returns structured answers.
 * Works on Staging with local data (CocoData, DailyEngine, localStorage).
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var STORAGE_KEY = 'coco-ai-questions-v1';
  var MAX_HISTORY = 100;

  var FILTER_DIMENSIONS = [
    'company', 'client', 'site', 'campaign', 'page', 'keyword',
    'manager', 'goal', 'action', 'status', 'date', 'period',
    'ai_assistant', 'reports', 'history',
  ];

  var STATUS_MAP = {
    'ממתין': 'pending', 'pending': 'pending', 'ממתין לאישור': 'pending',
    'בביצוע': 'in_progress', 'in_progress': 'in_progress',
    'הושלם': 'done', 'done': 'done', 'completed': 'done',
    'באיחור': 'overdue', 'overdue': 'overdue', 'delayed': 'overdue',
    'דחוף': 'urgent', 'urgent': 'urgent',
    'פעיל': 'active', 'active': 'active',
    'טיוטה': 'draft', 'draft': 'draft',
  };

  var PERIOD_MAP = {
    'היום': 'today', 'today': 'today',
    'שבוע': 'week', 'week': 'week', 'השבוע': 'week',
    'חודש': 'month', 'month': 'month', 'החודש': 'month',
    'שנה': 'year', 'year': 'year',
  };

  var ENTITY_PATTERNS = [
    { key: 'status', re: /(?:סטטוס|status)\s*[:\-]?\s*(\S+)/i },
    { key: 'status', re: /(?:ממתין(?:\s+לאישור)?|באיחור|overdue|pending|done|הושלם|בביצוע)/i, transform: function (m) { return STATUS_MAP[m[0].toLowerCase()] || m[0]; } },
    { key: 'campaign', re: /(?:קמפיין|campaign)\s*[:\-]?\s*["']?([^"'\n,]+)/i },
    { key: 'keyword', re: /(?:מיל(?:ת|ות)\s*מפתח|keyword)\s*[:\-]?\s*["']?([^"'\n,]+)/i },
    { key: 'page', re: /(?:עמוד|page)\s*[:\-]?\s*["']?([^"'\n,]+)/i },
    { key: 'client', re: /(?:לקוח|client|חברה|company)\s*[:\-]?\s*["']?([^"'\n,]+)/i },
    { key: 'site', re: /(?:אתר|site)\s*[:\-]?\s*["']?([^"'\n,]+)/i },
    { key: 'manager', re: /(?:מנהל(?:\s+שיווק)?|manager)\s*[:\-]?\s*["']?([^"'\n,]+)/i },
    { key: 'ai_assistant', re: /(?:claude|gemini|chatgpt|openai|gpt)/i, transform: function (m) { return m[0].toLowerCase().replace('gpt', 'openai').replace('chatgpt', 'openai'); } },
    { key: 'period', re: /(?:היום|השבוע|החודש|today|week|month)/i, transform: function (m) { return PERIOD_MAP[m[0].toLowerCase()] || m[0]; } },
  ];

  var INTENT_PATTERNS = [
    { intent: 'list_actions', re: /(?:כל\s+)?(?:ה)?פעולות|actions?|משימות|tasks?/i },
    { intent: 'list_pages', re: /(?:כל\s+)?(?:ה)?עמודים|pages?|דפים/i },
    { intent: 'list_goals', re: /(?:כל\s+)?(?:ה)?מטרות|goals?|יעדים/i },
    { intent: 'pending_approval', re: /ממתין(?:\s+לאישור)?|pending\s*approval|לא\s*אושר/i },
    { intent: 'overdue', re: /באיחור|overdue|איחור|פג(?:\s+תוקף)?/i },
    { intent: 'compare_ai', re: /(?:claude|gemini|chatgpt).*(?:\+|ו|and).*(?:claude|gemini|chatgpt)|המלצות\s*(?:מ)?(?:claude|gemini)/i },
    { intent: 'summary', re: /סיכום|summary|תמצת|סכם/i },
    { intent: 'analyze', re: /נתח|analyze|analysis|ניתוח/i },
    { intent: 'recommend', re: /המלץ|recommend|המלצ/i },
    { intent: 'history', re: /היסטוריה|history|שינויים|גרס(?:ה|אות)/i },
    { intent: 'reports', re: /דוח(?:ות)?|reports?/i },
    { intent: 'preview', re: /preview|תצוג(?:ה|ת)\s*מקדימ/i },
    { intent: 'approve_rationale', re: /(?:למה|מדוע|why).*(?:אשר|approve|דחה|reject)/i },
  ];

  function norm(s) { return String(s == null ? '' : s).toLowerCase().trim(); }

  function parseQuestion(question) {
    var q = String(question || '').trim();
    var filters = {};
    var intent = 'general';

    INTENT_PATTERNS.forEach(function (p) {
      if (p.re.test(q)) intent = p.intent;
    });

    ENTITY_PATTERNS.forEach(function (p) {
      var m = q.match(p.re);
      if (m) {
        filters[p.key] = p.transform ? p.transform(m) : (m[1] || m[0]).trim();
      }
    });

    if (/באיחור|overdue/.test(q)) { filters.status = 'overdue'; intent = intent === 'general' ? 'overdue' : intent; }
    if (/ממתין\s*לאישור|pending\s*approval/.test(q)) { filters.status = 'pending'; intent = 'pending_approval'; }

    var engines = [];
    ['claude', 'gemini', 'openai', 'chatgpt'].forEach(function (e) {
      if (new RegExp(e, 'i').test(q)) engines.push(e === 'chatgpt' ? 'openai' : e);
    });
    if (engines.length) filters.ai_assistant = engines;

    return { question: q, intent: intent, filters: filters, dimensions: FILTER_DIMENSIONS };
  }

  function applyFiltersToContext(filters) {
    if (!window.GlobalFilterContext || !GlobalFilterContext.set) return;
    var patch = {};
    if (filters.client) patch.clientId = filters.client;
    if (filters.campaign) patch.campaignId = filters.campaign;
    if (filters.site) patch.assetLabel = filters.site;
    if (filters.status) patch.status = filters.status;
    if (filters.page) patch.specificItem = { id: filters.page, type: 'page', path: filters.page };
    if (filters.period) patch.dateRange = { preset: filters.period };
    if (filters.keyword) patch.freeSearch = filters.keyword;
    if (Object.keys(patch).length) GlobalFilterContext.set(patch);
  }

  function getBundle() {
    if (window.CocoData && CocoData.getBundle) return CocoData.getBundle();
    if (window.DaliaSite && DaliaSite.buildLiveBundle) {
      var dash = (DaliaSite.getDashboard && DaliaSite.getDashboard()) || {};
      return DaliaSite.buildLiveBundle(dash);
    }
    return null;
  }

  function collectActions(bundle) {
    var wp = (bundle && bundle.workPlan) || (window.DaliaSite && DaliaSite.getWorkPlan && DaliaSite.getWorkPlan());
    var raw = (wp && wp.actions) || [];
    try {
      var drafts = JSON.parse(localStorage.getItem('dalia-daily-engine-draft-actions-v1') || '[]');
      drafts.forEach(function (d) { raw = raw.concat([d]); });
    } catch (e) { /* ignore */ }
    return raw;
  }

  function collectPages(bundle) {
    var wp = (bundle && bundle.workPlan) || (window.DaliaSite && DaliaSite.getWorkPlan && DaliaSite.getWorkPlan());
    return (wp && wp.pages) || [];
  }

  function collectKeywords() {
    var d = window.COCO && COCO.data;
    if (d && d.keywords) return d.keywords;
    if (d && d.searchConsole && d.searchConsole.keywords) return d.searchConsole.keywords;
    try {
      var kw = JSON.parse(localStorage.getItem('dalia-daily-engine-keywords-v1') || '{}');
      return kw.keywords || [];
    } catch (e) { return []; }
  }

  function filterItems(items, mapFn, parsed) {
    if (!window.FilterEngine) return items;
    var prevCtx = window.GlobalFilterContext ? GlobalFilterContext.get() : {};
    applyFiltersToContext(parsed.filters);
    var filtered = FilterEngine.filter(items, mapFn);
    if (window.GlobalFilterContext && GlobalFilterContext.set) GlobalFilterContext.set(prevCtx);
    return filtered;
  }

  function extraFilter(items, parsed) {
    var f = parsed.filters;
    return items.filter(function (item) {
      if (f.status === 'overdue') {
        var due = item.dueDate || item.deadline;
        if (due && new Date(due) < new Date() && item.status !== 'done' && item.status !== 'completed') return true;
        if (/overdue|באיחור|delayed/i.test(item.status || '')) return true;
        return false;
      }
      if (f.keyword) {
        var blob = JSON.stringify(item).toLowerCase();
        if (blob.indexOf(norm(f.keyword)) < 0) return false;
      }
      if (f.ai_assistant && Array.isArray(f.ai_assistant)) {
        var src = norm(item.source || item.aiEngine || item.provider || '');
        if (!f.ai_assistant.some(function (e) { return src.indexOf(e) >= 0; })) {
          if (parsed.intent !== 'compare_ai') return true;
        }
      }
      return true;
    });
  }

  function buildLinks(items, entityType) {
    var base = location.pathname.split('?')[0];
    var links = [];
    items.slice(0, 10).forEach(function (item) {
      var screen = entityType === 'action' ? 'actions' : entityType === 'page' ? 'goals' : 'hub';
      var label = item.title || item.name || item.pagePath || item.id || '—';
      links.push({
        label: label,
        screen: 'screen-' + screen,
        preview: entityType === 'action' && item.id ? 'preview:' + item.id : null,
        hash: item.id || item.pagePath || '',
      });
    });
    return links;
  }

  function summarizeItems(items, entityType, parsed) {
    var n = items.length;
    if (!n) return 'לא נמצאו תוצאות עבור: "' + parsed.question + '"';
    var statusBreak = {};
    items.forEach(function (it) {
      var s = it.status || 'unknown';
      statusBreak[s] = (statusBreak[s] || 0) + 1;
    });
    var statusStr = Object.keys(statusBreak).map(function (k) { return k + ': ' + statusBreak[k]; }).join(', ');
    return 'נמצאו ' + n + ' ' + (entityType === 'action' ? 'פעולות' : entityType === 'page' ? 'עמודים' : 'פריטים') +
      '. סטטוסים: ' + statusStr + '.';
  }

  function answerFromLocal(parsed) {
    var bundle = getBundle();
    var intent = parsed.intent;
    var result = { question: parsed.question, intent: intent, filters: parsed.filters, mode: 'local', items: [], summary: '', links: [], actions: [] };

    if (intent === 'list_actions' || intent === 'overdue' || intent === 'pending_approval' || /פעול/.test(parsed.question)) {
      var actions = collectActions(bundle);
      var mapFn = window.FilterMeta ? FilterMeta.action : function (a) { return { status: a.status, pagePath: a.pagePath, action: a.category }; };
      actions = filterItems(actions, mapFn, parsed);
      actions = extraFilter(actions, parsed);
      if (intent === 'pending_approval') actions = actions.filter(function (a) { return /pending|ממתין|approval|draft/i.test(a.status || ''); });
      result.items = actions;
      result.entityType = 'action';
      result.summary = summarizeItems(actions, 'action', parsed);
      result.links = buildLinks(actions, 'action');
      result.actions.push({ type: 'navigate', screen: 'screen-actions', label: 'פתח מסך פעולות' });
    } else if (intent === 'list_pages' || intent === 'list_goals' || /עמוד/.test(parsed.question)) {
      var pages = collectPages(bundle);
      var pageMap = window.FilterMeta ? FilterMeta.page : function (p) { return { pagePath: p.path, status: p.status }; };
      pages = filterItems(pages, pageMap, parsed);
      if (intent === 'pending_approval') pages = pages.filter(function (p) { return /pending|review|ממתין/i.test(p.executionStatus || p.status || ''); });
      result.items = pages;
      result.entityType = 'page';
      result.summary = summarizeItems(pages, 'page', parsed);
      result.links = buildLinks(pages, 'page');
      result.actions.push({ type: 'navigate', screen: 'screen-goals', label: 'פתח מסך מטרות/עמודים' });
    } else if (intent === 'history') {
      result.summary = 'היסטוריה: נתונים מ-localStorage ו-DailyEngine. ' + (function () {
        try {
          var h = JSON.parse(localStorage.getItem('dalia-daily-engine-history-lite-v1') || '[]');
          return h.length + ' רשומות history-lite.';
        } catch (e) { return '0 רשומות.'; }
      })();
      result.actions.push({ type: 'navigate', screen: 'screen-history', label: 'פתח היסטוריה' });
    } else if (intent === 'reports') {
      result.summary = 'דוחות זמינים במסך דוחות — KPI, SEO, קמפיינים, פעולות.';
      result.actions.push({ type: 'navigate', screen: 'screen-reports', label: 'פתח דוחות' });
    } else if (intent === 'compare_ai') {
      result.summary = 'השוואת המלצות AI — דורש MultiAiOrchestrator.multiEngine.';
      result.actions.push({ type: 'multi_ai', engines: parsed.filters.ai_assistant || ['openai', 'claude', 'gemini'] });
    } else {
      var allActions = extraFilter(filterItems(collectActions(bundle), window.FilterMeta ? FilterMeta.action : function () { return {}; }, parsed), parsed);
      result.items = allActions;
      result.summary = allActions.length ? summarizeItems(allActions, 'action', parsed) : 'שאילתה כללית — נסה לציין: פעולות, עמודים, קמפיין, סטטוס, או תקופה.';
    }

    if (parsed.filters.keyword) {
      var kws = collectKeywords().filter(function (k) {
        var q = norm(k.keyword || k.query || k);
        return q.indexOf(norm(parsed.filters.keyword)) >= 0;
      });
      if (kws.length) result.summary += ' מילות מפתח תואמות: ' + kws.length + '.';
    }

    return result;
  }

  function enrichWithAi(localResult, parsed) {
    if (!window.MultiAiOrchestrator) return Promise.resolve(localResult);
    if (parsed.intent === 'compare_ai' || (parsed.filters.ai_assistant && parsed.filters.ai_assistant.length > 1)) {
      var prompt = 'Summarize marketing data: ' + localResult.summary + '. Question: ' + parsed.question;
      return MultiAiOrchestrator.execute({ prompt: prompt, taskType: 'filter_query', multiEngine: true, engines: parsed.filters.ai_assistant }).then(function (multi) {
        localResult.multiAi = multi.comparison;
        localResult.summary += ' [Multi-AI: ' + (multi.comparison.agreement ? 'הסכמה' : 'חילוקי דעות — ראה multiAi') + ']';
        return localResult;
      });
    }
    if (parsed.intent === 'recommend' || parsed.intent === 'analyze' || parsed.intent === 'summary') {
      var p = localResult.summary + '\nשאלה: ' + parsed.question;
      return MultiAiOrchestrator.execute({ prompt: p, taskType: parsed.intent === 'analyze' ? 'analytics' : 'summary' }).then(function (res) {
        localResult.aiInsight = res.response;
        return localResult;
      });
    }
    return Promise.resolve(localResult);
  }

  function saveHistory(record) {
    try {
      var hist = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      hist.unshift(record);
      if (hist.length > MAX_HISTORY) hist.length = MAX_HISTORY;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(hist));
    } catch (e) { /* ignore */ }
  }

  /**
   * Main entry: ask a natural language question.
   * @param {string} question
   * @param {object} opts — { applyFilters, enrichAi }
   */
  function ask(question, opts) {
    opts = opts || {};
    var parsed = parseQuestion(question);
    if (opts.applyFilters !== false) applyFiltersToContext(parsed.filters);
    var local = answerFromLocal(parsed);
    var chain = opts.enrichAi !== false ? enrichWithAi(local, parsed) : Promise.resolve(local);
    return chain.then(function (result) {
      var record = { at: new Date().toISOString(), question: question, intent: parsed.intent, filters: parsed.filters, summary: result.summary, count: (result.items || []).length };
      saveHistory(record);
      result.parsed = parsed;
      return result;
    });
  }

  function getHistory(limit) {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]').slice(0, limit || 20);
    } catch (e) { return []; }
  }

  function openPreview(actionId) {
    if (window.ActionsWorkbench && ActionsWorkbench.openPreview) return ActionsWorkbench.openPreview(actionId);
    if (window.CocoActApprove && CocoActApprove.preview) return CocoActApprove.preview(actionId);
    if (typeof goScreen === 'function') goScreen('screen-actions');
    return false;
  }

  window.AiQuestionEngine = {
    VERSION: VERSION,
    FILTER_DIMENSIONS: FILTER_DIMENSIONS,
    parseQuestion: parseQuestion,
    ask: ask,
    getHistory: getHistory,
    openPreview: openPreview,
    answerFromLocal: answerFromLocal,
  };
})();
