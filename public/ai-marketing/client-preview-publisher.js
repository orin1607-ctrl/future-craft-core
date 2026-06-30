/**
 * Client Preview Publisher — permanent preview URL + per-page approval.
 * Sites live under /client-previews/{slug}/ — separate from Dalia platform.
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var BUNDLE_PREFIX = 'coco-client-preview-bundle-v1-';
  var APPROVAL_PREFIX = 'coco-preview-page-approved-v1-';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function getBasePath() {
    var base = window.COCO_PAGES_BASE || '/future-craft-core/';
    if (base.charAt(0) !== '/') base = '/' + base;
    return location.origin + base;
  }

  function publishBundle(sitePlan, pagesHtml) {
    var slug = sitePlan.slug || 'client-preview';
    var bundle = {
      version: VERSION,
      slug: slug,
      company: sitePlan.company,
      service: sitePlan.service,
      publishedAt: new Date().toISOString(),
      permanentUrl: getBasePath() + 'client-previews/' + slug + '/index.html',
      gatewayUrl: getBasePath() + 'client-previews/preview-gateway.html?slug=' + encodeURIComponent(slug),
      pages: pagesHtml.map(function (p) {
        return {
          title: p.title,
          slug: p.slug,
          fileName: p.fileName,
          html: p.html,
          approved: false,
        };
      }),
      architecture: {
        onDaliaPlatform: false,
        tempGitRepo: 'client-preview-' + slug + ' (TEMP)',
        productionDeploy: 'client domain/hosting only',
      },
    };

    try {
      localStorage.setItem(BUNDLE_PREFIX + slug, JSON.stringify(bundle));
      localStorage.setItem('coco-client-preview-active-slug-v1', slug);
      localStorage.setItem('coco-client-preview-permanent-url-v1', bundle.permanentUrl);
    } catch (e) { /* ignore */ }

    if (window.MarketingActivityLog) {
      MarketingActivityLog.log('preview_published', { slug: slug, url: bundle.permanentUrl, pages: bundle.pages.length });
    }
    if (window.MarketingLifecycle) MarketingLifecycle.advance('preview', 'completed');

    return bundle;
  }

  function approvePage(slug, pageSlug) {
    if (window.GooglePageQualityStandard && !GooglePageQualityStandard.assertPublishGate(pageSlug)) {
      var ovChk = document.getElementById('cpp-override-' + pageSlug);
      if (!ovChk || !ovChk.checked) return false;
      GooglePageQualityStandard.setPublishOverride(pageSlug, true);
    }
    var key = APPROVAL_PREFIX + slug + '-' + pageSlug;
    try {
      localStorage.setItem(key, JSON.stringify({ approved: true, at: new Date().toISOString() }));
      var bundleKey = BUNDLE_PREFIX + slug;
      var raw = localStorage.getItem(bundleKey);
      if (raw) {
        var bundle = JSON.parse(raw);
        bundle.pages.forEach(function (p) {
          if (p.slug === pageSlug) p.approved = true;
        });
        localStorage.setItem(bundleKey, JSON.stringify(bundle));
      }
      if (window.MarketingActivityLog) MarketingActivityLog.log('page_approved', { slug: slug, page: pageSlug });
      return true;
    } catch (e) { return false; }
  }

  function isAllPagesApproved(slug) {
    try {
      var bundle = JSON.parse(localStorage.getItem(BUNDLE_PREFIX + slug) || 'null');
      if (!bundle || !bundle.pages.length) return false;
      return bundle.pages.every(function (p) { return p.approved; });
    } catch (e) { return false; }
  }

  function getPermanentUrl(slug) {
    slug = slug || localStorage.getItem('coco-client-preview-active-slug-v1');
    if (!slug) return null;
    return getBasePath() + 'client-previews/' + slug + '/index.html';
  }

  function getGatewayUrl(slug) {
    slug = slug || localStorage.getItem('coco-client-preview-active-slug-v1');
    return getBasePath() + 'client-previews/preview-gateway.html?slug=' + encodeURIComponent(slug || '');
  }

  function buildPagesFromPlan(sitePlan, generateFn) {
    return sitePlan.pages.map(function (page, idx) {
      var fileName = idx === 0 ? 'index.html' : (page.slug + '.html');
      var html = generateFn(sitePlan, page, sitePlan.pages);
      return { title: page.title, slug: page.slug, fileName: fileName, html: html };
    });
  }

  window.ClientPreviewPublisher = {
    VERSION: VERSION,
    publishBundle: publishBundle,
    approvePage: approvePage,
    isAllPagesApproved: isAllPagesApproved,
    getPermanentUrl: getPermanentUrl,
    getGatewayUrl: getGatewayUrl,
    getBundle: function (slug) {
      try { return JSON.parse(localStorage.getItem(BUNDLE_PREFIX + slug) || 'null'); } catch (e) { return null; }
    },
    buildPagesFromPlan: buildPagesFromPlan,
  };
})();
