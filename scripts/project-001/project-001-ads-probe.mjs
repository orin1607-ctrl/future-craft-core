import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { getAuthenticatedClient } from '../google/_lib/auth.mjs';
import { getP001Scopes } from './_lib/auth.mjs';
import { P001 } from './_lib/config.mjs';
import { resolveProjectId } from './_lib/gcp.mjs';
import { getAdsCredentials } from './_lib/ads-env.mjs';
import { listAccessibleCustomers } from './_lib/ads.mjs';
import { buildAdsOwnerGate } from './_lib/owner-gates.mjs';

async function main() {
  const { developerToken, customerId, loginCustomerId } = getAdsCredentials();
  const { id: projectId } = resolveProjectId();
  const adsGate = buildAdsOwnerGate(projectId);

  const report = {
    timestamp: new Date().toISOString(),
    gcp_project_id: projectId,
    ok: false,
    developer_token_set: Boolean(developerToken),
    customer_id: customerId || null,
    login_customer_id: loginCustomerId || null,
    oauth_adwords_scope: null,
    accessible_customers: [],
    errors: [],
    owner_gate: null,
    prep: {
      oauth_scope_adwords: false,
      gcp_ads_api: 'googleads.googleapis.com',
      env_file: existsSync('.env.ads') ? '.env.ads' : 'missing — copy from .env.ads.example',
      next_command_after_token: 'npm run project-001:ads-connect',
    },
  };

  console.log('\n=== Google Ads API Probe (read-only) ===\n');

  if (!developerToken) {
    report.owner_gate = adsGate;
    save(report);
    console.log('Developer token missing');
    console.log('\nOwner Gate:');
    console.log('  1. URL:', adsGate.directLink);
    console.log('  2. Copy token → .env.ads (see .env.ads.example)');
    console.log('  3. Run: npm run project-001:ads-connect');
    console.log('\nFull guide: docs/audit-reports/project-001/OWNER-GATES-GBP-ADS.md\n');
    process.exit(10);
  }

  const auth = await getAuthenticatedClient({ scopes: getP001Scopes() });
  const scope = String(auth.credentials?.scope || '');
  report.oauth_adwords_scope = scope.includes('adwords');
  report.prep.oauth_scope_adwords = report.oauth_adwords_scope;

  const accessToken = auth.credentials?.access_token;
  if (!accessToken) {
    report.errors.push({ step: 'oauth', error: 'No access token — run npm run project-001:auth' });
    save(report);
    process.exit(1);
  }

  if (!report.oauth_adwords_scope) {
    report.errors.push({
      step: 'oauth',
      error: 'Missing adwords scope — run npm run project-001:auth -- --force',
    });
    save(report);
    process.exit(1);
  }

  try {
    report.accessible_customers = (await listAccessibleCustomers(accessToken, developerToken)).map(
      (id) => `customers/${id}`,
    );
    report.ok = report.accessible_customers.length > 0;
    console.log('Developer token: ✓');
    console.log('OAuth adwords scope: ✓');
    console.log('Accessible customers:', report.accessible_customers.length);
    for (const c of report.accessible_customers) console.log('  -', c);

    if (customerId) {
      console.log('\nConfigured customer:', customerId);
    } else if (report.accessible_customers[0]) {
      console.log('\nTip: set GOOGLE_ADS_CUSTOMER_ID in .env.ads to pin account');
    }
  } catch (e) {
    report.errors.push({ step: 'listAccessibleCustomers', error: e.message?.slice(0, 400) });
    if (String(e.message).includes('DEVELOPER_TOKEN')) {
      report.owner_gate = {
        ...adsGate,
        cause: 'developer_token_not_approved_for_production',
        note: 'Test token works only with test accounts until Google approves production access',
      };
    }
    save(report);
    console.error('Ads probe failed:', e.message);
    if (report.owner_gate?.directLink) {
      console.log('\nCheck token status:', report.owner_gate.directLink);
    }
    process.exit(1);
  }

  save(report);
  console.log('\n✓ Google Ads API probe OK — run npm run project-001:ads-sync or npm run project-001:ads-connect\n');
}

function save(report) {
  mkdirSync(P001.auditOut, { recursive: true });
  writeFileSync(`${P001.auditOut}/ads-probe.json`, JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
