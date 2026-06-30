/**
 * Business Summary Approval Gate — mandatory before strategic briefing / materials / build.
 * Aggregates wizard export, dalia_biz, coco-business-context-v1, strategic briefing seeds.
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var SUMMARY_KEY = 'coco-business-summary-v1';
  var APPROVAL_KEY = 'coco-business-summary-approved-v1';
  var MISSING = 'חסר מידע';
  var APPROVAL_QUESTION = 'האם אתה מאשר שהסיכום נכון ומלא לפי העסק?';

  function parseLs(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function valOrMissing(v) {
    if (v == null || v === '') return MISSING;
    if (Array.isArray(v)) return v.length ? v.join(', ') : MISSING;
    return String(v);
  }

  function aggregateSummary() {
    var biz = parseLs('dalia_biz') || {};
    var ctx = parseLs('coco-business-context-v1') || {};
    var briefing = (window.StrategicBriefing && StrategicBriefing.get && StrategicBriefing.get()) || parseLs('coco-strategic-briefing-v1') || {};
    var sections = [];

    sections.push({
      title: 'פרטי עסק (אשף אסטרטגיה)',
      fields: [
        { label: 'שם עסק', value: biz.name || biz.company || ctx.company || MISSING },
        { label: 'שירות מרכזי', value: biz.mainService || MISSING },
        { label: 'שירותים', value: biz.services || MISSING },
        { label: 'קהל יעד', value: biz.ideal || MISSING },
        { label: 'אתר', value: biz.site || biz.url || ctx.domain || MISSING },
        { label: 'מתחרים', value: biz.comp || (ctx.competitors || []).join('\n') || MISSING },
        { label: 'אתגרים', value: biz.challenges || MISSING },
        { label: 'תקציב', value: biz.budget || MISSING },
      ],
    });

    sections.push({
      title: 'Business Context (ייצוא פלטפורמה)',
      fields: [
        { label: 'חברה', value: ctx.company || MISSING },
        { label: 'דומיין', value: ctx.domain || MISSING },
        { label: 'שירותים', value: (ctx.services || []).join(', ') || MISSING },
        { label: 'מילות מפתח', value: ((ctx.strategy && ctx.strategy.focusKeywords) || []).map(function (k) {
          return typeof k === 'string' ? k : (k.query || k.keyword || '');
        }).filter(Boolean).join(', ') || MISSING },
        { label: 'פלטפורמות', value: (ctx.strategy && ctx.strategy.platforms || []).join(', ') || MISSING },
        { label: 'מתחרים', value: (ctx.competitors || []).join(', ') || MISSING },
      ],
    });

    if (briefing && (briefing.buildType || briefing.mainGoal)) {
      sections.push({
        title: 'תמצית שאלון אסטרטגי (אם הוזן)',
        fields: [
          { label: 'סוג בנייה', value: briefing.buildType || MISSING },
          { label: 'מטרה עיקרית', value: briefing.mainGoal || MISSING },
          { label: 'שירותים', value: (briefing.services || []).join(', ') || MISSING },
          { label: 'קהל', value: (briefing.audience || []).join(', ') || MISSING },
          { label: 'אזורים', value: (briefing.regions || []).join(', ') || MISSING },
        ],
      });
    }

    var summary = {
      version: VERSION,
      aggregatedAt: new Date().toISOString(),
      company: biz.name || biz.company || ctx.company || MISSING,
      sections: sections,
      sources: ['dalia_biz', 'coco-business-context-v1', 'strategic-briefing-seed'],
    };

    try { localStorage.setItem(SUMMARY_KEY, JSON.stringify(summary)); } catch (e) { /* ignore */ }
    return summary;
  }

  function get() {
    return parseLs(SUMMARY_KEY) || aggregateSummary();
  }

  function isApproved() {
    try { return localStorage.getItem(APPROVAL_KEY) === 'true'; } catch (e) { return false; }
  }

  function isReady() {
    return isApproved();
  }

  function approveSummary() {
    var summary = aggregateSummary();
    var hasCompany = summary.company && summary.company !== MISSING;
    if (!hasCompany) {
      return { ok: false, reason: 'incomplete', message: 'חסר מידע — השלם פרטי עסק באשף לפני אישור' };
    }
    try {
      localStorage.setItem(APPROVAL_KEY, 'true');
      localStorage.setItem('coco-business-summary-approved-at-v1', new Date().toISOString());
      localStorage.setItem(SUMMARY_KEY, JSON.stringify(summary));
    } catch (e) { return { ok: false }; }
    if (window.MarketingActivityLog) MarketingActivityLog.log('business_summary_approved', { company: summary.company });
    if (window.MarketingLifecycle) MarketingLifecycle.advance('business_summary', 'completed');
    if (window.AiStageAdvisor) AiStageAdvisor.advise('business_summary');
    return { ok: true, summary: summary };
  }

  function revokeApproval() {
    try { localStorage.removeItem(APPROVAL_KEY); } catch (e) { /* ignore */ }
    return { ok: true };
  }

  function assertGate() {
    if (!isReady()) {
      if (typeof showToast === 'function') showToast('⚠️ יש לאשר סיכום עסקי מלא לפני המשך');
      return false;
    }
    return true;
  }

  function renderSummaryHtml(summary) {
    summary = summary || get();
    var html = '<div class="card" style="margin-top:12px;border:1px solid rgba(59,130,246,.35);">' +
      '<div class="ph-t">📋 סיכום עסקי מלא — אישור חובה</div>' +
      '<div class="s" style="margin-bottom:10px;">לפני שאלון אסטרטגי, חומרים, SEO ודוח — אשר/י שהסיכום נכון.</div>';
    (summary.sections || []).forEach(function (sec) {
      html += '<div style="margin-top:10px;"><strong style="font-size:12px;color:var(--w);">' + esc(sec.title) + '</strong><ul style="margin:6px 0 0;padding-right:18px;font-size:12px;color:var(--w80);line-height:1.7;">';
      (sec.fields || []).forEach(function (f) {
        html += '<li><strong>' + esc(f.label) + ':</strong> ' + esc(valOrMissing(f.value)) + '</li>';
      });
      html += '</ul></div>';
    });
    html += '<div style="margin-top:14px;padding:10px;background:var(--bg4);border-radius:8px;font-size:12px;color:var(--w80);">' +
      esc(APPROVAL_QUESTION) + '</div>' +
      '<label style="display:flex;gap:8px;align-items:flex-start;margin-top:10px;font-size:12px;color:var(--w80);">' +
      '<input type="checkbox" id="bsa-approve-check" ' + (isApproved() ? 'checked disabled' : '') + ' /> ' +
      'אני מאשר/ת שהסיכום נכון ומלא לפי העסק</label>' +
      '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">' +
      '<button type="button" class="btn btn-p" id="bsa-approve-btn" style="padding:4px 12px;font-size:11px;"' + (isApproved() ? ' disabled' : '') + '>✅ אשר סיכום עסקי</button>' +
      '<button type="button" class="btn btn-g" id="bsa-refresh-btn" style="padding:4px 12px;font-size:11px;">🔄 רענן מנתוני אשף</button>' +
      (isApproved() ? '<span class="badge badge-green" style="font-size:10px;">מאושר</span>' : '<span class="badge badge-yellow" style="font-size:10px;">ממתין לאישור</span>') +
      '</div></div>';
    return html;
  }

  function wirePanel(container) {
    if (!container || container._bsaWired) return;
    container._bsaWired = true;
    container.addEventListener('click', function (e) {
      if (e.target.closest('#bsa-refresh-btn')) {
        renderInlinePanel(container);
        if (typeof showToast === 'function') showToast('סיכום עודכן מנתוני האשף');
        return;
      }
      if (e.target.closest('#bsa-approve-btn')) {
        var chk = container.querySelector('#bsa-approve-check');
        if (chk && !chk.checked) {
          if (typeof showToast === 'function') showToast('⚠️ סמן/י אישור לפני המשך');
          return;
        }
        var res = approveSummary();
        if (!res.ok) {
          if (typeof showToast === 'function') showToast('⚠️ ' + (res.message || 'חסר מידע'));
          renderInlinePanel(container);
          return;
        }
        if (typeof showToast === 'function') showToast('✅ סיכום עסקי מאושר');
        renderInlinePanel(container);
        if (window.StrategicBriefing && StrategicBriefing.mountPanel) {
          StrategicBriefing.mountPanel('strategic-briefing-root');
        }
        if (window.PreBuildWorkReport && PreBuildWorkReport.updateBuildButtonsGate) {
          PreBuildWorkReport.updateBuildButtonsGate();
        }
      }
    });
  }

  function renderInlinePanel(container) {
    if (!container) return;
    var summary = aggregateSummary();
    container.innerHTML = renderSummaryHtml(summary);
    wirePanel(container);
  }

  function mountPanel(rootId) {
    var root = document.getElementById(rootId || 'business-summary-approval-root');
    if (!root) return;
    renderInlinePanel(root);
  }

  window.BusinessSummaryApproval = {
    VERSION: VERSION,
    MISSING: MISSING,
    APPROVAL_QUESTION: APPROVAL_QUESTION,
    get: get,
    aggregateSummary: aggregateSummary,
    isApproved: isApproved,
    isReady: isReady,
    approveSummary: approveSummary,
    revokeApproval: revokeApproval,
    assertGate: assertGate,
    mountPanel: mountPanel,
    renderSummaryHtml: renderSummaryHtml,
  };
})();
