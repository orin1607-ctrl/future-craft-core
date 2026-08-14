/**
 * Read-only diagnosis of the alerts the owner actually created on Staging.
 * Shows what landed in custom_alerts / vehicle_inspections, and replays the
 * decisions the alerts screen makes for each row so a filtered-out alert is
 * visible as such. Writes nothing.
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-tasks-1-10-staging/alerts-live-diagnose');
mkdirSync(OUT, { recursive: true });

const arr = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const admin = createClient(`https://${STAGING_REF}.supabase.co`, arr.find((k) => k.name === 'service_role').api_key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const since = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
const plateOf = (text) => String(text || '').match(/vplate:([^\n|]+)/)?.[1]?.trim() || null;
const vidOf = (text) => String(text || '').match(/vid:([^\n|]+)/)?.[1]?.trim() || null;
const daysLeft = (d) => (d ? Math.floor((new Date(d).getTime() - Date.now()) / 86400000) : null);

const { data: alerts } = await admin
  .from('custom_alerts')
  .select('id, created_at, user_id, company_name, alert_type, title, description, alert_date, is_active')
  .gte('created_at', since)
  .order('created_at', { ascending: false });

const { data: inspections } = await admin
  .from('vehicle_inspections')
  .select('id, created_at, company_name, vehicle_id, license_plate, next_due_date, inspection_type')
  .gte('created_at', since)
  .order('created_at', { ascending: false });

const userIds = [...new Set((alerts || []).map((a) => a.user_id).filter(Boolean))];
const { data: profiles } = userIds.length
  ? await admin.from('profiles').select('id, full_name, company_name').in('id', userIds)
  : { data: [] };
const { data: roles } = userIds.length
  ? await admin.from('user_roles').select('user_id, role').in('user_id', userIds)
  : { data: [] };

const alertRows = (alerts || []).map((a) => {
  const blob = `${a.title || ''}\n${a.description || ''}`;
  const owner = (profiles || []).find((p) => p.id === a.user_id);
  return {
    created_at: a.created_at,
    alert_type: a.alert_type,
    title: a.title,
    company_name: a.company_name,
    alert_date: a.alert_date,
    daysLeft: daysLeft(a.alert_date),
    is_active: a.is_active,
    plateMeta: plateOf(blob),
    vehicleIdMeta: vidOf(blob),
    ownerCompany: owner?.company_name ?? null,
    ownerName: owner?.full_name ?? null,
    ownerRole: (roles || []).find((r) => r.user_id === a.user_id)?.role ?? null,
    // the alerts screen drops rows whose date already passed
    droppedByPastDate: daysLeft(a.alert_date) === null || daysLeft(a.alert_date) < 0,
    // company scope hides rows whose company differs from the selected one
    companyMismatchRisk: !a.company_name,
  };
});

const inspectionRows = (inspections || []).map((i) => {
  const matching = alertRows.filter(
    (a) => a.alert_type === 'officer' && (a.plateMeta === i.license_plate || a.vehicleIdMeta === i.vehicle_id),
  );
  return {
    created_at: i.created_at,
    company_name: i.company_name,
    license_plate: i.license_plate,
    inspection_type: i.inspection_type,
    next_due_date: i.next_due_date,
    officerAlertsForThisVehicle: matching.length,
    activeOfficerAlerts: matching.filter((a) => a.is_active).length,
  };
});

const summary = {
  at: new Date().toISOString(),
  windowStart: since,
  totals: {
    alertsCreated: alertRows.length,
    officer: alertRows.filter((a) => a.alert_type === 'officer').length,
    free: alertRows.filter((a) => a.alert_type === 'free').length,
    inactive: alertRows.filter((a) => !a.is_active).length,
    missingCompany: alertRows.filter((a) => !a.company_name).length,
    pastDate: alertRows.filter((a) => a.droppedByPastDate).length,
    inspections: inspectionRows.length,
    inspectionsWithoutOfficerAlert: inspectionRows.filter((i) => i.activeOfficerAlerts === 0).length,
  },
  companies: [...new Set(alertRows.map((a) => a.company_name))],
  alerts: alertRows,
  inspections: inspectionRows,
};

writeFileSync(join(OUT, 'live-diagnose.json'), JSON.stringify(summary, null, 2), 'utf8');
console.log(JSON.stringify({ totals: summary.totals, companies: summary.companies }, null, 2));
console.log('--- alerts ---');
console.log(alertRows.slice(0, 25).map((a) => `${a.created_at} ${a.alert_type} act=${a.is_active} co=${a.company_name || '(empty)'} days=${a.daysLeft} plate=${a.plateMeta || '-'} role=${a.ownerRole} | ${a.title}`).join('\n'));
console.log('--- inspections ---');
console.log(inspectionRows.slice(0, 25).map((i) => `${i.created_at} co=${i.company_name} plate=${i.license_plate} next=${i.next_due_date} officerActive=${i.activeOfficerAlerts}`).join('\n'));
