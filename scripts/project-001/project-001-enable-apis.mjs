import { readFileSync } from 'fs';
import { exec } from 'child_process';
import { P001 } from './_lib/config.mjs';
import { requireProjectId, REQUIRED_APIS } from './_lib/gcp.mjs';

const OPEN = !process.argv.includes('--no-open');
const scopes = JSON.parse(readFileSync(P001.scopes, 'utf8'));
const { id: project } = requireProjectId();

const apis = [...new Map([...REQUIRED_APIS, ...(scopes.required_gcp_apis || [])].map((a) => [a.id, a])).values()];
const urls = apis.map((api) => ({
  name: api.name,
  url: `https://console.cloud.google.com/apis/library/${api.id}?project=${project}`,
}));

console.log('\n=== Enable GCP APIs — Project001AIMarketing ===');
console.log('Project ID:', project, '\n');

for (const { name, url } of urls) {
  console.log(name);
  console.log(url, '\n');
  if (OPEN && process.platform === 'win32') {
    exec(`start "" "${url}"`);
  } else if (OPEN && process.platform === 'darwin') {
    exec(`open "${url}"`);
  }
  await new Promise((r) => setTimeout(r, OPEN ? 800 : 0));
}
console.log('Done. Click ENABLE on each tab, wait ~1 min, then: npm run project-001:continue\n');
