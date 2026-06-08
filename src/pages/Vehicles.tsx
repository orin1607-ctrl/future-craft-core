import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Car, Search, Plus, Download, Upload } from 'lucide-react';
import { logVehicleEvent } from '@/lib/vehicleEventLog';
import { exportToCsv } from '@/utils/exportCsv';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter, applyCompanyScope } from '@/hooks/useCompanyFilter';
import { toast } from 'sonner';
import CallCustomerButton from '@/components/voice/CallCustomerButton';
import VehicleHub from '@/components/vehicles/VehicleHub';
import { VehicleDaliaFlow, VehicleForm } from '@/pages/VehicleDaliaFlow';

export { VehicleForm };

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

interface DriverRow { id: string; full_name: string; phone: string | null; }

type ViewMode = 'list' | 'detail' | 'form';

export default function Vehicles() {
  const { user } = useAuth();
  const companyFilter = useCompanyFilter();
  const [searchParams, setSearchParams] = useSearchParams();
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

  useEffect(() => {
    const vid = searchParams.get('vehicleId');
    const view = searchParams.get('view');
    if (!vid || view !== 'hub' || loading) return;
    const found = vehicles.find((v) => v.id === vid);
    if (found) {
      setSelectedVehicle(found);
      setViewMode('detail');
    }
  }, [searchParams, vehicles, loading]);

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
    const next = new URLSearchParams(searchParams);
    next.set('vehicleId', v.id);
    next.set('view', 'hub');
    setSearchParams(next, { replace: true });
  };

  const handleBack = () => {
    setViewMode('list');
    setSelectedVehicle(null);
    setEditVehicle(null);
    const next = new URLSearchParams(searchParams);
    next.delete('vehicleId');
    next.delete('view');
    setSearchParams(next, { replace: true });
  };

  const handleFormDone = async (savedVehicleId?: string) => {
    if (savedVehicleId) {
      const { data, error } = await supabase.from('vehicles').select('*').eq('id', savedVehicleId).single();
      await loadData();
      if (data) {
        setEditVehicle(null);
        setSelectedVehicle(data as VehicleRow);
        setViewMode('detail');
        toast.success('הרכב נפתח בכרטיס החדש');
        return;
      }
      toast.error(
        error?.message
          ? `הרכב נשמר אך לא ניתן לפתוח את הכרטיס: ${error.message}`
          : 'הרכב נשמר אך לא ניתן לפתוח את הכרטיס — נסה לרענן את הרשימה',
      );
      return;
    }
    await loadData();
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
    return (
      <VehicleDaliaFlow
        vehicle={editVehicle}
        onDone={handleFormDone}
        onBack={handleBack}
        user={user}
      />
    );
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
                    <span className="text-sm text-muted-foreground">{(v.odometer || 0).toLocaleString()} ק&quot;מ</span>
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
