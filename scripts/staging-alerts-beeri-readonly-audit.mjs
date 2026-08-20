/**
 * Read-only Beeri/Staging alert count audit. No writes. Staging only.
 */
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const COMPANY = 'קיבוץ בארי';

function extractRows(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    if (payload.length && Array.isArray(payload[0]?.rows)) return payload[0].rows;
    return payload;
  }
  if (typeof payload === 'string') {
    try { return extractRows(JSON.parse(payload)); } catch { return []; }
  }
  if (Array.isArray(payload.rows)) return payload.rows;
  return [];
}

function q(sql) {
  const tmpWork = join(process.env.TEMP || '/tmp', `fcc-stg-alert-audit-${Date.now()}`);
  mkdirSync(tmpWork, { recursive: true });
  mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });
  execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const f = join(tmpWork, 'q.sql');
  writeFileSync(f, sql, 'utf8');
  return extractRows(execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${f}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
  }));
}

const esc = COMPANY.replace(/'/g, "''");
const rows = q(`
WITH veh AS (
  SELECT *
  FROM public.vehicles
  WHERE company_name = '${esc}'
    AND coalesce(status, '') <> 'archived'
)
SELECT
  (SELECT count(*) FROM veh) AS vehicles,
  (SELECT count(*) FROM veh WHERE test_expiry IS NOT NULL AND test_expiry::date < CURRENT_DATE) AS test_expired,
  (SELECT count(*) FROM veh WHERE test_expiry IS NOT NULL AND test_expiry::date >= CURRENT_DATE AND test_expiry::date <= CURRENT_DATE + 30) AS test_next_30,
  (SELECT count(*) FROM veh WHERE test_expiry IS NOT NULL AND test_expiry::date < CURRENT_DATE OR (test_expiry IS NOT NULL AND test_expiry::date <= CURRENT_DATE + 30)) AS test_urgent_bad_or,
  (SELECT count(*) FROM veh WHERE test_expiry IS NOT NULL AND test_expiry::date <= CURRENT_DATE + 30) AS test_due_or_next_30,
  (SELECT count(*) FROM veh WHERE insurance_expiry IS NOT NULL AND insurance_expiry::date <= CURRENT_DATE + 30) AS ins_due_or_next_30,
  (SELECT count(*) FROM veh WHERE comprehensive_insurance_expiry IS NOT NULL AND comprehensive_insurance_expiry::date <= CURRENT_DATE + 30) AS comp_due_or_next_30,
  (SELECT count(*) FROM public.drivers d WHERE d.company_name = '${esc}' AND d.license_expiry IS NOT NULL AND d.license_expiry::date <= CURRENT_DATE + 30) AS license_due_or_next_30,
  (SELECT count(*) FROM public.faults f WHERE f.company_name = '${esc}' AND f.urgency IN ('urgent','high','critical','דחוף','גבוהה') AND f.status IN ('new','open','חדש','פתוח','בטיפול','in_progress')) AS urgent_faults,
  (SELECT count(*) FROM public.service_orders s WHERE s.company_name = '${esc}') AS service_orders_all
`);
console.log(JSON.stringify(rows, null, 2));
