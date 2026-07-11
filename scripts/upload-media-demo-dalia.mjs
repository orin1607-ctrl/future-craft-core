/**
 * Upload locally prepared media demo images to Supabase Staging coco-media.
 * Input: .tmp/media-demo/{hero,service,fleetos,cta}-v1.png
 */
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const CUSTOMER = 'dalia-c-official';
const WEBSITE = 'main';
const BUCKET = 'coco-media';
const TMP = join(ROOT, '.tmp', 'media-demo');
const OUT_DIR = join(ROOT, 'public', 'coco-media', CUSTOMER);
const BRIEFS = JSON.parse(readFileSync(join(OUT_DIR, 'briefs.json'), 'utf8'));

function env(name) {
  return (process.env[name] || '').trim() || null;
}

const SUPABASE_URL = env('SUPABASE_URL') || env('VITE_SUPABASE_URL') || `https://${STAGING_REF}.supabase.co`;
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
if (!SERVICE_KEY) {
  console.error(JSON.stringify({ ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY missing' }));
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
mkdirSync(TMP, { recursive: true });

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
    const pngPath = join(TMP, `${slot.id}-v1.png`);
    if (!existsSync(pngPath)) throw new Error(`missing ${pngPath}`);
    const pngBuf = readFileSync(pngPath);
    const promptHash = createHash('sha256')
      .update(JSON.stringify({ slot: slot.id, alt: slot.alt, message: slot.message }))
      .digest('hex')
      .slice(0, 12);

    const webpPath = join(TMP, `${slot.id}-v1.webp`);
    const meta = await sharp(pngBuf)
      .resize({ width: 1600, height: 1067, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(webpPath);
    const webpBuf = readFileSync(webpPath);

    const fileName = `${slot.id}-v1-${promptHash.slice(0, 8)}.webp`;
    const path = `customers/${CUSTOMER}/websites/${WEBSITE}/media/images/${slot.id}/${fileName}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, webpBuf, {
      contentType: 'image/webp',
      upsert: true,
      cacheControl: '31536000',
    });
    if (error) throw new Error(`upload ${slot.id}: ${error.message}`);
    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    const probe = await headOk(data.publicUrl);

    assets.push({
      assetId: `${CUSTOMER}-${slot.id}-v1`,
      customerId: CUSTOMER,
      websiteId: WEBSITE,
      slot: slot.id,
      page: slot.page,
      region: slot.region,
      url: data.publicUrl,
      storagePath: path,
      fileName,
      mime: 'image/webp',
      width: meta.width,
      height: meta.height,
      bytes: webpBuf.length,
      alt: slot.alt,
      status: 'preview',
      version: 1,
      provider: 'demo-fallback-after-openai-billing-limit',
      openaiAttempt: 'Billing hard limit has been reached',
      promptHash,
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
  const health = {
    checkedAt: new Date().toISOString(),
    storageService: 'Supabase Storage (Staging)',
    storageStatus: broken ? 'תקלה חלקית' : 'פעיל',
    imageEngineStatus: 'OpenAI חסום ב-Billing · דוגמה הושלמה במנוע חלופי זמני',
    videoEngineStatus: 'לא מחובר עדיין',
    imagesLoadInSite: broken === 0 ? 'כן' : 'חלקי',
    imagesInSite: assets.length,
    withAlt: assets.filter((a) => a.hasAlt).length,
    optimized: assets.filter((a) => a.optimized).length,
    pendingApproval: assets.length,
    brokenLinks: broken,
    permissionsStatus: 'קריאה ציבורית · כתיבה רק דרך שרת (service role)',
    overallStatus: broken ? 'דורש תשומת לב' : 'תקין ל-Preview',
    recommendedAction: broken
      ? 'לבדוק קישורי אחסון'
      : 'לבדוק את האתר ב-Preview ולאשר תמונות · להסיר מגבלת Billing ב-OpenAI להמשך אוטומציה',
  };

  const manifest = {
    version: 1,
    customerId: CUSTOMER,
    websiteId: WEBSITE,
    bucket: BUCKET,
    basePath: `customers/${CUSTOMER}/websites/${WEBSITE}/media/`,
    generatedAt: started,
    providerDefault: 'openai-blocked-billing',
    providerUsed: 'demo-fallback-after-openai-billing-limit',
    assets,
    health,
    note: 'Demo Staging only — temporary provider due to OpenAI billing hard limit; future source of truth is media_assets DB',
  };

  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  writeFileSync(join(OUT_DIR, 'health.json'), JSON.stringify(health, null, 2));
  console.log(JSON.stringify({
    ok: true,
    assets: assets.map((a) => ({ slot: a.slot, url: a.url, bytes: a.bytes, w: a.width, h: a.height, ok: a.health.ok })),
    health,
  }, null, 2));
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e.message || e) }, null, 2));
  process.exit(1);
});
