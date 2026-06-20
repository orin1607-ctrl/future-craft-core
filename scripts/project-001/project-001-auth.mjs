import { readFileSync } from 'fs';
import { getAuthenticatedClient, loadGoogleAuthLibrary } from '../google/_lib/auth.mjs';
import { getP001Scopes, tokenHasP001Scopes } from './_lib/auth.mjs';

const force = process.argv.includes('--force');

async function main() {
  if (!tokenHasP001Scopes()) {
    console.log('\nProject 001 needs additional OAuth scopes (Search Console + Analytics).');
    console.log('Opening browser for owner approval...\n');
  }

  const auth = await getAuthenticatedClient({
    forceLogin: force || !tokenHasP001Scopes(),
    scopes: getP001Scopes(),
  });

  const google = await loadGoogleAuthLibrary();
  const oauth2 = google.oauth2({ version: 'v2', auth });
  const me = await oauth2.userinfo.get();
  console.log('Authenticated:', me.data.email);
  console.log('P001 scopes:', tokenHasP001Scopes() ? 'OK' : 'check token.json scope field');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
