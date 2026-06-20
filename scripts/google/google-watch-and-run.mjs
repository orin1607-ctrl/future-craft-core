/**
 * Poll for usable OAuth JSON, install, then run full pipeline until next owner gate.
 */
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync, spawn } from 'child_process';
import { PATHS } from './_lib/paths.mjs';
import { getOwnerGateStatus, pickAndInstallCredentials, tryImportPasteCredentials } from './_lib/credentials.mjs';

const OUT = PATHS.auditOut;
mkdirSync(OUT, { recursive: true });

const maxWait = Number(process.env.GOOGLE_WATCH_MS || 30 * 60 * 1000);
const interval = Number(process.env.GOOGLE_WATCH_INTERVAL_MS || 3000);

const log = (msg) => console.log(`[google:watch] ${msg}`);
const run = (cmd) => execSync(cmd, { cwd: PATHS.root, stdio: 'inherit', shell: true });

function writeGateDoc(gate, oauthUrl = null) {
  const md = `# Google Integration — Owner Gates

**עודכן:** ${new Date().toISOString()}

> מאזין אוטומטי פעיל. לאחר זיהוי JSON — OAuth → בדיקות → דוח.

| פריט | ערך |
|------|-----|
| Gate | **${gate.gate || 'הושלם'}** |
| credentials | ${gate.credentials ? `${gate.credentials.projectId} (${gate.credentials.clientType})` : 'ממתין'} |
| token | ${gate.hasToken ? 'כן' : 'לא'} |

${gate.gate === 2 && oauthUrl ? `## Gate 2 — אישור OAuth\n\n${oauthUrl}\n` : ''}
`;
  try {
    writeFileSync(join(OUT, 'OWNER-GATES.md'), md);
  } catch (e) {
    if (e.code !== 'EBUSY') throw e;
  }
}

const start = Date.now();
log(`waiting up to ${Math.round(maxWait / 60000)}m for credentials (paste file or Downloads)...`);

while (Date.now() - start < maxWait) {
  tryImportPasteCredentials();
  pickAndInstallCredentials();
  const gate = getOwnerGateStatus();
  writeGateDoc(gate);

  if (gate.credentials?.isUsable) {
    log(`credentials ready: ${gate.credentials.projectId} (${gate.credentials.clientType})`);
    break;
  }
  await new Promise((r) => setTimeout(r, interval));
}

const gate = getOwnerGateStatus();
if (!gate.credentials?.isUsable) {
  log('timeout — no usable JSON');
  process.exit(1);
}

if (!existsSync(PATHS.token)) {
  log('starting OAuth (Gate 2)...');
  await new Promise((resolve, reject) => {
    const child = spawn('npm run google:auth', {
      cwd: PATHS.root,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let oauthUrl = null;
    const onData = (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);
      const m = text.match(/https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth[^\s]*/);
      if (m) {
        oauthUrl = m[0];
        writeGateDoc(getOwnerGateStatus(), oauthUrl);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`google:auth exit ${code}`))));
  });
}

log('API probe...');
run('npm run google:check');
log('final report...');
run('node scripts/google/google-final-report.mjs');
writeFileSync(join(OUT, 'watch-run-complete.json'), JSON.stringify({
  at: new Date().toISOString(),
  complete: true,
}, null, 2));
log('done');
