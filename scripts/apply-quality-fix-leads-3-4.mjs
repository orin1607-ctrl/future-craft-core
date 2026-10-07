import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;

async function applyQualityFix() {
  console.log('[FIX] Fetching API keys for Staging Supabase...');
  const keys = JSON.parse(
    execSync(`npx supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' })
  );
  const service = keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'service_role')?.api_key;
  if (!service) throw new Error('Missing service_role key');

  const supabase = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

  // 1. Update Lead 3: שניאור הובלה ושינוע בע"מ (516097466)
  console.log('\n[FIX] Updating Lead 3: שניאור הובלה ושינוע בע"מ (516097466)...');
  const { data: lead3Current } = await supabase
    .from('prospect_leads')
    .select('*')
    .eq('company_hp', '516097466')
    .single();

  const currentEv3 = Array.isArray(lead3Current.evidence) ? [...lead3Current.evidence] : [];
  const insolvencyEvidence = {
    field: 'legal_status',
    value: '⚠️ אינדיקציה לחדלות פירעון – דורש אימות ממקור רשמי',
    source: 'אתר משרד עו"ד מתן אלקיים (emlaw.co.il)',
    url: 'https://emlaw.co.il/חברות-בהליך-חדלות-פירעון/',
    status: 'found', // PARTIAL / NEEDS OFFICIAL VERIFICATION (NEVER 'verified')
    found_at: '2026-10-07',
  };
  // Replace or add
  const filteredEv3 = currentEv3.filter((e) => !(typeof e === 'object' && !Array.isArray(e) && e.field === 'legal_status'));
  filteredEv3.push(insolvencyEvidence);

  const lead3Patch = {
    notes: '⚠️ אינדיקציה לחדלות פירעון – דורש אימות ממקור רשמי (אתר עו"ד מתן אלקיים). צי משאיות מעל 15 טון רשום.',
    evidence: filteredEv3,
    ready_for_contact: false,
    updated_date: '07.10.2026',
  };

  const { error: err3 } = await supabase
    .from('prospect_leads')
    .update(lead3Patch)
    .eq('company_hp', '516097466');
  if (err3) throw new Error('Failed to update Lead 3: ' + err3.message);
  console.log('  -> Lead 3 updated in Supabase successfully.');

  // 2. Update Lead 4: שפע היסעים כחול לבן בע"מ (516801214)
  console.log('\n[FIX] Updating Lead 4: שפע היסעים כחול לבן בע"מ (516801214)...');
  const { data: lead4Current } = await supabase
    .from('prospect_leads')
    .select('*')
    .eq('company_hp', '516801214')
    .single();

  const currentEv4 = Array.isArray(lead4Current.evidence) ? [...lead4Current.evidence] : [];
  // Filter out the unverified Ilan Sharabi safety officer evidence
  const filteredEv4 = currentEv4.filter((e) => {
    if (Array.isArray(e) && e[1] && String(e[1]).includes('קצב"ת מוסמך')) return false;
    if (typeof e === 'object' && !Array.isArray(e) && e.field === 'safety_officer_name') return false;
    return true;
  });

  // Add evidence for phone invalidation & fleet activity
  filteredEv4.push({
    field: 'phone',
    value: '03-934-8822 (שגוי – שייך לחנות חיות ZooCity Lev)',
    source: 'בדיקת אימות ידנית (ZooCity Lev / zcl.co.il)',
    url: 'https://zcl.co.il',
    status: 'not_found',
    found_at: '2026-10-07',
  });
  filteredEv4.push({
    field: 'fleet_exists',
    value: true,
    source: 'Jobify360 (מודעות גיוס נהגי מיניבוס בנתב"ג)',
    url: 'https://jobify360.co.il',
    status: 'verified',
    found_at: '2026-10-07',
  });

  const lead4Patch = {
    phone: '',
    safety_officer_name: null,
    safety_officer_source: null,
    safety_officer_verified: false,
    safety_officer: {
      name: 'טרם אותר קצב"ת מאומת',
      role: 'חובת פיקוח לפי תקנה 579',
      status: 'e',
      mandate579: true,
      note: 'הקישור לאילן שרעבי לא אומת במקור רשמי (השערה בלבד)',
      source: 'מאגר ציי אוטובוסים משרד התחבורה',
      tier: 'A',
    },
    people: [],
    multi_phones: [
      {
        val: '03-934-8822 (שגוי – שייך לחנות חיות ZooCity Lev)',
        source: 'בדיקת אימות ידנית',
        tier: 'C',
        status: 'invalid',
      },
    ],
    notes: 'פעילות צי היסעים ומיניבוסים מאומתת (Jobify360 + משרד התחבורה). טלפון 03-934-8822 שגוי (חנות חיות ZooCity Lev). קצב"ת טרם אותר.',
    evidence: filteredEv4,
    ready_for_contact: false,
    updated_date: '07.10.2026',
  };

  const { error: err4 } = await supabase
    .from('prospect_leads')
    .update(lead4Patch)
    .eq('company_hp', '516801214');
  if (err4) throw new Error('Failed to update Lead 4: ' + err4.message);
  console.log('  -> Lead 4 updated in Supabase successfully.');

  // 3. Update public/data/prospector-real-leads-618.json
  console.log('\n[FIX] Updating public/data/prospector-real-leads-618.json...');
  const jsonPath = path.resolve('public/data/prospector-real-leads-618.json');
  const leads = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  const idx3 = leads.findIndex((l) => l.no === '516097466');
  if (idx3 >= 0) {
    leads[idx3].notes = lead3Patch.notes;
    leads[idx3].upd = '07.10.2026';
    leads[idx3].ev = filteredEv3;
  }

  const idx4 = leads.findIndex((l) => l.no === '516801214');
  if (idx4 >= 0) {
    leads[idx4].phone = '';
    leads[idx4].multiPhones = lead4Patch.multi_phones;
    leads[idx4].safetyOfficer = lead4Patch.safety_officer;
    leads[idx4].people = [];
    leads[idx4].notes = lead4Patch.notes;
    leads[idx4].upd = '07.10.2026';
    leads[idx4].ev = filteredEv4;
    leads[idx4].facts = { ...leads[idx4].facts, phone: 'n' };
  }

  fs.writeFileSync(jsonPath, JSON.stringify(leads, null, 2), 'utf8');
  console.log('  -> JSON file updated successfully.');

  console.log('\n[SUCCESS] Quality fix applied to both leads in Supabase and JSON!');
}

applyQualityFix().catch((e) => {
  console.error('[FATAL]', e);
  process.exit(1);
});
