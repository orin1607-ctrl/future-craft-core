import { readFileSync } from 'fs';
import { getAuthenticatedClient, loadGoogleAuthLibrary } from '../google/_lib/auth.mjs';
import { getP001Scopes, tokenHasP001Scopes, tokenHasOptionalScope } from './_lib/auth.mjs';

const force = process.argv.includes('--force');
const withGtm = process.argv.includes('--gtm') || force;

async function main() {
  if (!tokenHasP001Scopes()) {
    console.log('\nProject 001 needs additional OAuth scopes (Search Console + Analytics).');
    console.log('Opening browser for owner approval...\n');
  } else if (withGtm && !tokenHasOptionalScope('tagmanager')) {
    console.log('\nProject 001 needs optional GTM scope (tagmanager.readonly).');
    console.log('Opening browser for owner approval...\n');
  }

  const auth = await getAuthenticatedClient({
    forceLogin: force || !tokenHasP001Scopes() || (withGtm && !tokenHasOptionalScope('tagmanager')),
    scopes: getP001Scopes({ includeOptional: withGtm }),
  });

  const google = await loadGoogleAuthLibrary();
  const oauth2 = google.oauth2({ version: 'v2', auth });
  const me = await oauth2.userinfo.get();
  console.log('Authenticated:', me.data.email);
  console.log('P001 scopes:', tokenHasP001Scopes() ? 'OK' : 'check token.json scope field');
  console.log('GTM scope:', tokenHasOptionalScope('tagmanager') ? 'OK' : 'run with --gtm or --force');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
