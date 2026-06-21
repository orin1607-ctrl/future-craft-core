import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { getAuthenticatedClient, loadGoogleAuthLibrary } from '../google/_lib/auth.mjs';
import { getP001Scopes } from './_lib/auth.mjs';
import { P001 } from './_lib/config.mjs';
import { loadP001Config } from './_lib/config.mjs';
import { resolveProjectId } from './_lib/gcp.mjs';
import { consoleLink } from './_lib/legacy-guard.mjs';
import { checkGbpOAuth, fetchGbpAccountsAndLocations } from './_lib/gbp.mjs';
import { buildGbpOwnerGate, detectGbpGateStatus } from './_lib/owner-gates.mjs';

async function main() {
  const { id: projectId } = resolveProjectId();
  const cfg = loadP001Config();
  const auth = await getAuthenticatedClient({ scopes: getP001Scopes() });
  const google = await loadGoogleAuthLibrary();
  const oauth = checkGbpOAuth(auth);
  const gbpGate = buildGbpOwnerGate(projectId);
  const report = {
    timestamp: new Date().toISOString(),
    ok: false,
    oauth,
    accounts: [],
    locations: [],
    errors: [],
    owner_gate: null,
    prep: {
      oauth_scope_business_manage: oauth.hasBusinessManage,
      gcp_project_id: projectId,
      gcp_project_number: gbpGate.gcpProjectNumber,
      business_hint: cfg.gbp_business_hint,
      apis_configured: [
        'mybusinessaccountmanagement.googleapis.com',
        'mybusinessbusinessinformation.googleapis.com',
        'businessprofileperformance.googleapis.com',
      ],
      next_command_after_approval: 'npm run project-001:gbp-connect',
    },
  };

  if (!oauth.hasBusinessManage) {
    report.errors.push({
      api: 'oauth',
      error: 'Missing business.manage scope — run npm run project-001:auth -- --force',
    });
    report.owner_gate = {
      ...gbpGate,
      cause: 'missing_oauth_scope',
    };
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

  const status = detectGbpGateStatus(report, null);
  if (!report.ok && status.reason === 'pending_google_api_approval') {
    report.owner_gate = gbpGate;
    for (const e of report.errors) {
      if (e.code === 429 || String(e.error || '').includes('Quota exceeded')) {
        e.owner_gate = {
          id: gbpGate.id,
          directLink: gbpGate.directLink,
          cause: 'quota=0 — Basic API Access not yet approved by Google',
          gcp_project_number: gbpGate.gcpProjectNumber,
        };
      } else if (e.code === 403) {
        e.owner_gate = {
          cause: 'Permission or API not enabled',
          enable_api: projectId
            ? consoleLink('apis/library/mybusinessaccountmanagement.googleapis.com', projectId)
            : gbpGate.alternateLinks.enable_account_mgmt_api,
          gbp_access: gbpGate.alternateLinks.business_profile,
        };
      }
    }
  }

  mkdirSync(P001.auditOut, { recursive: true });
  writeFileSync(`${P001.auditOut}/gbp-probe.json`, JSON.stringify(report, null, 2));

  console.log('\n=== Google Business Profile Probe ===\n');
  console.log('OAuth business.manage:', oauth.hasBusinessManage ? '✓' : '✗');
  console.log('GCP project:', projectId || '(unknown)');
  console.log('Project number (for GBP form):', gbpGate.gcpProjectNumber);
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
    console.log('\n❌ GBP API access blocked');
    if (report.owner_gate?.directLink) {
      console.log('\nOwner Gate — Basic API Access:');
      console.log('  URL:', report.owner_gate.directLink);
      console.log('  Project Number:', gbpGate.gcpProjectNumber);
      console.log('  Full guide: docs/audit-reports/project-001/OWNER-GATES-GBP-ADS.md');
      console.log('  After approval: npm run project-001:gbp-connect');
    }
    process.exit(1);
  }
  console.log('\n✓ GBP probe OK — run npm run project-001:gbp-sync or npm run project-001:gbp-connect\n');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
