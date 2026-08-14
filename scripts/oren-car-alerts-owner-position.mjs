/**
 * Read-only: where does a freshly created alert actually sit in the owner's
 * alerts screen, and does the built-in vehicle filter surface it immediately.
 * Browses as a temporary QA super admin scoped to the reporting company.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const COMPANY = process.argv[2] || 'קיבוץ בארי';
const PLATES = (process.argv[3] || '79002402,54084103,575').split(',');
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-tasks-1-10-staging/alerts-live-diagnose');
mkdirSync(OUT, { recursive: true });

const arr = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const url = `https://${STAGING_REF}.supabase.co`;
const admin = createClient(url, arr.find((k) => k.name === 'service_role').api_key, { auth: { autoRefreshToken: false, persistSession: false } });
const anonKey = arr.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || arr.find((k) => k.name === 'anon').api_key;
const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

const runId = Date.now();
const email = `qa-pos-sa-${runId}@staging-e2e.local`;
const password = `QaPos!${runId}`;
const out = { at: new Date().toISOString(), company: COMPANY, plates: PLATES };
let userId = null;

try {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  await admin.from('profiles').upsert({
    id: userId, full_name: `QA Pos Super ${runId}`, company_name: null,
    is_active: true, approval_status: 'approved', two_factor_approved: true,
  });
  await admin.from('user_roles').delete().eq('user_id', userId);
  await admin.from('user_roles').insert({ user_id: userId, role: 'super_admin' });
  const { data: auth } = await anon.auth.signInWithPassword({ email, password });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'he-IL', viewport: { width: 1500, height: 1200 } });
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    {
      key: `sb-${STAGING_REF}-auth-token`,
      value: {
        access_token: auth.session.access_token, refresh_token: auth.session.refresh_token,
        expires_at: auth.session.expires_at, expires_in: auth.session.expires_in,
        token_type: auth.session.token_type, user: auth.session.user,
      },
    },
  );
  const page = await context.newPage();
  await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(4000);
  const picker = page.locator('select').filter({ hasText: COMPANY }).first();
  if (await picker.count()) await picker.selectOption({ label: COMPANY }).catch(() => null);
  await page.waitForTimeout(6000);
  await page.waitForLoadState('networkidle').catch(() => null);

  const rowTexts = await page.locator('table tbody tr').allInnerTexts();
  out.totalRows = rowTexts.length;
  out.firstRows = rowTexts.slice(0, 5).map((t) => t.replace(/\s+/g, ' ').trim());
  out.positions = PLATES.map((plate) => {
    const idx = rowTexts.findIndex((t) => t.includes(`התראת קצין רכב`) && t.includes(plate));
    return { plate, rowNumber: idx === -1 ? null : idx + 1, ofRows: rowTexts.length };
  });

  // the screen's own vehicle filter — the shortest path to a specific alert
  const plate = PLATES[0];
  const selects = page.locator('select');
  const count = await selects.count();
  let filtered = null;
  for (let i = 0; i < count; i += 1) {
    const options = await selects.nth(i).locator('option').allInnerTexts();
    if (options.some((o) => o.trim() === plate)) {
      await selects.nth(i).selectOption({ label: plate });
      await page.waitForTimeout(2500);
      const after = await page.locator('table tbody tr').allInnerTexts();
      filtered = {
        rows: after.length,
        officerRowVisible: after.some((t) => t.includes('התראת קצין רכב') && t.includes(plate)),
        sample: after.slice(0, 6).map((t) => t.replace(/\s+/g, ' ').trim()),
      };
      break;
    }
  }
  out.vehicleFilter = filtered;
  await page.screenshot({ path: join(OUT, 'owner-view-plate-filter.png'), fullPage: true }).catch(() => null);

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

writeFileSync(join(OUT, 'owner-position.json'), JSON.stringify(out, null, 2), 'utf8');
console.log(JSON.stringify(out, null, 2));
