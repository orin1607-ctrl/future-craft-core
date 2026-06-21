import { mkdirSync, writeFileSync } from 'fs';
import { getAuthenticatedClient } from '../google/_lib/auth.mjs';
import { getP001Scopes } from './_lib/auth.mjs';
import { loadP001Config, P001 } from './_lib/config.mjs';
import { loadGoogleAuthLibrary } from '../google/_lib/auth.mjs';
import { runFullAdsSync } from './_lib/ads.mjs';
import { getAdsCredentials } from './_lib/ads-env.mjs';
import { buildAdsOwnerGate } from './_lib/owner-gates.mjs';

async function writeAdsSheets(auth, google, cfg, report) {
  if (!cfg.spreadsheet_id || !report.summary) return;
  const sheets = google.sheets({ version: 'v4', auth });
  const s = report.summary;

  async function ensureTab(title, headers) {
    try {
      const meta = await sheets.spreadsheets.get({ spreadsheetId: cfg.spreadsheet_id });
      const exists = (meta.data.sheets || []).some((sh) => sh.properties?.title === title);
      if (!exists) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: cfg.spreadsheet_id,
          requestBody: {
            requests: [{ addSheet: { properties: { title } } }],
          },
        });
        await sheets.spreadsheets.values.update({
          spreadsheetId: cfg.spreadsheet_id,
          range: `${title}!A1`,
          valueInputOption: 'RAW',
          requestBody: { values: [headers] },
        });
      }
    } catch (e) {
      console.warn(`sheet ${title}:`, e.message?.slice(0, 100));
    }
  }

  await ensureTab('ads_daily', [
    'sync_date',
    'customer_id',
    'impressions',
    'clicks',
    'cost',
    'conversions',
    'ctr',
    'cpc',
    'campaign_count',
    'status',
  ]);

  await ensureTab('ads_campaigns', [
    'sync_date',
    'campaign_id',
    'name',
    'status',
    'channel',
    'impressions',
    'clicks',
    'cost',
    'conversions',
  ]);

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: cfg.spreadsheet_id,
      range: 'ads_daily!A:J',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [
          [
            report.timestamp.slice(0, 10),
            report.customerId,
            String(s.impressions ?? 0),
            String(s.clicks ?? 0),
            String(s.cost ?? 0),
            String(s.conversions ?? 0),
            String(s.ctr ?? 0),
            String(s.cpc ?? 0),
            String(s.campaignCount ?? 0),
            report.ok ? 'synced' : 'partial',
          ],
        ],
      },
    });
  } catch (e) {
    console.warn('ads_daily:', e.message?.slice(0, 100));
  }

  if (report.campaigns?.length) {
    const rows = report.campaigns.map((c) => [
      report.timestamp.slice(0, 10),
      String(c.id),
      c.name,
      c.status,
      c.channel || '',
      String(c.impressions),
      String(c.clicks),
      String(c.cost),
      String(c.conversions),
    ]);
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: cfg.spreadsheet_id,
        range: 'ads_campaigns!A:I',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: rows },
      });
    } catch (e) {
      console.warn('ads_campaigns:', e.message?.slice(0, 100));
    }
  }
}

function saveProbeFromSync(report) {
  const probe = {
    timestamp: report.timestamp,
    ok: report.ok,
    gcp_project_id: null,
    developer_token_set: report.developerTokenSet,
    accessible_customers: (report.accessibleCustomers || []).map((id) => `customers/${id}`),
    customer_id: report.customerId,
    summary: report.summary,
    errors: report.errors,
    owner_gate: report.owner_gate,
  };
  writeFileSync(`${P001.auditOut}/ads-probe.json`, JSON.stringify(probe, null, 2));
}

async function main() {
  const cfg = loadP001Config();
  const { developerToken } = getAdsCredentials();

  console.log('\n=== Google Ads Sync (read-only) ===\n');

  if (!developerToken) {
    const gate = buildAdsOwnerGate();
    mkdirSync(P001.auditOut, { recursive: true });
    writeFileSync(
      `${P001.auditOut}/ads-sync.json`,
      JSON.stringify({ ok: false, skipped: true, owner_gate: gate, errors: [{ message: 'Developer token missing' }] }, null, 2),
    );
    console.log('⏭ Ads sync skipped — Developer token missing');
    console.log('Guide: docs/audit-reports/project-001/OWNER-GATES-GBP-ADS.md');
    console.log('URL:', gate.directLink, '\n');
    process.exit(0);
  }

  const auth = await getAuthenticatedClient({ scopes: getP001Scopes() });
  const google = await loadGoogleAuthLibrary();
  const report = await runFullAdsSync(auth);

  mkdirSync(P001.auditOut, { recursive: true });
  writeFileSync(`${P001.auditOut}/ads-sync.json`, JSON.stringify(report, null, 2));
  saveProbeFromSync(report);

  await writeAdsSheets(auth, google, cfg, report);

  if (report.summary) {
    console.log('Customer:', report.customerId, report.summary.customerName || '');
    console.log('Campaigns:', report.summary.campaignCount);
    console.log('30d impressions:', report.summary.impressions);
    console.log('30d clicks:', report.summary.clicks);
    console.log('30d cost:', report.summary.cost, report.summary.currency);
    console.log('30d conversions:', report.summary.conversions);
  }
  if (report.errors.length) {
    console.log('\nErrors:');
    for (const e of report.errors) console.log(' ', e.step, ':', e.message);
  }

  if (!report.ok) {
    console.log('\n❌ Ads sync incomplete\n');
    process.exit(1);
  }
  console.log('\n✓ Ads sync OK → docs/audit-reports/project-001/ads-sync.json\n');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
