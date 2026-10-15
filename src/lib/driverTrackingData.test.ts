import { describe, expect, it } from 'vitest';
import { DEFAULT_ALERT_THRESHOLDS, type CompanyAlertThresholds } from '@/lib/vehicleTrackingAlerts';
import {
  DRIVER_FIELD_ABSENT,
  DRIVER_FIELD_MISSING,
  accidentBelongsToDriver,
  applyDriverFilters,
  applyDriverSummaryFilter,
  assembleDriverTrackingRows,
  buildDriverSummaryCounts,
  sortDriverRows,
  type DriverTrackingBundle,
} from './driverTrackingData';

const TODAY = '2026-10-15';

function thresholds(firstDays: number): Map<string, CompanyAlertThresholds> {
  return new Map([['בארי', { ...DEFAULT_ALERT_THRESHOLDS, firstDays }]]);
}

function bundle(extra: Partial<DriverTrackingBundle> = {}): DriverTrackingBundle {
  return {
    drivers: [{
      id: 'd1',
      full_name: 'יוסי לוי',
      id_number: '100',
      phone: '050-0000000',
      department: 'הסעות',
      company_name: 'בארי',
      status: 'active',
      license_number: 'L-1',
      license_types: ['B', 'C'],
      license_expiry: '2026-11-01',
      exam_expiry: '2026-12-20',
      last_exam_date: null,
    }],
    vehicles: [{
      id: 'v1',
      license_plate: '12-345-67',
      assigned_driver_id: 'd1',
      company_name: 'בארי',
      status: 'active',
    }],
    exams: [],
    practicalExams: [],
    healthDeclarations: [],
    declarations: [],
    assignments: [],
    documents: [],
    documentRequests: [],
    today: TODAY,
    thresholdsByCompany: thresholds(30),
    ...extra,
  };
}

describe('driver tracking alerts', () => {
  it('marks a license inside the company window in red and leaves a later exam date out', () => {
    const [row] = assembleDriverTrackingRows(bundle());
    const license = row.alertItems.find((a) => a.kind === 'license');
    expect(license?.urgent).toBe(true);
    expect(license?.state).toBe('open');
    expect(license?.daysLeft).toBe(17);
    expect(row.alertItems.some((a) => a.kind === 'exam')).toBe(false);
    expect(row.licenseExpiry).not.toBe(DRIVER_FIELD_MISSING);
    expect(row.examNext).not.toBe(DRIVER_FIELD_ABSENT);
  });

  it('uses alert_days_before instead of a fixed 30', () => {
    const [inside] = assembleDriverTrackingRows(bundle({
      drivers: [{
        ...bundle().drivers[0],
        license_expiry: '2026-10-25',
      }],
      thresholdsByCompany: thresholds(10),
    }));
    expect(inside.alertItems.find((a) => a.kind === 'license')?.urgent).toBe(true);

    const [outside] = assembleDriverTrackingRows(bundle({
      drivers: [{
        ...bundle().drivers[0],
        license_expiry: '2026-11-01',
      }],
      thresholdsByCompany: thresholds(10),
    }));
    expect(outside.alertItems.some((a) => a.kind === 'license')).toBe(false);
    expect(outside.alertWindowDays).toBe(10);
  });

  it('keeps an overdue license red until it is no longer the open date', () => {
    const [row] = assembleDriverTrackingRows(bundle({
      drivers: [{ ...bundle().drivers[0], license_expiry: '2026-10-01' }],
    }));
    const license = row.alertItems.find((a) => a.kind === 'license');
    expect(license?.state).toBe('overdue');
    expect(license?.urgent).toBe(true);
    expect(license?.daysLeft).toBe(-14);
  });

  it('keeps a completed task in history and out of active warnings', () => {
    const [row] = assembleDriverTrackingRows(bundle({
      assignments: [{
        id: 't1',
        driver_id: 'd1',
        company_name: 'בארי',
        title: 'חידוש רישיון',
        description: 'נסגר',
        status: 'completed',
        scheduled_date: '2026-10-01',
        created_at: '2026-09-01',
      }],
    }));
    expect(row.alertItems.some((a) => a.id.includes('t1'))).toBe(false);
    const history = row.history.find((h) => h.id === 'task:t1');
    expect(history?.completed).toBe(true);
    expect(history?.result).toBe('הושלם');
  });

  it('shows an open task without a due date, and does not paint it red', () => {
    const [row] = assembleDriverTrackingRows(bundle({
      assignments: [{
        id: 't2',
        driver_id: 'd1',
        company_name: 'בארי',
        title: 'שיחת בטיחות',
        description: null,
        status: 'open',
        scheduled_date: null,
        created_at: '2026-10-10',
      }],
    }));
    const task = row.alertItems.find((a) => a.id === 'task-open:t2');
    expect(task?.state).toBe('open');
    expect(task?.urgent).toBe(false);
    expect(task?.daysLeft).toBeNull();
  });

  it('does not attach another company record or a name-only accident', () => {
    expect(accidentBelongsToDriver({ driver_name: 'יוסי לוי' }, 'd1')).toBe(false);
    expect(accidentBelongsToDriver({ driver_id: 'd1', driver_name: 'מישהו אחר' }, 'd1')).toBe(true);

    const [row] = assembleDriverTrackingRows(bundle({
      exams: [{
        id: 'e-other',
        driver_id: 'd1',
        company_name: 'חברה אחרת',
        exam_type: 'safety',
        status: 'completed',
        passed: true,
        completed_at: '2026-01-01',
        created_at: '2026-01-01',
        expires_at: '2026-10-20',
        score: 90,
      }],
      accidents: [{
        id: 'a1',
        driver_name: 'יוסי לוי',
        company_name: 'בארי',
        date: '2026-08-01',
        description: 'פגיעה',
        status: 'open',
      }],
    }));
    expect(row.history.some((h) => h.id === 'exam:e-other')).toBe(false);
    expect(row.accidentsText).toBe(DRIVER_FIELD_ABSENT);
    expect(row.history.some((h) => h.actionType === 'תאונה')).toBe(false);
  });

  it('shows an accident only when the row carries the driver id', () => {
    const [row] = assembleDriverTrackingRows(bundle({
      accidents: [{
        id: 'a2',
        driver_id: 'd1',
        driver_name: 'שם לא תואם',
        company_name: 'בארי',
        date: '2026-08-01',
        description: 'אירוע מזוהה',
        status: 'open',
      }],
    }));
    expect(row.accidentsText).toContain('אירוע מזוהה');
    expect(row.history.some((h) => h.id === 'acc:a2')).toBe(true);
  });

  it('does not duplicate a license alert from a document with the same expiry', () => {
    const [row] = assembleDriverTrackingRows(bundle({
      documents: [{
        id: 'doc1',
        entity_id: 'd1',
        company_name: 'בארי',
        document_type_key: 'driver_license',
        expiry_date: '2026-11-01',
        created_at: '2026-01-02',
        is_current: true,
        original_name: 'license.pdf',
        public_url: 'https://files.example/license.pdf',
      }],
    }));
    expect(row.alertItems.filter((a) => a.kind === 'license')).toHaveLength(1);
    expect(row.licenseCheckLast).not.toBe(DRIVER_FIELD_MISSING);
    expect(row.history.some((h) => h.documentUrl === 'https://files.example/license.pdf')).toBe(true);
  });

  it('reads safety training and leaves missing health and approval empty', () => {
    const [row] = assembleDriverTrackingRows(bundle({
      exams: [{
        id: 's1',
        driver_id: 'd1',
        company_name: 'בארי',
        exam_type: 'safety',
        status: 'completed',
        passed: true,
        completed_at: '2026-09-01',
        created_at: '2026-09-01',
        expires_at: '2026-10-20',
        score: 80,
      }],
    }));
    expect(row.safetyDone).not.toBe(DRIVER_FIELD_ABSENT);
    expect(row.alertItems.some((a) => a.kind === 'safety' && a.urgent)).toBe(true);
    expect(row.healthText).toBe(DRIVER_FIELD_ABSENT);
    expect(row.approvalText).toBe(DRIVER_FIELD_ABSENT);
    expect(row.trafficText).toBe(DRIVER_FIELD_ABSENT);
  });

  it('does not keep an older safety course as an active alert after a newer one', () => {
    const [row] = assembleDriverTrackingRows(bundle({
      exams: [
        {
          id: 'old',
          driver_id: 'd1',
          company_name: 'בארי',
          exam_type: 'safety',
          status: 'completed',
          passed: true,
          completed_at: '2024-01-01',
          created_at: '2024-01-01',
          expires_at: '2025-01-01',
          score: 70,
        },
        {
          id: 'new',
          driver_id: 'd1',
          company_name: 'בארי',
          exam_type: 'safety',
          status: 'completed',
          passed: true,
          completed_at: '2026-09-01',
          created_at: '2026-09-01',
          expires_at: '2027-09-01',
          score: 90,
        },
      ],
    }));
    expect(row.alertItems.some((a) => a.kind === 'safety')).toBe(false);
    expect(row.history.filter((h) => h.actionType === 'הדרכת בטיחות')).toHaveLength(2);
    expect(row.safetyNext).not.toBe(DRIVER_FIELD_ABSENT);
  });

  it('labels empty profile fields without inventing them', () => {
    const [row] = assembleDriverTrackingRows(bundle({
      drivers: [{
        ...bundle().drivers[0],
        phone: null,
        department: null,
        id_number: null,
        license_number: null,
        license_types: [],
        license_expiry: null,
      }],
      vehicles: [],
    }));
    expect(row.phone).toBe(DRIVER_FIELD_MISSING);
    expect(row.department).toBe(DRIVER_FIELD_MISSING);
    expect(row.employeeNumber).toBe(DRIVER_FIELD_MISSING);
    expect(row.licenseNumber).toBe(DRIVER_FIELD_MISSING);
    expect(row.licenseGrades).toBe(DRIVER_FIELD_MISSING);
    expect(row.vehiclePlates).toBe(DRIVER_FIELD_ABSENT);
    expect(row.licenseCheckLast).toBe(DRIVER_FIELD_MISSING);
  });
});

describe('driver tracking filters', () => {
  const rows = assembleDriverTrackingRows({
    ...bundle(),
    drivers: [
      bundle().drivers[0],
      {
        ...bundle().drivers[0],
        id: 'd2',
        full_name: 'דנה כהן',
        id_number: '200',
        department: 'מחסן',
        license_expiry: '2026-10-01',
        exam_expiry: null,
      },
    ],
    vehicles: [
      ...bundle().vehicles,
      {
        id: 'v2',
        license_plate: '99-999-99',
        assigned_driver_id: 'd2',
        company_name: 'בארי',
        status: 'active',
      },
    ],
    assignments: [{
      id: 't3',
      driver_id: 'd2',
      company_name: 'בארי',
      title: 'טיפול',
      description: null,
      status: 'in_progress',
      scheduled_date: '2026-12-01',
      created_at: '2026-10-12',
    }],
    today: TODAY,
    thresholdsByCompany: thresholds(30),
  });

  it('searches by name, employee number and plate', () => {
    expect(applyDriverFilters(rows, { ...empty(), search: 'דנה' }).map((r) => r.id)).toEqual(['d2']);
    expect(applyDriverFilters(rows, { ...empty(), search: '100' }).map((r) => r.id)).toEqual(['d1']);
    expect(applyDriverFilters(rows, { ...empty(), search: '99999' }).map((r) => r.id)).toEqual(['d2']);
  });

  it('filters department, alert kind, status, dates, overdue and approaching', () => {
    expect(applyDriverFilters(rows, { ...empty(), department: 'מחסן' }).map((r) => r.id)).toEqual(['d2']);
    expect(applyDriverFilters(rows, { ...empty(), alertKind: 'task' }).map((r) => r.id)).toEqual(['d2']);
    expect(applyDriverFilters(rows, { ...empty(), status: 'פעיל' })).toHaveLength(2);
    expect(applyDriverFilters(rows, { ...empty(), overdue: true }).map((r) => r.id)).toEqual(['d2']);
    expect(applyDriverFilters(rows, { ...empty(), approaching: true }).map((r) => r.id)).toEqual(['d1']);
    expect(applyDriverFilters(rows, { ...empty(), dateFrom: '2026-12-01', dateTo: '2026-12-01' }).map((r) => r.id)).toEqual(['d2']);
  });

  it('sorts by urgency and counts open, overdue, in progress and completed', () => {
    expect(sortDriverRows(rows, 'urgency').map((r) => r.id)).toEqual(['d2', 'd1']);
    expect(sortDriverRows(rows, 'name').map((r) => r.id)[0]).toBeTruthy();
    const counts = buildDriverSummaryCounts(rows);
    expect(counts.total).toBe(2);
    expect(counts.overdue).toBe(1);
    expect(counts.open).toBe(1);
    expect(counts.in_progress).toBe(1);
    expect(applyDriverSummaryFilter(rows, 'overdue').map((r) => r.id)).toEqual(['d2']);
    expect(applyDriverSummaryFilter(rows, 'completed')).toHaveLength(0);
  });
});

function empty() {
  return {
    search: '',
    department: '',
    status: '',
    alertKind: '' as const,
    dateFrom: '',
    dateTo: '',
    overdue: false,
    approaching: false,
  };
}
