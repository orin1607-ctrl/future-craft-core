/**
 * Published-Staging truth test before date-label changes.
 * Runs the same alert workflows against one isolated QA vehicle in desktop and
 * mobile viewports, then records what "התראות ושליחות" shows for createdAt
 * versus the future scheduled date. QA rows are removed at the end.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const REF = 'usfeoerkpcafxxlyuldl';
if (REF === 'qasomfndnjuixgjmjwcm') throw new Error('refused: production db');
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-tasks-1-10-staging/alerts-mobile-desktop-date-qa');
mkdirSync(OUT, { recursive: true });

const apiKeys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${REF} -o json`, { encoding: 'utf8' }));
const serviceKey = apiKeys.find((key) => key.name === 'service_role').api_key;
const anonKey =
  apiKeys.find((key) => key.name === 'anon' && key.type === 'legacy')?.api_key ||
  apiKeys.find((key) => key.name === 'anon').api_key;
const url = `https://${REF}.supabase.co`;
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

const runId = Date.now();
const company = `QA-MD-${runId}`;
const email = `qa-md-${runId}@staging-e2e.local`;
const password = `QaMd!${runId}`;
const plate = `MD${String(runId).slice(-6)}`;
const report = {
  at: new Date().toISOString(),
  base: BASE,
  company,
  plate,
  results: [],
  consoleErrors: [],
  supabaseFailures: [],
};
let pass = 0;
let fail = 0;
let userId;
let vehicleId;

const rec = (id, device, name, ok, detail) => {
  report.results.push({ id, device, name, status: ok ? 'PASS' : 'FAIL', detail });
  ok ? (pass += 1) : (fail += 1);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} [${device}] ${name}`, JSON.stringify(detail).slice(0, 360));
};
const wait = async (page, ms = 1700) => {
  await page.waitForTimeout(ms);
  await page.waitForLoadState('networkidle').catch(() => null);
};
const compact = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const displayDate = (value) => {
  const date = new Date(value);
  return [
    String(date.getDate()).padStart(2, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    date.getFullYear(),
  ].join('/');
};

async function makeContext(browser, session, device) {
  const desktop = device === 'desktop';
  const context = await browser.newContext({
    locale: 'he-IL',
    viewport: desktop ? { width: 1500, height: 1100 } : { width: 390, height: 844 },
    isMobile: !desktop,
    hasTouch: !desktop,
    userAgent: desktop
      ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0.0.0 Safari/537.36'
      : 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36',
  });
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    {
      key: `sb-${REF}-auth-token`,
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
  return context;
}

async function triSemi(page, months) {
  await page.goto(
    `${BASE}/private-vehicle-inspection?vehicleId=${vehicleId}&plate=${encodeURIComponent(plate)}&context=vehicle`,
    { waitUntil: 'domcontentloaded', timeout: 120000 },
  );
  await wait(page);
  await page.locator('input[placeholder*="עובד"]').first().fill(`QA Mobile Desktop ${runId}`);
  await page.getByRole('button', { name: new RegExp(`\\+${months} חודשים`) }).first().click();
  await page.waitForTimeout(350);
  await page.getByRole('button', { name: /שמור בדיקה/ }).first().click();
  await wait(page, 4300);
  return compact((await page.locator('[data-sonner-toast], [role="status"]').allInnerTexts()).join(' | '));
}

async function createManual(page, typeLabel, title, dueDate) {
  await page.goto(
    `${BASE}/vehicles?vehicleId=${vehicleId}&view=hub&hubSection=actions&hubTab=alerts`,
    { waitUntil: 'domcontentloaded', timeout: 120000 },
  );
  await wait(page);
  await page.getByRole('button', { name: /הוסף התראה/ }).first().click();
  await page.waitForTimeout(700);
  const modal = page.locator('div.fixed.inset-0.z-50').last();
  await modal.getByRole('button', { name: new RegExp(typeLabel) }).first().click();
  await modal.getByPlaceholder('כותרת ההתראה...').fill(title);
  await modal.locator('input[type="date"]').first().fill(dueDate);
  await modal.getByRole('button', { name: /צור התראה/ }).first().click();
  await wait(page, 3000);
  return compact((await page.locator('[data-sonner-toast], [role="status"]').allInnerTexts()).join(' | '));
}

async function centralAlertVisible(page, category, title) {
  await page.goto(`${BASE}/alerts?plate=${encodeURIComponent(plate)}&category=${category}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await wait(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await wait(page);
  await page.getByText(title, { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => null);
  return (await page.locator('body').innerText()).includes(title);
}

async function futureLogText(page, title) {
  await page.goto(
    `${BASE}/alerts/log?vehicleId=${vehicleId}&plate=${encodeURIComponent(plate)}&tab=future`,
    { waitUntil: 'domcontentloaded', timeout: 120000 },
  );
  await wait(page);
  const card = page.locator('div.rounded-xl.border').filter({ hasText: title }).first();
  await card.waitFor({ state: 'visible', timeout: 15000 }).catch(() => null);
  return compact(await card.innerText().catch(() => ''));
}

const browser = await chromium.launch({ headless: true });
try {
  const deployTxt = (await fetch(`${BASE}/STAGING-DEPLOY.txt?t=${Date.now()}`).then((r) => r.text())).trim();
  const commit = execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim();
  const desktopIndex = await fetch(`${BASE}/index.html?t=${Date.now()}`, {
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140 Safari/537.36' },
  }).then((r) => r.text());
  const mobileIndex = await fetch(`${BASE}/index.html?t=${Date.now() + 1}`, {
    headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 15) Chrome/140 Mobile Safari/537.36' },
  }).then((r) => r.text());
  const asset = (html) => html.match(/assets\/index-[^"'<>]+\.js/)?.[0] || null;
  report.deploy = { deployTxt, commit, desktopAsset: asset(desktopIndex), mobileAsset: asset(mobileIndex) };
  rec(
    'deploy',
    'both',
    'Pages commit and hashed bundle are identical on mobile and desktop',
    deployTxt.includes(commit) && asset(desktopIndex) === asset(mobileIndex),
    report.deploy,
  );

  await admin.from('company_settings').insert({
    company_name: company,
    reminder_30_days: true,
    reminder_7_days: true,
    reminder_1_day: true,
    hidden_buttons: [],
  });
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  await admin.from('profiles').upsert({
    id: userId,
    full_name: `QA Mobile Desktop ${runId}`,
    company_name: company,
    phone: '0500000044',
    is_active: true,
    approval_status: 'approved',
    two_factor_approved: true,
  });
  await admin.from('user_roles').delete().eq('user_id', userId);
  await admin.from('user_roles').insert({ user_id: userId, role: 'fleet_manager' });
  const vehicle = await admin
    .from('vehicles')
    .insert({
      license_plate: plate,
      internal_number: '96',
      manufacturer: 'QaFord',
      model: 'Focus',
      company_name: company,
      status: 'active',
      year: 2024,
    })
    .select('id')
    .single();
  if (vehicle.error) throw vehicle.error;
  vehicleId = vehicle.data.id;

  const auth = await anon.auth.signInWithPassword({ email, password });
  if (auth.error) throw auth.error;
  const contexts = {};
  const pages = {};
  for (const device of ['desktop', 'mobile']) {
    contexts[device] = await makeContext(browser, auth.data.session, device);
    pages[device] = await contexts[device].newPage();
    pages[device].on('console', (message) => {
      if (message.type() === 'error') report.consoleErrors.push({ device, text: message.text().slice(0, 300) });
    });
    pages[device].on('response', async (response) => {
      if (response.status() < 400 || !response.url().includes('supabase.co')) return;
      report.supabaseFailures.push({ device, status: response.status(), url: response.url().slice(0, 220) });
    });
  }

  const expected = { 3: '2026-11-14', 6: '2027-02-14' };
  for (const months of [3, 6]) {
    for (const device of ['desktop', 'mobile']) {
      const page = pages[device];
      const toast = await triSemi(page, months);
      const alert = await admin
        .from('custom_alerts')
        .select('id, created_at, alert_date, company_name, alert_type, description, is_active')
        .eq('company_name', company)
        .eq('alert_type', 'officer')
        .eq('title', `התראת קצין רכב · ${plate}`)
        .eq('is_active', true)
        .maybeSingle();
      const visible = await centralAlertVisible(page, 'officer', `התראת קצין רכב · ${plate}`);
      const due = String(alert.data?.alert_date || '').slice(0, 10);
      rec(
        `tri-${months}`,
        device,
        `tri/semi +${months} saves and remains visible after refresh`,
        /נוצרה התראת קצין רכב/.test(toast) &&
          !/לא נוצרה/.test(toast) &&
          due === expected[months] &&
          alert.data?.company_name === company &&
          visible,
        { toast, due, expected: expected[months], company: alert.data?.company_name, visible },
      );
    }
  }

  const manualCases = [
    { type: 'התראת קצין רכב', category: 'officer', key: 'officer', days: 47 },
    { type: 'התראה חופשית', category: 'free', key: 'free', days: 39 },
  ];
  for (const device of ['desktop', 'mobile']) {
    for (const item of manualCases) {
      const dueDate = new Date(Date.now() + item.days * 86400000).toISOString().slice(0, 10);
      const title = `MD ${item.key} ${device} ${runId}`;
      const toast = await createManual(pages[device], item.type, title, dueDate);
      const row = await admin
        .from('custom_alerts')
        .select('id, created_at, alert_date, company_name, alert_type, is_active')
        .eq('company_name', company)
        .like('title', `${title}%`)
        .maybeSingle();
      const visible = await centralAlertVisible(pages[device], item.category, title);
      const logText = await futureLogText(pages[device], title);
      rec(
        `manual-${item.key}`,
        device,
        `${item.type} saves, remains visible, and labels both dates`,
        !/שגיאה/.test(toast) &&
          row.data?.alert_type === item.key &&
          row.data?.company_name === company &&
          String(row.data?.alert_date || '').slice(0, 10) === dueDate &&
          visible &&
          logText.includes(`מועד ההתראה: ${displayDate(dueDate)}`) &&
          logText.includes('נוצרה:'),
        {
          toast,
          dueDate,
          createdAt: row.data?.created_at,
          visible,
          logText,
          showsCreatedLabel: /נוצרה/.test(logText),
          showsScheduledLabel: /מועד ההתראה/.test(logText),
          showsLegacyScheduledText: /מתוזמן ל/.test(logText),
        },
      );
      if (device === 'desktop' && item.key === 'officer') {
        await pages[device].screenshot({ path: join(OUT, 'after-desktop-future.png'), fullPage: true }).catch(() => null);
      }
      if (device === 'mobile' && item.key === 'officer') {
        await pages[device].screenshot({ path: join(OUT, 'after-mobile-future.png'), fullPage: true }).catch(() => null);
      }
    }
  }

  // Move one manual row to history and record the current labels there.
  const historyTitle = `MD officer desktop ${runId}`;
  const historyRow = await admin
    .from('custom_alerts')
    .select('id, created_at, alert_date')
    .eq('company_name', company)
    .like('title', `${historyTitle}%`)
    .maybeSingle();
  await admin.from('custom_alerts').update({ is_active: false }).eq('id', historyRow.data.id);
  for (const device of ['desktop', 'mobile']) {
    const page = pages[device];
    await page.goto(
      `${BASE}/alerts/log?vehicleId=${vehicleId}&plate=${encodeURIComponent(plate)}&tab=history`,
      { waitUntil: 'domcontentloaded', timeout: 120000 },
    );
    await wait(page);
    const card = page.locator('div.rounded-xl.border').filter({ hasText: historyTitle }).first();
    await card.waitFor({ state: 'visible', timeout: 15000 }).catch(() => null);
    const text = compact(await card.innerText().catch(() => ''));
    rec(
      'history-dates',
      device,
      'history retains and labels the scheduled and creation dates separately',
      text.includes(historyTitle) &&
        text.includes(`מועד ההתראה: ${displayDate(historyRow.data.alert_date)}`) &&
        text.includes('נוצרה:'),
      {
        text,
        createdAt: historyRow.data.created_at,
        scheduledFor: historyRow.data.alert_date,
        showsCreatedLabel: /נוצרה/.test(text),
        showsScheduledLabel: /מועד ההתראה/.test(text),
      },
    );
  }

  for (const context of Object.values(contexts)) await context.close();
  rec(
    'runtime',
    'both',
    'no Supabase failures during desktop and mobile flows',
    report.supabaseFailures.length === 0,
    { supabaseFailures: report.supabaseFailures, consoleErrors: report.consoleErrors.slice(0, 6) },
  );
} catch (error) {
  report.fatal = String(error?.stack || error);
  fail += 1;
  console.error(error);
} finally {
  await browser.close().catch(() => null);
  try {
    await admin.from('custom_alerts').delete().eq('company_name', company);
    await admin.from('vehicle_inspections').delete().eq('company_name', company);
    await admin.from('vehicle_tasks').delete().eq('company_name', company);
    if (vehicleId) await admin.from('vehicles').delete().eq('id', vehicleId);
    await admin.from('company_settings').delete().eq('company_name', company);
    if (userId) {
      await admin.from('user_roles').delete().eq('user_id', userId);
      await admin.from('profiles').delete().eq('id', userId);
      await admin.auth.admin.deleteUser(userId).catch(() => null);
    }
    report.cleanup = { ok: true, scope: `${company} only` };
  } catch (cleanupError) {
    report.cleanup = { ok: false, error: String(cleanupError) };
  }
}

report.summary = { pass, fail };
writeFileSync(join(OUT, 'after-report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(`\nPASS ${pass} / FAIL ${fail}`);
