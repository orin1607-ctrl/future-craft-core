/**
 * Published Staging QA for the vehicle-dashboard inspection next-due card.
 * Creates isolated QA data in Staging, exercises the real tri/semi form, and
 * deletes every QA row. Production is explicitly refused.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
if (REF === PROD_REF) throw new Error('refused: Production DB');
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
if (BASE.includes('dalia-car.online')) throw new Error('refused: Production site');

const OUT = join(
  process.cwd(),
  'docs/audit-reports/oren-car-inspection-dashboard-next-due-staging/qa',
);
mkdirSync(join(OUT, 'screenshots'), { recursive: true });

const keys = JSON.parse(
  execSync(`supabase projects api-keys --project-ref ${REF} -o json`, { encoding: 'utf8' }),
);
const serviceKey = keys.find((key) => key.name === 'service_role')?.api_key;
const anonKey =
  keys.find((key) => key.name === 'anon' && key.type === 'legacy')?.api_key
  || keys.find((key) => key.name === 'anon')?.api_key;
const url = `https://${REF}.supabase.co`;
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const runId = Date.now();
const company = `QA-NEXT-DUE-${runId}`;
const email = `qa-next-due-${runId}@staging-e2e.local`;
const password = `QaNext!${runId}`;
const defectNote = `הערת QA מועד הבא ${runId}`;
const report = {
  at: new Date().toISOString(),
  environment: 'Oren Car Staging',
  ref: REF,
  base: BASE,
  company,
  deploy: {},
  results: [],
  consoleErrors: [],
  supabaseFailures: [],
  cleanup: null,
};

let passed = 0;
let failed = 0;
let userId;
const vehicleIds = [];
const inspectionIds = [];

function record(id, device, ok, detail = {}) {
  report.results.push({ id, device, status: ok ? 'PASS' : 'FAIL', detail });
  ok ? passed += 1 : failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} [${device}]`, JSON.stringify(detail).slice(0, 500));
}

async function wait(page, ms = 1800) {
  await page.waitForTimeout(ms);
  await page.waitForLoadState('networkidle').catch(() => null);
}

function displayDate(isoDate) {
  return new Intl.DateTimeFormat('he-IL').format(new Date(`${isoDate}T12:00:00`));
}

async function createContext(browser, session, device) {
  const mobile = device === 'mobile';
  const context = await browser.newContext({
    locale: 'he-IL',
    viewport: mobile ? { width: 390, height: 844 } : { width: 1500, height: 1100 },
    isMobile: mobile,
    hasTouch: mobile,
    userAgent: mobile
      ? 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140 Safari/537.36',
  });
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    {
      key: `sb-${REF}-auth-token`,
      value: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: session.token_type,
        user: session.user,
      },
    },
  );
  return context;
}

async function createVehicle(suffix, internal) {
  const plate = `ND${String(runId).slice(-5)}${suffix}`;
  const { data, error } = await admin
    .from('vehicles')
    .insert({
      license_plate: plate,
      internal_number: internal,
      manufacturer: 'QA',
      model: `NextDue-${suffix}`,
      company_name: company,
      status: 'active',
      year: 2026,
      odometer: 85000,
    })
    .select('id, license_plate')
    .single();
  if (error) throw error;
  vehicleIds.push(data.id);
  return data;
}

async function performInspection(page, vehicle, months, withDefect = false) {
  await page.goto(
    `${BASE}/private-vehicle-inspection?vehicleId=${vehicle.id}&plate=${encodeURIComponent(vehicle.license_plate)}&context=vehicle`,
    { waitUntil: 'domcontentloaded', timeout: 120000 },
  );
  await wait(page);
  await page.locator('input[placeholder*="עובד"]').fill(`QA Next Due ${runId}`);
  await page.locator('input[type="number"]').fill(String(85000 + months * 10));
  await page.getByRole('button', { name: new RegExp(`\\+${months} חודשים`) }).click();
  const nextDueDate = await page.locator('input[type="date"]').nth(1).inputValue();

  if (withDefect) {
    await page.getByRole('button', { name: '✗' }).first().click();
    await page.getByPlaceholder('הערות...').first().fill(defectNote);
  }

  await page.getByRole('button', { name: /שמור בדיקה/ }).click();
  await wait(page, 4500);

  const { data, error } = await admin
    .from('vehicle_inspections')
    .select('id, inspection_date, inspection_type, next_due_date, notes, overall_status')
    .eq('vehicle_id', vehicle.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (error) throw error;
  inspectionIds.push(data.id);
  return { ...data, expectedDueDate: nextDueDate };
}

async function dashboardCard(page, vehicle, label, dueDate, expired, device, screenshot) {
  await page.goto(`${BASE}/vehicles?vehicleId=${vehicle.id}&view=hub`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await wait(page);
  const labelNode = page.getByText(label, { exact: true }).first();
  await labelNode.waitFor({ state: 'visible', timeout: 15000 });
  const tileText = (await labelNode.locator('..').innerText()).replace(/\s+/g, ' ').trim();
  if (screenshot) {
    await page.screenshot({ path: join(OUT, 'screenshots', screenshot), fullPage: true });
  }
  const ok =
    tileText.includes(displayDate(dueDate))
    && (expired ? tileText.includes('פג') : !tileText.includes('פג'));
  record(`dashboard-${label}-${expired ? 'past' : 'future'}`, device, ok, {
    tileText,
    expectedDate: displayDate(dueDate),
    expired,
  });
  return tileText;
}

const browser = await chromium.launch({ headless: true });
let contexts = [];

try {
  const deployText = await fetch(`${BASE}/STAGING-DEPLOY.txt?qa=${Date.now()}`).then((r) => r.text());
  report.deploy = { marker: deployText.trim(), expected: '1584cc8' };
  record('deploy-marker', 'both', deployText.includes('1584cc8'), report.deploy);

  await admin.from('company_settings').upsert({
    company_name: company,
    reminder_30_days: true,
    reminder_7_days: true,
    reminder_1_day: true,
    hidden_buttons: [],
  });
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  await admin.from('profiles').upsert({
    id: userId,
    full_name: `QA Next Due ${runId}`,
    company_name: company,
    phone: '0500000055',
    is_active: true,
    approval_status: 'approved',
    two_factor_approved: true,
  });
  await admin.from('user_roles').delete().eq('user_id', userId);
  await admin.from('user_roles').insert({ user_id: userId, role: 'fleet_manager' });

  const vehicle3 = await createVehicle('3', '903');
  const vehicle6 = await createVehicle('6', '906');
  const vehiclePast = await createVehicle('P', '909');
  const vehicleEmpty = await createVehicle('E', '900');

  const auth = await anon.auth.signInWithPassword({ email, password });
  if (auth.error) throw auth.error;

  const desktopContext = await createContext(browser, auth.data.session, 'desktop');
  contexts.push(desktopContext);
  const desktop = await desktopContext.newPage();
  desktop.on('console', (message) => {
    if (message.type() === 'error') report.consoleErrors.push(message.text().slice(0, 300));
  });
  desktop.on('response', (response) => {
    if (response.status() >= 400 && response.url().includes('supabase.co')) {
      report.supabaseFailures.push({ status: response.status(), url: response.url().slice(0, 220) });
    }
  });

  const inspection3 = await performInspection(desktop, vehicle3, 3, true);
  const inspection6 = await performInspection(desktop, vehicle6, 6);
  record(
    'save-3-months',
    'desktop',
    inspection3.next_due_date === inspection3.expectedDueDate,
    inspection3,
  );
  record(
    'save-6-months',
    'desktop',
    inspection6.next_due_date === inspection6.expectedDueDate,
    inspection6,
  );

  await dashboardCard(
    desktop,
    vehicle3,
    'בדיקה תלת חודשית',
    inspection3.next_due_date,
    false,
    'desktop',
    'desktop-3-months.png',
  );
  await dashboardCard(
    desktop,
    vehicle6,
    'בדיקה חצי שנתית',
    inspection6.next_due_date,
    false,
    'desktop',
    'desktop-6-months.png',
  );

  await desktop.reload({ waitUntil: 'domcontentloaded' });
  await wait(desktop);
  const refreshBody = await desktop.locator('body').innerText();
  record(
    'refresh',
    'desktop',
    refreshBody.includes('בדיקה חצי שנתית')
      && refreshBody.includes(displayDate(inspection6.next_due_date))
      && !refreshBody.includes(`${displayDate(inspection6.next_due_date)} (פג)`),
    { expectedDate: displayDate(inspection6.next_due_date) },
  );

  const { data: pastInspection, error: pastError } = await admin
    .from('vehicle_inspections')
    .insert({
      vehicle_id: vehiclePast.id,
      vehicle_plate: vehiclePast.license_plate,
      inspection_type: 'tri_semi_annual',
      inspection_date: '2024-08-01',
      next_due_date: '2025-02-01',
      inspector_name: `QA Next Due ${runId}`,
      overall_status: 'passed',
      notes: 'קילומטראז׳: 85000',
      company_name: company,
      created_by: userId,
    })
    .select('id')
    .single();
  if (pastError) throw pastError;
  inspectionIds.push(pastInspection.id);
  await dashboardCard(
    desktop,
    vehiclePast,
    'בדיקה חצי שנתית',
    '2025-02-01',
    true,
    'desktop',
    'desktop-past-due.png',
  );

  await desktop.goto(`${BASE}/vehicles?vehicleId=${vehicleEmpty.id}&view=hub`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await wait(desktop);
  const emptyLabel = desktop.getByText('בדיקת תלת / חצי', { exact: true }).first();
  const emptyText = await emptyLabel.locator('..').innerText();
  record(
    'no-inspection',
    'desktop',
    emptyText.includes('לא הוגדר') && !emptyText.includes('פג'),
    { tileText: emptyText },
  );

  const otherCardsText = await desktop.locator('body').innerText();
  record(
    'other-dashboard-cards',
    'desktop',
    ['ביטוחים ורישיונות', 'מסמכים', 'חוסרים והתראות', 'סטטוס רכב', 'טיפול הבא', 'ק\"מ נוכחי']
      .every((label) => otherCardsText.includes(label)),
    {},
  );

  await desktop.goto(`${BASE}/vehicle-inspections?inspectionId=${inspection3.id}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await wait(desktop);
  const detailText = await desktop.locator('body').innerText();
  const { count: itemCount } = await admin
    .from('inspection_items')
    .select('id', { count: 'exact', head: true })
    .eq('inspection_id', inspection3.id);
  const { count: taskCount } = await admin
    .from('vehicle_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('inspection_id', inspection3.id);
  const { count: alertCount } = await admin
    .from('custom_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('company_name', company)
    .eq('alert_type', 'officer')
    .like('title', `%${vehicle3.license_plate}%`);
  record(
    'inspection-regression',
    'desktop',
    itemCount > 0
      && taskCount === 1
      && alertCount > 0
      && detailText.includes(defectNote)
      && detailText.includes(inspection3.next_due_date.slice(0, 4)),
    { itemCount, taskCount, alertCount, detailHasNote: detailText.includes(defectNote) },
  );

  const { data: vehicleAfter } = await admin
    .from('vehicles')
    .select('odometer, next_inspection_date')
    .eq('id', vehicle3.id)
    .single();
  record(
    'odometer-and-next-due-regression',
    'desktop',
    vehicleAfter.odometer === 85030
      && vehicleAfter.next_inspection_date === inspection3.next_due_date,
    vehicleAfter,
  );

  await desktop.goto(`${BASE}/reports`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await wait(desktop);
  record(
    'reports-regression',
    'desktop',
    (await desktop.locator('body').innerText()).includes('דוחות'),
    {},
  );

  const mobileContext = await createContext(browser, auth.data.session, 'mobile');
  contexts.push(mobileContext);
  const mobile = await mobileContext.newPage();
  await dashboardCard(
    mobile,
    vehicle3,
    'בדיקה תלת חודשית',
    inspection3.next_due_date,
    false,
    'mobile',
    'mobile-3-months.png',
  );
  await dashboardCard(
    mobile,
    vehicle6,
    'בדיקה חצי שנתית',
    inspection6.next_due_date,
    false,
    'mobile',
    'mobile-6-months.png',
  );

  await desktopContext.close();
  contexts = contexts.filter((context) => context !== desktopContext);
  const reentryContext = await createContext(browser, auth.data.session, 'desktop');
  contexts.push(reentryContext);
  const reentry = await reentryContext.newPage();
  await dashboardCard(
    reentry,
    vehicle6,
    'בדיקה חצי שנתית',
    inspection6.next_due_date,
    false,
    'reentry',
    'reentry-6-months.png',
  );

  record(
    'runtime',
    'both',
    report.supabaseFailures.length === 0,
    {
      supabaseFailures: report.supabaseFailures,
      consoleErrors: report.consoleErrors.slice(0, 8),
    },
  );
} catch (error) {
  report.fatal = String(error?.stack || error);
  failed += 1;
  console.error(error);
} finally {
  for (const context of contexts) await context.close().catch(() => null);
  await browser.close().catch(() => null);
  try {
    await admin.from('custom_alerts').delete().eq('company_name', company);
    await admin.from('vehicle_tasks').delete().eq('company_name', company);
    if (inspectionIds.length) {
      await admin.from('inspection_items').delete().in('inspection_id', inspectionIds);
      await admin.from('vehicle_inspections').delete().in('id', inspectionIds);
    }
    if (vehicleIds.length) await admin.from('vehicles').delete().in('id', vehicleIds);
    await admin.from('company_settings').delete().eq('company_name', company);
    if (userId) {
      await admin.from('user_roles').delete().eq('user_id', userId);
      await admin.from('profiles').delete().eq('id', userId);
      await admin.auth.admin.deleteUser(userId);
    }
    const [vehiclesLeft, inspectionsLeft, alertsLeft] = await Promise.all([
      admin.from('vehicles').select('id', { count: 'exact', head: true }).eq('company_name', company),
      admin.from('vehicle_inspections').select('id', { count: 'exact', head: true }).eq('company_name', company),
      admin.from('custom_alerts').select('id', { count: 'exact', head: true }).eq('company_name', company),
    ]);
    report.cleanup = {
      ok: vehiclesLeft.count === 0 && inspectionsLeft.count === 0 && alertsLeft.count === 0,
      vehicles: vehiclesLeft.count,
      inspections: inspectionsLeft.count,
      alerts: alertsLeft.count,
    };
  } catch (cleanupError) {
    report.cleanup = { ok: false, error: String(cleanupError) };
    failed += 1;
  }
}

report.summary = { passed, failed, cleanup: report.cleanup?.ok === true };
report.pass = failed === 0 && report.cleanup?.ok === true;
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));
if (!report.pass) process.exit(1);
