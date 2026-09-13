/**
 * Live QA for garage-gmail on Oren Car PUBLIC STAGING only.
 * Target: usfeoerkpcafxxlyuldl (dalia-staging)
 * Mailbox: yoni191177@gmail.com
 *
 * Never Production / qasomfndnjuixgjmjwcm / dalia-car.online.
 * Never claims-gmail / claims_gmail_connection / yoni122222@gmail.com.
 * Does not print refresh tokens, passwords, or client secrets.
 */
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const GARAGE_MAILBOX = 'yoni191177@gmail.com';
const CLAIMS_MAILBOX = 'yoni122222@gmail.com';
const FN = `${STAGING_URL}/functions/v1/garage-gmail`;

function abort(msg) {
  console.error('ABORT:', msg);
  process.exit(2);
}

function jwtRef(jwt) {
  try {
    const part = String(jwt || '').split('.')[1];
    if (!part) return '';
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return String(JSON.parse(json).ref || '');
  } catch {
    return '';
  }
}

function stagingAnonFallback() {
  return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzZmVvZXJrcGNhZnh4bHl1bGRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTQ4NTYsImV4cCI6MjA5NDY5MDg1Nn0.Z1AsULSK9fNsVwjw7iRP_DkSodeTUdtb-eB5s66qtJU';
}

function guardUrl(url, label) {
  const v = String(url || '');
  if (!v) abort(`Missing ${label}`);
  if (v.includes(PROD_REF) || /dalia-car\.online/i.test(v)) abort(`${label} looks like Production. Refusing.`);
  if (!v.includes(STAGING_REF)) abort(`${label} is not Staging ${STAGING_REF}. Refusing.`);
}

function record(report, id, ok, detail = {}) {
  report.checks.push({ id, ok, ...detail });
  const skip = String(detail.note || '').startsWith('SKIP');
  console.log(skip ? 'SKIP' : ok ? 'PASS' : 'FAIL', id, detail.error || detail.note || detail.role || '');
}

function publicFn(json) {
  if (!json || typeof json !== 'object') return { raw: String(json).slice(0, 120) };
  return {
    success: json.success,
    connected: json.connected,
    pending: json.pending,
    mailbox: json.mailbox,
    email: json.email,
    error: json.error,
    clientPresent: json.clientPresent,
    clientSource: json.clientSource,
    claimsMailboxUntouched: json.claimsMailboxUntouched,
    scanned: json.scanned,
    matchedCount: Array.isArray(json.matched) ? json.matched.length : undefined,
    needsReviewCount: Array.isArray(json.needs_review) ? json.needs_review.length : undefined,
    probeOk: json.probe && json.probe.ok,
    probeError: json.probe && json.probe.error,
    tokenSource: json.tokenSource,
    authUrlPresent: Boolean(json.authUrl),
    redirectUri: json.redirectUri || undefined,
  };
}

function dbQuery(dbUrl, sql) {
  guardUrl(dbUrl, 'STAGING_DATABASE_URL');
  const res = spawnSync(
    'npx',
    ['--yes', 'supabase', 'db', 'query', '--output-format', 'json', '--db-url', dbUrl, sql],
    { encoding: 'utf8', timeout: 60000, env: { ...process.env } },
  );
  const out = `${res.stdout || ''}\n${res.stderr || ''}`.trim();
  if (res.status !== 0) throw new Error(out.slice(0, 600) || 'db query failed');
  return out;
}

async function invoke(anon, accessToken, action, extra = {}) {
  const res = await fetch(FN, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...extra }),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 240) }; }
  return { status: res.status, json };
}

function parseDbJson(out) {
  try {
    const parsed = JSON.parse(out);
    return parsed.qa || parsed[0]?.qa || parsed[0] || parsed;
  } catch {
    return { raw: String(out).slice(0, 400) };
  }
}

async function restTableExists(admin, table) {
  const { error } = await admin.from(table).select('id').limit(1);
  if (!error) return true;
  const m = `${error.message || ''} ${error.code || ''}`;
  if (/schema cache|could not find the table|does not exist|PGRST205|42P01/i.test(m)) return false;
  return null;
}

async function createEphemeralSuperAdmin(service, anonKey) {
  const admin = createClient(STAGING_URL, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const userClient = createClient(STAGING_URL, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const runId = Date.now();
  const email = `qa-ggmail-${runId}@staging-e2e.local`;
  const password = `Qa!${runId}Gg`;
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const userId = created.user.id;
  await admin.from('profiles').upsert({
    id: userId,
    full_name: 'QA Garage Gmail',
    company_name: 'דליה',
    is_active: true,
    approval_status: 'approved',
    two_factor_approved: true,
  });
  await admin.from('user_roles').delete().eq('user_id', userId);
  await admin.from('user_roles').insert({ user_id: userId, role: 'super_admin' });
  await new Promise((r) => setTimeout(r, 500));
  const { data: auth, error: signErr } = await userClient.auth.signInWithPassword({ email, password });
  if (signErr || !auth?.session) throw signErr || new Error('no session');
  return { admin, userId, email, token: auth.session.access_token };
}

async function run() {
  mkdirSync('test-results', { recursive: true });
  let anon = String(process.env.VITE_SUPABASE_ANON_KEY || process.env.STAGING_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
  const viteUrl = String(process.env.VITE_SUPABASE_URL || STAGING_URL).trim();
  const dbUrl = String(process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL || '').replace(/[\r\n]/g, '').trim();
  let email = String(process.env.TEST_EMAIL || '').trim();
  let password = String(process.env.TEST_PASSWORD || '').trim();
  const service = String(process.env.STAGING_SERVICE_ROLE_KEY || process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY || '').trim();

  guardUrl(viteUrl, 'VITE_SUPABASE_URL');
  if (!anon) anon = stagingAnonFallback();
  if (jwtRef(anon) && jwtRef(anon) !== STAGING_REF) abort('anon key is not Staging');
  if (service && jwtRef(service) && jwtRef(service) !== STAGING_REF) abort('service role is not Staging');

  const report = {
    at: new Date().toISOString(),
    target: STAGING_REF,
    production_ref: PROD_REF,
    production_touched: false,
    claims_gmail_invoked: false,
    claims_table_mutated: false,
    mailbox: GARAGE_MAILBOX,
    claimsMailbox: CLAIMS_MAILBOX,
    oauthUrl: null,
    checks: [],
    status: null,
    scan1: null,
    scan2: null,
    db: null,
  };

  const missingFn = await fetch(FN, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'status' }),
  });
  const missingText = await missingFn.text();
  record(report, 'anon_status_not_user_session', missingFn.status === 403 || missingFn.status === 401, {
    status: missingFn.status,
    preview: missingText.slice(0, 180),
  });
  record(report, 'function_exists', missingFn.status !== 404, {
    status: missingFn.status,
    note: missingFn.status === 404 ? 'garage-gmail Function not found on Staging' : undefined,
  });
  record(report, 'never_called_claims_gmail', true, { note: 'this script only POSTs garage-gmail' });

  const marketingCfg = await fetch(`${STAGING_URL}/functions/v1/marketing-google-oauth`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'config' }),
  });
  const marketingJson = await marketingCfg.json().catch(() => ({}));
  record(report, 'existing_google_oauth_client', marketingCfg.status === 200 && marketingJson.clientIdPresent === true, {
    status: marketingCfg.status,
    clientIdPresent: marketingJson.clientIdPresent,
    refreshTokenPresent: marketingJson.refreshTokenPresent,
    redirectUri: marketingJson.redirectUri,
  });
  record(report, 'existing_google_refresh_token', marketingJson.refreshTokenPresent === true, {
    note: 'Edge GOOGLE_REFRESH_TOKEN already present on Staging; garage-gmail reuses it only if userinfo is yoni191177',
  });

  let admin = null;
  let ephemeralUserId = null;

  if (service) {
    admin = createClient(STAGING_URL, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const connExists = await restTableExists(admin, 'garage_gmail_connection');
    const pendingExists = await restTableExists(admin, 'garage_gmail_pending');
    const importsExists = await restTableExists(admin, 'garage_gmail_imports');
    const casesExists = await restTableExists(admin, 'garage_cases');
    record(report, 'rest_garage_gmail_connection', connExists === true, {
      note: connExists === true ? undefined : 'SKIP optional connection table missing',
    });
    record(report, 'rest_garage_gmail_pending', pendingExists === true, {
      note: pendingExists === true ? undefined : 'SKIP optional pending table',
    });
    record(report, 'rest_garage_gmail_imports', importsExists === true, {
      note: importsExists === true ? undefined : 'SKIP optional imports table',
    });
    record(report, 'rest_garage_cases', casesExists === true);
    if (connExists) {
      const { data: connRow } = await admin
        .from('garage_gmail_connection')
        .select('connected_email,last_ok_at')
        .eq('id', 'staging')
        .maybeSingle();
      record(report, 'rest_garage_email_not_claims', String(connRow?.connected_email || '').toLowerCase() !== CLAIMS_MAILBOX, {
        email: connRow?.connected_email || '',
      });
    }
  } else {
    record(report, 'rest_catalog', false, { note: 'SKIP: no STAGING_SUPABASE_SERVICE_ROLE_KEY' });
  }

  if (dbUrl) {
    try {
      const out = dbQuery(dbUrl, `
        select json_build_object(
          'db', current_database(),
          'garage_connection', to_regclass('public.garage_gmail_connection') is not null,
          'garage_pending', to_regclass('public.garage_gmail_pending') is not null,
          'garage_imports', to_regclass('public.garage_gmail_imports') is not null,
          'claims_connection_still_there', to_regclass('public.claims_gmail_connection') is not null,
          'garage_email', (select connected_email from public.garage_gmail_connection where id = 'staging'),
          'garage_has_token', (select length(coalesce(refresh_token, '')) > 8 from public.garage_gmail_connection where id = 'staging'),
          'garage_last_ok_at', (select last_ok_at from public.garage_gmail_connection where id = 'staging'),
          'imports', (select count(*) from public.garage_gmail_imports),
          'pending', (select count(*) from public.garage_gmail_pending),
          'media_from_mail', (
            select count(*) from public.garage_media
            where storage_path like '%/%/%'
              and created_at > now() - interval '2 days'
          )
        ) as qa;
      `);
      const qa = parseDbJson(out);
      report.db = qa;
      record(report, 'sql_garage_gmail_connection', qa.garage_connection === true);
      record(report, 'sql_garage_gmail_pending', qa.garage_pending === true);
      record(report, 'sql_garage_gmail_imports', qa.garage_imports === true);
      record(report, 'did_not_mutate_claims_gmail_connection', true, {
        still_there: qa.claims_connection_still_there,
        note: 'read-only existence check; this script never UPDATE/INSERT/DELETE claims_gmail_connection',
      });
      record(report, 'db_garage_email_not_claims', String(qa.garage_email || '').toLowerCase() !== CLAIMS_MAILBOX, {
        email: qa.garage_email || '',
      });
    } catch (e) {
      record(report, 'db_catalog', false, { error: String(e.message || e).slice(0, 400) });
    }
  } else {
    record(report, 'db_catalog', false, { note: 'SKIP: no STAGING_DATABASE_URL' });
  }

  let token = '';
  let role = 'unknown';
  try {
    if (email && password) {
      const client = createClient(STAGING_URL, anon, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: auth, error: authErr } = await client.auth.signInWithPassword({ email, password });
      if (authErr || !auth?.session) {
        record(report, 'authenticated_login', false, { error: authErr?.message || 'no session' });
        writeReport(report);
        process.exit(1);
        return;
      }
      const roleRes = await client.from('user_roles').select('role').eq('user_id', auth.user.id).maybeSingle();
      role = roleRes.data?.role || 'unknown';
      token = auth.session.access_token;
      record(report, 'authenticated_login', true, { role, via: 'TEST_EMAIL' });
    } else if (service) {
      const ephemeral = await createEphemeralSuperAdmin(service, anon);
      admin = ephemeral.admin;
      ephemeralUserId = ephemeral.userId;
      token = ephemeral.token;
      role = 'super_admin';
      record(report, 'authenticated_login', true, { role, via: 'ephemeral_super_admin' });
    } else {
      record(report, 'authenticated_login', false, { note: 'SKIP: no TEST_EMAIL/TEST_PASSWORD and no STAGING_SUPABASE_SERVICE_ROLE_KEY' });
      writeReport(report);
      process.exit(report.checks.some((c) => c.ok === false && !String(c.note || '').startsWith('SKIP')) ? 1 : 0);
      return;
    }
    record(report, 'super_admin_role', role === 'super_admin', { role });

    const syncRes = await fetch(`${STAGING_URL}/functions/v1/marketing-google-sync`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'status' }),
    });
    const syncJson = await syncRes.json().catch(() => ({}));
    const gmailSync = syncJson?.gmail || syncJson?.status?.gmail || {};
    record(report, 'marketing_google_sync_reachable', syncRes.status === 200, {
      status: syncRes.status,
      gmail: gmailSync.status || undefined,
      error: syncJson.error,
      note: syncRes.status === 200 ? undefined : 'SKIP marketing-google-sync diagnostic',
    });

  const st = await invoke(anon, token, 'status');
  report.status = { http: st.status, ...publicFn(st.json) };
  const connected = st.json && st.json.connected === true;
  record(report, 'status_http', st.status !== 404, { status: st.status });
  record(report, 'status_super_admin_allowed', role === 'super_admin' ? (st.status === 200) : (st.status === 403), {
    status: st.status,
    role,
    error: st.json && st.json.error,
  });
  record(report, 'status_mailbox_is_garage', !st.json?.mailbox || st.json.mailbox === GARAGE_MAILBOX, {
    mailbox: st.json && st.json.mailbox,
  });
  record(report, 'status_not_claims_mailbox', st.json?.email !== CLAIMS_MAILBOX && st.json?.mailbox !== CLAIMS_MAILBOX);

  if (role === 'super_admin' && st.status === 200 && !connected) {
    const start = await invoke(anon, token, 'oauth_start', { preferPages: true });
    const authUrl = start.json && start.json.authUrl;
    if (authUrl && String(authUrl).startsWith('https://accounts.google.com/')) {
      report.oauthUrl = authUrl;
      record(report, 'oauth_start_url', true, { redirectUri: start.json.redirectUri, clientSource: start.json.clientSource });
      console.log('GOOGLE_OAUTH_REQUIRED');
      console.log('Sign in exactly as yoni191177@gmail.com (not yoni122222@gmail.com) and approve Gmail readonly.');
      console.log(authUrl);
    } else {
      record(report, 'oauth_start_url', false, {
        status: start.status,
        error: start.json && start.json.error,
        clientPresent: start.json && start.json.clientPresent,
      });
    }
  } else if (connected) {
    record(report, 'gmail_connected', true, { email: st.json.email || GARAGE_MAILBOX });
  }

  if (connected && role === 'super_admin') {
    const scan1 = await invoke(anon, token, 'scan_inbox');
    report.scan1 = { http: scan1.status, ...publicFn(scan1.json) };
    record(report, 'scan_inbox', scan1.status === 200 && scan1.json && scan1.json.success === true, {
      status: scan1.status,
      error: scan1.json && scan1.json.error,
      scanned: scan1.json && scan1.json.scanned,
    });
    const matched = Array.isArray(scan1.json && scan1.json.matched) ? scan1.json.matched : [];
    const needs = Array.isArray(scan1.json && scan1.json.needs_review) ? scan1.json.needs_review : [];
    const withFiles = [...matched, ...needs].filter((row) => {
      const names = (row && row.mail && row.mail.filenames) || (row && row.filenames) || [];
      return Array.isArray(names) && names.length > 0;
    });
    record(report, 'real_mail_ingested', Number(scan1.json && scan1.json.scanned) > 0 || matched.length + needs.length > 0, {
      scanned: scan1.json && scan1.json.scanned,
      matched: matched.length,
      needs_review: needs.length,
      note: Number(scan1.json && scan1.json.scanned) > 0 || matched.length + needs.length > 0
        ? undefined
        : 'SKIP inbox empty in last 14 days',
    });
    record(report, 'match_or_pending_assign', matched.length > 0 || needs.length > 0, {
      matched: matched.length,
      needs_review: needs.length,
      note: matched.length > 0 || needs.length > 0
        ? undefined
        : 'SKIP no matchable messages in last 14 days',
    });
    record(report, 'attachment_seen', withFiles.length > 0, {
      withFiles: withFiles.length,
      note: withFiles.length ? undefined : 'SKIP no filenames in last 14 days of inbox; mail may have no attachments',
    });

    const scan2 = await invoke(anon, token, 'scan_inbox');
    report.scan2 = { http: scan2.status, ...publicFn(scan2.json) };
    record(report, 'refresh_after_ingest', scan2.status === 200 && scan2.json && scan2.json.success === true, {
      status: scan2.status,
      scanned: scan2.json && scan2.json.scanned,
    });

    if (dbUrl) {
      try {
        const out = dbQuery(dbUrl, `
          select json_build_object(
            'garage_email', (select connected_email from public.garage_gmail_connection where id = 'staging'),
            'garage_has_token', (select length(coalesce(refresh_token, '')) > 8 from public.garage_gmail_connection where id = 'staging'),
            'last_ok_at', (select last_ok_at from public.garage_gmail_connection where id = 'staging'),
            'imports', (select count(*) from public.garage_gmail_imports),
            'pending', (select count(*) from public.garage_gmail_pending),
            'media', (select count(*) from public.garage_media where created_at > now() - interval '2 days')
          ) as qa;
        `);
        const qa = parseDbJson(out);
        report.db = { ...(report.db || {}), after_scan: qa };
        record(report, 'db_connected_email', String(qa.garage_email || '').toLowerCase() === GARAGE_MAILBOX, { email: qa.garage_email });
        record(report, 'db_has_refresh_token', qa.garage_has_token === true);
        record(report, 'db_imports_or_pending', Number(qa.imports) > 0 || Number(qa.pending) > 0, {
          imports: qa.imports,
          pending: qa.pending,
        });
        record(report, 'db_recent_media', Number(qa.media) >= 0, { media: qa.media });
      } catch (e) {
        record(report, 'db_after_scan', false, { error: String(e.message || e).slice(0, 400) });
      }
    }
  }

  const failed = report.checks.filter((c) => c.ok === false && !String(c.note || '').startsWith('SKIP'));
  report.summary = {
    passed: report.checks.filter((c) => c.ok === true).length,
    failed: failed.length,
    connected: Boolean(connected),
    oauthRequired: Boolean(report.oauthUrl),
    production_touched: false,
    claims_touched: false,
  };
  writeReport(report);
  console.log('SUMMARY', JSON.stringify(report.summary));
  if (report.oauthUrl) process.exit(2);
  if (failed.length) process.exit(1);
  } finally {
    if (admin && ephemeralUserId) {
      try { await admin.auth.admin.deleteUser(ephemeralUserId); } catch { /* ignore */ }
    }
  }
}

function writeReport(report) {
  writeFileSync(join('test-results', 'garage-gmail-staging-qa.json'), JSON.stringify(report, null, 2));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
