/**
 * CO.CO דליה — Persistence Layer (Phase 4 E2E)
 * Supabase read/write when auth present. Safe debounced sync.
 */
(function () {
  'use strict';

  var VERSION = '4.0.0-persist';
  var _syncTimer = null;
  var _busy = false;

  var WATCH_KEYS = [
    'dalia_project_brief', 'dalia_part_a', 'dalia_part_b', 'dalia_part_c',
    'dalia_biz', 'coco-project-brief-v1', 'coco-dalia-progress-v1', 'coco-v5-qa-v1',
  ];

  function parseLs(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  function canWrite() {
    var api = window.MarketingApi;
    return !!(api && api.canRemote && api.canRemote() && api.upsertProfile);
  }

  function getCustomerId() {
    if (window.CocoDaliaTenantHub && CocoDaliaTenantHub.getActiveCustomerId) {
      return CocoDaliaTenantHub.getActiveCustomerId();
    }
    return (window.COCO_SCOPE && COCO_SCOPE.customerId) || 'dalia-c-official';
  }

  function buildDaliaSnapshot() {
    var brief = parseLs('dalia_project_brief');
    var partA = parseLs('dalia_part_a') || {};
    var partB = parseLs('dalia_part_b');
    var progress = parseLs('coco-dalia-progress-v1');
    var qa = parseLs('coco-v5-qa-v1');
    var pb = (window.ProjectBrief && ProjectBrief.get) ? ProjectBrief.get() : parseLs('coco-project-brief-v1');
    return {
      version: VERSION,
      syncedAt: new Date().toISOString(),
      projectBrief: brief,
      partA: partA,
      partB: partB,
      progress: progress,
      qa: qa,
      structuredBrief: pb,
    };
  }

  function syncBriefToProfile(customerId) {
    if (!canWrite()) return Promise.resolve({ ok: false, reason: 'no-auth' });
    customerId = customerId || getCustomerId();
    var snap = buildDaliaSnapshot();
    return MarketingApi.upsertProfile(customerId, {
      dalia_snapshot: snap,
      synced_at: snap.syncedAt,
    }).then(function () {
      return MarketingApi.insertRow('marketing_activity', {
        customer_id: customerId,
        activity_type: 'dalia_sync',
        title: 'סנכרון Brief + Progress',
        details: { parts: progressParts(snap), qaRated: qaCount(snap.qa) },
        created_at: snap.syncedAt,
      }).catch(function () { return null; }).then(function () {
        return { ok: true, customerId: customerId, syncedAt: snap.syncedAt };
      });
    }).catch(function (err) {
      console.warn('[CocoDaliaPersistence] sync failed', err);
      return { ok: false, reason: err.message || 'sync-failed' };
    });
  }

  function progressParts(snap) {
    var p = (snap.progress && snap.progress.parts) || {};
    return {
      a: p.a && p.a.status,
      b: p.b && p.b.status,
      c: p.c && p.c.status,
      team: p.team && p.team.status,
    };
  }

  function qaCount(qa) {
    if (!qa) return 0;
    var n = 0;
    ['assistants', 'consultants'].forEach(function (b) {
      var bucket = qa[b] || {};
      Object.keys(bucket).forEach(function (id) {
        var q = bucket[id];
        if (q && (q.relevant != null || q.helped != null || q.quality_rating != null)) n++;
      });
    });
    return n;
  }

  function loadFromProfile(customerId) {
    if (!canWrite()) return Promise.resolve(null);
    customerId = customerId || getCustomerId();
    return MarketingApi.getProfile(customerId).then(function (profile) {
      if (!profile || !profile.dalia_snapshot) return null;
      var snap = profile.dalia_snapshot;
      if (snap.projectBrief) localStorage.setItem('dalia_project_brief', JSON.stringify(snap.projectBrief));
      if (snap.partA) localStorage.setItem('dalia_part_a', JSON.stringify(snap.partA));
      if (snap.partB) localStorage.setItem('dalia_part_b', JSON.stringify(snap.partB));
      if (snap.progress) localStorage.setItem('coco-dalia-progress-v1', JSON.stringify(snap.progress));
      if (snap.qa) localStorage.setItem('coco-v5-qa-v1', JSON.stringify(snap.qa));
      return snap;
    }).catch(function () { return null; });
  }

  function scheduleSync() {
    if (_syncTimer) clearTimeout(_syncTimer);
    _syncTimer = setTimeout(function () {
      if (_busy) return;
      _busy = true;
      syncBriefToProfile().finally(function () { _busy = false; });
    }, 2500);
  }

  function init() {
    window.addEventListener('storage', function (e) {
      if (e && e.key && WATCH_KEYS.indexOf(e.key) >= 0) scheduleSync();
    });
    window.addEventListener('coco:auth-ready', function () {
      var id = getCustomerId();
      loadFromProfile(id).then(function (snap) {
        if (snap && window.CocoDaliaIntegration && CocoDaliaIntegration.publishProgress) {
          CocoDaliaIntegration.publishProgress({ silent: true });
        }
        scheduleSync();
      });
    });
    window.addEventListener('coco:customer-changed', function () {
      var id = getCustomerId();
      loadFromProfile(id);
    });
  }

  window.CocoDaliaPersistence = {
    VERSION: VERSION,
    canWrite: canWrite,
    buildDaliaSnapshot: buildDaliaSnapshot,
    syncBriefToProfile: syncBriefToProfile,
    loadFromProfile: loadFromProfile,
    scheduleSync: scheduleSync,
    init: init,
  };

  init();
})();
