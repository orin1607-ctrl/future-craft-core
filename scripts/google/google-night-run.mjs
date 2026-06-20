/**
 * Overnight Owner-Gate runner — audit, pick credentials, continue until next gate.
 */
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync, spawn } from 'child_process';
import { PATHS } from './_lib/paths.mjs';
import { getOwnerGateStatus, pickAndInstallCredentials } from './_lib/credentials.mjs';

const OUT = PATHS.auditOut;
mkdirSync(OUT, { recursive: true });

const log = (msg) => console.log(`[google:night-run] ${msg}`);
const run = (cmd) => execSync(cmd, { cwd: PATHS.root, stdio: 'inherit', shell: true });

const state = {
  at: new Date().toISOString(),
  phases: [],
};

log('audit...');
run('npm run google:audit');
state.phases.push({ phase: 'audit', status: 'ok' });

log('pick credentials from Downloads...');
const pick = pickAndInstallCredentials();
writeFileSync(join(OUT, 'pick-credentials.json'), JSON.stringify({ at: new Date().toISOString(), ...pick }, null, 2));
state.phases.push({
  phase: 'pick_credentials',
  status: pick.installed ? 'installed' : pick.reason || 'no_change',
  current: pick.current,
});

let gate = getOwnerGateStatus();
state.owner_gate = gate.gate;
state.credentials = gate.credentials;

if (gate.gate === 1) {
  writeOwnerGatesMd(gate);
  writeFileSync(join(OUT, 'night-run-state.json'), JSON.stringify(state, null, 2));
  run('node scripts/google/google-final-report.mjs');
  log('STOP — Owner Gate 1 (credentials JSON)');
  process.exit(2);
}

if (gate.gate === 2) {
  writeOwnerGatesMd(gate);
  writeFileSync(join(OUT, 'night-run-state.json'), JSON.stringify(state, null, 2));
  log('starting OAuth listener (Owner Gate 2)...');
  const child = spawn('npm run google:auth', {
    cwd: PATHS.root,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  let oauthUrl = null;
  const onData = (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);
    const match = text.match(/https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth[^\s]*/);
    if (match) oauthUrl = match[0];
    if (oauthUrl) {
      gate.oauth_url = oauthUrl;
      writeOwnerGatesMd(gate);
    }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);

  child.on('close', async (code) => {
    gate = getOwnerGateStatus();
    if (gate.gate === 0 || existsSync(PATHS.token)) {
      try {
        run('npm run google:check');
        state.phases.push({ phase: 'connection_check', status: 'ok' });
        run('node scripts/google/google-final-report.mjs');
        state.phases.push({ phase: 'final_report', status: 'ok' });
        state.complete = true;
        state.owner_gate = 0;
      } catch (e) {
        state.error = e.message;
      }
    } else {
      state.owner_gate = 2;
      state.oauth_exit_code = code;
    }
    writeFileSync(join(OUT, 'night-run-state.json'), JSON.stringify(state, null, 2));
    writeOwnerGatesMd(getOwnerGateStatus());
    process.exit(code === 0 ? 0 : 3);
  });
} else {
  log('token present — connection check...');
  run('npm run google:check');
  state.phases.push({ phase: 'connection_check', status: 'ok' });
  run('node scripts/google/google-final-report.mjs');
  state.phases.push({ phase: 'final_report', status: 'ok' });
  state.complete = true;
  state.owner_gate = 0;
  writeOwnerGatesMd(getOwnerGateStatus());
  writeFileSync(join(OUT, 'night-run-state.json'), JSON.stringify(state, null, 2));
  log('complete');
}

function writeOwnerGatesMd(g) {
  const md = `# Google Integration — Owner Gates

**עודכן:** ${new Date().toISOString()}

## מצב נוכחי

| פריט | ערך |
|------|-----|
| Owner Gate פעיל | **${g.gate || 'אין — הושלם'}** |
| credentials | ${g.credentials ? `${g.credentials.projectId} (${g.credentials.clientType})` : 'חסר'} |
| credentials תקין | ${g.credentials?.isUsable ? 'כן' : 'לא'} |
| token.json | ${g.hasToken ? 'כן' : 'לא'} |

${g.gate === 1 ? `## Gate 1 — ${g.title}

**פעולה אחת:** ${g.instruction}

קישור: ${g.link}

${g.credentials?.isPlaygroundOnly ? `> הקובץ הנוכחי שייך לפרויקט זר (\`${g.credentials.projectId}\`) — OAuth Playground בלבד. יש להוריד JSON מ-**Dalia Login**.
` : ''}` : ''}

${g.gate === 2 ? `## Gate 2 — ${g.title}

**פעולה אחת:** ${g.instruction}

${g.oauth_url ? `**קישור OAuth (לחץ ואשר):**

${g.oauth_url}
` : 'הרץ `npm run google:auth` אם הקישור לא מופיע.'}
` : ''}

${g.gate === 0 ? `## הושלם

הרץ \`npm run google:check\` לרענון. דוח: \`docs/audit-reports/google-integration/FINAL-REPORT.md\`
` : ''}

---

פקודות:
- \`npm run google:night-run\` — המשך אוטומטי עד Gate הבא
- \`npm run google:continue\` — auth + check + report
`;
  writeFileSync(join(OUT, 'OWNER-GATES.md'), md);
}
