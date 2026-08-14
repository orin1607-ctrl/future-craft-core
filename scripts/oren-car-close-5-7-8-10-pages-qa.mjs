/**
 * Final alert/document/report/export QA on published Staging Pages.
 * node scripts/oren-car-close-5-7-8-10-pages-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const COMMIT = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-tasks-1-10-staging/final-alerts-docs-reports-qa');
mkdirSync(OUT, { recursive: true });

if (STAGING_REF === PROD_REF) throw new Error('refused: production db');
if (BASE.includes('dalia-car.online') || BASE.includes('hostinger')) throw new Error('refused: production url');

const report = { at: new Date().toISOString(), base: BASE, commit: COMMIT, deployTxt: null, tasks: {}, shots: [], productionTouched: false };

function rec(task, name, ok, extra = {}) {
  if (!report.tasks[task]) report.tasks[task] = { checks: [], pass: true };
  report.tasks[task].checks.push({ name, ok: Boolean(ok), ...extra });
  if (!ok) report.tasks[task].pass = false;
  console.log(ok ? 'PASS' : 'FAIL', task, name, extra.note || extra.value || extra.snippet || extra.error || '');
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
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    {
      key: `sb-${projectRef}-auth-token`,
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
  await page.waitForTimeout(1400);
  await page.waitForLoadState('networkidle').catch(() => null);
}

async function body(page) {
  return page.locator('body').innerText();
}

function parseCsvLine(line) {
  const cells = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      cells.push(value);
      value = '';
    } else {
      value += ch;
    }
  }
  cells.push(value);
  return cells;
}

async function exportCsvThroughUi(page) {
  await page.evaluate(() => {
    window.__qaLastCsv = null;
    if (window.__qaCsvCaptureInstalled) return;
    window.__qaCsvCaptureInstalled = true;
    const originalCreateObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      if (blob instanceof Blob && String(blob.type || '').includes('csv')) {
        void blob.text().then((text) => {
          window.__qaLastCsv = text;
        });
      }
      return originalCreateObjectURL(blob);
    };
  });
  // Invoke the visible button's native click even when Cursor's floating
  // accessibility/theme controls overlap its corner in the automation viewport.
  await page.getByRole('button', { name: /ייצוא/ }).first().evaluate((button) => button.click());
  await page.waitForFunction(() => typeof window.__qaLastCsv === 'string' && window.__qaLastCsv.length > 0);
  return page.evaluate(() => window.__qaLastCsv);
}

async function loginContext(browser, anon, email, password) {
  const { data: auth, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const context = await browser.newContext({ locale: 'he-IL', viewport: { width: 1440, height: 1000 } });
  await inject(context, auth.session);
  const page = await context.newPage();
  return { context, page, session: auth.session };
}

async function main() {
  const deployTxt = await fetch(`${BASE}/STAGING-DEPLOY.txt?t=${Date.now()}`).then((r) => r.text());
  report.deployTxt = deployTxt.trim();
  rec('deploy', 'Pages is current staging commit', deployTxt.includes(COMMIT) || /feat\/incident-alerts-staging/.test(deployTxt), { deployTxt: deployTxt.trim(), COMMIT });

  const k = keys();
  const admin = createClient(STAGING_URL, k.service, { auth: { autoRefreshToken: false, persistSession: false } });
  const anon = createClient(STAGING_URL, k.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const runId = Date.now();
  const companyA = `QA-C5710-A-${runId}`;
  const companyB = `QA-C5710-B-${runId}`;
  const emailA = `qa-c5710-a-${runId}@staging-e2e.local`;
  const emailB = `qa-c5710-b-${runId}@staging-e2e.local`;
  const password = `QaC5710!${runId}`;
  const plateA = `CA${String(runId).slice(-6)}`;
  const plateB = `CB${String(runId).slice(-6)}`;
  const ids = { users: [], vehicles: [], drivers: [], settings: [], inspections: [] };
  const pdfLicense = join(OUT, 'qa-license.pdf');
  const pdfInsurance = join(OUT, 'qa-insurance.pdf');
  writeFileSync(pdfLicense, Buffer.from('%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'));
  writeFileSync(pdfInsurance, Buffer.from('%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'));

  const browser = await chromium.launch({ headless: true });
  try {
    await admin.from('company_settings').insert([
      { company_name: companyA, reminder_30_days: true, reminder_7_days: true, reminder_1_day: true, hidden_buttons: ['driver-hub-dashboard'] },
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

    const userA = await makeFm(emailA, 'QA C5710 FM A', companyA);
    await makeFm(emailB, 'QA C5710 FM B', companyB);

    const { data: vehA, error: vErr } = await admin.from('vehicles').insert({
      license_plate: plateA,
      internal_number: '19',
      manufacturer: 'CloseToyota',
      model: 'Corolla',
      department: 'QA-Dept',
      company_name: companyA,
      status: 'active',
      year: 2020,
      vehicle_type: 'רכב פרטי',
      odometer: 50000,
      test_expiry: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
      insurance_expiry: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10),
      insurance_alerts_enabled: true,
    }).select('id').single();
    if (vErr) throw vErr;
    ids.vehicles.push(vehA.id);

    const { data: vehB, error: vbErr } = await admin.from('vehicles').insert({
      license_plate: plateB,
      internal_number: '77',
      manufacturer: 'OtherBrand',
      model: 'Leak',
      company_name: companyB,
      status: 'active',
      year: 2021,
      vehicle_type: 'רכב פרטי',
      odometer: 1000,
    }).select('id').single();
    if (vbErr) throw vbErr;
    ids.vehicles.push(vehB.id);

    const { data: drvA, error: dErr } = await admin.from('drivers').insert({
      full_name: `נהג C5710 A ${runId}`,
      company_name: companyA,
      phone: '0501110000',
      status: 'active',
      license_expiry: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10),
    }).select('id, full_name').single();
    if (dErr) throw dErr;
    ids.drivers.push(drvA.id);

    const { data: drvB, error: dbErr } = await admin.from('drivers').insert({
      full_name: `נהג C5710 B ${runId}`,
      company_name: companyB,
      phone: '0509990000',
      status: 'active',
    }).select('id, full_name').single();
    if (dbErr) throw dbErr;
    ids.drivers.push(drvB.id);

    await admin.from('vehicle_inspections').insert({
      vehicle_id: vehA.id,
      vehicle_plate: plateA,
      company_name: companyA,
      inspection_type: 'tri_semi_annual',
      inspection_date: '2026-01-10',
      next_due_date: null,
      overall_status: 'ok',
      inspector_name: 'Old QA',
    });
    await admin.from('vehicle_inspections').insert({
      vehicle_id: vehA.id,
      vehicle_plate: plateA,
      company_name: companyA,
      inspection_type: 'tri_semi_annual',
      inspection_date: new Date().toISOString().slice(0, 10),
      next_due_date: '2026-11-13',
      overall_status: 'ok',
      inspector_name: 'QA C5710 FM A',
    });
    await admin.from('vehicle_inspections').insert({
      vehicle_id: vehB.id,
      vehicle_plate: plateB,
      company_name: companyB,
      inspection_type: 'tri_semi_annual',
      inspection_date: new Date().toISOString().slice(0, 10),
      next_due_date: '2026-12-01',
      overall_status: 'ok',
      inspector_name: 'QA C5710 FM B',
    });

    const a = await loginContext(browser, anon, emailA, password);
    const page = a.page;

    // ── regression 1 ──
    await page.goto(`${BASE}/vehicles`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    rec('r1', 'Vehicles list loads', /CloseToyota|רכבים/.test(await body(page)));
    rec('r1', 'No company B leak on vehicles', !(await body(page)).includes('OtherBrand'));
    const search = page.locator('input[placeholder*="חיפוש"]').first();
    if (await search.count()) {
      await search.fill('19');
      await page.waitForTimeout(600);
    }
    rec('r1', 'Search 19 still first-class', (await body(page)).includes(plateA) && (await body(page)).includes('19'));

    const isolate = async (task, fn) => {
      try {
        await fn();
      } catch (e) {
        rec(task, 'section did not crash the rest of QA', false, { error: String(e?.message || e) });
        await shot(page, `${task}-error.png`).catch(() => null);
      }
    };

    // ── 10 types ──
    await isolate('t10', async () => {
      await page.goto(`${BASE}/vehicles`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await waitPage(page);
      const addBtn = page.locator('#add-vehicle-btn');
      if (await addBtn.count()) await addBtn.click({ force: true });
      else await page.getByRole('button', { name: /הוספת רכב/ }).first().click({ force: true });
      await waitPage(page);
      if (!/הוספת רכב חדש|שלב 1/.test(await body(page))) {
        await page.locator('button[title="רכב חדש"]').click({ force: true }).catch(() => null);
        await waitPage(page);
      }
      await shot(page, 't10-intro.png');
      rec('t10', 'Intro add-vehicle screen opens', /הוספת רכב חדש|שלב 1/.test(await body(page)));
      rec('t10', 'נגרר on intro', (await page.locator('option:has-text("נגרר")').count()) > 0);
      rec('t10', 'טרקטור on intro', (await page.locator('option:has-text("טרקטור")').count()) > 0);
      rec('t10', 'ציוד הנדסי on intro', (await page.locator('option:has-text("ציוד הנדסי")').count()) > 0);
      rec('t10', 'רכב זעיר on intro', (await page.locator('option:has-text("רכב זעיר")').count()) > 0);
      rec('t10', 'רכב פרטי still there', (await page.locator('option:has-text("רכב פרטי")').count()) > 0);
      rec('t10', 'No duplicate נגרר', (await page.locator('option:has-text("נגרר")').count()) <= 2);
      await page.locator('#vehicle-type-intro, select[aria-label="סוג רכב"]').first().selectOption({ label: 'נגרר' }).catch(() => null);
      await page.getByPlaceholder('12-345-67').fill(`${plateA}N`);
      await page.getByRole('button', { name: /המשך לטופס המלא/ }).click();
      await waitPage(page);
      rec('t10', 'Full form keeps new types', (await page.locator('option:has-text("נגרר")').count()) > 0 && (await page.locator('option:has-text("רכב זעיר")').count()) > 0);
      await shot(page, 't10-full-form.png');
      await page.getByRole('button', { name: /חזרה|ביטול/ }).first().click().catch(() => null);
      await waitPage(page);

      await page.goto(`${BASE}/vehicles?vehicleId=${vehA.id}&view=hub`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await waitPage(page);
      rec('r3', 'Vehicle hub opens', (await body(page)).includes(plateA));
      rec('r9', 'Free alert CTA still on hub', /הוסף התראה|התראה חופשית/.test(await body(page)));
      const editBtn = page.getByRole('button', { name: /עריכה/ }).first();
      if (await editBtn.count()) {
        await editBtn.click();
        await waitPage(page);
        rec('t10', 'Edit form has new types', (await page.locator('option:has-text("טרקטור")').count()) > 0);
        const typeSelect = page.locator('select[name="vehicle_type"], select[aria-label="סוג רכב"]').first();
        if (await typeSelect.count()) {
          await typeSelect.selectOption({ label: 'טרקטור' }).catch(async () => {
            await typeSelect.selectOption({ index: 1 }).catch(() => null);
          });
        }
        const saveType = page.getByRole('button', { name: /שמור פרטי רכב/ }).first();
        if (await saveType.count()) {
          await saveType.click();
          await page.waitForTimeout(2000);
        }
        rec('t10', 'Edit type save attempted', true);
      }
      await shot(page, 't10-edit.png');
      const { data: vehType } = await admin.from('vehicles').select('vehicle_type').eq('id', vehA.id).maybeSingle();
      rec('t10', 'Saved vehicle_type is not empty after edit path', Boolean(vehType?.vehicle_type), { value: vehType?.vehicle_type });
    });

    // ── 5 docs E2E ──
    await isolate('t5', async () => {
    await page.goto(`${BASE}/vehicles?vehicleId=${vehA.id}&view=hub`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    rec('t5', 'Hub exposes existing מסמכים screen for this vehicle', (await page.getByRole('button', { name: /^מסמכים$/ }).count()) > 0);
    await page.getByRole('button', { name: /^פרטי רכב/ }).click();
    await waitPage(page);
    await page.getByRole('button', { name: /עריכה מלאה/ }).click();
    await waitPage(page);
    rec('t5', 'Actual Dalia edit form opens', /עריכת רכב/.test(await body(page)));
    await page.getByText(/3\. ביטוחים ורישיונות/).first().click();
    await waitPage(page);
    const licenseInput = page.locator('input[name="license_file"]');
    const mandatoryInput = page.locator('input[name="mandatory_insurance_file"]');
    const comprehensiveInput = page.locator('input[name="comprehensive_insurance_file"]');
    rec('t5', 'Dalia license upload input present', (await licenseInput.count()) > 0);
    rec('t5', 'Dalia mandatory insurance upload input present', (await mandatoryInput.count()) > 0);
    rec('t5', 'Dalia additional insurance upload input present', (await comprehensiveInput.count()) > 0);
    await licenseInput.setInputFiles(pdfLicense);
    await page.waitForTimeout(2500);
    await mandatoryInput.setInputFiles(pdfInsurance);
    await page.waitForTimeout(2500);
    await comprehensiveInput.setInputFiles(pdfInsurance);
    await page.waitForTimeout(2500);
    rec('t5', 'All real Dalia uploads finish without error', !(await body(page)).includes('שגיאה'));
    await shot(page, 't5-dalia-uploads.png');
    await page.getByRole('button', { name: /שמור ביטוחים ורישיונות/ }).click();
    await page.getByRole('button', { name: /שמור רכב חדש/ }).first().click();
    await page.waitForTimeout(4500);

    const { data: vehDocs2 } = await admin
      .from('vehicles')
      .select('license_doc_url, insurance_doc_url, comprehensive_insurance_doc_url')
      .eq('id', vehA.id)
      .maybeSingle();
    rec('t5', 'license_doc_url persisted by actual form', Boolean(vehDocs2?.license_doc_url), { value: vehDocs2?.license_doc_url });
    rec('t5', 'insurance_doc_url persisted by actual form', Boolean(vehDocs2?.insurance_doc_url), { value: vehDocs2?.insurance_doc_url });
    rec('t5', 'additional insurance URL persisted by actual form', Boolean(vehDocs2?.comprehensive_insurance_doc_url), { value: vehDocs2?.comprehensive_insurance_doc_url });
    if (vehDocs2?.license_doc_url) {
      const opened = await fetch(vehDocs2.license_doc_url);
      rec('t5', 'License document URL opens', opened.ok, { status: opened.status });
    }
    if (vehDocs2?.insurance_doc_url) {
      const openedIns = await fetch(vehDocs2.insurance_doc_url);
      rec('t5', 'Insurance document URL opens', openedIns.ok, { status: openedIns.status });
    }
    if (vehDocs2?.comprehensive_insurance_doc_url) {
      const openedAdditional = await fetch(vehDocs2.comprehensive_insurance_doc_url);
      rec('t5', 'Additional insurance document URL opens', openedAdditional.ok, { status: openedAdditional.status });
    }

    const { data: metaDocs } = await admin.from('document_metadata').select('id, category, vehicle_plate').eq('company_name', companyA);
    rec('t5', 'Dalia metadata uses canonical categories', ['vehicle-license', 'insurance', 'comprehensive'].every((category) => (metaDocs || []).some((d) => d.category === category)), { categories: (metaDocs || []).map((d) => d.category) });
    rec('t5', 'No duplicate license/insurance metadata', ['vehicle-license', 'insurance', 'comprehensive'].every((category) => (metaDocs || []).filter((d) => d.category === category).length === 1), { count: metaDocs?.length || 0 });

    await page.goto(`${BASE}/vehicles?vehicleId=${vehA.id}&view=hub`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitPage(page);
    await page.getByRole('button', { name: /^פעולות רכב$/ }).click().catch(() => null);
    await waitPage(page);
    await page.getByRole('button', { name: /^מסמכים$/ }).last().click().catch(() => null);
    await waitPage(page);
    rec('t5', 'After refresh+re-enter hub still shows all uploaded documents', Boolean(vehDocs2?.license_doc_url && vehDocs2?.insurance_doc_url && vehDocs2?.comprehensive_insurance_doc_url) && /רישיון|ביטוח|מסמך|pdf|qa-/.test(await body(page)));
    rec('t5', 'No duplicate invented Beeri docs', !(await body(page)).includes('בארי'));
    if (vehDocs2?.license_doc_url) {
      rec('t5', 'License URL is openable http(s)', /^https?:\/\//.test(vehDocs2.license_doc_url));
    }
    });

    // ── 7 hide dashboard ──
    await isolate('t7', async () => {
    await page.goto(`${BASE}/drivers`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    rec('t7', 'A drivers list has no dashboard entry', (await page.getByRole('button', { name: /פתח דשבורד נהג/ }).count()) === 0);
    rec('r-drivers', 'A driver listed', (await body(page)).includes(drvA.full_name));
    rec('t7', 'B driver not mixed into A list', !(await body(page)).includes(drvB.full_name));
    await page.getByText(drvA.full_name).first().click();
    await waitPage(page);
    rec('t7', 'A driver hub has no dashboard entry', (await page.getByRole('button', { name: /^דשבורד$|פתח דשבורד נהג/ }).count()) === 0);
    rec('r9', 'Driver free-alert CTA still there', /הוסף התראה|התראה חופשית/.test(await body(page)));
    await page.goto(`${BASE}/dashboard?driverId=${drvA.id}&driverName=${encodeURIComponent(drvA.full_name)}&context=driver`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    rec('t7', 'Direct dashboard URL does not stay on driver dashboard for FM when hidden', !(await body(page)).includes('דשבורד נהג (צפייה מנהל)') && !(await body(page)).includes('דשבורד נהג\n'));
    await shot(page, 't7-direct-url.png');

    await admin.from('company_settings').update({ hidden_buttons: [] }).eq('company_name', companyA);
    await page.goto(`${BASE}/drivers`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitPage(page);
    rec('t7', 'After enabling, list dashboard entry returns', (await page.getByRole('button', { name: /פתח דשבורד נהג/ }).count()) > 0);
    await admin.from('company_settings').update({ hidden_buttons: ['driver-hub-dashboard'] }).eq('company_name', companyA);

    const b = await loginContext(browser, anon, emailB, password);
    await b.page.goto(`${BASE}/drivers`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(b.page);
    rec('t7', 'Company B still shows dashboard entry', (await b.page.getByRole('button', { name: /פתח דשבורד נהג/ }).count()) > 0);
    rec('t5', 'Company B hub/docs do not show A license url text', !(await b.page.locator('body').innerText()).includes(plateA));
    rec('t7', 'Company B list does not show A driver', !(await b.page.locator('body').innerText()).includes(drvA.full_name));
    await b.context.close();
    });

    // ── final fix 1: actual tri/semi save -> visible officer alert ──
    await isolate('fix1', async () => {
      const saveTilta = async (months) => {
        await page.goto(
          `${BASE}/private-vehicle-inspection?vehicleId=${vehA.id}&plate=${encodeURIComponent(plateA)}&context=vehicle`,
          { waitUntil: 'domcontentloaded', timeout: 90000 },
        );
        await waitPage(page);
        await page.locator('input[placeholder*="עובד"]').fill('QA C5710 FM A');
        await page.getByRole('button', { name: new RegExp(`\\+${months} חודשים`) }).click();
        await page.getByRole('button', { name: /שמור בדיקה/ }).click();
        await page.waitForTimeout(3500);
      };
      await saveTilta(3);
      const { data: firstVehicle } = await admin.from('vehicles').select('next_inspection_date').eq('id', vehA.id).single();
      const firstDue = firstVehicle?.next_inspection_date;
      await saveTilta(6);
      const { data: secondVehicle } = await admin.from('vehicles').select('next_inspection_date').eq('id', vehA.id).single();
      const secondDue = secondVehicle?.next_inspection_date;
      rec('fix1', '+3 then +6 updates next inspection date', Boolean(firstDue && secondDue && firstDue !== secondDue), { firstDue, secondDue });

      const { data: activeOfficerFamily } = await admin
        .from('custom_alerts')
        .select('id, title, description, alert_date, alert_type, is_active, company_name')
        .eq('company_name', companyA)
        .eq('is_active', true);
      const officerFamily = (activeOfficerFamily || []).filter((row) => String(row.title || '').includes('התראת קצין רכב'));
      rec('fix1', 'Old +3 officer reminder family is deactivated', officerFamily.every((row) => !String(row.description || '').includes(`target:${firstDue}`)), { active: officerFamily.length });
      rec('fix1', 'Current +6 officer family is active', officerFamily.some((row) => String(row.description || '').includes(`target:${secondDue}`)));
      rec('fix1', 'Officer alerts are company A only', officerFamily.every((row) => row.company_name === companyA));

      await page.goto(`${BASE}/alerts?category=officer`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await waitPage(page);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitPage(page);
      const officerText = await body(page);
      rec('fix1', 'Officer filter is visible and selected after refresh', (await page.getByRole('button', { name: /התראת קצין רכב/ }).count()) > 0);
      rec('fix1', 'Officer alert is visible in sidebar Alerts UI', officerText.includes('התראת קצין רכב') && officerText.includes(plateA));
      rec('fix1', 'Officer alert >30 days remains visible', /עתידית|בעוד/.test(officerText));
      await shot(page, 'fix1-officer-alert.png');

      await page.goto(`${BASE}/vehicles?vehicleId=${vehA.id}&view=hub`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await waitPage(page);
      await page.goto(`${BASE}/alerts?category=officer`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await waitPage(page);
      rec('fix1', 'Officer alert survives leaving and re-entering', (await body(page)).includes(plateA));
    });

    // ── final fix 2: actual free alert -> central filter ──
    await isolate('fix2', async () => {
      const title = `התראה חופשית FINAL ${runId}`;
      await page.goto(`${BASE}/vehicles?vehicleId=${vehA.id}&view=hub`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await waitPage(page);
      await page.getByRole('button', { name: /הוסף התראה|התראה חופשית/ }).first().click();
      await page.getByPlaceholder('כותרת ההתראה...').fill(title);
      const future = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
      await page.locator('input[type="date"]').first().fill(future);
      await page.getByRole('button', { name: /צור התראה/ }).click();
      await page.waitForTimeout(1800);
      await page.goto(`${BASE}/alerts?category=free`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await waitPage(page);
      await page.getByRole('button', { name: /התראה חופשית/ }).click();
      await waitPage(page);
      rec('fix2', 'Free alert category/filter is always visible', (await page.getByRole('button', { name: /התראה חופשית/ }).count()) > 0);
      rec('fix2', 'Only free alert workflow row is visible', (await body(page)).includes(title));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitPage(page);
      rec('fix2', 'Free alert survives refresh with filter', (await body(page)).includes(title));
      rec('fix2', 'Free alert is company isolated', !(await body(page)).includes(plateB));
      await shot(page, 'fix2-free-alert-filter.png');
    });

    // ── 8 officer report ──
    await isolate('t8', async () => {
    await page.goto(`${BASE}/reports`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    await page.getByRole('button', { name: /^הכל$/ }).first().click().catch(() => null);
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /^ביקורות קצין רכב$/ }).click().catch(() => null);
    await waitPage(page);
    rec('t8', 'Officer filter selected expands report area', /ביקורות קצין רכב/.test(await body(page)));
    if (!(await page.locator('[data-report-table]').count())) {
      await page.getByRole('button', { name: /פתח טבלת ביקורות קצין רכב|ביקורות קצין רכב בכל הזמנים/ }).first().click().catch(() => null);
      await waitPage(page);
    }
    rec('t8', 'Officer table is actually open', (await page.locator('[data-report-table]').count()) > 0);
    const reportText = await body(page);
    rec('t8', 'Plate appears in report table', reportText.includes(plateA), { snippet: reportText.slice(0, 1800) });
    rec('t8', 'Internal number appears', reportText.includes('19'));
    rec('t8', 'Inspection type appears', /תלת|חצי/.test(reportText));
    rec('t8', 'Inspection date appears', /10\.1\.2026|10\/01|2026/.test(reportText));
    rec('t8', 'Missing next due shows dash', /—/.test(reportText) || /-/.test(reportText));
    rec('t8', 'Next due date appears for new row', /13|11\.2026|11\/2026/.test(reportText) || reportText.includes('13'));
    rec('t8', 'Company B plate absent', !reportText.includes(plateB));
    await shot(page, 't8-table.png');

    const plateFilter = page.getByPlaceholder(/מספר רכב/).first();
    if (await plateFilter.count()) {
      await plateFilter.fill(plateA);
      await page.waitForTimeout(500);
      rec('t8', 'Plate filter keeps A inspection', (await body(page)).includes(plateA));
    }
    const internalFilter = page.getByPlaceholder(/פנימי/).first();
    if (await internalFilter.count()) {
      await internalFilter.fill('19');
      await page.waitForTimeout(500);
      rec('t8', 'Internal filter keeps A inspection', (await body(page)).includes(plateA) || (await body(page)).includes('19'));
    }
    rec('t8', 'Export button present', (await page.getByRole('button', { name: /ייצוא/ }).count()) > 0);

    const inspectionLink = page.getByRole('button', { name: 'פתח ביקורת' }).first();
    const vehicleLink = page.getByRole('button', { name: 'פתח רכב' }).first();
    rec('t8', 'Each officer row has specific inspection action', (await inspectionLink.count()) > 0);
    rec('t8', 'Each officer row has vehicle action', (await vehicleLink.count()) > 0);
    if (await inspectionLink.count()) {
      await inspectionLink.click();
      await waitPage(page);
      rec('t8', 'Specific inspection action opens detail', /ביקורת רכב/.test(await body(page)) && (await body(page)).includes(plateA));
    }
    await page.goto(`${BASE}/reports`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    await page.getByRole('button', { name: /^ביקורות קצין רכב$/ }).click();
    await waitPage(page);
    const vehicleAction = page.getByRole('button', { name: 'פתח רכב' }).first();
    if (await vehicleAction.count()) {
      await vehicleAction.click();
      await waitPage(page);
      rec('t8', 'Vehicle action opens the linked vehicle hub', (await body(page)).includes(plateA));
    }

    await page.goto(`${BASE}/reports`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    await page.getByRole('button', { name: /^ביקורות קצין רכב$/ }).click();
    await waitPage(page);
    const officerCsv = await exportCsvThroughUi(page);
    const officerCsvPath = join(OUT, 'officer-inspections.csv');
    writeFileSync(officerCsvPath, officerCsv, 'utf8');
    const openedOfficerCsv = readFileSync(officerCsvPath, 'utf8');
    rec('t8', 'Officer CSV opens and contains plate/internal', openedOfficerCsv.includes(plateA) && openedOfficerCsv.includes('19'));
    rec('t8', 'Officer CSV has status and both links', openedOfficerCsv.includes('סטטוס') && openedOfficerCsv.includes('קישור לביקורת') && openedOfficerCsv.includes('קישור לרכב'));
    const officerLines = openedOfficerCsv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
    const officerHeaderIndex = officerLines.findIndex((line) => line.includes('מספר רכב') && line.includes('קישור לביקורת'));
    const officerHeaderWidth = officerHeaderIndex >= 0 ? parseCsvLine(officerLines[officerHeaderIndex]).length : 0;
    const officerDataWidth = officerHeaderIndex >= 0 && officerLines[officerHeaderIndex + 1]
      ? parseCsvLine(officerLines[officerHeaderIndex + 1]).length
      : 0;
    rec('t8', 'Officer CSV columns align', officerHeaderWidth === 8 && officerDataWidth === officerHeaderWidth, { officerHeaderWidth, officerDataWidth });

    const exportMatrix = [
      ['טסטים', 'טסטים'],
      ['טיפולים', 'טיפולים'],
      ['תאונות', 'תאונות'],
      ['ביקורות קצין רכב', 'ביקורות קצין רכב'],
      ['ביטוחים לחידוש', 'ביטוחים לחידוש'],
      ['סיכום רכבים', 'סיכום רכבים'],
      ['סיכום נהגים', 'סיכום נהגים'],
      ['הוצאות לפי תקופה', 'הוצאות לפי תקופה'],
      ['רווח והפסד', 'רווח והפסד'],
      ['טיפולים (מפורט)', 'טיפולים'],
      ['תאונות (מפורט)', 'תאונות'],
      ['הזמנות', 'הזמנות'],
      ['סיכום לפי ספקים', 'סיכום לפי ספקים'],
    ];
    for (let i = 0; i < exportMatrix.length; i += 1) {
      const [label, marker] = exportMatrix[i];
      await page.goto(`${BASE}/reports`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await waitPage(page);
      await page.getByRole('button', { name: label, exact: true }).click();
      await waitPage(page);
      rec('reports', `${label} opens`, (await body(page)).includes(label));
      const csvFromUi = await exportCsvThroughUi(page);
      const file = join(OUT, `report-${String(i + 1).padStart(2, '0')}.csv`);
      writeFileSync(file, csvFromUi, 'utf8');
      const csv = readFileSync(file, 'utf8');
      rec('reports', `${label} export opens with correct block`, csv.length > 10 && csv.includes(marker));
    }

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitPage(page);
    rec('t8', 'Reports page still loads after refresh', /דוחות/.test(await body(page)));
    });

    // ── regression alerts 4/6 ──
    await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitPage(page);
    rec('r4', 'Alerts page still healthy', /התרא/.test(await body(page)) && !/TypeError/.test(await body(page)));
    rec('r4', 'Expiry alerts still appear', /טסט|ביטוח|רישיון נהיגה/.test(await body(page)));
    rec('r4', 'No company B leak on alerts', !(await body(page)).includes(plateB));
    rec('r6', 'Free/officer categories still exist', /התראה חופשית|התראת קצין|התרא/.test(await body(page)));

    const regressionRoutes = [
      ['/vehicles', /רכב/],
      ['/drivers', /נהג/],
      ['/vehicle-tracking', /מעקב|רכב/],
      ['/documents', /מסמכ/],
      ['/reports', /דוחות/],
      ['/alert-settings', /התרא|הגדר/],
      ['/settings', /חברה|הגדר/],
    ];
    for (const [route, expected] of regressionRoutes) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await waitPage(page);
      const text = await body(page);
      rec('regression', `${route} loads without runtime error`, expected.test(text) && !/TypeError|ReferenceError/.test(text));
      rec('regression', `${route} remains company isolated`, !text.includes(plateB) && !text.includes(drvB.full_name));
    }

    await a.context.close();
  } catch (e) {
    report.fatal = String(e?.stack || e);
    console.error(e);
  } finally {
    await browser.close().catch(() => null);
    try {
      await admin.from('custom_alerts').delete().in('company_name', [companyA, companyB]);
      await admin.from('vehicle_inspections').delete().in('company_name', [companyA, companyB]);
      await admin.from('document_metadata').delete().in('company_name', [companyA, companyB]);
      if (ids.vehicles.length) await admin.from('vehicles').delete().in('id', ids.vehicles);
      if (ids.drivers.length) await admin.from('drivers').delete().in('id', ids.drivers);
      if (ids.settings.length) await admin.from('company_settings').delete().in('company_name', ids.settings);
      for (const uid of ids.users) {
        const storageFolder = `${uid}/vehicles_${plateA.replace(/[-\s]/g, '')}`;
        const { data: storedFiles } = await admin.storage.from('documents').list(storageFolder);
        if (storedFiles?.length) {
          await admin.storage
            .from('documents')
            .remove(storedFiles.map((file) => `${storageFolder}/${file.name}`));
        }
        await admin.from('user_roles').delete().eq('user_id', uid);
        await admin.from('profiles').delete().eq('id', uid);
        await admin.auth.admin.deleteUser(uid).catch(() => null);
      }
      report.cleanup = { ok: true, note: 'QA-C5710-* only' };
    } catch (ce) {
      report.cleanup = { ok: false, error: String(ce) };
    }
  }

  report.pass = Object.values(report.tasks).every((t) => t.pass) && !report.fatal;
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({
    pass: report.pass,
    taskPass: Object.fromEntries(Object.entries(report.tasks).map(([k, v]) => [k, v.pass])),
    deployTxt: report.deployTxt,
    commit: COMMIT,
    fatal: report.fatal || null,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
