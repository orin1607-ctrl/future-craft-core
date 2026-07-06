/**
 * Multi-AI Orchestrator — Professional AI Team infrastructure (Mission 23.11)
 * Routes tasks to ChatGPT / Claude / Gemini; evaluates additional providers.
 * Staging: rule-based stubs + registry; Live: delegates to CocoUnified Edge functions.
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var STORAGE_KEY = 'coco-multi-ai-runs-v1';
  var MAX_RUNS = 50;

  /* ── Primary engines (full support) ── */
  var PRIMARY_ENGINES = {
    openai: {
      id: 'openai',
      label: 'ChatGPT (OpenAI)',
      icon: '🟢',
      wired: true,
      apiEnabled: true,
      tier: 'primary',
      strengths: ['כתיבת תוכן', 'ניתוח כללי', 'תרגום', 'סיכום', 'קוד'],
      weaknesses: ['עלות גבוהה ב-scale', 'לא מחובר לרשת בזמן אמת', 'hallucination'],
      bestTasks: ['content', 'summary', 'general', 'translation', 'code'],
      freeVsPaid: 'Free tier מוגבל · GPT-4o דורש תשלום',
      connect: true,
      realValue: 'high',
      duplication: 'low',
    },
    claude: {
      id: 'claude',
      label: 'Claude (Anthropic)',
      icon: '🟣',
      wired: true,
      apiEnabled: true,
      tier: 'primary',
      strengths: ['ניתוח ארוך', 'הוראות מורכבות', 'כתיבה עדינה', 'קוד'],
      weaknesses: ['אין חיפוש web מובנה'],
      bestTasks: ['analysis', 'long_doc', 'strategy', 'code', 'review'],
      freeVsPaid: 'API בלבד · אין free tier ישיר',
      connect: true,
      realValue: 'high',
      duplication: 'medium',
    },
    gemini: {
      id: 'gemini',
      label: 'Gemini (Google)',
      icon: '🔵',
      wired: true,
      apiEnabled: true,
      tier: 'primary',
      strengths: ['נתוני Google', 'multimodal', 'SEO/GSC context', 'מהיר'],
      weaknesses: ['פחות יציב בטקסט ארוך', 'תלות Google ecosystem'],
      bestTasks: ['seo', 'google_data', 'multimodal', 'analytics', 'summary'],
      freeVsPaid: 'Free tier נדיב · Flash חינמי',
      connect: true,
      realValue: 'high',
      duplication: 'low',
    },
  };

  /* ── Evaluated engines (recommendation only) ── */
  var EVALUATED_ENGINES = {
    perplexity: {
      id: 'perplexity',
      label: 'Perplexity',
      icon: '🔎',
      wired: false,
      tier: 'evaluated',
      strengths: ['חיפוש web בזמן אמת', 'מקורות מצוטטים', 'מחקר מתחרים'],
      weaknesses: ['לא IDE-integrated', 'עלות API', 'פחות מתאים לכתיבה ארוכה'],
      bestTasks: ['research', 'competitors', 'trends', 'fact_check'],
      freeVsPaid: 'Free מוגבל · Pro $20/חודש',
      connect: 'recommended_phase2',
      realValue: 'high',
      duplication: 'low',
      verdict: 'מומלץ — ממלא פער חיפוש web שאין ל-ChatGPT/Claude/Gemini',
    },
    grok: {
      id: 'grok',
      label: 'Grok (xAI)',
      icon: '⚡',
      wired: false,
      tier: 'evaluated',
      strengths: ['X/Twitter realtime', 'טון ישיר', 'חדשות'],
      weaknesses: ['API מוגבל', 'פחות מתאים ל-SEO B2B', 'איכות משתנה'],
      bestTasks: ['social_trends', 'news', 'brand_monitoring'],
      freeVsPaid: 'X Premium+ · API beta',
      connect: 'optional',
      realValue: 'medium',
      duplication: 'high',
      verdict: 'אופציונלי — ערך בעיקר ל-social/trends, לא ל-core marketing',
    },
    deepseek: {
      id: 'deepseek',
      label: 'DeepSeek',
      icon: '🧠',
      wired: false,
      tier: 'evaluated',
      strengths: ['עלות נמוכה', 'קוד חזק', 'reasoning'],
      weaknesses: ['שרתים ב-China', 'privacy concerns', 'פחות עברית'],
      bestTasks: ['code', 'cost_sensitive', 'batch_analysis'],
      freeVsPaid: 'API זול מאוד',
      connect: 'optional',
      realValue: 'medium',
      duplication: 'high',
      verdict: 'אופציונלי — fallback זול לקוד/batch, לא primary',
    },
    github_copilot: {
      id: 'github_copilot',
      label: 'GitHub Copilot',
      icon: '💻',
      wired: false,
      tier: 'evaluated',
      strengths: ['IDE integration', 'קוד', 'refactoring'],
      weaknesses: ['לא marketing', 'לא chat UI', 'לא multi-tenant'],
      bestTasks: ['dev_only', 'code_review', 'scripts'],
      freeVsPaid: '$10-19/חודש',
      connect: 'dev_only',
      realValue: 'low_for_marketing',
      duplication: 'high',
      verdict: 'לא לחיבור — כלי פיתוח בלבד, לא חלק מ-AI Team שיווק',
    },
    mistral: {
      id: 'mistral',
      label: 'Mistral',
      icon: '🌬️',
      wired: false,
      tier: 'evaluated',
      strengths: ['EU privacy', 'מהיר', 'open weights'],
      weaknesses: ['פחות brand recognition', 'עברית חלשה'],
      bestTasks: ['eu_compliance', 'fast_inference'],
      freeVsPaid: 'Free tier + API',
      connect: 'optional',
      realValue: 'medium',
      duplication: 'high',
      verdict: 'אופציונלי — EU clients בלבד',
    },
  };

  /* ── Task → engine routing matrix ── */
  var TASK_ROUTING = {
    content: { primary: 'openai', fallback: 'claude', reason: 'כתיבת תוכן — ChatGPT מוביל' },
    seo: { primary: 'gemini', fallback: 'openai', reason: 'SEO + Google data — Gemini מוביל' },
    analytics: { primary: 'gemini', fallback: 'openai', reason: 'GA4/GSC — Gemini context' },
    strategy: { primary: 'claude', fallback: 'openai', reason: 'אסטרטגיה ארוכה — Claude' },
    summary: { primary: 'openai', fallback: 'gemini', reason: 'סיכום מהיר — ChatGPT' },
    research: { primary: 'perplexity', fallback: 'gemini', reason: 'מחקר web — Perplexity (phase 2)' },
    competitors: { primary: 'perplexity', fallback: 'claude', reason: 'מתחרים — Perplexity' },
    code: { primary: 'claude', fallback: 'openai', reason: 'קוד — Claude/OpenAI' },
    review: { primary: 'claude', fallback: 'openai', reason: 'ביקורת — Claude' },
    google_data: { primary: 'gemini', fallback: 'openai', reason: 'Google APIs — Gemini' },
    general: { primary: 'openai', fallback: 'gemini', reason: 'כללי — ChatGPT default' },
    approval: { primary: 'claude', fallback: 'openai', reason: 'החלטות אישור — Claude reasoning' },
    filter_query: { primary: 'openai', fallback: 'gemini', reason: 'שאילתות NL — ChatGPT parsing' },
  };

  function isApiLive() {
    return !!(window.COCO_STAGING && window.COCO_STAGING.accessToken);
  }

  function engineAvailable(id) {
    var eng = PRIMARY_ENGINES[id];
    if (!eng) return false;
    if (!eng.wired) return false;
    if (eng.apiEnabled && !isApiLive()) return false;
    if (id === 'claude' && !eng.apiEnabled) return false;
    return true;
  }

  function classifyTask(taskType, prompt) {
    if (taskType && TASK_ROUTING[taskType]) return taskType;
    var p = String(prompt || '').toLowerCase();
    if (/seo|gsc|מילות מפתח|keyword|אינדקס/.test(p)) return 'seo';
    if (/ga4|אנליטיק|analytics|traffic|תנועה/.test(p)) return 'analytics';
    if (/תוכן|content|מאמר|כתוב/.test(p)) return 'content';
    if (/מתחר|competitor|מחקר|research/.test(p)) return 'research';
    if (/אסטרateg|strategy|תוכנית/.test(p)) return 'strategy';
    if (/אישור|approve|reject|דחה/.test(p)) return 'approval';
    if (/סיכום|summary|תמצת/.test(p)) return 'summary';
    if (/קוד|code|script/.test(p)) return 'code';
    if (/סינון|filter|מצא|הראה|רשימ/.test(p)) return 'filter_query';
    return 'general';
  }

  function selectEngine(taskType, opts) {
    opts = opts || {};
    var route = TASK_ROUTING[taskType] || TASK_ROUTING.general;
    var preferred = opts.forceEngine || route.primary;
    var fallback = route.fallback;

    if (engineAvailable(preferred)) {
      return { engineId: preferred, reason: route.reason, mode: 'primary' };
    }
    if (engineAvailable(fallback)) {
      return { engineId: fallback, reason: 'Fallback: ' + route.reason, mode: 'fallback' };
    }
    return { engineId: 'stub', reason: 'Staging — no live API; rule-based stub', mode: 'stub' };
  }

  function stubResponse(taskType, prompt, engineId) {
    var eng = PRIMARY_ENGINES[engineId] || { label: 'AI Stub' };
    return {
      engineId: engineId,
      engineLabel: eng.label,
      text: '[Stub · ' + eng.label + '] משימה: ' + taskType + '. ב-Staging אין קריאת API — תשובה מבוססת כללים. Prompt: ' + String(prompt || '').slice(0, 120),
      confidence: 0.6,
      mode: 'stub',
    };
  }

  function callLiveEngine(engineId, prompt, opts) {
    if (!window.CocoUnified || !CocoUnified.marketingAiChat) {
      return Promise.resolve(stubResponse(opts.taskType, prompt, engineId));
    }
    var provider = engineId === 'openai' ? undefined : engineId;
    return CocoUnified.marketingAiChat({
      provider: provider,
      message: prompt,
      context: opts.context || '',
    }).then(function (res) {
      var text = (res && (res.reply || res.message || res.content)) || JSON.stringify(res);
      return {
        engineId: engineId,
        engineLabel: (PRIMARY_ENGINES[engineId] || {}).label || engineId,
        text: text,
        confidence: 0.85,
        mode: 'live',
        raw: res,
      };
    }).catch(function (err) {
      return stubResponse(opts.taskType, prompt, engineId);
    });
  }

  function compareResponses(responses) {
    if (!responses || responses.length < 2) {
      return { agreement: true, differences: [], finalRecommendation: responses[0] || null };
    }
    var texts = responses.map(function (r) { return String(r.text || '').toLowerCase().slice(0, 200); });
    var agreement = texts.every(function (t) { return t === texts[0]; });
    var differences = [];
    if (!agreement) {
      responses.forEach(function (r, i) {
        differences.push({
          engineId: r.engineId,
          engineLabel: r.engineLabel,
          summary: String(r.text || '').slice(0, 300),
          confidence: r.confidence,
        });
      });
    }
    var sorted = responses.slice().sort(function (a, b) { return (b.confidence || 0) - (a.confidence || 0); });
    var finalRec = sorted[0];
    if (!agreement && finalRec) {
      finalRec.disagreementNote = 'מנועי AI חלקו — המלצה סופית: ' + finalRec.engineLabel + ' (confidence גבוה ביותר)';
    }
    return {
      agreement: agreement,
      differences: differences,
      allRecommendations: responses,
      finalRecommendation: finalRec,
    };
  }

  function saveRun(record) {
    try {
      var runs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      runs.unshift(record);
      if (runs.length > MAX_RUNS) runs.length = MAX_RUNS;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
    } catch (e) { /* ignore */ }
  }

  /**
   * Execute task with auto-selected engine.
   * @param {object} opts — { prompt, taskType, context, multiEngine }
   */
  function execute(opts) {
    opts = opts || {};
    var prompt = opts.prompt || '';
    var taskType = classifyTask(opts.taskType, prompt);
    var selection = selectEngine(taskType, opts);

    if (opts.multiEngine) {
      var engines = opts.engines || ['openai', 'claude', 'gemini'].filter(engineAvailable);
      if (!engines.length) engines = ['openai'];
      return Promise.all(engines.map(function (eid) {
        if (engineAvailable(eid)) return callLiveEngine(eid, prompt, { taskType: taskType, context: opts.context });
        return Promise.resolve(stubResponse(taskType, prompt, eid));
      })).then(function (responses) {
        var cmp = compareResponses(responses);
        var record = { at: new Date().toISOString(), taskType: taskType, multiEngine: true, comparison: cmp };
        saveRun(record);
        return { taskType: taskType, selection: selection, comparison: cmp, mode: isApiLive() ? 'live' : 'stub' };
      });
    }

    if (selection.mode === 'stub' || !engineAvailable(selection.engineId)) {
      var stub = stubResponse(taskType, prompt, selection.engineId === 'stub' ? 'openai' : selection.engineId);
      saveRun({ at: new Date().toISOString(), taskType: taskType, engineId: stub.engineId, mode: 'stub' });
      return Promise.resolve({ taskType: taskType, selection: selection, response: stub, mode: 'stub' });
    }

    return callLiveEngine(selection.engineId, prompt, { taskType: taskType, context: opts.context }).then(function (res) {
      saveRun({ at: new Date().toISOString(), taskType: taskType, engineId: res.engineId, mode: res.mode });
      return { taskType: taskType, selection: selection, response: res, mode: res.mode };
    });
  }

  function getRegistry() {
    return {
      primary: Object.keys(PRIMARY_ENGINES).map(function (k) { return PRIMARY_ENGINES[k]; }),
      evaluated: Object.keys(EVALUATED_ENGINES).map(function (k) { return EVALUATED_ENGINES[k]; }),
      routing: TASK_ROUTING,
    };
  }

  function getRuns(limit) {
    try {
      var runs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return runs.slice(0, limit || 20);
    } catch (e) { return []; }
  }

  window.MultiAiOrchestrator = {
    VERSION: VERSION,
    PRIMARY_ENGINES: PRIMARY_ENGINES,
    EVALUATED_ENGINES: EVALUATED_ENGINES,
    TASK_ROUTING: TASK_ROUTING,
    execute: execute,
    selectEngine: selectEngine,
    classifyTask: classifyTask,
    compareResponses: compareResponses,
    getRegistry: getRegistry,
    getRuns: getRuns,
    isApiLive: isApiLive,
    engineAvailable: engineAvailable,
  };
})();
