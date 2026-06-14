/**
 * Capture document UX screenshots on Staging (PDF / JPG / PNG).
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs', 'screenshots', 'document-ux-qa');
mkdirSync(OUT, { recursive: true });

const runId = Date.now();
const COMPANY = `QA-DOC-UX-${runId}`;
const PASS = `Qa!${runId}`;

function loadKeys() {
  const raw = execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key,
  };
}

function tinyPdf() {
  return Buffer.from('%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
}
function tinyPng() {
  return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
}
function tinyJpg() {
  return Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=', 'base64');
}

async function createFm(admin, anonKey) {
  const email = `qa-doc-ux-${runId}@staging.local`;
  const { data: created, error } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true });
  if (error) throw error;
  const id = created.user.id;
  await admin.from('profiles').upsert({
    id, full_name: 'QA Doc UX', company_name: COMPANY, is_active: true,
    approval_status: 'approved', two_factor_approved: true,
  });
  await admin.from('user_roles').insert({ user_id: id, role: 'fleet_manager' });
  const anon = createClient(STAGING_URL, anonKey);
  const { data: auth, error: authErr } = await anon.auth.signInWithPassword({ email, password: PASS });
  if (authErr) throw authErr;
  return { id, email, session: auth.session };
}

async function seedDocs(admin, userId) {
  const files = [
    { ext: 'pdf', buf: tinyPdf(), name: `qa-sample-${runId}.pdf`, category: 'driver-license', folder: 'driver-license' },
    { ext: 'jpg', buf: tinyJpg(), name: `qa-sample-${runId}.jpg`, category: 'insurance', folder: 'insurance' },
    { ext: 'png', buf: tinyPng(), name: `qa-sample-${runId}.png`, category: 'test', folder: 'test' },
  ];
  for (const f of files) {
    const path = `${userId}/${f.folder}/${f.name}`;
    await admin.storage.from('documents').upload(path, f.buf, {
      contentType: f.ext === 'pdf' ? 'application/pdf' : f.ext === 'png' ? 'image/png' : 'image/jpeg',
      upsert: true,
    });
    await admin.from('document_metadata').insert({
      file_path: path,
      category: f.category,
      company_name: COMPANY,
      original_name: f.name,
      uploaded_by: userId,
      vehicle_plate: 'QA12345',
    });
  }
}

async function injectSession(page, session) {
  const storageKey = `sb-${STAGING_REF}-auth-token`;
  await page.addInitScript(
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

async function main() {
  const { service, anon } = loadKeys();
  const admin = createClient(STAGING_URL, service);
  const { id, session } = await createFm(admin, anon);
  await seedDocs(admin, id);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
  const page = await context.newPage();
  await injectSession(page, session);

  const shots = [
    { path: '/documents', file: 'documents-hub.png', note: 'מרכז מסמכים' },
    { path: '/documents?category=driver-license', file: 'documents-pdf.png', note: 'PDF — רישיונות נהיגה' },
    { path: '/documents?category=insurance', file: 'documents-jpg.png', note: 'JPG — ביטוח חובה' },
    { path: '/documents?category=test', file: 'documents-png.png', note: 'PNG — טסט' },
  ];

  for (const s of shots) {
    await page.goto(`${BASE}${s.path}`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2500);
    // open category if hub
    if (!s.path.includes('category=')) {
      const driverBtn = page.getByRole('button', { name: /רישיונות נהיגה/i });
      if (await driverBtn.count()) await driverBtn.first().click();
      await page.waitForTimeout(1500);
    } else {
      const cat = s.path.split('=')[1];
      const map = { 'driver-license': 'רישיונות נהיגה', insurance: 'ביטוח חובה', test: 'טסט' };
      const label = map[cat as keyof typeof map];
      if (label) {
        await page.getByRole('button', { name: new RegExp(label) }).first().click();
        await page.waitForTimeout(1500);
      }
    }
    await page.screenshot({ path: join(OUT, s.file), fullPage: true });
    console.log('saved', s.file, s.note);
  }

  // preview dialog — click first view button
  const viewBtn = page.getByRole('button', { name: 'צפייה' }).first();
  if (await viewBtn.count()) {
    await viewBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: join(OUT, 'documents-preview-dialog.png'), fullPage: false });
    console.log('saved documents-preview-dialog.png');
  }

  await browser.close();
  await admin.from('document_metadata').delete().eq('company_name', COMPANY);
  await admin.auth.admin.deleteUser(id);
  console.log('DONE', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
