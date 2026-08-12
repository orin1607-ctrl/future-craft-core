/**
 * Measure Alerts page load + company_settings request count (Staging only).
 * node scripts/oren-car-alerts-perf-measure.mjs [label]
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = (process.env.STAGING_PAGES_URL || 'https://orin1607-ctrl.github.io/future-craft-core').replace(/\/$/, '');
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-alerts-perf-and-e2e');
mkdirSync(OUT, { recursive: true });
const label = process.argv[2] || 'measure';

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

async function main() {
  const keys = loadKeys();
  const admin = createClient(STAGING_URL, keys.service, { auth: { autoRefreshToken: false, persistSession: false } });
  const anon = createClient(STAGING_URL, keys.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const runId = Date.now();
  const email = `qa-alerts-perf-${runId}@staging-e2e.local`;
  const password = `Qa!${runId}`;
  const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const userId = created.user.id;
  await admin.from('profiles').upsert({
    id: userId,
    full_name: 'QA Alerts Perf',
    company_name: 'דליה',
    is_active: true,
    approval_status: 'approved',
    two_factor_approved: true,
  });
  await admin.from('user_roles').delete().eq('user_id', userId);
  await admin.from('user_roles').insert({ user_id: userId, role: 'super_admin' });
  const { data: auth } = await anon.auth.signInWithPassword({ email, password });

  const html = await (await fetch(`${BASE}/`)).text();
  const bundle = html.match(/assets\/index-[^"]+\.js/)?.[0] || null;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'he-IL' });
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
  const csReqs = [];
  page.on('response', (res) => {
    const u = res.url();
    if (u.includes('/rest/v1/company_settings')) {
      csReqs.push({ status: res.status(), url: u.slice(0, 200), at: Date.now() });
    }
  });

  const t0 = Date.now();
  await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForLoadState('networkidle', { timeout: 90000 }).catch(() => {});
  // Wait until alerts UI shows something usable
  await page.waitForTimeout(1500);
  const usableMs = Date.now() - t0;
  const body = await page.locator('body').innerText();
  const alertCountHint = (body.match(/התרא/g) || []).length;
  await page.screenshot({ path: join(OUT, `alerts-${label}.png`), fullPage: false });

  const report = {
    at: new Date().toISOString(),
    label,
    bundle,
    usableMs,
    companySettingsRequests: csReqs.length,
    companySettingsUniqueUrls: [...new Set(csReqs.map((r) => r.url))].length,
    companySettings: csReqs,
    alertCountHint,
    hasError: /Unexpected Application Error/i.test(body),
  };
  writeFileSync(join(OUT, `alerts-perf-${label}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  await browser.close();
  await admin.from('user_roles').delete().eq('user_id', userId);
  await admin.from('profiles').delete().eq('id', userId);
  await admin.auth.admin.deleteUser(userId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
