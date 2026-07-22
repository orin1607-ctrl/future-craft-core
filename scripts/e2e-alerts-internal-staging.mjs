/**
 * Staging E2E — Alerts tab internal-number autocomplete (same SearchableFilterField as Reports).
 * Staging Pages + dalia-staging only. Never touches Production.
 *
 * Env:
 *   SUPABASE_ACCESS_TOKEN or STAGING_SERVICE_ROLE_KEY + VITE_SUPABASE_PUBLISHABLE_KEY
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = (process.env.STAGING_PAGES_URL || 'https://orin1607-ctrl.github.io/future-craft-core').replace(
  /\/$/,
  '',
);
const OUT = join(process.cwd(), 'docs', 'screenshots', 'alerts-internal-e2e');
const ARTIFACT = '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });
mkdirSync(ARTIFACT, { recursive: true });

const FORBIDDEN = ['qasomfndnjuixgjmjwcm', 'dalia-car.online'];

const report = {
  at: new Date().toISOString(),
  base: BASE,
  staging: STAGING_REF,
  productionTouched: false,
  tests: [],
  consoleErrors: [],
  networkErrors: [],
  screenshots: [],
  ok: false,
};

function record(id, name, ok, detail = {}) {
  report.tests.push({ id, name, ok, ...detail });
  console.log(ok ? '✅' : '❌', `[${id}]`, name, detail.error || detail.note || '');
}

async function shot(page, name) {
  const file = `${name}.png`;
  const path = join(OUT, file);
  await page.screenshot({ path, fullPage: true });
  report.screenshots.push(file);
  try {
    await page.screenshot({ path: join(ARTIFACT, `alerts-int-${file}`), fullPage: true });
  } catch {
    /* optional */
  }
}

function loadKeys() {
  if (process.env.STAGING_SERVICE_ROLE_KEY && process.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
    return {
      service: process.env.STAGING_SERVICE_ROLE_KEY,
      anon: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    };
  }
  const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, {
    encoding: 'utf8',
    env: { ...process.env },
  });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key,
  };
}

async function createSuperAdmin(admin, anon) {
  const runId = Date.now();
  const email = `qa-alerts-int-${runId}@staging-e2e.local`;
  const password = `Qa!${runId}`;
  const company = 'דליה';
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const userId = created.user.id;
  await admin.from('profiles').upsert({
    id: userId,
    full_name: 'QA Alerts Internal Search',
    company_name: company,
    is_active: true,
    approval_status: 'approved',
    two_factor_approved: true,
  });
  await admin.from('user_roles').delete().eq('user_id', userId);
  await admin.from('user_roles').insert({ user_id: userId, role: 'super_admin' });
  await new Promise((r) => setTimeout(r, 500));
  const { data: auth, error: signErr } = await anon.auth.signInWithPassword({ email, password });
  if (signErr) throw signErr;
  return { userId, email, password, company, session: auth.session, runId };
}

async function injectSession(context, session) {
  const storageKey = `sb-${STAGING_REF}-auth-token`;
  await context.addInitScript(
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
  const keys = loadKeys();
  if (!keys.service || !keys.anon) throw new Error('Missing staging API keys');

  const admin = createClient(STAGING_URL, keys.service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(STAGING_URL, keys.anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const user = await createSuperAdmin(admin, anon);
  record('auth', 'ephemeral super_admin session', true, { email: user.email });

  // Ensure at least two vehicles with distinct internal numbers for filter proof
  const suffix = String(user.runId).slice(-6);
  const internalA = `QA-INT-A-${suffix}`;
  const internalB = `QA-INT-B-${suffix}`;
  const plateA = `99-${suffix.slice(0, 3)}-${suffix.slice(3)}`;
  const plateB = `88-${suffix.slice(0, 3)}-${suffix.slice(3)}`;
  const soon = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: vehA, error: errA } = await admin
    .from('vehicles')
    .insert({
      license_plate: plateA,
      internal_number: internalA,
      company_name: user.company,
      manufacturer: 'QA',
      model: 'AlertsA',
      test_expiry: soon,
      status: 'active',
    })
    .select('id')
    .single();
  if (errA) throw errA;

  const { data: vehB, error: errB } = await admin
    .from('vehicles')
    .insert({
      license_plate: plateB,
      internal_number: internalB,
      company_name: user.company,
      manufacturer: 'QA',
      model: 'AlertsB',
      insurance_expiry: soon,
      status: 'active',
    })
    .select('id')
    .single();
  if (errB) throw errB;

  record('seed-vehicles', 'seeded two vehicles with internal numbers + near expiry', true, {
    internalA,
    internalB,
    plateA,
    plateB,
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'he-IL' });
  await injectSession(context, user.session);
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (/Download the React DevTools|favicon/i.test(text)) return;
      report.consoleErrors.push({ url: page.url(), text });
    }
  });
  page.on('response', (res) => {
    const u = res.url();
    if (FORBIDDEN.some((h) => u.includes(h))) {
      report.networkErrors.push({ url: u, status: res.status(), note: 'production_host_hit' });
    }
    if (res.status() >= 400 && !/favicon|fonts\.googleapis|fonts\.gstatic/.test(u)) {
      report.networkErrors.push({ url: u.slice(0, 160), status: res.status() });
    }
  });

  // Bundle / route smoke
  for (const path of ['/alerts', '/reports']) {
    const resp = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(800);
    record(`nav${path}`, `HTTP ${resp?.status()} for ${path}`, (resp?.status() || 0) === 200, {
      finalUrl: page.url(),
    });
  }

  // Reports still has shared component labels
  await page.goto(`${BASE}/reports`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1000);
  const reportsHasInternal = (await page.locator('text=מספר פנימי').count()) > 0;
  record('reports-shared-label', 'Reports still shows מספר פנימי filter', reportsHasInternal);

  // Alerts tab
  await page.goto(`${BASE}/alerts`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  await shot(page, '01-alerts');

  const labelOk = (await page.locator('label', { hasText: 'מספר פנימי' }).count()) > 0;
  record('alerts-label', 'Alerts tab has מספר פנימי search label', labelOk);

  // Open autocomplete — full list
  const trigger = page
    .locator('label', { hasText: 'מספר פנימי' })
    .locator('..')
    .locator('button')
    .first();
  await trigger.click({ timeout: 10000 });
  await page.waitForTimeout(600);
  await shot(page, '02-autocomplete-open');

  const listbox = page.locator('[cmdk-list], [role="listbox"]').first();
  const optionCount = await page.locator('[cmdk-item], [role="option"]').count();
  record('autocomplete-open', 'dropdown opens with options (full list)', optionCount >= 2, {
    optionCount,
  });

  // Partial type-ahead filter
  const searchInput = page.locator('[cmdk-input], input[placeholder*="מספר פנימי"]').first();
  await searchInput.fill(internalA.slice(0, 8));
  await page.waitForTimeout(400);
  const afterPartial = await page.locator('[cmdk-item], [role="option"]').count();
  const aVisible = (await page.locator(`[cmdk-item], [role="option"]`, { hasText: internalA }).count()) > 0;
  record('autocomplete-partial', 'typing filters list (partial match)', aVisible && afterPartial >= 1, {
    afterPartial,
    query: internalA.slice(0, 8),
  });
  await shot(page, '03-partial-filter');

  // Select internal A
  await page.locator('[cmdk-item], [role="option"]', { hasText: internalA }).first().click();
  await page.waitForTimeout(800);
  await shot(page, '04-selected-a');

  const bodyA = await page.textContent('body');
  const showsA = (bodyA || '').includes(plateA) || (bodyA || '').includes('AlertsA') || (bodyA || '').includes('טסט');
  const hidesB = !(bodyA || '').includes(plateB) && !(bodyA || '').includes('AlertsB');
  record('filter-select-a', 'selecting internal A filters alerts to that vehicle', showsA && hidesB, {
    showsA,
    hidesB,
  });

  // Clear via X
  const clearBtn = page.getByLabel('נקה').first();
  if (await clearBtn.count()) {
    await clearBtn.click();
    await page.waitForTimeout(600);
    const afterClear = await trigger.textContent();
    record('clear-x', 'X clears search back to placeholder', /הכל|חיפוש/.test(afterClear || ''), {
      afterClear: (afterClear || '').slice(0, 40),
    });
  } else {
    record('clear-x', 'X clear button', false, { error: 'נקה not found' });
  }
  await shot(page, '05-cleared');

  // Select B via typing full value
  await trigger.click();
  await page.waitForTimeout(400);
  await searchInput.fill(internalB);
  await page.waitForTimeout(300);
  await page.locator('[cmdk-item], [role="option"]', { hasText: internalB }).first().click();
  await page.waitForTimeout(800);
  const bodyB = await page.textContent('body');
  const showsB = (bodyB || '').includes(plateB) || (bodyB || '').includes('AlertsB') || (bodyB || '').includes('ביטוח');
  const hidesA = !(bodyB || '').includes(plateA) && !(bodyB || '').includes('AlertsA');
  record('filter-select-b', 'selecting internal B isolates that vehicle alerts', showsB && hidesA, {
    showsB,
    hidesA,
  });
  await shot(page, '06-selected-b');

  // Shared component markers in live bundle (same copy as Reports autocomplete)
  const html = await (await fetch(BASE + '/')).text();
  const bundle = (html.match(/assets\/index-[^"]+\.js/) || [])[0];
  let sharedOk = false;
  if (bundle) {
    const js = await (await fetch(`${BASE}/${bundle}`)).text();
    sharedOk = js.includes('חיפוש מספר פנימי...') && js.includes('לא נמצא מספר פנימי');
  }
  record('shared-copy', 'bundle uses same autocomplete copy as Reports', sharedOk, { bundle });

  const doc404 = report.networkErrors.filter(
    (e) => e.status === 404 && /github\.io\/future-craft-core\/(alerts|reports)/.test(e.url || ''),
  );
  record('no-spa-404', 'no SPA document 404 on alerts/reports', doc404.length === 0, {
    doc404: doc404.slice(0, 5),
  });
  record('console-clean', 'no console errors', report.consoleErrors.length === 0, {
    cons: report.consoleErrors.slice(0, 5),
  });
  const prodHits = report.networkErrors.filter((e) => e.note === 'production_host_hit');
  record('no-production', 'no production hosts contacted', prodHits.length === 0);

  await browser.close();

  // cleanup
  try {
    if (vehA?.id) await admin.from('vehicles').delete().eq('id', vehA.id);
    if (vehB?.id) await admin.from('vehicles').delete().eq('id', vehB.id);
  } catch {
    /* ignore */
  }
  try {
    await admin.auth.admin.deleteUser(user.userId);
  } catch {
    /* ignore */
  }

  report.ok = report.tests.every((t) => t.ok);
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(ARTIFACT, 'alerts-internal-staging-e2e.json'), JSON.stringify(report, null, 2));
  console.log(report.ok ? '\nALL E2E PASSED' : '\nE2E HAD FAILURES');
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  report.ok = false;
  report.tests.push({ id: 'fatal', name: 'runner', ok: false, error: String(err) });
  writeFileSync(join(ARTIFACT, 'alerts-internal-staging-e2e.json'), JSON.stringify(report, null, 2));
  process.exit(1);
});
