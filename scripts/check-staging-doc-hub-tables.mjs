import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';

const STAGING = 'usfeoerkpcafxxlyuldl';
const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const db = createClient(`https://${STAGING}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });

const tables = ['document_type_defs', 'document_versions', 'document_requests'];
const out = { staging: STAGING, at: new Date().toISOString(), tables: {} };

for (const t of tables) {
  const { data, error } = await db.from(t).select('*').limit(1);
  out.tables[t] = { exists: !error, error: error?.message || null, sampleCount: data?.length ?? 0 };
}

const { data: types } = await db.from('document_type_defs').select('key,label_he,requires_expiry').order('sort_order');
out.typeKeys = (types || []).map((r) => r.key);
out.hasTrafficInfo = out.typeKeys?.includes('traffic_info');
out.hasTrafficTicket = out.typeKeys?.includes('traffic_ticket');

console.log(JSON.stringify(out, null, 2));
