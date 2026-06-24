/**
 * Dalia CRM — full module (Supabase: customers, crm_leads, crm_tasks, crm_activity_log)
 */
(function () {
  'use strict';

  var state = {
    customers: [], leads: [], tasks: [], activity: [], kpis: {},
    filtered: [], currentId: null, loading: true,
  };

  var SERVICE_LABELS = {
    fleet_only: 'ניהול צי', marketing_only: 'ניהול שיווק', fleet_and_marketing: 'שיווק + צי', undecided: 'לא הוחלט',
  };

  var PIPELINE = [
    { key: 'new_lead', title: '🔔 ליד חדש' },
    { key: 'in_progress', title: '📞 בטיפול' },
    { key: 'quote', title: '📄 הצעת מחיר' },
    { key: 'active', title: '✅ לקוח פעיל' },
    { key: 'closed_lost', title: '❌ נסגר' },
  ];

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function initial(name) { return (name || '?').trim().charAt(0); }
  function serviceLabel(st) { return SERVICE_LABELS[st] || st || '—'; }
  function srcLabel(k) { return (window.CrmApi && CrmApi.SOURCE_LABELS[k]) || k || '—'; }
  function leadStatusLabel(k) { return (window.CrmApi && CrmApi.STATUS_LABELS[k]) || k || '—'; }

  function statusBadge(status) {
    var s = (status || '').toLowerCase();
    if (s === 'active' || s === 'פעיל') return { cls: 'badge-green', text: '● פעיל' };
    if (s === 'inactive') return { cls: 'badge-gray', text: '○ לא פעיל' };
    return { cls: 'badge-blue', text: status || '—' };
  }

  function leadBadge(st) {
    var map = {
      new_lead: 'badge-blue', in_progress: 'badge-yellow', quote: 'badge-purple',
      active: 'badge-green', closed_won: 'badge-green', closed_lost: 'badge-gray', on_hold: 'badge-yellow',
    };
    return map[st] || 'badge-gray';
  }

  function stars(n) { n = n || 2; return '⭐'.repeat(Math.min(3, Math.max(1, n))); }
  function shortId(id) { return !id ? '—' : (id.length > 12 ? id.slice(0, 8) + '…' : id); }

  function showToast(msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:90px;right:20px;background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px 18px;font-size:13px;font-weight:600;color:var(--white);z-index:9999;opacity:1;max-width:280px;';
    setTimeout(function () { t.style.opacity = '0'; }, 3000);
  }

  function goScreen(id) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
    var el = document.getElementById(id);
    if (el) { el.classList.add('active'); el.querySelector('.content')?.scrollTo(0, 0); }
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

  function marketingUrl(id) {
    var base = window.DALIA_APP_BASE || '/future-craft-core/';
    if (!base.endsWith('/')) base += '/';
    return base + 'ai-marketing?customer=' + encodeURIComponent(id);
  }

  function openMarketing(id) {
    if (window.COCO_MARKETING_CRM) {
      if (window.CocoData && CocoData.selectCustomer) CocoData.selectCustomer(id);
      if (typeof goScreen === 'function') goScreen('screen-hub');
      if (typeof showToast === 'function') showToast('🏢 לקוח פעיל בכל המודולים');
      return;
    }
    if (window.self !== window.top) {
      window.parent.postMessage({ type: 'dalia-coco-navigate', path: '/ai-marketing?customer=' + id }, '*');
      return;
    }
    location.href = marketingUrl(id);
  }

  function logAct(row) {
    if (!window.CrmApi) return Promise.resolve();
    return CrmApi.logActivity(row).then(function () { return loadActivity(); });
  }

  function applyFilters() {
    var q = (document.getElementById('f-search')?.value || '').trim().toLowerCase();
    var st = document.getElementById('f-status')?.value || '';
    var svc = document.getElementById('f-service')?.value || '';
    state.filtered = state.customers.filter(function (c) {
      if (st && (c.status || '').toLowerCase() !== st) return false;
      if (svc && c.service_type !== svc) return false;
      if (!q) return true;
      return [c.name, c.contact_person, c.phone, c.email, c.customer_number, c.id].join(' ').toLowerCase().indexOf(q) >= 0;
    });
    renderAll();
  }

  function resetFilter() {
    ['f-status', 'f-service'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
    var s = document.getElementById('f-search'); if (s) s.value = '';
    applyFilters();
    showToast('✓ סינון אופס');
  }

  function renderKpis() {
    var el = document.getElementById('crm-kpi-grid');
    var k = state.kpis || {};
    if (!el) return;
    var cards = [
      { title: 'לקוחות פעילים', val: k.activeCustomers, sub: 'מ-Supabase', color: 'var(--green)' },
      { title: 'לידים חדשים', val: k.newLeads, sub: 'crm_leads', color: 'var(--accent2)' },
      { title: 'בטיפול', val: k.inProgress, sub: 'Pipeline', color: 'var(--yellow)' },
      { title: 'אחוז סגירה', val: (k.closeRate || 0) + '%', sub: 'לידים→לקוח', color: 'var(--green)' },
      { title: 'משימות פתוחות', val: k.openTasks, sub: (k.urgentTasks || 0) + ' דחופות', color: 'var(--yellow)' },
      { title: 'סה״כ לקוחות', val: k.totalCustomers, sub: 'customers', color: 'var(--white)' },
      { title: 'ציון ליד ממוצע', val: '⭐ ' + (k.avgScore || '—'), sub: '1–3', color: 'var(--cyan)' },
      { title: 'AI CRM', val: '○', sub: 'תשתית — שלב ב׳', color: 'var(--yellow)' },
    ];
    el.innerHTML = '<div class="grid grid-4" style="gap:10px;">' + cards.map(function (c) {
      return '<div class="card" style="padding:12px 14px;"><div class="card-title">' + esc(c.title) + '</div>' +
        '<div class="card-value" style="font-size:22px;color:' + c.color + ';">' + esc(String(c.val)) + '</div>' +
        '<div class="card-delta" style="color:var(--white50)">' + esc(c.sub) + '</div></div>';
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
      return '<tr class="crm-row" data-id="' + esc(c.id) + '" style="cursor:pointer;">' +
        '<td><div class="avatar" style="background:rgba(37,99,235,0.2);color:var(--accent2);">' + esc(initial(c.name)) + '</div></td>' +
        '<td><div style="font-weight:700;">' + esc(c.name) + '</div><div style="font-size:11px;color:var(--white50);">' + esc(c.customer_number || '—') + '</div></td>' +
        '<td><div style="font-size:12px;">' + esc(c.contact_person || '—') + '</div><div style="font-size:11px;color:var(--white50);">' + esc(c.phone || '—') + '</div></td>' +
        '<td><span class="badge badge-blue" style="font-size:10px;">' + esc(serviceLabel(c.service_type)) + '</span></td>' +
        '<td><code style="font-size:11px;" title="' + esc(c.id) + '">' + esc(shortId(c.id)) + '</code></td>' +
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
      btn.addEventListener('click', function (e) { e.stopPropagation(); openClient(btn.getAttribute('data-open')); });
    });
  }

  function renderLeads() {
    var el = document.getElementById('crm-leads-list');
    if (!el) return;
    if (!state.leads.length) {
      el.innerHTML = '<div class="alert alert-info">אין לידים · לחץ + ליד חדש</div>';
      return;
    }
    el.innerHTML = state.leads.map(function (l) {
      var hot = l.score >= 3;
      return '<div class="card" style="cursor:pointer;margin-bottom:12px;' + (hot ? 'border-color:rgba(239,68,68,0.4);' : '') + '" data-lead="' + esc(l.id) + '">' +
        '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px;">' +
        '<div><div style="font-weight:700;">' + esc(l.company_name || l.contact_name) + '</div>' +
        '<div style="font-size:12px;color:var(--white50);">' + esc(l.phone) + ' · ' + esc(l.email || '') + '</div></div>' +
        '<div>' + stars(l.score) + ' <span class="badge ' + leadBadge(l.status) + '">' + esc(leadStatusLabel(l.status)) + '</span></div></div>' +
        '<div style="font-size:12px;color:var(--white50);">' + esc(srcLabel(l.source)) + ' · ' + esc(l.campaign || '—') + '</div>' +
        '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">' +
        (l.customer_id ? '<button type="button" class="btn btn-ghost" style="font-size:11px;" data-open-c="' + esc(l.customer_id) + '">📋 לקוח</button>' : '') +
        '<button type="button" class="btn btn-primary" style="font-size:11px;" data-task-lead="' + esc(l.id) + '">+ משימה</button></div></div>';
    }).join('');
    el.querySelectorAll('[data-open-c]').forEach(function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); openClient(b.getAttribute('data-open-c')); });
    });
    el.querySelectorAll('[data-task-lead]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        state.currentLeadId = b.getAttribute('data-task-lead');
        openModal('modal-new-task');
      });
    });
    el.querySelectorAll('[data-lead]').forEach(function (card) {
      card.addEventListener('click', function () { openLead(card.getAttribute('data-lead')); });
    });
  }

  function renderPipeline() {
    var el = document.getElementById('crm-pipeline-board');
    if (!el) return;
    el.innerHTML = '<div class="kanban">' + PIPELINE.map(function (col) {
      var items = state.leads.filter(function (l) {
        if (col.key === 'closed_lost') return l.status === 'closed_lost' || l.status === 'closed_won';
        return l.status === col.key;
      });
      return '<div class="kanban-col"><div class="kanban-col-title"><span>' + col.title + '</span><span class="badge badge-blue">' + items.length + '</span></div>' +
        (items.length ? items.map(function (l) {
          return '<div class="kanban-card" data-lead="' + esc(l.id) + '"><div style="font-size:12px;font-weight:700;">' + esc(l.company_name || l.contact_name) + '</div>' +
            '<div style="font-size:11px;color:var(--white50);">' + stars(l.score) + '</div></div>';
        }).join('') : '<div style="font-size:11px;color:var(--white50);padding:8px;">—</div>') + '</div>';
    }).join('') + '</div>';
    el.querySelectorAll('.kanban-card[data-lead]').forEach(function (c) {
      c.addEventListener('click', function () { openLead(c.getAttribute('data-lead')); });
    });
  }

  function renderTasks() {
    var el = document.getElementById('crm-tasks-list');
    if (!el) return;
    if (!state.tasks.length) {
      el.innerHTML = '<div class="alert alert-info">אין משימות · + משימה</div>';
      return;
    }
    el.innerHTML = state.tasks.map(function (t) {
      var done = t.status === 'done';
      var pri = t.priority === 'urgent' ? 'badge-red' : t.priority === 'high' ? 'badge-yellow' : 'badge-blue';
      return '<div class="card" style="display:flex;align-items:flex-start;gap:12px;margin-bottom:8px;' + (done ? 'opacity:0.6;' : '') + '">' +
        '<div style="width:18px;height:18px;border-radius:50%;border:2px solid var(--accent2);flex-shrink:0;margin-top:2px;cursor:pointer;" data-done="' + esc(t.id) + '"></div>' +
        '<div style="flex:1;"><div style="font-size:13px;font-weight:700;' + (done ? 'text-decoration:line-through;' : '') + '">' + esc(t.title) + '</div>' +
        '<div style="font-size:11px;color:var(--white50);">' + esc(t.due_at ? t.due_at.slice(0, 16).replace('T', ' ') : '—') + ' · ' + esc(t.assigned_to || '—') + '</div>' +
        (t.ai_hint ? '<div style="font-size:11px;margin-top:4px;padding:6px;background:var(--bg4);border-radius:6px;">💡 ' + esc(t.ai_hint) + '</div>' : '') +
        '</div><span class="badge ' + pri + '">' + esc(t.priority) + '</span></div>';
    }).join('');
    el.querySelectorAll('[data-done]').forEach(function (d) {
      d.addEventListener('click', function () { completeTask(d.getAttribute('data-done')); });
    });
  }

  function renderReports() {
    var el = document.getElementById('crm-reports-panel');
    var k = state.kpis || {};
    if (!el) return;
    var srcRows = Object.keys(k.sources || {}).map(function (key) {
      var cnt = k.sources[key];
      var pct = k.totalLeads ? Math.round((cnt / k.totalLeads) * 100) : 0;
      return '<div class="progress-item"><div class="progress-label"><span class="name">' + esc(srcLabel(key)) + '</span><span class="pct">' + pct + '% · ' + cnt + '</span></div>' +
        '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%;background:var(--accent2)"></div></div></div>';
    }).join('');
    el.innerHTML = '<div class="grid grid-2" style="gap:12px;">' +
      '<div class="card"><div class="card-title">לידים לפי מקור</div><div class="progress-wrap" style="margin-top:10px;">' + (srcRows || '<div class="alert alert-info">אין לידים</div>') + '</div></div>' +
      '<div class="card"><div class="report-box"><div class="report-title">📋 סיכום CRM</div>' +
      '<div class="report-row"><span class="rl">לידים</span><span class="rv">' + (k.totalLeads || 0) + '</span></div>' +
      '<div class="report-row"><span class="rl">לקוחות פעילים</span><span class="rv" style="color:var(--green)">' + (k.activeCustomers || 0) + '</span></div>' +
      '<div class="report-row"><span class="rl">אחוז סגירה</span><span class="rv">' + (k.closeRate || 0) + '%</span></div>' +
      '<div class="report-row"><span class="rl">משימות פתוחות</span><span class="rv">' + (k.openTasks || 0) + '</span></div>' +
      '<div class="report-row"><span class="rl">מקור נתונים</span><span class="rv">Supabase</span></div></div></div></div>';
  }

  function renderAiPanel() {
    var el = document.getElementById('crm-ai-panel');
    if (!el) return;
    el.innerHTML = '<div class="ai-box"><div class="ai-box-header"><div class="ai-pulse"></div>🧠 AI CRM — תשתית</div>' +
      '<div class="ai-box-text">מנועי AI מושהים (ללא מפתחות). תשתית מוכנה: crm_ai_insights · עוזרי SEO/Analytics/Ads/CRM יופעלו בשלב ב׳ לאחר חיבור Google מהבית.</div></div>' +
      '<div class="grid grid-2" style="gap:10px;margin-top:14px;">' +
      ['SEO', 'Google Analytics', 'Google Ads', 'CRM Assistant', 'Google Business', 'Decision AI'].map(function (n) {
        return '<div class="card" style="opacity:0.7;"><div style="font-weight:700;font-size:13px;">' + n + '</div><span class="badge badge-gray" style="font-size:10px;margin-top:6px;">○ תשתית מוכנה</span></div>';
      }).join('') + '</div>';
  }

  function renderAiDaily() {
    var el = document.getElementById('crm-ai-daily');
    if (!el) return;
    var urgent = state.tasks.filter(function (t) { return t.priority === 'urgent' && t.status !== 'done'; }).slice(0, 3);
    var hot = state.leads.filter(function (l) { return l.score >= 3 && l.status === 'new_lead'; }).slice(0, 3);
    var lines = [];
    hot.forEach(function (l, i) { lines.push((i + 1) + '. ליד חם: ' + (l.company_name || l.contact_name)); });
    urgent.forEach(function (t) { lines.push('⚠ משימה דחופה: ' + t.title); });
    if (!lines.length) lines.push('אין פעולות דחופות — CRM מסונכרן.');
    el.innerHTML = '<div class="ai-box"><div class="ai-box-header"><div class="ai-pulse"></div>🧠 סיכום CRM</div><div class="ai-box-text">' + esc(lines.join(' · ')) + '</div></div>';
  }

  function updateCounts() {
    var c = document.getElementById('crm-count-clients');
    var l = document.getElementById('crm-count-leads');
    if (c) c.textContent = String(state.filtered.length);
    if (l) l.textContent = String(state.leads.length);
  }

  function renderAll() {
    renderKpis(); renderAiDaily(); renderClientsTable(); renderLeads();
    renderPipeline(); renderTasks(); renderReports(); renderAiPanel(); updateCounts();
  }

  function loadActivity() {
    if (!window.CrmApi) return Promise.resolve();
    return CrmApi.listActivity({}).then(function (rows) { state.activity = rows || []; });
  }

  function loadAll() {
    var chip = document.getElementById('crm-sync-chip');
    if (chip) chip.textContent = 'טוען…';
    if (!window.CrmApi) {
      if (chip) chip.textContent = '⚠️ CrmApi לא נטען';
      return Promise.resolve();
    }
    return CrmApi.loadBundle().then(function (bundle) {
      state.customers = bundle.customers || [];
      state.leads = bundle.leads || [];
      state.tasks = bundle.tasks || [];
      state.kpis = bundle.kpis || {};
      state.filtered = state.customers.slice();
      state.loading = false;
      if (chip) {
        chip.textContent = CrmApi.canRemote()
          ? '🟢 Supabase · ' + state.customers.length + ' לקוחות · ' + state.leads.length + ' לידים'
          : '🟠 מקומי · ' + state.customers.length + ' לקוחות';
      }
      return loadActivity();
    }).then(applyFilters).catch(function (e) {
      if (chip) chip.textContent = '🔴 ' + (e.message || 'שגיאה');
      console.warn('CRM load:', e);
    });
  }

  function openClient(id) {
    var c = state.customers.find(function (x) { return x.id === id; });
    if (!c) { showToast('לקוח לא נמצא'); return; }
    state.currentId = id;
    document.getElementById('cc-breadcrumb').textContent = c.name;
    document.getElementById('cc-btn-marketing').onclick = function () { openMarketing(c.id); };
    var badge = statusBadge(c.status);
    var acts = state.activity.filter(function (a) { return a.customer_id === id; }).slice(0, 20);
    var tasks = state.tasks.filter(function (t) { return t.customer_id === id; });
    document.getElementById('cc-content').innerHTML =
      '<div id="tab-cc-info"><div class="page-header"><div class="page-title" style="font-size:18px;">' + esc(c.name) + '</div>' +
      '<span class="badge ' + badge.cls + '">' + esc(badge.text) + '</span> <span class="badge badge-blue">' + esc(serviceLabel(c.service_type)) + '</span><hr class="page-rule"></div>' +
      '<div class="section"><div class="grid grid-2" style="gap:12px;"><div class="card"><div class="sec-title">פרטים</div>' +
      '<div style="font-size:13px;display:flex;flex-direction:column;gap:6px;">' +
      '<div><span style="color:var(--white50)">איש קשר</span> <strong>' + esc(c.contact_person || '—') + '</strong></div>' +
      '<div><span style="color:var(--white50)">טלפון</span> <strong style="color:var(--accent2)">' + esc(c.phone || '—') + '</strong></div>' +
      '<div><span style="color:var(--white50)">Client ID</span> <code>' + esc(c.id) + '</code></div></div>' +
      '<button type="button" class="btn btn-primary" style="margin-top:10px;font-size:12px;" id="cc-open-marketing">📊 שיווק</button></div>' +
      '<div class="card"><div class="sec-title">קישורים</div>' +
      '<div style="display:flex;flex-direction:column;gap:6px;font-size:12px;">' +
      '<a href="' + esc((window.DALIA_APP_BASE || '/') + 'customers') + '" target="_top" class="btn btn-ghost" style="font-size:12px;">↗ לקוחות בדליה</a>' +
      '<a href="' + esc((window.DALIA_APP_BASE || '/') + 'vehicle-tasks') + '" target="_top" class="btn btn-ghost" style="font-size:12px;">↗ משימות צי</a></div></div></div></div></div>' +
      '<div id="tab-cc-tasks" style="display:none;"><div class="section">' +
      (tasks.length ? tasks.map(function (t) {
        return '<div class="card" style="margin-bottom:8px;font-size:13px;">' + esc(t.title) + ' <span class="badge badge-blue">' + esc(t.status) + '</span></div>';
      }).join('') : '<div class="alert alert-info">אין משימות ללקוח</div>') + '</div></div>' +
      '<div id="tab-cc-history" style="display:none;"><div class="section"><div class="timeline">' +
      (acts.length ? acts.map(function (a) {
        return '<div class="tl-item"><div class="tl-dot-wrap"><div class="tl-dot" style="background:var(--accent2)"></div><div class="tl-line"></div></div>' +
          '<div class="tl-content"><div class="tl-title">' + esc(a.title) + '</div><div class="tl-time">' + esc(a.created_at || '') + '</div></div></div>';
      }).join('') : '<div class="alert alert-info">אין היסטוריה · פעולות יירשמו אוטומטית</div>') + '</div></div></div>' +
      '<div id="tab-cc-marketing" style="display:none;"><div class="section"><button type="button" class="btn btn-primary" id="cc-marketing-tab-btn">📊 CO.CO שיווק</button></div></div>' +
      '<div id="tab-cc-ai" style="display:none;"><div class="section"><div class="alert alert-warn">AI — תשתית crm_ai_insights מוכנה, ממתין למפתחות</div></div></div>';
    document.getElementById('cc-open-marketing')?.addEventListener('click', function () { openMarketing(c.id); });
    document.getElementById('cc-marketing-tab-btn')?.addEventListener('click', function () { openMarketing(c.id); });
    document.querySelectorAll('#cc-content [id^="tab-cc-"]').forEach(function (t, i) { t.style.display = i === 0 ? '' : 'none'; });
    goScreen('screen-client');
  }

  function openLead(id) {
    var l = state.leads.find(function (x) { return x.id === id; });
    if (!l) return;
    showToast('ליד: ' + (l.company_name || l.contact_name) + ' · ' + leadStatusLabel(l.status));
  }

  function completeTask(id) {
    if (!window.CrmApi) return;
    CrmApi.updateTask(id, { status: 'done', completed_at: new Date().toISOString() }).then(function () {
      logAct({ task_id: id, action_type: 'task_done', title: 'משימה הושלמה' });
      showToast('✓ הושלם');
      return loadAll();
    });
  }

  function submitNewLead(ev) {
    ev.preventDefault();
    var fd = new FormData(ev.target);
    var row = {
      company_name: fd.get('name') || fd.get('company_name') || '',
      contact_name: fd.get('contact_person') || '',
      phone: fd.get('phone') || '',
      email: fd.get('email') || '',
      source: fd.get('source') || 'form',
      service_type: fd.get('service_type') || 'marketing_only',
      notes: fd.get('notes') || '',
      status: 'new_lead',
      score: parseInt(fd.get('score') || '2', 10) || 2,
    };
    if (!window.CrmApi) { showToast('⚠️ לא מחובר'); return false; }
    CrmApi.createLead(row).then(function (lead) {
      logAct({ lead_id: lead.id, action_type: 'lead_created', title: 'ליד חדש: ' + row.company_name });
      closeModal('modal-new-lead');
      ev.target.reset();
      showToast('✅ ליד נוצר');
      return loadAll();
    }).catch(function () { showToast('שגיאה — ודא ש-migration CRM הורץ ב-Supabase'); });
    return false;
  }

  function submitNewTask(ev) {
    ev.preventDefault();
    var fd = new FormData(ev.target);
    var row = {
      title: fd.get('title') || '',
      customer_id: state.currentId || fd.get('customer_id') || null,
      lead_id: state.currentLeadId || fd.get('lead_id') || null,
      due_at: fd.get('due_at') || null,
      priority: fd.get('priority') || 'medium',
      assigned_to: fd.get('assigned_to') || '',
      status: 'open',
    };
    if (!row.title) { showToast('נושא חובה'); return false; }
    CrmApi.createTask(row).then(function (t) {
      logAct({ customer_id: row.customer_id, lead_id: row.lead_id, task_id: t.id, action_type: 'task_created', title: 'משימה: ' + row.title });
      closeModal('modal-new-task');
      ev.target.reset();
      state.currentLeadId = null;
      showToast('📋 משימה נוצרה');
      return loadAll();
    }).catch(function () { showToast('שגיאה ביצירת משימה'); });
    return false;
  }

  function bindTabs() {
    document.querySelectorAll('#crm-main-tabs .nav-tab, #crm-client-tabs .nav-tab').forEach(function (tab) {
      tab.addEventListener('click', function () { setTab(tab, tab.getAttribute('data-tab')); });
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
    loadAll().then(function () {
      var cid = new URLSearchParams(location.search).get('customer');
      if (cid) openCustomerById(cid);
    });
  }

  function onAuth() { loadAll(); }

  function openCustomerById(id) {
    if (!state.customers.length) loadAll().then(function () { openClient(id); });
    else openClient(id);
  }

  window.DaliaCrm = {
    init: init, onAuth: onAuth, goScreen: goScreen, setTab: setTab,
    openModal: openModal, closeModal: closeModal, showToast: showToast,
    resetFilter: resetFilter, openClient: openClient, openCustomerById: openCustomerById,
    submitNewLead: submitNewLead, submitNewTask: submitNewTask, loadAll: loadAll,
    applyFilters: applyFilters,
    _stateCustomers: function () { return state.customers; },
  };
})();
