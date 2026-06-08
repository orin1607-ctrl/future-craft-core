import type { VehicleHubVehicle } from '@/components/vehicles/VehicleHub';
import type { DashboardDrillDown } from '@/lib/vehicleDashboardData';
import type { VehicleHubData } from '@/lib/vehicleHubData';

/** רכב דמו לבדיקת כרטיס — מצבי אזהרה מלאים */
export const PREVIEW_VEHICLE: VehicleHubVehicle = {
  id: 'preview-vehicle-1',
  license_plate: '123-45-678',
  internal_number: 'VH-042',
  manufacturer: 'טויוטה',
  model: 'קורולה',
  year: 2022,
  vehicle_type: 'private',
  status: 'active',
  odometer: 87420,
  assigned_driver_id: 'preview-driver-1',
  company_name: 'דליה לוגיסטיקה',
  test_expiry: '2025-04-10',
  insurance_expiry: '2025-06-30',
  insurance_start: '2025-01-01',
  comprehensive_insurance_expiry: '2025-06-30',
  comprehensive_insurance_start: '2025-01-01',
  next_service_date: '2025-08-15',
  last_service_date: '2025-03-02',
  needs_transport: true,
  approval_status: 'pending_approval',
  license_doc_url: '',
  insurance_doc_url: 'https://example.com/ins.pdf',
  comprehensive_insurance_doc_url: '',
  notes: 'נדרש שינוע למוסך יוני — רכב עומד בחניון מרכז',
  management_type: 'operational_leasing',
  monthly_leasing_cost: 4200,
  leasing_end_date: '2026-12-31',
  vehicle_return_date: '2027-01-15',
  monthly_loan_payment: null,
  loan_end_date: null,
  planned_replacement_date: null,
  has_loan: false,
  is_leasing: true,
  insurance_cost: 5100,
  vin: 'JTDBT923000123456',
  fuel_type: 'בנזין',
  nickname: 'קורולה לבנה',
  department: 'לוגיסטיקה',
  work_site: 'מרכז',
  import_buffer: JSON.stringify({
    dalia_form: {
      vehicle_color: 'לבן',
      end_or_scrap_date: '2030-12-31',
      assigned_driver: 'אבי כהן',
      coverage_glass: 'true',
      maint_garage: 'מוסך יוני',
    },
    docs: [
      {
        category: 'ביטוח חובה',
        name: 'פוליסה 2025',
        link: 'https://example.com/policy.pdf',
        file: 'policy.pdf',
        notes: 'חידוש שנתי',
        date: '01/01/2025',
      },
    ],
    departments: ['לוגיסטיקה', 'שינוע'],
    section_saved: { 1: true, 2: true, 3: true, 4: true, 5: true, 6: true },
  }),
  insurances: JSON.stringify({
    coverage: { glass: true, replacement: false, licensing: true },
    mandatory: { company: 'הפניקס', cost: '5100' },
  }),
  maintenance_details: JSON.stringify({ method: 'דליה', maint_supervisor: 'דני לוי' }),
  finance_details: JSON.stringify({ route: 'ליסינג תפעולי', op_monthly_cost: '4200' }),
};

export const PREVIEW_DRIVERS = [
  { id: 'preview-driver-1', full_name: 'אבי כהן', phone: '050-1234567' },
];

export const PREVIEW_INSURER = 'הפניקס';

export const PREVIEW_OPEN_ISSUES = 3;

export const PREVIEW_DRILL_DOWN: DashboardDrillDown = {
  missingDocuments: [
    {
      label: 'רישיון רכב',
      fieldKey: 'license_doc_url',
      status: 'חסר קובץ',
      action: 'העלה צילום/PDF בעריכת רכב → רישיון',
    },
    {
      label: 'ביטוח מקיף — פוליסה',
      fieldKey: 'comprehensive_insurance_doc_url',
      status: 'חסר קובץ',
      action: 'העלה פוליסת ביטוח מקיף',
    },
    {
      label: 'טסט (תוקף רישוי)',
      fieldKey: 'test_expiry',
      status: 'פג תוקף',
      action: 'חדש טסט ועדכן תאריך',
    },
  ],
  transport: {
    required: true,
    reason: 'רכב לא ניתן להפעלה — נדרש גרירה למוסך',
    from: 'חניון מרכז · אבי כהן',
    to: 'מוסך יוני, רחוב האריג 12 תל אביב',
    requestedBy: 'מנהל צי — דני לוי',
    status: 'ממתין לאישור',
    targetDate: '05/06/2025 09:00',
    notes: PREVIEW_VEHICLE.notes,
  },
  insuranceGaps: [
    {
      label: 'ביטוח מקיף',
      expiry: '30/06/2025',
      status: 'בתוקף — מסמך חסר',
      hasDocument: false,
      insurer: PREVIEW_INSURER,
      action: 'העלה מסמך (comprehensive_insurance_doc_url)',
    },
    {
      label: 'ביטוח חובה',
      expiry: '30/06/2025',
      status: 'מתקרב לפקיעה',
      hasDocument: true,
      insurer: PREVIEW_INSURER,
      action: 'בדוק תאריך תוקף',
    },
  ],
  openIssues: [
    {
      id: 'f1',
      kind: 'fault',
      title: 'נורת מנוע',
      description: 'נורה כתומה דולקת — בדיקת מחשב',
      date: '28/05/2025',
      status: 'פתוח',
      openedBy: 'אבי כהן',
      suggestedAction: 'עבור לפעולות רכב → פתח הזמנת שירות',
    },
    {
      id: 't1',
      kind: 'defect',
      title: 'ליקוי בלמים',
      description: 'רפידות שחוקות — דורש החלפה',
      date: '10/05/2025',
      status: 'בטיפול',
      openedBy: 'מנהל צי',
      suggestedAction: 'עבור לפעולות רכב → ליקויים',
    },
    {
      id: 's1',
      kind: 'service',
      title: 'הזמנת שירות',
      description: 'מוסך יוני — PO-250602-042',
      date: '12/05/2025',
      status: 'ממתין לאישור',
      openedBy: 'דני לוי',
      suggestedAction: 'עבור לפעולות רכב → שירות',
    },
  ],
  managerReminder: {
    text: 'ממתין לאישור מנהל',
    detail: 'הרכב נוסף וממתין לאישור לפני הפעלה מלאה.',
    action: 'ניהול רכב → אישור / עריכה',
  },
  customGaps: [
    { id: 'cg1', label: 'מפתח חסר', status: 'open', date: '01/06/2025', openedBy: 'אבי כהן' },
  ],
  equipmentGap: {
    hasGap: true,
    detail: 'לא רשום ציוד בהחלפה אחרונה',
    action: 'הוסף חוסר או עדכן בהעברת רכב',
  },
  licenseGap: [
    {
      label: 'רישיון רכב',
      fieldKey: 'license_doc_url',
      status: 'חסר קובץ',
      action: 'העלה צילום/PDF',
    },
  ],
  testGap: [
    {
      label: 'טסט (תוקף רישוי)',
      fieldKey: 'test_expiry',
      status: 'פג תוקף',
      action: 'חדש טסט',
    },
  ],
};

export const PREVIEW_HUB_DATA: VehicleHubData = {
  history: [
    {
      id: 'h1',
      type: 'defect',
      date: '2025-05-10',
      title: 'ליקוי בלמים – רפידות שחוקות',
      description: '',
      status: 'open',
      userName: 'מנהל צי',
      vehiclePlate: PREVIEW_VEHICLE.license_plate,
      internalNumber: PREVIEW_VEHICLE.internal_number,
      route: '/vehicle-tasks',
    },
    {
      id: 'h2',
      type: 'service',
      date: '2025-05-12',
      title: 'הזמנה לספק: מוסך יוני',
      description: 'PO-250602-042',
      status: 'pending',
      userName: 'דני לוי',
      vehiclePlate: PREVIEW_VEHICLE.license_plate,
      internalNumber: PREVIEW_VEHICLE.internal_number,
      route: '/service-orders',
    },
  ],
  tasks: [
    {
      id: 't1',
      title: 'ליקוי בלמים',
      description: 'רפידות שחוקות',
      status: 'in_progress',
      created_at: '2025-05-10T10:00:00Z',
    },
  ],
  faults: [
    {
      id: 'f1',
      fault_type: 'נורת מנוע',
      description: 'נורה כתומה',
      urgency: 'high',
      status: 'open',
      date: '2025-05-28',
      created_at: '2025-05-28T08:00:00Z',
    },
  ],
  services: [
    {
      id: 's1',
      service_category: 'תיקון',
      description: 'מוסך יוני',
      vendor_name: 'מוסך יוני',
      treatment_status: 'pending_approval',
      date_time: '2025-05-12T09:00:00Z',
      created_at: '2025-05-12T09:00:00Z',
    },
  ],
  accidents: [],
  inspections: [
    {
      id: 'i1',
      inspection_type: 'semi_annual',
      inspection_date: '2024-10-15',
      overall_status: 'passed',
      inspector_name: 'יוסי',
      notes: null,
    },
  ],
  handovers: [
    {
      id: 'ho1',
      action_type: 'transfer',
      date_time: '2025-05-01T12:00:00Z',
      giving_driver_name: 'אבי כהן',
      receiving_driver_name: 'מוסך יוני',
    },
  ],
  docs: [
    {
      id: 'insurance',
      ref: 'ביטוח',
      name: 'פוליסת ביטוח חובה',
      source: 'ביטוח',
      date: '—',
      expiry: '30/06/2025',
      url: PREVIEW_VEHICLE.insurance_doc_url,
    },
  ],
};
