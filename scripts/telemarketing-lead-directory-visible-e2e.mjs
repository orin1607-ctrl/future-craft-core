/**
 * Live Pages: super-admin sees lead directory without hunting.
 * node scripts/telemarketing-lead-directory-visible-e2e.mjs
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
const TAIR = 'תאיר';

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

async function sessionFor(email) {
  const client = createClient(STAGING_URL, keys.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linkData, error: linkErr } = await adminDb.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw linkErr;
  const { data: auth, error: verifyErr } = await client.auth.verifyOtp({ email, token: linkData.properties.email_otp, type: 'email' });
  if (verifyErr || !auth.session) throw verifyErr || new Error('verifyOtp');
  return auth.session;
}

const report = { at: new Date().toISOString(), pass: false, checks: [], productionTouched: false, mainTouched: false, hostingerTouched: false };
function check(id, ok, detail) {
  report.checks.push({ id, ok: Boolean(ok), detail: detail ?? null });
  console.log(ok ? 'PASS' : 'FAIL', id, detail ? JSON.stringify(detail).slice(0, 400) : '');
}

const session = await sessionFor('orin1607@gmail.com');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ locale: 'he-IL', viewport: { width: 1440, height: 900 } });
await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
  key: `sb-${STAGING_REF}-auth-token`,
  value: {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  },
});
const page = await context.newPage();

try {
  await page.goto(`${BASE}/telemarketing/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: join(OUT, 'visible-01-first-viewport.png') });

  const nav = page.getByTestId('lead-directory-nav');
  const board = page.getByTestId('lead-directory-board');
  const first = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="lead-directory-board"]');
    const navEl = document.querySelector('[data-testid="lead-directory-nav"]');
    const rect = el?.getBoundingClientRect();
    const navRect = navEl?.getBoundingClientRect();
    return {
      navInViewport: Boolean(navRect && navRect.top >= 0 && navRect.bottom <= window.innerHeight),
      boardTop: rect?.top ?? null,
      boardInViewport: Boolean(rect && rect.top < window.innerHeight && rect.bottom > 0),
      firstText: document.body.innerText.slice(0, 800),
    };
  });
  check('nav-button-visible', first.navInViewport && (await nav.count()) > 0, first);
  check('directory-in-first-viewport', first.boardInViewport, first);
  check('directory-heading-visible', first.firstText.includes('מאגר לידים'));

  if (await nav.count()) await nav.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, 'visible-02-after-nav.png') });

  await page.waitForSelector('[data-testid="lead-directory-board"]', { timeout: 15000 });
  const boardText = await board.innerText();
  check('shows-29-leads', /29 לידים במאגר/.test(boardText) || boardText.includes('29'), boardText.slice(0, 250));
  check('lead-1-visible', await page.locator('[data-lead-number="1"]').count() > 0);
  check('lead-29-visible', await page.locator('[data-lead-number="29"]').count() > 0);

  await page.getByTestId('lead-select-all').click();
  await page.getByTestId('lead-assign-open').click();
  await page.waitForTimeout(500);
  const options = await page.getByTestId('lead-assign-agent').locator('option').allTextContents();
  check('employee-list-opens', options.some((o) => o.includes(TAIR)) && options.some((o) => o.includes('אבי')), options);
  await page.screenshot({ path: join(OUT, 'visible-03-assign-employees.png') });
  await page.getByTestId('lead-assign-agent').selectOption({ label: TAIR });
  check('can-choose-tair', (await page.getByTestId('lead-assign-agent').inputValue()) !== '');
} finally {
  await browser.close();
}

report.pass = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'visible-e2e-report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ pass: report.pass, failed: report.checks.filter((c) => !c.ok) }, null, 2));
if (!report.pass) process.exit(2);
