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

  var PENDING = 'ממתין לחיבור';

  function customerLead(c) {
    if (!c) return null;
    return state.leads.find(function (l) { return l.customer_id === c.id; }) ||
      state.leads.find(function (l) { return (l.company_name || '').trim() === (c.name || '').trim(); });
  }

  function lastActivityFor(customerId) {
    var a = state.activity.find(function (x) { return x.customer_id === customerId; });
    if (!a) return null;
    var t = (a.created_at || '').slice(0, 10);
    return (a.title || 'פעולה') + (t ? ' • ' + t : '');
  }

  function sourceBadgeClass(src) {
    if (!src) return 'badge-gray';
    if (src.indexOf('google_ads') >= 0 || src === 'google_ads') return 'badge-green';
    if (src.indexOf('organic') >= 0) return 'badge-blue';
    if (src.indexOf('facebook') >= 0) return 'badge-blue';
    if (src.indexOf('referral') >= 0) return 'badge-purple';
    return 'badge-blue';
  }

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
    var scope = window.COCO_MARKETING_CRM ? document.getElementById('coco-marketing-crm-root') : null;
    var screens = scope ? scope.querySelectorAll('.screen') : document.querySelectorAll('.screen');
    screens.forEach(function (s) { s.classList.remove('active'); });
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
    document.querySelectorAll('#crm-bottom-nav .bnav-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
    });
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
    var company = document.getElementById('f-company')?.value || '';
    var source = document.getElementById('f-source')?.value || '';
    var owner = document.getElementById('f-owner')?.value || '';
    var score = document.getElementById('f-score')?.value || '';
    var campaign = document.getElementById('f-campaign')?.value || '';
    var keyword = (document.getElementById('f-keyword')?.value || '').trim().toLowerCase();
    var activeCount = 0;
    state.filtered = state.customers.filter(function (c) {
      var lead = customerLead(c);
      if (company && c.name !== company) return false;
      if (svc && c.service_type !== svc) return false;
      if (st) {
        if (st === 'active' || st === 'inactive') {
          if ((c.status || '').toLowerCase() !== st) return false;
        } else if (lead) {
          if (lead.status !== st) return false;
        } else return false;
      }
      if (source && (!lead || lead.source !== source)) return false;
      if (owner && lead && (lead.assigned_to || '') !== owner) return false;
      if (score && (!lead || String(lead.score) !== score)) return false;
      if (campaign && (!lead || (lead.campaign || '') !== campaign)) return false;
      if (keyword && lead && [lead.campaign, lead.landing_page, lead.notes].join(' ').toLowerCase().indexOf(keyword) < 0) return false;
      if (!q) return true;
      return [c.name, c.contact_person, c.phone, c.email, c.customer_number, c.id].join(' ').toLowerCase().indexOf(q) >= 0;
    });
    ['f-company', 'f-source', 'f-status', 'f-service', 'f-owner', 'f-score', 'f-campaign', 'f-keyword'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.value) activeCount++;
    });
    if (q) activeCount++;
    var fc = document.getElementById('filter-count');
    if (fc) fc.textContent = activeCount ? activeCount + ' מסננים פעילים' : '';
    renderAll();
  }

  function resetFilter() {
    ['f-company', 'f-source', 'f-status', 'f-service', 'f-owner', 'f-score', 'f-campaign', 'f-page', 'f-tag', 'f-keyword'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.value = '';
    });
    var d = document.getElementById('f-date'); if (d) d.value = '30';
    var s = document.getElementById('f-search'); if (s) s.value = '';
    applyFilters();
    showToast('✓ סינון אופס');
  }

  function toggleAdv() {
    var p = document.getElementById('adv-panel');
    var b = document.getElementById('adv-btn');
    if (!p || !b) return;
    var open = p.style.display === 'none' || !p.style.display;
    p.style.display = open ? 'block' : 'none';
    b.style.borderColor = open ? 'var(--accent)' : 'var(--border)';
  }

  function toggleTheme() {
    var checked = document.getElementById('crm-themeToggle')?.checked;
    document.body.classList.toggle('light', !!checked);
    var k = document.getElementById('crm-themeKnob');
    if (k) {
      k.style.right = checked ? 'auto' : '3px';
      k.style.left = checked ? '3px' : 'auto';
    }
  }

  function populateFilterOptions() {
    var fc = document.getElementById('f-company');
    if (fc) {
      var cur = fc.value;
      var names = state.customers.map(function (c) { return c.name; }).filter(Boolean).sort();
      fc.innerHTML = '<option value="">כל החברות</option>' + names.map(function (n) {
        return '<option' + (n === cur ? ' selected' : '') + '>' + esc(n) + '</option>';
      }).join('');
    }
    var owners = {};
    state.leads.forEach(function (l) { if (l.assigned_to) owners[l.assigned_to] = 1; });
    state.tasks.forEach(function (t) { if (t.assigned_to) owners[t.assigned_to] = 1; });
    var fo = document.getElementById('f-owner');
    if (fo) {
      var oc = fo.value;
      fo.innerHTML = '<option value="">כל האחראים</option>' + Object.keys(owners).sort().map(function (o) {
        return '<option value="' + esc(o) + '"' + (o === oc ? ' selected' : '') + '>' + esc(o) + '</option>';
      }).join('');
    }
    var camps = {};
    state.leads.forEach(function (l) { if (l.campaign) camps[l.campaign] = 1; });
    var fcam = document.getElementById('f-campaign');
    if (fcam) {
      var cc = fcam.value;
      fcam.innerHTML = '<option value="">כל הקמפיינים</option>' + Object.keys(camps).sort().map(function (c) {
        return '<option value="' + esc(c) + '"' + (c === cc ? ' selected' : '') + '>' + esc(c) + '</option>';
      }).join('');
    }
  }

  function renderKpis() {
    var el = document.getElementById('crm-kpi-grid');
    var k = state.kpis || {};
    if (!el) return;
    var urgent = k.urgentTasks || 0;
    var cards = [
      { title: 'לקוחות פעילים', val: k.activeCustomers != null ? k.activeCustomers : '—', sub: 'מ-Supabase', color: 'var(--green)', delta: '' },
      { title: 'לידים חדשים', val: k.newLeads != null ? k.newLeads : '—', sub: 'crm_leads', color: 'var(--accent2)', delta: '' },
      { title: 'בטיפול', val: k.inProgress != null ? k.inProgress : '—', sub: 'Pipeline', color: 'var(--yellow)', delta: '' },
      { title: 'אחוז סגירה', val: k.closeRate != null ? k.closeRate + '%' : '—', sub: 'לידים→לקוח', color: 'var(--green)', delta: '' },
      { title: 'הכנסה החודש', val: PENDING, sub: PENDING, color: 'var(--white)', delta: '' },
      { title: 'ממוצע זמן סגירה', val: k.avgCloseDays != null ? k.avgCloseDays + ' ימים' : PENDING, sub: k.avgCloseDays != null ? 'מחושב מלידים' : PENDING, color: 'var(--white)', delta: '' },
      { title: 'משימות פתוחות', val: k.openTasks != null ? k.openTasks : '—', sub: urgent ? urgent + ' דחופות' : '—', color: 'var(--yellow)', delta: urgent ? 'color:var(--red)' : '' },
      { title: 'שביעות רצון', val: PENDING, sub: PENDING, color: 'var(--green)', delta: '' },
    ];
    el.innerHTML = '<div class="grid grid-4" style="gap:10px;">' + cards.map(function (c) {
      return '<div class="card" style="padding:12px 14px;"><div class="card-title">' + esc(c.title) + '</div>' +
        '<div class="card-value" style="font-size:22px;color:' + c.color + ';">' + esc(String(c.val)) + '</div>' +
        '<div class="card-delta" style="' + (c.delta || 'color:var(--white50)') + '">' + esc(c.sub) + '</div></div>';
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
      var lead = customerLead(c);
      var src = lead ? srcLabel(lead.source) : PENDING;
      var sc = lead && lead.score ? stars(lead.score) : '—';
      var owner = lead && lead.assigned_to ? lead.assigned_to.charAt(0) : '—';
      var ownerName = lead && lead.assigned_to ? lead.assigned_to : '—';
      var last = lastActivityFor(c.id) || (lead && lead.created_at ? lead.created_at.slice(0, 10) : '—');
      var leadSt = lead ? leadStatusLabel(lead.status) : badge.text;
      var stBadge = lead && lead.status === 'new_lead' ? 'badge-blue' : badge.cls;
      var stText = lead && ['new_lead', 'in_progress', 'quote'].indexOf(lead.status) >= 0 ? leadStatusLabel(lead.status) : badge.text;
      return '<tr class="crm-row" data-id="' + esc(c.id) + '" style="cursor:pointer;">' +
        '<td><div class="avatar" style="background:rgba(37,99,235,0.2);color:var(--accent2);">' + esc(initial(c.name)) + '</div></td>' +
        '<td><div style="font-weight:700;">' + esc(c.name) + '</div><div style="font-size:11px;color:var(--white50);">' + esc(c.customer_number || shortId(c.id)) + ' • ' + esc(c.sector || serviceLabel(c.service_type)) + '</div></td>' +
        '<td><div style="font-size:12px;">' + esc(c.contact_person || '—') + '</div><div style="font-size:11px;color:var(--white50);">' + esc(c.phone || '—') + '</div></td>' +
        '<td><span class="badge ' + sourceBadgeClass(lead && lead.source) + '" style="font-size:10px;">' + esc(src) + '</span></td>' +
        '<td><span class="badge badge-blue" style="font-size:10px;">' + esc(serviceLabel(c.service_type)) + '</span></td>' +
        '<td><span style="color:var(--green);font-size:14px;">' + sc + '</span></td>' +
        '<td>' + (owner !== '—' ? '<div class="avatar" style="width:28px;height:28px;font-size:12px;background:rgba(139,92,246,0.2);color:var(--purple);">' + esc(owner) + '</div>' : '<span style="font-size:11px;color:var(--white50);">—</span>') + '</td>' +
        '<td><span class="badge ' + stBadge + '">' + esc(stText) + '</span></td>' +
        '<td style="font-size:11px;color:var(--white50);">' + esc(last) + '</td>' +
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
      var timeStr = l.created_at ? l.created_at.slice(0, 16).replace('T', ' ') : '—';
      return '<div class="card" style="cursor:pointer;margin-bottom:12px;' + (hot ? 'border-color:rgba(239,68,68,0.4);' : '') + '" data-lead="' + esc(l.id) + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:10px;">' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
        '<div class="avatar" style="background:rgba(37,99,235,0.2);color:var(--accent2);">' + esc(initial(l.company_name || l.contact_name)) + '</div>' +
        '<div><div style="font-size:14px;font-weight:700;">' + esc(l.company_name || l.contact_name) + (l.contact_name && l.company_name ? ' – ' + esc(l.contact_name) : '') + '</div>' +
        '<div style="font-size:12px;color:var(--white50);">' + esc(l.phone || '—') + (l.email ? ' • ' + esc(l.email) : '') + '</div></div></div>' +
        '<div style="display:flex;gap:6px;align-items:center;">' + stars(l.score) +
        (hot ? ' <span class="badge badge-red">🔥 חם</span>' : ' <span class="badge badge-yellow">בינוני</span>') + '</div></div>' +
        '<div class="grid grid-4" style="gap:8px;margin-bottom:10px;">' +
        '<div style="background:var(--bg4);border-radius:7px;padding:8px;"><div style="font-size:9px;color:var(--white50);">מקור</div><div style="font-size:12px;font-weight:700;">' + esc(srcLabel(l.source)) + '</div></div>' +
        '<div style="background:var(--bg4);border-radius:7px;padding:8px;"><div style="font-size:9px;color:var(--white50);">קמפיין</div><div style="font-size:12px;font-weight:700;">' + esc(l.campaign || '—') + '</div></div>' +
        '<div style="background:var(--bg4);border-radius:7px;padding:8px;"><div style="font-size:9px;color:var(--white50);">עמוד</div><div style="font-size:12px;font-weight:700;">' + esc(l.landing_page || '—') + '</div></div>' +
        '<div style="background:var(--bg4);border-radius:7px;padding:8px;"><div style="font-size:9px;color:var(--white50);">זמן</div><div style="font-size:12px;font-weight:700;">' + esc(timeStr) + '</div></div></div>' +
        (l.ai_hint ? '<div class="ai-box" style="padding:10px;margin-bottom:10px;"><div class="ai-box-header" style="font-size:11px;margin-bottom:4px;"><div class="ai-pulse"></div>AI CRM</div><div style="font-size:12px;color:var(--white80);">' + esc(l.ai_hint) + '</div></div>' : '') +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        (l.phone ? '<button type="button" class="btn btn-primary" style="font-size:12px;padding:5px 12px;" data-call="' + esc(l.phone) + '">📞 התקשר</button>' : '') +
        (l.customer_id ? '<button type="button" class="btn btn-ghost" style="font-size:12px;padding:5px 12px;" data-open-c="' + esc(l.customer_id) + '">📋 פתח כרטיס</button>' : '') +
        '<button type="button" class="btn btn-ghost" style="font-size:12px;padding:5px 12px;" data-task-lead="' + esc(l.id) + '">+ משימה</button></div></div>';
    }).join('');
    el.querySelectorAll('[data-call]').forEach(function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); showToast('📞 ' + b.getAttribute('data-call')); });
    });
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
      el.innerHTML = '<div style="display:flex;gap:8px;margin-bottom:14px;"><button class="btn btn-primary" style="font-size:12px;padding:5px 12px;" type="button" onclick="DaliaCrm.openModal(\'modal-new-task\')">+ משימה</button></div><div class="alert alert-info">אין משימות · + משימה</div>';
      return;
    }
    el.innerHTML = '<div style="display:flex;gap:8px;margin-bottom:14px;">' +
      '<button class="btn btn-primary" style="font-size:12px;padding:5px 12px;" type="button" onclick="DaliaCrm.openModal(\'modal-new-task\')">+ משימה</button>' +
      '<button class="btn btn-ghost" style="font-size:12px;padding:5px 12px;" type="button">היום בלבד</button>' +
      '<button class="btn btn-ghost" style="font-size:12px;padding:5px 12px;" type="button">דחופות</button></div>' +
      state.tasks.map(function (t) {
      var done = t.status === 'done';
      var pri = t.priority === 'urgent' ? 'badge-red' : t.priority === 'high' ? 'badge-yellow' : 'badge-blue';
      var borderColor = t.priority === 'urgent' ? 'var(--red)' : t.priority === 'high' ? 'var(--yellow)' : 'var(--accent2)';
      return '<div class="card" style="display:flex;align-items:flex-start;gap:12px;margin-bottom:8px;' + (done ? 'opacity:0.6;' : '') + '">' +
        '<div style="width:18px;height:18px;border-radius:50%;border:2px solid ' + borderColor + ';flex-shrink:0;margin-top:2px;cursor:pointer;' + (done ? 'background:var(--green);' : '') + '" data-done="' + esc(t.id) + '">' + (done ? '<span style="font-size:10px;color:#fff;display:flex;align-items:center;justify-content:center;height:100%;">✓</span>' : '') + '</div>' +
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
    el.innerHTML = '<div class="grid grid-2" style="gap:12px;margin-bottom:16px;">' +
      '<div class="card"><div class="card-title" style="margin-bottom:10px;">לידים לפי מקור</div><div class="progress-wrap" style="margin-top:10px;">' + (srcRows || '<div class="alert alert-info">אין לידים במערכת</div>') + '</div></div>' +
      '<div class="card"><div class="card-title" style="margin-bottom:10px;">Funnel לידים → לקוחות</div><div class="progress-wrap" style="margin-top:10px;">' +
      '<div class="progress-item"><div class="progress-label"><span class="name">סה״כ לידים</span><span class="pct">' + (k.totalLeads || 0) + '</span></div><div class="progress-bar"><div class="progress-fill" style="width:100%;background:var(--accent)"></div></div></div>' +
      '<div class="progress-item"><div class="progress-label"><span class="name">לקוחות פעילים</span><span class="pct">' + (k.activeCustomers || 0) + '</span></div><div class="progress-bar"><div class="progress-fill" style="width:' + (k.totalLeads ? Math.round(((k.activeCustomers || 0) / k.totalLeads) * 100) : 0) + '%;background:var(--green)"></div></div></div>' +
      '<div class="progress-item"><div class="progress-label"><span class="name">אחוז סגירה</span><span class="pct">' + (k.closeRate || 0) + '%</span></div><div class="progress-bar"><div class="progress-fill" style="width:' + (k.closeRate || 0) + '%;background:var(--yellow)"></div></div></div></div></div>' +
      '<div class="card"><div class="card-title" style="margin-bottom:10px;">לידים – 30 יום</div><div class="alert alert-info" style="font-size:12px;">' + PENDING + ' — גרף יומי יחובר מ-Analytics</div></div>' +
      '<div class="card"><div class="card-title" style="margin-bottom:10px;">הכנסות חודשיות</div><div class="alert alert-info" style="font-size:12px;">' + PENDING + ' — חיבור חשבונאות</div></div></div>' +
      '<div class="report-box"><div class="report-title">📋 סיכום CRM</div>' +
      '<div class="report-row"><span class="rl">סה״כ לידים</span><span class="rv">' + (k.totalLeads || 0) + '</span></div>' +
      '<div class="report-row"><span class="rl">לקוחות פעילים</span><span class="rv" style="color:var(--green)">' + (k.activeCustomers || 0) + '</span></div>' +
      '<div class="report-row"><span class="rl">אחוז סגירה</span><span class="rv">' + (k.closeRate || 0) + '%</span></div>' +
      '<div class="report-row"><span class="rl">משימות פתוחות</span><span class="rv">' + (k.openTasks || 0) + '</span></div>' +
      '<div class="report-row"><span class="rl">הכנסה חודשית</span><span class="rv">' + PENDING + '</span></div>' +
      '<div class="report-row"><span class="rl">מקור נתונים</span><span class="rv">Supabase</span></div></div>' +
      '<div style="margin-top:12px;display:flex;gap:8px;"><button class="btn btn-primary" style="font-size:12px;padding:5px 12px;" type="button" onclick="DaliaCrm.openModal(\'modal-report\')">📄 הפק דוח PDF</button>' +
      '<button class="btn btn-ghost" style="font-size:12px;padding:5px 12px;" type="button" onclick="DaliaCrm.showToast(\'' + PENDING + '\')">📧 שלח ללקוח</button></div>';
  }

  function renderAiPanel() {
    var el = document.getElementById('crm-ai-panel');
    if (!el) return;
    el.innerHTML = '<div class="ai-box" style="margin-bottom:16px;"><div class="ai-box-header"><div class="ai-pulse"></div>🧠 AI CRM Manager</div>' +
      '<div class="ai-box-text">' + esc(renderAiSummaryText()) + '</div>' +
      '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">' +
      '<button class="btn btn-primary" style="font-size:12px;padding:5px 12px;" type="button" data-goto-tab="tab-main-leads">🔔 לידים דחופים</button>' +
      '<button class="btn btn-ghost" style="font-size:12px;padding:5px 12px;" type="button" onclick="DaliaCrm.openModal(\'modal-report\')">📄 דוח AI</button></div></div>' +
      '<div class="sec-title">עוזרי AI – הכנה לחיבור עתידי</div>' +
      '<div class="grid grid-2" style="gap:10px;">' +
      [['🔍', 'עוזר SEO', 'ניתוח SEO לכל לקוח לפי Client ID'], ['📊', 'עוזר Google Analytics', 'תנועה לאתר הלקוח בזמן אמת'],
        ['📢', 'עוזר Google Ads', 'ROAS וקמפיינים לכל לקוח'], ['📋', 'עוזר CRM', 'משימות, לידים ואוטומציות'],
        ['📍', 'עוזר Google Business', 'ביקורות ופוסטים לכל לקוח'], ['🤖', 'AI קבלת החלטות', 'המלצות אישיות לכל לקוח']].map(function (a) {
        return '<div class="card" style="opacity:0.65;"><div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><span style="font-size:20px;">' + a[0] + '</span><div><div style="font-size:13px;font-weight:700;">' + a[1] + '</div><div style="font-size:11px;color:var(--white50);">' + a[2] + '</div></div></div>' +
          '<span class="badge badge-gray" style="font-size:10px;">○ ' + PENDING + '</span></div>';
      }).join('') + '</div>' +
      '<div style="margin-top:12px;padding:10px;background:var(--bg3);border-radius:8px;font-size:12px;color:var(--white50);">💡 לאחר חיבור: כל עוזר יציג תובנות חיות לפי Client ID בנפרד לכל לקוח.</div>';
    el.querySelectorAll('[data-goto-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tabId = btn.getAttribute('data-goto-tab');
        var tab = document.querySelector('#crm-main-tabs .nav-tab[data-tab="' + tabId + '"]');
        if (tab) setTab(tab, tabId);
      });
    });
  }

  function renderAiSummaryText() {
    var hot = state.leads.filter(function (l) { return l.score >= 3 && l.status === 'new_lead'; }).slice(0, 3);
    var urgent = state.tasks.filter(function (t) { return t.priority === 'urgent' && t.status !== 'done'; }).slice(0, 3);
    if (!hot.length && !urgent.length) return 'אין פעולות דחופות כרגע — הנתונים מסונכרנים מ-Supabase. AI מלא: ' + PENDING + '.';
    var lines = [];
    hot.forEach(function (l, i) { lines.push((i + 1) + '. ליד חם: ' + (l.company_name || l.contact_name)); });
    urgent.forEach(function (t) { lines.push('⚠ משימה דחופה: ' + t.title); });
    return lines.join(' · ');
  }

  function renderAiDaily() {
    var el = document.getElementById('crm-ai-daily');
    if (!el) return;
    var urgent = state.tasks.filter(function (t) { return t.priority === 'urgent' && t.status !== 'done'; }).slice(0, 3);
    var hot = state.leads.filter(function (l) { return l.score >= 3 && l.status === 'new_lead'; }).slice(0, 3);
    var lines = [];
    hot.forEach(function (l, i) { lines.push((i + 1) + '. ליד חם: ' + (l.company_name || l.contact_name)); });
    urgent.forEach(function (t) { lines.push('⚠ משימה דחופה: ' + t.title); });
    if (!lines.length) lines.push('אין פעולות דחופות — CRM מסונכרן מ-Supabase.');
    el.innerHTML = '<div class="ai-box"><div class="ai-box-header"><div class="ai-pulse"></div>🧠 AI CRM – סיכום יומי</div><div class="ai-box-text">' + esc(lines.join(' · ')) + '</div>' +
      '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">' +
      '<button class="btn btn-primary" style="font-size:12px;padding:5px 12px;" type="button" data-goto-tab="tab-main-leads">🔔 לידים דחופים</button>' +
      '<button class="btn btn-ghost" style="font-size:12px;padding:5px 12px;" type="button" data-goto-tab="tab-main-tasks">📋 משימות</button></div></div>';
    el.querySelectorAll('[data-goto-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tabId = btn.getAttribute('data-goto-tab');
        var tab = document.querySelector('#crm-main-tabs .nav-tab[data-tab="' + tabId + '"]');
        if (tab) setTab(tab, tabId);
      });
    });
  }

  function updateCounts() {
    var c = document.getElementById('crm-count-clients');
    var l = document.getElementById('crm-count-leads');
    var t = document.getElementById('crm-count-tasks');
    var openTasks = state.tasks.filter(function (x) { return x.status !== 'done'; }).length;
    if (c) c.textContent = String(state.filtered.length);
    if (l) l.textContent = String(state.leads.length);
    if (t) t.textContent = String(openTasks);
    var foot = document.getElementById('crm-table-footer');
    if (foot) foot.textContent = 'מציג ' + state.filtered.length + ' מתוך ' + state.customers.length + ' לקוחות';
  }

  function renderAll() {
    populateFilterOptions();
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
    }).then(function () {
      if (window.CocoData && CocoData.bindAll) CocoData.bindAll();
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
    var badge = statusBadge(c.status);
    var lead = customerLead(c);
    var acts = state.activity.filter(function (a) { return a.customer_id === id; }).slice(0, 20);
    var tasks = state.tasks.filter(function (t) { return t.customer_id === id; });
    var leads = state.leads.filter(function (l) { return l.customer_id === id; });
    var scoreColor = lead && lead.score >= 3 ? 'var(--green)' : lead && lead.score === 2 ? 'var(--accent2)' : 'var(--yellow)';
    var note = lead && lead.notes ? lead.notes : (c.notes || '—');
    document.getElementById('cc-btn-marketing').onclick = function () { openMarketing(c.id); };
    document.getElementById('cc-btn-call').onclick = function () { showToast(c.phone ? '📞 ' + c.phone : 'אין טלפון'); };
    document.getElementById('cc-btn-wa').onclick = function () { showToast(c.phone ? '💬 WhatsApp ' + c.phone : 'אין טלפון'); };

    var channels = [['📢', 'Google Ads', 'google_ads'], ['🔍', 'Google SEO', 'organic'], ['📍', 'Google Business', 'google_business'],
      ['📘', 'Facebook', 'facebook'], ['📸', 'Instagram', 'instagram'], ['💼', 'LinkedIn', 'linkedin'],
      ['💬', 'WhatsApp', 'whatsapp'], ['📝', 'טופס', 'form'], ['📞', 'שיחה', 'call'], ['👋', 'הפניה', 'referral']];
    var srcKey = lead && lead.source ? lead.source : '';

    document.getElementById('cc-content').innerHTML =
      '<div id="tab-cc-info"><div class="page-header">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:4px;">' +
      '<div style="display:flex;align-items:center;gap:12px;"><div class="avatar" style="width:48px;height:48px;font-size:22px;background:rgba(37,99,235,0.2);color:var(--accent2);">' + esc(initial(c.name)) + '</div>' +
      '<div><div class="page-title" style="font-size:18px;">' + esc(c.name) + '</div>' +
      '<div class="page-subtitle">' + esc(c.customer_number || shortId(c.id)) + ' • ' + esc(serviceLabel(c.service_type)) + '</div></div></div>' +
      '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">' +
      '<span class="badge ' + badge.cls + '">● ' + esc(badge.text.replace('● ', '')) + '</span>' +
      (lead ? '<span style="color:' + scoreColor + ';font-size:16px;">' + stars(lead.score) + '</span>' : '') +
      '<span class="badge badge-blue" style="font-size:10px;">' + esc(serviceLabel(c.service_type)) + '</span></div></div>' +
      (note && note !== '—' ? '<div style="padding:8px 12px;background:var(--bg4);border-radius:8px;margin-top:10px;font-size:12px;color:var(--yellow);">' + esc(note) + '</div>' : '') +
      '<hr class="page-rule"></div>' +
      '<div class="section" style="padding-bottom:0;"><div class="grid grid-2" style="gap:12px;">' +
      '<div class="card"><div class="sec-title">פרטי התקשרות</div>' +
      '<div style="display:flex;flex-direction:column;gap:8px;font-size:13px;">' +
      '<div style="display:flex;justify-content:space-between;"><span style="color:var(--white50);">איש קשר</span><strong>' + esc(c.contact_person || '—') + '</strong></div>' +
      '<div style="display:flex;justify-content:space-between;"><span style="color:var(--white50);">טלפון</span><strong style="color:var(--accent2);">' + esc(c.phone || '—') + '</strong></div>' +
      '<div style="display:flex;justify-content:space-between;"><span style="color:var(--white50);">אימייל</span><strong style="font-size:12px;">' + esc(c.email || '—') + '</strong></div>' +
      '<div style="display:flex;justify-content:space-between;"><span style="color:var(--white50);">אתר</span><strong style="font-size:12px;">' + esc(c.website || PENDING) + '</strong></div></div>' +
      '<div style="display:flex;gap:6px;margin-top:12px;flex-wrap:wrap;">' +
      '<button type="button" class="btn btn-primary" style="font-size:11px;padding:4px 10px;" id="cc-call-btn">📞 התקשר</button>' +
      '<button type="button" class="btn btn-ghost" style="font-size:11px;padding:4px 10px;" id="cc-wa-btn">💬 WhatsApp</button></div></div>' +
      '<div class="card"><div class="sec-title">פרטי העסק</div>' +
      '<div style="display:flex;flex-direction:column;gap:8px;font-size:13px;">' +
      '<div style="display:flex;justify-content:space-between;"><span style="color:var(--white50);">Client ID</span><code style="background:var(--bg4);padding:2px 7px;border-radius:5px;font-size:12px;">' + esc(c.id) + '</code></div>' +
      '<div style="display:flex;justify-content:space-between;"><span style="color:var(--white50);">שירות</span><strong>' + esc(serviceLabel(c.service_type)) + '</strong></div>' +
      '<div style="display:flex;justify-content:space-between;"><span style="color:var(--white50);">מקור הגעה</span><strong>' + esc(lead ? srcLabel(lead.source) : PENDING) + '</strong></div>' +
      '<div style="display:flex;justify-content:space-between;"><span style="color:var(--white50);">הכנסה / פוטנציאל</span><strong style="color:var(--green);">' + PENDING + '</strong></div></div></div></div></div>' +
      '<div class="section" style="padding-bottom:0;"><div class="card"><div class="sec-title">ערוצי הגעה – רישום</div><div style="display:flex;flex-wrap:wrap;gap:6px;">' +
      channels.map(function (ch) {
        var on = srcKey && (srcKey.indexOf(ch[2]) >= 0 || srcLabel(srcKey).indexOf(ch[1]) >= 0);
        return '<div style="padding:6px 10px;border-radius:8px;background:' + (on ? 'var(--accent-glow)' : 'var(--bg4)') + ';border:1px solid ' + (on ? 'rgba(37,99,235,0.4)' : 'var(--border)') + ';font-size:11px;color:' + (on ? 'var(--accent2)' : 'var(--white50)') + ';">' + ch[0] + ' ' + ch[1] + (on ? ' ✓' : '') + '</div>';
      }).join('') + '</div></div></div>' +
      '<div class="section"><div class="card"><div class="sec-title">חיבורים – לפי ' + esc(c.id) + '</div>' +
      '<div id="cc-connections-chips" style="display:flex;flex-wrap:wrap;gap:6px;">' +
      ['מצב נוכחי', 'שיווק', 'משימות', 'היסטוריה', 'נכסים דיגיטליים', 'AI', 'דוחות'].map(function (m) {
        return '<span style="padding:4px 10px;border-radius:7px;background:var(--bg4);border:1px solid var(--border);font-size:11px;color:var(--white50);">○ ' + m + '</span>';
      }).join('') + '</div></div></div></div>' +

      '<div id="tab-cc-leads" style="display:none;"><div class="section">' +
      (leads.length ? leads.map(function (l) {
        return '<div class="card" style="margin-bottom:8px;font-size:13px;"><strong>' + esc(l.company_name || l.contact_name) + '</strong> <span class="badge ' + leadBadge(l.status) + '">' + esc(leadStatusLabel(l.status)) + '</span><div style="font-size:11px;color:var(--white50);margin-top:4px;">' + esc(srcLabel(l.source)) + '</div></div>';
      }).join('') : '<div class="alert alert-info">אין לידים ללקוח זה</div>') + '</div></div>' +

      '<div id="tab-cc-tasks" style="display:none;"><div class="section"><div style="display:flex;justify-content:space-between;margin-bottom:14px;"><div class="sec-title" style="margin:0;">משימות</div>' +
      '<button type="button" class="btn btn-primary" style="font-size:12px;padding:5px 12px;" onclick="DaliaCrm.openModal(\'modal-new-task\')">+ הוסף</button></div>' +
      (tasks.length ? tasks.map(function (t) {
        return '<div class="card" style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px;"><div style="width:16px;height:16px;border-radius:50%;border:2px solid var(--yellow);flex-shrink:0;margin-top:2px;"></div><div><div style="font-size:13px;font-weight:700;">' + esc(t.title) + '</div><div style="font-size:11px;color:var(--white50);">' + esc(t.due_at ? t.due_at.slice(0, 16).replace('T', ' ') : '—') + '</div></div><span class="badge badge-yellow" style="margin-right:auto;">' + esc(t.status) + '</span></div>';
      }).join('') : '<div class="alert alert-info">אין משימות ללקוח</div>') + '</div></div>' +

      '<div id="tab-cc-history" style="display:none;"><div class="section"><div class="sec-title">Audit Trail</div><div class="timeline">' +
      (acts.length ? acts.map(function (a) {
        return '<div class="tl-item"><div class="tl-dot-wrap"><div class="tl-dot" style="background:var(--accent2)"></div><div class="tl-line"></div></div><div class="tl-content"><div class="tl-title">' + esc(a.title) + '</div><div class="tl-time">' + esc(a.created_at || '') + '</div></div></div>';
      }).join('') : '<div class="alert alert-info">אין היסטוריה · פעולות יירשמו אוטומטית</div>') + '</div></div></div>' +

      '<div id="tab-cc-docs" style="display:none;"><div class="section"><div class="alert alert-info">📄 מסמכים, הצעות מחיר וחוזים — ' + PENDING + '</div>' +
      '<button type="button" class="btn btn-ghost" style="margin-top:10px;font-size:12px;" onclick="DaliaCrm.showToast(\'' + PENDING + '\')">+ הוסף מסמך</button></div></div>' +

      '<div id="tab-cc-marketing" style="display:none;"><div class="section"><div class="ai-box" style="margin-bottom:14px;"><div class="ai-box-header"><div class="ai-pulse"></div>שיווק – ' + esc(c.name) + '</div>' +
      '<div class="ai-box-text" id="cc-marketing-summary">טוען נתוני שיווק…</div></div>' +
      '<button type="button" class="btn btn-primary" id="cc-marketing-tab-btn">📊 מצב נוכחי בשיווק</button></div></div>' +

      '<div id="tab-cc-ai" style="display:none;"><div class="section"><div class="ai-box"><div class="ai-box-header"><div class="ai-pulse"></div>🤖 AI אישי – ' + esc(c.name) + '</div>' +
      '<div class="ai-box-text">' + PENDING + ' — עוזר AI אישי יופעל לאחר חיבור מלא. Client ID: <code style="color:var(--accent2);">' + esc(c.id) + '</code></div></div></div></div>';

    document.getElementById('cc-call-btn')?.addEventListener('click', function () { showToast(c.phone ? '📞 ' + c.phone : 'אין טלפון'); });
    document.getElementById('cc-wa-btn')?.addEventListener('click', function () { showToast(c.phone ? '💬 ' + c.phone : 'אין טלפון'); });
    document.getElementById('cc-marketing-tab-btn')?.addEventListener('click', function () { openMarketing(c.id); });
    wireClientConnections(c);
    wireClientMarketingSummary(c);
    document.querySelectorAll('#cc-content [id^="tab-cc-"]').forEach(function (t, i) { t.style.display = i === 0 ? '' : 'none'; });
    document.querySelectorAll('#crm-client-tabs .nav-tab').forEach(function (t, i) { t.classList.toggle('active', i === 0); });
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
      contact_name: [fd.get('first_name'), fd.get('last_name')].filter(Boolean).join(' ') || fd.get('contact_person') || '',
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
    document.querySelectorAll('#crm-bottom-nav .bnav-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tabId = btn.getAttribute('data-tab');
        var tab = document.querySelector('#crm-main-tabs .nav-tab[data-tab="' + tabId + '"]');
        if (tab) setTab(tab, tabId);
        document.querySelectorAll('#crm-bottom-nav .bnav-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });
    ['f-search', 'f-status', 'f-service', 'f-company', 'f-source', 'f-owner', 'f-score', 'f-date', 'f-campaign', 'f-keyword'].forEach(function (id) {
      document.getElementById(id)?.addEventListener('input', applyFilters);
      document.getElementById(id)?.addEventListener('change', applyFilters);
    });
    document.getElementById('crm-themeToggle')?.addEventListener('change', toggleTheme);
    document.querySelectorAll('.overlay').forEach(function (o) {
      o.addEventListener('click', function (e) { if (e.target === o) o.classList.remove('open'); });
    });
  }

  function aiQuick(type) {
    if (type === 'leads') {
      var hot = state.leads.filter(function (l) { return l.score >= 3; });
      showToast(hot.length ? '🔥 ' + hot.length + ' לידים חמים במערכת' : 'אין לידים חמים');
    } else if (type === 'tasks') {
      var u = state.tasks.filter(function (t) { return t.priority === 'urgent' && t.status !== 'done'; });
      showToast(u.length ? '⚠ ' + u.length + ' משימות דחופות' : 'אין משימות דחופות');
    } else {
      showToast('📄 ' + PENDING);
    }
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

  function getCounts() {
    var openTasks = state.tasks.filter(function (x) { return x.status !== 'done'; }).length;
    return {
      customers: state.customers.length,
      leads: state.leads.length,
      openTasks: openTasks,
      filtered: state.filtered.length,
    };
  }

  function listActivityForClient(customerId) {
    return (state.activity || []).filter(function (a) {
      return a.customer_id === customerId;
    });
  }

  var CONN_LABELS = {
    google_search_console: 'Search Console',
    google_analytics: 'GA4',
    google_ads: 'Google Ads',
    google_business: 'Google Business',
    google_tag_manager: 'GTM',
    gmail: 'Gmail',
    google_workspace: 'Workspace',
  };

  function wireClientConnections(c) {
    var mount = document.getElementById('cc-connections-chips');
    if (!mount) return;
    var modules = ['מצב נוכחי', 'שיווק', 'משימות', 'היסטוריה', 'נכסים דיגיטליים', 'AI', 'דוחות', 'CRM'];
    var base = modules.map(function (m) {
      return '<span style="padding:4px 10px;border-radius:7px;background:var(--bg4);border:1px solid var(--border);font-size:11px;color:var(--white50);">✓ ' + m + '</span>';
    }).join('');
    if (!window.MarketingApi || !MarketingApi.getConnections) {
      mount.innerHTML = base;
      return;
    }
    MarketingApi.getConnections(c.id).then(function (rows) {
      var google = Object.keys(CONN_LABELS).map(function (p) {
        var row = (rows || []).find(function (x) { return x.provider === p; });
        var ok = row && /connected|ready/.test(row.status);
        return '<span style="padding:4px 10px;border-radius:7px;background:' + (ok ? 'var(--accent-glow)' : 'var(--bg4)') + ';border:1px solid ' + (ok ? 'rgba(37,99,235,0.4)' : 'var(--border)') + ';font-size:11px;color:' + (ok ? 'var(--accent2)' : 'var(--white50)') + ';">' + (ok ? '✓' : '○') + ' ' + CONN_LABELS[p] + '</span>';
      }).join('');
      mount.innerHTML = base + google;
    }).catch(function () {
      mount.innerHTML = base;
    });
  }

  function wireClientMarketingSummary(c) {
    var el = document.getElementById('cc-marketing-summary');
    if (!el) return;
    if (window.CocoData && CocoData.getBundle) {
      var bundle = CocoData.getBundle();
      if (bundle && bundle.customer && bundle.customer.id === c.id) {
        var kpis = [];
        if (window.CocoData.getMetrics) {
          var metrics = CocoData.getMetrics();
          metrics.forEach(function (m) {
            if (m.provider === 'google_search_console' && m.metric_value) {
              kpis.push('GSC: ' + (m.metric_value.clicks || 0) + ' קליקים');
            }
            if (m.provider === 'google_analytics' && m.metric_value) {
              kpis.push('GA4: ' + (m.metric_value.sessions || 0) + ' סשנים');
            }
          });
        }
        el.textContent = kpis.length ? kpis.join(' · ') : (PENDING + ' — לחץ "מצב נוכחי בשיווק" לסנכרון Google');
        return;
      }
    }
    el.textContent = PENDING + ' — פתח את הלקוח במנהל השיווק לסנכרון נתונים.';
  }

  window.DaliaCrm = {
    init: init, onAuth: onAuth, goScreen: goScreen, setTab: setTab,
    openModal: openModal, closeModal: closeModal, showToast: showToast,
    resetFilter: resetFilter, toggleAdv: toggleAdv, toggleTheme: toggleTheme,
    openClient: openClient, openCustomerById: openCustomerById,
    submitNewLead: submitNewLead, submitNewTask: submitNewTask, loadAll: loadAll,
    applyFilters: applyFilters, aiQuick: aiQuick,
    getCounts: getCounts,
    listActivityForClient: listActivityForClient,
    _stateCustomers: function () { return state.customers; },
  };
})();
