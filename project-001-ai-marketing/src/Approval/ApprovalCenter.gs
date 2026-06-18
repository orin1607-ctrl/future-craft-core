/**
 * Approval Center — initial UI via Sheet tabs.
 * Web App UI: Phase 4.
 */
function showApprovalCenterInfo() {
  const ui = SpreadsheetApp.getUi();
  ui.alert(
    'Approval Center',
    'Use tabs: content_queue, approvals, history, learning_log.\n' +
      'Publish is disabled in skeleton mode.',
    ui.ButtonSet.OK,
  );
}

function recordApprovalDecision(contentQueueId, decision, reason) {
  // Skeleton placeholder — writes to approvals tab in Phase 4
  throw new Error('Not implemented — skeleton only');
}
