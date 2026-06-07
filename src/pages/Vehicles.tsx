import { useState, useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Car, Search, Plus, ArrowRight, Edit2, Phone, Trash2, Truck, Download, PlusCircle, X, Loader2, Upload } from 'lucide-react';
import { logVehicleEvent } from '@/lib/vehicleEventLog';
import { exportToCsv } from '@/utils/exportCsv';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter, applyCompanyScope } from '@/hooks/useCompanyFilter';
import { toast } from 'sonner';
import ImageUpload from '@/components/ImageUpload';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import CallCustomerButton from '@/components/voice/CallCustomerButton';
import VehicleHub from '@/components/vehicles/VehicleHub';
import VehicleAccordionSection from '@/components/vehicles/VehicleAccordionSection';
import VehicleNewFormDalia from '@/components/vehicles/vehicleNewDalia/VehicleNewFormDalia';
import { VehiclePlateLine } from '@/components/vehicles/vehiclePlateDisplay';
import {
  fetchVehicleFromGov,
  GovVehicleLookupError,
  type GovVehicleData,
} from '@/lib/govVehicleLookup';

interface VehicleRow {
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
}

interface InsuranceHistoryRow {
  id?: string;
  vehicle_id?: string;
  year: number;
  has_no_claims: boolean;
  insurer_name: string;
  mandatory_insurance_cost: number;
  comprehensive_insurance_cost: number;
  company_name?: string;
}

interface DriverRow { id: string; full_name: string; phone: string | null; }

type ViewMode = 'list' | 'detail' | 'form';

export default function Vehicles() {
  const { user } = useAuth();
  const companyFilter = useCompanyFilter();
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterDriver, setFilterDriver] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleRow | null>(null);
  const [editVehicle, setEditVehicle] = useState<VehicleRow | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    const [vRes, dRes] = await Promise.all([
      applyCompanyScope(supabase.from('vehicles').select('*'), companyFilter).order('created_at', { ascending: false }),
      applyCompanyScope(supabase.from('drivers').select('id, full_name, phone'), companyFilter),
    ]);
    if (vRes.data) setVehicles(vRes.data as VehicleRow[]);
    if (dRes.data) setDrivers(dRes.data as DriverRow[]);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const getDriverName = (id: string | null) => {
    if (!id) return 'לא משויך';
    return drivers.find(d => d.id === id)?.full_name || 'לא ידוע';
  };

  const companies = [...new Set(vehicles.map(v => v.company_name).filter(Boolean))];

  const filtered = vehicles.filter(v => {
    const matchSearch = !search || v.license_plate.includes(search) || v.manufacturer?.includes(search) || v.model?.includes(search) || v.internal_number?.includes(search);
    // When "all" is selected, exclude archived vehicles; only show them when "archived" tab is active
    const matchStatus = statusFilter === 'all' ? v.status !== 'archived' : v.status === statusFilter;
    const matchCompany = !filterCompany || v.company_name === filterCompany;
    const matchDriver = !filterDriver || v.assigned_driver_id === filterDriver;
    return matchSearch && matchStatus && matchCompany && matchDriver;
  });

  const statusLabel = (s: string) => {
    switch (s) {
      case 'active': return { text: 'פעיל', cls: 'status-active' };
      case 'in_service': return { text: 'בטיפול', cls: 'status-pending' };
      case 'out_of_service': return { text: 'לא פעיל', cls: 'status-inactive' };
      case 'archived': return { text: 'ארכיון', cls: 'bg-muted text-muted-foreground' };
      default: return { text: s || 'לא ידוע', cls: '' };
    }
  };

  const isManager = user?.role === 'fleet_manager' || user?.role === 'super_admin';

  const handleOpenForm = (vehicle?: VehicleRow) => {
    setEditVehicle(vehicle || null);
    setViewMode('form');
  };

  const handleViewDetail = (v: VehicleRow) => {
    setSelectedVehicle(v);
    setViewMode('detail');
  };

  const handleBack = () => {
    setViewMode('list');
    setSelectedVehicle(null);
    setEditVehicle(null);
  };

  const handleFormDone = async (savedVehicleId?: string) => {
    await loadData();
    if (savedVehicleId) {
      const { data } = await supabase.from('vehicles').select('*').eq('id', savedVehicleId).single();
      if (data) {
        setEditVehicle(null);
        setSelectedVehicle(data as VehicleRow);
        setViewMode('detail');
        toast.success('הרכב נפתח בכרטיס החדש');
        return;
      }
    }
    handleBack();
  };

  const handleDelete = async (id: string) => {
    const veh = vehicles.find((x) => x.id === id) || selectedVehicle;
    const ids = veh ? `${veh.license_plate}${veh.internal_number ? ` · ${veh.internal_number}` : ''}` : '';
    if (
      !confirm(
        `מחיקת רכב לצמיתות${ids ? `\n\n${ids}` : ''}\n\nפעולה זו נפרדת מארכיון ואינה ניתנת לביטול. להמשיך?`,
      )
    ) {
      return;
    }
    const { error } = await supabase.from('vehicles').delete().eq('id', id);
    if (error) {
      toast.error('שגיאה במחיקת הרכב');
    } else {
      if (veh) {
        await logVehicleEvent({
          vehicleId: id,
          vehiclePlate: veh.license_plate,
          companyName: veh.company_name || user?.company_name || '',
          action: 'מחיקת רכב',
          details: `${veh.manufacturer} ${veh.model}${veh.internal_number ? ` · ${veh.internal_number}` : ''}`,
          userId: user?.id,
          userName: user?.full_name,
        });
      }
      toast.success('הרכב נמחק בהצלחה');
      handleFormDone();
    }
  };

  // === FORM VIEW ===
  if (viewMode === 'form') {
    return <VehicleForm vehicle={editVehicle} drivers={drivers} onDone={handleFormDone} onBack={handleBack} user={user} />;
  }

  const refreshSelectedVehicle = async () => {
    if (!selectedVehicle) return;
    const { data } = await supabase.from('vehicles').select('*').eq('id', selectedVehicle.id).single();
    if (data) setSelectedVehicle(data as VehicleRow);
    loadData();
  };

  // === DETAIL VIEW (Vehicle Hub) ===
  if (viewMode === 'detail' && selectedVehicle) {
    return (
      <VehicleHub
        vehicle={selectedVehicle}
        drivers={drivers}
        isManager={isManager}
        onBack={handleBack}
        onEdit={handleOpenForm}
        onDelete={handleDelete}
        onRefresh={refreshSelectedVehicle}
        getDriverName={getDriverName}
      />
    );
  }

  // === LIST VIEW ===
  const activeVehicles = vehicles.filter(v => v.status !== 'archived');
  const archivedVehicles = vehicles.filter(v => v.status === 'archived');
  const statusCounts = {
    all: activeVehicles.length,
    active: vehicles.filter(v => v.status === 'active').length,
    in_service: vehicles.filter(v => v.status === 'in_service').length,
    out_of_service: vehicles.filter(v => v.status === 'out_of_service').length,
    archived: archivedVehicles.length,
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h1 className="page-header !mb-0 flex items-center gap-3"><Car size={28} /> ניהול רכבים</h1>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {isManager && (
            <Link
              to="/vehicle-import"
              className="flex items-center gap-2 px-4 py-3 rounded-xl border border-primary/30 bg-primary/5 text-primary text-sm font-bold min-h-[48px] hover:bg-primary/10 transition-colors"
            >
              <Upload size={18} /> יבוא רכבים
            </Link>
          )}
          <button onClick={() => exportToCsv('vehicles', [
            { key: 'license_plate', label: 'מספר רכב' },
            { key: 'manufacturer', label: 'יצרן' },
            { key: 'model', label: 'דגם' },
            { key: 'year', label: 'שנה' },
            { key: 'vehicle_type', label: 'סוג' },
            { key: 'status', label: 'סטטוס' },
            { key: 'odometer', label: 'קילומטראז׳' },
            { key: 'test_expiry', label: 'תוקף טסט' },
            { key: 'insurance_expiry', label: 'תוקף ביטוח' },
            { key: 'company_name', label: 'חברה' },
            { key: 'notes', label: 'הערות' },
          ], filtered)} className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border bg-card text-foreground text-sm font-bold min-h-[48px] hover:bg-muted transition-colors">
            <Download size={18} /> ייצוא
          </button>
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי מספר רכב, מספר פנימי, יצרן או דגם..."
          className="w-full pr-12 p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none" />
      </div>

      {/* Advanced Filters */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {user?.role === 'super_admin' && companies.length > 1 && (
          <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}
            className="p-3 text-base rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none col-span-2">
            <option value="">כל החברות</option>
            {companies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <select value={filterDriver} onChange={e => setFilterDriver(e.target.value)}
          className="p-3 text-base rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none col-span-2">
          <option value="">כל הנהגים</option>
          {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
        </select>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {([
          { key: 'all', label: 'הכל' },
          { key: 'active', label: 'פעיל' },
          { key: 'in_service', label: 'בטיפול' },
          { key: 'out_of_service', label: 'לא פעיל' },
          { key: 'archived', label: 'ארכיון' },
        ] as const).map(f => (
          <button key={f.key} onClick={() => setStatusFilter(f.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${statusFilter === f.key ? 'bg-primary text-primary-foreground shadow-md' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
            {f.label} ({statusCounts[f.key]})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground text-lg">טוען רכבים...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Car size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-xl">אין רכבים</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(v => {
            const sl = statusLabel(v.status);
            const driver = drivers.find(d => d.id === v.assigned_driver_id);
            return (
              <div key={v.id} className="card-elevated w-full hover:shadow-lg transition-shadow">
                <div className="flex items-center gap-4">
                  <button onClick={() => handleViewDetail(v)} className="flex items-center gap-4 flex-1 text-right min-w-0">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Car size={28} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xl font-bold truncate">{v.manufacturer} {v.model}</p>
                      <p className="text-muted-foreground text-lg truncate">{v.license_plate}{v.internal_number ? ` | ${v.internal_number}` : ''} • {v.year}</p>
                      <p className="text-sm text-muted-foreground truncate">נהג: {getDriverName(v.assigned_driver_id)}</p>
                    </div>
                  </button>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className={`status-badge ${sl.cls}`}>{sl.text}</span>
                    <span className="text-sm text-muted-foreground">{(v.odometer || 0).toLocaleString()} ק"מ</span>
                    {driver?.phone && (
                      <CallCustomerButton
                        customerName={driver.full_name}
                        customerPhone={driver.phone}
                        vehiclePlate={v.license_plate}
                        flowType="driver_call"
                        variant="icon"
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating + button */}
      {isManager && (
        <button
          onClick={() => handleOpenForm()}
          className="fixed bottom-24 left-6 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-xl hover:shadow-2xl transition-all flex items-center justify-center hover:scale-110"
          title="רכב חדש"
        >
          <Plus size={28} />
        </button>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-medium text-foreground">{value || '—'}</span>
    </div>
  );
}

function VehicleFormSection({
  n,
  title,
  children,
  defaultOpen = true,
  saveLabel,
  onSaveSection,
  savingScope,
}: {
  n: number;
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  saveLabel?: string;
  onSaveSection?: (section: VehicleFormSectionId) => void;
  savingScope?: VehicleSaveScope | null;
}) {
  return (
    <VehicleAccordionSection
      title={`${n}. ${title}`}
      defaultOpen={defaultOpen}
      sectionId={`s${n}`}
    >
      {children}
      {saveLabel && onSaveSection && (
        <button
          type="button"
          onClick={() => onSaveSection(n as VehicleFormSectionId)}
          disabled={!!savingScope}
          className="w-full mt-4 py-3 rounded-xl text-sm font-bold border-2 border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
        >
          {savingScope === n ? 'שומר...' : saveLabel}
        </button>
      )}
    </VehicleAccordionSection>
  );
}

type VehicleFormSectionId = 1 | 2 | 3 | 4 | 5 | 6;
type VehicleSaveScope = VehicleFormSectionId | 'full';

const SECTION_SAVE_LABELS: Record<VehicleFormSectionId, string> = {
  1: 'שמור פרטי רכב',
  2: 'שמור בעלות ומימון',
  3: 'שמור ביטוחים ורישיונות',
  4: 'שמור ציוד וכלים מיוחדים',
  5: 'שמור טיפולים ותחזוקה',
  6: 'שמור מסמך',
};

const SECTION_FIELD_KEYS: Record<VehicleFormSectionId, readonly string[]> = {
  1: [
    'license_plate',
    'internal_number',
    'manufacturer',
    'model',
    'year',
    'vehicle_type',
    'status',
    'odometer',
    'assigned_driver_id',
  ],
  2: [
    'management_type',
    'monthly_leasing_cost',
    'leasing_end_date',
    'vehicle_return_date',
    'monthly_loan_payment',
    'loan_end_date',
    'planned_replacement_date',
    'has_loan',
    'is_leasing',
  ],
  3: [
    'test_expiry',
    'insurance_start',
    'insurance_expiry',
    'comprehensive_insurance_start',
    'comprehensive_insurance_expiry',
  ],
  4: [],
  5: ['last_service_date', 'next_service_date', 'needs_transport', 'notes'],
  6: ['license_doc_url', 'insurance_doc_url', 'comprehensive_insurance_doc_url'],
};

// === Vehicle Form (Add / Edit) ===
type ManagementType = 'operational_leasing' | 'financial_leasing' | 'self_maintained';

export function VehicleForm({
  vehicle,
  drivers,
  onDone,
  onBack,
  user,
  previewInitialStep,
  previewMockGov,
  previewMode,
  previewOpenAllSections,
}: {
  vehicle: VehicleRow | null;
  drivers: DriverRow[];
  onDone: (savedVehicleId?: string) => void;
  onBack: () => void;
  user: any;
  /** תצוגת dev בלבד */
  previewInitialStep?: 'intro' | 'full';
  previewMockGov?: boolean;
  previewMode?: boolean;
  /** פותח את כל סעיפי האקורדיון (תצוגת dev / צילומים) */
  previewOpenAllSections?: boolean;
}) {
  const isEdit = !!vehicle;
  const [licensePlate, setLicensePlate] = useState(vehicle?.license_plate || '');
  const [internalNumber, setInternalNumber] = useState(vehicle?.internal_number || '');
  const [manufacturer, setManufacturer] = useState(vehicle?.manufacturer || '');
  const [model, setModel] = useState(vehicle?.model || '');
  const [year, setYear] = useState(vehicle?.year?.toString() || new Date().getFullYear().toString());
  const [vehicleType, setVehicleType] = useState(vehicle?.vehicle_type || '');
  const [vehicleTypeCustom, setVehicleTypeCustom] = useState(
    ['רכב פרטי','רכב מסחרי','משאית','אוטובוס','מיניבוס','אופנוע','רכב תפעולי','צמ"ה','רכב זעיר'].includes(vehicle?.vehicle_type || '') ? '' : (vehicle?.vehicle_type || '')
  );
  const isCustomVehicleType = vehicleType === 'אחר';

  // Gov API lookup state
  const [govData, setGovData] = useState<GovVehicleData | null>(null);
  const [govDialogOpen, setGovDialogOpen] = useState(false);
  const [govLoading, setGovLoading] = useState(false);
  const [govDataApplied, setGovDataApplied] = useState(false);
  const [formStep, setFormStep] = useState<'intro' | 'full'>(
    isEdit ? 'full' : previewInitialStep || 'intro',
  );

  useEffect(() => {
    if (!previewMockGov || isEdit) return;
    setLicensePlate('12-345-67');
    setInternalNumber('VH-099');
    setManufacturer('טויוטה');
    setModel('קורולה');
    setYear('2022');
    setVehicleType('רכב פרטי');
    setVehicleTypeCustom('');
    setTestExpiry('2026-08-15');
    setGovDataApplied(true);
    setFormStep('full');
  }, [previewMockGov, isEdit]);

  const showIntro = !isEdit && formStep === 'intro';
  const showFullForm = isEdit || formStep === 'full';

  const handleCancelFlow = async () => {
    const hasDraft =
      !isEdit &&
      (licensePlate ||
        internalNumber ||
        manufacturer ||
        model ||
        govDataApplied ||
        notes);
    if (hasDraft && !confirm('ביטול פתיחת רכב — השינויים לא יישמרו. להמשיך?')) {
      return;
    }
    if (!isEdit && !previewMode && licensePlate.replace(/[-\s]/g, '')) {
      await logVehicleEvent({
        vehiclePlate: licensePlate,
        companyName: user?.company_name || '',
        action: 'ביטול פתיחת רכב',
        details: internalNumber ? `מספר פנימי: ${internalNumber}` : undefined,
        userId: user?.id,
        userName: user?.full_name,
      });
    }
    onBack();
  };

  const goToFullForm = () => {
    if (!licensePlate.replace(/[-\s]/g, '')) {
      toast.error('יש להזין מספר רכב לפני המשך');
      return;
    }
    setFormStep('full');
  };

  const handleGovLookup = async () => {
    if (!licensePlate.replace(/[-\s]/g, '')) {
      toast.error('יש להזין מספר רכב לפני החיפוש');
      return;
    }
    setGovLoading(true);
    try {
      const data = await fetchVehicleFromGov(licensePlate);
      if (data) {
        setGovData(data);
        setGovDialogOpen(true);
      } else {
        toast.error('לא נמצא רכב עם מספר זה במאגר הממשלתי');
      }
    } catch (err) {
      toast.error(
        err instanceof GovVehicleLookupError ? err.message : 'שגיאה בחיפוש במאגר הממשלתי',
      );
    }
    setGovLoading(false);
  };

  const applyGovData = () => {
    if (!govData) return;
    if (govData.tozeret_nm) setManufacturer(govData.tozeret_nm.trim());
    if (govData.kinuy_mishari) setModel(govData.kinuy_mishari.trim());
    if (govData.degem_nm) {
      if (!govData.kinuy_mishari) setModel(govData.degem_nm.trim());
    }
    if (govData.shnat_yitzur) setYear(govData.shnat_yitzur.toString());
    if (govData.tokef_dt) {
      try {
        const d = new Date(govData.tokef_dt);
        if (!isNaN(d.getTime())) setTestExpiry(d.toISOString().split('T')[0]);
        else setTestExpiry(govData.tokef_dt);
      } catch {
        setTestExpiry(govData.tokef_dt);
      }
    }
    setGovDataApplied(true);
    setGovDialogOpen(false);
    if (!isEdit) setFormStep('full');
    toast.success('פרטי הרכב מולאו בהצלחה');
  };
  const [status, setStatus] = useState(vehicle?.status || 'active');
  const [odometer, setOdometer] = useState(vehicle?.odometer?.toString() || '0');
  const [assignedDriver, setAssignedDriver] = useState(vehicle?.assigned_driver_id || '');
  const [testExpiry, setTestExpiry] = useState(vehicle?.test_expiry || '');
  const [insuranceStart, setInsuranceStart] = useState(vehicle?.insurance_start || '');
  const [insuranceExpiry, setInsuranceExpiry] = useState(vehicle?.insurance_expiry || '');
  const [compInsStart, setCompInsStart] = useState(vehicle?.comprehensive_insurance_start || '');
  const [compInsExpiry, setCompInsExpiry] = useState(vehicle?.comprehensive_insurance_expiry || '');
  const [lastServiceDate, setLastServiceDate] = useState(vehicle?.last_service_date || '');
  const [nextServiceDate, setNextServiceDate] = useState(vehicle?.next_service_date || '');
  const [needsTransport, setNeedsTransport] = useState(vehicle?.needs_transport || false);
  const [notes, setNotes] = useState(vehicle?.notes || '');
  const [draftVehicleId, setDraftVehicleId] = useState<string | null>(null);
  const [savingScope, setSavingScope] = useState<VehicleSaveScope | null>(null);

  // Management type
  const [managementType, setManagementType] = useState<ManagementType>(
    (vehicle?.management_type as ManagementType) || 'operational_leasing'
  );

  // Operational leasing fields
  const [monthlyLeasingCost, setMonthlyLeasingCost] = useState(vehicle?.monthly_leasing_cost?.toString() || '');
  const [leasingEndDate, setLeasingEndDate] = useState(vehicle?.leasing_end_date || '');
  const [vehicleReturnDate, setVehicleReturnDate] = useState(vehicle?.vehicle_return_date || '');

  // Financial leasing / self-maintained fields
  const [monthlyLoanPayment, setMonthlyLoanPayment] = useState(vehicle?.monthly_loan_payment?.toString() || '');
  const [loanEndDate, setLoanEndDate] = useState(vehicle?.loan_end_date || '');
  const [plannedReplacementDate, setPlannedReplacementDate] = useState(vehicle?.planned_replacement_date || '');
  const [hasLoan, setHasLoan] = useState(vehicle?.has_loan || false);

  // Insurance history
  const [insuranceHistory, setInsuranceHistory] = useState<InsuranceHistoryRow[]>([]);

  // Document uploads
  const [licenseDocUrl, setLicenseDocUrl] = useState(vehicle?.license_doc_url || '');
  const [insuranceDocUrl, setInsuranceDocUrl] = useState(vehicle?.insurance_doc_url || '');
  const [compInsDocUrl, setCompInsDocUrl] = useState(vehicle?.comprehensive_insurance_doc_url || '');

  // Company setting: is driver assignment required?
  const [driverRequired, setDriverRequired] = useState(false);
  const [insuranceDocsRequired, setInsuranceDocsRequired] = useState(true);
  const [noClaimsRequired, setNoClaimsRequired] = useState(true);

  // Show insurance section for financial_leasing or self_maintained
  const showInsuranceSection = managementType === 'financial_leasing' || managementType === 'self_maintained';

  useEffect(() => {
    const checkSetting = async () => {
      const companyName = user?.company_name || '';
      const { data: settings } = await supabase
        .from('company_settings')
        .select('require_driver_assignment, max_vehicles_without_assignment, require_insurance_docs, require_no_claims')
        .eq('company_name', companyName)
        .maybeSingle();
      
      if (settings) {
        // Insurance docs setting
        if (settings.require_insurance_docs === false) {
          setInsuranceDocsRequired(false);
        }
        // No claims setting
        if (settings.require_no_claims === false) {
          setNoClaimsRequired(false);
        }
        // Driver assignment setting
        if (settings.require_driver_assignment === false) {
          const maxExempt = settings.max_vehicles_without_assignment || 0;
          if (maxExempt === 0) {
            setDriverRequired(false);
          } else {
            const { count } = await supabase
              .from('vehicles')
              .select('id', { count: 'exact', head: true })
              .eq('company_name', companyName)
              .is('assigned_driver_id', null);
            const currentExempt = count || 0;
            const isEditingExempt = isEdit && !vehicle?.assigned_driver_id;
            const effectiveCount = isEditingExempt ? currentExempt - 1 : currentExempt;
            if (effectiveCount < maxExempt) {
              setDriverRequired(false);
            }
          }
        }
      }
    };
    checkSetting();
  }, [user?.company_name]);

  // Load insurance history for edit mode
  useEffect(() => {
    if (isEdit && vehicle?.id) {
      supabase
        .from('vehicle_insurance_history')
        .select('*')
        .eq('vehicle_id', vehicle.id)
        .order('year', { ascending: false })
        .then(({ data }) => {
          if (data && data.length > 0) {
            setInsuranceHistory(data as InsuranceHistoryRow[]);
          }
        });
    }
  }, [isEdit, vehicle?.id]);

  const addInsuranceYear = () => {
    const currentYear = new Date().getFullYear();
    const existingYears = insuranceHistory.map(r => r.year);
    let newYear = currentYear;
    while (existingYears.includes(newYear)) newYear--;
    setInsuranceHistory(prev => [
      { year: newYear, has_no_claims: false, insurer_name: '', mandatory_insurance_cost: 0, comprehensive_insurance_cost: 0 },
      ...prev,
    ]);
  };

  const updateInsuranceRow = (index: number, field: keyof InsuranceHistoryRow, value: any) => {
    setInsuranceHistory(prev => prev.map((row, i) => i === index ? { ...row, [field]: value } : row));
  };

  const removeInsuranceRow = (index: number) => {
    setInsuranceHistory(prev => prev.filter((_, i) => i !== index));
  };

  // Validation
  const basicFieldsFilled = licensePlate && testExpiry;
  
  // Management type fields are optional - don't block vehicle creation
  const typeFieldsFilled = true;

  const allDocsFilled = isEdit || !insuranceDocsRequired || (licenseDocUrl && insuranceDocUrl && compInsDocUrl);
  const isValid = basicFieldsFilled && typeFieldsFilled && allDocsFilled;

  const sectionOpen = (n: number) =>
    previewOpenAllSections === true || (n === 1 && !isEdit) || (isEdit && n <= 2);

  const inputClass = "w-full p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none";

  const documentContext = {
    companyName: user?.company_name || '',
    vehiclePlate: licensePlate,
    manufacturer,
    model,
  };

  const effectiveVehicleId = vehicle?.id ?? draftVehicleId;
  const hasPersistedVehicle = isEdit || !!draftVehicleId;

  const buildPayload = (approvalStatus: string) => ({
      license_plate: licensePlate,
      internal_number: internalNumber,
      manufacturer,
      model,
      year: parseInt(year) || null,
      vehicle_type: vehicleType === 'אחר' ? vehicleTypeCustom : vehicleType,
      status: approvalStatus === 'pending_approval' ? 'out_of_service' : status,
      odometer: parseInt(odometer) || 0,
      assigned_driver_id: assignedDriver || null,
      test_expiry: testExpiry || null,
      insurance_start: insuranceStart || null,
      insurance_expiry: insuranceExpiry || null,
      comprehensive_insurance_start: compInsStart || null,
      comprehensive_insurance_expiry: compInsExpiry || null,
      last_service_date: lastServiceDate || null,
      next_service_date: nextServiceDate || null,
      needs_transport: needsTransport,
      approval_status: isEdit ? vehicle!.approval_status : approvalStatus,
      license_doc_url: licenseDocUrl,
      insurance_doc_url: insuranceDocUrl,
      comprehensive_insurance_doc_url: compInsDocUrl,
      management_type: managementType,
      monthly_leasing_cost: managementType === 'operational_leasing' ? (parseFloat(monthlyLeasingCost) || null) : null,
      leasing_end_date: managementType === 'operational_leasing' ? (leasingEndDate || null) : null,
      vehicle_return_date: managementType === 'operational_leasing' ? (vehicleReturnDate || null) : null,
      monthly_loan_payment: (managementType === 'financial_leasing' || (managementType === 'self_maintained' && hasLoan)) ? (parseFloat(monthlyLoanPayment) || null) : null,
      loan_end_date: (managementType === 'financial_leasing' || (managementType === 'self_maintained' && hasLoan)) ? (loanEndDate || null) : null,
      planned_replacement_date: (managementType !== 'operational_leasing') ? (plannedReplacementDate || null) : null,
      has_loan: managementType === 'self_maintained' ? hasLoan : managementType === 'financial_leasing',
      is_leasing: managementType === 'operational_leasing' || managementType === 'financial_leasing',
      notes,
  });

  const pickSectionPayload = (section: VehicleFormSectionId, full: ReturnType<typeof buildPayload>) => {
    const keys = SECTION_FIELD_KEYS[section];
    return Object.fromEntries(keys.map((k) => [k, full[k as keyof typeof full]]));
  };

  const validateSection = (scope: VehicleSaveScope): boolean => {
    if (scope === 'full') return isValid;
    if (scope === 1) {
      if (!licensePlate.replace(/[-\s]/g, '')) {
        toast.error('יש להזין מספר רכב');
        return false;
      }
      return true;
    }
    if (scope === 3 && !testExpiry) {
      toast.error('יש להזין תוקף טסט');
      return false;
    }
    if (scope === 6 && !isEdit && insuranceDocsRequired && !(licenseDocUrl && insuranceDocUrl && compInsDocUrl)) {
      toast.error('יש לצרף את כל המסמכים הנדרשים');
      return false;
    }
    if (scope !== 1 && scope !== 'full' && !hasPersistedVehicle) {
      toast.error('יש לשמור קודם את פרטי הרכב');
      return false;
    }
    return true;
  };

  const saveInsuranceHistory = async (vehicleId: string) => {
    if (!showInsuranceSection || insuranceHistory.length === 0) return;
    await supabase.from('vehicle_insurance_history').delete().eq('vehicle_id', vehicleId);
    const historyPayload = insuranceHistory.map((row) => ({
      vehicle_id: vehicleId,
      year: row.year,
      has_no_claims: row.has_no_claims,
      insurer_name: row.insurer_name,
      mandatory_insurance_cost: row.mandatory_insurance_cost,
      comprehensive_insurance_cost: row.comprehensive_insurance_cost,
      company_name: user?.company_name || '',
    }));
    await supabase.from('vehicle_insurance_history').insert(historyPayload);
  };

  const persistVehicle = async (scope: VehicleSaveScope) => {
    if (scope === 'full' && !isValid) {
      toast.error('יש למלא את כל השדות ולצרף מסמכים');
      return;
    }
    if (!validateSection(scope)) return;
    if (previewMode) {
      toast.info('תצוגת פיתוח — שמירה דרך /vehicles עם התחברות');
      return;
    }
    if (scope === 4) {
      toast.success('אין שדות נוספים לשמירה בסעיף זה');
      return;
    }

    setSavingScope(scope);
    const wasDraftBeforeSave = hasPersistedVehicle;

    let approvalStatus = vehicle?.approval_status || 'approved';
    if (!isEdit && !wasDraftBeforeSave) {
      const { data: settings } = await supabase
        .from('company_settings')
        .select('vehicle_approval_required')
        .eq('company_name', user?.company_name || '')
        .maybeSingle();
      if (settings?.vehicle_approval_required) {
        approvalStatus = 'pending_approval';
      }
    }

    const fullPayload = buildPayload(approvalStatus);
    const payload = scope === 'full' ? fullPayload : pickSectionPayload(scope, fullPayload);

    let error;
    let vehicleId = effectiveVehicleId;

    if (wasDraftBeforeSave && vehicleId) {
      ({ error } = await supabase.from('vehicles').update(payload).eq('id', vehicleId));
    } else if (scope === 1 || scope === 'full') {
      const res = await supabase
        .from('vehicles')
        .insert({
          ...(scope === 'full' ? fullPayload : payload),
          company_name: user?.company_name || '',
          created_by: user?.id,
        })
        .select('id')
        .single();
      error = res.error;
      vehicleId = res.data?.id ?? null;
      if (!error && vehicleId && !isEdit) {
        setDraftVehicleId(vehicleId);
      }
    } else {
      setSavingScope(null);
      toast.error('יש לשמור קודם את פרטי הרכב');
      return;
    }

    if (!error && vehicleId && (scope === 3 || scope === 'full')) {
      await saveInsuranceHistory(vehicleId);
    }

    if (!error && scope === 'full' && !isEdit && !wasDraftBeforeSave) {
      await generateVehicleAlerts(licensePlate, user, fullPayload);
    }

    setSavingScope(null);

    if (error) {
      toast.error(wasDraftBeforeSave ? 'שגיאה בעדכון הרכב' : 'שגיאה בהוספת הרכב');
      console.error(error);
      return;
    }

    if (scope === 'full') {
      const msg =
        approvalStatus === 'pending_approval'
          ? 'הרכב נוסף וממתין לאישור מנהל'
          : isEdit || wasDraftBeforeSave
            ? 'הרכב עודכן בהצלחה'
            : 'הרכב נוסף בהצלחה';
      toast.success(msg);
      if (!isEdit && vehicleId) {
        await logVehicleEvent({
          vehicleId,
          vehiclePlate: licensePlate,
          companyName: user?.company_name || '',
          action: wasDraftBeforeSave ? 'עדכון רכב' : 'הוספת רכב',
          details: `${manufacturer} ${model}`,
          userId: user?.id,
          userName: user?.full_name,
        });
        if (govDataApplied && !wasDraftBeforeSave) {
          await logVehicleEvent({
            vehicleId,
            vehiclePlate: licensePlate,
            companyName: user?.company_name || '',
            action: 'משיכת נתונים ממשרד הרישוי',
            details: 'מילוי אוטומטי בטופס לפני שמירה',
            userId: user?.id,
            userName: user?.full_name,
          });
        }
        onDone(vehicleId);
      } else {
        if (isEdit && vehicleId) {
          await logVehicleEvent({
            vehicleId,
            vehiclePlate: licensePlate,
            companyName: user?.company_name || '',
            action: 'עדכון רכב',
            details: 'עריכה ב-VehicleForm',
            userId: user?.id,
            userName: user?.full_name,
          });
        }
        onDone();
      }
      return;
    }

    toast.success(`${SECTION_SAVE_LABELS[scope]} — נשמר`);
  };

  const handleSubmit = () => {
    void persistVehicle('full');
  };

  const handleSectionSave = (section: VehicleFormSectionId) => {
    void persistVehicle(section);
  };

  const sectionSaveProps = {
    onSaveSection: handleSectionSave,
    savingScope,
  };

  const managementTypeLabels: Record<ManagementType, string> = {
    operational_leasing: 'ליסינג תפעולי',
    financial_leasing: 'ליסינג מימוני',
    self_maintained: 'תחזוקה עצמאית',
  };

  const handleBackClick = () => {
    if (isEdit) {
      if (confirm('לצאת מעריכת הרכב? השינויים לא יישמרו.')) onBack();
      return;
    }
    if (showIntro) {
      handleCancelFlow();
      return;
    }
    if (confirm('לחזור לשלב 1 (מספר רכב ורישוי)?')) setFormStep('intro');
  };

  const govDialog = (
        <Dialog open={govDialogOpen} onOpenChange={setGovDialogOpen}>
          <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-xl">פרטי רכב מהמאגר הממשלתי</DialogTitle>
            </DialogHeader>
            {govData && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <InfoRow label="מספר רכב" value={govData.mispar_rechev?.toString()} />
                  <InfoRow label="יצרן" value={govData.tozeret_nm} />
                  <InfoRow label="דגם" value={govData.degem_nm} />
                  <InfoRow label="כינוי מסחרי" value={govData.kinuy_mishari} />
                  <InfoRow label="שנת ייצור" value={govData.shnat_yitzur?.toString()} />
                  <InfoRow label="צבע" value={govData.tzeva_rechev} />
                  <InfoRow label="סוג דלק" value={govData.sug_delek_nm} />
                  <InfoRow label="בעלות" value={govData.baalut} />
                  <InfoRow label="תוקף רישיון" value={govData.tokef_dt} />
                  <InfoRow label="טסט אחרון" value={govData.mivchan_acharon_dt} />
                  <InfoRow label="צמיג קדמי" value={govData.zmig_kidmi} />
                  <InfoRow label="צמיג אחורי" value={govData.zmig_ahori} />
                  <InfoRow label="רמת גימור" value={govData.ramat_gimur} />
                  <InfoRow label="דגם מנוע" value={govData.degem_manoa} />
                  <InfoRow label="מס׳ שלדה" value={govData.misgeret} />
                  <InfoRow label="עלייה לכביש" value={govData.moed_aliya_lakvish} />
                </div>
                <div className="flex gap-2 pt-3 border-t border-border">
                  <Button onClick={applyGovData} className="flex-1 text-lg py-3">
                    מלא פרטים בטופס
                  </Button>
                  <Button variant="outline" onClick={() => setGovDialogOpen(false)} className="text-lg py-3">
                    סגור
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
  );

  const plateInternalFields = (
    <>
      <div>
        <label className="block text-lg font-medium mb-2">מספר רכב (רישוי) *</label>
        <div className="flex gap-2 flex-wrap">
          <input
            value={licensePlate}
            onChange={(e) => setLicensePlate(e.target.value)}
            placeholder="12-345-67"
            className={`${inputClass} flex-1 min-w-[140px]`}
            dir="ltr"
            style={{ textAlign: 'right' }}
          />
          <Button
            type="button"
            onClick={handleGovLookup}
            disabled={govLoading}
            variant="outline"
            className="h-auto px-4 text-lg rounded-xl border-2 whitespace-nowrap"
          >
            {govLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5 ml-1" />}
            משרד הרישוי / התחבורה
          </Button>
        </div>
      </div>
      <div>
        <label className="block text-lg font-medium mb-2">מספר פנימי</label>
        <input
          value={internalNumber}
          onChange={(e) => setInternalNumber(e.target.value)}
          placeholder="מספר פנימי בארגון..."
          className={inputClass}
        />
      </div>
    </>
  );

  return (
    <div className={`animate-fade-in ${showFullForm && !isEdit ? 'pb-8' : ''}`}>
      {govDialog}

      {showIntro && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <button type="button" onClick={() => void handleCancelFlow()} className="flex items-center gap-2 text-primary text-lg font-medium min-h-[48px]">
              <ArrowRight size={20} /> ביטול
            </button>
          </div>
          <h1 className="text-2xl font-bold mb-2">הוספת רכב חדש</h1>
          <div className="card-elevated p-4 mb-6 border-primary/30 bg-primary/5">
            <p className="text-sm font-bold text-primary mb-1">שלב 1 — מספר רכב ורישוי</p>
            <p className="text-sm text-muted-foreground">אחרי המשך — טופס פתיחת רכב חדש (תצוגת UI · כל השדות מקוד Claude).</p>
          </div>
          <div className="space-y-5 card-elevated p-4">
          {plateInternalFields}
          <Button type="button" onClick={goToFullForm} className="w-full py-5 text-xl font-bold">
            המשך לטופס המלא →
          </Button>
          <Link
            to="/vehicle-import"
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-border font-bold text-primary"
          >
            <Upload size={18} /> יבוא רכבים
          </Link>
          <button type="button" onClick={() => void handleCancelFlow()} className="w-full py-3 text-destructive font-bold">
            ביטול פתיחת רכב
          </button>
        </div>
        </>
      )}

      {showFullForm && !isEdit && (
        <VehicleNewFormDalia
          initialPlate={licensePlate}
          initialInternal={internalNumber}
          initialGovData={govDataApplied && govData ? govData : null}
          onBackToStep1={() => setFormStep('intro')}
          onCancel={() => void handleCancelFlow()}
          onGovFetched={(data) => {
            setGovData(data);
            setGovDataApplied(true);
          }}
          showPreviewBanner
        />
      )}

      {showFullForm && isEdit && (
      <div className="space-y-4">
          <button type="button" onClick={handleBackClick} className="flex items-center gap-2 text-primary text-lg font-medium mb-2 min-h-[48px]">
            <ArrowRight size={20} /> חזרה
          </button>
        <div className="card-elevated overflow-hidden">
          <div className="p-3 border-b border-border bg-primary/5">
            <p className="text-sm text-muted-foreground">
                <>עריכת רכב — כל השדות</>
            </p>
          </div>
        <VehicleFormSection n={1} title="פרטי רכב" defaultOpen={sectionOpen(1)} saveLabel={SECTION_SAVE_LABELS[1]} {...sectionSaveProps}>
        {plateInternalFields}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-lg font-medium mb-2">יצרן</label>
            <input value={manufacturer} onChange={e => setManufacturer(e.target.value)} placeholder="יצרן..." className={inputClass} />
          </div>
          <div>
            <label className="block text-lg font-medium mb-2">דגם</label>
            <input value={model} onChange={e => setModel(e.target.value)} placeholder="דגם..." className={inputClass} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-lg font-medium mb-2">שנה</label>
            <input type="number" value={year} onChange={e => setYear(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-lg font-medium mb-2">סוג רכב</label>
            <select value={vehicleType} onChange={e => { setVehicleType(e.target.value); if (e.target.value !== 'אחר') setVehicleTypeCustom(''); }} className={inputClass}>
              <option value="">בחר סוג...</option>
              <option value="רכב פרטי">רכב פרטי</option>
              <option value="רכב מסחרי">רכב מסחרי</option>
              <option value="משאית">משאית</option>
              <option value="אוטובוס">אוטובוס</option>
              <option value="מיניבוס">מיניבוס</option>
              <option value="אופנוע">אופנוע</option>
              <option value="רכב תפעולי">רכב תפעולי</option>
              <option value='צמ"ה'>צמ"ה</option>
              <option value="רכב זעיר">רכב זעיר</option>
              <option value="אחר">אחר</option>
            </select>
            {isCustomVehicleType && (
              <input value={vehicleTypeCustom} onChange={e => setVehicleTypeCustom(e.target.value)} placeholder="הזן סוג רכב..." className={`${inputClass} mt-2`} />
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {isEdit && (
            <div>
              <label className="block text-lg font-medium mb-2">סטטוס</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className={inputClass}>
                <option value="active">פעיל</option>
                <option value="in_service">בטיפול</option>
                <option value="out_of_service">לא פעיל</option>
              </select>
            </div>
          )}
          <div>
            <label className="block text-lg font-medium mb-2">ק"מ נוכחי</label>
            <input type="number" value={odometer} onChange={e => setOdometer(e.target.value)} placeholder="0" className={inputClass} />
          </div>
        </div>
        <div>
          <label className="block text-lg font-medium mb-2">נהג משויך</label>
          <select value={assignedDriver} onChange={e => setAssignedDriver(e.target.value)} className={inputClass}>
            <option value="">{driverRequired ? 'בחר נהג...' : 'ללא נהג'}</option>
            {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
          </select>
        </div>
        </VehicleFormSection>

        <VehicleFormSection n={2} title="בעלות, ליסינג ומימון" defaultOpen={sectionOpen(2)} saveLabel={SECTION_SAVE_LABELS[2]} {...sectionSaveProps}>
          <h2 className="text-xl font-bold mb-4">📋 סוג ניהול רכב</h2>
          <div className="grid grid-cols-1 gap-3">
            {(Object.keys(managementTypeLabels) as ManagementType[]).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setManagementType(type)}
                className={`w-full py-4 px-5 rounded-xl text-lg font-medium text-right transition-all border-2 ${
                  managementType === type
                    ? 'border-primary bg-primary/10 text-primary shadow-md'
                    : 'border-border bg-card text-foreground hover:border-primary/40'
                }`}
              >
                {managementType === type && <span className="ml-2">✓</span>}
                {managementTypeLabels[type]}
              </button>
            ))}
          </div>

        {/* === Conditional Fields by Management Type === */}
        {managementType === 'operational_leasing' && (
          <div className="border border-primary/20 rounded-xl p-5 space-y-4 bg-primary/5">
            <h3 className="font-bold text-lg text-primary">🏢 פרטי ליסינג תפעולי</h3>
            <div>
              <label className="block text-sm font-medium mb-1">עלות חודשית (₪)</label>
              <input type="number" value={monthlyLeasingCost} onChange={e => setMonthlyLeasingCost(e.target.value)} placeholder="עלות חודשית..." className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">מועד סיום הליסינג</label>
              <input type="date" value={leasingEndDate} onChange={e => setLeasingEndDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">מועד החזרת הרכב</label>
              <input type="date" value={vehicleReturnDate} onChange={e => setVehicleReturnDate(e.target.value)} className={inputClass} />
            </div>
          </div>
        )}

        {managementType === 'financial_leasing' && (
          <div className="border border-primary/20 rounded-xl p-5 space-y-4 bg-primary/5">
            <h3 className="font-bold text-lg text-primary">💳 פרטי ליסינג מימוני</h3>
            <div>
              <label className="block text-sm font-medium mb-1">גובה החזר חודשי (₪)</label>
              <input type="number" value={monthlyLoanPayment} onChange={e => setMonthlyLoanPayment(e.target.value)} placeholder="החזר חודשי..." className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">תאריך סיום ההלוואה</label>
              <input type="date" value={loanEndDate} onChange={e => setLoanEndDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">מועד מתוכנן להחלפת הרכב</label>
              <input type="date" value={plannedReplacementDate} onChange={e => setPlannedReplacementDate(e.target.value)} className={inputClass} />
            </div>
          </div>
        )}

        {managementType === 'self_maintained' && (
          <div className="border border-primary/20 rounded-xl p-5 space-y-4 bg-primary/5">
            <h3 className="font-bold text-lg text-primary">🔧 תחזוקה עצמאית</h3>
            <div className="flex gap-3 mb-2">
              <button type="button" onClick={() => setHasLoan(false)}
                className={`flex-1 py-3 rounded-xl text-base font-medium transition-colors ${!hasLoan ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                ללא הלוואה
              </button>
              <button type="button" onClick={() => setHasLoan(true)}
                className={`flex-1 py-3 rounded-xl text-base font-medium transition-colors ${hasLoan ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                יש הלוואה על הרכב
              </button>
            </div>
            {hasLoan && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">גובה החזר חודשי (₪)</label>
                  <input type="number" value={monthlyLoanPayment} onChange={e => setMonthlyLoanPayment(e.target.value)} placeholder="החזר חודשי..." className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">תאריך סיום ההלוואה</label>
                  <input type="date" value={loanEndDate} onChange={e => setLoanEndDate(e.target.value)} className={inputClass} />
                </div>
              </>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">מועד מתוכנן להחלפת הרכב</label>
              <input type="date" value={plannedReplacementDate} onChange={e => setPlannedReplacementDate(e.target.value)} className={inputClass} />
            </div>
          </div>
        )}
        </VehicleFormSection>

        <VehicleFormSection n={3} title="ביטוחים ורישיונות" defaultOpen={sectionOpen(3)} saveLabel={SECTION_SAVE_LABELS[3]} {...sectionSaveProps}>
          <div>
            <label className="block text-lg font-medium mb-2">תוקף טסט (רישוי) *</label>
            <input type="date" value={testExpiry} onChange={e => setTestExpiry(e.target.value)} className={inputClass} />
          </div>

        {/* Insurance */}
        <div className="border border-border rounded-xl p-4 space-y-4">
          <h3 className="font-bold text-lg">ביטוח חובה</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">תאריך התחלה</label>
              <input type="date" value={insuranceStart} onChange={e => setInsuranceStart(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">תאריך תוקף</label>
              <input type="date" value={insuranceExpiry} onChange={e => setInsuranceExpiry(e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>

        <div className="border border-border rounded-xl p-4 space-y-4">
          <h3 className="font-bold text-lg">ביטוח מקיף</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">תאריך התחלה</label>
              <input type="date" value={compInsStart} onChange={e => setCompInsStart(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">תאריך תוקף</label>
              <input type="date" value={compInsExpiry} onChange={e => setCompInsExpiry(e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>

        {/* === Insurance History Table (for financial_leasing and self_maintained) === */}
        {showInsuranceSection && (
          <div className="border-t border-border pt-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">📊 היסטוריית ביטוחים והדר תביעות</h2>
              <button type="button" onClick={addInsuranceYear}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors">
                <PlusCircle size={16} /> הוסף שנה
              </button>
            </div>

            {insuranceHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-xl">
                <p>אין נתוני ביטוח עדיין</p>
                <p className="text-sm mt-1">לחץ "הוסף שנה" כדי להתחיל</p>
              </div>
            ) : (
              <div className="space-y-4">
                {insuranceHistory.map((row, index) => (
                  <div key={index} className="border border-border rounded-xl p-4 space-y-3 relative">
                    <button
                      type="button"
                      onClick={() => removeInsuranceRow(index)}
                      className="absolute top-2 left-2 w-7 h-7 rounded-full border border-border bg-card flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <X size={14} />
                    </button>
                    <div className="flex items-center gap-3">
                      <label className="font-bold text-lg">שנת</label>
                      <input
                        type="number"
                        value={row.year}
                        onChange={e => updateInsuranceRow(index, 'year', parseInt(e.target.value) || 0)}
                        className="w-24 p-2 text-lg font-bold rounded-lg border-2 border-input bg-background focus:border-primary focus:outline-none text-center"
                      />
                      <button
                        type="button"
                        onClick={() => updateInsuranceRow(index, 'has_no_claims', !row.has_no_claims)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          row.has_no_claims ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {row.has_no_claims ? '✅ הדר תביעות' : 'ללא הדר'}
                      </button>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">חברת ביטוח</label>
                      <input
                        value={row.insurer_name}
                        onChange={e => updateInsuranceRow(index, 'insurer_name', e.target.value)}
                        placeholder="שם חברת ביטוח..."
                        className={inputClass}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium mb-1">עלות ביטוח חובה (₪)</label>
                        <input
                          type="number"
                          value={row.mandatory_insurance_cost || ''}
                          onChange={e => updateInsuranceRow(index, 'mandatory_insurance_cost', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">עלות ביטוח מקיף (₪)</label>
                        <input
                          type="number"
                          value={row.comprehensive_insurance_cost || ''}
                          onChange={e => updateInsuranceRow(index, 'comprehensive_insurance_cost', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className={inputClass}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        </VehicleFormSection>

        <VehicleFormSection n={4} title="ציוד וכלים מיוחדים" defaultOpen={sectionOpen(4)} saveLabel={SECTION_SAVE_LABELS[4]} {...sectionSaveProps}>
          <p className="text-sm text-muted-foreground">
            אין שדה ייעודי בטבלת vehicles. ציוד נוסף נרשם בהחלפות רכב (vehicle_exchanges.extra_equipment) — לאחר שמירת הרכב.
          </p>
        </VehicleFormSection>

        <VehicleFormSection n={5} title="טיפולים ותחזוקה" defaultOpen={sectionOpen(5)} saveLabel={SECTION_SAVE_LABELS[5]} {...sectionSaveProps}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">טיפול אחרון</label>
              <input type="date" value={lastServiceDate} onChange={e => setLastServiceDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">טיפול הבא</label>
              <input type="date" value={nextServiceDate} onChange={e => setNextServiceDate(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div className="pt-2">
          <p className="font-bold text-lg mb-2">🚛 שינוע</p>
          <div className="flex gap-3">
            <button type="button" onClick={() => setNeedsTransport(false)}
              className={`flex-1 py-3 rounded-xl text-lg font-medium transition-colors ${!needsTransport ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              לא צריך שינוע
            </button>
            <button type="button" onClick={() => setNeedsTransport(true)}
              className={`flex-1 py-3 rounded-xl text-lg font-medium transition-colors ${needsTransport ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              צריך שינוע
            </button>
          </div>
          </div>

        <div>
          <label className="block text-lg font-medium mb-2">הערות</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="הערות..." className={`${inputClass} resize-none`} />
        </div>
        </VehicleFormSection>

        <VehicleFormSection n={6} title="מסמכים וקבצים" defaultOpen={sectionOpen(6)} saveLabel={SECTION_SAVE_LABELS[6]} {...sectionSaveProps}>
          <div className="space-y-4">
            <ImageUpload
              label="צילום רישיון רכב"
              required={!isEdit && insuranceDocsRequired}
              imageUrl={licenseDocUrl || null}
              onImageUploaded={(url) => setLicenseDocUrl(url || '')}
              folder="vehicle-docs"
              acceptPdf
              documentCategory="vehicle-license"
              documentContext={documentContext}
            />
            <ImageUpload
              label="פוליסת ביטוח חובה"
              required={!isEdit && insuranceDocsRequired}
              imageUrl={insuranceDocUrl || null}
              onImageUploaded={(url) => setInsuranceDocUrl(url || '')}
              folder="vehicle-docs"
              acceptPdf
              documentCategory="insurance"
              documentContext={documentContext}
            />
            <ImageUpload
              label="פוליסת ביטוח מקיף"
              required={!isEdit && insuranceDocsRequired}
              imageUrl={compInsDocUrl || null}
              onImageUploaded={(url) => setCompInsDocUrl(url || '')}
              folder="vehicle-docs"
              acceptPdf
              documentCategory="comprehensive"
              documentContext={documentContext}
            />
          </div>
        </VehicleFormSection>
        </div>

        {/* Validation summary */}
        {!isValid && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive space-y-1">
            {!basicFieldsFilled && <p>• יש למלא את כל שדות החובה (מסומנים ב-*)</p>}
            {!typeFieldsFilled && <p>• יש למלא את כל שדות סוג ניהול הרכב</p>}
            {!allDocsFilled && <p>• יש לצרף את כל המסמכים הנדרשים (רישיון רכב, ביטוח חובה, ביטוח מקיף)</p>}
            {!insuranceDocsRequired && <p className="text-muted-foreground">ℹ️ חובת מסמכי ביטוח בוטלה עבור חברה זו</p>}
            {!noClaimsRequired && showInsuranceSection && <p className="text-muted-foreground">ℹ️ חובת הדר תביעות בוטלה עבור חברה זו</p>}
          </div>
        )}

        <button onClick={handleSubmit} disabled={!isValid || !!savingScope}
          className={`w-full py-5 rounded-xl text-xl font-bold transition-colors ${isValid && !savingScope ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
          {savingScope === 'full' ? 'שומר...' : isEdit ? '💾 עדכן רכב' : '💾 שמור רכב'}
        </button>
        {!isEdit && (
          <Link
            to="/vehicle-import"
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-border font-bold text-primary mt-2"
          >
            <Upload size={18} /> יבוא רכבים
          </Link>
        )}
      </div>
      )}
    </div>
  );
}

// Generate in-app alerts for vehicle document expiry
async function generateVehicleAlerts(plate: string, user: any, payload?: any) {
  try {
    const { data: managers } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'fleet_manager');

    if (managers) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, company_name')
        .in('id', managers.map(m => m.user_id))
        .eq('company_name', user?.company_name || '');

      if (profiles) {
        const notifications: Array<{ user_id: string; type: string; title: string; message: string; link: string }> = [];

        for (const p of profiles) {
          // Generic new vehicle notification
          notifications.push({
            user_id: p.id,
            type: 'vehicle',
            title: 'רכב חדש נוסף',
            message: `רכב ${plate} נוסף למערכת`,
            link: '/vehicles',
          });

          // Date-specific expiry alerts
          if (payload) {
            const expiryFields = [
              { field: 'test_expiry', label: 'טסט' },
              { field: 'insurance_expiry', label: 'ביטוח חובה' },
              { field: 'comprehensive_insurance_expiry', label: 'ביטוח מקיף' },
              { field: 'leasing_end_date', label: 'סיום ליסינג' },
              { field: 'loan_end_date', label: 'סיום הלוואה' },
            ];

            for (const { field, label } of expiryFields) {
              const dateVal = payload[field];
              if (dateVal) {
                const daysLeft = Math.ceil((new Date(dateVal).getTime() - Date.now()) / 86400000);
                if (daysLeft <= 30 && daysLeft > 0) {
                  notifications.push({
                    user_id: p.id,
                    type: 'vehicle',
                    title: `⚠️ ${label} פוקע בקרוב`,
                    message: `${label} של רכב ${plate} פוקע בעוד ${daysLeft} ימים (${new Date(dateVal).toLocaleDateString('he-IL')})`,
                    link: '/vehicles',
                  });
                } else if (daysLeft <= 0) {
                  notifications.push({
                    user_id: p.id,
                    type: 'vehicle',
                    title: `🚨 ${label} פג תוקף!`,
                    message: `${label} של רכב ${plate} פג תוקף ב-${new Date(dateVal).toLocaleDateString('he-IL')}`,
                    link: '/vehicles',
                  });
                }
              }
            }
          }
        }

        if (notifications.length > 0) {
          await supabase.from('driver_notifications').insert(notifications);
        }
      }
    }
  } catch (e) {
    console.error('Alert generation error:', e);
  }
}