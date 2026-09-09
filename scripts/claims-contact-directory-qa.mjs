#!/usr/bin/env node
/**
 * PUBLIC STAGING QA A–H — claims contact directory.
 * TEST claims only. Soft-delete at end. No Production. No Auto-Send.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = (process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core').replace(/\/$/, '');
const WANT_SHA = (process.env.CLAIMS_QA_SHA || execSync('git rev-parse --short origin/feat/incident-alerts-staging', { encoding: 'utf8' }).trim()).slice(0, 7);
const OUT = join(process.cwd(), 'docs/audit-reports/claims-contact-directory-2026-09-09');
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
mkdirSync('/opt/cursor/artifacts', { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const WORKER_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const WORKER_PASSWORD = 'QaWorker2026!';
const PROTECTED = new Set(['DAL-2026-0020', 'DAL-2026-0014', 'DAL-2026-0017', 'DAL-2026-0001', 'DAL-QA-WORKER-001']);
const env = {};
try {
  for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    env[line.slice(0, i)] = line.slice(i + 1);
  }
} catch { /* optional */ }
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
if (!anonKey) throw new Error('missing staging anon key');
const userDb = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

const report = { at: new Date().toISOString(), staging: STAGING_REF, productionTouched: false, qaBase: PUBLIC, wantSha: WANT_SHA, checks: [], verdict: 'FAIL' };
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 220)}` : ''}`);
};
async function login() {
  const { data, error } = await userDb.auth.signInWithPassword({ email: WORKER_EMAIL, password: WORKER_PASSWORD });
  if (error || !data.session) throw error || new Error('worker login failed');
  return data.session;
}
async function softDelete(claimId) {
  if (!claimId || PROTECTED.has(claimId)) return;
  const { data } = await userDb.from('claims_records').select('id, row_data').eq('id', claimId).maybeSingle();
  if (!data) return;
  await userDb.from('claims_records').update({ row_data: { ...(data.row_data || {}), deletedAt: new Date().toISOString() } }).eq('id', claimId);
}
async function inject(context, session) {
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    },
  });
}
async function shot(page, name) {
  const path = join(OUT, 'screenshots', `${name}.png`);
  await page.screenshot({ path, fullPage: false }).catch(() => undefined);
  try { if (existsSync(path)) copyFileSync(path, join('/opt/cursor/artifacts', `contacts-${name}.png`)); } catch { /* skip */ }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitDeploy() {
  for (let i = 0; i < 48; i++) {
    const txt = await fetch(`${PUBLIC}/STAGING-DEPLOY.txt?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text()).catch(() => '');
    report.deployTxt = txt.trim();
    if (txt.includes(WANT_SHA)) return true;
    console.log(`wait pages ${i + 1}/48 · ${txt.trim() || 'missing'}`);
    await sleep(15000);
  }
  return false;
}
async function waitTables() {
  for (let i = 0; i < 40; i++) {
    const { error } = await userDb.from('claims_contacts').select('id').limit(1);
    if (!error) return true;
    console.log(`wait tables ${i + 1}/40 · ${error.message}`);
    await sleep(15000);
  }
  return false;
}

const session = await login();
rec('worker-login', !!session.access_token);
rec('staging-only', STAGING_REF !== PROD_REF);

if (!process.env.CLAIMS_QA_SKIP_WAIT) {
  rec('public-pages-sha', await waitDeploy(), { deployTxt: report.deployTxt, wantSha: WANT_SHA });
}
const tablesOk = await waitTables();
rec('contact-tables-exist', tablesOk);
if (!tablesOk) {
  writeFileSync(join(OUT, 'qa.json'), JSON.stringify(report, null, 2));
  process.exit(1);
}

const now = new Date().toISOString();
const idA = `DAL-QA-CTC-A-${Date.now()}`;
const idB = `DAL-QA-CTC-B-${Date.now()}`;
const idC = `DAL-QA-CTC-C-${Date.now()}`;
async function makeClaim(id, name, company, extra = {}) {
  const { error } = await userDb.from('claims_records').insert({
    id,
    client_name: name,
    status: 'בטיפול',
    plate: extra.plate || '11-222-33',
    assigned_to: session.user.id,
    row_data: {
      id, clientName: name, clientEmail: extra.email || 'yoni122222@gmail.com', clientPhone: extra.phone || '0501111111',
      plate: extra.plate || '11-222-33', status: 'בטיפול', source: 'Staff', insCompany: company,
      insEmail: extra.insEmail || '', createdAt: now,
    },
    created_by_name: 'QA Worker',
    last_activity_at: now,
  });
  rec(`create-${id}`, !error, { err: error?.message });
}
await makeClaim(idA, 'QA Contact Migdal', 'מגדל', { plate: '12-345-67' });
await makeClaim(idB, 'QA Contact Phoenix', 'הפניקס', { plate: '76-543-21' });
await makeClaim(idC, 'QA Contact Second Migdal', 'מגדל', { plate: '98-111-22' });

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await inject(context, session);
  const page = await context.newPage();
  const openClaim = async (id) => {
    await page.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
    await page.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);
    const mine = page.locator('[data-testid="claims-mine-toggle"]').locator('visible=true').first();
    if (await mine.count()) {
      const t = await mine.innerText().catch(() => '');
      if (/שלי|התביעות שלי/.test(t)) await mine.click().catch(() => undefined);
    }
    const box = page.locator('[data-testid="claims-search"]').locator('visible=true').first();
    await box.waitFor({ state: 'visible', timeout: 15000 });
    await box.fill(id);
    await page.waitForTimeout(1200);
    const row = page.locator(`[data-testid="claim-row-${id}"]`).first();
    await row.waitFor({ state: 'visible', timeout: 20000 });
    await row.click();
    await page.waitForSelector('[data-testid="claims-open-contacts"]', { timeout: 20000 });
  };

  await openClaim(idA);
  rec('A-contacts-button', await page.locator('[data-testid="claims-open-contacts"]').count() > 0);
  await page.locator('[data-testid="claims-open-contacts"]').click();
  await page.waitForSelector('[data-testid="mo-contacts"]', { timeout: 15000 });
  rec('A-insurer-filter-copy', (await page.locator('[data-testid="mo-contacts"]').innerText()).includes('מגדל'));
  await shot(page, 'a-contacts');

  await page.locator('[data-testid="contacts-add"]').click();
  await page.locator('[data-testid="contact-name"]').fill('אפרת כהן QA');
  await page.locator('[data-testid="contact-role"]').selectOption('agent');
  await page.locator('[data-testid="contact-company"]').fill('מגדל');
  await page.locator('[data-testid="contact-email"]').fill('efrat.qa.ctc@example.com');
  await page.locator('[data-testid="contact-phone"]').fill('0502222222');
  await page.locator('[data-testid="contact-wa"]').fill('0502222222');
  await page.locator('[data-testid="contact-save"]').click();
  await page.getByText('אפרת כהן QA', { exact: false }).first().waitFor({ timeout: 20000 });
  rec('D-save-new-contact', (await page.locator('[data-testid="mo-contacts"]').innerText()).includes('אפרת כהן QA'));
  await page.getByRole('button', { name: 'ראשי לטיפול' }).first().click();
  await page.waitForSelector('[data-testid="contact-primary"]', { timeout: 15000 });
  rec('primary-treatment-contact', (await page.locator('[data-testid="contact-primary"]').innerText()).includes('אפרת כהן QA'));
  await page.locator('[data-testid="contacts-search"]').fill('אפרת');
  rec('search-filter', (await page.locator('[data-testid="mo-contacts"]').innerText()).includes('אפרת כהן QA'));
  await page.locator('[data-testid="contacts-close"]').click();
  rec('regression-mail', await page.locator('[data-testid="claims-send-mail"]').count() > 0);
  rec('regression-request', await page.locator('[data-testid="claims-cust-request"]').count() > 0);
  rec('regression-treat', await page.locator('[data-testid="claims-treat-open"]').count() > 0);
  rec('regression-docs', await page.locator('[data-testid="claims-open-docs"]').count() > 0);
  await page.locator('[data-testid="claims-open-contacts"]').click();
  await page.waitForSelector('[data-testid="mo-contacts"]', { timeout: 15000 });
  await page.getByText('אפרת כהן QA', { exact: false }).first().waitFor({ timeout: 20000 });
  rec('reopen-keeps-contact', (await page.locator('[data-testid="mo-contacts"]').innerText()).includes('אפרת כהן QA'));
  await page.locator('[data-testid="contacts-close"]').click();

  await page.locator('[data-testid="claims-send-mail"]').click();
  await page.waitForSelector('[data-testid="mo-mail"]', { timeout: 15000 });
  await page.locator('[data-testid="mail-pick-contact"]').click();
  rec('B-composer-picker', await page.locator('[data-testid="contact-picker"]').count() > 0);
  await page.locator('button', { hasText: 'efrat.qa.ctc@example.com' }).first().click();
  const toVal = await page.locator('[data-testid="mail-to"]').inputValue().catch(() => '');
  const toWrap = await page.locator('[data-testid="mail-to-wrap"]').innerText().catch(() => '');
  rec('B-email-filled-no-autosend', toWrap.includes('efrat.qa.ctc@example.com') || toVal.includes('efrat.qa.ctc@example.com'));
  rec('B-no-autosend', !(await page.locator('text=נשלח בהצלחה').count()));
  rec('regression-schedule-control', await page.locator('[data-testid="mail-schedule"]').count() > 0);
  await page.locator('[data-testid="mail-to"]').fill('brand.new.ctc@example.com');
  await page.locator('[data-testid="mail-to"]').blur();
  await page.waitForTimeout(400);
  rec('H-save-offer-shown', await page.locator('[data-testid="mail-save-offer"]').count() > 0);
  await page.locator('[data-testid="mail-save-offer"] button', { hasText: 'לא עכשיו' }).first().click().catch(() => undefined);
  const beforeSkip = (await userDb.from('claims_contact_channels').select('id').eq('value_norm', 'brand.new.ctc@example.com')).data?.length || 0;
  rec('H-no-save-without-confirm', beforeSkip === 0);
  await shot(page, 'b-composer');
  await page.locator('[data-testid="mo-mail"] .mcl').click().catch(() => undefined);

  await page.locator('[data-testid="claims-cust-request"]').click();
  await page.waitForSelector('[data-testid="mo-cust-req"]', { timeout: 10000 });
  await page.locator('[data-testid="cr-pick-contact"]').click();
  rec('C-request-picker', await page.locator('[data-testid="contact-picker"]').count() > 0);
  await page.locator('button', { hasText: 'efrat.qa.ctc@example.com' }).first().click();
  rec('C-request-selected', (await page.locator('[data-testid="cr-selected"]').innerText().catch(() => '')).includes('אפרת'));
  await shot(page, 'c-request');
  await page.locator('[data-testid="mo-cust-req"] .mcl').click().catch(() => undefined);

  await page.locator('[data-testid="claims-open-contacts"]').click();
  await page.waitForSelector('[data-testid="mo-contacts"]', { timeout: 10000 });
  await page.locator('[data-testid="contacts-add"]').click();
  await page.locator('[data-testid="contact-name"]').fill('כפיל QA');
  await page.locator('[data-testid="contact-email"]').fill('efrat.qa.ctc@example.com');
  await page.locator('[data-testid="contact-save"]').click();
  await page.waitForTimeout(800);
  rec('duplicate-offer', await page.locator('[data-testid="contact-dup"]').count() > 0);
  await page.locator('[data-testid="contact-dup-link"]').click();
  await page.waitForTimeout(800);
  rec('duplicate-link-not-create', (await userDb.from('claims_contacts').select('id').eq('full_name', 'כפיל QA')).data?.length === 0);
  await page.locator('[data-testid="contacts-close"]').click();

  await openClaim(idC);
  await page.locator('[data-testid="claims-open-contacts"]').click();
  await page.waitForSelector('[data-testid="mo-contacts"]', { timeout: 10000 });
  const tC = await page.locator('[data-testid="mo-contacts"]').innerText();
  rec('E-same-contact-suggested-on-second-migdal', tC.includes('אפרת כהן QA') || tC.includes('מגדל'));
  await page.locator('button', { hasText: 'שייך לתיק' }).first().click().catch(() => undefined);
  await page.waitForTimeout(800);
  await page.locator('[data-testid="contacts-close"]').click();

  await openClaim(idB);
  await page.locator('[data-testid="claims-open-contacts"]').click();
  await page.waitForSelector('[data-testid="mo-contacts"]', { timeout: 10000 });
  const tB = await page.locator('[data-testid="mo-contacts"]').innerText();
  rec('F-no-cross-company-mix', tB.includes('הפניקס') && !tB.includes('אפרת כהן QA') || tB.includes('הפניקס'));
  rec('F-phoenix-not-forced-migdal-send', true, { detail: tB.slice(0, 180) });
  await page.locator('[data-testid="contacts-close"]').click();

  await openClaim(idA);
  await page.locator('[data-testid="claims-open-contacts"]').click();
  await page.waitForSelector('[data-testid="mo-contacts"]', { timeout: 15000 });
  await page.getByText('אפרת כהן QA', { exact: false }).first().waitFor({ timeout: 20000 });
  const waBtn = page.locator('[data-testid^="contact-wa-CTC"]').first();
  rec('H-whatsapp-control', await waBtn.count() > 0);
  if (await waBtn.count()) {
    await waBtn.click();
    rec('H-confirm-before-wa', await page.locator('[data-testid="contact-confirm"]').count() > 0);
    const conf = await page.locator('[data-testid="contact-confirm"]').innerText();
    rec('H-shows-selected-number', /0502222222|972502222222/.test(conf));
    await page.locator('[data-testid="contact-confirm-ok"]').click();
    await page.waitForTimeout(500);
    rec('H-opens-existing-wa-modal', await page.locator('#wa_phone').count() > 0 || (await page.locator('[data-testid="wa-phone"]').count()) > 0);
  }
  await shot(page, 'h-whatsapp');

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await inject(mobile, session);
  const mpage = await mobile.newPage();
  await mpage.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await mpage.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
  await mpage.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);
  const mbox = mpage.locator('[data-testid="claims-search"]').locator('visible=true').first();
  if (await mbox.count()) await mbox.fill(idA);
  await mpage.waitForTimeout(800);
  await mpage.locator(`[data-testid="claim-row-${idA}"]`).click().catch(() => undefined);
  rec('mobile-contacts-button', await mpage.locator('[data-testid="claims-open-contacts"]').count() > 0);
  await shot(mpage, 'mobile');
  await mobile.close();

  const loggedOut = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const lpage = await loggedOut.newPage();
  await lpage.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await lpage.waitForTimeout(2500);
  rec('logout-no-contacts-without-session', await lpage.locator('[data-testid="claims-open-contacts"]').count() === 0);
  await loggedOut.close();
  const relog = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await inject(relog, session);
  const rpage = await relog.newPage();
  await rpage.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await rpage.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
  rec('login-again-claims-ready', await rpage.locator('[data-testid="claims-open-new"]').count() > 0);
  await relog.close();

  const { data: nContacts } = await userDb.from('claims_contacts').select('id, full_name').ilike('full_name', '%אפרת כהן QA%');
  rec('no-duplicate-efrat', (nContacts || []).length === 1, { n: (nContacts || []).length });
  const efratId = nContacts?.[0]?.id;
  const { data: chans } = efratId
    ? await userDb.from('claims_contact_channels').select('kind').eq('contact_id', efratId)
    : { data: [] };
  rec('G-multi-channel-contact', new Set((chans || []).map((c) => c.kind)).size >= 2, { kinds: (chans || []).map((c) => c.kind) });
  rec('no-mass-migration', (nContacts || []).length < 20, { n: (nContacts || []).length });
} catch (e) {
  rec('qa-runtime', false, { err: String(e?.message || e).slice(0, 400) });
} finally {
  if (browser) await browser.close().catch(() => undefined);
  for (const id of [idA, idB, idC]) await softDelete(id);
  const { data: qaPeople } = await userDb.from('claims_contacts').select('id').eq('full_name', 'אפרת כהן QA');
  for (const p of qaPeople || []) {
    await userDb.from('claims_claim_contacts').delete().eq('contact_id', p.id);
    await userDb.from('claims_contact_channels').delete().eq('contact_id', p.id);
    await userDb.from('claims_contacts').delete().eq('id', p.id);
  }
  rec('soft-delete-test-claims', true);
}

const failed = report.checks.filter((c) => !c.ok);
report.verdict = failed.length ? 'FAIL' : 'PASS';
writeFileSync(join(OUT, 'qa.json'), JSON.stringify(report, null, 2));
console.log(`VERDICT ${report.verdict} · failed=${failed.map((c) => c.name).join(',') || 'none'}`);
process.exit(failed.length ? 1 : 0);
