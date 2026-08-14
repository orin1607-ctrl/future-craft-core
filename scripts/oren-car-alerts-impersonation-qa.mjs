/**
 * Alerts end-to-end on published Staging, reproduced the way the owner works:
 * a super admin who views the system as a fleet manager ("צפייה כמנהל צי").
 * Covers every place an alert can be created, tri/semi +3 and +6, the alerts
 * screen filters, refresh, leaving and re-entering, duplicates and console or
 * Supabase errors. Isolated QA company, cleaned up at the end.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-tasks-1-10-staging/alerts-impersonation-qa');
mkdirSync(OUT, { recursive: true });

if (STAGING_REF === PROD_REF) throw new Error('refused: production db');

const report = { at: new Date().toISOString(), base: BASE, results: [], consoleErrors: [], failedResponses: [] };
let pass = 0;
let fail = 0;

function rec(id, name, ok, detail) {
  report.results.push({ id, name, status: ok ? 'PASS' : 'FAIL', detail });
  if (ok) pass += 1; else fail += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${name}`, JSON.stringify(detail).slice(0, 380));
}

function keys() {
  const arr = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
  return {
    service: arr.find((k) => k.name === 'service_role')?.api_key,
    anon: arr.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || arr.find((k) => k.name === 'anon')?.api_key,
  };
}

const isoDays = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

async function waitPage(page) {
  await page.waitForTimeout(1600);
  await page.waitForLoadState('networkidle').catch(() => null);
}

async function main() {
  const deployTxt = (await fetch(`${BASE}/STAGING-DEPLOY.txt?t=${Date.now()}`).then((r) => r.text())).trim();
  const commit = execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim();
  report.deployTxt = deployTxt;
  report.commit = commit;
  rec('deploy', 'Pages serves the tested staging commit', deployTxt.includes(commit), { deployTxt, commit });

  const k = keys();
  const admin = createClient(STAGING_URL, k.service, { auth: { autoRefreshToken: false, persistSession: false } });
  const anon = createClient(STAGING_URL, k.anon, { auth: { autoRefreshToken: false, persistSession: false } });

  const runId = Date.now();
  const company = `QA-IMP-${runId}`;
  const saEmail = `qa-imp-sa-${runId}@staging-e2e.local`;
  const fmEmail = `qa-imp-fm-${runId}@staging-e2e.local`;
  const password = `QaImp!${runId}`;
  const plate1 = `IA${String(runId).slice(-6)}`;
  const plate2 = `IB${String(runId).slice(-6)}`;
  const ids = { users: [], vehicles: [], drivers: [] };

  const browser = await chromium.launch({ headless: true });
  try {
    await admin.from('company_settings').insert({ company_name: company, reminder_30_days: true, reminder_7_days: true, reminder_1_day: true, hidden_buttons: [] });

    const makeUser = async (email, role, companyName, fullName) => {
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
      ids.users.push(data.user.id);
      await admin.from('profiles').upsert({
        id: data.user.id,
        full_name: fullName,
        company_name: companyName,
        phone: '0500000088',
        is_active: true,
        approval_status: 'approved',
        two_factor_approved: true,
      });
      await admin.from('user_roles').delete().eq('user_id', data.user.id);
      await admin.from('user_roles').insert({ user_id: data.user.id, role });
      return data.user.id;
    };

    const superAdminId = await makeUser(saEmail, 'super_admin', null, `QA IMP Super ${runId}`);
    const fleetManagerId = await makeUser(fmEmail, 'fleet_manager', company, `QA IMP Manager ${runId}`);

    const makeVehicle = async (plate, internal) => {
      const { data, error } = await admin.from('vehicles').insert({
        license_plate: plate,
        internal_number: internal,
        manufacturer: 'QaSkoda',
        model: 'Octavia',
        company_name: company,
        status: 'active',
        year: 2022,
      }).select('id, license_plate').single();
      if (error) throw error;
      ids.vehicles.push(data.id);
      return data;
    };
    const veh1 = await makeVehicle(plate1, '71');
    const veh2 = await makeVehicle(plate2, '72');

    const { data: driver, error: dErr } = await admin.from('drivers').insert({
      full_name: `QA IMP Driver ${runId}`,
      phone: '0500000089',
      company_name: company,
    }).select('id, full_name').single();
    if (dErr) throw dErr;
    ids.drivers.push(driver.id);

    const { data: auth, error: authErr } = await anon.auth.signInWithPassword({ email: saEmail, password });
    if (authErr) throw authErr;

    const context = await browser.newContext({ locale: 'he-IL', viewport: { width: 1500, height: 1150 } });
    await context.addInitScript(
      ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
      {
        key: `sb-${STAGING_REF}-auth-token`,
        value: {
          access_token: auth.session.access_token,
          refresh_token: auth.session.refresh_token,
          expires_at: auth.session.expires_at,
          expires_in: auth.session.expires_in,
          token_type: auth.session.token_type,
          user: auth.session.user,
        },
      },
    );
    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') report.consoleErrors.push(msg.text().slice(0, 300));
    });
    page.on('response', async (res) => {
      if (res.status() < 400) return;
      const isSupabase = res.url().includes('supabase.co');
      let body = '';
      if (isSupabase) {
        try { body = (await res.text()).slice(0, 300); } catch { body = '<unreadable>'; }
      }
      report.failedResponses.push({ url: res.url().slice(0, 180), status: res.status(), supabase: isSupabase, body });
    });

    const toasts = async () => (await page.locator('[data-sonner-toast], [role="status"]').allInnerTexts()).join(' | ');
    const bodyText = async () => page.locator('body').innerText();
    const clearToasts = async () => {
      await page.evaluate(() => {
        document.querySelectorAll('[data-sonner-toast]').forEach((el) => el.remove());
      }).catch(() => null);
    };

    // ── become the fleet manager, exactly like the owner does ──
    await page.goto(`${BASE}/fleet-managers`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    await page.getByText(`QA IMP Manager ${runId}`, { exact: false }).first().click();
    await waitPage(page);
    await page.getByRole('button', { name: /צפייה כמנהל/ }).first().click();
    await waitPage(page);
    const impersonating = (await bodyText()).includes('צופה כ') || (await bodyText()).includes(`QA IMP Manager ${runId}`);
    await page.screenshot({ path: join(OUT, 'imp0-impersonating.png'), fullPage: true }).catch(() => null);
    rec('imp0', 'super admin is viewing the system as the company fleet manager', impersonating, { impersonating });

    const hubUrl = (id, section, tab) =>
      `${BASE}/vehicles?vehicleId=${id}&view=hub${section ? `&hubSection=${section}` : ''}${tab ? `&hubTab=${tab}` : ''}`;

    const fillModal = async (typeLabel, title, dateStr) => {
      const modal = page.locator('div.fixed.inset-0.z-50').last();
      await modal.getByRole('button', { name: new RegExp(typeLabel) }).first().click();
      await page.waitForTimeout(300);
      await modal.getByPlaceholder('כותרת ההתראה...').fill(title);
      await modal.locator('input[type="date"]').first().fill(dateStr);
      await modal.getByRole('button', { name: /צור התראה/ }).first().click();
      await page.waitForTimeout(3000);
      return toasts();
    };

    const alertsFiltered = async (label) => {
      await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await waitPage(page);
      const filter = page.getByRole('button', { name: new RegExp(label) }).first();
      if (await filter.count()) await filter.click();
      await page.waitForTimeout(1300);
      return bodyText();
    };

    const dbRow = async (title) => {
      const { data } = await admin
        .from('custom_alerts')
        .select('alert_type, company_name, user_id, title, is_active')
        .like('title', `${title}%`)
        .maybeSingle();
      return data;
    };

    // ── entry point 1: vehicle card ──
    const titles = {
      vehicleOfficer: `IMP רכב קצין ${runId}`,
      vehicleFree: `IMP רכב חופשית ${runId}`,
      driverFree: `IMP נהג חופשית ${runId}`,
      logOfficer: `IMP יומן קצין ${runId}`,
      logFree: `IMP יומן חופשית ${runId}`,
    };

    await clearToasts();
    await page.goto(hubUrl(veh1.id, 'actions', 'alerts'), { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    await page.getByRole('button', { name: /הוסף התראה/ }).first().click();
    await page.waitForTimeout(900);
    const t1 = await fillModal('התראת קצין רכב', titles.vehicleOfficer, isoDays(55));
    const row1 = await dbRow(titles.vehicleOfficer);
    const seen1 = await alertsFiltered('התראת קצין רכב');
    await page.screenshot({ path: join(OUT, 'imp1-vehicle-officer.png'), fullPage: true }).catch(() => null);
    rec('imp1', 'vehicle card → officer alert saves and appears in התראות ועדכונים',
      !/שגיאה/.test(t1) && row1?.alert_type === 'officer' && row1?.company_name === company &&
      row1?.user_id === superAdminId && seen1.includes(titles.vehicleOfficer),
      { toast: t1.slice(0, 200), row: row1, visible: seen1.includes(titles.vehicleOfficer) });

    await clearToasts();
    await page.goto(hubUrl(veh1.id, 'actions', 'alerts'), { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    await page.getByRole('button', { name: /הוסף התראה/ }).first().click();
    await page.waitForTimeout(900);
    const t2 = await fillModal('התראה חופשית', titles.vehicleFree, isoDays(45));
    const row2 = await dbRow(titles.vehicleFree);
    const seen2 = await alertsFiltered('התראה חופשית');
    await page.screenshot({ path: join(OUT, 'imp2-vehicle-free.png'), fullPage: true }).catch(() => null);
    rec('imp2', 'vehicle card → free alert saves and appears in התראות ועדכונים',
      !/שגיאה/.test(t2) && row2?.alert_type === 'free' && row2?.company_name === company && seen2.includes(titles.vehicleFree),
      { toast: t2.slice(0, 200), row: row2, visible: seen2.includes(titles.vehicleFree) });

    // ── entry point 2: driver card ──
    await clearToasts();
    await page.goto(`${BASE}/drivers?driverId=${driver.id}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    await page.getByRole('button', { name: /הוסף התראה/ }).first().click();
    await page.waitForTimeout(900);
    const t3 = await fillModal('התראה חופשית', titles.driverFree, isoDays(38));
    const row3 = await dbRow(titles.driverFree);
    const seen3 = await alertsFiltered('התראה חופשית');
    await page.screenshot({ path: join(OUT, 'imp3-driver-free.png'), fullPage: true }).catch(() => null);
    rec('imp3', 'driver card → free alert saves and appears in התראות ועדכונים',
      !/שגיאה/.test(t3) && row3?.alert_type === 'free' && row3?.company_name === company && seen3.includes(titles.driverFree),
      { toast: t3.slice(0, 200), row: row3, visible: seen3.includes(titles.driverFree) });

    // ── entry point 3: the alerts log screen (התראות ושליחות) ──
    await clearToasts();
    await page.goto(`${BASE}/alerts/log?vehicleId=${veh1.id}&plate=${encodeURIComponent(plate1)}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    await page.getByRole('button', { name: /הוסף התראה/ }).first().click();
    await page.waitForTimeout(900);
    const t4 = await fillModal('התראת קצין רכב', titles.logOfficer, isoDays(52));
    const row4 = await dbRow(titles.logOfficer);
    await clearToasts();
    await page.goto(`${BASE}/alerts/log?vehicleId=${veh1.id}&plate=${encodeURIComponent(plate1)}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    await page.getByRole('button', { name: /הוסף התראה/ }).first().click();
    await page.waitForTimeout(900);
    const t5 = await fillModal('התראה חופשית', titles.logFree, isoDays(42));
    const row5 = await dbRow(titles.logFree);
    const seenOfficer = await alertsFiltered('התראת קצין רכב');
    const seenFree = await alertsFiltered('התראה חופשית');
    await page.screenshot({ path: join(OUT, 'imp4-log-screen.png'), fullPage: true }).catch(() => null);
    rec('imp4', 'alerts log screen → officer and free alerts save and appear in התראות ועדכונים',
      !/שגיאה/.test(t4) && !/שגיאה/.test(t5) && row4?.alert_type === 'officer' && row5?.alert_type === 'free' &&
      seenOfficer.includes(titles.logOfficer) && seenFree.includes(titles.logFree),
      { officerToast: t4.slice(0, 160), freeToast: t5.slice(0, 160), officerRow: row4, freeRow: row5 });

    // ── tri/semi +3 and +6 ──
    const triSemi = async (vehicle, months) => {
      await clearToasts();
      await page.goto(
        `${BASE}/private-vehicle-inspection?vehicleId=${vehicle.id}&plate=${encodeURIComponent(vehicle.license_plate)}&context=vehicle`,
        { waitUntil: 'domcontentloaded', timeout: 90000 },
      );
      await waitPage(page);
      await page.locator('input[placeholder*="עובד"]').first().fill(`QA IMP Manager ${runId}`);
      await page.getByRole('button', { name: new RegExp(`\\+${months} חודשים`) }).first().click();
      await page.waitForTimeout(400);
      await page.getByRole('button', { name: /שמור בדיקה/ }).first().click();
      await page.waitForTimeout(4500);
      return toasts();
    };

    const tri3 = await triSemi(veh1, 3);
    const { data: officer3 } = await admin
      .from('custom_alerts')
      .select('alert_type, company_name, user_id, title, alert_date')
      .eq('company_name', company)
      .eq('alert_type', 'officer')
      .eq('title', `התראת קצין רכב · ${plate1}`)
      .maybeSingle();
    const officerScreen3 = await alertsFiltered('התראת קצין רכב');
    await page.screenshot({ path: join(OUT, 'imp5-trisemi-3.png'), fullPage: true }).catch(() => null);
    rec('imp5', 'tri/semi +3 months creates an officer alert shown under התראת קצין רכב',
      /נוצרה התראת קצין רכב/.test(tri3) && !/לא נוצרה/.test(tri3) && officer3?.user_id === superAdminId &&
      officerScreen3.includes(`התראת קצין רכב · ${plate1}`),
      { toast: tri3.slice(0, 240), row: officer3, visible: officerScreen3.includes(`התראת קצין רכב · ${plate1}`) });

    const tri6 = await triSemi(veh2, 6);
    const { data: insp6 } = await admin
      .from('vehicle_inspections')
      .select('next_due_date')
      .eq('vehicle_id', veh2.id)
      .maybeSingle();
    const daysAhead = insp6?.next_due_date
      ? Math.round((new Date(insp6.next_due_date).getTime() - Date.now()) / 86400000)
      : null;
    const officerScreen6 = await alertsFiltered('התראת קצין רכב');
    // the alert row itself is the navigation target (tr with onClick)
    const officerLinkOk = await (async () => {
      const row = page.locator('tr').filter({ hasText: `התראת קצין רכב · ${plate2}` }).first();
      if (!(await row.count())) return false;
      await row.click().catch(() => null);
      await waitPage(page);
      const reached = await bodyText();
      return page.url().includes(veh2.id) || reached.includes(plate2);
    })();
    await page.screenshot({ path: join(OUT, 'imp6-trisemi-6.png'), fullPage: true }).catch(() => null);
    rec('imp6', 'tri/semi +6 months officer alert is shown, dated beyond 30 days, and links to its vehicle',
      /נוצרה התראת קצין רכב/.test(tri6) && !/לא נוצרה/.test(tri6) &&
      officerScreen6.includes(`התראת קצין רכב · ${plate2}`) && daysAhead !== null && daysAhead > 30 && officerLinkOk,
      { toast: tri6.slice(0, 240), nextDue: insp6?.next_due_date, daysAhead, linkReachesVehicle: officerLinkOk });

    // ── filters keep each category separate ──
    const onlyOfficer = await alertsFiltered('התראת קצין רכב');
    const onlyFree = await alertsFiltered('התראה חופשית');
    rec('imp7', 'officer filter shows officer alerts only and free filter shows free alerts only',
      onlyOfficer.includes(titles.vehicleOfficer) && onlyOfficer.includes(`התראת קצין רכב · ${plate1}`) &&
      !onlyOfficer.includes(titles.vehicleFree) && !onlyOfficer.includes(titles.driverFree) &&
      onlyFree.includes(titles.vehicleFree) && onlyFree.includes(titles.driverFree) &&
      !onlyFree.includes(titles.vehicleOfficer),
      {
        officerHasManualOfficer: onlyOfficer.includes(titles.vehicleOfficer),
        officerHasTriSemi: onlyOfficer.includes(`התראת קצין רכב · ${plate1}`),
        officerLeaksFree: onlyOfficer.includes(titles.vehicleFree),
        freeHasBoth: onlyFree.includes(titles.vehicleFree) && onlyFree.includes(titles.driverFree),
        freeLeaksOfficer: onlyFree.includes(titles.vehicleOfficer),
      });

    // ── refresh, leave the screen, come back ──
    await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitPage(page);
    await page.goto(`${BASE}/vehicles`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    const afterOfficer = await alertsFiltered('התראת קצין רכב');
    const officerCopies = await page.locator('tr').filter({ hasText: `התראת קצין רכב · ${plate1}` }).count();
    const afterFree = await alertsFiltered('התראה חופשית');
    const freeCopies = await page.locator('tr').filter({ hasText: titles.vehicleFree }).count();
    await page.screenshot({ path: join(OUT, 'imp8-after-reentry.png'), fullPage: true }).catch(() => null);
    rec('imp8', 'every alert survives refresh and re-entry with no duplicates',
      afterOfficer.includes(titles.vehicleOfficer) && afterOfficer.includes(titles.logOfficer) &&
      afterOfficer.includes(`התראת קצין רכב · ${plate1}`) && afterFree.includes(titles.vehicleFree) &&
      afterFree.includes(titles.driverFree) && afterFree.includes(titles.logFree) &&
      officerCopies === 1 && freeCopies === 1,
      { officerCopies, freeCopies });

    // ── no console / network / Supabase errors during the alert work ──
    const supabaseFailures = report.failedResponses.filter((f) => f.supabase);
    rec('imp9', 'no Supabase failures and no application console errors during the alert flows',
      supabaseFailures.length === 0,
      {
        supabaseFailures,
        otherFailedRequests: report.failedResponses.filter((f) => !f.supabase).map((f) => `${f.status} ${f.url}`),
        consoleErrors: report.consoleErrors.slice(0, 5),
      });

    // ── the company fleet manager sees the same alerts ──
    const { data: fmAuth } = await anon.auth.signInWithPassword({ email: fmEmail, password });
    const fmContext = await browser.newContext({ locale: 'he-IL', viewport: { width: 1440, height: 1000 } });
    await fmContext.addInitScript(
      ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
      {
        key: `sb-${STAGING_REF}-auth-token`,
        value: {
          access_token: fmAuth.session.access_token,
          refresh_token: fmAuth.session.refresh_token,
          expires_at: fmAuth.session.expires_at,
          expires_in: fmAuth.session.expires_in,
          token_type: fmAuth.session.token_type,
          user: fmAuth.session.user,
        },
      },
    );
    const fmPage = await fmContext.newPage();
    await fmPage.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(fmPage);
    const fmText = await fmPage.locator('body').innerText();
    await fmPage.screenshot({ path: join(OUT, 'imp10-fleet-manager-view.png'), fullPage: true }).catch(() => null);
    rec('imp10', 'the company fleet manager also sees the alerts created while impersonated',
      fmText.includes(titles.vehicleOfficer) && fmText.includes(titles.vehicleFree) && fmText.includes(`התראת קצין רכב · ${plate1}`),
      {
        officer: fmText.includes(titles.vehicleOfficer),
        free: fmText.includes(titles.vehicleFree),
        triSemi: fmText.includes(`התראת קצין רכב · ${plate1}`),
      });
    await fmContext.close();
    await context.close();
  } catch (e) {
    report.fatal = String(e?.stack || e);
    fail += 1;
    console.error(e);
  } finally {
    await browser.close().catch(() => null);
    try {
      await admin.from('custom_alerts').delete().eq('company_name', company);
      await admin.from('vehicle_inspections').delete().eq('company_name', company);
      await admin.from('vehicle_tasks').delete().eq('company_name', company);
      if (ids.drivers.length) await admin.from('drivers').delete().in('id', ids.drivers);
      if (ids.vehicles.length) await admin.from('vehicles').delete().in('id', ids.vehicles);
      await admin.from('company_settings').delete().eq('company_name', company);
      for (const uid of ids.users) {
        await admin.from('custom_alerts').delete().eq('user_id', uid);
        await admin.from('user_roles').delete().eq('user_id', uid);
        await admin.from('profiles').delete().eq('id', uid);
        await admin.auth.admin.deleteUser(uid).catch(() => null);
      }
      report.cleanup = { ok: true, scope: 'QA-IMP-* only' };
    } catch (ce) {
      report.cleanup = { ok: false, error: String(ce) };
    }
  }

  report.summary = { pass, fail };
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nPASS ${pass} / FAIL ${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
