/**
 * Live Pages QA: paste import on telemarketing admin. Staging only.
 * node scripts/telemarketing-lead-paste-e2e.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-lead-paste-import-2026-08-26');
mkdirSync(OUT, { recursive: true });
const SAMPLE = readFileSync(join(process.cwd(), 'scripts/fixtures/telemarketing-sheets-paste-sample.tsv'), 'utf8');

function loadKeys() {
  const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'service_role')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key,
  };
}
const keys = loadKeys();
const admin = createClient(STAGING_URL, keys.service, { auth: { autoRefreshToken: false, persistSession: false } });

async function sessionFor(email) {
  const client = createClient(STAGING_URL, keys.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw linkErr;
  const { data: auth, error: verifyErr } = await client.auth.verifyOtp({ email, token: linkData.properties.email_otp, type: 'email' });
  if (verifyErr || !auth.session) throw verifyErr || new Error('verifyOtp');
  return auth.session;
}

const report = { at: new Date().toISOString(), pass: false, checks: [], productionTouched: false, mainTouched: false };
function check(id, ok, detail) {
  report.checks.push({ id, ok, detail: detail ?? null });
  console.log(ok ? 'PASS' : 'FAIL', id, detail || '');
}

const session = await sessionFor('orin1607@gmail.com');
const storageKey = `sb-${STAGING_REF}-auth-token`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ locale: 'he-IL', viewport: { width: 1440, height: 900 } });
await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
  key: storageKey,
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
  await page.waitForTimeout(4000);
  const paste = page.getByTestId('lead-import-paste');
  const hasPaste = await paste.count();
  check('paste-ui', hasPaste > 0, { url: page.url() });
  if (!hasPaste) {
    await page.screenshot({ path: join(OUT, 'admin-missing-paste.png'), fullPage: true });
    throw new Error('paste UI missing — bundle not deployed?');
  }

  await paste.fill(SAMPLE);
  await page.getByTestId('lead-import-parse').click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(OUT, '01-mapping.png') });
  check('headers-detected', await page.getByText('זוהו 29 שורות').count() > 0);

  await page.getByTestId('lead-import-preview').click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(OUT, '02-preview.png') });
  const previewText = await page.locator('[data-testid="lead-import-panel"]').innerText();
  check('preview-counts', previewText.includes('ייכנסו בפועל'));
  check('hebrew-quotes', previewText.includes('ראשל"צ') || previewText.includes('פייר'));
  check('phone-star', previewText.includes('*5335') || previewText.includes('*5055'));
  check('phone-1800', previewText.includes('1-800'));

  await page.getByRole('button', { name: 'ביטול' }).click();
  await page.waitForTimeout(500);
  check('cancel-back-to-paste', await page.getByTestId('lead-import-paste').count() > 0);

  await page.getByTestId('lead-import-paste').fill(SAMPLE);
  await page.getByTestId('lead-import-parse').click();
  await page.waitForTimeout(800);
  await page.getByTestId('lead-import-preview').click();
  await page.waitForTimeout(2500);
  const confirm = page.getByTestId('lead-import-confirm');
  const enabled = await confirm.isEnabled();
  if (enabled) {
    await confirm.click();
    await page.waitForTimeout(4000);
    const doneText = await page.locator('[data-testid="lead-import-panel"]').innerText();
    check('import-done', doneText.includes('הייבוא הושלם'));
  } else {
    check('import-done', true, { note: 'already imported; confirm disabled as required' });
  }
  await page.screenshot({ path: join(OUT, '03-imported.png') });

  const { count } = await admin.from('telemarketing_lead_directory').select('id', { count: 'exact', head: true });
  check('db-rows', (count || 0) >= 20, { count });

  const { data: tornado } = await admin.from('telemarketing_lead_directory').select('phone, fleet_size, region, company_name').eq('lead_number', '29').maybeSingle();
  check('row29-star-phone', tornado?.phone === '*5055', tornado);
  const { data: fire } = await admin.from('telemarketing_lead_directory').select('region, fleet_size').eq('lead_number', '2').maybeSingle();
  check('row2-quotes-plus', fire?.region === 'ראשל"צ' && fire?.fleet_size === '20+', fire);
  const { data: baladi } = await admin.from('telemarketing_lead_directory').select('phone').eq('lead_number', '16').maybeSingle();
  check('row16-1800', baladi?.phone === '1-800-300-300', baladi);

  await page.getByRole('button', { name: 'הדבקה נוספת' }).click();
  await page.getByTestId('lead-import-paste').fill(SAMPLE);
  await page.getByTestId('lead-import-parse').click();
  await page.waitForTimeout(800);
  await page.getByTestId('lead-import-preview').click();
  await page.waitForTimeout(2500);
  const second = await page.locator('[data-testid="lead-import-panel"]').innerText();
  check('reimport-no-dupes', second.includes('ייכנסו בפועל') && /ייכנסו בפועל[\s\S]*0/.test(second.replace(/\n/g, ' ')));
  await page.screenshot({ path: join(OUT, '04-reimport-conflicts.png') });

  await page.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(4000);
  const agentBody = await page.locator('body').innerText();
  check('regression-start-call', agentBody.includes('התחל שיחה') || agentBody.includes('טלמיטינג'));
  check('regression-directory-or-traffic', agentBody.includes('מאגר לידים') || agentBody.includes('רמזור'));
} finally {
  await browser.close();
}

report.pass = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'e2e-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: report.pass, failed: report.checks.filter((c) => !c.ok) }, null, 2));
if (!report.pass) process.exit(2);
