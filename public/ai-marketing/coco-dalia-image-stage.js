/**
 * CO.CO דליה — CocoImageStage (עצמאי)
 * הרצת תמונות בלבד — בלי 50 עוזרים / יועצים / Orchestrator / 13 מנועים / בניית אתר.
 * ברירת מחדל: לא קורא ל-OpenAI Images (generate:false).
 */
(function () {
  'use strict';

  var VERSION = '1.0.0-image-stage';
  var STAGE_KEY = 'coco-dalia-image-stage-v1';
  var MANIFEST_KEY = 'coco-dalia-images-manifest-v1';

  var STATUS = {
    READY: 'imagesReady',
    PENDING: 'imagesPending',
    BLOCKED_QUOTA: 'imagesBlockedQuota',
    FAILED: 'imagesFailed',
    COMPLETED: 'imagesCompleted',
  };

  function parseLs(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  function saveLs(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); return true; } catch (e) { return false; }
  }

  function externalPreviewUrl() {
    return 'https://orin1607-ctrl.github.io/future-craft-core/client-previews/dalia-c-official/index.html';
  }

  function detectQuotaFromStore() {
    var known = parseLs(STAGE_KEY);
    if (known && known.status === STATUS.BLOCKED_QUOTA) return true;
    var infra = null;
    try {
      // optional hint from prior infra verify (if mirrored to LS)
      infra = parseLs('coco-dalia-infra-openai-hint-v1');
    } catch (e) { /* */ }
    if (infra && /quota/i.test(String(infra.error || ''))) return true;
    return false;
  }

  function getStatus() {
    var store = parseLs(STAGE_KEY);
    if (store && store.status) return store;
    var blocked = detectQuotaFromStore();
    var status = blocked ? STATUS.BLOCKED_QUOTA : STATUS.PENDING;
    return {
      version: VERSION,
      status: status,
      imagesReady: false,
      generateEnabled: false,
      paidApiCalled: false,
      imagesCreated: 0,
      previewUrl: externalPreviewUrl(),
      messageHe: blocked
        ? 'תמונות ממתינות בגלל quota — Preview זמין בלי תמונות'
        : 'תמונות ממתינות — טרם אושרה יצירה',
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * @param {object} opts
   * @param {boolean} [opts.generate=false] — חייב true מפורש ליצירה (כרגע אסור)
   * @param {boolean} [opts.forceQuotaBlocked=false]
   * @param {boolean} [opts.reusePreview=true]
   */
  function run(opts) {
    opts = opts || {};
    var generate = opts.generate === true;
    var forceQuota = opts.forceQuotaBlocked === true || detectQuotaFromStore();

    // Never re-run assistants / consultants / full orchestrator / all engines / site rebuild
    var result = {
      version: VERSION,
      ranAt: new Date().toISOString(),
      mode: 'imagesOnly',
      skippedPipeline: true,
      skippedAssistants: true,
      skippedConsultants: true,
      skippedOrchestratorFull: true,
      skippedEnginesAll: true,
      skippedSiteRebuild: true,
      reusePreview: opts.reusePreview !== false,
      generateRequested: generate,
      paidApiCalled: false,
      imagesCreated: 0,
      previewUrl: externalPreviewUrl(),
      status: STATUS.PENDING,
      imagesReady: false,
    };

    if (!generate) {
      result.status = forceQuota ? STATUS.BLOCKED_QUOTA : STATUS.PENDING;
      result.messageHe = forceQuota
        ? 'תמונות ממתינות בגלל quota — לא בוצעה קריאת API'
        : 'CocoImageStage מוכן; יצירה כבויה (generate=false)';
      result.userMessages = [
        'האתר נבנה בהצלחה',
        'Preview זמין',
        forceQuota ? 'תמונות ממתינות בגלל quota' : 'תמונות ממתינות לאישור',
        'אין צורך להזין שוב נתונים',
        'אין צורך להריץ מחדש את כל ה-Pipeline',
      ];
      saveLs(STAGE_KEY, result);
      try {
        window.dispatchEvent(new CustomEvent('coco:image-stage-updated', { detail: result }));
      } catch (e) { /* */ }
      return Promise.resolve(result);
    }

    // Hard stop: paid generation not allowed in this phase without explicit future approval path
    result.status = STATUS.FAILED;
    result.messageHe = 'יצירת תמונות חסומה במדיניות הנוכחית — generate נדחה';
    result.error = 'generation_disabled_by_policy';
    saveLs(STAGE_KEY, result);
    return Promise.resolve(result);
  }

  function markQuotaBlocked(detail) {
    var result = Object.assign(getStatus(), {
      status: STATUS.BLOCKED_QUOTA,
      imagesReady: false,
      paidApiCalled: false,
      messageHe: 'תמונות ממתינות בגלל quota',
      detail: detail || null,
      updatedAt: new Date().toISOString(),
      userMessages: [
        'האתר נבנה בהצלחה',
        'Preview זמין',
        'תמונות ממתינות בגלל quota',
        'אין צורך להזין שוב נתונים',
        'אין צורך להריץ מחדש את כל ה-Pipeline',
      ],
    });
    saveLs(STAGE_KEY, result);
    try {
      window.dispatchEvent(new CustomEvent('coco:image-stage-updated', { detail: result }));
    } catch (e) { /* */ }
    return result;
  }

  function integrateIntoPreview(manifest) {
    // Placeholder for future: merge image URLs into existing preview without rebuild
    var m = manifest || parseLs(MANIFEST_KEY) || { assets: [] };
    saveLs(MANIFEST_KEY, Object.assign({}, m, {
      integratedAt: new Date().toISOString(),
      previewUrl: externalPreviewUrl(),
      note: 'שילוב ב-Preview קיים — ללא בניית אתר מחדש',
    }));
    return m;
  }

  window.CocoImageStage = {
    VERSION: VERSION,
    STATUS: STATUS,
    STAGE_KEY: STAGE_KEY,
    run: run,
    getStatus: getStatus,
    markQuotaBlocked: markQuotaBlocked,
    integrateIntoPreview: integrateIntoPreview,
    externalPreviewUrl: externalPreviewUrl,
  };
})();
