/**
 * Project 001 — משימה 2: חברות ולקוחות (כרטיס שיווק מסונכרן מדליה)
 */
(function () {
  'use strict';

  var PROVIDER_LABELS = {
    google_analytics: 'Google Analytics', google_search_console: 'Search Console',
    google_ads: 'Google Ads', google_business: 'Google Business Profile',
    google_tag_manager: 'Google Tag Manager', gmail: 'Gmail', google_workspace: 'Google Workspace',
    google_merchant: 'Google Merchant Center', facebook: 'Facebook', instagram: 'Instagram',
    tiktok: 'TikTok', linkedin: 'LinkedIn', youtube: 'YouTube', whatsapp_business: 'WhatsApp Business',
  };

  var CONTACT_ROLES = {
    owner: 'בעלים', manager: 'מנהל', marketing_manager: 'מנהל שיווק', other: 'איש קשר',
  };

  var AI_CHECKS = [
    { key: 'site_check', label: 'בדיקת האתר' },
    { key: 'seo_check', label: 'בדיקת SEO' },
    { key: 'analytics_check', label: 'בדיקת Analytics' },
    { key: 'search_console_check', label: 'בדיקת Search Console' },
    { key: 'google_business_check', label: 'בדיקת Google Business' },
    { key: 'performance_check', label: 'בדיקת ביצועי האתר' },
    { key: 'competitors_check', label: 'בדיקת מתחרים' },
  ];

  var state = { customerId: null, customer: null, profile: null, bundle: null };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function api() { return window.MarketingApi; }

  function parseCustomerFromUrl() {
    var m = location.search.match(/[?&]customer=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function loadBundle(customerId) {
    var A = api();
    return Promise.all([
      A.getCustomer(customerId),
      A.getProfile(customerId),
      A.getContacts(customerId),
      A.getSites(customerId),
      A.getDomains(customerId),
      A.getConnections(customerId),
      A.getCampaigns(customerId),
      A.getApiItems(customerId),
      A.getAiSetup(customerId),
    ]).then(function (parts) {
      return {
        customer: parts[0],
        profile: parts[1],
        contacts: parts[2] || [],
        sites: parts[3] || [],
        domains: parts[4] || [],
        connections: parts[5] || [],
        campaigns: parts[6] || [],
        apiItems: parts[7] || [],
        ai: parts[8] || null,
      };
    });
  }

  function renderHub() {
    var list = $('mktHubList');
    if (!list) return;
    list.innerHTML = '<p class="mkt-loading">טוען לקוחות מדליה…</p>';
    api().listMarketingCustomers().then(function (rows) {
      if (!rows.length) {
        list.innerHTML = '<div class="mkt-empty"><p>אין לקוחות עם שירות שיווק.</p><p class="fs11 text3">פתח לקוח בדליה → בחר סוג שירות שכולל שיווק.</p></div>';
        return;
      }
      list.innerHTML = rows.map(function (c) {
        return '<button type="button" class="mkt-hub-card" data-id="' + esc(c.id) + '">' +
          '<div class="mkt-hub-title">' + esc(c.name) + '</div>' +
          '<div class="mkt-hub-sub">' + esc(c.contact_person || '') + ' · ' + esc(c.phone || '') + '</div>' +
          '<span class="mkt-sync-tag">מסונכרן מדליה</span></button>';
      }).join('');
      list.querySelectorAll('.mkt-hub-card').forEach(function (btn) {
        btn.addEventListener('click', function () { openClient(btn.dataset.id); });
      });
    }).catch(function () {
      list.innerHTML = '<div class="mkt-empty"><p>לא ניתן לטעון — התחבר דרך דליה (Super Admin)</p></div>';
    });
  }

  function openClient(id) {
    state.customerId = id;
    if (typeof window.gotoSc === 'function') window.gotoSc('mkt-client');
    renderClient(id);
  }

  function daliaFields(c, profile) {
    var snap = (profile && profile.dalia_snapshot) || {};
    return {
      name: c.name || snap.name,
      business_id: c.business_id || snap.business_id,
      address: c.address || snap.address,
      phone: c.phone || snap.phone,
      email: c.email || snap.email,
      contact_person: c.contact_person || snap.contact_person,
      customer_number: c.customer_number || snap.customer_number,
      activity_field: c.activity_field || snap.activity_field,
    };
  }

  function section(title, body, open) {
    return '<details class="mkt-section"' + (open ? ' open' : '') + '>' +
      '<summary class="mkt-section-hdr">' + esc(title) + '</summary>' +
      '<div class="mkt-section-body">' + body + '</div></details>';
  }

  function renderClient(customerId) {
    var root = $('mktClientRoot');
    if (!root) return;
    root.innerHTML = '<p class="mkt-loading">טוען כרטיס שיווק…</p>';

    loadBundle(customerId).then(function (bundle) {
      if (!bundle.customer) {
        root.innerHTML = '<p class="mkt-empty">לקוח לא נמצא</p>';
        return;
      }
      state.bundle = bundle;
      state.customer = bundle.customer;
      state.profile = bundle.profile;

      return api().syncFromDalia(bundle.customer).then(function () {
        return api().getProfile(customerId);
      }).then(function (prof) {
        bundle.profile = prof || bundle.profile;
        paintClient(bundle);
        maybeAutoGoals(bundle);
      });
    }).catch(function (e) {
      root.innerHTML = '<p class="mkt-empty">שגיאה בטעינה: ' + esc(e.message || e) + '</p>';
    });
  }

  function paintClient(b) {
    var c = b.customer;
    var p = b.profile || {};
    var d = daliaFields(c, p);
    var root = $('mktClientRoot');
    var syncTime = p.synced_at ? new Date(p.synced_at).toLocaleString('he-IL') : 'עכשיו';

    var html = '<div class="mkt-client-head">' +
      '<button type="button" class="btn btn-outline btn-sm mkt-back-hub">→ חזרה לרשימה</button>' +
      '<div><h2 class="mkt-client-title">' + esc(d.name) + '</h2>' +
      '<p class="mkt-client-sub">כרטיס שיווק · מקור אמת: דליה · סונכרן: ' + esc(syncTime) + '</p></div>' +
      '<span class="mkt-ssot-badge">SSOT</span></div>';

    html += '<div class="mkt-ssot-note">פרטי החברה נטענו אוטומטית מדליה — אין להזין שוב שם, כתובת, טלפון או איש קשר.</div>';

    html += section('פרטי החברה (מדליה)', renderCompanyReadonly(d, p), true);
    html += section('אנשי קשר', renderContacts(b), false);
    html += section('אתרים', renderSites(b), false);
    html += section('דומיינים', renderDomains(b), false);
    html += section('דפי נחיתה', renderLandings(b), false);
    html += section('שירותי Google', renderConnections(b, 'google'), false);
    html += section('רשתות חברתיות', renderConnections(b, 'social'), false);
    html += section('APIs וחיבורים', renderApis(b), false);
    html += section('קמפיינים', renderCampaigns(b), false);
    html += section('AI Setup', renderAi(b), false);

    html += '<div class="mkt-footer-actions">' +
      '<button type="button" class="btn btn-primary btn-block mkt-goals-btn">המשך למודול המטרות →</button></div>';

    root.innerHTML = html;
    bindClientEvents(b);
    if (window.PrdDataGrid && window.PrdDataGrid.enhanceAll) window.PrdDataGrid.enhanceAll();
  }

  function renderCompanyReadonly(d, p) {
    var theme = (p.theme_colors && typeof p.theme_colors === 'object') ? p.theme_colors : {};
    return '<div class="mkt-readonly-grid">' +
      ro('שם החברה', d.name) + ro('מספר לקוח', d.customer_number) + ro('ח.פ.', d.business_id) +
      ro('תחום פעילות', d.activity_field) + ro('כתובת', d.address) + ro('טלפון', d.phone) +
      ro('אימייל', d.email) + ro('איש קשר ראשי', d.contact_person) +
      '</div><div class="mkt-editable-block">' +
      '<label class="fs11 fw7 text3">אתר (שיווק)</label>' +
      '<input class="srch mkt-website-inp" style="width:100%" value="' + esc(p.website || '') + '" placeholder="https://">' +
      '<label class="fs11 fw7 text3 mt-8">לוגו URL</label>' +
      '<input class="srch mkt-logo-inp" style="width:100%" value="' + esc(p.logo_url || '') + '" placeholder="קישור ללוגו">' +
      '<button type="button" class="btn btn-primary btn-sm mt-8 mkt-save-profile">💾 שמור שדות שיווק</button></div>';
  }

  function ro(label, val) {
    return '<div class="mkt-ro"><span class="lbl">' + esc(label) + '</span><span class="val">' + esc(val || '—') + '</span></div>';
  }

  function renderContacts(b) {
    var rows = b.contacts.length ? b.contacts : [];
    var html = '<div class="tbl-wrap"><table><thead><tr><th>שם</th><th>תפקיד</th><th>טלפון</th><th>אימייל</th></tr></thead><tbody>';
    if (!rows.length && b.customer.contact_person) {
      html += '<tr><td>' + esc(b.customer.contact_person) + '</td><td>בעלים (דליה)</td><td>' + esc(b.customer.phone) + '</td><td>' + esc(b.customer.email) + '</td></tr>';
    }
    rows.forEach(function (ct) {
      html += '<tr><td>' + esc(ct.full_name) + '</td><td>' + esc(CONTACT_ROLES[ct.contact_role] || ct.contact_role) +
        '</td><td>' + esc(ct.phone) + '</td><td>' + esc(ct.email) + '</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<div class="mkt-mini-form"><input class="srch mkt-ct-name" placeholder="שם"><select class="srch mkt-ct-role">' +
      Object.keys(CONTACT_ROLES).map(function (k) { return '<option value="' + k + '">' + CONTACT_ROLES[k] + '</option>'; }).join('') +
      '</select><input class="srch mkt-ct-phone" placeholder="טלפון"><input class="srch mkt-ct-email" placeholder="אימייל">' +
      '<button type="button" class="btn btn-outline btn-sm mkt-add-contact">+ הוסף איש קשר</button></div>';
    return html;
  }

  function renderSites(b) {
    var html = '<div class="tbl-wrap"><table><thead><tr><th>שם</th><th>דומיין</th><th>סוג</th><th>סטטוס</th></tr></thead><tbody>';
    b.sites.filter(function (s) { return s.site_type !== 'landing'; }).forEach(function (s) {
      html += '<tr><td>' + esc(s.name) + '</td><td>' + esc(s.domain) + '</td><td>' + esc(s.site_type) + '</td><td>' + esc(s.status) + '</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<div class="mkt-mini-form"><input class="srch mkt-site-name" placeholder="שם אתר"><input class="srch mkt-site-domain" placeholder="דומיין">' +
      '<button type="button" class="btn btn-outline btn-sm mkt-add-site">+ הוסף אתר</button></div>';
    return html;
  }

  function renderDomains(b) {
    var html = '<div class="tbl-wrap"><table><thead><tr><th>דומיין</th><th>ראשי</th><th>DNS</th><th>SSL</th></tr></thead><tbody>';
    b.domains.forEach(function (d) {
      html += '<tr><td>' + esc(d.domain) + '</td><td>' + (d.is_primary ? 'כן' : '') + '</td><td>' + esc(d.dns_status) + '</td><td>' + esc(d.ssl_status) + '</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<div class="mkt-mini-form"><input class="srch mkt-dom-inp" placeholder="דומיין"><button type="button" class="btn btn-outline btn-sm mkt-add-domain">+ הוסף דומיין</button></div>';
    return html;
  }

  function renderLandings(b) {
    var landings = b.sites.filter(function (s) { return s.site_type === 'landing'; });
    var html = '<div class="tbl-wrap"><table><thead><tr><th>שם</th><th>URL</th><th>סטטוס</th></tr></thead><tbody>';
    landings.forEach(function (s) {
      html += '<tr><td>' + esc(s.name) + '</td><td>' + esc(s.site_url) + '</td><td>' + esc(s.status) + '</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<div class="mkt-mini-form"><input class="srch mkt-land-name" placeholder="שם דף"><input class="srch mkt-land-url" placeholder="URL">' +
      '<button type="button" class="btn btn-outline btn-sm mkt-add-landing">+ דף נחיתה</button></div>';
    return html;
  }

  function renderConnections(b, kind) {
    var googleKeys = Object.keys(PROVIDER_LABELS).filter(function (k) { return k.indexOf('google') === 0 || k === 'gmail'; });
    var list = b.connections.filter(function (cn) {
      var isG = googleKeys.indexOf(cn.provider) >= 0 || cn.provider.indexOf('google') >= 0;
      return kind === 'google' ? isG : !isG;
    });
    var html = '<div class="mkt-conn-grid">';
    list.forEach(function (cn) {
      html += '<div class="mkt-conn-card"><span class="mkt-conn-name">' + esc(PROVIDER_LABELS[cn.provider] || cn.provider) + '</span>' +
        '<span class="mkt-conn-status ' + (cn.status === 'connected' ? 'on' : '') + '">' + (cn.status === 'connected' ? 'מחובר' : 'לא מחובר') + '</span>' +
        '<button type="button" class="btn btn-ghost btn-xs mkt-conn-btn" data-id="' + esc(cn.id) + '">הגדר</button></div>';
    });
    html += '</div><p class="fs11 text3">חיבור חי — בשלב ב׳. כרגע: תשתית מוכנה.</p>';
    return html;
  }

  function renderApis(b) {
    var html = '<div class="tbl-wrap"><table><thead><tr><th>סוג</th><th>תווית</th><th>ספק</th><th>ערך</th></tr></thead><tbody>';
    b.apiItems.forEach(function (it) {
      html += '<tr><td>' + esc(it.item_type) + '</td><td>' + esc(it.label) + '</td><td>' + esc(it.provider) + '</td><td>' + esc(it.value_mask || '••••') + '</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<div class="mkt-mini-form"><select class="srch mkt-api-type"><option value="api_key">API Key</option><option value="pixel">Pixel</option><option value="oauth">OAuth</option><option value="campaign_id">Campaign ID</option><option value="webhook">Webhook</option></select>' +
      '<input class="srch mkt-api-label" placeholder="תווית"><button type="button" class="btn btn-outline btn-sm mkt-add-api">+ הוסף</button></div>';
    return html;
  }

  function renderCampaigns(b) {
    var html = '<div class="tbl-wrap"><table><thead><tr><th>שם</th><th>סוג</th><th>ערוץ</th><th>תקציב</th><th>סטטוס</th></tr></thead><tbody>';
    b.campaigns.forEach(function (cp) {
      html += '<tr><td>' + esc(cp.name) + '</td><td>' + esc(cp.campaign_type) + '</td><td>' + esc(cp.channel) +
        '</td><td>' + esc(cp.budget) + '</td><td>' + esc(cp.status) + '</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<div class="mkt-mini-form"><input class="srch mkt-camp-name" placeholder="שם קמפיין"><input class="srch mkt-camp-type" placeholder="סוג">' +
      '<input class="srch mkt-camp-channel" placeholder="ערוץ"><button type="button" class="btn btn-outline btn-sm mkt-add-campaign">+ קמפיין</button></div>';
    return html;
  }

  function renderAi(b) {
    var ch = (b.ai && b.ai.checklist) || {};
    var html = '<ul class="mkt-ai-list">';
    AI_CHECKS.forEach(function (item) {
      var st = ch[item.key] || 'pending';
      html += '<li><span class="mkt-ai-st ' + st + '"></span>' + esc(item.label) + ' — <em>' + (st === 'pending' ? 'ממתין' : st) + '</em></li>';
    });
    html += '</ul>';
    if (b.ai && b.ai.recommendations && b.ai.recommendations.length) {
      html += '<p class="fw7 fs12 mt-8">המלצות:</p><ul class="fs12">';
      b.ai.recommendations.forEach(function (r) { html += '<li>' + esc(typeof r === 'string' ? r : r.title || r) + '</li>'; });
      html += '</ul>';
    }
    html += '<p class="fs11 text3 mt-8">ניתוח חי — בשלב ב׳. התשתית מוכנה.</p>';
    return html;
  }

  function bindClientEvents(b) {
    var cid = b.customer.id;
    $('mktClientRoot')?.querySelector('.mkt-back-hub')?.addEventListener('click', function () {
      if (typeof window.gotoSc === 'function') window.gotoSc('mkt-hub');
    });
    $('mktClientRoot')?.querySelector('.mkt-save-profile')?.addEventListener('click', function () {
      var website = $('mktClientRoot').querySelector('.mkt-website-inp')?.value || '';
      var logo = $('mktClientRoot').querySelector('.mkt-logo-inp')?.value || '';
      api().updateProfile(cid, { website: website, logo_url: logo }).then(function () {
        if (window.showToast) window.showToast('נשמר', 'success');
      });
    });
    $('mktClientRoot')?.querySelector('.mkt-add-contact')?.addEventListener('click', function () {
      var root = $('mktClientRoot');
      api().insertContact({
        customer_id: cid,
        full_name: root.querySelector('.mkt-ct-name')?.value || '',
        contact_role: root.querySelector('.mkt-ct-role')?.value || 'other',
        phone: root.querySelector('.mkt-ct-phone')?.value || '',
        email: root.querySelector('.mkt-ct-email')?.value || '',
      }).then(function () { renderClient(cid); });
    });
    $('mktClientRoot')?.querySelector('.mkt-add-site')?.addEventListener('click', function () {
      var root = $('mktClientRoot');
      api().insertSite({
        customer_id: cid,
        name: root.querySelector('.mkt-site-name')?.value || 'אתר',
        domain: root.querySelector('.mkt-site-domain')?.value || '',
        site_type: 'website',
        status: 'active',
      }).then(function () { renderClient(cid); });
    });
    $('mktClientRoot')?.querySelector('.mkt-add-domain')?.addEventListener('click', function () {
      api().insertDomain({
        customer_id: cid,
        domain: $('mktClientRoot').querySelector('.mkt-dom-inp')?.value || '',
        is_primary: false,
      }).then(function () { renderClient(cid); });
    });
    $('mktClientRoot')?.querySelector('.mkt-add-landing')?.addEventListener('click', function () {
      var root = $('mktClientRoot');
      api().insertSite({
        customer_id: cid,
        name: root.querySelector('.mkt-land-name')?.value || 'דף נחיתה',
        site_url: root.querySelector('.mkt-land-url')?.value || '',
        site_type: 'landing',
        status: 'draft',
      }).then(function () { renderClient(cid); });
    });
    $('mktClientRoot')?.querySelector('.mkt-add-campaign')?.addEventListener('click', function () {
      var root = $('mktClientRoot');
      api().insertCampaign({
        customer_id: cid,
        name: root.querySelector('.mkt-camp-name')?.value || '',
        campaign_type: root.querySelector('.mkt-camp-type')?.value || '',
        channel: root.querySelector('.mkt-camp-channel')?.value || '',
        status: 'draft',
      }).then(function () { renderClient(cid); });
    });
    $('mktClientRoot')?.querySelector('.mkt-add-api')?.addEventListener('click', function () {
      var root = $('mktClientRoot');
      api().insertApiItem({
        customer_id: cid,
        item_type: root.querySelector('.mkt-api-type')?.value || 'api_key',
        label: root.querySelector('.mkt-api-label')?.value || '',
        value_mask: '••••',
      }).then(function () { renderClient(cid); });
    });
    $('mktClientRoot')?.querySelector('.mkt-goals-btn')?.addEventListener('click', goToGoals);
    $('mktClientRoot')?.querySelectorAll('.mkt-conn-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (window.showToast) window.showToast('חיבור חי — בשלב ב׳', 'warn');
      });
    });
  }

  function goToGoals() {
    var cid = state.customerId;
    if (cid) api().markGoalsReady(cid);
    if (typeof window.openCategory === 'function') window.openCategory('goals');
    else if (typeof window.gotoSc === 'function') window.gotoSc('strategy');
  }

  function maybeAutoGoals(b) {
    var p = b.profile || {};
    if (p.setup_status === 'provisioned' && state.customerId) {
      if (window.showToast) window.showToast('כרטיס שיווק הוקם — מעבר למטרות…', 'success');
      setTimeout(goToGoals, 1800);
    }
  }

  function onScreenChange(id) {
    if (id === 'sc-mkt-hub') renderHub();
    if (id === 'sc-mkt-client' && state.customerId) renderClient(state.customerId);
  }

  function init() {
    var fromUrl = parseCustomerFromUrl();
    if (fromUrl) {
      state.customerId = fromUrl;
      setTimeout(function () {
        if (typeof window.gotoSc === 'function') window.gotoSc('mkt-client');
      }, 600);
    }

    window.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'dalia-coco-open-customer' && e.data.customerId) {
        openClient(e.data.customerId);
      }
    });

    var orig = window.gotoSc;
    if (typeof orig === 'function') {
      window.gotoSc = function (id) {
        orig(id);
        onScreenChange(id.startsWith('sc-') ? id : 'sc-' + id);
      };
    }

    if ($('mktHubList')) renderHub();
  }

  window.MarketingClient = { init: init, openClient: openClient, renderHub: renderHub, goToGoals: goToGoals };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
