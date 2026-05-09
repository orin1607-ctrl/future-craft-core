import { useState, useEffect } from 'react';
import { Car, Search, Plus, ArrowRight, Edit2, Phone, Trash2, Truck, Download, PlusCircle, X, Loader2, AlertTriangle } from 'lucide-react';
import { exportToCsv } from '@/utils/exportCsv';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter, applyCompanyScope } from '@/hooks/useCompanyFilter';
import { toast } from 'sonner';
import ImageUpload from '@/components/ImageUpload';
import MultiImageUpload from '@/components/MultiImageUpload';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import CallCustomerButton from '@/components/voice/CallCustomerButton';
import InfoGapTracker from '@/components/InfoGapTracker';

interface GovVehicleData {
  mispar_rechev: number;
  tozeret_nm: string;
  degem_nm: string;
  kinuy_mishari: string;
  shnat_yitzur: number;
  tzeva_rechev: string;
  sug_delek_nm: string;
  misgeret: string;
  baalut: string;
  tokef_dt: string;
  mivchan_acharon_dt: string;
  zmig_kidmi: string;
  zmig_ahori: string;
  ramat_gimur: string;
  degem_manoa: string;
  moed_aliya_lakvish: string;
}

async function fetchVehicleFromGov(licensePlate: string): Promise<GovVehicleData | null> {
  const cleanPlate = licensePlate.replace(/[-\s]/g, '');
  if (!cleanPlate || cleanPlate.length < 5) return null;
  
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const res = await fetch(
    `${supabaseUrl}/functions/v1/vehicle-lookup?plate=${encodeURIComponent(cleanPlate)}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${anonKey}`,
        'apikey': anonKey,
      },
    }
  );

  if (!res.ok) return null;
  const json = await res.json();
  if (json.raw) {
    return json.raw as GovVehicleData;
  }
  return null;
}

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
  code: string;
  nickname: string;
  ownership_type: string;
  third_party_insurance_expiry: string | null;
  third_party_insurance_doc_url: string;
  next_service_km: number | null;
  insurance_company: string;
  insurance_agent: string;
  vehicle_images: string;
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

  const handleFormDone = () => {
    handleBack();
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק רכב זה?')) return;
    const { error } = await supabase.from('vehicles').delete().eq('id', id);
    if (error) {
      toast.error('שגיאה במחיקת הרכב');
    } else {
      toast.success('הרכב נמחק בהצלחה');
      handleFormDone();
    }
  };

  // === FORM VIEW ===
  if (viewMode === 'form') {
    return <VehicleForm vehicle={editVehicle} drivers={drivers} onDone={handleFormDone} onBack={handleBack} user={user} />;
  }

  // === DETAIL VIEW ===
  if (viewMode === 'detail' && selectedVehicle) {
    return <VehicleDetail vehicle={selectedVehicle} drivers={drivers} isManager={isManager} onBack={handleBack} onEdit={handleOpenForm} onDelete={handleDelete} getDriverName={getDriverName} />;
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
        <div className="flex items-center gap-2">
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

// === Vehicle Detail Component ===
function VehicleDetail({ vehicle: v, drivers, isManager, onBack, onEdit, onDelete, getDriverName }: {
  vehicle: VehicleRow;
  drivers: DriverRow[];
  isManager: boolean;
  onBack: () => void;
  onEdit: (v: VehicleRow) => void;
  onDelete: (id: string) => void;
  getDriverName: (id: string | null) => string;
}) {
  const [insuranceHistory, setInsuranceHistory] = useState<InsuranceHistoryRow[]>([]);

  const statusLabel = (s: string) => {
    switch (s) {
      case 'active': return { text: 'פעיל', cls: 'status-active' };
      case 'in_service': return { text: 'בטיפול', cls: 'status-pending' };
      case 'out_of_service': return { text: 'לא פעיל', cls: 'status-inactive' };
      default: return { text: s || 'לא ידוע', cls: '' };
    }
  };

  const sl = statusLabel(v.status);
  const driver = drivers.find(d => d.id === v.assigned_driver_id);
  const showInsurance = v.management_type === 'financial_leasing' || v.management_type === 'self_maintained';

  const daysUntil = (dateStr: string | null) => {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
  };
  const testDays = daysUntil(v.test_expiry);
  const insDays = daysUntil(v.insurance_expiry);
  const compDays = daysUntil(v.comprehensive_insurance_expiry);
  const expiryColor = (days: number | null) => {
    if (days === null) return '';
    if (days <= 0) return 'text-destructive font-bold';
    if (days <= 14) return 'text-warning font-bold';
    return '';
  };

  useEffect(() => {
    if (showInsurance) {
      supabase
        .from('vehicle_insurance_history')
        .select('*')
        .eq('vehicle_id', v.id)
        .order('year', { ascending: false })
        .then(({ data }) => {
          if (data) setInsuranceHistory(data as InsuranceHistoryRow[]);
        });
    }
  }, [v.id, showInsurance]);

  return (
    <div className="animate-fade-in">
      <button onClick={onBack} className="flex items-center gap-2 text-primary text-lg font-medium mb-4 min-h-[48px]">
        <ArrowRight size={20} /> חזרה לרשימה
      </button>

      <div className="card-elevated mb-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">{v.manufacturer} {v.model}</h1>
            <p className="text-lg text-muted-foreground mt-1">{v.license_plate} • {v.year || ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`status-badge ${sl.cls}`}>{sl.text}</span>
            {isManager && (
              <button onClick={() => onEdit(v)} className="p-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                <Edit2 size={18} />
              </button>
            )}
          </div>
        </div>

        {(() => {
          const today = new Date();
          const missing: string[] = [];
          if (!v.license_doc_url) missing.push('רישיון רכב חסר');
          if (!v.test_expiry) missing.push('תוקף טסט לא מעודכן');
          else if (new Date(v.test_expiry) < today) missing.push('טסט פג תוקף');
          if (!v.insurance_expiry) missing.push('ביטוח חובה חסר');
          else if (new Date(v.insurance_expiry) < today) missing.push('ביטוח חובה פג תוקף');
          if (!v.insurance_doc_url) missing.push('מסמך ביטוח חובה חסר');
          if (showInsurance) {
            if (!v.comprehensive_insurance_expiry) missing.push('ביטוח מקיף חסר');
            else if (new Date(v.comprehensive_insurance_expiry) < today) missing.push('ביטוח מקיף פג תוקף');
          }
          return <InfoGapTracker entityType="vehicle" entityId={v.id} companyName={v.company_name || ''} gaps={missing} />;
        })()}

        <div className="grid grid-cols-2 gap-y-5 gap-x-4 text-lg">
          <InfoField label="סוג רכב" value={v.vehicle_type || '—'} />
          <InfoField label='ק"מ' value={`${(v.odometer || 0).toLocaleString()}`} />
          <InfoField label="מספר פנימי" value={v.internal_number || '—'} />
          <InfoField label="חברה" value={v.company_name || '—'} />
          <InfoField label="נהג משויך" value={getDriverName(v.assigned_driver_id)} />
          <InfoField label="סוג ניהול" value={
            v.management_type === 'operational_leasing' ? 'ליסינג תפעולי' :
            v.management_type === 'financial_leasing' ? 'ליסינג מימוני' :
            v.management_type === 'self_maintained' ? 'תחזוקה עצמאית' : '—'
          } />
        </div>

        {/* Management Type Details */}
        {v.management_type === 'operational_leasing' && (
          <div className="mt-4 p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
            <h3 className="font-bold text-primary">🏢 ליסינג תפעולי</h3>
            <div className="grid grid-cols-2 gap-y-3 gap-x-4">
              <InfoField label="עלות חודשית" value={v.monthly_leasing_cost ? `₪${v.monthly_leasing_cost.toLocaleString()}` : '—'} />
              <InfoField label="מועד סיום ליסינג" value={v.leasing_end_date ? new Date(v.leasing_end_date).toLocaleDateString('he-IL') : '—'} />
              <InfoField label="מועד החזרת הרכב" value={v.vehicle_return_date ? new Date(v.vehicle_return_date).toLocaleDateString('he-IL') : '—'} />
            </div>
          </div>
        )}

        {v.management_type === 'financial_leasing' && (
          <div className="mt-4 p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
            <h3 className="font-bold text-primary">💳 ליסינג מימוני</h3>
            <div className="grid grid-cols-2 gap-y-3 gap-x-4">
              <InfoField label="החזר חודשי" value={v.monthly_loan_payment ? `₪${v.monthly_loan_payment.toLocaleString()}` : '—'} />
              <InfoField label="תאריך סיום הלוואה" value={v.loan_end_date ? new Date(v.loan_end_date).toLocaleDateString('he-IL') : '—'} />
              <InfoField label="מועד מתוכנן להחלפה" value={v.planned_replacement_date ? new Date(v.planned_replacement_date).toLocaleDateString('he-IL') : '—'} />
            </div>
          </div>
        )}

        {v.management_type === 'self_maintained' && (
          <div className="mt-4 p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
            <h3 className="font-bold text-primary">🔧 תחזוקה עצמאית</h3>
            <div className="grid grid-cols-2 gap-y-3 gap-x-4">
              <InfoField label="הלוואה" value={v.has_loan ? 'כן' : 'אין'} />
              {v.has_loan && (
                <>
                  <InfoField label="החזר חודשי" value={v.monthly_loan_payment ? `₪${v.monthly_loan_payment.toLocaleString()}` : '—'} />
                  <InfoField label="תאריך סיום הלוואה" value={v.loan_end_date ? new Date(v.loan_end_date).toLocaleDateString('he-IL') : '—'} />
                </>
              )}
              <InfoField label="מועד מתוכנן להחלפה" value={v.planned_replacement_date ? new Date(v.planned_replacement_date).toLocaleDateString('he-IL') : '—'} />
            </div>
          </div>
        )}

        {/* Driver quick actions */}
        {driver && (
          <div className="flex gap-2 mt-4">
            {driver.phone && (
              <a href={`tel:${driver.phone}`} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 text-primary font-medium text-sm">
                <Phone size={16} /> {driver.phone}
              </a>
            )}
          </div>
        )}
      </div>

      {/* Expiry Dates */}
      <div className="card-elevated mb-4">
        <h2 className="text-lg font-bold mb-4">תוקף מסמכים</h2>
        <div className="space-y-3">
          <ExpiryRow label="טסט" date={v.test_expiry} daysLeft={testDays} colorCls={expiryColor(testDays)} />
          <ExpiryRow label="ביטוח חובה" date={v.insurance_expiry} daysLeft={insDays} colorCls={expiryColor(insDays)} />
          <ExpiryRow label="ביטוח מקיף" date={v.comprehensive_insurance_expiry} daysLeft={compDays} colorCls={expiryColor(compDays)} />
          {v.third_party_insurance_expiry && (() => {
            const tpDays = daysUntil(v.third_party_insurance_expiry);
            return <ExpiryRow label="ביטוח צד ג'" date={v.third_party_insurance_expiry} daysLeft={tpDays} colorCls={expiryColor(tpDays)} />;
          })()}
          {v.next_service_date && (() => {
            const svcDays = daysUntil(v.next_service_date);
            return <ExpiryRow label="טיפול הבא" date={v.next_service_date} daysLeft={svcDays} colorCls={expiryColor(svcDays)} />;
          })()}
        </div>
        {(v.insurance_company || v.insurance_agent || v.next_service_km) && (
          <div className="grid grid-cols-2 gap-y-3 gap-x-4 mt-4 pt-4 border-t border-border">
            {v.insurance_company && <InfoField label="חברת ביטוח" value={v.insurance_company} />}
            {v.insurance_agent && <InfoField label="סוכן ביטוח" value={v.insurance_agent} />}
            {v.next_service_km && <InfoField label='ק"מ לטיפול הבא' value={v.next_service_km.toLocaleString()} />}
          </div>
        )}
      </div>

      {/* Insurance History */}
      {showInsurance && insuranceHistory.length > 0 && (
        <div className="card-elevated mb-4">
          <h2 className="text-lg font-bold mb-4">📊 היסטוריית ביטוחים והדר תביעות</h2>
          <div className="space-y-3">
            {insuranceHistory.map((row, i) => (
              <div key={i} className="border border-border rounded-xl p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-lg">שנת {row.year}</span>
                  <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${row.has_no_claims ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
                    {row.has_no_claims ? '✅ הדר תביעות' : 'ללא הדר'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <InfoField label="חברת ביטוח" value={row.insurer_name || '—'} />
                  <InfoField label="ביטוח חובה" value={row.mandatory_insurance_cost ? `₪${row.mandatory_insurance_cost.toLocaleString()}` : '—'} />
                  <InfoField label="ביטוח מקיף" value={row.comprehensive_insurance_cost ? `₪${row.comprehensive_insurance_cost.toLocaleString()}` : '—'} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documents */}
      <div className="card-elevated mb-4">
        <h2 className="text-lg font-bold mb-4">מסמכים</h2>
        <div className="space-y-2">
          {v.license_doc_url && <DocLink label="רישיון רכב" url={v.license_doc_url} />}
          {v.insurance_doc_url && <DocLink label="פוליסת ביטוח חובה" url={v.insurance_doc_url} />}
          {v.comprehensive_insurance_doc_url && <DocLink label="פוליסת ביטוח מקיף" url={v.comprehensive_insurance_doc_url} />}
          {v.third_party_insurance_doc_url && <DocLink label="פוליסת ביטוח צד ג'" url={v.third_party_insurance_doc_url} />}
          {!v.license_doc_url && !v.insurance_doc_url && !v.comprehensive_insurance_doc_url && !v.third_party_insurance_doc_url && (
            <p className="text-muted-foreground text-sm">אין מסמכים מצורפים</p>
          )}
        </div>
      </div>

      {/* Vehicle Images */}
      {(() => {
        let imgs: string[] = [];
        try { imgs = v.vehicle_images ? JSON.parse(v.vehicle_images) : []; } catch {}
        if (!imgs.length) return null;
        return (
          <div className="card-elevated mb-4">
            <h2 className="text-lg font-bold mb-4">📸 תמונות רכב / נזק</h2>
            <div className="grid grid-cols-3 gap-2">
              {imgs.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                  <img src={url} alt={`רכב ${i+1}`} className="w-full h-24 object-cover rounded-lg border border-border" />
                </a>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Transport */}
      {v.needs_transport && (
        <div className="card-elevated mb-4">
          <div className="flex items-center gap-2 text-primary font-bold">
            <Truck size={20} /> נדרש שינוע
          </div>
        </div>
      )}

      {/* Notes */}
      {v.notes && (
        <div className="card-elevated">
          <h2 className="text-lg font-bold mb-2">הערות</h2>
          <p className="text-muted-foreground">{v.notes}</p>
        </div>
      )}

      {/* Archive / Delete */}
      {isManager && (
        <div className="space-y-3 mt-4">
          {v.status !== 'archived' && (
            <button onClick={async () => {
              await supabase.from('vehicles').update({ status: 'archived' }).eq('id', v.id);
              toast.success('הרכב הועבר לארכיון');
              onBack();
            }} className="w-full py-4 rounded-xl border-2 border-warning/30 text-warning font-bold text-lg flex items-center justify-center gap-2 hover:bg-warning/5 transition-colors">
              📦 העבר לארכיון
            </button>
          )}
          <button onClick={() => onDelete(v.id)} className="w-full py-4 rounded-xl border-2 border-destructive/30 text-destructive font-bold text-lg flex items-center justify-center gap-2 hover:bg-destructive/5 transition-colors">
            <Trash2 size={20} /> מחק רכב
          </button>
        </div>
      )}
    </div>
  );
}


function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground text-sm">{label}</span>
      <p className="font-bold">{value}</p>
    </div>
  );
}

function DocLink({ label, url }: { label: string; url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-2 py-2 px-3 rounded-xl bg-muted hover:bg-muted/80 transition-colors text-sm font-medium text-primary">
      📄 {label}
    </a>
  );
}

function ExpiryRow({ label, date, daysLeft, colorCls }: { label: string; date: string | null; daysLeft: number | null; colorCls: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <span className="font-medium">{label}</span>
      {date ? (
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{new Date(date).toLocaleDateString('he-IL')}</span>
          <span className={`text-sm ${colorCls}`}>
            {daysLeft !== null && (daysLeft <= 0 ? 'פג תוקף!' : `${daysLeft} ימים`)}
          </span>
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">לא הוגדר</span>
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

// === Vehicle Form (Add / Edit) ===
type ManagementType = 'operational_leasing' | 'financial_leasing' | 'self_maintained';

function VehicleForm({ vehicle, drivers, onDone, onBack, user }: {
  vehicle: VehicleRow | null;
  drivers: DriverRow[];
  onDone: () => void;
  onBack: () => void;
  user: any;
}) {
  const isEdit = !!vehicle;
  const [licensePlate, setLicensePlate] = useState(vehicle?.license_plate || '');
  const [internalNumber, setInternalNumber] = useState(vehicle?.internal_number || '');
  const [code, setCode] = useState(vehicle?.code || '');
  const [nickname, setNickname] = useState(vehicle?.nickname || '');
  const [ownershipType, setOwnershipType] = useState(vehicle?.ownership_type || 'company');
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
    } catch {
      toast.error('שגיאה בחיפוש במאגר הממשלתי');
    }
    setGovLoading(false);
  };

  const applyGovData = () => {
    if (!govData) return;
    if (govData.tozeret_nm) setManufacturer(govData.tozeret_nm.trim());
    if (govData.kinuy_mishari) setModel(govData.kinuy_mishari.trim());
    if (govData.degem_nm) {
      // Use degem_nm as model if kinuy_mishari is empty
      if (!govData.kinuy_mishari) setModel(govData.degem_nm.trim());
    }
    if (govData.shnat_yitzur) setYear(govData.shnat_yitzur.toString());
    if (govData.tokef_dt) {
      try {
        const d = new Date(govData.tokef_dt);
        if (!isNaN(d.getTime())) setTestExpiry(d.toISOString().split('T')[0]);
        else setTestExpiry(govData.tokef_dt);
      } catch { setTestExpiry(govData.tokef_dt); }
    }
    setGovDialogOpen(false);
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
  const [loading, setLoading] = useState(false);

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
  const [thirdPartyInsExpiry, setThirdPartyInsExpiry] = useState(vehicle?.third_party_insurance_expiry || '');
  const [thirdPartyInsDocUrl, setThirdPartyInsDocUrl] = useState(vehicle?.third_party_insurance_doc_url || '');
  const [nextServiceKm, setNextServiceKm] = useState(vehicle?.next_service_km?.toString() || '');
  const [insuranceCompany, setInsuranceCompany] = useState(vehicle?.insurance_company || '');
  const [insuranceAgent, setInsuranceAgent] = useState(vehicle?.insurance_agent || '');
  const [vehicleImages, setVehicleImages] = useState<string[]>(() => {
    try { return vehicle?.vehicle_images ? JSON.parse(vehicle.vehicle_images) : []; } catch { return []; }
  });

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

  const inputClass = "w-full p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none";

  const handleSubmit = async () => {
    if (!isValid) {
      toast.error('יש למלא את כל השדות ולצרף מסמכים');
      return;
    }
    setLoading(true);

    // Check if company requires approval
    let approvalStatus = 'approved';
    if (!isEdit) {
      const { data: settings } = await supabase
        .from('company_settings')
        .select('vehicle_approval_required')
        .eq('company_name', user?.company_name || '')
        .maybeSingle();
      if (settings?.vehicle_approval_required) {
        approvalStatus = 'pending_approval';
      }
    }

    const payload: any = {
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
      code,
      nickname,
      ownership_type: ownershipType,
      third_party_insurance_expiry: thirdPartyInsExpiry || null,
      third_party_insurance_doc_url: thirdPartyInsDocUrl,
      next_service_km: parseInt(nextServiceKm) || null,
      insurance_company: insuranceCompany,
      insurance_agent: insuranceAgent,
      vehicle_images: JSON.stringify(vehicleImages),
    };

    let error;
    let vehicleId = vehicle?.id;
    if (isEdit) {
      ({ error } = await supabase.from('vehicles').update(payload).eq('id', vehicle!.id));
    } else {
      const res = await supabase.from('vehicles').insert({
        ...payload,
        company_name: user?.company_name || '',
        created_by: user?.id,
      }).select('id').single();
      error = res.error;
      vehicleId = res.data?.id;
    }

    // Save insurance history
    if (!error && vehicleId && showInsuranceSection && insuranceHistory.length > 0) {
      // Delete existing and re-insert
      await supabase.from('vehicle_insurance_history').delete().eq('vehicle_id', vehicleId);
      const historyPayload = insuranceHistory.map(row => ({
        vehicle_id: vehicleId!,
        year: row.year,
        has_no_claims: row.has_no_claims,
        insurer_name: row.insurer_name,
        mandatory_insurance_cost: row.mandatory_insurance_cost,
        comprehensive_insurance_cost: row.comprehensive_insurance_cost,
        company_name: user?.company_name || '',
      }));
      await supabase.from('vehicle_insurance_history').insert(historyPayload);
    }

    // Generate alerts for expiring documents
    if (!error && !isEdit) {
      await generateVehicleAlerts(licensePlate, user, payload);
    }

    setLoading(false);
    if (error) {
      toast.error(isEdit ? 'שגיאה בעדכון הרכב' : 'שגיאה בהוספת הרכב');
      console.error(error);
    } else {
      const msg = approvalStatus === 'pending_approval'
        ? 'הרכב נוסף וממתין לאישור מנהל על'
        : isEdit ? 'הרכב עודכן בהצלחה' : 'הרכב נוסף בהצלחה';
      toast.success(msg);
      onDone();
    }
  };

  const managementTypeLabels: Record<ManagementType, string> = {
    operational_leasing: 'ליסינג תפעולי',
    financial_leasing: 'ליסינג מימוני',
    self_maintained: 'תחזוקה עצמאית',
  };

  return (
    <div className="animate-fade-in">
      <button onClick={onBack} className="flex items-center gap-2 text-primary text-lg font-medium mb-4 min-h-[48px]">
        <ArrowRight size={20} /> חזרה
      </button>
      <h1 className="text-2xl font-bold mb-6">{isEdit ? 'עריכת רכב' : 'הוספת רכב חדש'}</h1>
      <div className="space-y-5">
        {/* Basic info */}
        <div>
          <label className="block text-lg font-medium mb-2">מספר רכב (רישוי) *</label>
          <div className="flex gap-2">
            <input value={licensePlate} onChange={e => setLicensePlate(e.target.value)} placeholder="12-345-67" className={`${inputClass} flex-1`} dir="ltr" style={{ textAlign: 'right' }} />
            <Button
              type="button"
              onClick={handleGovLookup}
              disabled={govLoading}
              variant="outline"
              className="h-auto px-4 text-lg rounded-xl border-2 whitespace-nowrap"
            >
              {govLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5 ml-1" />}
              שליפה
            </Button>
          </div>
        </div>

        {/* Gov Vehicle Data Dialog */}
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
        <div>
          <label className="block text-lg font-medium mb-2">מספר פנימי</label>
          <input value={internalNumber} onChange={e => setInternalNumber(e.target.value)} placeholder="מספר פנימי בארגון..." className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-lg font-medium mb-2">קודן</label>
            <input value={code} onChange={e => setCode(e.target.value)} placeholder="קודן..." className={inputClass} />
          </div>
          <div>
            <label className="block text-lg font-medium mb-2">כינוי לרכב</label>
            <input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="כינוי..." className={inputClass} />
          </div>
        </div>
        <div>
          <label className="block text-lg font-medium mb-2">בעלות</label>
          <select value={ownershipType} onChange={e => setOwnershipType(e.target.value)} className={inputClass}>
            <option value="company">חברה</option>
            <option value="leasing_company">חברת ליסינג</option>
            <option value="private">פרטי</option>
          </select>
        </div>
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

        {/* === Management Type Selection === */}
        <div className="border-t border-border pt-5">
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

        {/* === Expiry & Insurance Section === */}
        <div className="border-t border-border pt-5">
          <h2 className="text-xl font-bold mb-4">📋 תוקף מסמכים</h2>
          <div>
            <label className="block text-lg font-medium mb-2">תוקף טסט (רישוי) *</label>
            <input type="date" value={testExpiry} onChange={e => setTestExpiry(e.target.value)} className={inputClass} />
          </div>
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

        <div className="border border-border rounded-xl p-4 space-y-4">
          <h3 className="font-bold text-lg">ביטוח צד ג'</h3>
          <div>
            <label className="block text-sm font-medium mb-1">תאריך תוקף</label>
            <input type="date" value={thirdPartyInsExpiry} onChange={e => setThirdPartyInsExpiry(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="border border-border rounded-xl p-4 space-y-4">
          <h3 className="font-bold text-lg">🏢 פרטי ביטוח</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">חברת ביטוח</label>
              <input value={insuranceCompany} onChange={e => setInsuranceCompany(e.target.value)} placeholder="שם חברת הביטוח..." className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">סוכן ביטוח</label>
              <input value={insuranceAgent} onChange={e => setInsuranceAgent(e.target.value)} placeholder="שם הסוכן..." className={inputClass} />
            </div>
          </div>
        </div>

        <div className="border border-border rounded-xl p-4 space-y-4">
          <h3 className="font-bold text-lg">🔧 טיפול</h3>
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
          <div>
            <label className="block text-sm font-medium mb-1">ק"מ לטיפול הבא</label>
            <input type="number" value={nextServiceKm} onChange={e => setNextServiceKm(e.target.value)} placeholder="לדוגמה: 80000" className={inputClass} />
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

        {/* === Document Uploads === */}
        <div className="border-t border-border pt-5">
          <h2 className="text-xl font-bold mb-4">📎 מסמכים {!isEdit && insuranceDocsRequired && <span className="text-destructive text-sm">(חובה)</span>}</h2>
          <div className="space-y-4">
            <ImageUpload
              label="צילום רישיון רכב"
              required={!isEdit && insuranceDocsRequired}
              imageUrl={licenseDocUrl || null}
              onImageUploaded={(url) => setLicenseDocUrl(url || '')}
              folder="vehicle-docs"
              acceptPdf
            />
            <ImageUpload
              label="פוליסת ביטוח חובה"
              required={!isEdit && insuranceDocsRequired}
              imageUrl={insuranceDocUrl || null}
              onImageUploaded={(url) => setInsuranceDocUrl(url || '')}
              folder="vehicle-docs"
              acceptPdf
            />
            <ImageUpload
              label="פוליסת ביטוח מקיף"
              required={!isEdit && insuranceDocsRequired}
              imageUrl={compInsDocUrl || null}
              onImageUploaded={(url) => setCompInsDocUrl(url || '')}
              folder="vehicle-docs"
              acceptPdf
            />
            <ImageUpload
              label="פוליסת ביטוח צד ג'"
              imageUrl={thirdPartyInsDocUrl || null}
              onImageUploaded={(url) => setThirdPartyInsDocUrl(url || '')}
              folder="vehicle-docs"
              acceptPdf
            />
          </div>
        </div>

        {/* Vehicle Images / Damage */}
        <div className="border-t border-border pt-5">
          <h2 className="text-xl font-bold mb-4">📸 תמונות רכב / נזק</h2>
          <MultiImageUpload
            label="תמונות"
            imageUrls={vehicleImages}
            onImagesChanged={setVehicleImages}
            folder="vehicle-images"
            max={20}
          />
        </div>

        {/* Transport */}
        <div className="border-t border-border pt-5">
          <h2 className="text-xl font-bold mb-4">🚛 שינוע</h2>
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

        {/* Notes */}
        <div>
          <label className="block text-lg font-medium mb-2">הערות</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="הערות..." className={`${inputClass} resize-none`} />
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

        <button onClick={handleSubmit} disabled={!isValid || loading}
          className={`w-full py-5 rounded-xl text-xl font-bold transition-colors ${isValid && !loading ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
          {loading ? 'שומר...' : isEdit ? '💾 עדכן רכב' : '💾 שמור רכב'}
        </button>
      </div>
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