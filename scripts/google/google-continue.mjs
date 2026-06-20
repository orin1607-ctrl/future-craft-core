/**
 * Continue after owner placed credentials — auth + check + report.
 */
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { PATHS } from './_lib/paths.mjs';
import { pickAndInstallCredentials } from './_lib/credentials.mjs';

if (!existsSync(PATHS.credentials)) {
  console.error('Missing integrations/google/credentials.oauth.json');
  process.exit(1);
}

pickAndInstallCredentials();

const run = (cmd) => execSync(cmd, { cwd: PATHS.root, stdio: 'inherit', shell: true });

if (!existsSync(PATHS.token)) {
  console.log('[google:continue] OAuth login...');
  run('npm run google:auth');
}

console.log('[google:continue] API probe...');
run('npm run google:check');

console.log('[google:continue] Final report...');
run('node scripts/google/google-final-report.mjs');

console.log('\n✅ Google integration continue complete.\n');
