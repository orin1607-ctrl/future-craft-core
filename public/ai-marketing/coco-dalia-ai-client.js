/**
 * CO.CO דליה — AI Client (Phase 5)
 * Calls marketing-ai-chat / marketing-claude-chat when COCO_STAGING auth present.
 */
(function () {
  'use strict';

  var VERSION = '5.0.0-ai';

  function staging() {
    return window.COCO_STAGING || {};
  }

  function edgeUrl(name) {
    var s = staging();
    if (!s.supabaseUrl) return null;
    return s.supabaseUrl.replace(/\/$/, '') + '/functions/v1/' + name;
  }

  function hasAuth() {
    var s = staging();
    return !!(s.supabaseUrl && s.accessToken);
  }

  function chat(opts) {
    opts = opts || {};
    var s = staging();
    if (!hasAuth()) {
      return Promise.resolve({ ok: false, reason: 'no-auth', message: 'התחבר דרך דליה (Super Admin)' });
    }
    var body = {
      prompt: opts.prompt || '',
      system: opts.system || 'אתה עוזר שיווק דיגיטלי מקצועי. ענה בעברית, בקצרה.',
      module: opts.module || 'coco-dalia',
      clientContext: opts.clientContext || {},
      history: opts.history || [],
    };
    var provider = opts.provider || 'claude';
    var url = provider === 'openai'
      ? (edgeUrl('marketing-ai-chat') || s.marketingChatUrl)
      : (edgeUrl('marketing-claude-chat') || s.marketingClaudeChatUrl);
    if (!url) return Promise.resolve({ ok: false, reason: 'no-edge-url' });
    return fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + s.accessToken,
        'Content-Type': 'application/json',
        apikey: s.anonKey || '',
      },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json(); }).catch(function (err) {
      return { ok: false, reason: err.message || 'fetch-failed' };
    });
  }

  function enhanceAssistant(baseReport, ctx) {
    if (!hasAuth()) return Promise.resolve(baseReport);
    var prompt = 'נתח עוזר "' + baseReport.name + '" עבור עסק: ' +
      ((ctx.biz && (ctx.biz.companyName || ctx.biz.bizName)) || 'לא ידוע') +
      '. ממצאים: ' + baseReport.found + '. פערים: ' + (baseReport.gaps || []).join(', ') +
      '. החזר JSON קצר: {improvements:[], urgency:"low|medium|high"}';
    return chat({ prompt: prompt, provider: 'claude', module: 'assistant-' + baseReport.id }).then(function (res) {
      if (res && res.ok && res.reply) {
        baseReport.recommended = res.reply.slice(0, 500);
        baseReport._aiEnhanced = true;
      }
      return baseReport;
    }).catch(function () { return baseReport; });
  }

  window.CocoDaliaAiClient = {
    VERSION: VERSION,
    hasAuth: hasAuth,
    chat: chat,
    enhanceAssistant: enhanceAssistant,
  };
})();
