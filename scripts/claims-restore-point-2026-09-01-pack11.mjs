/**
 * Restore point before Claims 11-task pack (staging only).
 * node scripts/claims-restore-point-2026-09-01-pack11.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const OUT = join(process.cwd(), 'docs/audit-reports/claims-pack11-2026-09-01');
mkdirSync(OUT, { recursive: true });

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

async function count(table) {
  const { count } = await admin.from(table).select('id', { count: 'exact', head: true });
  return count;
}

const gitHead = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
const gitShort = execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim();
const { data: claims } = await admin.from('claims_records').select('id').order('id');
const { data: bucket } = await admin.storage.getBucket('claims-docs');
const ids = (claims || []).map((c) => c.id);
const rp = {
  at: new Date().toISOString(),
  purpose: 'restore-before-claims-pack11',
  stagingRef: STAGING_REF,
  productionTouched: false,
  gitHead,
  gitShort,
  vehicles: await count('vehicles'),
  accidents: await count('accidents'),
  claims: ids.length,
  claimIds: ids,
  docs: await count('claims_documents'),
  imports: await count('claims_gmail_imports'),
  notifications: await count('claims_notifications'),
  pending: await count('claims_gmail_pending'),
  bucketPublic: bucket?.public === true,
  mutated: false,
};
writeFileSync(join(OUT, 'RESTORE-POINT-BEFORE.json'), JSON.stringify(rp, null, 2), 'utf8');
console.log(JSON.stringify(rp, null, 2));
