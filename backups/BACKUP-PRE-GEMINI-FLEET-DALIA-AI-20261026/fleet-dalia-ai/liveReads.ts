import { supabase } from '@/integrations/supabase/client';
import { applyCompanyScope } from '@/hooks/useCompanyFilter';
import {
  applySummaryFilter,
  buildSummaryCounts,
  loadFleetTrackingRows,
  type SummaryFilterKey,
} from '@/lib/vehicleTrackingData';
import { buildVehicleHubUrl } from '@/lib/entityNavContext';
import { getFleetAction, REPORT_TYPE_LABELS } from './actionCatalog';
import { safeSearchToken } from './intent';
import { assertStagingReadTarget, guardCompany } from './stagingGate';

export type ActionLink = { label: string; path: string };
export type ActionResult = { ok: boolean; text: string; links: ActionLink[] };

type Db = {
  from: (table: string) => {
    select: (columns: string, options?: { count?: 'exact'; head?: boolean }) => Query;
  };
};

type Query = {
  eq: (column: string, value: string) => Query;
  or: (filters: string) => Query;
  in: (column: string, values: string[]) => Query;
  lte: (column: string, value: string) => Query;
  order: (column: string, options?: { ascending?: boolean }) => Query;
  limit: (count: number) => Query;
  then: PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null; count: number | null }>['then'];
};

const NAV: Record<string, ActionLink> = {
  open_vehicles: { label: 'רשימת רכבים', path: '/vehicles' },
  open_drivers: { label: 'רשימת נהגים', path: '/drivers' },
  open_tracking: { label: 'מעקב רכבים', path: '/vehicle-tracking' },
  open_reports: { label: 'דוחות', path: '/reports' },
  open_alerts_screen: { label: 'התראות', path: '/alerts' },
  open_tasks_screen: { label: 'משימות', path: '/vehicle-tasks' },
};

const TRACKING_KEY: Record<string, SummaryFilterKey> = {
  tracking_summary: 'total',
  tracking_attention: 'attention',
  tracking_test_soon: 'testSoon',
  tracking_insurance_soon: 'insSoon',
  tracking_no_driver: 'nodriver',
};

const TRACKING_LABEL: Record<SummaryFilterKey, string> = {
  total: 'סה"כ רכבים',
  attention: 'דורשים טיפול',
  active: 'רכבים פעילים',
  service: 'בטיפול',
  transport: 'בשינוע',
  accident: 'בתאונה',
  defect: 'עם ליקויים',
  fault: 'עם תקלה',
  alert: 'עם התראות',
  garage: 'במוסך',
  disabled: 'מושבתים',
  nodriver: 'ללא נהג',
  testSoon: 'טסט קרוב',
  insSoon: 'ביטוח קרוב',
  km: 'חריגת ק"מ',
};

function fail(text: string): ActionResult {
  return { ok: false, text, links: [] };
}

function ok(text: string, links: ActionLink[] = []): ActionResult {
  return { ok: true, text, links };
}

function db(): Db {
  assertStagingReadTarget(import.meta.env.VITE_SUPABASE_URL as string | undefined);
  return supabase as unknown as Db;
}

function scoped(table: string, columns: string, company: string) {
  return applyCompanyScope(db().from(table).select(columns), company) as Query;
}

function vehicleStatus(status: unknown): string {
  if (status === 'active') return 'פעיל';
  if (status === 'in_service') return 'בטיפול';
  if (status === 'out_of_service') return 'לא פעיל';
  if (status === 'archived') return 'בארכיון';
  return typeof status === 'string' && status ? status : 'ללא סטטוס';
}

function daysUntil(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  return Math.ceil((time - Date.now()) / 86400000);
}

function driverPath(id: string, section?: string): string {
  const params = new URLSearchParams({ driverId: id });
  if (section) params.set('section', section);
  return `/drivers?${params.toString()}`;
}

async function searchVehicles(company: string, query: string): Promise<ActionResult> {
  const token = safeSearchToken(query);
  let request = scoped(
    'vehicles',
    'id,license_plate,internal_number,manufacturer,model,status,company_name',
    company,
  );
  if (token) {
    request = request.or(
      `license_plate.ilike.%${token}%,internal_number.ilike.%${token}%,manufacturer.ilike.%${token}%,model.ilike.%${token}%`,
    );
  }
  const { data, error } = await request.order('license_plate').limit(15);
  if (error) return fail(`חיפוש הרכבים נעצר: ${error.message}`);
  const rows = data || [];
  if (rows.length === 0) return ok(`לא נמצאו רכבים בחברה «${company}».`);
  const lines = rows.map((row) => {
    const plate = String(row.license_plate || 'ללא לוחית');
    const internal = row.internal_number ? ` · פנימי ${row.internal_number}` : '';
    const model = [row.manufacturer, row.model].filter(Boolean).join(' ');
    return `${plate}${internal}${model ? ` · ${model}` : ''} · ${vehicleStatus(row.status)}`;
  });
  return ok(
    `${token ? 'תוצאות חיפוש' : '15 רכבים ראשונים'} בחברה «${company}»:\n${lines.join('\n')}`,
    rows.map((row) => ({
      label: `כרטיס ${row.license_plate || row.internal_number || 'רכב'}`,
      path: buildVehicleHubUrl(String(row.id)),
    })),
  );
}

async function searchDrivers(company: string, query: string, section?: string): Promise<ActionResult> {
  const token = safeSearchToken(query);
  let request = scoped(
    'drivers',
    'id,full_name,phone,license_number,license_expiry,status,company_name',
    company,
  );
  if (token) {
    request = request.or(
      `full_name.ilike.%${token}%,phone.ilike.%${token}%,license_number.ilike.%${token}%,id_number.ilike.%${token}%`,
    );
  }
  const { data, error } = await request.order('full_name').limit(15);
  if (error) return fail(`חיפוש הנהגים נעצר: ${error.message}`);
  const rows = data || [];
  if (rows.length === 0) return ok(`לא נמצאו נהגים בחברה «${company}».`);
  const lines = rows.map((row) => `${row.full_name} · רישיון ${row.license_number || '—'} · ${row.phone || 'ללא טלפון'}`);
  return ok(
    `${token ? 'תוצאות חיפוש' : '15 נהגים ראשונים'} בחברה «${company}»:\n${lines.join('\n')}`,
    rows.map((row) => ({
      label: section ? `${section === 'documents' ? 'מסמכים' : 'כרטיס'} ${row.full_name}` : `כרטיס ${row.full_name}`,
      path: driverPath(String(row.id), section),
    })),
  );
}

async function countWhere(table: string, company: string, column?: string, value?: string): Promise<number> {
  let request = applyCompanyScope(
    db().from(table).select('id', { count: 'exact', head: true }),
    company,
  ) as Query;
  if (column && value) request = request.eq(column, value);
  const { count, error } = await request;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function vehicleStatusCounts(company: string): Promise<ActionResult> {
  try {
    const pairs: Array<[string, string]> = [
      ['פעיל', 'active'],
      ['בטיפול', 'in_service'],
      ['לא פעיל', 'out_of_service'],
      ['בארכיון', 'archived'],
    ];
    const lines: string[] = [];
    for (const [label, status] of pairs) {
      lines.push(`${label}: ${await countWhere('vehicles', company, 'status', status)}`);
    }
    const total = await countWhere('vehicles', company);
    return ok(`רכבים בחברה «${company}»:\n${lines.join('\n')}\nסה"כ: ${total}`);
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'ספירת הרכבים נעצרה');
  }
}

async function trackingRead(company: string, actionId: string): Promise<ActionResult> {
  assertStagingReadTarget(import.meta.env.VITE_SUPABASE_URL as string | undefined);
  const key = TRACKING_KEY[actionId];
  const rows = await loadFleetTrackingRows(company);
  const counts = buildSummaryCounts(rows);
  const filtered = applySummaryFilter(rows, key);
  const sample = filtered.slice(0, 8).map((row) => row.license_plate || row.internal_number || row.id);
  const countLines = (Object.keys(TRACKING_LABEL) as SummaryFilterKey[])
    .map((item) => `${TRACKING_LABEL[item]}: ${counts[item] ?? 0}`);
  const screen = key === 'attention' || key === 'total' ? `/vehicle-tracking?summary=${key}` : '/vehicle-tracking';
  const head = key === 'total'
    ? `סיכום מעקב לחברה «${company}»`
    : `${TRACKING_LABEL[key]} בחברה «${company}»: ${filtered.length}`;
  return ok(
    `${head}\n${countLines.join('\n')}${sample.length ? `\nדוגמאות: ${sample.join(', ')}` : ''}`,
    [
      { label: 'מסך מעקב רכבים', path: screen },
      ...filtered.slice(0, 8).map((row) => ({
        label: `כרטיס ${row.license_plate || 'רכב'}`,
        path: buildVehicleHubUrl(row.id),
      })),
    ],
  );
}

async function dateWatch(company: string, field: 'license_expiry' | 'exam_expiry', title: string): Promise<ActionResult> {
  const until = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const { data, error } = await scoped('drivers', `id,full_name,${field}`, company)
    .lte(field, until)
    .order(field, { ascending: true })
    .limit(20);
  if (error) return fail(`${title} נעצר: ${error.message}`);
  const soon = (data || []).filter((row) => daysUntil(row[field]) !== null);
  if (soon.length === 0) return ok(`אין ${title} שחלף או שיחול בתוך 30 יום בחברה «${company}».`);
  return ok(
    `${title} בחברה «${company}», עד 20 הראשונים:\n${soon.map((row) => `${row.full_name} · ${daysUntil(row[field])} ימים`).join('\n')}`,
    soon.map((row) => ({ label: `כרטיס ${row.full_name}`, path: driverPath(String(row.id)) })),
  );
}

async function healthList(company: string): Promise<ActionResult> {
  const { data, error } = await scoped(
    'driver_health_declarations',
    'id,driver_name,declaration_date,created_at',
    company,
  ).order('created_at', { ascending: false }).limit(15);
  if (error) return fail(`הצהרות הבריאות נעצרו: ${error.message}`);
  const rows = data || [];
  if (rows.length === 0) return ok(`אין הצהרות בריאות לחברה «${company}».`);
  return ok(
    `הצהרות בריאות אחרונות בחברה «${company}»:\n${rows.map((row) => `${row.driver_name || 'ללא שם'} · ${row.declaration_date || row.created_at || '—'}`).join('\n')}`,
  );
}

async function examsList(company: string): Promise<ActionResult> {
  const { data, error } = await scoped(
    'driving_exams',
    'id,driver_id,driver_name,exam_type,status,passed,expires_at,created_at',
    company,
  ).order('created_at', { ascending: false }).limit(15);
  if (error) return fail(`מבחני הכשירות נעצרו: ${error.message}`);
  const rows = data || [];
  if (rows.length === 0) return ok(`אין מבחני כשירות לחברה «${company}».`);
  return ok(
    `מבחנים אחרונים בחברה «${company}»:\n${rows.map((row) => `${row.driver_name} · ${row.exam_type} · ${row.status}${row.passed === true ? ' · עבר' : row.passed === false ? ' · לא עבר' : ''}`).join('\n')}`,
    rows.filter((row) => row.driver_id).map((row) => ({
      label: `מבחנים ${row.driver_name}`,
      path: driverPath(String(row.driver_id), 'driving'),
    })),
  );
}

async function reportCounts(company: string): Promise<ActionResult> {
  const tables = [
    ['רכבים', 'vehicles'],
    ['נהגים', 'drivers'],
    ['תקלות', 'faults'],
    ['תאונות', 'accidents'],
    ['הוצאות', 'expenses'],
    ['הזמנות שירות', 'service_orders'],
  ] as const;
  const lines: string[] = [];
  for (const [label, table] of tables) {
    const { count, error } = await applyCompanyScope(
      db().from(table).select('id', { count: 'exact', head: true }),
      company,
    );
    if (error) return fail(`ספירת ${label} נעצרה: ${error.message}`);
    lines.push(`${label}: ${count ?? 0}`);
  }
  return ok(
    `כמויות לחברה «${company}». המספרים הם ספירת רשומות, בלי סינון התאריכים של מסך הדוחות.\n${lines.join('\n')}\nסוגי הדוח במסך הקיים: ${REPORT_TYPE_LABELS.join(', ')}.\nייצוא CSV נשאר במסך הדוחות.`,
    [NAV.open_reports],
  );
}

async function openTasks(company: string): Promise<ActionResult> {
  const { data, error } = await scoped(
    'vehicle_tasks',
    'id,title,vehicle_plate,status,vehicle_id',
    company,
  ).in('status', ['open', 'in_progress']).limit(20);
  if (error) return fail(`המשימות נעצרו: ${error.message}`);
  const rows = data || [];
  if (rows.length === 0) return ok(`אין משימות פתוחות או בטיפול בחברה «${company}».`, [NAV.open_tasks_screen]);
  return ok(
    `משימות פתוחות בחברה «${company}»:\n${rows.map((row) => `${row.title} · ${row.vehicle_plate || 'ללא רכב'} · ${row.status === 'in_progress' ? 'בטיפול' : 'פתוח'}`).join('\n')}`,
    [
      NAV.open_tasks_screen,
      ...rows.filter((row) => row.vehicle_id).slice(0, 8).map((row) => ({
        label: `רכב ${row.vehicle_plate || ''}`.trim(),
        path: buildVehicleHubUrl(String(row.vehicle_id)),
      })),
    ],
  );
}

export async function executeFleetAction(
  id: string,
  query: string,
  ctx: { role?: string; company: string | null },
): Promise<ActionResult> {
  const action = getFleetAction(id);
  if (!action) return fail('הפעולה לא נמצאה במפת הפעולות.');
  if (!action.enabled) return fail(action.unavailableReason || 'הפעולה לא פעילה.');
  if (ctx.role !== 'super_admin' && ctx.role !== 'fleet_manager') {
    return fail('הפעולה זמינה למנהל צי או למנהל על בלבד.');
  }
  if (action.mode === 'navigate' && action.id !== 'open_driver_documents') {
    const link = NAV[action.id];
    return ok(action.description, link ? [link] : []);
  }
  const company = guardCompany(ctx.role, ctx.company);
  if (!company) {
    return fail('לפני קריאה יש לבחור חברה אחת. דליה AI לא שולפת נתונים מכל החברות יחד.');
  }
  try {
    if (id === 'search_vehicles') return await searchVehicles(company, query);
    if (id === 'vehicle_status_counts') return await vehicleStatusCounts(company);
    if (id === 'search_drivers') return await searchDrivers(company, query);
    if (id === 'open_driver_documents') return await searchDrivers(company, query, 'documents');
    if (id in TRACKING_KEY) return await trackingRead(company, id);
    if (id === 'driver_license_watch') return await dateWatch(company, 'license_expiry', 'תוקף רישיון');
    if (id === 'driver_exam_watch') return await dateWatch(company, 'exam_expiry', 'תוקף מבחן');
    if (id === 'driver_health_list') return await healthList(company);
    if (id === 'driver_exams_list') return await examsList(company);
    if (id === 'report_counts') return await reportCounts(company);
    if (id === 'open_tasks') return await openTasks(company);
    return fail('הפעולה מוגדרת אבל אין לה חיבור קריאה בשלב הזה.');
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'הקריאה נעצרה.');
  }
}
