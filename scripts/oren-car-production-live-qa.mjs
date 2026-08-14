/**
 * Post-deploy live QA on dalia-car.online (Production).
 * Run AFTER dist swap on VPS.
 * node scripts/oren-car-production-live-qa.mjs
 */
import { chromium, devices } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PROD_URL = `https://${PROD_REF}.supabase.co`;
const BASE = 'https://dalia-car.online';
const EMAIL = 'k.auto@beeri.co.il';
const COMPANY = 'קיבוץ בארי';
const OUT = join(ROOT, 'docs/audit-reports/oren-car-production-deploy/live-qa');
mkdirSync(join(OUT, 'screenshots'), { recursive: true });

const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${PROD_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anon = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key;
const admin = createClient(PROD_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

const report = { at: new Date().toISOString(), base: BASE, regression: {}, tasks: {}, consoleErrors: [], networkErrors: [] };

async function injectSession(context) {
  const anonClient = createClient(PROD_URL, anon);
  const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
  const { data: auth } = await anonClient.auth.verifyOtp({ email: EMAIL, token: linkData.properties.email_otp, type: 'email' });
  const ref = new URL(PROD_URL).hostname.split('.')[0];
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: `sb-${ref}-auth-token`, value: { access_token: auth.session.access_token, refresh_token: auth.session.refresh_token, expires_at: auth.session.expires_at, expires_in: auth.session.expires_in, token_type: auth.session.token_type, user: auth.session.user } },
  );
}

async function counts() {
  const v = await admin.from('vehicles').select('id,license_plate', { count: 'exact', head: false }).eq('company_name', COMPANY);
  const d = await admin.from('drivers').select('id', { count: 'exact', head: true }).eq('company_name', COMPANY);
  const a = await admin.from('vehicles').select('id', { count: 'exact', head: true }).eq('company_name', COMPANY).not('assigned_driver_id', 'is', null);
  const other = await admin.from('vehicles').select('id', { count: 'exact', head: true }).neq('company_name', COMPANY);
  const extra = (v.data || []).find((x) => x.license_plate === '66645504');
  const plates = v.data || [];
  const dup = plates.filter((p, i, a) => a.findIndex((x) => x.license_plate === p.license_plate) !== i);
  return { vehicles: v.count, drivers: d.count, assignments: a.count, otherVehicles: other.count, extra66645504: !!extra, duplicatePlates: dup.length };
}

async function runViewport(device, label) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ ...device, locale: 'he-IL' });
  await injectSession(ctx);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(`[${label}] ${m.text().slice(0, 200)}`); });
  page.on('response', (r) => { if (r.url().includes('supabase.co') && r.status() >= 400) report.networkErrors.push(`[${label}] ${r.status()} ${r.url().slice(0, 120)}`); });

  await page.goto(`${BASE}/vehicles`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2000);
  const body = await page.locator('body').innerText();
  report.tasks[label] = {
    listsButton: body.includes('רשימות טיפול'),
    deptFilter: (await page.locator('select').count()) > 0,
    vehicleCount: (body.match(/\d+/g) || []).length > 0,
  };
  await page.screenshot({ path: join(OUT, 'screenshots', `${label}-vehicles.png`), fullPage: true });

  await page.goto(`${BASE}/drivers`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2000);
  const dbody = await page.locator('body').innerText();
  report.tasks[label].driversPanel = dbody.includes('מסמכי נהג');
  report.tasks[label].deptDropdown = (await page.locator('select').count()) > 0;
  await page.screenshot({ path: join(OUT, 'screenshots', `${label}-drivers.png`), fullPage: true });

  await browser.close();
}

async function main() {
  const html = await (await fetch(BASE)).text();
  report.bundleLive = html.match(/assets\/(index-[^"']+\.js)/)?.[1] || null;
  report.regression = await counts();
  report.regression.ok = report.regression.vehicles === 300 && report.regression.drivers === 33 && report.regression.assignments === 36 && report.regression.extra66645504 && report.regression.duplicatePlates === 0;

  await runViewport(devices['Desktop Chrome'], 'desktop');
  await runViewport(devices['iPhone 13'], 'mobile');

  report.pass = report.regression.ok && report.consoleErrors.length === 0;
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
