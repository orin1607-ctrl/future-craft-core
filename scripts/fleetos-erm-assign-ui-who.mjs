/**
 * STAGING read-only — who can see 36806603 / 043284 in the UI.
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const VEHICLE_ID = '295b935a-16f9-4e7a-a920-7bae92a4dc9a';
const UNIT = '043284';

const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service =
  keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key ||
  keys.find((k) => k.name === 'service_role')?.api_key;
const anon =
  keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key ||
  keys.find((k) => k.name === 'anon')?.api_key;
const url = `https://${STAGING_REF}.supabase.co`;
const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: roles } = await admin.from('user_roles').select('user_id, role').eq('role', 'super_admin');
const { data: darkayRoles } = await admin.from('user_roles').select('user_id, role').eq('user_id', 'e15e21d0-c27a-4341-81f5-cfb17073b84c');
const { data: darkayProf } = await admin.from('profiles').select('id, email, full_name, company_name, role, is_active').eq('id', 'e15e21d0-c27a-4341-81f5-cfb17073b84c');
const { data: profByEmail } = await admin.from('profiles').select('id, email, full_name, company_name, role').or('email.eq.darkay.hayim@gmail.com,email.eq.orin1607@gmail.com');

const sa = [];
for (const r of roles || []) {
  const u = await admin.auth.admin.getUserById(r.user_id);
  sa.push({ id: r.user_id, email: u.data.user?.email || null });
}

async function asUser(email) {
  const userClient = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) return { email, error: linkErr.message };
  const { data: auth, error: verifyErr } = await userClient.auth.verifyOtp({
    email,
    token: linkData.properties.email_otp,
    type: 'email',
  });
  if (verifyErr || !auth.session) return { email, error: verifyErr?.message || 'verify failed' };
  await userClient.auth.setSession(auth.session);
  const v = await userClient.from('vehicles').select('id, license_plate, company_name, manufacturer, model, year').eq('id', VEHICLE_ID).maybeSingle();
  const d = await userClient.from('gps_devices').select('unit_id, vehicle_id, company_name, enabled').eq('unit_id', UNIT);
  const count = await userClient.from('vehicles').select('id', { count: 'exact', head: true }).neq('status', 'archived');
  const ak = await userClient.from('vehicles').select('id', { count: 'exact', head: true }).eq('company_name', 'אכבים').neq('status', 'archived');
  return {
    email,
    canReadVehicle: Boolean(v.data),
    vehicle: v.data,
    devices: d.data,
    visibleActive: count.count,
    visibleAkavim: ak.count,
  };
}

const orin = sa.find((s) => s.email === 'orin1607@gmail.com') || sa[0];
const out = {
  superAdmins: sa,
  darkayRoles,
  darkayProf,
  profByEmail,
  darkayScope: await asUser('darkay.hayim@gmail.com'),
  orinScope: orin?.email ? await asUser(orin.email) : null,
};
console.log(JSON.stringify(out, null, 2));
