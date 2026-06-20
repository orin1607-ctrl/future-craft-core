import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { P001 } from './_lib/config.mjs';
import { TARGET_PROJECT_ID } from './_lib/legacy-guard.mjs';

const OUT = P001.auditOut;

function loadJson(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function status(ok) {
  if (ok === true) return '✅';
  if (ok === false) return '❌';
  return '⏸';
}

function main() {
  const gcp = loadJson(`${OUT}/gcp-audit.json`);
  const conn = loadJson(`${OUT}/connections-probe.json`);
  const probe = loadJson(`${OUT}/probe.json`);
  const sync = loadJson(`${OUT}/last-sync.json`);
  const gbp = loadJson(`${OUT}/gbp-probe.json`);
  const ads = loadJson(`${OUT}/ads-probe.json`);
  const migration = loadJson(`${OUT}/migration-status.json`);
  const hasCreds = existsSync('integrations/google/credentials.oauth.json');
  const hasToken = existsSync('integrations/google/token.json');
  const openaiOk = existsSync('.env.openai') && !readFileSync('.env.openai', 'utf8').match(/OPENAI_API_KEY=\s*$/m);
  const adsOk = hasToken && ads?.ok === true;
  const gbpOk = hasToken && gbp?.ok === true;
  const live = hasCreds && hasToken;
  const gaOk = live && (conn?.connections?.ga4?.ok === true || probe?.ga4?.ok === true);
  const gscOk = live && (conn?.connections?.gsc?.ok === true || probe?.gsc?.ok === true);

  const report = {
    timestamp: new Date().toISOString(),
    gcp_project: TARGET_PROJECT_ID,
    legacy_migrated: Boolean(migration?.archived?.credentials),
    services: {
      oauth_credentials: hasCreds,
      oauth_token: hasToken,
      google_verify: gcp?.ready_for_development,
      gsc: gscOk,
      ga4: gaOk,
      sheets: live && conn?.connections?.sheets?.ok,
      drive: live && conn?.connections?.drive?.ok,
      gbp: gbpOk,
      ads: adsOk,
      openai: openaiOk,
    },
    sync: sync ? { ga4_rows: sync.ga4?.daily_rows, gsc_rows: sync.gsc?.query_rows } : null,
    ready_for_ai_marketing_dev: Boolean(
      hasCreds && hasToken && gaOk && gscOk && gbpOk && adsOk && openaiOk,
    ),
    pending_owner_gates: [],
  };

  if (!hasCreds) report.pending_owner_gates.push({ id: 'oauth_client', url: 'https://console.cloud.google.com/apis/credentials?project=burnished-craft-466809-v1' });
  if (!hasToken) report.pending_owner_gates.push({ id: 'oauth_login', action: 'npm run project-001:auth' });
  if (!adsOk) report.pending_owner_gates.push({ id: 'ads_token', url: 'https://ads.google.com/aw/apicenter' });
  if (!openaiOk) report.pending_owner_gates.push({ id: 'openai_key', url: 'https://platform.openai.com/api-keys' });

  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/FINAL-STATUS.json`, JSON.stringify(report, null, 2));

  const md = `# Project001AIMarketing — Final Status

**${report.timestamp}**

| Service | Status |
|---------|--------|
| GCP Project | ${TARGET_PROJECT_ID} |
| OAuth Credentials | ${status(hasCreds)} |
| OAuth Token | ${status(hasToken)} |
| Google Search Console | ${status(gscOk)} |
| Google Analytics 4 | ${status(gaOk)} |
| Sheets / Drive / Docs | ${status(live && conn?.connections?.sheets?.ok)} |
| Google Business Profile | ${status(gbpOk)} |
| Google Ads API | ${status(adsOk)} |
| OpenAI | ${status(openaiOk)} |

**Ready for AI Marketing development:** ${report.ready_for_ai_marketing_dev ? 'YES' : 'NO'}

${report.pending_owner_gates.length ? `## Pending Owner Gates\n${report.pending_owner_gates.map((g) => `- **${g.id}**: ${g.url || g.action}`).join('\n')}` : ''}
`;
  writeFileSync(`${OUT}/FINAL-STATUS.md`, md);
  console.log('\n=== Final Report ===\n');
  console.log(md);
}

main();
