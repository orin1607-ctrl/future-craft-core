import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { loadGoogleAuthLibrary } from '../google/_lib/auth.mjs';
import { getP001Scopes, tokenHasP001Scopes } from './_lib/auth.mjs';
import { getAuthenticatedClient } from '../google/_lib/auth.mjs';
import { loadP001Config, P001 } from './_lib/config.mjs';
import { requireProjectId } from './_lib/gcp.mjs';

async function main() {
  const cfg = loadP001Config();
  const out = { timestamp: new Date().toISOString(), ok: false };

  if (!tokenHasP001Scopes()) {
    out.error = 'P001_SCOPES_MISSING';
    const { id: project } = requireProjectId();
    out.owner_gate = {
      action: 'Run: npm run project-001:auth',
      note: 'Approve Search Console + Analytics scopes in browser',
      apis_to_enable: [
        `https://console.cloud.google.com/apis/library/searchconsole.googleapis.com?project=${project}`,
        `https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com?project=${project}`,
        `https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com?project=${project}`,
      ],
    };
    save(out);
    console.log('\n❌ Missing OAuth scopes for Project 001\n');
    console.log('Owner Gate — run:\n  npm run project-001:auth\n');
    process.exit(2);
  }

  const auth = await getAuthenticatedClient({ scopes: getP001Scopes() });
  const google = await loadGoogleAuthLibrary();

  // Search Console
  try {
    const sc = google.searchconsole({ version: 'v1', auth });
    const sites = await sc.sites.list();
    out.gsc = {
      ok: true,
      sites: (sites.data.siteEntry || []).map((s) => ({
        siteUrl: s.siteUrl,
        permissionLevel: s.permissionLevel,
      })),
      configured: cfg.gsc_site_url,
      configured_match: (sites.data.siteEntry || []).some((s) => s.siteUrl === cfg.gsc_site_url),
    };
  } catch (e) {
    out.gsc = { ok: false, error: e.message?.slice(0, 300) };
  }

  // GA4 — list properties (includes shared access from other accounts)
  try {
    const admin = google.analyticsadmin({ version: 'v1beta', auth });
    const properties = [];
    const summaries = await admin.accountSummaries.list();
    for (const acc of summaries.data.accountSummaries || []) {
      for (const p of acc.propertySummaries || []) {
        properties.push({
          name: p.property,
          displayName: p.displayName,
          propertyId: p.property?.replace('properties/', ''),
          account: acc.displayName,
          accountEmail: acc.account,
        });
      }
    }

    // Fallback: validate property by ID (from URL #/p123456789/ or Admin → Property settings)
    const argId = process.argv.find((a) => a.startsWith('--property='))?.split('=')[1]?.replace(/\D/g, '');
    if (!properties.length && argId) {
      const name = `properties/${argId}`;
      const data = google.analyticsdata({ version: 'v1beta', auth });
      try {
        await data.properties.runReport({
          property: name,
          requestBody: {
            dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }],
            metrics: [{ name: 'activeUsers' }],
            limit: 1,
          },
        });
        properties.push({ name, displayName: `(validated ID ${argId})`, propertyId: argId, account: 'direct-id' });
        console.log('\nGA4: Property validated via Data API (Admin list empty):', name);
      } catch (e) {
        out.ga4_validate_error = e.message?.slice(0, 200);
      }
    }

    const configured = cfg.ga4_property_id;
    out.ga4 = {
      ok: true,
      properties,
      configured,
      configured_valid: configured.startsWith('properties/') && !configured.includes('YOUR_'),
      note: properties.length ? null : 'No properties visible — ensure orin1607@gmail.com has Viewer+ on yoni122222@gmail.com GA4 property',
    };
  } catch (e) {
    out.ga4 = { ok: false, error: e.message?.slice(0, 300) };
  }

  out.ok = out.gsc?.ok && out.ga4?.ok;
  save(out);

  console.log('\n=== Project 001 Probe ===\n');
  if (out.gsc?.ok && !out.gsc?.sites?.length) {
    console.log('GSC: API OK — but no properties on this Google account.');
    console.log('  → Add site at https://search.google.com/search-console\n');
  } else {
    console.log('GSC sites:', out.gsc?.sites?.length ?? 0);
    if (out.gsc?.sites?.length) {
      for (const s of out.gsc.sites) console.log('  -', s.siteUrl, `(${s.permissionLevel})`);
    }
  }
  if (out.ga4?.ok && !out.ga4?.properties?.length) {
    console.log('GA4: API OK — no properties visible for orin1607@gmail.com yet.');
    console.log('  → Add Viewer/Editor on existing property (yoni122222@gmail.com account)');
    console.log('  → Then: npm run project-001:auth && npm run project-001:probe\n');
  } else {
    console.log('\nGA4 properties:', out.ga4?.properties?.length ?? 0);
    if (out.ga4?.properties?.length) {
      for (const p of out.ga4.properties) console.log('  -', p.displayName, '→', p.name);
    }
  }
  console.log('\nConfigured GSC:', cfg.gsc_site_url, out.gsc?.configured_match ? '✓' : '(no match — update config.json)');
  console.log('Configured GA4:', cfg.ga4_property_id, out.ga4?.configured_valid ? '✓' : '(set properties/ID in config.json)');

  if (!out.gsc?.configured_match || !out.ga4?.configured_valid) {
    if (out.ga4?.properties?.length && !out.ga4?.configured_valid) {
      const pick = pickGa4Property(out.ga4.properties);
      if (pick) {
        const path = existsSync(P001.config) ? P001.config : P001.configExample;
        const current = JSON.parse(readFileSync(path, 'utf8'));
        current.ga4_property_id = pick.name;
        writeFileSync(P001.config, JSON.stringify(current, null, 2));
        console.log('\n✓ Auto-saved ga4_property_id:', pick.name, `(${pick.displayName})`);
        out.ga4.configured = pick.name;
        out.ga4.configured_valid = true;
      }
    }
  }

  if (!out.gsc?.configured_match || !out.ga4?.configured_valid) {
    console.log('\n⚠️  Update integrations/project-001/config.json then re-run probe.');
    if (!out.ga4?.properties?.length) process.exit(1);
    if (!out.ga4?.configured_valid) process.exit(1);
  }
  if (!out.gsc?.configured_match) {
    console.log('\n⚠️  GSC site unverified — GA4 ready, sync will pull Analytics data.');
  }
  console.log('\n✓ Probe OK — ready for sync\n');
}

function save(data) {
  mkdirSync(P001.auditOut, { recursive: true });
  writeFileSync(`${P001.auditOut}/probe.json`, JSON.stringify(data, null, 2));
}

function pickGa4Property(properties) {
  if (properties.length === 1) return properties[0];
  const hints = ['dalia', 'dalia-c', 'future-craft', 'fleet', 'דליה'];
  const lower = (s) => String(s || '').toLowerCase();
  for (const h of hints) {
    const m = properties.find((p) => lower(p.displayName).includes(h));
    if (m) return m;
  }
  return null;
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
