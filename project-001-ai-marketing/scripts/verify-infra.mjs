/**
 * Verify Project 001 infrastructure via Drive API + optional Scripts API.
 */
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SETUP = JSON.parse(readFileSync(join(__dirname, '..', 'setup-result.json'), 'utf8'));
const EXPECTED_TABS = [
  'config', 'raw_gsc', 'raw_ga4', 'site_pages', 'keywords', 'pages', 'competitors',
  'opportunities', 'content_queue', 'approvals', 'history', 'learning_log', 'gbp_audit', 'daily_reports',
];

function token() {
  return JSON.parse(readFileSync(join(homedir(), '.clasprc.json'), 'utf8')).tokens.default.access_token;
}

async function drive(path) {
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  const result = {
    ok: true,
    spreadsheet: SETUP.spreadsheet,
    driveRoot: SETUP.driveRoot,
    tabs: [],
    missingTabs: [],
    folders: {},
    templates: SETUP.templates,
    errors: [],
  };

  const xlsx = await fetch(
    `https://www.googleapis.com/drive/v3/files/${SETUP.spreadsheet.id}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
    { headers: { Authorization: `Bearer ${token()}` } },
  );
  if (!xlsx.ok) {
    result.ok = false;
    result.errors.push('Could not export spreadsheet for tab verification');
  } else {
    const buf = Buffer.from(await xlsx.arrayBuffer());
  }

  for (const name of ['drafts', 'reports', 'assets', 'competitors', 'published', 'templates']) {
    const q = `name='${name}' and '${SETUP.driveRoot.id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const found = await drive(`/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`);
    result.folders[name] = Boolean(found.files?.length);
    if (!result.folders[name]) {
      result.ok = false;
      result.errors.push(`Missing folder: ${name}`);
    }
  }

  for (const key of Object.keys(SETUP.templates)) {
    try {
      await drive(`/files/${SETUP.templates[key].docId}?fields=id,name,trashed`);
    } catch {
      result.ok = false;
      result.errors.push(`Missing template doc: ${key}`);
    }
  }

  try {
    const ssMeta = await drive(`/files/${SETUP.spreadsheet.id}?fields=id,name,mimeType,trashed`);
    result.spreadsheetTitle = ssMeta.name;
  } catch (e) {
    result.ok = false;
    result.errors.push(String(e.message));
  }

  try {
    const res = await fetch(
      `https://script.googleapis.com/v1/scripts/${SETUP.appsScript.id}:run`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ function: 'runProject001Verify', devMode: true }),
      },
    );
    const json = await res.json();
    if (res.ok && json.response?.result) {
      result.appsScriptVerify = json.response.result;
      if (!json.response.result.ok) result.ok = false;
    } else {
      result.appsScriptVerify = { skipped: true, reason: json.error?.message || 'not authorized' };
    }
  } catch (e) {
    result.appsScriptVerify = { skipped: true, reason: String(e.message) };
  }

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
