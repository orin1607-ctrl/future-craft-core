/**
 * Project001 — Apps Script sync helper (bound to GSC+GA4 spreadsheet).
 * Deploy: clasp push — logs sync requests; run npm sync locally or via trigger.
 */
const META_SHEET = '_Meta';
const SYNC_LOG_SHEET = 'Sync_Log';

function project001Ping_() {
  return { ok: true, project: 'Project001AIMarketing', at: new Date().toISOString() };
}

/** Log sync request from time-driven trigger or manual run */
function project001LogSyncRequest_(reason) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SYNC_LOG_SHEET) || ss.insertSheet(SYNC_LOG_SHEET);
  if (sh.getLastRow() === 0) {
    sh.appendRow(['timestamp', 'source', 'reason', 'status']);
  }
  sh.appendRow([new Date().toISOString(), 'apps-script', reason || 'scheduled', 'requested']);
  return { logged: true, sheet: SYNC_LOG_SHEET };
}

/** Daily trigger — logs request; local npm run project-001:sync-and-export pulls data */
function project001DailySyncTrigger() {
  return project001LogSyncRequest_('daily_trigger');
}

/** Manual menu */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Project001')
    .addItem('Log Sync Request', 'project001DailySyncTrigger')
    .addToUi();
}
