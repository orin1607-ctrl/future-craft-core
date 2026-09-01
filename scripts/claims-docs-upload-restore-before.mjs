/**
 * Restore point BEFORE staff-upload-in-docs pack. Staging only. Read-only.
 * node scripts/claims-docs-upload-restore-before.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-docs-upload-2026-09-01');
mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });
const gitHead = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
const gitShort = execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim();
const veh = (await admin.from('vehicles').select('id', { count: 'exact', head: true })).count;
const acc = (await admin.from('accidents').select('id', { count: 'exact', head: true })).count;
const claims = (await admin.from('claims_records').select('id', { count: 'exact', head: true })).count;
const docs = (await admin.from('claims_documents').select('id', { count: 'exact', head: true })).count;
const { data: bucket } = await admin.storage.getBucket('claims-docs');
const restore = {
  at: new Date().toISOString(),
  purpose: 'restore-before-claims-docs-staff-upload',
  stagingRef: STAGING_REF,
  productionTouched: false,
  gitHead,
  gitShort,
  vehicles: veh,
  accidents: acc,
  claims,
  docs,
  bucketPublic: bucket?.public === true,
  deployed_ref: `${gitShort} feat/incident-alerts-staging`,
};
writeFileSync(join(OUT, 'RESTORE-POINT-BEFORE.json'), JSON.stringify(restore, null, 2), 'utf8');
console.log(JSON.stringify(restore, null, 2));
if (veh !== 437 || acc !== 11 || bucket?.public === true) process.exit(1);
