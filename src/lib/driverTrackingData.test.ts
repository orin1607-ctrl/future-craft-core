import { describe, expect, it } from 'vitest';
import { DEFAULT_ALERT_THRESHOLDS, type CompanyAlertThresholds } from '@/lib/vehicleTrackingAlerts';
import {
  DRIVER_FIELD_ABSENT,
  DRIVER_FIELD_MISSING,
  accidentBelongsToDriver,
  addMonthsToDate,
  applyDriverFilters,
  applyDriverSummaryFilter,
  applyDriverValidityFilter,
  assembleDriverTrackingRows,
  buildDriverSummaryCounts,
  buildDriverValidityCounts,
  examDisplayExpiry,
  safeDocumentUrl,
  sortDriverRows,
  type DriverTrackingBundle,
  type DriverTrackingRow,
  type DriverValidityKey,
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

describe('driver tracking live links', () => {
  it('shows valid, approaching and expired license states with day counts', () => {
    const valid = assembleDriverTrackingRows(bundle({
      drivers: [{ ...bundle().drivers[0], license_expiry: '2027-10-15', exam_expiry: null }],
    }))[0];
    expect(valid.licenseExpiry).toContain('תקף');
    expect(valid.licenseExpiry).toContain('365 ימים');
    expect(valid.alertItems.some((a) => a.kind === 'license')).toBe(false);

    const soon = assembleDriverTrackingRows(bundle({
      drivers: [{ ...bundle().drivers[0], license_expiry: '2026-10-25', exam_expiry: null }],
    }))[0];
    expect(soon.licenseExpiry).toContain('עומד לפוג');
    expect(soon.alertItems.find((a) => a.kind === 'license')?.urgent).toBe(true);
    expect(soon.alertItems.find((a) => a.kind === 'license')?.hubLink).toContain('section=documents');

    const expired = assembleDriverTrackingRows(bundle({
      drivers: [{ ...bundle().drivers[0], license_expiry: '2026-10-01', exam_expiry: null }],
    }))[0];
    expect(expired.licenseExpiry).toContain('פג תוקף');
    expect(expired.licenseExpiry).toContain('ימים באיחור');
    expect(expired.alertItems.find((a) => a.kind === 'license')?.state).toBe('overdue');
  });

  it('computes an exam date from stored months and a completed date, and does not invent five years', () => {
    expect(addMonthsToDate('2026-01-31', 1)).toBe('2026-02-28');
    expect(examDisplayExpiry({
      expires_at: null,
      exam_validity_months: 12,
      completed_at: '2026-01-15',
    })).toBe('2027-01-15');
    expect(examDisplayExpiry({
      expires_at: '2026-05-01',
      exam_validity_months: 60,
      completed_at: '2021-05-01',
    })).toBe('2026-05-01');
    expect(examDisplayExpiry({
      expires_at: null,
      exam_validity_months: 60,
      completed_at: null,
    })).toBeNull();

    const [row] = assembleDriverTrackingRows(bundle({
      drivers: [{ ...bundle().drivers[0], exam_expiry: null, license_expiry: '2027-10-15' }],
      exams: [{
        id: 'months',
        driver_id: 'd1',
        company_name: 'בארי',
        exam_type: 'periodic',
        status: 'completed',
        passed: true,
        completed_at: '2025-10-20',
        created_at: '2025-10-20',
        expires_at: null,
        exam_validity_months: 12,
        signature_url: 'https://files.example/exam.pdf',
        score: 90,
      }],
    }));
    expect(row.examNext).toContain('2026');
    expect(row.examNext).toContain('עומד לפוג');
    expect(row.alertItems.some((a) => a.kind === 'exam' && a.urgent)).toBe(true);
    expect(row.history.find((h) => h.id === 'exam:months')?.documentUrl).toBe('https://files.example/exam.pdf');
    expect(row.history.find((h) => h.id === 'exam:months')?.hubLink).toContain('section=driving');
    expect(row.examNext).not.toContain('2030');
  });

  it('keeps a document without an expiry date out of red alerts and rejects a broken file link', () => {
    const [row] = assembleDriverTrackingRows(bundle({
      drivers: [{ ...bundle().drivers[0], license_expiry: null, exam_expiry: null, license_image_url: 'javascript:alert(1)' }],
      documents: [{
        id: 'plain',
        entity_id: 'd1',
        company_name: 'בארי',
        document_type_key: 'health_declaration',
        expiry_date: null,
        created_at: '2026-03-01',
        is_current: true,
        original_name: 'health.pdf',
        public_url: 'not a url',
      }],
    }));
    expect(row.alertItems.some((a) => a.kind === 'health')).toBe(false);
    expect(row.healthText).not.toContain('פג תוקף');
    expect(row.history.find((h) => h.id === 'doc:plain')?.documentUrl).toBeNull();
    expect(row.history.some((h) => h.id === 'license-photo:d1')).toBe(false);
    expect(safeDocumentUrl('javascript:alert(1)')).toBeNull();
  });

  it('does not attach another company document or its file', () => {
    const [row] = assembleDriverTrackingRows(bundle({
      documents: [{
        id: 'other-co',
        entity_id: 'd1',
        company_name: 'חברה אחרת',
        document_type_key: 'driver_license',
        expiry_date: '2026-10-01',
        created_at: '2026-01-01',
        is_current: true,
        original_name: 'secret.pdf',
        public_url: 'https://files.example/secret.pdf',
      }],
    }));
    expect(row.history.some((h) => h.documentUrl === 'https://files.example/secret.pdf')).toBe(false);
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

describe('driver validity cards', () => {
  function listed(rows: DriverTrackingRow[], key: DriverValidityKey) {
    const matches = applyDriverValidityFilter(rows, key);
    expect(new Set(matches.map((row) => row.id)).size).toBe(matches.length);
    expect(matches).toHaveLength(buildDriverValidityCounts(rows)[key]);
    return matches.map((row) => row.id);
  }

  it('counts an approaching license once and keeps an expired license on the overdue card', () => {
    const soon = assembleDriverTrackingRows(bundle());
    expect(listed(soon, 'license_soon')).toEqual(['d1']);
    expect(listed(soon, 'expired')).toEqual([]);
    expect(soon[0].alertItems.find((alert) => alert.kind === 'license')?.hubLink).toContain('driverId=d1');

    const expired = assembleDriverTrackingRows(bundle({
      drivers: [{ ...bundle().drivers[0], license_expiry: '2026-10-01', exam_expiry: null }],
    }));
    expect(listed(expired, 'license_soon')).toEqual([]);
    expect(listed(expired, 'expired')).toEqual(['d1']);
  });

  it('counts one driver once when two license dates are both inside the window', () => {
    const rows = assembleDriverTrackingRows(bundle({
      documents: [{
        id: 'doc-license',
        entity_id: 'd1',
        company_name: bundle().drivers[0].company_name,
        document_type_key: 'driver_license',
        expiry_date: '2026-10-20',
        created_at: '2026-01-02',
        is_current: true,
        original_name: 'license.pdf',
        public_url: 'https://files.example/license.pdf',
      }],
    }));
    expect(rows[0].alertItems.filter((alert) => alert.kind === 'license').length).toBeGreaterThan(1);
    expect(listed(rows, 'license_soon')).toEqual(['d1']);
  });

  it('splits exams, safety, health and other documents, and does not count an open task as expiry', () => {
    const company = bundle().drivers[0].company_name;
    const rows = assembleDriverTrackingRows(bundle({
      drivers: [{ ...bundle().drivers[0], license_expiry: '2027-10-15', exam_expiry: '2026-10-25' }],
      exams: [{
        id: 'safe',
        driver_id: 'd1',
        company_name: company,
        exam_type: 'safety',
        status: 'completed',
        passed: true,
        completed_at: '2026-09-01',
        created_at: '2026-09-01',
        expires_at: '2026-10-22',
        score: 80,
      }],
      declarations: [{
        id: 'decl1',
        driver_id: 'd1',
        company_name: company,
        status: 'signed',
        created_at: '2026-01-01',
        signed_at: '2026-01-02',
        expires_at: '2026-10-18',
        pdf_url: 'https://files.example/decl.pdf',
      }],
      documents: [
        {
          id: 'health',
          entity_id: 'd1',
          company_name: company,
          document_type_key: 'health_declaration',
          expiry_date: '2026-10-28',
          created_at: '2026-02-01',
          is_current: true,
          original_name: 'health.pdf',
          public_url: 'https://files.example/health.pdf',
        },
        {
          id: 'traffic',
          entity_id: 'd1',
          company_name: company,
          document_type_key: 'traffic_ticket',
          expiry_date: '2026-10-21',
          created_at: '2026-02-01',
          is_current: true,
          original_name: 'ticket.pdf',
          public_url: 'https://files.example/ticket.pdf',
        },
      ],
      assignments: [{
        id: 'late-task',
        driver_id: 'd1',
        company_name: company,
        title: 'task',
        description: null,
        status: 'open',
        scheduled_date: '2026-10-01',
        created_at: '2026-09-01',
      }],
    }));
    expect(listed(rows, 'exam_renewal')).toEqual(['d1']);
    expect(listed(rows, 'safety_renewal')).toEqual(['d1']);
    expect(listed(rows, 'health_soon')).toEqual(['d1']);
    expect(listed(rows, 'document_soon')).toEqual(['d1']);
    expect(listed(rows, 'license_soon')).toEqual([]);
    expect(listed(rows, 'expired')).toEqual([]);
    expect(rows[0].history.find((item) => item.id === 'doc:health')?.hubLink).toContain('health_declaration');
    expect(rows[0].history.find((item) => item.id === 'decl:decl1')?.documentUrl).toBe('https://files.example/decl.pdf');
  });

  it('puts a passed safety date on the expired card and leaves renewal empty', () => {
    const rows = assembleDriverTrackingRows(bundle({
      drivers: [{ ...bundle().drivers[0], license_expiry: '2027-10-15', exam_expiry: null }],
      exams: [{
        id: 'old-safe',
        driver_id: 'd1',
        company_name: bundle().drivers[0].company_name,
        exam_type: 'safety',
        status: 'completed',
        passed: true,
        completed_at: '2025-01-01',
        created_at: '2025-01-01',
        expires_at: '2026-09-01',
        score: 70,
      }],
    }));
    expect(listed(rows, 'safety_renewal')).toEqual([]);
    expect(listed(rows, 'expired')).toEqual(['d1']);
  });

  it('uses each company window and ignores another company document', () => {
    const home = bundle().drivers[0].company_name;
    const rows = assembleDriverTrackingRows(bundle({
      drivers: [
        { ...bundle().drivers[0], license_expiry: '2026-10-27', exam_expiry: null },
        {
          ...bundle().drivers[0],
          id: 'd2',
          full_name: 'Other Driver',
          company_name: 'Other Co',
          license_expiry: '2026-10-27',
          exam_expiry: null,
        },
      ],
      documents: [{
        id: 'foreign-health',
        entity_id: 'd1',
        company_name: 'Other Co',
        document_type_key: 'health_declaration',
        expiry_date: '2026-10-20',
        created_at: '2026-01-01',
        is_current: true,
        original_name: 'secret.pdf',
        public_url: 'https://files.example/secret.pdf',
      }],
      thresholdsByCompany: new Map([
        [home, { ...DEFAULT_ALERT_THRESHOLDS, firstDays: 30 }],
        ['Other Co', { ...DEFAULT_ALERT_THRESHOLDS, firstDays: 10 }],
      ]),
    }));
    expect(listed(rows, 'license_soon')).toEqual(['d1']);
    expect(listed(rows, 'health_soon')).toEqual([]);
    expect(rows.find((row) => row.id === 'd1')?.history.some((item) => item.documentUrl?.includes('secret'))).toBe(false);
  });

  it('does not treat an unfinished exam as a renewal date', () => {
    const rows = assembleDriverTrackingRows(bundle({
      drivers: [{ ...bundle().drivers[0], license_expiry: '2027-10-15', exam_expiry: null }],
      exams: [{
        id: 'open-exam',
        driver_id: 'd1',
        company_name: bundle().drivers[0].company_name,
        exam_type: 'periodic',
        status: 'started',
        passed: null,
        completed_at: null,
        created_at: '2026-10-10',
        expires_at: null,
        score: null,
      }],
    }));
    expect(listed(rows, 'exam_renewal')).toEqual([]);
    expect(listed(rows, 'expired')).toEqual([]);
    expect(rows[0].alertItems.some((alert) => alert.id === 'exam-open:open-exam')).toBe(true);
  });
});
