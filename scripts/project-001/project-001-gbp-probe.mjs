import { mkdirSync, writeFileSync } from 'fs';
import { getAuthenticatedClient } from '../google/_lib/auth.mjs';
import { getP001Scopes } from './_lib/auth.mjs';
import { P001 } from './_lib/config.mjs';
import { resolveProjectId } from './_lib/gcp.mjs';
import { consoleLink } from './_lib/legacy-guard.mjs';

const BUSINESS_HINT = 'דליה';

async function main() {
  const { id: projectId } = resolveProjectId();
  const auth = await getAuthenticatedClient({ scopes: getP001Scopes() });
  const { google } = await import('googleapis');
  const report = { timestamp: new Date().toISOString(), ok: false, accounts: [], locations: [], errors: [] };

  // Account Management API
  try {
    const acct = google.mybusinessaccountmanagement({ version: 'v1', auth });
    const res = await acct.accounts.list();
    report.accounts = (res.data.accounts || []).map((a) => ({
      name: a.name,
      accountName: a.accountName,
      type: a.type,
      verificationState: a.verificationState,
    }));
  } catch (e) {
    const status = e.response?.status ?? e.code;
    report.errors.push({
      api: 'mybusinessaccountmanagement',
      error: e.message?.slice(0, 300),
      code: status,
      owner_gate: status === 429 || String(e.message).includes('Quota exceeded')
        ? {
            cause: 'GBP API quota — ensure OAuth is on Project001AIMarketing (not legacy)',
            fix: [
              'npm run project-001:migrate (if not done)',
              'npm run project-001:enable-apis',
              'npm run project-001:auth',
              'Retry: npm run project-001:gbp-probe',
            ],
            enable_api: projectId
              ? consoleLink(`apis/library/mybusinessaccountmanagement.googleapis.com`, projectId)
              : 'https://console.cloud.google.com/apis/library/mybusinessaccountmanagement.googleapis.com?project=burnished-craft-466809-v1',
          }
        : status === 403
          ? {
              cause: 'Permission or API not enabled on Project001AIMarketing',
              enable_api: projectId
                ? consoleLink(`apis/library/mybusinessaccountmanagement.googleapis.com`, projectId)
                : 'https://console.cloud.google.com/apis/library/mybusinessaccountmanagement.googleapis.com?project=burnished-craft-466809-v1',
              gbp_access: 'https://business.google.com → Add orin1607@gmail.com as Manager on the location',
            }
          : null,
    });
  }

  // Business Information — locations per account
  try {
    const biz = google.mybusinessbusinessinformation({ version: 'v1', auth });
    for (const acc of report.accounts) {
      const parent = acc.name;
      const locs = await biz.accounts.locations.list({
        parent,
        readMask: 'name,title,storefrontAddress,websiteUri,metadata',
      });
      for (const loc of locs.data.locations || []) {
        report.locations.push({
          account: acc.accountName,
          name: loc.name,
          title: loc.title,
          website: loc.websiteUri,
          address: loc.storefrontAddress?.addressLines?.join(', '),
          match_hint: String(loc.title || '').includes(BUSINESS_HINT),
        });
      }
    }
  } catch (e) {
    report.errors.push({ api: 'mybusinessbusinessinformation', error: e.message?.slice(0, 300), code: e.code });
  }

  report.ok = report.locations.length > 0 || report.accounts.length > 0;
  report.matched_business = report.locations.find((l) => l.match_hint) || report.locations[0] || null;

  mkdirSync(P001.auditOut, { recursive: true });
  writeFileSync(`${P001.auditOut}/gbp-probe.json`, JSON.stringify(report, null, 2));

  console.log('\n=== Google Business Profile Probe ===\n');
  console.log('Accounts:', report.accounts.length);
  for (const a of report.accounts) console.log('  -', a.accountName, `(${a.type})`);
  console.log('\nLocations:', report.locations.length);
  for (const l of report.locations) console.log('  -', l.title, '→', l.name);
  if (report.matched_business) console.log('\n✓ Target business:', report.matched_business.title);
  if (report.errors.length) {
    console.log('\nErrors:');
    for (const e of report.errors) console.log(' ', e.api, ':', e.error);
  }
  if (!report.ok) {
    console.log('\n❌ GBP API access blocked — see owner_gate below');
    process.exit(1);
  }
  console.log('\n✓ GBP probe OK\n');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
