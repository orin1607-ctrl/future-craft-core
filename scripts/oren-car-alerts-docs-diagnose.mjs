/**
 * Read-mostly reproduction of the two reported Staging failures:
 *   1. manual "צור התראה" (officer / free) from the vehicle card
 *   2. vehicle document upload not showing in the vehicle documents area
 * Captures toasts, console errors and every failed Supabase response body.
 * Isolated QA companies only. node scripts/oren-car-alerts-docs-diagnose.mjs
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
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-tasks-1-10-staging/alerts-docs-diagnosis');
mkdirSync(OUT, { recursive: true });

if (STAGING_REF === PROD_REF) throw new Error('refused: production db');
if (BASE.includes('dalia-car.online') || BASE.includes('hostinger')) throw new Error('refused: production url');

const report = { at: new Date().toISOString(), base: BASE, findings: [], failedResponses: [], consoleErrors: [] };

function keys() {
  const arr = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
  return {
    service: arr.find((k) => k.name === 'service_role')?.api_key,
    anon: arr.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || arr.find((k) => k.name === 'anon')?.api_key,
  };
}

function note(step, detail) {
  report.findings.push({ step, ...detail });
  console.log('—', step, JSON.stringify(detail));
}

async function waitPage(page) {
  await page.waitForTimeout(1500);
  await page.waitForLoadState('networkidle').catch(() => null);
}

async function main() {
  const k = keys();
  const admin = createClient(STAGING_URL, k.service, { auth: { autoRefreshToken: false, persistSession: false } });
  const anon = createClient(STAGING_URL, k.anon, { auth: { autoRefreshToken: false, persistSession: false } });

  const runId = Date.now();
  const company = `QA-DIAG-${runId}`;
  const email = `qa-diag-${runId}@staging-e2e.local`;
  const password = `QaDiag!${runId}`;
  const plate = `DG${String(runId).slice(-6)}`;
  const ids = { users: [], vehicles: [], settings: [] };
  const pdf = join(OUT, 'diag.pdf');
  writeFileSync(pdf, Buffer.from('%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'));

  const browser = await chromium.launch({ headless: true });
  try {
    await admin.from('company_settings').insert({
      company_name: company,
      reminder_30_days: true,
      reminder_7_days: true,
      reminder_1_day: true,
      hidden_buttons: [],
    });
    ids.settings.push(company);

    const { data: created, error: userErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (userErr) throw userErr;
    ids.users.push(created.user.id);
    await admin.from('profiles').upsert({
      id: created.user.id,
      full_name: 'QA Diag FM',
      company_name: company,
      is_active: true,
      approval_status: 'approved',
      two_factor_approved: true,
    });
    await admin.from('user_roles').delete().eq('user_id', created.user.id);
    await admin.from('user_roles').insert({ user_id: created.user.id, role: 'fleet_manager' });

    const { data: vehicle, error: vehErr } = await admin.from('vehicles').insert({
      license_plate: plate,
      internal_number: '77',
      manufacturer: 'DiagToyota',
      model: 'Yaris',
      company_name: company,
      status: 'active',
      year: 2021,
    }).select('id, license_plate').single();
    if (vehErr) throw vehErr;
    ids.vehicles.push(vehicle.id);

    // ── direct API probe: what does an authenticated user actually get back? ──
    const { data: auth, error: authErr } = await anon.auth.signInWithPassword({ email, password });
    if (authErr) throw authErr;
    const userClient = createClient(STAGING_URL, k.anon, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${auth.session.access_token}` } },
    });

    for (const alertType of ['officer', 'free', 'other']) {
      const { error } = await userClient.from('custom_alerts').insert({
        user_id: created.user.id,
        company_name: company,
        alert_type: alertType,
        title: `DIAG ${alertType} ${runId}`,
        description: `vplate:${plate} vid:${vehicle.id}`,
        alert_date: new Date(Date.now() + 45 * 86400000).toISOString(),
        recurrence: 'none',
        recurrence_interval: null,
        next_trigger_at: new Date(Date.now() + 45 * 86400000).toISOString(),
      });
      note(`api insert custom_alerts alert_type=${alertType}`, {
        ok: !error,
        code: error?.code || null,
        message: error?.message || null,
        details: error?.details || null,
      });
    }

    const { data: readBack, error: readErr } = await userClient
      .from('custom_alerts')
      .select('id, alert_type, title, company_name, is_active')
      .eq('company_name', company);
    note('api select custom_alerts as user', {
      ok: !readErr,
      count: readBack?.length || 0,
      types: (readBack || []).map((r) => r.alert_type),
      isActive: (readBack || []).map((r) => r.is_active),
      message: readErr?.message || null,
    });

    const { error: metaErr } = await userClient.from('document_metadata').insert({
      original_name: 'diag-api.pdf',
      file_path: `${created.user.id}/vehicle-license/diag-api.pdf`,
      category: 'vehicle-license',
      company_name: company,
      vehicle_plate: plate,
      uploaded_by: created.user.id,
    });
    note('api insert document_metadata as user', { ok: !metaErr, code: metaErr?.code || null, message: metaErr?.message || null });

    // ── UI reproduction on published Pages ──
    const context = await browser.newContext({ locale: 'he-IL', viewport: { width: 1440, height: 1000 } });
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
      if (msg.type() === 'error') report.consoleErrors.push(msg.text().slice(0, 600));
    });
    page.on('response', async (res) => {
      if (res.status() < 400) return;
      let bodyText = '';
      try { bodyText = (await res.text()).slice(0, 600); } catch { bodyText = '<unreadable>'; }
      report.failedResponses.push({ url: res.url().slice(0, 220), status: res.status(), body: bodyText });
    });

    const toasts = async () => (await page.locator('[data-sonner-toast], [role="status"]').allInnerTexts()).join(' | ');

    // 1b. manual alert creation from the vehicle card
    await page.goto(`${BASE}/vehicles?vehicleId=${vehicle.id}&view=hub`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    const openModal = page.getByRole('button', { name: /הוסף התראה|התראה חופשית/ }).first();
    note('vehicle card add-alert button', { count: await openModal.count() });
    for (const label of ['התראת קצין רכב', 'התראה חופשית']) {
      await page.goto(`${BASE}/vehicles?vehicleId=${vehicle.id}&view=hub`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await waitPage(page);
      await page.getByRole('button', { name: /הוסף התראה|התראה חופשית/ }).first().click();
      await page.waitForTimeout(900);
      const typeButton = page.getByRole('button', { name: label, exact: true }).first();
      note(`modal type button ${label}`, { count: await typeButton.count() });
      if (await typeButton.count()) await typeButton.click();
      await page.getByPlaceholder('כותרת ההתראה...').fill(`UI ${label} ${runId}`);
      await page.locator('input[type="date"]').first().fill(new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10));
      await page.getByRole('button', { name: /צור התראה/ }).click();
      await page.waitForTimeout(2500);
      note(`ui create alert ${label}`, { toast: (await toasts()).slice(0, 300) });
      await page.screenshot({ path: join(OUT, `ui-create-${label === 'התראה חופשית' ? 'free' : 'officer'}.png`), fullPage: true }).catch(() => null);
    }

    const { data: afterUi } = await admin
      .from('custom_alerts')
      .select('alert_type, title, is_active, company_name')
      .eq('company_name', company);
    note('db rows after ui creation', {
      rows: (afterUi || []).map((r) => ({ type: r.alert_type, title: r.title, active: r.is_active })),
    });

    // 1a. tri/semi inspection -> officer alert
    await page.goto(`${BASE}/private-vehicle-inspection?vehicleId=${vehicle.id}&plate=${encodeURIComponent(plate)}&context=vehicle`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    await page.locator('input[placeholder*="עובד"]').fill('QA Diag FM');
    await page.getByRole('button', { name: /\+3 חודשים/ }).click();
    await page.getByRole('button', { name: /שמור בדיקה/ }).click();
    await page.waitForTimeout(4000);
    note('ui tri-semi save', { toast: (await toasts()).slice(0, 400) });
    await page.screenshot({ path: join(OUT, 'ui-tri-semi.png'), fullPage: true }).catch(() => null);

    const { data: vehAfter } = await admin.from('vehicles').select('next_inspection_date').eq('id', vehicle.id).single();
    const { data: inspections } = await admin.from('vehicle_inspections').select('id, inspection_type, next_due_date, company_name').eq('vehicle_id', vehicle.id);
    note('tri-semi persistence', { nextInspectionDate: vehAfter?.next_inspection_date || null, inspections: inspections || [] });

    await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    const alertsText = await page.locator('body').innerText();
    note('alerts screen content', {
      hasOfficerLabel: alertsText.includes('התראת קצין רכב'),
      hasFreeLabel: alertsText.includes('התראה חופשית'),
      hasUiOfficerTitle: alertsText.includes(`UI התראת קצין רכב ${runId}`),
      hasUiFreeTitle: alertsText.includes(`UI התראה חופשית ${runId}`),
      hasPlate: alertsText.includes(plate),
    });
    await page.screenshot({ path: join(OUT, 'ui-alerts.png'), fullPage: true }).catch(() => null);

    // 2. document upload through the vehicle documents path
    await page.goto(`${BASE}/vehicles?vehicleId=${vehicle.id}&view=hub`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    await page.getByRole('button', { name: /^פעולות רכב$/ }).click().catch(() => null);
    await waitPage(page);
    await page.getByRole('button', { name: /^מסמכים$/ }).last().click().catch(() => null);
    await waitPage(page);
    const uploadLicense = page.getByRole('button', { name: /העלה רישיון רכב/ });
    note('hub upload license button', { count: await uploadLicense.count() });
    if (await uploadLicense.count()) await uploadLicense.first().click();
    await waitPage(page);
    note('documents screen after hub navigation', {
      url: page.url(),
      fileInputs: await page.locator('input[type="file"]').count(),
      text: (await page.locator('body').innerText()).slice(0, 400),
    });
    if (await page.locator('input[type="file"]').count()) {
      await page.locator('input[type="file"]').first().setInputFiles(pdf);
      await page.waitForTimeout(5000);
    }
    note('ui document upload', { toast: (await toasts()).slice(0, 400) });
    await page.screenshot({ path: join(OUT, 'ui-doc-upload.png'), fullPage: true }).catch(() => null);

    const { data: vehDocs } = await admin.from('vehicles').select('license_doc_url, insurance_doc_url').eq('id', vehicle.id).single();
    const { data: metaRows } = await admin.from('document_metadata').select('id, category, vehicle_plate, company_name, file_path').eq('company_name', company);
    note('document persistence', { vehDocs, metaRows: metaRows || [] });

    await page.goto(`${BASE}/vehicles?vehicleId=${vehicle.id}&view=hub`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    await page.getByRole('button', { name: /^פעולות רכב$/ }).click().catch(() => null);
    await waitPage(page);
    await page.getByRole('button', { name: /^מסמכים$/ }).last().click().catch(() => null);
    await waitPage(page);
    const hubDocsText = await page.locator('body').innerText();
    note('hub documents after re-entry', {
      mentionsLicense: hubDocsText.includes('רישיון'),
      mentionsDiag: hubDocsText.includes('diag'),
      emptyState: hubDocsText.includes('אין מסמכים'),
      snippet: hubDocsText.slice(0, 700),
    });
    await page.screenshot({ path: join(OUT, 'ui-hub-docs.png'), fullPage: true }).catch(() => null);

    await context.close();
  } catch (e) {
    report.fatal = String(e?.stack || e);
    console.error(e);
  } finally {
    await browser.close().catch(() => null);
    try {
      await admin.from('custom_alerts').delete().eq('company_name', company);
      await admin.from('vehicle_inspections').delete().eq('company_name', company);
      await admin.from('document_metadata').delete().eq('company_name', company);
      if (ids.vehicles.length) await admin.from('vehicles').delete().in('id', ids.vehicles);
      if (ids.settings.length) await admin.from('company_settings').delete().in('company_name', ids.settings);
      for (const uid of ids.users) {
        await admin.from('user_roles').delete().eq('user_id', uid);
        await admin.from('profiles').delete().eq('id', uid);
        await admin.auth.admin.deleteUser(uid).catch(() => null);
      }
      report.cleanup = { ok: true, note: 'QA-DIAG-* only' };
    } catch (ce) {
      report.cleanup = { ok: false, error: String(ce) };
    }
  }

  writeFileSync(join(OUT, 'diagnosis.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log('\n=== failed responses ===');
  console.log(JSON.stringify(report.failedResponses, null, 2));
  console.log('\n=== console errors ===');
  console.log(JSON.stringify(report.consoleErrors.slice(0, 15), null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
