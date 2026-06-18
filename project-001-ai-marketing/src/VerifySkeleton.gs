/** Verify Project 001 skeleton infrastructure. */
function verifyProject001Skeleton() {
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = props.getProperty('SPREADSHEET_ID');
  const driveRootId = props.getProperty('DRIVE_ROOT_ID');
  const result = {
    ok: true,
    spreadsheetId: spreadsheetId,
    spreadsheetUrl: spreadsheetId ? 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/edit' : null,
    driveRootId: driveRootId,
    driveRootUrl: driveRootId ? 'https://drive.google.com/drive/folders/' + driveRootId : null,
    tabs: [],
    missingTabs: [],
    folders: {},
    templates: {},
    errors: [],
  };

  if (!spreadsheetId) {
    result.ok = false;
    result.errors.push('SPREADSHEET_ID missing');
    return result;
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);
  const expected = getTabDefinitions_().map(function (t) {
    return t.name;
  });
  expected.forEach(function (name) {
    if (ss.getSheetByName(name)) result.tabs.push(name);
    else {
      result.missingTabs.push(name);
      result.ok = false;
    }
  });

  if (driveRootId) {
    const root = DriveApp.getFolderById(driveRootId);
    ['drafts', 'reports', 'assets', 'competitors', 'published', 'templates'].forEach(function (name) {
      const it = root.getFoldersByName(name);
      result.folders[name] = it.hasNext();
      if (!result.folders[name]) {
        result.ok = false;
        result.errors.push('Missing folder: ' + name);
      }
    });
  } else {
    result.ok = false;
    result.errors.push('DRIVE_ROOT_ID missing');
  }

  try {
    result.templates = JSON.parse(props.getProperty('DOC_TEMPLATES_JSON') || '{}');
  } catch (e) {
    result.errors.push('Invalid DOC_TEMPLATES_JSON');
    result.ok = false;
  }

  return result;
}
