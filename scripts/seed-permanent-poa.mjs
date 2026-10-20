import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import fs from 'fs';
import crypto from 'crypto';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const serviceRoleKey = keys.find((k) => k.name === 'service_role')?.api_key;
const admin = createClient(STAGING_URL, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const filePath = 'public/templates/dani-poa-nov23.pdf';
  const fileBytes = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(fileBytes).digest('hex');
  const storagePath = 'templates/power_of_attorney/dani-poa-nov23.pdf';

  console.log('Uploading authentic POA PDF to storage:', storagePath, 'size:', fileBytes.length, 'sha256:', hash);

  const { error: upErr } = await admin.storage.from('claims-docs').upload(storagePath, fileBytes, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (upErr) throw upErr;
  console.log('Upload successful!');

  const templateRecord = {
    id: 'TPL-GLOBAL-POA-NOV23',
    name: 'ייפוי כוח',
    category: 'cat_b',
    form_key: 'power_of_attorney',
    storage_path: storagePath,
    original_name: 'דני-ייפוי כוח מעודכן-נובמבר 23.pdf',
    mime_type: 'application/pdf',
    byte_size: fileBytes.length,
    content_sha256: hash,
    is_permanent: true,
  };

  const { data, error: insErr } = await admin.from('claims_templates').upsert(templateRecord);
  if (insErr) throw insErr;
  console.log('Upserted into claims_templates:', templateRecord);

  const { data: verify, error: vErr } = await admin.from('claims_templates').select('*');
  console.log('Verified claims_templates rows in DB:', verify);
}

main().catch(console.error);
