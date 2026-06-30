/**
 * AI Strategy Room — unified recommendation panel from all virtual agents.
 * Staging only · reuses existing panel CSS classes.
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var MISSING = 'חסר מידע';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function buildUnifiedRecommendation() {
    if (!window.AiConsultant) return null;
    var ideas = AiConsultant.generateIdeas('report');
    var sections = [];

    if (ideas.keywordIdeas) {
      var kws = Array.isArray(ideas.keywordIdeas.suggested) ? ideas.keywordIdeas.suggested.slice(0, 5) : [];
      sections.push({
        title: 'מילות מפתח',
        items: kws.length ? kws.map(function (k) { return { text: k, why: 'הרחבת כיסוי SEO ו-FleetOS' }; }) : [{ text: MISSING, why: '' }],
      });
    }

    if (ideas.targetAudienceIdeas) {
      var aud = Array.isArray(ideas.targetAudienceIdeas.suggested) ? ideas.targetAudienceIdeas.suggested.slice(0, 4) : [];
      sections.push({
        title: 'קהל יעד',
        items: aud.length ? aud.map(function (a) { return { text: a.segment, why: a.why || MISSING }; }) : [{ text: MISSING, why: '' }],
      });
    }

    if (ideas.regionIdeas) {
      var regs = Array.isArray(ideas.regionIdeas.suggested) ? ideas.regionIdeas.suggested.slice(0, 4) : [];
      sections.push({
        title: 'אזורים',
        items: regs.length ? regs.map(function (r) { return { text: r.region, why: r.why || MISSING }; }) : [{ text: MISSING, why: '' }],
      });
    }

    if (ideas.serviceIdeas) {
      var svcs = Array.isArray(ideas.serviceIdeas.suggested) ? ideas.serviceIdeas.suggested.slice(0, 4) : [];
      sections.push({
        title: 'שירותים',
        items: svcs.length ? svcs.map(function (s) { return { text: s.name, why: s.why || MISSING }; }) : [{ text: MISSING, why: '' }],
      });
    }

    if (ideas.pageIdeas) {
      var pages = Array.isArray(ideas.pageIdeas.suggested) ? ideas.pageIdeas.suggested.slice(0, 4) : [];
      sections.push({
        title: 'עמודים',
        items: pages.length ? pages.map(function (p) { return { text: p.name, why: p.why || MISSING }; }) : [{ text: MISSING, why: '' }],
      });
    }

    var executive = ideas.strategicReport && ideas.strategicReport.executiveSummary
      ? ideas.strategicReport.executiveSummary.join(' · ')
      : (window.AiConsultant.buildExecutiveSummary ? AiConsultant.buildExecutiveSummary(ideas) : MISSING);

    return { ideas: ideas, sections: sections, executive: executive };
  }

  function renderInlinePanel(container) {
    if (!container) return;
    var unified = buildUnifiedRecommendation();
    if (!unified) {
      container.innerHTML = '<div class="card" style="margin-top:12px;"><div class="s">' + esc(MISSING) + ' — AiConsultant לא זמין</div></div>';
      return;
    }

    var agentsHtml = (unified.ideas.agentContributions || []).map(function (a) {
      return '<span style="font-size:10px;color:var(--w50);margin-left:6px;">' + esc(a.agent) +
        (a.status === 'missing' ? ' (' + MISSING + ')' : '') + '</span>';
    }).join('');

    var sectionsHtml = unified.sections.map(function (sec) {
      var itemsHtml = sec.items.map(function (it) {
        return '<div style="font-size:11px;color:var(--w80);margin:3px 0;">• <strong>' + esc(it.text) + '</strong>' +
          (it.why ? ' — <span style="color:var(--w50);">למה: ' + esc(it.why) + '</span>' : '') + '</div>';
      }).join('');
      return '<div style="margin-top:10px;"><div class="st">' + esc(sec.title) + '</div>' + itemsHtml + '</div>';
    }).join('');

    var actionHtml = (unified.ideas.actionPlan && unified.ideas.actionPlan.items || []).slice(0, 5).map(function (a) {
      return '<div style="font-size:11px;color:var(--w80);">#' + a.priority + ' ' + esc(a.area) + ': ' + esc(a.action) + '</div>';
    }).join('');

    container.innerHTML =
      '<div class="card" style="margin-top:12px;border:1px solid var(--w10);">' +
      '<div class="ph-t">🧠 חדר אסטרטגיה AI — המלצה מאוחדת</div>' +
      '<div class="s">סיכום מכל הסוכנים הווירטואליים · ' + esc(unified.ideas.generatedAt || '') + '</div>' +
      '<div style="margin-top:6px;flex-wrap:wrap;">' + agentsHtml + '</div>' +
      '<div class="alt alt-i" style="margin-top:10px;font-size:12px;color:var(--w80);">' + esc(unified.executive) + '</div>' +
      sectionsHtml +
      '<div style="margin-top:12px;"><div class="st">תוכנית פעולה מיידית</div>' + (actionHtml || '<div class="s">' + esc(MISSING) + '</div>') + '</div>' +
      '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">' +
      (window.AiConsultant ? AiConsultant.buttonHtml('report', 'ac-btn-strategy-room') : '') +
      '<button type="button" class="btn btn-p" id="asr-refresh" style="padding:4px 10px;font-size:11px;">🔄 רענן המלצה</button>' +
      '<button type="button" class="btn btn-p" id="asr-export" style="padding:4px 10px;font-size:11px;">⬇️ ייצוא דוח</button>' +
      '</div>' +
      (window.AiConsultant ? AiConsultant.panelHtml('report', 'ac-panel-strategy-room') : '') +
      '</div>';

    if (window.AiConsultant) AiConsultant.wireStage(container, 'report', 'ac-btn-strategy-room', 'ac-panel-strategy-room');

    var refresh = container.querySelector('#asr-refresh');
    if (refresh) refresh.addEventListener('click', function () {
      renderInlinePanel(container);
      if (typeof showToast === 'function') showToast('🔄 המלצה מאוחדת עודכנה');
    });

    var exBtn = container.querySelector('#asr-export');
    if (exBtn) exBtn.addEventListener('click', function () {
      if (window.AiConsultant) AiConsultant.exportStrategicReport('html');
    });
  }

  function mountPanel(rootId) {
    var root = document.getElementById(rootId || 'ai-strategy-room-root');
    if (!root) return;
    renderInlinePanel(root);
  }

  window.AiStrategyRoom = {
    VERSION: VERSION,
    MISSING: MISSING,
    buildUnifiedRecommendation: buildUnifiedRecommendation,
    mountPanel: mountPanel,
  };
})();
