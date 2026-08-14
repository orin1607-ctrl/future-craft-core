/**
 * Real published-Staging QA for the two reported topics plus regression:
 *   1. tri/semi (+3, +6) -> officer alert visible in the alerts screen
 *   2. manual "צור התראה" (officer + free) from vehicle card and driver card
 *   3. officer / free filters in the alerts screen
 *   4. vehicle license + insurance upload visible and openable in vehicle docs
 *   5. refresh / leave / re-enter persistence, company isolation
 *   6. officer inspections report regression (open, rows, links, export)
 * Isolated QA companies only, staging Supabase only.
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
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-tasks-1-10-staging/alerts-docs-final-qa');
mkdirSync(OUT, { recursive: true });

if (STAGING_REF === PROD_REF) throw new Error('refused: production db');

const report = { at: new Date().toISOString(), base: BASE, results: [], failedResponses: [] };
let pass = 0;
let fail = 0;

function rec(id, name, ok, detail) {
  report.results.push({ id, name, status: ok ? 'PASS' : 'FAIL', detail });
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${name}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 400));
}

function keys() {
  const arr = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
  return {
    service: arr.find((k) => k.name === 'service_role')?.api_key,
    anon: arr.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || arr.find((k) => k.name === 'anon')?.api_key,
  };
}

const isoDays = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

async function waitPage(page) {
  await page.waitForTimeout(1600);
  await page.waitForLoadState('networkidle').catch(() => null);
}

async function main() {
  const deployTxt = (await fetch(`${BASE}/STAGING-DEPLOY.txt?t=${Date.now()}`).then((r) => r.text())).trim();
  report.deployTxt = deployTxt;
  const commit = execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim();
  report.commit = commit;
  rec('deploy', 'Pages serves the tested staging commit', deployTxt.includes(commit), { deployTxt, commit });

  const k = keys();
  const admin = createClient(STAGING_URL, k.service, { auth: { autoRefreshToken: false, persistSession: false } });
  const anon = createClient(STAGING_URL, k.anon, { auth: { autoRefreshToken: false, persistSession: false } });

  const runId = Date.now();
  const companyA = `QA-AD-A-${runId}`;
  const companyB = `QA-AD-B-${runId}`;
  const emailA = `qa-ad-a-${runId}@staging-e2e.local`;
  const emailB = `qa-ad-b-${runId}@staging-e2e.local`;
  const password = `QaAd!${runId}`;
  const plateA1 = `AA${String(runId).slice(-6)}`;
  const plateA2 = `AB${String(runId).slice(-6)}`;
  const plateB1 = `BA${String(runId).slice(-6)}`;
  const ids = { users: [], vehicles: [], drivers: [], settings: [] };
  const licenseFile = join(OUT, 'qa-license.pdf');
  const insuranceFile = join(OUT, 'qa-insurance.pdf');
  writeFileSync(licenseFile, Buffer.from('%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'));
  writeFileSync(insuranceFile, Buffer.from('%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'));

  const browser = await chromium.launch({ headless: true });
  try {
    await admin.from('company_settings').insert([
      { company_name: companyA, reminder_30_days: true, reminder_7_days: true, reminder_1_day: true, hidden_buttons: [] },
      { company_name: companyB, reminder_30_days: true, reminder_7_days: true, reminder_1_day: true, hidden_buttons: [] },
    ]);
    ids.settings.push(companyA, companyB);

    const makeFm = async (email, name, company) => {
      const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
      ids.users.push(created.user.id);
      await admin.from('profiles').upsert({
        id: created.user.id,
        full_name: name,
        company_name: company,
        is_active: true,
        approval_status: 'approved',
        two_factor_approved: true,
      });
      await admin.from('user_roles').delete().eq('user_id', created.user.id);
      await admin.from('user_roles').insert({ user_id: created.user.id, role: 'fleet_manager' });
      return created.user.id;
    };

    await makeFm(emailA, 'QA AD FM A', companyA);
    await makeFm(emailB, 'QA AD FM B', companyB);

    const makeVehicle = async (plate, internal, company) => {
      const { data, error } = await admin.from('vehicles').insert({
        license_plate: plate,
        internal_number: internal,
        manufacturer: 'QaToyota',
        model: 'Auris',
        department: 'QA-Dept',
        company_name: company,
        status: 'active',
        year: 2021,
      }).select('id, license_plate').single();
      if (error) throw error;
      ids.vehicles.push(data.id);
      return data;
    };

    const vehA1 = await makeVehicle(plateA1, '31', companyA);
    const vehA2 = await makeVehicle(plateA2, '32', companyA);
    const vehB1 = await makeVehicle(plateB1, '41', companyB);

    const { data: driverA, error: driverErr } = await admin.from('drivers').insert({
      full_name: `QA Driver A ${runId}`,
      phone: '0500000031',
      company_name: companyA,
    }).select('id, full_name').single();
    if (driverErr) throw driverErr;
    if (driverA?.id) ids.drivers.push(driverA.id);

    const login = async (email) => {
      const { data: auth, error } = await anon.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const context = await browser.newContext({ locale: 'he-IL', viewport: { width: 1440, height: 1100 } });
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
      page.on('response', async (res) => {
        if (res.status() < 400) return;
        if (!res.url().includes('supabase.co')) return;
        let bodyText = '';
        try { bodyText = (await res.text()).slice(0, 300); } catch { bodyText = '<unreadable>'; }
        report.failedResponses.push({ url: res.url().slice(0, 200), status: res.status(), body: bodyText });
      });
      return { context, page };
    };

    const { context: ctxA, page } = await login(emailA);
    const toasts = async () => (await page.locator('[data-sonner-toast], [role="status"]').allInnerTexts()).join(' | ');
    const bodyText = async () => page.locator('body').innerText();

    const hubUrl = (vehicleId, section, tab) =>
      `${BASE}/vehicles?vehicleId=${vehicleId}&view=hub${section ? `&hubSection=${section}` : ''}${tab ? `&hubTab=${tab}` : ''}`;

    const openAlertsFilter = async (label) => {
      await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await waitPage(page);
      const filterButton = page.getByRole('button', { name: new RegExp(label) }).first();
      if (await filterButton.count()) await filterButton.click();
      await page.waitForTimeout(1200);
      return bodyText();
    };

    // ── 1 + 2: tri/semi (+3, +6) -> officer alert ──
    const triSemi = async (vehicle, monthsLabel) => {
      await page.goto(
        `${BASE}/private-vehicle-inspection?vehicleId=${vehicle.id}&plate=${encodeURIComponent(vehicle.license_plate)}&context=vehicle`,
        { waitUntil: 'domcontentloaded', timeout: 90000 },
      );
      await waitPage(page);
      await page.locator('input[placeholder*="עובד"]').first().fill('QA AD FM A');
      await page.getByRole('button', { name: new RegExp(`\\+${monthsLabel} חודשים`) }).first().click();
      await page.waitForTimeout(400);
      await page.getByRole('button', { name: /שמור בדיקה/ }).first().click();
      await page.waitForTimeout(4500);
      return toasts();
    };

    const toast3 = await triSemi(vehA1, 3);
    const officerAfter3 = await openAlertsFilter('התראת קצין רכב');
    const { data: insp3 } = await admin.from('vehicle_inspections').select('next_due_date').eq('vehicle_id', vehA1.id).maybeSingle();
    await page.screenshot({ path: join(OUT, 'qa1-officer-plus3.png'), fullPage: true }).catch(() => null);
    rec('qa1', 'tri/semi +3 months creates an officer alert visible in the alerts screen',
      officerAfter3.includes(plateA1) && /התראת קצין רכב/.test(officerAfter3) && Boolean(insp3?.next_due_date),
      { toast: toast3.slice(0, 200), nextDue: insp3?.next_due_date, plateVisible: officerAfter3.includes(plateA1) });

    const toast6 = await triSemi(vehA2, 6);
    const officerAfter6 = await openAlertsFilter('התראת קצין רכב');
    const { data: insp6 } = await admin.from('vehicle_inspections').select('next_due_date').eq('vehicle_id', vehA2.id).maybeSingle();
    const days6 = insp6?.next_due_date
      ? Math.round((new Date(insp6.next_due_date).getTime() - Date.now()) / 86400000)
      : null;
    await page.screenshot({ path: join(OUT, 'qa2-officer-plus6.png'), fullPage: true }).catch(() => null);
    rec('qa2', 'tri/semi +6 months creates an officer alert visible beyond 30 days',
      officerAfter6.includes(plateA2) && days6 !== null && days6 > 30,
      { toast: toast6.slice(0, 200), nextDue: insp6?.next_due_date, daysAhead: days6, plateVisible: officerAfter6.includes(plateA2) });

    // ── 3: manual officer alert from the vehicle card ──
    const createAlertFromVehicle = async (vehicle, typeLabel, title, dateStr) => {
      await page.goto(hubUrl(vehicle.id, 'actions', 'alerts'), { waitUntil: 'domcontentloaded', timeout: 90000 });
      await waitPage(page);
      await page.getByRole('button', { name: /הוסף התראה/ }).first().click();
      await page.waitForTimeout(900);
      const modal = page.locator('div.fixed.inset-0.z-50').last();
      await modal.getByRole('button', { name: new RegExp(typeLabel) }).first().click();
      await page.waitForTimeout(300);
      await modal.getByPlaceholder('כותרת ההתראה...').fill(title);
      await modal.locator('input[type="date"]').first().fill(dateStr);
      await modal.getByRole('button', { name: /צור התראה/ }).first().click();
      await page.waitForTimeout(2800);
      return toasts();
    };

    const officerTitle = `QA קצין ידני ${runId}`;
    const officerToast = await createAlertFromVehicle(vehA1, 'התראת קצין רכב', officerTitle, isoDays(50));
    const { data: officerRow } = await admin
      .from('custom_alerts')
      .select('alert_type, company_name, alert_date, title')
      .like('title', `${officerTitle}%`)
      .maybeSingle();
    const officerFiltered = await openAlertsFilter('התראת קצין רכב');
    await page.screenshot({ path: join(OUT, 'qa3-manual-officer.png'), fullPage: true }).catch(() => null);
    rec('qa3', 'manual officer alert from the vehicle card saves without an error and shows in the alerts screen',
      !/שגיאה|תקלה/.test(officerToast) && officerRow?.alert_type === 'officer' && officerRow?.company_name === companyA && officerFiltered.includes(officerTitle),
      { toast: officerToast.slice(0, 200), row: officerRow, visible: officerFiltered.includes(officerTitle) });

    // ── 4: manual free alert from the vehicle card ──
    const freeTitle = `QA חופשית ידנית ${runId}`;
    const freeToast = await createAlertFromVehicle(vehA1, 'התראה חופשית', freeTitle, isoDays(40));
    const { data: freeRow } = await admin
      .from('custom_alerts')
      .select('alert_type, company_name, title')
      .like('title', `${freeTitle}%`)
      .maybeSingle();
    const freeFiltered = await openAlertsFilter('התראה חופשית');
    await page.screenshot({ path: join(OUT, 'qa4-manual-free.png'), fullPage: true }).catch(() => null);
    rec('qa4', 'manual free alert from the vehicle card saves without an error and shows in the alerts screen',
      !/שגיאה|תקלה/.test(freeToast) && freeRow?.alert_type === 'free' && freeRow?.company_name === companyA && freeFiltered.includes(freeTitle),
      { toast: freeToast.slice(0, 200), row: freeRow, visible: freeFiltered.includes(freeTitle) });

    // ── 5: same mechanism from the driver card ──
    const driverFreeTitle = `QA נהג חופשית ${runId}`;
    let driverToast = '';
    if (driverA?.id) {
      await page.goto(`${BASE}/drivers?driverId=${driverA.id}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await waitPage(page);
      const driverAddAlert = page.getByRole('button', { name: /הוסף התראה/ }).first();
      if (await driverAddAlert.count()) {
        await driverAddAlert.click();
        await page.waitForTimeout(900);
        const driverModal = page.locator('div.fixed.inset-0.z-50').last();
        await driverModal.getByRole('button', { name: /התראה חופשית/ }).first().click();
        await driverModal.getByPlaceholder('כותרת ההתראה...').fill(driverFreeTitle);
        await driverModal.locator('input[type="date"]').first().fill(isoDays(35));
        await driverModal.getByRole('button', { name: /צור התראה/ }).first().click();
        await page.waitForTimeout(2800);
        driverToast = await toasts();
      }
    }
    const driverFreeFiltered = await openAlertsFilter('התראה חופשית');
    const { data: driverRow } = await admin
      .from('custom_alerts')
      .select('alert_type, company_name, title')
      .like('title', `${driverFreeTitle}%`)
      .maybeSingle();
    await page.screenshot({ path: join(OUT, 'qa5-driver-free.png'), fullPage: true }).catch(() => null);
    rec('qa5', 'driver card uses the same alert mechanism and the alert reaches the alerts screen',
      !/שגיאה|תקלה/.test(driverToast) && driverRow?.company_name === companyA && driverFreeFiltered.includes(driverFreeTitle),
      { toast: driverToast.slice(0, 200), row: driverRow, visible: driverFreeFiltered.includes(driverFreeTitle) });

    // ── 6: filters isolate each category ──
    const officerOnly = await openAlertsFilter('התראת קצין רכב');
    const freeOnly = await openAlertsFilter('התראה חופשית');
    rec('qa6', 'officer and free filters each show only their own alerts',
      officerOnly.includes(officerTitle) && !officerOnly.includes(freeTitle) &&
      freeOnly.includes(freeTitle) && !freeOnly.includes(officerTitle),
      {
        officerHasOfficer: officerOnly.includes(officerTitle),
        officerHasFree: officerOnly.includes(freeTitle),
        freeHasFree: freeOnly.includes(freeTitle),
        freeHasOfficer: freeOnly.includes(officerTitle),
      });

    // ── 7 + 8: license and insurance upload visible in the vehicle documents area ──
    const uploadThroughVehicleCard = async (vehicle, buttonLabel, filePath) => {
      await page.goto(hubUrl(vehicle.id, 'actions', 'docs'), { waitUntil: 'domcontentloaded', timeout: 90000 });
      await waitPage(page);
      const uploadButton = page.getByRole('button', { name: new RegExp(buttonLabel) }).first();
      const found = await uploadButton.count();
      if (found) await uploadButton.click();
      await waitPage(page);
      const fileInput = page.locator('input[type="file"]').first();
      const hasInput = await fileInput.count();
      if (hasInput) await fileInput.setInputFiles(filePath);
      await page.waitForTimeout(5000);
      return { found, hasInput, toast: await toasts(), url: page.url() };
    };

    const hubDocs = async (vehicle) => {
      await page.goto(hubUrl(vehicle.id, 'actions', 'docs'), { waitUntil: 'domcontentloaded', timeout: 90000 });
      await waitPage(page);
      return bodyText();
    };

    // The document card opens files through the in-app preview, so opening is
    // verified by the preview source plus a real HTTP fetch of the stored file.
    const openDocumentFromCard = async (namePart) => {
      const card = page.locator('div.card-elevated', { hasText: namePart }).first();
      const viewButton = card.locator('button[title="צפייה"]').first();
      if (!(await viewButton.count())) return '';
      await viewButton.click();
      await page.waitForTimeout(1800);
      const sources = await page.locator('iframe, embed, object, img').evaluateAll((els) =>
        els.map((el) => el.getAttribute('src') || el.getAttribute('data') || ''),
      );
      const previewSrc = sources.find((s) => s && s.includes(namePart)) || '';
      await page.keyboard.press('Escape').catch(() => null);
      await page.waitForTimeout(600);
      return previewSrc;
    };

    const storedFileStatus = async (namePart) => {
      const { data: metaRows } = await admin
        .from('document_metadata')
        .select('file_path')
        .eq('company_name', companyA);
      const row = (metaRows || []).find((m) => (m.file_path || '').includes(namePart));
      if (!row) return { url: '', status: 0 };
      const url = `${STAGING_URL}/storage/v1/object/public/documents/${row.file_path}`;
      const res = await fetch(url);
      return { url, status: res.status };
    };

    const licenseUpload = await uploadThroughVehicleCard(vehA1, 'העלה רישיון רכב', licenseFile);
    const licenseDocsText = await hubDocs(vehA1);
    const licensePreview = await openDocumentFromCard('qa-license');
    const licenseStored = await storedFileStatus('qa-license');
    await page.screenshot({ path: join(OUT, 'qa7-license-docs.png'), fullPage: true }).catch(() => null);
    rec('qa7', 'uploaded vehicle license appears in the vehicle documents area and opens',
      licenseUpload.found > 0 && /הועלה בהצלחה/.test(licenseUpload.toast) &&
      licenseDocsText.includes('qa-license') && Boolean(licensePreview) && licenseStored.status === 200,
      { upload: licenseUpload, listed: licenseDocsText.includes('qa-license'), previewSrc: licensePreview.slice(0, 160), stored: licenseStored });

    const insuranceUpload = await uploadThroughVehicleCard(vehA1, 'העלה ביטוח חובה', insuranceFile);
    const insuranceDocsText = await hubDocs(vehA1);
    const insurancePreview = await openDocumentFromCard('qa-insurance');
    const insuranceStored = await storedFileStatus('qa-insurance');
    await page.screenshot({ path: join(OUT, 'qa8-insurance-docs.png'), fullPage: true }).catch(() => null);
    rec('qa8', 'uploaded mandatory insurance appears in the vehicle documents area and opens',
      insuranceUpload.found > 0 && /הועלה בהצלחה/.test(insuranceUpload.toast) &&
      insuranceDocsText.includes('qa-insurance') && Boolean(insurancePreview) && insuranceStored.status === 200,
      { upload: insuranceUpload, listed: insuranceDocsText.includes('qa-insurance'), previewSrc: insurancePreview.slice(0, 160), stored: insuranceStored });

    // ── 9: refresh + leave + re-enter persistence ──
    await page.goto(`${BASE}/vehicles`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitPage(page);
    const afterReenterText = await hubDocs(vehA1);
    const alertsAfterReenter = await openAlertsFilter('התראת קצין רכב');
    const freeAfterReenter = await openAlertsFilter('התראה חופשית');
    const duplicateLicense = (afterReenterText.match(/qa-license/g) || []).length;
    await page.screenshot({ path: join(OUT, 'qa9-after-reentry.png'), fullPage: true }).catch(() => null);
    rec('qa9', 'documents and alerts survive refresh, leaving the screen and re-entering, with no duplicates',
      afterReenterText.includes('qa-license') && afterReenterText.includes('qa-insurance') &&
      alertsAfterReenter.includes(officerTitle) && freeAfterReenter.includes(freeTitle) && duplicateLicense === 1,
      { licenseCopies: duplicateLicense, officerStillThere: alertsAfterReenter.includes(officerTitle), freeStillThere: freeAfterReenter.includes(freeTitle) });

    // ── 11: officer inspections report regression ──
    await page.goto(`${BASE}/reports`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    const officerCard = page.getByText(/ביקורות קצין רכב/).first();
    if (await officerCard.count()) await officerCard.click();
    await page.waitForTimeout(2000);
    const reportText = await bodyText();
    const inspectionLink = page.getByRole('button', { name: /פתח ביקורת|ביקורת/ }).first();
    let inspectionNavOk = false;
    if (await inspectionLink.count()) {
      await inspectionLink.click().catch(() => null);
      await waitPage(page);
      inspectionNavOk = /ביקורת|בדיקה/.test(await bodyText());
      await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => null);
      await waitPage(page);
    }
    await page.screenshot({ path: join(OUT, 'qa11-officer-report.png'), fullPage: true }).catch(() => null);
    rec('qa11', 'officer inspections report still opens with rows and working links',
      reportText.includes(plateA1) && reportText.includes(plateA2) && inspectionNavOk,
      { hasA1: reportText.includes(plateA1), hasA2: reportText.includes(plateA2), inspectionNavOk });

    let csv = '';
    try {
      await page.evaluate(() => {
        window.__qaLastCsv = null;
        if (window.__qaCsvCaptureInstalled) return;
        window.__qaCsvCaptureInstalled = true;
        const original = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (blob) => {
          if (blob instanceof Blob && String(blob.type || '').includes('csv')) {
            void blob.text().then((text) => { window.__qaLastCsv = text; });
          }
          return original(blob);
        };
      });
      await page.getByRole('button', { name: /ייצוא/ }).first().evaluate((b) => b.click());
      await page.waitForFunction(() => typeof window.__qaLastCsv === 'string' && window.__qaLastCsv.length > 0, { timeout: 30000 });
      csv = await page.evaluate(() => window.__qaLastCsv);
    } catch (e) {
      csv = '';
    }
    if (csv) writeFileSync(join(OUT, 'officer-report-export.csv'), csv, 'utf8');
    const officerBlock = csv.split(/'--- /).find((block) => block.startsWith('ביקורות קצין רכב')) || '';
    const officerRows = officerBlock.trim().split(/\r?\n/).filter(Boolean);
    const officerHeader = officerRows[1] || '';
    const officerDataRows = officerRows.slice(2);
    rec('qa11b', 'officer inspections export still produces structured rows with the internal number',
      /מס[׳'] פנימי/.test(officerHeader) && officerHeader.includes('מועד הביקורת הבאה') &&
      officerDataRows.some((r) => r.includes(plateA1) && r.includes(',31,')) &&
      officerDataRows.every((r) => r.split(',').length >= officerHeader.split(',').length),
      { header: officerHeader, dataRows: officerDataRows.length, sample: officerDataRows[0]?.slice(0, 200) });

    // ── 12: short regression across the already-working areas ──
    const screens = [
      ['vehicles', '/vehicles', /רשימת רכבים|רכבים/],
      ['drivers', '/drivers', /נהגים/],
      ['vehicle-tracking', '/vehicle-tracking', /מעקב/],
      ['documents', '/documents', /מסמכים/],
      ['reports', '/reports', /דוחות/],
      ['alerts', '/alerts', /התראות/],
      ['settings', '/settings', /הגדרות/],
      ['customers', '/customers', /לקוחות/],
    ];
    const regression = {};
    for (const [id, path, expect] of screens) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await waitPage(page);
      const text = await bodyText();
      regression[id] = expect.test(text) && !/Something went wrong|Unexpected Application Error/.test(text);
    }
    await page.goto(hubUrl(vehA1.id, 'details'), { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    const detailsText = await bodyText();
    regression.vehicleCard = detailsText.includes(plateA1);
    await page.goto(`${BASE}/drivers?driverId=${driverA.id}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    regression.driverCard = (await bodyText()).includes(`QA Driver A ${runId}`);
    await page.screenshot({ path: join(OUT, 'qa12-regression.png'), fullPage: true }).catch(() => null);
    rec('qa12', 'short regression over the previously passing screens',
      Object.values(regression).every(Boolean), regression);

    await ctxA.close();

    // ── 10: company isolation ──
    const { context: ctxB, page: pageB } = await login(emailB);
    await pageB.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(pageB);
    const bAlerts = await pageB.locator('body').innerText();
    await pageB.goto(`${BASE}/vehicles?vehicleId=${vehB1.id}&view=hub&hubSection=actions&hubTab=docs`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(pageB);
    const bDocs = await pageB.locator('body').innerText();
    await pageB.goto(`${BASE}/documents`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(pageB);
    const bDocsScreen = await pageB.locator('body').innerText();
    await pageB.screenshot({ path: join(OUT, 'qa10-company-b.png'), fullPage: true }).catch(() => null);
    rec('qa10', 'company B sees none of company A alerts, documents or plates',
      !bAlerts.includes(officerTitle) && !bAlerts.includes(freeTitle) && !bAlerts.includes(plateA1) &&
      !bDocs.includes('qa-license') && !bDocs.includes('qa-insurance') && !bDocsScreen.includes(plateA1),
      {
        alertsLeak: bAlerts.includes(officerTitle) || bAlerts.includes(freeTitle) || bAlerts.includes(plateA1),
        docsLeak: bDocs.includes('qa-license') || bDocs.includes('qa-insurance'),
        docScreenLeak: bDocsScreen.includes(plateA1),
      });
    await ctxB.close();
  } catch (e) {
    report.fatal = String(e?.stack || e);
    fail += 1;
    console.error(e);
  } finally {
    await browser.close().catch(() => null);
    try {
      await admin.from('custom_alerts').delete().in('company_name', [companyA, companyB]);
      await admin.from('vehicle_inspections').delete().in('company_name', [companyA, companyB]);
      const { data: metaRows } = await admin.from('document_metadata').select('id, file_path').in('company_name', [companyA, companyB]);
      if (metaRows?.length) {
        await admin.storage.from('documents').remove(metaRows.map((m) => m.file_path).filter(Boolean));
        await admin.from('document_metadata').delete().in('id', metaRows.map((m) => m.id));
      }
      if (ids.drivers.length) await admin.from('drivers').delete().in('id', ids.drivers);
      if (ids.vehicles.length) await admin.from('vehicles').delete().in('id', ids.vehicles);
      if (ids.settings.length) await admin.from('company_settings').delete().in('company_name', ids.settings);
      for (const uid of ids.users) {
        await admin.from('user_roles').delete().eq('user_id', uid);
        await admin.from('profiles').delete().eq('id', uid);
        await admin.auth.admin.deleteUser(uid).catch(() => null);
      }
      report.cleanup = { ok: true, scope: 'QA-AD-* only' };
    } catch (ce) {
      report.cleanup = { ok: false, error: String(ce) };
    }
  }

  report.summary = { pass, fail };
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nPASS ${pass} / FAIL ${fail}`);
  if (report.failedResponses.length) {
    console.log('failed supabase responses:', JSON.stringify(report.failedResponses.slice(0, 8), null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
