/**
 * Restore Point for claims treatment-ops. Staging only. Read-only.
 * node scripts/claims-treatment-ops-restore.mjs [before|after]
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const which = process.argv[2] === 'after' ? 'AFTER' : 'BEFORE';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-treatment-ops-2026-09-01');
mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });
const gitHead = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
const gitShort = execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim();
const count = async (table, eq) => {
  let q = admin.from(table).select('id', { count: 'exact', head: true });
  if (eq) q = q.eq(eq[0], eq[1]);
  return (await q).count;
};
const veh = await count('vehicles');
const acc = await count('accidents');
const claims = await count('claims_records');
const docs = await count('claims_documents');
const hist = await count('claims_history');
const rems = await count('claims_reminders');
const tasks = await count('claims_tasks');
const { data: bucket } = await admin.storage.getBucket('claims-docs');
const restore = {
  at: new Date().toISOString(),
  purpose: `restore-${which.toLowerCase()}-claims-treatment-ops`,
  stagingRef: STAGING_REF,
  productionTouched: false,
  gitHead,
  gitShort,
  vehicles: veh,
  accidents: acc,
  claims,
  docs,
  history: hist,
  reminders: rems,
  tasks,
  bucketPublic: bucket?.public === true,
  deployed_ref: `${gitShort} feat/incident-alerts-staging`,
};
writeFileSync(join(OUT, `RESTORE-POINT-${which}.json`), JSON.stringify(restore, null, 2), 'utf8');
console.log(JSON.stringify(restore, null, 2));
if (veh !== 437 || acc !== 11) process.exit(1);
if (bucket?.public === true) process.exit(1);
