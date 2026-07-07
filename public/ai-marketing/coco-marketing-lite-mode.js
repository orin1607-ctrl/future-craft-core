/**
 * CO.CO Marketing Hub — Lite mode (Orin Staging)
 * Hides legacy hub modules from display + defers their script loading.
 * Toggle off: ?hub=full  |  localStorage coco-hub-lite=0
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var ALLOWED_SCREENS = { 'screen-hub': true, 'screen-pirsum': true };
  var KEEP_MODALS = { 'modal-notif': true };

  function readParam(name) {
    try {
      return new URLSearchParams(location.search).get(name);
    } catch (e) {
      return null;
    }
  }

  function readStored() {
    try {
      return localStorage.getItem('coco-hub-lite');
    } catch (e) {
      return null;
    }
  }

  function isStagingHost() {
    var host = location.hostname || '';
    if (/orin1607-ctrl\.github\.io/i.test(host)) return true;
    if (host === 'localhost' || host === '127.0.0.1') return true;
    return false;
  }

  function isActive() {
    var hub = readParam('hub');
    if (hub === 'full') return false;
    if (hub === 'lite') return true;
    var stored = readStored();
    if (stored === '0') return false;
    if (stored === '1') return true;
    return isStagingHost();
  }

  function applyBodyClass() {
    function apply() {
      if (!document.body) return;
      if (isActive()) document.body.classList.add('coco-hub-lite');
      else document.body.classList.remove('coco-hub-lite');
    }
    if (document.body) apply();
    else document.addEventListener('DOMContentLoaded', apply);
  }

  function filterScreensHtml(html) {
    if (!isActive() || !html) return html;
    var wrap = document.createElement('div');
    wrap.innerHTML = html;
    wrap.querySelectorAll('.screen').forEach(function (s) {
      if (!ALLOWED_SCREENS[s.id]) s.remove();
    });
    wrap.querySelectorAll('.overlay').forEach(function (o) {
      if (!KEEP_MODALS[o.id]) o.remove();
    });
    return wrap.innerHTML;
  }

  function markHubLiteUi() {
    if (!isActive()) return;
    var hub = document.getElementById('screen-hub');
    if (!hub) return;
    var content = hub.querySelector('.content');
    if (content) {
      Array.prototype.forEach.call(content.children, function (el) {
        var hasPirsum = el.querySelector && el.querySelector('.hub-card-pirsum');
        var isPirsumTitle = el.querySelector && el.querySelector('.sec-title') && /פרסום/.test(el.textContent || '');
        if (hasPirsum || isPirsumTitle) return;
        el.classList.add('coco-lite-hide');
      });
    }
    var bottomNav = hub.querySelector('.bottom-nav');
    if (bottomNav) bottomNav.classList.add('coco-lite-hide');
  }

  function hideGlobalChrome() {
    if (!isActive()) return;
    var chrome = document.getElementById('coco-gfc-chrome');
    if (chrome) chrome.classList.add('coco-gfc-hidden');
    var bar = document.getElementById('coco-unified-context-bar');
    if (bar) {
      bar.classList.remove('coco-gfc-visible');
      bar.style.display = 'none';
    }
    document.body.classList.remove('coco-gfc-active');
    document.querySelectorAll('.gfc-slot').forEach(function (slot) {
      slot.style.display = 'none';
      slot.style.height = '0';
    });
  }

  function patchGoScreen() {
    if (!isActive() || !window.goScreen || window.goScreen.__cocoLitePatch) return;
    var orig = window.goScreen;
    window.goScreen = function (id, opts) {
      if (id === 'screen-ai-decisions') id = 'screen-ai-center';
      if (!ALLOWED_SCREENS[id]) {
        if (typeof window.showToast === 'function') {
          showToast('מודול זה מנותק במצב Lite — זמין ב-?hub=full');
        }
        return;
      }
      return orig(id, opts);
    };
    window.goScreen.__cocoLitePatch = true;
  }

  function finalizePatches() {
    if (!isActive()) return;
    var current = window.goScreen;
    if (typeof current === 'function' && !current.__cocoLiteOuter) {
      window.goScreen = function (id, opts) {
        if (id === 'screen-ai-decisions') id = 'screen-ai-center';
        if (!ALLOWED_SCREENS[id]) {
          if (typeof window.showToast === 'function') {
            showToast('מודול זה מנותק במצב Lite — זמין ב-?hub=full');
          }
          return;
        }
        return current(id, opts);
      };
      window.goScreen.__cocoLiteOuter = true;
    }
    var currentGo = window.goScreen;
    if (typeof currentGo === 'function' && !currentGo.__cocoLiteScreenTrack) {
      window.goScreen = function (id, opts) {
        onScreenChange(id);
        return currentGo(id, opts);
      };
      window.goScreen.__cocoLiteScreenTrack = true;
      window.goScreen.__cocoLiteOuter = true;
    }
    patchGotoSc();
    hideGlobalChrome();
    markHubLiteUi();
    maybeAutoOpenPirsum();
  }

  function patchGotoSc() {
    if (!isActive() || !window.gotoSc || window.gotoSc.__cocoLitePatch) return;
    window.gotoSc = function () {
      if (typeof window.showToast === 'function') {
        showToast('ניווט למודול ישן מנותק במצב Lite');
      }
    };
    window.gotoSc.__cocoLitePatch = true;
  }

  function installLegacyStubs() {
    if (!isActive()) return;
    window.BusinessStrategyWizard = window.BusinessStrategyWizard || {
      open: function () {
        if (typeof showToast === 'function') showToast('חברות ועסקים מנותק במצב Lite');
      },
    };
    window.SiteMarketingHub = window.SiteMarketingHub || {
      hydrateOnBoot: function () { /* lite: skip */ },
    };
    window.MarketingLifecycle = window.MarketingLifecycle || {
      hydrate: function () { /* lite: skip */ },
    };
    window.CocoMarketingCrm = window.CocoMarketingCrm || {
      openTab: function () {
        if (typeof showToast === 'function') showToast('CRM מנותק במצב Lite');
      },
      ensureVisible: function () { /* lite: skip */ },
    };
  }

  function onScreenChange(id) {
    if (!document.body) return;
    document.body.classList.toggle('coco-pirsum-active', id === 'screen-pirsum');
  }

  function maybeAutoOpenPirsum() {
    if (!isActive()) return;
    try {
      var p = new URLSearchParams(location.search);
      if (p.get('tab') === 'pirsum' || p.get('flow') === 'pirsum') return;
      if (p.get('hub') === 'full') return;
      if (p.get('stay') === 'hub') return;
    } catch (e) { /* ignore */ }
    setTimeout(function () {
      if (window.CocoPirsumHub && CocoPirsumHub.open) {
        CocoPirsumHub.open({ tab: 'work' });
        onScreenChange('screen-pirsum');
      }
    }, 350);
  function applyBoot() {
    if (!isActive()) return;
    installLegacyStubs();
    markHubLiteUi();
    hideGlobalChrome();
    patchGoScreen();
    patchGotoSc();
    setTimeout(hideGlobalChrome, 100);
    setTimeout(hideGlobalChrome, 600);
  }

  function afterScreensInjected() {
    applyBoot();
  }

  applyBodyClass();

  window.CocoHubLite = {
    VERSION: VERSION,
    isActive: isActive,
    isStagingHost: isStagingHost,
    filterScreensHtml: filterScreensHtml,
    afterScreensInjected: afterScreensInjected,
    applyBoot: applyBoot,
    finalizePatches: finalizePatches,
    markHubLiteUi: markHubLiteUi,
    hideGlobalChrome: hideGlobalChrome,
    patchGoScreen: patchGoScreen,
    allowedScreens: function () {
      return Object.keys(ALLOWED_SCREENS);
    },
  };
})();
