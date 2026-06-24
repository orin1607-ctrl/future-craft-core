/**
 * Project 001 — משימה 2: חברות ולקוחות (כרטיס שיווק מסונכרן מדליה)
 */
(function () {
  'use strict';

  var PROVIDER_LABELS = {
    google_analytics: 'Google Analytics', google_search_console: 'Search Console',
    google_ads: 'Google Ads', google_business: 'Google Business Profile',
    google_tag_manager: 'Google Tag Manager', gmail: 'Gmail', google_workspace: 'Google Workspace',
    facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', linkedin: 'LinkedIn',
    youtube: 'YouTube', whatsapp_business: 'WhatsApp Business',
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

  var AI_ASSISTANTS = [
    { id: 'website', label: 'Website AI', icon: '🌐' },
    { id: 'seo', label: 'SEO AI', icon: '🔍' },
    { id: 'analytics', label: 'Analytics AI', icon: '📊' },
    { id: 'search_console', label: 'Search Console AI', icon: '📈' },
    { id: 'google_business', label: 'Google Business AI', icon: '📍' },
    { id: 'google_ads', label: 'Google Ads AI', icon: '🎯' },
    { id: 'meta', label: 'Meta AI', icon: '👥' },
    { id: 'content', label: 'Content AI', icon: '✍️' },
    { id: 'campaign', label: 'Campaign AI', icon: '📣' },
    { id: 'reports', label: 'Reports AI', icon: '📋' },
    { id: 'competitors', label: 'Competitors AI', icon: '⚔️' },
    { id: 'manager', label: 'AI Manager', icon: '🤖' },
  ];

  var CAMPAIGN_CHANNELS = [
    { id: 'organic', label: 'קמפיין אורגני' },
    { id: 'google_ads', label: 'Google Ads' },
    { id: 'meta_ads', label: 'Meta Ads' },
    { id: 'youtube_ads', label: 'YouTube Ads' },
    { id: 'tiktok_ads', label: 'TikTok Ads' },
    { id: 'linkedin_ads', label: 'LinkedIn Ads' },
  ];

  var state = { customerId: null, customer: null, profile: null, bundle: null, wizardMode: 'existing' };

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

  function ensureHubToolbar() {
    var wrap = document.querySelector('#sc-mkt-hub .mkt-wrap');
    if (!wrap || wrap.querySelector('.mkt-hub-toolbar')) return;
    var tb = document.createElement('div');
    tb.className = 'mkt-hub-toolbar';
    tb.innerHTML = '<button type="button" class="btn btn-primary mkt-new-client-btn">+ לקוח שיווק חדש</button>';
    var list = $('mktHubList');
    if (list) wrap.insertBefore(tb, list);
    tb.querySelector('.mkt-new-client-btn')?.addEventListener('click', openWizard);
  }

  function renderHub() {
    ensureHubToolbar();
    var list = $('mktHubList');
    if (!list) return;
    list.innerHTML = '<p class="mkt-loading">טוען לקוחות מדליה…</p>';
    api().listMarketingCustomers().then(function (rows) {
      var cards = rows.map(function (c) {
        return '<button type="button" class="mkt-hub-card" data-id="' + esc(c.id) + '">' +
          '<div class="mkt-hub-title">' + esc(c.name) + '</div>' +
          '<div class="mkt-hub-sub">' + esc(c.contact_person || '') + ' · ' + esc(c.phone || '') + '</div>' +
          '<span class="mkt-sync-tag">מסונכרן מדליה · לקוח אחד</span></button>';
      }).join('');
      if (!rows.length) {
        cards = '<div class="mkt-empty"><p>אין עדיין לקוחות שיווק.</p><p class="fs11 text3">לחץ «לקוח שיווק חדש» או פתח לקוח בדליה עם סוג שירות שיווק.</p></div>';
      }
      list.innerHTML = cards;
      list.querySelectorAll('.mkt-hub-card').forEach(function (btn) {
        btn.addEventListener('click', function () { openClient(btn.dataset.id); });
      });
    }).catch(function () {
      list.innerHTML = '<div class="mkt-empty"><p>לא ניתן לטעון — התחבר דרך דליה (Super Admin)</p></div>';
    });
  }

  function closeWizard() {
    $('mktWizardOverlay')?.remove();
  }

  function wizardHtml() {
    return '<div class="mkt-wizard" role="dialog" aria-labelledby="mktWizardTitle">' +
      '<div class="mkt-wizard-hdr"><h3 id="mktWizardTitle">לקוח שיווק חדש</h3>' +
      '<button type="button" class="mkt-wizard-close" aria-label="סגור">×</button></div>' +
      '<p class="mkt-wizard-sub">לקוח אחד במערכת — דליה + שיווק ללא כפילות</p>' +
      '<div class="mkt-wizard-tabs">' +
      '<button type="button" class="mkt-wiz-tab is-active" data-mode="existing">לקוח קיים בדליה</button>' +
      '<button type="button" class="mkt-wiz-tab" data-mode="new">לקוח חדש</button></div>' +
      '<div class="mkt-wizard-panel" data-panel="existing">' +
      '<input class="srch mkt-wiz-search" placeholder="חיפוש לפי שם / איש קשר…" style="width:100%">' +
      '<div class="mkt-wiz-list mkt-loading">טוען…</div></div>' +
      '<div class="mkt-wizard-panel" data-panel="new" hidden>' +
      '<input class="srch mkt-wiz-name" placeholder="שם החברה *" style="width:100%;margin-bottom:8px">' +
      '<input class="srch mkt-wiz-contact" placeholder="איש קשר *" style="width:100%;margin-bottom:8px">' +
      '<input class="srch mkt-wiz-phone" placeholder="טלפון" style="width:100%;margin-bottom:8px">' +
      '<input class="srch mkt-wiz-email" placeholder="אימייל" style="width:100%;margin-bottom:8px">' +
      '<input class="srch mkt-wiz-biz" placeholder="ח.פ. / עוסק מורשה" style="width:100%">' +
      '</div>' +
      '<div class="mkt-wizard-actions">' +
      '<button type="button" class="btn btn-outline mkt-wiz-cancel">ביטול</button>' +
      '<button type="button" class="btn btn-primary mkt-wiz-submit" disabled>הפעל שיווק ופתח כרטיס</button>' +
      '</div></div>';
  }

  function openWizard() {
    closeWizard();
    var ov = document.createElement('div');
    ov.className = 'mkt-wizard-overlay';
    ov.id = 'mktWizardOverlay';
    ov.innerHTML = wizardHtml();
    document.body.appendChild(ov);
    bindWizard(ov);
    loadWizardExisting('');
  }

  function loadWizardExisting(q) {
    var list = document.querySelector('.mkt-wiz-list');
    if (!list) return;
    list.innerHTML = '<p class="fs12 text3">טוען…</p>';
    api().listAllCustomers(q).then(function (rows) {
      var eligible = rows.filter(function (c) { return !api().hasMarketingService(c.service_type); });
      if (!eligible.length) {
        list.innerHTML = '<p class="fs12 text3">לא נמצאו לקוחות ללא שיווק. נסה «לקוח חדש».</p>';
        return;
      }
      list.innerHTML = eligible.slice(0, 30).map(function (c) {
        return '<button type="button" class="mkt-wiz-pick" data-id="' + esc(c.id) + '">' +
          '<strong>' + esc(c.name) + '</strong><span>' + esc(c.contact_person || '') + '</span></button>';
      }).join('');
      list.querySelectorAll('.mkt-wiz-pick').forEach(function (btn) {
        btn.addEventListener('click', function () {
          list.querySelectorAll('.mkt-wiz-pick').forEach(function (b) { b.classList.remove('is-picked'); });
          btn.classList.add('is-picked');
          state.wizardPick = rows.find(function (c) { return c.id === btn.dataset.id; });
          document.querySelector('.mkt-wiz-submit')?.removeAttribute('disabled');
        });
      });
    });
  }

  function bindWizard(ov) {
    var submit = ov.querySelector('.mkt-wiz-submit');
    ov.querySelector('.mkt-wizard-close')?.addEventListener('click', closeWizard);
    ov.querySelector('.mkt-wiz-cancel')?.addEventListener('click', closeWizard);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeWizard(); });

    ov.querySelectorAll('.mkt-wiz-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        state.wizardMode = tab.dataset.mode;
        ov.querySelectorAll('.mkt-wiz-tab').forEach(function (t) { t.classList.toggle('is-active', t === tab); });
        ov.querySelector('[data-panel="existing"]').hidden = state.wizardMode !== 'existing';
        ov.querySelector('[data-panel="new"]').hidden = state.wizardMode !== 'new';
        state.wizardPick = null;
        submit?.setAttribute('disabled', '');
        if (state.wizardMode === 'new') submit?.removeAttribute('disabled');
      });
    });

    var searchTimer;
    ov.querySelector('.mkt-wiz-search')?.addEventListener('input', function (e) {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { loadWizardExisting(e.target.value); }, 300);
    });

    submit?.addEventListener('click', function () {
      submit.disabled = true;
      submit.textContent = 'מקים כרטיס…';
      var promise;
      if (state.wizardMode === 'new') {
        var name = ov.querySelector('.mkt-wiz-name')?.value?.trim();
        var contact = ov.querySelector('.mkt-wiz-contact')?.value?.trim();
        if (!name || !contact) {
          if (window.showToast) window.showToast('שם ואיש קשר חובה', 'warn');
          submit.disabled = false;
          submit.textContent = 'הפעל שיווק ופתח כרטיס';
          return;
        }
        promise = api().onboardMarketingCustomer({
          name: name,
          contact_person: contact,
          phone: ov.querySelector('.mkt-wiz-phone')?.value?.trim() || '',
          email: ov.querySelector('.mkt-wiz-email')?.value?.trim() || '',
          business_id: ov.querySelector('.mkt-wiz-biz')?.value?.trim() || '',
        }, true);
      } else {
        if (!state.wizardPick) return;
        promise = api().onboardMarketingCustomer(state.wizardPick, false);
      }
      promise.then(function (customer) {
        closeWizard();
        sessionStorage.removeItem('mkt-auto-goals-' + customer.id);
        if (window.showToast) window.showToast('כרטיס שיווק נוצר — לקוח אחד בדליה', 'success');
        renderHub();
        openClient(customer.id);
      }).catch(function (e) {
        if (window.showToast) window.showToast('שגיאה: ' + (e.message || e), 'error');
        submit.disabled = false;
        submit.textContent = 'הפעל שיווק ופתח כרטיס';
      });
    });
  }

  function openClient(id) {
    state.customerId = id;
    if (window.COCO) {
      window.COCO.flowContext = window.COCO.flowContext || {};
      window.COCO.flowContext.clientId = id;
    }
    if (window.CocoClaude && CocoClaude.setClientId) CocoClaude.setClientId(id);
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

  function ensureProviders(connections, keys) {
    return keys.map(function (key) {
      var ex = connections.find(function (c) { return c.provider === key; });
      return ex || { provider: key, status: 'disconnected', id: '' };
    });
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

      var ensureConn = bundle.connections.length ? Promise.resolve() : api().provisionClient(bundle.customer);

      return ensureConn.then(function () {
        return api().syncFromDalia(bundle.customer);
      }).then(function () {
        return loadBundle(customerId);
      }).then(function (fresh) {
        state.bundle = fresh;
        bundle = fresh;
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
    var theme = (p.theme_colors && typeof p.theme_colors === 'object') ? p.theme_colors : {};

    var html = '<div class="mkt-client-head">' +
      '<button type="button" class="btn btn-outline btn-sm mkt-back-hub">→ חזרה לרשימה</button>' +
      '<div><h2 class="mkt-client-title">' + esc(d.name) + '</h2>' +
      '<p class="mkt-client-sub">כרטיס שיווק · מקור אמת: דליה · סונכרן: ' + esc(syncTime) + '</p></div>' +
      '<span class="mkt-ssot-badge">SSOT</span></div>';

    html += '<div class="mkt-ssot-note">פרטי החברה נטענו אוטומטית מדליה — אין להזין שוב שם, כתובת, טלפון או איש קשר ראשי.</div>';

    html += section('פרטי חברה', renderCompanyBlock(d, p, theme), true);
    html += section('אנשי קשר', renderContacts(b), false);
    html += section('אתרים', renderSites(b), false);
    html += section('דומיינים', renderDomains(b), false);
    html += section('שירותי Google', renderProviderGrid(b, api().GOOGLE_PROVIDERS || []), false);
    html += section('רשתות חברתיות', renderProviderGrid(b, api().SOCIAL_PROVIDERS || []), false);
    html += section('APIs וחיבורים', renderApis(b), false);
    html += section('קמפיינים', renderCampaigns(b), false);
    html += section('עוזרי AI', renderAiAssistants(b), false);

    html += '<div class="mkt-footer-actions">' +
      '<button type="button" class="btn btn-primary btn-block mkt-goals-btn">המשך למודול המטרות →</button></div>';

    root.innerHTML = html;
    bindClientEvents(b);
    if (window.PrdDataGrid && window.PrdDataGrid.enhanceAll) window.PrdDataGrid.enhanceAll();
    if (window.CocoClaude && CocoClaude.bindClientFromDalia) CocoClaude.bindClientFromDalia(b);
  }

  function renderCompanyBlock(d, p, theme) {
    return '<h4 class="mkt-sub-hdr">פרטי החברה (מדליה)</h4>' +
      '<div class="mkt-readonly-grid">' +
      ro('שם החברה', d.name) + ro('מספר לקוח', d.customer_number) + ro('ח.פ.', d.business_id) +
      ro('תחום פעילות', d.activity_field) + ro('כתובת', d.address) + ro('טלפון', d.phone) +
      ro('אימייל', d.email) + ro('איש קשר ראשי', d.contact_person) +
      '</div>' +
      '<h4 class="mkt-sub-hdr">לוגו וצבעי חברה</h4>' +
      '<div class="mkt-editable-block">' +
      '<label class="fs11 fw7 text3">אתר ראשי</label>' +
      '<input class="srch mkt-website-inp" style="width:100%" value="' + esc(p.website || '') + '" placeholder="https://">' +
      '<label class="fs11 fw7 text3 mt-8">לוגו URL</label>' +
      '<input class="srch mkt-logo-inp" style="width:100%" value="' + esc(p.logo_url || '') + '" placeholder="קישור ללוגו">' +
      '<div class="mkt-color-row mt-8">' +
      '<label class="fs11 fw7 text3">צבע ראשי</label>' +
      '<input type="color" class="mkt-color-primary" value="' + esc(theme.primary || '#003366') + '">' +
      '<label class="fs11 fw7 text3">צבע משני</label>' +
      '<input type="color" class="mkt-color-secondary" value="' + esc(theme.secondary || '#1e40af') + '">' +
      '</div>' +
      (p.logo_url ? '<img class="mkt-logo-preview" src="' + esc(p.logo_url) + '" alt="לוגו" onerror="this.style.display=\'none\'">' : '') +
      '<button type="button" class="btn btn-primary btn-sm mt-8 mkt-save-profile">💾 שמור פרטי חברה</button></div>';
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
    var p = b.profile || {};
    var sites = b.sites.filter(function (s) { return s.site_type !== 'landing'; });
    var primaryUrl = p.website || '';
    var primary = sites.find(function (s) { return s.domain && primaryUrl && primaryUrl.indexOf(s.domain) >= 0; }) || sites[0];
    var html = '';
    if (primary) {
      html += '<div class="mkt-primary-card"><span class="mkt-primary-lbl">אתר ראשי</span>' +
        '<strong>' + esc(primary.name) + '</strong> · ' + esc(primary.domain || primary.site_url || '—') + '</div>';
    }
    html += '<h4 class="mkt-sub-hdr">אתרים נוספים</h4>';
    html += '<div class="tbl-wrap"><table><thead><tr><th>שם</th><th>דומיין</th><th>סטטוס</th></tr></thead><tbody>';
    sites.forEach(function (s) {
      if (primary && s.id === primary.id) return;
      html += '<tr><td>' + esc(s.name) + '</td><td>' + esc(s.domain || s.site_url) + '</td><td>' + esc(s.status) + '</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<h4 class="mkt-sub-hdr">פתיחת אתר חדש</h4>';
    html += '<div class="mkt-mini-form"><input class="srch mkt-site-name" placeholder="שם אתר"><input class="srch mkt-site-domain" placeholder="דומיין">' +
      '<label class="mkt-check"><input type="checkbox" class="mkt-site-primary"> הגדר כאתר ראשי</label>' +
      '<button type="button" class="btn btn-outline btn-sm mkt-add-site">+ הוסף אתר</button></div>';
    html += '<h4 class="mkt-sub-hdr">העברת אתר קיים לניהול</h4>';
    html += '<div class="mkt-mini-form"><input class="srch mkt-transfer-url" placeholder="URL אתר קיים" style="flex:2">' +
      '<button type="button" class="btn btn-outline btn-sm mkt-transfer-site">העבר לניהול</button></div>';
    return html;
  }

  function renderDomains(b) {
    var primary = b.domains.find(function (d) { return d.is_primary; });
    var html = '';
    if (primary) {
      html += '<div class="mkt-primary-card"><span class="mkt-primary-lbl">דומיין ראשי</span>' +
        '<strong>' + esc(primary.domain) + '</strong> · DNS: ' + esc(primary.dns_status) + ' · SSL: ' + esc(primary.ssl_status) + '</div>';
    }
    html += '<h4 class="mkt-sub-hdr">דומיינים נוספים</h4>';
    html += '<div class="tbl-wrap"><table><thead><tr><th>דומיין</th><th>ראשי</th><th>DNS</th><th>SSL</th></tr></thead><tbody>';
    b.domains.forEach(function (d) {
      if (primary && d.id === primary.id) return;
      html += '<tr><td>' + esc(d.domain) + '</td><td>' + (d.is_primary ? 'כן' : '') + '</td><td>' + esc(d.dns_status) + '</td><td>' + esc(d.ssl_status) + '</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<div class="mkt-mini-form"><input class="srch mkt-dom-inp" placeholder="דומיין">' +
      '<select class="srch mkt-dom-dns"><option value="pending">DNS: ממתין</option><option value="active">DNS: פעיל</option></select>' +
      '<select class="srch mkt-dom-ssl"><option value="pending">SSL: ממתין</option><option value="active">SSL: פעיל</option></select>' +
      '<label class="mkt-check"><input type="checkbox" class="mkt-dom-primary"> דומיין ראשי</label>' +
      '<button type="button" class="btn btn-outline btn-sm mkt-add-domain">+ הוסף דומיין</button></div>';
    return html;
  }

  function renderProviderGrid(b, keys) {
    var list = ensureProviders(b.connections, keys);
    var html = '<div class="mkt-conn-grid">';
    list.forEach(function (cn) {
      html += '<div class="mkt-conn-card"><span class="mkt-conn-name">' + esc(PROVIDER_LABELS[cn.provider] || cn.provider) + '</span>' +
        '<span class="mkt-conn-status ' + (cn.status === 'connected' ? 'on' : '') + '">' + (cn.status === 'connected' ? 'מחובר' : 'לא מחובר') + '</span>' +
        '<button type="button" class="btn btn-ghost btn-xs mkt-conn-btn" data-id="' + esc(cn.id || '') + '" data-provider="' + esc(cn.provider) + '">הגדר</button></div>';
    });
    html += '</div><p class="fs11 text3">חיבור חי — בשלב ב׳. התשתית והכפתורים מוכנים.</p>';
    return html;
  }

  function renderApis(b) {
    var html = '<div class="tbl-wrap"><table><thead><tr><th>סוג</th><th>תווית</th><th>ספק</th><th>ערך</th></tr></thead><tbody>';
    b.apiItems.forEach(function (it) {
      html += '<tr><td>' + esc(it.item_type) + '</td><td>' + esc(it.label) + '</td><td>' + esc(it.provider) + '</td><td>' + esc(it.value_mask || '••••') + '</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<div class="mkt-mini-form"><select class="srch mkt-api-type">' +
      '<option value="api_key">API Key</option><option value="oauth">OAuth</option>' +
      '<option value="access_token">Access Token</option><option value="pixel">Pixel</option>' +
      '<option value="campaign_id">Campaign ID</option><option value="webhook">Webhook</option></select>' +
      '<input class="srch mkt-api-label" placeholder="תווית"><input class="srch mkt-api-provider" placeholder="ספק">' +
      '<button type="button" class="btn btn-outline btn-sm mkt-add-api">+ הוסף</button></div>';
    return html;
  }

  function renderCampaigns(b) {
    var organic = b.campaigns.filter(function (c) { return (c.campaign_type || '').indexOf('organic') >= 0 || c.channel === 'organic'; });
    var paid = b.campaigns.filter(function (c) { return organic.indexOf(c) < 0; });
    function tableRows(rows) {
      return rows.map(function (cp) {
        return '<tr><td>' + esc(cp.name) + '</td><td>' + esc(cp.campaign_type) + '</td><td>' + esc(cp.channel) +
          '</td><td>' + esc(cp.budget) + '</td><td>' + esc(cp.status) + '</td></tr>';
      }).join('');
    }
    var html = '<h4 class="mkt-sub-hdr">קמפיינים אורגניים</h4>';
    html += '<div class="tbl-wrap"><table><thead><tr><th>שם</th><th>סוג</th><th>ערוץ</th><th>תקציב</th><th>סטטוס</th></tr></thead><tbody>' +
      (tableRows(organic) || '<tr><td colspan="5" class="text3">אין עדיין</td></tr>') + '</tbody></table></div>';
    html += '<h4 class="mkt-sub-hdr">קמפיינים ממומנים</h4>';
    html += '<div class="tbl-wrap"><table><thead><tr><th>שם</th><th>סוג</th><th>ערוץ</th><th>תקציב</th><th>סטטוס</th></tr></thead><tbody>' +
      (tableRows(paid) || '<tr><td colspan="5" class="text3">אין עדיין</td></tr>') + '</tbody></table></div>';
    html += '<div class="mkt-mini-form"><input class="srch mkt-camp-name" placeholder="שם קמפיין">' +
      '<select class="srch mkt-camp-type"><option value="organic">אורגני</option><option value="paid">ממומן</option></select>' +
      '<select class="srch mkt-camp-channel">' +
      CAMPAIGN_CHANNELS.map(function (ch) { return '<option value="' + ch.id + '">' + ch.label + '</option>'; }).join('') +
      '</select><button type="button" class="btn btn-outline btn-sm mkt-add-campaign">+ קמפיין</button></div>';
    return html;
  }

  function renderAiAssistants(b) {
    var ch = (b.ai && b.ai.checklist) || {};
    var html = '<p class="fs12 text3 mb-8">עוזרי AI — ממשק מוכן; נתונים חיים בשלב ב׳</p>';
    html += '<div class="mkt-ai-grid">';
    AI_ASSISTANTS.forEach(function (a) {
      html += '<button type="button" class="mkt-ai-btn" data-ai="' + esc(a.id) + '">' +
        '<span class="mkt-ai-ico">' + a.icon + '</span><span class="mkt-ai-lbl">' + esc(a.label) + '</span></button>';
    });
    html += '</div>';
    html += '<h4 class="mkt-sub-hdr mt-12">בדיקות AI Setup</h4><ul class="mkt-ai-list">';
    AI_CHECKS.forEach(function (item) {
      var st = ch[item.key] || 'pending';
      html += '<li><span class="mkt-ai-st ' + st + '"></span>' + esc(item.label) + ' — <em>' + (st === 'pending' ? 'ממתין' : st) + '</em></li>';
    });
    html += '</ul>';
    html += '<div class="mkt-ai-panel" id="mktAiPanel" hidden><div class="mkt-ai-panel-hdr"><strong id="mktAiPanelTitle"></strong>' +
      '<button type="button" class="mkt-ai-panel-close">×</button></div><p id="mktAiPanelBody" class="fs13"></p></div>';
    return html;
  }

  function bindClientEvents(b) {
    var cid = b.customer.id;
    var root = $('mktClientRoot');
    root?.querySelector('.mkt-back-hub')?.addEventListener('click', function () {
      if (typeof window.gotoSc === 'function') window.gotoSc('mkt-hub');
    });
    root?.querySelector('.mkt-save-profile')?.addEventListener('click', function () {
      api().updateProfile(cid, {
        website: root.querySelector('.mkt-website-inp')?.value || '',
        logo_url: root.querySelector('.mkt-logo-inp')?.value || '',
        theme_colors: {
          primary: root.querySelector('.mkt-color-primary')?.value || '#003366',
          secondary: root.querySelector('.mkt-color-secondary')?.value || '#1e40af',
        },
      }).then(function () {
        if (window.showToast) window.showToast('נשמר', 'success');
        renderClient(cid);
      });
    });
    root?.querySelector('.mkt-add-contact')?.addEventListener('click', function () {
      api().insertContact({
        customer_id: cid,
        full_name: root.querySelector('.mkt-ct-name')?.value || '',
        contact_role: root.querySelector('.mkt-ct-role')?.value || 'other',
        phone: root.querySelector('.mkt-ct-phone')?.value || '',
        email: root.querySelector('.mkt-ct-email')?.value || '',
      }).then(function () { renderClient(cid); });
    });
    root?.querySelector('.mkt-add-site')?.addEventListener('click', function () {
      var domain = root.querySelector('.mkt-site-domain')?.value || '';
      var asPrimary = !!root.querySelector('.mkt-site-primary')?.checked;
      api().insertSite({
        customer_id: cid,
        name: root.querySelector('.mkt-site-name')?.value || 'אתר',
        domain: domain,
        site_type: 'website',
        status: 'active',
      }).then(function () {
        if (asPrimary && domain) {
          return api().updateProfile(cid, { website: domain.indexOf('http') === 0 ? domain : 'https://' + domain });
        }
      }).then(function () { renderClient(cid); });
    });
    root?.querySelector('.mkt-transfer-site')?.addEventListener('click', function () {
      var url = root.querySelector('.mkt-transfer-url')?.value?.trim();
      if (!url) return;
      api().insertSite({
        customer_id: cid,
        name: 'אתר מועבר',
        site_url: url,
        site_type: 'website',
        status: 'pending_transfer',
        notes: 'הועבר לניהול שיווק',
      }).then(function () {
        if (window.showToast) window.showToast('אתר נרשם להעברה', 'success');
        renderClient(cid);
      });
    });
    root?.querySelector('.mkt-add-domain')?.addEventListener('click', function () {
      api().insertDomain({
        customer_id: cid,
        domain: root.querySelector('.mkt-dom-inp')?.value || '',
        is_primary: !!root.querySelector('.mkt-dom-primary')?.checked,
        dns_status: root.querySelector('.mkt-dom-dns')?.value || 'pending',
        ssl_status: root.querySelector('.mkt-dom-ssl')?.value || 'pending',
      }).then(function () { renderClient(cid); });
    });
    root?.querySelector('.mkt-add-campaign')?.addEventListener('click', function () {
      api().insertCampaign({
        customer_id: cid,
        name: root.querySelector('.mkt-camp-name')?.value || '',
        campaign_type: root.querySelector('.mkt-camp-type')?.value || '',
        channel: root.querySelector('.mkt-camp-channel')?.value || '',
        status: 'draft',
      }).then(function () { renderClient(cid); });
    });
    root?.querySelector('.mkt-add-api')?.addEventListener('click', function () {
      api().insertApiItem({
        customer_id: cid,
        item_type: root.querySelector('.mkt-api-type')?.value || 'api_key',
        label: root.querySelector('.mkt-api-label')?.value || '',
        provider: root.querySelector('.mkt-api-provider')?.value || '',
        value_mask: '••••',
      }).then(function () { renderClient(cid); });
    });
    root?.querySelector('.mkt-goals-btn')?.addEventListener('click', goToGoals);
    root?.querySelectorAll('.mkt-conn-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (window.showToast) window.showToast('חיבור ' + (PROVIDER_LABELS[btn.dataset.provider] || '') + ' — בשלב ב׳', 'warn');
      });
    });
    root?.querySelectorAll('.mkt-ai-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var a = AI_ASSISTANTS.find(function (x) { return x.id === btn.dataset.ai; });
        var panel = $('mktAiPanel');
        if (panel && a) {
          panel.hidden = false;
          $('mktAiPanelTitle').textContent = a.label;
          $('mktAiPanelBody').textContent = 'עוזר ' + a.label + ' מוכן. ניתוח חי וחיבור נתונים — בשלב ב׳ של הפרויקט.';
        }
      });
    });
    root?.querySelector('.mkt-ai-panel-close')?.addEventListener('click', function () {
      var panel = $('mktAiPanel');
      if (panel) panel.hidden = true;
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
    var key = 'mkt-auto-goals-' + state.customerId;
    if (p.setup_status === 'provisioned' && state.customerId && !sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1');
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

    ensureHubToolbar();
    if ($('mktHubList')) renderHub();
  }

  window.MarketingClient = { init: init, openClient: openClient, renderHub: renderHub, goToGoals: goToGoals, openWizard: openWizard };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
