/**
 * Project 001 — Marketing API (Supabase REST + local fallback)
 */
(function () {
  'use strict';

  var LOCAL_KEY = 'coco-mkt-local-v1';

  function cfg() {
    return window.COCO_STAGING || {};
  }

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
      if (!r.ok) {
        return r.text().then(function (t) {
          throw new Error(t || r.statusText);
        });
      }
      if (r.status === 204) return null;
      return r.json();
    });
  }

  function loadLocal() {
    try {
      var raw = localStorage.getItem(LOCAL_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return { customers: [], profiles: {}, contacts: {}, sites: {}, domains: {}, connections: {}, campaigns: {}, ai: {} };
  }

  function saveLocal(data) {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
  }

  function hasMarketingService(st) {
    return st === 'marketing_only' || st === 'fleet_and_marketing';
  }

  function listMarketingCustomers() {
    if (!canRemote()) {
      var loc = loadLocal();
      return Promise.resolve(loc.customers.filter(function (c) { return hasMarketingService(c.service_type); }));
    }
    return rest('customers?select=*&or=(service_type.eq.marketing_only,service_type.eq.fleet_and_marketing)&order=created_at.desc');
  }

  function getCustomer(id) {
    if (!canRemote()) {
      return Promise.resolve(loadLocal().customers.find(function (c) { return c.id === id; }) || null);
    }
    return rest('customers?id=eq.' + id + '&select=*').then(function (rows) { return rows[0] || null; });
  }

  function getProfile(customerId) {
    if (!canRemote()) {
      return Promise.resolve(loadLocal().profiles[customerId] || null);
    }
    return rest('marketing_profiles?customer_id=eq.' + customerId + '&select=*').then(function (r) { return r[0] || null; });
  }

  function localBucket(table) {
    if (table === 'marketing_ai_setup') return 'ai';
    return table.replace(/^marketing_/, '');
  }

  function getRelated(table, customerId) {
    if (!canRemote()) {
      var loc = loadLocal();
      var b = localBucket(table);
      if (table === 'marketing_ai_setup') return Promise.resolve(loc.ai[customerId] || null);
      return Promise.resolve((loc[b] && loc[b][customerId]) || []);
    }
    return rest(table + '?customer_id=eq.' + customerId + '&select=*&order=created_at.asc');
  }

  function upsertProfile(customerId, patch) {
    if (!canRemote()) {
      var loc = loadLocal();
      loc.profiles[customerId] = Object.assign({ customer_id: customerId }, loc.profiles[customerId] || {}, patch);
      saveLocal(loc);
      return Promise.resolve(loc.profiles[customerId]);
    }
    return rest('marketing_profiles?on_conflict=customer_id', {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=merge-duplicates,return=representation' }),
      body: JSON.stringify(Object.assign({ customer_id: customerId }, patch)),
    }).then(function (r) { return Array.isArray(r) ? r[0] : r; });
  }

  function insertRow(table, row) {
    if (!canRemote()) {
      var loc = loadLocal();
      var bucket = localBucket(table);
      if (table === 'marketing_ai_setup') {
        loc.ai[row.customer_id] = Object.assign({ customer_id: row.customer_id }, row);
        saveLocal(loc);
        return Promise.resolve(loc.ai[row.customer_id]);
      }
      if (!loc[bucket]) loc[bucket] = {};
      if (!loc[bucket][row.customer_id]) loc[bucket][row.customer_id] = [];
      row.id = row.id || 'local-' + Date.now();
      loc[bucket][row.customer_id].push(row);
      saveLocal(loc);
      return Promise.resolve(row);
    }
    return rest(table, { method: 'POST', body: JSON.stringify(row) }).then(function (r) { return Array.isArray(r) ? r[0] : r; });
  }

  function updateRow(table, id, patch) {
    if (!canRemote()) return Promise.resolve(patch);
    return rest(table + '?id=eq.' + id, { method: 'PATCH', body: JSON.stringify(patch) });
  }

  function buildDaliaSnapshot(c) {
    return {
      name: c.name, business_id: c.business_id, address: c.address, phone: c.phone, email: c.email,
      contact_person: c.contact_person, contact_role: c.contact_role, activity_field: c.activity_field,
      customer_number: c.customer_number, status: c.status, synced_at: new Date().toISOString(),
    };
  }

  function syncFromDalia(customer) {
    return upsertProfile(customer.id, {
      dalia_snapshot: buildDaliaSnapshot(customer),
      synced_at: new Date().toISOString(),
    });
  }

  function markGoalsReady(customerId) {
    return upsertProfile(customerId, { setup_status: 'goals_ready' });
  }

  function loadBundle(customerId) {
    return Promise.all([
      getCustomer(customerId),
      getProfile(customerId),
      getRelated('marketing_contacts', customerId),
      getRelated('marketing_sites', customerId),
      getRelated('marketing_domains', customerId),
      getRelated('marketing_connections', customerId),
      getRelated('marketing_campaigns', customerId),
      getRelated('marketing_api_items', customerId),
      (function () {
        if (!canRemote()) return Promise.resolve(loadLocal().ai[customerId] || null);
        return rest('marketing_ai_setup?customer_id=eq.' + customerId + '&select=*').then(function (r) { return r[0] || null; });
      })(),
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

  window.MarketingApi = {
    canRemote: canRemote,
    hasMarketingService: hasMarketingService,
    listMarketingCustomers: listMarketingCustomers,
    getCustomer: getCustomer,
    getProfile: getProfile,
    getContacts: function (id) { return getRelated('marketing_contacts', id); },
    getSites: function (id) { return getRelated('marketing_sites', id); },
    getDomains: function (id) { return getRelated('marketing_domains', id); },
    getConnections: function (id) { return getRelated('marketing_connections', id); },
    getCampaigns: function (id) { return getRelated('marketing_campaigns', id); },
    getApiItems: function (id) { return getRelated('marketing_api_items', id); },
    getAiSetup: function (id) {
      if (!canRemote()) return Promise.resolve(loadLocal().ai[id] || null);
      return rest('marketing_ai_setup?customer_id=eq.' + id + '&select=*').then(function (r) { return r[0] || null; });
    },
    upsertProfile: upsertProfile,
    syncFromDalia: syncFromDalia,
    markGoalsReady: markGoalsReady,
    loadBundle: loadBundle,
    insertSite: function (row) { return insertRow('marketing_sites', row); },
    insertDomain: function (row) { return insertRow('marketing_domains', row); },
    insertContact: function (row) { return insertRow('marketing_contacts', row); },
    insertCampaign: function (row) { return insertRow('marketing_campaigns', row); },
    insertApiItem: function (row) { return insertRow('marketing_api_items', row); },
    updateConnection: function (id, patch) { return updateRow('marketing_connections', id, patch); },
    updateProfile: function (customerId, patch) { return upsertProfile(customerId, patch); },
  };
})();
