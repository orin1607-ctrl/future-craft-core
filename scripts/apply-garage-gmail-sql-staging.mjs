/**
 * Apply approved Garage Gmail SQL to Staging ONLY.
 * Refuses Production. Does not touch Claims tables.
 * node scripts/apply-garage-gmail-sql-staging.mjs
 */
import { execSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const SQL_SRC = join(ROOT, 'supabase', 'migrations', '20260913160000_garage_gmail_mail_staging.sql');
const sql = readFileSync(SQL_SRC, 'utf8');
if (/ON DELETE CASCADE/i.test(sql)) {
  throw new Error('refused: SQL still contains ON DELETE CASCADE');
}

const tmpWork = join(process.env.TEMP || tmpdir(), 'fcc-garage-gmail-apply');
mkdirSync(tmpWork, { recursive: true });
mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });
execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
  encoding: 'utf8',
  stdio: 'pipe',
});
const linked = readFileSync(join(tmpWork, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
if (linked !== STAGING_REF) throw new Error(`refused: linked ${linked} !== staging`);
if (linked === PROD_REF) throw new Error('refused: production');

const sqlFile = join(tmpWork, 'apply.sql');
copyFileSync(SQL_SRC, sqlFile);
console.log(JSON.stringify({ phase: 'apply', linked, staging: STAGING_REF }, null, 2));
const applyOut = execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${sqlFile}"`, {
  encoding: 'utf8',
  stdio: 'pipe',
  timeout: 180000,
});
console.log(applyOut);

function dbQuery(q) {
  const tmp = join(tmpWork, 'q.sql');
  writeFileSync(tmp, q, 'utf8');
  return execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${tmp}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 180000,
  });
}

const verify = dbQuery(`
SELECT json_build_object(
  'linked_expected', '${STAGING_REF}',
  'tables', (
    SELECT coalesce(json_agg(tablename ORDER BY tablename), '[]'::json)
    FROM pg_tables
    WHERE schemaname='public'
      AND tablename IN (
        'garage_gmail_connection','garage_gmail_settings','garage_gmail_imports',
        'garage_gmail_outbox','garage_gmail_pending','garage_gmail_history'
      )
  ),
  'fks', (
    SELECT coalesce(json_agg(json_build_object(
      'table', tc.table_name,
      'col', kcu.column_name,
      'to', ccu.table_name || '.' || ccu.column_name,
      'delete_rule', rc.delete_rule
    ) ORDER BY tc.table_name, kcu.column_name), '[]'::json)
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name=tc.constraint_name AND ccu.table_schema=tc.table_schema
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name=tc.constraint_name AND rc.constraint_schema=tc.table_schema
    WHERE tc.constraint_type='FOREIGN KEY'
      AND tc.table_schema='public'
      AND tc.table_name IN (
        'garage_gmail_connection','garage_gmail_settings','garage_gmail_imports',
        'garage_gmail_outbox','garage_gmail_pending','garage_gmail_history'
      )
  ),
  'cascade_gmail_fks', (
    SELECT count(*)
    FROM information_schema.referential_constraints rc
    JOIN information_schema.table_constraints tc
      ON tc.constraint_name=rc.constraint_name AND tc.table_schema=rc.constraint_schema
    WHERE rc.delete_rule='CASCADE'
      AND tc.table_schema='public'
      AND tc.table_name IN (
        'garage_gmail_imports','garage_gmail_outbox','garage_gmail_pending','garage_gmail_history'
      )
  ),
  'grants', json_build_object(
    'anon_imports_select', has_table_privilege('anon','public.garage_gmail_imports','SELECT'),
    'anon_outbox_select', has_table_privilege('anon','public.garage_gmail_outbox','SELECT'),
    'anon_pending_select', has_table_privilege('anon','public.garage_gmail_pending','SELECT'),
    'anon_history_select', has_table_privilege('anon','public.garage_gmail_history','SELECT'),
    'anon_connection_select', has_table_privilege('anon','public.garage_gmail_connection','SELECT'),
    'anon_settings_select', has_table_privilege('anon','public.garage_gmail_settings','SELECT'),
    'auth_connection_select', has_table_privilege('authenticated','public.garage_gmail_connection','SELECT'),
    'auth_settings_select', has_table_privilege('authenticated','public.garage_gmail_settings','SELECT'),
    'auth_imports_select', has_table_privilege('authenticated','public.garage_gmail_imports','SELECT'),
    'auth_imports_delete', has_table_privilege('authenticated','public.garage_gmail_imports','DELETE'),
    'auth_outbox_delete', has_table_privilege('authenticated','public.garage_gmail_outbox','DELETE'),
    'auth_history_delete', has_table_privilege('authenticated','public.garage_gmail_history','DELETE'),
    'auth_pending_delete', has_table_privilege('authenticated','public.garage_gmail_pending','DELETE')
  ),
  'policies', (
    SELECT coalesce(json_agg(json_build_object('table', tablename, 'name', policyname, 'cmd', cmd) ORDER BY tablename, policyname), '[]'::json)
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN (
        'garage_gmail_connection','garage_gmail_settings','garage_gmail_imports',
        'garage_gmail_outbox','garage_gmail_pending','garage_gmail_history'
      )
  ),
  'delete_policies', (
    SELECT count(*) FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN (
        'garage_gmail_imports','garage_gmail_outbox','garage_gmail_pending','garage_gmail_history'
      )
      AND cmd='DELETE'
  ),
  'connection', (
    SELECT json_build_object(
      'email', connected_email,
      'has_token', refresh_token IS NOT NULL AND length(refresh_token) > 20 AND refresh_token <> 'revoked',
      'revoked_at', revoked_at
    )
    FROM public.garage_gmail_connection WHERE id='staging'
  ),
  'settings', (
    SELECT json_build_object('account', allowed_account, 'send_enabled', send_enabled)
    FROM public.garage_gmail_settings WHERE id='staging'
  ),
  'claims_untouched', json_build_object(
    'claims_gmail_connection', to_regclass('public.claims_gmail_connection') IS NOT NULL,
    'claims_docs', to_regclass('public.claims_documents') IS NOT NULL
  )
);
`);
console.log(verify);
writeFileSync(join(ROOT, 'docs', 'audit-reports', 'garage-gmail-2026-09-13', 'sql-apply-verify.json'), verify, 'utf8');
