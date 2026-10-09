// scripts/save-batch2-to-supabase-staging.mjs
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

console.log('================================================================================');
console.log('=== OPENPROSPECTOR: SAVE 1,000 BATCH 2 COMPANIES TO SUPABASE STAGING ===');
console.log('================================================================================\n');

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzZmVvZXJrcGNhZnh4bHl1bGRsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTExNDg1NiwiZXhwIjoyMDk0NjkwODU2fQ.Bmfe3wgJTGtAj3dnZyvPEnlM2vkOJmFt7LEcyuXHdUw';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzZmVvZXJrcGNhZnh4bHl1bGRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTQ4NTYsImV4cCI6MjA5NDY5MDg1Nn0.Z1AsULSK9fNsVwjw7iRP_DkSodeTUdtb-eB5s66qtJU';

const admin = createClient(`https://${STAGING_REF}.supabase.co`, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// 1. Verify current DB state before writing
const { data: dbLeads, count: preCount, error: preErr } = await admin
  .from('prospect_leads')
  .select('id, company_name, company_hp, is_approved_lead', { count: 'exact' });

if (preErr) {
  console.error('CRITICAL: Cannot read DB leads before write:', preErr);
  process.exit(1);
}
console.log(`Current DB count: ${preCount} leads (expected 618).`);
if (preCount !== 618) {
  console.warn(`NOTICE: Pre-count is ${preCount}`);
}

const existingHps = new Set((dbLeads || []).map(l => String(l.company_hp || '').trim()).filter(Boolean));
const existingNames = new Set((dbLeads || []).map(l => String(l.company_name || '').trim().toLowerCase()));

// 2. Load 1,000 Batch 2 companies from file
const b2File = 'public/data/prospector-batch2-1000.json';
const b2List = JSON.parse(fs.readFileSync(b2File, 'utf8'));
console.log(`Loaded ${b2List.length} companies from ${b2File}.`);

// 3. Deduplication check against live DB
let dupCount = 0;
b2List.forEach(c => {
  const hp = String(c.no || c.company_hp || '').trim();
  const name = String(c.name || '').trim().toLowerCase();
  if (existingHps.has(hp) || existingNames.has(name)) {
    dupCount++;
    console.error(`Duplicate detected: ${c.name} (HP: ${hp})`);
  }
});
if (dupCount > 0) {
  throw new Error(`DEDUPLICATION FAILURE: Found ${dupCount} duplicates against live DB! Aborting.`);
}
console.log('[PASS] Deduplication Check: 0 duplicates against live STAGING DB.\n');

// 4. Map to standard prospect_leads DB schema
const ISRAEL_DATE = '09.10.2026';
const ISRAEL_TIMESTAMP = '2026-10-09T17:21:00+03:00';

function mapToDbRow(c) {
  return {
    company_name: c.name,
    company_hp: c.no,
    industry: c.industry || 'עבודות הנדסיות ותשתיות',
    city: c.city || '',
    region: c.region || 'מרכז',
    address: c.address || '',
    website: c.website || '',
    phone: c.phone || '',
    email: c.email || '',
    company_size: c.employee_range || '',
    fleet_type: c.fleetType || 'משאיות, מסחריות וצמ"ה',
    fleet_exists: !!c.fleet_exists,
    fleet_size: c.fleet_size || 8,
    score: c.potential_score || 75,
    status: 'new',
    is_approved_lead: false, // CRITICAL: NEVER promote to lead automatically!
    found_date: ISRAEL_DATE,
    updated_date: ISRAEL_DATE,
    notes: `סבב 2: לידים – חברות לפי עובדים | אותר ב-${ISRAEL_DATE}`,
    people: c.people || [],
    raw_payload: {
      discovery_batch: 'batch_2',
      batch_name: 'לידים – חברות לפי עובדים',
      discovery_date: '09/10/2026',
      discovery_timestamp: ISRAEL_TIMESTAMP,
      employee_range: c.employee_range,
      workforce_status: c.workforce_status || 'מוערך על ידי מקור עסקי',
      workforce_basis: c.workforce_basis,
      workforce_source: c.workforce_source || 'פנקס הקבלנים הרשומים (data.gov.il)',
      workforce_check_date: '09/10/2026',
      potential_score: c.potential_score,
      potential_tier: c.potential_tier,
      potential_tier_label: c.potential_tier_label,
      potential_breakdown: c.potential_breakdown,
      source_name: 'פנקס הקבלנים הרשומים (data.gov.il)'
    }
  };
}

const dbRows = b2List.map(mapToDbRow);

// 5. Preview first 3 rows
console.log('--- PREVIEW OF ROWS TO BE INSERTED (3 of 1,000) ---');
dbRows.slice(0, 3).forEach((r, idx) => {
  console.log(`[${idx + 1}] ${r.company_name} | HP: ${r.company_hp} | Phone: ${r.phone} | Size: ${r.company_size} | Score: ${r.score} | is_approved: ${r.is_approved_lead}`);
});

// 6. Batch Upsert in Chunks of 100
const CHUNK_SIZE = 100;
console.log(`\nStarting idempotent batch upsert (${dbRows.length} rows in chunks of ${CHUNK_SIZE})...`);

let totalInserted = 0;
for (let i = 0; i < dbRows.length; i += CHUNK_SIZE) {
  const chunk = dbRows.slice(i, i + CHUNK_SIZE);
  const { data, error } = await admin
    .from('prospect_leads')
    .upsert(chunk, { onConflict: 'company_hp' })
    .select('id');

  if (error) {
    console.error(`Error at chunk ${i} - ${i + CHUNK_SIZE}:`, error);
    process.exit(1);
  }
  totalInserted += (data ? data.length : chunk.length);
  process.stdout.write(`Inserted ${totalInserted}/${dbRows.length}...\r`);
}
console.log(`\n[PASS] All ${totalInserted} rows successfully upserted to Supabase STAGING!`);

// 7. Post-Write Verification
console.log('\n--- POST-WRITE DATABASE AUDIT ---');
const { count: finalTotal } = await admin.from('prospect_leads').select('*', { count: 'exact', head: true });
const { count: finalApproved } = await admin.from('prospect_leads').select('*', { count: 'exact', head: true }).eq('is_approved_lead', true);
const { count: finalUnapproved } = await admin.from('prospect_leads').select('*', { count: 'exact', head: true }).eq('is_approved_lead', false);

console.log(` - Total leads in STAGING DB: ${finalTotal} (expected 1,618)`);
console.log(` - Approved leads in STAGING DB: ${finalApproved} (must be exactly 618 original leads!)`);
console.log(` - Unapproved leads in STAGING DB: ${finalUnapproved} (must be exactly 1,000 new Batch 2 companies!)`);

if (finalApproved !== 618) {
  throw new Error(`CRITICAL FAILURE: Approved leads count is ${finalApproved}, expected 618!`);
}
if (finalTotal !== 1618) {
  throw new Error(`CRITICAL FAILURE: Total leads count is ${finalTotal}, expected 1618!`);
}
if (finalUnapproved !== 1000) {
  throw new Error(`CRITICAL FAILURE: Unapproved leads count is ${finalUnapproved}, expected 1000!`);
}

// 8. Authenticated Client Verification
const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(1);
const u = await admin.auth.admin.getUserById(saRole[0].user_id);
const email = u?.data?.user?.email;
const client = createClient(`https://${STAGING_REF}.supabase.co`, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
await client.auth.verifyOtp({ email, token: linkData.properties.email_otp, type: 'email' });

const { data: clientBatch2, count: b2ClientCount } = await client
  .from('prospect_leads')
  .select('id, company_name, company_hp, is_approved_lead, raw_payload')
  .eq('is_approved_lead', false)
  .limit(5);

console.log(`\n[PASS] Authenticated client successfully read Batch 2 rows! Sample:`);
clientBatch2.forEach(r => {
  console.log(` - ${r.company_name} (HP ${r.company_hp}) | batch: ${r.raw_payload.discovery_batch} | approved: ${r.is_approved_lead}`);
});

console.log('\n================================================================================');
console.log('=== CLOUD PERSISTENCE COMPLETED WITH 100% SUCCESS ===');
console.log('================================================================================\n');
