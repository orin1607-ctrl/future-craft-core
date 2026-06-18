import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_ID = JSON.parse(readFileSync(join(__dirname, '..', '.clasp.json'), 'utf8')).scriptId;

function token() {
  return JSON.parse(readFileSync(join(homedir(), '.clasprc.json'), 'utf8')).tokens.default.access_token;
}

async function api(path, opts = {}) {
  const res = await fetch(`https://script.googleapis.com/v1/projects/${SCRIPT_ID}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${path} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

const version = await api('/versions', { method: 'POST', body: JSON.stringify({ description: 'API exec only' }) });
console.log('version', version.versionNumber);
const dep = await api('/deployments', {
  method: 'POST',
  body: JSON.stringify({ versionNumber: version.versionNumber, description: 'API executable v4' }),
});
console.log('deployment', dep.deploymentId, (dep.entryPoints || []).map((e) => e.entryPointType).join(','));
