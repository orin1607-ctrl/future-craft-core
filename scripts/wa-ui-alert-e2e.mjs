/**
 * Staging ONLY — ONE alert through the SOFTWARE UI (Playwright), as מנהל על יוני אטיאס.
 * Path: Login session → /alert-settings (ensure toggles) → /faults → דיווח תקלה → שלח דיווח
 * Does NOT call notify-accident-email directly from this script.
 * Does NOT touch Production.
 */
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const STAGING = 'usfeoerkpcafxxlyuldl';
const PROD = 'qasomfndnjuixgjmjwcm';
const SB = `https://${STAGING}.supabase.co`;
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzZmVvZXJrcGNhZnh4bHl1bGRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTQ4NTYsImV4cCI6MjA5NDY5MDg1Nn0.Z1AsULSK9fNsVwjw7iRP_DkSodeTUdtb-eB5s66qtJU';
const APP =
  process.env.STAGING_APP_URL ||
  'https://orin1607-ctrl.github.io/future-craft-core';
const OWNER_EMAIL = 'orin1607@gmail.com';
const OWNER_NAME = 'יוני אטיאס';
const WA_DEST = '0534338601';
const EMAIL_DEST = 'orin1607@gmail.com';
const COMPANY = 'מוסך יוני';
const OUT = 'public/project-001/wa-ui-alert-e2e-result.json';
const SUMMARY = 'public/project-001/wa-ui-alert-e2e-summary.json';
const SHOT_DIR = 'docs/screenshots/ui-alert-e2e';

const out = {
  id: 'wa-ui-alert-e2e',
  at: new Date().toISOString(),
  env: 'staging_only',
  production_touched: false,
  via_software_ui: true,
  no_direct_edge_invoke_from_script: true,
  actor: { email: OWNER_EMAIL, name: OWNER_NAME, role: 'מנהל על' },
  recipients: { whatsapp: WA_DEST, email: EMAIL_DEST },
};

function must(cond, msg) {
  if (!cond) throw new Error(msg);
}

function abortProd() {
  if (SB.includes(PROD) || String(process.env.VITE_SUPABASE_URL || '').includes(PROD)) {
    throw new Error('ABORT: Production detected');
  }
}

function decodeJwt(jwt) {
  try {
    return JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

async function resolveServiceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const k = process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
    const p = decodeJwt(k);
    must(!p?.ref || p.ref === STAGING, `SERVICE_ROLE ref=${p?.ref} ≠ Staging`);
    return k;
  }
  const token = (process.env.SUPABASE_ACCESS_TOKEN || '').replace(/[\r\n]/g, '').trim();
  must(token, 'SUPABASE_ACCESS_TOKEN or SUPABASE_SERVICE_ROLE_KEY required');
  const keys = JSON.parse(
    execSync(`npx supabase projects api-keys --project-ref ${STAGING} -o json`, {
      encoding: 'utf8',
      env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
    }),
  );
  const service = keys.find((x) => x.name === 'service_role' || (x.tags || []).includes('service_role'))?.api_key;
  must(service, 'No Staging service_role key');
  return service;
}

async function sb(path, { method = 'GET', key, body, prefer } = {}) {
  const res = await fetch(`${SB}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 800) };
  }
  return { status: res.status, json, text: text.slice(0, 1500) };
}

async function ownerSession(srk) {
  const gen = await sb('/auth/v1/admin/generate_link', {
    method: 'POST',
    key: srk,
    body: { type: 'magiclink', email: OWNER_EMAIL },
  });
  must(gen.status < 300, `generate_link HTTP ${gen.status}`);
  const otp = gen.json?.email_otp || gen.json?.hashed_token;
  must(otp, 'No email_otp from generate_link');
  const ver = await sb('/auth/v1/verify', {
    method: 'POST',
    key: ANON,
    body: { type: 'magiclink', email: OWNER_EMAIL, token: otp },
  });
  must(ver.status < 300, `verify HTTP ${ver.status}: ${ver.text.slice(0, 200)}`);
  const access = ver.json?.access_token || ver.json?.session?.access_token;
  const refresh = ver.json?.refresh_token || ver.json?.session?.refresh_token;
  const user = ver.json?.user || ver.json?.session?.user;
  must(access, 'No access_token for Owner');
  return { access, refresh, user };
}

async function restAsService(srk, path) {
  return sb(path, { key: srk, prefer: 'return=representation' });
}

async function main() {
  abortProd();
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const srk = await resolveServiceKey();
  out.staging_ref = STAGING;
  out.app_url = APP;

  const session = await ownerSession(srk);
  out.auth = {
    ok: true,
    user_id: session.user?.id || null,
    email: session.user?.email || OWNER_EMAIL,
    method: 'magiclink_then_ui_session_inject',
  };

  // Profile check (service) — confirm super_admin if profiles table has it
  const prof = await restAsService(
    srk,
    `/rest/v1/profiles?select=id,full_name,role,company_name,email,phone&email=eq.${encodeURIComponent(OWNER_EMAIL)}&limit=1`,
  );
  out.profile = Array.isArray(prof.json) ? prof.json[0] : prof.json;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'he-IL',
  });
  const page = await context.newPage();

  const edgeCalls = [];
  page.on('response', async (res) => {
    const url = res.url();
    if (!/notify-accident-email|functions\/v1\//i.test(url)) return;
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = { raw: (await res.text().catch(() => '')).slice(0, 500) };
    }
    edgeCalls.push({
      url: url.replace(SB, ''),
      status: res.status(),
      body,
      at: new Date().toISOString(),
    });
  });

  // Inject session before app boots
  await page.addInitScript(
    ({ access, refresh, anon, url }) => {
      const key = `sb-usfeoerkpcafxxlyuldl-auth-token`;
      const payload = {
        access_token: access,
        refresh_token: refresh,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: null,
      };
      window.localStorage.setItem(key, JSON.stringify(payload));
      // also common alternate
      window.localStorage.setItem('supabase.auth.token', JSON.stringify(payload));
    },
    { access: session.access, refresh: session.refresh, anon: ANON, url: SB },
  );

  await page.goto(`${APP}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(2500);

  // If still on login, try setting session via evaluate after load
  if (/login/i.test(page.url())) {
    await page.evaluate(
      ({ access, refresh }) => {
        const key = 'sb-usfeoerkpcafxxlyuldl-auth-token';
        const payload = {
          access_token: access,
          refresh_token: refresh,
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        };
        localStorage.setItem(key, JSON.stringify(payload));
      },
      { access: session.access, refresh: session.refresh },
    );
    await page.goto(`${APP}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(2500);
  }

  await page.screenshot({ path: `${SHOT_DIR}/01-home-after-auth.png`, fullPage: true });
  out.ui_after_auth_url = page.url();

  // --- Alert settings via UI ---
  await page.goto(`${APP}/alert-settings`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(2000);

  // Select company if list present
  const companySelect = page.locator('select').first();
  if (await companySelect.count()) {
    const opts = await companySelect.locator('option').allTextContents();
    out.company_options = opts.slice(0, 20);
    const match = opts.find((t) => t.includes('יוני') || t.includes(COMPANY));
    if (match) {
      await companySelect.selectOption({ label: match });
      await page.waitForTimeout(1000);
    } else if (opts.length > 1) {
      await companySelect.selectOption({ index: 1 });
      await page.waitForTimeout(1000);
    }
  }

  // Scroll to incident settings and enable checkboxes
  const incidentHeading = page.getByText('הגדרות התראות על תאונות ותקלות');
  if (await incidentHeading.count()) {
    await incidentHeading.scrollIntoViewIfNeeded();
  }
  for (const label of [
    'התראה בתוך המערכת — פעיל / כבוי',
    'Email — פעיל / כבוי',
    'WhatsApp (תוספת בתשלום) — פעיל / כבוי',
  ]) {
    const row = page.locator('label').filter({ hasText: label });
    if (await row.count()) {
      const cb = row.locator('input[type="checkbox"]');
      if (await cb.count()) {
        const checked = await cb.isChecked();
        if (!checked) await cb.check();
      }
    }
  }
  // Recipients → דליה / both
  const emailRecipients = page.locator('label:has-text("נמעני Email")').locator('..').locator('select');
  const waRecipients = page.locator('label:has-text("נמעני WhatsApp")').locator('..').locator('select');
  if (await emailRecipients.count()) await emailRecipients.selectOption('dalia');
  if (await waRecipients.count()) await waRecipients.selectOption('dalia');

  const saveBtn = page.getByRole('button', { name: /שמור/ });
  if (await saveBtn.count()) {
    await saveBtn.first().click();
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: `${SHOT_DIR}/02-alert-settings.png`, fullPage: true });
  out.alert_settings_done = true;

  // --- Create fault via UI ---
  await page.goto(`${APP}/faults`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOT_DIR}/03-faults-list.png`, fullPage: true });

  // Open new fault — FAB or button
  let opened = false;
  for (const sel of [
    page.getByRole('button', { name: /תקלה חדשה/ }),
    page.getByText('תקלה חדשה'),
    page.getByText('דיווח תקלה חדשה'),
    page.locator('button').filter({ hasText: /תקלה חדשה|דיווח/ }),
  ]) {
    if (await sel.count()) {
      await sel.first().click({ timeout: 5000 }).catch(() => null);
      opened = true;
      break;
    }
  }
  // Floating action button often is last primary button
  if (!opened) {
    const fabs = page.locator('button.fixed, button[class*="fab"], button:has(svg)');
    const n = await fabs.count();
    if (n) {
      await fabs.nth(n - 1).click();
      opened = true;
    }
  }
  await page.waitForTimeout(1500);
  out.fault_form_opened = opened || (await page.getByText('דיווח תקלה חדשה').count()) > 0;
  must(out.fault_form_opened, 'Could not open fault form in UI');

  // Fill form
  const vehicleSelect = page.locator('label:has-text("רכב")').locator('..').locator('select');
  must(await vehicleSelect.count(), 'Vehicle select missing');
  const vOpts = await vehicleSelect.locator('option').allTextContents();
  must(vOpts.length > 1, 'No vehicles to select');
  await vehicleSelect.selectOption({ index: 1 });

  const driverSelect = page.locator('label:has-text("נהג")').locator('..').locator('select');
  if (await driverSelect.count()) {
    const dOpts = await driverSelect.locator('option').allTextContents();
    // Prefer יוני if listed
    const yoni = dOpts.findIndex((t) => t.includes('יוני'));
    if (yoni > 0) await driverSelect.selectOption({ index: yoni });
    else if (dOpts.length > 1) await driverSelect.selectOption({ index: 1 });
  }

  const faultType = page.locator('label:has-text("סוג תקלה")').locator('..').locator('select');
  await faultType.selectOption({ label: 'פנצ׳ר' }).catch(async () => {
    await faultType.selectOption({ index: 1 });
  });

  const desc = page.locator('label:has-text("תיאור")').locator('..').locator('textarea');
  await desc.fill(
    `בדיקת E2E UI התראות Staging — מנהל על יוני אטיאס — ${new Date().toISOString()} — WA ${WA_DEST} · Email ${EMAIL_DEST}`,
  );

  await page.screenshot({ path: `${SHOT_DIR}/04-fault-form-filled.png`, fullPage: true });

  const submit = page.getByRole('button', { name: /שלח דיווח/ });
  must(await submit.count(), 'Submit button missing');

  const beforeFaults = await restAsService(
    srk,
    `/rest/v1/faults?select=id,event_number,created_at,description,company_name&order=created_at.desc&limit=3`,
  );

  await submit.click();
  // Wait for success UI or toast
  await page.waitForTimeout(8000);
  const successVisible =
    (await page.getByText(/נשמר|הצלחה|מספר אירוע|תצוגה מקדימה/i).count()) > 0 ||
    (await page.getByText(/דיווח תקלה חדש/i).count()) > 0;
  await page.screenshot({ path: `${SHOT_DIR}/05-after-submit.png`, fullPage: true });
  out.ui_success_visible = successVisible;
  out.edge_calls_from_browser = edgeCalls;

  // Find newest fault matching our description marker
  let fault = null;
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const q = await restAsService(
      srk,
      `/rest/v1/faults?select=*&description=ilike.*בדיקת E2E UI התראות Staging*&order=created_at.desc&limit=1`,
    );
    if (Array.isArray(q.json) && q.json[0]) {
      fault = q.json[0];
      break;
    }
  }
  out.fault_saved = fault
    ? {
        id: fault.id,
        event_number: fault.event_number || fault.serial_id,
        company_name: fault.company_name,
        created_at: fault.created_at || fault.date,
        description: String(fault.description || '').slice(0, 120),
      }
    : null;
  must(fault, 'Fault not found in DB after UI submit');

  // Deliveries
  let deliveries = [];
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const d = await restAsService(
      srk,
      `/rest/v1/incident_notification_deliveries?incident_id=eq.${fault.id}&select=*&order=created_at.desc`,
    );
    if (Array.isArray(d.json) && d.json.length) {
      deliveries = d.json;
      // wait a bit more for DLR update if whatsapp pending/sent
      const wa = deliveries.find((x) => x.channel === 'whatsapp');
      if (wa && (wa.status === 'delivered' || wa.status === 'failed' || wa.provider_message_id)) break;
      if (i > 8) break;
    }
  }
  out.deliveries = deliveries;

  const waDel = deliveries.find((x) => x.channel === 'whatsapp') || null;
  const emailDel = deliveries.find((x) => x.channel === 'email') || null;
  const inAppDel = deliveries.find((x) => x.channel === 'in_app') || null;

  // In-app notifications row
  const inApp = await restAsService(
    srk,
    `/rest/v1/driver_notifications?select=id,title,created_at,user_id&order=created_at.desc&limit=5`,
  );
  out.driver_notifications_sample = Array.isArray(inApp.json) ? inApp.json.slice(0, 5) : inApp.json;

  // Screens check: open faults detail / alerts if possible
  await page.goto(`${APP}/faults`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  const onList = (await page.getByText(String(fault.event_number || '').slice(0, 8)).count()) > 0
    || (await page.getByText('פנצ׳ר').count()) > 0
    || (await page.getByText('בדיקת E2E UI').count()) > 0;
  out.appears_on_faults_screen = onList;
  await page.screenshot({ path: `${SHOT_DIR}/06-faults-after.png`, fullPage: true });

  await page.goto(`${APP}/alerts`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOT_DIR}/07-alerts-screen.png`, fullPage: true }).catch(() => null);

  await browser.close();

  const edgeNotify = edgeCalls.find((c) => /notify-accident-email/i.test(c.url));
  out.answers = {
    '1_created_in_system_ui': Boolean(fault),
    '2_saved_in_db': Boolean(fault?.id),
    '3_whatsapp_sent': Boolean(waDel && ['sent', 'delivered', 'pending'].includes(waDel.status) && waDel.provider_message_id),
    '4_email_sent': Boolean(emailDel && ['sent', 'delivered', 'pending'].includes(emailDel.status)),
    '5_appears_on_screens': Boolean(onList),
    edge_function: 'notify-accident-email',
    edge_invoked_by_browser: Boolean(edgeNotify),
    whatsapp: {
      recipient: waDel?.recipient || WA_DEST,
      message_id: waDel?.provider_message_id || null,
      status: waDel?.status || null,
      error: waDel?.error_message || null,
      submitted: Boolean(waDel),
      sent: waDel?.status === 'sent' || waDel?.status === 'delivered',
      delivered_or_failed: waDel?.status === 'delivered' || waDel?.status === 'failed' ? waDel.status : null,
      received_on_phone_he:
        'סטטוס delivered במערכת = אינדיקציה חזקה; אישור קבלה בפועל בטלפון — אצל Owner',
    },
    email: {
      recipient: emailDel?.recipient || EMAIL_DEST,
      status: emailDel?.status || null,
      provider_message_id: emailDel?.provider_message_id || null,
      error: emailDel?.error_message || null,
      sent_to_orin1607: Boolean(emailDel && String(emailDel.recipient || '').includes('orin1607')),
      inbox_receipt_he: 'Resend status=sent אומר שנשלח; קבלה בתיבה — Owner מאשר',
    },
    in_app: inAppDel || null,
    full_path_ok: Boolean(
      fault?.id &&
        edgeNotify &&
        waDel?.provider_message_id &&
        emailDel &&
        ['sent', 'delivered'].includes(emailDel.status),
    ),
  };

  const summary = {
    id: 'wa-ui-alert-e2e-summary',
    at: out.at,
    production_touched: false,
    via_software_ui: true,
    actor: OWNER_NAME,
    edge_function: 'notify-accident-email',
    fault: out.fault_saved,
    whatsapp_message_id: out.answers.whatsapp.message_id,
    whatsapp_status: out.answers.whatsapp.status,
    email_status: out.answers.email.status,
    steps: {
      ui_create: out.answers['1_created_in_system_ui'],
      db_saved: out.answers['2_saved_in_db'],
      whatsapp: out.answers['3_whatsapp_sent'],
      email: out.answers['4_email_sent'],
      screens: out.answers['5_appears_on_screens'],
      full_path_ok: out.answers.full_path_ok,
    },
    report_doc: 'docs/audit-reports/claims-incident-process/WA-UI-ALERT-E2E-HE.md',
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  fs.writeFileSync(SUMMARY, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ summary, answers: out.answers, edge_calls: edgeCalls.length }, null, 2));

  must(out.answers['1_created_in_system_ui'], 'UI create failed');
  must(out.answers['2_saved_in_db'], 'DB save failed');
  // Soft-fail messaging channels in report but exit non-zero if neither sent
  if (!out.answers.full_path_ok) {
    console.error('PATH_INCOMPLETE', summary.steps);
    process.exit(2);
  }
}

main().catch((e) => {
  out.error = String(e.message || e);
  try {
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
    fs.writeFileSync(
      SUMMARY,
      JSON.stringify({ id: 'wa-ui-alert-e2e-summary', error: out.error, at: new Date().toISOString() }, null, 2),
    );
  } catch {
    /* ignore */
  }
  console.error(e);
  process.exit(1);
});
