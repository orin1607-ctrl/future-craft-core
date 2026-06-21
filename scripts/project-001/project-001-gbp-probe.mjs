import { mkdirSync, writeFileSync } from 'fs';
import { getAuthenticatedClient, loadGoogleAuthLibrary } from '../google/_lib/auth.mjs';
import { getP001Scopes } from './_lib/auth.mjs';
import { P001 } from './_lib/config.mjs';
import { loadP001Config } from './_lib/config.mjs';
import { resolveProjectId } from './_lib/gcp.mjs';
import { consoleLink } from './_lib/legacy-guard.mjs';
import { checkGbpOAuth, fetchGbpAccountsAndLocations } from './_lib/gbp.mjs';

async function main() {
  const { id: projectId } = resolveProjectId();
  const cfg = loadP001Config();
  const auth = await getAuthenticatedClient({ scopes: getP001Scopes() });
  const google = await loadGoogleAuthLibrary();
  const oauth = checkGbpOAuth(auth);
  const report = {
    timestamp: new Date().toISOString(),
    ok: false,
    oauth,
    accounts: [],
    locations: [],
    errors: [],
  };

  if (!oauth.hasBusinessManage) {
    report.errors.push({
      api: 'oauth',
      error: 'Missing business.manage scope — run npm run project-001:auth',
    });
  } else {
    const base = await fetchGbpAccountsAndLocations(auth, google, cfg.gbp_business_hint);
    report.accounts = base.accounts;
    report.locations = base.locations.map((l) => ({
      account: l.account,
      name: l.name,
      title: l.title,
      website: l.website,
      address: l.address,
      match_hint: l.matchHint,
    }));
    report.errors.push(...base.errors.map((e) => ({ api: e.api, error: e.message, code: e.code })));
    report.matched_business = base.matched
      ? {
          account: base.matched.account,
          name: base.matched.name,
          title: base.matched.title,
          website: base.matched.website,
          address: base.matched.address,
          match_hint: base.matched.matchHint,
        }
      : null;
  }

  report.ok = report.locations.length > 0 || report.accounts.length > 0;

  for (const e of report.errors) {
    const status = e.code;
    if (status === 429 || String(e.error || e.message).includes('Quota exceeded')) {
      e.owner_gate = {
        cause: 'GBP API quota — ensure OAuth is on Project001AIMarketing (not legacy)',
        fix: [
          'npm run project-001:migrate (if not done)',
          'npm run project-001:enable-apis',
          'npm run project-001:auth',
          'Retry: npm run project-001:gbp-probe',
        ],
        enable_api: projectId
          ? consoleLink('apis/library/mybusinessaccountmanagement.googleapis.com', projectId)
          : 'https://console.cloud.google.com/apis/library/mybusinessaccountmanagement.googleapis.com?project=burnished-craft-466809-v1',
      };
    } else if (status === 403) {
      e.owner_gate = {
        cause: 'Permission or API not enabled on Project001AIMarketing',
        enable_api: projectId
          ? consoleLink('apis/library/mybusinessaccountmanagement.googleapis.com', projectId)
          : 'https://console.cloud.google.com/apis/library/mybusinessaccountmanagement.googleapis.com?project=burnished-craft-466809-v1',
        gbp_access: 'https://business.google.com → Add orin1607@gmail.com as Manager on the location',
      };
    }
  }

  mkdirSync(P001.auditOut, { recursive: true });
  writeFileSync(`${P001.auditOut}/gbp-probe.json`, JSON.stringify(report, null, 2));

  console.log('\n=== Google Business Profile Probe ===\n');
  console.log('OAuth business.manage:', oauth.hasBusinessManage ? '✓' : '✗');
  console.log('Accounts:', report.accounts.length);
  for (const a of report.accounts) console.log('  -', a.accountName, `(${a.type})`);
  console.log('\nLocations:', report.locations.length);
  for (const l of report.locations) console.log('  -', l.title, '→', l.name);
  if (report.matched_business) console.log('\n✓ Target business:', report.matched_business.title);
  if (report.errors.length) {
    console.log('\nErrors:');
    for (const e of report.errors) console.log(' ', e.api, ':', e.error || e.message);
  }
  if (!report.ok) {
    console.log('\n❌ GBP API access blocked — see owner_gate in gbp-probe.json');
    process.exit(1);
  }
  console.log('\n✓ GBP probe OK — run npm run project-001:gbp-sync for full data\n');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
