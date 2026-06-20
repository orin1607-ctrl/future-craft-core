/**
 * Master Google integration bootstrap — runs all automatable steps.
 * Exit codes: 0=complete, 1=error, 2=owner gate (credentials), 3=owner gate (OAuth browser)
 */
import { existsSync, copyFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { PATHS, loadJson } from './_lib/paths.mjs';

const OUT = PATHS.auditOut;
mkdirSync(OUT, { recursive: true });

function log(msg) {
  console.log(`[google:bootstrap] ${msg}`);
}

function run(cmd) {
  execSync(cmd, { cwd: PATHS.root, stdio: 'inherit', shell: true });
}

const state = {
  at: new Date().toISOString(),
  phases: [],
};

// Phase 1: ensure config from example
if (!existsSync(PATHS.config) && existsSync(PATHS.configExample)) {
  copyFileSync(PATHS.configExample, PATHS.config);
  state.phases.push({ phase: 'config', status: 'created from example' });
  log('Created integrations/google/config.json from example');
} else {
  state.phases.push({ phase: 'config', status: existsSync(PATHS.config) ? 'ok' : 'missing example' });
}

// Phase 2: audit
log('Running audit...');
run('npm run google:audit');
state.phases.push({ phase: 'audit', status: 'ok' });

const credPath = PATHS.credentials.replace(/\\/g, '/');
const hasCreds = existsSync(PATHS.credentials);
const hasToken = existsSync(PATHS.token);

if (!hasCreds) {
  state.phases.push({ phase: 'credentials', status: 'OWNER_GATE' });
  state.owner_gate = 1;
  state.instruction =
    'פתח https://console.cloud.google.com/apis/credentials/oauthclient → Create OAuth client ID → Desktop app → הורד JSON → שמור בשם integrations/google/credentials.oauth.json → כתוב "Google credentials ready"';
  writeFileSync(join(OUT, 'bootstrap-state.json'), JSON.stringify(state, null, 2));
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  OWNER GATE 1 — Google Cloud Credentials (פעולה אחת)');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`
1. פתח: https://console.cloud.google.com/projectcreate
   צור פרויקט: dalia-fleetos

2. הפעל APIs (קישור ישיר לכל אחד — לחץ Enable):
   • Drive:   https://console.cloud.google.com/apis/library/drive.googleapis.com
   • Sheets:  https://console.cloud.google.com/apis/library/sheets.googleapis.com
   • Gmail:   https://console.cloud.google.com/apis/library/gmail.googleapis.com
   • Calendar: https://console.cloud.google.com/apis/library/calendar-json.googleapis.com
   • Docs:    https://console.cloud.google.com/apis/library/docs.googleapis.com
   • Apps Script: https://console.cloud.google.com/apis/library/script.googleapis.com

3. OAuth consent: https://console.cloud.google.com/apis/credentials/consent
   (שם: Dalia FleetOS, אימייל תמיכה שלך)

4. Credentials → Create OAuth client ID → Desktop app → הורד JSON

5. שמור את הקובץ כ:
   integrations/google/credentials.oauth.json

6. כתוב בצ'אט: Google credentials ready
`);
  process.exit(2);
}

state.phases.push({ phase: 'credentials', status: 'ok' });

// Phase 3: OAuth login
if (!hasToken) {
  state.phases.push({ phase: 'oauth', status: 'OWNER_GATE' });
  state.owner_gate = 2;
  writeFileSync(join(OUT, 'bootstrap-state.json'), JSON.stringify(state, null, 2));
  log('Credentials found — starting OAuth (browser required)...');
  try {
    run('npm run google:auth');
  } catch (e) {
    console.error('OAuth failed:', e.message);
    process.exit(3);
  }
}

if (!existsSync(PATHS.token)) {
  state.owner_gate = 2;
  state.instruction = 'השלם אישור OAuth בדפדפן, או הרץ: npm run google:auth';
  writeFileSync(join(OUT, 'bootstrap-state.json'), JSON.stringify(state, null, 2));
  process.exit(3);
}

state.phases.push({ phase: 'oauth', status: 'ok' });

// Phase 4: connection check
log('Probing Google APIs...');
run('npm run google:check');
state.phases.push({ phase: 'connection_check', status: 'ok' });

// Phase 5: final report
run('node scripts/google/google-final-report.mjs');
state.phases.push({ phase: 'final_report', status: 'ok' });
state.complete = true;

writeFileSync(join(OUT, 'bootstrap-state.json'), JSON.stringify(state, null, 2));
log('Bootstrap complete.');
process.exit(0);
