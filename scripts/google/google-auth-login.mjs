/**
 * Google OAuth login — saves refresh token locally.
 * STOPS for owner browser approval (one-time / refresh).
 */
import { existsSync } from 'fs';
import { resolveCredentialsPath } from './_lib/paths.mjs';
import { validateCredentialsForFleetOS, warnRedirectUriSetup, getAuthenticatedClient } from './_lib/auth.mjs';
import { analyzeCredentialFile } from './_lib/credentials.mjs';

const force = process.argv.includes('--force');

if (!existsSync(resolveCredentialsPath())) {
  console.error('\n❌ Missing credentials:', resolveCredentialsPath());
  console.error('\nOwner action required (one step):');
  console.error('  Download OAuth Desktop JSON from Google Cloud Console');
  console.error('  Save as: integrations/google/credentials.oauth.json');
  console.error('  Guide: docs/GOOGLE_INTEGRATION.md → "Owner Step 1"\n');
  process.exit(1);
}

const cred = analyzeCredentialFile(resolveCredentialsPath());
if (cred?.isPlaygroundOnly) {
  validateCredentialsForFleetOS();
}
warnRedirectUriSetup();
await getAuthenticatedClient({ forceLogin: force });
console.log('\n✅ Google auth complete. Run: npm run google:check\n');
