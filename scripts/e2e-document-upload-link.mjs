/**
 * E2E: Document Request Hub public upload link
 * create → open → get → upload → status (pending_approval/uploaded)
 *
 * Usage:
 *   SRK=... ANON=... node scripts/e2e-document-upload-link.mjs --env production
 *   SRK=... ANON=... node scripts/e2e-document-upload-link.mjs --env staging
 */
import { createClient } from '@supabase/supabase-js';
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
const admin = createClient(SB, srk, { auth: { persistSession: false, autoRefreshToken: false } });

function log(step, data) {
  console.log(JSON.stringify({ step, ...data }));
}

async function getSuperAdminSession() {
  const { data: roles, error: rolesErr } = await admin
    .from('user_roles')
    .select('user_id, role')
    .eq('role', 'super_admin')
    .limit(20);
  if (rolesErr) throw rolesErr;
  const saIds = new Set((roles || []).map((r) => r.user_id));
  if (!saIds.size) throw new Error('no super_admin');

  let target = null;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
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

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: target.email,
  });
  if (linkErr) throw linkErr;
  const hashed = linkData?.properties?.hashed_token;
  if (!hashed) throw new Error('no hashed_token from generateLink');

  const userClient = createClient(SB, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  let otp = await userClient.auth.verifyOtp({ token_hash: hashed, type: 'magiclink' });
  if (otp.error) otp = await userClient.auth.verifyOtp({ token_hash: hashed, type: 'email' });
  if (otp.error) throw otp.error;
  const accessToken = otp.data.session?.access_token;
  if (!accessToken) throw new Error('no access_token');
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
    // GH Pages may serve SPA via 404.html — still expect app shell
    throw new Error('upload-request page did not return app shell');
  }
  log('frontend_live', { ok: true, bundle: m[1], origin: cfg.publicOrigin });
}

const report = { env: envName, ref: cfg.ref, ok: false, steps: {} };

try {
  await assertFrontendLive();

  const session = await getSuperAdminSession();
  log('auth', { email: session.email, userId: session.userId });

  const { data: driver, error: driverErr } = await admin
    .from('drivers')
    .select('id, full_name, phone, email, company_name')
    .neq('full_name', '')
    .limit(1)
    .maybeSingle();
  if (driverErr || !driver) throw new Error(`no driver: ${driverErr?.message || 'empty'}`);
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

  // Simulate customer opening the WhatsApp link (SPA shell)
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
  report.steps.open_api = { status: opened.status, success: opened.json.success, status_field: opened.json.request?.status, error: opened.json.error };
  log('open_api', report.steps.open_api);
  if (!opened.json.success) throw new Error(`open failed: ${JSON.stringify(opened.json)}`);

  const got = await publicGet(token);
  report.steps.get = { status: got.status, success: got.json.success, req_status: got.json.request?.status, error: got.json.error };
  log('get', report.steps.get);
  if (!got.json.success) throw new Error(`get failed: ${JSON.stringify(got.json)}`);

  // Minimal valid JPEG
  const jpeg = Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBUQEBAVFRUVFRUVFRUVFRUWFxUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGxAQGy0lHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAbAAACAwEBAQAAAAAAAAAAAAADBAECBQYAB//EABUBAQEAAAAAAAAAAAAAAAAAAAAB/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAEC/9oADAMBAAIQAxAAAAGhQf/EABQQAQAAAAAAAAAAAAAAAAAAAD/aAAgBAQABBQJf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyFf/9oADAMBAAIQAxAAAAGhQf/EABQQAQAAAAAAAAAAAAAAAAAAAD/aAAgBAQABBQJf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyFf/9k=',
    'base64',
  );
  // Prefer tiny PNG to avoid jpeg parse issues
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  const uploaded = await publicUpload(token, png, `e2e-license-${randomBytes(4).toString('hex')}.png`, 'image/png');
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

  // Confirm DB row
  const { data: row } = await admin
    .from('document_requests')
    .select('id, status, opened_at, uploaded_at')
    .eq('id', created.json.request_id)
    .maybeSingle();
  report.steps.db_row = row;
  log('db_row', row || {});
  if (!row || row.status !== finalStatus) throw new Error('db status mismatch');

  report.ok = true;
  report.upload_url = uploadUrl;
  console.log(JSON.stringify({ ok: true, env: envName, upload_url: uploadUrl, final_status: finalStatus, request_id: created.json.request_id }, null, 2));
  process.exit(0);
} catch (e) {
  report.ok = false;
  report.error = e instanceof Error ? e.message : String(e);
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
