/**
 * The scenario that actually broke in real use: a super admin working inside a
 * selected company scope. Before the fix the manual alert was stored with the
 * actor company (empty) and the uploaded document was never registered, so both
 * disappeared from the company-scoped screens.
 * Navigation stays inside the SPA because the company scope lives in memory.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-tasks-1-10-staging/superadmin-scope-qa');
mkdirSync(OUT, { recursive: true });

const report = { at: new Date().toISOString(), base: BASE, results: [] };
let pass = 0;
let fail = 0;

function rec(id, name, ok, detail) {
  report.results.push({ id, name, status: ok ? 'PASS' : 'FAIL', detail });
  if (ok) pass += 1; else fail += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${name}`, JSON.stringify(detail).slice(0, 400));
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
  const k = keys();
  const admin = createClient(STAGING_URL, k.service, { auth: { autoRefreshToken: false, persistSession: false } });
  const anon = createClient(STAGING_URL, k.anon, { auth: { autoRefreshToken: false, persistSession: false } });

  const runId = Date.now();
  const company = `QA-SA-${runId}`;
  const email = `qa-sa-${runId}@staging-e2e.local`;
  const password = `QaSa!${runId}`;
  const plate = `SA${String(runId).slice(-6)}`;
  const ids = { users: [], vehicles: [], settings: [] };
  const licenseFile = join(OUT, 'sa-license.pdf');
  writeFileSync(licenseFile, Buffer.from('%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'));

  const browser = await chromium.launch({ headless: true });
  try {
    await admin.from('company_settings').insert({ company_name: company, reminder_30_days: true, reminder_7_days: true, reminder_1_day: true, hidden_buttons: [] });
    ids.settings.push(company);
    await admin.from('customers').insert({ company_name: company, contact_name: 'QA SA Contact', phone: '0500000077' }).select('id').maybeSingle();

    const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    ids.users.push(created.user.id);
    // A super admin has no company of their own — exactly the case that failed.
    await admin.from('profiles').upsert({
      id: created.user.id,
      full_name: 'QA Super Admin',
      company_name: null,
      is_active: true,
      approval_status: 'approved',
      two_factor_approved: true,
    });
    await admin.from('user_roles').delete().eq('user_id', created.user.id);
    await admin.from('user_roles').insert({ user_id: created.user.id, role: 'super_admin' });

    // the company must exist as someone's company for it to appear in the scope picker
    const { data: fm, error: fmErr } = await admin.auth.admin.createUser({
      email: `qa-sa-fm-${runId}@staging-e2e.local`,
      password,
      email_confirm: true,
    });
    if (fmErr) throw fmErr;
    ids.users.push(fm.user.id);
    await admin.from('profiles').upsert({
      id: fm.user.id,
      full_name: 'QA SA Fleet Manager',
      company_name: company,
      is_active: true,
      approval_status: 'approved',
      two_factor_approved: true,
    });
    await admin.from('user_roles').delete().eq('user_id', fm.user.id);
    await admin.from('user_roles').insert({ user_id: fm.user.id, role: 'fleet_manager' });

    const { data: vehicle, error: vErr } = await admin.from('vehicles').insert({
      license_plate: plate,
      internal_number: '61',
      manufacturer: 'QaMazda',
      model: '3',
      company_name: company,
      status: 'active',
      year: 2022,
    }).select('id, license_plate').single();
    if (vErr) throw vErr;
    ids.vehicles.push(vehicle.id);

    const { data: auth, error: authErr } = await anon.auth.signInWithPassword({ email, password });
    if (authErr) throw authErr;
    const context = await browser.newContext({ locale: 'he-IL', viewport: { width: 1500, height: 1100 } });
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
    const toasts = async () => (await page.locator('[data-sonner-toast], [role="status"]').allInnerTexts()).join(' | ');

    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);

    // choose the company scope in the sidebar, like a real super admin does
    await page.getByRole('button', { name: /כל החברות/ }).first().click();
    await page.waitForTimeout(800);
    await page.getByPlaceholder('חיפוש חברה...').fill(company);
    await page.waitForTimeout(900);
    await page.getByRole('option', { name: new RegExp(company) }).first().click().catch(async () => {
      await page.getByText(company, { exact: false }).last().click();
    });
    await page.waitForTimeout(1500);
    const scopeBanner = await page.locator('body').innerText();
    rec('sa0', 'super admin can select the QA company scope', scopeBanner.includes(company), { scopeShown: scopeBanner.includes(company) });

    // in-app navigation only, so the selected scope survives
    const openVehicleTab = async (tabLabel) => {
      await page.getByRole('link', { name: /רשימת רכבים/ }).first().click();
      await waitPage(page);
      const search = page.getByPlaceholder(/חיפוש/).first();
      if (await search.count()) {
        await search.fill(plate);
        await page.waitForTimeout(1200);
      }
      await page.getByText(plate, { exact: false }).first().click();
      await waitPage(page);
      if (!(await page.locator('body').innerText()).includes('פעולות רכב')) {
        await page.locator('div[class*="card"]').filter({ hasText: plate }).first().click().catch(() => null);
        await waitPage(page);
      }
      await page.getByRole('button', { name: /פעולות רכב/ }).first().click();
      await waitPage(page);
      await page.getByRole('button', { name: new RegExp(`^${tabLabel}$`) }).last().click();
      await page.waitForTimeout(1300);
    };

    await openVehicleTab('התראות');

    const officerTitle = `SA קצין ${runId}`;
    await page.getByRole('button', { name: /הוסף התראה/ }).first().click();
    await page.waitForTimeout(900);
    const modal = page.locator('div.fixed.inset-0.z-50').last();
    await modal.getByRole('button', { name: /התראת קצין רכב/ }).first().click();
    await modal.getByPlaceholder('כותרת ההתראה...').fill(officerTitle);
    await modal.locator('input[type="date"]').first().fill(isoDays(60));
    await modal.getByRole('button', { name: /צור התראה/ }).first().click();
    await page.waitForTimeout(2800);
    const alertToast = await toasts();
    const { data: alertRow } = await admin
      .from('custom_alerts')
      .select('alert_type, company_name, title')
      .like('title', `${officerTitle}%`)
      .maybeSingle();
    await page.screenshot({ path: join(OUT, 'sa1-create-alert.png'), fullPage: true }).catch(() => null);

    await page.getByRole('link', { name: /^התראות$/ }).first().click();
    await waitPage(page);
    await page.getByRole('button', { name: /התראת קצין רכב/ }).first().click().catch(() => null);
    await page.waitForTimeout(1200);
    const alertsText = await page.locator('body').innerText();
    await page.screenshot({ path: join(OUT, 'sa2-alerts-scope.png'), fullPage: true }).catch(() => null);
    rec('sa1', 'manual officer alert created under a company scope belongs to that company and stays visible',
      !/שגיאה|תקלה/.test(alertToast) && alertRow?.company_name === company && alertRow?.alert_type === 'officer' && alertsText.includes(officerTitle),
      { toast: alertToast.slice(0, 160), row: alertRow, visibleInScope: alertsText.includes(officerTitle) });

    // documents under the same scope
    await openVehicleTab('מסמכים');
    const uploadBtn = page.getByRole('button', { name: /העלה רישיון רכב/ }).first();
    const hasUpload = await uploadBtn.count();
    if (hasUpload) await uploadBtn.click();
    await waitPage(page);
    if (await page.locator('input[type="file"]').count()) {
      await page.locator('input[type="file"]').first().setInputFiles(licenseFile);
      await page.waitForTimeout(5500);
    }
    const uploadToast = await toasts();
    const { data: metaRows } = await admin
      .from('document_metadata')
      .select('category, company_name, vehicle_plate, file_path')
      .eq('company_name', company);
    await page.screenshot({ path: join(OUT, 'sa3-upload.png'), fullPage: true }).catch(() => null);

    await openVehicleTab('מסמכים');
    const docsText = await page.locator('body').innerText();
    const storedPath = (metaRows || []).find((m) => (m.file_path || '').includes('sa-license'))?.file_path || '';
    const httpStatus = storedPath
      ? (await fetch(`${STAGING_URL}/storage/v1/object/public/documents/${storedPath}`)).status
      : 0;
    await page.screenshot({ path: join(OUT, 'sa4-docs.png'), fullPage: true }).catch(() => null);
    rec('sa2', 'document uploaded under a company scope is registered to that company and listed in the vehicle documents',
      hasUpload > 0 && /הועלה בהצלחה/.test(uploadToast) && (metaRows || []).some((m) => m.company_name === company) &&
      docsText.includes('sa-license') && httpStatus === 200,
      { toast: uploadToast.slice(0, 160), metaRows, listed: docsText.includes('sa-license'), httpStatus });

    await context.close();
  } catch (e) {
    report.fatal = String(e?.stack || e);
    fail += 1;
    console.error(e);
  } finally {
    await browser.close().catch(() => null);
    try {
      await admin.from('custom_alerts').delete().eq('company_name', company);
      const { data: metaRows } = await admin.from('document_metadata').select('id, file_path').eq('company_name', company);
      if (metaRows?.length) {
        await admin.storage.from('documents').remove(metaRows.map((m) => m.file_path).filter(Boolean));
        await admin.from('document_metadata').delete().in('id', metaRows.map((m) => m.id));
      }
      await admin.from('vehicle_inspections').delete().eq('company_name', company);
      if (ids.vehicles.length) await admin.from('vehicles').delete().in('id', ids.vehicles);
      await admin.from('customers').delete().eq('company_name', company);
      if (ids.settings.length) await admin.from('company_settings').delete().in('company_name', ids.settings);
      for (const uid of ids.users) {
        await admin.from('user_roles').delete().eq('user_id', uid);
        await admin.from('profiles').delete().eq('id', uid);
        await admin.auth.admin.deleteUser(uid).catch(() => null);
      }
      report.cleanup = { ok: true, scope: 'QA-SA-* only' };
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
