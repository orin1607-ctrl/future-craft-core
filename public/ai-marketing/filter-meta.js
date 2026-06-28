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

  function officialClientId() {
    var off = window.ClientIdSsot && ClientIdSsot.OFFICIAL;
    return (off && off.clientId) || 'dalia-c-official';
  }

  function base(item) {
    return {
      clientId: item.clientId || item.customerId || officialClientId(),
      campaignId: item.campaignId || item.campaign || '',
      activityType: item.activityType || item.channel || 'seo',
    };
  }

  function activityToSource(activityType) {
    var map = {
      seo: 'google_organic',
      google_ads: 'google_ads',
      google_business: 'google_business',
      facebook: 'facebook',
      instagram: 'instagram',
      linkedin: 'linkedin',
      whatsapp: 'whatsapp',
      youtube: 'youtube',
    };
    return map[activityType] || activityType || '';
  }

  function sourceToActivity(source) {
    var map = {
      google_organic: 'seo',
      organic: 'seo',
      google_ads: 'google_ads',
      google_business: 'google_business',
      facebook: 'facebook',
      instagram: 'instagram',
      linkedin: 'linkedin',
      whatsapp: 'whatsapp',
      youtube: 'youtube',
    };
    return map[source] || source || '';
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
    crmCustomer: function (c) {
      var cid = c.marketing_client_id || c.slug || '';
      var official = false;
      if (window.ClientIdSsot && ClientIdSsot.OFFICIAL) {
        var off = ClientIdSsot.OFFICIAL;
        if (cid === off.clientId || cid === off.slug) official = true;
        if (!cid && c.name && off.company && String(c.name).indexOf('דליה') >= 0) {
          cid = off.clientId;
          official = true;
        }
      }
      return {
        clientId: cid || c.id,
        customerId: c.id,
        officialClient: official,
        serviceType: c.service_type,
        customerStatus: c.status,
        status: c.status,
      };
    },
    crmLead: function (l) {
      var src = l.source || '';
      return Object.assign(base(l), {
        clientId: l.marketing_client_id || '',
        customerId: l.customer_id,
        campaign: l.campaign,
        campaignId: l.campaign,
        page: l.landing_page,
        pagePath: l.landing_page,
        pageUrl: l.landing_page,
        source: src,
        channel: src,
        activityType: sourceToActivity(src) || src,
        status: l.status,
        date: l.created_at,
      });
    },
    crmTask: function (t, ctx) {
      ctx = ctx || {};
      var lead = ctx.lead || null;
      return Object.assign(base(t), {
        clientId: ctx.clientId || '',
        customerId: t.customer_id,
        campaign: lead && lead.campaign,
        campaignId: lead && lead.campaign,
        pagePath: lead && lead.landing_page,
        pageUrl: lead && lead.landing_page,
        status: t.status,
        date: t.due_at || t.created_at,
      });
    },
    generic: function (item) {
      return base(item);
    },
  };
})();
