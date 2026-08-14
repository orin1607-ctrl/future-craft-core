/**
 * Reproduce the owner's own alerts screen on published Staging: a super admin
 * scoped to the real company that reported the problem. Read-only — the script
 * only browses and reads; the temporary QA super admin is deleted at the end.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const COMPANY = process.argv[2] || 'קיבוץ בארי';
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-tasks-1-10-staging/alerts-live-diagnose');
mkdirSync(OUT, { recursive: true });

const arr = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = arr.find((k) => k.name === 'service_role').api_key;
const anonKey = arr.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || arr.find((k) => k.name === 'anon').api_key;
const url = `https://${STAGING_REF}.supabase.co`;
const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

const runId = Date.now();
const email = `qa-view-sa-${runId}@staging-e2e.local`;
const password = `QaView!${runId}`;
const out = { at: new Date().toISOString(), company: COMPANY, consoleErrors: [], failedRequests: [] };
let userId = null;

try {
  // what the alerts screen should be able to show for this company
  const { data: officerAlerts } = await admin
    .from('custom_alerts')
    .select('title, alert_type, alert_date, is_active, description')
    .eq('company_name', COMPANY)
    .eq('is_active', true)
    .in('alert_type', ['officer', 'free', 'service'])
    .order('created_at', { ascending: false })
    .limit(20);
  out.expectedAlerts = officerAlerts;

  const insp = await admin
    .from('vehicle_inspections')
    .select('id, vehicle_id, vehicle_plate, inspection_date, next_due_date, company_name')
    .eq('company_name', COMPANY)
    .order('inspection_date', { ascending: false })
    .limit(10);
  out.inspections = { error: insp.error?.message || null, rows: insp.data || [] };

  const { data: settings } = await admin
    .from('company_settings')
    .select('company_name, reminder_30_days, reminder_7_days, reminder_1_day')
    .eq('company_name', COMPANY)
    .maybeSingle();
  out.companySettings = settings || null;

  const plates = [...new Set((officerAlerts || []).map((a) => String(a.description || '').match(/vplate:([^\n|]+)/)?.[1]?.trim()).filter(Boolean))];
  if (plates.length) {
    const { data: vehicleRows } = await admin
      .from('vehicles')
      .select('license_plate, company_name, next_inspection_date')
      .in('license_plate', plates);
    out.vehicles = vehicleRows || [];
  }

  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  await admin.from('profiles').upsert({
    id: userId,
    full_name: `QA View Super ${runId}`,
    company_name: null,
    is_active: true,
    approval_status: 'approved',
    two_factor_approved: true,
  });
  await admin.from('user_roles').delete().eq('user_id', userId);
  await admin.from('user_roles').insert({ user_id: userId, role: 'super_admin' });

  const { data: auth, error: authErr } = await anon.auth.signInWithPassword({ email, password });
  if (authErr) throw authErr;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'he-IL', viewport: { width: 1500, height: 1200 } });
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
  page.on('console', (m) => {
    if (m.type() === 'error') out.consoleErrors.push(m.text().slice(0, 400));
  });
  page.on('pageerror', (e) => out.consoleErrors.push(`pageerror: ${String(e.message).slice(0, 400)}`));
  page.on('response', async (res) => {
    if (res.status() < 400 || !res.url().includes('supabase.co')) return;
    let body = '';
    try { body = (await res.text()).slice(0, 400); } catch { body = '<unreadable>'; }
    out.failedRequests.push({ status: res.status(), url: res.url().slice(0, 260), body });
  });

  await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(4000);
  await page.waitForLoadState('networkidle').catch(() => null);

  // select the company the same way the owner does, through the scope picker
  const picker = page.locator('select').filter({ hasText: COMPANY }).first();
  if (await picker.count()) {
    await picker.selectOption({ label: COMPANY }).catch(async () => {
      const value = await picker.locator(`option:has-text("${COMPANY}")`).first().getAttribute('value');
      if (value) await picker.selectOption(value);
    });
  } else {
    out.pickerFound = false;
  }
  await page.waitForTimeout(6000);
  await page.waitForLoadState('networkidle').catch(() => null);

  const text = await page.locator('body').innerText();
  out.screenSaysAllClear = text.includes('הכל תקין');
  out.categoryButtons = (await page.getByRole('button').allInnerTexts()).filter((t) => /\(\d+\)/.test(t)).slice(0, 20);
  out.officerRowsVisible = await page.locator('tr').filter({ hasText: 'התראת קצין רכב' }).count();
  out.expectedTitlesFound = (officerAlerts || [])
    .filter((a) => a.alert_type === 'officer')
    .map((a) => ({ title: a.title, visible: text.includes(a.title) }));
  await page.screenshot({ path: join(OUT, 'owner-view-alerts.png'), fullPage: true }).catch(() => null);

  // and the same screen filtered to the officer category
  const officerFilter = page.getByRole('button', { name: /התראת קצין רכב/ }).first();
  if (await officerFilter.count()) {
    await officerFilter.click();
    await page.waitForTimeout(2500);
    out.officerFilterRows = await page.locator('tr').filter({ hasText: 'התראת קצין רכב' }).count();
    await page.screenshot({ path: join(OUT, 'owner-view-officer-filter.png'), fullPage: true }).catch(() => null);
  }

  await context.close();
  await browser.close();
} catch (e) {
  out.fatal = String(e?.stack || e);
} finally {
  if (userId) {
    await admin.from('user_roles').delete().eq('user_id', userId);
    await admin.from('profiles').delete().eq('id', userId);
    await admin.auth.admin.deleteUser(userId).catch(() => null);
  }
}

writeFileSync(join(OUT, 'owner-view-repro.json'), JSON.stringify(out, null, 2), 'utf8');
console.log(JSON.stringify({
  company: out.company,
  companySettings: out.companySettings,
  inspections: { error: out.inspections?.error, count: out.inspections?.rows?.length },
  vehicles: out.vehicles,
  screenSaysAllClear: out.screenSaysAllClear,
  categoryButtons: out.categoryButtons,
  officerRowsVisible: out.officerRowsVisible,
  officerFilterRows: out.officerFilterRows,
  expectedTitlesFound: out.expectedTitlesFound,
  failedRequests: out.failedRequests,
  consoleErrors: out.consoleErrors,
  fatal: out.fatal,
}, null, 2));
