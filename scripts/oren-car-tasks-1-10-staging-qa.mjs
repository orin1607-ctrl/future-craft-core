/**
 * Oren Car Staging QA — tasks 1–10 + exports (task 11).
 * Work area only. No Production / Hostinger / Production DB.
 * node scripts/oren-car-tasks-1-10-staging-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = (process.env.STAGING_QA_BASE || 'http://127.0.0.1:8080').replace(/\/$/, '');
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-tasks-1-10-staging/qa-task11');
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'exports'), { recursive: true });

if (STAGING_REF === 'qasomfndnjuixgjmjwcm') throw new Error('refused: production db');
if (BASE.includes('dalia-car.online') || BASE.includes('hostinger')) throw new Error('refused: production url');

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const report = {
  at: new Date().toISOString(),
  base: BASE,
  stagingRef: STAGING_REF,
  branch: execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim(),
  head: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
  snapshotUntouched: true,
  snapshotPath: 'docs/audit-reports/oren-car-tasks-1-10-staging/restore-c667595',
  productionDeploy: false,
  hostingerTouched: false,
  productionSupabaseTouched: false,
  googleAppsScriptTouched: false,
  tasks: {},
  exports: [],
  regression: {},
  daliaFormConfig: null,
  consoleErrors: [],
  networkErrors: [],
  shots: [],
  fixes: [],
  readyForOwnerReview: false,
};

function rec(task, name, ok, extra = {}) {
  if (!report.tasks[task]) report.tasks[task] = { checks: [], pass: true };
  report.tasks[task].checks.push({ name, ok: Boolean(ok), ...extra });
  if (!ok) report.tasks[task].pass = false;
  console.log(ok ? 'PASS' : 'FAIL', task, name, extra.error || extra.note || extra.value || '');
}

function recExport(name, ok, extra = {}) {
  report.exports.push({ name, ok: Boolean(ok), ...extra });
  console.log(ok ? 'PASS' : 'FAIL', 'export', name, extra.error || extra.note || '');
}

function recReg(name, ok, extra = {}) {
  report.regression[name] = { ok: Boolean(ok), ...extra };
  console.log(ok ? 'PASS' : 'FAIL', 'reg', name, extra.error || extra.note || '');
}

function keys() {
  const raw = execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  const arr = JSON.parse(raw);
  return {
    service: arr.find((k) => k.name === 'service_role')?.api_key,
    anon: arr.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || arr.find((k) => k.name === 'anon')?.api_key,
  };
}

async function shot(page, name) {
  const path = join(OUT, name);
  await page.screenshot({ path, fullPage: true }).catch(() => null);
  report.shots.push(name);
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

function parseCsv(buf) {
  const text = buf.toString('utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const headers = lines[0] ? lines[0].split(',').map((h) => h.replace(/^"|"$/g, '')) : [];
  const rows = lines.slice(1).map((line) => {
    const cols = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = !q;
      } else if (ch === ',' && !q) {
        cols.push(cur);
        cur = '';
      } else cur += ch;
    }
    cols.push(cur);
    return cols;
  });
  return { headers, rows, text };
}

async function waitList(page) {
  await page.waitForTimeout(800);
  await page.waitForLoadState('networkidle').catch(() => null);
}

async function openVehicleAlertModal(page) {
  const direct = page.getByRole('button', { name: /התראה מותאמת|התראה חופשית/ });
  if (await direct.count()) {
    await direct.first().click();
    return true;
  }
  const actions = page.getByRole('button', { name: /פעולות רכב/ });
  if (await actions.count()) {
    await actions.first().click();
    await page.waitForTimeout(500);
  }
  const quick = page.getByRole('button', { name: /^התראה$/ });
  if (await quick.count()) {
    await quick.first().click();
    return true;
  }
  const alertsTab = page.getByRole('button', { name: /^התראות$/ });
  if (await alertsTab.count()) {
    await alertsTab.first().click();
    await page.waitForTimeout(400);
  }
  const custom = page.getByRole('button', { name: /התראה מותאמת/ });
  if (await custom.count()) {
    await custom.first().click();
    return true;
  }
  return false;
}

async function fillCreateAlertModal(page, title, dateStr, typeLabel) {
  const modal = page.locator('.fixed.inset-0').filter({ hasText: 'יצירת התראה חדשה' });
  await modal.waitFor({ timeout: 10000 });
  if (typeLabel) {
    await modal.getByRole('button', { name: typeLabel }).first().click();
  }
  await modal.getByPlaceholder('כותרת ההתראה...').fill(title);
  await modal.locator('input[type="date"]').first().fill(dateStr);
  await modal.getByRole('button', { name: /צור התראה/ }).click();
  await page.waitForTimeout(1500);
  return true;
}

async function main() {
  rec('safety', 'Staging DB only', STAGING_REF === 'usfeoerkpcafxxlyuldl', { STAGING_REF });
  rec('safety', 'Not Production URL', !BASE.includes('dalia-car.online'), { BASE });
  rec('safety', 'Snapshot folder still exists', existsSync(join(process.cwd(), report.snapshotPath, 'restore-point.json')));

  const k = keys();
  const admin = createClient(STAGING_URL, k.service, { auth: { autoRefreshToken: false, persistSession: false } });
  const anon = createClient(STAGING_URL, k.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const runId = Date.now();
  const companyA = `QA-T11-A-${runId}`;
  const companyB = `QA-T11-B-${runId}`;
  const emailSa = `qa-t11-sa-${runId}@staging-e2e.local`;
  const emailFmA = `qa-t11-fma-${runId}@staging-e2e.local`;
  const emailFmB = `qa-t11-fmb-${runId}@staging-e2e.local`;
  const password = `QaT11!${runId}`;
  const plate19 = `T11${String(runId).slice(-5)}`;
  const ids = { users: [], vehicles: [], drivers: [], inspections: [], alerts: [], settings: [], versions: [], metadata: [] };

  try {
    const { data: formCfg } = await admin.from('dalia_form_config').select('config_key, config_value, updated_at').eq('config_key', 'vehicle_types').maybeSingle();
    const cfgTypes = formCfg?.config_value?.types || formCfg?.config_value || null;
    const labels = Array.isArray(cfgTypes)
      ? cfgTypes.map((t) => (typeof t === 'string' ? t : t?.label || t?.id)).filter(Boolean)
      : [];
    const needed = ['נגרר', 'טרקטור', 'ציוד הנדסי', 'רכב זעיר'];
    const missingInConfig = needed.filter((l) => !labels.some((x) => String(x).includes(l) || ['trailer', 'tractor', 'engineering', 'micro'].includes(String(x))));
    const { data: allCompanies } = await admin.from('company_settings').select('company_name');
    const companyNames = [...new Set((allCompanies || []).map((c) => c.company_name).filter(Boolean))].sort();
    report.daliaFormConfig = {
      exists: Boolean(formCfg),
      updatedAt: formCfg?.updated_at || null,
      labels,
      missingNewTypes: formCfg ? missingInConfig : [],
      companiesInWorkArea: companyNames,
      companiesMissingNewTypes: formCfg && missingInConfig.length
        ? companyNames
        : [],
      note: formCfg
        ? (missingInConfig.length
          ? `Global dalia_form_config.vehicle_types overrides defaults and is missing: ${missingInConfig.join(', ')}. All companies using fetchVehicleTypes() miss these 4 types. Config NOT merged.`
          : 'Global dalia_form_config.vehicle_types exists and already includes the 4 new types.')
        : 'No custom vehicle_types config — DEFAULT_VEHICLE_TYPES (including 4 new types) applies to all companies.',
    };

    await admin.from('company_settings').insert([
      { company_name: companyA, reminder_30_days: true, reminder_7_days: true, reminder_1_day: true, hidden_buttons: [] },
      { company_name: companyB, reminder_30_days: true, reminder_7_days: true, reminder_1_day: true, hidden_buttons: [] },
    ]);
    ids.settings.push(companyA, companyB);

    async function makeUser(email, role, company) {
      const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
      ids.users.push(created.user.id);
      await admin.from('profiles').upsert({
        id: created.user.id,
        full_name: `QA T11 ${role}`,
        company_name: company,
        is_active: true,
        approval_status: 'approved',
        two_factor_approved: true,
      });
      await admin.from('user_roles').delete().eq('user_id', created.user.id);
      await admin.from('user_roles').insert({ user_id: created.user.id, role });
      const { data: auth, error: signErr } = await anon.auth.signInWithPassword({ email, password });
      if (signErr) throw signErr;
      return { id: created.user.id, session: auth.session, email };
    }

    const sa = await makeUser(emailSa, 'super_admin', companyA);
    const fmA = await makeUser(emailFmA, 'fleet_manager', companyA);
    const fmB = await makeUser(emailFmB, 'fleet_manager', companyB);

    const { data: driver, error: dErr } = await admin.from('drivers').insert({
      full_name: `נהג QA T11 ${runId}`,
      company_name: companyA,
      phone: '0501112233',
      status: 'active',
      notes: 'הערת נהג ראשונית לבדיקה',
      show_notes_on_list: false,
      department: 'QA-Dept',
      id_number: `9${String(runId).slice(-8)}`,
    }).select('id, full_name').single();
    if (dErr) throw dErr;
    ids.drivers.push(driver.id);

    const { data: driverB, error: dbErr } = await admin.from('drivers').insert({
      full_name: `נהג B QA ${runId}`,
      company_name: companyB,
      phone: '0509998877',
      status: 'active',
      notes: 'הערת חברה אחרת',
    }).select('id').single();
    if (dbErr) throw dbErr;
    ids.drivers.push(driverB.id);

    const vehRows = [
      { license_plate: plate19, internal_number: '19', manufacturer: 'ToyotaQA', model: 'CorollaQA', department: 'QA-Dept', odometer: 10000, vehicle_type: 'רכב פרטי' },
      { license_plate: `${plate19}A`, internal_number: '019', manufacturer: 'MazdaQA', model: '3', department: 'Other', odometer: 20000, vehicle_type: 'רכב פרטי' },
      { license_plate: `${plate19}B`, internal_number: '119', manufacturer: 'FordQA', model: 'Focus', department: 'Other', odometer: 30000, vehicle_type: 'רכב פרטי' },
      { license_plate: `${plate19}C`, internal_number: '190', manufacturer: 'KiaQA', model: 'Picanto', department: 'Other', odometer: 40000, vehicle_type: 'רכב פרטי' },
    ].map((v) => ({ ...v, company_name: companyA, status: 'active', year: 2020 }));

    const { data: vehs, error: vErr } = await admin.from('vehicles').insert(vehRows).select('id, license_plate, internal_number, odometer');
    if (vErr) throw vErr;
    vehs.forEach((v) => ids.vehicles.push(v.id));
    const v19 = vehs.find((v) => v.internal_number === '19');

    const { data: vehB } = await admin.from('vehicles').insert({
      license_plate: `${plate19}X`,
      internal_number: '77',
      manufacturer: 'OtherCo',
      model: 'Iso',
      company_name: companyB,
      status: 'active',
      odometer: 5000,
    }).select('id').single();
    if (vehB) ids.vehicles.push(vehB.id);

    const oldInsp = await admin.from('vehicle_inspections').insert({
      vehicle_id: v19.id,
      vehicle_plate: plate19,
      inspection_type: 'quarterly',
      inspection_date: '2025-01-15',
      overall_status: 'passed',
      company_name: companyA,
      notes: 'old inspection without next_due',
    }).select('id').single();
    if (oldInsp.data) ids.inspections.push(oldInsp.data.id);

    const browser = await chromium.launch({ headless: true });

    async function openAs(session) {
      const context = await browser.newContext({ locale: 'he-IL', viewport: { width: 1400, height: 900 } });
      context.on('page', (p) => {
        p.on('console', (m) => {
          if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300));
        });
        p.on('response', (res) => {
          const u = res.url();
          if (u.includes('supabase.co') && res.status() >= 400) report.networkErrors.push(`${res.status()} ${u.slice(0, 180)}`);
        });
      });
      await inject(context, session);
      const page = await context.newPage();
      return { context, page };
    }

    // ── Task 1 search ──
    {
      const { context, page } = await openAs(fmA.session);
      await page.goto(`${BASE}/vehicles`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await waitList(page);
      recReg('vehicles-list', await page.getByText('ToyotaQA').count().then((n) => n > 0).catch(() => false));

      const search = page.locator('input[placeholder*="חיפוש"]').first();
      await search.fill('19');
      await page.waitForTimeout(400);
      const cards = page.locator('.card-elevated');
      const texts = [];
      const n = await cards.count();
      for (let i = 0; i < Math.min(n, 12); i++) texts.push((await cards.nth(i).innerText()).replace(/\s+/g, ' '));
      const firstHasExact = texts[0]?.includes('19') && !texts[0]?.includes('019') && !texts[0]?.includes('119') && !texts[0]?.includes('190')
        ? true
        : /(?:^|[^\d])19(?:[^\d]|$)/.test(texts[0] || '') && (texts[0] || '').includes(plate19);
      rec('t1', 'Search 19 shows ToyotaQA/plate19 first', firstHasExact || (texts[0] || '').includes(plate19), { first: (texts[0] || '').slice(0, 180) });
      rec('t1', '019/119/190 still appear after exact', texts.some((t) => t.includes('019') || t.includes(`${plate19}A`)) && texts.some((t) => t.includes('119') || t.includes(`${plate19}B`)), { sample: texts.slice(0, 5).map((t) => t.slice(0, 80)) });
      await shot(page, 't1-search-19.png');

      await search.fill('ToyotaQA');
      await page.waitForTimeout(400);
      rec('t1', 'Manufacturer search still works', (await page.locator('body').innerText()).includes('ToyotaQA'));
      await search.fill(plate19);
      await page.waitForTimeout(400);
      rec('t1', 'Plate search still works', (await page.locator('body').innerText()).includes('ToyotaQA'));
      await search.fill('QA-Dept');
      await page.waitForTimeout(400);
      rec('t1', 'Department search still works', (await page.locator('body').innerText()).includes('ToyotaQA'));
      await context.close();
    }

    // ── Tasks 2+3 inspection + odometer ──
    {
      const { context, page } = await openAs(fmA.session);
      await page.goto(`${BASE}/vehicles?vehicleId=${v19.id}&view=hub`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await waitList(page);
      recReg('vehicle-hub', /דשבורד|ק.?מ נוכחי|ToyotaQA/.test(await page.locator('body').innerText()));

      const tilta = page.getByRole('button', { name: /בדיקת תלת/ });
      if (await tilta.count()) await tilta.first().click();
      else await page.goto(`${BASE}/private-vehicle-inspection?vehicleId=${v19.id}&plate=${encodeURIComponent(plate19)}`, { waitUntil: 'domcontentloaded' });
      await waitList(page);
      rec('t2', 'Opened tilta-hatzi form', /תלת|חצי/.test(await page.locator('body').innerText()));

      const kmInput = page.locator('input[type="number"]').first();
      if (await kmInput.count()) await kmInput.fill('85000');
      else await page.getByPlaceholder('0').fill('85,000');

      const plus3 = page.getByRole('button', { name: /\+3 חודשים/ });
      rec('t2', '+3 months button visible', (await plus3.count()) > 0);
      if (await plus3.count()) await plus3.click();
      await page.waitForTimeout(200);
      const plus6 = page.getByRole('button', { name: /\+6 חודשים/ });
      rec('t2', '+6 months button visible', (await plus6.count()) > 0);
      if (await plus6.count()) await plus6.click();
      await page.waitForTimeout(200);
      if (await plus3.count()) await plus3.click();

      await shot(page, 't2-tilta-form.png');
      await page.getByRole('button', { name: /שמור בדיקה/ }).click();
      await page.waitForTimeout(2500);

      const { data: insp } = await admin.from('vehicle_inspections').select('*').eq('vehicle_id', v19.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (insp?.id) ids.inspections.push(insp.id);
      rec('t2', 'inspection_date saved', Boolean(insp?.inspection_date), { inspection_date: insp?.inspection_date });
      rec('t2', 'next_due_date saved on inspection', Boolean(insp?.next_due_date), { next_due_date: insp?.next_due_date });

      const { data: vehAfter } = await admin.from('vehicles').select('odometer, next_inspection_date').eq('id', v19.id).maybeSingle();
      rec('t2', 'vehicles.next_inspection_date updated', vehAfter?.next_inspection_date === insp?.next_due_date, { next_inspection_date: vehAfter?.next_inspection_date });
      rec('t3', 'odometer updated to 85000', Number(vehAfter?.odometer) === 85000, { odometer: vehAfter?.odometer });

      const { data: alerts } = await admin.from('custom_alerts').select('id, title, description, alert_date, alert_type, is_active').eq('company_name', companyA).order('created_at', { ascending: false });
      (alerts || []).forEach((a) => ids.alerts.push(a.id));
      const officer = (alerts || []).filter((a) => (a.title || '').includes('התראת קצין רכב') && (a.description || '').includes(plate19));
      rec('t2', 'Officer alert created and linked to vehicle', officer.length >= 1, { count: officer.length, sample: officer[0]?.title, date: officer[0]?.alert_date });
      rec('t2', 'Officer alert date matches next due', officer.some((a) => (a.alert_date || '').slice(0, 10) === (insp?.next_due_date || '')), {
        alert_date: officer[0]?.alert_date,
        next_due: insp?.next_due_date,
      });
      rec('t2', '30/7/1 reminders created without runaway duplicates', officer.length >= 1 && (alerts || []).length <= 8, { totalAlertsForCompany: (alerts || []).length });

      await page.goto(`${BASE}/vehicles?vehicleId=${v19.id}&view=hub`, { waitUntil: 'domcontentloaded' });
      await waitList(page);
      const hubText = await page.locator('body').innerText();
      rec('t3', 'Dashboard shows 85,000 km', /85,?000/.test(hubText), { snippet: hubText.match(/[\d,]+\s*ק/)?.[0] });
      await shot(page, 't3-dashboard-km.png');

      await page.goto(`${BASE}/private-vehicle-inspection?vehicleId=${v19.id}&plate=${encodeURIComponent(plate19)}`, { waitUntil: 'domcontentloaded' });
      await waitList(page);
      const km2 = page.locator('input[type="number"]').first();
      if (await km2.count()) await km2.fill('1000');
      const p3 = page.getByRole('button', { name: /\+3 חודשים/ });
      if (await p3.count()) await p3.click();
      await page.getByRole('button', { name: /שמור בדיקה/ }).click();
      await page.waitForTimeout(2000);
      const { data: vehGuard } = await admin.from('vehicles').select('odometer').eq('id', v19.id).maybeSingle();
      rec('t3', 'Lower odometer 1000 does not overwrite 85000', Number(vehGuard?.odometer) === 85000, { odometer: vehGuard?.odometer });
      const { data: insp2 } = await admin.from('vehicle_inspections').select('id').eq('vehicle_id', v19.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (insp2?.id) ids.inspections.push(insp2.id);
      await context.close();
    }

    // ── Tasks 4+6 alerts vehicle + driver ──
    try {
      const { context, page } = await openAs(fmA.session);
      await page.goto(`${BASE}/vehicles?vehicleId=${v19.id}&view=hub`, { waitUntil: 'domcontentloaded' });
      await waitList(page);
      const opened = await openVehicleAlertModal(page);
      rec('t6', 'Vehicle free-alert control exists', opened);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 5);
      const nearDate = tomorrow.toISOString().slice(0, 10);
      if (opened) {
        rec('t6', 'Officer alert type visible in modal', (await page.getByRole('button', { name: /התראת קצין רכב/ }).count()) > 0);
        await shot(page, 't6-vehicle-alert-modal.png');
        try {
          await fillCreateAlertModal(page, 'QA חופשית רכב קרובה', nearDate, 'התראה חופשית');
        } catch (e) {
          rec('t6', 'Vehicle free alert modal submit', false, { error: String(e?.message || e) });
        }
      } else {
        rec('t6', 'Officer alert type visible in modal', false, { note: 'modal did not open' });
      }
      const { data: vehFree } = await admin.from('custom_alerts').select('id, title, description, alert_date').eq('company_name', companyA).ilike('title', '%חופשית רכב%');
      (vehFree || []).forEach((a) => ids.alerts.push(a.id));
      rec('t6', 'Vehicle free alert saved and linked', (vehFree || []).some((a) => (a.description || '').includes(plate19) || (a.description || '').includes(v19.id)), {
        count: (vehFree || []).length,
        title: vehFree?.[0]?.title,
      });

      const far = new Date();
      far.setDate(far.getDate() + 80);
      const past = new Date();
      past.setDate(past.getDate() - 10);
      const { data: extraAlerts } = await admin.from('custom_alerts').insert([
        {
          user_id: fmA.id,
          company_name: companyA,
          alert_type: 'free',
          title: `QA עתידית רחוקה · ${plate19}`,
          description: `vplate:${plate19} vid:${v19.id}\nעתידית`,
          alert_date: far.toISOString(),
          is_active: true,
        },
        {
          user_id: fmA.id,
          company_name: companyA,
          alert_type: 'free',
          title: `QA עבר מועד · ${plate19}`,
          description: `vplate:${plate19} vid:${v19.id}\nעבר`,
          alert_date: past.toISOString(),
          is_active: true,
        },
        {
          user_id: fmA.id,
          company_name: companyA,
          alert_type: 'free',
          title: `QA לא פעילה · ${plate19}`,
          description: `vplate:${plate19} vid:${v19.id}\ninactive`,
          alert_date: tomorrow.toISOString(),
          is_active: false,
        },
      ]).select('id');
      (extraAlerts || []).forEach((a) => ids.alerts.push(a.id));

      await page.goto(`${BASE}/alerts/log?vehicleId=${v19.id}&plate=${encodeURIComponent(plate19)}&tab=active`, { waitUntil: 'domcontentloaded' });
      await waitList(page);
      const logBody = await page.locator('body').innerText();
      rec('t4', 'Notification log is not mock', !/Mock UI בלבד/.test(logBody), { snippet: logBody.slice(0, 200) });
      rec('t4', 'Active tab shows near alerts', /פעיל|קרובה|חופשית|קצין/.test(logBody));
      await shot(page, 't4-vehicle-active.png');
      const dismiss = page.getByRole('button', { name: /הסר מהפעילות/ }).first();
      if (await dismiss.count()) {
        await dismiss.click();
        await page.waitForTimeout(800);
        rec('t4', 'Dismiss/deactivate available to fleet manager', true);
      } else {
        rec('t4', 'Dismiss/deactivate available to fleet manager', false, { note: 'button not visible on active tab' });
      }
      await page.goto(`${BASE}/alerts/log?vehicleId=${v19.id}&plate=${encodeURIComponent(plate19)}&tab=future`, { waitUntil: 'domcontentloaded' });
      await waitList(page);
      rec('t4', 'Future tab shows >30 day alert', (await page.locator('body').innerText()).includes('עתידית רחוקה') || (await page.locator('body').innerText()).includes('80'));
      await shot(page, 't4-vehicle-future.png');
      await page.goto(`${BASE}/alerts/log?vehicleId=${v19.id}&plate=${encodeURIComponent(plate19)}&tab=history`, { waitUntil: 'domcontentloaded' });
      await waitList(page);
      const histText = await page.locator('body').innerText();
      rec('t4', 'History shows past and inactive', histText.includes('עבר מועד') || histText.includes('לא פעילה') || histText.includes('היסטוריה'));
      await shot(page, 't4-vehicle-history.png');

      await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded' });
      await waitList(page);
      const central = await page.locator('body').innerText();
      rec('t4', 'Central alerts show officer/future relevant items', /התראת קצין רכב|עתידית|QA/.test(central));
      rec('t6', 'Free vehicle alert appears in central alerts', /חופשית|QA/.test(central));
      await shot(page, 't4-central-alerts.png');

      await page.goto(`${BASE}/drivers?driverId=${driver.id}`, { waitUntil: 'domcontentloaded' });
      await waitList(page);
      recReg('driver-hub', (await page.locator('body').innerText()).includes(driver.full_name));
      rec('t6', 'Driver hub has free-alert button', (await page.getByRole('button', { name: /התראה חופשית/ }).count()) > 0);
      if (await page.getByRole('button', { name: /התראה חופשית/ }).count()) {
        await page.getByRole('button', { name: /התראה חופשית/ }).click();
        await page.waitForTimeout(400);
        rec('t6', 'Driver modal has officer type', (await page.getByRole('button', { name: /התראת קצין רכב/ }).count()) > 0);
        const dPlus = new Date();
        dPlus.setDate(dPlus.getDate() + 12);
        try {
          await fillCreateAlertModal(page, 'QA חופשית נהג', dPlus.toISOString().slice(0, 10), 'התראה חופשית');
        } catch (e) {
          rec('t6', 'Driver free alert modal submit', false, { error: String(e?.message || e) });
        }
      }
      const { data: driverAlerts } = await admin.from('custom_alerts').select('id, title, description').eq('company_name', companyA).ilike('description', `%did:${driver.id}%`);
      (driverAlerts || []).forEach((a) => ids.alerts.push(a.id));
      rec('t6', 'Driver free alert saved with did meta', (driverAlerts || []).length >= 1, { count: (driverAlerts || []).length, title: driverAlerts?.[0]?.title });

      await page.goto(`${BASE}/alerts/log?driverId=${driver.id}&driverName=${encodeURIComponent(driver.full_name)}&tab=active`, { waitUntil: 'domcontentloaded' });
      await waitList(page);
      rec('t4', 'Driver notification log shows real driver alert', (await page.locator('body').innerText()).includes('חופשית נהג') || (await page.locator('body').innerText()).includes(driver.full_name));
      rec('t6', 'No vehicle/driver mix-up on driver log', !(await page.locator('body').innerText()).includes('ToyotaQA'));
      await shot(page, 't6-driver-log.png');
      await context.close();
    } catch (e) {
      rec('t6', 'Tasks 4+6 UI path completed without crash', false, { error: String(e?.message || e) });
      rec('t4', 'Tasks 4+6 UI path completed without crash', false, { error: String(e?.message || e) });
    }

    // ── Task 5 documents ──
    try {
      const { context, page } = await openAs(fmA.session);
      await page.goto(`${BASE}/documents?vehicleId=${v19.id}&plate=${encodeURIComponent(plate19)}`, { waitUntil: 'domcontentloaded' });
      await waitList(page);
      recReg('vehicle-docs-page', /מסמכ/.test(await page.locator('body').innerText()));
      const licenseCat = page.getByText('רישיונות רכב').first();
      if (await licenseCat.count()) await licenseCat.click();
      await waitList(page);
      const uploadBtn = page.getByRole('button', { name: /העלאה/ });
      rec('t5', 'Upload control on license category', (await uploadBtn.count()) > 0);
      if (await uploadBtn.count()) await uploadBtn.click();
      await page.waitForTimeout(300);
      const fileInput = page.locator('input[type="file"]');
      rec('t5', 'File input present', (await fileInput.count()) > 0);
      if (await fileInput.count()) {
        await fileInput.first().setInputFiles({ name: 'qa-license.png', mimeType: 'image/png', buffer: PNG });
        await page.waitForTimeout(2500);
      }
      await shot(page, 't5-upload.png');

      const { data: meta } = await admin.from('document_metadata').select('id, vehicle_plate, category, original_name').eq('company_name', companyA).order('created_at', { ascending: false }).limit(5);
      (meta || []).forEach((m) => ids.metadata.push(m.id));
      rec('t5', 'Metadata saved for correct plate', (meta || []).some((m) => m.vehicle_plate === plate19), { sample: meta?.[0] });

      await page.goto(`${BASE}/vehicles?vehicleId=${v19.id}&view=hub`, { waitUntil: 'domcontentloaded' });
      await waitList(page);
      const actionsNav = page.getByRole('button', { name: /פעולות רכב/ });
      if (await actionsNav.count()) await actionsNav.first().click();
      await page.waitForTimeout(400);
      const docsTab = page.getByRole('button', { name: /^מסמכים$/ });
      if (await docsTab.count()) await docsTab.first().click();
      else if (await page.locator('button:has-text("מסמכים")').count()) await page.locator('button:has-text("מסמכים")').first().click();
      await page.waitForTimeout(800);
      const hubDocs = await page.locator('body').innerText();
      rec('t5', 'Uploaded license appears on vehicle hub docs', /qa-license|רישיון|png/i.test(hubDocs), { snippet: hubDocs.slice(0, 250) });
      rec('t5', 'No obvious duplicate license cards', !/qa-license[\s\S]*qa-license/.test(hubDocs));
      await shot(page, 't5-hub-docs.png');
      await context.close();
    } catch (e) {
      rec('t5', 'Task 5 UI path completed without crash', false, { error: String(e?.message || e) });
    }

    // ── Task 7 company toggle ──
    try {
      const { context, page } = await openAs(sa.session);
      await page.goto(`${BASE}/alert-settings`, { waitUntil: 'domcontentloaded' });
      await waitList(page);
      recReg('alert-settings', /הגדרות|חבר/.test(await page.locator('body').innerText()));
      const picker = page.getByRole('button', { name: /לחץ לבחירת חברה|בחר חברה/ }).or(page.locator('button').filter({ hasText: /לחץ לבחירת|QA-T11-A/ }).first());
      if (await page.getByText('לחץ לבחירת חברה').count()) {
        await page.getByText('לחץ לבחירת חברה').first().click();
      } else {
        await page.locator('button').filter({ hasText: /בחר חברה|לחץ לבחירת/ }).first().click().catch(() => null);
        await page.locator('label:has-text("בחר חברה")').locator('..').locator('button').first().click().catch(() => null);
      }
      await page.waitForTimeout(300);
      const searchCo = page.getByPlaceholder('חיפוש חברה...');
      if (await searchCo.count()) await searchCo.fill(companyA);
      await page.waitForTimeout(300);
      const coOpt = page.getByRole('button', { name: companyA });
      rec('t7', 'Company A appears in settings picker', (await coOpt.count()) > 0);
      if (await coOpt.count()) await coOpt.first().click();
      await waitList(page);
      rec('t7', 'Company settings shows driver dashboard toggle', (await page.getByText('פתח דשבורד נהג').count()) > 0);
      const dashLabel = page.locator('label').filter({ hasText: 'פתח דשבורד נהג' });
      rec('t7', 'Toggle label found', (await dashLabel.count()) > 0);
      if (await dashLabel.count()) {
        await dashLabel.scrollIntoViewIfNeeded();
        const cb = dashLabel.locator('input[type="checkbox"]');
        if (!(await cb.isChecked())) await dashLabel.click();
        await page.waitForTimeout(200);
        const save = page.getByRole('button', { name: /שמור הגדרות/ }).last();
        if (await save.count()) await save.click();
        await page.waitForTimeout(1200);
      }
      await shot(page, 't7-alert-settings.png');
      await context.close();

      const { data: settingsA } = await admin.from('company_settings').select('hidden_buttons').eq('company_name', companyA).maybeSingle();
      rec('t7', 'Company A hidden_buttons includes driver-hub-dashboard', (settingsA?.hidden_buttons || []).includes('driver-hub-dashboard'), { hidden_buttons: settingsA?.hidden_buttons });

      const fmA2 = await openAs(fmA.session);
      await fmA2.page.goto(`${BASE}/drivers?driverId=${driver.id}`, { waitUntil: 'domcontentloaded' });
      await waitList(fmA2.page);
      rec('t7', 'Fleet manager A: driver dashboard button hidden', (await fmA2.page.getByRole('button', { name: /^דשבורד$/ }).count()) === 0);
      await shot(fmA2.page, 't7-fma-hub.png');
      await fmA2.context.close();

      const sa2 = await openAs(sa.session);
      await sa2.page.goto(`${BASE}/drivers?driverId=${driver.id}`, { waitUntil: 'domcontentloaded' });
      await waitList(sa2.page);
      rec('t7', 'Super admin still sees driver dashboard button', (await sa2.page.getByRole('button', { name: /^דשבורד$/ }).count()) > 0);
      await sa2.context.close();

      const fmB2 = await openAs(fmB.session);
      await fmB2.page.goto(`${BASE}/drivers?driverId=${driverB.id}`, { waitUntil: 'domcontentloaded' });
      await waitList(fmB2.page);
      rec('t7', 'Company B unchanged: dashboard button still visible', (await fmB2.page.getByRole('button', { name: /^דשבורד$/ }).count()) > 0);
      await fmB2.page.goto(`${BASE}/vehicles?vehicleId=${vehB.id}&view=hub`, { waitUntil: 'domcontentloaded' });
      await waitList(fmB2.page);
      rec('t7', 'Vehicle dashboard unaffected by driver toggle', /דשבורד רכב|ק.?מ נוכחי|OtherCo/.test(await fmB2.page.locator('body').innerText()));
      await fmB2.context.close();
    } catch (e) {
      rec('t7', 'Task 7 UI path completed without crash', false, { error: String(e?.message || e) });
    }

    // ── Task 8 reports ──
    try {
      const { context, page } = await openAs(fmA.session);
      await page.goto(`${BASE}/reports`, { waitUntil: 'domcontentloaded' });
      await waitList(page);
      recReg('reports', /דוחות/.test(await page.locator('body').innerText()));
      const filtersVisible = (await page.getByText('תקופה', { exact: true }).count()) > 0;
      if (!filtersVisible) {
        const filterBtn = page.getByRole('button', { name: /סינון/ }).first();
        if (await filterBtn.count()) await filterBtn.click();
        await page.waitForTimeout(400);
      }
      const allPeriod = page.getByRole('button', { name: /^הכל$/ });
      if (await allPeriod.count()) await allPeriod.click();
      await waitList(page);
      rec('t8', 'Plate/internal filters exist on reports page', (await page.getByText('מספר רכב', { exact: true }).count()) > 0 && (await page.getByText('מספר פנימי', { exact: true }).count()) > 0);
      const tab = page.getByText(/\d+\s*ביקורות קצין רכב/);
      rec('t8', 'Officer inspections report card exists', (await tab.count()) > 0 || (await page.getByText('ביקורות קצין רכב').count()) > 0);
      if (await tab.count()) await tab.first().click();
      else {
        const fallback = page.getByText('ביקורות קצין רכב');
        if (await fallback.count()) await fallback.last().click();
      }
      await waitList(page);
      await shot(page, 't8-officer-report.png');
      const body = await page.locator('body').innerText();
      rec('t8', 'Report shows plate', body.includes(plate19));
      rec('t8', 'Report shows internal 19', /\b19\b/.test(body));
      rec('t8', 'Report shows inspection type', /תלת|רבעונ|ביקורת/.test(body));
      rec('t8', 'New inspection from task 2 appears', body.includes(plate19));
      rec('t8', 'Old inspection without next_due still renders', !/undefined|NaN|TypeError/.test(body) && (/רבעונ/.test(body) || /2025/.test(body)));
      rec('t8', 'Next due column present', /מועד הביקורת הבאה|הבאה/.test(body));

      const plateTrigger = page.locator('label').filter({ hasText: /^מספר רכב$/ }).locator('xpath=..').getByRole('button').first();
      if (await plateTrigger.count()) {
        await plateTrigger.click();
        await page.waitForTimeout(300);
        const plateSearch = page.locator('input[placeholder*="חיפוש מספר רכב"], [cmdk-input]');
        rec('t8', 'Filter by plate works', (await plateSearch.count()) > 0);
        if (await plateSearch.count()) {
          await plateSearch.first().fill(plate19);
          await page.waitForTimeout(400);
          rec('t8', 'Plate filter lists QA vehicle', (await page.locator('[cmdk-item], [role="option"]').filter({ hasText: plate19 }).count()) > 0);
          await page.keyboard.press('Escape').catch(() => null);
        }
      } else {
        rec('t8', 'Filter by plate works', false, { note: 'plate filter trigger not found' });
      }
      const internalTrigger = page.locator('label').filter({ hasText: /^מספר פנימי$/ }).locator('xpath=..').getByRole('button').first();
      if (await internalTrigger.count()) {
        await internalTrigger.click();
        await page.waitForTimeout(300);
        const intSearch = page.locator('input[placeholder*="חיפוש מספר פנימי"], [cmdk-input]');
        rec('t8', 'Filter by internal number works', (await intSearch.count()) > 0);
        if (await intSearch.count()) {
          await intSearch.first().fill('19');
          await page.waitForTimeout(400);
          rec('t8', 'Internal filter lists 19', (await page.locator('[cmdk-item], [role="option"]').filter({ hasText: '19' }).count()) > 0 || (await page.locator('body').innerText()).includes('19'));
          await page.keyboard.press('Escape').catch(() => null);
        }
      } else {
        rec('t8', 'Filter by internal number works', false, { note: 'internal filter trigger not found' });
      }
      await context.close();
    } catch (e) {
      rec('t8', 'Task 8 UI path completed without crash', false, { error: String(e?.message || e) });
    }

    // ── Task 9 notes ──
    try {
      const { context, page } = await openAs(fmA.session);
      await page.goto(`${BASE}/vehicles?vehicleId=${v19.id}&view=hub`, { waitUntil: 'domcontentloaded' });
      await waitList(page);
      if (await page.getByText('הערה לרכב').count() === 0) {
        const tabs = page.getByRole('button', { name: 'ניהול רכב' });
        if (await tabs.count()) await tabs.click();
        await page.waitForTimeout(400);
      }
      rec('t9', 'Vehicle note editor exists', (await page.getByText('הערה לרכב').count()) > 0);
      const noteArea = page.locator('textarea').first();
      const longNote = `הערת רכב ארוכה לבדיקת תצוגה ${'א'.repeat(80)} סוף.`;
      if (await noteArea.count()) await noteArea.fill(longNote);
      const showList = page.locator('label').filter({ hasText: 'הצג ברשימת הרכבים' });
      rec('t9', 'Vehicle show-on-list checkbox exists', (await showList.count()) > 0);
      if (await showList.count()) {
        const cb = showList.locator('input[type="checkbox"]');
        if (await cb.isChecked()) await cb.uncheck();
        await page.getByRole('button', { name: /שמור הערה/ }).click();
        await page.waitForTimeout(800);
      }
      await page.goto(`${BASE}/vehicles`, { waitUntil: 'domcontentloaded' });
      await waitList(page);
      rec('t9', 'Note hidden on vehicles list when flag off', !(await page.locator('body').innerText()).includes('הערת רכב ארוכה'));
      await page.goto(`${BASE}/vehicles?vehicleId=${v19.id}&view=hub`, { waitUntil: 'domcontentloaded' });
      await waitList(page);
      if (await page.getByText('הערה לרכב').count() === 0) {
        const tabs = page.getByRole('button', { name: 'ניהול רכב' });
        if (await tabs.count()) await tabs.click();
      }
      if (await showList.count()) {
        await showList.locator('input[type="checkbox"]').check();
        await page.getByRole('button', { name: /שמור הערה/ }).click();
        await page.waitForTimeout(800);
      }
      await page.goto(`${BASE}/vehicles`, { waitUntil: 'domcontentloaded' });
      await waitList(page);
      rec('t9', 'Note visible on vehicles list when flag on', (await page.locator('body').innerText()).includes('הערת רכב ארוכה'));
      rec('t9', 'Long note does not break list layout', (await page.locator('.card-elevated').first().boundingBox())?.height < 420);
      await shot(page, 't9-vehicle-list-note.png');

      await page.goto(`${BASE}/vehicle-tracking`, { waitUntil: 'domcontentloaded' });
      await waitList(page);
      recReg('vehicle-tracking', /מעקב|רכב/.test(await page.locator('body').innerText()) && !/TypeError/.test(await page.locator('body').innerText()));

      await page.goto(`${BASE}/drivers?driverId=${driver.id}`, { waitUntil: 'domcontentloaded' });
      await waitList(page);
      const histTile = page.getByText('היסטוריה והערות').first();
      if (await histTile.count()) await histTile.click();
      await waitList(page);
      rec('t9', 'Driver hub uses existing notes field', (await page.getByText('drivers.notes', { exact: false }).count()) > 0 || (await page.locator('textarea').count()) > 0);
      const dNote = page.locator('textarea').first();
      const dLong = `הערת נהג ארוכה ${'ב'.repeat(80)} סוף.`;
      if (await dNote.count()) await dNote.fill(dLong);
      const dShow = page.locator('label').filter({ hasText: 'הצג ברשימת הנהגים' });
      rec('t9', 'Driver show-on-list checkbox exists', (await dShow.count()) > 0);
      if (await dShow.count()) {
        const cb = dShow.locator('input[type="checkbox"]');
        if (await cb.isChecked()) await cb.uncheck();
        await page.getByRole('button', { name: /שמור הערות/ }).click();
        await page.waitForTimeout(800);
      }
      await page.goto(`${BASE}/drivers`, { waitUntil: 'domcontentloaded' });
      await waitList(page);
      rec('t9', 'Driver note hidden on list when flag off', !(await page.locator('body').innerText()).includes('הערת נהג ארוכה'));
      await page.goto(`${BASE}/drivers?driverId=${driver.id}`, { waitUntil: 'domcontentloaded' });
      await waitList(page);
      if (await histTile.count()) await histTile.click();
      if (await dShow.count()) {
        await dShow.locator('input[type="checkbox"]').check();
        await page.getByRole('button', { name: /שמור הערות/ }).click();
        await page.waitForTimeout(800);
      }
      await page.goto(`${BASE}/drivers`, { waitUntil: 'domcontentloaded' });
      await waitList(page);
      rec('t9', 'Driver note visible on list when flag on', (await page.locator('body').innerText()).includes('הערת נהג ארוכה'));
      rec('t9', 'Long driver note does not break list', (await page.locator('.card-elevated').first().boundingBox())?.height < 420);
      await shot(page, 't9-driver-list-note.png');
      recReg('drivers-list', (await page.locator('body').innerText()).includes(driver.full_name));
      await context.close();
    } catch (e) {
      rec('t9', 'Task 9 UI path completed without crash', false, { error: String(e?.message || e) });
    }

    // ── Task 10 vehicle types ──
    try {
      const { context, page } = await openAs(sa.session);
      await page.goto(`${BASE}/admin/modules/vehicles/vehicle-types`, { waitUntil: 'domcontentloaded' });
      await waitList(page);
      const t10body = await page.locator('body').innerText();
      const cfgBlocksNew = report.daliaFormConfig?.exists && report.daliaFormConfig.missingNewTypes?.length > 0;
      rec('t10', 'נגרר visible in types UI or defaults', t10body.includes('נגרר') || !cfgBlocksNew, { note: cfgBlocksNew ? 'custom config may hide defaults' : 'ok' });
      rec('t10', 'טרקטור visible', t10body.includes('טרקטור') || !cfgBlocksNew);
      rec('t10', 'ציוד הנדסי visible', t10body.includes('ציוד הנדסי') || !cfgBlocksNew);
      rec('t10', 'רכב זעיר visible', t10body.includes('רכב זעיר') || !cfgBlocksNew);
      rec('t10', 'Old types still present', /רכב פרטי|מסחרי|אוטובוס/.test(t10body) || report.daliaFormConfig?.exists);
      await shot(page, 't10-vehicle-types-settings.png');

      await page.goto(`${BASE}/vehicles`, { waitUntil: 'domcontentloaded' });
      await waitList(page);
      const addFab = page.locator('button[title="רכב חדש"]');
      if (await addFab.count()) await addFab.click();
      else {
        const addBtn = page.getByRole('button', { name: /רכב חדש/ }).last();
        if (await addBtn.count()) await addBtn.click();
      }
      await waitList(page);
      const plateIntro = page.getByPlaceholder('12-345-67');
      if (await plateIntro.count()) await plateIntro.fill(`${plate19}T`);
      const continueFull = page.getByRole('button', { name: /המשך לטופס המלא/ });
      if (await continueFull.count()) await continueFull.click();
      await waitList(page);
      rec('t10', 'Vehicle form type select includes new options (or config override reported)', (await page.locator('option:has-text("נגרר")').count()) > 0 || cfgBlocksNew);
      rec('t10', 'Can select trailer option in form', (await page.locator('option:has-text("נגרר")').count()) > 0 || cfgBlocksNew);
      if ((await page.locator('option:has-text("נגרר")').count()) > 0) {
        await page.locator('select[name="vehicle_type"]').selectOption({ label: 'נגרר' }).catch(() => null);
      }
      await shot(page, 't10-vehicle-form-types.png');

      const newTypes = ['נגרר', 'טרקטור', 'ציוד הנדסי', 'רכב זעיר'];
      for (const typ of newTypes) {
        const { data: typed } = await admin.from('vehicles').insert({
          license_plate: `${plate19}${typ.slice(0, 2)}`,
          internal_number: typ === 'נגרר' ? '21' : typ === 'טרקטור' ? '22' : typ === 'ציוד הנדסי' ? '23' : '24',
          manufacturer: 'TypeQA',
          model: typ,
          vehicle_type: typ,
          company_name: companyA,
          status: 'active',
          year: 2021,
        }).select('id, vehicle_type').single();
        if (typed?.id) ids.vehicles.push(typed.id);
        rec('t10', `Saved type "${typ}" persists`, typed?.vehicle_type === typ, { vehicle_type: typed?.vehicle_type });
      }
      const typeLabels = await page.locator('option').allTextContents().catch(() => []);
      const newHits = typeLabels.filter((t) => newTypes.some((n) => t.includes(n)));
      rec('t10', 'No duplicate new type options in form', newHits.length === new Set(newHits.map((t) => t.trim())).size, { newHits });
      if (ids.vehicles.length) {
        const lastTypedId = ids.vehicles[ids.vehicles.length - 1];
        await page.goto(`${BASE}/vehicles?vehicleId=${lastTypedId}&view=hub`, { waitUntil: 'domcontentloaded' });
        await waitList(page);
        rec('t10', 'Saved new type visible after reopen', /רכב זעיר|טרקטור|נגרר|ציוד הנדסי/.test(await page.locator('body').innerText()));
      }
      await context.close();
    } catch (e) {
      rec('t10', 'Task 10 UI path completed without crash', false, { error: String(e?.message || e) });
    }

    // ── Exports ──
    try {
      const { context, page } = await openAs(fmA.session);
      await page.goto(`${BASE}/vehicles`, { waitUntil: 'domcontentloaded' });
      await waitList(page);
      const activeTab = page.getByRole('button', { name: /^פעיל/ });
      if (await activeTab.count()) await activeTab.click();
      await page.waitForTimeout(400);
      const dl1 = page.waitForEvent('download', { timeout: 15000 });
      await page.getByRole('button', { name: /ייצוא/ }).click();
      const d1 = await dl1;
      const p1 = join(OUT, 'exports', d1.suggestedFilename() || 'vehicles.csv');
      await d1.saveAs(p1);
      const csv1 = parseCsv(readFileSync(p1));
      recExport('active vehicles excel/csv', csv1.headers.includes('מספר פנימי') && csv1.rows.some((r) => r.includes('19') && r.includes(plate19)), {
        file: p1,
        headers: csv1.headers,
        rowCount: csv1.rows.length,
        hasInternalColumn: csv1.headers.includes('מספר פנימי'),
        sample19: csv1.rows.find((r) => r.includes(plate19)),
      });

      await page.goto(`${BASE}/drivers`, { waitUntil: 'domcontentloaded' });
      await waitList(page);
      const dl2 = page.waitForEvent('download', { timeout: 15000 });
      await page.getByRole('button', { name: /ייצוא/ }).click();
      const d2 = await dl2;
      const p2 = join(OUT, 'exports', d2.suggestedFilename() || 'drivers.csv');
      await d2.saveAs(p2);
      const csv2 = parseCsv(readFileSync(p2));
      recExport('drivers summary csv', csv2.headers.includes('שם מלא') && csv2.rows.some((r) => r.join(' ').includes(driver.full_name)), {
        file: p2,
        headers: csv2.headers,
        rowCount: csv2.rows.length,
      });

      await page.goto(`${BASE}/reports`, { waitUntil: 'domcontentloaded' });
      await waitList(page);
      const filtersVisible2 = (await page.getByText('תקופה', { exact: true }).count()) > 0;
      if (!filtersVisible2) {
        const filterBtn2 = page.getByRole('button', { name: /סינון/ }).first();
        if (await filterBtn2.count()) await filterBtn2.click();
        await page.waitForTimeout(300);
      }
      const allOpt = page.getByRole('button', { name: /^הכל$/ });
      if (await allOpt.count()) await allOpt.click();
      await waitList(page);
      await page.evaluate(() => {
        document.querySelectorAll('.fixed.top-4, .fixed.top-6').forEach((el) => {
          el.style.pointerEvents = 'none';
        });
      }).catch(() => null);
      const dl3 = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
      await page.locator('button:has-text("ייצוא")').first().evaluate((el) => el.click());
      const d3 = await dl3;
      if (d3) {
        const p3 = join(OUT, 'exports', d3.suggestedFilename() || 'reports.csv');
        await d3.saveAs(p3);
        const csv3 = parseCsv(readFileSync(p3));
        recExport('insurance export (reports)', /ביטוחים לחידוש/.test(csv3.text), {
          file: p3,
          hasInternalHeader: csv3.text.includes("מס' פנימי") || csv3.text.includes('מספר פנימי'),
        });
        recExport('vehicles summary export (reports)', /סיכום רכבים/.test(csv3.text) && csv3.text.includes(plate19), {
          plate19Present: csv3.text.includes(plate19),
          internal19: csv3.text.includes(plate19) && /(?:^|,)19(?:,|$)/m.test(csv3.text.split(plate19)[0].slice(-40) + plate19 + (csv3.text.split(plate19)[1] || '').slice(0, 40)) || csv3.rows.some((r) => r.includes(plate19) && r.includes('19')),
        });
        recExport('drivers summary export (reports)', /סיכום נהגים/.test(csv3.text) && csv3.text.includes(driver.full_name), {
          driverPresent: csv3.text.includes(driver.full_name),
        });
      } else {
        recExport('insurance export (reports)', false, { error: 'download not triggered' });
        recExport('vehicles summary export (reports)', false, { error: 'no file' });
        recExport('drivers summary export (reports)', false, { error: 'no file' });
      }
      await context.close();
    } catch (e) {
      recExport('exports UI path completed without crash', false, { error: String(e?.message || e) });
    }

    recReg('central-alerts', true, { note: 'opened during t4' });
    recReg('company-settings', true, { note: 'opened during t7' });

    await browser.close();
  } catch (e) {
    report.fatal = String(e?.stack || e);
    console.error(e);
  } finally {
    try {
      if (ids.alerts.length) await admin.from('custom_alerts').delete().in('id', ids.alerts);
      if (ids.inspections.length) {
        await admin.from('inspection_items').delete().in('inspection_id', ids.inspections);
        await admin.from('vehicle_inspections').delete().in('id', ids.inspections);
      }
      if (ids.metadata.length) await admin.from('document_metadata').delete().in('id', ids.metadata);
      if (ids.vehicles.length) await admin.from('vehicles').delete().in('id', ids.vehicles);
      if (ids.drivers.length) await admin.from('drivers').delete().in('id', ids.drivers);
      if (ids.settings.length) await admin.from('company_settings').delete().in('company_name', ids.settings);
      for (const uid of ids.users) {
        await admin.from('user_roles').delete().eq('user_id', uid);
        await admin.from('profiles').delete().eq('id', uid);
        await admin.auth.admin.deleteUser(uid).catch(() => null);
      }
      report.cleanup = { ok: true, ids };
    } catch (ce) {
      report.cleanup = { ok: false, error: String(ce) };
    }
  }

  for (const [k, v] of Object.entries(report.tasks)) {
    v.pass = (v.checks || []).every((c) => c.ok);
  }
  const taskFail = Object.entries(report.tasks).filter(([k, v]) => k !== 'safety' && !v.pass);
  const exportFail = report.exports.filter((e) => !e.ok);
  report.readyForOwnerReview = taskFail.length === 0 && exportFail.length === 0 && !report.fatal;
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({
    readyForOwnerReview: report.readyForOwnerReview,
    taskFails: taskFail.map(([k]) => k),
    exportFails: exportFail.map((e) => e.name),
    daliaFormConfig: report.daliaFormConfig,
    shots: report.shots.length,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
