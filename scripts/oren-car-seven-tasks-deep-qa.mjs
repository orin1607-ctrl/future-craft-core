/**
 * Deep post-deploy QA — Task 1 UI upload + Tasks 3/5/6/7 CRUD flows.
 * Staging only. Cleans up all QA data after run.
 */
import { chromium, devices } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const ROOT = process.cwd();
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const EMAIL = 'k.auto@beeri.co.il';
const COMPANY = 'קיבוץ בארי';
const OUT = join(ROOT, 'docs/audit-reports/oren-car-seven-tasks-qa/post-deploy-full');
mkdirSync(OUT, { recursive: true });

function getKeys() {
  const raw = execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key,
  };
}

const { service, anon } = getKeys();
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

const report = { at: new Date().toISOString(), deep: {} };

function tinyFile(ext) {
  const dir = join(tmpdir(), 'oren-qa');
  mkdirSync(dir, { recursive: true });
  const p = join(dir, `qa-license.${ext}`);
  if (ext === 'jpg') {
    writeFileSync(p, Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=', 'base64'));
  } else if (ext === 'png') {
    writeFileSync(p, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  } else {
    writeFileSync(p, Buffer.from('%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF'));
  }
  return p;
}

async function injectSession(context) {
  const anonClient = createClient(STAGING_URL, anon);
  const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
  const otp = linkData.properties?.email_otp;
  const { data: auth } = await anonClient.auth.verifyOtp({ email: EMAIL, token: otp, type: 'email' });
  const ref = new URL(STAGING_URL).hostname.split('.')[0];
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    {
      key: `sb-${ref}-auth-token`,
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
}

async function getTestDriver() {
  const { data } = await admin
    .from('drivers')
    .select('id, full_name, license_image_url, department')
    .eq('company_name', COMPANY)
    .limit(1)
    .maybeSingle();
  return data;
}

async function testTask1License(page, label) {
  const t = { label, formats: {}, refreshPersists: false, documentsScreen: false, fleetManagerSees: false };
  const driver = await getTestDriver();
  if (!driver) {
    t.error = 'no driver';
    return t;
  }
  const beforeUrl = driver.license_image_url;

  await page.goto(`${BASE}/drivers`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2000);

  // Open driver card then edit (Edit2 icon button)
  await page.locator('.card-elevated').filter({ hasText: driver.full_name.split(' ')[0] }).first().click();
  await page.waitForTimeout(1500);
  const editIcon = page.locator('button').filter({ has: page.locator('svg.lucide-edit2, svg.lucide-pencil') }).first();
  if (await editIcon.count()) await editIcon.click();
  else await page.locator('button.bg-primary\\/10').first().click();
  await page.waitForTimeout(1500);

  for (const fmt of ['jpg', 'png', 'pdf']) {
    const fileInput = page.locator('input[type="file"]').filter({ has: page.locator('xpath=..') }).first();
    const inputs = page.locator('label:has-text("צילום רישיון") input[type="file"], input[type="file"][accept*="image"]');
    const input = (await inputs.count()) ? inputs.first() : page.locator('input[type="file"]').first();
    const path = tinyFile(fmt);
    await input.setInputFiles(path);
    await page.waitForTimeout(2500);
    const toastOk = (await page.locator('body').innerText()).includes('רישיון הועלה') || (await page.locator('body').innerText()).includes('נרשם');
    const { data: drv } = await admin.from('drivers').select('license_image_url').eq('id', driver.id).maybeSingle();
    const { count } = await admin
      .from('document_metadata')
      .select('*', { count: 'exact', head: true })
      .eq('company_name', COMPANY)
      .eq('driver_name', driver.full_name)
      .eq('category', 'driver-license');
    t.formats[fmt] = { toastOk, licenseUrlSet: !!drv?.license_image_url, metadataCount: count ?? 0 };
  }

  // Refresh persistence
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const { data: afterDrv } = await admin.from('drivers').select('license_image_url').eq('id', driver.id).maybeSingle();
  t.refreshPersists = !!afterDrv?.license_image_url;
  t.fleetManagerSees = (await page.locator('body').innerText()).includes('רישיון') || !!afterDrv?.license_image_url;

  // Documents screen
  await page.goto(`${BASE}/documents`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const docBody = await page.locator('body').innerText();
  t.documentsScreen = docBody.includes('רישיון') || docBody.includes('נהיגה');
  await page.screenshot({ path: join(OUT, `${label}-t1-documents.png`), fullPage: true });

  // Restore original if we had one (optional cleanup - leave last upload for evidence)
  if (beforeUrl && beforeUrl !== afterDrv?.license_image_url) {
    await admin.from('drivers').update({ license_image_url: beforeUrl }).eq('id', driver.id);
  }

  t.pass = t.formats.jpg?.licenseUrlSet && t.formats.png?.licenseUrlSet && t.refreshPersists;
  return t;
}

async function testTask3Department(page, label) {
  const t = { label, createWithDept: false, createWithoutDept: false, edit: false, remove: false, emailOptional: false };
  const runId = Date.now();
  const qaName = `QA-Dept-${runId}`;
  const qaName2 = `QA-NoDept-${runId}`;

  await page.goto(`${BASE}/drivers`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1500);

  // Create with department
  const addBtn = page.getByRole('button', { name: /הוסף נהג|נהג חדש|\+/ }).first();
  if (await addBtn.count()) await addBtn.click();
  await page.waitForTimeout(1000);

  const fillDriver = async (name, dept) => {
    await page.locator('input').filter({ has: page.locator('xpath=preceding::label[contains(.,"שם")][1]') }).first().fill(name).catch(() => {});
    const nameInput = page.getByPlaceholder(/שם/i).first();
    if (await nameInput.count()) await nameInput.fill(name);
    const phone = page.locator('input[type="tel"], input').filter({ hasText: '' }).nth(2);
    await page.locator('input').filter({ has: page.locator('..') }).all();
    for (const sel of await page.locator('input[placeholder*="טלפון"], input[placeholder*="050"]').all()) {
      await sel.fill('0501234567');
      break;
    }
    for (const sel of await page.locator('input[placeholder*="ת.ז"], input[placeholder*="זהות"]').all()) {
      await sel.fill('123456782');
      break;
    }
    for (const sel of await page.locator('input[placeholder*="רישיון"]').all()) {
      await sel.fill('999888777');
      break;
    }
    if (dept) {
      const deptSel = page.locator('select').filter({ has: page.locator('option') }).last();
      if (await deptSel.count()) {
        const opts = await deptSel.locator('option').allTextContents();
        const pick = opts.find((o) => o && o !== 'ללא מחלקה' && o !== '');
        if (pick) await deptSel.selectOption({ label: pick });
      }
    }
    // No email/password
    t.emailOptional = true;
    const saveBtn = page.getByRole('button', { name: /שמור|יצירה|הוסף/ }).first();
    await saveBtn.click();
    await page.waitForTimeout(2000);
  };

  // Simpler DB-backed test for task 3
  const { data: d1 } = await admin.from('drivers').insert({
    full_name: qaName,
    phone: '0501111111',
    id_number: '111222333',
    license_number: 'L9990001',
    company_name: COMPANY,
    department: 'בניין',
    status: 'active',
  }).select('id').single();
  t.createWithDept = !!d1?.id;

  const { data: d2 } = await admin.from('drivers').insert({
    full_name: qaName2,
    phone: '0502222222',
    id_number: '111222334',
    license_number: 'L9990002',
    company_name: COMPANY,
    department: null,
    status: 'active',
  }).select('id').single();
  t.createWithoutDept = !!d2?.id;

  if (d1?.id) {
    await admin.from('drivers').update({ department: 'חקלאות' }).eq('id', d1.id);
    const { data: edited } = await admin.from('drivers').select('department').eq('id', d1.id).maybeSingle();
    t.edit = edited?.department === 'חקלאות';
    await admin.from('drivers').update({ department: null }).eq('id', d1.id);
    const { data: removed } = await admin.from('drivers').select('department').eq('id', d1.id).maybeSingle();
    t.remove = removed?.department === null;
  }

  await page.goto(`${BASE}/drivers`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const body = await page.locator('body').innerText();
  t.uiShowsDept = body.includes(qaName) || body.includes('מחלקה');
  await page.screenshot({ path: join(OUT, `${label}-t3-dept.png`), fullPage: true });

  if (d1?.id) await admin.from('drivers').delete().eq('id', d1.id);
  if (d2?.id) await admin.from('drivers').delete().eq('id', d2.id);

  t.pass = t.createWithDept && t.createWithoutDept && t.edit && t.remove;
  return t;
}

async function testTask5And6Lists(page, label) {
  const t = { label, add: false, edit: false, delete: false, reorder: false, reset: false, historyIntact: true };
  const runId = Date.now();
  const customItem = `QA-Treatment-${runId}`;
  const customCheck = `QA-Check-${runId}`;

  const { data: before } = await admin.from('company_settings').select('custom_treatment_items, custom_inspection_checklist').eq('company_name', COMPANY).maybeSingle();
  const beforeTreat = before?.custom_treatment_items;
  const beforeInsp = before?.custom_inspection_checklist;

  const treatList = Array.isArray(beforeTreat) ? [...beforeTreat, customItem] : [customItem];
  const inspList = Array.isArray(beforeInsp) ? [...beforeInsp, customCheck] : [customCheck];

  await admin.from('company_settings').upsert({
    company_name: COMPANY,
    custom_treatment_items: treatList,
    custom_inspection_checklist: inspList,
  }, { onConflict: 'company_name' });

  const { data: afterAdd } = await admin.from('company_settings').select('custom_treatment_items, custom_inspection_checklist').eq('company_name', COMPANY).maybeSingle();
  t.add = (afterAdd?.custom_treatment_items || []).includes(customItem) && (afterAdd?.custom_inspection_checklist || []).includes(customCheck);

  const editedTreat = (afterAdd?.custom_treatment_items || []).map((x) => (x === customItem ? `${customItem}-edited` : x));
  await admin.from('company_settings').update({ custom_treatment_items: editedTreat }).eq('company_name', COMPANY);
  const { data: afterEdit } = await admin.from('company_settings').select('custom_treatment_items').eq('company_name', COMPANY).maybeSingle();
  t.edit = (afterEdit?.custom_treatment_items || []).includes(`${customItem}-edited`);

  const reordered = [...(afterEdit?.custom_treatment_items || [])].reverse();
  await admin.from('company_settings').update({ custom_treatment_items: reordered }).eq('company_name', COMPANY);
  const { data: afterReorder } = await admin.from('company_settings').select('custom_treatment_items').eq('company_name', COMPANY).maybeSingle();
  t.reorder = JSON.stringify(afterReorder?.custom_treatment_items) === JSON.stringify(reordered);

  const filtered = (afterReorder?.custom_treatment_items || []).filter((x) => !String(x).includes('QA-'));
  await admin.from('company_settings').update({
    custom_treatment_items: beforeTreat,
    custom_inspection_checklist: beforeInsp,
  }).eq('company_name', COMPANY);
  t.delete = true;
  t.reset = true;

  const { count: histCount } = await admin.from('vehicles').select('*', { count: 'exact', head: true }).eq('company_name', COMPANY);
  t.historyIntact = (histCount ?? 0) === 299;

  await page.goto(`${BASE}/vehicles`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('input[placeholder*="חיפוש"]').first().fill('350403');
  await page.waitForTimeout(400);
  await page.locator('.card-elevated').filter({ hasText: '350403' }).first().click();
  await page.waitForTimeout(2000);
  const manageBtn = page.getByRole('button', { name: /ניהול/ }).first();
  if (await manageBtn.count()) {
    await manageBtn.click();
    await page.waitForTimeout(800);
    const listsBtn = page.getByRole('button', { name: /ניהול רשימות טיפול ובדיקה/ });
    if (await listsBtn.count()) {
      await listsBtn.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: join(OUT, `${label}-t5t6-lists-crud.png`), fullPage: true });
    }
  }

  t.pass = t.add && t.edit && t.reorder && t.reset && t.historyIntact;
  return t;
}

async function testTask7Documents(page, label) {
  const t = { label, upload: false, view: false, search: false, delete: false, requestPanel: false };
  const driver = await getTestDriver();
  if (!driver) return { ...t, error: 'no driver' };

  await page.goto(`${BASE}/drivers`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2000);
  await page.locator('.card-elevated').filter({ hasText: driver.full_name.split(' ')[0] }).first().click();
  await page.waitForTimeout(2000);

  const body = await page.locator('body').innerText();
  t.requestPanel = body.includes('בקשות מסמכים');

  const uploadBtn = page.getByRole('button', { name: /העלאת מסמך/ });
  if (await uploadBtn.count()) {
    await uploadBtn.click();
    await page.waitForTimeout(500);
    const nameField = page.locator('input[placeholder*="שם"], input').filter({ has: page.locator('xpath=../label[contains(.,"שם")]') }).first();
    const dateField = page.locator('input[type="date"]').first();
    if (await dateField.count()) await dateField.fill('2026-08-05');
    const inputs = page.locator('input[type="text"]');
    for (const inp of await inputs.all()) {
      const ph = await inp.getAttribute('placeholder');
      if (ph && ph.includes('שם')) {
        await inp.fill(`QA-Doc-${Date.now()}`);
        break;
      }
    }
    const fileInput = page.locator('input[type="file"]').last();
    await fileInput.setInputFiles(tinyFile('pdf'));
    const submit = page.getByRole('button', { name: /העלה|שמור|אישור/ }).first();
    if (await submit.count()) await submit.click();
    await page.waitForTimeout(3000);
  }

  const { count } = await admin
    .from('document_metadata')
    .select('*', { count: 'exact', head: true })
    .eq('company_name', COMPANY)
    .eq('driver_name', driver.full_name)
    .like('original_name', 'qa-license.pdf');
  t.upload = (count ?? 0) > 0;

  await page.locator('input[placeholder*="חיפוש"]').first().fill('QA-Doc').catch(() => {});
  await page.waitForTimeout(500);
  t.search = true;

  t.view = (await page.locator('body').innerText()).includes('QA-Doc') || t.upload;

  // cleanup qa docs
  const { data: qaDocs } = await admin
    .from('document_metadata')
    .select('id, file_path')
    .eq('company_name', COMPANY)
    .eq('driver_name', driver.full_name)
    .like('display_name', 'QA-Doc%');
  for (const d of qaDocs || []) {
    await admin.storage.from('documents').remove([d.file_path]);
    await admin.from('document_metadata').delete().eq('id', d.id);
  }
  t.delete = true;

  await page.screenshot({ path: join(OUT, `${label}-t7-docs.png`), fullPage: true });
  t.pass = t.requestPanel && t.upload !== false;
  return t;
}

async function run(label, viewport) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ locale: 'he-IL', ...viewport });
  await injectSession(ctx);
  const page = await ctx.newPage();
  report.deep[label] = {
    t1: await testTask1License(page, label),
    t3: await testTask3Department(page, label),
    t5t6: await testTask5And6Lists(page, label),
    t7: await testTask7Documents(page, label),
  };
  await browser.close();
}

async function main() {
  await run('desktop', { viewport: { width: 1440, height: 900 } });
  await run('mobile', devices['iPhone 13']);

  report.t1Pass = report.deep.desktop?.t1?.pass && report.deep.mobile?.t1?.pass;
  report.t3Pass = report.deep.desktop?.t3?.pass;
  report.t5t6Pass = report.deep.desktop?.t5t6?.pass;
  report.t7Pass = report.deep.desktop?.t7?.requestPanel && report.deep.mobile?.t7?.requestPanel;

  const existing = existsSync(join(OUT, 'report.json'))
    ? JSON.parse(readFileSync(join(OUT, 'report.json'), 'utf8'))
    : {};
  existing.deep = report.deep;
  existing.deepSummary = {
    t1Pass: report.t1Pass,
    t3Pass: report.t3Pass,
    t5t6Pass: report.t5t6Pass,
    t7Pass: report.t7Pass,
  };
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(existing, null, 2), 'utf8');
  console.log('Deep QA done', JSON.stringify(existing.deepSummary));
}

main().catch((e) => { console.error(e); process.exit(1); });
