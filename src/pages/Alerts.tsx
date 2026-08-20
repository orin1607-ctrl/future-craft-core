import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useCompanyFilter, applyCompanyScope } from '@/hooks/useCompanyFilter';
import { buildVehicleContextUrl, buildVehicleHubUrl, buildFaultDetailUrl, buildVehicleTaskDetailUrl, buildServiceOrderDetailUrl } from '@/lib/entityNavContext';
import { isInsuranceAlertsEnabled, isInsuranceRedHighlightEnabled } from '@/lib/vehicleInsuranceAlerts';
import { fetchCompanySettings, prefetchCompanySettings } from '@/lib/companySettings';
import {
  classifyExpiryForActiveList,
  expiryAlertTitle,
  expiryReminderTier,
  tierDetail,
} from '@/lib/vehicleExpiryReminders';
import { thresholdsFromCompanySettings } from '@/lib/vehicleTrackingAlerts';
import {
  FREE_ALERT_LABEL,
  FREE_ALERT_TYPE,
  OFFICER_ALERT_LABEL,
  OFFICER_ALERT_TYPE,
  driverIdFromAlertText,
  driverNameFromAlertText,
  plateFromAlertText,
  vehicleIdFromAlertText,
} from '@/lib/vehicleActionFollowUp';
import { normalizePlate } from '@/lib/entityNavContext';
import { Bell, ShieldAlert, Car, IdCard, Wrench, Clock, CheckCircle2, ScrollText, Search, Building2, Briefcase, ClipboardList, ClipboardList as LogIcon } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { getThirdPartyInsuranceExpiry } from '@/lib/vehicleInsuranceUtils';
import { formatVehicleIds, InternalNumber, InternalPrefixSuffix, VehiclePlateLine } from '@/components/vehicles/vehiclePlateDisplay';
import { applyExcludeArchivedVehicles } from '@/lib/vehicleArchive';
import {
  alertCategoryMatches,
  alertInScope,
  alertPassesListFilters,
  parseAlertListScope,
  parseAlertWindowDays,
  type AlertListScope,
} from '@/lib/alertListScope';
import { calendarDaysLeft } from '@/lib/expiryOfficerApproval';

// ─── Alerts Types ───
type AlertSeverity = 'critical' | 'warning' | 'info';
type AlertCategory =
  | 'test'
  | 'insurance'
  | 'comprehensive_insurance'
  | 'third_party_insurance'
  | 'license'
  | 'driver_document'
  | 'fault'
  | 'service_order'
  | 'work_assignment'
  | 'officer'
  | 'free';

interface AlertItem {
  id: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  subtitle: string;
  internalNumber?: string;
  vehiclePlate?: string | null;
  daysLeft: number | null;
  date: string | null;
  meta?: string;
  link?: string;
}

const categoryLabels: Record<AlertCategory, string> = {
  test: 'טסט',
  insurance: 'ביטוח חובה',
  comprehensive_insurance: 'ביטוח מקיף',
  third_party_insurance: 'ביטוח צד ג׳',
  license: 'רישיון נהיגה',
  driver_document: 'מסמך נהג',
  fault: 'תקלה דחופה',
  service_order: 'הזמנת שירות',
  work_assignment: 'סידור עבודה',
  officer: OFFICER_ALERT_LABEL,
  free: FREE_ALERT_LABEL,
};

const categoryIcons: Record<AlertCategory, typeof Car> = {
  test: Car,
  insurance: ShieldAlert,
  comprehensive_insurance: ShieldAlert,
  third_party_insurance: ShieldAlert,
  license: IdCard,
  driver_document: ScrollText,
  fault: Wrench,
  service_order: Briefcase,
  work_assignment: ClipboardList,
  officer: ShieldAlert,
  free: Bell,
};

const severityStyles: Record<AlertSeverity, string> = {
  critical: 'bg-destructive/10 border-destructive/40 text-destructive',
  warning: 'bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-400',
  info: 'bg-blue-500/10 border-blue-500/40 text-blue-700 dark:text-blue-400',
};

const severityBadge: Record<AlertSeverity, string> = {
  critical: 'bg-destructive text-destructive-foreground',
  warning: 'bg-amber-500 text-white',
  info: 'bg-blue-500 text-white',
};

function getDaysLeft(dateStr: string | null | undefined): number | null {
  return calendarDaysLeft(dateStr);
}

function getSeverity(daysLeft: number | null): AlertSeverity {
  if (daysLeft === null) return 'info';
  if (daysLeft <= 0) return 'critical';
  if (daysLeft <= 14) return 'warning';
  return 'info';
}

function getInsuranceSeverity(daysLeft: number | null, redOn: boolean): AlertSeverity {
  if (!redOn) return 'info';
  return getSeverity(daysLeft);
}

function statusLabelForInspection(status: string | null | undefined): string {
  if (status === 'passed') return 'תקין';
  if (status === 'failed') return 'ליקויים';
  if (status === 'pending') return 'ממתין';
  return status || 'ללא סטטוס';
}

// ─── Updates (System Logs) Types ───
interface LogEntry {
  id: string;
  created_at: string;
  user_name: string;
  company_name: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  vehicle_plate: string;
  old_status: string;
  new_status: string;
  details: string;
  channel: string;
}

const ACTION_LABELS: Record<string, string> = {
  approve: 'אישור', reject: 'דחייה', create: 'יצירה', update: 'עדכון',
  status_change: 'שינוי סטטוס', reminder_sent: 'תזכורת נשלחה',
};

const ENTITY_LABELS: Record<string, string> = {
  vehicle: 'רכב', driver: 'נהג', fault: 'תקלה', accident: 'תאונה',
  work_assignment: 'סידור עבודה', service_order: 'הזמנת שירות',
  approval_request: 'בקשת אישור', handover: 'חילופי רכב',
};

// ─── Main Component ───
export default function Alerts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const companyFilter = useCompanyFilter();
  const isSuperAdmin = user?.role === 'super_admin';

  // Alerts state
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertFilter, setAlertFilter] = useState<AlertCategory | 'all'>('all');
  const [alertScope, setAlertScope] = useState<AlertListScope>('urgent');
  const [alertWindowDays, setAlertWindowDays] = useState(30);
  const [filterVehicle, setFilterVehicle] = useState('');
  const [filterInternal, setFilterInternal] = useState('');
  const [vehiclePlates, setVehiclePlates] = useState<string[]>([]);
  const [internalNumbers, setInternalNumbers] = useState<string[]>([]);

  // Updates state
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logSearch, setLogSearch] = useState('');
  const [logFilterCompany, setLogFilterCompany] = useState('');
  const [logFilterEntity, setLogFilterEntity] = useState('');
  const [logFilterDate, setLogFilterDate] = useState('');
  const [companies, setCompanies] = useState<string[]>([]);

  useEffect(() => {
    if (user) loadAlerts();
  }, [user, companyFilter]);

  useEffect(() => {
    const requested = searchParams.get('category');
    const allowed = [
      'free',
      'officer',
      'test',
      'insurance',
      'comprehensive_insurance',
      'third_party_insurance',
      'license',
      'fault',
      'service_order',
      'work_assignment',
      'driver_document',
    ] as const;
    if (!requested || requested === 'all') {
      setAlertFilter('all');
    } else if ((allowed as readonly string[]).includes(requested)) {
      setAlertFilter(requested as AlertCategory);
    }
    setAlertScope(parseAlertListScope(searchParams.get('scope')));
    setAlertWindowDays(parseAlertWindowDays(searchParams.get('days')));
    const plate = searchParams.get('plate');
    setFilterVehicle(plate || '');
    const internal = searchParams.get('internal');
    setFilterInternal(internal || '');
  }, [searchParams]);

  useEffect(() => {
    if (isSuperAdmin) {
      loadLogs();
      supabase.from('profiles').select('company_name').then(({ data }) => {
        if (data) setCompanies([...new Set(data.map(d => d.company_name).filter(Boolean) as string[])]);
      });
    }
  }, [isSuperAdmin]);

  const loadAlerts = async () => {
    setAlertsLoading(true);
    const allAlerts: AlertItem[] = [];
    const plateToInternal = new Map<string, string>();
    const plateToVehicleId = new Map<string, string>();
    const companyThresholds = new Map<string, ReturnType<typeof thresholdsFromCompanySettings>>();

    const thresholdForCompany = async (company: string | null | undefined) => {
      const key = company || '';
      if (!key) return thresholdsFromCompanySettings(null);
      if (companyThresholds.has(key)) return companyThresholds.get(key)!;
      const settings = await fetchCompanySettings(key);
      const t = thresholdsFromCompanySettings(settings);
      companyThresholds.set(key, t);
      return t;
    };

    const testHub = (vehicleId: string) =>
      buildVehicleHubUrl(vehicleId, { hubSection: 'home', hubDrill: 'insurance_licenses', hubFocus: 'test' });
    const insHub = (vehicleId: string) =>
      buildVehicleHubUrl(vehicleId, { hubSection: 'home', hubDrill: 'insurance_licenses', hubFocus: 'insurance' });

    const internalForPlate = (plate?: string | null) => {
      const key = String(plate || '').replace(/[-\s]/g, '').trim();
      if (!key) return undefined;
      return plateToInternal.get(key);
    };

    const vehicleIdForPlate = (plate?: string | null) => {
      const key = String(plate || '').replace(/[-\s]/g, '').trim();
      if (!key) return undefined;
      return plateToVehicleId.get(key);
    };

    const vehicleCtx = (plate?: string | null) => {
      const p = plate || '';
      const vid = vehicleIdForPlate(plate);
      return vid ? { plate: p, vehicleId: vid } : null;
    };

    const vehicleLabel = (v: { manufacturer?: string | null; model?: string | null; license_plate?: string | null; internal_number?: string | null }) => {
      const plate = v.license_plate || '';
      const internal = (v.internal_number || '').trim();
      const ids = formatVehicleIds(plate, internal);
      const make = `${v.manufacturer || ''} ${v.model || ''}`.trim();
      return make ? `${make} — ${ids}` : ids;
    };

    // 1. Vehicle expiries
    const { data: vehicles } = await applyCompanyScope(
      applyExcludeArchivedVehicles(supabase.from('vehicles').select('*')),
      companyFilter,
    );
    if (vehicles) {
      const plates: string[] = [];
      const internals: string[] = [];
      for (const v of vehicles) {
        const plateKey = String(v.license_plate || '').replace(/[-\s]/g, '').trim();
        const internal = (v.internal_number || '').trim();
        if (plateKey && internal) plateToInternal.set(plateKey, internal);
        if (plateKey && v.id) plateToVehicleId.set(plateKey, v.id);
        if (v.license_plate) plates.push(v.license_plate);
        if (internal) internals.push(internal);
      }
      setVehiclePlates([...new Set(plates)].sort((a, b) => a.localeCompare(b, 'he', { numeric: true })));
      setInternalNumbers([...new Set(internals)].sort((a, b) => a.localeCompare(b, 'he', { numeric: true })));

      // Batch-load company_settings once for all companies in this result (avoids N round-trips).
      const companyNames = [
        ...new Set(
          vehicles
            .map((v) => (v.company_name || '').trim())
            .filter(Boolean)
            .concat(
              typeof companyFilter === 'string' && companyFilter ? [companyFilter] : [],
              user?.company_name ? [user.company_name] : [],
            ),
        ),
      ];
      await prefetchCompanySettings(companyNames);

      for (const v of vehicles) {
        const label = vehicleLabel(v);
        const internalNumber = (v.internal_number || '').trim() || undefined;
        const vehiclePlate = v.license_plate || null;
        const thresholds = await thresholdForCompany(v.company_name);
        const insOn = isInsuranceAlertsEnabled(v);
        const insRed = isInsuranceRedHighlightEnabled(v);

        const pushExpiry = (
          id: string,
          category: AlertCategory,
          subject: string,
          dateStr: string | null | undefined,
          enabled: boolean,
          severityFn: (days: number | null) => AlertSeverity,
          link: string,
        ) => {
          if (!enabled || !dateStr) return;
          const days = getDaysLeft(dateStr);
          const kind = classifyExpiryForActiveList(days);
          if (kind === 'none' || days === null) return;
          allAlerts.push({
            id,
            category,
            severity: kind === 'future' ? 'info' : severityFn(days),
            title: expiryAlertTitle(subject, days, thresholds),
            subtitle: kind === 'future' ? `${label} · עתידית` : kind === 'expired' ? `${label} · פג תוקף` : label,
            internalNumber,
            vehiclePlate,
            daysLeft: days,
            date: dateStr,
            meta: kind === 'future' ? `בעוד ${days} ימים` : undefined,
            link,
          });
        };

        pushExpiry(`test-${v.id}`, 'test', 'טסט / רישיון רכב', v.test_expiry, true, getSeverity, testHub(v.id));
        pushExpiry(`ins-${v.id}`, 'insurance', 'ביטוח חובה', v.insurance_expiry, insOn, (d) => getInsuranceSeverity(d, insRed), insHub(v.id));
        pushExpiry(
          `comp-${v.id}`,
          'comprehensive_insurance',
          'ביטוח מקיף',
          v.comprehensive_insurance_expiry,
          insOn,
          (d) => getInsuranceSeverity(d, insRed),
          insHub(v.id),
        );
        pushExpiry(
          `third-${v.id}`,
          'third_party_insurance',
          'ביטוח צד ג׳',
          getThirdPartyInsuranceExpiry(v),
          insOn,
          (d) => getInsuranceSeverity(d, insRed),
          insHub(v.id),
        );
        pushExpiry(
          `svcdate-${v.id}`,
          'service_order',
          'טיפול תקופתי',
          (v as { next_service_date?: string | null }).next_service_date,
          true,
          getSeverity,
          buildVehicleHubUrl(v.id, { hubSection: 'home' }),
        );

        const nextInsp = (v as { next_inspection_date?: string | null }).next_inspection_date;
        if (nextInsp) {
          const days = getDaysLeft(nextInsp);
          const kind = classifyExpiryForActiveList(days);
          if (kind !== 'none' && days !== null) {
            allAlerts.push({
              id: `officer-veh-${v.id}`,
              category: 'officer',
              severity: kind === 'future' ? 'info' : getSeverity(days),
              title: `${OFFICER_ALERT_LABEL} · ${v.license_plate || ''}`.trim(),
              subtitle: [label, kind === 'future' ? 'עתידית' : 'קרובה', days > 30 ? `בעוד ${days} ימים` : undefined]
                .filter(Boolean)
                .join(' • '),
              internalNumber,
              vehiclePlate,
              daysLeft: days,
              date: nextInsp,
              link: testHub(v.id),
            });
          }
        }
      }
    } else {
      setVehiclePlates([]);
      setInternalNumbers([]);
    }

    // The inspection row is the source of truth for the officer workflow.
    // Read it directly as a fallback so a saved tri/semi inspection remains visible
    // even if a legacy vehicle row did not receive next_inspection_date.
    const { data: officerInspections } = await applyCompanyScope(
      supabase
        .from('vehicle_inspections')
        .select('id, vehicle_id, vehicle_plate, inspection_date, next_due_date, overall_status, company_name')
        .not('next_due_date', 'is', null)
        .order('inspection_date', { ascending: false }),
      companyFilter,
    );
    const latestOfficerByVehicle = new Map<string, any>();
    (officerInspections || []).forEach((inspection) => {
      const key = inspection.vehicle_id || normalizePlate(inspection.vehicle_plate || '');
      if (key && !latestOfficerByVehicle.has(key)) latestOfficerByVehicle.set(key, inspection);
    });
    const officerSeenFromVehicles = new Set(
      allAlerts
        .filter((a) => a.category === 'officer' && a.vehiclePlate && a.date)
        .map((a) => `${normalizePlate(a.vehiclePlate || '')}|${String(a.date).slice(0, 10)}`),
    );
    latestOfficerByVehicle.forEach((inspection) => {
      const days = getDaysLeft(inspection.next_due_date);
      if (days === null) return;
      const plate = inspection.vehicle_plate || '';
      const key = `${normalizePlate(plate)}|${String(inspection.next_due_date).slice(0, 10)}`;
      if (officerSeenFromVehicles.has(key)) return;
      officerSeenFromVehicles.add(key);
      const query = new URLSearchParams({ inspectionId: inspection.id, context: 'vehicle' });
      if (plate) query.set('plate', plate);
      if (inspection.vehicle_id) query.set('vehicleId', inspection.vehicle_id);
      allAlerts.push({
        id: `officer-inspection-${inspection.id}`,
        category: 'officer',
        severity: days <= 14 ? 'warning' : 'info',
        title: `${OFFICER_ALERT_LABEL} · ${plate}`.trim(),
        subtitle: [
          plate ? `רכב ${plate}` : 'ביקורת רכב',
          days > 30 ? 'עתידית' : 'קרובה',
          days > 30 ? `בעוד ${days} ימים` : undefined,
        ].filter(Boolean).join(' • '),
        internalNumber: internalForPlate(plate),
        vehiclePlate: plate || null,
        daysLeft: days,
        date: inspection.next_due_date,
        meta: `מועד ביקורת: ${inspection.inspection_date || '—'} · ${statusLabelForInspection(inspection.overall_status)}`,
        link: `/vehicle-inspections?${query.toString()}`,
      });
    });

    // 2. Driver license expiries (current + future, expired → history only)
    const { data: drivers } = await applyCompanyScope(supabase.from('drivers').select('*'), companyFilter);
    const driverThresholds = await thresholdForCompany(
      (typeof companyFilter === 'string' && companyFilter) || user?.company_name || drivers?.[0]?.company_name,
    );
    if (drivers) {
      for (const d of drivers) {
        const licDays = getDaysLeft(d.license_expiry);
        const licKind = classifyExpiryForActiveList(licDays);
        if (licKind !== 'none' && licDays !== null) {
          allAlerts.push({
            id: `lic-${d.id}`,
            category: 'license',
            severity: licKind === 'future' ? 'info' : getSeverity(licDays),
            title: expiryAlertTitle('רישיון נהיגה', licDays, driverThresholds),
            subtitle: licKind === 'future' ? `${d.full_name} · עתידית` : d.full_name,
            daysLeft: licDays,
            date: d.license_expiry,
            meta: d.phone || undefined,
            link: `/drivers?driverId=${d.id}&section=documents`,
          });
        }
      }
    }

    // 2b. Driver exam expiry
    if (drivers) {
      for (const d of drivers) {
        const examExpiry = (d as any).exam_expiry;
        if (!examExpiry) continue;
        const examDays = getDaysLeft(examExpiry);
        const examKind = classifyExpiryForActiveList(examDays);
        if (examKind !== 'none' && examDays !== null) {
          allAlerts.push({
            id: `exam-${d.id}`,
            category: 'license',
            severity: examKind === 'future' ? 'info' : getSeverity(examDays),
            title: expiryAlertTitle('מבחן נהיגה', examDays, driverThresholds),
            subtitle: examKind === 'future' ? `${d.full_name} · עתידית` : d.full_name,
            daysLeft: examDays,
            date: examExpiry,
            meta: d.phone || undefined,
            link: `/drivers?driverId=${d.id}&section=driving`,
          });
        }
      }
    }


    // 2c. Driver document expiry (Document Hub — document_versions)
    const docAlertThresholds = await thresholdForCompany(
      (typeof companyFilter === 'string' && companyFilter) || user?.company_name || drivers?.[0]?.company_name,
    );
    let docVerQuery = supabase
      .from('document_versions')
      .select('id, entity_id, document_type_key, expiry_date, company_name')
      .eq('entity_type', 'driver')
      .eq('is_current', true)
      .not('expiry_date', 'is', null);
    docVerQuery = applyCompanyScope(docVerQuery, companyFilter);
    const { data: driverDocVersions } = await docVerQuery;
    const typeLabelMap = new Map<string, string>();
    if (driverDocVersions?.length) {
      const { data: typeRows } = await supabase.from('document_type_defs').select('key, label_he');
      (typeRows || []).forEach((t) => typeLabelMap.set(t.key, t.label_he));
    }
    if (driverDocVersions) {
      const driverNameById = new Map((drivers || []).map((d) => [d.id, d.full_name]));
      for (const ver of driverDocVersions) {
        const days = getDaysLeft(ver.expiry_date);
        const kind = classifyExpiryForActiveList(days);
        if (kind === 'none' || days === null) continue;
        const label = typeLabelMap.get(ver.document_type_key) || ver.document_type_key;
        const driverName = driverNameById.get(ver.entity_id) || 'נהג';
        allAlerts.push({
          id: `drvdoc-${ver.id}`,
          category: 'driver_document',
          severity: kind === 'future' ? 'info' : days <= 7 ? 'warning' : 'info',
          title: expiryAlertTitle(`תוקף ${label}`, days, docAlertThresholds),
          subtitle: kind === 'future' ? `${driverName} · עתידית` : driverName,
          daysLeft: days,
          date: ver.expiry_date,
          meta: kind === 'future' ? `בעוד ${days} ימים` : tierDetail(ver.expiry_date, days, expiryReminderTier(days, docAlertThresholds) || 30),
          link: `/drivers?driverId=${ver.entity_id}&section=documents&docType=${encodeURIComponent(ver.document_type_key || '')}`,
        });
      }
    }


    const { data: faults } = await applyCompanyScope(
      supabase.from('faults').select('*').in('urgency', ['urgent', 'high', 'critical', 'דחוף', 'גבוהה']).in('status', ['new', 'open', 'חדש', 'פתוח', 'בטיפול', 'in_progress']),
      companyFilter
    );
    if (faults) {
      for (const f of faults) {
        const internalNumber = internalForPlate(f.vehicle_plate);
        allAlerts.push({
          id: `fault-${f.id}`,
          category: 'fault',
          severity: 'critical',
          title: `תקלה דחופה - ${f.fault_type || 'כללי'}`,
          subtitle: `${f.vehicle_plate || 'ללא רכב'} • ${f.driver_name || 'ללא נהג'}`,
          internalNumber,
          vehiclePlate: f.vehicle_plate || null,
          daysLeft: null,
          date: f.date ? new Date(f.date).toISOString().split('T')[0] : null,
          meta: f.description || undefined,
          link: (() => {
            const ctx = vehicleCtx(f.vehicle_plate);
            if (ctx) return buildFaultDetailUrl(f.id, ctx);
            return '/faults';
          })(),
        });
      }
    }

    // 3b. Open vehicle defects (inspection findings)
    const { data: vehicleTasks } = await applyCompanyScope(
      supabase.from('vehicle_tasks').select('*').in('status', ['open', 'in_progress']),
      companyFilter
    );
    if (vehicleTasks) {
      for (const vt of vehicleTasks as any[]) {
        const daysSince = Math.floor((Date.now() - new Date(vt.created_at).getTime()) / (1000 * 60 * 60 * 24));
        const isOverdue = vt.follow_up_date && new Date(vt.follow_up_date) < new Date();
        const severity: AlertSeverity = isOverdue ? 'critical' : daysSince > 7 ? 'warning' : 'info';
        const internalNumber = internalForPlate(vt.vehicle_plate);
        allAlerts.push({
          id: `defect-${vt.id}`,
          category: 'fault',
          severity,
          title: isOverdue ? `ליקוי באיחור: ${vt.title}` : `ליקוי פתוח: ${vt.title}`,
          subtitle: `רכב ${vt.vehicle_plate || '—'} • ${daysSince} ימים`,
          internalNumber,
          vehiclePlate: vt.vehicle_plate || null,
          daysLeft: vt.follow_up_date ? Math.floor((new Date(vt.follow_up_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null,
          date: vt.created_at?.split('T')[0] || null,
          meta: vt.description || undefined,
          link: (() => {
            const ctx = vehicleCtx(vt.vehicle_plate);
            if (ctx) return buildVehicleTaskDetailUrl(vt.id, ctx);
            return '/vehicle-tasks';
          })(),
        });
      }
    }

    // 3c. Custom alerts (30/7/1 day reminders from vehicle actions)
    const { data: customAlerts } = await applyCompanyScope(
      supabase.from('custom_alerts').select('*').eq('is_active', true),
      companyFilter,
    );
    if (customAlerts) {
      const officerSeen = new Set(
        allAlerts
          .filter((a) => a.category === 'officer' && a.vehiclePlate && a.date)
          .map((a) => `${normalizePlate(a.vehiclePlate || '')}|${String(a.date).slice(0, 10)}`),
      );
      // One inspection writes the officer alert plus its 30/7/1 reminders, all
      // carrying the same `target:` date. The alert itself is shown and the
      // reminders are folded into it, so an inspection appears exactly once.
      const targetDateOf = (row: { description?: string | null; alert_date?: string | null }) =>
        String(row.description || '').match(/target:(\d{4}-\d{2}-\d{2})/)?.[1] ||
        String(row.alert_date || '').slice(0, 10);
      const orderedCustomAlerts = [...customAlerts].sort((a, b) => {
        const aOfficer = a.alert_type === OFFICER_ALERT_TYPE ? 0 : 1;
        const bOfficer = b.alert_type === OFFICER_ALERT_TYPE ? 0 : 1;
        return aOfficer - bOfficer;
      });

      for (const ca of orderedCustomAlerts) {
        const daysLeft = getDaysLeft(ca.alert_date);
        if (daysLeft === null) continue;
        const plate = plateFromAlertText(ca.description) || plateFromAlertText(ca.title);
        const customVehicleId =
          vehicleIdFromAlertText(ca.description) || vehicleIdFromAlertText(ca.title);
        const driverName = driverNameFromAlertText(ca.description) || driverNameFromAlertText(ca.title);
        const driverId = driverIdFromAlertText(ca.description) || driverIdFromAlertText(ca.title);
        const internalNumber = internalForPlate(plate);
        const timingLabel = daysLeft > 30 ? 'עתידית' : 'קרובה';
        const severity: AlertSeverity = daysLeft <= 14 ? 'warning' : 'info';
        const isOfficer =
          ca.alert_type === OFFICER_ALERT_TYPE || String(ca.title || '').includes(OFFICER_ALERT_LABEL);
        const isFree =
          ca.alert_type === FREE_ALERT_TYPE || String(ca.title || '').includes(FREE_ALERT_LABEL);
        const category: AlertCategory = isOfficer ? 'officer' : isFree ? 'free' : 'service_order';
        // Only inspection-generated rows share a canonical target date and
        // should be folded together. Two manual officer alerts may legitimately
        // target the same vehicle and date, so they must remain separate.
        const isGeneratedOfficer =
          isOfficer && String(ca.description || '').includes('target:');
        if (isGeneratedOfficer && plate) {
          const key = `${normalizePlate(plate)}|${targetDateOf(ca)}`;
          if (officerSeen.has(key)) continue;
          officerSeen.add(key);
        }
        allAlerts.push({
          id: `custom-${ca.id}`,
          category,
          severity,
          title: ca.title,
          subtitle: [
            plate ? `רכב ${plate}` : driverName ? `נהג ${driverName}` : ca.description?.split('\n')[0] || '',
            timingLabel,
            daysLeft > 30 ? `בעוד ${daysLeft} ימים` : undefined,
          ].filter(Boolean).join(' • '),
          internalNumber,
          vehiclePlate: plate || null,
          daysLeft,
          date: ca.alert_date,
          meta: ca.description || undefined,
          link:
            plate && customVehicleId
              ? buildVehicleHubUrl(customVehicleId)
              : plate
                ? buildVehicleContextUrl('/vehicles', { plate })
                : driverId
                  ? `/drivers?driverId=${encodeURIComponent(driverId)}`
                  : '/alerts',
        });
      }
    }

    // 4. Service orders - pending / urgent
    const { data: serviceOrders } = await applyCompanyScope(
      supabase.from('service_orders').select('*').in('treatment_status', ['new', 'pending_approval', 'in_progress']),
      companyFilter
    );
    if (serviceOrders) {
      for (const so of serviceOrders) {
        const isUrgent = so.urgency === 'urgent' || so.urgency === 'critical';
        const severity: AlertSeverity = isUrgent ? 'critical' : so.treatment_status === 'new' ? 'warning' : 'info';
        const internalNumber = internalForPlate(so.vehicle_plate);
        allAlerts.push({
          id: `so-${so.id}`,
          category: 'service_order',
          severity,
          title: isUrgent ? `הזמנת שירות דחופה` : `הזמנת שירות ${so.treatment_status === 'new' ? 'חדשה' : 'בטיפול'}`,
          subtitle: `${so.vehicle_plate || 'ללא רכב'} • ${so.driver_name || 'ללא נהג'}`,
          internalNumber,
          vehiclePlate: so.vehicle_plate || null,
          daysLeft: null,
          date: so.created_at ? new Date(so.created_at).toISOString().split('T')[0] : null,
          meta: `${so.service_category || ''} ${so.description ? '- ' + so.description : ''}`.trim() || undefined,
          link: (() => {
            const ctx = vehicleCtx(so.vehicle_plate);
            if (ctx) return buildServiceOrderDetailUrl(so.id, ctx);
            return '/service-orders';
          })(),
        });
      }
    }

    // 5. Work assignments - pending approval
    const { data: assignments } = await applyCompanyScope(
      supabase.from('work_assignments').select('*').in('status', ['pending', 'approved']),
      companyFilter
    );
    if (assignments) {
      for (const wa of assignments) {
        const isPending = wa.status === 'pending';
        const internalNumber = internalForPlate(wa.vehicle_plate);
        allAlerts.push({
          id: `wa-${wa.id}`,
          category: 'work_assignment',
          severity: isPending ? 'warning' : 'info',
          title: isPending ? 'סידור עבודה ממתין לאישור' : 'סידור עבודה פעיל',
          subtitle: `${wa.driver_name || 'ללא נהג'} • ${wa.vehicle_plate || 'ללא רכב'}`,
          internalNumber,
          vehiclePlate: wa.vehicle_plate || null,
          daysLeft: null,
          date: wa.scheduled_date || null,
          meta: wa.title || undefined,
          link: '/work-orders',
        });
      }
    }

    allAlerts.sort((a, b) => {
      const severityOrder: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
      const diff = severityOrder[a.severity] - severityOrder[b.severity];
      if (diff !== 0) return diff;
      return (a.daysLeft ?? 999) - (b.daysLeft ?? 999);
    });

    setAlerts(allAlerts);
    setAlertsLoading(false);
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    const { data } = await supabase.from('system_logs').select('*').order('created_at', { ascending: false }).limit(500);
    if (data) setLogs(data as LogEntry[]);
    setLogsLoading(false);
  };

  const applyListParams = (next: { category?: AlertCategory | 'all'; scope?: AlertListScope }) => {
    const q = new URLSearchParams(searchParams);
    const cat = next.category ?? alertFilter;
    const scope = next.scope ?? alertScope;
    if (cat === 'all') q.delete('category');
    else q.set('category', cat);
    q.set('scope', scope);
    if (alertWindowDays !== 30) q.set('days', String(alertWindowDays));
    else q.delete('days');
    setSearchParams(q);
  };

  const alertsForEntity = useMemo(() => {
    const wantedPlate = normalizePlate(filterVehicle);
    return alerts.filter((a) => {
      if (wantedPlate && normalizePlate(a.vehiclePlate || '') !== wantedPlate) return false;
      if (filterInternal && a.internalNumber !== filterInternal) return false;
      return true;
    });
  }, [alerts, filterVehicle, filterInternal]);

  const filteredAlerts = useMemo(() => {
    return alertsForEntity
      .filter((a) => alertPassesListFilters(a, alertFilter, alertScope, alertWindowDays))
      .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
  }, [alertsForEntity, alertFilter, alertScope, alertWindowDays]);

  const countForScope = (scope: AlertListScope) =>
    alertsForEntity.filter((a) => alertPassesListFilters(a, alertFilter, scope, alertWindowDays)).length;

  const urgentCount = alertsForEntity.filter((a) => alertInScope(a.daysLeft, 'urgent', alertWindowDays)).length;
  const expiredCount = alertsForEntity.filter((a) => alertInScope(a.daysLeft, 'expired', alertWindowDays)).length;

  const alertCounts = {
    all: alertsForEntity.length,
    urgent: urgentCount,
    expired: expiredCount,
    critical: alertsForEntity.filter((a) => a.severity === 'critical').length,
    warning: alertsForEntity.filter((a) => a.severity === 'warning').length,
  };
  const categories: (AlertCategory | 'all')[] = [
    'all',
    'officer',
    'free',
    'test',
    'insurance',
    'comprehensive_insurance',
    'third_party_insurance',
    'license',
    'fault',
    'service_order',
    'work_assignment',
  ];

  const selectClass =
    'w-full p-3 text-base rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none';

  const entityFilterActive = Boolean(filterVehicle || filterInternal);

  const filteredLogs = logs.filter(l => {
    if (logSearch && !l.user_name.includes(logSearch) && !l.details.includes(logSearch) && !l.vehicle_plate.includes(logSearch) && !l.entity_id.includes(logSearch)) return false;
    if (logFilterCompany && l.company_name !== logFilterCompany) return false;
    if (logFilterDate && !l.created_at.startsWith(logFilterDate)) return false;
    if (logFilterEntity && l.entity_type !== logFilterEntity) return false;
    return true;
  });

  return (
    <div className="animate-fade-in space-y-4">
      <h1 className="page-header flex items-center gap-3 !mb-0">
        <Bell size={28} />
        התראות ועדכונים
      </h1>
      <p className="text-sm text-muted-foreground">
        ברירת מחדל: פגי תוקף + החודש הקרוב. פג תוקף נשאר גלוי. כל ההתראות זמין כסינון משני.
      </p>

      <Tabs defaultValue="alerts" dir="rtl">
        <TabsList className="w-full grid grid-cols-3 h-12">
          <TabsTrigger value="alerts" className="text-base font-bold gap-2">
            <Bell size={18} />
            התראות
            {alertCounts.urgent > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-destructive text-destructive-foreground text-xs font-bold">
                {alertCounts.urgent}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="log"
            className="text-base font-bold gap-2"
            onClick={() => navigate('/alerts/log?tab=active')}
          >
            <LogIcon size={18} />
            התראות ושליחות
          </TabsTrigger>
          <TabsTrigger value="updates" className="text-base font-bold gap-2" disabled={!isSuperAdmin}>
            <ScrollText size={18} />
            עדכונים
          </TabsTrigger>
        </TabsList>

        {/* ─── Alerts Tab ─── */}
        <TabsContent value="alerts" className="space-y-4 mt-4">
          {/* Plate + internal quick search */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-3xl">
            <div>
              <label className="block text-sm font-medium mb-1">מספר רכב</label>
              <SearchableFilterField
                value={filterVehicle}
                onChange={setFilterVehicle}
                options={vehiclePlates}
                placeholder="הכל / הקלידו לחיפוש..."
                searchPlaceholder="חיפוש מספר רכב..."
                emptyText="לא נמצא מספר רכב"
                triggerClassName={selectClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">מספר פנימי</label>
              <SearchableFilterField
                value={filterInternal}
                onChange={setFilterInternal}
                options={internalNumbers}
                placeholder="הכל / הקלידו לחיפוש..."
                searchPlaceholder="חיפוש מספר פנימי..."
                emptyText="לא נמצא מספר פנימי"
                triggerClassName={selectClass}
              />
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            {([
              ['urgent', `דחוף / החודש הקרוב (${countForScope('urgent')})`],
              ['expired', `פג תוקף (${countForScope('expired')})`],
              ['all', alertFilter === 'test' ? `כל הטסטים (${countForScope('all')})` : alertFilter === 'insurance' ? `כל הביטוחים (${countForScope('all')})` : `כל ההתראות (${countForScope('all')})`],
            ] as const).map(([scope, label]) => (
              <button
                key={scope}
                type="button"
                onClick={() => applyListParams({ scope })}
                className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
                  alertScope === scope ? 'bg-primary text-primary-foreground shadow-md' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Severity Counters */}
          <div className="flex items-center gap-3 flex-wrap">
            {alertCounts.critical > 0 && (
              <span className="px-3 py-1.5 rounded-full bg-destructive text-destructive-foreground text-sm font-bold animate-pulse">
                {alertCounts.critical} קריטי
              </span>
            )}
            {alertCounts.warning > 0 && (
              <span className="px-3 py-1.5 rounded-full bg-amber-500 text-white text-sm font-bold">
                {alertCounts.warning} אזהרה
              </span>
            )}
            <span className="px-3 py-1.5 rounded-full bg-muted text-muted-foreground text-sm font-medium">
              מוצג {filteredAlerts.length}
            </span>
          </div>

          {/* Category Filter */}
          <div className="flex gap-2 flex-wrap">
            {categories.map((cat) => {
              const count =
                cat === 'all'
                  ? alertsForEntity.filter((a) => alertInScope(a.daysLeft, alertScope, alertWindowDays)).length
                  : alertsForEntity.filter(
                      (a) => alertCategoryMatches(cat, a.category) && alertInScope(a.daysLeft, alertScope, alertWindowDays),
                    ).length;
              if (cat !== 'all' && cat !== 'officer' && cat !== 'free' && count === 0) return null;
              const extra =
                cat === 'test' && alertFilter === 'test'
                  ? alertScope === 'all'
                    ? ' · כל הטסטים'
                    : ' · דחוף'
                  : cat === 'insurance' && alertFilter === 'insurance'
                    ? alertScope === 'all'
                      ? ' · כל הביטוחים'
                      : ' · דחוף'
                    : '';
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => applyListParams({ category: cat })}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${alertFilter === cat ? 'bg-primary text-primary-foreground shadow-md' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                >
                  {cat === 'all' ? 'הכל' : categoryLabels[cat]}
                  {cat === 'insurance' ? ' (כל הסוגים)' : ''}
                  {extra} ({count})
                </button>
              );
            })}
          </div>

          {alertsLoading && (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
            </div>
          )}

          {!alertsLoading && filteredAlerts.length === 0 && (
            <div className="card-elevated text-center py-16">
              <CheckCircle2 className="mx-auto mb-4 text-green-500" size={48} />
              <p className="text-xl font-bold text-foreground">
                {entityFilterActive ? 'אין התראות לסינון שנבחר' : 'הכל תקין! 🎉'}
              </p>
              <p className="text-muted-foreground mt-2">
                {filterVehicle && filterInternal
                  ? `לא נמצאו התראות עבור רכב ${filterVehicle} / מספר פנימי ${filterInternal}`
                  : filterVehicle
                    ? `לא נמצאו התראות פעילות עבור רכב ${filterVehicle}`
                    : filterInternal
                      ? `לא נמצאו התראות פעילות עבור מספר פנימי ${filterInternal}`
                      : 'אין התראות פעילות כרגע'}
              </p>
            </div>
          )}

          {!alertsLoading && filteredAlerts.length > 0 && (
            <>
              <div className="hidden md:block card-elevated overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-xs">
                      <th className="p-3 text-right font-semibold">סוג</th>
                      <th className="p-3 text-right font-semibold">כותרת</th>
                      <th className="p-3 text-right font-semibold">פרטים</th>
                      <th className="p-3 text-right font-semibold">מספר פנימי</th>
                      <th className="p-3 text-right font-semibold">ימים</th>
                      <th className="p-3 text-right font-semibold">תאריך</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAlerts.map((alert) => (
                      <tr
                        key={alert.id}
                        onClick={() => alert.link && navigate(alert.link)}
                        className={`border-b border-border/50 ${alert.link ? 'cursor-pointer hover:bg-muted/30' : ''}`}
                      >
                        <td className="p-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${severityBadge[alert.severity]}`}>
                            {categoryLabels[alert.category]}
                          </span>
                        </td>
                        <td className="p-3 font-medium">{alert.title}</td>
                        <td className="p-3 text-muted-foreground max-w-[240px] truncate">{alert.subtitle}</td>
                        <td className="p-3 font-mono text-xs whitespace-nowrap">
                          <InternalNumber value={alert.internalNumber} />
                        </td>
                        <td className="p-3 whitespace-nowrap font-bold">
                          {alert.daysLeft !== null ? (alert.daysLeft <= 0 ? 'פג!' : `${alert.daysLeft} ימים`) : '—'}
                        </td>
                        <td className="p-3 whitespace-nowrap text-muted-foreground">
                          {alert.date ? new Date(alert.date).toLocaleDateString('he-IL') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden space-y-3">
                {filteredAlerts.map(alert => {
                  const Icon = categoryIcons[alert.category];
                  return (
                    <div key={alert.id}
                      onClick={() => alert.link && navigate(alert.link)}
                      className={`rounded-2xl border-2 p-5 transition-all hover:shadow-md ${alert.link ? 'cursor-pointer' : ''} ${severityStyles[alert.severity]}`}>
                      <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-xl ${severityBadge[alert.severity]}`}>
                          <Icon size={22} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h3 className="font-bold text-lg">{alert.title}</h3>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${severityBadge[alert.severity]}`}>
                              {categoryLabels[alert.category]}
                            </span>
                          </div>
                          <p className="text-sm opacity-80 font-medium">{alert.subtitle}</p>
                          {alert.internalNumber && (
                            <p className="text-sm opacity-70 mt-1">
                              מספר פנימי: <InternalNumber value={alert.internalNumber} className="text-sm" />
                            </p>
                          )}
                          {alert.meta && <p className="text-sm opacity-60 mt-1 line-clamp-2">{alert.meta}</p>}
                          {alert.link && <p className="text-xs mt-2 opacity-70 underline">לחץ לצפייה →</p>}
                        </div>
                        <div className="text-left shrink-0">
                          {alert.daysLeft !== null && (
                            <div className="flex items-center gap-1.5">
                              <Clock size={16} />
                              <span className="font-bold text-lg">
                                {alert.daysLeft <= 0 ? 'פג!' : `${alert.daysLeft} ימים`}
                              </span>
                            </div>
                          )}
                          {alert.date && (
                            <p className="text-xs opacity-60 mt-1">
                              {new Date(alert.date).toLocaleDateString('he-IL')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </TabsContent>

        {/* ─── Updates (System Logs) Tab ─── */}
        <TabsContent value="updates" className="space-y-4 mt-4">
          {!isSuperAdmin ? (
            <div className="card-elevated text-center py-16">
              <ScrollText size={48} className="mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-xl text-muted-foreground">אין לך הרשאה לצפות בעדכונים</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                  <input value={logSearch} onChange={e => setLogSearch(e.target.value)} placeholder="חיפוש..."
                    className="w-full pr-10 p-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none" />
                </div>
                <select value={logFilterCompany} onChange={e => setLogFilterCompany(e.target.value)}
                  className="p-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none">
                  <option value="">כל החברות</option>
                  {companies.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={logFilterEntity} onChange={e => setLogFilterEntity(e.target.value)}
                  className="p-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none">
                  <option value="">כל הסוגים</option>
                  {Object.entries(ENTITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input type="date" value={logFilterDate} onChange={e => setLogFilterDate(e.target.value)}
                  className="p-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none" />
              </div>

              <p className="text-sm text-muted-foreground">{filteredLogs.length} רשומות</p>

              {logsLoading ? (
                <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" /></div>
              ) : filteredLogs.length === 0 ? (
                <div className="card-elevated text-center py-12 text-muted-foreground">אין עדכונים</div>
              ) : (
                <div className="space-y-2">
                  {filteredLogs.map(l => (
                    <div key={l.id} className="card-elevated text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-bold">{l.user_name || 'מערכת'}</span>
                            <span className="px-2 py-0.5 rounded-lg bg-primary/10 text-primary text-xs font-bold">
                              {ACTION_LABELS[l.action_type] || l.action_type}
                            </span>
                            <span className="px-2 py-0.5 rounded-lg bg-muted text-muted-foreground text-xs">
                              {ENTITY_LABELS[l.entity_type] || l.entity_type}
                            </span>
                            {l.channel !== 'system' && (
                              <span className="px-2 py-0.5 rounded-lg bg-accent text-accent-foreground text-xs">{l.channel}</span>
                            )}
                          </div>
                          {l.details && <p className="text-muted-foreground line-clamp-2">{l.details}</p>}
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            {l.company_name && <span className="flex items-center gap-1"><Building2 size={12} /> {l.company_name}</span>}
                            {l.vehicle_plate && <span className="flex items-center gap-1"><Car size={12} /> {l.vehicle_plate}</span>}
                            {l.old_status && l.new_status && <span>{l.old_status} → {l.new_status}</span>}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(l.created_at), 'dd/MM HH:mm', { locale: he })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
