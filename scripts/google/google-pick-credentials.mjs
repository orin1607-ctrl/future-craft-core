/**
 * Auto-install OAuth credentials from ~/Downloads when a usable file appears.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { PATHS } from './_lib/paths.mjs';
import { pickAndInstallCredentials } from './_lib/credentials.mjs';

const result = pickAndInstallCredentials();
mkdirSync(PATHS.auditOut, { recursive: true });
writeFileSync(join(PATHS.auditOut, 'pick-credentials.json'), JSON.stringify({
  at: new Date().toISOString(),
  ...result,
}, null, 2));

if (result.installed) {
  console.log('✅ Installed credentials from:', result.best.path);
  console.log('   project:', result.current?.projectId);
  console.log('   type:', result.current?.clientType);
} else {
  console.log('No new usable credentials in Downloads.');
  if (result.current) {
    console.log('Current:', result.current.projectId, result.current.clientType, result.current.isUsable ? 'usable' : 'BLOCKED');
  }
  if (result.reason) console.log('Reason:', result.reason);
}

process.exit(result.current?.isUsable ? 0 : 2);
