// Site crawl — implemented in Node (npm run project-001:site-crawl)
// Apps Script entry delegates to Sheet sync trigger
function scanSitePages() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var meta = ss.getSheetByName('_Meta');
  if (meta) {
    meta.appendRow(['site_crawl_requested', new Date().toISOString(), 'Run: npm run project-001:site-crawl']);
  }
  return { ok: true, message: 'Crawl runs via Node pipeline — see site-crawl.json' };
}
