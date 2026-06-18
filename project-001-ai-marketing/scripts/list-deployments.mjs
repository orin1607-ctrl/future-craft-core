import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_ID = JSON.parse(readFileSync(join(__dirname, '..', '.clasp.json'), 'utf8')).scriptId;
const token = JSON.parse(readFileSync(join(homedir(), '.clasprc.json'), 'utf8')).tokens.default.access_token;

const res = await fetch(`https://script.googleapis.com/v1/projects/${SCRIPT_ID}/deployments`, {
  headers: { Authorization: `Bearer ${token}` },
});
const json = await res.json();
for (const d of json.deployments || []) {
  const eps = (d.entryPoints || []).map((e) => e.entryPointType).join(',');
  console.log(d.deploymentId, '@' + d.deploymentConfig?.versionNumber, d.description || '', eps);
}
