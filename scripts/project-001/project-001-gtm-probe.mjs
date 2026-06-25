import { mkdirSync, writeFileSync } from 'fs';
import { getAuthenticatedClient } from '../google/_lib/auth.mjs';
import { getP001Scopes, tokenHasOptionalScope } from './_lib/auth.mjs';
import { P001 } from './_lib/config.mjs';
import { gtmOAuthStatus, probeGtm } from './_lib/gtm.mjs';

async function main() {
  console.log('\n=== Google Tag Manager Probe (read-only) ===\n');

  const auth = await getAuthenticatedClient({ scopes: getP001Scopes() });
  const oauth = gtmOAuthStatus(auth);
  const accessToken = auth.credentials?.access_token;

  const report = {
    timestamp: new Date().toISOString(),
    ok: false,
    oauth: oauth,
    ...oauth,
    accounts: [],
    containers: [],
    errors: [],
    owner_gate: null,
  };

  if (!accessToken) {
    report.errors.push({ step: 'oauth', message: 'No access token — run npm run project-001:auth' });
    save(report);
    process.exit(1);
  }

  if (!tokenHasOptionalScope('tagmanager')) {
    report.errors.push({
      step: 'oauth',
      message: 'Missing tagmanager.readonly scope — run npm run project-001:auth -- --force',
    });
    report.owner_gate = {
      directLink: 'https://console.cloud.google.com/apis/library/tagmanager.googleapis.com?project=project001aimarketing',
      reauthCommand: 'npm run project-001:auth -- --force',
      scope: oauth.requiredScope,
    };
    save(report);
    console.log('OAuth tagmanager scope: ✗');
    console.log('Run: npm run project-001:auth -- --force\n');
    process.exit(1);
  }

  console.log('OAuth tagmanager scope: ✓');
  const probe = await probeGtm(accessToken);
  Object.assign(report, probe);

  if (report.ok) {
    console.log('Accounts:', report.accounts.length);
    console.log('Containers:', report.containers.length);
    for (const c of report.containers) console.log(`  - ${c.publicId} ${c.name}`);
  } else if (report.errors.length) {
    console.log('Errors:');
    for (const e of report.errors) console.log(' ', e.step, ':', e.message);
  }

  save(report);
  console.log(report.ok ? '\n✓ GTM probe OK\n' : '\n⏳ GTM pending — see owner_gate in gtm-probe.json\n');
  process.exit(report.ok ? 0 : 1);
}

function save(report) {
  mkdirSync(P001.auditOut, { recursive: true });
  writeFileSync(`${P001.auditOut}/gtm-probe.json`, JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
