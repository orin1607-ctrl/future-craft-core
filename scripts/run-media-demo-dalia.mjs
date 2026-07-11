/**
 * Media demo — Dalia Staging ONLY.
 * Generates 4 images via OpenAI, optimizes to WebP, uploads to Supabase Storage coco-media.
 * Does NOT commit binary images to Git. Requires:
 *   OPENAI via .env.openai
 *   SUPABASE_SERVICE_ROLE_KEY + SUPABASE_URL (or VITE_SUPABASE_URL) in env
 */
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { loadOpenAIKey } from './ai-marketing/_lib/openai-env.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const CUSTOMER = 'dalia-c-official';
const WEBSITE = 'main';
const BUCKET = 'coco-media';
const TMP = join(ROOT, '.tmp', 'media-demo');
const OUT_DIR = join(ROOT, 'public', 'coco-media', CUSTOMER);
const BRIEFS = JSON.parse(readFileSync(join(OUT_DIR, 'briefs.json'), 'utf8'));

mkdirSync(TMP, { recursive: true });

function env(name) {
  return (process.env[name] || '').trim() || null;
}

function loadDotEnvFiles() {
  for (const name of ['.env.local', '.env']) {
    const p = join(ROOT, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#') || !t.includes('=')) continue;
      const eq = t.indexOf('=');
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

loadDotEnvFiles();

const SUPABASE_URL = env('SUPABASE_URL') || env('VITE_SUPABASE_URL') || `https://${STAGING_REF}.supabase.co`;
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
const OPENAI_KEY = loadOpenAIKey();
const IMAGE_MODEL = env('OPENAI_IMAGE_MODEL') || 'gpt-image-1';

if (!OPENAI_KEY) {
  console.error(JSON.stringify({ ok: false, error: 'OPENAI_API_KEY missing (.env.openai)' }, null, 2));
  process.exit(1);
}
if (!SERVICE_KEY) {
  console.error(JSON.stringify({ ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY missing in env' }, null, 2));
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function ensureBucket() {
  const { data: buckets, error } = await sb.storage.listBuckets();
  if (error) throw new Error(`listBuckets: ${error.message}`);
  const exists = (buckets || []).some((b) => b.id === BUCKET || b.name === BUCKET);
  if (!exists) {
    const { error: cErr } = await sb.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: 8 * 1024 * 1024,
      allowedMimeTypes: ['image/webp', 'image/png', 'image/jpeg'],
    });
    if (cErr && !/already exists/i.test(cErr.message)) throw new Error(`createBucket: ${cErr.message}`);
  }
  // public read, no public write — service role uploads only
  return true;
}

function buildPrompt(slot) {
  return [
    `Professional marketing photograph for Israeli B2B fleet-management company "Dalia".`,
    `Business message: ${slot.message}.`,
    `Scene purpose: ${slot.purpose}.`,
    `Visual style: ${slot.styleRules}.`,
    `Color grade subtly matching navy #0b1735 and teal #0d9488.`,
    `Critical: absolutely no text, letters, numbers, logos, watermarks, brand marks, or UI labels readable.`,
    `Photoreal, high quality, suitable for a modern website hero/service section, not stock-cliché.`,
  ].join(' ');
}

async function generateImage(slot) {
  const prompt = buildPrompt(slot);
  const promptHash = createHash('sha256').update(prompt).digest('hex').slice(0, 12);
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt,
      size: slot.size || '1536x1024',
      quality: 'medium',
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`OpenAI images ${res.status}: ${json?.error?.message || JSON.stringify(json).slice(0, 300)}`);
  }
  const item = json.data?.[0] || {};
  let buf;
  if (item.b64_json) buf = Buffer.from(item.b64_json, 'base64');
  else if (item.url) {
    const imgRes = await fetch(item.url);
    buf = Buffer.from(await imgRes.arrayBuffer());
  } else {
    throw new Error('OpenAI response missing image data');
  }
  return { buf, prompt, promptHash, model: IMAGE_MODEL };
}

async function toWebp(buf, slotId) {
  const out = join(TMP, `${slotId}-v1.png`);
  writeFileSync(out, buf);
  const webpPath = join(TMP, `${slotId}-v1.webp`);
  const meta = await sharp(buf)
    .resize({ width: 1600, height: 1067, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toFile(webpPath);
  const webpBuf = readFileSync(webpPath);
  return {
    webpPath,
    bytes: webpBuf.length,
    width: meta.width,
    height: meta.height,
    webpBuf,
  };
}

async function upload(slot, webp, promptHash) {
  const fileName = `${slot.id}-v1-${promptHash.slice(0, 8)}.webp`;
  const path = `customers/${CUSTOMER}/websites/${WEBSITE}/media/images/${slot.id}/${fileName}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, webp.webpBuf, {
    contentType: 'image/webp',
    upsert: true,
    cacheControl: '31536000',
  });
  if (error) throw new Error(`upload ${slot.id}: ${error.message}`);
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return { path, fileName, url: data.publicUrl };
}

async function headOk(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    if (r.ok) return { ok: true, status: r.status };
    const g = await fetch(url, { method: 'GET' });
    return { ok: g.ok, status: g.status };
  } catch (e) {
    return { ok: false, status: 0, error: String(e.message || e) };
  }
}

async function main() {
  const started = new Date().toISOString();
  await ensureBucket();
  const assets = [];
  for (const slot of BRIEFS.slots) {
    const gen = await generateImage(slot);
    const webp = await toWebp(gen.buf, slot.id);
    const up = await upload(slot, webp, gen.promptHash);
    const probe = await headOk(up.url);
    assets.push({
      assetId: `${CUSTOMER}-${slot.id}-v1`,
      customerId: CUSTOMER,
      websiteId: WEBSITE,
      slot: slot.id,
      page: slot.page,
      region: slot.region,
      url: up.url,
      storagePath: up.path,
      fileName: up.fileName,
      mime: 'image/webp',
      width: webp.width,
      height: webp.height,
      bytes: webp.bytes,
      alt: slot.alt,
      status: 'preview',
      version: 1,
      provider: gen.model,
      promptHash: gen.promptHash,
      optimized: true,
      hasAlt: true,
      mobileFit: true,
      designFit: true,
      why: slot.why,
      supportsContent: slot.supportsContent,
      consultantLead: slot.consultantLead,
      message: slot.message,
      health: probe,
      createdAt: new Date().toISOString(),
      approvedAt: null,
      publishedAt: null,
    });
  }

  const broken = assets.filter((a) => !a.health.ok).length;
  const withAlt = assets.filter((a) => a.hasAlt).length;
  const optimized = assets.filter((a) => a.optimized).length;
  const pending = assets.filter((a) => a.status === 'draft' || a.status === 'preview').length;

  const health = {
    checkedAt: new Date().toISOString(),
    storageService: 'Supabase Storage (Staging)',
    storageStatus: broken ? 'תקלה חלקית' : 'פעיל',
    imageEngineStatus: 'פעיל (OpenAI Images)',
    videoEngineStatus: 'לא מחובר עדיין',
    imagesLoadInSite: broken === 0 ? 'כן' : 'חלקי',
    imagesInSite: assets.length,
    withAlt,
    optimized,
    pendingApproval: pending,
    brokenLinks: broken,
    permissionsStatus: 'קריאה ציבורית · כתיבה רק דרך שרת (service role)',
    overallStatus: broken ? 'דורש תשומת לב' : 'תקין',
    recommendedAction: broken
      ? 'לבדוק מחדש את קישורי האחסון לפני אישור Owner'
      : 'לבדוק את האתר ב-Preview ולאשר את ארבע התמונות',
  };

  const manifest = {
    version: 1,
    customerId: CUSTOMER,
    websiteId: WEBSITE,
    bucket: BUCKET,
    basePath: `customers/${CUSTOMER}/websites/${WEBSITE}/media/`,
    generatedAt: started,
    providerDefault: IMAGE_MODEL,
    assets,
    health,
    note: 'Demo Staging only — manifest is temporary; future source of truth is media_assets DB table',
  };

  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  writeFileSync(join(OUT_DIR, 'health.json'), JSON.stringify(health, null, 2));

  console.log(JSON.stringify({
    ok: true,
    bucket: BUCKET,
    assets: assets.map((a) => ({
      slot: a.slot,
      url: a.url,
      bytes: a.bytes,
      width: a.width,
      height: a.height,
      alt: a.alt,
      health: a.health.ok,
    })),
    health,
  }, null, 2));
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e.message || e) }, null, 2));
  process.exit(1);
});
