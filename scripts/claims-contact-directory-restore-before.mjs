/**
 * Restore point BEFORE claims contact directory. Staging only. Read-only.
 * Uses worker/anon — does not require management token.
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-contact-directory-2026-09-09');
mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const env = {};
try {
  for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    env[line.slice(0, i)] = line.slice(i + 1);
  }
} catch { /* optional */ }
const anon = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
if (!anon) throw new Error('missing staging anon key');
const db = createClient(`https://${STAGING_REF}.supabase.co`, anon, { auth: { persistSession: false } });
const { data: session, error: loginErr } = await db.auth.signInWithPassword({
  email: 'qa.claims.worker.1788292403067@futurecraft.staging',
  password: 'QaWorker2026!',
});
if (loginErr || !session) throw loginErr || new Error('worker login failed');

async function probe(table, col = 'id') {
  const { count, error, data } = await db.from(table).select(col, { count: 'exact' }).limit(1);
  const missing = /schema cache|does not exist|PGRST205/i.test(error?.message || error?.code || '');
  return { count: missing ? 0 : (count ?? (data || []).length), error: error?.message || null, exists: !missing };
}

const gitHead = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
const tables = {
  claims_records: await probe('claims_records'),
  claims_history: await probe('claims_history'),
  claims_contacts: await probe('claims_contacts'),
  claims_contact_channels: await probe('claims_contact_channels'),
  claims_claim_contacts: await probe('claims_claim_contacts', 'claim_id'),
};

const { data: sample } = await db.from('claims_records').select('id, row_data').limit(8);
const sampleFields = (sample || []).map((r) => ({
  id: r.id,
  hasClientEmail: Boolean(r.row_data?.clientEmail),
  hasInsCompany: Boolean(r.row_data?.insCompany),
  hasInsEmail: Boolean(r.row_data?.insEmail),
  hasClientPhone: Boolean(r.row_data?.clientPhone),
}));

const rp = {
  at: new Date().toISOString(),
  purpose: 'restore-before-claims-contact-directory',
  stagingRef: STAGING_REF,
  productionRefUntouched: PROD_REF,
  productionTouched: false,
  gitHead,
  gitBranch: execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim(),
  tables,
  sampleExistingClaimContactFields: sampleFields,
  massMigrationOfClaimFields: false,
  note: 'Existing claims_records.row_data contact fields left untouched. New tables were absent before apply.',
  rollbackSql: 'supabase/migrations/20260909120000_claims_contact_directory_staging_rollback.sql',
  rollback: [
    'DROP TABLE IF EXISTS public.claims_claim_contacts CASCADE;',
    'DROP TABLE IF EXISTS public.claims_contact_channels CASCADE;',
    'DROP TABLE IF EXISTS public.claims_contacts CASCADE;',
    'Does not drop claims_records or mutate row_data.',
    'Does not touch Production.',
  ],
};
writeFileSync(join(OUT, 'RESTORE-POINT-BEFORE.json'), JSON.stringify(rp, null, 2));
console.log(JSON.stringify({ restore: join(OUT, 'RESTORE-POINT-BEFORE.json'), tables, productionTouched: false }, null, 2));
