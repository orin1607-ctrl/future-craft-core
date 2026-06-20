/**
 * Dalia FleetOS — Apps Script starter (deploy via clasp after google:auth).
 * Bound or standalone — extend per automation need.
 */
function daliaPing_() {
  return { ok: true, at: new Date().toISOString(), project: 'Dalia FleetOS' };
}

/** Example: append row to a configured spreadsheet */
function appendAuditRow_(spreadsheetId, sheetName, row) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sh = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  sh.appendRow(row);
  return sh.getLastRow();
}
