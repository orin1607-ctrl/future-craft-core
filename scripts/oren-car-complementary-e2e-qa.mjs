/**
 * Oren Car complementary E2E QA — STAGING ONLY.
 *
 * Creates only uniquely named ephemeral data and removes it in finally.
 * It never contacts Production/Hostinger and never sends WhatsApp/SMS.
 *
 * Usage: node scripts/oren-car-complementary-e2e-qa.mjs
 */
import { chromium, devices } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT_DIR = join(process.cwd(), 'docs/audit-reports/oren-car-alerts-perf-and-e2e');
const REPORT_PATH = join(OUT_DIR, 'complementary-e2e-report.json');
const FUNCTION_URL = `${STAGING_URL}/functions/v1/document-request`;
const DAY = 86_400_000;

if (STAGING_REF !== 'usfeoerkpcafxxlyuldl' || BASE !== 'https://orin1607-ctrl.github.io/future-craft-core') {
  throw new Error('Safety stop: this script is hard-locked to Oren Car Staging');
}
mkdirSync(OUT_DIR, { recursive: true });

const report = {
  at: new Date().toISOString(),
  scope: 'Staging ONLY',
  stagingRef: STAGING_REF,
  base: BASE,
  productionTouched: false,
  hostingerTouched: false,
  realMessagesSent: false,
  tests: [],
  consoleErrors: [],
  networkErrors: [],
  cleanup: { attempted: false, ok: false, errors: [] },
  ok: false,
};

function record(id, name, ok, detail = {}) {
  report.tests.push({ id, name, ok: Boolean(ok), ...detail });
  console.log(ok ? 'PASS' : 'FAIL', `[${id}]`, name, detail.note || detail.error || '');
}

async function check(id, name, fn) {
  try {
    const value = await fn();
    const normalized =
      typeof value === 'boolean'
        ? { ok: value }
        : value && typeof value === 'object' && Object.hasOwn(value, 'ok')
          ? value
          : { ok: Boolean(value), value };
    record(id, name, normalized.ok, Object.fromEntries(Object.entries(normalized).filter(([k]) => k !== 'ok')));
    return normalized;
  } catch (error) {
    record(id, name, false, { error: error instanceof Error ? error.message : String(error) });
    return { ok: false, error: String(error) };
  }
}

function must(data, error, label) {
  if (error) throw new Error(`${label}: ${error.message}`);
  if (!data) throw new Error(`${label}: no data returned`);
  return data;
}

function addYears(isoDate, years) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

async function poll(fn, { timeoutMs = 15_000, intervalMs = 400 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return last;
}

function sessionValue(session) {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  };
}

function loadKeys() {
  const raw = execSync(
    `npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`,
    { encoding: 'utf8' },
  );
  const keys = JSON.parse(raw);
  const service =
    keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key ||
    keys.find((k) => k.name === 'service_role')?.api_key;
  const anon =
    keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key ||
    keys.find((k) => k.name === 'anon')?.api_key;
  if (!service || !anon) throw new Error('Could not load Staging service_role/anon keys');
  return { service, anon };
}

async function edgeInvoke(anonKey, body, bearer) {
  const isForm = body instanceof FormData;
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
    },
    body: isForm ? body : JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.success === false) {
    throw new Error(json.error || `document-request HTTP ${response.status}`);
  }
  return json;
}

async function main() {
  const keys = loadKeys();
  const admin = createClient(STAGING_URL, keys.service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(STAGING_URL, keys.anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const companyName = `QA Complementary ${runId}`;
  const password = `Qa!${Date.now()}x`;
  const issueDate = new Date().toISOString().slice(0, 10);
  const storagePaths = [];
  const userIds = [];
  const rowIds = {
    driver: null,
    vehicle: null,
    accident: null,
    declaration: null,
    exam: null,
    request: null,
  };
  let browser;

  try {
    record('safety-scope', 'Hard-locked to Staging ref and GitHub Pages base', true, {
      stagingRef: STAGING_REF,
      base: BASE,
    });

    await admin.from('company_settings').insert({
      company_name: companyName,
      show_insurance_attention: true,
      show_gaps_attention: true,
      show_insurance_attention_red: true,
      show_gaps_attention_red: true,
    }).throwOnError();

    // Kept explicit so authentication errors carry the correct operation name.
    const adminCreatedResult = await admin.auth.admin.createUser({
      email: `qa-complementary-admin-${runId}@staging-e2e.local`,
      password,
      email_confirm: true,
    });
    const adminUser = must(adminCreatedResult.data?.user, adminCreatedResult.error, 'create super_admin');
    userIds.push(adminUser.id);
    const driverCreatedResult = await admin.auth.admin.createUser({
      email: `qa-complementary-driver-${runId}@staging-e2e.local`,
      password,
      email_confirm: true,
    });
    const driverUser = must(driverCreatedResult.data?.user, driverCreatedResult.error, 'create driver user');
    userIds.push(driverUser.id);

    for (const [user, role, fullName] of [
      [adminUser, 'super_admin', 'QA Complementary Admin'],
      [driverUser, 'driver', 'QA Complementary Driver User'],
    ]) {
      await admin.from('profiles').upsert({
        id: user.id,
        full_name: fullName,
        company_name: companyName,
        is_active: true,
        approval_status: 'approved',
        two_factor_approved: true,
      }).throwOnError();
      await admin.from('user_roles').delete().eq('user_id', user.id);
      await admin.from('user_roles').insert({ user_id: user.id, role }).throwOnError();
    }

    const driverName = `QA Complementary Driver ${runId}`;
    const driverResult = await admin.from('drivers').insert({
        full_name: driverName,
        company_name: companyName,
        id_number: `8${String(Date.now()).slice(-8)}`,
        license_number: `QC${String(Date.now()).slice(-7)}`,
        phone: '0500000123',
        email: `driver-${runId}@staging-e2e.local`,
        status: 'active',
        notes: `initial ${runId}`,
      }).select('*').single();
    const seededDriver = must(driverResult.data, driverResult.error, 'read seeded driver');
    rowIds.driver = seededDriver.id;

    const plate = `QC${String(Date.now()).slice(-6)}`;
    const vehicleResult = await admin.from('vehicles').insert({
      license_plate: plate,
      company_name: companyName,
      manufacturer: 'QA',
      model: 'Complementary',
      status: 'active',
      assigned_driver_id: seededDriver.id,
    }).select('*').single();
    const vehicle = must(vehicleResult.data, vehicleResult.error, 'create vehicle');
    rowIds.vehicle = vehicle.id;
    record('seed-ephemeral', 'Ephemeral company, users, driver and vehicle created', true, {
      companyName,
      driverId: seededDriver.id,
      vehicleId: vehicle.id,
    });

    const adminSignIn = await anon.auth.signInWithPassword({ email: adminUser.email, password });
    const adminAuth = must(adminSignIn.data?.session, adminSignIn.error, 'admin sign in');
    const driverSignIn = await createClient(STAGING_URL, keys.anon, {
      auth: { autoRefreshToken: false, persistSession: false },
    }).auth.signInWithPassword({ email: driverUser.email, password });
    const driverAuth = must(driverSignIn.data?.session, driverSignIn.error, 'driver sign in');

    browser = await chromium.launch({ headless: true });
    const storageKey = `sb-${STAGING_REF}-auth-token`;

    async function newSessionPage(session, contextOptions = { viewport: { width: 1440, height: 1000 } }) {
      const context = await browser.newContext({ locale: 'he-IL', ...contextOptions });
      await context.addInitScript(
        ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
        { key: storageKey, value: sessionValue(session) },
      );
      const page = await context.newPage();
      page.on('console', (msg) => {
        if (msg.type() === 'error' && !/favicon|React DevTools/i.test(msg.text())) {
          report.consoleErrors.push(msg.text().slice(0, 500));
        }
      });
      page.on('response', (res) => {
        if (res.url().includes(STAGING_REF) && res.status() >= 500) {
          report.networkErrors.push({ status: res.status(), url: res.url().split('?')[0] });
        }
      });
      return { context, page };
    }

    const { context: adminContext, page } = await newSessionPage(adminAuth);
    await page.goto(`${BASE}/drivers?driverId=${seededDriver.id}&section=documents`, {
      waitUntil: 'networkidle',
      timeout: 120_000,
    });
    await page.waitForTimeout(1_000);

    const pdf = {
      name: `qa-${runId}.pdf`,
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'),
    };

    async function uploadViaDriverHub(documentTypeKey, fileName) {
      await page.goto(`${BASE}/drivers?driverId=${seededDriver.id}&section=documents`, {
        waitUntil: 'networkidle',
        timeout: 120_000,
      });
      await page.getByText('מסמכים ורישיון', { exact: false }).first().waitFor({ timeout: 30_000 });
      await page.getByRole('button', { name: /^העלה מסמך$/ }).first().click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ state: 'visible', timeout: 20_000 });
      const select = dialog.locator('select').first();
      await select.selectOption(documentTypeKey);
      const dates = dialog.locator('input[type="date"]');
      if (await dates.count()) await dates.first().fill(issueDate);
      const fileInputs = dialog.locator('input[type="file"]');
      await fileInputs.first().setInputFiles({ ...pdf, name: fileName });
      await dialog.getByRole('button', { name: /^העלה מסמך$/ }).click();
      await dialog.waitFor({ state: 'hidden', timeout: 45_000 });
      const version = await poll(async () => {
        const result = await admin
          .from('document_versions')
          .select('*')
          .eq('entity_id', seededDriver.id)
          .eq('document_type_key', documentTypeKey)
          .eq('original_name', fileName)
          .order('version_no', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (result.error) throw new Error(`read ${documentTypeKey} upload: ${result.error.message}`);
        return result.data;
      });
      if (!version) throw new Error(`read ${documentTypeKey} upload: row not visible after 15s`);
      storagePaths.push(version.file_path);
      await page.waitForTimeout(600);
      return version;
    }

    const inputAttrs = await check('document-file-gallery-inputs', 'File and camera/gallery inputs expose accept/capture', async () => {
      await page.getByRole('button', { name: /^העלה מסמך$/ }).first().click();
      const dialog = page.getByRole('dialog');
      const inputs = dialog.locator('input[type="file"]');
      const count = await inputs.count();
      const attrs = [];
      for (let i = 0; i < count; i++) {
        attrs.push({
          accept: await inputs.nth(i).getAttribute('accept'),
          capture: await inputs.nth(i).getAttribute('capture'),
        });
      }
      await page.keyboard.press('Escape');
      return {
        ok: count >= 2 && attrs.some((a) => a.accept?.includes('application/pdf')) &&
          attrs.some((a) => a.accept === 'image/*' && a.capture === 'environment'),
        count,
        attrs,
      };
    });
    void inputAttrs;

    await check('document-ui-upload', 'Real tiny PDF upload through DriverHub UI', async () => {
      const version = await uploadViaDriverHub('traffic_info', `traffic-info-v1-${runId}.pdf`);
      return {
        ok: version.source === 'manager_upload' && version.original_name.includes('traffic-info-v1'),
        versionId: version.id,
        source: version.source,
      };
    });

    await check('document-preview', 'Uploaded PDF has working preview UI', async () => {
      const title = page.getByText(`traffic-info-v1-${runId}.pdf`, { exact: true }).first();
      const card = title.locator('xpath=ancestor::div[contains(@class,"card-elevated")]').first();
      const preview = card.getByTitle('צפייה');
      const supported = await preview.isVisible().catch(() => false);
      if (supported) await preview.click();
      const previewVisible = supported && await page.getByRole('dialog').isVisible().catch(() => false);
      if (previewVisible) await page.keyboard.press('Escape');
      return { ok: supported && previewVisible, supported, previewVisible };
    });

    const trafficV2 = await check('document-version-history', 'Second same-type upload creates visible version history', async () => {
      const version = await uploadViaDriverHub('traffic_info', `traffic-info-v2-${runId}.pdf`);
      const rows = (await admin.from('document_versions').select('id,version_no,is_current,source')
        .eq('entity_id', seededDriver.id).eq('document_type_key', 'traffic_info')
        .order('version_no')).data || [];
      const historySelect = page.locator('select').filter({ has: page.locator('option[value="history"]') }).first();
      await historySelect.selectOption('all');
      await page.waitForTimeout(300);
      const uiV1 = await page.getByText(`traffic-info-v1-${runId}.pdf`, { exact: true }).isVisible().catch(() => false);
      const uiV2 = await page.getByText(`traffic-info-v2-${runId}.pdf`, { exact: true }).isVisible().catch(() => false);
      return {
        ok: rows.length === 2 && version.version_no === 2 && uiV1 && uiV2,
        versionId: version.id,
        rows,
        currentFlags: rows.map((row) => ({ version_no: row.version_no, is_current: row.is_current })),
        uiV1,
        uiV2,
      };
    });

    await check('traffic-info-expiry', 'traffic_info manager_upload has issue +3 years in DB and UI', async () => {
      const id = trafficV2.versionId;
      const dbResult = id
        ? await admin.from('document_versions').select('*').eq('id', id).single()
        : await admin.from('document_versions').select('*').eq('entity_id', seededDriver.id)
          .eq('document_type_key', 'traffic_info').order('version_no', { ascending: false }).limit(1).single();
      const row = must(dbResult.data, dbResult.error, 'traffic_info current');
      const expected = addYears(issueDate, 3);
      const formatted = await page.evaluate(
        (date) => new Date(`${date}T12:00:00`).toLocaleDateString('he-IL'),
        expected,
      );
      const ui = (await page.locator('body').innerText()).includes(formatted);
      return { ok: row.expiry_date === expected && row.source === 'manager_upload' && ui, expected, formatted, row, ui };
    });

    await check('health-declaration-hub', 'Hub health_declaration has +5 years expiry in DB and UI', async () => {
      const row = await uploadViaDriverHub('health_declaration', `health-${runId}.pdf`);
      const expected = addYears(issueDate, 5);
      const formatted = await page.evaluate(
        (date) => new Date(`${date}T12:00:00`).toLocaleDateString('he-IL'),
        expected,
      );
      const body = await page.locator('body').innerText();
      return {
        ok: row.expiry_date === expected && row.source === 'manager_upload' &&
          body.includes('הצהרת בריאות') && body.includes(formatted),
        expected,
        formatted,
        expiry: row.expiry_date,
        source: row.source,
      };
    });

    let requestToken;
    await check('public-document-request-create', 'Admin edge create returns raw token while DB stores token_hash', async () => {
      const created = await edgeInvoke(keys.anon, {
        action: 'create',
        document_type_key: 'general_document',
        entity_type: 'driver',
        entity_id: seededDriver.id,
        entity_label: driverName,
        recipient_name: driverName,
        recipient_phone: seededDriver.phone,
        channel: 'link',
        notes: `QA ${runId}`,
        expires_hours: 1,
        public_app_origin: BASE,
      }, adminAuth.access_token);
      rowIds.request = created.request_id;
      requestToken = created.token;
      report.documentRequest = {
        requestId: created.request_id,
        token: '[redacted from report]',
        uploadUrl: `${BASE}/upload-request?t=[redacted]`,
      };
      const dbResult = await admin.from('document_requests')
        .select('id,status,token_hash')
        .eq('id', created.request_id)
        .single();
      const db = must(dbResult.data, dbResult.error, 'read document request');
      return {
        ok: Boolean(created.token && created.upload_url && db.token_hash),
        requestId: created.request_id,
        status: db.status,
        tokenHashPresent: Boolean(db.token_hash),
      };
    });

    const requestDb = await admin.from('document_requests').select('id,status,token_hash')
      .eq('id', rowIds.request).single();
    record(
      'public-document-request-token-hash',
      'document_requests uses token_hash and no raw token field',
      Boolean(requestToken && requestDb.data?.token_hash),
      { requestId: rowIds.request, tokenHashPresent: Boolean(requestDb.data?.token_hash) },
    );

    await check('public-document-request-flow', 'Public request opens, uploads, transitions, and approves safely', async () => {
      const publicContext = await browser.newContext({ locale: 'he-IL', viewport: { width: 430, height: 850 } });
      const publicPage = await publicContext.newPage();
      await publicPage.goto(`${BASE}/upload-request?token=${encodeURIComponent(requestToken)}`, {
        waitUntil: 'networkidle',
        timeout: 120_000,
      });
      const opened = await admin.from('document_requests').select('status').eq('id', rowIds.request).single();
      const input = publicPage.locator('input[type="file"]');
      await input.setInputFiles({ ...pdf, name: `public-request-${runId}.pdf` });
      await publicPage.getByRole('button', { name: /^העלה מסמך$/ }).click();
      await publicPage.getByText('המסמך התקבל').waitFor({ timeout: 45_000 });
      const uploaded = await admin.from('document_requests').select('status').eq('id', rowIds.request).single();
      let finalStatus = uploaded.data?.status;
      let approveSupported = ['pending_approval', 'uploaded'].includes(finalStatus);
      let approvalError = null;
      if (approveSupported) {
        try {
          const approved = await edgeInvoke(keys.anon, {
            action: 'approve',
            request_id: rowIds.request,
            note: `QA approval ${runId}`,
          }, adminAuth.access_token);
          finalStatus = approved.status;
        } catch (error) {
          approvalError = error instanceof Error ? error.message : String(error);
        }
      }
      const versions = (await admin.from('document_versions').select('id,file_path,request_id')
        .eq('request_id', rowIds.request)).data || [];
      for (const v of versions) if (v.file_path) storagePaths.push(v.file_path);
      await publicContext.close();
      return {
        ok: ['opened', 'created', 'sent'].includes(opened.data?.status) &&
          ['uploaded', 'pending_approval', 'approved'].includes(uploaded.data?.status) &&
          (!approveSupported || finalStatus === 'approved') && versions.length > 0,
        opened: opened.data?.status,
        uploaded: uploaded.data?.status,
        finalStatus,
        approveSupported,
        approvalError,
      };
    });

    await check('message-uri-construction', 'WhatsApp and SMS URIs are constructed without sending', async () => {
      const normalized = seededDriver.phone.replace(/^0/, '972');
      const signUrl = `${BASE}/sign-declaration?token=qa-token`;
      const wa = `https://wa.me/${normalized}?text=${encodeURIComponent(`QA ${signUrl}`)}`;
      const sms = `sms:${seededDriver.phone}?body=${encodeURIComponent(`QA ${BASE}/take-exam?t=qa-token`)}`;
      return {
        ok: /^https:\/\/wa\.me\/9725\d{8}\?text=/.test(wa) && /^sms:050\d{7}\?body=/.test(sms),
        wa,
        sms,
        note: 'URI strings verified only; no navigation/send performed',
      };
    });

    await check('driver-declaration-sign', 'Token declaration accepts minimal canvas signature and becomes signed', async () => {
      const token = randomUUID();
      const inserted = await admin.from('driver_declarations').insert({
        driver_id: seededDriver.id,
        driver_name: driverName,
        id_number: seededDriver.id_number,
        license_number: seededDriver.license_number,
        company_name: companyName,
        declaration_text: `QA declaration ${runId}`,
        status: 'pending',
        token,
        created_by: adminUser.id,
      }).select('*').single();
      const declaration = must(inserted.data, inserted.error, 'insert declaration');
      rowIds.declaration = declaration.id;
      const publicContext = await browser.newContext({ viewport: { width: 430, height: 850 }, locale: 'he-IL' });
      const signPage = await publicContext.newPage();
      await signPage.goto(`${BASE}/sign-declaration?token=${encodeURIComponent(token)}`, {
        waitUntil: 'networkidle',
        timeout: 120_000,
      });
      const canvas = signPage.locator('canvas');
      await canvas.waitFor({ state: 'visible' });
      const box = await canvas.boundingBox();
      if (!box) throw new Error('signature canvas has no bounding box');
      await signPage.mouse.move(box.x + 30, box.y + 60);
      await signPage.mouse.down();
      await signPage.mouse.move(box.x + 120, box.y + 90, { steps: 8 });
      await signPage.mouse.up();
      await signPage.getByRole('button', { name: /חתום ואשר/ }).click();
      await signPage.getByText('התצהיר נחתם בהצלחה!').first().waitFor({ timeout: 45_000 });
      const db = await admin.from('driver_declarations').select('status,signature_url,expires_at')
        .eq('id', declaration.id).single();
      const signaturePath = db.data?.signature_url?.split('/documents/')[1];
      if (signaturePath) storagePaths.push(signaturePath);
      await publicContext.close();
      return {
        ok: db.data?.status === 'signed' && Boolean(db.data?.signature_url) && Boolean(db.data?.expires_at),
        status: db.data?.status,
        expiresAt: db.data?.expires_at,
      };
    });

    await check('driving-exam', 'Exam token opens; completed DB result and driving deep-link are visible', async () => {
      const token = randomUUID();
      const questions = [{
        id: 'qa-1',
        question: 'QA safe question?',
        answers: ['כן', 'לא'],
        correct: 0,
        category: 'QA',
        explanation: 'Ephemeral QA',
      }];
      const inserted = await admin.from('driving_exams').insert({
        driver_id: seededDriver.id,
        driver_name: driverName,
        driver_phone: seededDriver.phone,
        company_name: companyName,
        vehicle_plate: plate,
        sent_via: 'link',
        sent_to: seededDriver.phone,
        sent_at: new Date().toISOString(),
        questions,
        total_questions: 1,
        status: 'sent',
        token,
        expires_at: new Date(Date.now() + DAY).toISOString(),
        created_by: adminUser.id,
      }).select('*').single();
      const exam = must(inserted.data, inserted.error, 'insert exam');
      rowIds.exam = exam.id;
      const publicContext = await browser.newContext({ viewport: { width: 430, height: 850 }, locale: 'he-IL' });
      const examPage = await publicContext.newPage();
      await examPage.goto(`${BASE}/take-exam?t=${encodeURIComponent(token)}`, {
        waitUntil: 'networkidle',
        timeout: 120_000,
      });
      const examBody = await examPage.locator('body').innerText();
      const opened = await examPage.getByText('מבחן כשירות נהיגה').first().isVisible().catch(() => false);
      const completedAt = new Date().toISOString();
      const expiry = addYears(completedAt.slice(0, 10), 1);
      await admin.from('driving_exams').update({
        status: 'completed',
        completed_at: completedAt,
        passed: true,
        score: 100,
        correct_count: 1,
        answers: [{ question_id: 'qa-1', selected_index: 0, is_correct: true }],
        exam_validity_months: 12,
      }).eq('id', exam.id).throwOnError();
      await admin.from('drivers').update({
        last_exam_date: completedAt.slice(0, 10),
        exam_expiry: expiry,
      }).eq('id', seededDriver.id).throwOnError();
      await page.goto(`${BASE}/drivers?driverId=${seededDriver.id}&section=driving`, {
        waitUntil: 'networkidle',
        timeout: 120_000,
      });
      const body = await page.locator('body').innerText();
      await publicContext.close();
      return {
        ok: opened && page.url().includes(`driverId=${seededDriver.id}`) &&
          page.url().includes('section=driving') && body.includes('completed') && body.includes('100'),
        opened,
        publicPageUrl: examPage.url(),
        publicPageSnippet: examBody.slice(0, 300),
        url: page.url(),
        expiry,
      };
    });

    await check('accident-image-and-uuid', 'Accident storage image renders and opens the same UUID', async () => {
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      );
      const path = `qa-complementary/${runId}/accident.png`;
      const upload = await admin.storage.from('documents').upload(path, png, {
        contentType: 'image/png',
        upsert: false,
      });
      if (upload.error) throw upload.error;
      storagePaths.push(path);
      const publicUrl = admin.storage.from('documents').getPublicUrl(path).data.publicUrl;
      const inserted = await admin.from('accidents').insert({
        driver_name: driverName,
        vehicle_plate: plate,
        company_name: companyName,
        date: issueDate,
        description: `QA accident ${runId}`,
        status: 'open',
        images: JSON.stringify([publicUrl]),
        location: 'Staging QA',
      }).select('*').single();
      const accident = must(inserted.data, inserted.error, 'insert accident');
      rowIds.accident = accident.id;
      await page.goto(`${BASE}/drivers?driverId=${seededDriver.id}&section=driving`, {
        waitUntil: 'networkidle',
        timeout: 120_000,
      });
      const thumb = page.locator(`img[src="${publicUrl}"]`).first();
      const thumbVisible = await thumb.isVisible().catch(() => false);
      await page.getByText(/פתח תאונה/).first().click();
      await page.waitForTimeout(800);
      return {
        ok: thumbVisible && page.url().includes(accident.id),
        thumbVisible,
        accidentId: accident.id,
        url: page.url(),
      };
    });

    await check('activity-filter-search', 'Activity timeline filter and search controls work', async () => {
      await page.goto(`${BASE}/drivers?driverId=${seededDriver.id}&section=activity`, {
        waitUntil: 'networkidle',
        timeout: 120_000,
      });
      const activityHeading = await page.getByText('פעילות מתועדת').isVisible();
      const filter = page.locator('select').filter({ has: page.locator('option[value="document_version"]') }).first();
      await filter.selectOption('document_version');
      const search = page.getByPlaceholder('חיפוש…').last();
      await search.fill('traffic');
      return {
        ok: activityHeading && await filter.isVisible() && await search.inputValue() === 'traffic',
        activityHeading,
      };
    });

    await check('notes-refresh-persist', 'Driver notes save and persist after refresh', async () => {
      const note = `persisted note ${runId}`;
      const textarea = page.getByPlaceholder('הערות על הנהג…');
      await textarea.fill(note);
      await page.getByRole('button', { name: /שמור הערות/ }).click();
      await page.waitForTimeout(700);
      await page.reload({ waitUntil: 'networkidle' });
      const uiValue = await page.getByPlaceholder('הערות על הנהג…').inputValue();
      const db = await admin.from('drivers').select('notes').eq('id', seededDriver.id).single();
      return { ok: uiValue === note && db.data?.notes === note, uiValue, dbValue: db.data?.notes };
    });

    for (const section of ['documents', 'driving', 'activity']) {
      await check(`deep-link-${section}`, `Driver deep-link opens ${section} section`, async () => {
        await page.goto(`${BASE}/drivers?driverId=${seededDriver.id}&section=${section}`, {
          waitUntil: 'networkidle',
          timeout: 120_000,
        });
        const headings = {
          documents: 'מסמכים ורישיון',
          driving: 'נהיגה',
          activity: 'פעילות והערות',
        };
        return {
          ok: page.url().includes(`section=${section}`) &&
            await page.getByText(headings[section], { exact: false }).first().isVisible(),
          url: page.url(),
        };
      });
    }

    await check('mobile-iphone13-driver-hub', 'iPhone 13 DriverHub smoke', async () => {
      const mobile = await newSessionPage(adminAuth, devices['iPhone 13']);
      await mobile.page.goto(`${BASE}/drivers?driverId=${seededDriver.id}`, {
        waitUntil: 'networkidle',
        timeout: 120_000,
      });
      const labels = ['מסמכים ורישיון', 'בקשות ושליחה', 'נהיגה', 'פעילות והערות'];
      const visible = [];
      for (const label of labels) {
        visible.push(await mobile.page.getByText(label, { exact: true }).first().isVisible().catch(() => false));
      }
      await mobile.context.close();
      return { ok: visible.every(Boolean), visible };
    });

    await check('rbac-super-admin-alert-settings', 'super_admin can access alert-settings toggles', async () => {
      await page.goto(`${BASE}/alert-settings`, { waitUntil: 'networkidle', timeout: 120_000 });
      const body = await page.locator('body').innerText();
      return {
        ok: body.includes('הגדרות חברות') || body.includes('הצג / הסתר') || body.includes('באדום'),
        snippet: body.slice(0, 300),
      };
    });

    await check('rbac-driver-alert-settings', 'role=driver cannot access alert-settings toggles', async () => {
      const driverPage = await newSessionPage(driverAuth, { viewport: { width: 1280, height: 800 } });
      await driverPage.page.goto(`${BASE}/alert-settings`, { waitUntil: 'networkidle', timeout: 120_000 });
      const body = await driverPage.page.locator('body').innerText();
      const blocked = /אין הרשאה|אין גישה|לא מורשה|רק Super/i.test(body) ||
        (!body.includes('הצג / הסתר') && !body.includes('הגדרות חברות'));
      await driverPage.context.close();
      return { ok: blocked, snippet: body.slice(0, 300) };
    });

    await adminContext.close();
  } finally {
    report.cleanup.attempted = true;
    const cleanup = async (label, fn) => {
      try {
        await fn();
      } catch (error) {
        report.cleanup.errors.push({ label, error: error instanceof Error ? error.message : String(error) });
      }
    };

    if (browser) await cleanup('browser', () => browser.close());
    if (rowIds.request) {
      await cleanup('request versions', () =>
        admin.from('document_versions').delete().eq('request_id', rowIds.request).throwOnError());
    }
    if (rowIds.driver) {
      await cleanup('driver versions', () =>
        admin.from('document_versions').delete().eq('entity_id', rowIds.driver).throwOnError());
    }
    await cleanup('document metadata', () =>
      admin.from('document_metadata').delete().eq('company_name', companyName).throwOnError());
    if (rowIds.request) {
      await cleanup('document request', () =>
        admin.from('document_requests').delete().eq('id', rowIds.request).throwOnError());
    }
    if (rowIds.declaration) {
      await cleanup('declaration', () =>
        admin.from('driver_declarations').delete().eq('id', rowIds.declaration).throwOnError());
    }
    if (rowIds.exam) {
      await cleanup('exam', () =>
        admin.from('driving_exams').delete().eq('id', rowIds.exam).throwOnError());
    }
    if (rowIds.accident) {
      await cleanup('accident', () =>
        admin.from('accidents').delete().eq('id', rowIds.accident).throwOnError());
    }
    if (rowIds.vehicle) {
      await cleanup('vehicle', () =>
        admin.from('vehicles').delete().eq('id', rowIds.vehicle).throwOnError());
    }
    if (rowIds.driver) {
      await cleanup('driver', () =>
        admin.from('drivers').delete().eq('id', rowIds.driver).throwOnError());
    }
    await cleanup('storage', async () => {
      const unique = [...new Set(storagePaths.filter(Boolean))];
      if (unique.length) {
        const { error } = await admin.storage.from('documents').remove(unique);
        if (error) throw error;
      }
    });
    for (const userId of userIds) {
      await cleanup(`role ${userId}`, () =>
        admin.from('user_roles').delete().eq('user_id', userId).throwOnError());
      await cleanup(`profile ${userId}`, () =>
        admin.from('profiles').delete().eq('id', userId).throwOnError());
      await cleanup(`auth ${userId}`, async () => {
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) throw error;
      });
    }
    await cleanup('company settings', () =>
      admin.from('company_settings').delete().eq('company_name', companyName).throwOnError());
    report.cleanup.ok = report.cleanup.errors.length === 0;
    record('cleanup', 'All ephemeral QA rows and storage objects removed', report.cleanup.ok, {
      errors: report.cleanup.errors,
    });
    report.ok = report.tests.every((test) => test.ok) && report.cleanup.ok;
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`Report: ${REPORT_PATH}`);
    if (!report.ok) process.exitCode = 1;
  }
}

main().catch((error) => {
  report.fatal = error instanceof Error ? error.stack || error.message : String(error);
  report.ok = false;
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.error(error);
  process.exitCode = 1;
});
