// Stub — content_queue management (Phase 4)
function listPendingApprovals() {
  const id = getSpreadsheetId_();
  if (!id) return [];
  const sheet = SpreadsheetApp.openById(id).getSheetByName('content_queue');
  return sheet.getDataRange().getValues();
}
