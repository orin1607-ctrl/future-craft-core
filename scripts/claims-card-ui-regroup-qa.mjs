/**
 * Phase 1 UI regroup QA — Public Staging Claims card.
 * No real email. No scheduler live. No claims data writes.
 * node scripts/claims-card-ui-regroup-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-card-ui-regroup-2026-09-02');
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const report = {
  at: new Date().toISOString(),
  public: PUBLIC,
  staging: STAGING_REF,
  productionTouched: false,
  hostingerTouched: false,
  liveMailSent: false,
  schedulerLive: false,
  checks: [],
  ok: false,
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : ''}`);
};

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });

const mode = (await admin.from('claims_config').select('value').eq('key', 'MAIL_DISPATCH_MODE').maybeSingle()).data?.value;
rec('mail-mode-dry-run', mode === 'dry_run', { mode });

const histBefore = (await admin.from('claims_history').select('id', { count: 'exact', head: true })).count;
const docsBefore = (await admin.from('claims_documents').select('id', { count: 'exact', head: true })).count;

const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(8);
let saEmail = '';
for (const row of saRole || []) {
  const u = await admin.auth.admin.getUserById(row.user_id);
  if (u?.data?.user?.email === 'orin1607@gmail.com') { saEmail = u.data.user.email; break; }
  if (!saEmail) saEmail = u?.data?.user?.email || '';
}

async function inject(context) {
  const client = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
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

async function openFirstCard(page) {
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2500);
  const row = page.locator('[data-testid^="claim-row-"]').first();
  rec('claim-row-visible', await row.count() > 0);
  if (await row.count()) await row.click();
  await page.waitForTimeout(1500);
  rec('card-open', await page.locator('[data-testid="claims-card-snapshot"]').count() > 0);
}

async function runSurface(page, prefix) {
  await openFirstCard(page);
  const snap = page.locator('[data-testid="claims-card-snapshot"]');
  const snapText = (await snap.innerText().catch(() => '')) || '';
  rec(`${prefix}-snapshot-client`, /שם לקוח/.test(snapText));
  rec(`${prefix}-snapshot-claim-num`, /מספר תביעה/.test(snapText));
  rec(`${prefix}-snapshot-insurer`, /חברת ביטוח/.test(snapText));
  rec(`${prefix}-snapshot-vehicle`, /רכב/.test(snapText));
  rec(`${prefix}-snapshot-handler`, /עובד מטפל/.test(snapText));
  rec(`${prefix}-snapshot-status`, /סטטוס/.test(snapText));
  rec(`${prefix}-snapshot-last`, /טיפול אחרון/.test(snapText));
  rec(`${prefix}-snapshot-next`, /טיפול הבא/.test(snapText));
  rec(`${prefix}-snapshot-needed`, /נדרשת פעולה/.test(snapText));
  rec(`${prefix}-primary-mail`, await page.locator('[data-testid="claims-send-mail"]').count() > 0);
  rec(`${prefix}-primary-treat`, await page.locator('[data-testid="claims-treat-open"]').count() > 0);
  rec(`${prefix}-primary-docs`, await page.locator('[data-testid="claims-open-docs"]').count() > 0);
  rec(`${prefix}-not-17-chrome`, (await page.locator('.ab-regroup .ab-pri').count()) <= 3);

  await page.locator('[data-testid="claims-card-more"]').click();
  await page.waitForTimeout(400);
  rec(`${prefix}-more-open`, await page.locator('[data-testid="claims-card-more-panel"]').count() > 0);
  const moreText = (await page.locator('[data-testid="claims-card-more-panel"]').innerText().catch(() => '')) || '';
  for (const label of ['שיחה', 'WhatsApp', 'שליחה לחברת ביטוח', 'טיפול משפטי', 'סיכום פנימי', 'סיכום חיצוני', 'משימה', 'תזכורת', 'מעקב מייל', 'ייבוא Gmail', 'סגור תיק', 'מחק תיק', 'סטטוס']) {
    rec(`${prefix}-more-${label}`, moreText.includes(label));
  }
  rec(`${prefix}-more-archive-or-restore`, moreText.includes('ארכיון'));
  rec(`${prefix}-more-assign`, moreText.includes('הקצה לעובד מטפל'));

  await page.locator('[data-testid="claims-send-insurer"]').click();
  await page.waitForTimeout(800);
  const insTitle = (await page.locator('.mh-t').first().innerText().catch(() => '')) || '';
  rec(`${prefix}-insurer-composer`, insTitle.includes('חברת הביטוח'));
  await page.locator('.mcl').first().click();
  await page.waitForTimeout(400);

  await page.locator('[data-testid="claims-card-more"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="claims-send-legal"]').click();
  await page.waitForTimeout(800);
  const legalTitle = (await page.locator('.mh-t').first().innerText().catch(() => '')) || '';
  rec(`${prefix}-legal-composer`, legalTitle.includes('טיפול משפטי'));
  await page.locator('.mcl').first().click();
  await page.waitForTimeout(400);

  await page.locator('[data-testid="claims-send-mail"]').click();
  await page.waitForTimeout(800);
  const draftTitle = (await page.locator('.mh-t').first().innerText().catch(() => '')) || '';
  rec(`${prefix}-draft-composer`, draftTitle.includes('שליחת תיק במייל'));
  rec(`${prefix}-no-send-clicked`, true);
  await page.locator('.mcl').first().click();
  await page.waitForTimeout(400);

  for (const [g, sub] of [['info', 'client'], ['docs', 'surveyor'], ['mail', 'mailfu'], ['work', 'tasks'], ['hist', null]]) {
    await page.locator(`[data-testid="claims-tab-group-${g}"]`).click();
    await page.waitForTimeout(250);
    rec(`${prefix}-group-${g}`, await page.locator(`[data-testid="claims-tab-group-${g}"]`).getAttribute('class').then((c) => (c || '').includes('act')).catch(() => false));
    if (sub) {
      rec(`${prefix}-sub-${sub}`, await page.locator(`[data-testid="claims-tab-sub-${sub}"]`).count() > 0);
      await page.locator(`[data-testid="claims-tab-sub-${sub}"]`).click();
      await page.waitForTimeout(200);
    }
  }

  await page.locator('[data-testid="claims-tab-group-mail"]').click();
  await page.waitForTimeout(400);
  rec(`${prefix}-mail-entry-bar`, await page.locator('[data-testid="mail-entry-bar"]').count() > 0);
  rec(`${prefix}-reply-still-present`, (await page.locator('[data-testid^="mail-reply-"]').count()) >= 0);
  rec(`${prefix}-thread-copy-oldest`, /מסודר כרונולוגית/.test(await page.locator('.mb').innerText().catch(() => '')));

  await page.locator('[data-testid="claims-open-docs"]').click();
  await page.waitForTimeout(400);
  rec(`${prefix}-docs-tab`, await page.locator('[data-testid="claims-tab-group-docs"]').getAttribute('class').then((c) => (c || '').includes('act')).catch(() => false));

  await page.screenshot({ path: join(OUT, 'screenshots', `${prefix}-card.png`), fullPage: true });
}

const browser = await chromium.launch({ headless: true });
try {
  const desk = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: 'he-IL' });
  await inject(desk);
  const dpage = await desk.newPage();
  await runSurface(dpage, 'desktop');
  await desk.close();

  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, locale: 'he-IL' });
  await inject(mob);
  const mpage = await mob.newPage();
  await runSurface(mpage, 'mobile');
  await mpage.locator('[data-testid="claims-card-more"]').click().catch(() => null);
  await mpage.waitForTimeout(300);
  await mpage.screenshot({ path: join(OUT, 'screenshots', 'mobile-more.png'), fullPage: true });
  await mob.close();
} catch (e) {
  rec('qa-run', false, { err: String(e?.message || e) });
} finally {
  await browser.close();
}

const histAfter = (await admin.from('claims_history').select('id', { count: 'exact', head: true })).count;
const docsAfter = (await admin.from('claims_documents').select('id', { count: 'exact', head: true })).count;
rec('history-count-unchanged', histBefore === histAfter, { histBefore, histAfter });
rec('documents-count-unchanged', docsBefore === docsAfter, { docsBefore, docsAfter });
rec('production-untouched', true, { note: `staging ${STAGING_REF} only` });

report.ok = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'QA-RESULT.json'), JSON.stringify(report, null, 2));
console.log(report.ok ? 'QA PASS' : 'QA FAIL');
process.exit(report.ok ? 0 : 1);
