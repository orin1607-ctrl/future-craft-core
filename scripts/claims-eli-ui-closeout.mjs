/**
 * Staging-only UI closeout for אליהו אטיאס / DAL-2026-0020.
 * Existing super_admin via generateLink. Never Production. Does not mutate Gmail.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const CLAIM_ID = 'DAL-2026-0020';
const PUBLIC = process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-gmail-3h-scan-2026-09-06/ui');
const ART = '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });
if (existsSync(ART)) mkdirSync(ART, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  claimId: CLAIM_ID,
  productionTouched: false,
  mailboxMutated: false,
  realEmailSend: false,
  checks: [],
  ok: false,
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : ''}`);
};

function jwtPayload(tok) {
  return JSON.parse(Buffer.from(String(tok).split('.')[1], 'base64url').toString('utf8'));
}

function serviceRole() {
  const fromEnv = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.STAGING_SERVICE_ROLE_KEY;
  if (fromEnv) {
    const k = fromEnv.replace(/[\r\n]/g, '').trim();
    const payload = jwtPayload(k);
    if (payload.ref === PROD_REF) throw new Error('service role is production');
    if (payload.ref && payload.ref !== STAGING_REF) throw new Error(`service role ref ${payload.ref}`);
    return k;
  }
  const token = (process.env.SUPABASE_ACCESS_TOKEN || '').replace(/[\r\n]/g, '').trim();
  if (!token) throw new Error('need SUPABASE_ACCESS_TOKEN or SUPABASE_SERVICE_ROLE_KEY');
  const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, {
    encoding: 'utf8',
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
  }));
  const service = keys.find((x) => x.name === 'service_role' && x.type === 'legacy')?.api_key
    || keys.find((x) => x.name === 'service_role')?.api_key;
  if (!service) throw new Error('no staging service_role');
  const payload = jwtPayload(service);
  if (payload.ref === PROD_REF) throw new Error('fetched production key');
  return service;
}

function anonKey() {
  const fromEnv = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (fromEnv) {
    const payload = jwtPayload(fromEnv);
    if (payload.ref === STAGING_REF && payload.role === 'anon') return fromEnv;
  }
  const token = (process.env.SUPABASE_ACCESS_TOKEN || '').replace(/[\r\n]/g, '').trim();
  const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, {
    encoding: 'utf8',
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
  }));
  return keys.find((x) => x.name === 'anon' && x.type === 'legacy')?.api_key
    || keys.find((x) => x.name === 'anon')?.api_key;
}

const service = serviceRole();
const anon = anonKey();
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { persistSession: false } });

const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(8);
let saEmail = '';
for (const row of saRole || []) {
  const u = await admin.auth.admin.getUserById(row.user_id);
  if (u?.data?.user?.email === 'orin1607@gmail.com') { saEmail = u.data.user.email; break; }
  if (!saEmail) saEmail = u?.data?.user?.email || '';
}
if (!saEmail) throw new Error('no existing super_admin');

async function inject(context) {
  const client = createClient(`https://${STAGING_REF}.supabase.co`, anon, { auth: { persistSession: false } });
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: saEmail });
  if (linkErr) throw linkErr;
  const { data: auth, error } = await client.auth.verifyOtp({ email: saEmail, token: linkData.properties.email_otp, type: 'email' });
  if (error || !auth.session) throw error || new Error('verifyOtp');
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
}

function saveShot(page, name) {
  const dest = join(OUT, `${name}.png`);
  return page.screenshot({ path: dest, fullPage: true }).then(() => {
    if (existsSync(ART)) copyFileSync(dest, join(ART, `${name}.png`));
  }).catch(() => null);
}

async function openEli(page) {
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2000);
  const search = page.locator('[data-testid="claims-search"]');
  if (await search.count()) {
    await search.fill('אליהו אטיאס');
    await page.waitForTimeout(1000);
  }
  const row = page.locator(`[data-testid="claim-row-${CLAIM_ID}"]`);
  if (!(await row.count()) && await search.count()) {
    await search.fill('1260010522488');
    await page.waitForTimeout(1000);
  }
  rec('claim_row_visible', await row.count() > 0);
  if (await row.count()) await row.click();
  await page.waitForTimeout(1800);
  rec('card_open', await page.locator('[data-testid="claims-card-snapshot"]').count() > 0);
  const snap = (await page.locator('[data-testid="claims-card-snapshot"]').innerText().catch(() => '')) || '';
  rec('correct_claim', /אליהו אטיאס/.test(snap) && /1260010522488|63292003|63292-003|DAL-2026-0020/.test(snap), { snap: snap.slice(0, 240) });
}

async function inspectOpenCard(page, prefix) {
  await page.locator('[data-testid="claims-tab-group-mail"]').click();
  await page.locator('[data-testid="claims-tab-sub-gin"]').click().catch(() => null);
  await page.getByText('63292-003').first().waitFor({ timeout: 15000 }).catch(() => null);
  const overlay = page.locator('.ov.open');
  const mailText = (await overlay.innerText().catch(() => '')) || '';
  rec(`${prefix}_mail_tab`, /התכתבויות \(\d+\)/.test(mailText) && Number((mailText.match(/התכתבויות \((\d+)\)/) || [])[1] || 0) >= 1, { sample: String(mailText).slice(0, 280) });
  rec(`${prefix}_mail_file_number`, /63292-003/.test(mailText));
  rec(`${prefix}_mail_name`, /אטיאס/.test(mailText));
  await saveShot(page, `${prefix}_mail`);

  await page.locator('[data-testid="claims-tab-group-docs"]').click();
  await page.locator('[data-testid="claims-tab-sub-surveyor"]').click().catch(() => null);
  await page.waitForTimeout(1200);
  const docsText = (await overlay.innerText().catch(() => '')) || '';
  rec(`${prefix}_docs_tab`, /מסמכים|דוח שמאי/.test(docsText), { sample: String(docsText).slice(0, 280) });
  rec(`${prefix}_report_present`, /שמאות|דוח שמאי|\.pdf|2241|קיים/.test(docsText));
  await saveShot(page, `${prefix}_docs`);

  await page.locator('[data-testid="claims-tab-group-hist"]').click().catch(() => null);
  await page.waitForTimeout(1000);
  const histText = (await overlay.innerText().catch(() => '')) || '';
  rec(`${prefix}_history`, /יובא מייל מ-Gmail|היסטוריה/.test(histText));
  await saveShot(page, `${prefix}_history`);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1440, height: 900 } });
await inject(ctx);
const page = await ctx.newPage();
try {
  await openEli(page);
  await inspectOpenCard(page, 'open');
  await page.locator('.ov.open .mh button.mcl').click({ timeout: 5000 }).catch(() => null);
  await page.locator('.ov.open').click({ position: { x: 8, y: 8 }, timeout: 3000 }).catch(() => null);
  await page.waitForTimeout(800);
  rec('card_closed', (await page.locator('.ov.open').count()) === 0);
  await page.reload({ waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1600);
  await openEli(page);
  await inspectOpenCard(page, 'reopen');
} catch (e) {
  rec('ui_run', false, { err: String(e.message || e).slice(0, 240) });
  await saveShot(page, 'ui_error');
}
await browser.close();

report.ok = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, fail: report.checks.filter((c) => !c.ok).map((c) => c.name), productionTouched: false }, null, 2));
if (!report.ok) process.exit(1);
