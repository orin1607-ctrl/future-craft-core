#!/usr/bin/env node
/**
 * Live PUBLIC STAGING: Secure Share recipient gallery.
 * Mix of jpeg/png/webp (+ heic if fetchable). Lightbox next/prev/swipe/download.
 * TEST claim, soft-delete. Never Production.
 */
import { createClient } from '@supabase/supabase-js';
import { deflateSync, crc32 } from 'zlib';
import { mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = 'https://orin1607-ctrl.github.io/future-craft-core';
const FN = `https://${STAGING_REF}.supabase.co/functions/v1/claims-docs`;
const OUT = join(process.cwd(), 'docs/audit-reports/claims-share-gallery-2026-09-10');
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const DESK_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const DESK_PASSWORD = 'QaWorker2026!';
const PROTECTED = new Set(['DAL-2026-0020', 'DAL-2026-0014', 'DAL-2026-0017', 'DAL-2026-0001', 'DAL-QA-WORKER-001']);
const env = {};
for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split('\n')) {
  if (!line || line.startsWith('#') || !line.includes('=')) continue;
  const i = line.indexOf('=');
  env[line.slice(0, i)] = line.slice(i + 1);
}
const anonKey = env.VITE_SUPABASE_ANON_KEY;
function jwtRef(tok) {
  try { return JSON.parse(Buffer.from(String(tok).split('.')[1], 'base64url').toString('utf8')).ref || ''; }
  catch { return ''; }
}
if (jwtRef(anonKey) === PROD_REF) throw new Error('production anon key blocked');

const report = {
  at: new Date().toISOString(), staging: STAGING_REF, public: PUBLIC,
  productionTouched: false, checks: [], findings: [], copiedUrl: '',
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 220)}` : ''}`);
};
const find = (title, detail) => {
  report.findings.push({ title, detail });
  console.log(`FINDING ${title} · ${detail}`);
};

function pngSolid(w, h, r, g, b, salt = 0) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const i = row + 1 + x * 3;
      raw[i] = (r + x + salt) & 255;
      raw[i + 1] = (g + y) & 255;
      raw[i + 2] = b & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, c]);
  };
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function looksLikeHeic(buf) {
  return buf.length >= 12 && buf.slice(4, 8).toString('ascii') === 'ftyp';
}
function looksLikeJpeg(buf) { return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8; }
function looksLikePng(buf) { return buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47; }
function looksLikeWebp(buf) { return buf.length >= 12 && buf.slice(0, 4).toString('ascii') === 'RIFF'; }
function looksLikeImage(buf) {
  return looksLikeHeic(buf) || looksLikeJpeg(buf) || looksLikePng(buf) || looksLikeWebp(buf);
}
function ffmpegStill(ext, color, dest) {
  const r = spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', `color=c=${color}:s=320x240:d=1`, '-frames:v', '1', dest], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error((r.stderr || '').slice(-240));
  return readFileSync(dest);
}

const db = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { persistSession: false } });
const { data: auth, error: loginErr } = await db.auth.signInWithPassword({ email: DESK_EMAIL, password: DESK_PASSWORD });
if (loginErr || !auth.session) throw loginErr || new Error('api login failed');
const session = auth.session;

const { data: mimeRows } = await db.from('claims_documents').select('mime_type, original_name').limit(400);
const mimeTally = {};
for (const row of mimeRows || []) {
  const k = `${row.mime_type || '?'}|${String(row.original_name || '').split('.').pop() || ''}`;
  mimeTally[k] = (mimeTally[k] || 0) + 1;
}
report.existingMimes = mimeTally;
rec('existing-image-mimes-sampled', true, { mimeTally });

const stamp = Date.now();
const claimId = `DAL-QA-GALLERY-${stamp}`;
const now = new Date().toISOString();
await db.from('claims_records').insert({
  id: claimId, client_name: `TEST Gallery ${stamp}`, status: 'בטיפול', plate: '12-345-67',
  assigned_to: session.user.id,
  row_data: {
    id: claimId, clientName: `TEST Gallery ${stamp}`, clientEmail: 'yoni122222@gmail.com',
    plate: '12-345-67', status: 'בטיפול', source: 'Staff', createdAt: now,
  },
  created_by_name: 'QA Worker', last_activity_at: now,
});

async function up(name, mime, bytes, extra = {}) {
  const form = new FormData();
  form.set('action', 'staff_upload');
  form.set('claim_id', claimId);
  if (extra.staff_type) form.set('staff_type', extra.staff_type);
  form.set('file', new Blob([bytes], { type: mime }), name);
  const r = await fetch(FN, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}` },
    body: form,
  });
  return r.json();
}

const imageIds = [];
const clonedFromLive = [];
async function cloneLiveImages() {
  const { data: docs } = await db.from('claims_documents')
    .select('id, claim_id, mime_type, original_name, byte_size')
    .in('mime_type', ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
    .order('created_at', { ascending: false })
    .limit(80);
  const picked = [];
  const seenMime = new Set();
  for (const row of docs || []) {
    const mime = String(row.mime_type || '');
    const size = Number(row.byte_size || 0);
    const name = String(row.original_name || '');
    if (size < 2000 || size > 4_000_000) continue;
    if (/gallery-(png|jpg|jpeg|webp|heic)|live-gallery-/i.test(name)) continue;
    const key = `${mime}|${row.claim_id}`;
    if (seenMime.has(key) && picked.filter((p) => p.mime_type === mime).length >= 3) continue;
    seenMime.add(key);
    picked.push(row);
    if (picked.length >= 8) break;
  }
  for (const row of picked) {
    const signed = await fetch(FN, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'signed_urls', claim_id: row.claim_id, file_ids: [row.id] }),
    }).then((r) => r.json()).catch(() => ({}));
    const url = signed?.urls?.[row.id];
    if (!url) continue;
    const buf = Buffer.from(await fetch(url).then((r) => r.arrayBuffer()));
    if (!looksLikeImage(buf)) continue;
    const name = `live-${String(row.original_name || 'photo').replace(/[^\w.\-]+/g, '_').slice(0, 40)}`;
    const res = await up(name, row.mime_type, buf, { staff_type: 'damage_photos' });
    if (res.file_id && !imageIds.includes(res.file_id)) {
      imageIds.push(res.file_id);
      clonedFromLive.push({ mime: row.mime_type, name, bytes: buf.length, magic: looksLikeHeic(buf) ? 'heic' : looksLikeJpeg(buf) ? 'jpeg' : looksLikePng(buf) ? 'png' : 'webp' });
    }
  }
}
await cloneLiveImages();
rec('cloned-live-photos', true, { count: clonedFromLive.length, clonedFromLive });

const colors = [
  [200, 40, 40], [40, 140, 40], [40, 80, 200], [220, 180, 40], [160, 60, 180],
  [30, 160, 160], [220, 100, 40], [80, 80, 80], [20, 20, 140], [180, 20, 80],
  [100, 200, 80], [240, 140, 180],
];
for (let i = 0; i < colors.length; i++) {
  const [r, g, b] = colors[i];
  const res = await up(`gallery-png-${i}-${stamp}.png`, 'image/png', pngSolid(320, 240, r, g, b, i), { staff_type: 'damage_photos' });
  if (res.file_id && !imageIds.includes(res.file_id)) imageIds.push(res.file_id);
}
const jpgColors = ['red', 'green', 'blue', 'orange'];
for (let i = 0; i < jpgColors.length; i++) {
  const bytes = ffmpegStill('jpg', jpgColors[i], `/tmp/gallery-jpg-${i}.jpg`);
  const res = await up(`gallery-jpg-${i}-${stamp}.jpg`, 'image/jpeg', bytes, { staff_type: 'damage_photos' });
  if (res.file_id && !imageIds.includes(res.file_id)) imageIds.push(res.file_id);
}
const webpColors = ['purple', 'teal'];
for (let i = 0; i < webpColors.length; i++) {
  const bytes = ffmpegStill('webp', webpColors[i], `/tmp/gallery-webp-${i}.webp`);
  const res = await up(`gallery-webp-${i}-${stamp}.webp`, 'image/webp', bytes, { staff_type: 'damage_photos' });
  if (res.file_id && !imageIds.includes(res.file_id)) imageIds.push(res.file_id);
}
let heicOk = false;
try {
  const heicBuf = Buffer.from(await fetch('https://raw.githubusercontent.com/alexcorvi/heic2any/master/demo/1.heic').then((r) => r.arrayBuffer()));
  rec('heic-magic', looksLikeHeic(heicBuf), { bytes: heicBuf.length, brand: heicBuf.slice(4, 12).toString('ascii') });
  if (looksLikeHeic(heicBuf)) {
    const res = await up(`gallery-heic-${stamp}.heic`, 'image/heic', heicBuf, { staff_type: 'damage_photos' });
    if (res.file_id) { imageIds.push(res.file_id); heicOk = true; }
  }
} catch (e) {
  rec('heic-fetch', false, { err: String(e.message || e).slice(0, 180) });
}
rec('heic-uploaded', heicOk);
const pdf = await up(`gallery-doc-${stamp}.pdf`, 'application/pdf', Buffer.from('%PDF-1.1\n%%GALLERY\n'));
rec('setup-images', imageIds.length >= 18, { count: imageIds.length, heicOk, pdf: pdf.file_id });

const share = await fetch(FN, {
  method: 'POST',
  headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'create_share', claim_id: claimId, recipient_name: 'שמאי גלריה',
    recipient_kind: 'surveyor', file_ids: [...imageIds, pdf.file_id].filter(Boolean), ttl_hours: 24,
  }),
}).then((r) => r.json());
rec('create-share', Boolean(share.token), { err: share.error, fileCount: share.fileCount });
const publicUrl = `${PUBLIC}/claims-share/?t=${encodeURIComponent(share.token || '')}`;
report.copiedUrl = publicUrl;

const pagesTxt = await fetch(`${PUBLIC}/STAGING-DEPLOY.txt?t=${Date.now()}`).then((r) => r.text()).catch(() => '');
report.liveSha = ((pagesTxt.match(/deployed_ref=(\S+)/) || [])[1] || '');
rec('pages-sha', Boolean(report.liveSha), { txt: pagesTxt.trim() });

const { chromium } = await import('playwright');
const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto(publicUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('[data-testid="share-page"]').waitFor({ timeout: 30000 });
  rec('nologin-share-page', (await page.locator('input[type="password"]').count()) === 0);
  const expectedImages = imageIds.length;
  await page.waitForFunction((n) => {
    const el = document.querySelector('[data-testid="share-gallery"]');
    return el && el.getAttribute('data-thumbs-ready') === '1' && Number(el.getAttribute('data-thumbs-total') || 0) >= n;
  }, expectedImages, { timeout: 120000 });
  const loaded = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('[data-testid="share-gallery"] img')];
    const gal = document.querySelector('[data-testid="share-gallery"]');
    return {
      thumbs: imgs.length,
      decoded: imgs.filter((im) => im.naturalWidth > 0).length,
      broken: imgs.filter((im) => im.complete && im.naturalWidth === 0).map((im) => im.alt),
      errors: [...document.querySelectorAll('[data-testid^="share-thumb-ph-"]')].map((el) => el.textContent),
      ready: gal?.getAttribute('data-thumbs-ready'),
      loadedAttr: gal?.getAttribute('data-thumbs-loaded'),
    };
  });
  rec('all-thumbs-decode', loaded.decoded === expectedImages && loaded.broken.length === 0 && loaded.errors.length === 0, { ...loaded, expectedImages });
  if (loaded.broken.length || loaded.errors.length) find('broken-thumbs', [...loaded.broken, ...loaded.errors].join(', '));
  const title = (await page.locator('[data-testid="share-gallery-title"]').innerText()).trim();
  rec('album-title', title === 'גלריית תמונות', { title });
  const countTxt = (await page.locator('[data-testid="share-pub-count"]').innerText()).trim();
  rec('album-count', countTxt === `${expectedImages} תמונות`, { countTxt });
  const desktopCols = await page.evaluate(() => (
    getComputedStyle(document.querySelector('[data-testid="share-gallery"]')).gridTemplateColumns.split(' ').filter(Boolean).length
  ));
  rec('desktop-album-cols', desktopCols >= 4, { desktopCols });
  rec('docs-below-gallery', await page.locator('[data-testid="share-docs"]').count() === 1);
  await page.screenshot({ path: join(OUT, 'screenshots', '01-gallery.png'), fullPage: true });

  await page.locator('[data-testid="share-gallery"] img').first().click();
  await page.locator('[data-testid="share-lightbox"]').waitFor({ timeout: 15000 });
  rec('lightbox-opens', true);
  await page.locator('[data-testid="share-lb-img"]').waitFor({ timeout: 30000 });
  rec('lightbox-img', await page.locator('[data-testid="share-lb-img"]').count() > 0);
  const startPos = await page.locator('[data-testid="share-lb-pos"]').innerText();
  rec('lightbox-pos-start', startPos.trim() === `1 / ${expectedImages}`, { startPos, expectedImages });
  for (let i = 0; i < 8; i++) await page.locator('[data-testid="share-lb-next"]').click();
  const midPos = await page.locator('[data-testid="share-lb-pos"]').innerText();
  rec('lightbox-next', midPos.trim() === `9 / ${expectedImages}`, { midPos });
  await page.locator('[data-testid="share-lb-prev"]').click();
  const backPos = await page.locator('[data-testid="share-lb-pos"]').innerText();
  rec('lightbox-prev', backPos.trim() === `8 / ${expectedImages}`, { backPos });
  for (let i = 8; i < expectedImages; i++) await page.locator('[data-testid="share-lb-next"]').click();
  const endPos = await page.locator('[data-testid="share-lb-pos"]').innerText();
  rec('lightbox-walk-all', endPos.trim() === `${expectedImages} / ${expectedImages}`, { endPos });
  const opaque = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="share-lightbox"]');
    if (!el) return { bg: '', z: '' };
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, z: cs.zIndex };
  });
  rec('lightbox-opaque', /rgb\(11,\s*16,\s*32\)/.test(opaque.bg) && Number(opaque.z) >= 9999, opaque);
  await page.screenshot({ path: join(OUT, 'screenshots', '02-lightbox.png') });
  try {
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      page.locator('[data-testid="share-preview-download"]').click(),
    ]);
    rec('lightbox-download', Boolean(dl), { name: dl.suggestedFilename() });
  } catch (e) {
    rec('lightbox-download', false, { err: String(e.message || e).slice(0, 180) });
  }
  await page.locator('[data-testid="share-lb-close"]').click();
  rec('lightbox-close', await page.locator('[data-testid="share-lightbox"]').count() === 0);

  try {
    const [zip] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.locator('[data-testid="share-pub-zip"]').click(),
    ]);
    rec('download-all', Boolean(zip), { name: zip.suggestedFilename() });
  } catch (e) {
    rec('download-all', false, { err: String(e.message || e).slice(0, 180) });
  }

  const phone = await browser.newContext({
    locale: 'he-IL', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true,
  });
  const mob = await phone.newPage();
  await mob.goto(publicUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await mob.locator('[data-testid="share-gallery"] img').first().waitFor({ timeout: 45000 });
  const mobCols = await mob.evaluate(() => (
    getComputedStyle(document.querySelector('[data-testid="share-gallery"]')).gridTemplateColumns.split(' ').filter(Boolean).length
  ));
  rec('mobile-album-cols', mobCols === 2 || mobCols === 3, { mobCols });
  await mob.screenshot({ path: join(OUT, 'screenshots', '04-mobile-album.png'), fullPage: true });
  await mob.locator('[data-testid="share-gallery"] img').first().click();
  await mob.locator('[data-testid="share-lightbox"]').waitFor({ timeout: 15000 });
  const before = await mob.locator('[data-testid="share-lb-pos"]').innerText();
  await mob.evaluate(() => {
    const el = document.querySelector('[data-testid="share-lightbox"]');
    if (!el) return;
    const fire = (type, x) => {
      const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: 240, screenX: x, screenY: 240, pageX: x, pageY: 240, radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1 });
      el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, changedTouches: [t], touches: type === 'touchend' ? [] : [t] }));
    };
    fire('touchstart', 320);
    fire('touchend', 40);
  });
  await mob.waitForTimeout(500);
  const after = await mob.locator('[data-testid="share-lb-pos"]').innerText();
  rec('mobile-swipe-next', before !== after, { before, after });
  await mob.screenshot({ path: join(OUT, 'screenshots', '03-mobile-lightbox.png') });
  await phone.close();
  await ctx.close();
} catch (e) {
  rec('browser-e2e', false, { err: String(e.message || e).slice(0, 400) });
} finally {
  await browser.close();
  if (!PROTECTED.has(claimId)) {
    const { data } = await db.from('claims_records').select('id, row_data').eq('id', claimId).maybeSingle();
    if (data) await db.from('claims_records').update({ row_data: { ...(data.row_data || {}), deletedAt: new Date().toISOString() } }).eq('id', claimId);
  }
}

const failed = report.checks.filter((c) => !c.ok);
writeFileSync(join(OUT, 'e2e-live.json'), JSON.stringify(report, null, 2));
console.log(`\nGALLERY fail=${failed.length}/${report.checks.length} findings=${report.findings.length}`);
try {
  copyFileSync(join(OUT, 'screenshots', '01-gallery.png'), join('/opt/cursor/artifacts', 'share_gallery_thumbs.png'));
  copyFileSync(join(OUT, 'screenshots', '02-lightbox.png'), join('/opt/cursor/artifacts', 'share_gallery_lightbox.png'));
  copyFileSync(join(OUT, 'screenshots', '03-mobile-lightbox.png'), join('/opt/cursor/artifacts', 'share_gallery_mobile.png'));
  copyFileSync(join(OUT, 'screenshots', '04-mobile-album.png'), join('/opt/cursor/artifacts', 'share_gallery_mobile_album.png'));
} catch { /* */ }
if (failed.length) process.exitCode = 1;
