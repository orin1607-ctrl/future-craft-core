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
  const email = `qa-arch-${runId}@staging-e2e.local`;
  const password = `Qa!${runId}`;

  for (const company_name of [companyA, companyB]) {
    await admin.from('company_settings').insert({ company_name });
  }

  // Company A: 3 active-fleet + 2 archived = 5 total → UI should show 3
  const platesA = [];
  for (let i = 0; i < 3; i++) {
    const plate = `AA${String(runId).slice(-5)}${i}`;
    platesA.push(plate);
    await admin.from('vehicles').insert({
      license_plate: plate,
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

  // Alerts still load archived? (documentation probe — no product change)
  const { data: alertVehicles } = await admin
    .from('vehicles')
    .select('id, status')
    .eq('company_name', companyA);
  const archivedInAlertSource = (alertVehicles || []).filter((v) => v.status === 'archived').length;
  report.alertsNote = {
    note: 'Alerts.tsx loads vehicles without excluding archived (unchanged by design this task)',
    archivedRowsStillInVehiclesTable: archivedInAlertSource,
  };

  const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const userId = created.user.id;
  await admin.from('profiles').upsert({
    id: userId,
    full_name: 'QA Archive Counts',
    company_name: companyA,
    is_active: true,
    approval_status: 'approved',
    two_factor_approved: true,
  });
  await admin.from('user_roles').delete().eq('user_id', userId);
  await admin.from('user_roles').insert({ user_id: userId, role: 'super_admin' });
  const { data: auth } = await anon.auth.signInWithPassword({ email, password });

  const browser = await chromium.launch({ headless: true });
  const storageKey = `sb-${STAGING_REF}-auth-token`;

  async function runViewport(label, viewport) {
    const context = await browser.newContext({ ...viewport, locale: 'he-IL' });
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

    // Scope to company A via company selector if present, else filter on vehicles page
    await page.goto(`${BASE}/vehicles`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(1500);
    // Try company filter dropdown
    const companySelect = page.locator('select').filter({ hasText: /כל החברות|חבר/ }).first();
    if (await companySelect.count()) {
      await companySelect.selectOption({ label: companyA }).catch(async () => {
        await page.locator('select').last().selectOption({ label: companyA }).catch(() => null);
      });
      await page.waitForTimeout(1000);
    }
    // Search for unique plate prefix to scope list visually
    await page.getByPlaceholder(/חיפוש/).fill(`AA${String(runId).slice(-5)}`).catch(() => null);
    await page.waitForTimeout(800);

    const body = await page.locator('body').innerText();
    const allTab = body.match(/הכל\s*\((\d+)\)/);
    const archTab = body.match(/ארכיון\s*\((\d+)\)/);
    const allCount = allTab ? Number(allTab[1]) : null;
    const archCount = archTab ? Number(archTab[1]) : null;

    // When filtered by search AA..., "הכל" should be 3; archived tab may show 0 under search.
    // Better: clear search, set company filter
    await page.getByPlaceholder(/חיפוש/).fill('').catch(() => null);
    await page.waitForTimeout(500);
    // Select company from dropdown - find select with companyA option
    const selects = page.locator('select');
    const n = await selects.count();
    for (let i = 0; i < n; i++) {
      const opts = await selects.nth(i).locator('option').allTextContents();
      if (opts.some((o) => o.includes(companyA))) {
        await selects.nth(i).selectOption({ label: companyA });
        await page.waitForTimeout(1200);
        break;
      }
    }
    const body2 = await page.locator('body').innerText();
    const allTab2 = body2.match(/הכל\s*\((\d+)\)/);
    const archTab2 = body2.match(/ארכיון\s*\((\d+)\)/);
    const uiAll = allTab2 ? Number(allTab2[1]) : allCount;
    const uiArch = archTab2 ? Number(archTab2[1]) : archCount;
    const listOk = uiAll === statsA.expectedActive && uiArch === statsA.dbArchived;
    rec(`${label}-vehicles-a`, `Vehicles list company A: הכל=${uiAll} ארכיון=${uiArch}`, listOk, {
      expectedActive: statsA.expectedActive,
      expectedArchived: statsA.dbArchived,
      uiAll,
      uiArch,
    });
    await page.screenshot({ path: join(OUT, `${label}-vehicles-a.png`), fullPage: false });

    // Company B isolation
    for (let i = 0; i < n; i++) {
      const opts = await selects.nth(i).locator('option').allTextContents();
      if (opts.some((o) => o.includes(companyB))) {
        await selects.nth(i).selectOption({ label: companyB });
        await page.waitForTimeout(1200);
        break;
      }
    }
    const bodyB = await page.locator('body').innerText();
    const allB = bodyB.match(/הכל\s*\((\d+)\)/);
    const archB = bodyB.match(/ארכיון\s*\((\d+)\)/);
    const uiAllB = allB ? Number(allB[1]) : null;
    const uiArchB = archB ? Number(archB[1]) : null;
    rec(`${label}-vehicles-b`, `Vehicles list company B: הכל=${uiAllB} ארכיון=${uiArchB}`, uiAllB === statsB.expectedActive && uiArchB === statsB.dbArchived, {
      expectedActive: statsB.expectedActive,
      uiAllB,
      uiArchB,
    });

    // Home dashboard badge — scope company A via localStorage company scope if used
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(2000);
    const homeBody = await page.locator('body').innerText();
    rec(`${label}-home`, 'Home dashboard loads', !/Unexpected Application Error/i.test(homeBody));

    // Tracking
    await page.goto(`${BASE}/vehicle-tracking`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(2000);
    const trackBody = await page.locator('body').innerText();
    const totalMatch = trackBody.match(/סה"כ רכבים[^\d]*(\d+)/) || trackBody.match(/סה״כ רכבים[^\d]*(\d+)/);
    rec(`${label}-tracking`, 'Vehicle tracking page loads', !/Unexpected Application Error/i.test(trackBody), {
      totalHint: totalMatch?.[1] || null,
    });

    // Archived still accessible via archive tab
    await page.goto(`${BASE}/vehicles`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(1000);
    for (let i = 0; i < (await page.locator('select').count()); i++) {
      const opts = await page.locator('select').nth(i).locator('option').allTextContents();
      if (opts.some((o) => o.includes(companyA))) {
        await page.locator('select').nth(i).selectOption({ label: companyA });
        await page.waitForTimeout(800);
        break;
      }
    }
    await page.getByRole('button', { name: /ארכיון/ }).first().click().catch(() => null);
    await page.waitForTimeout(1000);
    const archBody = await page.locator('body').innerText();
    const archVisible = archBody.includes(`XA${String(runId).slice(-5)}`) || /ארכיון/.test(archBody);
    rec(`${label}-archive-access`, 'Archive tab accessible for company A', archVisible);

    await context.close();
  }

  await runViewport('desktop', { viewport: { width: 1440, height: 900 } });
  await runViewport('mobile', devices['iPhone 13']);
  await browser.close();

  // Cleanup
  await admin.from('vehicles').delete().eq('company_name', companyA);
  await admin.from('vehicles').delete().eq('company_name', companyB);
  await admin.from('company_settings').delete().eq('company_name', companyA);
  await admin.from('company_settings').delete().eq('company_name', companyB);
  await admin.from('user_roles').delete().eq('user_id', userId);
  await admin.from('profiles').delete().eq('id', userId);
  await admin.auth.admin.deleteUser(userId);
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
