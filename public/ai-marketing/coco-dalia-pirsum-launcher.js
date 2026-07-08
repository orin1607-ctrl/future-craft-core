/**
 * CO.CO דליה — פרסום Hub Launcher
 * Lite: light work shell (no WIRED srcdoc). Only one heavy iframe alive at a time.
 */
(function () {
  'use strict';

  var VERSION = '1.3.0-work-lite';
  var WIRED_FILE = 'coco-dalia/coco-dalia-full-A-J-WIRED%20(1).html';
  var WORK_LITE_FILE = 'coco-dalia/work-center-lite.html';
  var V5_FILE = 'ai-marketing/ai-control-center-v5-STANDALONE.html';
  var _loaded = { work: false, control: false };
  var _activeTab = 'work';
  var _lastWorkSrc = '';
  var _lastControlSrc = '';

  function isHubLite() {
    return document.body.classList.contains('coco-hub-lite') ||
      (window.CocoHubLite && CocoHubLite.isActive && CocoHubLite.isActive());
  }

  function forceWiredWork() {
    try {
      return new URLSearchParams(location.search).get('work') === 'wired';
    } catch (e) {
      return false;
    }
  }

  function useLiteWorkShell() {
    return isHubLite() && !forceWiredWork();
  }

  function isSingleIframeMode() {
    return isHubLite();
  }

  function suspendFrame(frameId, key) {
    var f = getFrame(frameId);
    if (!f) return;
    try {
      if (key === 'work' && f.src && f.src !== 'about:blank') _lastWorkSrc = f.src;
      if (key === 'control' && f.src && f.src !== 'about:blank') _lastControlSrc = f.src;
      f.src = 'about:blank';
    } catch (e) { /* ignore */ }
    _loaded[key] = false;
  }

  function getBasePath() {
    if (window.COCO_PAGES_BASE) {
      var b = window.COCO_PAGES_BASE;
      return b.charAt(0) === '/' ? b : (b.endsWith('/') ? b : b + '/');
    }
    var host = location.hostname;
    if (/orin1607-ctrl\.github\.io/i.test(host)) return '/future-craft-core/';
    if (host === 'localhost' || host === '127.0.0.1') {
      var p = location.pathname || '';
      var i = p.indexOf('/public/');
      if (i >= 0) return p.substring(0, i + 8);
      i = p.indexOf('ai-marketing');
      if (i >= 0) return p.substring(0, i);
    }
    return '/future-craft-core/';
  }

  function absUrl(rel) {
    var base = getBasePath();
    if (base.charAt(0) === '/') return location.origin + base + rel;
    try {
      return new URL(rel, base).href;
    } catch (e) {
      return rel;
    }
  }

  function workUrl(opts) {
    opts = opts || {};
    var file = useLiteWorkShell() ? WORK_LITE_FILE : WIRED_FILE;
    var url = absUrl(file);
    var qs = ['embedded=1'];
    if (opts.part) qs.push('part=' + encodeURIComponent(opts.part));
    if (useLiteWorkShell()) qs.push('shell=lite');
    return url + '?' + qs.join('&');
  }

  function controlUrl() {
    return absUrl(V5_FILE) + '?embedded=1';
  }

  function standaloneHubUrl(tab) {
    var base = absUrl('coco-dalia/pirsum-hub.html');
    return tab ? base + '?tab=' + encodeURIComponent(tab) : base;
  }

  function getFrame(id) {
    return document.getElementById(id);
  }

  /** Only one heavy pirsum iframe alive — suspend the other on tab switch (Lite). */
  function enforceSingleAlive(activeTab) {
    if (!isSingleIframeMode()) return;
    if (activeTab === 'work') {
      suspendFrame('pirsum-frame-control', 'control');
    } else if (activeTab === 'control') {
      suspendFrame('pirsum-frame-work', 'work');
    }
  }

  function setTabActive(tab) {
    _activeTab = tab === 'control' ? 'control' : 'work';
    var workBtn = document.getElementById('pirsum-tab-work');
    var ctrlBtn = document.getElementById('pirsum-tab-control');
    var workFrame = getFrame('pirsum-frame-work');
    var ctrlFrame = getFrame('pirsum-frame-control');
    if (workBtn) workBtn.classList.toggle('active', _activeTab === 'work');
    if (ctrlBtn) ctrlBtn.classList.toggle('active', _activeTab === 'control');
    if (workFrame) workFrame.classList.toggle('on', _activeTab === 'work');
    if (ctrlFrame) ctrlFrame.classList.toggle('on', _activeTab === 'control');
    if (isSingleIframeMode()) enforceSingleAlive(_activeTab);
    ensureFrameLoaded(_activeTab);
  }

  function ensureFrameLoaded(tab) {
    if (tab === 'work' && !_loaded.work) {
      var f = getFrame('pirsum-frame-work');
      if (f && (!f.src || f.src === 'about:blank')) {
        f.src = workUrl();
        _lastWorkSrc = f.src;
        _loaded.work = true;
      }
    }
    if (tab === 'control' && !_loaded.control) {
      var c = getFrame('pirsum-frame-control');
      if (c && (!c.src || c.src === 'about:blank')) {
        c.src = controlUrl();
        _lastControlSrc = c.src;
        _loaded.control = true;
      }
    }
  }

  function leavePirsum() {
    if (!isSingleIframeMode()) return;
    suspendFrame('pirsum-frame-work', 'work');
    suspendFrame('pirsum-frame-control', 'control');
  }

  function openHub(opts) {
    opts = opts || {};
    if (typeof window.goScreen === 'function') {
      goScreen('screen-pirsum');
    }
    if (opts.tab) setTabActive(opts.tab);
    else setTabActive(_activeTab || 'work');
  }

  function openInNewTab(tab) {
    window.open(standaloneHubUrl(tab || 'work'), '_blank', 'noopener');
  }

  function patchGoScreen() {
    if (window.__cocoPirsumGoPatched) return;
    var orig = window.goScreen;
    if (typeof orig !== 'function') return;
    window.goScreen = function (id, opts) {
      if (id !== 'screen-pirsum' && isSingleIframeMode()) leavePirsum();
      var r = orig(id, opts);
      if (id === 'screen-pirsum') {
        setTimeout(function () { openHub({ tab: _activeTab }); }, 0);
      }
      return r;
    };
    window.__cocoPirsumGoPatched = true;
  }

  function handleBootDeepLink() {
    var params = new URLSearchParams(location.search);
    var flow = params.get('flow');
    var tab = params.get('tab');
    if (flow === 'pirsum' || tab === 'pirsum') {
      setTimeout(function () {
        openHub({ tab: params.get('pirsumTab') || 'work' });
      }, 500);
    }
  }

  function init() {
    patchGoScreen();
    handleBootDeepLink();
  }

  window.CocoPirsumHub = {
    VERSION: VERSION,
    open: openHub,
    openInNewTab: openInNewTab,
    showTab: setTabActive,
    workUrl: workUrl,
    controlUrl: controlUrl,
    standaloneHubUrl: standaloneHubUrl,
    leavePirsum: leavePirsum,
    useLiteWorkShell: useLiteWorkShell,
    init: init,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
