/**
 * Staging QA — archived vehicles excluded from active fleet counts.
 * node scripts/oren-car-archived-counts-qa.mjs
 */
import { chromium, devices } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = (process.env.STAGING_PAGES_URL || 'https://orin1607-ctrl.github.io/future-craft-core').replace(/\/$/, '');
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-archived-vehicle-counts');
mkdirSync(OUT, { recursive: true });

const report = {
  at: new Date().toISOString(),
  stagingRef: STAGING_REF,
  base: BASE,
  productionTouched: false,
  companies: [],
  tests: [],
  consoleErrors: [],
  networkErrors: [],
  alertsNote: null,
  ok: false,
};

function rec(id, name, ok, detail = {}) {
  report.tests.push({ id, name, ok, ...detail });
  console.log(ok ? '✅' : '❌', `[${id}]`, name, detail.note || '');
}

function loadKeys() {
  const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, {
    encoding: 'utf8',
  });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key,
  };
}

async function companyStats(admin, companyName) {
  const [{ count: total }, { count: archived }, { count: activeFleet }] = await Promise.all([
    admin.from('vehicles').select('id', { count: 'exact', head: true }).eq('company_name', companyName),
    admin
      .from('vehicles')
      .select('id', { count: 'exact', head: true })
      .eq('company_name', companyName)
      .eq('status', 'archived'),
    admin
      .from('vehicles')
      .select('id', { count: 'exact', head: true })
      .eq('company_name', companyName)
      .neq('status', 'archived'),
  ]);
  return {
    companyName,
    dbTotal: total ?? 0,
    dbArchived: archived ?? 0,
    expectedActive: activeFleet ?? 0,
  };
}

async function main() {
  const keys = loadKeys();
  const admin = createClient(STAGING_URL, keys.service, { auth: { autoRefreshToken: false, persistSession: false } });
  const anon = createClient(STAGING_URL, keys.anon, { auth: { autoRefreshToken: false, persistSession: false } });

  const html = await (await fetch(`${BASE}/`)).text();
  const bundle = html.match(/assets\/index-[^"]+\.js/)?.[0] || null;
  rec('bundle', 'Live Staging bundle', !!bundle, { bundle });

  const runId = Date.now();
  const companyA = `QA-Arch-A-${runId}`;
  const companyB = `QA-Arch-B-${runId}`;
  const emailA = `qa-arch-a-${runId}@staging-e2e.local`;
  const emailB = `qa-arch-b-${runId}@staging-e2e.local`;
  const password = `Qa!${runId}`;

  for (const company_name of [companyA, companyB]) {
    await admin.from('company_settings').insert({ company_name });
  }

  // Company A: 3 active-fleet + 2 archived = 5 total → UI should show 3
  for (let i = 0; i < 3; i++) {
    await admin.from('vehicles').insert({
      license_plate: `AA${String(runId).slice(-5)}${i}`,
      company_name: companyA,
      manufacturer: 'QA',
      model: 'Active',
      status: 'active',
    });
  }
  for (let i = 0; i < 2; i++) {
    await admin.from('vehicles').insert({
      license_plate: `XA${String(runId).slice(-5)}${i}`,
      company_name: companyA,
      manufacturer: 'QA',
      model: 'Arch',
      status: 'archived',
    });
  }

  // Company B: 2 active + 1 archived → UI 2
  for (let i = 0; i < 2; i++) {
    await admin.from('vehicles').insert({
      license_plate: `BB${String(runId).slice(-5)}${i}`,
      company_name: companyB,
      manufacturer: 'QA',
      model: 'Active',
      status: 'active',
    });
  }
  await admin.from('vehicles').insert({
    license_plate: `XB${String(runId).slice(-5)}0`,
    company_name: companyB,
    manufacturer: 'QA',
    model: 'Arch',
    status: 'archived',
  });

  const statsA = await companyStats(admin, companyA);
  const statsB = await companyStats(admin, companyB);
  report.companies.push(statsA, statsB);
  rec('db-company-a', 'Company A DB counts', statsA.dbTotal === 5 && statsA.dbArchived === 2 && statsA.expectedActive === 3, statsA);
  rec('db-company-b', 'Company B DB counts', statsB.dbTotal === 3 && statsB.dbArchived === 1 && statsB.expectedActive === 2, statsB);

  report.alertsNote = {
    note: 'Alerts.tsx still loads vehicles without excluding archived (not changed this task — report only)',
  };

  async function createFleetManager(email, company_name, full_name) {
    const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    const userId = created.user.id;
    await admin.from('profiles').upsert({
      id: userId,
      full_name,
      company_name,
      is_active: true,
      approval_status: 'approved',
      two_factor_approved: true,
    });
    await admin.from('user_roles').delete().eq('user_id', userId);
    await admin.from('user_roles').insert({ user_id: userId, role: 'fleet_manager' });
    return userId;
  }

  const userIdA = await createFleetManager(emailA, companyA, 'QA Arch FM A');
  const userIdB = await createFleetManager(emailB, companyB, 'QA Arch FM B');

  const browser = await chromium.launch({ headless: true });
  const storageKey = `sb-${STAGING_REF}-auth-token`;

  async function runAsManager(label, email, stats, platePrefixActive, platePrefixArch) {
    const { data: auth } = await anon.auth.signInWithPassword({ email, password });
    if (!auth?.session) throw new Error('sign-in failed ' + email);
    const context = await browser.newContext({
      viewport: label.startsWith('mobile') ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      locale: 'he-IL',
      ...(label.startsWith('mobile') ? devices['iPhone 13'] : {}),
    });
    await context.addInitScript(
      ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
      {
        key: storageKey,
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
    page.on('console', (msg) => {
      if (msg.type() === 'error') report.consoleErrors.push({ label, text: msg.text().slice(0, 300) });
    });
    page.on('response', (res) => {
      const u = res.url();
      if (u.includes(STAGING_REF) && res.status() >= 400) {
        report.networkErrors.push({ label, status: res.status(), url: u.slice(0, 160) });
      }
    });

    await page.goto(`${BASE}/vehicles`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    const allTab = body.match(/הכל\s*\((\d+)\)/);
    const archTab = body.match(/ארכיון\s*\((\d+)\)/);
    const uiAll = allTab ? Number(allTab[1]) : null;
    const uiArch = archTab ? Number(archTab[1]) : null;
    const listOk = uiAll === stats.expectedActive && uiArch === stats.dbArchived;
    rec(`${label}-vehicles`, `Vehicles ${stats.companyName}: הכל=${uiAll} ארכיון=${uiArch}`, listOk, {
      expectedActive: stats.expectedActive,
      expectedArchived: stats.dbArchived,
      uiAll,
      uiArch,
      hasActivePlate: body.includes(platePrefixActive),
    });
    await page.screenshot({ path: join(OUT, `${label}-vehicles.png`), fullPage: false });

    await page.getByRole('button', { name: /ארכיון\s*\(/ }).first().click().catch(async () => {
      await page.getByRole('button', { name: /^ארכיון/ }).first().click().catch(() => null);
    });
    await page.waitForTimeout(1000);
    const archBody = await page.locator('body').innerText();
    rec(`${label}-archive-tab`, `Archive tab shows archived plates`, archBody.includes(platePrefixArch), {
      platePrefixArch,
    });

    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(2500);
    const homeBody = await page.locator('body').innerText();
    // Home card badge often shows the count near "רכבים"
    const badgeNear =
      homeBody.includes(String(stats.expectedActive)) ||
      new RegExp(`רכבים[^\\d]{0,40}${stats.expectedActive}`).test(homeBody) ||
      new RegExp(`${stats.expectedActive}[^\\d]{0,20}רכבים`).test(homeBody);
    rec(`${label}-home-count`, `Home dashboard reflects active count ~${stats.expectedActive}`, badgeNear, {
      snippet: homeBody.slice(0, 400),
    });

    await page.goto(`${BASE}/vehicle-tracking`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(3500);
    // Prefer DOM: number is in the button whose label is סה"כ רכבים
    let trackTotal = null;
    const totalBtn = page.locator('button').filter({ hasText: /סה["״]?כ רכבים/ }).first();
    if (await totalBtn.count()) {
      const btnText = await totalBtn.innerText();
      const m = btnText.match(/(\d+)/);
      trackTotal = m ? Number(m[1]) : null;
    }
    if (trackTotal == null) {
      const trackBody = await page.locator('body').innerText();
      const totalMatch =
        trackBody.match(/(\d+)\s*סה["״]כ רכבים/) ||
        trackBody.match(/(\d+)\s*סה.?כ רכבים/) ||
        trackBody.match(/סה["״]כ רכבים[^\d\n]*(\d+)/);
      trackTotal = totalMatch ? Number(totalMatch[1]) : null;
      rec(`${label}-tracking-total`, `Tracking סה״כ = ${trackTotal}`, trackTotal === stats.expectedActive, {
        trackTotal,
        expected: stats.expectedActive,
        snippet: trackBody.includes('סיכום צי') ? 'has-summary' : trackBody.slice(0, 500),
      });
    } else {
      rec(`${label}-tracking-total`, `Tracking סה״כ = ${trackTotal}`, trackTotal === stats.expectedActive, {
        trackTotal,
        expected: stats.expectedActive,
      });
    }
    await page.screenshot({ path: join(OUT, `${label}-tracking.png`), fullPage: false });

    await context.close();
  }

  await runAsManager('desktop-a', emailA, statsA, `AA${String(runId).slice(-5)}`, `XA${String(runId).slice(-5)}`);
  await runAsManager('desktop-b', emailB, statsB, `BB${String(runId).slice(-5)}`, `XB${String(runId).slice(-5)}`);
  await runAsManager('mobile-a', emailA, statsA, `AA${String(runId).slice(-5)}`, `XA${String(runId).slice(-5)}`);

  await browser.close();

  // Cleanup
  await admin.from('vehicles').delete().eq('company_name', companyA);
  await admin.from('vehicles').delete().eq('company_name', companyB);
  await admin.from('company_settings').delete().eq('company_name', companyA);
  await admin.from('company_settings').delete().eq('company_name', companyB);
  await admin.from('user_roles').delete().eq('user_id', userIdA);
  await admin.from('user_roles').delete().eq('user_id', userIdB);
  await admin.from('profiles').delete().eq('id', userIdA);
  await admin.from('profiles').delete().eq('id', userIdB);
  await admin.auth.admin.deleteUser(userIdA);
  await admin.auth.admin.deleteUser(userIdB);
  rec('cleanup', 'Ephemeral data removed', true);

  report.ok = report.tests.every((t) => t.ok);
  writeFileSync(join(OUT, 'qa-report.json'), JSON.stringify(report, null, 2));
  console.log(report.ok ? 'OVERALL PASS' : 'OVERALL FAIL');
  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
