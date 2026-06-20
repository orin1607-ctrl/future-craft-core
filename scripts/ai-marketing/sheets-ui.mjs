/**
 * CO.CO UI state — read/write Google Sheets tab COCO_UI
 */
import { existsSync, readFileSync } from 'fs';
import { loadGoogleAuthLibrary, getAuthenticatedClient } from '../google/_lib/auth.mjs';
import { getP001Scopes, tokenHasP001Scopes } from '../project-001/_lib/auth.mjs';
import { loadP001Config } from '../project-001/_lib/config.mjs';

const TAB = 'COCO_UI';
const HEADERS = ['timestamp', 'action', 'entity_type', 'entity_id', 'title', 'status', 'note', 'user'];

export async function ensureCocoUiTab(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = (meta.data.sheets || []).some((s) => s.properties?.title === TAB);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${TAB}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
  }
}

export async function appendUiAction(row) {
  if (!tokenHasP001Scopes()) {
    return { ok: false, error: 'auth_required', message: 'הרץ npm run project-001:auth' };
  }
  const cfg = loadP001Config();
  if (!cfg.spreadsheet_id) {
    return { ok: false, error: 'no_spreadsheet', message: 'חסר spreadsheet_id ב-config' };
  }
  const auth = await getAuthenticatedClient({ scopes: getP001Scopes() });
  const google = await loadGoogleAuthLibrary();
  const sheets = google.sheets({ version: 'v4', auth });
  await ensureCocoUiTab(sheets, cfg.spreadsheet_id);
  const values = [[
    new Date().toISOString(),
    row.action || '',
    row.entityType || '',
    row.entityId || '',
    row.title || '',
    row.status || '',
    row.note || '',
    row.user || 'dashboard',
  ]];
  await sheets.spreadsheets.values.append({
    spreadsheetId: cfg.spreadsheet_id,
    range: `${TAB}!A:H`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });
  return { ok: true, tab: TAB, spreadsheetId: cfg.spreadsheet_id };
}

export async function readUiActions(limit = 50) {
  if (!tokenHasP001Scopes()) return [];
  const cfg = loadP001Config();
  if (!cfg.spreadsheet_id) return [];
  try {
    const auth = await getAuthenticatedClient({ scopes: getP001Scopes() });
    const google = await loadGoogleAuthLibrary();
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: cfg.spreadsheet_id,
      range: `${TAB}!A2:H${limit + 1}`,
    });
    return (res.data.values || []).map((r) => ({
      timestamp: r[0], action: r[1], entityType: r[2], entityId: r[3],
      title: r[4], status: r[5], note: r[6], user: r[7],
    }));
  } catch {
    return [];
  }
}
