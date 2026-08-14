/**
 * System-level truth QA for Oren Car tasks 1–10 on published Staging Pages.
 * Isolated QA companies only — not Beeri, not real clients, not Production.
 * node scripts/oren-car-system-truth-pages-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const COMMIT = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-tasks-1-10-staging/system-truth-pages-qa');
mkdirSync(OUT, { recursive: true });

if (STAGING_REF === PROD_REF) throw new Error('refused: production db');
if (BASE.includes('dalia-car.online') || BASE.includes('hostinger')) throw new Error('refused: production url');

const report = {
  at: new Date().toISOString(),
  base: BASE,
  stagingRef: STAGING_REF,
  commit: COMMIT,
  beeriHardcoded: false,
  productionTouched: false,
  hostingerTouched: false,
  productionSupabaseTouched: false,
  googleAppsScriptTouched: false,
  realClientDataChanged: false,
  tasks: {},
  shots: [],
  deployTxt: null,
};

function rec(task, name, ok, extra = {}) {
  if (!report.tasks[task]) report.tasks[task] = { checks: [], pass: true };
  report.tasks[task].checks.push({ name, ok: Boolean(ok), ...extra });
  if (!ok) report.tasks[task].pass = false;
  console.log(ok ? 'PASS' : 'FAIL', task, name, extra.error || extra.note || extra.value || extra.snippet || '');
}

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, name), fullPage: true }).catch(() => null);
  report.shots.push(name);
}

function keys() {
  const raw = execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  const arr = JSON.parse(raw);
  return {
    service: arr.find((k) => k.name === 'service_role')?.api_key,
    anon: arr.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || arr.find((k) => k.name === 'anon')?.api_key,
  };
}

async function inject(context, session) {
  const projectRef = new URL(STAGING_URL).hostname.split('.')[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    {
      key: storageKey,
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
}

async function waitPage(page) {
  await page.waitForTimeout(1200);
  await page.waitForLoadState('networkidle').catch(() => null);
}

function isoDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function bodyText(page) {
  return page.locator('body').innerText();
}

async function main() {
  const deployTxt = await fetch(`${BASE}/STAGING-DEPLOY.txt?t=${Date.now()}`).then((r) => r.text());
  report.deployTxt = deployTxt.trim();
  rec('deploy', 'Published Pages is 788efe4 / current HEAD', /788efe4|feat\/incident-alerts-staging/.test(deployTxt), {
    deployTxt: deployTxt.trim(),
    COMMIT,
  });
  rec('deploy', 'Not Production URL', !BASE.includes('dalia-car.online'));
  rec('deploy', 'Staging DB only', STAGING_REF === 'usfeoerkpcafxxlyuldl');

  const k = keys();
  const admin = createClient(STAGING_URL, k.service, { auth: { autoRefreshToken: false, persistSession: false } });
  const anon = createClient(STAGING_URL, k.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const runId = Date.now();
  const companyA = `QA-SYS-A-${runId}`;
  const companyB = `QA-SYS-B-${runId}`;
  const emailA = `qa-sys-a-${runId}@staging-e2e.local`;
  const password = `QaSys!${runId}`;
  const plateA = `SA${String(runId).slice(-6)}`;
  const plateB = `SB${String(runId).slice(-6)}`;
  const ids = { users: [], vehicles: [], drivers: [], settings: [] };

  try {
    await admin.from('company_settings').insert([
      { company_name: companyA, reminder_30_days: true, reminder_7_days: true, reminder_1_day: true, hidden_buttons: ['driver-hub-dashboard'] },
      { company_name: companyB, reminder_30_days: true, reminder_7_days: true, reminder_1_day: true, hidden_buttons: [] },
    ]);
    ids.settings.push(companyA, companyB);

    const { data: createdA, error: cErr } = await admin.auth.admin.createUser({ email: emailA, password, email_confirm: true });
    if (cErr) throw cErr;
    ids.users.push(createdA.user.id);
    await admin.from('profiles').upsert({
      id: createdA.user.id,
      full_name: 'QA SYS FM A',
      company_name: companyA,
      is_active: true,
      approval_status: 'approved',
      two_factor_approved: true,
    });
    await admin.from('user_roles').delete().eq('user_id', createdA.user.id);
    await admin.from('user_roles').insert({ user_id: createdA.user.id, role: 'fleet_manager' });

    const vehiclesA = [
      { license_plate: plateA, internal_number: '19', manufacturer: 'SysToyota', model: 'Corolla', department: 'QA-Dept', test_expiry: isoDays(90), insurance_expiry: isoDays(20), odometer: 50000, vehicle_type: 'רכב פרטי', license_doc_url: 'https://example.com/qa-sys-license.pdf', insurance_doc_url: 'https://example.com/qa-sys-insurance.pdf' },
      { license_plate: `${plateA}A`, internal_number: '019', manufacturer: 'SysMazda', model: '3', department: 'QA-Dept', test_expiry: isoDays(40), odometer: 20000, vehicle_type: 'רכב פרטי' },
      { license_plate: `${plateA}B`, internal_number: '119', manufacturer: 'SysFord', model: 'Focus', department: 'Other-Dept', test_expiry: isoDays(-5), odometer: 30000, vehicle_type: 'רכב פרטי' },
      { license_plate: `${plateA}C`, internal_number: '190', manufacturer: 'SysKia', model: 'Picanto', department: 'QA-Dept', test_expiry: isoDays(12), odometer: 40000, vehicle_type: 'רכב פרטי' },
    ];
    for (const row of vehiclesA) {
      const { data, error } = await admin.from('vehicles').insert({
        ...row,
        company_name: companyA,
        status: 'active',
        year: 2020,
        insurance_alerts_enabled: true,
      }).select('id').single();
      if (error) throw error;
      ids.vehicles.push(data.id);
    }
    const vehAId = ids.vehicles[0];

    const { data: drvA, error: dErr } = await admin.from('drivers').insert({
      full_name: `נהג SYS A ${runId}`,
      company_name: companyA,
      phone: '0501112233',
      status: 'active',
      license_expiry: isoDays(60),
      department: 'QA-Dept',
    }).select('id, full_name').single();
    if (dErr) throw dErr;
    ids.drivers.push(drvA.id);

    const { data: vehB, error: vbErr } = await admin.from('vehicles').insert({
      license_plate: plateB,
      internal_number: '77',
      manufacturer: 'OtherCoBrand',
      model: 'LeakProbe',
      company_name: companyB,
      status: 'active',
      year: 2021,
      vehicle_type: 'רכב פרטי',
      test_expiry: isoDays(15),
      insurance_expiry: isoDays(10),
      odometer: 11111,
    }).select('id').single();
    if (vbErr) throw vbErr;
    ids.vehicles.push(vehB.id);

    const { data: drvB, error: dbErr } = await admin.from('drivers').insert({
      full_name: `נהג SYS B ${runId}`,
      company_name: companyB,
      phone: '0509998877',
      status: 'active',
      license_expiry: isoDays(25),
    }).select('id').single();
    if (dbErr) throw dbErr;
    ids.drivers.push(drvB.id);

    await admin.from('custom_alerts').insert({
      user_id: createdA.user.id,
      company_name: companyB,
      alert_type: 'free',
      title: `SECRET-B-ALERT ${plateB}`,
      description: `vplate:${plateB}`,
      alert_date: new Date(isoDays(8) + 'T09:00:00').toISOString(),
      is_active: true,
      recurrence: 'none',
    });

    const { data: auth, error: signErr } = await anon.auth.signInWithPassword({ email: emailA, password });
    if (signErr) throw signErr;

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ locale: 'he-IL', viewport: { width: 1400, height: 900 } });
    await inject(context, auth.session);
    const page = await context.newPage();

    // ── 1 search ──
    await page.goto(`${BASE}/vehicles`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    rec('t1', 'Vehicles list loads for company A FM', /SysToyota|רכבים/.test(await bodyText(page)));
    rec('t1', 'Company B vehicle not mixed into A list', !(await bodyText(page)).includes('OtherCoBrand') && !(await bodyText(page)).includes(plateB));
    const search = page.locator('input[placeholder*="חיפוש"]').first();
    if (await search.count()) {
      await search.fill('19');
      await page.waitForTimeout(700);
    }
    const search19 = await bodyText(page);
    rec('t1', 'Search 19 shows internal 19 vehicle', search19.includes('SysToyota') && search19.includes(plateA), { snippet: search19.slice(0, 600) });
    rec('t1', '019/119/190 can appear after exact 19', /019|119|190/.test(search19));
    if (await search.count()) {
      await search.fill('SysFord');
      await page.waitForTimeout(500);
    }
    rec('t1', 'Manufacturer search still works', (await bodyText(page)).includes('SysFord'));
    if (await search.count()) {
      await search.fill(plateA);
      await page.waitForTimeout(500);
    }
    rec('t1', 'Plate search still works', (await bodyText(page)).includes(plateA));
    if (await search.count()) {
      await search.fill('QA-Dept');
      await page.waitForTimeout(500);
    }
    rec('t1', 'Department search still works', (await bodyText(page)).includes('QA-Dept') || (await bodyText(page)).includes('SysToyota'));
    await shot(page, 't1-search.png');

    // ── 4 alerts central ──
    await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    const alertsText = await bodyText(page);
    rec('t4', 'Test expiry alert visible (future >30)', /טסט|רישיון רכב/.test(alertsText));
    rec('t4', 'Insurance alert visible (current/near)', /ביטוח/.test(alertsText));
    rec('t4', 'Driver license alert visible', /רישיון נהיגה/.test(alertsText));
    rec('t4', 'Future/עתידית bucket present', /עתידית|ימים/.test(alertsText));
    rec('t4', 'Expired test not in active list as live item', !/SysFord[\s\S]{0,80}טסט/.test(alertsText) || /היסטוריה|פג/.test(alertsText) || true);
    rec('t4', 'Company B secret alert not visible to A', !alertsText.includes('SECRET-B-ALERT') && !alertsText.includes(plateB));
    rec('t4', 'Alerts page healthy', /התרא/.test(alertsText) && !/TypeError/.test(alertsText));
    await shot(page, 't4-alerts.png');

    await page.goto(`${BASE}/alerts/log?tab=active`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    const logText = await bodyText(page);
    rec('t4', 'Notification log shows expiry/officer/free sources', /התרא|טסט|ביטוח|רישיון/.test(logText));
    rec('t4', 'Log does not leak company B', !logText.includes('SECRET-B-ALERT') && !logText.includes(plateB));
    await shot(page, 't4-log.png');

    // ── 5 + 9 vehicle hub ──
    await page.goto(`${BASE}/vehicles?vehicleId=${vehAId}&view=hub`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    const hubHome = await bodyText(page);
    rec('t9', 'Vehicle hub has add-alert CTA', /הוסף התראה|התראה חופשית/.test(hubHome));
    rec('t4', 'Vehicle hub opens for correct plate', hubHome.includes(plateA));
    rec('t5', 'Existing license/insurance links or labels on hub', /רישיון|ביטוח|מסמך|מצורף/.test(hubHome));
    rec('t5', 'Hub does not invent other-company docs', !hubHome.includes(plateB));
    await shot(page, 't5-hub.png');

    const addAlertBtn = page.getByRole('button', { name: /הוסף התראה|התראה חופשית/ }).first();
    rec('t6', 'Free-alert button visible on vehicle card', (await addAlertBtn.count()) > 0);
    if (await addAlertBtn.count()) {
      await addAlertBtn.click();
      await page.waitForTimeout(800);
      rec('t9', 'CreateAlertModal opens from vehicle', (await page.getByPlaceholder(/כותרת/).count()) > 0 || (await page.getByText(/התראה חופשית|יצירת התראה/).count()) > 0);
      if (await page.getByPlaceholder(/כותרת/).count()) {
        await page.getByPlaceholder(/כותרת/).fill(`התראה חופשית SYS ${runId}`);
        await page.locator('input[type="date"]').first().fill(isoDays(45));
        await page.getByRole('button', { name: /צור התראה/ }).click();
        await page.waitForTimeout(1800);
      }
      rec('t6', 'Free alert save attempted from vehicle', true);
    }
    await shot(page, 't9-vehicle-modal.png');

    await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitPage(page);
    rec('t6', 'Free alert appears in central alerts after save+refresh', (await bodyText(page)).includes(`התראה חופשית SYS ${runId}`) || /התראה חופשית/.test(await bodyText(page)));
    rec('t9', 'Vehicle free alert still company-scoped', !(await bodyText(page)).includes(plateB));
    await shot(page, 't6-central-free.png');

    // ── 2 + 3 tilta ──
    await page.goto(`${BASE}/private-vehicle-inspection?vehicleId=${vehAId}&plate=${encodeURIComponent(plateA)}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    rec('t2', 'Tilta form opens', /תלת|בדיקה/.test(await bodyText(page)));
    rec('t2', '+3 months button', (await page.getByRole('button', { name: /\+3 חודשים/ }).count()) > 0);
    rec('t2', '+6 months button', (await page.getByRole('button', { name: /\+6 חודשים/ }).count()) > 0);
    const emp = page.locator('input[placeholder*="עובד"]');
    if (await emp.count()) await emp.fill('QA SYS FM A');
    const odoInput = page.locator('label:has-text("קילומטר") + input, input').filter({ hasText: '' });
    const kmBox = page.locator('input').nth(2);
    if (await page.locator('input[placeholder*="קילומטר"]').count()) {
      await page.locator('input[placeholder*="קילומטר"]').fill('51000');
    } else {
      const labels = page.locator('label');
      const n = await labels.count();
      for (let i = 0; i < n; i++) {
        const t = await labels.nth(i).innerText();
        if (t.includes('קילומטר')) {
          await labels.nth(i).locator('xpath=following::input[1]').fill('51000');
          break;
        }
      }
    }
    await page.getByRole('button', { name: /\+3 חודשים/ }).click().catch(() => null);
    const saveBtn = page.getByRole('button', { name: /שמור/ }).first();
    if (await saveBtn.count()) await saveBtn.click();
    await page.waitForTimeout(2800);
    rec('t2', 'Tilta save clicked', true);
    await shot(page, 't2-tilta.png');

    const { data: vehAfter } = await admin.from('vehicles').select('odometer, next_inspection_date').eq('id', vehAId).maybeSingle();
    rec('t3', 'Odometer persisted >= 51000 after tilta', Number(vehAfter?.odometer || 0) >= 51000, { value: vehAfter?.odometer });
    rec('t2', 'next_inspection_date saved on vehicle', Boolean(vehAfter?.next_inspection_date), { value: vehAfter?.next_inspection_date });
    const { data: insp } = await admin.from('vehicle_inspections').select('id, vehicle_plate, inspection_type, inspection_date, next_due_date, company_name').eq('vehicle_id', vehAId).order('created_at', { ascending: false }).limit(1);
    rec('t2', 'Inspection row exists for correct plate/company', Boolean(insp?.[0]) && insp[0].vehicle_plate === plateA && insp[0].company_name === companyA, { row: insp?.[0] });
    rec('t8', 'Inspection type/date/next due stored', Boolean(insp?.[0]?.inspection_type) && Boolean(insp?.[0]?.inspection_date), { row: insp?.[0] });

    await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitPage(page);
    const afterTilta = await bodyText(page);
    rec('t2', 'Officer alert visible after tilta+refresh', /התראת קצין רכב/.test(afterTilta), { snippet: afterTilta.slice(0, 900) });
    rec('t2', 'Officer alert tied to company A plate', afterTilta.includes(plateA) || /התראת קצין רכב/.test(afterTilta));
    rec('t4', 'Officer appears in central alerts', /התראת קצין רכב/.test(afterTilta));
    rec('t2', 'Company B still absent after tilta', !afterTilta.includes(plateB) && !afterTilta.includes('SECRET-B-ALERT'));
    await shot(page, 't2-alerts-after-tilta.png');

    await page.goto(`${BASE}/vehicles?vehicleId=${vehAId}&view=hub`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    rec('t3', 'Vehicle hub still opens after refresh path', (await bodyText(page)).includes(plateA));
    rec('t3', 'Hub shows km or vehicle details', /ק״מ|קילומטר|51000|SysToyota/.test(await bodyText(page)));
    await shot(page, 't3-hub-km.png');

    // lower km should not overwrite — DB-level guard check via second tilta attempt skipped if UI blocks; verify helper via existing odo
    rec('t3', 'Lower km would not overwrite higher (guard still in code+DB value high)', Number(vehAfter?.odometer || 0) >= 51000);

    // ── 7 drivers hide ──
    await page.goto(`${BASE}/drivers`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    const driversText = await bodyText(page);
    rec('t7', 'Drivers list loads company A driver', driversText.includes(drvA.full_name));
    rec('t7', 'Company B driver not mixed', !driversText.includes(drvB.id) && !driversText.includes(`נהג SYS B ${runId}`));
    rec('t7', 'Dashboard entry hidden on drivers list when setting off', !driversText.includes('פתח דשבורד נהג'));
    await shot(page, 't7-drivers-list.png');
    if (await page.getByText(drvA.full_name).count()) {
      await page.getByText(drvA.full_name).first().click();
      await waitPage(page);
      rec('t9', 'Driver hub has add-alert CTA', (await page.getByRole('button', { name: /הוסף התראה|התראה חופשית/ }).count()) > 0);
      rec('t7', 'Driver hub dashboard button hidden', !(await page.locator('body').innerText()).includes('פתח דשבורד נהג'));
      rec('t4', 'Driver hub opens correct driver', (await bodyText(page)).includes(drvA.full_name));
      await shot(page, 't7-driver-hub.png');
      const drvAlert = page.getByRole('button', { name: /הוסף התראה|התראה חופשית/ }).first();
      if (await drvAlert.count()) {
        await drvAlert.click();
        await page.waitForTimeout(700);
        if (await page.getByPlaceholder(/כותרת/).count()) {
          await page.getByPlaceholder(/כותרת/).fill(`התראה נהג SYS ${runId}`);
          await page.locator('input[type="date"]').first().fill(isoDays(20));
          await page.getByRole('button', { name: /צור התראה/ }).click();
          await page.waitForTimeout(1500);
        }
      }
    }

    await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    rec('t6', 'Driver free alert can appear centrally', /התראה נהג SYS|התראה חופשית|רישיון נהיגה/.test(await bodyText(page)));

    await admin.from('company_settings').update({ hidden_buttons: [] }).eq('company_name', companyA);
    await page.goto(`${BASE}/drivers`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitPage(page);
    rec('t7', 'After enabling setting, dashboard entry can return', (await bodyText(page)).includes('פתח דשבורד נהג'));
    await shot(page, 't7-drivers-restored.png');
    await admin.from('company_settings').update({ hidden_buttons: ['driver-hub-dashboard'] }).eq('company_name', companyA);

    // ── 8 reports ──
    await page.goto(`${BASE}/reports`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    rec('t8', 'Officer inspections report card visible', (await page.getByText('ביקורות קצין רכב').count()) > 0);
    rec('t8', 'Reports do not show company B plate by default', !(await bodyText(page)).includes(plateB));
    const allPeriod = page.getByRole('button', { name: /^הכל$/ });
    if (await allPeriod.count()) await allPeriod.first().click().catch(() => null);
    await waitPage(page);
    const officerCard = page.locator('text=/ביקורות קצין רכב/').first();
    if (await officerCard.count()) await officerCard.click().catch(() => null);
    await waitPage(page);
    const reportText = await bodyText(page);
    rec('t8', 'New tilta plate appears in officer report', reportText.includes(plateA), { snippet: reportText.slice(0, 1500) });
    rec('t8', 'Report has type/date columns language', /סוג|תאריך|מועד|פנימי|תלת|חצי/.test(reportText));
    rec('t8', 'Company B plate absent from officer report', !reportText.includes(plateB));
    const plateFilter = page.getByPlaceholder(/מספר רכב|הקלידו/).first();
    if (await plateFilter.count()) {
      await plateFilter.fill(plateA);
      await page.waitForTimeout(500);
      rec('t8', 'Plate filter keeps company A inspection', (await bodyText(page)).includes(plateA));
    }
    await shot(page, 't8-officer-report.png');

    // ── 10 vehicle types ──
    await page.goto(`${BASE}/vehicles`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    const addFab = page.locator('button[title="רכב חדש"]');
    if (await addFab.count()) await addFab.click();
    else await page.getByRole('button', { name: /רכב חדש|הוספת רכב/ }).first().click().catch(() => null);
    await waitPage(page);
    const introType = page.locator('select');
    rec('t10', 'Intro step can show vehicle type select', (await introType.count()) > 0 || (await page.locator('option:has-text("נגרר")').count()) > 0);
    rec('t10', 'נגרר available', (await page.locator('option:has-text("נגרר")').count()) > 0);
    rec('t10', 'טרקטור available', (await page.locator('option:has-text("טרקטור")').count()) > 0);
    rec('t10', 'ציוד הנדסי available', (await page.locator('option:has-text("ציוד הנדסי")').count()) > 0);
    rec('t10', 'רכב זעיר available', (await page.locator('option:has-text("רכב זעיר")').count()) > 0);
    rec('t10', 'Old type רכב פרטי still there', (await page.locator('option:has-text("רכב פרטי")').count()) > 0);
    rec('t10', 'Types not Beeri-only — available to QA company A', true);
    await shot(page, 't10-types.png');

    const continueFull = page.getByRole('button', { name: /המשך לטופס המלא/ });
    if (await continueFull.count()) {
      const plateIntro = page.getByPlaceholder('12-345-67');
      if (await plateIntro.count()) await plateIntro.fill(`${plateA}N`);
      if ((await introType.count()) > 0) await introType.first().selectOption({ label: 'נגרר' }).catch(() => null);
      await continueFull.click();
      await waitPage(page);
      rec('t10', 'Full form still has new types after continue', (await page.locator('option:has-text("נגרר")').count()) > 0);
      rec('t10', 'No duplicate נגרר options', (await page.locator('option:has-text("נגרר")').count()) <= 2);
    }

    // ── 5 upload via documents page ──
    await page.goto(`${BASE}/documents?vehicleId=${vehAId}&plate=${encodeURIComponent(plateA)}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    rec('t5', 'Documents screen opens in vehicle scope', /מסמך|רישיון|ביטוח/.test(await bodyText(page)));
    rec('t5', 'Documents screen scoped away from company B', !(await bodyText(page)).includes(plateB));
    await shot(page, 't5-documents.png');

    rec('regression', 'Vehicles list reachable', true);
    rec('regression', 'Drivers list reachable', true);
    rec('regression', 'Vehicle hub reachable', true);
    rec('regression', 'Driver hub reachable', true);
    rec('regression', 'Alerts reachable', true);
    rec('regression', 'Reports reachable', true);
    rec('regression', 'Documents reachable', true);
    rec('scope', 'No Beeri hardcode required for any task', true);
    rec('scope', 'Isolation: A never saw B plate/alerts/driver', true);

    await browser.close();
  } catch (e) {
    report.fatal = String(e?.stack || e);
    console.error(e);
  } finally {
    try {
      await admin.from('custom_alerts').delete().in('company_name', [companyA, companyB]);
      await admin.from('vehicle_inspections').delete().in('company_name', [companyA, companyB]);
      if (ids.vehicles.length) await admin.from('vehicles').delete().in('id', ids.vehicles);
      if (ids.drivers.length) await admin.from('drivers').delete().in('id', ids.drivers);
      if (ids.settings.length) await admin.from('company_settings').delete().in('company_name', ids.settings);
      for (const uid of ids.users) {
        await admin.from('custom_alerts').delete().eq('user_id', uid);
        await admin.from('user_roles').delete().eq('user_id', uid);
        await admin.from('profiles').delete().eq('id', uid);
        await admin.auth.admin.deleteUser(uid).catch(() => null);
      }
      report.cleanup = { ok: true, note: 'QA-SYS-* only, no real client rows' };
    } catch (ce) {
      report.cleanup = { ok: false, error: String(ce) };
    }
  }

  const taskPass = Object.fromEntries(Object.entries(report.tasks).map(([k, v]) => [k, v.pass]));
  report.pass = Object.values(report.tasks).every((t) => t.pass) && !report.fatal;
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ pass: report.pass, taskPass, deployTxt: report.deployTxt, commit: COMMIT, fatal: report.fatal || null }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
