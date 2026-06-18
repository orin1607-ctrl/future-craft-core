/**
 * Run createProjectSkeleton via Google Apps Script API.
 */
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const SCRIPT_ID = '1YLwTgDGDjPPD0mAjijqAlsqokM_JB78Xkj0DCoakeVhGs0MY8AnEAovR';
const FN = process.argv[2] || 'runProject001Setup';

function getAccessToken() {
  const rcPath = join(homedir(), '.clasprc.json');
  const rc = JSON.parse(readFileSync(rcPath, 'utf8'));
  const token = rc.tokens?.default?.access_token;
  if (!token) throw new Error('No clasp access token. Run: npx clasp login');
  return token;
}

async function run() {
  const token = getAccessToken();
  const res = await fetch(`https://script.googleapis.com/v1/scripts/${SCRIPT_ID}:run`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ function: FN, devMode: true }),
  });
  const json = await res.json();
  if (!res.ok) {
    console.error(JSON.stringify(json, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify(json, null, 2));
  if (json.error) process.exit(1);
}

run().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
