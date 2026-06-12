import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { join } from 'path';
import { mkdirSync } from 'fs';

const PREVIEW = 'http://127.0.0.1:4173/future-craft-core';
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const OUT = join(process.cwd(), 'docs', 'screenshots', 'fleetos-module2-fuel-preview');
mkdirSync(OUT, { recursive: true });

const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const admin = createClient(`https://${STAGING_REF}.supabase.co`, keys.find((k) => k.name === 'service_role').api_key);
const anonClient = createClient(`https://${STAGING_REF}.supabase.co`, keys.find((k) => k.name === 'anon').api_key);

const runId = Date.now();
const email = `fuel-r2-${runId}@staging-e2e.local`;
const password = `Gp!${runId}`;
const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const uid = created.user.id;
await admin.from('profiles').upsert({ id: uid, full_name: 'Fuel Preview', company_name: 'QA', is_active: true, approval_status: 'approved' });
await admin.from('user_roles').delete().eq('user_id', uid);
await admin.from('user_roles').insert({ user_id: uid, role: 'super_admin' });
await new Promise((r) => setTimeout(r, 1200));
const { data: auth } = await anonClient.auth.signInWithPassword({ email, password });

async function closeSheet(page) {
  const close = page.getByRole('button').filter({ has: page.locator('svg') }).last();
  if (await page.locator('[role="dialog"]').count()) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
}

const browser = await chromium.launch({ headless: true, channel: 'chrome' });

for (const [vpName, viewport] of [
  ['desktop', { width: 1280, height: 900 }],
  ['mobile', { width: 390, height: 844 }],
]) {
  const context = await browser.newContext({ viewport, locale: 'he-IL' });
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: `sb-${STAGING_REF}-auth-token`, value: auth.session });
  const page = await context.newPage();
  await page.goto(`${PREVIEW}/fleetos-ai?tab=fuel`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, `${vpName}-01-fuel-main.png`), fullPage: true });

  for (const [label, file] of [
    ['חיסכון ותחנות', `${vpName}-05-savings.png`],
    ['דוחות', `${vpName}-06-reports.png`],
    ['הוסף תדלוק', `${vpName}-07-add-fuel.png`],
    ['הוסף טעינה', `${vpName}-08-add-charge.png`],
    ['יומן תדלוקים', `${vpName}-02-fuel-log.png`],
    ['יומן טעינות', `${vpName}-03-charge-log.png`],
    ['חריגות', `${vpName}-04-anomalies.png`],
  ]) {
    await closeSheet(page);
    await page.locator('button').filter({ hasText: label }).first().click({ force: true });
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(OUT, file), fullPage: true });
    if (label === 'הוסף תדלוק') {
      await page.locator('button').filter({ hasText: 'הזנה ידנית' }).click({ force: true }).catch(() => {});
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(OUT, `${vpName}-07b-add-fuel-manual.png`), fullPage: true });
    }
    await closeSheet(page);
  }
  await context.close();
}

await admin.auth.admin.deleteUser(uid);
await browser.close();
console.log('done', OUT);
