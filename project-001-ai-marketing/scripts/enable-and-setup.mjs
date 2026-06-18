/**
 * Enable Google APIs required for setup-infra.mjs on clasp's default GCP project.
 * Then run setup-infra.mjs with retries.
 */
import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT = '1072944905499';
const SERVICES = [
  'sheets.googleapis.com',
  'drive.googleapis.com',
  'docs.googleapis.com',
  'script.googleapis.com',
];

function getAccessToken() {
  const rc = JSON.parse(readFileSync(join(homedir(), '.clasprc.json'), 'utf8'));
  const t = rc.tokens?.default?.access_token;
  if (!t) throw new Error('Run: npx clasp login');
  return t;
}

async function enableService(token, service) {
  const url = `https://serviceusage.googleapis.com/v1/projects/${PROJECT}/services/${service}:enable`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { service, status: res.status, json };
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const token = getAccessToken();
  console.log('Enabling APIs on clasp project', PROJECT);
  for (const service of SERVICES) {
    const r = await enableService(token, service);
    console.log(service, r.status, r.json.error?.message || r.json.name || 'ok');
  }

  const setupPath = join(__dirname, 'setup-infra.mjs');
  for (let attempt = 1; attempt <= 12; attempt++) {
    console.log(`\nSetup attempt ${attempt}/12...`);
    const child = spawnSync(process.execPath, [setupPath], { encoding: 'utf8' });
    process.stdout.write(child.stdout || '');
    process.stderr.write(child.stderr || '');
    if (child.status === 0) {
      console.log('\nSetup completed successfully.');
      return;
    }
    if (attempt < 12) {
      console.log('Waiting 30s for API propagation...');
      await sleep(30000);
    }
  }
  process.exit(1);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
