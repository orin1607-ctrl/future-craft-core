/**
 * Post-deploy verification: send-user-access-code on dalia-staging.
 * Creates 2 test users (manual + auto code), invokes edge function, checks API + DB + UI messages.
 *
 * Usage (credentials in .env.local or env):
 *   TEST_EMAIL=super_admin@... TEST_PASSWORD=... TEST_RECIPIENT=verified@...
 *   node scripts/verify-access-code-email-staging.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const STAGING_HOST = 'usfeoerkpcafxxlyuldl.supabase.co';

function loadEnv() {
  const env = {};
  for (const name of ['.env', '.env.local']) {
    const p = join(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[t.slice(0, eq).trim()] = v;
    }
  }
  return env;
}

function hashCode(code) {
  return createHash('sha256').update(code.trim().toUpperCase(), 'utf8').digest('hex');
}

function parseResendError(raw) {
  if (!raw?.trim()) return 'שגיאה לא ידועה מ-Resend';
  try {
    const parsed = JSON.parse(raw);
    if (parsed.message) return parsed.message;
    if (typeof parsed.error === 'string') return parsed.error;
  } catch {
    /* plain */
  }
  return raw.trim().slice(0, 400);
}

function isEmailActuallySent(res) {
  return res?.email_sent === true && res?.resend_status === 200;
}

function uiToast(sendToEmail, sendResult) {
  if (!sendToEmail) {
    return sendResult?.code_saved !== false
      ? { title: 'קוד גישה נשמר', variant: 'default' }
      : null;
  }
  if (isEmailActuallySent(sendResult)) {
    return { title: '📧 אימייל נשלח בפועל', variant: 'default' };
  }
  const reason = sendResult?.resend_error
    ? parseResendError(sendResult.resend_error)
    : sendResult?.resend_status
      ? `Resend החזיר סטטוס ${sendResult.resend_status}`
      : 'RESEND_API_KEY לא מוגדר או שליחה לא בוצעה';
  return {
    title: 'הקוד נשמר, אבל האימייל לא נשלח',
    description: reason,
    variant: 'destructive',
  };
}

async function extractError(error, data) {
  if (data?.error) return data.error;
  if (error?.context?.json) {
    try {
      const body = await error.context.json();
      if (body?.error) return body.error;
    } catch { /* ignore */ }
  }
  return error?.message || 'unknown';
}

const fileEnv = loadEnv();
const url = process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY;
const adminEmail = process.env.TEST_EMAIL || fileEnv.TEST_EMAIL;
const adminPassword = process.env.TEST_PASSWORD || fileEnv.TEST_PASSWORD;
const recipient = process.env.TEST_RECIPIENT || fileEnv.TEST_RECIPIENT || adminEmail;

const report = {
  at: new Date().toISOString(),
  project: STAGING_HOST,
  deploy: { function: 'send-user-access-code', version: 4 },
  scenarios: [],
};

function addScenario(name, detail) {
  report.scenarios.push({ name, ...detail });
  const status = detail.ok ? 'OK' : 'FAIL';
  console.log(status, name, detail.summary || '');
}

async function runScenario(supabase, label, mode, code, recipientEmail) {
  const ts = Date.now();
  const userEmail = `um-verify-${mode}-${ts}@staging-e2e.local`;

  const create = await supabase.functions.invoke('create-admin-user', {
    body: {
      email: userEmail,
      password: 'TestPass1',
      full_name: `בדיקת ${label}`,
      phone: '0503333001',
      role: 'private_customer',
      company_name: '',
      is_active: false,
      approval_status: 'pending',
      contact_email: recipientEmail,
    },
  });
  const createErr = await extractError(create.error, create.data);
  if (create.error || create.data?.error || !create.data?.user_id) {
    addScenario(label, { ok: false, summary: `create failed: ${createErr}` });
    return;
  }

  const userId = create.data.user_id;
  const send = await supabase.functions.invoke('send-user-access-code', {
    body: {
      user_id: userId,
      code,
      mode,
      email: recipientEmail,
      send_email: true,
    },
  });
  const sendErr = await extractError(send.error, send.data);
  const api = send.data || {};
  const toast = uiToast(true, api);

  const { data: row } = await supabase
    .from('user_access_codes')
    .select('mode, code_hash, sent_to_email_at, is_active, created_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const emailActuallySent = isEmailActuallySent(api);
  const dbSentAtMatches = emailActuallySent ? !!row?.sent_to_email_at : !row?.sent_to_email_at;
  const hashOk = row?.code_hash === hashCode(code);

  addScenario(label, {
    ok: !send.error && !api.error && hashOk && dbSentAtMatches,
    summary: `email_sent=${api.email_sent} resend_status=${api.resend_status} sent_to_email_at=${row?.sent_to_email_at || 'null'}`,
    api: {
      code_saved: api.code_saved,
      email_sent: api.email_sent,
      resend_status: api.resend_status,
      resend_error: api.resend_error || null,
    },
    db: {
      mode: row?.mode,
      sent_to_email_at: row?.sent_to_email_at,
      hash_ok: hashOk,
    },
    ui_toast: toast,
    user_id: userId,
    error: sendErr || null,
  });
}

async function main() {
  if (!url?.includes(STAGING_HOST)) {
    console.error('Refusing: not staging URL');
    process.exit(1);
  }
  if (!adminEmail || !adminPassword) {
    report.blocked = 'Set TEST_EMAIL + TEST_PASSWORD in .env.local';
    mkdirSync('test-results', { recursive: true });
    writeFileSync(join('test-results', 'access-code-email-verify.json'), JSON.stringify(report, null, 2));
    console.error(report.blocked);
    process.exit(2);
  }

  const supabase = createClient(url, key);
  const { error: authErr } = await supabase.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  });
  if (authErr) {
    report.blocked = `sign-in failed: ${authErr.message}`;
    console.error(report.blocked);
    process.exit(3);
  }

  const manualCode = `MAN${String(Date.now()).slice(-6)}`;
  const autoCode = `AUTO${String(Date.now() + 1).slice(-6)}X`;

  await runScenario(supabase, 'manual-code-email', 'manual', manualCode, recipient);
  await runScenario(supabase, 'auto-code-email', 'auto', autoCode, recipient);

  mkdirSync('test-results', { recursive: true });
  const out = join('test-results', 'access-code-email-verify.json');
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log('Report →', out);

  const failed = report.scenarios.some((s) => !s.ok);
  process.exit(failed ? 1 : 0);
}

main();
