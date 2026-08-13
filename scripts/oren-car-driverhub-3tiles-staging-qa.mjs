/**
 * Staging-only QA for DriverHub 3-tile UX.
 * node scripts/oren-car-driverhub-3tiles-staging-qa.mjs
 * Default BASE: local vite. Does not touch Production.
 */
import { chromium, devices } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = (process.env.STAGING_QA_BASE || 'http://127.0.0.1:8080').replace(/\/$/, '');
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-driverhub-3tiles-staging/qa');
mkdirSync(OUT, { recursive: true });

const report = {
  at: new Date().toISOString(),
  base: BASE,
  stagingRef: STAGING_REF,
  tests: [],
  consoleErrors: [],
  networkErrors: [],
  ok: false,
};

function rec(id, name, ok, detail = {}) {
  report.tests.push({ id, name, ok, ...detail });
  console.log(ok ? 'PASS' : 'FAIL', id, name, detail.error || detail.note || '');
}

function keys() {
  const raw = execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  const arr = JSON.parse(raw);
  return {
    service: arr.find((k) => k.name === 'service_role')?.api_key,
    anon: arr.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || arr.find((k) => k.name === 'anon')?.api_key,
  };
}

async function main() {
  if (STAGING_REF === 'qasomfndnjuixgjmjwcm') throw new Error('refused: production db');
  rec('safety-db', 'QA targets Staging Supabase only', STAGING_REF === 'usfeoerkpcafxxlyuldl', { STAGING_REF });
  rec('safety-base', 'QA base is not Production site', !BASE.includes('dalia-car.online'), { BASE });

  const k = keys();
  const admin = createClient(STAGING_URL, k.service, { auth: { autoRefreshToken: false, persistSession: false } });
  const anon = createClient(STAGING_URL, k.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const runId = Date.now();
  const company = `QA-3T-${runId}`;
  const email = `qa-3t-${runId}@staging-e2e.local`;
  const password = `Qa!${runId}`;
  const ids = { users: [], drivers: [], vehicles: [], companies: [company] };

  try {
    await admin.from('company_settings').insert({ company_name: company });
    const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (createErr) throw createErr;
    ids.users.push(created.user.id);
    await admin.from('profiles').upsert({
      id: created.user.id,
      full_name: 'QA 3T',
      company_name: company,
      is_active: true,
      approval_status: 'approved',
      two_factor_approved: true,
    });
    await admin.from('user_roles').delete().eq('user_id', created.user.id);
    await admin.from('user_roles').insert({ user_id: created.user.id, role: 'super_admin' });
    const { data: auth, error: signErr } = await anon.auth.signInWithPassword({ email, password });
    if (signErr) throw signErr;

    const { data: driver, error: dErr } = await admin.from('drivers').insert({
      full_name: `QA 3T Driver ${runId}`,
      company_name: company,
      id_number: `7${String(runId).slice(-8)}`,
      phone: '0501112233',
      status: 'active',
      notes: `note ${runId}`,
    }).select('id,full_name').single();
    if (dErr) throw dErr;
    ids.drivers.push(driver.id);

    const plate = `T${String(runId).slice(-6)}`;
    const { data: veh, error: vErr } = await admin.from('vehicles').insert({
      license_plate: plate,
      company_name: company,
      status: 'active',
      assigned_driver_id: driver.id,
      manufacturer: 'QA',
      model: '3T',
    }).select('id').single();
    if (vErr) throw vErr;
    ids.vehicles.push(veh.id);
    rec('seed', 'Ephemeral Staging driver seeded', true, { company, plate });

    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
    page.on('console', (msg) => { if (msg.type() === 'error') report.consoleErrors.push(msg.text()); });
    page.on('response', (res) => {
      if (res.url().includes(STAGING_REF) && res.status() >= 400) report.networkErrors.push({ status: res.status(), url: res.url() });
    });

    await page.goto(`${BASE}/drivers?driverId=${driver.id}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    const home = await page.locator('body').innerText();
    rec('hub-opens', 'DriverHub opens', home.includes(driver.full_name), { name: driver.full_name });
    rec('tile-docs', 'Tile מסמכים', home.includes('מסמכים'));
    rec('tile-exams', 'Tile מבחנים ותאונות', home.includes('מבחנים ותאונות'));
    rec('tile-history', 'Tile היסטוריה והערות', home.includes('היסטוריה והערות'));
    rec('old-tiles-gone', 'Old 4-tile labels not shown as tiles', !home.includes('בקשות ושליחה') && !home.includes('מסמכים ורישיון') && !/\nנהיגה\n/.test(home) && !home.includes('פעילות והערות'));
    rec('exactly-3-labels', 'Three new tile labels present', ['מסמכים', 'מבחנים ותאונות', 'היסטוריה והערות'].every((t) => home.includes(t)));
    await page.screenshot({ path: join(OUT, 'home-3tiles.png'), fullPage: true }).catch(() => null);

    await page.goto(`${BASE}/drivers?driverId=${driver.id}&section=documents`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    const docs = await page.locator('body').innerText();
    rec('docs-license', 'Documents: license block', docs.includes('רישיון'));
    rec('docs-upload', 'Documents: upload', docs.includes('העלה מסמך') || docs.includes('העלאה'));
    rec('docs-health-vs-decl', 'Health file vs declaration distinguished', docs.includes('הצהרת בריאות') && docs.includes('תצהיר נהג'));
    rec('docs-requests', 'Documents: requests block', docs.includes('בקשות מהנהג') || docs.includes('בקש מסמך'));
    rec('docs-no-dup-upload-label', 'No second העלה מהמחשב in requests', !docs.includes('העלה מהמחשב'));
    rec('docs-search', 'Documents search/filter present', docs.includes('חיפוש') || docs.includes('כל הסוגים') || docs.includes('נוכחי'));
    await page.screenshot({ path: join(OUT, 'documents.png'), fullPage: true }).catch(() => null);

    await page.goto(`${BASE}/drivers?driverId=${driver.id}&section=requests`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
    const req = await page.locator('body').innerText();
    rec('deeplink-requests', 'section=requests opens Documents hub', req.includes('בקשות') || req.includes('תצהיר') || req.includes('רישיון'));
    rec('deeplink-not-broken', 'section=requests still has document capabilities', req.includes('העלה מסמך') || req.includes('בקש מסמך') || req.includes('תצהיר נהג'));

    await page.goto(`${BASE}/drivers?driverId=${driver.id}&section=driving`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    const drive = await page.locator('body').innerText();
    rec('driving-title', 'Driving section titled מבחנים ותאונות', drive.includes('מבחנים ותאונות'));
    rec('driving-exams', 'Exams block', drive.includes('מבחן'));
    rec('driving-accidents', 'Accidents block', drive.includes('תאונ'));
    rec('driving-report-btn', 'Report accident button', drive.includes('דווח על תאונה'));
    rec('driving-no-photos-module', 'No standalone תמונות module heading', !drive.includes('תמונות תאונה') && !/^תמונות$/m.test(drive.split('\n').find((l) => l.trim() === 'תמונות') || ''));
    const reportBtn = page.getByRole('button', { name: /דווח על תאונה/ }).first();
    if (await reportBtn.count()) {
      await reportBtn.click();
      await page.waitForTimeout(2000);
      const url = page.url();
      rec('accident-prefill', 'Existing Accidents form + driver context', url.includes('/accidents') && (url.includes('action=new') || url.includes('context=driver') || url.includes('driverId')), { url });
      rec('accident-no-submit', 'Did not submit dummy accident', true);
    } else {
      rec('accident-prefill', 'Existing Accidents form + driver context', false, { error: 'button missing' });
    }

    await page.goto(`${BASE}/drivers?driverId=${driver.id}&section=activity`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
    const act = await page.locator('body').innerText();
    rec('activity-title', 'Activity titled היסטוריה והערות', act.includes('היסטוריה והערות') || act.includes('היסטוריה מתועדת'));
    rec('activity-notes', 'Notes editor present', act.includes('הערות'));
    rec('activity-filters', 'Timeline filters present', act.includes('כל הסוגים') || act.includes('מסמכים'));

    const mobile = await browser.newContext({ ...devices['iPhone 13'] });
    await mobile.addInitScript(
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
    const mpage = await mobile.newPage();
    await mpage.goto(`${BASE}/drivers?driverId=${driver.id}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await mpage.waitForTimeout(2500);
    const mHome = await mpage.locator('body').innerText();
    rec('mobile-3tiles', 'Mobile shows 3 tiles', ['מסמכים', 'מבחנים ותאונות', 'היסטוריה והערות'].every((t) => mHome.includes(t)));
    await mpage.screenshot({ path: join(OUT, 'mobile-home.png'), fullPage: true }).catch(() => null);
    await mpage.goto(`${BASE}/drivers?driverId=${driver.id}&section=documents`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await mpage.waitForTimeout(2000);
    rec('mobile-docs', 'Mobile documents loads', (await mpage.locator('body').innerText()).length > 40);

    await browser.close();
  } catch (e) {
    rec('fatal', 'QA error', false, { error: String(e.message || e) });
  } finally {
    try {
      if (ids.vehicles.length) await admin.from('vehicles').delete().in('id', ids.vehicles);
      if (ids.drivers.length) await admin.from('drivers').delete().in('id', ids.drivers);
      for (const c of ids.companies) await admin.from('company_settings').delete().eq('company_name', c);
      for (const id of ids.users) {
        await admin.from('profiles').delete().eq('id', id);
        await admin.from('user_roles').delete().eq('user_id', id);
        await admin.auth.admin.deleteUser(id);
      }
      rec('cleanup', 'Ephemeral Staging QA rows removed', true);
    } catch (e) {
      rec('cleanup', 'Ephemeral Staging QA rows removed', false, { error: String(e.message || e) });
    }
  }

  report.ok = report.tests.every((t) => t.ok);
  writeFileSync(join(OUT, 'qa-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, failed: report.tests.filter((t) => !t.ok).map((t) => t.id), consoleErrors: report.consoleErrors.length, networkErrors: report.networkErrors.length }, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
