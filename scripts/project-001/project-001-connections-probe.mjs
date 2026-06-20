import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { getAuthenticatedClient } from '../google/_lib/auth.mjs';
import { getP001Scopes } from './_lib/auth.mjs';
import { P001 } from './_lib/config.mjs';
import { loadGcpConfig, resolveProjectId } from './_lib/gcp.mjs';

async function main() {
  const auth = await getAuthenticatedClient({ scopes: getP001Scopes() });
  const { google } = await import('googleapis');
  const cfg = JSON.parse(readFileSync(existsSync(P001.config) ? P001.config : P001.configExample, 'utf8'));
  const gcp = loadGcpConfig();
  const { id: projectId } = resolveProjectId();

  const report = {
    timestamp: new Date().toISOString(),
    account: null,
    gcp: { project_name: gcp.project_name, project_id: projectId || null },
    connections: {},
    openai: { configured: existsSync('.env.openai') && !readFileSync('.env.openai', 'utf8').match(/OPENAI_API_KEY=\s*$/m) },
    ok: false,
  };

  try {
    const me = await google.oauth2({ version: 'v2', auth }).userinfo.get();
    report.account = me.data.email;
  } catch (e) {
    report.connections.oauth = { ok: false, error: e.message };
  }

  const checks = [
    ['gsc', async () => {
      const sc = google.searchconsole({ version: 'v1', auth });
      const sites = await sc.sites.list();
      const site = cfg.gsc_site_url;
      const entry = (sites.data.siteEntry || []).find((s) => s.siteUrl === site || s.siteUrl === site.replace(/\/$/, '') + '/');
      return { ok: !!entry, siteUrl: site, permission: entry?.permissionLevel, sites: sites.data.siteEntry?.length };
    }],
    ['ga4', async () => {
      const data = google.analyticsdata({ version: 'v1beta', auth });
      const r = await data.properties.runReport({
        property: cfg.ga4_property_id,
        requestBody: { dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }], metrics: [{ name: 'activeUsers' }], limit: 1 },
      });
      return { ok: true, property: cfg.ga4_property_id, rows: r.data.rows?.length ?? 0 };
    }],
    ['sheets', async () => {
      const sheets = google.sheets({ version: 'v4', auth });
      await sheets.spreadsheets.get({ spreadsheetId: cfg.spreadsheet_id });
      return { ok: true, spreadsheet_id: cfg.spreadsheet_id };
    }],
    ['drive', async () => {
      const drive = google.drive({ version: 'v3', auth });
      const r = await drive.about.get({ fields: 'user' });
      return { ok: true, email: r.data.user?.emailAddress };
    }],
    ['docs', async () => {
      const docs = google.docs({ version: 'v1', auth });
      const r = await docs.documents.create({ requestBody: { title: `P001-probe-${Date.now()}` } });
      return { ok: true, documentId: r.data.documentId, note: 'test doc — delete manually' };
    }],
    ['gmail', async () => {
      const scope = String(auth.credentials?.scope || '');
      return { ok: scope.includes('gmail'), note: scope.includes('gmail.send') ? 'send scope' : 'readonly' };
    }],
    ['apps_script', async () => {
      const script = google.script({ version: 'v1', auth });
      try {
        await script.projects.get({ scriptId: 'p001-probe-invalid' });
      } catch (e) {
        if (e.code === 404 || e.code === 400) return { ok: true };
        throw e;
      }
      return { ok: true };
    }],
    ['gbp_accounts', async () => {
      const acct = google.mybusinessaccountmanagement({ version: 'v1', auth });
      const r = await acct.accounts.list();
      return { ok: (r.data.accounts || []).length > 0, count: r.data.accounts?.length ?? 0 };
    }],
  ];

  for (const [name, fn] of checks) {
    try {
      report.connections[name] = { ...(await fn()), ok: true };
    } catch (e) {
      report.connections[name] = { ok: false, error: e.message?.slice(0, 250), code: e.code };
    }
  }

  report.ok = Object.values(report.connections).filter((c) => c.ok !== false).length >= 6;
  mkdirSync(P001.auditOut, { recursive: true });
  writeFileSync(`${P001.auditOut}/connections-probe.json`, JSON.stringify(report, null, 2));

  console.log('\n=== Project 001 — All Connections Probe ===\n');
  console.log('Account:', report.account);
  console.log('GCP target:', gcp.project_name, projectId || '(project_id not in gcp.json yet)');
  for (const [k, v] of Object.entries(report.connections)) {
    console.log(k + ':', v.ok === false ? 'FAIL — ' + v.error : 'OK');
  }
  console.log('OpenAI:', report.openai.configured ? 'key set' : 'pending');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
