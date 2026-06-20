import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { exec } from 'child_process';
import { PATHS } from '../google/_lib/paths.mjs';
import { P001 } from './_lib/config.mjs';
import { loadGcpConfig, resolveProjectId, REQUIRED_APIS, consoleUrl } from './_lib/gcp.mjs';
import { isLegacyOAuthClient, TARGET_PROJECT_ID, ownerGateNewOAuth } from './_lib/legacy-guard.mjs';

const OPEN = process.argv.includes('--open');

function link(projectId, path) {
  return `https://console.cloud.google.com/${path}?project=${projectId}`;
}

async function probeApis(projectId) {
  if (!projectId) return { note: 'Set project_id in integrations/project-001/gcp.json' };
  const { google } = await import('googleapis');
  const results = {};
  for (const api of REQUIRED_APIS) {
    try {
      const svc = google.discovery({ version: 'v1' });
      const r = await svc.services.get({ serviceName: api.id });
      results[api.id] = { state: r.data.state, name: api.name };
    } catch (e) {
      results[api.id] = { state: 'UNKNOWN', error: e.message?.slice(0, 120), name: api.name };
    }
  }
  return results;
}

async function main() {
  const gcp = loadGcpConfig();
  const { id: projectId, source } = resolveProjectId();
  const p001 = JSON.parse(readFileSync(existsSync(P001.config) ? P001.config : P001.configExample, 'utf8'));

  const report = {
    timestamp: new Date().toISOString(),
    target_gcp: {
      project_name: gcp.project_name,
      project_id: projectId || null,
      project_id_source: source,
    },
    credentials: {},
    oauth: {},
    apis: {},
    iam: {},
    openai: {},
    project001: {},
    ready_for_development: false,
    owner_gates: [],
  };

  // Credentials file (current OAuth — may be legacy project until migrated)
  if (existsSync(PATHS.credentials)) {
    const raw = JSON.parse(readFileSync(PATHS.credentials, 'utf8'));
    const block = raw.web || raw.installed || {};
    report.credentials = {
      file: 'integrations/google/credentials.oauth.json',
      present: true,
      client_id: block.client_id,
      project_id_in_file: block.project_id,
      legacy_blocked: isLegacyOAuthClient(block.client_id, block.project_id),
      matches_Project001AIMarketing: block.project_id === projectId || block.project_id === TARGET_PROJECT_ID,
      redirect_uris: block.redirect_uris || [],
    };
    if (report.credentials.legacy_blocked) {
      report.owner_gates.push({ ...ownerGateNewOAuth(), id: 'legacy_oauth_blocked' });
    }
  } else {
    report.credentials = { present: false };
    report.owner_gates.push({
      id: 'oauth_client',
      title: 'Create OAuth Web Client in Project001AIMarketing',
      url: projectId ? link(projectId, 'apis/credentials') : gcp.console_links.oauth_credentials,
      button: 'CREATE CREDENTIALS → OAuth client ID → Web application → Add redirect URI http://127.0.0.1:4521/oauth2callback',
    });
  }

  if (existsSync(PATHS.token)) {
    const token = JSON.parse(readFileSync(PATHS.token, 'utf8'));
    report.oauth = {
      token_present: true,
      scopes_count: String(token.scope || '').split(' ').filter(Boolean).length,
      needs_reauth_for_new_project: projectId && report.credentials.project_id_in_file !== projectId,
    };
  } else {
    report.oauth = { token_present: false };
    report.owner_gates.push({
      id: 'oauth_login',
      title: 'OAuth login',
      action: 'npm run project-001:auth',
      button: 'Approve all scopes in browser as orin1607@gmail.com',
    });
  }

  if (projectId) {
    report.apis = await probeApis(projectId);
    const enableUrls = REQUIRED_APIS.map((a) => ({
      name: a.name,
      url: link(projectId, `apis/library/${a.id}`),
    }));
    report.apis_enable_urls = enableUrls;

    report.iam = {
      console: link(projectId, 'iam-admin/iam'),
      service_accounts: link(projectId, 'iam-admin/serviceaccounts'),
      note: 'Create service account if needed for server automation; OAuth user flow used for Project 001 scripts',
    };

    report.oauth_consent = {
      url: link(projectId, 'apis/credentials/consent'),
      checklist: [
        'App name: Project 001 AI Marketing',
        'User type: External (or Internal if Workspace)',
        'Add test user: orin1607@gmail.com',
        'Add all scopes from integrations/google/scopes.json',
      ],
    };

    if (OPEN) {
      console.log('\n=== Opening GCP console tabs (Project001AIMarketing) ===\n');
      const tabs = [
        link(projectId, 'apis/credentials/consent'),
        link(projectId, 'apis/credentials'),
        ...REQUIRED_APIS.map((a) => link(projectId, `apis/library/${a.id}`)),
        link(projectId, 'iam-admin/serviceaccounts'),
      ];
      for (const url of tabs) {
        if (process.platform === 'win32') exec(`start "" "${url}"`);
        await new Promise((r) => setTimeout(r, 600));
      }
    }
  } else {
    report.owner_gates.push({
      id: 'project_id',
      title: 'Confirm Project001AIMarketing project ID',
      url: 'https://console.cloud.google.com/home/dashboard?project=burnished-craft-466809-v1',
      button: 'If dashboard opens — project_id is correct. If not, copy Project ID from Project settings → gcp.json',
    });
  }

  // OpenAI
  const openaiEnv = existsSync('.env.openai') ? '.env.openai' : null;
  report.openai = {
    example: '.env.openai.example',
    env_file: openaiEnv,
    key_configured: openaiEnv ? readFileSync(openaiEnv, 'utf8').includes('OPENAI_API_KEY=') &&
      !readFileSync(openaiEnv, 'utf8').match(/OPENAI_API_KEY=\s*$/m) : false,
  };
  if (!report.openai.key_configured) {
    report.owner_gates.push({
      id: 'openai_key',
      title: 'OpenAI API Key',
      url: 'https://platform.openai.com/api-keys',
      button: 'Create new secret key → copy → paste in .env.openai as OPENAI_API_KEY=sk-...',
    });
  }

  // Project 001 runtime (uses current OAuth)
  report.project001 = {
    gsc_site: p001.gsc_site_url,
    ga4_property_id: p001.ga4_property_id,
    spreadsheet_id: p001.spreadsheet_id,
  };

  report.ready_for_development = Boolean(
    projectId &&
    report.credentials.present &&
    !report.credentials.legacy_blocked &&
    report.oauth.token_present &&
    report.credentials.matches_Project001AIMarketing,
  );

  mkdirSync(P001.auditOut, { recursive: true });
  writeFileSync(`${P001.auditOut}/gcp-audit.json`, JSON.stringify(report, null, 2));

  console.log('\n=== Project001AIMarketing — GCP Audit ===\n');
  console.log('Project name:', gcp.project_name);
  console.log('Project ID:', projectId || '(MISSING — set integrations/project-001/gcp.json)');
  console.log('OAuth credentials project:', report.credentials.project_id_in_file || 'n/a');
  console.log('Token:', report.oauth.token_present ? 'yes' : 'no');
  console.log('OpenAI key:', report.openai.key_configured ? 'yes' : 'pending');
  console.log('Ready 100%:', report.ready_for_development ? 'YES' : 'NO');
  console.log('\nReport:', `${P001.auditOut}/gcp-audit.json`);
  if (report.owner_gates.length) {
    console.log('\n--- Owner Gates ---');
    for (const g of report.owner_gates) {
      console.log(`\n[${g.id}] ${g.title}`);
      if (g.url) console.log('  URL:', g.url);
      if (g.button) console.log('  →', g.button);
      if (g.action) console.log('  →', g.action);
    }
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
