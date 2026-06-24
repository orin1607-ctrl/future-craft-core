/**
 * Dalia CRM — Supabase-backed module (no demo KPIs)
 */
(function () {
  'use strict';

  var state = { customers: [], filtered: [], currentId: null, loading: true };

  var SERVICE_LABELS = {
    fleet_only: 'ניהול צי',
    marketing_only: 'ניהול שיווק',
    fleet_and_marketing: 'שיווק + צי',
  };

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function initial(name) {
    if (!name) return '?';
    return name.trim().charAt(0);
  }

  function serviceLabel(st) {
    return SERVICE_LABELS[st] || st || '—';
  }

  function statusBadge(status) {
    var s = (status || '').toLowerCase();
    if (s === 'active' || s === 'פעיל') return { cls: 'badge-green', text: '● פעיל' };
    if (s === 'inactive' || s === 'לא פעיל') return { cls: 'badge-gray', text: '○ לא פעיל' };
    return { cls: 'badge-blue', text: status || '—' };
  }

  function shortId(id) {
    if (!id) return '—';
    return id.length > 12 ? id.slice(0, 8) + '…' : id;
  }

  function showToast(msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:90px;right:20px;background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px 18px;font-size:13px;font-weight:600;color:var(--white);box-shadow:var(--shadow);z-index:9999;opacity:1;transform:translateY(0);max-width:280px;';
    setTimeout(function () { t.style.opacity = '0'; t.style.transform = 'translateY(20px)'; }, 3000);
  }

  function goScreen(id) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
    var el = document.getElementById(id);
    if (el) {
      el.classList.add('active');
      el.querySelector('.content')?.scrollTo(0, 0);
    }
  }

  function setTab(btn, tabId) {
    if (!btn) return;
    var tabs = btn.closest('.nav-tabs');
    if (!tabs) return;
    tabs.querySelectorAll('.nav-tab').forEach(function (t) { t.classList.remove('active'); });
    btn.classList.add('active');
    var screen = btn.closest('.screen');
    screen.querySelectorAll('[id^="tab-"]').forEach(function (t) { t.style.display = 'none'; });
    var target = document.getElementById(tabId);
    if (target) target.style.display = '';
  }

  function openModal(id) { document.getElementById(id)?.classList.add('open'); }
  function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

  function marketingUrl(customerId) {
    var base = window.DALIA_APP_BASE || '/future-craft-core/';
    if (!base.endsWith('/')) base += '/';
    return base + 'ai-marketing?customer=' + encodeURIComponent(customerId);
  }

  function openMarketing(customerId) {
    if (window.self !== window.top) {
      window.parent.postMessage({ type: 'dalia-coco-navigate', path: '/ai-marketing?customer=' + customerId }, '*');
      return;
    }
    location.href = marketingUrl(customerId);
  }

  function applyFilters() {
    var q = (document.getElementById('f-search')?.value || '').trim().toLowerCase();
    var st = document.getElementById('f-status')?.value || '';
    var svc = document.getElementById('f-service')?.value || '';
    state.filtered = state.customers.filter(function (c) {
      if (st && (c.status || '').toLowerCase() !== st) return false;
      if (svc && c.service_type !== svc) return false;
      if (!q) return true;
      var hay = [c.name, c.contact_person, c.phone, c.email, c.customer_number, c.id].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    renderAll();
  }

  function resetFilter() {
    ['f-status', 'f-service'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
    var s = document.getElementById('f-search');
    if (s) s.value = '';
    applyFilters();
    showToast('✓ סינון אופס');
  }

  function renderKpis() {
    var el = document.getElementById('crm-kpi-grid');
    if (!el) return;
    var all = state.filtered;
    var active = all.filter(function (c) { return (c.status || '').toLowerCase() === 'active'; }).length;
    var marketing = all.filter(function (c) {
      return c.service_type === 'marketing_only' || c.service_type === 'fleet_and_marketing';
    }).length;
    var cards = [
      { title: 'סה״כ לקוחות', val: all.length, sub: 'מ-Supabase', color: 'var(--accent2)' },
      { title: 'לקוחות פעילים', val: active, sub: 'סטטוס active', color: 'var(--green)' },
      { title: 'שירות שיווק', val: marketing, sub: 'marketing / hybrid', color: 'var(--cyan)' },
      { title: 'משימות CRM', val: '—', sub: 'ממתין לחיבור', color: 'var(--white50)', pending: true },
      { title: 'לידים חדשים', val: '—', sub: 'ממתין לחיבור', color: 'var(--white50)', pending: true },
      { title: 'אחוז סגירה', val: '—', sub: 'ממתין לחיבור', color: 'var(--white50)', pending: true },
      { title: 'הכנסה', val: '—', sub: 'ממתין לחיבור', color: 'var(--white50)', pending: true },
      { title: 'AI תובנות', val: '○', sub: 'מושהה — שלב א׳', color: 'var(--yellow)', pending: true },
    ];
    el.innerHTML = '<div class="grid grid-4" style="gap:10px;">' + cards.map(function (k) {
      return '<div class="card" style="padding:12px 14px;"><div class="card-title">' + esc(k.title) + '</div>' +
        '<div class="card-value' + (k.pending ? ' crm-pending-kpi' : '') + '" style="font-size:22px;color:' + k.color + ';">' + esc(String(k.val)) + '</div>' +
        '<div class="card-delta" style="color:var(--white50)">' + esc(k.sub) + '</div></div>';
    }).join('') + '</div>';
  }

  function renderClientsTable() {
    var tbody = document.getElementById('crm-clients-tbody');
    var empty = document.getElementById('crm-empty-msg');
    if (!tbody) return;
    if (!state.filtered.length) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';
    tbody.innerHTML = state.filtered.map(function (c) {
      var badge = statusBadge(c.status);
      var colors = ['rgba(37,99,235,0.2)', 'rgba(6,182,212,0.2)', 'rgba(139,92,246,0.2)', 'rgba(34,197,94,0.2)'];
      var fg = ['var(--accent2)', 'var(--cyan)', 'var(--purple)', 'var(--green)'];
      var i = Math.abs((c.name || '').charCodeAt(0) || 0) % 4;
      return '<tr class="crm-row" data-id="' + esc(c.id) + '" style="cursor:pointer;">' +
        '<td><div class="avatar" style="background:' + colors[i] + ';color:' + fg[i] + ';">' + esc(initial(c.name)) + '</div></td>' +
        '<td><div style="font-weight:700;">' + esc(c.name) + '</div><div style="font-size:11px;color:var(--white50);">' +
        esc(c.customer_number || '—') + ' · ' + esc(c.activity_field || '—') + '</div></td>' +
        '<td><div style="font-size:12px;">' + esc(c.contact_person || '—') + '</div><div style="font-size:11px;color:var(--white50);">' + esc(c.phone || '—') + '</div></td>' +
        '<td><span class="badge badge-blue" style="font-size:10px;">' + esc(serviceLabel(c.service_type)) + '</span></td>' +
        '<td><code style="background:var(--bg4);padding:2px 7px;border-radius:5px;font-size:11px;" title="' + esc(c.id) + '">' + esc(shortId(c.id)) + '</code></td>' +
        '<td><span class="badge ' + badge.cls + '">' + esc(badge.text) + '</span></td>' +
        '<td><button class="btn btn-ghost" style="font-size:11px;padding:3px 9px;" type="button" data-open="' + esc(c.id) + '">פתח ←</button></td></tr>';
    }).join('');
    tbody.querySelectorAll('tr.crm-row').forEach(function (row) {
      row.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        openClient(row.getAttribute('data-id'));
      });
    });
    tbody.querySelectorAll('button[data-open]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        openClient(btn.getAttribute('data-open'));
      });
    });
  }

  function renderLeads() {
    var el = document.getElementById('crm-leads-list');
    if (!el) return;
    el.innerHTML = '<div class="alert alert-info">🔔 לידים — ממתין לחיבור מקורות הגעה (Google Ads, טפסים וכו׳). לקוחות קיימים מוצגים בלשונית לקוחות.</div>';
  }

  function renderPipeline() {
    var el = document.getElementById('crm-pipeline-board');
    if (!el) return;
    var cols = [
      { title: '🔔 ליד חדש', items: [] },
      { title: '📞 בטיפול', items: state.filtered.filter(function (c) { return (c.status || '').toLowerCase() !== 'active'; }) },
      { title: '✅ לקוח פעיל', items: state.filtered.filter(function (c) { return (c.status || '').toLowerCase() === 'active'; }) },
    ];
    el.innerHTML = '<div class="kanban">' + cols.map(function (col) {
      return '<div class="kanban-col"><div class="kanban-col-title"><span>' + col.title + '</span><span class="badge badge-blue">' + col.items.length + '</span></div>' +
        (col.items.length ? col.items.map(function (c) {
          return '<div class="kanban-card" data-id="' + esc(c.id) + '"><div style="font-size:12px;font-weight:700;">' + esc(c.name) + '</div>' +
            '<div style="font-size:11px;color:var(--white50);">' + esc(c.contact_person || c.phone || '—') + '</div></div>';
        }).join('') : '<div style="font-size:11px;color:var(--white50);padding:8px;">אין פריטים</div>') + '</div>';
    }).join('') + '</div>';
    el.querySelectorAll('.kanban-card[data-id]').forEach(function (card) {
      card.addEventListener('click', function () { openClient(card.getAttribute('data-id')); });
    });
  }

  function renderTasks() {
    var el = document.getElementById('crm-tasks-list');
    if (!el) return;
    el.innerHTML = '<div class="alert alert-info">📋 משימות CRM — ממתין לחיבור Supabase (טבלת משימות). ניתן לנהל משימות צי בדליה → משימות.</div>' +
      '<a class="btn btn-ghost" style="margin-top:12px;font-size:12px;display:inline-flex;" href="' + esc((window.DALIA_APP_BASE || '/') + 'vehicle-tasks') + '" target="_top">↗ משימות צי בדליה</a>';
  }

  function renderReports() {
    var el = document.getElementById('crm-reports-panel');
    if (!el) return;
    var n = state.filtered.length;
    var active = state.filtered.filter(function (c) { return (c.status || '').toLowerCase() === 'active'; }).length;
    el.innerHTML = '<div class="grid grid-2" style="gap:12px;margin-bottom:16px;">' +
      '<div class="card"><div class="card-title">לקוחות לפי שירות</div><div class="progress-wrap" style="margin-top:10px;">' +
      ['fleet_only', 'marketing_only', 'fleet_and_marketing'].map(function (k) {
        var cnt = state.filtered.filter(function (c) { return c.service_type === k; }).length;
        var pct = n ? Math.round((cnt / n) * 100) : 0;
        return '<div class="progress-item"><div class="progress-label"><span class="name">' + esc(serviceLabel(k)) + '</span><span class="pct">' + pct + '% · ' + cnt + '</span></div>' +
          '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%;background:var(--accent2)"></div></div></div>';
      }).join('') + '</div></div>' +
      '<div class="card"><div class="card-title">סיכום</div><div class="report-box" style="margin-top:10px;border:none;background:transparent;padding:0;">' +
      '<div class="report-row"><span class="rl">סה״כ לקוחות</span><span class="rv">' + n + '</span></div>' +
      '<div class="report-row"><span class="rl">פעילים</span><span class="rv" style="color:var(--green)">' + active + '</span></div>' +
      '<div class="report-row"><span class="rl">מקור נתונים</span><span class="rv">Supabase · customers</span></div>' +
      '<div class="report-row"><span class="rl">דוחות מתקדמים</span><span class="rv" style="color:var(--yellow)">ממתין לחיבור</span></div>' +
      '</div></div></div>';
  }

  function renderAiPanel() {
    var el = document.getElementById('crm-ai-panel');
    if (!el) return;
    el.innerHTML = '<div class="ai-box"><div class="ai-box-header"><div class="ai-pulse"></div>🧠 AI CRM</div>' +
      '<div class="ai-box-text">מנועי AI מושהים עד אישור שלב א׳. לאחר האישור — תובנות לפי Client ID מ-Supabase.</div></div>' +
      '<div style="margin-top:16px;" class="alert alert-warn">○ עוזר SEO · ○ Google Analytics · ○ Google Ads · ○ CRM — ממתין לחיבור</div>';
  }

  function renderAiDaily() {
    var el = document.getElementById('crm-ai-daily');
    if (!el) return;
    var pending = state.filtered.filter(function (c) { return (c.status || '').toLowerCase() !== 'active'; }).slice(0, 3);
    var text = pending.length
      ? pending.map(function (c, i) { return (i + 1) + '. ' + c.name + ' — ' + (c.contact_person || c.phone || 'ללא איש קשר'); }).join(' · ')
      : 'כל הלקוחות הפעילים מסונכרנים. אין לידים ממתינים בנתונים הנוכחיים.';
    el.innerHTML = '<div class="ai-box"><div class="ai-box-header"><div class="ai-pulse"></div>🧠 סיכום CRM</div>' +
      '<div class="ai-box-text">' + esc(text) + '</div></div>';
  }

  function updateCounts() {
    var n = state.filtered.length;
    var leads = document.getElementById('crm-count-leads');
    var clients = document.getElementById('crm-count-clients');
    if (clients) clients.textContent = String(n);
    if (leads) leads.textContent = '—';
  }

  function renderAll() {
    renderKpis();
    renderAiDaily();
    renderClientsTable();
    renderLeads();
    renderPipeline();
    renderTasks();
    renderReports();
    renderAiPanel();
    updateCounts();
  }

  function openClient(id) {
    var c = state.customers.find(function (x) { return x.id === id; });
    if (!c) { showToast('לקוח לא נמצא'); return; }
    state.currentId = id;
    document.getElementById('cc-breadcrumb').textContent = c.name;
    var mBtn = document.getElementById('cc-btn-marketing');
    if (mBtn) {
      mBtn.onclick = function () { openMarketing(c.id); };
    }
    var badge = statusBadge(c.status);
    document.getElementById('cc-content').innerHTML =
      '<div id="tab-cc-info"><div class="page-header">' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">' +
      '<div class="avatar" style="width:48px;height:48px;font-size:22px;background:rgba(37,99,235,0.2);color:var(--accent2);">' + esc(initial(c.name)) + '</div>' +
      '<div><div class="page-title" style="font-size:18px;">' + esc(c.name) + '</div>' +
      '<div class="page-subtitle">' + esc(c.customer_number || '—') + ' · ' + esc(c.activity_field || '—') + '</div></div></div>' +
      '<span class="badge ' + badge.cls + '">' + esc(badge.text) + '</span> ' +
      '<span class="badge badge-blue">' + esc(serviceLabel(c.service_type)) + '</span>' +
      '<hr class="page-rule"></div>' +
      '<div class="section"><div class="grid grid-2" style="gap:12px;">' +
      '<div class="card"><div class="sec-title">פרטי התקשרות</div>' +
      '<div style="font-size:13px;display:flex;flex-direction:column;gap:8px;">' +
      '<div style="display:flex;justify-content:space-between;"><span style="color:var(--white50)">איש קשר</span><strong>' + esc(c.contact_person || '—') + '</strong></div>' +
      '<div style="display:flex;justify-content:space-between;"><span style="color:var(--white50)">טלפון</span><strong style="color:var(--accent2)">' + esc(c.phone || '—') + '</strong></div>' +
      '<div style="display:flex;justify-content:space-between;"><span style="color:var(--white50)">אימייל</span><strong>' + esc(c.email || '—') + '</strong></div>' +
      '<div style="display:flex;justify-content:space-between;"><span style="color:var(--white50)">כתובת</span><strong>' + esc(c.address || '—') + '</strong></div>' +
      '</div></div>' +
      '<div class="card"><div class="sec-title">Client ID · Supabase</div>' +
      '<div style="font-size:13px;display:flex;flex-direction:column;gap:8px;">' +
      '<div style="display:flex;justify-content:space-between;"><span style="color:var(--white50)">UUID</span><code style="background:var(--bg4);padding:2px 7px;border-radius:5px;font-size:11px;">' + esc(c.id) + '</code></div>' +
      '<div style="display:flex;justify-content:space-between;"><span style="color:var(--white50)">מספר לקוח</span><strong>' + esc(c.customer_number || '—') + '</strong></div>' +
      '<div style="display:flex;justify-content:space-between;"><span style="color:var(--white50)">ח.פ / עוסק</span><strong>' + esc(c.business_id || '—') + '</strong></div>' +
      '<div style="display:flex;justify-content:space-between;"><span style="color:var(--white50)">שירות</span><strong>' + esc(serviceLabel(c.service_type)) + '</strong></div>' +
      '</div><button type="button" class="btn btn-primary" style="margin-top:12px;font-size:12px;" id="cc-open-marketing">📊 פתח ניהול שיווק</button></div>' +
      '</div>' + (c.notes ? '<div class="card" style="margin-top:12px;font-size:13px;color:var(--white80)">' + esc(c.notes) + '</div>' : '') + '</div></div>' +
      '<div id="tab-cc-tasks" style="display:none;"><div class="section"><div class="alert alert-info">משימות — ממתין לחיבור Supabase</div></div></div>' +
      '<div id="tab-cc-history" style="display:none;"><div class="section"><div class="sec-title">היסטוריה · Audit</div><div class="timeline">' +
      '<div class="tl-item"><div class="tl-dot-wrap"><div class="tl-dot" style="background:var(--green)"></div><div class="tl-line"></div></div>' +
      '<div class="tl-content"><div class="tl-title">רשומת לקוח ב-Supabase</div><div class="tl-time">' + esc(c.created_at || '—') + '</div></div></div>' +
      '<div class="tl-item"><div class="tl-dot-wrap"><div class="tl-dot" style="background:var(--accent2)"></div></div>' +
      '<div class="tl-content"><div class="tl-title">סנכרון CRM ↔ דליה</div><div class="tl-time">Client ID: ' + esc(c.id) + '</div></div></div></div></div></div>' +
      '<div id="tab-cc-marketing" style="display:none;"><div class="section"><div class="ai-box"><div class="ai-box-header"><div class="ai-pulse"></div>שיווק · ' + esc(c.name) + '</div>' +
      '<div class="ai-box-text">פתח את מודול ניהול השיווק ללקוח זה — KPIs מ-dashboard.json (dalia-c.com) לפי Client ID.</div></div>' +
      '<button type="button" class="btn btn-primary" style="margin-top:12px;" id="cc-marketing-tab-btn">📊 ניהול שיווק CO.CO</button></div></div>' +
      '<div id="tab-cc-ai" style="display:none;"><div class="section"><div class="alert alert-warn">AI אישי — מושהה עד אישור שלב א׳</div></div></div>';

    document.getElementById('cc-open-marketing')?.addEventListener('click', function () { openMarketing(c.id); });
    document.getElementById('cc-marketing-tab-btn')?.addEventListener('click', function () { openMarketing(c.id); });
    document.querySelectorAll('#cc-content [id^="tab-cc-"]').forEach(function (t, i) { t.style.display = i === 0 ? '' : 'none'; });
    goScreen('screen-client');
  }

  function loadCustomers() {
    var chip = document.getElementById('crm-sync-chip');
    if (chip) chip.textContent = 'טוען מ-Supabase…';
    var api = window.MarketingApi;
    if (!api || !api.listAllCustomers) {
      if (chip) chip.textContent = '⚠️ API לא זמין';
      state.loading = false;
      return Promise.resolve();
    }
    return api.listAllCustomers().then(function (rows) {
      state.customers = rows || [];
      state.filtered = state.customers.slice();
      state.loading = false;
      if (chip) {
        chip.textContent = api.canRemote && api.canRemote()
          ? '🟢 Supabase · ' + state.customers.length + ' לקוחות'
          : '🟠 מקומי · ' + state.customers.length + ' לקוחות';
      }
      applyFilters();
    }).catch(function (e) {
      if (chip) chip.textContent = '🔴 שגיאת טעינה';
      console.warn('CRM load:', e);
      showToast('שגיאה בטעינת לקוחות');
    });
  }

  function submitNewLead(ev) {
    ev.preventDefault();
    var form = ev.target;
    var fd = new FormData(form);
    var payload = {
      name: fd.get('name'),
      contact_person: fd.get('contact_person') || '',
      phone: fd.get('phone') || '',
      email: fd.get('email') || '',
      notes: fd.get('notes') || '',
      service_type: fd.get('service_type') || 'marketing_only',
      status: 'active',
      customer_type: 'business',
    };
    if (!window.MarketingApi?.createCustomer) {
      showToast('⚠️ לא מחובר ל-Supabase');
      return false;
    }
    window.MarketingApi.createCustomer(payload).then(function () {
      closeModal('modal-new-lead');
      form.reset();
      showToast('✅ לקוח נוצר');
      return loadCustomers();
    }).catch(function () { showToast('שגיאה ביצירת לקוח'); });
    return false;
  }

  function bindTabs() {
    document.querySelectorAll('#crm-main-tabs .nav-tab, #crm-client-tabs .nav-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        setTab(tab, tab.getAttribute('data-tab'));
      });
    });
    ['f-search', 'f-status', 'f-service'].forEach(function (id) {
      document.getElementById(id)?.addEventListener('input', applyFilters);
      document.getElementById(id)?.addEventListener('change', applyFilters);
    });
    document.querySelectorAll('.overlay').forEach(function (o) {
      o.addEventListener('click', function (e) { if (e.target === o) o.classList.remove('open'); });
    });
  }

  function init() {
    bindTabs();
    loadCustomers().then(function () {
      var params = new URLSearchParams(location.search);
      var cid = params.get('customer');
      if (cid) openCustomerById(cid);
    });
  }

  function onAuth() {
    loadCustomers();
  }

  function openCustomerById(id) {
    if (!state.customers.length) {
      loadCustomers().then(function () { openClient(id); });
    } else {
      openClient(id);
    }
  }

  window.DaliaCrm = {
    init: init,
    onAuth: onAuth,
    goScreen: goScreen,
    setTab: setTab,
    openModal: openModal,
    closeModal: closeModal,
    showToast: showToast,
    resetFilter: resetFilter,
    openClient: openClient,
    openCustomerById: openCustomerById,
    submitNewLead: submitNewLead,
    loadCustomers: loadCustomers,
  };
})();
