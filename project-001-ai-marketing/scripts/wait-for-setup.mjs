/**
 * Poll web app setup until authorized and complete.
 */
import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'setup-result.json');
const DEPLOYMENT_ID = 'AKfycbzPUAzTwGbehTSa5IOntW7rLkVAHkhk7EnlZGD1dXhPIeFeZGNAiDDLajtzyR5U3KBN';
const URL = `https://script.google.com/macros/s/${DEPLOYMENT_ID}/exec`;

function token() {
  return JSON.parse(readFileSync(join(homedir(), '.clasprc.json'), 'utf8')).tokens.default.access_token;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function attempt() {
  const res = await fetch(URL, { headers: { Authorization: `Bearer ${token()}` }, redirect: 'follow' });
  const text = await res.text();
  if (text.includes('Authorization needed')) return { state: 'auth' };
  try {
    const json = JSON.parse(text);
    return { state: 'ok', json };
  } catch {
    return { state: 'unknown', preview: text.slice(0, 200) };
  }
}

async function main() {
  for (let i = 1; i <= 30; i++) {
    const r = await attempt();
    console.log(`attempt ${i}:`, r.state, r.preview || '');
    if (r.state === 'ok') {
      writeFileSync(OUT, JSON.stringify({ ok: true, ...r.json }, null, 2));
      console.log(JSON.stringify(r.json, null, 2));
      return;
    }
    await sleep(10000);
  }
  process.exit(1);
}

main();
