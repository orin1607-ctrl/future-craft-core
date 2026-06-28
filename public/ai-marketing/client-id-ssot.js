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
    COCO.flowContext = Object.assign(COCO.flowContext || {}, {
      clientId: OFFICIAL.clientId,
      clientName: OFFICIAL.company,
      company: OFFICIAL.company,
      site: OFFICIAL.domain,
      domain: OFFICIAL.domain,
      activeAssetId: 'asset-dalia-c-com',
      campaign: PRIMARY_CAMPAIGN.id,
      campaignName: PRIMARY_CAMPAIGN.name,
    }, overrides || {});
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

  window.ClientIdSsot = {
    OFFICIAL: OFFICIAL,
    DATA_PATHS: DATA_PATHS,
    PRIMARY_CAMPAIGN: PRIMARY_CAMPAIGN,
    applyFlowContext: applyFlowContext,
    isOfficialClientId: isOfficialClientId,
    normalizeClientId: normalizeClientId,
    assertUnified: assertUnified,
  };

  applyFlowContext();
})();
