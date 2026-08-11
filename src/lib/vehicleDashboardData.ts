import { supabase } from '@/integrations/supabase/client';
import { countMissingDocs } from '@/lib/vehicleHistory';
import { CUSTOM_GAP_PREFIX, isHistoryLogTask } from '@/lib/vehicleEventLog';
import type { VehicleHubVehicle } from '@/components/vehicles/VehicleHub';
import { daysUntil, formatExpiry, insuranceStatusText } from '@/components/vehicles/vehicleHubUtils';
import { isInsuranceAlertsEnabled } from '@/lib/vehicleInsuranceAlerts';
import {
  evaluateInsuranceCoverage,
} from '@/lib/vehicleInsuranceCoverage';
import { isVehicleHubFieldRequired } from '@/lib/requiredFieldsCompany';
import type { RequiredFieldsOverrides } from '@/lib/requiredFieldsSchema';

export interface MissingDocItem {
  label: string;
  fieldKey: string;
  status: 'חסר קובץ' | 'פג תוקף' | 'לא הוגדר';
  action: string;
}

export interface TransportDetail {
  required: boolean;
  reason: string;
  from: string;
  to: string;
  requestedBy: string;
  status: string;
  targetDate: string;
  notes: string;
}

export interface InsuranceGapItem {
  label: string;
  expiry: string;
  status: string;
  hasDocument: boolean;
  insurer: string;
  action: string;
}

export interface OpenIssueItem {
  id: string;
  kind: 'fault' | 'defect' | 'service';
  title: string;
  description: string;
  date: string;
  status: string;
  openedBy: string;
  suggestedAction: string;
}

export interface CustomGapItem {
  id: string;
  label: string;
  status: string;
  date: string;
  openedBy: string;
}

export interface EquipmentGapInfo {
  hasGap: boolean;
  detail: string;
  action: string;
}

export interface DashboardDrillDown {
  missingDocuments: MissingDocItem[];
  transport: TransportDetail | null;
  insuranceGaps: InsuranceGapItem[];
  openIssues: OpenIssueItem[];
  managerReminder: { text: string; detail: string; action: string } | null;
  customGaps: CustomGapItem[];
  equipmentGap: EquipmentGapInfo;
  licenseGap: MissingDocItem[];
  testGap: MissingDocItem[];
}

function fmtDate(iso: string | null) {
  if (!iso) return 'לא הוגדר';
  try {
    return new Date(iso).toLocaleDateString('he-IL');
  } catch {
    return iso;
  }
}

export function buildMissingDocuments(
  v: VehicleHubVehicle,
  overrides: RequiredFieldsOverrides = {},
  options?: { requireInsuranceDocs?: boolean },
): MissingDocItem[] {
  const items: MissingDocItem[] = [];
  const testDays = daysUntil(v.test_expiry);
  const insOn = isInsuranceAlertsEnabled(v);
  const coverage = evaluateInsuranceCoverage(v, overrides, options);

  if (isVehicleHubFieldRequired('license_doc_url', overrides) && !v.license_doc_url) {
    items.push({
      label: 'רישיון רכב',
      fieldKey: 'license_doc_url',
      status: 'חסר קובץ',
      action: 'העלה צילום/PDF בעריכת רכב → רישיון',
    });
  }
  if (insOn && coverage.missingMandatoryDoc) {
    items.push({
      label: 'ביטוח חובה — פוליסה',
      fieldKey: 'insurance_doc_url',
      status: 'חסר קובץ',
      action: 'העלה פוליסת ביטוח חובה',
    });
  }
  if (insOn && coverage.missingComprehensiveDoc) {
    items.push({
      label: 'ביטוח מקיף — פוליסה',
      fieldKey: 'comprehensive_insurance_doc_url',
      status: 'חסר קובץ',
      action: 'העלה פוליסת ביטוח מקיף',
    });
  }
  if (!v.test_expiry) {
    items.push({
      label: 'טסט (תוקף רישוי)',
      fieldKey: 'test_expiry',
      status: 'לא הוגדר',
      action: 'עדכן תאריך טסט בעריכת רכב',
    });
  } else if (testDays !== null && testDays <= 0) {
    items.push({
      label: 'טסט (תוקף רישוי)',
      fieldKey: 'test_expiry',
      status: 'פג תוקף',
      action: 'חדש טסט ועדכן תאריך',
    });
  }

  return items;
}

export function buildInsuranceGaps(
  v: VehicleHubVehicle,
  latestInsurer: string | null,
  overrides: RequiredFieldsOverrides = {},
  options?: { requireInsuranceDocs?: boolean },
): InsuranceGapItem[] {
  if (!isInsuranceAlertsEnabled(v)) return [];
  const coverage = evaluateInsuranceCoverage(v, overrides, options);
  const gaps: InsuranceGapItem[] = [];

  const addCoverage = (label: string, expiry: string | null, status: string, action: string) => {
    gaps.push({
      label,
      expiry: formatExpiry(expiry),
      status,
      hasDocument: true,
      insurer: latestInsurer || '—',
      action,
    });
  };

  if (coverage.mandatory !== 'valid') {
    const action =
      coverage.mandatory === 'missing'
        ? 'עדכן תאריך תוקף ביטוח חובה'
        : coverage.mandatory === 'expired'
          ? 'חדש פוליסה ועדכן תאריך'
          : 'בדוק תאריך תוקף ביטוח חובה';
    addCoverage('ביטוח חובה', v.insurance_expiry, insuranceStatusText(v.insurance_expiry), action);
  }

  if (
    coverage.comprehensiveRelevant &&
    coverage.comprehensive !== 'not_applicable' &&
    coverage.comprehensive !== 'valid'
  ) {
    const action =
      coverage.comprehensive === 'missing'
        ? 'עדכן תאריך תוקף ביטוח מקיף'
        : coverage.comprehensive === 'expired'
          ? 'חדש פוליסת מקיף ועדכן תאריך'
          : 'בדוק תאריך תוקף ביטוח מקיף';
    addCoverage(
      'ביטוח מקיף',
      v.comprehensive_insurance_expiry,
      insuranceStatusText(v.comprehensive_insurance_expiry),
      action,
    );
  }

  if (coverage.missingMandatoryDoc) {
    gaps.push({
      label: 'חסר מסמך ביטוח חובה',
      expiry: formatExpiry(v.insurance_expiry),
      status: insuranceStatusText(v.insurance_expiry),
      hasDocument: false,
      insurer: latestInsurer || '—',
      action: 'העלה פוליסת ביטוח חובה',
    });
  }

  if (coverage.missingComprehensiveDoc) {
    gaps.push({
      label: 'חסר מסמך ביטוח מקיף',
      expiry: formatExpiry(v.comprehensive_insurance_expiry),
      status: insuranceStatusText(v.comprehensive_insurance_expiry),
      hasDocument: false,
      insurer: latestInsurer || '—',
      action: 'העלה פוליסת ביטוח מקיף',
    });
  }

  return gaps;
}

export async function loadDashboardDrillDown(
  v: VehicleHubVehicle,
  latestInsurer: string | null,
  overrides: RequiredFieldsOverrides = {},
  options?: { requireInsuranceDocs?: boolean },
): Promise<DashboardDrillDown> {
  const missingDocuments = buildMissingDocuments(v, overrides, options);
  const insuranceGaps = buildInsuranceGaps(v, latestInsurer, overrides, options);

  let transport: TransportDetail | null = null;
  if (v.needs_transport) {
    const { data: towOrders } = await supabase
      .from('service_orders')
      .select('description, towing_address, towing_contact, towing_time, treatment_status, ordering_user, service_date, created_at')
      .eq('vehicle_plate', v.license_plate)
      .eq('towing_requested', true)
      .order('created_at', { ascending: false })
      .limit(1);

    const { data: handover } = await supabase
      .from('vehicle_handovers')
      .select('giving_driver_name, receiving_driver_name, date_time, action_type')
      .eq('vehicle_plate', v.license_plate)
      .order('date_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    const order = towOrders?.[0];
    transport = {
      required: true,
      reason: v.notes?.includes('שינוע') ? v.notes : order?.description || 'סומן ברכב: נדרש שינוע',
      from: handover?.giving_driver_name || '—',
      to: order?.towing_address || handover?.receiving_driver_name || '—',
      requestedBy: order?.ordering_user || '—',
      status: order?.treatment_status || 'ממתין',
      targetDate: order?.towing_time || order?.service_date || '—',
      notes: v.notes || '',
    };
  }

  const openIssues: OpenIssueItem[] = [];

  const { data: faults } = await supabase
    .from('faults')
    .select('id, fault_type, description, status, date, created_at, driver_name, created_by')
    .eq('vehicle_plate', v.license_plate)
    .in('status', ['new', 'open', 'opened', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(10);

  (faults || []).forEach((f) => {
    openIssues.push({
      id: f.id,
      kind: 'fault',
      title: f.fault_type || 'תקלה',
      description: f.description || '',
      date: fmtDate(f.date || f.created_at),
      status: f.status || 'פתוח',
      openedBy: f.driver_name || '—',
      suggestedAction: 'עבור לפעולות רכב → ליקויים / פתח הזמנת שירות',
    });
  });

  const { data: tasks } = await supabase
    .from('vehicle_tasks')
    .select('id, title, description, status, created_at, resolved_by_name')
    .eq('vehicle_plate', v.license_plate)
    .order('created_at', { ascending: false })
    .limit(30);

  const customGaps: CustomGapItem[] = [];

  (tasks || []).forEach((t) => {
    if (isHistoryLogTask(t)) return;
    if ((t.title || '').startsWith(CUSTOM_GAP_PREFIX)) {
      if (['open', 'pending', 'in_progress'].includes(t.status || '')) {
        customGaps.push({
          id: t.id,
          label: (t.title || '').replace(CUSTOM_GAP_PREFIX, ''),
          status: t.status || 'פתוח',
          date: fmtDate(t.created_at),
          openedBy: t.resolved_by_name || '—',
        });
      }
      return;
    }
    if (!['open', 'pending', 'in_progress'].includes(t.status || '')) return;
    openIssues.push({
      id: t.id,
      kind: 'defect',
      title: t.title || 'ליקוי',
      description: t.description || '',
      date: fmtDate(t.created_at),
      status: t.status || 'פתוח',
      openedBy: t.resolved_by_name || '—',
      suggestedAction: 'עבור לפעולות רכב → ליקויים',
    });
  });

  const { data: lastExchange } = await supabase
    .from('vehicle_exchanges')
    .select('extra_equipment, created_at')
    .eq('vehicle_plate', v.license_plate)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const equipmentMissing =
    customGaps.some((g) => /ציוד|מפתח|שלט|כרטיס|אביזר/i.test(g.label)) ||
    !lastExchange?.extra_equipment?.trim();

  const equipmentGap: EquipmentGapInfo = {
    hasGap: equipmentMissing,
    detail: lastExchange?.extra_equipment?.trim()
      ? `ציוד רשום: ${lastExchange.extra_equipment}`
      : 'לא רשום ציוד בהחלפת רכב אחרונה',
    action: 'הוסף חוסר ציוד או עדכן בהחלפת רכב',
  };

  const licenseGap = missingDocuments.filter((m) => m.fieldKey === 'license_doc_url');
  const testGap = missingDocuments.filter((m) => m.fieldKey === 'test_expiry');

  const { data: servicesRaw } = await supabase
    .from('service_orders')
    .select('id, service_category, description, treatment_status, created_at, ordering_user')
    .eq('vehicle_plate', v.license_plate)
    .order('created_at', { ascending: false })
    .limit(15);

  const services = (servicesRaw || []).filter(
    (s) => s.treatment_status !== 'completed' && s.treatment_status !== 'cancelled',
  ).slice(0, 5);

  services.forEach((s) => {
    openIssues.push({
      id: s.id,
      kind: 'service',
      title: s.service_category || 'שירות',
      description: s.description || '',
      date: fmtDate(s.created_at),
      status: s.treatment_status || 'פתוח',
      openedBy: s.ordering_user || '—',
      suggestedAction: 'עבור לפעולות רכב → שירות',
    });
  });

  let managerReminder: DashboardDrillDown['managerReminder'] = null;
  if (v.approval_status === 'pending_approval') {
    managerReminder = {
      text: 'ממתין לאישור מנהל',
      detail: 'הרכב נוסף וממתין לאישור לפני הפעלה מלאה.',
      action: 'ניהול רכב → אישור / עריכה',
    };
  } else if (v.needs_transport && !transport) {
    managerReminder = {
      text: 'נדרש שינוע',
      detail: 'הדגל needs_transport פעיל על הרכב.',
      action: 'פתח פעולת שינוע או עדכן בהערות',
    };
  }

  const _missingCount = countMissingDocs(v);
  if (_missingCount > 0 && missingDocuments.length === 0) {
    missingDocuments.push({
      label: 'מסמך (כללי)',
      fieldKey: 'documents',
      status: 'חסר קובץ',
      action: 'בדוק מסמכים בפרטי רכב',
    });
  }

  return {
    missingDocuments,
    transport,
    insuranceGaps,
    openIssues,
    managerReminder,
    customGaps,
    equipmentGap,
    licenseGap,
    testGap,
  };
}
