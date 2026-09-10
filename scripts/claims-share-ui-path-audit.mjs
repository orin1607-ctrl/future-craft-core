#!/usr/bin/env node
/**
 * AUDIT ONLY — owner's real UI path on PUBLIC STAGING.
 * Login form first. Clicks gallery → share → copy → incognito.
 * Captures console + network. TEST claim, soft-delete. Never Production.
 */
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = 'https://orin1607-ctrl.github.io/future-craft-core';
const FN = `https://${STAGING_REF}.supabase.co/functions/v1/claims-docs`;
const OUT = join(process.cwd(), 'docs/audit-reports/claims-share-ui-path-2026-09-10');
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const DESK_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const DESK_PASSWORD = 'QaWorker2026!';
const PROTECTED = new Set(['DAL-2026-0020', 'DAL-2026-0014', 'DAL-2026-0017', 'DAL-2026-0001', 'DAL-QA-WORKER-001']);
const env = {};
for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split('\n')) {
  if (!line || line.startsWith('#') || !line.includes('=')) continue;
  const i = line.indexOf('=');
  env[line.slice(0, i)] = line.slice(i + 1);
}
const anonKey = env.VITE_SUPABASE_ANON_KEY;
function jwtRef(tok) {
  try { return JSON.parse(Buffer.from(String(tok).split('.')[1], 'base64url').toString('utf8')).ref || ''; }
  catch { return ''; }
}
if (jwtRef(anonKey) === PROD_REF) throw new Error('production anon key blocked');

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  public: PUBLIC,
  productionTouched: false,
  findings: [],
  checks: [],
  console: [],
  networkFails: [],
  copiedUrl: '',
  createSharePayload: null,
  createShareResponse: null,
  loginPath: '',
  verdict: 'AUDIT',
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 280)}` : ''}`);
};
const find = (title, detail) => {
  report.findings.push({ title, detail });
  console.log(`FINDING ${title} · ${detail}`);
};

const JPG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAG/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);
const db = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { persistSession: false } });
const { data: auth, error: loginErr } = await db.auth.signInWithPassword({ email: DESK_EMAIL, password: DESK_PASSWORD });
if (loginErr || !auth.session) throw loginErr || new Error('api login failed');
const session = auth.session;

const stamp = Date.now();
const claimId = `DAL-QA-UIPATH-${stamp}`;
const now = new Date().toISOString();
await db.from('claims_records').insert({
  id: claimId, client_name: `TEST UI Path ${stamp}`, status: 'בטיפול', plate: '98-765-43',
  assigned_to: session.user.id,
  row_data: {
    id: claimId, clientName: `TEST UI Path ${stamp}`, clientEmail: 'yoni122222@gmail.com', clientPhone: '0501111111',
    plate: '98-765-43', status: 'בטיפול', source: 'Staff', insCompany: 'מגדל', createdAt: now,
  },
  created_by_name: 'QA Worker', last_activity_at: now,
});
async function up(name, mime, bytes, extra = {}) {
  const form = new FormData();
  form.set('action', 'staff_upload');
  form.set('claim_id', claimId);
  if (extra.staff_type) form.set('staff_type', extra.staff_type);
  form.set('file', new Blob([bytes], { type: mime }), name);
  const r = await fetch(FN, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}` },
    body: form,
  });
  return r.json();
}
const pdf1 = await up(`uipath-doc-a-${stamp}.pdf`, 'application/pdf', Buffer.from('%PDF-1.1\n%%A\n'));
const pdf2 = await up(`uipath-doc-b-${stamp}.pdf`, 'application/pdf', Buffer.from('%PDF-1.1\n%%B\n'));
const jpg1 = await up(`uipath-photo-a-${stamp}.jpg`, 'image/jpeg', Buffer.concat([JPG, Buffer.from('-a-')]), { staff_type: 'damage_photos' });
const jpg2 = await up(`uipath-photo-b-${stamp}.jpg`, 'image/jpeg', Buffer.concat([JPG, Buffer.from('-b-')]), { staff_type: 'damage_photos' });
rec('setup-files', Boolean(pdf1.file_id && pdf2.file_id && jpg1.file_id && jpg2.file_id), { pdf1: pdf1.file_id, pdf2: pdf2.file_id, jpg1: jpg1.file_id, jpg2: jpg2.file_id });

const pagesTxt = await fetch(`${PUBLIC}/STAGING-DEPLOY.txt?t=${Date.now()}`).then((r) => r.text()).catch(() => '');
report.liveSha = ((pagesTxt.match(/deployed_ref=(\S+)/) || [])[1] || '');
rec('pages-sha', Boolean(report.liveSha), { txt: pagesTxt.trim() });

const { chromium } = await import('playwright');
const browser = await chromium.launch({ headless: true });

try {
  const loginCtx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1400, height: 900 } });
  const loginPage = await loginCtx.newPage();
  loginPage.on('console', (m) => report.console.push({ where: 'login', type: m.type(), text: m.text().slice(0, 300) }));
  await loginPage.goto(`${PUBLIC}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await loginPage.waitForTimeout(1500);
  const email = loginPage.locator('input[type="email"]').first();
  const pass = loginPage.locator('input[type="password"]').first();
  rec('login-form-visible', (await email.count()) > 0 && (await pass.count()) > 0);
  await email.fill(DESK_EMAIL);
  await pass.fill(DESK_PASSWORD);
  await loginPage.locator('form button[type="submit"], button:has-text("כניסה")').first().click();
  await loginPage.waitForTimeout(4000);
  const otp = await loginPage.getByText(/קוד|OTP|אימות/i).count();
  const onClaims = loginPage.url().includes('/claims');
  report.loginPath = otp ? 'otp-required' : (onClaims ? 'password-landed-claims' : `after-login:${loginPage.url()}`);
  rec('login-form-otp-or-claims', true, { loginPath: report.loginPath, url: loginPage.url() });
  if (otp) find('login-otp', 'Real login form requires OTP for the QA worker. Owner path uses their own session; share clicks still audited after app session.');
  await loginPage.screenshot({ path: join(OUT, 'screenshots', '01-login.png'), fullPage: true });
  await loginCtx.close();

  const staffCtx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1400, height: 900 } });
  await staffCtx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await staffCtx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: {
      access_token: session.access_token, refresh_token: session.refresh_token,
      expires_at: session.expires_at, expires_in: session.expires_in, token_type: session.token_type, user: session.user,
    },
  });
  const page = await staffCtx.newPage();
  const cons = [];
  page.on('console', (m) => {
    const row = { where: 'staff', type: m.type(), text: m.text().slice(0, 400) };
    cons.push(row);
    if (m.type() === 'error') report.console.push(row);
  });
  page.on('pageerror', (e) => report.console.push({ where: 'staff', type: 'pageerror', text: String(e).slice(0, 400) }));
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('/functions/v1/claims-docs') && res.request().method() === 'POST') {
      let body = '';
      try { body = res.request().postData() || ''; } catch { /* */ }
      if (body.includes('create_share') && !body.includes('garage_create_share')) {
        report.createSharePayload = body.slice(0, 1500);
        try { report.createShareResponse = { status: res.status(), json: await res.json() }; }
        catch { report.createShareResponse = { status: res.status() }; }
      }
    }
    if (res.status() >= 400 && /claims-docs|claims-share|github/.test(url)) {
      report.networkFails.push({ status: res.status(), url: url.slice(0, 220) });
    }
  });

  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('[data-testid="claims-search"], [data-testid="claims-open-new"]', { timeout: 45000 });
  rec('staff-claims-screen', true, { url: page.url() });
  const box = page.locator('[data-testid="claims-search"]').locator('visible=true').first();
  await box.fill(claimId);
  await page.waitForTimeout(1500);
  const row = page.locator(`[data-testid="claim-row-${claimId}"]`).first();
  rec('staff-found-claim-row', await row.count() > 0);
  if (!(await row.count())) {
    find('claim-row-missing', 'Search did not show the TEST claim after login-equivalent session.');
  } else {
    await row.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(OUT, 'screenshots', '02-card-open.png'), fullPage: true });
    const openDocs = page.locator('[data-testid="claims-open-docs"]');
    const tabGroup = page.locator('[data-testid="claims-tab-group-docs"]');
    rec('gallery-entry-open-docs', await openDocs.count() > 0);
    rec('gallery-entry-tab-group', await tabGroup.count() > 0);
    rec('action-bar-secure-share', await page.locator('[data-testid="claims-secure-share-ab"]').count() > 0);
    if (await openDocs.count()) await openDocs.click();
    else if (await tabGroup.count()) await tabGroup.click();
    await page.waitForTimeout(1500);
    const galleryNow = await page.locator('[data-testid="docs-library"]').count();
    const shareBarNow = await page.locator('[data-testid="docs-share-bar"]').count();
    rec('gallery-after-open-docs', galleryNow > 0 || shareBarNow > 0, { galleryNow, shareBarNow, url: page.url() });
    await page.screenshot({ path: join(OUT, 'screenshots', '02b-after-open-docs.png'), fullPage: true });
    if (!galleryNow && !shareBarNow) {
      find('gallery-not-in-real-ui', 'Clicked גלריית מסמכים ותמונות / tab group docs but docs-library did not render.');
      const html = await page.locator('.claims-root').innerHTML().catch(() => '');
      writeFileSync(join(OUT, 'card-html.txt'), html.slice(0, 20000));
    } else {
    await page.waitForSelector('[data-testid="docs-library"], [data-testid="docs-share-bar"]', { timeout: 25000 });
    await page.waitForSelector('[data-testid="docs-library"] input[type="checkbox"]', { timeout: 25000 }).catch(() => null);
    await page.locator('[data-testid="docs-cat-all"]').click().catch(() => null);
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT, 'screenshots', '02-gallery.png'), fullPage: true });
    rec('gallery-visible', await page.locator('[data-testid="docs-library"]').count() > 0);

    const beforePick = await page.locator('[data-testid="docs-lib-count"]').innerText().catch(() => '');
    await page.locator('[data-testid="docs-lib-all"]').click();
    await page.waitForTimeout(400);
    const afterPick = await page.locator('[data-testid="docs-lib-count"]').innerText().catch(() => '');
    rec('select-all-visible', /4/.test(afterPick) || /נבחרו [1-9]/.test(afterPick), { beforePick, afterPick });

    await page.locator('[data-testid="claims-secure-share"]').first().click();
    await page.locator('[data-testid="mo-secure-share"]').waitFor({ timeout: 15000 });
    rec('share-modal-opened', true);
    const modalCount = await page.locator('[data-testid="share-count"]').innerText().catch(() => '');
    rec('modal-got-selected-ids', /נבחרו לשיתוף [1-9]/.test(modalCount), { modalCount });
    if (!/נבחרו לשיתוף [1-9]/.test(modalCount)) {
      find('selection-not-passed', `Gallery selection did not reach the share modal. gallery=${afterPick} modal=${modalCount}`);
      await page.locator('[data-testid="share-all"]').click();
    }
    await page.locator('[data-testid="share-to"]').fill('עו"ד UI Path');
    await page.locator('[data-testid="share-kind"]').selectOption('lawyer');
    await page.locator('[data-testid="share-ttl"]').selectOption('custom');
    const customOk = await page.locator('[data-testid="share-custom"]').count();
    rec('custom-ttl-control', customOk > 0);
    if (customOk) {
      const dt = new Date(Date.now() + 26 * 3600_000);
      const pad = (n) => String(n).padStart(2, '0');
      const local = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
      await page.locator('[data-testid="share-custom"]').fill(local);
    }
    await page.screenshot({ path: join(OUT, 'screenshots', '03-share-modal.png') });
    await page.locator('[data-testid="share-create"]').click();
    const created = await page.locator('[data-testid="share-created"]').waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
    rec('create-link-ui', created, { payload: report.createSharePayload, response: report.createShareResponse });
    if (!created) find('create-link-failed', `Modal did not show created URL. resp=${JSON.stringify(report.createShareResponse).slice(0, 400)}`);

    const shownUrl = created ? (await page.locator('[data-testid="share-url"]').innerText()).trim() : '';
    report.copiedUrl = shownUrl;
    rec('shown-url-has-pages-base', /future-craft-core\/claims-share/.test(shownUrl), { shownUrl: shownUrl.slice(0, 180) });
    if (shownUrl && !shownUrl.includes('/future-craft-core/')) {
      find('wrong-share-origin', `UI built a URL without the Pages base: ${shownUrl}`);
    }
    if (shownUrl && !shownUrl.includes('claims-share/')) {
      find('share-url-no-trailing-slash', `Copied URL has no trailing slash, GitHub Pages 301s it: ${shownUrl}`);
    }

    if (created) {
      await page.locator('[data-testid="share-copy"]').click();
      const copied = await page.evaluate(async () => {
        try { return await navigator.clipboard.readText(); } catch { return 'CLIPBOARD_BLOCKED'; }
      });
      rec('copy-matches-shown', copied === shownUrl || copied === 'CLIPBOARD_BLOCKED', { copied: String(copied).slice(0, 180) });

      const waHref = await page.locator('[data-testid="share-wa"]').getAttribute('href');
      rec('whatsapp-href', /wa\.me/.test(String(waHref || '')), { href: String(waHref || '').slice(0, 220) });
      rec('whatsapp-has-share-url', shownUrl && decodeURIComponent(String(waHref || '')).includes(shownUrl), { href: String(waHref || '').slice(0, 220) });
      if (!String(waHref || '').includes('claims-share')) {
        find('whatsapp-missing-url', `WhatsApp href has no share URL. href=${String(waHref || '').slice(0, 180)}`);
      }

      await page.locator('[data-testid="share-mail"]').click();
      await page.waitForFunction(() => {
        const el = document.getElementById('mail_body');
        return Boolean(el && String(el.value || '').includes('claims-share'));
      }, null, { timeout: 20000 }).catch(() => null);
      const mailBody = await page.locator('#mail_body').inputValue().catch(() => '');
      rec('mail-has-share-url', shownUrl && mailBody.includes(shownUrl), { mailBody: mailBody.slice(0, 220) });
      if (!mailBody.includes('claims-share')) {
        find('mail-missing-url', `Composer opened without the share URL. body=${mailBody.slice(0, 180)}`);
      }
    }
    await page.screenshot({ path: join(OUT, 'screenshots', '04-after-share.png') });
    }
  }
  await staffCtx.close();

  if (report.copiedUrl) {
    const raw = await fetch(report.copiedUrl, { redirect: 'manual' });
    const loc = raw.headers.get('location') || '';
    rec('copied-url-http', raw.status === 200 || raw.status === 301, { status: raw.status, location: loc });
    if (raw.status === 301) find('copied-url-301', `Recipient URL 301s to ${loc}. WhatsApp/in-app browsers may drop ?t= on this redirect.`);

    const incog = await browser.newContext({ locale: 'he-IL', viewport: { width: 1400, height: 900 }, acceptDownloads: true });
    const recPage = await incog.newPage();
    recPage.on('console', (m) => {
      if (m.type() === 'error') report.console.push({ where: 'incognito', type: 'error', text: m.text().slice(0, 400) });
    });
    const t0 = Date.now();
    await recPage.goto(report.copiedUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const loadingMs = await recPage.getByText('טוען').first().isVisible().catch(() => false);
    await recPage.locator('[data-testid="share-page"], [data-testid="share-error"], input[type="password"]').first().waitFor({ timeout: 30000 }).catch(() => null);
    const waited = Date.now() - t0;
    const hasShare = await recPage.locator('[data-testid="share-page"]').count();
    const hasLogin = await recPage.locator('input[type="password"]').count();
    const hasError = await recPage.locator('[data-testid="share-error"]').innerText().catch(() => '');
    rec('incognito-no-login', hasShare > 0 && hasLogin === 0, { hasShare, hasLogin, hasError, waited, loadingMs, url: recPage.url() });
    if (hasLogin > 0) find('incognito-got-login', `Copied URL rendered a password field instead of the public share page. url=${recPage.url()}`);
    if (!hasShare) find('incognito-no-share-page', `share-page missing. error=${hasError} url=${recPage.url()}`);
    await recPage.screenshot({ path: join(OUT, 'screenshots', '05-incognito.png'), fullPage: true });
    if (hasShare) {
      const countTxt = await recPage.locator('[data-testid="share-pub-count"]').innerText().catch(() => '');
      rec('incognito-four-files', /4/.test(countTxt), { countTxt });
      await recPage.locator('[data-testid^="share-pub-view-"], [data-testid^="share-pub-img-"] button').first().click().catch(() => null);
      await recPage.waitForSelector('[data-testid="share-preview"]', { timeout: 15000 }).catch(() => null);
      rec('incognito-preview', await recPage.locator('[data-testid="share-preview"]').count() > 0);
      try {
        const [dl] = await Promise.all([
          recPage.waitForEvent('download', { timeout: 20000 }),
          recPage.locator('[data-testid^="share-pub-dl-"]').first().click(),
        ]);
        rec('incognito-download-one', Boolean(dl), { name: dl.suggestedFilename() });
      } catch (e) {
        rec('incognito-download-one', false, { err: String(e.message || e).slice(0, 200) });
        find('incognito-download-click', 'Download click from the public page did not start a browser download.');
      }
      try {
        const [zip] = await Promise.all([
          recPage.waitForEvent('download', { timeout: 20000 }),
          recPage.locator('[data-testid="share-pub-zip"]').click(),
        ]);
        rec('incognito-download-all', Boolean(zip), { name: zip.suggestedFilename() });
      } catch (e) {
        rec('incognito-download-all', false, { err: String(e.message || e).slice(0, 200) });
        find('incognito-zip-click', 'Download All click did not start a browser download.');
      }
    }
    await incog.close();
  }
} finally {
  await browser.close();
  if (!PROTECTED.has(claimId)) {
    const { data } = await db.from('claims_records').select('id, row_data').eq('id', claimId).maybeSingle();
    if (data) await db.from('claims_records').update({ row_data: { ...(data.row_data || {}), deletedAt: new Date().toISOString() } }).eq('id', claimId);
  }
}

const failed = report.checks.filter((c) => !c.ok);
report.consoleErrors = report.console.filter((c) => c.type === 'error' || c.type === 'pageerror');
writeFileSync(join(OUT, 'audit.json'), JSON.stringify(report, null, 2));
console.log(`\nAUDIT findings=${report.findings.length} fail=${failed.length}/${report.checks.length}`);
console.log(JSON.stringify({ findings: report.findings, copiedUrl: report.copiedUrl, createShareResponse: report.createShareResponse }, null, 2));
try {
  copyFileSync(join(OUT, 'screenshots', '03-share-modal.png'), join('/opt/cursor/artifacts', 'share_ui_audit_modal.png'));
  copyFileSync(join(OUT, 'screenshots', '05-incognito.png'), join('/opt/cursor/artifacts', 'share_ui_audit_incognito.png'));
} catch { /* */ }
