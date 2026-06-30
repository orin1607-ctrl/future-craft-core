/**
 * AI Page Advisor — explains Google scores, top improvements, impact per page.
 * Staging only · uses GooglePageQualityStandard + blueprint/preview data.
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var MISSING = 'חסר מידע';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function getPageData(pageId) {
    var bp = (window.SiteBlueprint && SiteBlueprint.get && SiteBlueprint.get()) || null;
    var preview = null;
    try { preview = JSON.parse(localStorage.getItem('coco-website-builder-preview-site-v1') || 'null'); } catch (e) { preview = null; }

    if (bp && bp.pages) {
      var bpPage = bp.pages.find(function (p) { return p.slug === pageId || p.title === pageId; });
      if (bpPage) return { source: 'blueprint', page: bpPage };
    }
    if (preview && preview.pages) {
      var pv = preview.pages.find(function (p) { return p.slug === pageId || p.title === pageId; });
      if (pv) return { source: 'preview', page: pv };
    }
    return { source: null, page: null };
  }

  function buildRecommendations(evaluation, pageData) {
    pageData = pageData || {};
    var recs = [];
    var criteria = (evaluation && evaluation.criteria) || {};

    Object.keys(criteria).forEach(function (key) {
      var c = criteria[key];
      if (c.pass) return;
      var impact = c.score < 40 ? 'גבוה' : (c.score < 65 ? 'בינוני' : 'נמוך');
      var required = /metaTitle|metaDescription|h1Structure|qualityContent|cta/i.test(key);
      recs.push({
        criterion: key,
        label: c.label || key,
        why: c.detail && c.detail !== MISSING ? ('מבוסס על: ' + c.detail) : ('חסר מידע בנתוני ' + (pageData.source || 'עמוד')),
        impact: impact,
        required: required,
        currentScore: c.score,
      });
    });

    recs.sort(function (a, b) {
      var ia = a.impact === 'גבוה' ? 3 : a.impact === 'בינוני' ? 2 : 1;
      var ib = b.impact === 'גבוה' ? 3 : b.impact === 'בינוני' ? 2 : 1;
      if (ib !== ia) return ib - ia;
      return a.currentScore - b.currentScore;
    });

    return recs;
  }

  function advisePage(pageId) {
    var data = getPageData(pageId);
    var page = data.page || { slug: pageId, title: pageId };
    var evaluation = (window.GooglePageQualityStandard && GooglePageQualityStandard.getPageScore(pageId))
      || (window.GooglePageQualityStandard && GooglePageQualityStandard.evaluatePage({
        slug: page.slug || pageId,
        title: page.title,
        html: page.html || '',
        keywords: page.keywords || [],
        headings: page.headlines || page.headings || [],
        internalLinks: page.internalLinks || [],
        schema: page.schema || [],
        faq: page.faq || [],
        cta: page.cta,
        contentPlan: page.contentPlan || page.contentSections || [],
        purpose: page.purpose,
        audience: page.audience,
      }));

    if (!evaluation) {
      return {
        pageId: pageId,
        score: null,
        scoreWhy: MISSING,
        improvements: [],
        message: MISSING,
      };
    }

    var recs = buildRecommendations(evaluation, data);
    var top3 = recs.slice(0, 3);
    var scoreWhy = evaluation.pass
      ? 'העמוד עומד בסף Google (' + evaluation.overallScore + '/' + evaluation.threshold + ')'
      : 'העמוד מתחת לסף (' + evaluation.overallScore + '/' + evaluation.threshold + ') — ' + evaluation.failCount + ' קריטריונים נכשלו';

    return {
      pageId: pageId,
      title: page.title || pageId,
      source: data.source || MISSING,
      score: evaluation.overallScore,
      pass: evaluation.pass,
      scoreWhy: scoreWhy,
      improvements: top3,
      allRecommendations: recs,
      required: recs.filter(function (r) { return r.required; }),
      optional: recs.filter(function (r) { return !r.required; }),
    };
  }

  function renderPanelHtml(advice) {
    advice = advice || {};
    var html = '<div class="card coco-page-advisor-panel" style="margin-top:10px;border:1px solid rgba(139,92,246,.35);">' +
      '<div class="ph-t">🤖 AI Page Advisor — ' + esc(advice.title || advice.pageId || 'עמוד') + '</div>' +
      '<div style="font-size:12px;color:var(--w80);margin-top:6px;">' +
      '<strong>ציון Google:</strong> ' + (advice.score != null ? advice.score + '/100' : MISSING) +
      ' · <span class="' + (advice.pass ? 'badge badge-green' : 'badge badge-yellow') + '" style="font-size:9px;">' +
      (advice.pass ? 'עובר' : 'דורש שיפור') + '</span></div>' +
      '<div style="font-size:11px;color:var(--w50);margin-top:4px;">' + esc(advice.scoreWhy || MISSING) + '</div>';

    if (advice.improvements && advice.improvements.length) {
      html += '<div style="margin-top:10px;font-size:12px;font-weight:700;color:var(--w);">3 שיפורים מובילים</div><ol style="margin:6px 0 0;padding-right:18px;font-size:11px;color:var(--w80);line-height:1.7;">';
      advice.improvements.forEach(function (r) {
        html += '<li><strong>' + esc(r.label) + '</strong> (' + esc(r.impact) + ' · ' + (r.required ? 'חובה' : 'אופציונלי') + ')<br>' +
          esc(r.why) + '</li>';
      });
      html += '</ol>';
    } else {
      html += '<div style="margin-top:8px;font-size:11px;color:var(--green);">אין שיפורים קריטיים — העמוד עומד בסטנדרט.</div>';
    }

    html += '</div>';
    return html;
  }

  function mountInContainer(container, pageId) {
    if (!container) return;
    var advice = advisePage(pageId);
    container.innerHTML = renderPanelHtml(advice);
  }

  function mountPreviewPanels(rootId) {
    var root = document.getElementById(rootId || 'wb-page-advisor-root');
    if (!root) return;
    var preview = null;
    try { preview = JSON.parse(localStorage.getItem('coco-website-builder-preview-site-v1') || 'null'); } catch (e) { preview = null; }
    if (!preview || !preview.pages || !preview.pages.length) {
      root.innerHTML = '<div class="card" style="font-size:12px;color:var(--w50);">אין עמודי preview — בנה אתר תחילה.</div>';
      return;
    }
    root.innerHTML = preview.pages.map(function (p) {
      return '<div data-advisor-page="' + esc(p.slug || p.title) + '"></div>';
    }).join('');
    root.querySelectorAll('[data-advisor-page]').forEach(function (el) {
      mountInContainer(el, el.getAttribute('data-advisor-page'));
    });
  }

  function mountBlueprintPanel(rootId, pageId) {
    var root = document.getElementById(rootId || 'bp-page-advisor-root');
    if (!root) return;
    mountInContainer(root, pageId || ((window.SiteBlueprint && SiteBlueprint.get && SiteBlueprint.get().pages[0]) || {}).slug || 'home');
  }

  window.AiPageAdvisor = {
    VERSION: VERSION,
    MISSING: MISSING,
    advisePage: advisePage,
    buildRecommendations: buildRecommendations,
    renderPanelHtml: renderPanelHtml,
    mountInContainer: mountInContainer,
    mountPreviewPanels: mountPreviewPanels,
    mountBlueprintPanel: mountBlueprintPanel,
  };
})();
