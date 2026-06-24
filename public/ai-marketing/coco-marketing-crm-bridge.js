/**
 * CRM embedded inside מנהל השיווק — same module, not a separate app
 */
(function () {
  'use strict';

  window.COCO_MARKETING_CRM = true;
  var booted = false;

  function crmRoot() {
    return document.getElementById('coco-marketing-crm-root');
  }

  function ctx() {
    return (window.COCO && COCO.flowContext) || {};
  }

  function assetUrl(rel) {
    var ver = (window.CocoUnified && CocoUnified.version) || 'v3-unified-3';
    var base = window.COCO_PAGES_BASE || '/future-craft-core/';
    if (base.charAt(0) !== '/') base = '/' + base.replace(/^\.\//, '');
    return location.origin + base + rel + (rel.indexOf('?') >= 0 ? '&' : '?') + 'v=' + encodeURIComponent(ver);
  }

  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('script ' + url)); };
      document.body.appendChild(s);
    });
  }

  function patchDaliaCrm() {
    if (!window.DaliaCrm || DaliaCrm._marketingPatched) return;
    DaliaCrm._marketingPatched = true;

    var origGo = DaliaCrm.goScreen;
    DaliaCrm.goScreen = function (id) {
      var root = crmRoot();
      if (!root) return origGo(id);
      root.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
      var el = root.querySelector('#' + id);
      if (el) {
        el.classList.add('active');
        el.querySelector('.content')?.scrollTo(0, 0);
      }
    };

    var origOpen = DaliaCrm.openClient;
    DaliaCrm.openClient = function (id) {
      var c = (window.DaliaCrm && DaliaCrm._stateCustomers && DaliaCrm._stateCustomers()) || null;
      if (window.CocoData && CocoData.selectCustomer) {
        CocoData.selectCustomer(id);
      }
      if (window.CocoClaude && CocoClaude.setClientId) CocoClaude.setClientId(id);
      if (window.CocoUnified && CocoUnified.logActivity) {
        CocoUnified.logActivity('crm', 'client_open', 'נפתח לקוח ב-CRM', id);
      }
      return origOpen(id);
    };

    var origFilters = null;
    if (typeof window.applyFilters === 'function') {
      origFilters = window.applyFilters;
    }

    DaliaCrm.syncMarketingFilters = syncMarketingFilters;
    DaliaCrm.onMarketingAuth = function () {
      if (DaliaCrm.loadAll) DaliaCrm.loadAll().then(syncMarketingFilters);
    };
  }

  function syncMarketingFilters() {
    var c = ctx();
    var search = document.getElementById('coco-central-search');
    var free = (search && search.value) || c.freeSearch || '';
    var fs = document.getElementById('f-search');
    var fst = document.getElementById('f-status');
    var fsvc = document.getElementById('f-service');
    if (fs && free !== fs.value) fs.value = free;
    if (fst && c.customerStatus && fst.value !== c.customerStatus) fst.value = c.customerStatus;
    if (fsvc && c.serviceType && fsvc.value !== c.serviceType) fsvc.value = c.serviceType;
    if (window.DaliaCrm && typeof DaliaCrm.applyFilters === 'function') {
      DaliaCrm.applyFilters();
    } else if (fs) {
      fs.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function pullFiltersToContext() {
    var c = ctx();
    var fs = document.getElementById('f-search');
    var fst = document.getElementById('f-status');
    var fsvc = document.getElementById('f-service');
    if (fs) c.freeSearch = fs.value;
    if (fst) c.customerStatus = fst.value;
    if (fsvc) c.serviceType = fsvc.value;
    try {
      localStorage.setItem('coco-flow-context-v2', JSON.stringify(c));
    } catch (e) { /* ignore */ }
    if (window.CocoData && CocoData.onContextChange) CocoData.onContextChange();
  }

  function openCrmTab() {
    var tabs = document.querySelector('#screen-clients .nav-tabs');
    var crmTab = document.getElementById('tab-clients-crm');
    if (tabs && crmTab) {
      tabs.querySelectorAll('.nav-tab').forEach(function (t) { t.classList.remove('active'); });
      var btn = Array.prototype.find.call(tabs.querySelectorAll('.nav-tab'), function (t) {
        return t.textContent.indexOf('CRM') >= 0;
      });
      if (btn) btn.classList.add('active');
      document.querySelectorAll('#screen-clients .content > [id^="tab-clients"]').forEach(function (p) {
        p.style.display = 'none';
      });
      crmTab.style.display = '';
    }
    if (typeof goScreen === 'function') goScreen('screen-clients');
    initCrmEmbed();
  }

  function initCrmEmbed() {
    var panel = document.getElementById('tab-clients-crm');
    if (!panel) return;
    var mount = document.getElementById('coco-marketing-crm-root');
    if (!mount) {
      mount = document.getElementById('coco-marketing-crm-mount');
      if (mount) mount.id = 'coco-marketing-crm-root';
      else {
        mount = document.createElement('div');
        mount.id = 'coco-marketing-crm-root';
        panel.appendChild(mount);
      }
    }
    if (booted && mount.querySelector('.coco-marketing-crm-inner')) {
      syncMarketingFilters();
      if (window.DaliaCrm && DaliaCrm.loadAll) DaliaCrm.loadAll();
      return Promise.resolve();
    }
    return fetch(assetUrl('ai-marketing/coco-marketing-crm-embed.html'), { cache: 'no-store' })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        mount.innerHTML = html;
        var scripts = [];
        if (!window.CrmApi) scripts.push(loadScript(assetUrl('crm/crm-api.js')));
        if (!window.DaliaCrm) scripts.push(loadScript(assetUrl('crm/dalia-crm-app.js')));
        return Promise.all(scripts);
      })
      .then(function () {
        patchDaliaCrm();
        ['f-search', 'f-status', 'f-service'].forEach(function (id) {
          document.getElementById(id)?.addEventListener('input', pullFiltersToContext);
          document.getElementById(id)?.addEventListener('change', pullFiltersToContext);
        });
        if (window.DaliaCrm) {
          DaliaCrm.init();
          booted = true;
          syncMarketingFilters();
          var cid = ctx().clientId;
          if (cid && DaliaCrm.openCustomerById) DaliaCrm.openCustomerById(cid);
        }
      })
      .catch(function (e) {
        console.warn('CRM embed:', e);
        if (mount) mount.innerHTML = '<div class="alert alert-warn">לא ניתן לטעון CRM — ' + (e.message || '') + '</div>';
      });
  }

  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'dalia-coco-auth' && window.DaliaCrm && DaliaCrm.onMarketingAuth) {
      setTimeout(function () { DaliaCrm.onMarketingAuth(); }, 300);
    }
    if (e.data && e.data.type === 'dalia-coco-open-crm') {
      openCrmTab();
    }
  });

  var m = location.search.match(/[?&]tab=([^&]+)/);
  if (m && m[1] === 'crm') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(openCrmTab, 1200);
    });
  }

  window.CocoMarketingCrm = {
    init: initCrmEmbed,
    openTab: openCrmTab,
    syncFilters: syncMarketingFilters,
  };
})();
