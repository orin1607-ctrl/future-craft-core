/**
 * Create an EXECUTION_API deployment for clasp run / Scripts API.
 */
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLASP = JSON.parse(readFileSync(join(__dirname, '..', '.clasp.json'), 'utf8'));
const SCRIPT_ID = CLASP.scriptId;

function getAccessToken() {
  const rc = JSON.parse(readFileSync(join(homedir(), '.clasprc.json'), 'utf8'));
  const token = rc.tokens?.default?.access_token;
  if (!token) throw new Error('Run: npx clasp login');
  return token;
}

async function api(token, path, opts = {}) {
  const url = `https://script.googleapis.com/v1/projects/${SCRIPT_ID}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${path} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  const token = getAccessToken();
  const version = await api(token, '/versions', {
    method: 'POST',
    body: JSON.stringify({ description: `API executable ${new Date().toISOString()}` }),
  });
  console.log('Created version', version.versionNumber);

  const deployment = await api(token, '/deployments', {
    method: 'POST',
    body: JSON.stringify({
      versionNumber: version.versionNumber,
      description: 'API executable remote run',
      entryPoints: [
        {
          entryPointType: 'EXECUTION_API',
          executionApi: { access: 'MYSELF' },
        },
      ],
    }),
  });
  console.log('Created deployment', deployment.deploymentId);
  console.log(JSON.stringify(deployment, null, 2));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
