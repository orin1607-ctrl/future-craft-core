import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { getAuthenticatedClient } from '../google/_lib/auth.mjs';
import { P001 } from './_lib/config.mjs';
import { resolveProjectId } from './_lib/gcp.mjs';

function loadEnv() {
  const out = {};
  for (const p of ['.env.ads', '.env.google']) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  }
  return out;
}

async function main() {
  const env = loadEnv();
  const developerToken = env.GOOGLE_ADS_DEVELOPER_TOKEN || process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const { id: projectId } = resolveProjectId();

  const report = {
    timestamp: new Date().toISOString(),
    gcp_project_id: projectId,
    ok: false,
    developer_token_set: Boolean(developerToken),
    accessible_customers: [],
    errors: [],
    owner_gate: null,
  };

  console.log('\n=== Google Ads API Probe (read-only) ===\n');

  if (!developerToken) {
    report.owner_gate = {
      title: 'Google Ads Developer Token',
      url: 'https://ads.google.com/aw/apicenter',
      steps: [
        'Sign in as orin1607@gmail.com',
        'Apply for / copy Developer Token',
        'Create .env.ads from .env.ads.example → GOOGLE_ADS_DEVELOPER_TOKEN=...',
        'Re-run: npm run project-001:ads-probe',
      ],
    };
    save(report);
    console.log('Developer token missing — see owner_gate in ads-probe.json');
    process.exit(10);
  }

  const auth = await getAuthenticatedClient();
  const accessToken = auth.credentials?.access_token;
  if (!accessToken) {
    report.errors.push({ step: 'oauth', error: 'No access token — run npm run project-001:auth' });
    save(report);
    process.exit(1);
  }

  try {
    const res = await fetch('https://googleads.googleapis.com/v18/customers:listAccessibleCustomers', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': developerToken,
      },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
    }
    const data = JSON.parse(text);
    report.accessible_customers = data.resourceNames || [];
    report.ok = report.accessible_customers.length > 0;
    console.log('Accessible customers:', report.accessible_customers.length);
    for (const c of report.accessible_customers) console.log('  -', c);
  } catch (e) {
    report.errors.push({ step: 'listAccessibleCustomers', error: e.message?.slice(0, 400) });
    if (String(e.message).includes('DEVELOPER_TOKEN')) {
      report.owner_gate = {
        title: 'Developer token not approved',
        url: 'https://ads.google.com/aw/apicenter',
        note: 'Test token works only with test accounts until Google approves production access',
      };
    }
    save(report);
    console.error('Ads probe failed:', e.message);
    process.exit(1);
  }

  save(report);
  console.log('\n✓ Google Ads API probe OK\n');
}

function save(report) {
  mkdirSync(P001.auditOut, { recursive: true });
  writeFileSync(`${P001.auditOut}/ads-probe.json`, JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
