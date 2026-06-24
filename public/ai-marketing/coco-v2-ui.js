/**
 * CO.CO Dalia — Coco V2 UI Controller
 */
(function () {
  'use strict';

  var V2_SCREEN_IDS = [
    'sc-hub',
    'sc-mkt-status',
    'sc-mkt-goals',
    'sc-mkt-actions',
    'sc-mkt-agents',
    'sc-mkt-assets',
    'sc-mkt-clients'
  ];

  var BOTTOM_NAV_MAP = {
    'sc-hub': 'sc-hub',
    'sc-mkt-status': 'sc-mkt-status',
    'sc-mkt-actions': 'sc-mkt-actions',
    'sc-mkt-goals': 'sc-mkt-goals'
  };

  function $(id) {
    return document.getElementById(id);
  }

  function isV2(id) {
    var full = id.indexOf('sc-') === 0 ? id : 'sc-' + id;
    return V2_SCREEN_IDS.indexOf(full) !== -1;
  }

  function normalizeId(id) {
    return id.indexOf('sc-') === 0 ? id : 'sc-' + id;
  }

  function showToast(msg, type) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, type);
      return;
    }
    var el = $('cocoToast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'coco-toast show' + (type ? ' coco-toast-' + type : '');
    clearTimeout(el._v2t);
    el._v2t = setTimeout(function () { el.classList.remove('show'); }, 3800);
  }

  function updateBottomNav(activeId) {
    var nav = $('v2-bottom-nav');
    if (!nav) return;
    var mapped = BOTTOM_NAV_MAP[activeId];
    nav.querySelectorAll('.bn-item').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.v2 === mapped);
    });
  }

  function activateScreen(fullId) {
    if (typeof window.screenMap === 'object') {
      Object.values(window.screenMap).forEach(function (sc) {
        sc.classList.remove('active');
      });
      var target = window.screenMap[fullId];
      if (target) target.classList.add('active');
    } else {
      document.querySelectorAll('.screen').forEach(function (sc) {
        sc.classList.toggle('active', sc.id === fullId);
      });
    }

    if (isV2(fullId)) {
      document.body.classList.add('coco-v2-layout');
      updateBottomNav(fullId);
    } else {
      document.body.classList.remove('coco-v2-layout');
    }

    var lbl = (window.screenLabels && window.screenLabels[fullId]) || fullId;
    var el = $('scrLabel');
    if (el) el.textContent = lbl;

    document.querySelectorAll('.sb-item').forEach(function (item) {
      item.classList.remove('active');
      var sc = item.dataset.sc;
      if (!sc) return;
      var itemFull = sc.indexOf('sc-') === 0 ? sc : 'sc-' + sc;
      if (itemFull === fullId) item.classList.add('active');
    });

    window.scrollTo(0, 0);
  }

  function go(id) {
    var fullId = normalizeId(id);
    if (!isV2(fullId)) {
      goLegacy(id.replace(/^sc-/, ''));
      return;
    }
    activateScreen(fullId);
  }

  function goLegacy(id) {
    document.body.classList.remove('coco-v2-layout');
    var legacyId = id.replace(/^sc-/, '');
    if (typeof window.gotoSc === 'function') {
      window.gotoSc(legacyId);
    }
  }

  function goDalia() {
    showToast('חוזר לממשק הראשי של דליה…', 'info');
    document.body.classList.remove('coco-v2-layout');
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({ type: 'coco-v2-exit', source: 'ai-marketing' }, '*');
      } catch (e) { /* ignore */ }
    }
  }

  function setTab(btn, tabId) {
    var screen = btn.closest('.coco-v2-screen');
    if (!screen) return;
    screen.querySelectorAll('.nav-tab').forEach(function (t) {
      t.classList.remove('active');
    });
    screen.querySelectorAll('.v2-tab-pane').forEach(function (p) {
      p.classList.remove('active');
    });
    btn.classList.add('active');
    var pane = screen.querySelector('#' + tabId);
    if (pane) pane.classList.add('active');
  }

  function toggleTheme() {
    document.body.classList.toggle('coco-v2-light');
    showToast(document.body.classList.contains('coco-v2-light') ? 'מצב בהיר (דמו)' : 'מצב כהה', 'info');
  }

  function openModal(id) {
    var ov = $(id);
    if (ov) ov.classList.add('open');
  }

  function closeModal(id) {
    var ov = $(id);
    if (ov) ov.classList.remove('open');
  }

  function bindClientData(data) {
    if (!data) return;
    var name = data.project?.name || data.meta?.platform || 'דליה — AI Marketing';
    var nameEl = $('v2-client-name');
    if (nameEl) nameEl.textContent = name;

    var companyInputs = document.querySelectorAll('#v2-status-company, .coco-v2-screen .filter-input[readonly]');
    companyInputs.forEach(function (inp) {
      if (inp.id === 'v2-status-company' || inp.closest('.filter-bar')) {
        inp.value = name;
      }
    });

    var k = data.kpis || {};
    var siteEl = $('v2-kpi-site');
    var visitsEl = $('v2-kpi-visits');
    var leadsEl = $('v2-kpi-leads');
    var tasksEl = $('v2-kpi-tasks');

    if (siteEl && k.avgPosition) siteEl.textContent = k.avgPosition.value || '—';
    if (visitsEl && k.weeklyClicks) visitsEl.textContent = k.weeklyClicks.value || '—';
    if (leadsEl && k.aiOpportunities) leadsEl.textContent = k.aiOpportunities.value || '—';
    if (tasksEl) {
      tasksEl.textContent = (k.pendingDrafts && k.pendingDrafts.value) ||
        (data.badges && data.badges.pendingApproval) || '—';
    }

    var tip = $('v2-daily-tip');
    if (tip && k.avgPosition && k.avgPosition.change) {
      tip.textContent = 'מיקום ממוצע: ' + (k.avgPosition.value || '—') + ' (' + k.avgPosition.change + '). ' +
        (k.aiOpportunities ? (k.aiOpportunities.value || '0') + ' הזדמנויות AI ממתינות לאישור.' : '');
    }
  }

  function approveAction(btn) {
    var card = btn.closest('.action-card');
    if (!card || card.classList.contains('approved')) return;
    card.classList.add('approved');
    var title = card.querySelector('.action-title');
    var label = title ? title.textContent.trim() : 'הפעולה';
    var pending = card.querySelector('.pill-red, .pill-orange');
    if (pending) {
      pending.className = 'pill pill-green';
      pending.textContent = 'אושר';
    }
    btn.disabled = true;
    btn.textContent = '✓ אושר';
    showToast('✓ אושר: ' + label.substring(0, 40), 'success');
  }

  function applyStatusFilter() {
    var period = $('v2-status-period');
    var label = period ? period.options[period.selectedIndex].text : '30 ימים';
    showToast('מסנן הוחל: ' + label, 'success');
  }

  function resetStatusFilter() {
    var period = $('v2-status-period');
    if (period) period.value = '30';
    var adv = $('status-filter-advanced');
    if (adv) adv.classList.remove('open');
    showToast('המסנן אופס', 'info');
  }

  function toggleAdvancedFilter(barId) {
    var bar = typeof barId === 'string' ? document.getElementById(barId) : barId;
    if (!bar) return;
    var adv = bar.querySelector('.filter-advanced');
    if (adv) adv.classList.toggle('open');
  }

  function bindAccordions() {
    document.querySelectorAll('.coco-v2-screen .acc-hdr').forEach(function (hdr) {
      if (hdr._v2bound) return;
      hdr._v2bound = true;
      hdr.addEventListener('click', function (e) {
        if (e.target.closest('button, a, input')) return;
        var card = hdr.closest('.acc-card');
        if (card) card.classList.toggle('open');
      });
    });
  }

  function init() {
    bindAccordions();
    if (window.COCO && window.COCO.data) {
      bindClientData(window.COCO.data);
    }
  }

  window.CocoV2 = {
    V2_SCREEN_IDS: V2_SCREEN_IDS,
    go: go,
    goLegacy: goLegacy,
    goDalia: goDalia,
    setTab: setTab,
    toggleTheme: toggleTheme,
    showToast: showToast,
    openModal: openModal,
    closeModal: closeModal,
    bindClientData: bindClientData,
    approveAction: approveAction,
    applyStatusFilter: applyStatusFilter,
    resetStatusFilter: resetStatusFilter,
    toggleAdvancedFilter: toggleAdvancedFilter,
    updateBottomNav: updateBottomNav,
    isV2Screen: isV2,
    init: init
  };
})();
