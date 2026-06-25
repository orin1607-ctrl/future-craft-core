const GTM_SCOPE = 'https://www.googleapis.com/auth/tagmanager.readonly';
const GTM_API = 'https://tagmanager.googleapis.com/tagmanager/v2';

export function gtmOAuthStatus(auth) {
  const scope = String(auth?.credentials?.scope || '');
  return {
    hasTagManagerScope: scope.includes('tagmanager'),
    requiredScope: GTM_SCOPE,
  };
}

async function gtmFetch(path, accessToken) {
  const res = await fetch(`${GTM_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 300) };
  }
  if (!res.ok) {
    const msg = data?.error?.message || text.slice(0, 200);
    const err = new Error(`HTTP ${res.status}: ${msg}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/** List GTM accounts + containers (read-only). */
export async function probeGtm(accessToken) {
  const report = {
    timestamp: new Date().toISOString(),
    ok: false,
    accounts: [],
    containers: [],
    errors: [],
    owner_gate: null,
  };

  try {
    const accountsData = await gtmFetch('/accounts', accessToken);
    const accounts = accountsData.account || [];
    report.accounts = accounts.map((a) => ({
      accountId: a.accountId,
      name: a.name,
      path: a.path,
    }));

    for (const acc of accounts.slice(0, 5)) {
      try {
        const containersData = await gtmFetch(`/accounts/${acc.accountId}/containers`, accessToken);
        for (const c of containersData.container || []) {
          report.containers.push({
            accountId: acc.accountId,
            accountName: acc.name,
            containerId: c.containerId,
            publicId: c.publicId,
            name: c.name,
            path: c.path,
          });
        }
      } catch (e) {
        report.errors.push({ step: `containers:${acc.accountId}`, message: e.message?.slice(0, 200) });
      }
    }

    report.ok = report.containers.length > 0 || report.accounts.length > 0;
  } catch (e) {
    report.errors.push({ step: 'accounts', message: e.message?.slice(0, 300) });
    if (e.status === 403) {
      report.owner_gate = {
        id: 'gtm_scope_or_api',
        enableApi: 'https://console.cloud.google.com/apis/library/tagmanager.googleapis.com?project=project001aimarketing',
        reauth: 'npm run project-001:auth -- --force',
        scope: GTM_SCOPE,
      };
    }
  }

  return report;
}

export async function fetchGtmContainerSummary(accessToken, accountId, containerId) {
  const workspace = await gtmFetch(
    `/accounts/${accountId}/containers/${containerId}/workspaces`,
    accessToken,
  );
  const defaultWs = (workspace.workspace || []).find((w) => w.name === 'Default Workspace') ||
    workspace.workspace?.[0];
  if (!defaultWs) return { ok: false, error: 'no_workspace' };

  const wsPath = defaultWs.path;
  const [tags, triggers, variables] = await Promise.all([
    gtmFetch(`${wsPath}/tags`, accessToken).catch(() => ({ tag: [] })),
    gtmFetch(`${wsPath}/triggers`, accessToken).catch(() => ({ trigger: [] })),
    gtmFetch(`${wsPath}/variables`, accessToken).catch(() => ({ variable: [] })),
  ]);

  return {
    ok: true,
    accountId,
    containerId,
    workspace: defaultWs.name,
    tagCount: (tags.tag || []).length,
    triggerCount: (triggers.trigger || []).length,
    variableCount: (variables.variable || []).length,
    tags: (tags.tag || []).slice(0, 20).map((t) => ({
      name: t.name,
      type: t.type,
      tagId: t.tagId,
    })),
  };
}
