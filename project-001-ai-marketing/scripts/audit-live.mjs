/**
 * Live audit of Project 001 Google connectivity.
 */
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SETUP = JSON.parse(readFileSync(join(__dirname, '..', 'setup-result.json'), 'utf8'));
const SCRIPT_ID = SETUP.appsScript.id;
const SS_ID = SETUP.spreadsheet.id;

function token() {
  const rc = JSON.parse(readFileSync(join(homedir(), '.clasprc.json'), 'utf8'));
  return rc.tokens?.default?.access_token || null;
}

async function probe(name, fn) {
  try {
    const r = await fn();
    return { name, ok: true, ...r };
  } catch (e) {
    return { name, ok: false, error: String(e.message || e).slice(0, 300) };
  }
}

async function main() {
  const t = token();
  const out = { hasClaspToken: Boolean(t), probes: [], deployments: [], claspRun: null };

  if (!t) {
    console.log(JSON.stringify({ ...out, error: 'No clasp token' }, null, 2));
    process.exit(1);
  }

  out.probes.push(await probe('drive', async () => {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${SETUP.driveRoot.id}?fields=id,name,trashed`, { headers: { Authorization: `Bearer ${t}` } });
    const j = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(j));
    return { status: r.status, name: j.name };
  }));

  out.probes.push(await probe('sheets', async () => {
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SS_ID}?fields=properties.title,sheets.properties.title`, { headers: { Authorization: `Bearer ${t}` } });
    const j = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(j));
    return { status: r.status, title: j.properties?.title, tabs: (j.sheets || []).map((s) => s.properties.title) };
  }));

  out.probes.push(await probe('docs', async () => {
    const docId = SETUP.templates.article.docId;
    const r = await fetch(`https://docs.googleapis.com/v1/documents/${docId}`, { headers: { Authorization: `Bearer ${t}` } });
    const j = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(j));
    return { status: r.status, title: j.title };
  }));

  out.probes.push(await probe('apps_script_api', async () => {
    const r = await fetch(`https://script.googleapis.com/v1/projects/${SCRIPT_ID}`, { headers: { Authorization: `Bearer ${t}` } });
    const j = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(j));
    return { status: r.status, title: j.title };
  }));

  out.probes.push(await probe('gmail', async () => {
    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: `Bearer ${t}` } });
    const j = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(j));
    return { status: r.status, email: j.emailAddress };
  }));

  out.probes.push(await probe('scripts_run_dev', async () => {
    const r = await fetch(`https://script.googleapis.com/v1/scripts/${SCRIPT_ID}:run`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ function: 'runProject001Verify', devMode: true }),
    });
    const j = await r.json();
    return { status: r.status, result: j.response?.result, error: j.error?.message };
  }));

  const depRes = await fetch(`https://script.googleapis.com/v1/projects/${SCRIPT_ID}/deployments`, { headers: { Authorization: `Bearer ${t}` } });
  const depJson = await depRes.json();
  if (depRes.ok && depJson.deployments) {
    out.deployments = depJson.deployments.map((d) => ({
      id: d.deploymentId,
      description: d.deploymentConfig?.description,
      version: d.deploymentConfig?.versionNumber,
      entryPoints: (d.entryPoints || []).map((e) => ({
        type: e.entryPointType,
        webApp: e.webApp ? { url: e.webApp.url, access: e.webApp.access, executeAs: e.webApp.executeAs } : null,
        executionApi: e.executionApi || null,
      })),
    }));
  }

  console.log(JSON.stringify(out, null, 2));
}

main();
