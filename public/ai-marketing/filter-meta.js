/**
 * FilterMeta — normalized field extractors for FilterEngine (all screen binders).
 */
(function () {
  'use strict';

  function clientId() {
    var c = window.GlobalFilterContext && GlobalFilterContext.get ? GlobalFilterContext.get() : {};
    return c.clientId || (window.ClientIdSsot && ClientIdSsot.OFFICIAL && ClientIdSsot.OFFICIAL.clientId);
  }

  function campaignId() {
    var c = window.GlobalFilterContext && GlobalFilterContext.get ? GlobalFilterContext.get() : {};
    return c.campaignId || (window.ClientIdSsot && ClientIdSsot.PRIMARY_CAMPAIGN && ClientIdSsot.PRIMARY_CAMPAIGN.id);
  }

  function base(item) {
    return {
      clientId: item.clientId || clientId(),
      campaignId: item.campaignId || campaignId(),
      activityType: item.activityType || item.channel || 'seo',
    };
  }

  window.FilterMeta = {
    page: function (p) {
      return Object.assign(base(p), {
        pageId: p.id,
        pagePath: p.path,
        page: p.path,
        pageKind: p.kind,
        site: p.url,
        domain: p.url,
        status: p.executionStatus || p.status,
        goal: p.title,
      });
    },
    action: function (a) {
      return Object.assign(base(a), {
        pageId: a.pageId,
        pagePath: a.pagePath,
        page: a.pagePath,
        action: a.category,
        status: a.status,
        entityId: a.id,
        date: a.updatedAt || a.createdAt,
      });
    },
    goal: function (g) {
      return Object.assign(base(g), {
        pageId: g.pageId,
        pagePath: g.pagePath,
        page: g.pagePath,
        goal: g.title,
        status: g.status,
      });
    },
    client: function (c) {
      return {
        clientId: c.id,
        customerStatus: c.status,
        serviceType: c.service_type,
      };
    },
    history: function (h) {
      return Object.assign(base(h), {
        status: h.status,
        action: h.action || h.type,
        date: h.date || h.created_at,
        campaign: h.title,
      });
    },
    asset: function (a) {
      return Object.assign(base(a), {
        assetId: a.id,
        site: a.domain || a.label,
        domain: a.domain || a.label,
        status: a.status,
      });
    },
    campaign: function (c) {
      return Object.assign(base(c), {
        campaignId: c.id,
        campaign: c.name,
        status: c.status,
        channel: c.channel || c.campaign_type,
      });
    },
    generic: function (item) {
      return base(item);
    },
  };
})();
