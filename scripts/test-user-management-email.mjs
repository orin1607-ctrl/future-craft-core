/**
 * E2E email test: create user + send access code (dalia-staging only).
 * Usage:
 *   TEST_EMAIL=super@... TEST_PASSWORD=... TEST_RECIPIENT=recipient@... node scripts/test-user-management-email.mjs
 * TEST_RECIPIENT defaults to TEST_EMAIL.
 */
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const STAGING_HOST = 'usfeoerkpcafxxlyuldl.supabase.co';
const EXPECTED_FROM = 'דליה מערכות <onboarding@resend.dev>';
const EXPECTED_SUBJECT = 'קוד גישה — דליה';

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
  expected_from: EXPECTED_FROM,
  expected_subject: EXPECTED_SUBJECT,
  tests: [],
};

function record(name, ok, detail = {}) {
  report.tests.push({ name, ok, ...detail });
  console.log(ok ? 'OK' : 'FAIL', name, detail.message || detail.error || '');
}

async function run() {
  if (!url?.includes(STAGING_HOST)) {
    console.error('Refusing: not staging URL');
    process.exit(1);
  }
  if (!adminEmail || !adminPassword) {
    console.error('Set TEST_EMAIL + TEST_PASSWORD (super_admin staging account)');
    process.exit(2);
  }
  if (!recipient) {
    console.error('Set TEST_RECIPIENT or use TEST_EMAIL as recipient');
    process.exit(2);
  }

  const supabase = createClient(url, key);
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  });
  if (authErr) {
    record('sign-in', false, { error: authErr.message });
    finish(1);
    return;
  }
  record('sign-in', true, { message: auth.user.email });

  const ts = Date.now();

  // --- Test 1: manual code + email ---
  const manualCode = `MAN${String(ts).slice(-6)}`;
  const manualUserEmail = `um-email-manual-${ts}@staging-e2e.local`;

  const createManual = await supabase.functions.invoke('create-admin-user', {
    body: {
      email: manualUserEmail,
      password: 'TestPass1',
      full_name: 'בדיקת אימייל ידני',
      phone: '0502222001',
      role: 'private_customer',
      company_name: '',
      is_active: false,
      approval_status: 'pending',
      nickname: 'בדיקה ידנית',
      contact_email: recipient,
    },
  });
  const createManualErr = await extractError(createManual.error, createManual.data);
  if (createManual.error || createManual.data?.error || !createManual.data?.user_id) {
    record('create-user-manual', false, { error: createManualErr });
    finish(1);
    return;
  }
  const manualUserId = createManual.data.user_id;
  record('create-user-manual', true, { message: manualUserId });

  const sendManual = await supabase.functions.invoke('send-user-access-code', {
    body: {
      user_id: manualUserId,
      code: manualCode,
      mode: 'manual',
      email: recipient,
      send_email: true,
    },
  });
  const sendManualErr = await extractError(sendManual.error, sendManual.data);
  const manualEmailSent = sendManual.data?.email_sent === true;
  record('send-manual-email', manualEmailSent && !sendManual.error && !sendManual.data?.error, {
    message: `email_sent=${sendManual.data?.email_sent} resend_status=${sendManual.data?.resend_status}`,
    resend_error: sendManual.data?.resend_error || null,
    error: sendManualErr || null,
  });

  const { data: manualRow } = await supabase
    .from('user_access_codes')
    .select('mode, code_hash, is_active, sent_to_email_at')
    .eq('user_id', manualUserId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const manualHashOk = manualRow?.code_hash === hashCode(manualCode);
  record('db-manual-code-hash', manualHashOk, {
    message: manualHashOk ? 'hash matches' : `expected ${hashCode(manualCode)} got ${manualRow?.code_hash}`,
  });
  record('db-manual-sent_at', !!manualRow?.sent_to_email_at, {
    message: manualRow?.sent_to_email_at || 'missing',
  });

  // --- Test 2: auto code + email ---
  const autoCode = `AUTO${String(ts + 1).slice(-6)}X`;
  const autoUserEmail = `um-email-auto-${ts}@staging-e2e.local`;

  const createAuto = await supabase.functions.invoke('create-admin-user', {
    body: {
      email: autoUserEmail,
      password: 'TestPass1',
      full_name: 'בדיקת אימייל אוטומטי',
      phone: '0502222002',
      role: 'private_customer',
      company_name: '',
      is_active: false,
      approval_status: 'pending',
      contact_email: recipient,
    },
  });
  if (createAuto.error || createAuto.data?.error || !createAuto.data?.user_id) {
    record('create-user-auto', false, { error: await extractError(createAuto.error, createAuto.data) });
    finish(1);
    return;
  }
  const autoUserId = createAuto.data.user_id;
  record('create-user-auto', true, { message: autoUserId });

  const sendAuto = await supabase.functions.invoke('send-user-access-code', {
    body: {
      user_id: autoUserId,
      code: autoCode,
      mode: 'auto',
      email: recipient,
      send_email: true,
    },
  });
  const autoEmailSent = sendAuto.data?.email_sent === true;
  record('send-auto-email', autoEmailSent && !sendAuto.error && !sendAuto.data?.error, {
    message: `email_sent=${sendAuto.data?.email_sent} resend_status=${sendAuto.data?.resend_status}`,
    resend_error: sendAuto.data?.resend_error || null,
    error: await extractError(sendAuto.error, sendAuto.data) || null,
  });

  const { data: autoRow } = await supabase
    .from('user_access_codes')
    .select('mode, code_hash, is_active, sent_to_email_at')
    .eq('user_id', autoUserId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const autoHashOk = autoRow?.code_hash === hashCode(autoCode);
  record('db-auto-code-hash', autoHashOk, {
    message: autoHashOk ? 'hash matches' : `expected ${hashCode(autoCode)} got ${autoRow?.code_hash}`,
  });
  record('db-auto-sent_at', !!autoRow?.sent_to_email_at, {
    message: autoRow?.sent_to_email_at || 'missing',
  });

  record('email-metadata', true, {
    message: `from=${EXPECTED_FROM} subject=${EXPECTED_SUBJECT} codes=${manualCode},${autoCode} → check inbox at ${recipient}`,
  });

  finish(report.tests.some((t) => t.ok === false) ? 1 : 0);
}

function finish(code) {
  mkdirSync('test-results', { recursive: true });
  writeFileSync(join('test-results', 'user-management-email-test.json'), JSON.stringify(report, null, 2));
  console.log('Report → test-results/user-management-email-test.json');
  process.exit(code);
}

run();
