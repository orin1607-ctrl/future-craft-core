/**
 * GitHub repository security audit — read-only.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const REPO = 'orin1607-ctrl/future-craft-core';
const OUT = join(process.cwd(), 'docs', 'audit-reports', 'security-hardening');
mkdirSync(OUT, { recursive: true });

const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'dalia-security-audit' };

async function gh(path, token) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: token ? { ...headers, Authorization: `Bearer ${token}` } : headers,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, ok: res.ok, data: json };
}

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

const report = {
  at: new Date().toISOString(),
  repo: REPO,
  token_available: Boolean(token),
  repo_meta: null,
  collaborators: null,
  branch_protection: {},
  hooks: null,
  deploy_keys: null,
  installations: null,
  limitations: [],
  recommendations: [],
};

const meta = await gh(`/repos/${REPO}`, token);
report.repo_meta = meta.ok ? {
  full_name: meta.data.full_name,
  private: meta.data.private,
  visibility: meta.data.visibility,
  default_branch: meta.data.default_branch,
  permissions: meta.data.permissions || null,
} : { error: meta.status, message: meta.data.message };

const collab = await gh(`/repos/${REPO}/collaborators?affiliation=direct`, token);
if (collab.status === 401 || collab.status === 403) {
  report.collaborators = { error: 'Requires authenticated token with repo admin/read access' };
  report.limitations.push('Collaborators list requires GITHUB_TOKEN or gh auth login');
} else if (collab.ok) {
  report.collaborators = (collab.data || []).map((c) => ({
    login: c.login,
    role_name: c.role_name,
    permissions: c.permissions,
  }));
}

for (const branch of ['main', 'production']) {
  const bp = await gh(`/repos/${REPO}/branches/${branch}/protection`, token);
  report.branch_protection[branch] = bp.ok ? bp.data : { configured: false, status: bp.status };
}

const hooks = await gh(`/repos/${REPO}/hooks`, token);
report.hooks = hooks.ok ? hooks.data : { error: hooks.status };

const keys = await gh(`/repos/${REPO}/keys`, token);
report.deploy_keys = keys.ok ? keys.data : { error: keys.status };

const inst = await gh(`/repos/${REPO}/installations`, token);
report.installations = inst.ok ? inst.data : { error: inst.status };

// Policy recommendations (no changes applied)
report.recommendations = [
  { item: 'Repository visibility', action: 'להפוך ל-Private', reason: 'Anon JWT היה חשוף ב-workflow; Owner בלבד' },
  { item: 'Collaborators', action: 'להסיר Admin/Write מיותרים', reason: 'Owner מלא — orin1607-ctrl בלבד' },
  { item: 'Branch protection', action: 'להפעיל על main + production', reason: 'Require PR + status checks' },
  { item: 'GitHub Pages', action: 'נשאר פעיל ב-Private repo (GitHub Pro/Team)', reason: 'Staging deploy' },
  { item: 'Secrets', action: 'להעביר VITE_SUPABASE_PUBLISHABLE_KEY ל-GitHub Secret', reason: 'לא hardcode ב-workflow' },
];

writeFileSync(join(OUT, 'github-security-audit.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
