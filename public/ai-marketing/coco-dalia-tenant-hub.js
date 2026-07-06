/**
 * CO.CO דליה — Multi-Tenant Hub (Phase 4 E2E)
 * Customer list, active customer SSOT, switch + provision hooks.
 */
(function () {
  'use strict';

  var VERSION = '4.0.0-tenant';
  var KEYS = {
    activeCustomer: 'coco-dalia-active-customer-v1',
    customersCache: 'coco-dalia-customers-cache-v1',
  };

  var OFFICIAL = {
    id: 'dalia-c-official',
    name: 'דליה פתרונות תפעול ותחזוקה לרכב',
    contact_person: 'יוני אטיאס',
    service_type: 'fleet_and_marketing',
    domain: 'dalia-c.com',
    _source: 'official',
  };

  function parseLs(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  function saveLs(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); return true; } catch (e) { return false; }
  }

  function getActiveCustomerId() {
    var stored = parseLs(KEYS.activeCustomer);
    if (stored && stored.id) return stored.id;
    var scope = window.COCO_SCOPE || {};
    if (scope.customerId) return scope.customerId;
    var staging = window.COCO_STAGING || {};
    if (staging.customerId) return staging.customerId;
    return OFFICIAL.id;
  }

  function setActiveCustomer(customer) {
    if (!customer || !customer.id) return null;
    var entry = {
      id: customer.id,
      name: customer.name || customer.bizName || '',
      contact: customer.contact_person || customer.contact || '',
      updatedAt: new Date().toISOString(),
    };
    saveLs(KEYS.activeCustomer, entry);
    try {
      window.dispatchEvent(new CustomEvent('coco:customer-changed', { detail: entry }));
    } catch (e) { /* ignore */ }
    return entry;
  }

  function normalizeCustomer(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name || row.company || '',
      contact_person: row.contact_person || row.contact || '',
      service_type: row.service_type || 'marketing_only',
      phone: row.phone || '',
      email: row.email || '',
      _source: row._source || 'api',
    };
  }

  function loadCustomers(opts) {
    opts = opts || {};
    if (!opts.force) {
      var cached = parseLs(KEYS.customersCache);
      if (cached && cached.rows && cached.fetchedAt) {
        var age = Date.now() - new Date(cached.fetchedAt).getTime();
        if (age < 3 * 60 * 1000) return Promise.resolve(cached.rows);
      }
    }

    var api = window.MarketingApi;
    if (api && api.canRemote && api.canRemote()) {
      return api.listMarketingCustomers().then(function (rows) {
        var list = (rows || []).map(normalizeCustomer).filter(Boolean);
        if (!list.length) list = [OFFICIAL];
        saveLs(KEYS.customersCache, { rows: list, fetchedAt: new Date().toISOString() });
        return list;
      }).catch(function () {
        return [OFFICIAL];
      });
    }

    var local = [OFFICIAL];
    var brief = parseLs('dalia_project_brief');
    if (brief && brief.biz && brief.biz.companyName) {
      local.push({
        id: 'local-wired-client',
        name: brief.biz.companyName,
        contact_person: brief.biz.contact || '',
        service_type: 'marketing_only',
        _source: 'wired-ls',
      });
    }
    saveLs(KEYS.customersCache, { rows: local, fetchedAt: new Date().toISOString() });
    return Promise.resolve(local);
  }

  function switchCustomer(customerId) {
    if (!customerId) return Promise.resolve(null);
    return loadCustomers({ force: true }).then(function (rows) {
      var found = rows.find(function (r) { return r.id === customerId; }) || { id: customerId, name: customerId };
      setActiveCustomer(found);
      if (window.CocoDataAdapter && CocoDataAdapter.loadFromApi) {
        return CocoDataAdapter.loadFromApi(customerId).then(function () { return found; });
      }
      return found;
    });
  }

  function provisionCustomer(payload) {
    var api = window.MarketingApi;
    if (!api || !api.onboardMarketingCustomer) {
      return Promise.resolve({ ok: false, reason: 'no-api' });
    }
    return api.onboardMarketingCustomer(payload, true).then(function (customer) {
      var norm = normalizeCustomer(customer);
      setActiveCustomer(norm);
      return loadCustomers({ force: true }).then(function () {
        return { ok: true, customer: norm };
      });
    }).catch(function (err) {
      return { ok: false, reason: err.message || 'provision-failed' };
    });
  }

  function populateCustomerPicker(selectId) {
    var sel = document.getElementById(selectId || 'f-client');
    if (!sel) return Promise.resolve();
    return loadCustomers().then(function (rows) {
      var activeId = getActiveCustomerId();
      var currentVal = sel.value;
      rows.forEach(function (c) {
        var exists = false;
        for (var i = 0; i < sel.options.length; i++) {
          if (sel.options[i].value === c.id || sel.options[i].text === c.name) { exists = true; break; }
        }
        if (!exists) {
          var opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = c.name;
          opt.dataset.source = c._source || '';
          sel.appendChild(opt);
        }
      });
      var match = rows.find(function (c) { return c.id === activeId; });
      if (match) sel.value = match.id;
      else if (currentVal) sel.value = currentVal;

      if (!sel._cocoTenantBound) {
        sel._cocoTenantBound = true;
        sel.addEventListener('change', function () {
          var id = sel.value;
          if (id && id !== getActiveCustomerId()) {
            switchCustomer(id).then(function () {
              if (window.CocoDaliaIntegration && CocoDaliaIntegration.refreshFromApis && window.DATA) {
                CocoDaliaIntegration.refreshFromApis(window.DATA, { onRefresh: window._cocoV5RenderAll });
              }
            });
          }
        });
      }
    });
  }

  function init() {
    window.addEventListener('message', function (e) {
      var data = e.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'dalia-coco-open-customer' && data.customerId) {
        switchCustomer(data.customerId);
      }
      if (data.type === 'dalia-coco-scope' && data.customerId) {
        setActiveCustomer({ id: data.customerId, name: data.customerName || '' });
      }
    });
    window.addEventListener('coco:auth-ready', function () {
      loadCustomers({ force: true });
    });
  }

  window.CocoDaliaTenantHub = {
    VERSION: VERSION,
    KEYS: KEYS,
    OFFICIAL: OFFICIAL,
    getActiveCustomerId: getActiveCustomerId,
    setActiveCustomer: setActiveCustomer,
    loadCustomers: loadCustomers,
    switchCustomer: switchCustomer,
    provisionCustomer: provisionCustomer,
    populateCustomerPicker: populateCustomerPicker,
    init: init,
  };

  init();
})();
