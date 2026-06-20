/**
 * Full post-setup verification — audit, API probes, Drive folders, final report.
 */
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { PATHS, loadJson } from './_lib/paths.mjs';

const OUT = PATHS.auditOut;
mkdirSync(OUT, { recursive: true });

const run = (cmd) => execSync(cmd, { cwd: PATHS.root, stdio: 'inherit', shell: true });

const steps = [];

const runStep = (name, fn) => {
  try {
    fn();
    steps.push({ step: name, status: 'ok' });
  } catch (e) {
    steps.push({ step: name, status: 'failed', error: e.message?.slice(0, 200) });
    throw e;
  }
};

runStep('audit', () => run('npm run google:audit'));
runStep('connection_check', () => run('npm run google:check'));
runStep('drive_folders', () => run('node scripts/google/google-setup-drive.mjs'));
runStep('final_report', () => run('node scripts/google/google-final-report.mjs'));

const check = loadJson(join(OUT, 'connection-check.json'), {});
const drive = loadJson(join(OUT, 'drive-folders.json'), {});
const config = loadJson(PATHS.config, {});

const complete = {
  at: new Date().toISOString(),
  setup_complete: true,
  owner_gate: 0,
  account: check.probes?.userinfo?.email || config.default_account_hint,
  gcp_project: config.gcp_project_id,
  apis_ok: check.summary?.ok || [],
  apis_failed: check.summary?.failed || [],
  drive_folders: drive.folders || null,
  steps,
  optional_later: [
    'Apps Script clasp deploy (requires clasp login — separate Google approval)',
    'Delete Dalia-conn-test-* probe files in Drive (optional)',
    'Production Google folder — enable after go-live approval',
  ],
};

writeFileSync(join(OUT, 'SETUP-COMPLETE.json'), JSON.stringify(complete, null, 2));

const md = `# Google Integration — Setup Complete

**Generated:** ${complete.at}

## Status: ✅ COMPLETE (Staging)

| Item | Value |
|------|-------|
| Account | ${complete.account} |
| GCP Project | ${complete.gcp_project} |
| APIs verified | ${complete.apis_ok.join(', ')} |
| Drive root | ${drive.folders?.root?.name} (\`${drive.folders?.root?.id}\`) |
| Staging folder | ${drive.folders?.staging?.name} |
| Production folder | ${drive.folders?.production?.name} (reserved) |

## NPM commands

\`\`\`bash
npm run google:audit
npm run google:check
npm run google:setup-drive
npm run google:verify
\`\`\`

## Optional later

${complete.optional_later.map((x) => `- ${x}`).join('\n')}

## Artifacts

- \`connection-check.json\`
- \`drive-folders.json\`
- \`SETUP-COMPLETE.json\`
- \`FINAL-REPORT.md\`
`;

writeFileSync(join(OUT, 'SETUP-COMPLETE.md'), md);
console.log('\n✅ Google integration setup complete.\n');
console.log('Report:', join(OUT, 'SETUP-COMPLETE.md'));
