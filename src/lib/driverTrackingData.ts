import { calendarDaysLeft, toIsoDate } from '@/lib/driverTrackingDates';
import { formatIsraelDate } from '@/lib/driverDocumentExpiry';
import { DEFAULT_ALERT_THRESHOLDS, type CompanyAlertThresholds } from '@/lib/vehicleTrackingAlerts';

export const DRIVER_FIELD_MISSING = 'לא עודכן';
export const DRIVER_FIELD_ABSENT = 'לא קיים';

export type DriverAlertKind =
  | 'license'
  | 'exam'
  | 'safety'
  | 'health'
  | 'document'
  | 'traffic'
  | 'task'
  | 'declaration';

export type DriverAlertState = 'open' | 'in_progress' | 'overdue' | 'completed';

export type DriverSummaryKey = 'total' | 'open' | 'overdue' | 'in_progress' | 'completed';

/** Stored validity windows. Approaching cards exclude dates that already passed. */
export const DRIVER_VALIDITY_KEYS = [
  'license_soon',
  'exam_renewal',
  'health_soon',
  'safety_renewal',
  'document_soon',
  'expired',
] as const;

export type DriverValidityKey = (typeof DRIVER_VALIDITY_KEYS)[number];

export type DriverSortKey = 'date' | 'urgency' | 'name';

export const DRIVER_ALERT_KIND_LABELS: Record<DriverAlertKind, string> = {
  license: 'רישיון',
  exam: 'מבחן נהיגה',
  safety: 'הדרכת בטיחות',
  health: 'הצהרת בריאות',
  document: 'מסמך',
  traffic: 'דוח תנועה',
  task: 'משימה',
  declaration: 'הצהרה',
};

export type DriverAlertItem = {
  id: string;
  kind: DriverAlertKind;
  label: string;
  detail: string;
  openedAt: string | null;
  dueAt: string | null;
  state: DriverAlertState;
  daysLeft: number | null;
  urgent: boolean;
  hubLink: string;
};

export type DriverHistoryEntry = {
  id: string;
  date: string | null;
  actionType: string;
  description: string;
  performedBy: string;
  result: string;
  documentUrl: string | null;
  documentName: string | null;
  hubLink: string | null;
  nextFollowUp: string;
  completed: boolean;
};

export type DriverTrackingRow = {
  id: string;
  fullName: string;
  employeeNumber: string;
  employeeNumberRaw: string;
  phone: string;
  phoneRaw: string;
  department: string;
  departmentRaw: string;
  companyName: string;
  vehiclePlates: string;
  vehiclePlatesRaw: string;
  licenseNumber: string;
  licenseGrades: string;
  licenseExpiry: string;
  licenseCheckLast: string;
  licenseCheckNext: string;
  safetyDone: string;
  safetyNext: string;
  examDone: string;
  examResult: string;
  examNext: string;
  healthText: string;
  approvalText: string;
  accidentsText: string;
  trafficText: string;
  status: string;
  statusText: string;
  lastAction: string;
  nextAction: string;
  nextActionIso: string | null;
  alertItems: DriverAlertItem[];
  history: DriverHistoryEntry[];
  alertWindowDays: number;
};

export type DriverTrackingFilters = {
  search: string;
  department: string;
  status: string;
  alertKind: DriverAlertKind | '';
  dateFrom: string;
  dateTo: string;
  overdue: boolean;
  approaching: boolean;
};

export const EMPTY_DRIVER_FILTERS: DriverTrackingFilters = {
  search: '',
  department: '',
  status: '',
  alertKind: '',
  dateFrom: '',
  dateTo: '',
  overdue: false,
  approaching: false,
};

export type DriverSource = {
  id: string;
  full_name: string | null;
  id_number: string | null;
  phone: string | null;
  department: string | null;
  company_name: string | null;
  status: string | null;
  license_number: string | null;
  license_types: string[] | null;
  license_expiry: string | null;
  exam_expiry: string | null;
  last_exam_date: string | null;
  license_image_url?: string | null;
};

export type DriverVehicleSource = {
  id: string;
  license_plate: string | null;
  assigned_driver_id: string | null;
  company_name: string | null;
  status?: string | null;
};

export type DriverExamSource = {
  id: string;
  driver_id: string;
  company_name: string | null;
  exam_type: string | null;
  status: string | null;
  passed: boolean | null;
  completed_at: string | null;
  created_at: string | null;
  expires_at: string | null;
  exam_validity_months?: number | null;
  signature_url?: string | null;
  score: number | null;
};

export type DriverPracticalExamSource = {
  id: string;
  driver_id: string;
  company_name: string | null;
  exam_date: string | null;
  status: string | null;
  passed: boolean | null;
  examiner_name: string | null;
  notes: string | null;
  created_at: string | null;
  vehicle_plate: string | null;
  driver_signature_url?: string | null;
  examiner_signature_url?: string | null;
};

export type DriverHealthSource = {
  id: string;
  driver_id: string | null;
  company_name: string | null;
  declaration_date: string | null;
  created_at: string | null;
  signature_url?: string | null;
};

export type DriverDeclarationSource = {
  id: string;
  driver_id: string;
  company_name: string | null;
  status: string | null;
  created_at: string | null;
  signed_at: string | null;
  expires_at: string | null;
  pdf_url: string | null;
};

export type DriverAssignmentSource = {
  id: string;
  driver_id: string | null;
  company_name: string | null;
  title: string | null;
  description: string | null;
  status: string | null;
  scheduled_date: string | null;
  created_at: string | null;
};

export type DriverDocumentSource = {
  id: string;
  entity_id: string;
  company_name: string | null;
  document_type_key: string;
  expiry_date: string | null;
  created_at: string | null;
  is_current: boolean;
  original_name: string | null;
  public_url: string | null;
};

export type DriverDocumentRequestSource = {
  id: string;
  entity_id: string;
  company_name: string | null;
  document_type_key: string;
  status: string | null;
  created_at: string | null;
  token_expires_at: string | null;
  requested_by_name: string | null;
};

/** Linked only when the accident row itself stores this driver's id. */
export type DriverAccidentSource = {
  id: string;
  driver_id?: string | null;
  driver_name?: string | null;
  company_name: string | null;
  date: string | null;
  description: string | null;
  status: string | null;
  event_number?: string | null;
};

export type DriverTrackingBundle = {
  drivers: DriverSource[];
  vehicles: DriverVehicleSource[];
  exams: DriverExamSource[];
  practicalExams: DriverPracticalExamSource[];
  healthDeclarations: DriverHealthSource[];
  declarations: DriverDeclarationSource[];
  assignments: DriverAssignmentSource[];
  documents: DriverDocumentSource[];
  documentRequests: DriverDocumentRequestSource[];
  accidents?: DriverAccidentSource[];
  labels?: Record<string, string>;
  thresholdsByCompany?: Map<string, CompanyAlertThresholds>;
  today?: string;
};

const CLOSED = new Set([
  'completed', 'complete', 'done', 'closed', 'approved', 'signed', 'passed', 'failed',
  'cancelled', 'canceled', 'rejected', 'expired',
  'הושלם', 'נסגר', 'אושר', 'נחתם', 'עבר', 'נכשל', 'בוטל', 'נדחה',
]);

const SUCCESS = new Set([
  'completed', 'complete', 'done', 'closed', 'approved', 'signed', 'passed',
  'הושלם', 'נסגר', 'אושר', 'נחתם', 'עבר',
]);

const IN_PROGRESS = new Set([
  'in_progress', 'in_treatment', 'started', 'pending_approval', 'uploaded', 'בטיפול',
]);

const PENDING_REQUEST = new Set([
  'created', 'sent', 'delivered', 'opened', 'uploaded', 'pending_approval',
]);

const DOC_LABELS: Record<string, string> = {
  driver_license: 'רישיון נהיגה',
  health_declaration: 'הצהרת בריאות',
  traffic_ticket: 'דוח תנועה',
  traffic_info: 'מידע תעבורה',
};

const EXAM_LABELS: Record<string, string> = {
  general: 'כללי',
  theory: 'תיאוריה',
  safety: 'בטיחות',
  periodic: 'תקופתי',
};

const STATUS_HE: Record<string, string> = {
  open: 'פתוח',
  pending: 'ממתין',
  in_progress: 'בטיפול',
  in_treatment: 'בטיפול',
  started: 'התחיל',
  completed: 'הושלם',
  complete: 'הושלם',
  done: 'הושלם',
  closed: 'נסגר',
  passed: 'עבר',
  failed: 'נכשל',
  signed: 'נחתם',
  sent: 'נשלח',
  created: 'נוצר',
  delivered: 'נמסר',
  opened: 'נפתח',
  uploaded: 'הועלה',
  pending_approval: 'ממתין לאישור',
  approved: 'אושר',
  cancelled: 'בוטל',
  canceled: 'בוטל',
  rejected: 'נדחה',
  expired: 'פג תוקף',
  active: 'פעיל',
  inactive: 'לא פעיל',
};

function clean(value: string | null | undefined): string {
  return (value || '').trim();
}

export function textOrMissing(value: string | null | undefined): string {
  return clean(value) || DRIVER_FIELD_MISSING;
}

export function textOrAbsent(value: string | null | undefined): string {
  return clean(value) || DRIVER_FIELD_ABSENT;
}

export function showDate(value: string | null | undefined, empty = DRIVER_FIELD_MISSING): string {
  const iso = toIsoDate(value);
  if (!iso) return empty;
  const formatted = formatIsraelDate(iso);
  return formatted && formatted !== '—' ? formatted : empty;
}

export function daysLeftLabel(days: number | null): string {
  if (days === null) return DRIVER_FIELD_MISSING;
  if (days < 0) return `${Math.abs(days)} ימים באיחור`;
  if (days === 0) return 'היום';
  return `${days} ימים`;
}

/** Display-only. A stored expiry wins. Months apply only from a completed exam date. */
export function addMonthsToDate(isoDate: string, months: number): string | null {
  const iso = toIsoDate(isoDate);
  if (!iso || !Number.isFinite(months) || months < 1) return null;
  const [year, month, day] = iso.split('-').map(Number);
  const wholeMonths = Math.floor(months);
  const cursor = new Date(Date.UTC(year, month - 1 + wholeMonths, 1));
  const lastDay = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate();
  const out = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), Math.min(day, lastDay)));
  return out.toISOString().slice(0, 10);
}

export function examDisplayExpiry(exam: {
  expires_at?: string | null;
  exam_validity_months?: number | null;
  completed_at?: string | null;
}): string | null {
  const stored = toIsoDate(exam.expires_at);
  if (stored) return stored;
  const base = toIsoDate(exam.completed_at);
  const months = exam.exam_validity_months;
  if (!base || months == null || !Number.isFinite(months) || months < 1) return null;
  return addMonthsToDate(base, months);
}

export function safeDocumentUrl(value: string | null | undefined): string | null {
  const raw = clean(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString();
  } catch {
    return null;
  }
  return null;
}

export function validityPhrase(
  due: string | null | undefined,
  today: string,
  windowDays: number,
  empty = DRIVER_FIELD_MISSING,
): string {
  const iso = toIsoDate(due);
  if (!iso) return empty;
  const days = calendarDaysLeft(iso, today);
  if (days === null) return showDate(iso, empty);
  const state = days < 0 ? 'פג תוקף' : days <= windowDays ? 'עומד לפוג' : 'תקף';
  return `${showDate(iso)} · ${state} · ${daysLeftLabel(days)}`;
}

export function alertStateLabel(state: DriverAlertState): string {
  switch (state) {
    case 'overdue':
      return 'באיחור';
    case 'in_progress':
      return 'בטיפול';
    case 'completed':
      return 'הושלם';
    default:
      return 'פתוח';
  }
}

export function statusText(status: string | null | undefined): string {
  const raw = clean(status);
  if (!raw) return DRIVER_FIELD_MISSING;
  return STATUS_HE[raw.toLowerCase()] || STATUS_HE[raw] || raw;
}

/**
 * A shared name is not a link. The accident is this driver's only when its own driver id matches.
 */
export function accidentBelongsToDriver(
  accident: { driver_id?: string | null; driver_name?: string | null },
  driverId: string,
): boolean {
  const id = clean(accident.driver_id);
  return id.length > 0 && id === driverId;
}

function sameCompany(rowCompany: string | null | undefined, driverCompany: string | null): boolean {
  const row = clean(rowCompany);
  const driver = clean(driverCompany);
  if (row && driver && row !== driver) return false;
  if (row && !driver) return false;
  return true;
}

function driverCardLink(driverId: string, section?: string, docType?: string): string {
  const q = new URLSearchParams({ driverId });
  if (section) q.set('section', section);
  if (docType) q.set('docType', docType);
  return `/drivers?${q.toString()}`;
}

function normSearch(value: string): string {
  return value.replace(/[-\s]/g, '').toLowerCase();
}

function isClosedStatus(status: string | null | undefined): boolean {
  const raw = clean(status).toLowerCase();
  return CLOSED.has(raw) || CLOSED.has(clean(status));
}

function isSuccessStatus(status: string | null | undefined): boolean {
  const raw = clean(status).toLowerCase();
  return SUCCESS.has(raw) || SUCCESS.has(clean(status));
}

function isInProgressStatus(status: string | null | undefined): boolean {
  const raw = clean(status).toLowerCase();
  return IN_PROGRESS.has(raw) || IN_PROGRESS.has(clean(status));
}

function examFinished(status: string | null | undefined, passed: boolean | null): boolean {
  if (passed === true || passed === false) return true;
  return isClosedStatus(status);
}

function resultText(status: string | null | undefined, passed: boolean | null): string {
  if (passed === true) return 'עבר';
  if (passed === false) return 'נכשל';
  return statusText(status);
}

function docLabel(key: string, labels?: Record<string, string>): string {
  return labels?.[key] || DOC_LABELS[key] || key || DRIVER_FIELD_MISSING;
}

function kindForDocument(key: string): DriverAlertKind {
  if (key === 'driver_license') return 'license';
  if (key === 'health_declaration') return 'health';
  if (key === 'traffic_ticket' || key === 'traffic_info') return 'traffic';
  return 'document';
}

function sectionForKind(kind: DriverAlertKind): string {
  if (kind === 'exam' || kind === 'safety') return 'driving';
  if (kind === 'task') return 'activity';
  return 'documents';
}

function classifyState(days: number | null, inProgress: boolean): DriverAlertState {
  if (days !== null && days < 0) return 'overdue';
  if (inProgress) return 'in_progress';
  return 'open';
}

function isUrgent(state: DriverAlertState, days: number | null, windowDays: number): boolean {
  if (state === 'completed') return false;
  if (days === null) return false;
  return days <= windowDays;
}

function inAlertWindow(days: number | null, windowDays: number): boolean {
  return days !== null && days <= windowDays;
}

function pushAlert(list: DriverAlertItem[], item: DriverAlertItem) {
  if (list.some((a) => a.id === item.id)) return;
  const collapsesIntoExistingDue = item.id.startsWith('doc-due:') || item.id.startsWith('safety-due:') || item.id.startsWith('decl-due:') || item.id.startsWith('exam-due:');
  if (collapsesIntoExistingDue && item.dueAt && list.some((a) => a.kind === item.kind && a.dueAt === item.dueAt)) return;
  list.push(item);
}

function datedAlert(input: {
  id: string;
  kind: DriverAlertKind;
  label: string;
  driverId: string;
  dueAt: string | null;
  openedAt: string | null;
  windowDays: number;
  today: string;
  inProgress?: boolean;
  detail?: string;
  docType?: string;
}): DriverAlertItem | null {
  const days = calendarDaysLeft(input.dueAt, input.today);
  if (!inAlertWindow(days, input.windowDays)) return null;
  const state = classifyState(days, !!input.inProgress);
  return {
    id: input.id,
    kind: input.kind,
    label: input.label,
    detail: input.detail || daysLeftLabel(days),
    openedAt: input.openedAt,
    dueAt: toIsoDate(input.dueAt),
    state,
    daysLeft: days,
    urgent: isUrgent(state, days, input.windowDays),
    hubLink: driverCardLink(input.driverId, sectionForKind(input.kind), input.docType),
  };
}

function openTaskAlert(input: {
  id: string;
  kind: DriverAlertKind;
  label: string;
  driverId: string;
  dueAt: string | null;
  openedAt: string | null;
  windowDays: number;
  today: string;
  inProgress?: boolean;
  detail: string;
  docType?: string;
}): DriverAlertItem {
  const days = calendarDaysLeft(input.dueAt, input.today);
  const state = classifyState(days, !!input.inProgress);
  return {
    id: input.id,
    kind: input.kind,
    label: input.label,
    detail: input.detail,
    openedAt: input.openedAt,
    dueAt: toIsoDate(input.dueAt),
    state,
    daysLeft: days,
    urgent: isUrgent(state, days, input.windowDays),
    hubLink: driverCardLink(input.driverId, sectionForKind(input.kind), input.docType),
  };
}

function byId<T extends { driver_id?: string | null; company_name?: string | null }>(
  rows: T[],
  driverId: string,
  driverCompany: string | null,
): T[] {
  return rows.filter((row) => row.driver_id === driverId && sameCompany(row.company_name, driverCompany));
}

function latestIso(values: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  for (const value of values) {
    const iso = toIsoDate(value);
    if (iso && (!best || iso > best)) best = iso;
  }
  return best;
}

function earliestIso(values: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  for (const value of values) {
    const iso = toIsoDate(value);
    if (iso && (!best || iso < best)) best = iso;
  }
  return best;
}

export function assembleDriverTrackingRows(bundle: DriverTrackingBundle): DriverTrackingRow[] {
  const today = bundle.today || toIsoDate(new Date().toISOString()) || '';
  const labels = bundle.labels || {};
  const thresholds = bundle.thresholdsByCompany;
  const accidents = bundle.accidents || [];

  return bundle.drivers
    .filter((driver) => clean(driver.status).toLowerCase() !== 'archived')
    .map((driver) => {
      const company = driver.company_name;
      const windowDays = thresholds?.get(company || '')?.firstDays ?? DEFAULT_ALERT_THRESHOLDS.firstDays;
      const alerts: DriverAlertItem[] = [];
      const history: DriverHistoryEntry[] = [];

      const vehicles = bundle.vehicles.filter(
        (v) => v.assigned_driver_id === driver.id
          && sameCompany(v.company_name, company)
          && clean(v.status).toLowerCase() !== 'archived'
          && clean(v.license_plate),
      );
      const plates = vehicles.map((v) => clean(v.license_plate));

      const exams = byId(bundle.exams, driver.id, company);
      const practical = byId(bundle.practicalExams, driver.id, company);
      const health = bundle.healthDeclarations.filter(
        (row) => row.driver_id === driver.id && sameCompany(row.company_name, company),
      );
      const declarations = byId(bundle.declarations, driver.id, company);
      const assignments = byId(bundle.assignments, driver.id, company);
      const documents = bundle.documents.filter(
        (row) => row.entity_id === driver.id && row.is_current && sameCompany(row.company_name, company),
      );
      const requests = bundle.documentRequests.filter(
        (row) => row.entity_id === driver.id && sameCompany(row.company_name, company),
      );
      const linkedAccidents = accidents.filter(
        (row) => accidentBelongsToDriver(row, driver.id) && sameCompany(row.company_name, company),
      );

      const licenseDoc = documents.find((d) => d.document_type_key === 'driver_license');
      const licenseAlert = datedAlert({
        id: `license:${driver.id}`,
        kind: 'license',
        label: DRIVER_ALERT_KIND_LABELS.license,
        driverId: driver.id,
        dueAt: driver.license_expiry,
        openedAt: licenseDoc?.created_at || null,
        windowDays,
        today,
        detail: `רישיון נהיגה · ${daysLeftLabel(calendarDaysLeft(driver.license_expiry, today))}`,
      });
      if (licenseAlert) pushAlert(alerts, licenseAlert);

      const examAlert = datedAlert({
        id: `exam-expiry:${driver.id}`,
        kind: 'exam',
        label: DRIVER_ALERT_KIND_LABELS.exam,
        driverId: driver.id,
        dueAt: driver.exam_expiry,
        openedAt: driver.last_exam_date,
        windowDays,
        today,
        detail: `מבחן נהיגה · ${daysLeftLabel(calendarDaysLeft(driver.exam_expiry, today))}`,
      });
      if (examAlert) pushAlert(alerts, examAlert);

      const latestByDate = (rows: DriverExamSource[]) => [...rows].sort((a, b) => (
        (b.completed_at || b.created_at || '').localeCompare(a.completed_at || a.created_at || '')
      ))[0]?.id;
      const latestSafetyId = latestByDate(exams.filter((exam) => exam.exam_type === 'safety'));
      const latestTheoryId = latestByDate(exams.filter((exam) => exam.exam_type !== 'safety'));

      for (const exam of exams) {
        const safety = exam.exam_type === 'safety';
        const kind: DriverAlertKind = safety ? 'safety' : 'exam';
        const label = safety
          ? DRIVER_ALERT_KIND_LABELS.safety
          : `מבחן ${EXAM_LABELS[exam.exam_type || ''] || exam.exam_type || 'נהיגה'}`;
        const when = exam.completed_at || exam.created_at;
        const finished = examFinished(exam.status, exam.passed);
        const displayExpiry = examDisplayExpiry(exam);
        const examFile = safeDocumentUrl(exam.signature_url);
        history.push({
          id: `exam:${exam.id}`,
          date: when,
          actionType: safety ? 'הדרכת בטיחות' : 'מבחן נהיגה',
          description: label,
          performedBy: DRIVER_FIELD_MISSING,
          result: resultText(exam.status, exam.passed),
          documentUrl: examFile,
          documentName: examFile ? 'אישור מבחן' : null,
          hubLink: driverCardLink(driver.id, 'driving'),
          nextFollowUp: displayExpiry ? validityPhrase(displayExpiry, today, windowDays) : DRIVER_FIELD_MISSING,
          completed: finished && (exam.passed === true || isSuccessStatus(exam.status) || exam.passed === false),
        });
        if (!finished) {
          pushAlert(alerts, openTaskAlert({
            id: `exam-open:${exam.id}`,
            kind,
            label,
            driverId: driver.id,
            dueAt: displayExpiry,
            openedAt: exam.created_at,
            windowDays,
            today,
            inProgress: isInProgressStatus(exam.status) || clean(exam.status).toLowerCase() === 'started',
            detail: resultText(exam.status, exam.passed),
          }));
        } else if (safety && exam.id === latestSafetyId) {
          const due = datedAlert({
            id: `safety-due:${exam.id}`,
            kind: 'safety',
            label: DRIVER_ALERT_KIND_LABELS.safety,
            driverId: driver.id,
            dueAt: displayExpiry,
            openedAt: when,
            windowDays,
            today,
          });
          if (due) pushAlert(alerts, due);
        } else if (!safety && exam.id === latestTheoryId) {
          const due = datedAlert({
            id: `exam-due:${exam.id}`,
            kind: 'exam',
            label: DRIVER_ALERT_KIND_LABELS.exam,
            driverId: driver.id,
            dueAt: displayExpiry,
            openedAt: when,
            windowDays,
            today,
          });
          if (due) pushAlert(alerts, due);
        }
      }

      for (const exam of practical) {
        const finished = examFinished(exam.status, exam.passed);
        const examFile = safeDocumentUrl(exam.driver_signature_url) || safeDocumentUrl(exam.examiner_signature_url);
        history.push({
          id: `practical:${exam.id}`,
          date: exam.exam_date || exam.created_at,
          actionType: 'מבחן נהיגה מעשי',
          description: clean(exam.notes) || 'מבחן מעשי',
          performedBy: textOrMissing(exam.examiner_name),
          result: resultText(exam.status, exam.passed),
          documentUrl: examFile,
          documentName: examFile ? 'אישור מבחן מעשי' : null,
          hubLink: driverCardLink(driver.id, 'driving'),
          nextFollowUp: DRIVER_FIELD_MISSING,
          completed: finished,
        });
        if (!finished) {
          pushAlert(alerts, openTaskAlert({
            id: `practical-open:${exam.id}`,
            kind: 'exam',
            label: 'מבחן מעשי',
            driverId: driver.id,
            dueAt: exam.exam_date,
            openedAt: exam.created_at,
            windowDays,
            today,
            inProgress: isInProgressStatus(exam.status),
            detail: resultText(exam.status, exam.passed),
          }));
        }
      }

      for (const row of health) {
        const file = safeDocumentUrl(row.signature_url);
        history.push({
          id: `health:${row.id}`,
          date: row.declaration_date || row.created_at,
          actionType: 'הצהרת בריאות',
          description: 'הצהרת בריאות מתועדת',
          performedBy: DRIVER_FIELD_MISSING,
          result: 'תועדה',
          documentUrl: file,
          documentName: file ? 'חתימת הצהרה' : null,
          hubLink: driverCardLink(driver.id, 'documents', 'health_declaration'),
          nextFollowUp: DRIVER_FIELD_MISSING,
          completed: true,
        });
      }

      for (const row of declarations) {
        const finished = isClosedStatus(row.status) || !!row.signed_at;
        history.push({
          id: `decl:${row.id}`,
          date: row.signed_at || row.created_at,
          actionType: 'הצהרה',
          description: 'הצהרת נהג',
          performedBy: DRIVER_FIELD_MISSING,
          result: row.signed_at ? 'נחתם' : statusText(row.status),
          documentUrl: safeDocumentUrl(row.pdf_url),
          documentName: safeDocumentUrl(row.pdf_url) ? 'מסמך הצהרה' : null,
          hubLink: driverCardLink(driver.id, 'documents'),
          nextFollowUp: row.expires_at ? validityPhrase(row.expires_at, today, windowDays) : DRIVER_FIELD_MISSING,
          completed: finished && (isSuccessStatus(row.status) || !!row.signed_at),
        });
        if (!finished) {
          pushAlert(alerts, openTaskAlert({
            id: `decl-open:${row.id}`,
            kind: 'declaration',
            label: DRIVER_ALERT_KIND_LABELS.declaration,
            driverId: driver.id,
            dueAt: row.expires_at,
            openedAt: row.created_at,
            windowDays,
            today,
            detail: statusText(row.status),
          }));
        } else {
          const due = datedAlert({
            id: `decl-due:${row.id}`,
            kind: 'declaration',
            label: DRIVER_ALERT_KIND_LABELS.declaration,
            driverId: driver.id,
            dueAt: row.expires_at,
            openedAt: row.signed_at || row.created_at,
            windowDays,
            today,
          });
          if (due) pushAlert(alerts, due);
        }
      }

      for (const row of assignments) {
        const finished = isClosedStatus(row.status);
        history.push({
          id: `task:${row.id}`,
          date: row.scheduled_date || row.created_at,
          actionType: 'משימה',
          description: clean(row.title) || clean(row.description) || 'משימה',
          performedBy: DRIVER_FIELD_MISSING,
          result: statusText(row.status),
          documentUrl: null,
          documentName: null,
          hubLink: driverCardLink(driver.id, 'activity'),
          nextFollowUp: showDate(row.scheduled_date),
          completed: finished && isSuccessStatus(row.status),
        });
        if (!finished) {
          pushAlert(alerts, openTaskAlert({
            id: `task-open:${row.id}`,
            kind: 'task',
            label: clean(row.title) || DRIVER_ALERT_KIND_LABELS.task,
            driverId: driver.id,
            dueAt: row.scheduled_date,
            openedAt: row.created_at,
            windowDays,
            today,
            inProgress: isInProgressStatus(row.status),
            detail: clean(row.description) || statusText(row.status),
          }));
        }
      }

      for (const doc of documents) {
        const label = docLabel(doc.document_type_key, labels);
        history.push({
          id: `doc:${doc.id}`,
          date: doc.created_at,
          actionType: 'מסמך',
          description: label,
          performedBy: DRIVER_FIELD_MISSING,
          result: doc.expiry_date ? validityPhrase(doc.expiry_date, today, windowDays) : 'קיים',
          documentUrl: safeDocumentUrl(doc.public_url),
          documentName: safeDocumentUrl(doc.public_url) ? (clean(doc.original_name) || label) : null,
          hubLink: driverCardLink(driver.id, 'documents', doc.document_type_key),
          nextFollowUp: doc.expiry_date ? validityPhrase(doc.expiry_date, today, windowDays) : DRIVER_FIELD_MISSING,
          completed: false,
        });
        const due = datedAlert({
          id: `doc-due:${doc.id}`,
          kind: kindForDocument(doc.document_type_key),
          label,
          driverId: driver.id,
          dueAt: doc.expiry_date,
          openedAt: doc.created_at,
          windowDays,
          today,
          docType: doc.document_type_key,
          detail: `${label} · ${daysLeftLabel(calendarDaysLeft(doc.expiry_date, today))}`,
        });
        if (due) pushAlert(alerts, due);
      }

      for (const req of requests) {
        const label = docLabel(req.document_type_key, labels);
        const pending = PENDING_REQUEST.has(clean(req.status).toLowerCase());
        const finished = isClosedStatus(req.status);
        history.push({
          id: `req:${req.id}`,
          date: req.created_at,
          actionType: 'בקשת מסמך',
          description: label,
          performedBy: textOrMissing(req.requested_by_name),
          result: statusText(req.status),
          documentUrl: null,
          documentName: null,
          hubLink: driverCardLink(driver.id, 'documents', req.document_type_key),
          nextFollowUp: req.token_expires_at ? validityPhrase(req.token_expires_at, today, windowDays) : DRIVER_FIELD_MISSING,
          completed: finished && isSuccessStatus(req.status),
        });
        if (pending && !finished) {
          pushAlert(alerts, openTaskAlert({
            id: `req-open:${req.id}`,
            kind: kindForDocument(req.document_type_key),
            label: `בקשה · ${label}`,
            driverId: driver.id,
            dueAt: req.token_expires_at,
            openedAt: req.created_at,
            windowDays,
            today,
            inProgress: isInProgressStatus(req.status),
            docType: req.document_type_key,
            detail: statusText(req.status),
          }));
        }
      }

      for (const accident of linkedAccidents) {
        history.push({
          id: `acc:${accident.id}`,
          date: accident.date,
          actionType: 'תאונה',
          description: clean(accident.description) || clean(accident.event_number) || 'אירוע מקושר במזהה נהג',
          performedBy: DRIVER_FIELD_MISSING,
          result: statusText(accident.status),
          documentUrl: null,
          documentName: null,
          hubLink: `/accidents?id=${encodeURIComponent(accident.id)}`,
          nextFollowUp: DRIVER_FIELD_MISSING,
          completed: isClosedStatus(accident.status) && isSuccessStatus(accident.status),
        });
        if (!isClosedStatus(accident.status)) {
          pushAlert(alerts, openTaskAlert({
            id: `acc-open:${accident.id}`,
            kind: 'task',
            label: 'תאונה',
            driverId: driver.id,
            dueAt: null,
            openedAt: accident.date,
            windowDays,
            today,
            detail: clean(accident.description) || statusText(accident.status),
          }));
        }
      }

      const licensePhoto = safeDocumentUrl(driver.license_image_url);
      const licenseDocUrl = safeDocumentUrl(licenseDoc?.public_url);
      if (licensePhoto && licensePhoto !== licenseDocUrl) {
        history.push({
          id: `license-photo:${driver.id}`,
          date: null,
          actionType: 'רישיון נהיגה',
          description: 'צילום רישיון',
          performedBy: DRIVER_FIELD_MISSING,
          result: 'קיים',
          documentUrl: licensePhoto,
          documentName: 'צילום רישיון',
          hubLink: driverCardLink(driver.id, 'documents', 'driver_license'),
          nextFollowUp: validityPhrase(driver.license_expiry, today, windowDays),
          completed: false,
        });
      }

      alerts.sort((a, b) => {
        if (a.daysLeft === null && b.daysLeft === null) return 0;
        if (a.daysLeft === null) return 1;
        if (b.daysLeft === null) return -1;
        return a.daysLeft - b.daysLeft;
      });
      history.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

      const safetyExams = exams.filter((e) => e.exam_type === 'safety');
      const safetyLatest = [...safetyExams].sort((a, b) => (
        (b.completed_at || b.created_at || '').localeCompare(a.completed_at || a.created_at || '')
      ))[0];
      const theory = exams.filter((e) => e.exam_type !== 'safety');
      const theoryLatest = [...theory].sort((a, b) => (
        (b.completed_at || b.created_at || '').localeCompare(a.completed_at || a.created_at || '')
      ))[0];
      const practicalLatest = [...practical].sort((a, b) => (
        (b.exam_date || b.created_at || '').localeCompare(a.exam_date || a.created_at || '')
      ))[0];

      const examCandidates = [
        theoryLatest
          ? { at: theoryLatest.completed_at || theoryLatest.created_at, result: resultText(theoryLatest.status, theoryLatest.passed), next: examDisplayExpiry(theoryLatest) }
          : null,
        practicalLatest
          ? { at: practicalLatest.exam_date || practicalLatest.created_at, result: resultText(practicalLatest.status, practicalLatest.passed), next: null }
          : null,
      ].filter(Boolean) as { at: string | null; result: string; next: string | null }[];
      examCandidates.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
      const examSummary = examCandidates[0];

      const trafficDocs = documents.filter((d) => d.document_type_key === 'traffic_ticket' || d.document_type_key === 'traffic_info');
      const healthDocs = documents.filter((d) => d.document_type_key === 'health_declaration');
      const lastActionIso = latestIso(history.map((h) => h.date));
      const nextActionIso = earliestIso(alerts.map((a) => a.dueAt));

      const grades = (driver.license_types || []).map((g) => clean(g)).filter(Boolean);

      return {
        id: driver.id,
        fullName: textOrMissing(driver.full_name),
        employeeNumber: textOrMissing(driver.id_number),
        employeeNumberRaw: clean(driver.id_number),
        phone: textOrMissing(driver.phone),
        phoneRaw: clean(driver.phone),
        department: textOrMissing(driver.department),
        departmentRaw: clean(driver.department),
        companyName: textOrMissing(company),
        vehiclePlates: plates.length ? plates.join(', ') : DRIVER_FIELD_ABSENT,
        vehiclePlatesRaw: plates.join(' '),
        licenseNumber: textOrMissing(driver.license_number),
        licenseGrades: grades.length ? grades.join(', ') : DRIVER_FIELD_MISSING,
        licenseExpiry: validityPhrase(driver.license_expiry, today, windowDays),
        licenseCheckLast: licenseDoc ? showDate(licenseDoc.created_at) : DRIVER_FIELD_MISSING,
        licenseCheckNext: licenseDoc?.expiry_date
          ? validityPhrase(licenseDoc.expiry_date, today, windowDays)
          : DRIVER_FIELD_MISSING,
        safetyDone: safetyLatest ? showDate(safetyLatest.completed_at || safetyLatest.created_at) : DRIVER_FIELD_ABSENT,
        safetyNext: safetyLatest
          ? validityPhrase(examDisplayExpiry(safetyLatest), today, windowDays, DRIVER_FIELD_MISSING)
          : DRIVER_FIELD_ABSENT,
        examDone: examSummary ? showDate(examSummary.at) : (driver.last_exam_date ? showDate(driver.last_exam_date) : DRIVER_FIELD_ABSENT),
        examResult: examSummary ? examSummary.result : DRIVER_FIELD_ABSENT,
        examNext: validityPhrase(
          driver.exam_expiry || examSummary?.next || null,
          today,
          windowDays,
          examSummary || driver.exam_expiry || driver.last_exam_date ? DRIVER_FIELD_MISSING : DRIVER_FIELD_ABSENT,
        ),
        healthText: healthDocs[0]?.expiry_date
          ? validityPhrase(healthDocs[0].expiry_date, today, windowDays)
          : (health.length || healthDocs.length
            ? showDate(health[0]?.declaration_date || health[0]?.created_at || healthDocs[0]?.created_at, DRIVER_FIELD_MISSING)
            : DRIVER_FIELD_ABSENT),
        approvalText: DRIVER_FIELD_ABSENT,
        accidentsText: linkedAccidents.length
          ? linkedAccidents.map((a) => clean(a.description) || statusText(a.status)).join(' · ')
          : DRIVER_FIELD_ABSENT,
        trafficText: trafficDocs.length
          ? trafficDocs.map((d) => (
            d.expiry_date
              ? `${docLabel(d.document_type_key, labels)} · ${validityPhrase(d.expiry_date, today, windowDays)}`
              : docLabel(d.document_type_key, labels)
          )).join(', ')
          : DRIVER_FIELD_ABSENT,
        status: clean(driver.status),
        statusText: driver.status ? statusText(driver.status) : DRIVER_FIELD_MISSING,
        lastAction: showDate(lastActionIso),
        nextAction: showDate(nextActionIso),
        nextActionIso,
        alertItems: alerts,
        history,
        alertWindowDays: windowDays,
      };
    });
}

export function applyDriverSummaryFilter(
  rows: DriverTrackingRow[],
  key: DriverSummaryKey | null,
): DriverTrackingRow[] {
  if (!key || key === 'total') return rows;
  if (key === 'open') return rows.filter((r) => r.alertItems.some((a) => a.state === 'open'));
  if (key === 'overdue') return rows.filter((r) => r.alertItems.some((a) => a.state === 'overdue'));
  if (key === 'in_progress') return rows.filter((r) => r.alertItems.some((a) => a.state === 'in_progress'));
  if (key === 'completed') return rows.filter((r) => r.history.some((h) => h.completed));
  return rows;
}

function dateInRange(iso: string | null, from: string, to: string): boolean {
  const day = toIsoDate(iso);
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

export function applyDriverFilters(rows: DriverTrackingRow[], filters: DriverTrackingFilters): DriverTrackingRow[] {
  const search = clean(filters.search).toLowerCase();
  const searchNorm = normSearch(filters.search);
  return rows.filter((row) => {
    if (search) {
      const hay = `${row.fullName} ${row.employeeNumberRaw} ${row.vehiclePlatesRaw}`.toLowerCase();
      const hayNorm = normSearch(hay);
      if (!hay.includes(search) && !hayNorm.includes(searchNorm)) return false;
    }
    if (filters.department && row.departmentRaw !== filters.department) return false;
    if (filters.status && row.status !== filters.status && row.statusText !== filters.status) return false;
    if (filters.alertKind && !row.alertItems.some((a) => a.kind === filters.alertKind)) return false;
    if (filters.overdue && !row.alertItems.some((a) => a.state === 'overdue')) return false;
    if (filters.approaching && !row.alertItems.some((a) => a.urgent && a.daysLeft !== null && a.daysLeft >= 0)) return false;
    if (filters.dateFrom || filters.dateTo) {
      const hit = row.alertItems.some((a) => dateInRange(a.dueAt, filters.dateFrom, filters.dateTo))
        || dateInRange(row.nextActionIso, filters.dateFrom, filters.dateTo);
      if (!hit) return false;
    }
    return true;
  });
}

export function sortDriverRows(rows: DriverTrackingRow[], sort: DriverSortKey): DriverTrackingRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (sort === 'name') return a.fullName.localeCompare(b.fullName, 'he');
    if (sort === 'date') {
      if (!a.nextActionIso && !b.nextActionIso) return a.fullName.localeCompare(b.fullName, 'he');
      if (!a.nextActionIso) return 1;
      if (!b.nextActionIso) return -1;
      return a.nextActionIso.localeCompare(b.nextActionIso) || a.fullName.localeCompare(b.fullName, 'he');
    }
    const urgency = (row: DriverTrackingRow) => {
      const days = row.alertItems.map((item) => item.daysLeft).filter((n): n is number => n !== null);
      return days.length ? Math.min(...days) : Number.POSITIVE_INFINITY;
    };
    return urgency(a) - urgency(b) || a.fullName.localeCompare(b.fullName, 'he');
  });
  return copy;
}

export function buildDriverSummaryCounts(rows: DriverTrackingRow[]): Record<DriverSummaryKey, number> {
  let open = 0;
  let overdue = 0;
  let inProgress = 0;
  let completed = 0;
  for (const row of rows) {
    for (const alert of row.alertItems) {
      if (alert.state === 'overdue') overdue += 1;
      else if (alert.state === 'in_progress') inProgress += 1;
      else if (alert.state === 'open') open += 1;
    }
    completed += row.history.filter((item) => item.completed).length;
  }
  return {
    total: rows.length,
    open,
    overdue,
    in_progress: inProgress,
    completed,
  };
}

const VALIDITY_KINDS: Record<Exclude<DriverValidityKey, 'expired'>, DriverAlertKind[]> = {
  license_soon: ['license'],
  exam_renewal: ['exam'],
  health_soon: ['health'],
  safety_renewal: ['safety'],
  document_soon: ['document', 'traffic', 'declaration'],
};

/** Profile dates and current-document expiries. Open tasks and request tokens stay out. */
function isStoredValidityAlert(alert: DriverAlertItem): boolean {
  return alert.daysLeft !== null && (
    alert.id.startsWith('license:')
    || alert.id.startsWith('exam-expiry:')
    || alert.id.startsWith('exam-due:')
    || alert.id.startsWith('safety-due:')
    || alert.id.startsWith('decl-due:')
    || alert.id.startsWith('doc-due:')
  );
}

export function driverMatchesValidity(row: DriverTrackingRow, key: DriverValidityKey): boolean {
  const alerts = row.alertItems.filter(isStoredValidityAlert);
  if (key === 'expired') return alerts.some((alert) => alert.daysLeft !== null && alert.daysLeft < 0);
  return alerts.some((alert) =>
    VALIDITY_KINDS[key].includes(alert.kind)
    && alert.daysLeft !== null
    && alert.daysLeft >= 0
    && alert.daysLeft <= row.alertWindowDays,
  );
}

export function applyDriverValidityFilter(
  rows: DriverTrackingRow[],
  key: DriverValidityKey | null,
): DriverTrackingRow[] {
  if (!key) return rows;
  return rows.filter((row) => driverMatchesValidity(row, key));
}

export function buildDriverValidityCounts(rows: DriverTrackingRow[]): Record<DriverValidityKey, number> {
  const counts: Record<DriverValidityKey, number> = {
    license_soon: 0,
    exam_renewal: 0,
    health_soon: 0,
    safety_renewal: 0,
    document_soon: 0,
    expired: 0,
  };
  for (const row of rows) {
    for (const key of DRIVER_VALIDITY_KEYS) {
      if (driverMatchesValidity(row, key)) counts[key] += 1;
    }
  }
  return counts;
}
