/**
 * Compare local migration files vs remote supabase_migrations.schema_migrations
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { readdirSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const OUT = join(process.cwd(), 'docs', 'audit-reports');
mkdirSync(OUT, { recursive: true });

const keys = JSON.parse(
  execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }),
);
const service = keys.find((k) => k.name === 'service_role' && k.type === 'legacy').api_key;
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

const localFiles = readdirSync(join(process.cwd(), 'supabase', 'migrations'))
  .filter((f) => f.endsWith('.sql'))
  .map((f) => f.replace(/\.sql$/, ''))
  .sort();

const { data: remoteRows, error } = await admin
  .schema('supabase_migrations')
  .from('schema_migrations')
  .select('version, name')
  .order('version', { ascending: true });

const remoteVersions = (remoteRows || []).map((r) => r.version);
const stagingOnly = ['20260609120000_user_management_staging', '20260610120000_auth_otp_staging'];
const missingOnRemote = stagingOnly.filter((v) => !remoteVersions.some((rv) => rv.startsWith(v.split('_')[0])));
const inRemoteNotLocal = remoteVersions.filter((v) => !localFiles.some((lf) => lf.startsWith(String(v))));

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  local_count: localFiles.length,
  remote_count: remoteVersions.length,
  query_error: error?.message ?? null,
  staging_migrations_missing_on_remote: missingOnRemote,
  latest_local: localFiles.slice(-5),
  latest_remote: remoteVersions.slice(-5),
  note: 'Schema for UM/Auth applied manually; migration history may not reflect live DDL',
};

writeFileSync(join(OUT, 'migration-history-audit.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(missingOnRemote.length > 0 ? 1 : 0);
