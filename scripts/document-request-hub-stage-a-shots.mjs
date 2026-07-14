/**
 * Stage A UI screenshots — Staging Supabase only, local Vite UI.
 */
import puppeteer from 'puppeteer-core';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const STAGING = 'usfeoerkpcafxxlyuldl';
const stagingDir = 'c:\\Users\\אליאב\\OneDrive\\מסמכים\\future-craft-core-STAGING';
const outDir = path.join(stagingDir, 'docs', 'audit-reports', 'document-request-hub-stage-a', 'shots');
fs.mkdirSync(outDir, { recursive: true });
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP = process.env.STAGE_A_APP_URL || 'http://127.0.0.1:5173';

const keys = JSON.parse(
  execSync(`supabase projects api-keys --project-ref ${STAGING} -o json`, { encoding: 'utf8', cwd: stagingDir })
);
const service = keys.find((k) => k.name === 'service_role' && k.type === 'legacy').api_key;
const anon = keys.find((k) => k.name === 'anon' && k.type === 'legacy').api_key;
const SB = `https://${STAGING}.supabase.co`;
const admin = createClient(SB, service, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: roles } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(1);
const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
const adminUser = authUsers.users.find((u) => u.id === roles[0].user_id) || authUsers.users[0];

const { data: req } = await admin
  .from('document_requests')
  .select('id, token_hash, entity_type, entity_id, status')
  .eq('status', 'pending_approval')
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();

async function apiAccessToken() {
  const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: adminUser.email });
  const hashed = linkData.properties.hashed_token;
  const userClient = createClient(SB, anon, { auth: { persistSession: false } });
  let otp = await userClient.auth.verifyOtp({ token_hash: hashed, type: 'magiclink' });
  if (otp.error) otp = await userClient.auth.verifyOtp({ token_hash: hashed, type: 'email' });
  if (otp.error) throw otp.error;
  return otp.data.session.access_token;
}

async function freshBrowserTokenHash() {
  const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: adminUser.email });
  return linkData.properties.hashed_token;
}

const access = await apiAccessToken();
const { data: driver } = await admin.from('drivers').select('id, full_name, phone, email').limit(1).single();
const createRes = await fetch(`${SB}/functions/v1/document-request`, {
  method: 'POST',
  headers: {
    apikey: anon,
    Authorization: `Bearer ${access}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'create',
    document_type_key: 'id_card',
    entity_type: 'driver',
    entity_id: driver.id,
    entity_label: driver.full_name,
    recipient_name: driver.full_name,
    public_app_origin: APP,
  }),
});
const created = await createRes.json();
if (!created.success) throw new Error(JSON.stringify(created));
const uploadUrl = created.upload_url;
fs.writeFileSync(path.join(outDir, '..', 'LIVE-UPLOAD-URL.txt'), uploadUrl + '\n');

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--window-size=1280,1100', '--no-first-run'],
  userDataDir: path.join('c:\\Users\\אליאב\\Downloads\\supabase_full_export\\browser-check\\doc-hub-stage-a-profile'),
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

// Mobile upload page
await page.goto(uploadUrl, { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: path.join(outDir, '01-mobile-upload-page.png'), fullPage: true });

// Desktop manager UI — unused magic link verified only in browser
const hashed2 = await freshBrowserTokenHash();
await page.setViewport({ width: 1440, height: 1000 });
await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.addScriptTag({
  url: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
});
await page.evaluate(
  async ({ sbUrl, anonKey, tokenHash }) => {
    const sb = window.supabase.createClient(sbUrl, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storage: window.localStorage },
    });
    let r = await sb.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
    if (r.error) r = await sb.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
    if (r.error) throw new Error(r.error.message);
  },
  { sbUrl: SB, anonKey: anon, tokenHash: hashed2 }
);
await page.goto(`${APP}/drivers?driverId=${driver.id}`, { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: path.join(outDir, '02-driver-card-request-panel.png'), fullPage: true });

// Open request dialog
const clicked = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => (b.innerText || '').includes('בקש מסמך'));
  if (!btn) return false;
  btn.click();
  return true;
});
await new Promise((r) => setTimeout(r, 1000));
await page.screenshot({ path: path.join(outDir, '03-request-dialog.png'), fullPage: true });

await page.goto(`${APP}/documents`, { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise((r) => setTimeout(r, 2000));
await page.screenshot({ path: path.join(outDir, '04-documents-screen.png'), fullPage: true });

const summary = { uploadUrl, clickedDialog: clicked, driverId: driver.id, requestFromShot: created.request_id, priorPending: req?.id };
fs.writeFileSync(path.join(outDir, '..', 'UI-SHOTS.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
await browser.close();
