/**
 * Live QA for garage_customers / garage_vehicles / garage_cases
 * on Oren Car PUBLIC STAGING only (usfeoerkpcafxxlyuldl).
 *
 * Never Production / qasomfndnjuixgjmjwcm / dalia-car.online.
 * Does not apply SQL. Does not print secrets.
 *
 * Paths:
 * 1. Anon REST — always
 * 2. STAGING_DATABASE_URL — catalog + trigger/FK/lock DML (staging ref required)
 * 3. TEST_EMAIL + TEST_PASSWORD — authenticated REST as that user
 */
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const YEAR = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric' }).format(new Date());

function abort(msg) {
  console.error('ABORT:', msg);
  process.exit(2);
}

function guardUrl(url, label) {
  const v = String(url || '');
  if (!v) abort(`Missing ${label}`);
  if (v.includes(PROD_REF) || /dalia-car\.online/i.test(v)) abort(`${label} looks like Production. Refusing.`);
  if (!v.includes(STAGING_REF)) abort(`${label} is not Staging ${STAGING_REF}. Refusing.`);
}

function record(report, id, ok, detail = {}) {
  report.checks.push({ id, ok, ...detail });
  const skip = String(detail.note || '').startsWith('SKIP');
  console.log(skip ? 'SKIP' : ok ? 'PASS' : 'FAIL', id, detail.error || detail.note || '');
}

function dbQuery(dbUrl, sql) {
  guardUrl(dbUrl, 'STAGING_DATABASE_URL');
  const res = spawnSync(
    'npx',
    ['--yes', 'supabase', 'db', 'query', '--output-format', 'json', '--db-url', dbUrl, sql],
    { encoding: 'utf8', timeout: 60000, env: { ...process.env } },
  );
  const out = `${res.stdout || ''}\n${res.stderr || ''}`.trim();
  if (res.status !== 0) {
    throw new Error(out.slice(0, 600) || 'db query failed');
  }
  return out;
}

async function restAnon(anon, path, method = 'GET', body) {
  const res = await fetch(`${STAGING_URL}${path}`, {
    method,
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, json, text: text.slice(0, 400) };
}

function denied(resp) {
  const code = String(resp.json?.code || '');
  const msg = String(resp.json?.message || resp.text || '');
  return resp.status === 401 || resp.status === 403 || code === '42501' || /permission denied/i.test(msg);
}

function tableExistsFromAnon(resp) {
  const msg = String(resp.json?.message || resp.text || '');
  const code = String(resp.json?.code || '');
  if (code === 'PGRST205' || /could not find the table/i.test(msg)) return false;
  return resp.status === 200 || denied(resp) || code === 'PGRST204';
}

async function run() {
  mkdirSync('test-results', { recursive: true });
  const anon = String(process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
  const viteUrl = String(process.env.VITE_SUPABASE_URL || '').trim();
  const dbUrl = String(process.env.STAGING_DATABASE_URL || '').replace(/[\r\n]/g, '').trim();
  const email = String(process.env.TEST_EMAIL || '').trim();
  const password = String(process.env.TEST_PASSWORD || '').trim();

  if (viteUrl) guardUrl(viteUrl, 'VITE_SUPABASE_URL');
  if (!anon) abort('Missing staging anon key');

  const report = {
    at: new Date().toISOString(),
    target: STAGING_REF,
    production_ref: PROD_REF,
    production_touched: false,
    sql_not_applied_by_this_script: true,
    checks: [],
    numbers: {},
    ids: {},
  };

  const tables = ['garage_customers', 'garage_vehicles', 'garage_cases'];
  for (const table of tables) {
    const sel = await restAnon(anon, `/rest/v1/${table}?select=id&limit=1`);
    record(report, `anon_table_exists_${table}`, tableExistsFromAnon(sel), { status: sel.status, code: sel.json?.code });
    record(report, `anon_select_blocked_${table}`, denied(sel), { status: sel.status, code: sel.json?.code });
    const ins = await restAnon(anon, `/rest/v1/${table}`, 'POST', { id: '00000000-0000-0000-0000-000000000001' });
    record(report, `anon_insert_blocked_${table}`, denied(ins), { status: ins.status, code: ins.json?.code });
    const del = await restAnon(anon, `/rest/v1/${table}?id=eq.00000000-0000-0000-0000-000000000001`, 'DELETE');
    record(report, `anon_delete_blocked_${table}`, denied(del), { status: del.status, code: del.json?.code });
  }

  if (dbUrl) {
    try {
      const catalogSql = `
        select json_build_object(
          'db', current_database(),
          'customers', to_regclass('public.garage_customers') is not null,
          'vehicles', to_regclass('public.garage_vehicles') is not null,
          'cases', to_regclass('public.garage_cases') is not null,
          'seq_customer_min', (select min_value from pg_sequences where schemaname='public' and sequencename='garage_customers_number_seq'),
          'seq_customer_last', (select last_value from pg_sequences where schemaname='public' and sequencename='garage_customers_number_seq'),
          'seq_customer_called', (select is_called from pg_sequences where schemaname='public' and sequencename='garage_customers_number_seq'),
          'seq_case_min', (select min_value from pg_sequences where schemaname='public' and sequencename='garage_cases_number_seq'),
          'delete_policies', (
            select count(*) from pg_policies
            where schemaname='public'
              and tablename in ('garage_customers','garage_vehicles','garage_cases')
              and cmd='DELETE'
          ),
          'anon_delete_customers', has_table_privilege('anon','public.garage_customers','delete'),
          'anon_delete_vehicles', has_table_privilege('anon','public.garage_vehicles','delete'),
          'anon_delete_cases', has_table_privilege('anon','public.garage_cases','delete'),
          'auth_delete_customers', has_table_privilege('authenticated','public.garage_customers','delete'),
          'auth_delete_vehicles', has_table_privilege('authenticated','public.garage_vehicles','delete'),
          'auth_delete_cases', has_table_privilege('authenticated','public.garage_cases','delete'),
          'staff_fn', pg_get_functiondef('public.garage_is_staff(uuid)'::regprocedure)
        ) as qa;
      `;
      const catalogOut = dbQuery(dbUrl, catalogSql);
      let catalog = {};
      try {
        const parsed = JSON.parse(catalogOut);
        catalog = parsed.qa || parsed[0]?.qa || parsed[0] || parsed;
      } catch {
        catalog = { raw: catalogOut.slice(0, 800) };
      }
      report.catalog = catalog;
      record(report, 'db_table_garage_customers', catalog.customers === true);
      record(report, 'db_table_garage_vehicles', catalog.vehicles === true);
      record(report, 'db_table_garage_cases', catalog.cases === true);
      record(report, 'db_seq_customer_starts_1281', Number(catalog.seq_customer_min) === 1281, { value: catalog.seq_customer_min });
      record(report, 'db_no_delete_policies', Number(catalog.delete_policies) === 0, { value: catalog.delete_policies });
      record(report, 'db_anon_delete_revoked', catalog.anon_delete_customers === false && catalog.anon_delete_vehicles === false && catalog.anon_delete_cases === false);
      record(report, 'db_authenticated_delete_revoked', catalog.auth_delete_customers === false && catalog.auth_delete_vehicles === false && catalog.auth_delete_cases === false);
      record(report, 'db_staff_is_super_admin_only', /super_admin/.test(String(catalog.staff_fn || '')) && !/fleet_manager/.test(String(catalog.staff_fn || '')), { note: 'garage_is_staff body' });

      const stamp = Date.now().toString().slice(-8);
      const phone = `050${stamp.slice(-7)}`;
      const plate = `QA${stamp}`;
      const plate2 = `QB${stamp}`;
      const dmlSql = `
        do $qa$
        declare
          uid uuid;
          c1 uuid;
          c2 uuid;
          v1 uuid;
          v2 uuid;
          n1 int;
          n2 int;
          cs text;
          err text;
        begin
          select id into uid from auth.users limit 1;
          if uid is null then
            raise exception 'NO_AUTH_USER';
          end if;

          insert into public.garage_customers (customer_type, name, phone)
            values ('private', 'QA-מוסך ${stamp}', '${phone}')
            returning id, customer_number into c1, n1;
          if n1 < 1281 then
            raise exception 'CUSTOMER_NUMBER_BELOW_1281 %', n1;
          end if;

          insert into public.garage_customers (customer_type, name, phone)
            values ('private', 'QA-מוסך-B ${stamp}', '051${stamp.slice(-7)}')
            returning id, customer_number into c2, n2;

          insert into public.garage_vehicles (customer_id, plate, make, model)
            values (c1, '${plate}', 'QA', 'A')
            returning id into v1;
          insert into public.garage_vehicles (customer_id, plate, make, model)
            values (c2, '${plate2}', 'QA', 'B')
            returning id into v2;

          begin
            insert into public.garage_vehicles (customer_id, plate, make, model)
              values (c2, '${plate}', 'QA', 'DUP');
            raise exception 'DUP_PLATE_ALLOWED';
          exception
            when unique_violation then null;
          end;

          begin
            insert into public.garage_cases (customer_id, vehicle_id, opened_by, opened_by_name)
              values (c1, v2, uid, 'QA');
            raise exception 'CROSS_CUSTOMER_VEHICLE_ALLOWED';
          exception
            when foreign_key_violation then null;
          end;

          insert into public.garage_cases (customer_id, vehicle_id, opened_by, opened_by_name, customer_name_snapshot, vehicle_plate_snapshot)
            values (c1, v1, uid, 'QA', 'QA-מוסך ${stamp}', '${plate}')
            returning case_number into cs;
          if cs is null or cs not like 'GM-${YEAR}-%' then
            raise exception 'BAD_CASE_NUMBER %', cs;
          end if;

          begin
            update public.garage_customers set customer_number = 1 where id = c1;
            raise exception 'CUSTOMER_NUMBER_MUTABLE';
          exception
            when others then
              if sqlerrm not like '%מספר לקוח%' then raise; end if;
          end;

          begin
            update public.garage_cases set case_number = 'X' where case_number = cs;
            raise exception 'CASE_NUMBER_MUTABLE';
          exception
            when others then
              if sqlerrm not like '%מספר תיק%' then raise; end if;
          end;

          begin
            update public.garage_cases
              set opened_by = '00000000-0000-0000-0000-000000000099'
            where case_number = cs;
            raise exception 'OPENED_BY_MUTABLE';
          exception
            when others then
              if sqlerrm not like '%פותח התיק%' then raise; end if;
          end;

          begin
            update public.garage_cases set customer_id = c2 where case_number = cs;
            raise exception 'CUSTOMER_ID_MUTABLE';
          exception
            when others then
              if sqlerrm not like '%לקוח התיק%' and sqlstate <> '23503' then raise; end if;
          end;

          begin
            update public.garage_cases set vehicle_id = v2 where case_number = cs;
            raise exception 'VEHICLE_ID_MUTABLE';
          exception
            when others then
              if sqlerrm not like '%רכב התיק%' and sqlstate <> '23503' then raise; end if;
          end;

        end
        $qa$;
      `;
      dbQuery(dbUrl, dmlSql);
      const dmlOut = dbQuery(dbUrl, `
        select json_build_object(
          'customer_number', c.customer_number,
          'case_number', k.case_number,
          'customer_id', c.id,
          'vehicle_id', k.vehicle_id,
          'case_id', k.id
        ) as qa
        from public.garage_customers c
        join public.garage_cases k on k.customer_id = c.id
        where c.name = 'QA-מוסך ${stamp}'
        order by c.created_at desc
        limit 1;
      `);
      report.dml_preview = dmlOut.slice(0, 800);
      let dml = {};
      try {
        const parsed = JSON.parse(dmlOut);
        dml = parsed.qa || parsed[0]?.qa || parsed[0] || parsed;
      } catch {
        dml = {};
      }
      if (dml.customer_number && dml.case_number) {
        report.numbers.customer_number = Number(dml.customer_number);
        report.numbers.case_number = dml.case_number;
        report.ids = { customer_id: dml.customer_id, vehicle_id: dml.vehicle_id, case_id: dml.case_id };
        record(report, 'save_customer', true, { customer_number: Number(dml.customer_number) });
        record(report, 'first_customer_at_least_1281', Number(dml.customer_number) >= 1281);
        record(report, 'save_vehicle', true);
        record(report, 'save_case', true, { case_number: dml.case_number });
        record(report, 'case_number_format', /^GM-\d{4}-\d{4}$/.test(String(dml.case_number)), { case_number: dml.case_number });
        record(report, 'duplicate_plate_blocked', true);
        record(report, 'cross_customer_vehicle_blocked', true);
        record(report, 'customer_number_locked', true);
        record(report, 'case_number_locked', true);
        record(report, 'opened_by_locked', true);
        record(report, 'customer_id_locked', true);
        record(report, 'vehicle_id_locked', true);
      } else {
        record(report, 'db_dml_block', false, { error: dmlOut.slice(0, 500) });
      }
    } catch (e) {
      record(report, 'db_url_qa', false, { error: String(e.message || e).slice(0, 500) });
    }
  } else {
    record(report, 'db_url_qa', false, { note: 'SKIP: no STAGING_DATABASE_URL in this environment' });
  }

  if (email && password) {
    guardUrl(STAGING_URL, 'STAGING_URL');
    const client = createClient(STAGING_URL, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: auth, error: authErr } = await client.auth.signInWithPassword({ email, password });
    if (authErr || !auth?.session) {
      record(report, 'authenticated_login', false, { error: authErr?.message || 'no session' });
    } else {
      const roleRes = await client.from('user_roles').select('role').eq('user_id', auth.user.id).maybeSingle();
      const role = roleRes.data?.role || 'unknown';
      record(report, 'authenticated_login', true, { role });
      const stamp = `UI${Date.now().toString().slice(-7)}`;
      const insC = await client.from('garage_customers').insert({
        customer_type: 'private',
        name: `QA-REST-${stamp}`,
        phone: `052${stamp.slice(-7)}`,
      }).select('*').single();
      const saAllowed = !insC.error;
      record(report, 'super_admin_insert_customer', role === 'super_admin' ? saAllowed : !saAllowed, {
        role,
        error: insC.error?.message,
        customer_number: insC.data?.customer_number,
      });
      if (saAllowed && insC.data) {
        report.numbers.rest_customer_number = insC.data.customer_number;
        const insV = await client.from('garage_vehicles').insert({
          customer_id: insC.data.id,
          plate: stamp,
          make: 'QA',
          model: 'REST',
        }).select('*').single();
        record(report, 'super_admin_insert_vehicle', !insV.error, { error: insV.error?.message });
        if (!insV.error) {
          const insCase = await client.from('garage_cases').insert({
            customer_id: insC.data.id,
            vehicle_id: insV.data.id,
            opened_by: auth.user.id,
            opened_by_name: 'QA REST',
            customer_name_snapshot: insC.data.name,
            vehicle_plate_snapshot: stamp,
          }).select('*').single();
          record(report, 'super_admin_insert_case', !insCase.error, {
            error: insCase.error?.message,
            case_number: insCase.data?.case_number,
          });
          if (insCase.data) report.numbers.rest_case_number = insCase.data.case_number;
          const del = await client.from('garage_cases').delete().eq('id', insCase.data?.id || '00000000-0000-0000-0000-000000000000');
          record(report, 'super_admin_delete_blocked', !!del.error || (del.count === 0 && del.error), { error: del.error?.message });
        }
      }
      if (role === 'fleet_manager') {
        record(report, 'fleet_manager_blocked', !!insC.error);
      }
      if (role === 'driver') {
        record(report, 'driver_blocked', !!insC.error);
      }
    }
  } else {
    record(report, 'authenticated_login', false, { note: 'SKIP: no TEST_EMAIL/TEST_PASSWORD' });
    record(report, 'super_admin_live_rest', false, { note: 'SKIP: needs super_admin session' });
    record(report, 'fleet_manager_blocked', false, { note: 'SKIP: needs fleet_manager JWT' });
    record(report, 'driver_blocked', false, { note: 'SKIP: needs driver JWT' });
  }

  const failed = report.checks.filter((c) => c.ok === false && !String(c.note || '').startsWith('SKIP'));
  const skipped = report.checks.filter((c) => String(c.note || '').startsWith('SKIP'));
  report.summary = {
    passed: report.checks.filter((c) => c.ok === true).length,
    failed: failed.length,
    skipped: skipped.length,
  };
  writeFileSync(join('test-results', 'garage-book-live-qa.json'), JSON.stringify(report, null, 2));
  console.log('SUMMARY', JSON.stringify(report.summary));
  if (failed.length) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
