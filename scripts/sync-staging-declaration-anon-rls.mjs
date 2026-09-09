/**
 * Staging-only: ensure driver_declarations anon RLS matches Production migrations.
 * Never touches Production (qasomfndnjuixgjmjwcm / dalia-car.online).
 */
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const STAGING = 'usfeoerkpcafxxlyuldl';
const PROD = 'qasomfndnjuixgjmjwcm';
const ARTIFACT = '/opt/cursor/artifacts';
mkdirSync(ARTIFACT, { recursive: true });

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN required');
  process.exit(1);
}

async function mgmt(path, opts = {}) {
  const res = await fetch(`https://api.supabase.com/v1${path}`, {
    method: opts.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: token,
      'Content-Type': 'application/json',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, json, text };
}

const sql = `
-- Staging parity with Production declaration public sign policies (from migrations).
-- Idempotent.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'driver_declarations'
      AND policyname = 'Anonymous can view by token'
  ) THEN
    EXECUTE 'DROP POLICY "Anonymous can view by token" ON public.driver_declarations';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'driver_declarations'
      AND policyname = 'Anonymous can update by token'
  ) THEN
    EXECUTE 'DROP POLICY "Anonymous can update by token" ON public.driver_declarations';
  END IF;
END $$;

CREATE POLICY "Anonymous can view by token"
  ON public.driver_declarations FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anonymous can update by token"
  ON public.driver_declarations FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- Storage: anon can upload/read declaration signatures (Production migration 20260424091333)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Anonymous can upload declaration signatures'
  ) THEN
    CREATE POLICY "Anonymous can upload declaration signatures"
    ON storage.objects
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (
      bucket_id = 'documents'
      AND (storage.foldername(name))[1] = 'declarations'
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Anonymous can view declaration signatures'
  ) THEN
    CREATE POLICY "Anonymous can view declaration signatures"
    ON storage.objects
    FOR SELECT
    TO anon, authenticated
    USING (
      bucket_id = 'documents'
      AND (storage.foldername(name))[1] = 'declarations'
    );
  END IF;
END $$;

SELECT policyname, cmd, roles::text
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'driver_declarations'
ORDER BY policyname;
`;

const out = {
  at: new Date().toISOString(),
  staging: STAGING,
  productionTouched: false,
  ok: false,
};

if (STAGING === PROD) throw new Error('ABORT_PROD_REF');

const applied = await mgmt(`/projects/${STAGING}/database/query`, {
  method: 'POST',
  body: { query: sql },
});
out.http = applied.status;
out.result_preview = typeof applied.text === 'string' ? applied.text.slice(0, 1200) : applied.json;
out.ok = applied.status >= 200 && applied.status < 300;
out.productionTouched = false;

writeFileSync(`${ARTIFACT}/sync-staging-declaration-anon-rls.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
process.exit(out.ok ? 0 : 1);
