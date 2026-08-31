/**
 * Staging-only functional QA for isolated claims tables.
 * Reads vehicles; does not update vehicles, users, accidents, or telemarketing.
 * node scripts/claims-module-functional-qa.mjs
 */
import { execSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const OUT = join(ROOT, 'docs/audit-reports/claims-module-staging-2026-08-31');
const QA_ID = 'DAL-QA-STAGING-001';
mkdirSync(OUT, { recursive: true });

const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-claims-func-qa');
mkdirSync(tmpWork, { recursive: true });
mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });

function dbQuery(sql) {
  const tmp = join(tmpWork, 'q.sql');
  writeFileSync(tmp, sql, 'utf8');
  return execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${tmp}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 120000,
  });
}

execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
  encoding: 'utf8',
  stdio: 'pipe',
});
const linked = readFileSync(join(tmpWork, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
if (linked === PROD_REF) throw new Error('refused: linked production');
if (linked !== STAGING_REF) throw new Error(`unexpected ref ${linked}`);

const before = dbQuery(`
SELECT json_build_object(
  'vehicles', (SELECT count(*) FROM public.vehicles),
  'accidents', (SELECT count(*) FROM public.accidents),
  'profiles', (SELECT count(*) FROM public.profiles),
  'app_role', (SELECT coalesce(json_agg(e.enumlabel ORDER BY e.enumsortorder), '[]'::json)
    FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'app_role'),
  'telemarketing', (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'telemarketing%'),
  'sample_vehicle', (SELECT json_build_object(
      'id', v.id, 'license_plate', v.license_plate, 'company_name', v.company_name,
      'manufacturer', v.manufacturer, 'model', v.model
    ) FROM public.vehicles v
    WHERE coalesce(v.status, '') <> 'archived'
      AND v.license_plate IS NOT NULL
      AND length(trim(v.license_plate)) BETWEEN 5 AND 12
      AND v.license_plate !~ ','
    ORDER BY v.license_plate LIMIT 1)
);
`);

function extract(raw) {
  const parsed = JSON.parse(String(raw));
  return parsed.rows?.[0]?.json_build_object || parsed;
}

const beforeObj = extract(before);

function sqlLit(v) {
  return `'${String(v ?? '').replace(/'/g, "''")}'`;
}

const sample = beforeObj.sample_vehicle;
if (!sample?.id) throw new Error('no sample vehicle for read-only link');

const plate = sqlLit(sample.license_plate);
const company = sqlLit(sample.company_name);
const model = sqlLit([sample.manufacturer, sample.model].filter(Boolean).join(' '));

dbQuery(`
DELETE FROM public.claims_records WHERE id = '${QA_ID}';
INSERT INTO public.claims_records (
  id, vehicle_id, plate, client_name, status, company_name, row_data,
  created_by_name, updated_by_name, last_activity_at
) VALUES (
  '${QA_ID}',
  '${sample.id}'::uuid,
  ${plate},
  'תיק בדיקת Staging — ניתן למחוק',
  'חדש',
  ${company},
  jsonb_build_object(
    'id', '${QA_ID}',
    'clientName', 'תיק בדיקת Staging — ניתן למחוק',
    'plate', ${plate},
    'vehicle_id', '${sample.id}',
    'company_name', ${company},
    'model', ${model},
    'status', 'חדש',
    'createdByName', 'QA Staging'
  ),
  'QA Staging',
  'QA Staging',
  now()
);
INSERT INTO public.claims_tasks (id, claim_id, row_data) VALUES (
  'TSK-QA-001', '${QA_ID}', jsonb_build_object('id','TSK-QA-001','claimId','${QA_ID}','action','בדיקת משימה','done','false')
);
INSERT INTO public.claims_reminders (id, claim_id, row_data) VALUES (
  'REM-QA-001', '${QA_ID}', jsonb_build_object('id','REM-QA-001','claimId','${QA_ID}','date','2026-08-31','note','בדיקת תזכורת')
);
INSERT INTO public.claims_comm_log (id, claim_id, row_data) VALUES (
  'COM-QA-001', '${QA_ID}', jsonb_build_object('id','COM-QA-001','claimId','${QA_ID}','type','note','body','הערת בדיקה')
);
INSERT INTO public.claims_history (id, claim_id, row_data) VALUES (
  'HIS-QA-001', '${QA_ID}', jsonb_build_object('id','HIS-QA-001','claimId','${QA_ID}','action','פתיחת תיק QA','by','QA Staging')
);
`);

const after = dbQuery(`
SELECT json_build_object(
  'vehicles', (SELECT count(*) FROM public.vehicles),
  'accidents', (SELECT count(*) FROM public.accidents),
  'profiles', (SELECT count(*) FROM public.profiles),
  'claim', (SELECT json_build_object(
      'id', id, 'vehicle_id', vehicle_id, 'plate', plate, 'status', status
    ) FROM public.claims_records WHERE id = '${QA_ID}'),
  'tasks', (SELECT count(*) FROM public.claims_tasks WHERE claim_id = '${QA_ID}'),
  'reminders', (SELECT count(*) FROM public.claims_reminders WHERE claim_id = '${QA_ID}'),
  'comm', (SELECT count(*) FROM public.claims_comm_log WHERE claim_id = '${QA_ID}'),
  'history', (SELECT count(*) FROM public.claims_history WHERE claim_id = '${QA_ID}'),
  'rls', (SELECT bool_and(relrowsecurity) FROM pg_class WHERE relname LIKE 'claims_%' AND relkind = 'r')
);
`);

const afterObj = extract(after);
const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  hostingerTouched: false,
  telemarketingTouched: false,
  accidentsTouched: false,
  sampleVehicleReadOnly: {
    id: sample.id,
    license_plate: sample.license_plate,
    company_name: sample.company_name,
  },
  before: {
    vehicles: beforeObj.vehicles,
    accidents: beforeObj.accidents,
    profiles: beforeObj.profiles,
    app_role: beforeObj.app_role,
    telemarketing: beforeObj.telemarketing,
  },
  after: afterObj,
  tests: [
    { id: 'vehicles-unchanged', ok: Number(beforeObj.vehicles) === Number(afterObj.vehicles) },
    { id: 'accidents-unchanged', ok: Number(beforeObj.accidents) === Number(afterObj.accidents) },
    { id: 'profiles-unchanged', ok: Number(beforeObj.profiles) === Number(afterObj.profiles) },
    { id: 'claim-linked-to-existing-vehicle', ok: afterObj.claim?.vehicle_id === sample.id },
    { id: 'task', ok: Number(afterObj.tasks) >= 1 },
    { id: 'reminder', ok: Number(afterObj.reminders) >= 1 },
    { id: 'note', ok: Number(afterObj.comm) >= 1 },
    { id: 'history', ok: Number(afterObj.history) >= 1 },
    { id: 'rls-on', ok: afterObj.rls === true },
  ],
};
report.passed = report.tests.every((t) => t.ok);
writeFileSync(join(OUT, 'qa-functional.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exit(1);
