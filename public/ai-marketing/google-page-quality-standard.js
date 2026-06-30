/**
 * Google World Class Page Quality Standard — heuristic/data evaluation per page.
 * Staging only · no live API.
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var SCORES_KEY = 'coco-google-page-scores-v1';
  var OVERRIDE_KEY = 'coco-google-publish-override-v1';
  var PASS_THRESHOLD = 70;
  var MISSING = 'חסר מידע';

  var CRITERIA = [
    { id: 'h1Structure', label: 'מבנה H1', weight: 8 },
    { id: 'h2h3Structure', label: 'מבנה H2/H3', weight: 6 },
    { id: 'metaTitle', label: 'Meta Title', weight: 8 },
    { id: 'metaDescription', label: 'Meta Description', weight: 7 },
    { id: 'cleanUrl', label: 'URL נקי', weight: 5 },
    { id: 'qualityContent', label: 'תוכן איכותי', weight: 10 },
    { id: 'internalLinks', label: 'קישורים פנימיים', weight: 6 },
    { id: 'anchorText', label: 'טקסט עוגן', weight: 4 },
    { id: 'schema', label: 'Schema', weight: 7 },
    { id: 'faq', label: 'FAQ', weight: 5 },
    { id: 'cta', label: 'CTA', weight: 6 },
    { id: 'imagesAlt', label: 'תמונות + Alt', weight: 5 },
    { id: 'mobile', label: 'מובייל', weight: 6 },
    { id: 'coreWebVitals', label: 'Core Web Vitals', weight: 7 },
    { id: 'accessibility', label: 'נגישות', weight: 5 },
    { id: 'eeaat', label: 'E-E-A-T', weight: 5 },
    { id: 'aiReview', label: 'ביקורת AI', weight: 4 },
    { id: 'googleReadinessScore', label: 'Google Readiness', weight: 6 },
  ];

  function parseLs(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  function saveScores(store) {
    try { localStorage.setItem(SCORES_KEY, JSON.stringify(store)); return true; } catch (e) { return false; }
  }

  function hasText(v) {
    return v != null && String(v).trim().length > 0 && String(v).trim() !== MISSING;
  }

  function scoreCriterion(id, pageData) {
    pageData = pageData || {};
    var html = String(pageData.html || '');
    var slug = String(pageData.slug || pageData.path || '');
    var title = pageData.title || pageData.metaTitle || '';
    var desc = pageData.metaDescription || pageData.description || '';
    var headings = pageData.headings || pageData.headlines || [];
    var keywords = pageData.keywords || [];
    var internalLinks = pageData.internalLinks || [];
    var pass = false;
    var detail = MISSING;
    var score = 0;

    switch (id) {
      case 'h1Structure':
        pass = /<h1[\s>]/i.test(html) || headings.some(function (h) { return /^h1$/i.test(h.level || h.tag); });
        detail = pass ? 'H1 קיים' : MISSING;
        score = pass ? 100 : 20;
        break;
      case 'h2h3Structure':
        pass = /<h[23][\s>]/i.test(html) || headings.length >= 2;
        detail = pass ? 'היררכיית כותרות' : MISSING;
        score = pass ? 90 : 30;
        break;
      case 'metaTitle':
        pass = hasText(title) && String(title).length >= 10 && String(title).length <= 70;
        detail = hasText(title) ? title : MISSING;
        score = pass ? 100 : (hasText(title) ? 50 : 0);
        break;
      case 'metaDescription':
        pass = hasText(desc) && String(desc).length >= 50 && String(desc).length <= 160;
        detail = hasText(desc) ? desc.slice(0, 80) + '…' : MISSING;
        score = pass ? 100 : (hasText(desc) ? 55 : 0);
        break;
      case 'cleanUrl':
        pass = /^[a-z0-9-]+$/i.test(slug.replace(/^\//, '')) || slug.indexOf(' ') < 0;
        detail = slug || MISSING;
        score = pass ? 95 : 40;
        break;
      case 'qualityContent':
        var wordCount = (html.replace(/<[^>]+>/g, ' ').match(/\S+/g) || []).length;
        pass = wordCount >= 80 || (pageData.contentPlan && pageData.contentPlan.length >= 2);
        detail = pass ? wordCount + ' מילים' : MISSING;
        score = pass ? Math.min(100, 50 + wordCount / 4) : 25;
        break;
      case 'internalLinks':
        pass = internalLinks.length >= 2 || (html.match(/<a\s/gi) || []).length >= 2;
        detail = pass ? internalLinks.length + ' קישורים' : MISSING;
        score = pass ? 85 : 30;
        break;
      case 'anchorText':
        pass = internalLinks.some(function (l) { return hasText(l) && String(l).length > 2; });
        detail = pass ? 'טקסט עוגן תיאורי' : MISSING;
        score = pass ? 80 : 35;
        break;
      case 'schema':
        pass = (pageData.schema && pageData.schema.length) || /application\/ld\+json/i.test(html);
        detail = pass ? (pageData.schema || ['JSON-LD']).join(', ') : MISSING;
        score = pass ? 90 : 20;
        break;
      case 'faq':
        pass = (pageData.faq && pageData.faq.length) || /faq|שאלות נפוצות/i.test(html);
        detail = pass ? 'FAQ מזוהה' : MISSING;
        score = pass ? 85 : 40;
        break;
      case 'cta':
        pass = hasText(pageData.cta) || /צור קשר|הדגמה|קבלו|התקשר/i.test(html);
        detail = pageData.cta || (pass ? 'CTA בדף' : MISSING);
        score = pass ? 90 : 35;
        break;
      case 'imagesAlt':
        pass = /<img[^>]+alt=/i.test(html) || (pageData.images && pageData.images.length);
        detail = pass ? 'תמונות עם alt' : MISSING;
        score = pass ? 80 : 30;
        break;
      case 'mobile':
        pass = /viewport/i.test(html) || pageData.mobileReady !== false;
        detail = pass ? 'viewport / responsive' : MISSING;
        score = pass ? 88 : 45;
        break;
      case 'coreWebVitals':
        pass = pageData.performanceHint === 'good' || !pageData.performanceHint;
        detail = pageData.performanceHint || 'הערכה היוריסטית — ללא מדידה חיה';
        score = pass ? 75 : 50;
        break;
      case 'accessibility':
        pass = /aria-|role=|alt=/i.test(html) || pageData.accessibilityNote;
        detail = pass ? 'סממני נגישות' : MISSING;
        score = pass ? 82 : 40;
        break;
      case 'eeaat':
        pass = keywords.length >= 1 && hasText(pageData.purpose || pageData.audience);
        detail = pass ? 'מומחיות + הקשר עסקי' : MISSING;
        score = pass ? 78 : 35;
        break;
      case 'aiReview':
        pass = pageData.aiReviewed === true || pageData.contentPlan;
        detail = pass ? 'נבדק במסגרת בנייה' : MISSING;
        score = pass ? 70 : 45;
        break;
      case 'googleReadinessScore':
        pass = keywords.length >= 2 && hasText(title);
        detail = keywords.length ? keywords.slice(0, 3).join(', ') : MISSING;
        score = pass ? 85 : 40;
        break;
      default:
        score = 50;
        detail = MISSING;
    }

    return { id: id, pass: !!pass, score: Math.round(score), detail: detail };
  }

  function evaluatePage(pageData) {
    pageData = pageData || {};
    var pageId = pageData.slug || pageData.id || pageData.title || 'page';
    var criteria = {};
    var totalWeight = 0;
    var weighted = 0;
    var failCount = 0;

    CRITERIA.forEach(function (c) {
      var r = scoreCriterion(c.id, pageData);
      criteria[c.id] = {
        label: c.label,
        pass: r.pass,
        score: r.score,
        detail: r.detail,
      };
      totalWeight += c.weight;
      weighted += r.score * c.weight;
      if (!r.pass) failCount += 1;
    });

    var overall = totalWeight ? Math.round(weighted / totalWeight) : 0;
    var result = {
      version: VERSION,
      pageId: pageId,
      evaluatedAt: new Date().toISOString(),
      criteria: criteria,
      overallScore: overall,
      pass: overall >= PASS_THRESHOLD,
      failCount: failCount,
      threshold: PASS_THRESHOLD,
    };

    var store = parseLs(SCORES_KEY) || { pages: {} };
    if (!store.pages) store.pages = {};
    store.pages[pageId] = result;
    store.updatedAt = new Date().toISOString();
    saveScores(store);

    return result;
  }

  function getPageScore(pageId) {
    var store = parseLs(SCORES_KEY);
    return store && store.pages && store.pages[pageId] ? store.pages[pageId] : null;
  }

  function hasPublishOverride(pageId) {
    var ov = parseLs(OVERRIDE_KEY) || {};
    return !!(ov[pageId] && ov[pageId].approved);
  }

  function setPublishOverride(pageId, approved) {
    var ov = parseLs(OVERRIDE_KEY) || {};
    if (approved) {
      ov[pageId] = { approved: true, at: new Date().toISOString() };
    } else {
      delete ov[pageId];
    }
    try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(ov)); } catch (e) { /* ignore */ }
  }

  function assertPublishGate(pageId) {
    var ev = getPageScore(pageId) || evaluatePage({ slug: pageId });
    if (ev.pass || hasPublishOverride(pageId)) return true;
    if (typeof showToast === 'function') {
      showToast('⚠️ עמוד ' + pageId + ' — ציון Google ' + ev.overallScore + '/' + PASS_THRESHOLD + ' — אין פרסום ללא עמידה או אישור ידני');
    }
    return false;
  }

  function evaluateAllFromBlueprint(bp) {
    bp = bp || (window.SiteBlueprint && SiteBlueprint.get && SiteBlueprint.get());
    if (!bp || !bp.pages) return [];
    return bp.pages.map(function (p) {
      return evaluatePage({
        slug: p.slug,
        title: p.title,
        metaDescription: (p.seoAreas || []).join(' '),
        headings: p.headlines || p.headings || [],
        keywords: p.keywords || [],
        internalLinks: p.internalLinks || [],
        schema: p.schema || [],
        faq: p.faq || [],
        cta: p.cta,
        contentPlan: p.contentPlan || p.contentSections || [],
        purpose: p.purpose,
        audience: p.audience,
        aiReviewed: true,
      });
    });
  }

  function evaluatePreviewSite(site) {
    site = site || parseLs('coco-website-builder-preview-site-v1');
    if (!site || !site.pages) return [];
    return site.pages.map(function (p, idx) {
      return evaluatePage({
        slug: p.slug || ('page-' + (idx + 1)),
        title: p.title,
        html: p.html || '',
        keywords: p.keywords || [],
        cta: p.cta,
        mobileReady: true,
      });
    });
  }

  function tasksFromFailedPages(evaluations) {
    var tasks = [];
    (evaluations || []).forEach(function (ev) {
      if (ev.pass) return;
      tasks.push({
        name: 'Google Standard: שיפור ' + ev.pageId,
        description: 'ציון ' + ev.overallScore + '/' + PASS_THRESHOLD + ' — ' + ev.failCount + ' קריטריונים',
        category: 'seo',
        priority: 'גבוה',
        source: 'google-page-quality-standard',
        pageId: ev.pageId,
      });
    });
    return tasks;
  }

  window.GooglePageQualityStandard = {
    VERSION: VERSION,
    MISSING: MISSING,
    CRITERIA: CRITERIA,
    PASS_THRESHOLD: PASS_THRESHOLD,
    evaluatePage: evaluatePage,
    getPageScore: getPageScore,
    assertPublishGate: assertPublishGate,
    hasPublishOverride: hasPublishOverride,
    setPublishOverride: setPublishOverride,
    evaluateAllFromBlueprint: evaluateAllFromBlueprint,
    evaluatePreviewSite: evaluatePreviewSite,
    tasksFromFailedPages: tasksFromFailedPages,
  };
})();
