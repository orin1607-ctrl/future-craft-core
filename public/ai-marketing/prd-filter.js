/**
 * Project 001 — PRD Filter System v2
 * היררכיה: חברה → עסק → פרויקט → אתר → דומיין → עמוד → קמפיין → ערוץ שיווק
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'coco-prd-filters-v2';
  var VIEWS_KEY = 'coco-prd-saved-views-v1';
  var ENTITIES_URL = './ai-marketing/prd-entities.json';

  var SKIP_SCREENS = {};

  var DATE_PRESETS = [
    { id: 'today', label: 'היום' },
    { id: 'yesterday', label: 'אתמול' },
    { id: 'this_week', label: 'השבוע' },
    { id: 'last_week', label: 'שבוע שעבר' },
    { id: 'this_month', label: 'החודש' },
    { id: 'last_month', label: 'חודש קודם' },
    { id: 'this_year', label: 'השנה' },
    { id: 'custom', label: 'מותאם אישית' },
  ];

  var CHANNEL_FIELDS = {
    google_seo: 'Google SEO', google_ads: 'Google Ads', google_business: 'Google Business',
    facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', linkedin: 'LinkedIn',
    youtube: 'YouTube', whatsapp: 'WhatsApp', email: 'Email Marketing',
  };

  var FIELD_LABELS = {
    company: 'חברה', business: 'עסק', project: 'פרויקט', site: 'אתר', domain: 'דומיין',
    page: 'עמוד באתר', campaign: 'קמפיין (מלא)', campaignName: 'שם קמפיין',
    campaignNumber: 'מספר קמפיין', campaignExternalId: 'מזהה קמפיין (Campaign ID)',
    campaignType: 'סוג קמפיין', campaignStatus: 'סטטוס קמפיין',
    channel: 'ערוץ שיווק', responsibleUser: 'משתמש אחראי',
    datePreset: 'טווח זמן', dateFrom: 'מתאריך', dateTo: 'עד תאריך', status: 'סטטוס',
  };

  var CAMPAIGN_TYPES = ['SEO', 'Search', 'Display', 'Performance Max', 'מקומי', 'Social', 'Email'];

  var BASE_ENTITY = ['company', 'business', 'project', 'site', 'domain'];
  var BASE_CAMPAIGN = ['campaign', 'campaignName', 'campaignNumber', 'campaignExternalId', 'campaignStatus', 'campaignType'];
  var BASE_DATES = ['datePreset', 'dateFrom', 'dateTo'];
  var BASE_TAIL = ['responsibleUser', 'status'];

  var SCHEMAS = {
    home: BASE_ENTITY.concat(['channel'], BASE_DATES, ['status']),
    standard: BASE_ENTITY.concat(['page'], BASE_CAMPAIGN, ['channel'], BASE_DATES, BASE_TAIL),
    seo: BASE_ENTITY.concat(['page', 'channel', 'google_seo'], BASE_CAMPAIGN.slice(2), BASE_DATES, BASE_TAIL),
    ads: BASE_ENTITY.concat(BASE_CAMPAIGN, ['google_ads'], BASE_DATES, BASE_TAIL),
    gbp: BASE_ENTITY.concat(['google_business'], BASE_CAMPAIGN.slice(3), BASE_DATES, BASE_TAIL),
    social: BASE_ENTITY.concat(['page'], BASE_CAMPAIGN, ['channel', 'facebook', 'instagram', 'tiktok', 'linkedin', 'youtube', 'whatsapp', 'email'], BASE_DATES, BASE_TAIL),
    content: BASE_ENTITY.concat(['page'], BASE_DATES, BASE_TAIL),
    keywords: BASE_ENTITY.concat(['page', 'google_seo'], BASE_CAMPAIGN.slice(2), BASE_DATES, BASE_TAIL),
    landing: BASE_ENTITY.concat(['page'], BASE_CAMPAIGN.slice(0, 4), BASE_DATES, BASE_TAIL),
    competitors: BASE_ENTITY.concat(['page', 'google_seo'], BASE_DATES, BASE_TAIL),
    ai: BASE_ENTITY.concat(BASE_CAMPAIGN.slice(0, 2), BASE_DATES, BASE_TAIL),
    reports: BASE_ENTITY.concat(['page'], BASE_CAMPAIGN.slice(0, 3), ['channel'], BASE_DATES, BASE_TAIL),
    settings: ['company', 'business', 'responsibleUser'],
    nav: ['company', 'business', 'project', 'datePreset'],
  };

  var SCREEN_SCHEMA = {
    'sc-morning': 'home',
    'sc-aichat': 'ai', 'sc-category': 'nav', 'sc-modules': 'nav',
    'sc-dashboard': 'standard', 'sc-executive': 'reports', 'sc-briefing': 'reports', 'sc-kpi': 'reports',
    'sc-notifications': 'standard', 'sc-tasks': 'standard', 'sc-health': 'standard',
    'sc-seo': 'seo', 'sc-keywords': 'keywords', 'sc-intel': 'seo', 'sc-competitors': 'competitors', 'sc-news': 'seo',
    'sc-ads': 'ads', 'sc-gbp': 'gbp',
    'sc-content': 'content', 'sc-pages': 'content', 'sc-landing': 'landing', 'sc-warehouse': 'content', 'sc-scheduler': 'content',
    'sc-crm': 'social', 'sc-funnel': 'social', 'sc-journey': 'social',
    'sc-reports': 'reports', 'sc-analytics': 'reports', 'sc-roi': 'reports', 'sc-strategy': 'reports', 'sc-roadmap': 'reports',
    'sc-history': 'reports',
    'sc-director': 'ai', 'sc-ailab': 'ai', 'sc-autonomous': 'ai', 'sc-aiguide': 'ai', 'sc-decisions': 'ai',
    'sc-approval': 'standard', 'sc-aiimage': 'content', 'sc-heatmap': 'content',
    'sc-settings': 'settings', 'sc-permissions': 'settings', 'sc-fleetint': 'standard', 'sc-usermanual': 'settings',
    'sc-qa': 'standard',
  };

  var entities = null;
  var state = loadState();
  var daliaCompanyName = null;

  function defaultState() {
    return {
      companyId: '', businessId: '', projectId: '', siteId: '', pageId: '',
      campaignId: '', campaignName: '', campaignNumber: '', campaignExternalId: '',
      campaignStatus: '', campaignType: '', channel: '', responsibleUserId: '',
      datePreset: 'this_month', dateFrom: '', dateTo: '', status: '', channels: {},
    };
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return Object.assign(defaultState(), JSON.parse(raw));
    } catch (e) { /* ignore */ }
    var s = defaultState();
    applyDatePresetToState('this_month', s);
    return s;
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
    window.dispatchEvent(new CustomEvent('prd-filter-change', { detail: getSnapshot() }));
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtDate(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function applyDatePresetToState(preset, target) {
    var t = target || state;
    t.datePreset = preset;
    if (preset === 'custom') return;
    var now = new Date();
    var start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var end = new Date(start);
    if (preset === 'yesterday') {
      start.setDate(start.getDate() - 1);
      end = new Date(start);
    } else if (preset === 'this_week') {
      var dow = start.getDay();
      start.setDate(start.getDate() - dow);
    } else if (preset === 'last_week') {
      var d2 = start.getDay();
      end.setDate(end.getDate() - d2 - 1);
      start = new Date(end);
      start.setDate(start.getDate() - 6);
    } else if (preset === 'this_month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (preset === 'last_month') {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
    } else if (preset === 'this_year') {
      start = new Date(now.getFullYear(), 0, 1);
    }
    t.dateFrom = fmtDate(start);
    t.dateTo = fmtDate(end);
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

  function campaignLabel(c) {
    return c.name + ' · ' + c.number + ' · ID ' + (c.externalId || '—');
  }

  function syncCampaignFromEntity(camp) {
    if (!camp) return;
    state.campaignId = camp.id;
    state.campaignName = camp.name;
    state.campaignNumber = camp.number || '';
    state.campaignExternalId = camp.externalId || '';
    state.campaignType = camp.type || '';
    state.campaignStatus = camp.status || '';
    if (camp.channel) state.channel = camp.channel;
  }

  function resetCascade(fromField) {
    var order = ['companyId', 'businessId', 'projectId', 'siteId', 'pageId', 'campaignId'];
    var map = { company: 0, business: 1, project: 2, site: 3, page: 4, campaign: 5, campaignName: 5 };
    var start = map[fromField];
    if (start == null) return;
    for (var i = start + 1; i < order.length; i++) state[order[i]] = '';
    if (fromField === 'company' || fromField === 'business' || fromField === 'project') {
      state.campaignName = '';
      state.campaignNumber = '';
      state.campaignExternalId = '';
      state.campaignType = '';
      state.campaignStatus = '';
      state.channel = '';
    }
    if (fromField === 'site') state.pageId = '';
    if (fromField === 'campaign' || fromField === 'campaignName') {
      /* synced via entity */
    }
  }

  function applyDaliaCompany(name) {
    daliaCompanyName = name;
    if (!entities || !name) return;
    var co = companyByName(name);
    if (co) {
      state.companyId = co.id;
      var biz = businessesForCompany(co.id)[0];
      if (biz) state.businessId = biz.id;
      saveState();
      remountAll();
    }
  }

  function getSnapshot() {
    return {
      companyId: state.companyId, businessId: state.businessId, projectId: state.projectId,
      siteId: state.siteId, pageId: state.pageId, campaignId: state.campaignId,
      campaignName: state.campaignName, campaignNumber: state.campaignNumber,
      campaignExternalId: state.campaignExternalId, campaignStatus: state.campaignStatus,
      campaignType: state.campaignType, channel: state.channel,
      responsibleUserId: state.responsibleUserId,
      datePreset: state.datePreset, dateFrom: state.dateFrom, dateTo: state.dateTo,
      status: state.status, channels: Object.assign({}, state.channels),
      daliaCompanyName: daliaCompanyName,
    };
  }

  function resolveEntity(id, list) {
    return (list || []).find(function (x) { return x.id === id; });
  }

  function getContextParts() {
    if (!entities) return {};
    var co = resolveEntity(state.companyId, entities.companies);
    var biz = resolveEntity(state.businessId, entities.businesses);
    var proj = resolveEntity(state.projectId, entities.projects);
    var site = resolveEntity(state.siteId, entities.sites);
    var page = resolveEntity(state.pageId, entities.pages);
    var camp = resolveEntity(state.campaignId, entities.campaigns);
    if (!camp && state.campaignName) {
      camp = entities.campaigns.find(function (c) { return c.name === state.campaignName; });
    }
    return {
      company: co ? co.name : (daliaCompanyName || 'הכל'),
      business: biz ? biz.name : 'הכל',
      project: proj ? proj.name : '',
      site: site ? site.domain : 'הכל',
      page: page ? page.title : (state.pageId ? state.pageId : ''),
      campaign: camp ? camp.name : (state.campaignName || 'הכל'),
      channel: state.channel ? (CHANNEL_FIELDS[state.channel] || state.channel) : '',
    };
  }

  function getScopeLabel() {
    var p = getContextParts();
    var parts = [p.company];
    if (p.business && p.business !== 'הכל') parts.push(p.business);
    if (p.site && p.site !== 'הכל') parts.push(p.site);
    if (state.campaignStatus) parts.push('קמפיין: ' + state.campaignStatus);
    if (state.status) parts.push('סטטוס: ' + state.status);
    if (state.dateFrom && state.dateTo) parts.push(state.dateFrom + ' — ' + state.dateTo);
    var ch = Object.keys(state.channels).filter(function (k) { return state.channels[k]; });
    if (ch.length) parts.push(ch.map(function (k) { return CHANNEL_FIELDS[k] || k; }).join(', '));
    return parts.length ? 'מציג: ' + parts.join(' · ') : 'כל החברות והנתונים';
  }

  function getBreadcrumbHtml(scId) {
    var p = getContextParts();
    var screenName = (typeof window.screenLabels === 'object' && window.screenLabels[scId]) || '';
    var crumbs = [
      { label: p.company, ok: p.company !== 'הכל' },
      { label: p.business, ok: p.business !== 'הכל' },
      { label: p.project, ok: !!p.project },
      { label: p.site, ok: p.site !== 'הכל' },
      { label: p.page || screenName, ok: !!(p.page || screenName) },
    ].filter(function (c) { return c.label && c.label !== 'הכל'; });
    if (!crumbs.length) crumbs.push({ label: 'מצב כללי', ok: true });
    return '<nav class="prd-breadcrumb" aria-label="מיקום">' +
      crumbs.map(function (c, i) {
        return (i ? '<span class="prd-bc-sep">←</span>' : '') +
          '<span class="prd-bc-item' + (c.ok ? ' active' : '') + '">' + esc(c.label) + '</span>';
      }).join('') + '</nav>';
  }

  function getContextBadgesHtml(scId) {
    var p = getContextParts();
    var screenName = (typeof window.screenLabels === 'object' && window.screenLabels[scId]) || '';
    var badges = [
      { k: 'חברה', v: p.company },
      { k: 'עסק', v: p.business },
      { k: 'אתר', v: p.site },
      { k: 'עמוד', v: p.page || screenName || '—' },
      { k: 'קמפיין', v: p.campaign },
    ];
    return '<div class="prd-context-badges">' + badges.map(function (b) {
      return '<span class="prd-ctx-badge"><strong>' + esc(b.k) + ':</strong> ' + esc(b.v || '—') + '</span>';
    }).join('') + '</div>';
  }

  function isChannelField(key) { return !!CHANNEL_FIELDS[key]; }

  function buildSelect(key, options, value, labelFn) {
    var id = 'prd-f-' + key + '-' + Math.random().toString(36).slice(2, 7);
    var html = '<div class="prd-filter-field" data-field="' + key + '">' +
      '<label class="prd-filter-label" for="' + id + '">' + esc(FIELD_LABELS[key] || CHANNEL_FIELDS[key] || key) + '</label>' +
      '<select class="prd-filter-select" id="' + id + '" data-key="' + key + '">' +
      '<option value="">הכל</option>';
    options.forEach(function (opt) {
      var vid = typeof opt === 'string' ? opt : opt.id;
      var lbl = typeof opt === 'string' ? opt : (labelFn ? labelFn(opt) : (opt.label || opt.name || opt.title || opt.path || opt.domain || opt.role));
      html += '<option value="' + esc(vid) + '"' + (String(value) === String(vid) ? ' selected' : '') + '>' + esc(lbl) + '</option>';
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

  function buildSavedViewsUi() {
    var views = loadSavedViews();
    var opts = views.map(function (v) {
      return '<option value="' + esc(v.id) + '">' + esc(v.name) + '</option>';
    }).join('');
    return '<div class="prd-saved-views">' +
      '<div class="prd-saved-views-title">תצוגות שמורות</div>' +
      '<div class="prd-saved-views-row">' +
      '<input type="text" class="prd-filter-input prd-view-name" placeholder="שם תצוגה (לדוגמה: SEO דליה)">' +
      '<button type="button" class="prd-filter-toggle prd-view-save">💾 שמור</button>' +
      '</div>' +
      '<div class="prd-saved-views-row">' +
      '<select class="prd-filter-select prd-view-list"><option value="">טען תצוגה…</option>' + opts + '</select>' +
      '<button type="button" class="prd-filter-toggle prd-view-load">טען</button>' +
      '<button type="button" class="prd-filter-clear prd-view-delete">מחק</button>' +
      '</div></div>';
  }

  function loadSavedViews() {
    try {
      var raw = localStorage.getItem(VIEWS_KEY);
      if (raw) return JSON.parse(raw).views || [];
    } catch (e) { /* ignore */ }
    return [];
  }

  function persistViews(views) {
    try { localStorage.setItem(VIEWS_KEY, JSON.stringify({ views: views })); } catch (e) { /* ignore */ }
  }

  function saveCurrentView(name) {
    var views = loadSavedViews();
    var id = 'view-' + Date.now();
    views.push({ id: id, name: name, state: getSnapshot(), createdAt: new Date().toISOString() });
    persistViews(views);
    return views;
  }

  function loadView(id) {
    var v = loadSavedViews().find(function (x) { return x.id === id; });
    if (!v || !v.state) return;
    state = Object.assign(defaultState(), v.state);
    saveState();
    remountAll();
  }

  function deleteView(id) {
    persistViews(loadSavedViews().filter(function (x) { return x.id !== id; }));
  }

  function optionsForField(key) {
    var camps = campaignsForProject(state.projectId);
    switch (key) {
      case 'company': return entities.companies;
      case 'business': return businessesForCompany(state.companyId);
      case 'project': return projectsForBusiness(state.businessId);
      case 'site': return sitesForProject(state.projectId);
      case 'domain': return domainsForSite(state.siteId, state.projectId);
      case 'page': return pagesForSite(state.siteId);
      case 'campaign': return camps;
      case 'campaignName': return camps.map(function (c) { return { id: c.name, label: c.name }; });
      case 'campaignNumber': return camps.map(function (c) { return { id: c.number, label: c.number + ' — ' + c.name }; });
      case 'campaignExternalId': return camps.filter(function (c) { return c.externalId; }).map(function (c) {
        return { id: c.externalId, label: c.externalId + ' — ' + c.name };
      });
      case 'campaignType': return CAMPAIGN_TYPES;
      case 'campaignStatus': return entities.campaignStatuses || [];
      case 'channel': return (entities.channels || []).map(function (c) { return { id: c.id, label: c.label }; });
      case 'responsibleUser': return (entities.responsibleUsers || []).map(function (u) {
        return { id: u.id, label: u.role + ' — ' + u.name };
      });
      case 'datePreset': return DATE_PRESETS;
      case 'status': return entities.statuses || [];
      default: return [];
    }
  }

  function valueForField(key) {
    var map = {
      company: 'companyId', business: 'businessId', project: 'projectId', site: 'siteId',
      page: 'pageId', campaign: 'campaignId', campaignName: 'campaignName',
      campaignNumber: 'campaignNumber', campaignExternalId: 'campaignExternalId',
      campaignStatus: 'campaignStatus', campaignType: 'campaignType', channel: 'channel',
      responsibleUser: 'responsibleUserId', datePreset: 'datePreset',
      dateFrom: 'dateFrom', dateTo: 'dateTo', status: 'status',
    };
    return state[map[key]] || '';
  }

  function renderField(key) {
    if (key === 'campaignNumber' || key === 'campaignExternalId') {
      var opts = optionsForField(key);
      if (opts.length) return buildSelect(key, opts, valueForField(key));
      return buildTextInput(key, valueForField(key));
    }
    if (key === 'dateFrom' || key === 'dateTo') return buildDateInput(key, valueForField(key));
    if (key === 'campaign') return buildSelect(key, optionsForField(key), valueForField(key), campaignLabel);
    return buildSelect(key, optionsForField(key), valueForField(key));
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

    html += '<div class="prd-filter-expanded" hidden>';
    expandedKeys.forEach(function (key) { html += renderField(key); });
    html += buildChannelCheckboxes(schema);
    html += buildSavedViewsUi();
    html += '</div>';

    mount.innerHTML = html;
    mount.dataset.screen = scId;
    bindBar(mount, scId);
  }

  function bindBar(bar, scId) {
    bar.querySelector('.prd-filter-toggle')?.addEventListener('click', function () {
      var exp = bar.querySelector('.prd-filter-expanded');
      if (!exp) return;
      var open = exp.hasAttribute('hidden');
      if (open) exp.removeAttribute('hidden'); else exp.setAttribute('hidden', '');
      this.setAttribute('aria-expanded', open ? 'true' : 'false');
      this.textContent = open ? 'פחות סינונים' : 'עוד סינונים';
    });

    bar.querySelector('.prd-filter-clear')?.addEventListener('click', function () {
      state = defaultState();
      applyDatePresetToState('this_month', state);
      if (daliaCompanyName) applyDaliaCompany(daliaCompanyName);
      else { saveState(); remountAll(); }
    });

    bar.querySelector('.prd-view-save')?.addEventListener('click', function () {
      var name = bar.querySelector('.prd-view-name')?.value?.trim();
      if (!name) { alert('הזן שם לתצוגה השמורה'); return; }
      saveCurrentView(name);
      renderBar(scId, bar);
    });

    bar.querySelector('.prd-view-load')?.addEventListener('click', function () {
      var id = bar.querySelector('.prd-view-list')?.value;
      if (id) loadView(id);
    });

    bar.querySelector('.prd-view-delete')?.addEventListener('click', function () {
      var id = bar.querySelector('.prd-view-list')?.value;
      if (!id) return;
      if (confirm('למחוק את התצוגה השמורה?')) {
        deleteView(id);
        renderBar(scId, bar);
      }
    });

    bar.querySelectorAll('.prd-filter-select, .prd-filter-input').forEach(function (el) {
      el.addEventListener('change', function () {
        handleFieldChange(el.dataset.key, el.value);
        saveState();
        remountAll();
      });
    });

    bar.querySelectorAll('[data-channel]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        state.channels[cb.dataset.channel] = cb.checked;
        saveState();
        updateContextBars();
      });
    });
  }

  function handleFieldChange(key, value) {
    if (key === 'domain' && value) {
      var site = entities.sites.find(function (s) { return s.domain === value; });
      if (site) state.siteId = site.id;
      return;
    }
    if (key === 'datePreset') {
      applyDatePresetToState(value || 'custom');
      return;
    }
    if (key === 'dateFrom' || key === 'dateTo') {
      state[key] = value;
      state.datePreset = 'custom';
      return;
    }
    if (key === 'campaign') {
      state.campaignId = value;
      var camp = entities.campaigns.find(function (c) { return c.id === value; });
      if (camp) syncCampaignFromEntity(camp);
      else if (!value) {
        state.campaignName = '';
        state.campaignNumber = '';
        state.campaignExternalId = '';
      }
      resetCascade('campaign');
      return;
    }
    if (key === 'campaignName') {
      state.campaignName = value;
      var c1 = entities.campaigns.find(function (c) { return c.name === value; });
      if (c1) syncCampaignFromEntity(c1);
      return;
    }
    if (key === 'campaignNumber') {
      state.campaignNumber = value;
      var c2 = entities.campaigns.find(function (c) { return c.number === value; });
      if (c2) syncCampaignFromEntity(c2);
      return;
    }
    if (key === 'campaignExternalId') {
      state.campaignExternalId = value;
      var c3 = entities.campaigns.find(function (c) { return c.externalId === value; });
      if (c3) syncCampaignFromEntity(c3);
      return;
    }
    var map = {
      company: 'companyId', business: 'businessId', project: 'projectId', site: 'siteId',
      page: 'pageId', campaignStatus: 'campaignStatus', campaignType: 'campaignType',
      channel: 'channel', responsibleUser: 'responsibleUserId', status: 'status',
    };
    if (map[key]) {
      state[map[key]] = value;
      resetCascade(key);
    }
  }

  function mountContextBar(sc) {
    var bar = sc.querySelector('.prd-context-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'prd-context-bar';
      var filter = sc.querySelector('.prd-filter-bar');
      var mod = sc.querySelector('.v4-module-bar');
      var insertBefore = filter || mod || sc.firstChild;
      if (insertBefore) sc.insertBefore(bar, insertBefore);
      else sc.appendChild(bar);
    }
    bar.innerHTML = getBreadcrumbHtml(sc.id) + getContextBadgesHtml(sc.id);
  }

  function updateContextBars() {
    document.querySelectorAll('.screen .prd-context-bar').forEach(function (bar) {
      var sc = bar.closest('.screen');
      if (sc) bar.innerHTML = getBreadcrumbHtml(sc.id) + getContextBadgesHtml(sc.id);
    });
    document.querySelectorAll('.prd-filter-scope-badge').forEach(function (el) {
      el.textContent = getScopeLabel();
    });
  }

  function mountScreen(sc) {
    if (SKIP_SCREENS[sc.id]) return;
    mountContextBar(sc);
    var existing = sc.querySelector('.prd-filter-bar');
    if (!existing) {
      existing = document.createElement('div');
      existing.className = 'prd-filter-bar';
      var ctx = sc.querySelector('.prd-context-bar');
      if (sc.id === 'sc-morning') {
        var zone = sc.querySelector('.prd-zone-status');
        var hdr = zone && zone.querySelector('.v4-zone-hdr');
        if (hdr) zone.insertBefore(existing, hdr.nextSibling);
        else if (zone) zone.insertBefore(existing, zone.firstChild);
      } else if (ctx && ctx.nextSibling) {
        sc.insertBefore(existing, ctx.nextSibling);
      } else {
        var mod = sc.querySelector('.v4-module-bar');
        if (mod) sc.insertBefore(existing, mod.nextSibling);
        else sc.insertBefore(existing, sc.firstChild);
      }
    }
    renderBar(sc.id, existing);
  }

  function remountAll() {
    document.querySelectorAll('.screen').forEach(mountScreen);
    updateContextBars();
    if (window.PrdDataGrid && typeof window.PrdDataGrid.enhanceAll === 'function') {
      window.PrdDataGrid.enhanceAll();
    }
  }

  function listenDalia() {
    window.addEventListener('message', function (e) {
      if (!e.data) return;
      if (e.data.type === 'dalia-coco-scope') {
        if (e.data.selectedCompany) applyDaliaCompany(e.data.selectedCompany);
        else if (e.data.selectedCompany === null) daliaCompanyName = null;
      }
    });
  }

  function fetchEntities() {
    return fetch(ENTITIES_URL).then(function (r) { return r.json(); }).catch(function () {
      return { companies: [], businesses: [], projects: [], sites: [], pages: [], campaigns: [], channels: [], statuses: [], campaignStatuses: [], responsibleUsers: [] };
    });
  }

  function init() {
    listenDalia();
    if (!state.dateFrom) applyDatePresetToState(state.datePreset || 'this_month');
    fetchEntities().then(function (data) {
      entities = data;
      if (!state.companyId && entities.companies[0]) {
        state.companyId = entities.companies[0].id;
        var biz = businessesForCompany(state.companyId)[0];
        if (biz) state.businessId = biz.id;
      }
      remountAll();
      saveState();
    });
  }

  window.PrdFilter = {
    init: init,
    getState: getSnapshot,
    getScopeLabel: getScopeLabel,
    getContextParts: getContextParts,
    remount: remountAll,
    applyDaliaCompany: applyDaliaCompany,
    getSchemaForScreen: getSchemaForScreen,
    loadView: loadView,
    saveCurrentView: saveCurrentView,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
