/**
 * Create Dalia FleetOS Drive folder structure (Staging / Production subfolders).
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { PATHS, loadJson } from './_lib/paths.mjs';
import { getAuthenticatedClient } from './_lib/auth.mjs';

if (!existsSync(PATHS.token)) {
  console.error('Not connected. Run: npm run google:auth');
  process.exit(1);
}

const config = loadJson(PATHS.config, loadJson(PATHS.configExample, {}));
const folders = config.folders || {};
const rootName = folders.drive_root_name || 'Dalia FleetOS';
const stagingName = folders.drive_staging_subfolder || 'Staging';
const productionName = folders.drive_production_subfolder || 'Production';

const auth = await getAuthenticatedClient();
const { google } = await import('googleapis');
const drive = google.drive({ version: 'v3', auth });

async function ensureFolder(name, parentId = null) {
  const esc = name.replace(/'/g, "\\'");
  const q = parentId
    ? `name='${esc}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
    : `name='${esc}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const list = await drive.files.list({ q, fields: 'files(id,name)', spaces: 'drive', pageSize: 5 });
  if (list.data.files?.length) return { id: list.data.files[0].id, created: false };
  const body = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) body.parents = [parentId];
  const res = await drive.files.create({ requestBody: body, fields: 'id,name' });
  return { id: res.data.id, created: true };
}

const root = await ensureFolder(rootName);
const staging = await ensureFolder(stagingName, root.id);
const production = await ensureFolder(productionName, root.id);

const report = {
  at: new Date().toISOString(),
  account: config.default_account_hint,
  folders: {
    root: { name: rootName, id: root.id, created: root.created },
    staging: { name: stagingName, id: staging.id, created: staging.created },
    production: { name: productionName, id: production.id, created: production.created },
  },
};

mkdirSync(PATHS.auditOut, { recursive: true });
writeFileSync(join(PATHS.auditOut, 'drive-folders.json'), JSON.stringify(report, null, 2));

if (existsSync(PATHS.config)) {
  const cfg = loadJson(PATHS.config, {});
  cfg.folders = cfg.folders || {};
  cfg.folders.drive_root_id = root.id;
  cfg.folders.drive_staging_id = staging.id;
  cfg.folders.drive_production_id = production.id;
  writeFileSync(PATHS.config, `${JSON.stringify(cfg, null, 2)}\n`);
}

console.log(JSON.stringify(report, null, 2));
