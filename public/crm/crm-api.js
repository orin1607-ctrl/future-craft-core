/**
 * Dalia CRM API — Supabase REST (uses COCO_STAGING auth from Dalia shell)
 */
(function () {
  'use strict';

  var LOCAL_KEY = 'dalia-crm-local-v1';

  function cfg() { return window.COCO_STAGING || {}; }

  function canRemote() {
    var c = cfg();
    return !!(c.supabaseUrl && c.anonKey && c.accessToken);
  }

  function headers(extra) {
    var c = cfg();
    return Object.assign({
      apikey: c.anonKey,
      Authorization: 'Bearer ' + c.accessToken,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    }, extra || {});
  }

  function rest(path, opts) {
    if (!canRemote()) return Promise.reject(new Error('no-auth'));
    var url = cfg().supabaseUrl + '/rest/v1/' + path;
    return fetch(url, Object.assign({ headers: headers() }, opts || {})).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || r.statusText); });
      if (r.status === 204) return null;
      return r.json();
    });
  }

  function loadLocal() {
    try {
      var raw = localStorage.getItem(LOCAL_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return { leads: [], tasks: [], activity: [], ai: [] };
  }

  function saveLocal(data) {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
  }

  function uid() {
    return 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  }

  function listLeads() {
    if (!canRemote()) return Promise.resolve(loadLocal().leads || []);
    return rest('crm_leads?select=*&order=created_at.desc');
  }

  function createLead(row) {
    if (!canRemote()) {
      var loc = loadLocal();
      row.id = uid();
      row.created_at = new Date().toISOString();
      row.updated_at = row.created_at;
      loc.leads.unshift(row);
      saveLocal(loc);
      return Promise.resolve(row);
    }
    return rest('crm_leads', { method: 'POST', body: JSON.stringify(row) }).then(function (r) {
      return Array.isArray(r) ? r[0] : r;
    });
  }

  function updateLead(id, patch) {
    if (!canRemote()) return Promise.resolve(patch);
    return rest('crm_leads?id=eq.' + id, { method: 'PATCH', body: JSON.stringify(patch) }).then(function (r) {
      return Array.isArray(r) ? r[0] : r;
    });
  }

  function listTasks(filters) {
    if (!canRemote()) {
      var tasks = loadLocal().tasks || [];
      if (filters && filters.customerId) tasks = tasks.filter(function (t) { return t.customer_id === filters.customerId; });
      return Promise.resolve(tasks);
    }
    var q = 'crm_tasks?select=*&order=due_at.asc.nullslast,created_at.desc';
    if (filters && filters.customerId) q += '&customer_id=eq.' + filters.customerId;
    if (filters && filters.status) q += '&status=eq.' + filters.status;
    return rest(q);
  }

  function createTask(row) {
    if (!canRemote()) {
      var loc = loadLocal();
      row.id = uid();
      row.created_at = new Date().toISOString();
      row.updated_at = row.created_at;
      loc.tasks.unshift(row);
      saveLocal(loc);
      return Promise.resolve(row);
    }
    return rest('crm_tasks', { method: 'POST', body: JSON.stringify(row) }).then(function (r) {
      return Array.isArray(r) ? r[0] : r;
    });
  }

  function updateTask(id, patch) {
    if (!canRemote()) return Promise.resolve(patch);
    return rest('crm_tasks?id=eq.' + id, { method: 'PATCH', body: JSON.stringify(patch) });
  }

  function listActivity(filters) {
    if (!canRemote()) {
      var act = loadLocal().activity || [];
      if (filters && filters.customerId) act = act.filter(function (a) { return a.customer_id === filters.customerId; });
      return Promise.resolve(act);
    }
    var q = 'crm_activity_log?select=*&order=created_at.desc&limit=100';
    if (filters && filters.customerId) q += '&customer_id=eq.' + filters.customerId;
    return rest(q);
  }

  function logActivity(row) {
    if (!canRemote()) {
      var loc = loadLocal();
      row.id = uid();
      row.created_at = new Date().toISOString();
      loc.activity.unshift(row);
      saveLocal(loc);
      return Promise.resolve(row);
    }
    return rest('crm_activity_log', { method: 'POST', body: JSON.stringify(row) }).then(function (r) {
      return Array.isArray(r) ? r[0] : r;
    });
  }

  function listAiInsights(customerId) {
    if (!canRemote()) return Promise.resolve([]);
    var q = 'crm_ai_insights?select=*&order=created_at.desc&limit=20';
    if (customerId) q += '&customer_id=eq.' + customerId;
    return rest(q);
  }

  function ensureAiStub(customerId) {
    var row = {
      customer_id: customerId || null,
      insight_type: 'daily_summary',
      status: 'stub',
      message: 'תשתית AI מוכנה — ממתין למפתחות OpenAI/Google (שלב ב׳)',
      payload: { phase: 'A', engines: ['seo', 'analytics', 'ads', 'crm'], connected: false },
    };
    if (!canRemote()) return Promise.resolve(row);
    return rest('crm_ai_insights', { method: 'POST', body: JSON.stringify(row) }).then(function (r) {
      return Array.isArray(r) ? r[0] : r;
    }).catch(function () { return row; });
  }

  function computeKpis(customers, leads, tasks) {
    customers = customers || [];
    leads = leads || [];
    tasks = tasks || [];
    var activeCustomers = customers.filter(function (c) { return (c.status || '').toLowerCase() === 'active'; });
    var newLeads = leads.filter(function (l) { return l.status === 'new_lead'; });
    var inProgress = leads.filter(function (l) { return l.status === 'in_progress' || l.status === 'quote'; });
    var openTasks = tasks.filter(function (t) { return t.status === 'open' || t.status === 'in_progress'; });
    var urgentTasks = tasks.filter(function (t) { return t.priority === 'urgent' && t.status !== 'done'; });
    var won = leads.filter(function (l) { return l.status === 'closed_won' || l.status === 'active'; });
    var totalLeads = leads.length;
    var closeRate = totalLeads ? Math.round((won.length / totalLeads) * 100) : 0;
    var avgScore = totalLeads
      ? (leads.reduce(function (s, l) { return s + (l.score || 2); }, 0) / totalLeads).toFixed(1)
      : '—';
    var sources = {};
    leads.forEach(function (l) {
      var k = l.source || 'other';
      sources[k] = (sources[k] || 0) + 1;
    });
    return {
      activeCustomers: activeCustomers.length,
      totalCustomers: customers.length,
      newLeads: newLeads.length,
      inProgress: inProgress.length,
      openTasks: openTasks.length,
      urgentTasks: urgentTasks.length,
      closeRate: closeRate,
      avgScore: avgScore,
      totalLeads: totalLeads,
      sources: sources,
    };
  }

  function loadBundle() {
    var customersP = window.MarketingApi && window.MarketingApi.listAllCustomers
      ? window.MarketingApi.listAllCustomers()
      : Promise.resolve([]);
    return Promise.all([customersP, listLeads(), listTasks({})]).then(function (parts) {
      return {
        customers: parts[0] || [],
        leads: parts[1] || [],
        tasks: parts[2] || [],
        kpis: computeKpis(parts[0], parts[1], parts[2]),
      };
    });
  }

  window.CrmApi = {
    canRemote: canRemote,
    listLeads: listLeads,
    createLead: createLead,
    updateLead: updateLead,
    listTasks: listTasks,
    createTask: createTask,
    updateTask: updateTask,
    listActivity: listActivity,
    logActivity: logActivity,
    listAiInsights: listAiInsights,
    ensureAiStub: ensureAiStub,
    computeKpis: computeKpis,
    loadBundle: loadBundle,
    SOURCE_LABELS: {
      google_ads: '📢 Google Ads',
      google_organic: '🔍 אורגני',
      google_business: '📍 Google Business',
      facebook: '📘 Facebook',
      instagram: '📸 Instagram',
      linkedin: '💼 LinkedIn',
      whatsapp: '💬 WhatsApp',
      form: '📝 טופס',
      call: '📞 שיחה',
      referral: '👋 הפניה',
      email: '📧 מייל',
      other: '🔗 אחר',
    },
    STATUS_LABELS: {
      new_lead: 'ליד חדש',
      in_progress: 'בטיפול',
      quote: 'הצעת מחיר',
      active: 'לקוח פעיל',
      closed_won: 'נסגר',
      closed_lost: 'לא רלוונטי',
      on_hold: 'מושהה',
    },
  };
})();
