/**
 * Project 001 — PRD Filter System (תשתית סינון אחידה)
 * היררכיה: חברה → עסק → פרויקט → אתר → דומיין → עמוד → קמפיין → ערוץ שיווק
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'coco-prd-filters-v1';
  var ENTITIES_URL = './ai-marketing/prd-entities.json';

  var SKIP_SCREENS = { 'sc-category': 1, 'sc-modules': 1, 'sc-aichat': 1 };

  var SCHEMAS = {
    home: ['company', 'business', 'project', 'site', 'domain', 'channel', 'dateFrom', 'dateTo', 'status'],
    standard: ['company', 'business', 'project', 'site', 'domain', 'page', 'campaign', 'campaignNumber', 'campaignType', 'channel', 'dateFrom', 'dateTo', 'status'],
    seo: ['company', 'business', 'project', 'site', 'domain', 'page', 'channel', 'google_seo', 'dateFrom', 'dateTo', 'status'],
    ads: ['company', 'business', 'project', 'site', 'campaign', 'campaignNumber', 'campaignType', 'google_ads', 'dateFrom', 'dateTo', 'status'],
    gbp: ['company', 'business', 'project', 'site', 'google_business', 'dateFrom', 'dateTo', 'status'],
    social: ['company', 'business', 'project', 'channel', 'facebook', 'instagram', 'tiktok', 'linkedin', 'youtube', 'whatsapp', 'email', 'dateFrom', 'dateTo', 'status'],
    content: ['company', 'business', 'project', 'site', 'domain', 'page', 'dateFrom', 'dateTo', 'status'],
    reports: ['company', 'business', 'project', 'site', 'domain', 'channel', 'dateFrom', 'dateTo', 'status'],
    settings: ['company', 'business'],
  };

  var SCREEN_SCHEMA = {
    'sc-morning': 'home',
    'sc-dashboard': 'standard', 'sc-executive': 'reports', 'sc-briefing': 'reports', 'sc-kpi': 'reports',
    'sc-notifications': 'standard', 'sc-tasks': 'standard', 'sc-health': 'standard',
    'sc-seo': 'seo', 'sc-keywords': 'seo', 'sc-intel': 'seo', 'sc-competitors': 'seo', 'sc-news': 'seo',
    'sc-ads': 'ads', 'sc-gbp': 'gbp',
    'sc-content': 'content', 'sc-pages': 'content', 'sc-landing': 'content', 'sc-warehouse': 'content', 'sc-scheduler': 'content',
    'sc-crm': 'social', 'sc-meta': 'social', 'sc-funnel': 'social', 'sc-journey': 'social',
    'sc-reports': 'reports', 'sc-analytics': 'reports', 'sc-roi': 'reports', 'sc-strategy': 'reports', 'sc-roadmap': 'reports',
    'sc-director': 'standard', 'sc-ailab': 'standard', 'sc-autonomous': 'standard', 'sc-aiguide': 'standard',
    'sc-approval': 'standard', 'sc-aiimage': 'content', 'sc-heatmap': 'content',
    'sc-settings': 'settings', 'sc-permissions': 'settings', 'sc-fleetint': 'standard', 'sc-usermanual': 'settings',
    'sc-decisions': 'standard',
  };

  var CHANNEL_FIELDS = {
    google_seo: 'Google SEO', google_ads: 'Google Ads', google_business: 'Google Business',
    facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', linkedin: 'LinkedIn',
    youtube: 'YouTube', whatsapp: 'WhatsApp', email: 'Email Marketing',
  };

  var FIELD_LABELS = {
    company: 'חברה', business: 'עסק', project: 'פרויקט', site: 'אתר', domain: 'דומיין',
    page: 'עמוד באתר', campaign: 'קמפיין', campaignNumber: 'מספר קמפיין', campaignType: 'סוג קמפיין',
    channel: 'ערוץ שיווק', dateFrom: 'מתאריך', dateTo: 'עד תאריך', status: 'סטטוס',
  };

  var CAMPAIGN_TYPES = ['SEO', 'Search', 'Display', 'Performance Max', 'מקומי', 'Social', 'Email'];

  var entities = null;
  var state = loadState();
  var daliaCompanyName = null;

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return {
      companyId: '', businessId: '', projectId: '', siteId: '', pageId: '',
      campaignId: '', campaignNumber: '', campaignType: '', channel: '',
      dateFrom: '', dateTo: '', status: '',
      channels: {},
    };
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
    window.dispatchEvent(new CustomEvent('prd-filter-change', { detail: getSnapshot() }));
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function getSchemaForScreen(scId) {
    return SCHEMAS[SCREEN_SCHEMA[scId] || 'standard'];
  }

  function companyByName(name) {
    if (!entities || !name) return null;
    var n = name.trim().toLowerCase();
    return entities.companies.find(function (c) {
      return c.name.trim().toLowerCase() === n || c.name.toLowerCase().indexOf(n) >= 0;
    }) || null;
  }

  function businessesForCompany(companyId) {
    if (!entities) return [];
    return entities.businesses.filter(function (b) { return !companyId || b.companyId === companyId; });
  }

  function projectsForBusiness(businessId) {
    if (!entities) return [];
    return entities.projects.filter(function (p) { return !businessId || p.businessId === businessId; });
  }

  function sitesForProject(projectId) {
    if (!entities) return [];
    return entities.sites.filter(function (s) { return !projectId || s.projectId === projectId; });
  }

  function domainsForSite(siteId, projectId) {
    var sites = sitesForProject(projectId);
    if (siteId) sites = sites.filter(function (s) { return s.id === siteId; });
    return sites.map(function (s) { return { id: s.domain, label: s.domain }; });
  }

  function pagesForSite(siteId) {
    if (!entities) return [];
    return entities.pages.filter(function (p) { return !siteId || p.siteId === siteId; });
  }

  function campaignsForProject(projectId) {
    if (!entities) return [];
    return entities.campaigns.filter(function (c) { return !projectId || c.projectId === projectId; });
  }

  function resetCascade(fromField) {
    var order = ['companyId', 'businessId', 'projectId', 'siteId', 'pageId', 'campaignId'];
    var map = { company: 0, business: 1, project: 2, site: 3, page: 4, campaign: 5 };
    var start = map[fromField];
    if (start == null) return;
    for (var i = start + 1; i < order.length; i++) state[order[i]] = '';
    if (fromField === 'company' || fromField === 'business' || fromField === 'project') {
      state.campaignNumber = '';
      state.campaignType = '';
      state.channel = '';
    }
    if (fromField === 'site') state.pageId = '';
  }

  function applyDaliaCompany(name) {
    daliaCompanyName = name;
    if (!entities || !name) return;
    var co = companyByName(name);
    if (co) {
      state.companyId = co.id;
      if (!state.businessId) {
        var biz = businessesForCompany(co.id)[0];
        if (biz) state.businessId = biz.id;
      }
      saveState();
      remountAll();
    }
  }

  function getSnapshot() {
    return {
      companyId: state.companyId, businessId: state.businessId, projectId: state.projectId,
      siteId: state.siteId, pageId: state.pageId, campaignId: state.campaignId,
      campaignNumber: state.campaignNumber, campaignType: state.campaignType,
      channel: state.channel, dateFrom: state.dateFrom, dateTo: state.dateTo, status: state.status,
      channels: Object.assign({}, state.channels),
      daliaCompanyName: daliaCompanyName,
    };
  }

  function getScopeLabel() {
    if (!entities) return 'טוען סינון…';
    var parts = [];
    var co = entities.companies.find(function (c) { return c.id === state.companyId; });
    var biz = entities.businesses.find(function (b) { return b.id === state.businessId; });
    var proj = entities.projects.find(function (p) { return p.id === state.projectId; });
    var site = entities.sites.find(function (s) { return s.id === state.siteId; });
    if (co) parts.push(co.name);
    else if (daliaCompanyName) parts.push(daliaCompanyName);
    if (biz) parts.push(biz.name);
    if (proj) parts.push(proj.name);
    if (site) parts.push(site.domain);
    if (state.status) parts.push('סטטוס: ' + state.status);
    var ch = Object.keys(state.channels).filter(function (k) { return state.channels[k]; });
    if (ch.length) parts.push(ch.map(function (k) { return CHANNEL_FIELDS[k] || k; }).join(', '));
    return parts.length ? 'מציג: ' + parts.join(' · ') : 'כל החברות והנתונים';
  }

  function isChannelField(key) {
    return !!CHANNEL_FIELDS[key];
  }

  function buildSelect(key, options, value, attrs) {
    var id = 'prd-f-' + key;
    var html = '<div class="prd-filter-field" data-field="' + key + '">' +
      '<label class="prd-filter-label" for="' + id + '">' + esc(FIELD_LABELS[key] || CHANNEL_FIELDS[key] || key) + '</label>' +
      '<select class="prd-filter-select" id="' + id + '" data-key="' + key + '"' + (attrs || '') + '>' +
      '<option value="">הכל</option>';
    options.forEach(function (opt) {
      var vid = typeof opt === 'string' ? opt : opt.id;
      var lbl = typeof opt === 'string' ? opt : (opt.label || opt.name || opt.title || opt.path || opt.domain);
      html += '<option value="' + esc(vid) + '"' + (value === vid ? ' selected' : '') + '>' + esc(lbl) + '</option>';
    });
    html += '</select></div>';
    return html;
  }

  function buildTextInput(key, value) {
    var id = 'prd-f-' + key;
    return '<div class="prd-filter-field" data-field="' + key + '">' +
      '<label class="prd-filter-label" for="' + id + '">' + esc(FIELD_LABELS[key]) + '</label>' +
      '<input type="text" class="prd-filter-input" id="' + id + '" data-key="' + key + '" value="' + esc(value) + '" placeholder="הכל">' +
      '</div>';
  }

  function buildDateInput(key, value) {
    var id = 'prd-f-' + key;
    return '<div class="prd-filter-field" data-field="' + key + '">' +
      '<label class="prd-filter-label" for="' + id + '">' + esc(FIELD_LABELS[key]) + '</label>' +
      '<input type="date" class="prd-filter-input" id="' + id + '" data-key="' + key + '" value="' + esc(value) + '">' +
      '</div>';
  }

  function buildChannelCheckboxes(keys) {
    var chKeys = keys.filter(isChannelField);
    if (!chKeys.length) return '';
    var html = '<div class="prd-filter-channels"><div class="prd-filter-channels-title">ערוצי שיווק</div><div class="prd-filter-channel-grid">';
    chKeys.forEach(function (key) {
      var checked = state.channels[key] ? ' checked' : '';
      html += '<label class="prd-filter-channel"><input type="checkbox" data-channel="' + key + '"' + checked + '> ' +
        esc(CHANNEL_FIELDS[key]) + '</label>';
    });
    html += '</div></div>';
    return html;
  }

  function optionsForField(key) {
    switch (key) {
      case 'company': return entities.companies;
      case 'business': return businessesForCompany(state.companyId);
      case 'project': return projectsForBusiness(state.businessId);
      case 'site': return sitesForProject(state.projectId);
      case 'domain': return domainsForSite(state.siteId, state.projectId);
      case 'page': return pagesForSite(state.siteId);
      case 'campaign': return campaignsForProject(state.projectId);
      case 'campaignType': return CAMPAIGN_TYPES;
      case 'channel': return (entities.channels || []).map(function (c) { return { id: c.id, label: c.label }; });
      case 'status': return entities.statuses || [];
      default: return [];
    }
  }

  function valueForField(key) {
    var map = {
      company: 'companyId', business: 'businessId', project: 'projectId', site: 'siteId',
      page: 'pageId', campaign: 'campaignId', campaignNumber: 'campaignNumber',
      campaignType: 'campaignType', channel: 'channel', dateFrom: 'dateFrom', dateTo: 'dateTo', status: 'status',
    };
    return state[map[key]] || '';
  }

  function renderBar(scId, mount) {
    if (!entities) return;
    var schema = getSchemaForScreen(scId);
    var regular = schema.filter(function (k) { return !isChannelField(k); });
    var primaryKeys = regular.slice(0, 4);
    var expandedKeys = regular.slice(4);

    var html = '<div class="prd-filter-head">' +
      '<span class="prd-filter-title">🔍 סינון</span>' +
      '<div class="prd-filter-actions">' +
      '<span class="prd-filter-scope-badge">' + esc(getScopeLabel()) + '</span>' +
      '<button type="button" class="prd-filter-toggle" aria-expanded="false">עוד סינונים</button>' +
      '<button type="button" class="prd-filter-clear">נקה</button>' +
      '</div></div>';

    html += '<div class="prd-filter-primary">';
    primaryKeys.forEach(function (key) { html += renderField(key); });
    html += '</div>';

    if (expandedKeys.length || schema.some(isChannelField)) {
      html += '<div class="prd-filter-expanded" hidden>';
      expandedKeys.forEach(function (key) { html += renderField(key); });
      html += buildChannelCheckboxes(schema);
      html += '</div>';
    }

    mount.innerHTML = html;
    mount.dataset.screen = scId;
    bindBar(mount);
  }

  function renderField(key) {
    if (key === 'campaignNumber') return buildTextInput(key, valueForField(key));
    if (key === 'dateFrom' || key === 'dateTo') return buildDateInput(key, valueForField(key));
    return buildSelect(key, optionsForField(key), valueForField(key));
  }

  function bindBar(bar) {
    bar.querySelector('.prd-filter-toggle')?.addEventListener('click', function () {
      var exp = bar.querySelector('.prd-filter-expanded');
      if (!exp) return;
      var open = exp.hasAttribute('hidden');
      if (open) exp.removeAttribute('hidden'); else exp.setAttribute('hidden', '');
      this.setAttribute('aria-expanded', open ? 'true' : 'false');
      this.textContent = open ? 'פחות סינונים' : 'עוד סינונים';
    });

    bar.querySelector('.prd-filter-clear')?.addEventListener('click', function () {
      state = {
        companyId: '', businessId: '', projectId: '', siteId: '', pageId: '',
        campaignId: '', campaignNumber: '', campaignType: '', channel: '',
        dateFrom: '', dateTo: '', status: '', channels: {},
      };
      if (daliaCompanyName) applyDaliaCompany(daliaCompanyName);
      else { saveState(); remountAll(); }
    });

    bar.querySelectorAll('.prd-filter-select, .prd-filter-input').forEach(function (el) {
      el.addEventListener('change', function () {
        var key = el.dataset.key;
        var map = {
          company: 'companyId', business: 'businessId', project: 'projectId', site: 'siteId',
          page: 'pageId', campaign: 'campaignId', campaignNumber: 'campaignNumber',
          campaignType: 'campaignType', channel: 'channel', dateFrom: 'dateFrom', dateTo: 'dateTo', status: 'status',
        };
        if (key === 'domain' && el.value) {
          var site = entities.sites.find(function (s) { return s.domain === el.value; });
          if (site) state.siteId = site.id;
        } else if (map[key]) {
          state[map[key]] = el.value;
          resetCascade(key);
        }
        saveState();
        remountAll();
      });
    });

    bar.querySelectorAll('[data-channel]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        state.channels[cb.dataset.channel] = cb.checked;
        saveState();
        bar.querySelector('.prd-filter-scope-badge').textContent = getScopeLabel();
      });
    });
  }

  function mountScreen(sc) {
    if (SKIP_SCREENS[sc.id]) return;
    var existing = sc.querySelector('.prd-filter-bar');
    if (!existing) {
      existing = document.createElement('div');
      existing.className = 'prd-filter-bar';
      if (sc.id === 'sc-morning') {
        var zone = sc.querySelector('.prd-zone-status');
        var hdr = zone && zone.querySelector('.v4-zone-hdr');
        if (hdr) zone.insertBefore(existing, hdr.nextSibling);
        else if (zone) zone.insertBefore(existing, zone.firstChild);
        else sc.insertBefore(existing, sc.firstChild);
      } else {
        var bar = sc.querySelector('.v4-module-bar');
        if (bar) sc.insertBefore(existing, bar.nextSibling);
        else sc.insertBefore(existing, sc.firstChild);
      }
    }
    renderBar(sc.id, existing);
  }

  function remountAll() {
    document.querySelectorAll('.screen').forEach(mountScreen);
  }

  function listenDalia() {
    window.addEventListener('message', function (e) {
      if (!e.data) return;
      if (e.data.type === 'dalia-coco-scope') {
        if (e.data.selectedCompany) applyDaliaCompany(e.data.selectedCompany);
        else if (e.data.selectedCompany === null) {
          daliaCompanyName = null;
        }
      }
    });
  }

  function fetchEntities() {
    return fetch(ENTITIES_URL).then(function (r) { return r.json(); }).catch(function () {
      return {
        companies: [{ id: 'coco-dalia', name: 'CO.CO דליה' }],
        businesses: [{ id: 'biz-dalia', companyId: 'coco-dalia', name: 'דליה פתרונות תפעול ותחזוקה לרכב' }],
        projects: [{ id: 'proj-marketing', businessId: 'biz-dalia', name: 'ניהול שיווק' }],
        sites: [{ id: 'site-dalia-c', projectId: 'proj-marketing', name: 'dalia-c.com', domain: 'dalia-c.com' }],
        pages: [], campaigns: [], channels: [], statuses: ['פעיל', 'מושהה', 'טיוטה'],
      };
    });
  }

  function init() {
    listenDalia();
    fetchEntities().then(function (data) {
      entities = data;
      if (!state.companyId) {
        var def = entities.companies[0];
        if (def) {
          state.companyId = def.id;
          var biz = businessesForCompany(def.id)[0];
          if (biz) state.businessId = biz.id;
        }
      }
      remountAll();
      saveState();
    });
  }

  window.PrdFilter = {
    init: init,
    getState: getSnapshot,
    getScopeLabel: getScopeLabel,
    remount: remountAll,
    applyDaliaCompany: applyDaliaCompany,
    getSchemaForScreen: getSchemaForScreen,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
