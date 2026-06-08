/**
 * Integration test: vehicle document upload (Storage + document_metadata).
 * Usage:
 *   set TEST_EMAIL=... & set TEST_PASSWORD=... & node scripts/test-vehicle-upload.mjs
 * Requires .env with VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

function loadEnvFile() {
  const path = join(process.cwd(), '.env');
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

function sanitizeSegment(input, fallback = 'misc') {
  const cleaned = (input || '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || fallback;
}

function buildPath(userId, folder, fileName) {
  const dot = fileName.lastIndexOf('.');
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const safeBase =
    base
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 60) || 'file';
  const safeFile = ext ? `${safeBase}.${ext}` : safeBase;
  return `${sanitizeSegment(userId)}/${sanitizeSegment(folder)}/${Date.now()}_${safeFile}`;
}

const fileEnv = loadEnvFile();
const url = process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.TEST_EMAIL;
const password = process.env.TEST_PASSWORD;

const report = { ok: false, steps: [], at: new Date().toISOString() };

function step(name, detail) {
  report.steps.push({ name, ...detail });
  console.log(name, detail.ok === false ? 'FAIL' : 'OK', detail.message || '');
}

if (!url || !key) {
  step('config', { ok: false, message: 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY' });
  finish(1);
}

if (!email || !password) {
  step('config', { ok: false, message: 'Set TEST_EMAIL and TEST_PASSWORD to run live integration test' });
  finish(1);
}

const supabase = createClient(url, key);

async function run() {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError) {
    step('signIn', { ok: false, message: authError.message });
    return finish(1);
  }
  const userId = authData.user.id;
  step('signIn', { ok: true, userId });

  const { data: profile } = await supabase.from('profiles').select('company_name').eq('id', userId).single();
  const companyName = profile?.company_name || '';
  step('profile', { ok: !!companyName, companyName: companyName || '(empty)' });

  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const pdfBytes = Buffer.from(
    '%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n',
    'utf8',
  );

  for (const [label, bytes, name, category, contentType] of [
    ['png', pngBytes, 'test-vehicle.png', 'vehicle-license', 'image/png'],
    ['pdf', pdfBytes, 'test-vehicle.pdf', 'insurance', 'application/pdf'],
  ]) {
    const filePath = buildPath(userId, 'vehicle-docs', name);
    const { error: upErr } = await supabase.storage.from('documents').upload(filePath, bytes, {
      contentType,
      upsert: false,
    });
    if (upErr) {
      step(`storage:${label}`, { ok: false, message: upErr.message, filePath });
      continue;
    }
    step(`storage:${label}`, { ok: true, filePath });

    const { error: metaErr } = await supabase.from('document_metadata').insert({
      file_path: filePath,
      category,
      company_name: companyName,
      vehicle_plate: 'TEST-UPLOAD',
      manufacturer: 'Test',
      model: 'Car',
      original_name: name,
      uploaded_by: userId,
    });
    step(`metadata:${label}`, { ok: !metaErr, message: metaErr?.message, category });

    const { data: pub } = supabase.storage.from('documents').getPublicUrl(filePath);
    const head = await fetch(pub.publicUrl, { method: 'HEAD' });
    step(`publicUrl:${label}`, { ok: head.ok, status: head.status, url: pub.publicUrl });
  }

  const { data: metaRows, error: listErr } = await supabase
    .from('document_metadata')
    .select('id, category, file_path')
    .eq('vehicle_plate', 'TEST-UPLOAD')
    .order('created_at', { ascending: false })
    .limit(5);

  step('metadataQuery', { ok: !listErr && (metaRows?.length || 0) > 0, count: metaRows?.length || 0, message: listErr?.message });

  report.ok = report.steps.every((s) => s.ok !== false);
  finish(report.ok ? 0 : 1);
}

function finish(code) {
  const outDir = join(process.cwd(), 'test-results');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'vehicle-upload-verification.json'), JSON.stringify(report, null, 2));
  process.exit(code);
}

run().catch((e) => {
  step('fatal', { ok: false, message: String(e) });
  finish(1);
});
