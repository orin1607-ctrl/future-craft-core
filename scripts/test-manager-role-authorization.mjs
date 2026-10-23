import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy').api_key;
const serviceKey = keys.find((k) => k.name === 'service_role' && k.type === 'legacy').api_key;

const admin = createClient(STAGING_URL, serviceKey);
const anonClient = createClient(STAGING_URL, anonKey);

async function runRoleAuthorizationAudit() {
  console.log('=== TEST: Strict Server-Side Manager Role Check for Closure Override ===\n');

  const runId = Date.now().toString(36);

  // 1. Create a regular garage user (fleet_manager role)
  const regularEmail = `fleetmgr-${runId}@staging.oren.local`;
  const pass = `Pass!${runId}QA`;
  const { data: regUser, error: regErr } = await admin.auth.admin.createUser({
    email: regularEmail,
    password: pass,
    email_confirm: true,
  });
  if (regErr) throw new Error('Regular user creation failed: ' + regErr.message);
  const regUserId = regUser.user.id;

  await admin.from('profiles').upsert({
    id: regUserId,
    full_name: 'נציג מוסך רגיל',
    company_name: 'מוסך יוני – פחחות וצבע לרכב',
    is_active: true,
    approval_status: 'approved',
  });
  await admin.from('user_roles').delete().eq('user_id', regUserId);
  await admin.from('user_roles').insert({ user_id: regUserId, role: 'fleet_manager' });
  await admin.from('claims_access').upsert({ user_id: regUserId, granted_by: regUserId });

  // 2. Create a manager user (super_admin role)
  const mgrEmail = `mgr-${runId}@staging.oren.local`;
  const { data: mgrUser, error: mgrErr } = await admin.auth.admin.createUser({
    email: mgrEmail,
    password: pass,
    email_confirm: true,
  });
  if (mgrErr) throw new Error('Mgr user creation failed: ' + mgrErr.message);
  const mgrUserId = mgrUser.user.id;

  await admin.from('profiles').upsert({
    id: mgrUserId,
    full_name: 'מנהל מוסך בדיקה',
    company_name: 'מוסך יוני – פחחות וצבע לרכב',
    is_active: true,
    approval_status: 'approved',
  });
  await admin.from('user_roles').delete().eq('user_id', mgrUserId);
  await admin.from('user_roles').insert({ user_id: mgrUserId, role: 'super_admin' });
  await admin.from('claims_access').upsert({ user_id: mgrUserId, granted_by: mgrUserId });

  // Sign in both
  const { data: regSession } = await anonClient.auth.signInWithPassword({ email: regularEmail, password: pass });
  const regJwt = regSession.session.access_token;

  const { data: mgrSession } = await anonClient.auth.signInWithPassword({ email: mgrEmail, password: pass });
  const mgrJwt = mgrSession.session.access_token;

  // 3. Create test customer, vehicle and case with open gaps
  const testCustomer = `לקוח בדיקת הרשאות ${runId}`;
  const testPlate = `33${Math.floor(100000 + Math.random() * 899999)}`;
  const { data: cust } = await admin.from('garage_customers').insert({ name: testCustomer, phone: '050-0000000' }).select('id').single();
  const { data: veh } = await admin.from('garage_vehicles').insert({ customer_id: cust.id, plate: testPlate }).select('id').single();

  const { data: testCase } = await admin.from('garage_cases').insert({
    case_number: `GM-ROLE-${runId.toUpperCase()}`,
    customer_id: cust.id,
    vehicle_id: veh.id,
    vehicle_plate_snapshot: testPlate,
    customer_name_snapshot: testCustomer,
    status: 'בעבודה',
    opened_by: regUserId,
    shop_company_name: 'מוסך אורן',
    case_data: {
      quoteWorks: [
        { id: 'w1', name: 'עבודה ללא מחיר', price: 0 } // gap!
      ]
    }
  }).select('id, case_number').single();

  console.log(`[PASS] Created test case: ${testCase.case_number} with open gaps.`);

  // 4. Test regular user attempting force_override: true (MUST BE REJECTED)
  console.log('\n--- Step 4: Regular user attempts force_override (Expect 400 REJECT) ---');
  const regCloseRes = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${regJwt}`,
      apikey: anonKey,
    },
    body: JSON.stringify({
      action: 'execute_pending_action',
      pending_action: {
        action_type: 'garage_close_case',
        tool_name: 'garage_close_case',
        parameters: {
          case_id: testCase.id,
          closure_notes: 'ניסיון עקיפת מנהל ממשתמש רגיל',
          force_override: true,
          override_reason: 'ניסיון לא מורשה של נהג לסגור תיק',
        }
      },
      module: 'garage',
      actorName: 'נציג מוסך רגיל',
      garage_case_id: testCase.id,
    }),
  });

  const regCloseData = await regCloseRes.json();
  console.log('Regular staff close response:', JSON.stringify(regCloseData, null, 2));

  if (regCloseData.success === true) {
    throw new Error('SECURITY VIOLATION: Non-super-admin user was allowed to force_override case closure!');
  }
  if (!regCloseData.error?.includes('super_admin')) {
    throw new Error('Expected super_admin authorization error message, got: ' + JSON.stringify(regCloseData));
  }
  console.log('[PASS] Fleet manager was BLOCKED from force_override: ' + regCloseData.error);

  // 5. Test manager user attempting force_override: true (MUST BE ACCEPTED)
  console.log('\n--- Step 5: Manager user attempts force_override (Expect 200 SUCCESS) ---');
  const mgrCloseRes = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${mgrJwt}`,
      apikey: anonKey,
    },
    body: JSON.stringify({
      action: 'execute_pending_action',
      pending_action: {
        action_type: 'garage_close_case',
        tool_name: 'garage_close_case',
        parameters: {
          case_id: testCase.id,
          closure_notes: 'סגירה מאושרת על ידי מנהל מוסך מוסמך',
          force_override: true,
          override_reason: 'אישור מנהל מוסך — התיק נבדק ואושר לסגירה חריגה',
        }
      },
      module: 'garage',
      actorName: 'מנהל מוסך בדיקה',
      garage_case_id: testCase.id,
    }),
  });

  const mgrCloseData = await mgrCloseRes.json();
  console.log('Manager close response:', JSON.stringify(mgrCloseData, null, 2));

  if (!mgrCloseData.success) {
    throw new Error('Manager force_override failed: ' + JSON.stringify(mgrCloseData));
  }
  console.log('[PASS] Manager force_override SUCCEEDED with documented reason.');

  // Verify status in DB
  const { data: dbCase } = await admin.from('garage_cases').select('status, case_data').eq('id', testCase.id).single();
  if (dbCase.status !== 'תיק סגור') throw new Error('DB status was not updated to "תיק סגור"');
  if (!dbCase.case_data.closureOverride?.approved_by) {
    throw new Error('closureOverride.approved_by missing: ' + JSON.stringify(dbCase.case_data.closureOverride));
  }
  console.log('[PASS] DB audit verified: case status is "תיק סגור", closureOverride recorded correctly:', JSON.stringify(dbCase.case_data.closureOverride));

  // Cleanup test users
  await admin.from('user_roles').delete().in('user_id', [regUserId, mgrUserId]);
  await admin.auth.admin.deleteUser(regUserId);
  await admin.auth.admin.deleteUser(mgrUserId);
  console.log('[PASS] Test users cleaned up successfully.');

  console.log('\n=== MANAGER ROLE AUTHORIZATION TEST PASSED WITH 100% SUCCESS ===');
}

runRoleAuthorizationAudit().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
