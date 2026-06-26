import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getAuthenticatedClient, loadGoogleAuthLibrary } from '../google/_lib/auth.mjs';
import { getP001Scopes, tokenHasOptionalScope } from './_lib/auth.mjs';
import { P001 } from './_lib/config.mjs';
import { fetchGtmContainerSummary, gtmOAuthStatus, probeGtm } from './_lib/gtm.mjs';

async function main() {
  if (!tokenHasOptionalScope('tagmanager')) {
    console.error('\n❌ GTM scope missing — run: npm run project-001:auth -- --force\n');
    process.exit(2);
  }

  const auth = await getAuthenticatedClient({ scopes: getP001Scopes({ includeOptional: true }) });
  await loadGoogleAuthLibrary();
  const token = auth.credentials.access_token;
  const oauth = gtmOAuthStatus(auth);

  const probe = await probeGtm(token);
  probe.hasTagManagerScope = oauth.hasTagManagerScope;
  probe.oauth = oauth;

  const report = {
    timestamp: new Date().toISOString(),
    ok: false,
    probe,
    summaries: [],
    errors: [],
  };

  const containers = probe.containers || [];
  for (const c of containers.slice(0, 3)) {
    try {
      const summary = await fetchGtmContainerSummary(token, c.accountId, c.containerId);
      report.summaries.push({
        ...summary,
        publicId: c.publicId,
        containerName: c.name,
        accountName: c.accountName,
      });
    } catch (e) {
      report.errors.push({
        containerId: c.containerId,
        message: e.message?.slice(0, 200),
      });
    }
  }

  report.ok = probe.ok && report.summaries.some((s) => s.ok);
  if (!report.ok && probe.ok && !report.summaries.length) {
    report.ok = true;
    report.note = 'containers_listed_no_workspace_summary';
  }

  mkdirSync(P001.auditOut, { recursive: true });
  writeFileSync(join(P001.auditOut, 'gtm-sync.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(P001.auditOut, 'gtm-probe.json'), JSON.stringify(probe, null, 2));

  console.log('\n=== GTM Sync ===\n');
  console.log('Accounts:', probe.accounts?.length ?? 0);
  console.log('Containers:', probe.containers?.length ?? 0);
  console.log('Summaries:', report.summaries.filter((s) => s.ok).length);
  console.log('Status:', report.ok ? 'OK' : 'partial/failed');
  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
