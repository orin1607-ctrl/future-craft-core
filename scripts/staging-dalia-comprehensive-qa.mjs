/**
 * Comprehensive Dalia + Marketing QA on Staging.
 * Ephemeral super_admin — creates test customers, smoke-tests all modules.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const MARKETING_URL = `${BASE}/ai-marketing-platform.html?v=v3-claude-1to1-2`;
const OUT = join(process.cwd(), 'docs', 'audit-reports', 'staging-comprehensive-qa');
mkdirSync(OUT, { recursive: true });

const report = {
  run_at: new Date().toISOString(),
  base: BASE,
  marketing_url: MARKETING_URL,
  tests: [],
  console_errors: [],
  commit: null,
};

function record(id, name, ok, detail = {}) {
  report.tests.push({ id, name, ok, ...detail });
  console.log(ok ? '✅' : '❌', `[${id}]`, name, detail.error || detail.note || '');
}

function loadKeys() {
  const raw = execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, {
    encoding: 'utf8',
    cwd: process.cwd(),
  });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key,
  };
}

async function createSuperAdmin(admin, anonClient) {
  const runId = Date.now();
  const email = `qa-comp-${runId}@staging-e2e.local`;
  const password = `Qa!${runId}`;
  const { data: created } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  const userId = created.user.id;
  await admin.from('profiles').upsert({
    id: userId,
    full_name: 'QA Comprehensive',
    company_name: 'דליה',
    is_active: true,
    approval_status: 'approved',
    two_factor_approved: true,
  });
  await admin.from('user_roles').delete().eq('user_id', userId);
  await admin.from('user_roles').insert({ user_id: userId, role: 'super_admin' });
  await new Promise((r) => setTimeout(r, 400));
  const { data: auth, error } = await anonClient.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return { userId, email, session: auth.session };
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

const DALIA_MODULES = [
  { path: '/dashboard', markers: ['דליה', 'מרכז שליטה', 'עולמות'] },
  { path: '/vehicles', markers: ['רכב', 'רכבים', 'מספר'] },
  { path: '/drivers', markers: ['נהג', 'נהגים'] },
  { path: '/customers', markers: ['לקוח', 'לקוחות'] },
  { path: '/accidents', markers: ['תאונ', 'תאונה'] },
  { path: '/faults', markers: ['תקל', 'טיפול'] },
  { path: '/service-orders', markers: ['הזמנות שירות', 'שירות'] },
  { path: '/vehicle-tasks', markers: ['משימות', 'רכב'] },
  { path: '/documents', markers: ['מסמכים', 'קטגור'] },
  { path: '/reports', markers: ['דוח'] },
  { path: '/settings', markers: ['הגדרות', 'פרופיל'] },
  { path: '/permissions', markers: ['הרשא'] },
  { path: '/user-management', markers: ['משתמש'] },
  { path: '/admin-home', markers: ['מרכז ניהול', 'Admin'] },
  { path: '/fleet-managers', markers: ['מנהל', 'צי'] },
  { path: '/transport', markers: ['הסע', 'Transport'] },
  { path: '/alerts', markers: ['התרא'] },
  { path: '/history', markers: ['היסטור'] },
  { path: '/expenses', markers: ['הוצא'] },
  { path: '/work-orders', markers: ['הזמנ', 'עבוד'] },
];

async function testModuleLoads(page, label) {
  for (const { path, markers } of DALIA_MODULES) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(800);
    const content = await page.content();
    const hasRoot = (await page.locator('#root').count()) > 0;
    const notBlank = content.length > 800;
    const hasMarker = markers.some((m) => content.includes(m));
    const white = await page.evaluate(() => {
      const root = document.getElementById('root');
      return !root || root.innerText.trim().length < 20;
    });
    record(`MOD-${path}-${label}`, `Module ${path} loads`, hasRoot && notBlank && !white && hasMarker, {
      note: hasMarker ? '' : `markers missing: ${markers.join(',')}`,
    });
  }
}

async function testCustomerMarketingApi(admin, label) {
  const runId = Date.now();
  for (const [svc, tag] of [['marketing_only', 'MO'], ['fleet_and_marketing', 'FM']]) {
    const name = `QA-${tag}-${runId}`;
    const { data: cust, error } = await admin.from('customers').insert({
      name,
      contact_person: 'QA Contact',
      service_type: svc,
      company_name: 'דליה',
      status: 'active',
      customer_type: 'company',
    }).select('id,name,service_type').single();
    record(`API-${tag}-create-${label}`, `API create customer ${svc}`, !error && !!cust?.id, { error: error?.message });

    if (cust?.id) {
      const now = new Date().toISOString();
      const snapshot = { name: cust.name, contact_person: 'QA Contact', synced_at: now };
      await admin.from('marketing_profiles').insert({
        customer_id: cust.id,
        dalia_snapshot: snapshot,
        synced_at: now,
        setup_status: 'provisioned',
        provisioned_at: now,
      });
      const { data: profile } = await admin.from('marketing_profiles').select('id,customer_id,setup_status').eq('customer_id', cust.id).maybeSingle();
      record(`API-${tag}-profile-${label}`, `Marketing profile for ${svc}`, !!profile?.id, { note: profile?.setup_status || 'missing' });

      const mktUrl = `${BASE}/ai-marketing?customer=${cust.id}`;
      const res = await fetch(mktUrl);
      const html = await res.text();
      record(`API-${tag}-route-${label}`, `Marketing route with customer id`, html.includes('ai-marketing-platform') || html.includes('דליה'), { note: mktUrl });

      await admin.from('marketing_connections').delete().eq('customer_id', cust.id);
      await admin.from('marketing_ai_setup').delete().eq('customer_id', cust.id);
      await admin.from('marketing_contacts').delete().eq('customer_id', cust.id);
      await admin.from('marketing_profiles').delete().eq('customer_id', cust.id);
      await admin.from('customers').delete().eq('id', cust.id);
    }
  }
}

async function testCustomerFormOptions(page, label) {
  await page.goto(`${BASE}/customers`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.evaluate(() => {
    document.querySelectorAll('[aria-label="מצב כהה"], [aria-label="מצב בהיר"]').forEach((el) => {
      el.style.pointerEvents = 'none';
    });
  });
  const addBtn = page.getByRole('button', { name: /לקוח חדש/i }).first();
  if (!(await addBtn.count())) {
    record(`UI-form-open-${label}`, 'Customer form opens', false, { error: 'add button missing' });
    return;
  }
  await addBtn.click({ force: true });
  await page.waitForTimeout(600);
  const mo = await page.locator('option[value="marketing_only"]').count();
  const fm = await page.locator('option[value="fleet_and_marketing"]').count();
  record(`UI-svc-marketing_only-${label}`, 'Service type: ניהול שיווק בלבד', mo > 0);
  record(`UI-svc-fleet_and_marketing-${label}`, 'Service type: צי + שיווק', fm > 0);
  const mktLink = page.getByText(/ניהול שיווק|כרטיס שיווק/i);
  record(`UI-mkt-btn-hidden-form-${label}`, 'Marketing button not on empty form', (await mktLink.count()) === 0);
}

async function testMarketingDirect(page, label) {
  const failed404 = [];
  page.on('response', (res) => {
    const u = res.url();
    if (res.status() === 404 && (u.includes('ai-marketing') || u.includes('coco-claude'))) {
      failed404.push(u);
    }
  });

  await page.goto(MARKETING_URL, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(2000);

  const state = await page.evaluate(() => ({
    ui: document.querySelector('meta[name="ui-version"]')?.content,
    commit: document.querySelector('meta[name="build-commit"]')?.content,
    hub: !!document.getElementById('screen-hub')?.classList.contains('active'),
    layout: document.body.classList.contains('coco-claude-layout'),
    cards: document.querySelectorAll('#screen-hub .hub-card').length,
    rootW: document.getElementById('coco-claude-root')?.offsetWidth || 0,
  }));
  report.commit = state.commit;
  record(`MKT-direct-${label}`, 'Marketing direct — hub loads', state.hub && state.layout && state.rootW > 200);
  record(`MKT-version-${label}`, 'Marketing ui-version', state.ui === 'v3-claude-1to1-2', { note: state.ui });
  record(`MKT-404-${label}`, 'No 404 on marketing assets', failed404.length === 0, { note: failed404.slice(0, 3).join('; ') });

  const screens = [
    'screen-hub', 'screen-status', 'screen-clients', 'screen-goals', 'screen-actions',
    'screen-history', 'screen-assets', 'screen-ai-decisions', 'screen-reports', 'screen-agents',
  ];
  for (const sid of screens) {
    const ok = await page.evaluate((id) => {
      if (typeof window.goScreen === 'function') window.goScreen(id);
      const el = document.getElementById(id);
      return !!(el && el.classList.contains('active') && el.offsetHeight > 40);
    }, sid);
    record(`MKT-screen-${sid}-${label}`, `Marketing screen ${sid}`, ok);
  }

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const afterReload = await page.evaluate(() => ({
    hub: !!document.getElementById('screen-hub'),
    layout: document.body.classList.contains('coco-claude-layout'),
  }));
  record(`MKT-persist-${label}`, 'Marketing survives refresh', afterReload.hub && afterReload.layout);
}

async function testMarketingIframe(page, label) {
  const iframeSrc = `${BASE}/ai-marketing-platform.html?fullscreen=1&v=v3-claude-1to1-2`;
  await page.setContent(
    `<!DOCTYPE html><html><body style="margin:0"><iframe id="f" style="width:100%;height:100vh;border:0" src="${iframeSrc}"></iframe></body></html>`,
  );
  await page.waitForTimeout(8000);
  const frame = page.frames().find((f) => f.url().includes('ai-marketing-platform'));
  if (!frame) {
    record(`MKT-iframe-${label}`, 'Dalia iframe loads marketing', false, { error: 'frame missing' });
    return;
  }
  const st = await frame.evaluate(() => ({
    ui: document.querySelector('meta[name="ui-version"]')?.content,
    hub: document.getElementById('screen-hub')?.offsetWidth > 200,
    layout: document.body.classList.contains('coco-claude-layout'),
  }));
  record(`MKT-iframe-${label}`, 'Marketing in iframe', st.hub && st.layout && st.ui === 'v3-claude-1to1-2');
}

async function testDaliaMarketingRoute(page, label) {
  await page.goto(`${BASE}/ai-marketing`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(3000);
  const hasIframe = (await page.locator('iframe').count()) > 0;
  record(`MKT-route-${label}`, 'Dalia /ai-marketing route', hasIframe || (await page.content()).includes('ai-marketing'));
}

async function runViewport(browser, session, admin, label, viewport) {
  const ctx = await browser.newContext({
    viewport,
    locale: 'he-IL',
    isMobile: label === 'mobile',
    hasTouch: label === 'mobile',
  });
  ctx.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (t.includes('favicon')) return;
      report.console_errors.push({ viewport: label, text: t });
    }
  });
  ctx.on('pageerror', (err) => report.console_errors.push({ viewport: label, text: err.message }));
  await injectSession(ctx, session);
  const page = await ctx.newPage();

  if (label === 'desktop') {
    await testModuleLoads(page, label);
    await testCustomerFormOptions(page, label);
  }
  await testMarketingDirect(page, label);
  if (label === 'mobile') await testMarketingIframe(page, label);
  if (label === 'desktop') await testDaliaMarketingRoute(page, label);

  await ctx.close();
}

async function main() {
  const { service, anon } = loadKeys();
  const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const anonClient = createClient(STAGING_URL, anon);
  const { userId, session } = await createSuperAdmin(admin, anonClient);

  await testCustomerMarketingApi(admin, 'api');

  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  await runViewport(browser, session, admin, 'desktop', { width: 1280, height: 900 });
  await runViewport(browser, session, admin, 'mobile', { width: 390, height: 844 });
  await browser.close();

  await admin.auth.admin.deleteUser(userId);

  const passed = report.tests.filter((t) => t.ok).length;
  const failed = report.tests.filter((t) => !t.ok);
  report.summary = {
    total: report.tests.length,
    passed,
    failed: failed.length,
    console_errors: [...new Set(report.console_errors.map((e) => e.text))].length,
    ready: failed.length === 0 && report.console_errors.length === 0,
  };

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log('\n=== COMPREHENSIVE QA ===');
  console.log(`Passed: ${passed}/${report.tests.length}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`Report: ${join(OUT, 'report.json')}`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
