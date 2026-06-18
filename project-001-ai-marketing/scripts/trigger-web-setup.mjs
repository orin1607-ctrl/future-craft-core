/**
 * Trigger setup via web app deployment using OAuth bearer token.
 */
import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'setup-result.json');
const DEPLOYMENT_ID = process.argv[2] || '';

function getAccessToken() {
  const rc = JSON.parse(readFileSync(join(homedir(), '.clasprc.json'), 'utf8'));
  const token = rc.tokens?.default?.access_token;
  if (!token) throw new Error('Run: npx clasp login');
  return token;
}

async function main() {
  const token = getAccessToken();
  const url = DEPLOYMENT_ID
    ? `https://script.google.com/macros/s/${DEPLOYMENT_ID}/exec`
    : 'https://script.google.com/macros/s/AKfycbw-Uw1bdbM8w2dvAwm0pqr5gbcOP3wUWAGpXkRpnjNukNab1LkgvDnavHsmk7JpnKGq/exec';

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'follow',
  });
  const text = await res.text();
  console.log('status', res.status, 'url', res.url);
  if (text.includes('Authorization needed')) {
    const authUrl = text.match(/https:\/\/accounts\.google\.com[^"'<>\\s]+/)?.[0];
    if (authUrl) {
      console.log('AUTH_URL', authUrl);
      writeFileSync(join(__dirname, '..', 'auth-url.txt'), authUrl);
    }
    console.log(text.slice(0, 800));
    process.exit(2);
  }
  try {
    const json = JSON.parse(text);
    console.log(JSON.stringify(json, null, 2));
    if (json.spreadsheetId) writeFileSync(OUT, JSON.stringify({ ok: true, ...json }, null, 2));
  } catch {
    console.log(text.slice(0, 1000));
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
