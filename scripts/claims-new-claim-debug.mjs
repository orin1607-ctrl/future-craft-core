import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PUBLIC = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-two-bugs-2026-09-01');
mkdirSync(OUT, { recursive: true });

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(3);
const saUser = await admin.auth.admin.getUserById(saRole[0].user_id);
const saEmail = saUser?.data?.user?.email;
const client = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: saEmail });
const { data: auth } = await client.auth.verifyOtp({ email: saEmail, token: linkData.properties.email_otp, type: 'email' });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
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
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGE ' + String(e.stack || e.message || e)));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push('CON ' + msg.text()); });
await page.goto(`${PUBLIC}/claims`, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(2000);
const infoBefore = await page.evaluate(() => ({
  ov: [...document.querySelectorAll('.ov')].map((el) => ({ className: el.className, display: getComputedStyle(el).display, w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height })),
  buttons: [...document.querySelectorAll('button')].filter((b) => (b.textContent || '').includes('תיק חדש')).map((b) => {
    const r = b.getBoundingClientRect();
    return { text: b.textContent, w: r.width, h: r.height, x: r.x, y: r.y, vis: r.width > 0 && r.height > 0 };
  }),
}));
const dashBtn = page.locator('.ph-a button', { hasText: 'תיק חדש' });
await dashBtn.click({ timeout: 10000 });
await page.waitForTimeout(1000);
const infoAfter = await page.evaluate(() => ({
  ov: [...document.querySelectorAll('.ov')].map((el) => ({ className: el.className, display: getComputedStyle(el).display, w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height })),
  titleVis: [...document.querySelectorAll('#mClaimT, .mh-t')].map((el) => ({ t: el.textContent, vis: getComputedStyle(el.closest('.ov') || el).display })),
}));
await page.screenshot({ path: join(OUT, 'debug-after-dash-click.png') });
writeFileSync(join(OUT, 'debug.json'), JSON.stringify({ errors, infoBefore, infoAfter }, null, 2), 'utf8');
console.log(JSON.stringify({ errors, infoBefore, infoAfter }, null, 2));
await browser.close();
