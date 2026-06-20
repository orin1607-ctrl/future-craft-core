import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getAuthenticatedClient, loadGoogleAuthLibrary } from '../google/_lib/auth.mjs';
import { getP001Scopes, tokenHasP001Scopes } from './_lib/auth.mjs';
import { loadP001Config, P001 } from './_lib/config.mjs';
import { requireProjectId } from './_lib/gcp.mjs';

const INDEX_HTML = join(P001.root, 'index.html');
const SITE = () => loadP001Config().gsc_site_url.replace(/\/$/, '') + '/';

function saveConfig(patch) {
  const path = existsSync(P001.config) ? P001.config : P001.configExample;
  const current = JSON.parse(readFileSync(path, 'utf8'));
  writeFileSync(P001.config, JSON.stringify({ ...current, ...patch }, null, 2));
}

function injectVerificationMeta(html, token) {
  const tag = `<meta name="google-site-verification" content="${token}" />`;
  if (html.includes('google-site-verification')) {
    return html.replace(/<meta name="google-site-verification"[^>]*\/?>/, tag);
  }
  return html.replace('</head>', `    ${tag}\n  </head>`);
}

async function setupSiteVerification(auth, google, siteUrl) {
  const sv = google.siteVerification({ version: 'v1', auth });
  const result = { siteUrl, meta_injected: false, verified: false };

  const tokenRes = await sv.webResource.getToken({
    requestBody: {
      verificationMethod: 'META',
      site: { type: 'SITE', identifier: siteUrl },
    },
  });
  const token = tokenRes.data.token;
  result.verification_token = token;

  const html = readFileSync(INDEX_HTML, 'utf8');
  const updated = injectVerificationMeta(html, token);
  if (updated !== html) {
    writeFileSync(INDEX_HTML, updated);
    result.meta_injected = true;
    console.log('Added google-site-verification meta to index.html');
  }

  try {
    await sv.webResource.insert({
      verificationMethod: 'META',
      requestBody: { site: { type: 'SITE', identifier: siteUrl } },
    });
    result.verified = true;
    console.log('Site verification: OK');
  } catch (e) {
    try {
      await sv.webResource.insert({
        verificationMethod: 'FILE',
        requestBody: { site: { type: 'SITE', identifier: siteUrl } },
      });
      result.verified = true;
      console.log('Site verification (FILE): OK');
    } catch (e2) {
      result.verify_error = e2.message?.slice(0, 300);
      console.warn('Site verification pending (deploy staging first):', result.verify_error);
    }
  }
  return result;
}

async function setupGsc(auth, google, siteUrl) {
  const sc = google.searchconsole({ version: 'v1', auth });
  const result = { added: false };
  try {
    await sc.sites.add({ siteUrl });
    result.added = true;
    console.log('GSC site added:', siteUrl);
  } catch (e) {
    if (e.message?.includes('already exists') || e.code === 409) {
      result.added = true;
      result.note = 'already exists';
    } else {
      result.error = e.message?.slice(0, 300);
      console.warn('GSC add:', result.error);
    }
  }
  const sites = await sc.sites.list();
  result.sites = (sites.data.siteEntry || []).map((s) => s.siteUrl);
  return result;
}

async function setupGa4(auth, google, cfg) {
  const admin = google.analyticsadmin({ version: 'v1beta', auth });
  const result = { mode: 'discover_only', created: false };

  const summaries = await admin.accountSummaries.list();
  const properties = [];
  for (const acc of summaries.data.accountSummaries || []) {
    for (const p of acc.propertySummaries || []) {
      properties.push({
        name: p.property,
        displayName: p.displayName,
        account: acc.displayName,
      });
    }
  }
  result.properties = properties;

  if (!properties.length) {
    throw new Error(
      'No GA4 properties visible for orin1607@gmail.com — add Viewer/Editor on existing property (yoni122222@gmail.com) then re-run probe',
    );
  }

  console.log('GA4 properties (existing only, no create):');
  for (const p of properties) console.log('  -', p.displayName, '→', p.name);

  let propertyId = cfg.ga4_property_id;
  if (!propertyId?.startsWith('properties/') || propertyId.includes('YOUR_')) {
    const pick = pickGa4Property(properties, cfg);
    if (!pick) throw new Error('Multiple GA4 properties — set ga4_property_id in config.json');
    propertyId = pick.name;
    saveConfig({ ga4_property_id: propertyId });
    result.auto_selected = propertyId;
    console.log('Auto-selected GA4 property:', propertyId);
  }

  result.property_id = propertyId;
  return result;
}

function pickGa4Property(properties, cfg) {
  if (properties.length === 1) return properties[0];
  const hints = ['dalia', 'dalia-c', 'future-craft', 'fleet'];
  const lower = (s) => String(s || '').toLowerCase();
  for (const h of hints) {
    const m = properties.find((p) => lower(p.displayName).includes(h));
    if (m) return m;
  }
  return null;
}

async function main() {
  if (!tokenHasP001Scopes()) {
    console.error('\n❌ Missing scopes — run: npm run project-001:auth\n');
    process.exit(2);
  }

  const cfg = loadP001Config();
  const siteUrl = cfg.gsc_site_url.endsWith('/') ? cfg.gsc_site_url : `${cfg.gsc_site_url}/`;
  const auth = await getAuthenticatedClient({ scopes: getP001Scopes() });
  const google = await loadGoogleAuthLibrary();

  console.log('\n=== Project 001 Setup ===\n');
  console.log('Site:', siteUrl);

  const report = { timestamp: new Date().toISOString(), siteUrl };

  try {
    report.verification = await setupSiteVerification(auth, google, siteUrl);
  } catch (e) {
    report.verification = {
      ok: false,
      error: e.message?.slice(0, 300),
      enable: `https://console.cloud.google.com/apis/library/siteverification.googleapis.com?project=${requireProjectId().id}`,
    };
    console.warn('Site verification skipped:', report.verification.error);
  }

  try {
    report.gsc = await setupGsc(auth, google, siteUrl);
  } catch (e) {
    report.gsc = { ok: false, error: e.message?.slice(0, 300) };
    console.warn('GSC setup:', report.gsc.error);
  }

  try {
    report.ga4 = await setupGa4(auth, google, cfg);
  } catch (e) {
    report.ga4 = { ok: false, error: e.message?.slice(0, 300) };
    console.warn('GA4 setup:', report.ga4.error);
  }

  mkdirSync(P001.auditOut, { recursive: true });
  writeFileSync(`${P001.auditOut}/setup.json`, JSON.stringify(report, null, 2));

  const ga4Ok = report.ga4?.property_id;
  const gscOk = report.gsc?.sites?.includes(siteUrl) || report.gsc?.added;
  if (ga4Ok) console.log('\n✓ GA4 ready:', report.ga4.property_id);
  if (gscOk) console.log('✓ GSC site registered');
  console.log('\nNext: npm run project-001:probe && npm run project-001:sync\n');
}

main().catch((e) => {
  console.error('\nSetup failed:', e.message || e);
  if (e.response?.data) console.error(JSON.stringify(e.response.data, null, 2));
  process.exit(1);
});
