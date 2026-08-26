/**
 * First-viewport proof: what a super-admin actually sees on live Pages without scrolling.
 * node scripts/telemarketing-admin-first-viewport.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-lead-assign-2026-08-26');
mkdirSync(OUT, { recursive: true });

function loadKeys() {
  const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'service_role')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key,
  };
}
const keys = loadKeys();
const adminDb = createClient(STAGING_URL, keys.service, { auth: { autoRefreshToken: false, persistSession: false } });
const client = createClient(STAGING_URL, keys.anon, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: linkData, error: linkErr } = await adminDb.auth.admin.generateLink({ type: 'magiclink', email: 'orin1607@gmail.com' });
if (linkErr) throw linkErr;
const { data: auth, error: verifyErr } = await client.auth.verifyOtp({ email: 'orin1607@gmail.com', token: linkData.properties.email_otp, type: 'email' });
if (verifyErr || !auth.session) throw verifyErr || new Error('verifyOtp');

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ locale: 'he-IL', viewport: { width: 1440, height: 900 } });
await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
  key: `sb-${STAGING_REF}-auth-token`,
  value: {
    access_token: auth.session.access_token,
    refresh_token: auth.session.refresh_token,
    expires_at: auth.session.expires_at,
    expires_in: auth.session.expires_in,
    token_type: auth.session.token_type,
    user: auth.session.user,
  },
});
const page = await context.newPage();
await page.goto(`${BASE}/telemarketing/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(5000);
await page.screenshot({ path: join(OUT, 'first-viewport-admin.png') });
const visible = await page.evaluate(() => {
  const board = document.querySelector('[data-testid="lead-directory-board"]');
  const rect = board?.getBoundingClientRect();
  const headings = [...document.querySelectorAll('h1,h2,h3')].map((el) => el.textContent?.trim()).filter(Boolean);
  return {
    url: location.href,
    title: document.title,
    firstViewportText: document.body.innerText.slice(0, 1500),
    headings,
    boardExists: Boolean(board),
    boardTop: rect?.top ?? null,
    boardInViewport: Boolean(rect && rect.top >= 0 && rect.top < window.innerHeight),
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  };
});
writeFileSync(join(OUT, 'first-viewport.json'), JSON.stringify(visible, null, 2), 'utf8');
console.log(JSON.stringify(visible, null, 2));
await browser.close();
