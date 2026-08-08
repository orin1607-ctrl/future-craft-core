import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Plus,
  Loader2,
  Phone,
  Trash2,
  ClipboardList,
  ClipboardCheck,
  UserCheck,
  RefreshCw,
  StickyNote,
  Settings2,
  ExternalLink,
  Car,
  Zap,
  History,
  AlertTriangle,
  Wrench,
  Briefcase,
  Fuel,
} from 'lucide-react';
import { buildVehicleContextUrl, buildVehicleHubUrl, markFleetOSHubNavigation, type VehicleHubDeepLink } from '@/lib/entityNavContext';
import { canAccessFleetOS } from '@/modules/fleetos/fleetosRoleMap';
import { supabase } from '@/integrations/supabase/client';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import CreateAlertModal from '@/components/CreateAlertModal';
import VehicleActionModal from '@/components/vehicles/VehicleActionModal';
import CompanyVehicleListsManager from '@/components/vehicles/CompanyVehicleListsManager';
import VehicleSupplierOrderModal from '@/components/vehicles/VehicleSupplierOrderModal';
import VehicleDashboard from '@/components/vehicles/VehicleDashboard';
import VehicleHubBottomActions from '@/components/vehicles/VehicleHubBottomActions';
import { VehiclePlateLine } from '@/components/vehicles/vehiclePlateDisplay';
import VehicleDaliaFullPanel from '@/components/vehicles/VehicleDaliaFullPanel';
import { DocumentCard } from '@/components/documents/DocumentViewer';
import { statusLabel } from '@/components/vehicles/vehicleHubUtils';
import {
  loadVehicleHubData,
  formatHubDate,
  statusBadgeClass,
  type HubTabId,
  type VehicleHubData,
} from '@/lib/vehicleHubData';
import type { VehicleHistoryEntry } from '@/lib/vehicleHistory';
import type { DashboardDrillDown } from '@/lib/vehicleDashboardData';
import { PREVIEW_HUB_DATA } from '@/dev/vehicleHubPreviewMock';
import { logVehicleEvent } from '@/lib/vehicleEventLog';
import { useAuth } from '@/contexts/AuthContext';

export interface VehicleHubVehicle {
  id: string;
  license_plate: string;
  internal_number: string;
  manufacturer: string;
  model: string;
  year: number;
  vehicle_type: string;
  status: string;
  odometer: number;
  assigned_driver_id: string | null;
  company_name: string;
  test_expiry: string | null;
  insurance_expiry: string | null;
  insurance_start: string | null;
  comprehensive_insurance_expiry: string | null;
  comprehensive_insurance_start: string | null;
  next_service_date: string | null;
  last_service_date: string | null;
  needs_transport: boolean;
  approval_status: string;
  license_doc_url: string;
  insurance_doc_url: string;
  comprehensive_insurance_doc_url: string;
  notes: string;
  management_type: string;
  monthly_leasing_cost: number | null;
  leasing_end_date: string | null;
  vehicle_return_date: string | null;
  monthly_loan_payment: number | null;
  loan_end_date: string | null;
  planned_replacement_date: string | null;
  has_loan: boolean;
  is_leasing: boolean;
  insurance_cost?: number | null;
  vehicle_color?: string | null;
  end_or_scrap_date?: string | null;
  import_buffer?: string | null;
  insurance_alerts_enabled?: boolean | null;
}

interface DriverRow {
  id: string;
  full_name: string;
  phone: string | null;
}

type HubMainSection = 'home' | 'details' | 'actions' | 'history' | 'manage';

/** טאבים בתוך פעולות רכב בלבד — היסטוריה במסך נפרד */
const ACTION_TABS: { id: HubTabId; label: string }[] = [
  { id: 'tracking', label: 'מעקב' },
  { id: 'faults', label: 'ליקויים' },
  { id: 'service', label: 'שירות' },
  { id: 'accidents', label: 'תאונות' },
  { id: 'inspection', label: 'בדיקות' },
  { id: 'alerts', label: 'התראות' },
  { id: 'docs', label: 'מסמכים' },
  { id: 'transfers', label: 'שינועים' },
];

/** Quick actions that open a full scoped screen (not inline modal). */
const QUICK_FULL_SCREEN_ROUTES: Record<string, { path: string; action?: string }> = {
  תאונה: { path: '/accidents', action: 'new' },
};

const QUICK_ACTIONS: { cat: string; label: string }[] = [
  { cat: 'ליקוי', label: 'ליקוי' },
  { cat: 'תקלה', label: 'תקלה' },
  { cat: 'טיפול', label: 'טיפול' },
  { cat: 'תאונה', label: 'תאונה' },
  { cat: 'בדיקה', label: 'בדיקה' },
  { cat: 'הזמנת שירות', label: 'הזמנת שירות' },
  { cat: 'שינוע', label: 'שינוע' },
  { cat: 'מסמך', label: 'מסמך' },
  { cat: 'הערה', label: 'הערה' },
  { cat: 'התראה', label: 'התראה' },
  { cat: '__supplier__', label: 'ספק' },
];

const HISTORY_TYPE_LABEL: Record<string, string> = {
  fault: 'תקלה',
  accident: 'תאונה',
  handover: 'שינוע',
  towing: 'שינוע',
  service: 'שירות',
  expense: 'הוצאה',
  inspection: 'בדיקה',
  defect: 'ליקוי',
  exchange: 'החלפה',
  document: 'מסמך',
  audit: 'פעולה במערכת',
  gap: 'חוסר',
  note: 'הערה',
  status: 'סטטוס',
  management: 'ניהול',
};

function urgencyLabel(u: string) {
  if (u === 'urgent' || u === 'critical') return { text: 'גבוהה', cls: 'status-inactive' };
  if (u === 'low') return { text: 'נמוכה', cls: 'bg-muted text-muted-foreground' };
  return { text: 'בינונית', cls: 'status-pending' };
}

function inspectionTypeLabel(t: string) {
  if (t === 'semi_annual') return 'חצי שנתית';
  if (t === 'tri_semi_annual') return 'תלת/חצי שנתית';
  if (t === 'quarterly') return 'רבעונית';
  return t || 'בדיקה';
}

function EmptyTab({ text }: { text: string }) {
  return <p className="text-center text-muted-foreground py-10 text-sm">{text}</p>;
}

export default function VehicleHub({
  vehicle: v,
  drivers,
  isManager,
  onBack,
  onEdit,
  onDelete,
  onRefresh,
  getDriverName,
  previewMode = false,
  previewHubExtras,
  hubBackLabel,
  initialHubNav,
}: {
  vehicle: VehicleHubVehicle;
  drivers: DriverRow[];
  isManager: boolean;
  onBack: () => void;
  onEdit: (v: VehicleHubVehicle) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
  getDriverName: (id: string | null) => string;
  previewMode?: boolean;
  previewHubExtras?: {
    semiInspection: string | null;
    triInspection: string | null;
    latestInsurer: string | null;
    openIssuesCount: number;
    drillDown: DashboardDrillDown;
  };
  hubBackLabel?: string;
  initialHubNav?: VehicleHubDeepLink;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const companyFilter = useCompanyFilter();
  const [mainSection, setMainSection] = useState<HubMainSection>('home');
  const [activeTab, setActiveTab] = useState<HubTabId>('tracking');
  const [hubData, setHubData] = useState<VehicleHubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionOpen, setActionOpen] = useState(false);
  const [listsManagerOpen, setListsManagerOpen] = useState(false);
  const [actionCategory, setActionCategory] = useState<string | undefined>();
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [supplierSource, setSupplierSource] = useState<{ type: string; label: string } | null>(null);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [noteText, setNoteText] = useState(v.notes || '');
  const [savingNote, setSavingNote] = useState(false);
  const [semiInspection, setSemiInspection] = useState<string | null>(null);
  const [triInspection, setTriInspection] = useState<string | null>(null);
  const [latestInsurer, setLatestInsurer] = useState<string | null>(null);
  const [openIssuesCount, setOpenIssuesCount] = useState(0);
  const [drillRefreshKey, setDrillRefreshKey] = useState(0);
  const [initialDrillKind, setInitialDrillKind] = useState<
    'insurance_licenses' | 'documents' | 'gaps_alerts' | 'service' | 'open_issues' | 'transport' | null
  >(null);
  const [initialHubFocus, setInitialHubFocus] = useState<string | null>(null);
  const [initialHubEntityId, setInitialHubEntityId] = useState<string | null>(null);
  const [savingInsuranceToggle, setSavingInsuranceToggle] = useState(false);

  useEffect(() => {
    if (!initialHubNav) return;
    if (initialHubNav.hubSection) setMainSection(initialHubNav.hubSection);
    if (initialHubNav.hubTab) setActiveTab(initialHubNav.hubTab as HubTabId);
    if (initialHubNav.hubDrill) {
      setInitialDrillKind(initialHubNav.hubDrill as typeof initialDrillKind);
    }
    if (initialHubNav.hubFocus) setInitialHubFocus(initialHubNav.hubFocus);
    if (initialHubNav.hubEntityId) setInitialHubEntityId(initialHubNav.hubEntityId);
  }, [initialHubNav]);

  const sl = statusLabel(v.status);
  const driver = drivers.find((d) => d.id === v.assigned_driver_id);
  const driverName = getDriverName(v.assigned_driver_id);
  const plateQ = encodeURIComponent(v.license_plate);

  const vehicleScopedScreens: {
    label: string;
    path: string;
    icon: typeof ClipboardCheck;
    action?: 'new';
    fleetFuel?: boolean;
  }[] = [
    ...(canAccessFleetOS(user?.role)
      ? [{ label: 'דלק וטעינה', path: '/fleetos-ai', icon: Fuel, fleetFuel: true }]
      : []),
    { label: 'ביקורת רכב', path: '/vehicle-inspections', icon: ClipboardCheck },
    { label: 'בדיקת תלת / חצי', path: '/private-vehicle-inspection', icon: ClipboardCheck },
    { label: 'ליקויים', path: '/vehicle-tasks', icon: AlertTriangle },
    { label: 'הצמדת רכב לנהג', path: '/attach-car', icon: UserCheck },
    { label: 'תקלות', path: '/faults', icon: Wrench },
    { label: 'הזמנת שירות', path: '/service-orders', icon: Briefcase },
    { label: 'דיווח תאונה', path: '/accidents', icon: AlertTriangle, action: 'new' as const },
    { label: 'מסמכים', path: '/documents', icon: ClipboardList },
  ];

  const vehicleScopedLinks = (
    <div className="card-elevated p-4 mb-4">
      <h2 className="font-bold text-base mb-3 flex items-center gap-2">
        <ExternalLink size={18} /> מסכים מלאים — רכב זה בלבד
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {vehicleScopedScreens.map(({ label, path, icon: Icon, action, fleetFuel }) => (
          <Button
            key={path + label}
            type="button"
            variant="outline"
            className="h-auto min-h-[72px] py-3 flex flex-col gap-1.5 text-sm font-medium"
            onClick={() => {
              if (fleetFuel) {
                markFleetOSHubNavigation(v.id, buildVehicleHubUrl(v.id));
                navigate(
                  buildVehicleContextUrl(path, {
                    plate: v.license_plate,
                    vehicleId: v.id,
                    tab: 'fuel',
                    company: v.company_name || undefined,
                    internal: v.internal_number || undefined,
                    driver: driverName && driverName !== 'ללא נהג' ? driverName : undefined,
                  }),
                );
                return;
              }
              navigate(
                buildVehicleContextUrl(path, {
                  plate: v.license_plate,
                  vehicleId: v.id,
                  action,
                }),
              );
            }}
          >
            <Icon size={18} />
            {label}
          </Button>
        ))}
      </div>
    </div>
  );

  const refreshHub = useCallback(() => {
    if (previewMode) {
      setHubData(PREVIEW_HUB_DATA);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadVehicleHubData(v.license_plate, v.internal_number || '', companyFilter, {
      license_doc_url: v.license_doc_url,
      insurance_doc_url: v.insurance_doc_url,
      comprehensive_insurance_doc_url: v.comprehensive_insurance_doc_url,
      test_expiry: v.test_expiry,
      insurance_expiry: v.insurance_expiry,
      comprehensive_insurance_expiry: v.comprehensive_insurance_expiry,
    })
      .then(setHubData)
      .finally(() => setLoading(false));
  }, [v, companyFilter, previewMode, previewHubExtras]);

  useEffect(() => {
    refreshHub();
  }, [refreshHub]);

  useEffect(() => {
    setNoteText(v.notes || '');
  }, [v.notes]);

  useEffect(() => {
    if (previewMode && previewHubExtras) {
      setSemiInspection(previewHubExtras.semiInspection);
      setTriInspection(previewHubExtras.triInspection);
      setLatestInsurer(previewHubExtras.latestInsurer);
      setOpenIssuesCount(previewHubExtras.openIssuesCount);
      return;
    }
    supabase
      .from('vehicle_inspections')
      .select('inspection_type, inspection_date')
      .eq('vehicle_plate', v.license_plate)
      .order('inspection_date', { ascending: false })
      .then(({ data }) => {
        const semi = data?.find((i) => i.inspection_type === 'semi_annual');
        const tri = data?.find((i) => i.inspection_type === 'tri_semi_annual');
        setSemiInspection(semi?.inspection_date || null);
        setTriInspection(tri?.inspection_date || null);
      });
  }, [v.license_plate, previewMode, previewHubExtras]);

  useEffect(() => {
    if (previewMode && previewHubExtras) return;
    const showIns = v.management_type === 'financial_leasing' || v.management_type === 'self_maintained';
    if (!showIns) return;
    supabase
      .from('vehicle_insurance_history')
      .select('insurer_name')
      .eq('vehicle_id', v.id)
      .order('year', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setLatestInsurer(data?.insurer_name || null));
  }, [v.id, v.management_type, previewMode, previewHubExtras]);

  useEffect(() => {
    if (previewMode && previewHubExtras) return;
    Promise.all([
      supabase
        .from('faults')
        .select('id', { count: 'exact', head: true })
        .eq('vehicle_plate', v.license_plate)
        .in('status', ['new', 'open', 'opened', 'in_progress']),
      supabase
        .from('vehicle_tasks')
        .select('id, title, status')
        .eq('vehicle_plate', v.license_plate)
        .in('status', ['open', 'pending', 'in_progress']),
    ]).then(([f, t]) => {
      const taskCount = (t.data || []).filter(
        (row) =>
          row.status !== 'history_log' &&
          !(row.title || '').startsWith('__veh_evt__:'),
      ).length;
      setOpenIssuesCount((f.count || 0) + taskCount);
    });
  }, [v.license_plate, previewMode, previewHubExtras]);

  const jumpFromDashboard = (section: 'details' | 'actions' | 'history' | 'manage', tab?: HubTabId) => {
    setMainSection(section);
    if (tab) setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openQuick = (cat: string) => {
    if (cat === '__supplier__') {
      setSupplierSource(null);
      setSupplierOpen(true);
      return;
    }
    if (cat === 'התראה') {
      setShowAlertModal(true);
      return;
    }
    const fullScreen = QUICK_FULL_SCREEN_ROUTES[cat];
    if (fullScreen) {
      navigate(
        buildVehicleContextUrl(fullScreen.path, {
          plate: v.license_plate,
          vehicleId: v.id,
          action: fullScreen.action,
        }),
      );
      return;
    }
    setActionCategory(cat);
    setActionOpen(true);
  };

  const openSupplierFromRow = (type: string, label: string) => {
    setSupplierSource({ type, label });
    setSupplierOpen(true);
  };

  const saveNote = async () => {
    if (previewMode) {
      toast.info('תצוגת פיתוח — שמירה מבוטלת');
      return;
    }
    setSavingNote(true);
    const { error } = await supabase.from('vehicles').update({ notes: noteText }).eq('id', v.id);
    setSavingNote(false);
    if (error) toast.error('שגיאה בשמירת ההערה');
    else {
      await logVehicleEvent({
        vehicleId: v.id,
        vehiclePlate: v.license_plate,
        companyName: v.company_name || user?.company_name || '',
        action: 'הוספת הערה',
        details: noteText.slice(0, 200),
        userId: user?.id,
        userName: user?.full_name,
      });
      toast.success('ההערה נשמרה');
      onRefresh();
      refreshHub();
      setDrillRefreshKey((k) => k + 1);
    }
  };

  const archiveVehicle = async () => {
    if (previewMode) {
      toast.info('תצוגת פיתוח — ארכיון מבוטל');
      return;
    }
    const plateIds = `${v.license_plate}${v.internal_number ? ` · ${v.internal_number}` : ''}`;
    if (
      !confirm(
        `להעביר רכב זה לארכיון?${plateIds ? `\n\n${plateIds}` : ''}\n\nהנתונים וההיסטוריה יישמרו. ניתן לצפות ברכב בארכיון.`,
      )
    ) {
      return;
    }
    await supabase.from('vehicles').update({ status: 'archived' }).eq('id', v.id);
    await logVehicleEvent({
      vehicleId: v.id,
      vehiclePlate: v.license_plate,
      companyName: v.company_name || user?.company_name || '',
      action: 'ארכיון רכב',
      userId: user?.id,
      userName: user?.full_name,
    });
    toast.success('הרכב הועבר לארכיון');
    onRefresh();
    refreshHub();
    setDrillRefreshKey((k) => k + 1);
  };

  const expiryAlerts = [
    v.test_expiry && { title: 'תוקף טסט', date: v.test_expiry },
    v.insurance_expiry && { title: 'תוקף ביטוח חובה', date: v.insurance_expiry },
    v.comprehensive_insurance_expiry && { title: 'תוקף ביטוח מקיף', date: v.comprehensive_insurance_expiry },
    v.next_service_date && { title: 'טיפול מתוכנן', date: v.next_service_date },
  ].filter(Boolean) as { title: string; date: string }[];

  const renderActionTabContent = () => {
    if (loading && !hubData) {
      return (
        <div className="py-12 text-center text-muted-foreground">
          <Loader2 className="animate-spin mx-auto mb-2" size={24} />
          טוען...
        </div>
      );
    }
    const data = hubData!;
    const trackingRows = data.history;

    switch (activeTab) {
      case 'tracking':
        return (
          <div className="card-elevated overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs">
                  <th className="p-2 text-right font-semibold">פעולה</th>
                  <th className="p-2 text-right font-semibold">סוג</th>
                  <th className="p-2 text-right font-semibold">תאריך</th>
                  <th className="p-2 text-right font-semibold">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {trackingRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-6">
                      <EmptyTab text="אין פעולות במעקב" />
                    </td>
                  </tr>
                ) : (
                  trackingRows.map((h) => (
                    <tr key={`${h.type}-${h.id}`} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="p-2 font-medium">{h.title}</td>
                      <td className="p-2 text-muted-foreground">{HISTORY_TYPE_LABEL[h.type] || h.type}</td>
                      <td className="p-2 text-muted-foreground whitespace-nowrap">{formatHubDate(h.date)}</td>
                      <td className="p-2">
                        {h.status ? (
                          <span className={`status-badge text-xs ${statusBadgeClass(h.status)}`}>{h.status}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        );
      case 'faults':
        return (
          <div className="card-elevated overflow-x-auto">
            {data.tasks.length === 0 && data.faults.length === 0 ? (
              <EmptyTab text="אין ליקויים או תקלות" />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-xs">
                    <th className="p-2 text-right">מספר אירוע</th>
                    <th className="p-2 text-right">תיאור</th>
                    <th className="p-2 text-right">סוג</th>
                    <th className="p-2 text-right">תאריך</th>
                    <th className="p-2 text-right">סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tasks.map((t) => (
                    <tr key={`task-${t.id}`} className="border-b border-border/50">
                      <td className="p-2 text-muted-foreground">—</td>
                      <td className="p-2">{t.description || t.title}</td>
                      <td className="p-2"><span className="status-badge status-pending text-xs">ליקוי</span></td>
                      <td className="p-2 text-muted-foreground">{formatHubDate(t.created_at)}</td>
                      <td className="p-2">
                        <span className={`status-badge text-xs ${statusBadgeClass(t.status || '')}`}>{t.status || 'פתוח'}</span>
                        <Button type="button" variant="outline" size="sm" className="h-7 text-xs mt-2" onClick={() => openSupplierFromRow('ליקוי', t.title)}>
                          הזמנה לספק
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {data.faults.map((f) => (
                    <tr key={`fault-${f.id}`} className="border-b border-border/50">
                      <td className="p-2 font-mono text-xs">{f.event_number || '—'}</td>
                      <td className="p-2">{f.description}</td>
                      <td className="p-2"><span className={`status-badge text-xs ${urgencyLabel(f.urgency).cls}`}>{f.fault_type}</span></td>
                      <td className="p-2 text-muted-foreground">{formatHubDate(f.date || f.created_at)}</td>
                      <td className="p-2">
                        <span className={`status-badge text-xs ${statusBadgeClass(f.status)}`}>{f.status}</span>
                        <Button type="button" variant="outline" size="sm" className="h-7 text-xs mt-2" onClick={() => openSupplierFromRow('תקלה', f.description)}>
                          הזמנה לספק
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      case 'service':
        return (
          <div className="card-elevated overflow-x-auto">
            {data.services.length === 0 ? (
              <EmptyTab text="אין רשומות שירות" />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-xs">
                    <th className="p-2 text-right">סוג</th>
                    <th className="p-2 text-right">ספק</th>
                    <th className="p-2 text-right">תאריך</th>
                    <th className="p-2 text-right">סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {data.services.map((s) => (
                    <tr key={s.id} className="border-b border-border/50">
                      <td className="p-2 font-medium">{s.service_category}</td>
                      <td className="p-2 text-muted-foreground">{s.vendor_name || '—'}</td>
                      <td className="p-2 text-muted-foreground">{formatHubDate(s.date_time || s.created_at)}</td>
                      <td className="p-2">
                        <span className={`status-badge text-xs ${statusBadgeClass(s.treatment_status)}`}>{s.treatment_status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      case 'accidents':
        return data.accidents.length === 0 ? (
          <div className="card-elevated"><EmptyTab text="אין תאונות רשומות" /></div>
        ) : (
          <div className="card-elevated overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {data.accidents.map((a) => (
                  <tr key={a.id} className="border-b border-border/50">
                    <td className="p-3">
                      <p className="font-medium">{a.location || 'ללא מיקום'}</p>
                      <p className="text-sm text-muted-foreground">{a.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">{formatHubDate(a.date || a.created_at)}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case 'inspection':
        return (
          <div className="card-elevated overflow-x-auto">
            {data.inspections.length === 0 ? (
              <EmptyTab text="אין בדיקות" />
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {data.inspections.map((i) => (
                    <tr key={i.id} className="border-b border-border/50">
                      <td className="p-3">
                        <p className="font-medium">{inspectionTypeLabel(i.inspection_type)}</p>
                        <p className="text-xs text-muted-foreground">{formatHubDate(i.inspection_date)}</p>
                        <span className={`status-badge text-xs mt-1 inline-block ${statusBadgeClass(i.overall_status || '')}`}>
                          {i.overall_status || '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      case 'alerts':
        return (
          <div className="card-elevated divide-y divide-border">
            {expiryAlerts.length === 0 && data.vehicleAlerts.length === 0 ? (
              <EmptyTab text="אין התראות" />
            ) : (
              <>
                {expiryAlerts.map((a, idx) => {
                  const days = Math.ceil((new Date(a.date).getTime() - Date.now()) / 86400000);
                  return (
                    <div key={`exp-${idx}`} className="p-3 flex justify-between items-center gap-2">
                      <span className="font-medium">{a.title}</span>
                      <span className={`text-sm ${days <= 14 ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
                        {new Date(a.date).toLocaleDateString('he-IL')}
                        {days <= 0 ? ' (פג)' : ` (${days} ימים)`}
                      </span>
                    </div>
                  );
                })}
                {data.vehicleAlerts.map((a) => (
                  <div key={a.id} className="p-3 flex justify-between items-center gap-2">
                    <span className="font-medium">{a.title}</span>
                    <span className={`text-sm ${a.daysLeft <= 7 ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
                      {a.alert_date ? new Date(a.alert_date).toLocaleDateString('he-IL') : '—'}
                      {a.daysLeft <= 0 ? ' (היום)' : ` (${a.daysLeft} ימים)`}
                    </span>
                  </div>
                ))}
              </>
            )}
            <div className="p-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowAlertModal(true)}>
                התראה מותאמת
              </Button>
            </div>
          </div>
        );
      case 'docs':
        return (
          <div className="space-y-2">
            {data.docs.length === 0 ? (
              <EmptyTab text="אין מסמכים" />
            ) : (
              data.docs.map((d) => (
                d.url ? (
                  <DocumentCard
                    key={d.id}
                    url={d.url}
                    fileName={d.name}
                    meta={d.expiry ? <p className="text-xs text-muted-foreground mt-0.5">תוקף: {d.expiry}</p> : undefined}
                    compact
                  />
                ) : (
                  <div key={d.id} className="card-elevated p-3">
                    <p className="font-medium">{d.name}</p>
                    {d.expiry && <p className="text-xs text-muted-foreground mt-1">תוקף: {d.expiry}</p>}
                  </div>
                )
              ))
            )}
          </div>
        );
      case 'transfers':
        return (
          <div className="card-elevated overflow-x-auto">
            {data.transfers.length === 0 ? (
              <EmptyTab text="אין שינועים" />
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {data.transfers.map((t) => (
                    <tr key={t.id} className="border-b border-border/50">
                      <td className="p-3">
                        <p className="font-medium flex items-center gap-2">
                          {t.title}
                          <span className="text-xs px-2 py-0.5 rounded-lg bg-primary/10 text-primary">
                            {t.kind === 'towing' ? 'הזמנת שינוע' : 'מסירת נהג'}
                          </span>
                        </p>
                        <p className="text-sm text-muted-foreground">{t.description}</p>
                        <p className="text-xs text-muted-foreground">{formatHubDate(t.date_time)}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  const mainNav = (
    <div className="grid grid-cols-2 gap-3 mb-4">
      {[
        { id: 'details' as HubMainSection, label: 'פרטי רכב', icon: Car, sub: 'סעיפים 1–5' },
        { id: 'actions' as HubMainSection, label: 'פעולות רכב', icon: Zap, sub: 'סעיפים 6–14' },
        { id: 'history' as HubMainSection, label: 'היסטוריית רכב', icon: History, sub: 'תוצאה בלבד' },
        { id: 'manage' as HubMainSection, label: 'ניהול רכב', icon: Settings2, sub: '' },
      ].map(({ id, label, icon: Icon, sub }) => (
        <button
          key={id}
          type="button"
          onClick={() => setMainSection(id)}
          className={`min-h-[76px] rounded-xl border-2 p-3 flex flex-col items-center justify-center gap-1 font-bold text-sm transition-colors ${
            mainSection === id
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border bg-card hover:border-primary/40'
          }`}
        >
          <Icon size={22} />
          {label}
          {sub && <span className="text-[10px] font-normal text-muted-foreground">{sub}</span>}
        </button>
      ))}
    </div>
  );

  const backLabel =
    mainSection === 'home'
      ? hubBackLabel || 'חזרה לרשימה'
      : 'חזרה לכרטיס הרכב';

  return (
    <div className="animate-fade-in pb-8">
      <button
        type="button"
        onClick={mainSection === 'home' ? onBack : () => setMainSection('home')}
        className="flex items-center gap-2 text-primary text-lg font-medium mb-4 min-h-[48px]"
      >
        <ArrowRight size={20} /> {backLabel}
      </button>

      {mainSection === 'home' && (
        <>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h1 className="text-2xl font-bold">
                {v.manufacturer} {v.model}
              </h1>
              <VehiclePlateLine
                plate={v.license_plate}
                internal={v.internal_number}
                className="text-muted-foreground text-lg"
              />
            </div>
            <span className={`status-badge ${sl.cls}`}>{sl.text}</span>
          </div>

          <VehicleDashboard
            vehicle={v}
            semiInspection={semiInspection}
            triInspection={triInspection}
            latestInsurer={latestInsurer}
            openIssuesCount={openIssuesCount}
            onJumpTo={jumpFromDashboard}
            previewDrillDown={previewMode ? previewHubExtras?.drillDown : undefined}
            previewMode={previewMode}
            drillRefreshKey={drillRefreshKey}
            initialDrillKind={initialDrillKind}
            initialHubFocus={initialHubFocus}
            initialHubEntityId={initialHubEntityId}
            onDrillDataChanged={() => {
              refreshHub();
              setDrillRefreshKey((k) => k + 1);
            }}
          />
          {mainNav}
          {hubData && hubData.history.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-base font-bold">פעולות אחרונות</h2>
                <button
                  type="button"
                  className="text-sm text-primary font-medium"
                  onClick={() => jumpFromDashboard('history')}
                >
                  כל ההיסטוריה
                </button>
              </div>
              <HistoryTimeline
                entries={hubData.history.slice(0, 5)}
                onNavigate={(route) =>
                  navigate(buildVehicleContextUrl(route, { plate: v.license_plate, vehicleId: v.id }))
                }
                plate={v.license_plate}
                internalNumber={v.internal_number}
                compact
              />
            </div>
          )}
          {isManager && vehicleScopedLinks}
          <div className="card-elevated p-4 mb-4 space-y-2">
            <p className="text-sm font-bold">תבניות לקוח — רשימות טיפול ובדיקה</p>
            <p className="text-xs text-muted-foreground">
              ניהול סוגי &quot;דרוש טיפול&quot; ובדיקת תלת/חצי לכל הלקוח. השינוי לא מוחק היסטוריה קיימת.
            </p>
            <Button type="button" variant="outline" className="w-full" onClick={() => setListsManagerOpen(true)}>
              <Settings2 size={18} className="ml-2" /> ניהול רשימות טיפול ובדיקה
            </Button>
          </div>
        </>
      )}

      {mainSection !== 'home' && (
        <>
          <div className="card-elevated mb-4 p-3 flex items-center justify-between">
            <div>
              <VehiclePlateLine plate={v.license_plate} internal={v.internal_number} className="font-bold text-base" />
              <p className="text-sm text-muted-foreground">
                {v.manufacturer} {v.model}
              </p>
            </div>
            <span className={`status-badge ${sl.cls}`}>{sl.text}</span>
          </div>
          {mainNav}
        </>
      )}

      {mainSection === 'details' && (
        <VehicleDaliaFullPanel
          vehicleRow={v as unknown as Record<string, unknown>}
          onEdit={() => onEdit(v)}
          isManager={isManager}
        />
      )}

      {mainSection === 'actions' && (
        <div>
          <p className="text-sm text-muted-foreground mb-3 flex items-center gap-2">
            פעולות לרכב: <VehiclePlateLine plate={v.license_plate} internal={v.internal_number} className="font-bold" />
          </p>
          <Button
            type="button"
            className="w-full mb-3 h-12 text-base font-bold gap-2"
            onClick={() => {
              setActionCategory(undefined);
              setActionOpen(true);
            }}
          >
            <Plus size={20} /> פתיחת פעולה לרכב
          </Button>
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mb-4">
            {QUICK_ACTIONS.map((q) => (
              <button
                key={q.cat}
                type="button"
                onClick={() => openQuick(q.cat)}
                className="card-elevated py-2.5 px-1 text-xs font-bold text-center hover:border-primary/40 active:bg-muted transition-colors min-h-[44px]"
              >
                {q.label}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto mb-3 -mx-1 px-1">
            <div className="flex gap-1 border-b border-border min-w-max">
              {ACTION_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-2 text-sm font-bold whitespace-nowrap border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          {renderActionTabContent()}
        </div>
      )}

      {mainSection === 'history' && hubData && (
        <HistoryTimeline
          entries={hubData.history}
          onNavigate={(route) =>
            navigate(buildVehicleContextUrl(route, { plate: v.license_plate, vehicleId: v.id }))
          }
          plate={v.license_plate}
          internalNumber={v.internal_number}
        />
      )}

      {mainSection === 'manage' && (
        <div className="space-y-4">
          {isManager && vehicleScopedLinks}
          <div className="card-elevated p-4 space-y-3">
          <p className="text-sm text-muted-foreground mb-2">
            <VehiclePlateLine plate={v.license_plate} internal={v.internal_number} />
          </p>
          {isManager ? (
            <>
              <Button type="button" className="w-full" onClick={() => onEdit(v)}>
                <ClipboardList size={18} className="ml-2" /> עריכת רכב (VehicleForm)
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={() => setListsManagerOpen(true)}>
                <Settings2 size={18} className="ml-2" /> ניהול רשימות טיפול ובדיקה
              </Button>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                <div className="text-right flex-1">
                  <p className="text-sm font-bold">הפעל התראות ביטוח</p>
                  <p className="text-xs text-muted-foreground">
                    כבוי = אין התראות ביטוח ואין סימון אדום על ביטוח (מסמכים ותאריכים נשארים)
                  </p>
                </div>
                <Switch
                  checked={v.insurance_alerts_enabled !== false}
                  disabled={savingInsuranceToggle}
                  onCheckedChange={async (on) => {
                    setSavingInsuranceToggle(true);
                    const { error } = await supabase
                      .from('vehicles')
                      .update({ insurance_alerts_enabled: on })
                      .eq('id', v.id);
                    setSavingInsuranceToggle(false);
                    if (error) {
                      toast.error('שגיאה בעדכון התראות ביטוח');
                      return;
                    }
                    toast.success(on ? 'התראות ביטוח הופעלו' : 'התראות ביטוח כובו');
                    onRefresh();
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground px-1">
                הוספה · עריכה (לחיצה על פריט) · מחיקה · חצים לסדר · שמור · איפוס לברירת מחדל
              </p>
              <Button type="button" variant="outline" className="w-full" onClick={() => navigate(buildVehicleContextUrl('/attach-car', { plate: v.license_plate, vehicleId: v.id }))}>
                <UserCheck size={18} className="ml-2" /> שינוי שיוך נהג
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={() => navigate(buildVehicleContextUrl('/vehicle-exchange', { plate: v.license_plate, vehicleId: v.id }))}>
                <RefreshCw size={18} className="ml-2" /> החלפת רכב (מסך מלא)
              </Button>
              {driver?.phone && (
                <a href={`tel:${driver.phone}`} className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-border font-medium text-primary">
                  <Phone size={18} /> {driver.phone}
                </a>
              )}
              <div className="space-y-2 pt-2">
                <p className="text-sm font-bold text-muted-foreground">שינוי סטטוס</p>
                {(['active', 'in_service', 'out_of_service'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    disabled={v.status === st}
                    onClick={async () => {
                      const prev = v.status;
                      await supabase.from('vehicles').update({ status: st }).eq('id', v.id);
                      await logVehicleEvent({
                        vehicleId: v.id,
                        vehiclePlate: v.license_plate,
                        companyName: v.company_name || user?.company_name || '',
                        action: 'שינוי סטטוס',
                        details: `${statusLabel(prev).text} → ${statusLabel(st).text}`,
                        userId: user?.id,
                        userName: user?.full_name,
                      });
                      toast.success('הסטטוס עודכן');
                      onRefresh();
                      refreshHub();
                      setDrillRefreshKey((k) => k + 1);
                    }}
                    className="w-full py-2.5 rounded-xl bg-muted font-medium text-sm disabled:opacity-40"
                  >
                    {statusLabel(st).text}
                  </button>
                ))}
              </div>
              <div>
                <p className="text-sm font-bold mb-2 flex items-center gap-2">
                  <StickyNote size={16} /> הערה לרכב
                </p>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={3}
                  className="w-full p-3 rounded-xl border-2 border-input bg-background resize-none"
                />
                <Button type="button" variant="secondary" className="w-full mt-2" disabled={savingNote} onClick={saveNote}>
                  {savingNote ? 'שומר...' : 'שמור הערה'}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-center py-4 text-sm">
              עריכה, סטטוס והערות — למנהל צי. העבר / ארכיון / מחק מוצגים למעלה (מושבתים ללא הרשאה).
            </p>
          )}
          </div>
        </div>
      )}

      <VehicleActionModal
        open={actionOpen}
        onOpenChange={setActionOpen}
        vehicle={v}
        driverName={driverName}
        initialCategory={actionCategory}
        onSaved={() => {
          refreshHub();
          onRefresh();
          setDrillRefreshKey((k) => k + 1);
        }}
        onOpenAlert={() => setShowAlertModal(true)}
        onOpenSupplier={() => {
          setSupplierSource(null);
          setSupplierOpen(true);
        }}
        onEditVehicle={() => onEdit(v)}
      />

      <CompanyVehicleListsManager
        open={listsManagerOpen}
        onOpenChange={setListsManagerOpen}
        companyName={v.company_name || user?.company_name || ''}
      />

      <VehicleSupplierOrderModal
        open={supplierOpen}
        onOpenChange={setSupplierOpen}
        vehicle={v}
        driverName={driverName}
        sourceType={supplierSource?.type}
        sourceLabel={supplierSource?.label}
        onSaved={() => {
          refreshHub();
          onRefresh();
          setMainSection('actions');
          setActiveTab('service');
        }}
      />

      {showAlertModal && (
        <CreateAlertModal
          vehiclePlate={v.license_plate}
          vehicleId={v.id}
          onClose={() => setShowAlertModal(false)}
          onCreated={() => {
            setShowAlertModal(false);
            refreshHub();
          }}
        />
      )}

      <VehicleHubBottomActions
        plate={v.license_plate}
        internalNumber={v.internal_number}
        vehicleId={v.id}
        isManager={isManager}
        isArchived={v.status === 'archived'}
        previewMode={previewMode}
        onImport={async () => {
          if (previewMode) {
            toast.info('תצוגת פיתוח — /vehicle-import');
            return;
          }
          await logVehicleEvent({
            vehicleId: v.id,
            vehiclePlate: v.license_plate,
            companyName: v.company_name || user?.company_name || '',
            action: 'יבוא רכב',
            details: `פתיחת מסך יבוא${v.internal_number ? ` · ${v.internal_number}` : ''}`,
            userId: user?.id,
            userName: user?.full_name,
          });
          navigate('/vehicle-import');
        }}
        onArchive={archiveVehicle}
        onDelete={() => {
          if (previewMode) {
            toast.info('תצוגת פיתוח — מחיקה מבוטלת');
            return;
          }
          onDelete(v.id);
        }}
      />
    </div>
  );
}

function HistoryTimeline({
  entries,
  onNavigate,
  plate,
  internalNumber,
  compact,
}: {
  entries: VehicleHistoryEntry[];
  onNavigate: (path: string) => void;
  plate: string;
  internalNumber: string;
  compact?: boolean;
}) {
  if (entries.length === 0) {
    return (
      <div className="card-elevated">
        <EmptyTab text="אין פעולות בהיסטוריה — פעולות חדשות יופיעו כאן אוטומטית" />
      </div>
    );
  }

  return (
    <div className={`card-elevated ${compact ? 'p-3' : 'p-4'}`}>
      {!compact && (
        <p className="text-xs text-muted-foreground mb-4 flex flex-wrap items-center gap-2">
          <span>היסטוריה לרכב:</span>
          <VehiclePlateLine plate={plate} internal={internalNumber} className="font-bold" />
        </p>
      )}
      {entries.map((h, i) => (
        <div key={`${h.type}-${h.id}`} className="flex gap-3 py-3 border-b border-border/50 last:border-0">
          <div className="flex flex-col items-center pt-1">
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${i === 0 ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
          </div>
          <button
            type="button"
            className="flex-1 text-right"
            onClick={() => (h.docUrl ? window.open(h.docUrl, '_blank') : onNavigate(h.route))}
          >
            <div className="flex flex-wrap gap-2 items-center mb-1">
              <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-primary/10 text-primary">
                {HISTORY_TYPE_LABEL[h.type] || h.type}
              </span>
              {h.status && (
                <span className={`status-badge text-xs ${statusBadgeClass(h.status)}`}>{h.status}</span>
              )}
            </div>
            <p className="font-bold text-sm">{h.title}</p>
            {h.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{h.description}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-1 items-center">
              <span>{formatHubDate(h.date)}</span>
              <span>·</span>
              <VehiclePlateLine plate={h.vehiclePlate || plate} internal={internalNumber || h.internalNumber} />
              {h.userName ? <span>· {h.userName}</span> : null}
              {h.docUrl ? <span>· מסמך</span> : null}
            </p>
          </button>
        </div>
      ))}
    </div>
  );
}
