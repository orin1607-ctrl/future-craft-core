import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { loadGoogleAuthLibrary, getAuthenticatedClient } from '../google/_lib/auth.mjs';
import { getP001Scopes, tokenHasP001Scopes } from './_lib/auth.mjs';
import { loadP001Config, P001 } from './_lib/config.mjs';
import { resolveProjectId } from './_lib/gcp.mjs';
import { consoleLink } from './_lib/legacy-guard.mjs';
import { runFullGbpSync } from './_lib/gbp.mjs';

async function writeGbpAuditSheet(auth, google, cfg, report) {
  if (!cfg.spreadsheet_id || !report.summary) return;
  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const s = report.summary;
    const row = [
      report.timestamp.slice(0, 10),
      report.location?.name || '',
      report.profile?.primaryCategory ? 'yes' : 'no',
      report.profile?.description ? 'yes' : 'no',
      report.profile?.description ? 'yes' : 'no',
      '—',
      String(s.postsCount ?? 0),
      String(s.unansweredReviews ?? 0),
      String(s.qaUnanswered ?? 0),
      JSON.stringify(report.gaps || []),
      `views=${s.profileViews ?? '—'} calls=${s.calls ?? '—'}`,
      report.ok ? 'synced' : 'partial',
    ];
    await sheets.spreadsheets.values.append({
      spreadsheetId: cfg.spreadsheet_id,
      range: 'gbp_audit!A:L',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
  } catch (e) {
    console.warn('gbp_audit sheet:', e.message?.slice(0, 120));
  }
}

async function main() {
  if (!tokenHasP001Scopes()) {
    console.error('\n❌ Run npm run project-001:auth first (Owner Gate)\n');
    process.exit(2);
  }

  const cfg = loadP001Config();
  const { id: projectId } = resolveProjectId();
  const auth = await getAuthenticatedClient({ scopes: getP001Scopes() });
  const google = await loadGoogleAuthLibrary();

  const report = await runFullGbpSync(auth, google, {
    businessHint: cfg.gbp_business_hint,
    days: cfg.date_range_days || 28,
  });

  mkdirSync(P001.auditOut, { recursive: true });
  writeFileSync(`${P001.auditOut}/gbp-sync.json`, JSON.stringify(report, null, 2));

  const probeLite = {
    timestamp: report.timestamp,
    ok: report.ok,
    accounts: report.location ? [{ accountName: report.location.account }] : [],
    locations: report.location
      ? [{ ...report.location, match_hint: true }]
      : [],
    matched_business: report.location,
    errors: report.errors,
    summary: report.summary,
  };
  writeFileSync(`${P001.auditOut}/gbp-probe.json`, JSON.stringify(probeLite, null, 2));

  if (report.location?.name && cfg.gbp_location_id !== report.location.name) {
    const configPath = existsSync(P001.config) ? P001.config : P001.configExample;
    const current = JSON.parse(readFileSync(configPath, 'utf8'));
    current.gbp_location_id = report.location.name;
    if (!current.gbp_business_hint && report.location.title) {
      current.gbp_business_hint = report.location.title.slice(0, 40);
    }
    writeFileSync(configPath, JSON.stringify(current, null, 2));
  }

  await writeGbpAuditSheet(auth, google, cfg, report);

  console.log('\n=== Google Business Profile Sync ===\n');
  console.log('OAuth business.manage:', report.oauth?.hasBusinessManage ? '✓' : '✗');
  console.log('Location:', report.location?.title || '(none)');
  if (report.summary) {
    console.log('Profile views (28d):', report.summary.profileViews ?? '—');
    console.log('Navigations:', report.summary.navigations ?? '—');
    console.log('Calls:', report.summary.calls ?? '—');
    console.log('Messages:', report.summary.messages ?? '—');
    console.log('Reviews:', report.summary.totalReviews ?? '—', `(avg ${report.summary.averageRating ?? '—'})`);
    console.log('Unanswered reviews:', report.summary.unansweredReviews ?? '—');
    console.log('Posts:', report.summary.postsCount ?? '—');
    console.log('Search keywords:', report.summary.searchKeywordsCount ?? '—');
  }
  console.log('APIs used:', (report.apisUsed || []).join(', ') || '(none)');
  if (report.gaps?.length) console.log('Gaps:', report.gaps.join(', '));
  if (report.errors.length) {
    console.log('\nErrors:');
    for (const e of report.errors) console.log(' ', e.api, ':', e.message || e.error);
    const quota = report.errors.some((e) => String(e.message || e.error).includes('Quota exceeded'));
    if (quota) {
      console.log('\n❌ GBP quota blocked — verify OAuth project is Project001AIMarketing');
      if (projectId) {
        console.log(consoleLink('apis/library/mybusinessaccountmanagement.googleapis.com', projectId));
      }
    }
  }

  if (!report.ok) {
    console.log('\n❌ GBP sync incomplete\n');
    process.exit(1);
  }
  console.log('\n✓ GBP sync OK → docs/audit-reports/project-001/gbp-sync.json\n');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
