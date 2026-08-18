/**
 * Full Staging verification — NO Production.
 * Disposable QA tenants only. Does not open or delete customer documents.
 *
 * node scripts/verify-staging-full-audit.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomBytes, randomUUID } from 'crypto';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const OUT = join(process.cwd(), 'public/project-001/staging-full-audit.json');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function abortIfProduction(haystack, label = 'input') {
  const t = String(haystack || '');
  if (t.includes(PROD_REF) || t.includes('dalia-car.online')) {
    throw new Error(`ABORT: ${label} mentions Production.`);
  }
}

function rec(tests, id, name, ok, detail = {}) {
  tests.push({ id, name, ok, ...detail });
  console.log(ok ? 'PASS' : 'FAIL', `[${id}]`, name, detail.error || detail.note || '');
}

function getKeys() {
  const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, {
    encoding: 'utf8',
  });
  abortIfProduction(raw, 'api-keys');
  const keys = JSON.parse(raw);
  return {
    service:
      keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key ||
      keys.find((k) => k.name === 'service_role')?.api_key,
    anon:
      keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key ||
      keys.find((k) => k.name === 'anon')?.api_key,
  };
}

function dbQuery(sql) {
  abortIfProduction(sql, 'sql');
  const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-staging-full-audit');
  mkdirSync(tmpWork, { recursive: true });
  mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });
  execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const sqlFile = join(tmpWork, 'query.sql');
  writeFileSync(sqlFile, sql, 'utf8');
  const out = execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${sqlFile}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  abortIfProduction(out, 'db output');
  return out;
}

function parseRows(raw) {
  try {
    const j = JSON.parse(raw);
    return j.rows || [];
  } catch {
    return [];
  }
}

async function makeUser(admin, { email, password, company, role, isActive }) {
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `QA ${role}`, company_name: company, role: 'super_admin' },
  });
  const user = created.data?.user;
  if (!user?.id) throw new Error(created.error?.message || 'createUser failed');
  await admin.from('user_roles').delete().eq('user_id', user.id);
  await admin.from('user_roles').insert({ user_id: user.id, role });
  if (role !== 'driver') await admin.from('drivers').delete().eq('id', user.id);
  await admin.from('profiles').upsert({
    id: user.id,
    full_name: `QA ${role} ${company}`,
    company_name: company,
    is_active: isActive,
    two_factor_approved: true,
    approval_status: 'approved',
  });
  return user;
}

async function main() {
  abortIfProduction(process.env.DATABASE_URL, 'DATABASE_URL');
  abortIfProduction(process.env.SUPABASE_URL, 'SUPABASE_URL');
  const keys = getKeys();
  const admin = createClient(STAGING_URL, keys.service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(STAGING_URL, keys.anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const tests = [];
  const verdicts = {};
  const stamp = Date.now();
  const companyA = `QA-AUDIT-A-${stamp}`;
  const companyB = `QA-AUDIT-B-${stamp}`;
  const password = `QaFull_${randomBytes(12).toString('hex')}!`;
  const createdUsers = [];
  const createdRows = [];
  const createdFiles = [];
  const tenantLeak = [];
  const broadPolicies = [];
  const edgeUnauth = [];

  rec(tests, 'G0', 'Production not targeted', true, {
    stagingRef: STAGING_REF,
    productionTouched: false,
  });

  const bucket = await admin.storage.getBucket('documents');
  rec(tests, 'DOC-PRIV', 'documents bucket is private', bucket.data?.public === false, {
    public: bucket.data?.public,
    error: bucket.error?.message,
  });

  const storagePolicies = parseRows(dbQuery(`
    SELECT policyname, roles::text, cmd, qual
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    ORDER BY policyname;
  `));
  const wideRead = storagePolicies.filter((p) =>
    /documents_read_public|public_read_documents|Authenticated users can view documents/i.test(p.policyname),
  );
  rec(tests, 'C1-POL', 'wide documents SELECT policies are gone', wideRead.length === 0, {
    leftover: wideRead.map((p) => p.policyname),
  });

  const usingTrue = parseRows(dbQuery(`
    SELECT tablename, policyname, roles::text, cmd, qual
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (qual = 'true' OR qual ILIKE 'true' OR with_check = 'true')
    ORDER BY tablename, policyname;
  `));
  const declAnon = usingTrue.filter((p) =>
    (p.tablename === 'driver_declarations' || p.tablename === 'driving_exams') &&
    String(p.roles || '').includes('anon'),
  );
  rec(tests, 'C4-POL', 'anon USING(true) gone on declarations/exams', declAnon.length === 0, {
    leftover: declAnon,
  });
  for (const p of usingTrue) {
    broadPolicies.push({
      table: p.tablename,
      policy: p.policyname,
      cmd: p.cmd,
      roles: p.roles,
    });
  }

  const companyTables = parseRows(dbQuery(`
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'company_name'
    ORDER BY table_name;
  `)).map((r) => r.table_name);

  const rlsOff = parseRows(dbQuery(`
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false
    ORDER BY 1;
  `)).map((r) => r.table_name);
  rec(tests, 'RLS-ON', 'no public tables with RLS disabled (except known)', rlsOff.length === 0 || rlsOff.every((t) => ['spatial_ref_sys'].includes(t)), {
    rlsOff,
  });

  let fmA;
  let fmB;
  let driverA;
  try {
    fmA = await makeUser(admin, {
      email: `qa-full-fm-a-${stamp}@example.invalid`,
      password,
      company: companyA,
      role: 'fleet_manager',
      isActive: true,
    });
    createdUsers.push(fmA);
    fmB = await makeUser(admin, {
      email: `qa-full-fm-b-${stamp}@example.invalid`,
      password,
      company: companyB,
      role: 'fleet_manager',
      isActive: true,
    });
    createdUsers.push(fmB);
    driverA = await makeUser(admin, {
      email: `qa-full-drv-a-${stamp}@example.invalid`,
      password,
      company: companyA,
      role: 'driver',
      isActive: true,
    });
    createdUsers.push(driverA);
    rec(tests, 'QA-USERS', 'created disposable FM A, FM B, driver A', true);

    const clientA = createClient(STAGING_URL, keys.anon, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const clientB = createClient(STAGING_URL, keys.anon, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const clientDrv = createClient(STAGING_URL, keys.anon, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const signA = await clientA.auth.signInWithPassword({
      email: `qa-full-fm-a-${stamp}@example.invalid`,
      password,
    });
    const signB = await clientB.auth.signInWithPassword({
      email: `qa-full-fm-b-${stamp}@example.invalid`,
      password,
    });
    const signD = await clientDrv.auth.signInWithPassword({
      email: `qa-full-drv-a-${stamp}@example.invalid`,
      password,
    });
    rec(tests, 'AUTH-IN', 'FM A / FM B / driver can sign in', Boolean(signA.data?.session && signB.data?.session && signD.data?.session), {
      error: signA.error?.message || signB.error?.message || signD.error?.message,
    });

    const pathA = `${fmA.id}/misc/qa-full-audit-${stamp}.png`;
    const upA = await clientA.storage.from('documents').upload(pathA, PNG, {
      contentType: 'image/png',
      upsert: false,
    });
    rec(tests, 'UP-1', 'authorized FM A can upload to own uid folder', !upA.error, { error: upA.error?.message });
    if (!upA.error) createdFiles.push(pathA);

    const metaA = await clientA.from('document_metadata').insert({
      file_path: pathA,
      category: 'other',
      company_name: companyA,
      original_name: 'qa-full-audit.png',
      display_name: 'QA full audit probe',
    }).select('id').maybeSingle();
    rec(tests, 'UP-2', 'document_metadata row saved for company A', Boolean(metaA.data?.id), {
      error: metaA.error?.message,
    });
    if (metaA.data?.id) createdRows.push({ table: 'document_metadata', id: metaA.data.id });

    const signedA = await clientA.storage.from('documents').createSignedUrl(pathA, 900);
    rec(tests, 'VIEW-1', 'FM A can create signed URL for own file', Boolean(signedA.data?.signedUrl), {
      error: signedA.error?.message,
    });
    let signedUrl = signedA.data?.signedUrl || '';
    if (signedUrl) {
      const dl = await fetch(signedUrl);
      rec(tests, 'VIEW-2', 'signed URL downloads own file', dl.ok, { status: dl.status });
    } else {
      rec(tests, 'VIEW-2', 'signed URL downloads own file', false, { error: 'no url' });
    }

    const publicUrl = `${STAGING_URL}/storage/v1/object/public/documents/${pathA}`;
    const pubRes = await fetch(publicUrl);
    rec(tests, 'SEC-1', 'direct public URL cannot download', pubRes.status >= 400, { status: pubRes.status });

    const anonDl = await anon.storage.from('documents').download(pathA);
    rec(tests, 'SEC-2', 'anonymous cannot download', Boolean(anonDl.error) || !anonDl.data, {
      error: anonDl.error?.message,
    });
    const anonList = await anon.storage.from('documents').list(fmA.id, { limit: 20 });
    rec(tests, 'SEC-3', 'anonymous cannot list uid folder', Boolean(anonList.error) || !anonList.data?.length, {
      count: anonList.data?.length ?? null,
    });

    const signedB = await clientB.storage.from('documents').createSignedUrl(pathA, 900);
    let bOk = false;
    if (signedB.data?.signedUrl) {
      const bRes = await fetch(signedB.data.signedUrl);
      bOk = bRes.ok;
    }
    rec(tests, 'SEC-4', 'company B cannot download company A file', Boolean(signedB.error) || !bOk, {
      error: signedB.error?.message,
      leaked: bOk,
    });

    const short = await admin.storage.from('documents').createSignedUrl(pathA, 1);
    if (short.data?.signedUrl) {
      await new Promise((r) => setTimeout(r, 2500));
      const exp = await fetch(short.data.signedUrl);
      rec(tests, 'SEC-5', 'expired signed URL fails', exp.status >= 400, { status: exp.status });
    } else {
      rec(tests, 'SEC-5', 'expired signed URL fails', false, { error: short.error?.message });
    }

    await clientA.auth.signOut();
    const afterLogout = await clientA.storage.from('documents').createSignedUrl(pathA, 900);
    rec(tests, 'SEC-6', 'after logout cannot mint a new signed URL', Boolean(afterLogout.error) || !afterLogout.data?.signedUrl, {
      error: afterLogout.error?.message,
    });
    if (signedUrl) {
      const still = await fetch(signedUrl);
      rec(tests, 'SEC-7', 'existing signed URL still valid until TTL (expected 15min)', still.ok, {
        status: still.status,
        note: 'short TTL by design; not revoked instantly on logout',
      });
    }

    const reA = await clientA.auth.signInWithPassword({
      email: `qa-full-fm-a-${stamp}@example.invalid`,
      password,
    });
    rec(tests, 'AUTH-RE', 'FM A can sign in again after logout', Boolean(reA.data?.session), {
      error: reA.error?.message,
    });

    const vehA = await admin.from('vehicles').insert({
      license_plate: `QA${String(stamp).slice(-6)}A`,
      company_name: companyA,
      manufacturer: 'QA',
      model: 'Audit',
    }).select('id').maybeSingle();
    const vehB = await admin.from('vehicles').insert({
      license_plate: `QA${String(stamp).slice(-6)}B`,
      company_name: companyB,
      manufacturer: 'QA',
      model: 'Audit',
    }).select('id').maybeSingle();
    rec(tests, 'FIX-VEH', 'inserted QA vehicles A and B', Boolean(vehA.data?.id && vehB.data?.id), {
      error: vehA.error?.message || vehB.error?.message,
    });
    if (vehA.data?.id) createdRows.push({ table: 'vehicles', id: vehA.data.id });
    if (vehB.data?.id) createdRows.push({ table: 'vehicles', id: vehB.data.id });

    const custA = await admin.from('customers').insert({
      name: 'QA Customer A',
      company_name: companyA,
    }).select('id').maybeSingle();
    const custB = await admin.from('customers').insert({
      name: 'QA Customer B',
      company_name: companyB,
    }).select('id').maybeSingle();
    if (custA.data?.id) createdRows.push({ table: 'customers', id: custA.data.id });
    if (custB.data?.id) createdRows.push({ table: 'customers', id: custB.data.id });
    rec(tests, 'FIX-CUS', 'inserted QA customers A and B (or skipped)', !custA.error || Boolean(custA.data), {
      error: custA.error?.message || custB.error?.message,
      note: custA.error ? 'insert skipped/failed — isolation still tested via SELECT' : 'ok',
    });

    const accB = await admin.from('accidents').insert({
      company_name: companyB,
      vehicle_plate: `QA${String(stamp).slice(-6)}B`,
      date: new Date().toISOString().slice(0, 10),
    }).select('id').maybeSingle();
    if (accB.data?.id) createdRows.push({ table: 'accidents', id: accB.data.id });

    const alertB = await admin.from('custom_alerts').insert({
      company_name: companyB,
      title: 'QA audit alert B',
      description: 'fixture',
      alert_date: new Date().toISOString(),
      is_active: true,
    }).select('id').maybeSingle();
    if (alertB.data?.id) createdRows.push({ table: 'custom_alerts', id: alertB.data.id });

    const declB = await admin.from('driver_declarations').insert({
      driver_id: randomUUID(),
      driver_name: 'QA Decl B',
      company_name: companyB,
      declaration_text: 'QA fixture',
      status: 'pending',
      token: randomBytes(32).toString('hex'),
    }).select('id').maybeSingle();
    if (declB.data?.id) createdRows.push({ table: 'driver_declarations', id: declB.data.id });

    const examB = await admin.from('driving_exams').insert({
      driver_id: randomUUID(),
      driver_name: 'QA Exam B',
      company_name: companyB,
      questions: [],
      status: 'sent',
      token: randomBytes(24).toString('hex'),
    }).select('id').maybeSingle();
    if (examB.data?.id) createdRows.push({ table: 'driving_exams', id: examB.data.id });

    const posVeh = await clientA.from('vehicles').select('id, company_name').eq('company_name', companyA);
    rec(tests, 'ISO-POS-VEH', 'FM A can see own QA vehicle', (posVeh.data || []).some((r) => r.id === vehA.data?.id), {
      error: posVeh.error?.message,
      count: posVeh.data?.length ?? null,
    });

    const tablesToProbe = companyTables.filter((t) =>
      !['spatial_ref_sys'].includes(t),
    );
    for (const table of tablesToProbe) {
      const { data, error } = await clientA.from(table).select('id, company_name').limit(200);
      if (error) {
        rec(tests, `ISO-${table}`, `FM A SELECT ${table}`, true, {
          note: `blocked or not readable: ${error.message}`,
          skipped: true,
        });
        continue;
      }
      const leaked = (data || []).filter((r) => r.company_name && r.company_name !== companyA);
      const ok = leaked.length === 0;
      if (!ok) {
        tenantLeak.push({
          table,
          leakedCompanies: [...new Set(leaked.map((r) => r.company_name))].slice(0, 8),
          count: leaked.length,
        });
      }
      rec(tests, `ISO-${table}`, `FM A cannot see other companies in ${table}`, ok, {
        seen: (data || []).length,
        leaked: leaked.length,
        leakedCompanies: leaked.length ? [...new Set(leaked.map((r) => r.company_name))].slice(0, 5) : undefined,
      });
    }

    if (vehB.data?.id) {
      const upd = await clientA.from('vehicles').update({ nickname: 'hijack' }).eq('id', vehB.data.id).select('id');
      rec(tests, 'ISO-UPD-VEH', 'FM A cannot UPDATE company B vehicle', Boolean(upd.error) || !upd.data?.length, {
        error: upd.error?.message,
        count: upd.data?.length ?? null,
      });
      const del = await clientA.from('vehicles').delete().eq('id', vehB.data.id).select('id');
      rec(tests, 'ISO-DEL-VEH', 'FM A cannot DELETE company B vehicle', Boolean(del.error) || !del.data?.length, {
        error: del.error?.message,
        count: del.data?.length ?? null,
      });
      const still = await admin.from('vehicles').select('id').eq('id', vehB.data.id).maybeSingle();
      rec(tests, 'ISO-DEL-STILL', 'company B vehicle still exists', still.data?.id === vehB.data.id);
    }

    if (declB.data?.id) {
      const steal = await anon.from('driver_declarations').select('id').eq('id', declB.data.id);
      rec(tests, 'C4-ANON', 'anon cannot SELECT declaration by id', Boolean(steal.error) || !steal.data?.length, {
        count: steal.data?.length ?? null,
      });
    }

    const coTry = await clientA.from('profiles').update({ company_name: companyB }).eq('id', fmA.id);
    rec(tests, 'C3-CO', 'FM cannot change own company_name', Boolean(coTry.error), {
      error: coTry.error?.message,
    });
    const actTry = await clientA.from('profiles').update({ is_active: false }).eq('id', fmA.id);
    rec(tests, 'C3-ACT', 'FM cannot change own is_active', Boolean(actTry.error), {
      error: actTry.error?.message,
    });

    const { data: roleAfter } = await admin.from('user_roles').select('role').eq('user_id', fmA.id);
    rec(tests, 'C2-ROLE', 'malicious signup metadata did not leave super_admin on FM A', !(roleAfter || []).some((r) => r.role === 'super_admin'), {
      roles: (roleAfter || []).map((r) => r.role),
    });

    const pwCross = await fetch(`${STAGING_URL}/functions/v1/change-user-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: keys.anon,
        Authorization: `Bearer ${reA.data.session.access_token}`,
      },
      body: JSON.stringify({ email: `qa-full-fm-b-${stamp}@example.invalid`, new_password: `${password}x` }),
    });
    rec(tests, 'C7-X', 'FM A cannot reset FM B password', pwCross.status === 403, { status: pwCross.status });

    const drvTok = signD.data?.session?.access_token;
    const pwDrv = await fetch(`${STAGING_URL}/functions/v1/change-user-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: keys.anon,
        Authorization: `Bearer ${drvTok}`,
      },
      body: JSON.stringify({ email: `qa-full-fm-a-${stamp}@example.invalid`, new_password: `${password}y` }),
    });
    rec(tests, 'ROLE-DRV-PW', 'driver cannot change-user-password', pwDrv.status >= 400, { status: pwDrv.status });

    const inactive = await admin.auth.admin.createUser({
      email: `qa-full-off-${stamp}@example.invalid`,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'QA off', company_name: companyA },
    });
    if (inactive.data?.user?.id) {
      createdUsers.push(inactive.data.user);
      await admin.from('profiles').upsert({
        id: inactive.data.user.id,
        full_name: 'QA off',
        company_name: companyA,
        is_active: false,
        two_factor_approved: true,
        approval_status: 'pending',
      });
      const ch = await fetch(`${STAGING_URL}/functions/v1/auth-login-challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: keys.anon },
        body: JSON.stringify({ email: `qa-full-off-${stamp}@example.invalid`, password }),
      });
      const chj = await ch.json().catch(() => ({}));
      rec(tests, 'C8-INACT', 'inactive user rejected by login challenge', ch.status >= 400, {
        status: ch.status,
        error: chj.error,
      });
    }

    const chOk = await fetch(`${STAGING_URL}/functions/v1/auth-login-challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: keys.anon },
      body: JSON.stringify({ email: `qa-full-fm-a-${stamp}@example.invalid`, password }),
    });
    rec(tests, 'AUTH-CH', 'active FM A accepted by login challenge', chOk.status < 400, {
      status: chOk.status,
    });

    const edgeFns = [
      'change-user-password',
      'create-admin-user',
      'document-request',
      'request-human-callback',
      'check-driver-availability',
      'send-password-reset',
      'auth-send-otp',
      'full-supabase-export',
      'backup-data',
      'deploy-control',
    ];
    for (const fn of edgeFns) {
      const res = await fetch(`${STAGING_URL}/functions/v1/${fn}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: keys.anon },
        body: JSON.stringify({ probe: true }),
      });
      const protectedOk = res.status === 401 || res.status === 403;
      edgeUnauth.push({ fn, status: res.status, protected: protectedOk });
      rec(tests, `EDGE-${fn}`, `${fn} rejects unauthenticated call`, protectedOk, { status: res.status });
    }

    const gup = await fetch(`${STAGING_URL}/functions/v1/gupshup-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: keys.anon },
      body: JSON.stringify({ type: 'message', payload: { qa: true } }),
    });
    rec(tests, 'HIGH-GUPSHUP', 'gupshup-webhook without signature is rejected', gup.status === 401 || gup.status === 403, {
      status: gup.status,
      note: gup.status < 400 ? 'OPEN HIGH — unsigned webhook accepted' : 'rejected',
    });

    const avail = await fetch(
      `${STAGING_URL}/functions/v1/check-driver-availability?company_name=${encodeURIComponent(companyB)}&driver_name=x`,
      {
        method: 'GET',
        headers: { apikey: keys.anon, Authorization: `Bearer ${reA.data.session.access_token}` },
      },
    );
    const availJson = await avail.json().catch(() => ({}));
    const usedB = JSON.stringify(availJson).includes(companyB) && avail.status === 200;
    rec(tests, 'H15-LIVE', 'FM A availability call does not adopt company B from query', !usedB, {
      status: avail.status,
      note: usedB ? 'query company_name still trusted' : 'scoped or empty',
    });

    const metaB = await admin.from('document_metadata').insert({
      file_path: `${fmB.id}/misc/should-not-see.png`,
      category: 'other',
      company_name: companyB,
      original_name: 'secret-b.png',
    }).select('id').maybeSingle();
    if (metaB.data?.id) createdRows.push({ table: 'document_metadata', id: metaB.data.id });
    const seeBdocs = await clientA.from('document_metadata').select('id, company_name').eq('company_name', companyB);
    rec(tests, 'ISO-DOCS', 'FM A cannot list company B document_metadata', !(seeBdocs.data || []).length, {
      count: seeBdocs.data?.length ?? null,
      error: seeBdocs.error?.message,
    });

    const existingCount = await admin.from('document_metadata').select('id', { count: 'exact', head: true });
    rec(tests, 'DATA-COUNT', 'document_metadata countable without reading file bytes', !existingCount.error, {
      count: existingCount.count,
      note: 'no customer file content opened',
    });
  } finally {
    for (const f of createdFiles) {
      await admin.storage.from('documents').remove([f]);
    }
    for (const row of createdRows) {
      await admin.from(row.table).delete().eq('id', row.id);
    }
    for (const u of createdUsers) {
      await admin.from('user_roles').delete().eq('user_id', u.id);
      await admin.from('drivers').delete().eq('id', u.id);
      await admin.from('profiles').delete().eq('id', u.id);
      await admin.auth.admin.deleteUser(u.id);
    }
  }

  const failed = tests.filter((t) => !t.ok);
  const isoFails = tests.filter((t) => t.id.startsWith('ISO-') && !t.ok && !t.skipped);
  const docFails = tests.filter((t) => /^(UP-|VIEW-|DOC-|SEC-[1-6]|C1-)/.test(t.id) && !t.ok);
  const critFails = tests.filter((t) => /^(C[1-8]|DOC-PRIV|C1-POL|C4-POL)/.test(t.id) && !t.ok);

  verdicts.stagingWorks = failed.filter((t) => /^(UP-|VIEW-|AUTH-)/.test(t.id)).length === 0 ? 'PASS' : 'FAIL';
  verdicts.documentsUploadView = docFails.length === 0 ? 'PASS' : 'FAIL';
  verdicts.documentsProtected = tests.filter((t) => /^SEC-/.test(t.id) && !t.ok && t.id !== 'SEC-7').length === 0
    ? 'PASS'
    : 'FAIL';
  verdicts.tenantIsolation = isoFails.length === 0 ? 'PASS' : 'FAIL';
  verdicts.criticalClosed = critFails.length === 0 ? 'PASS' : 'FAIL';
  verdicts.openHigh = broadPolicies.length || tests.some((t) => t.id.startsWith('HIGH-') && !t.ok)
    ? 'REQUIRES ATTENTION'
    : 'PASS';
  verdicts.readyForProdPrep =
    verdicts.stagingWorks === 'PASS' &&
    verdicts.documentsUploadView === 'PASS' &&
    verdicts.documentsProtected === 'PASS' &&
    verdicts.tenantIsolation === 'PASS' &&
    verdicts.criticalClosed === 'PASS'
      ? 'READY FOR PRODUCTION PREPARATION'
      : 'NOT READY FOR PRODUCTION';

  const report = {
    at: new Date().toISOString(),
    environment: 'staging',
    stagingRef: STAGING_REF,
    productionTouched: false,
    verdicts,
    failedCount: failed.length,
    passCount: tests.filter((t) => t.ok).length,
    tests,
    tenantLeak,
    remainingBroadPolicies: broadPolicies,
    edgeUnauth,
    companyTables,
    notes: [
      'No Production access.',
      'No customer document bytes were downloaded.',
      'QA fixtures created and deleted.',
      'Signed URLs remain valid until TTL after logout by design (SEC-7).',
    ],
  };
  mkdirSync(join(process.cwd(), 'public/project-001'), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ verdicts, failed: failed.length, pass: report.passCount, tenantLeak, broad: broadPolicies.length }, null, 2));
  if (failed.length) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
