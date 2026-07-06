/**
 * CO.CO דליה — WIRED Team iframe sync (Phase 5)
 * Pushes pipeline state to team iframe via postMessage.
 */
(function () {
  'use strict';

  var VERSION = '5.0.0-wired-sync';

  function syncTeamIframe() {
    if (!window.CocoDaliaOrchestrator) return;
    var state = CocoDaliaOrchestrator.toSyncState();
    var frame = document.getElementById('frame-team');
    if (frame && frame.contentWindow) {
      try {
        frame.contentWindow.postMessage({ type: 'coco:sync-pipeline', state: state }, '*');
      } catch (e) { /* ignore */ }
    }
  }

  function init(opts) {
    opts = opts || {};
    window.addEventListener('coco:pipeline-updated', syncTeamIframe);
    window.addEventListener('storage', function (e) {
      if (e && e.key && /coco-dalia-(assistant|engines|pipeline)/.test(e.key)) {
        syncTeamIframe();
      }
    });
    if (opts.showPart) {
      var orig = opts.showPart;
      opts.showPart = function (p) {
        orig(p);
        if (p === 'team') setTimeout(syncTeamIframe, 500);
      };
      window._cocoWiredShowPart = opts.showPart;
    }
    setInterval(syncTeamIframe, 30000);
    setTimeout(syncTeamIframe, 2000);
  }

  window.CocoDaliaWiredSync = {
    VERSION: VERSION,
    init: init,
    syncTeamIframe: syncTeamIframe,
  };
})();
