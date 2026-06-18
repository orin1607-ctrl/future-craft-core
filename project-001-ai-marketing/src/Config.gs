/** Project 001 — global config keys (values live in Sheet tab: config). */
var PROJECT = {
  NAME: 'Project 001 — AI SEO & Digital Marketing Manager',
  VERSION: '0.1.0-skeleton',
};

function getSpreadsheetId_() {
  return PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
}

function getConfigValue_(key) {
  const id = getSpreadsheetId_();
  if (!id) return null;
  const sheet = SpreadsheetApp.openById(id).getSheetByName('config');
  const data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === key) return data[i][1];
  }
  return null;
}

// TODO Phase 1: connectors
// TODO Phase 2: analysis
// TODO Phase 3: content generation (OpenAI — Owner Gate before enable)
// TODO Phase 4: approval + publish (Owner Gate)
