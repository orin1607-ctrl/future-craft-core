/**
 * Project 001 — ניווט חזרה לדליה (כל מסכי ניהול שיווק)
 */
(function () {
  'use strict';

  var params = new URLSearchParams(location.search);

  function isFullscreenMode() {
    if (params.get('fullscreen') === '1') return true;
    try { return sessionStorage.getItem('coco-mkt-fullscreen') === '1'; } catch (e) { return false; }
  }

  function isEmbeddedMode() {
    if (window.self !== window.top) return true;
    if (params.get('embedded') === '1') return true;
    try { return sessionStorage.getItem('coco-mkt-embedded') === '1'; } catch (e) { return false; }
  }

  function stripDaliaExitChrome() {
    if (!isFullscreenMode() && !isEmbeddedMode()) return;
    document.querySelectorAll('.prd-dalia-bar, .topbar .prd-dalia-exit, .prd-dalia-exit-inline').forEach(function (el) {
      el.remove();
    });
  }

  function getDaliaBase() {
    if (window.DALIA_APP_BASE) return window.DALIA_APP_BASE;
    var path = location.pathname || '/';
    var idx = path.indexOf('ai-marketing-platform');
    if (idx > 0) return path.substring(0, idx);
    if (path.indexOf('/ai-marketing/') >= 0) {
      return path.substring(0, path.indexOf('/ai-marketing/'));
    }
    return '/future-craft-core/';
  }

  function getDaliaHomeUrl() {
    var base = getDaliaBase();
    if (!base.endsWith('/')) base += '/';
    return base + 'admin-home';
  }

  function exitToDalia() {
    if (isEmbeddedMode() || isFullscreenMode()) {
      try {
        window.parent.postMessage({ type: 'dalia-coco-exit', path: '/admin-home' }, '*');
      } catch (e) { /* ignore */ }
    }
    if (!isEmbeddedMode()) {
      location.href = getDaliaHomeUrl();
    }
  }

  function injectTopbarDaliaBtn() {
    var root = document.getElementById('coco-claude-root') || document;
    root.querySelectorAll('.topbar').forEach(function (topbar) {
      if (topbar.querySelector('.prd-dalia-exit')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-outline btn-sm prd-dalia-exit';
      btn.textContent = '← חזרה לדליה';
      btn.title = 'דשבורד ראשי — מערכת דליה';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        exitToDalia();
      });
      var left = topbar.querySelector('.topbar-left');
      if (left) left.insertBefore(btn, left.firstChild);
      else topbar.appendChild(btn);
    });
  }

  function injectScreenDaliaBar() {
    var root = document.getElementById('coco-claude-root') || document;
    root.querySelectorAll('.screen').forEach(function (sc) {
      if (sc.querySelector('.prd-dalia-bar')) return;
      var bar = document.createElement('div');
      bar.className = 'prd-dalia-bar';
      bar.innerHTML =
        '<nav class="prd-dalia-bc" aria-label="ניווט דליה">' +
        '<button type="button" class="prd-dalia-bc-btn prd-dalia-exit-inline">דליה · דשבורד ראשי</button>' +
        '<span class="prd-dalia-bc-sep">›</span>' +
        '<span class="prd-dalia-bc-here">ניהול שיווק</span>' +
        '<span class="prd-dalia-bc-sep">›</span>' +
        '<span class="prd-dalia-bc-screen" data-screen-label></span>' +
        '</nav>' +
        '<button type="button" class="btn btn-outline btn-sm prd-dalia-exit-inline">← חזרה לדליה</button>';
      var anchor = sc.querySelector('.prd-context-bar') || sc.querySelector('.v4-module-bar') || sc.firstChild;
      if (anchor) sc.insertBefore(bar, anchor);
      else sc.appendChild(bar);
      bar.querySelectorAll('.prd-dalia-exit-inline').forEach(function (b) {
        b.addEventListener('click', function (e) {
          e.preventDefault();
          exitToDalia();
        });
      });
    });
    updateScreenLabels();
  }

  function updateScreenLabels() {
    var labels = window.screenLabels || {};
    document.querySelectorAll('.screen').forEach(function (sc) {
      var el = sc.querySelector('.prd-dalia-bc-screen');
      if (!el) return;
      var lbl = labels[sc.id] || '';
      el.textContent = lbl || (sc.id || '').replace(/^sc-/, '');
      el.style.display = lbl ? '' : 'none';
    });
  }

  function init() {
    document.body.classList.add('prd-dalia-nav-ready');
    if (isFullscreenMode()) document.body.classList.add('prd-dalia-fullscreen');
    if (isEmbeddedMode()) document.body.classList.add('prd-dalia-embedded');
    if (!isFullscreenMode() && !isEmbeddedMode()) {
      injectTopbarDaliaBtn();
      injectScreenDaliaBar();
    } else {
      stripDaliaExitChrome();
    }

    var origGo = window.goScreen;
    if (typeof origGo === 'function') {
      window.goScreen = function (id) {
        origGo(id);
        setTimeout(updateScreenLabels, 50);
      };
    }

    var orig = window.gotoSc;
    if (typeof orig === 'function') {
      window.gotoSc = function (id) {
        orig(id);
        setTimeout(updateScreenLabels, 50);
      };
    }
  }

  window.PrdDaliaNav = {
    init: init,
    exitToDalia: exitToDalia,
    getDaliaHomeUrl: getDaliaHomeUrl,
    updateScreenLabels: updateScreenLabels,
    stripDaliaExitChrome: stripDaliaExitChrome,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
