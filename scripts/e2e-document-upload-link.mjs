/**
 * E2E: Document Request Hub public upload link
 * create → open → get → upload → status
 *
 *   SRK=... ANON=... node scripts/e2e-document-upload-link.mjs --env production
 */
import { randomBytes } from 'crypto';

const envName = process.argv.includes('--env')
  ? process.argv[process.argv.indexOf('--env') + 1]
  : 'production';

const ENVS = {
  production: {
    ref: 'qasomfndnjuixgjmjwcm',
    publicOrigin: 'https://dalia-car.online',
  },
  staging: {
    ref: 'usfeoerkpcafxxlyuldl',
    publicOrigin: 'https://orin1607-ctrl.github.io/future-craft-core',
  },
};

const cfg = ENVS[envName];
if (!cfg) throw new Error(`unknown env ${envName}`);

const srk = process.env.SRK || process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.ANON || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!srk) throw new Error('SRK / SUPABASE_SERVICE_ROLE_KEY required');
if (!anon) throw new Error('ANON / VITE_SUPABASE_PUBLISHABLE_KEY required');

const SB = `https://${cfg.ref}.supabase.co`;

function log(step, data) {
  console.log(JSON.stringify({ step, ...data }));
}

async function rest(path, { method = 'GET', body, bearer = srk, prefer } = {}) {
  const headers = {
    apikey: srk,
    Authorization: `Bearer ${bearer}`,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${SB}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 400)}`);
  }
  return json;
}

async function getSuperAdminSession() {
  const roles = await rest('/rest/v1/user_roles?role=eq.super_admin&select=user_id');
  const saIds = new Set((roles || []).map((r) => r.user_id));
  if (!saIds.size) throw new Error('no super_admin');

  let target = null;
  for (let page = 1; page <= 20; page++) {
    const data = await rest(`/auth/v1/admin/users?page=${page}&per_page=200`);
    const users = data?.users || [];
    if (!users.length) break;
    for (const u of users) {
      const em = (u.email || '').toLowerCase();
      if (!saIds.has(u.id) || !em || em.endsWith('.local')) continue;
      if (em.includes('orin') || em.includes('ilana')) {
        target = u;
        break;
      }
      target = target || u;
    }
    if (target && ((target.email || '').includes('orin') || (target.email || '').includes('ilana'))) break;
  }
  if (!target?.email) throw new Error('no target super_admin email');

  const linkData = await rest('/auth/v1/admin/generate_link', {
    method: 'POST',
    body: { type: 'magiclink', email: target.email },
  });
  const hashed = linkData?.hashed_token || linkData?.properties?.hashed_token;
  if (!hashed) throw new Error(`no hashed_token: ${JSON.stringify(Object.keys(linkData || {}))}`);

  async function verify(type) {
    const res = await fetch(`${SB}/auth/v1/verify`, {
      method: 'POST',
      headers: { apikey: anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, token_hash: hashed }),
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, json };
  }

  let otp = await verify('magiclink');
  if (!otp.ok) otp = await verify('email');
  const accessToken = otp.json?.access_token || otp.json?.session?.access_token;
  if (!accessToken) throw new Error(`verifyOtp failed: ${JSON.stringify(otp.json).slice(0, 300)}`);
  return { accessToken, email: target.email, userId: target.id };
}

async function invokeJson(body, accessToken) {
  const res = await fetch(`${SB}/functions/v1/document-request`, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function publicGet(token) {
  const res = await fetch(
    `${SB}/functions/v1/document-request?action=get&token=${encodeURIComponent(token)}`,
    { headers: { apikey: anon } },
  );
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function publicOpen(token) {
  const res = await fetch(`${SB}/functions/v1/document-request`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'open', token }),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function publicUpload(token, bytes, fileName, mime) {
  const form = new FormData();
  form.set('action', 'upload');
  form.set('token', token);
  form.set('file', new Blob([bytes], { type: mime }), fileName);
  const res = await fetch(`${SB}/functions/v1/document-request`, {
    method: 'POST',
    headers: { apikey: anon },
    body: form,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function assertFrontendLive() {
  const html = await fetch(`${cfg.publicOrigin}/`).then((r) => r.text());
  const m = html.match(/assets\/(index-[^"]+\.js)/);
  if (!m) throw new Error('no bundle in index.html');
  const js = await fetch(`${cfg.publicOrigin}/${m[0]}`).then((r) => r.text());
  if (js.includes('assertClientStaging')) {
    throw new Error(`assertClientStaging still live on ${envName} (${m[1]})`);
  }
  if (!js.includes('upload-request')) throw new Error('upload-request missing from bundle');
  const page = await fetch(
    `${cfg.publicOrigin}/upload-request?t=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`,
  ).then((r) => r.text());
  if (!page.includes('id="root"') && !page.includes('העלאת מסמך')) {
    throw new Error('upload-request page did not return app shell');
  }
  log('frontend_live', { ok: true, bundle: m[1], origin: cfg.publicOrigin });
  return m[1];
}

const report = { env: envName, ref: cfg.ref, ok: false, steps: {} };

try {
  report.bundle = await assertFrontendLive();

  const session = await getSuperAdminSession();
  log('auth', { email: session.email, userId: session.userId });

  const drivers = await rest(
    '/rest/v1/drivers?select=id,full_name,phone,email,company_name&full_name=neq.&limit=1',
  );
  const driver = drivers?.[0];
  if (!driver) throw new Error('no driver');
  report.driver = { id: driver.id, name: driver.full_name };

  const created = await invokeJson(
    {
      action: 'create',
      document_type_key: 'driver_license',
      entity_type: 'driver',
      entity_id: driver.id,
      entity_label: driver.full_name,
      recipient_name: driver.full_name,
      recipient_phone: driver.phone || '',
      channel: 'link',
      public_app_origin: cfg.publicOrigin,
      notes: `e2e-upload-link-${envName}-${Date.now()}`,
    },
    session.accessToken,
  );
  report.steps.create = {
    status: created.status,
    success: created.json.success,
    request_id: created.json.request_id,
    upload_url: created.json.upload_url,
    error: created.json.error,
  };
  log('create', report.steps.create);
  if (!created.json.success || !created.json.token || !created.json.upload_url) {
    throw new Error(`create failed: ${JSON.stringify(created.json)}`);
  }

  const uploadUrl = created.json.upload_url;
  if (!uploadUrl.startsWith(cfg.publicOrigin)) {
    throw new Error(`upload_url origin mismatch: ${uploadUrl}`);
  }
  if (!uploadUrl.includes('/upload-request?t=')) {
    throw new Error(`upload_url path mismatch: ${uploadUrl}`);
  }

  const openedRes = await fetch(uploadUrl);
  const openedText = await openedRes.text();
  report.steps.open_page = {
    status: openedRes.status,
    has_root: openedText.includes('id="root"') || openedText.includes('העלאת מסמך'),
  };
  log('open_page', report.steps.open_page);
  if (openedRes.status >= 400 && envName === 'production') {
    throw new Error(`upload page HTTP ${openedRes.status}`);
  }

  const token = created.json.token;
  const opened = await publicOpen(token);
  report.steps.open_api = {
    status: opened.status,
    success: opened.json.success,
    status_field: opened.json.request?.status,
    error: opened.json.error,
  };
  log('open_api', report.steps.open_api);
  if (!opened.json.success) throw new Error(`open failed: ${JSON.stringify(opened.json)}`);

  const got = await publicGet(token);
  report.steps.get = {
    status: got.status,
    success: got.json.success,
    req_status: got.json.request?.status,
    error: got.json.error,
  };
  log('get', report.steps.get);
  if (!got.json.success) throw new Error(`get failed: ${JSON.stringify(got.json)}`);

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const uploaded = await publicUpload(
    token,
    png,
    `e2e-license-${randomBytes(4).toString('hex')}.png`,
    'image/png',
  );
  report.steps.upload = {
    status: uploaded.status,
    success: uploaded.json.success,
    error: uploaded.json.error,
    request_status: uploaded.json.request?.status || uploaded.json.status,
  };
  log('upload', report.steps.upload);
  if (!uploaded.json.success) throw new Error(`upload failed: ${JSON.stringify(uploaded.json)}`);

  const after = await publicGet(token);
  const finalStatus = after.json.request?.status;
  report.steps.final_status = { status: after.status, req_status: finalStatus };
  log('final_status', report.steps.final_status);
  if (!['uploaded', 'pending_approval', 'approved'].includes(finalStatus)) {
    throw new Error(`unexpected final status: ${finalStatus}`);
  }

  const rows = await rest(
    `/rest/v1/document_requests?id=eq.${created.json.request_id}&select=id,status,opened_at,uploaded_at`,
  );
  const row = rows?.[0];
  report.steps.db_row = row;
  log('db_row', row || {});
  if (!row || row.status !== finalStatus) throw new Error('db status mismatch');

  report.ok = true;
  report.upload_url = uploadUrl;
  console.log(
    JSON.stringify(
      {
        ok: true,
        env: envName,
        upload_url: uploadUrl,
        final_status: finalStatus,
        request_id: created.json.request_id,
        bundle: report.bundle,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (e) {
  report.ok = false;
  report.error = e instanceof Error ? e.message : String(e);
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
