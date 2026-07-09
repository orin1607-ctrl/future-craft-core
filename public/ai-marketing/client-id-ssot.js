/**
 * Client ID SSOT — מקור אמת יחיד ל-dalia-c.com (Project 001)
 * customers.id (UUID) = Client ID בדליה; dalia-c-official = slug שיווקי ל-Staging
 */
(function () {
  'use strict';

  var OFFICIAL = {
    clientId: 'dalia-c-official',
    slug: 'dalia-c-official',
    domain: 'dalia-c.com',
    url: 'https://dalia-c.com/',
    company: 'דליה פתרונות מימון ותחזוקה לרכב',
    account: 'orin1607@gmail.com',
  };

  /** נתיב יחיד לנתוני Google אחרי sync מהבית */
  var DATA_PATHS = {
    dashboard: 'project-001/dashboard.json',
    evidenceReport: 'project-001/evidence-report-v2.json',
    siteCrawl: 'project-001/site-crawl-lite.json',
    sitePagesIndex: 'project-001/site-pages-index.json',
    siteWorkPlan: 'project-001/site-work-plan.json',
    siteCrawlFull: 'docs/audit-reports/dalia-site-full-audit/site-crawl-full.json',
    auditDashboard: 'docs/audit-reports/project-001/dashboard-export.json',
  };

  var PRIMARY_CAMPAIGN = {
    id: 'campaign-dalia-seo-primary',
    name: 'דליה — קידום dalia-c.com',
    owner: 'יוני אטיאס',
    projectId: 'project001aimarketing',
    projectName: 'Project 001 — AI Marketing',
    site: 'dalia-c.com',
    channel: 'seo',
    status: 'active',
    type: 'organic_seo',
  };

  function applyFlowContext(overrides) {
    if (!window.COCO) window.COCO = {};
    var patch = Object.assign({
      clientId: OFFICIAL.clientId,
      clientName: OFFICIAL.company,
      company: OFFICIAL.company,
      site: OFFICIAL.domain,
      domain: OFFICIAL.domain,
      activeAssetId: 'asset-dalia-c-com',
      campaign: PRIMARY_CAMPAIGN.id,
      campaignName: PRIMARY_CAMPAIGN.name,
    }, overrides || {});
    COCO.flowContext = Object.assign(COCO.flowContext || {}, patch);

    if (window.GlobalFilterContext && GlobalFilterContext.set) {
      GlobalFilterContext.set({
        clientId: OFFICIAL.clientId,
        clientName: OFFICIAL.company,
        activityType: PRIMARY_CAMPAIGN.channel || 'seo',
        campaignId: PRIMARY_CAMPAIGN.id,
        campaignName: PRIMARY_CAMPAIGN.name,
        assetId: patch.activeAssetId || 'asset-dalia-c-com',
        assetType: 'website',
        assetLabel: OFFICIAL.domain,
        site: OFFICIAL.domain,
        domain: OFFICIAL.domain,
      }, { skipCascade: true, source: 'client-id-ssot', allowInvalid: true });
    }

    if (window.FilterEntityIndex) {
      FilterEntityIndex.registerClient({
        id: OFFICIAL.clientId,
        name: OFFICIAL.company,
        slug: OFFICIAL.slug,
        status: 'active',
      });
      FilterEntityIndex.registerCampaign(OFFICIAL.clientId, {
        id: PRIMARY_CAMPAIGN.id,
        name: PRIMARY_CAMPAIGN.name,
        activityType: PRIMARY_CAMPAIGN.channel || 'seo',
        status: PRIMARY_CAMPAIGN.status,
        clientId: OFFICIAL.clientId,
      });
      FilterEntityIndex.registerAsset(PRIMARY_CAMPAIGN.id, {
        id: 'asset-dalia-c-com',
        type: 'website',
        label: OFFICIAL.domain,
        domain: OFFICIAL.domain,
        url: OFFICIAL.url,
        status: 'active',
        clientId: OFFICIAL.clientId,
        campaignId: PRIMARY_CAMPAIGN.id,
      });
    }

    return COCO.flowContext;
  }

  function isOfficialClientId(id) {
    if (!id) return false;
    var s = String(id);
    return s === OFFICIAL.clientId || s === OFFICIAL.slug;
  }

  function normalizeClientId(id) {
    if (!id || isOfficialClientId(id)) return OFFICIAL.clientId;
    return id;
  }

  function assertUnified() {
    var ctx = (window.COCO && COCO.flowContext) || {};
    var site = window.DaliaSite && DaliaSite.SITE;
    var issues = [];
    if (ctx.clientId && !isOfficialClientId(ctx.clientId) && String(ctx.clientId).indexOf('local-') !== 0) {
      issues.push('flowContext.clientId=' + ctx.clientId);
    }
    if (site && site.clientId && site.clientId !== OFFICIAL.clientId) {
      issues.push('DaliaSite.SITE.clientId=' + site.clientId);
    }
    return { ok: issues.length === 0, issues: issues, official: OFFICIAL.clientId };
  }

  function pagesBase() {
    if (window.COCO_PAGES_BASE) {
      var b = window.COCO_PAGES_BASE;
      return b.charAt(0) === '/' ? (location.origin + b) : b;
    }
    if (/orin1607-ctrl\.github\.io/i.test(location.hostname || '')) {
      return location.origin + '/future-craft-core/';
    }
    return location.origin + '/future-craft-core/';
  }

  function absUrl(rel) {
    var base = pagesBase().replace(/\/?$/, '/');
    try {
      return new URL(rel.replace(/^\//, ''), base).href;
    } catch (e) {
      return base + rel.replace(/^\//, '');
    }
  }

  /** Navigate to standalone פרסום (outside Orin), preserving client context. */
  function openPirsumStandalone() {
    if (document.body) document.body.classList.add('coco-nav-busy');
    var ctx = (window.COCO && COCO.flowContext) || {};
    var site = (window.DaliaSite && DaliaSite.SITE) || OFFICIAL;
    var clientId = normalizeClientId(ctx.clientId || site.clientId || OFFICIAL.clientId);
    var clientName = ctx.clientName || ctx.company || site.company || OFFICIAL.company;
    var domain = ctx.domain || ctx.site || site.domain || OFFICIAL.domain;
    var url = site.url || OFFICIAL.url;
    var payload = {
      clientId: clientId,
      clientName: clientName,
      company: clientName,
      site: domain,
      domain: domain,
      url: url,
      at: new Date().toISOString(),
    };
    try {
      localStorage.setItem('coco-pirsum-client-v1', JSON.stringify(payload));
      localStorage.setItem('coco-flow-context-v2', JSON.stringify(Object.assign({}, ctx, payload)));
    } catch (e) { /* ignore */ }
    var qs = [
      'clientId=' + encodeURIComponent(payload.clientId),
      'clientName=' + encodeURIComponent(payload.clientName),
      'site=' + encodeURIComponent(payload.site),
      'domain=' + encodeURIComponent(payload.domain),
    ].join('&');
    location.href = absUrl('coco-dalia/pirsum-home.html') + '?' + qs;
  }

  window.ClientIdSsot = {
    OFFICIAL: OFFICIAL,
    DATA_PATHS: DATA_PATHS,
    PRIMARY_CAMPAIGN: PRIMARY_CAMPAIGN,
    applyFlowContext: applyFlowContext,
    isOfficialClientId: isOfficialClientId,
    normalizeClientId: normalizeClientId,
    assertUnified: assertUnified,
    openPirsumStandalone: openPirsumStandalone,
  };

  window.openPirsumStandalone = openPirsumStandalone;

  applyFlowContext();
})();
