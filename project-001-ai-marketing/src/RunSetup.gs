/** Entry point for remote execution (clasp run / Scripts API). */
function runProject001Setup() {
  return createProjectSkeleton();
}

function runProject001Verify() {
  return verifyProject001Skeleton();
}

/** One-time web setup — deploy as web app, open URL once. */
function doGet() {
  const result = createProjectSkeleton();
  return ContentService.createTextOutput(JSON.stringify(result, null, 2)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
