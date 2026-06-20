import { copyFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';
import { PATHS, loadJson } from './paths.mjs';
import { isLegacyOAuthClient, isTargetProject, TARGET_PROJECT_ID } from '../../project-001/_lib/legacy-guard.mjs';

const PASTE_PATH = join(PATHS.googleDir, 'credentials.oauth.paste.json');

const PLAYGROUND_URI = 'https://developers.google.com/oauthplayground';
const FLEET_REDIRECT_URI = 'http://127.0.0.1:4521/oauth2callback';

export function analyzeCredentialFile(filePath) {
  if (!existsSync(filePath)) return null;
  const base = filePath.replace(/\\/g, '/').split('/').pop() || '';
  if (/example/i.test(base)) return null;
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    const block = raw.installed || raw.web;
    if (!block?.client_id || !block?.client_secret) return null;
    if (/YOUR_|REPLACE_ME|CHANGEME/i.test(block.client_id)) return null;
    if (/YOUR_|REPLACE_ME/i.test(String(block.project_id || ''))) return null;

  const clientType = raw.installed ? 'installed' : 'web';
  const redirectUris = block.redirect_uris || [];
  const isPlaygroundOnly = clientType === 'web'
    && redirectUris.length === 1
    && redirectUris[0] === PLAYGROUND_URI;
  const hasFleetRedirect = redirectUris.includes(FLEET_REDIRECT_URI);

  const isUsable = (clientType === 'installed'
    || hasFleetRedirect
    || (clientType === 'web' && !isPlaygroundOnly))
    && !isLegacyOAuthClient(block.client_id, block.project_id);

  return {
    path: filePath,
    mtime: statSync(filePath).mtime.toISOString(),
    projectId: block.project_id || null,
    clientType,
    redirectUris,
    isPlaygroundOnly,
    hasFleetRedirect,
    isUsable,
  };
  } catch {
    return null;
  }
}

export function findDownloadCandidates(downloadsDir = join(homedir(), 'Downloads')) {
  const dirs = [downloadsDir].filter((d) => existsSync(d));
  const files = new Set();
  for (const dir of dirs) {
    for (const name of readdirSync(dir)) {
      if (!/^client_secret.*\.json$/i.test(name)) continue;
      files.add(join(dir, name));
    }
  }
  // Drop client_secret JSON directly into integrations/google/
  if (existsSync(PATHS.googleDir)) {
    for (const name of readdirSync(PATHS.googleDir)) {
      if (!/^client_secret.*\.json$/i.test(name)) continue;
      files.add(join(PATHS.googleDir, name));
    }
  }
  // Also accept manual drop directly into integrations/google/
  const direct = join(PATHS.googleDir, 'credentials.oauth.json');
  if (existsSync(direct)) files.add(direct);
  return [...files]
    .map((filePath) => analyzeCredentialFile(filePath))
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.mtime) - Date.parse(a.mtime));
}

export function pickBestCredential(candidates) {
  const usable = candidates.filter((c) => c.isUsable);
  if (!usable.length) return null;
  return usable.sort((a, b) => {
    const aTarget = isTargetProject(a.projectId) ? 1 : 0;
    const bTarget = isTargetProject(b.projectId) ? 1 : 0;
    if (aTarget !== bTarget) return bTarget - aTarget;
    if (a.clientType === 'installed' && b.clientType !== 'installed') return -1;
    if (b.clientType === 'installed' && a.clientType !== 'installed') return 1;
    if (a.hasFleetRedirect && !b.hasFleetRedirect) return -1;
    if (b.hasFleetRedirect && !a.hasFleetRedirect) return 1;
    return Date.parse(b.mtime) - Date.parse(a.mtime);
  })[0];
}

export function syncConfigProjectId(projectId) {
  if (!projectId || !existsSync(PATHS.config)) return;
  const config = loadJson(PATHS.config, {});
  if (config.gcp_project_id === projectId) return;
  config.gcp_project_id = projectId;
  writeFileSync(PATHS.config, `${JSON.stringify(config, null, 2)}\n`);
}

export function installCredentialsFrom(sourcePath, { projectIdOverride = null } = {}) {
  const raw = JSON.parse(readFileSync(sourcePath, 'utf8'));
  const block = raw.web || raw.installed;
  if (!block?.client_id || !block?.client_secret) {
    throw new Error(`Invalid OAuth JSON: ${sourcePath}`);
  }
  if (projectIdOverride) block.project_id = projectIdOverride;
  if (raw.web && block) {
    const uris = new Set(block.redirect_uris || []);
    uris.add(FLEET_REDIRECT_URI);
    block.redirect_uris = [...uris];
  }
  const normalized = raw.web ? { web: block } : { installed: block };
  writeFileSync(PATHS.credentials, `${JSON.stringify(normalized, null, 2)}\n`);
  const analysis = analyzeCredentialFile(PATHS.credentials);
  if (analysis?.projectId) syncConfigProjectId(analysis.projectId);
  return analysis;
}

/** Install OAuth from Downloads — prefer newest matching target project. */
export function tryInstallKnownProjectOAuth() {
  const dirs = [join(homedir(), 'Downloads'), PATHS.googleDir].filter((d) => existsSync(d));
  const candidates = [];
  for (const dir of dirs) {
    for (const name of readdirSync(dir)) {
      if (!/^client_secret.*\.json$/i.test(name)) continue;
      if (/example/i.test(name)) continue;
      const filePath = join(dir, name);
      const raw = JSON.parse(readFileSync(filePath, 'utf8'));
      const block = raw.web || raw.installed || {};
      if (!block.client_id || !block.client_secret) continue;
      if (isLegacyOAuthClient(block.client_id, block.project_id)) continue;
      const mtime = statSync(filePath).mtimeMs;
      const targetMatch = isTargetProject(block.project_id) ? 2 : 0;
      const hasRedirect = (block.redirect_uris || []).includes(FLEET_REDIRECT_URI) ? 1 : 0;
      candidates.push({ filePath, mtime, score: targetMatch + hasRedirect, projectId: block.project_id });
    }
  }
  candidates.sort((a, b) => b.score - a.score || b.mtime - a.mtime);
  const best = candidates[0];
  if (!best) return { installed: false };
  const analysis = installCredentialsFrom(best.filePath, {
    projectIdOverride: isTargetProject(best.projectId) ? best.projectId : TARGET_PROJECT_ID,
  });
  if (analysis?.isUsable) return { installed: true, from: best.filePath, analysis };
  return { installed: false };
}

export function pickAndInstallCredentials(downloadsDir) {
  const current = existsSync(PATHS.credentials) ? analyzeCredentialFile(PATHS.credentials) : null;
  const candidates = findDownloadCandidates(downloadsDir);
  const best = pickBestCredential(candidates);
  if (!best) {
    return { installed: false, current, candidates, best: null };
  }
  if (current?.isUsable && current.path === best.path) {
    return { installed: false, current, candidates, best, reason: 'already_installed' };
  }
  if (current?.isUsable && !best.isPlaygroundOnly) {
    const currentScore = (current.clientType === 'installed' ? 2 : 0) + (current.hasFleetRedirect ? 1 : 0);
    const bestScore = (best.clientType === 'installed' ? 2 : 0) + (best.hasFleetRedirect ? 1 : 0);
    if (currentScore >= bestScore && Date.parse(current.mtime) >= Date.parse(best.mtime)) {
      return { installed: false, current, candidates, best, reason: 'current_is_better' };
    }
  }
  const installed = installCredentialsFrom(best.path);
  return { installed: true, current: installed, candidates, best, reason: 'copied_from_downloads' };
}

export function tryImportPasteCredentials() {
  if (!existsSync(PASTE_PATH)) return false;
  try {
    execSync('node scripts/google/google-import-paste.mjs', { cwd: PATHS.root, stdio: 'pipe' });
    return analyzeCredentialFile(PATHS.credentials)?.isUsable ?? false;
  } catch {
    return false;
  }
}

export function getOwnerGateStatus() {
  const cred = existsSync(PATHS.credentials) ? analyzeCredentialFile(PATHS.credentials) : null;
  const hasToken = existsSync(PATHS.token);

  if (!cred || !cred.isUsable) {
    return {
      gate: 1,
      title: 'יצירת OAuth Client + Download JSON',
      instruction:
        'Google Console → CREATE → Web application → redirect http://127.0.0.1:4521/oauth2callback → Download JSON (ללא עריכה ידנית)',
      link: 'https://console.cloud.google.com/apis/credentials/oauthclient?project=burnished-craft-466809-v1',
      auto_import: 'הקובץ ייובא אוטומטית מ-Downloads',
      credentials: cred,
      hasToken,
    };
  }

  if (!hasToken) {
    return {
      gate: 2,
      title: 'אישור OAuth בדפדפן',
      instruction: 'פתח את קישור ה-OAuth מהטרמינל / OWNER-GATES.md ואשר הרשאות. אחרי "התחברות Google הצליחה" — המשך אוטומטי.',
      link: null,
      credentials: cred,
      hasToken,
    };
  }

  return {
    gate: 0,
    title: 'אין Owner Gate פתוח — ממשיכים בדיקות',
    instruction: null,
    credentials: cred,
    hasToken,
  };
}
