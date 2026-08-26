/**
 * Staging leftover check after continue-treatment E2E. Does not mutate production.
 * node scripts/telemarketing-continue-treatment-leftover-check.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const TAIR_ID = 'cfadfd61-476b-4b19-83c8-19b62b7bb99e';
const MARKER = 'qa-continue-e2e';

const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
const keys = JSON.parse(raw);
const service = keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'service_role')?.api_key;
const adminDb = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

const { count: dirCount } = await adminDb.from('telemarketing_lead_directory').select('id', { count: 'exact', head: true });
const { data: tair } = await adminDb.from('profiles').select('id, full_name').eq('id', TAIR_ID).single();
const { data: tairAuth } = await adminDb.auth.admin.getUserById(TAIR_ID);
const { data: leftoverCalls } = await adminDb.from('telemarketing_calls').select('id, result, summary').or(`summary.ilike.%${MARKER}%,result.eq.qa-continue-cleanup`);
const { data: leftoverFu } = await adminDb.from('telemarketing_followups').select('id, status, company_name, action_needed').ilike('action_needed', '%המשך טיפול — אין מענה%').eq('company_name', 'מערכות אשד');
const { data: ashdDir } = await adminDb.from('telemarketing_lead_directory').select('lead_number, company_name, claimed_by, assigned_to').eq('lead_number', 1).maybeSingle();
const { data: numbers } = await adminDb.from('telemarketing_lead_directory').select('lead_number').order('lead_number');

const out = {
  stagingRef: STAGING_REF,
  productionTouched: false,
  dirCount,
  still29: dirCount === 29,
  tairOk: tair?.full_name === 'תאיר' && tairAuth?.user?.email === 'tairmizrahi311@gmail.com',
  leftoverQaCalls: leftoverCalls?.length || 0,
  leftoverAshdContinueFu: leftoverFu || [],
  lead1: ashdDir,
  leadNumbers: (numbers || []).map((r) => r.lead_number),
};
console.log(JSON.stringify(out, null, 2));
if (!out.still29 || !out.tairOk || out.leftoverQaCalls !== 0) process.exit(2);
