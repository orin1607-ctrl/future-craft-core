/**
 * Restore Point BEFORE claims docs Phase 2 UI. Staging only. Read-only.
 * node scripts/claims-docs-phase2-restore-before.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
if (STAGING_REF === PROD_REF) throw new Error('refused: production');
const OUT = join(process.cwd(), 'docs/audit-reports/claims-docs-phase2-2026-09-02');
const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });
async function count(t) {
  const { count } = await admin.from(t).select('id', { count: 'exact', head: true });
  return count ?? 0;
}
const { data: bucket } = await admin.storage.getBucket('claims-docs');
const { data: mode } = await admin.from('claims_config').select('value').eq('key', 'MAIL_DISPATCH_MODE').maybeSingle();
const restore = {
  at: new Date().toISOString(),
  purpose: 'restore-before-claims-docs-phase2-ui',
  stagingRef: STAGING_REF,
  productionTouched: false,
  gitHead: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
  gitShort: execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim(),
  branch: execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim(),
  claims: await count('claims_records'),
  documents: await count('claims_documents'),
  requests: await count('claims_doc_requests'),
  links: await count('claims_upload_links'),
  bucket: { id: bucket?.id || null, public: bucket?.public === true },
  MAIL_DISPATCH_MODE: mode?.value || null,
  backup: 'docs/audit-reports/claims-docs-phase2-2026-09-02/restore-before/',
};
if (bucket?.public === true) throw new Error('bucket unexpectedly public');
writeFileSync(join(OUT, 'RESTORE-POINT-BEFORE.json'), JSON.stringify(restore, null, 2), 'utf8');
console.log(JSON.stringify(restore, null, 2));
