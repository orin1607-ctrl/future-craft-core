/**
 * STAGING UI QA — ERM assign screen shows 043284 → 36806603.
 * node scripts/fleetos-erm-assign-ui-qa.mjs
 * Uses local Vite (http://localhost:8080) and super_admin orin1607.
 * Does not write mapping, GPS, listener, or Production.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const BASE = process.env.BASE || 'http://localhost:8080';
const EMAIL = 'orin1607@gmail.com';
const UNIT = '043284';
const PLATE = '36806603';
const VEHICLE_ID = '295b935a-16f9-4e7a-a920-7bae92a4dc9a';
const OUT = join(process.cwd(), 'docs/audit-reports/fleetos-erm-assign-ui-2026-09-04');
mkdirSync(OUT, { recursive: true });

if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service =
  keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key ||
  keys.find((k) => k.name === 'service_role')?.api_key;
const anon =
  keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key ||
  keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });

const report = {
  at: new Date().toISOString(),
  environment: 'STAGING',
  stagingRef: STAGING_REF,
  base: BASE,
  productionTouched: false,
  checks: [],
};

function check(id, ok, detail) {
  report.checks.push({ id, ok: Boolean(ok), detail: detail ?? null });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id}${detail ? ` ${JSON.stringify(detail).slice(0, 180)}` : ''}`);
}

const { data: device } = await admin
  .from('gps_devices')
  .select('id, unit_id, vehicle_id, company_name, enabled')
  .eq('unit_id', UNIT)
  .eq('enabled', true)
  .maybeSingle();
const { data: vehicle } = await admin
  .from('vehicles')
  .select('id, license_plate, manufacturer, model, year, company_name, status')
  .eq('id', VEHICLE_ID)
  .maybeSingle();
const { data: dups } = await admin
  .from('gps_devices')
  .select('id')
  .eq('enabled', true)
  .or(`unit_id.eq.${UNIT},vehicle_id.eq.${VEHICLE_ID}`);

check('db-043284-to-36806603', device?.vehicle_id === VEHICLE_ID && vehicle?.license_plate === PLATE, {
  device,
  plate: vehicle?.license_plate,
});
check('db-no-duplicate-active', (dups || []).length === 1, { count: (dups || []).length });
check('business-vehicle-unchanged', vehicle?.status === 'active' && vehicle?.manufacturer === 'איסוזו' && vehicle?.year === 2023, vehicle);

async function sessionFor(email) {
  const client = createClient(`https://${STAGING_REF}.supabase.co`, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw linkErr;
  const { data: auth, error: verifyErr } = await client.auth.verifyOtp({
    email,
    token: linkData.properties.email_otp,
    type: 'email',
  });
  if (verifyErr || !auth.session) throw verifyErr || new Error('verify failed');
  return auth.session;
}

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const session = await sessionFor(EMAIL);
  const ctx = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport: { width: 1400, height: 1200 } });
  await ctx.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    {
      key: `sb-${STAGING_REF}-auth-token`,
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
  const page = await ctx.newPage();
  await page.goto(`${BASE}/fleetos-ai`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.getByRole('heading', { name: /מיקום צי חכם/ }).waitFor({ timeout: 40000 });
  await page.getByText('שיוך מכשיר ERM').waitFor({ timeout: 30000 });
  await page.locator('[data-erm-assigned-list="1"]').waitFor({ timeout: 45000 });
  const mappedBtn = page.locator(`[data-assigned-unit="${UNIT}"]`);
  await mappedBtn.waitFor({ timeout: 15000 });
  await mappedBtn.click();
  await page.waitForTimeout(800);

  const assign = page.locator('[data-erm-assign="1"]');
  const assignText = await assign.innerText();
  report.assignText = assignText.slice(0, 1200);
  check('unit-043284-visible', assignText.includes(UNIT), assignText.slice(0, 240));
  check('ui-shows-assigned', /משויך|שיוך פעיל/.test(assignText) && assignText.includes(UNIT), assignText.slice(0, 240));
  check('assigned-vehicle-36806603', assignText.includes(PLATE), assignText.slice(0, 240));
  check('vehicle-isuzu-2023', assignText.includes('איסוזו') && assignText.includes('די מקס') && assignText.includes('2023'), assignText.slice(0, 240));
  check('mapping-ui-matches-db', assignText.includes(UNIT) && assignText.includes(PLATE));
  check('not-shown-as-unassigned-only', !(assignText.includes('אין מכשיר משויך לכרטיס זה') && !assignText.includes(UNIT)));

  const unknown = await page.locator('[data-unknown-devices="1"]').innerText().catch(() => '');
  check('unit-not-in-unknown-panel', !unknown.includes(UNIT), unknown.slice(0, 160));

  const card = page.locator('[data-telematics-card="1"]');
  const cardText = (await card.count()) ? await card.innerText() : '';
  report.cardText = cardText.slice(0, 800);
  check('selected-card-plate', cardText.includes(PLATE), cardText.slice(0, 200));
  check('selected-card-vehicle', cardText.includes('איסוזו') && cardText.includes('2023'), cardText.slice(0, 200));
  check('no-fake-live-gps', !/GPS Live/.test(cardText) || !cardText.includes(PLATE));

  await page.locator('input[placeholder="12-345-67"]').fill(UNIT);
  await page.getByRole('button', { name: 'חפש' }).click();
  await page.waitForTimeout(800);
  const listBtn = page.getByRole('button', { name: /רשימת רכבים/ });
  const listLabel = (await listBtn.count()) ? await listBtn.innerText() : '';
  report.listLabelAfterUnitSearch = listLabel;
  check('vehicle-list-not-zero-after-unit-search', !/\(0\)/.test(listLabel) && !/\(0 מתוך/.test(listLabel), listLabel);

  await page.screenshot({ path: join(OUT, 'assign-ui-043284.png'), fullPage: true });
  await ctx.close();
} finally {
  await browser.close();
}

report.ok = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'qa-result.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, failed: report.checks.filter((c) => !c.ok).map((c) => c.id) }, null, 2));
process.exit(report.ok ? 0 : 1);
