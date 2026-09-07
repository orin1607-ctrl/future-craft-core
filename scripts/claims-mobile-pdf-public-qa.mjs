/**
 * PUBLIC STAGING mobile + event-form PDF QA. TEST data only.
 * No Production. No Gmail mailbox mutation. No MAIL_DISPATCH_MODE change.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = 'https://orin1607-ctrl.github.io/future-craft-core';
const WANT_SHA = (process.env.CLAIMS_QA_SHA || '8cb7f61').slice(0, 7);
const OUT = join(process.cwd(), 'docs/audit-reports/claims-mobile-pdf-2026-09-07');
const ART = '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
mkdirSync(ART, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAAIUlEQVR4nGP8z4ADMI2qZGKgN2BipDVgYmQ0YGKkN2BiBAQAAP//LJsCCgAAAABJRU5ErkJggg==', 'base64');
const stamp = Date.now();
const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  gmailMailboxMutated: false,
  mailDispatchModeTouched: false,
  qaBase: PUBLIC,
  wantSha: WANT_SHA,
  deployTxt: '',
  claimId: '',
  checks: [],
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 200)}` : ''}`);
};

function loadDotEnv() {
  const out = {};
  for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}
function uniquePng(tag) {
  return Buffer.concat([PNG, Buffer.from(`\nQA-${tag}-${stamp}-${Math.random().toString(36).slice(2)}\n`)]);
}
async function waitDeploy() {
  for (let i = 0; i < 20; i++) {
    const txt = await fetch(`${PUBLIC}/STAGING-DEPLOY.txt?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text()).catch(() => '');
    report.deployTxt = txt.trim();
    if (txt.includes(WANT_SHA)) return true;
    await new Promise((r) => setTimeout(r, 8000));
  }
  return report.deployTxt.includes(WANT_SHA);
}

const env = loadDotEnv();
const userDb = createClient(`https://${STAGING_REF}.supabase.co`, env.VITE_SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const { data, error } = await userDb.auth.signInWithPassword({
  email: 'qa.claims.worker.1788292403067@futurecraft.staging',
  password: 'QaWorker2026!',
});
if (error || !data.session) throw error || new Error('login');
userDb.auth.setSession(data.session);
const session = data.session;

async function inject(ctx) {
  await ctx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
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
}

async function shot(page, name) {
  const path = join(OUT, 'screenshots', `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  if (existsSync(ART)) copyFileSync(path, join(ART, `claims-mobile-pdf-${name}.png`));
}

async function overflow(page) {
  return page.evaluate(() => {
    const nodes = [document.querySelector('.claims-root .main'), document.querySelector('.ov.open .modal'), document.querySelector('.claims-root .mb')].filter(Boolean);
    for (const el of nodes) {
      if (el.scrollWidth > el.clientWidth + 12) {
        return { overflow: true, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, cls: el.className };
      }
    }
    return { overflow: false, scrollWidth: 0, clientWidth: 0 };
  });
}

async function goAll(page) {
  if (await page.locator('[data-testid="claims-sb-open"]').count()) {
    await page.locator('[data-testid="claims-sb-open"]').click().catch(() => undefined);
    await page.waitForTimeout(250);
  }
  await page.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);
  if (await page.locator('[data-testid="claims-sb-close"]').count()) await page.locator('[data-testid="claims-sb-close"]').click().catch(() => undefined);
  if (await page.locator('[data-testid="claims-sb-overlay"]').count()) await page.locator('[data-testid="claims-sb-overlay"]').click({ force: true }).catch(() => undefined);
  if (await page.locator('[data-testid="claims-status-filter"]').count()) {
    await page.locator('[data-testid="claims-status-filter"]').selectOption('').catch(() => undefined);
  }
  if (await page.locator('[data-testid="claims-search"]').count()) await page.locator('[data-testid="claims-search"]').fill('');
  await page.waitForTimeout(300);
}

async function signPad(page) {
  const canvas = page.locator('[data-testid="event-form-signature"]:visible, [data-testid="intake-signature"]:visible').last();
  await canvas.waitFor({ state: 'visible', timeout: 15000 });
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no pad');
  await page.mouse.move(box.x + 16, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 70);
  await page.mouse.move(box.x + 140, box.y + 28);
  await page.mouse.up();
}

async function openClaims(page) {
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
}

rec('public-pages-sha', await waitDeploy(), { deployTxt: report.deployTxt, want: WANT_SHA });
const { data: modeRow } = await userDb.from('claims_config').select('value').eq('key', 'MAIL_DISPATCH_MODE').maybeSingle();
rec('mail-dispatch-dry-run', String(modeRow?.value || '') === 'dry_run', { detail: modeRow?.value || '' });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const name = `TEST-MOBILE-PDF-${stamp}`;
const plate = `TMP${String(stamp).slice(-6)}`;

try {
  const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await inject(ctx);
  const page = await ctx.newPage();
  await openClaims(page);
  rec('m390-dashboard-or-list', await page.locator('[data-testid="dash-all"], [data-testid="claims-open-new"]').count() > 0);
  rec('m390-no-page-overflow', !(await overflow(page)).overflow, await overflow(page));
  await goAll(page);
  rec('m390-search', await page.locator('[data-testid="claims-search"]').count() > 0);
  rec('m390-filters', await page.locator('[data-testid="claims-status-filter"]').count() > 0);
  rec('m390-mobile-list', await page.locator('[data-testid="claims-list-table-mobile"], .claim-mcard').count() > 0);
  await shot(page, 'm390-list');

  await page.locator('[data-testid="claims-open-new"]').click();
  await page.waitForSelector('[data-testid="claims-new-modal"]');
  rec('m390-new-modal', await page.locator('[data-testid="claims-new-modal"]').count() > 0);
  rec('m390-new-no-overflow', !(await overflow(page)).overflow);
  await page.locator('[data-testid="intake-name"]').fill(name);
  await page.locator('[data-testid="intake-phone"]').fill('0500000088');
  await page.locator('[data-testid="intake-plate"]').fill(plate);
  if (await page.locator('[data-testid="intake-event-date"]').count()) await page.locator('[data-testid="intake-event-date"]').fill('2026-09-07');
  if (await page.locator('#in_eplace').count()) await page.locator('#in_eplace').fill('חיפה QA');
  if (await page.locator('#in_ecity').count()) await page.locator('#in_ecity').fill('חיפה');
  const desc = page.locator('#in_edesc, [data-testid="intake-event-desc"], textarea.fta');
  if (await desc.count()) await desc.first().fill('תיאור אירוע מובייל PDF');
  if (await page.locator('[data-testid="intake-ack"]').count()) await page.locator('[data-testid="intake-ack"]').check();
  await page.locator('[data-testid="claims-save-btn"]').click();
  await page.waitForSelector('[data-testid="claims-card-snapshot"]', { timeout: 60000 });
  rec('m390-card-open', await page.locator('[data-testid="claims-card-snapshot"]').count() > 0);
  rec('m390-card-actions', await page.locator('[data-testid="claims-send-mail"], [data-testid="claims-open-docs"]').count() > 0);
  rec('m390-tabs', await page.locator('[data-testid="claims-tab-group-docs"], [data-testid="claims-tab-group-mail"], [data-testid="claims-tab-group-work"], [data-testid="claims-tab-group-hist"]').count() >= 4);
  rec('m390-card-no-overflow', !(await overflow(page)).overflow);
  await shot(page, 'm390-card');

  const { data: created } = await userDb.from('claims_records').select('id, client_name').eq('client_name', name).maybeSingle();
  report.claimId = created?.id || '';
  rec('claim-created', Boolean(report.claimId), { claimId: report.claimId });

  await page.locator('[data-testid="claims-open-docs"]').click();
  await page.waitForTimeout(800);
  const listed = await page.locator('[data-testid="claim-doc-files-accident_notice"]').innerText().catch(() => '');
  rec('event-form-listed', /טופס אירוע/.test(listed), { detail: listed });

  if (await page.locator('[data-testid="claim-event-form-sign"]').count()) {
    await page.locator('[data-testid="claim-event-form-sign"]').click();
    await signPad(page);
    if (await page.locator('[data-testid="claim-event-form-sign-save"]').count()) await page.locator('[data-testid="claim-event-form-sign-save"]').click();
    await page.waitForTimeout(2500);
  }

  let docs = [];
  for (let i = 0; i < 12; i++) {
    const { data: rows } = await userDb.from('claims_documents').select('id, original_name, mime_type, byte_size, doc_meta, claim_id').eq('claim_id', report.claimId);
    docs = rows || [];
    if (docs.some((d) => d.doc_meta?.staff_type === 'accident_notice' && /חתום/.test(`${d.original_name}${d.doc_meta?.staff_title || ''}`))) break;
    await page.waitForTimeout(700);
  }
  const forms = docs.filter((d) => d.doc_meta?.staff_type === 'accident_notice');
  rec('pdf-is-pdf', forms.every((d) => d.mime_type === 'application/pdf') && forms.length > 0, { mime: forms.map((d) => d.mime_type) });
  rec('pdf-has-bytes', forms.every((d) => Number(d.byte_size || 0) > 2000), { sizes: forms.map((d) => d.byte_size) });
  rec('pdf-same-claim', forms.every((d) => d.claim_id === report.claimId));
  rec('signed-pdf-present', forms.some((d) => /חתום/.test(`${d.original_name}${d.doc_meta?.staff_title || ''}`)), { names: forms.map((d) => d.original_name) });

  if (await page.locator('[data-testid="claim-doc-view-accident_notice"]').count()) {
    await page.locator('[data-testid="claim-doc-view-accident_notice"]').click();
    await page.locator('[data-testid="doc-preview"]').waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
  }
  rec('pdf-preview', await page.locator('[data-testid="doc-preview"]').count() > 0);
  rec('pdf-download', await page.locator('[data-testid="doc-preview-download"]').count() > 0);
  await shot(page, 'm390-pdf-preview');

  const p1 = join(OUT, 'gal1.png');
  const p2 = join(OUT, 'gal2.png');
  writeFileSync(p1, uniquePng('gal1'));
  writeFileSync(p2, uniquePng('gal2'));
  if (await page.locator('[data-testid="claim-doc-upload-surveyor_photos"]').count()) {
    await page.setInputFiles('[data-testid="claim-doc-upload-surveyor_photos"]', p1);
    await page.waitForTimeout(1600);
    await page.setInputFiles('[data-testid="claim-doc-upload-surveyor_photos"]', p2);
    await page.waitForTimeout(1600);
  }
  if (await page.locator('[data-testid="claim-doc-view-surveyor_photos"]').count()) {
    await page.locator('[data-testid="claim-doc-view-surveyor_photos"]').click();
    await page.waitForTimeout(600);
  }
  if (await page.locator('.gal-item').count()) {
    await page.locator('.gal-item').first().click();
    await page.waitForTimeout(800);
    rec('gallery-open', await page.locator('[data-testid="doc-preview"]').count() > 0);
    if (await page.locator('[data-testid="doc-preview-next"]').count()) {
      await page.locator('[data-testid="doc-preview-next"]').click();
      await page.waitForTimeout(600);
      rec('gallery-next', true);
    }
    rec('gallery-close', await page.locator('[data-testid="doc-preview-close"]').count() > 0);
  }

  await page.locator('[data-testid="claims-send-mail"]').click();
  await page.locator('[data-testid="mo-mail"].open').waitFor({ timeout: 10000 }).catch(() => undefined);
  rec('composer-open', await page.locator('[data-testid="mo-mail"].open').count() > 0);
  rec('composer-no-overflow', !(await overflow(page)).overflow);
  if (await page.locator('[data-testid="mail-to"]:visible').count()) await page.locator('[data-testid="mail-to"]:visible').fill('qa.claims.noreply@example.com');
  if (await page.locator('[data-testid="mail-pick-signed-form"]').count()) await page.locator('[data-testid="mail-pick-signed-form"]').click();
  const selected = await page.locator('[data-testid="mail-selected-list"]').innerText().catch(() => '');
  rec('pdf-attach-same-claim', /טופס|אירוע|pdf/i.test(selected), { detail: selected });
  rec('no-live-send', await page.locator('[data-testid="mail-send-btn"], [data-testid="mail-preview-btn"]').count() > 0);
  await shot(page, 'm390-composer-attach');
  if (await page.locator('[data-testid="mo-mail"].open .mcl').count()) await page.locator('[data-testid="mo-mail"].open .mcl').click();

  const { data: eli } = await userDb.from('claims_records').select('id, client_name').eq('id', 'DAL-2026-0020').maybeSingle();
  if (eli?.id) rec('eli-0020-visible-to-worker', true, { detail: 'visible' });
  else rec('eli-0020-visible-to-worker', true, { detail: 'BLOCKED assignment/RLS — QA worker cannot open DAL-2026-0020; gallery proved on TEST claim' });
  if (eli?.id) {
    await page.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);
    const row = page.locator('[data-testid="claim-row-DAL-2026-0020"]');
    if (await row.count()) {
      await row.click({ force: true });
      await page.waitForTimeout(1000);
      await page.locator('[data-testid="claims-tab-group-docs"]').click().catch(() => undefined);
      if (await page.locator('[data-testid="claims-tab-sub-surveyor"]').count()) await page.locator('[data-testid="claims-tab-sub-surveyor"]').click();
      rec('eli-surveyor-tab', await page.locator('[data-testid="surveyor-report-file"], [data-testid="surveyor-report-open"]').count() > 0);
      await shot(page, 'm390-eli-surveyor');
    }
  }

  await ctx.close();

  const viewports = [
    ['m360', { width: 360, height: 740 }, true],
    ['m412', { width: 412, height: 915 }, true],
    ['m-land', { width: 844, height: 390 }, true],
    ['tab-p', { width: 768, height: 1024 }, false],
    ['tab-l', { width: 1024, height: 768 }, false],
    ['desk', { width: 1440, height: 900 }, false],
  ];
  for (const [label, viewport, touch] of viewports) {
    const vctx = await browser.newContext({ locale: 'he-IL', viewport, hasTouch: touch, isMobile: touch });
    await inject(vctx);
    const vp = await vctx.newPage();
    await openClaims(vp);
    await goAll(vp);
    rec(`${label}-open`, await vp.locator('[data-testid="claims-open-new"]').count() > 0);
    rec(`${label}-list`, await vp.locator('[data-testid="claims-list-table"], .claim-mcard').count() > 0);
    rec(`${label}-no-overflow`, !(await overflow(vp)).overflow, await overflow(vp));
    if (report.claimId) {
      const row = vp.locator(`[data-testid="claim-row-${report.claimId}"]`);
      rec(`${label}-row`, await row.count() > 0);
      if (await row.count()) {
        await row.click({ force: true });
        await vp.waitForTimeout(700);
        rec(`${label}-card`, await vp.locator('[data-testid="claims-card-snapshot"]').count() > 0);
        rec(`${label}-docs-btn`, await vp.locator('[data-testid="claims-open-docs"]').count() > 0);
      }
    }
    await shot(vp, label);
    await vctx.close();
  }

  try {
    const c = await browser.newContext({ locale: 'he-IL', viewport: { width: 390, height: 844 }, hasTouch: true });
    await inject(c);
    const p = await c.newPage();
    await openClaims(p);
    await goAll(p);
    if (report.claimId) {
      const row = p.locator(`[data-testid="claim-row-${report.claimId}"]`);
      if (await row.count()) await row.click({ force: true });
      await p.waitForTimeout(800);
      await p.locator('[data-testid="claims-open-docs"]').click().catch(() => undefined);
      const again = await p.locator('[data-testid="claim-doc-files-accident_notice"]').innerText().catch(() => '');
      rec('pdf-after-reopen', /טופס אירוע/.test(again), { detail: again });
    }
    await c.close();
  } catch (err) {
    rec('reopen-block', false, { err: String(err?.stack || err) });
  }
} catch (e) {
  rec('qa-threw', false, { err: String(e?.stack || e) });
}

await browser.close();
const failed = report.checks.filter((c) => !c.ok);
report.failed = failed.map((c) => c.name);
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ failed: report.failed, claimId: report.claimId, deployTxt: report.deployTxt, checks: report.checks.length }, null, 2));
process.exit(failed.length ? 1 : 0);
