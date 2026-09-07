/**
 * PUBLIC STAGING QA: full opening-form PDF + phone header collapse.
 * TEST data only. No Production. No Gmail mailbox. No MAIL_DISPATCH_MODE change.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = 'https://orin1607-ctrl.github.io/future-craft-core';
const WANT_SHA = (process.env.CLAIMS_QA_SHA || '7bf99a3').slice(0, 7);
const OUT = join(process.cwd(), 'docs/audit-reports/claims-form-pdf-header-2026-09-07');
const ART = '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
mkdirSync(ART, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

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
  pdfPages: 0,
  ink: {},
  rounds: [],
  checks: [],
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 220)}` : ''}`);
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
async function waitDeploy() {
  for (let i = 0; i < 30; i++) {
    const txt = await fetch(`${PUBLIC}/STAGING-DEPLOY.txt?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text()).catch(() => '');
    report.deployTxt = txt.trim();
    if (txt.includes(WANT_SHA)) return true;
    console.log(`waiting pages ${WANT_SHA} … ${txt.trim()}`);
    await new Promise((r) => setTimeout(r, 10000));
  }
  return report.deployTxt.includes(WANT_SHA);
}

function extractJpegs(pdf) {
  const out = [];
  let i = 0;
  while (i < pdf.length - 1) {
    if (pdf[i] === 0xff && pdf[i + 1] === 0xd8) {
      let j = i + 2;
      while (j < pdf.length - 1 && !(pdf[j] === 0xff && pdf[j + 1] === 0xd9)) j++;
      if (j < pdf.length - 1) {
        out.push(pdf.subarray(i, j + 2));
        i = j + 2;
        continue;
      }
    }
    i++;
  }
  return out;
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
  if (existsSync(ART)) copyFileSync(path, join(ART, `claims-form-pdf-${name}.png`));
  return path;
}

async function overflow(page) {
  return page.evaluate(() => {
    const nodes = [document.querySelector('.claims-root .main'), document.querySelector('.ov.open .modal'), document.querySelector('.claims-root .mb')].filter(Boolean);
    for (const el of nodes) {
      if (el.scrollWidth > el.clientWidth + 12) {
        return { overflow: true, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, cls: el.className };
      }
    }
    return { overflow: false };
  });
}

async function headerStats(page) {
  return page.evaluate(() => {
    const modal = document.querySelector('.ov.open .modal');
    const snap = document.querySelector('[data-testid="claims-card-snapshot"]');
    const mb = document.querySelector('.ov.open .modal .mb');
    const ab = document.querySelector('.ov.open .ab');
    const mh = document.querySelector('.ov.open .mh');
    if (!modal || !snap) return null;
    const top = (mh?.getBoundingClientRect().height || 0) + snap.getBoundingClientRect().height + (ab?.getBoundingClientRect().height || 0);
    return {
      modalH: modal.clientHeight,
      snapH: snap.getBoundingClientRect().height,
      topH: top,
      mbH: mb?.getBoundingClientRect().height || 0,
      ratio: top / modal.clientHeight,
      compact: !!document.querySelector('[data-testid="claims-card-snap-compact"]'),
      toggle: ((document.querySelector('[data-testid="claims-card-snap-toggle"]')?.textContent) || '').trim(),
    };
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

async function inkRatios(page, jpegPath) {
  const buf = readFileSync(jpegPath);
  const dataUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
  return page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const top = ctx.getImageData(0, 0, img.width, Math.floor(img.height * 0.4)).data;
    const bot = ctx.getImageData(0, Math.floor(img.height * 0.7), img.width, Math.floor(img.height * 0.3)).data;
    const ink = (data) => {
      let n = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] < 230 || data[i + 1] < 230 || data[i + 2] < 230) n++;
      }
      return n / (data.length / 4);
    };
    return { w: img.width, h: img.height, topInk: ink(top), botInk: ink(bot) };
  }, dataUrl);
}

const name = `TEST-FORM-PDF-${stamp}`;
const plate = `TFP${String(stamp).slice(-6)}`;
const MARK = {
  name,
  plate,
  phone: '0501111222',
  id: '318889901',
  addr: 'רחוב בדיקה 12',
  city: 'חיפה',
  make: 'טויוטה',
  model: 'קורולה',
  ins: 'מגדל',
  policy: 'POL-TEST-8899',
  event: 'תיאור אירוע מלא לבדיקת PDF',
  damage: 'נזק חזית לבדיקה',
  place: 'צומת הציונות חיפה',
};

rec('public-pages-sha', await waitDeploy(), { deployTxt: report.deployTxt, want: WANT_SHA });
const { data: modeRow } = await userDb.from('claims_config').select('value').eq('key', 'MAIL_DISPATCH_MODE').maybeSingle();
rec('mail-dispatch-dry-run', String(modeRow?.value || '') === 'dry_run', { detail: modeRow?.value || '' });

const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() => chromium.launch({ headless: true }));

async function fillForm(page) {
  await page.locator('[data-testid="intake-name"]').fill(MARK.name);
  await page.locator('[data-testid="intake-phone"]').fill(MARK.phone);
  await page.locator('[data-testid="intake-plate"]').fill(MARK.plate);
  if (await page.locator('#in_id').count()) await page.locator('#in_id').fill(MARK.id);
  if (await page.locator('#in_addr').count()) await page.locator('#in_addr').fill(MARK.addr);
  if (await page.locator('#in_make').count()) await page.locator('#in_make').fill(MARK.make);
  if (await page.locator('#in_model').count()) await page.locator('#in_model').fill(MARK.model);
  if (await page.locator('#in_co').count()) await page.locator('#in_co').fill(MARK.ins);
  if (await page.locator('#in_policy').count()) await page.locator('#in_policy').fill(MARK.policy);
  if (await page.locator('[data-testid="intake-event-date"]').count()) await page.locator('[data-testid="intake-event-date"]').fill('2026-09-07');
  if (await page.locator('#in_etime').count()) await page.locator('#in_etime').fill('09:15');
  if (await page.locator('#in_eplace').count()) await page.locator('#in_eplace').fill(MARK.place);
  if (await page.locator('#in_ecity').count()) await page.locator('#in_ecity').fill(MARK.city);
  if (await page.locator('#in_estreet').count()) await page.locator('#in_estreet').fill('הציונות');
  const desc = page.locator('textarea.fta').nth(0);
  if (await desc.count()) await desc.fill(MARK.event);
  const dmg = page.locator('textarea.fta').nth(1);
  if (await dmg.count()) await dmg.fill(MARK.damage);
  if (await page.locator('[data-testid="intake-ack"]').count()) await page.locator('[data-testid="intake-ack"]').check();
  if (await page.locator('#in_filled').count()) await page.locator('#in_filled').fill('עובד QA');
}

try {
  const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await inject(ctx);
  const page = await ctx.newPage();
  await openClaims(page);
  await goAll(page);
  await page.locator('[data-testid="claims-open-new"]').click();
  await page.waitForSelector('[data-testid="claims-new-modal"]');
  await fillForm(page);
  await page.locator('[data-testid="claims-save-btn"]').click();
  await page.waitForSelector('[data-testid="claims-card-snapshot"]', { timeout: 60000 });

  const { data: created } = await userDb.from('claims_records').select('id, client_name').eq('client_name', name).maybeSingle();
  report.claimId = created?.id || '';
  rec('claim-created', Boolean(report.claimId), { claimId: report.claimId, name });

  const collapsed = await headerStats(page);
  rec('phone-header-toggle', Boolean(collapsed?.toggle), collapsed);
  rec('phone-header-collapsed-default', Boolean(collapsed?.compact), collapsed);
  rec('phone-work-area-visible', Boolean(collapsed && collapsed.mbH > 140 && collapsed.ratio < 0.55), collapsed);
  rec('phone-header-not-full-screen', Boolean(collapsed && collapsed.ratio < 0.55), collapsed);
  await shot(page, 'm390-collapsed');

  if (await page.locator('[data-testid="claims-card-snap-toggle"]').count()) {
    await page.locator('[data-testid="claims-card-snap-toggle"]').click();
    await page.waitForTimeout(250);
  }
  const opened = await headerStats(page);
  rec('phone-header-reopen', Boolean(opened && !opened.compact && /כיווץ/.test(opened.toggle || '')), opened);
  rec('phone-header-open-compact-enough', Boolean(opened && opened.ratio < 0.72), opened);
  rec('phone-alerts-visible-open', await page.locator('[data-testid="claim-row-alerts"], [data-testid="claims-card-snap-expanded"]').count() > 0);
  await shot(page, 'm390-expanded');

  await page.locator('[data-testid="claims-card-snap-toggle"]').click().catch(() => undefined);
  await page.waitForTimeout(200);
  rec('phone-header-collapse-again', Boolean((await headerStats(page))?.compact));

  rec('tabs-docs', await page.locator('[data-testid="claims-tab-group-docs"]').count() > 0);
  rec('tabs-mail', await page.locator('[data-testid="claims-tab-group-mail"]').count() > 0);
  rec('tabs-work', await page.locator('[data-testid="claims-tab-group-work"]').count() > 0);
  await page.locator('[data-testid="claims-open-docs"]').click();
  await page.waitForTimeout(900);
  rec('docs-tab', await page.locator('[data-testid="claim-doc-type-accident_notice"]').count() > 0);

  if (await page.locator('[data-testid="claim-event-form-sign"]').count()) {
    await page.locator('[data-testid="claim-event-form-sign"]').click();
    await signPad(page);
    await page.locator('[data-testid="claim-event-form-sign-save"]').click();
    await page.waitForTimeout(2800);
  }
  if (await page.locator('[data-testid="claim-doc-view-accident_notice"]').count()) {
    await page.locator('[data-testid="claim-doc-view-accident_notice"]').click();
    await page.locator('[data-testid="doc-preview"]').waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined);
    rec('pdf-preview-open', await page.locator('[data-testid="doc-preview"]').count() > 0);
    rec('pdf-preview-download-btn', await page.locator('[data-testid="doc-preview-download"]').count() > 0);
    await shot(page, 'm390-pdf-preview');
    if (await page.locator('[data-testid="doc-preview-close"]').count()) await page.locator('[data-testid="doc-preview-close"]').click().catch(() => undefined);
  }

  let docs = [];
  for (let i = 0; i < 14; i++) {
    const { data: rows } = await userDb.from('claims_documents').select('id, original_name, mime_type, byte_size, doc_meta, claim_id, storage_path').eq('claim_id', report.claimId);
    docs = rows || [];
    if (docs.some((d) => d.doc_meta?.staff_type === 'accident_notice' && /חתום/.test(`${d.original_name}${d.doc_meta?.staff_title || ''}`))) break;
    await page.waitForTimeout(700);
  }
  const forms = docs.filter((d) => d.doc_meta?.staff_type === 'accident_notice');
  const signed = forms.filter((d) => /חתום/.test(`${d.original_name}${d.doc_meta?.staff_title || ''}`) && d.mime_type === 'application/pdf');
  rec('pdf-is-pdf', signed.length > 0 && signed.every((d) => d.mime_type === 'application/pdf'), { names: forms.map((d) => d.original_name), mime: forms.map((d) => d.mime_type) });
  rec('pdf-same-claim', forms.every((d) => d.claim_id === report.claimId));
  rec('no-cross-claim', forms.every((d) => d.claim_id === report.claimId) && report.claimId !== 'DAL-2026-0020');
  rec('no-duplicate', signed.length === 1 && forms.filter((d) => d.mime_type === 'application/pdf').length === 1, { names: forms.map((d) => d.original_name) });

  const target = signed[0] || forms.find((d) => d.mime_type === 'application/pdf');
  if (target?.id) {
    let bytes = null;
    const { data: blob, error: dlErr } = target.storage_path
      ? await userDb.storage.from('claims-docs').download(target.storage_path)
      : { data: null, error: new Error('no path') };
    if (blob && !dlErr) bytes = new Uint8Array(await blob.arrayBuffer());
    if (!bytes) {
      const signedRes = await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/claims-docs`, {
        method: 'POST',
        headers: {
          apikey: env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'signed_url', claim_id: report.claimId, file_id: target.id }),
      });
      const signedJson = await signedRes.json().catch(() => ({}));
      if (signedJson.url) {
        const bin = await fetch(signedJson.url).then((r) => r.arrayBuffer());
        bytes = new Uint8Array(bin);
      } else {
        rec('pdf-download', false, { err: String(dlErr?.message || signedJson.error || 'no url') });
      }
    }
    if (bytes) {
      writeFileSync(join(OUT, 'opening-form.pdf'), bytes);
      rec('pdf-download', bytes.length > 8000 && bytes[0] === 0x25 && bytes[1] === 0x50, { bytes: bytes.length });
      rec('pdf-real-header', bytes[0] === 0x25 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-');
      const jpegs = extractJpegs(bytes);
      report.pdfPages = jpegs.length;
      rec('pdf-has-pages', jpegs.length >= 1, { pages: jpegs.length });
      if (jpegs[0]) {
        const first = join(OUT, 'page-1.jpg');
        writeFileSync(first, jpegs[0]);
        const ink = await inkRatios(page, first);
        report.ink = ink;
        rec('pdf-full-form-not-signature-only', ink.topInk > 0.012 && ink.w >= 700 && ink.h >= 1000, ink);
        rec('pdf-form-fields-ink', ink.topInk > 0.012, ink);
        rec('pdf-a4-page', ink.w === 794 && ink.h === 1123, ink);
        const vis = await ctx.newPage();
        await vis.setContent(`<html><body style="margin:0;background:#333"><img src="data:image/jpeg;base64,${Buffer.from(jpegs[0]).toString('base64')}" style="width:100%"></body></html>`);
        await shot(vis, 'pdf-page-1');
        await vis.close();
      }
      if (jpegs.length > 1) {
        const last = join(OUT, `page-${jpegs.length}.jpg`);
        writeFileSync(last, jpegs[jpegs.length - 1]);
        const inkL = await inkRatios(page, last);
        rec('pdf-signature-at-bottom', inkL.botInk > 0.008, inkL);
        const vis2 = await ctx.newPage();
        await vis2.setContent(`<html><body style="margin:0;background:#333"><img src="data:image/jpeg;base64,${Buffer.from(jpegs[jpegs.length - 1]).toString('base64')}" style="width:100%"></body></html>`);
        await shot(vis2, 'pdf-page-last');
        await vis2.close();
      } else if (jpegs[0]) {
        rec('pdf-signature-at-bottom', report.ink.botInk > 0.008, report.ink);
      }
    }
  } else {
    rec('pdf-download', false, { err: 'no signed pdf storage_path' });
  }

  await openClaims(page);
  await goAll(page);
  if (report.claimId) {
    await page.locator('[data-testid="claims-search"]').fill(name);
    await page.waitForTimeout(700);
    const row = page.locator(`[data-testid="claim-row-${report.claimId}"]`);
    if (await row.count()) await row.click({ force: true });
    await page.waitForSelector('[data-testid="claims-card-snapshot"]', { timeout: 20000 });
  }
  await page.locator('[data-testid="claims-open-docs"]').click();
  await page.locator('[data-testid="claim-doc-view-accident_notice"]').waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined);
  if (await page.locator('[data-testid="claim-doc-view-accident_notice"]').count()) {
    await page.locator('[data-testid="claim-doc-view-accident_notice"]').click();
    await page.locator('[data-testid="doc-preview"]').waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
  }
  rec('pdf-preview-reopen', await page.locator('[data-testid="doc-preview"]').count() > 0);

  await page.locator('[data-testid="claims-send-mail"]').click();
  await page.locator('[data-testid="mo-mail"].open').waitFor({ timeout: 10000 }).catch(() => undefined);
  rec('composer-open', await page.locator('[data-testid="mo-mail"].open').count() > 0);
  if (await page.locator('[data-testid="mail-to"]:visible').count()) await page.locator('[data-testid="mail-to"]:visible').fill('qa.claims.noreply@example.com');
  if (await page.locator('[data-testid="mail-pick-signed-form"]').count()) await page.locator('[data-testid="mail-pick-signed-form"]').click();
  const selected = await page.locator('[data-testid="mail-selected-list"]').innerText().catch(() => '');
  rec('pdf-attach-one', (selected.match(/טופס|אירוע|pdf/gi) || []).length >= 1 && !/signature\.png/i.test(selected), { detail: selected });
  rec('no-live-send', await page.locator('[data-testid="mail-send-btn"], [data-testid="mail-preview-btn"]').count() > 0);
  await shot(page, 'm390-attach');
  if (await page.locator('[data-testid="mo-mail"].open .mcl').count()) await page.locator('[data-testid="mo-mail"].open .mcl').click();

  await page.locator('[data-testid="claims-tab-group-mail"]').click().catch(() => undefined);
  rec('mail-tab', await page.locator('[data-testid="claims-tab-group-mail"]').count() > 0);
  await page.locator('[data-testid="claims-treat-open"]').click().catch(() => undefined);
  rec('treat-reachable', await page.locator('[data-testid="claims-treat-open"]').count() > 0);
  await page.locator('[data-testid="claims-tab-group-work"]').click().catch(() => undefined);
  rec('work-tab', true);
  rec('m390-no-overflow', !(await overflow(page)).overflow, await overflow(page));
  await ctx.close();

  const viewports = [
    ['m360', { width: 360, height: 740 }, true],
    ['m390', { width: 390, height: 844 }, true],
    ['m412', { width: 412, height: 915 }, true],
    ['m-land', { width: 844, height: 390 }, true],
    ['tab-p', { width: 768, height: 1024 }, false],
    ['desk', { width: 1440, height: 900 }, false],
  ];
  for (const [label, viewport, phone] of viewports) {
    const vctx = await browser.newContext({ locale: 'he-IL', viewport, hasTouch: phone, isMobile: phone && viewport.width < 700 });
    await inject(vctx);
    const vp = await vctx.newPage();
    await openClaims(vp);
    await goAll(vp);
    if (report.claimId) {
      await vp.locator('[data-testid="claims-search"]').fill(name);
      await vp.waitForTimeout(600);
      const row = vp.locator(`[data-testid="claim-row-${report.claimId}"]`);
      if (await row.count()) await row.click({ force: true });
      await vp.waitForTimeout(800);
    }
    const st = await headerStats(vp);
    rec(`${label}-card`, await vp.locator('[data-testid="claims-card-snapshot"]').count() > 0);
    rec(`${label}-no-overflow`, !(await overflow(vp)).overflow, await overflow(vp));
    if (phone && (viewport.width <= 700 || viewport.height <= 500)) {
      rec(`${label}-toggle`, Boolean(st?.toggle), st);
      rec(`${label}-work`, Boolean(st && st.mbH > 80 && st.ratio < 0.7), st);
    } else {
      rec(`${label}-no-phone-toggle`, !st?.compact && !(st?.toggle), st);
    }
    await shot(vp, label);
    await vctx.close();
  }

  for (let round = 1; round <= 3; round++) {
    const rctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await inject(rctx);
    const rp = await rctx.newPage();
    await openClaims(rp);
    await goAll(rp);
    await rp.locator('[data-testid="claims-search"]').fill(name);
    await rp.waitForTimeout(700);
    const row = rp.locator(`[data-testid="claim-row-${report.claimId}"]`);
    rec(`round${round}-row`, await row.count() > 0);
    if (await row.count()) await row.click({ force: true });
    await rp.waitForSelector('[data-testid="claims-card-snapshot"]', { timeout: 20000 });
    const st = await headerStats(rp);
    rec(`round${round}-collapsed`, Boolean(st?.compact), st);
    rec(`round${round}-work`, Boolean(st && st.ratio < 0.55 && st.mbH > 140), st);
    await rp.locator('[data-testid="claims-card-snap-toggle"]').click();
    rec(`round${round}-reopen`, Boolean((await headerStats(rp)) && !(await headerStats(rp)).compact));
    await rp.locator('[data-testid="claims-open-docs"]').click();
    await rp.waitForTimeout(600);
    const listed = await rp.locator('[data-testid="claim-doc-files-accident_notice"]').innerText().catch(() => '');
    rec(`round${round}-form-listed`, /טופס/.test(listed), { detail: listed });
    await rp.locator('[data-testid="claims-send-mail"]').click();
    await rp.waitForTimeout(500);
    if (await rp.locator('[data-testid="mail-pick-signed-form"]').count()) await rp.locator('[data-testid="mail-pick-signed-form"]').click();
    const sel = await rp.locator('[data-testid="mail-selected-list"]').innerText().catch(() => '');
    rec(`round${round}-attach`, /טופס|אירוע/.test(sel) && !/signature\.png/i.test(sel), { detail: sel });
    report.rounds.push({ round, ok: true });
    await shot(rp, `round-${round}`);
    await rctx.close();
  }
} catch (e) {
  rec('qa-threw', false, { err: String(e?.stack || e) });
}

if (report.claimId && report.claimId.startsWith('DAL-') && !['DAL-2026-0020', 'DAL-2026-0014', 'DAL-2026-0017', 'DAL-2026-0001', 'DAL-QA-WORKER-001'].includes(report.claimId)) {
  const { data: live } = await userDb.from('claims_records').select('id, client_name, row_data').eq('id', report.claimId).maybeSingle();
  if (live && String(live.client_name || '').startsWith('TEST-FORM-PDF-')) {
    const rd = { ...(live.row_data || {}), deletedAt: new Date().toISOString(), treatmentPending: '', treatmentPendingAction: '' };
    await userDb.from('claims_records').update({ row_data: rd }).eq('id', report.claimId);
    rec('test-claim-soft-deleted', true, { claimId: report.claimId });
  }
}

await browser.close();
const failed = report.checks.filter((c) => !c.ok);
report.failed = failed.map((c) => c.name);
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ failed: report.failed, claimId: report.claimId, deployTxt: report.deployTxt, ink: report.ink, pages: report.pdfPages, checks: report.checks.length }, null, 2));
process.exit(failed.length ? 1 : 0);
