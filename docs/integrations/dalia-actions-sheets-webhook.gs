/**
 * Google Apps Script — Dalia Actions CSV export webhook
 * Deploy: New deployment → Web app → Execute as Me → Anyone
 * Paste deployment URL into Actions screen field [data-act-sheets-url]
 * or localStorage key dalia-actions-export-config-v1 → sheetsWebhookUrl
 */
function doPost(e) {
  var ssId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!ssId) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'SPREADSHEET_ID not set in Script Properties' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  var csv = (e && e.postData && e.postData.contents) ? e.postData.contents : '';
  if (!csv) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'empty body' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  var rows = Utilities.parseCsv(csv);
  var sheet = SpreadsheetApp.openById(ssId).getSheetByName('Actions Export') || SpreadsheetApp.openById(ssId).insertSheet('Actions Export');
  if (sheet.getLastRow() === 0) sheet.appendRow(['imported_at'].concat(rows[0] || []));
  var ts = new Date().toISOString();
  for (var i = 1; i < rows.length; i++) {
    sheet.appendRow([ts].concat(rows[i]));
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true, rows: Math.max(0, rows.length - 1) }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput('Dalia Actions webhook — POST CSV body');
}
