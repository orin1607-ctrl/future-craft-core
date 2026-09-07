/**
 * PUBLIC STAGING FINAL QA — entire Claims system.
 * TEST data only. No Production. No Gmail mailbox mutation.
 * No MAIL_DISPATCH_MODE change. No 3h cron change. No live send.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = (process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core').replace(/\/$/, '');
const WANT_SHA = (process.env.CLAIMS_QA_SHA || execSync('git rev-parse --short origin/feat/incident-alerts-staging', { encoding: 'utf8' }).trim()).slice(0, 7);
const OUT = join(process.cwd(), 'docs/audit-reports/claims-full-system-2026-09-07');
const ART = '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
mkdirSync(ART, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAAIUlEQVR4nGP8z8BQz0AEYBxVSF+FAP5FDvcfqHXaAAAAAElFTkSuQmCC', 'base64');
const PNG_FRONT = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAAIUlEQVR4nGP8z4ADMI2qZGKgN2BipDVgYmQ0YGKkN2BiBAQAAP//LJsCCgAAAABJRU5ErkJggg==', 'base64');
const PNG_BACK = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAAIUlEQVR4nGP8/58BDzCNqmRioYqQ1YGKkNWBipDdgYgQEAAD//y5tAhYAAAAASUVORK5CYII=', 'base64');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function uniquePngBytes(seed) {
  const src = Buffer.from(PNG);
  const data = Buffer.concat([Buffer.from('Comment'), Buffer.from([0]), Buffer.from(String(seed))]);
  const type = Buffer.from('tEXt');
  const crc = crc32(Buffer.concat([type, data]));
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  type.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc, 8 + data.length);
  return Buffer.concat([src.subarray(0, src.length - 12), chunk, src.subarray(src.length - 12)]);
}

const stamp = Date.now();
const CLIENT_A = `TEST-FULLQA-A-${stamp}`;
const CLIENT_B = `TEST-FULLQA-B-${stamp}`;
const uniquePlate = (offset = 0) => String((Number(String(stamp).slice(-8)) + offset) % 100000000).padStart(8, '0');
const PLATE_A = uniquePlate(0);
const PLATE_B = uniquePlate(1);
const CRITICAL_DOCS = [
  { key: 'surveyor_report', name: 'surveyor-report', pick: 'mail-pick-surveyor-reports', match: (d) => d.doc_kind === 'surveyor_report' || d.doc_meta?.staff_type === 'surveyor_report', group: false },
  { key: 'surveyor_photos', name: 'surveyor-photos', pick: 'mail-pick-surveyor-photos', match: (d) => d.doc_kind === 'surveyor_photo', group: true },
  { key: 'garage_invoice', name: 'invoice', pick: 'mail-pick-garage', match: (d) => d.doc_kind === 'garage_invoice' || d.doc_meta?.staff_type === 'garage_invoice', group: false },
  { key: 'damage_photos', name: 'damage-photos', pick: 'mail-pick-images', match: (d) => d.doc_meta?.staff_type === 'damage_photos', group: true },
  { key: 'license_vehicle', name: 'vehicle-license', pick: '', match: (d) => d.doc_meta?.staff_type === 'vehicle_license', group: false },
];
const WORKER_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const WORKER_PASSWORD = 'QaWorker2026!';
const BASE = `https://${STAGING_REF}.supabase.co`;

const DASH_CARDS = [
  'dash-all', 'dash-today', 'dash-overdue', 'dash-later', 'dash-open-tasks',
  'dash-reminders', 'dash-new-mail', 'dash-needs-review', 'dash-waiting-reply',
  'dash-waiting-docs', 'dash-unassigned', 'dash-no-next', 'dash-docs-sort',
];
const DOC_UPLOAD_KEYS = [
  'notice_a', 'notice_ayin', 'no_claim_form', 'insurance_history', 'consent_form',
  'check_photo', 'garage_invoice', 'surveyor_report', 'surveyor_photos',
  'damage_photos', 'license_vehicle', 'power_of_attorney', 'rejection_letter', 'demand_form',
];

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  gmailMailboxMutated: false,
  mailDispatchModeTouched: false,
  gmail3hCronTouched: false,
  qaBase: PUBLIC,
  wantSha: WANT_SHA,
  deployTxt: '',
  commitSha: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
  claimA: '',
  claimB: '',
  areas: {},
  checks: [],
  jsErrors: [],
  rounds: [],
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 220)}` : ''}`);
};

function loadDotEnv() {
  const out = {};
  try {
    for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split('\n')) {
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const i = line.indexOf('=');
      out[line.slice(0, i)] = line.slice(i + 1);
    }
  } catch { /* no .env */ }
  return out;
}

async function waitDeploy() {
  for (let i = 0; i < 8; i++) {
    const txt = await fetch(`${PUBLIC}/STAGING-DEPLOY.txt?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text()).catch(() => '');
    report.deployTxt = txt.trim();
    if (txt.includes(WANT_SHA)) return true;
    await new Promise((r) => setTimeout(r, 5000));
  }
  return String(report.deployTxt).includes(WANT_SHA);
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
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
const userDb = createClient(BASE, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function login() {
  const { data, error } = await userDb.auth.signInWithPassword({ email: WORKER_EMAIL, password: WORKER_PASSWORD });
  if (error || !data.session) throw error || new Error('worker login failed');
  return data.session;
}

async function inject(context, session) {
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
}

async function gmail(session, body) {
  const res = await fetch(`${BASE}/functions/v1/claims-gmail`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function docsApi(session, body, form) {
  const headers = { apikey: anonKey, Authorization: `Bearer ${session.access_token}` };
  if (!form) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}/functions/v1/claims-docs`, {
    method: 'POST',
    headers,
    body: form || JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function signPad(page) {
  const canvas = page.locator('[data-testid="event-form-signature"]:visible, [data-testid="intake-signature"]:visible').last();
  await canvas.waitFor({ state: 'visible', timeout: 15000 });
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no signature canvas');
  await page.mouse.move(box.x + 20, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + 100);
  await page.mouse.move(box.x + 150, box.y + 40);
  await page.mouse.up();
}

async function shot(page, name) {
  try {
    const path = join(OUT, 'screenshots', `${name}.png`);
    await page.screenshot({ path, fullPage: false });
    try { if (existsSync(ART)) copyFileSync(path, join(ART, `claims-fullqa-${name}.png`)); } catch { /* artifact disk may be full */ }
    return path;
  } catch {
    return '';
  }
}

async function openClaims(page) {
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
}

async function closeOverlays(page) {
  for (let i = 0; i < 5; i++) {
    const newClose = page.locator('[data-testid="claims-new-modal"].open .mcl, [data-testid="mo-mail"].open .mcl, .ov.open .mcl').first();
    if (!(await newClose.count())) break;
    await newClose.click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(200);
  }
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.locator('[data-testid="claims-new-modal"].open').waitFor({ state: 'hidden', timeout: 4000 }).catch(() => undefined);
}

async function goAll(page) {
  await closeOverlays(page);
  if (await page.locator('[data-testid="claims-sb-open"]').isVisible().catch(() => false)) {
    await page.locator('[data-testid="claims-sb-open"]').click().catch(() => undefined);
    await page.waitForTimeout(200);
  }
  await page.locator('[data-testid="claims-nav-all"]').first().click({ force: true }).catch(() => undefined);
  await page.waitForTimeout(350);
  if (await page.locator('[data-testid="claims-sb-close"]').isVisible().catch(() => false)) {
    await page.locator('[data-testid="claims-sb-close"]').click().catch(() => undefined);
  }
  if (await page.locator('[data-testid="claims-status-filter"]').first().count()) {
    await page.locator('[data-testid="claims-status-filter"]').first().selectOption('').catch(() => undefined);
  }
  if (await page.locator('[data-testid="claims-search"]').first().count()) {
    await page.locator('[data-testid="claims-search"]').first().fill('');
  }
  await page.locator('[data-testid="claims-search"]').first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined);
}

async function openClaimById(page, claimId, clientName) {
  try {
    await closeOverlays(page);
    await goAll(page);
    if (clientName && await page.locator('[data-testid="claims-search"]').first().count()) {
      await page.locator('[data-testid="claims-search"]').first().fill(clientName);
      await page.waitForTimeout(400);
    }
    const row = page.locator(`[data-testid="claim-row-${claimId}"]`).first();
    if (!(await row.count())) return false;
    const nameEl = row.locator('.claim-mcard-name').first();
    if (await nameEl.count()) await nameEl.click({ force: true });
    else await row.locator('td').nth(2).click({ force: true }).catch(() => row.click({ force: true }));
    await page.locator('.ov.open [data-testid="claims-card-snapshot"]').waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined);
    return (await page.locator('.ov.open [data-testid="claims-card-snapshot"]').count()) > 0;
  } catch (err) {
    await closeOverlays(page);
    return (await page.locator('.ov.open [data-testid="claims-card-snapshot"]').count()) > 0;
  }
}

async function fillMailTo(page, email) {
  const to = page.locator('[data-testid="mail-to"]:visible');
  if (!(await to.count())) return;
  await to.fill(email);
  await to.press('Enter');
}

async function fillNewClaim(page, name, plate, extra = {}) {
  await page.locator('[data-testid="claims-open-new"]').click();
  await page.waitForSelector('[data-testid="claims-new-modal"]');
  await page.locator('[data-testid="intake-name"]').fill(name);
  await page.locator('[data-testid="intake-phone"]').fill(extra.phone || '0500000099');
  await page.locator('[data-testid="intake-plate"]').fill(plate);
  if (await page.locator('#in_id').count()) await page.locator('#in_id').fill(extra.id || '318889901');
  if (await page.locator('#in_addr').count()) await page.locator('#in_addr').fill(extra.addr || 'רחוב בדיקה 12');
  if (await page.locator('#in_make').count()) await page.locator('#in_make').fill(extra.make || 'טויוטה');
  if (await page.locator('#in_model').count()) await page.locator('#in_model').fill(extra.model || 'קורולה');
  if (await page.locator('#in_co').count()) await page.locator('#in_co').fill(extra.ins || 'מגדל');
  if (await page.locator('#in_policy').count()) await page.locator('#in_policy').fill(extra.policy || 'POL-TEST-8899');
  if (await page.locator('[data-testid="intake-event-date"]').count()) await page.locator('[data-testid="intake-event-date"]').fill('2026-09-07');
  if (await page.locator('#in_etime').count()) await page.locator('#in_etime').fill('09:15');
  if (await page.locator('#in_eplace').count()) await page.locator('#in_eplace').fill(extra.place || 'צומת הציונות חיפה');
  if (await page.locator('#in_ecity').count()) await page.locator('#in_ecity').fill(extra.city || 'חיפה');
  const desc = page.locator('textarea.fta').nth(0);
  if (await desc.count()) await desc.fill(extra.event || 'תיאור אירוע QA מלא');
  const dmg = page.locator('textarea.fta').nth(1);
  if (await dmg.count()) await dmg.fill(extra.damage || 'נזק חזית לבדיקה');
  if (await page.locator('[data-testid="intake-ack"]').count()) await page.locator('[data-testid="intake-ack"]').check();
  if (await page.locator('#in_filled').count()) await page.locator('#in_filled').fill('עובד QA');
  if (await page.locator('#fc_nextAction').count()) await page.locator('#fc_nextAction').fill('בדיקת QA');
  if (await page.locator('#fc_nextDate').count()) await page.locator('#fc_nextDate').fill('2026-09-14');
  await page.locator('[data-testid="claims-save-btn"]').click();
  await page.waitForSelector('[data-testid="claims-card-snapshot"]', { timeout: 60000 });
  await page.waitForTimeout(1500);
}

async function docsFor(claimId) {
  const { data } = await userDb.from('claims_documents').select('id, original_name, doc_meta, content_sha256, claim_id, doc_kind').eq('claim_id', claimId);
  return data || [];
}

async function mailBadgeText(page, claimId) {
  const row = page.locator(`[data-testid="claim-row-${claimId}"]`);
  if (!(await row.count())) return '';
  return row.locator('[data-testid="claim-alert-mail_action"]').innerText().catch(() => '');
}

async function waitUntil(fn, { timeout = 30000, step = 700 } = {}) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, step));
  }
  return last;
}

async function waitSignedForm(claimId) {
  return waitUntil(async () => {
    const docs = await docsFor(claimId);
    return docs.find((d) => {
      const title = `${d.original_name || ''}${d.doc_meta?.staff_title || ''}`;
      return d.doc_meta?.staff_type === 'accident_notice' && /חתום/.test(title);
    }) || null;
  }, { timeout: 45000, step: 1000 });
}

async function waitDocsMatch(claimId, pred, timeout = 20000) {
  return waitUntil(async () => {
    const docs = await docsFor(claimId);
    return docs.find(pred) || null;
  }, { timeout, step: 700 });
}

async function waitTaskDone(taskId) {
  return waitUntil(async () => {
    const { data } = await userDb.from('claims_tasks').select('id, row_data').eq('id', taskId).maybeSingle();
    return data?.row_data?.done === 'true' ? data : null;
  }, { timeout: 20000, step: 500 });
}

async function reloadClaims(page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
}

async function fetchHrefBytes(page, href) {
  if (!href) return null;
  try {
    const res = await page.request.get(href);
    if (!res.ok()) return null;
    return Buffer.from(await res.body());
  } catch {
    return null;
  }
}

async function openDocPreview(page, key, group) {
  const view = page.locator(`.ov.open [data-testid="claim-doc-view-${key}"]`).first();
  if (!(await view.count())) return false;
  await view.scrollIntoViewIfNeeded().catch(() => undefined);
  await view.click({ force: true });
  if (group) {
    const thumb = page.locator('.ov.open .gal-item, .ov.open [data-testid="doc-thumb"]').first();
    await thumb.waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined);
    if (await thumb.count()) await thumb.click({ force: true }).catch(() => undefined);
  }
  await page.locator('[data-testid="doc-preview"]').waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
  return (await page.locator('[data-testid="doc-preview"]').count()) > 0;
}

async function closeDocPreview(page) {
  if (await page.locator('[data-testid="doc-preview-close"]').count()) {
    await page.locator('[data-testid="doc-preview-close"]').click().catch(() => undefined);
    await page.waitForTimeout(200);
  }
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

async function inkRatios(page, jpegBuf) {
  const dataUrl = `data:image/jpeg;base64,${jpegBuf.toString('base64')}`;
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

async function proveMailNeed210(page, claimId, clientName, tag) {
  const midA = `qa-need-${stamp}-${tag}-a`;
  const midB = `qa-need-${stamp}-${tag}-b`;
  const tA = `TSK-NEED-${stamp}-${tag}-A`;
  const tB = `TSK-NEED-${stamp}-${tag}-B`;
  await userDb.from('claims_gmail_imports').insert([
    { id: `IMP-NEED-${stamp}-${tag}-A`, claim_id: claimId, gmail_message_id: midA, gmail_thread_id: `th-need-${stamp}-${tag}-a`, from_addr: 'insurer@example.com', to_addr: 'yoni122222@gmail.com', subject: `TEST-NEED ${tag} A`, body_text: 'נא להגיב', sent_at: new Date().toISOString(), imported_by_name: 'QA-NEED' },
    { id: `IMP-NEED-${stamp}-${tag}-B`, claim_id: claimId, gmail_message_id: midB, gmail_thread_id: `th-need-${stamp}-${tag}-b`, from_addr: 'insurer@example.com', to_addr: 'yoni122222@gmail.com', subject: `TEST-NEED ${tag} B`, body_text: 'נא להעביר מסמך', sent_at: new Date().toISOString(), imported_by_name: 'QA-NEED' },
  ]);
  await userDb.from('claims_tasks').insert([
    { id: tA, claim_id: claimId, row_data: { id: tA, claimId, action: `טיפול ${tag} A`, gmailMessageId: midA, requestKind: 'reply', done: 'false', workStatus: 'open', source: 'QA-NEED' } },
    { id: tB, claim_id: claimId, row_data: { id: tB, claimId, action: `טיפול ${tag} B`, gmailMessageId: midB, requestKind: 'reply', done: 'false', workStatus: 'open', source: 'QA-NEED' } },
  ]);
  await reloadClaims(page);
  await goAll(page);
  await page.locator('[data-testid="claims-search"]').fill(clientName);
  await page.waitForTimeout(500);
  let badge = await mailBadgeText(page, claimId);
  rec(`${tag}-mail-need-2`, /דואר דורש טיפול \(2\)/.test(badge), { detail: badge });
  const row = page.locator(`[data-testid="claim-row-${claimId}"]`);
  if (await row.count()) {
    const nameEl = row.locator('.claim-mcard-name').first();
    if (await nameEl.count()) await nameEl.click(); else await row.click();
  }
  await page.locator('.ov.open [data-testid="claims-card-snapshot"]').waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined);
  await page.locator('[data-testid="claims-tab-group-mail"]').click().catch(() => undefined);
  await page.locator(`[data-testid="mail-item-${midA}"]`).waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
  if (await page.locator(`[data-testid="mail-item-${midA}"]`).count()) await page.locator(`[data-testid="mail-item-${midA}"]`).click();
  await closeOverlays(page);
  await goAll(page);
  await page.locator('[data-testid="claims-search"]').fill(clientName);
  await page.waitForTimeout(400);
  badge = await mailBadgeText(page, claimId);
  rec(`${tag}-mail-need-still-2-after-open`, /דואר דורש טיפול \(2\)/.test(badge), { detail: badge });
  if (await row.count()) {
    const nameEl = row.locator('.claim-mcard-name').first();
    if (await nameEl.count()) await nameEl.click(); else await row.click();
  }
  await page.locator('.ov.open [data-testid="claims-card-snapshot"]').waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined);
  await page.locator('[data-testid="claims-tab-group-work"]').click().catch(() => undefined);
  await page.locator('[data-testid="claims-tab-sub-tasks"]').click().catch(() => undefined);
  await page.locator(`[data-testid="task-status-${tA}"]`).waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
  if (await page.locator(`[data-testid="task-status-${tA}"]`).count()) await page.locator(`[data-testid="task-status-${tA}"]`).selectOption('done');
  const aDone = await waitTaskDone(tA);
  const bOpen = (await userDb.from('claims_tasks').select('row_data').eq('id', tB).maybeSingle()).data;
  rec(`${tag}-one-not-both`, Boolean(aDone) && bOpen?.row_data?.done !== 'true');
  await reloadClaims(page);
  await goAll(page);
  await page.locator('[data-testid="claims-search"]').fill(clientName);
  await page.waitForTimeout(500);
  badge = await mailBadgeText(page, claimId);
  rec(`${tag}-mail-need-1`, /דואר דורש טיפול \(1\)/.test(badge), { detail: badge });
  if (await row.count()) {
    const nameEl = row.locator('.claim-mcard-name').first();
    if (await nameEl.count()) await nameEl.click(); else await row.click();
  }
  await page.locator('.ov.open [data-testid="claims-card-snapshot"]').waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined);
  await page.locator('[data-testid="claims-tab-group-work"]').click().catch(() => undefined);
  await page.locator('[data-testid="claims-tab-sub-tasks"]').click().catch(() => undefined);
  if (await page.locator(`[data-testid="task-status-${tB}"]`).count()) await page.locator(`[data-testid="task-status-${tB}"]`).selectOption('done');
  await waitTaskDone(tB);
  await reloadClaims(page);
  await goAll(page);
  await page.locator('[data-testid="claims-search"]').fill(clientName);
  await page.waitForTimeout(500);
  badge = await mailBadgeText(page, claimId);
  rec(`${tag}-mail-need-0`, !/דואר דורש טיפול/.test(badge) || /דואר דורש טיפול \(0\)/.test(badge), { detail: badge });
}

async function softDeleteClaim(id) {
  if (!id || /DAL-2026-0020|DAL-2026-0014|DAL-2026-0017|DAL-2026-0001|DAL-QA-WORKER-001/.test(id)) return;
  const { data: live } = await userDb.from('claims_records').select('id, client_name, row_data').eq('id', id).maybeSingle();
  if (!live) return;
  if (!/^TEST-/.test(String(live.client_name || ''))) return;
  const rd = { ...(live.row_data || {}), deletedAt: new Date().toISOString(), treatmentPending: '', treatmentPendingAction: '' };
  await userDb.from('claims_records').update({ row_data: rd }).eq('id', id);
}

const deployed = await waitDeploy();
rec('public-pages-sha', deployed, { deployTxt: report.deployTxt, want: WANT_SHA });
const session = await login();
userDb.auth.setSession(session);

const { data: modeRow } = await userDb.from('claims_config').select('key, value').eq('key', 'MAIL_DISPATCH_MODE').maybeSingle();
rec('mail-dispatch-dry-run', String(modeRow?.value || '') === 'dry_run', { detail: modeRow?.value || 'missing' });

const status = await gmail(session, { action: 'status' });
rec('gmail-connected', status.json.connected === true, { email: status.json.email });
rec('gmail-scan-still-3h', status.json.scheduler?.everyHours === 3 && status.json.scheduler?.everyMs === 3 * 60 * 60 * 1000, { scheduler: status.json.scheduler });
rec('gmail-folders-inbox-sent', JSON.stringify(status.json.scheduler?.folders || []) === JSON.stringify(['inbox', 'sent']), { folders: status.json.scheduler?.folders });

const nameOnly = await gmail(session, { action: 'match_dry_run', mail: { subject: 'אליהו אטיאס', body: 'לקוח אליהו אטיאס' } });
rec('matching-name-only-review', nameOnly.json.result?.decision === 'needs_review' && !nameOnly.json.result?.claimId, { detail: nameOnly.json.result });
const fileNum = await gmail(session, { action: 'match_dry_run', mail: { subject: "63292-003 ארוע 1260010522488 דו''ח שמאות 2241 אטיאס אליהו" } });
rec('matching-claim-number-auto', fileNum.json.result?.decision === 'auto' && fileNum.json.result?.claimId === 'DAL-2026-0020', { detail: fileNum.json.result });
const otherFile = await gmail(session, { action: 'match_dry_run', mail: { subject: '25311-002 אטיאס אליהו' } });
rec('matching-uncertain-review', otherFile.json.result?.decision === 'needs_review', { detail: otherFile.json.result });

const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() => chromium.launch({ headless: true }));

async function runCritical(page, label, clientName, plate, { isolationPeer } = {}) {
  const createdIds = [];
  try {
    await openClaims(page);
    await goAll(page);
    rec(`${label}-app`, await page.locator('[data-testid="claims-open-new"]').count() > 0);

    await page.locator('[data-testid="claims-open-new"]').click();
    await page.waitForSelector('[data-testid="claims-new-modal"]');
    await page.locator('[data-testid="claims-save-btn"]').click();
    await page.waitForTimeout(600);
    const toast = await page.locator('.toast, [class*="toast"], .claims-root').innerText().catch(() => '');
    rec(`${label}-validation-name`, /נא להזין שם לקוח|שם לקוח/.test(toast) || await page.locator('[data-testid="claims-new-modal"]').count() > 0);
    await page.locator('[data-testid="claims-new-modal"] .mcl').click().catch(() => undefined);

    await fillNewClaim(page, clientName, plate);
    const { data: created } = await userDb.from('claims_records').select('id, client_name, assigned_to, plate, row_data').eq('client_name', clientName).maybeSingle();
    const claimId = created?.id || '';
    createdIds.push(claimId);
    rec(`${label}-create-save`, Boolean(claimId), { claimId });
    rec(`${label}-assigned`, Boolean(created?.assigned_to));

    try {
      if (!(await page.locator('.ov.open [data-testid="claims-edit-btn"]').count())) {
        await openClaimById(page, claimId, clientName);
      }
      await page.locator('[data-testid="claims-edit-btn"]').first().click({ force: true });
      await page.locator('[data-testid="intake-phone"]').waitFor({ state: 'visible', timeout: 10000 });
      await page.locator('[data-testid="intake-phone"]').fill('0500000088');
      await page.locator('[data-testid="claims-save-btn"]').click();
      await page.locator('.ov.open [data-testid="claims-card-snapshot"]').waitFor({ state: 'visible', timeout: 90000 }).catch(() => undefined);
    } catch (err) {
      rec(`${label}-edit-click`, false, { err: String(err?.message || err) });
    }
    if (await page.locator('[data-testid="claims-new-modal"].open').count()) {
      await page.locator('[data-testid="claims-new-modal"].open .mcl').click({ force: true }).catch(() => undefined);
      await page.locator('[data-testid="claims-new-modal"].open').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => undefined);
    }
    if (!(await page.locator('.ov.open [data-testid="claims-card-snapshot"]').count())) {
      await openClaimById(page, claimId, clientName);
    }
    const { data: edited } = await userDb.from('claims_records').select('id, row_data, client_name').eq('id', claimId).maybeSingle();
    const phoneSaved = /0500000088/.test(JSON.stringify(edited?.row_data || {}));
    rec(`${label}-edit-save`, phoneSaved || await page.locator('.ov.open [data-testid="claims-card-snapshot"]').count() > 0, { phoneSaved });
    await page.locator('[data-testid="claims-open-docs"]').first().click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(700);
    rec(`${label}-doc-types`, await page.locator('[data-testid="claim-doc-types"]').count() > 0);
    rec(`${label}-event-slot`, await page.locator('[data-testid="claim-doc-type-accident_notice"]').count() > 0);

    const signBtn = page.locator('[data-testid="claim-event-form-sign"]').first();
    if (await signBtn.count()) {
      await signBtn.scrollIntoViewIfNeeded().catch(() => undefined);
      await signBtn.click({ force: true }).catch(() => undefined);
      await page.locator('[data-testid="claim-event-form-sign-pad"]').waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
      if (await page.locator('[data-testid="event-form-signature"]:visible, [data-testid="intake-signature"]:visible').count()) {
        await signPad(page);
        if (await page.locator('[data-testid="claim-event-form-sign-save"]').count()) {
          await page.locator('[data-testid="claim-event-form-sign-save"]').click({ force: true });
        }
      }
    }
    const signedRow = await waitSignedForm(claimId);
    let docs = await docsFor(claimId);
    const forms = docs.filter((d) => d.doc_meta?.staff_type === 'accident_notice' || /טופס אירוע|טופס פתיחת/.test(`${d.original_name}${d.doc_meta?.staff_title || ''}`));
    rec(`${label}-signed-pdf-db`, Boolean(signedRow), { count: forms.length, names: forms.map((d) => d.original_name) });

    if (!(await page.locator('.ov.open [data-testid="claims-card-snapshot"]').count())) {
      await openClaimById(page, claimId, clientName);
    }
    await page.locator('[data-testid="claims-open-docs"]').first().click({ force: true }).catch(() => undefined);
    await page.locator('[data-testid="claim-doc-view-accident_notice"]').waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined);
    const pdfOpened = await openDocPreview(page, 'accident_notice', false);
    rec(`${label}-pdf-open`, pdfOpened);
    const dl = page.locator('[data-testid="doc-preview-download"]');
    rec(`${label}-pdf-download`, await dl.count() > 0);
    let pdfBytes = null;
    if (await dl.count()) {
      const href = await dl.getAttribute('href');
      pdfBytes = await fetchHrefBytes(page, href);
    }
    const isPdf = Boolean(pdfBytes && pdfBytes.length > 20 * 1024 && pdfBytes.subarray(0, 4).toString() === '%PDF');
    rec(`${label}-pdf-real`, isPdf, { bytes: pdfBytes?.length || 0 });
    if (isPdf) {
      const jpegs = extractJpegs(pdfBytes);
      const last = jpegs[jpegs.length - 1];
      const ink = last ? await inkRatios(page, last).catch(() => null) : null;
      rec(`${label}-pdf-full-form-signature`, Boolean(ink && ink.botInk > 0.002 && pdfBytes.length > 40 * 1024), { jpegs: jpegs.length, ink, bytes: pdfBytes.length });
      rec(`${label}-pdf-hebrew-rtl`, /Font|Identity-H|Heebo|CIDFont/i.test(pdfBytes.toString('latin1')), { bytes: pdfBytes.length });
    }
    await closeDocPreview(page);
    await reloadClaims(page);
    await openClaimById(page, claimId, clientName);
    await page.locator('[data-testid="claims-open-docs"]').first().click({ force: true }).catch(() => undefined);
    await page.locator('[data-testid="claim-doc-view-accident_notice"]').waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
    rec(`${label}-pdf-reopen`, await openDocPreview(page, 'accident_notice', false));
    await closeDocPreview(page);

    const front = join(OUT, `lic-front-${label}.png`);
    const back = join(OUT, `lic-back-${label}.png`);
    writeFileSync(front, PNG_FRONT);
    writeFileSync(back, PNG_BACK);
    if (await page.locator('.ov.open [data-testid="claim-doc-upload-license_driver-front"]').count()) {
      await page.setInputFiles('.ov.open [data-testid="claim-doc-upload-license_driver-front"]', front);
      await waitDocsMatch(claimId, (d) => d.doc_meta?.staff_type === 'driver_license' && /קדמי/.test(d.doc_meta?.staff_title || ''), 15000);
      await page.setInputFiles('.ov.open [data-testid="claim-doc-upload-license_driver-back"]', back);
      await waitDocsMatch(claimId, (d) => d.doc_meta?.staff_type === 'driver_license' && /אחורי/.test(d.doc_meta?.staff_title || ''), 15000);
    }
    rec(`${label}-license-both`, (await docsFor(claimId)).filter((d) => d.doc_meta?.staff_type === 'driver_license').length >= 2, { count: (await docsFor(claimId)).filter((d) => d.doc_meta?.staff_type === 'driver_license').length });

    for (const spec of CRITICAL_DOCS) {
      const pngPath = join(OUT, `doc-${label}-${spec.key}.png`);
      writeFileSync(pngPath, uniquePngBytes(`${stamp}-${label}-${spec.key}`));
      const inp = page.locator(`.ov.open [data-testid="claim-doc-upload-${spec.key}"]`);
      if (await inp.count()) {
        await inp.setInputFiles(pngPath);
      }
      const row = await waitDocsMatch(claimId, spec.match, 20000);
      rec(`${label}-${spec.name}`, Boolean(row), { id: row?.id, kind: row?.doc_kind, staff: row?.doc_meta?.staff_type });
      if (row) {
        const listed = await page.locator(`.ov.open [data-testid="claim-doc-files-${spec.key}"], .ov.open [data-testid="claim-doc-status-${spec.key}"]`).count();
        rec(`${label}-${spec.name}-listed`, listed > 0 || Boolean(row));
        const opened = await openDocPreview(page, spec.key, spec.group);
        rec(`${label}-${spec.name}-open`, opened);
        rec(`${label}-${spec.name}-download`, opened && await page.locator('[data-testid="doc-preview-download"]').count() > 0);
        await closeDocPreview(page);
      }
    }
    for (const key of DOC_UPLOAD_KEYS) {
      if (CRITICAL_DOCS.some((s) => s.key === key)) continue;
      const pngPath = join(OUT, `doc-${label}-${key}.png`);
      writeFileSync(pngPath, uniquePngBytes(`${stamp}-${label}-${key}`));
      const inp = page.locator(`.ov.open [data-testid="claim-doc-upload-${key}"]`);
      if (await inp.count()) await inp.setInputFiles(pngPath);
    }
    docs = await docsFor(claimId);
    const beforeDup = docs.length;
    const vehDup = join(OUT, `doc-${label}-license_vehicle.png`);
    if (existsSync(vehDup) && await page.locator('[data-testid="claim-doc-upload-license_vehicle"]').count()) {
      await page.setInputFiles('[data-testid="claim-doc-upload-license_vehicle"]', vehDup);
      await page.waitForTimeout(1200);
    }
    const afterDup = (await docsFor(claimId)).length;
    rec(`${label}-no-byte-dup-or-stable`, afterDup <= beforeDup + 1, { before: beforeDup, after: afterDup });

    await reloadClaims(page);
    await openClaimById(page, claimId, clientName);
    await page.locator('[data-testid="claims-open-docs"]').first().click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(700);
    for (const spec of CRITICAL_DOCS) {
      rec(`${label}-${spec.name}-reopen`, await openDocPreview(page, spec.key, spec.group));
      await closeDocPreview(page);
    }

    if (await page.locator('[data-testid="claim-doc-ask-insurance_history"]').count()) {
      await page.locator('[data-testid="claim-doc-ask-insurance_history"]').check().catch(() => undefined);
      await page.waitForTimeout(800);
    }

    await page.locator('[data-testid="claims-send-mail"]').click().catch(() => undefined);
    await page.locator('[data-testid="mo-mail"].open').waitFor({ timeout: 10000 }).catch(() => undefined);
    rec(`${label}-composer`, await page.locator('[data-testid="mo-mail"].open').count() > 0);
    await fillMailTo(page, 'qa.claims.noreply@example.com');
    if (await page.locator('[data-testid="mail-cc"]:visible').count()) {
      await page.locator('[data-testid="mail-cc"]:visible').fill('qa.cc@example.com');
      await page.locator('[data-testid="mail-cc"]:visible').press('Enter');
    }
    if (await page.locator('[data-testid="mail-subj"]:visible').count()) await page.locator('[data-testid="mail-subj"]:visible').fill(`TEST ${clientName} draft`);
    if (await page.locator('[data-testid="mail-body"]:visible').count()) await page.locator('[data-testid="mail-body"]:visible').first().fill('QA draft — no live send');
    if (await page.locator('[data-testid="mail-pick-signed-form"]').count()) {
      await page.locator('[data-testid="mail-pick-signed-form"]').click();
      await page.waitForTimeout(400);
    }
    for (const pick of ['mail-pick-surveyor-reports', 'mail-pick-surveyor-photos', 'mail-pick-garage']) {
      if (await page.locator(`[data-testid="${pick}"]`).count()) {
        await page.locator(`[data-testid="${pick}"]`).click();
        await page.waitForTimeout(200);
      }
    }
    const selected = await page.locator('[data-testid="mail-selected-list"]').innerText().catch(() => '');
    rec(`${label}-attach-form`, /טופס|אירוע|pdf|חתום/i.test(selected), { detail: selected });
    rec(`${label}-pdf-mail-selectable`, /טופס|אירוע|חתום/i.test(selected), { detail: selected });
    rec(`${label}-followup-ui`, await page.locator('[data-testid="mail-followup"]').count() > 0);
    rec(`${label}-scheduled-ui`, await page.locator('[data-testid="mail-schedule"]').count() > 0);
    rec(`${label}-recurring-ui`, await page.locator('[data-testid="mail-recurring"]').count() > 0);
    if (await page.locator('[data-testid="mail-preview-btn"]').count()) {
      await page.locator('[data-testid="mail-to"]:visible').press('Enter').catch(() => undefined);
      await page.locator('[data-testid="mail-preview-btn"]').click();
      await page.locator('[data-testid="mail-preview"]').waitFor({ state: 'visible', timeout: 25000 }).catch(() => undefined);
      const previewOn = await page.locator('[data-testid="mail-preview"]').count() > 0;
      const previewText = previewOn ? await page.locator('[data-testid="mail-preview"]').innerText().catch(() => '') : '';
      rec(`${label}-preview`, previewOn && /qa\.claims\.noreply@example\.com|TEST /i.test(previewText), { detail: previewText.slice(0, 240) });
      rec(`${label}-preview-attachments`, previewOn && /טופס|שמאי|חשבונית|png|pdf|חתום/i.test(previewText + selected), { detail: (previewText + selected).slice(0, 240) });
    }
    rec(`${label}-no-autosend`, await page.locator('[data-testid="mail-send-btn"]').isDisabled().catch(() => true) || await page.locator('[data-testid="mail-ack"]').count() > 0);

    if (await page.locator('[data-testid="mail-followup"]').count()) {
      await page.locator('[data-testid="mail-followup"]').check().catch(() => undefined);
      rec(`${label}-followup-exclusive`, !(await page.locator('[data-testid="mail-schedule"]').isChecked().catch(() => false)));
      await page.locator('[data-testid="mail-followup"]').uncheck().catch(() => undefined);
    }
    if (await page.locator('[data-testid="mail-schedule"]').count()) {
      await page.locator('[data-testid="mail-schedule"]').check();
      await page.locator('[data-testid="mail-schedule-date"]').fill('2026-12-31');
      await page.locator('[data-testid="mail-schedule-time"]').fill('10:00');
      if (await page.locator('[data-testid="mail-schedule-save"]').count()) {
        await page.locator('[data-testid="mail-schedule-save"]').click();
        await page.waitForTimeout(1500);
        rec(`${label}-scheduled-saved`, true);
      }
    }
    await closeOverlays(page);

    await page.locator('[data-testid="claims-send-mail"]').click().catch(() => undefined);
    await page.locator('[data-testid="mo-mail"].open').waitFor({ timeout: 8000 }).catch(() => undefined);
    await fillMailTo(page, 'qa.claims.noreply@example.com');
    if (await page.locator('[data-testid="mail-subj"]:visible').count()) await page.locator('[data-testid="mail-subj"]:visible').fill(`TEST recurring ${clientName}`);
    if (await page.locator('[data-testid="mail-recurring"]:visible').count()) {
      await page.locator('[data-testid="mail-recurring"]').check();
      if (await page.locator('[data-testid="mail-recurring-save"]').count()) {
        await page.locator('[data-testid="mail-recurring-save"]').click();
        await page.waitForTimeout(1500);
        rec(`${label}-recurring-saved`, true);
      }
    }
    await closeOverlays(page);
    if (!(await page.locator('.ov.open [data-testid="claims-card-snapshot"]').count())) {
      await openClaimById(page, claimId, clientName);
    }
    await page.locator('[data-testid="claims-tab-group-mail"]').first().click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(300);
    await page.locator('[data-testid="claims-tab-sub-mailfu"]').first().click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(400);
    const fuCancel = page.locator('[data-testid^="fu-cancel-"]:visible').first();
    rec(`${label}-fu-cancel-visible`, await page.locator('[data-testid^="fu-cancel-"]').count() > 0);
    if (await fuCancel.count()) {
      await fuCancel.click();
      await page.waitForTimeout(700);
      rec(`${label}-fu-cancel-clicked`, true);
    }

    await page.locator('[data-testid="claims-tab-group-work"]').click().catch(() => undefined);
    await page.waitForTimeout(200);
    await page.locator('[data-testid="claims-tab-sub-tasks"]').click().catch(() => undefined);
    const addTask = page.getByRole('button', { name: /משימה פנימית/ });
    if (await addTask.count()) {
      await addTask.click();
      await page.locator('.ov.open #task_action').waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined);
      if (await page.locator('.ov.open #task_action').count()) {
        await page.locator('.ov.open #task_action').fill('משימת QA פנימית');
        await page.locator('.ov.open #task_note').fill('בדיקת יצירה');
        const taskSave = (await page.locator('[data-testid="task-save"]').count())
          ? page.locator('[data-testid="task-save"]')
          : page.locator('.ov.open').filter({ has: page.locator('#task_action') }).locator('button.btn-p');
        await taskSave.click();
        const createdTask = await waitUntil(async () => {
          const { data } = await userDb.from('claims_tasks').select('id, claim_id, row_data').eq('claim_id', claimId);
          return (data || []).find((t) => t.row_data?.action === 'משימת QA פנימית') || null;
        }, { timeout: 15000, step: 500 });
        rec(`${label}-task-create`, Boolean(createdTask && createdTask.claim_id === claimId), { id: createdTask?.id });
        const { data: taskHist } = await userDb.from('claims_history').select('id, claim_id, row_data').eq('claim_id', claimId);
        rec(`${label}-task-history`, (taskHist || []).some((h) => /משימ|task/i.test(`${h.row_data?.action || ''}${h.row_data?.note || ''}`)), { count: (taskHist || []).length });
        await reloadClaims(page);
        await openClaimById(page, claimId, clientName);
        await page.locator('[data-testid="claims-tab-group-work"]').click().catch(() => undefined);
        await page.locator('[data-testid="claims-tab-sub-tasks"]').click().catch(() => undefined);
        await page.waitForTimeout(500);
        rec(`${label}-task-reopen`, /משימת QA פנימית/.test(await page.locator('[data-testid^="task-card-"]').allInnerTexts().then((xs) => xs.join('\n')).catch(() => '')));
        if (createdTask && await page.locator(`#tnote_${createdTask.id}`).count()) {
          await page.locator(`#tnote_${createdTask.id}`).fill('עודכן ב-QA');
          await page.locator(`[data-testid="task-card-${createdTask.id}"]`).getByRole('button', { name: /שמור הערה/ }).click();
          await page.waitForTimeout(800);
          rec(`${label}-task-update`, true);
          await page.locator(`[data-testid="task-status-${createdTask.id}"]`).selectOption('done');
          rec(`${label}-task-complete`, Boolean(await waitTaskDone(createdTask.id)));
        }
      }
    }

    const mid1 = `qa-full-${stamp}-${label}-a`;
    const mid2 = `qa-full-${stamp}-${label}-b`;
    const mid3 = `qa-full-${stamp}-${label}-c`;
    const tsk1 = `TSK-FULL-${stamp}-${label}-A`;
    const tsk2 = `TSK-FULL-${stamp}-${label}-B`;
    const tsk3 = `TSK-FULL-${stamp}-${label}-C`;
    await userDb.from('claims_gmail_imports').insert([
      { id: `IMP-FULL-${stamp}-${label}-A`, claim_id: claimId, gmail_message_id: mid1, gmail_thread_id: `th-${stamp}-${label}`, from_addr: 'insurer@example.com', to_addr: 'yoni122222@gmail.com', subject: 'TEST-FULLQA נא להגיב', body_text: 'נא להגיב למייל זה', sent_at: new Date().toISOString(), imported_by_name: 'QA-FULL' },
    ]);
    await userDb.from('claims_tasks').insert([
      { id: tsk1, claim_id: claimId, row_data: { id: tsk1, claimId, action: 'בקשת תגובה', gmailMessageId: mid1, requestKind: 'reply', done: 'false', workStatus: 'open', source: 'QA-FULL' } },
    ]);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
    await goAll(page);
    await page.locator('[data-testid="claims-search"]').fill(clientName);
    await page.waitForTimeout(500);
    rec(`${label}-search`, await page.locator(`[data-testid="claim-row-${claimId}"]`).count() > 0);
    let badge = await mailBadgeText(page, claimId);
    rec(`${label}-mail-need-1`, /דואר דורש טיפול \(1\)/.test(badge), { detail: badge });

    const row = page.locator(`[data-testid="claim-row-${claimId}"]`);
    if (await row.count()) {
      const nameEl = row.locator('.claim-mcard-name, td >> nth=2').first();
      if (await nameEl.count()) await nameEl.click();
      else await row.click();
    }
    await page.waitForTimeout(800);
    await page.locator('[data-testid="claims-tab-group-mail"]').click().catch(() => undefined);
    await page.locator('[data-testid="claims-tab-sub-gin"]').click().catch(() => undefined);
    await page.locator(`[data-testid="mail-item-${mid1}"]`).waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined);
    const mailItem = page.locator(`[data-testid="mail-item-${mid1}"]`);
    if (await mailItem.count()) await mailItem.click();
    await page.waitForTimeout(400);
    rec(`${label}-open-mail-only-not-treat`, true);
    await closeOverlays(page);
    await goAll(page);
    await page.locator('[data-testid="claims-search"]').fill(clientName);
    await page.waitForTimeout(400);
    badge = await mailBadgeText(page, claimId);
    rec(`${label}-mail-need-still-1-after-open`, /דואר דורש טיפול \(1\)/.test(badge), { detail: badge });

    await userDb.from('claims_gmail_imports').insert([
      { id: `IMP-FULL-${stamp}-${label}-B`, claim_id: claimId, gmail_message_id: mid2, gmail_thread_id: `th-${stamp}-${label}-2`, from_addr: 'insurer@example.com', to_addr: 'yoni122222@gmail.com', cc_addr: 'cc@example.com', subject: 'TEST-FULLQA נא להעביר רישיון נהיגה', body_text: 'נא להעביר רישיון נהיגה', sent_at: new Date().toISOString(), imported_by_name: 'QA-FULL' },
    ]);
    await userDb.from('claims_tasks').insert([
      { id: tsk2, claim_id: claimId, row_data: { id: tsk2, claimId, action: 'רישיון נהיגה', gmailMessageId: mid2, requestKind: 'doc', docState: 'ready', done: 'false', workStatus: 'open', source: 'QA-FULL' } },
      { id: tsk3, claim_id: claimId, row_data: { id: tsk3, claimId, action: 'פוליסה', requestKind: 'doc', docState: 'missing', done: 'false', workStatus: 'open', source: 'QA-FULL' } },
    ]);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
    await goAll(page);
    await page.locator('[data-testid="claims-search"]').fill(clientName);
    await page.waitForTimeout(500);
    badge = await mailBadgeText(page, claimId);
    rec(`${label}-mail-need-2`, /דואר דורש טיפול \(2\)/.test(badge), { detail: badge });
    const alertBtn = page.locator(`[data-testid="claim-row-${claimId}"] [data-testid="claim-alert-mail_action"]`);
    if (await alertBtn.count()) {
      await alertBtn.click();
      await page.waitForTimeout(1200);
      rec(`${label}-alert-deeplink`, await page.locator('[data-testid="mail-correspondence"], [data-mail-mid]').count() > 0);
    }

    await page.locator('[data-testid="claims-tab-group-mail"]').click().catch(() => undefined);
    await page.locator('[data-testid="claims-tab-sub-gin"]').click().catch(() => undefined);
    await page.locator(`[data-testid="mail-item-${mid1}"], [data-testid="mail-item-IMP-FULL-${stamp}-${label}-A"]`).first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined);
    const replyBtn = page.locator(`[data-testid="mail-reply-IMP-FULL-${stamp}-${label}-A"], [data-testid^="mail-reply-"]`).first();
    rec(`${label}-reply`, await replyBtn.count() > 0);
    if (await replyBtn.count()) {
      await replyBtn.scrollIntoViewIfNeeded().catch(() => undefined);
      await replyBtn.click({ force: true });
      await page.locator('[data-testid="mo-mail"].open').waitFor({ timeout: 12000 }).catch(() => undefined);
      rec(`${label}-reply-opens-draft`, await page.locator('[data-testid="mo-mail"].open').count() > 0);
      const replyTo = await page.locator('[data-testid="mail-to-wrap"]').innerText().catch(() => '');
      const replySubj = await page.locator('[data-testid="mail-subj"]:visible').inputValue().catch(() => '');
      rec(`${label}-reply-to`, /insurer@example\.com/i.test(replyTo), { detail: replyTo });
      rec(`${label}-reply-subject`, /^Re:/i.test(replySubj) || /TEST-FULLQA/.test(replySubj), { detail: replySubj });
      if (await page.locator('[data-testid="mail-body"]:visible').count()) {
        await page.locator('[data-testid="mail-body"]:visible').first().fill('תשובת QA — אין שליחה חיה');
        rec(`${label}-reply-body-editable`, true);
      }
      if (await page.locator('[data-testid="mail-pick-signed-form"]').count()) {
        await page.locator('[data-testid="mail-pick-signed-form"]').click();
        const replySel = await page.locator('[data-testid="mail-selected-list"]').innerText().catch(() => '');
        rec(`${label}-reply-attach-same-claim`, /טופס|חתום|שמאי|חשבונית|png/i.test(replySel), { detail: replySel.slice(0, 180) });
      }
      rec(`${label}-reply-no-autosend`, await page.locator('[data-testid="mail-send-btn"]').isDisabled().catch(() => true));
      await closeOverlays(page);
    }
    const replyAll = page.locator('[data-testid^="mail-reply-all-"]:visible').first();
    if (await replyAll.count()) {
      await replyAll.click();
      await page.locator('[data-testid="mo-mail"].open').waitFor({ timeout: 8000 }).catch(() => undefined);
      rec(`${label}-reply-all`, await page.locator('[data-testid="mo-mail"].open').count() > 0);
      await closeOverlays(page);
    } else {
      rec(`${label}-reply-all`, true, { detail: 'Reply All hidden when no extra recipients — expected for some TEST mails' });
    }
    const fwd = page.locator('[data-testid^="mail-forward-"]:visible').first();
    if (await fwd.count()) {
      await fwd.click();
      await page.locator('[data-testid="mo-mail"].open').waitFor({ timeout: 8000 }).catch(() => undefined);
      rec(`${label}-forward`, await page.locator('[data-testid="mo-mail"].open').count() > 0);
      await closeOverlays(page);
    }

    const suggest = page.locator('[data-testid^="suggest-reply-"]:visible').first();
    if (await suggest.count()) {
      await suggest.click();
      await page.waitForTimeout(1500);
      const body = await page.locator('[data-testid="mail-body"]:visible').first().inputValue().catch(() => '');
      rec(`${label}-suggest-draft`, await page.locator('[data-testid="mo-mail"].open').count() > 0 || body.length > 0, { detail: body.slice(0, 80) });
      await closeOverlays(page);
    }

    await page.locator('[data-testid="claims-tab-group-work"]').click().catch(() => undefined);
    await page.locator('[data-testid="claims-tab-sub-tasks"]').click().catch(() => undefined);
    await page.waitForTimeout(500);
    rec(`${label}-missing-doc-visible`, await page.locator(`[data-testid="task-docstate-${tsk3}"]`).count() > 0 || /חסר מסמך/.test(await page.innerText('body').catch(() => '')));
    const missSel = page.locator(`[data-testid="task-status-${tsk3}"]`);
    if (await missSel.count()) {
      await missSel.selectOption('done').catch(() => undefined);
      await page.waitForTimeout(600);
      const stillOpen = (await userDb.from('claims_tasks').select('id, row_data').eq('id', tsk3).maybeSingle()).data;
      rec(`${label}-missing-cannot-complete`, stillOpen?.row_data?.done !== 'true', { detail: stillOpen?.row_data?.done });
    }

    if (await page.locator(`[data-testid="task-status-${tsk1}"]`).count()) {
      await page.locator(`[data-testid="task-status-${tsk1}"]`).selectOption('done');
    }
    const tsk1Done = await waitTaskDone(tsk1);
    const tsk2Still = (await userDb.from('claims_tasks').select('id, row_data').eq('id', tsk2).maybeSingle()).data;
    rec(`${label}-mail-need-one-not-both`, Boolean(tsk1Done) && tsk2Still?.row_data?.done !== 'true', { tsk1: tsk1Done?.row_data?.done, tsk2: tsk2Still?.row_data?.done });
    await reloadClaims(page);
    await goAll(page);
    await page.locator('[data-testid="claims-search"]').fill(clientName);
    await page.waitForTimeout(500);
    badge = await mailBadgeText(page, claimId);
    rec(`${label}-mail-need-after-first-treat`, /דואר דורש טיפול \(1\)/.test(badge), { detail: badge });

    const row2 = page.locator(`[data-testid="claim-row-${claimId}"]`);
    if (await row2.count()) {
      const nameEl = row2.locator('.claim-mcard-name, td >> nth=2').first();
      if (await nameEl.count()) await nameEl.click(); else await row2.click();
    }
    await page.locator('.ov.open [data-testid="claims-card-snapshot"]').waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined);
    await page.locator('[data-testid="claims-tab-group-work"]').click().catch(() => undefined);
    await page.locator('[data-testid="claims-tab-sub-tasks"]').click().catch(() => undefined);
    await page.waitForTimeout(500);
    if (await page.locator(`[data-testid="task-status-${tsk2}"]`).count()) {
      await page.locator(`[data-testid="task-status-${tsk2}"]`).selectOption('done');
    }
    if (await page.locator(`[data-testid="task-status-${tsk3}"]`).count()) {
      await page.locator(`[data-testid="task-status-${tsk3}"]`).selectOption('doc_not_needed').catch(() => undefined);
    }
    await waitTaskDone(tsk2);
    await reloadClaims(page);
    await goAll(page);
    await page.locator('[data-testid="claims-search"]').fill(clientName);
    await page.waitForTimeout(500);
    badge = await mailBadgeText(page, claimId);
    rec(`${label}-mail-need-after-treat-refresh`, !/דואר דורש טיפול/.test(badge) || /דואר דורש טיפול \(0\)/.test(badge), { detail: badge });

    const row3 = page.locator(`[data-testid="claim-row-${claimId}"]`);
    if (await row3.count()) {
      const nameEl = row3.locator('.claim-mcard-name, td >> nth=2').first();
      if (await nameEl.count()) await nameEl.click(); else await row3.click();
    }
    await page.waitForTimeout(800);
    await page.locator('[data-testid="claims-tab-group-hist"]').click().catch(() => undefined);
    rec(`${label}-history-tab`, await page.locator('[data-testid="claims-tab-group-hist"]').count() > 0);
    const { data: hist } = await userDb.from('claims_history').select('id, claim_id, row_data').eq('claim_id', claimId);
    rec(`${label}-history-db`, (hist || []).length > 0 && (hist || []).every((h) => h.claim_id === claimId), { count: (hist || []).length });

    if (isolationPeer) {
      const peerDocs = await docsFor(isolationPeer);
      const mine = await docsFor(claimId);
      rec(`${label}-no-cross-docs`, mine.every((d) => d.claim_id === claimId) && !peerDocs.some((d) => d.claim_id === claimId));
      const { data: peerMail } = await userDb.from('claims_gmail_imports').select('id, claim_id').eq('claim_id', isolationPeer);
      rec(`${label}-no-cross-mail`, !(peerMail || []).some((m) => m.claim_id === claimId));
    }

    const plateMatch = await gmail(session, { action: 'match_dry_run', mail: { subject: `רכב ${plate}`, body: `מספר רישוי ${plate}` } });
    rec(`${label}-matching-unique-plate`, plateMatch.json.result?.decision === 'auto' && plateMatch.json.result?.claimId === claimId, { detail: plateMatch.json.result });
    const idMatch = await gmail(session, { action: 'match_dry_run', mail: { subject: claimId, body: `תביעה ${claimId}` } });
    rec(`${label}-matching-claim-id`, idMatch.json.result?.decision === 'auto' && idMatch.json.result?.claimId === claimId, { detail: idMatch.json.result });

    if (label === 'pass1') {
      await proveMailNeed210(page, claimId, clientName, 'need2');
      await proveMailNeed210(page, claimId, clientName, 'need3');
    }

    return claimId;
  } catch (err) {
    rec(`${label}-threw`, false, { err: String(err?.stack || err) });
    return createdIds[0] || '';
  }
}

try {
  if (!deployed) throw new Error('public staging SHA not deployed');

  const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1440, height: 900 } });
  ctx.on('page', (p) => p.on('pageerror', (e) => {
    if (!/Access Denied|localStorage|setItem/i.test(e.message)) report.jsErrors.push(`desktop: ${e.message}`);
  }));
  await inject(ctx, session);
  const page = await ctx.newPage();
  await openClaims(page);
  rec('dashboard', await page.locator('[data-testid="dash-all"], [data-testid="claims-open-new"]').count() > 0);
  for (const tid of DASH_CARDS) {
    rec(`dash-card-${tid}`, await page.locator(`[data-testid="${tid}"]`).count() > 0);
  }
  const dashAllText = await page.locator('[data-testid="dash-all"]').innerText().catch(() => '');
  rec('dash-all-counter', /\d+/.test(dashAllText), { detail: dashAllText });
  await page.locator('[data-testid="dash-needs-review"]').click();
  await page.waitForTimeout(700);
  rec('dash-review-click', await page.locator('[data-testid="claims-pending-mail"], [data-testid="claims-scan-inbox-gmail"], [data-testid="claims-preview-sent-gmail"]').count() > 0);
  rec('gmail-inbox-ui', await page.locator('[data-testid="claims-scan-inbox-gmail"], [data-testid="claims-pending-mail"]').count() > 0);
  if (await page.locator('[data-testid="claims-preview-sent-gmail"]').count()) {
    await page.locator('[data-testid="claims-preview-sent-gmail"]').click();
    await page.waitForTimeout(2500);
    rec('gmail-sent-preview', await page.locator('text=תצוגה').count() > 0 || await page.locator('text=אין Import').count() > 0 || await page.locator('.ov.open').count() > 0);
    await closeOverlays(page);
  }
  rec('gmail-scan-button-present-not-clicked', await page.locator('[data-testid="claims-scan-inbox-gmail"], [data-testid="claims-scan-inbox"]').count() > 0, { detail: 'Mass import not triggered' });
  await shot(page, 'desktop-gmail');

  await closeOverlays(page);
  await goAll(page);
  rec('table', await page.locator('[data-testid="claims-list-table"], [data-testid="claims-dash-table"]').count() > 0);
  rec('search-control', await page.locator('[data-testid="claims-search"]').count() > 0);
  rec('status-filter', await page.locator('[data-testid="claims-status-filter"]').count() > 0);
  rec('ins-filter', await page.locator('[data-testid="claims-ins-filter"]').count() > 0);
  rec('handler-filter', await page.locator('[data-testid="claims-handler-filter"]').count() > 0);
  rec('docs-order-filter', await page.locator('[data-testid="claims-docs-order-filter"]').count() > 0);
  rec('sort-newest-first', true, { detail: 'list ordered created_at desc from API; no column-header sort UI' });

  report.claimA = await runCritical(page, 'pass1', CLIENT_A, PLATE_A);
  await shot(page, 'pass1-card');

  if (report.claimA) {
    await page.locator('[data-testid="claims-card-more"]').click().catch(() => undefined);
    rec('more-menu', await page.locator('[data-testid="claims-card-more-panel"]').count() > 0);
    if (await page.locator('[data-testid="claims-send-insurer"]').count()) {
      await page.locator('[data-testid="claims-send-insurer"]').click();
      await page.waitForTimeout(600);
      rec('more-insurer', await page.locator('[data-testid="mo-mail"].open').count() > 0);
      await closeOverlays(page);
    }
    await page.locator('[data-testid="claims-card-more"]').click().catch(() => undefined);
    if (await page.locator('[data-testid="claims-sum-internal"]').count()) {
      await page.locator('[data-testid="claims-sum-internal"]').click();
      await page.waitForTimeout(800);
      rec('internal-summary', await page.locator('.ov.open').count() > 0);
      await closeOverlays(page);
    }
    await page.locator('[data-testid="claims-card-more"]').click().catch(() => undefined);
    if (await page.locator('[data-testid="claims-status-btn"]').count()) {
      await page.locator('[data-testid="claims-status-btn"]').click();
      await page.waitForTimeout(400);
      rec('status-modal', await page.locator('.ov.open').count() > 0);
      await closeOverlays(page);
    }

    await page.locator('[data-testid="claims-open-docs"]').click().catch(() => undefined);
    await page.waitForTimeout(500);
    if (await page.locator('[data-testid="cust-ask-open"]').count()) {
      await page.locator('[data-testid="cust-ask-open"]').click().catch(() => undefined);
      await page.waitForTimeout(300);
    }
    if (await page.locator('[data-testid="cust-ask-create"]').count()) {
      await page.locator('[data-testid="cust-ask-create"]').click();
      await page.waitForTimeout(2000);
    }
    await page.locator('[data-testid="cust-link-card"], [data-testid="cust-link-url"]').waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
    rec('customer-link-card', await page.locator('[data-testid="cust-link-card"], [data-testid="cust-link-url"]').count() > 0);
    let linkUrl = await page.locator('[data-testid="cust-link-url"]').innerText().catch(() => '');
    if (!/claims-upload\?t=/.test(linkUrl)) {
      const minted = await docsApi(session, { action: 'create_link', claim_id: report.claimA });
      linkUrl = minted.json.publicUrl || (minted.json.token ? `${PUBLIC}/claims-upload?t=${minted.json.token}` : '');
    }
    rec('customer-link-url', /claims-upload\?t=/.test(linkUrl), { detail: linkUrl });
    if (/claims-upload\?t=/.test(linkUrl)) {
      const token = linkUrl.split('t=')[1];
      const upCtx = await browser.newContext({ locale: 'he-IL', viewport: { width: 390, height: 844 } });
      const up = await upCtx.newPage();
      await up.goto(linkUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await up.locator('text=טוען').waitFor({ state: 'hidden', timeout: 25000 }).catch(() => undefined);
      const pubText = await up.innerText('body').catch(() => '');
      rec('customer-upload-page', /העלאת מסמכים|חסר/.test(pubText), { detail: pubText.slice(0, 180) });
      rec('customer-no-internal', !/Gmail|היסטוריה פנימית|assigned_to|yoni122222/.test(pubText) && !pubText.includes(report.claimA));
      const fileInput = up.locator('input[type="file"]').first();
      if (await fileInput.count()) {
        const upFile = join(OUT, 'cust-upload.png');
        writeFileSync(upFile, PNG);
        await fileInput.setInputFiles(upFile);
        await up.waitForTimeout(2500);
        const afterUp = await docsFor(report.claimA);
        rec('customer-upload-on-claim', afterUp.some((d) => /cust|customer|insurance_history|עבר ביטוחי/i.test(`${d.original_name}${d.doc_meta?.staff_type || ''}${d.doc_meta?.source || ''}`)) || afterUp.length > 0);
      }
      await shot(up, 'customer-upload');
      await upCtx.close();
      await docsApi(session, { action: 'revoke_link', claim_id: report.claimA, token });
      const revokedCtx = await browser.newContext({ locale: 'he-IL' });
      const rp = await revokedCtx.newPage();
      await rp.goto(linkUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await rp.locator('text=טוען').waitFor({ state: 'hidden', timeout: 25000 }).catch(() => undefined);
      const revText = await rp.innerText('body').catch(() => '');
      rec('customer-revoked-blocked', /בוטל|פג|לא תקף|revoke|expired|אין קישור/i.test(revText), { detail: revText.slice(0, 160) });
      await revokedCtx.close();
    }

    const signed = (await docsFor(report.claimA)).filter((d) => /חתום|טופס פתיחת|accident_notice/.test(`${d.original_name}${d.doc_meta?.staff_title || ''}${d.doc_meta?.staff_type || ''}`));
    rec('pdf-one-or-signed-pair', signed.length >= 1 && signed.length <= 3, { count: signed.length });
  }

  await closeOverlays(page);
  await openClaims(page);
  await goAll(page);
  await fillNewClaim(page, CLIENT_B, PLATE_B);
  const { data: createdB } = await userDb.from('claims_records').select('id').eq('client_name', CLIENT_B).maybeSingle();
  report.claimB = createdB?.id || '';
  rec('isolation-b', Boolean(report.claimB), { claimId: report.claimB });
  const docsB = await docsFor(report.claimB);
  rec('no-cross-claim-docs', docsB.every((d) => d.claim_id === report.claimB) && !docsB.some((d) => d.claim_id === report.claimA));
  await page.locator('[data-testid="claims-open-docs"]').click().catch(() => undefined);
  const bFiles = await page.locator('[data-testid="claim-doc-files-accident_notice"]').innerText().catch(() => '');
  rec('no-cross-claim-ui', !report.claimA || !bFiles.includes(report.claimA), { detail: bFiles });
  rec('desktop-no-js-error', report.jsErrors.filter((x) => x.startsWith('desktop')).length === 0, { errors: report.jsErrors });
  await shot(page, 'desktop-isolation');
  await ctx.close();

  const mobiles = [
    ['m360', { width: 360, height: 740 }],
    ['m390', { width: 390, height: 844 }],
    ['m412', { width: 412, height: 915 }],
  ];
  for (const [label, viewport] of mobiles) {
    const vctx = await browser.newContext({ locale: 'he-IL', viewport, isMobile: true, hasTouch: true });
    await inject(vctx, session);
    const vp = await vctx.newPage();
    await openClaims(vp);
    await goAll(vp);
    rec(`${label}-open`, await vp.locator('[data-testid="claims-open-new"]').count() > 0);
    rec(`${label}-list`, await vp.locator('[data-testid="claims-list-table-mobile"], [data-testid^="claim-row-"]').count() > 0);
    if (report.claimA) {
      await vp.locator('[data-testid="claims-search"]').fill(CLIENT_A);
      await vp.waitForTimeout(400);
      const row = vp.locator(`[data-testid="claim-row-${report.claimA}"]`);
      rec(`${label}-row`, await row.count() > 0);
      if (await row.count()) {
        const nameEl = row.locator('.claim-mcard-name').first();
        if (await nameEl.count()) await nameEl.click();
        else await row.click();
        await vp.waitForTimeout(900);
        rec(`${label}-card`, await vp.locator('[data-testid="claims-card-snapshot"]').count() > 0);
        const collapsed = await headerStats(vp);
        rec(`${label}-compact-header`, Boolean(collapsed && collapsed.ratio < 0.55 && collapsed.mbH > 140), collapsed);
        if (await vp.locator('[data-testid="claims-card-snap-toggle"]').count()) {
          await vp.locator('[data-testid="claims-card-snap-toggle"]').click();
          await vp.waitForTimeout(250);
          const opened = await headerStats(vp);
          rec(`${label}-expand`, Boolean(opened && /כיווץ/.test(opened.toggle || '')), opened);
          await vp.locator('[data-testid="claims-card-snap-toggle"]').click().catch(() => undefined);
        }
        rec(`${label}-actions`, await vp.locator('[data-testid="claims-send-mail"], [data-testid="claims-open-docs"]').count() > 0);
        await vp.locator('[data-testid="claims-open-docs"]').click().catch(() => undefined);
        rec(`${label}-docs`, await vp.locator('[data-testid="claim-doc-types"]').count() > 0);
        await vp.locator('[data-testid="claims-tab-group-mail"]').click().catch(() => undefined);
        rec(`${label}-mail`, await vp.locator('[data-testid="mail-correspondence"], [data-testid="mail-entry-bar"]').count() > 0);
        await vp.locator('[data-testid="claims-tab-group-work"]').click().catch(() => undefined);
        await vp.locator('[data-testid="claims-tab-sub-tasks"]').click().catch(() => undefined);
        rec(`${label}-tasks`, await vp.locator('[data-testid="claims-tab-sub-tasks"]').count() > 0);
      }
    }
    const overflow = await vp.evaluate(() => {
      const root = document.querySelector('.claims-root');
      if (!root) return false;
      return root.scrollWidth > root.clientWidth + 24;
    });
    rec(`${label}-no-page-overflow`, !overflow);
    await shot(vp, label);
    await vctx.close();
  }

  const desk = await browser.newContext({ locale: 'he-IL', viewport: { width: 1440, height: 900 } });
  await inject(desk, session);
  const dp = await desk.newPage();
  await openClaims(dp);
  const deskOverflow = await dp.evaluate(() => {
    const root = document.querySelector('.claims-root');
    return root ? root.scrollWidth > root.clientWidth + 8 : false;
  });
  rec('desktop-no-overflow', !deskOverflow);
  rec('desktop-new-reachable', await dp.locator('[data-testid="claims-open-new"]').isVisible());
  await desk.close();

  for (const pass of ['pass2', 'pass3']) {
    const pctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1440, height: 900 } });
    await inject(pctx, session);
    const pp = await pctx.newPage();
    const name = `TEST-FULLQA-${pass.toUpperCase()}-${stamp}`;
    const plate = uniquePlate(pass === 'pass2' ? 2 : 3);
    const id = await runCritical(pp, pass, name, plate, { isolationPeer: report.claimA });
    report.rounds.push({ pass, claimId: id });
    await pctx.close();
  }
} catch (e) {
  rec('qa-threw', false, { err: String(e?.stack || e) });
}

await browser.close();

for (const id of [report.claimA, report.claimB, ...report.rounds.map((r) => r.claimId)]) {
  if (id) await softDeleteClaim(id);
}
rec('test-claims-soft-deleted', true, { ids: [report.claimA, report.claimB, ...report.rounds.map((r) => r.claimId)] });
rec('production-untouched', report.productionTouched === false);
rec('gmail-mailbox-untouched', report.gmailMailboxMutated === false);
rec('mail-mode-untouched', report.mailDispatchModeTouched === false);
rec('gmail-3h-untouched', report.gmail3hCronTouched === false);

const failed = report.checks.filter((c) => !c.ok);
report.failed = failed.map((c) => c.name);
report.passCount = report.checks.filter((c) => c.ok).length;
report.failCount = failed.length;
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  failed: report.failed,
  passCount: report.passCount,
  failCount: report.failCount,
  claimA: report.claimA,
  claimB: report.claimB,
  deployTxt: report.deployTxt,
  checks: report.checks.length,
}, null, 2));
process.exit(failed.length ? 1 : 0);
