import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { History, Search, Filter, Download, Building2, Car, Calendar, BarChart3, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter, applyCompanyScope } from '@/hooks/useCompanyFilter';

interface ServiceRow {
  id: string;
  service_category: string;
  description: string;
  vehicle_plate: string;
  driver_name: string;
  ordering_user: string;
  service_date: string;
  service_time: string;
  treatment_status: string;
  odometer: number;
  notes: string;
  created_at: string;
  company_name: string;
  manager_approval: string;
  reference_number: string;
  urgency: string;
  towing_requested: boolean;
  vendor_name: string;
}

const STATUS_CONFIG: Record<string, { text: string; cls: string }> = {
  pending_approval: { text: 'ממתין לאישור', cls: 'status-pending' },
  approved: { text: 'אושר', cls: 'status-active' },
  new: { text: 'חדש', cls: 'status-new' },
  in_progress: { text: 'בטיפול', cls: 'status-pending' },
  completed: { text: 'הושלם', cls: 'status-active' },
  rejected: { text: 'נדחה', cls: 'status-inactive' },
  cancelled: { text: 'בוטל', cls: 'status-inactive' },
};

const URGENCY_LABELS: Record<string, string> = { normal: 'רגיל', urgent: 'דחוף' };

export default function ServiceOrderHistory() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const companyFilter = useCompanyFilter();
  const [orders, setOrders] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterVehicle, setFilterVehicle] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'monthly'>('list');

  const isManager = user?.role === 'fleet_manager' || user?.role === 'super_admin';

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await applyCompanyScope(
        supabase.from('service_orders').select('*').order('created_at', { ascending: false }),
        companyFilter
      );
      if (data) setOrders(data as unknown as ServiceRow[]);
      setLoading(false);
    };
    load();
  }, [companyFilter]);

  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (search && ![o.vehicle_plate, o.service_category, o.driver_name, o.company_name, o.ordering_user, o.reference_number]
        .some(f => f?.includes(search))) return false;
      if (filterCompany && !o.company_name?.includes(filterCompany)) return false;
      if (filterVehicle && !o.vehicle_plate?.includes(filterVehicle)) return false;
      if (filterStatus && o.treatment_status !== filterStatus) return false;
      if (filterDateFrom && o.created_at < filterDateFrom) return false;
      if (filterDateTo && o.created_at > filterDateTo + 'T23:59:59') return false;
      return true;
    });
  }, [orders, search, filterCompany, filterVehicle, filterStatus, filterDateFrom, filterDateTo]);

  // Monthly report data
  const monthlyReport = useMemo(() => {
    const map = new Map<string, { total: number; completed: number; rejected: number; pending: number; towing: number; urgent: number }>();
    filtered.forEach(o => {
      const d = new Date(o.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const entry = map.get(key) || { total: 0, completed: 0, rejected: 0, pending: 0, towing: 0, urgent: 0 };
      entry.total++;
      if (o.treatment_status === 'completed') entry.completed++;
      if (o.treatment_status === 'rejected' || o.treatment_status === 'cancelled') entry.rejected++;
      if (o.treatment_status === 'pending_approval' || o.treatment_status === 'new') entry.pending++;
      if (o.towing_requested) entry.towing++;
      if (o.urgency === 'urgent') entry.urgent++;
      map.set(key, entry);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const activeFilterCount = [filterCompany, filterVehicle, filterStatus, filterDateFrom, filterDateTo].filter(Boolean).length;

  const uniqueCompanies = useMemo(() => [...new Set(orders.map(o => o.company_name).filter(Boolean))], [orders]);
  const uniqueVehicles = useMemo(() => [...new Set(orders.map(o => o.vehicle_plate).filter(Boolean))], [orders]);

  const exportCSV = () => {
    const headers = ['תאריך', 'חברה', 'רכב', 'נהג', 'סוג שירות', 'סטטוס', 'דחיפות', 'שינוע', 'ספק', 'אסמכתא'];
    const rows = filtered.map(o => [
      new Date(o.created_at).toLocaleDateString('he-IL'),
      o.company_name || '',
      o.vehicle_plate || '',
      o.driver_name || '',
      o.service_category || '',
      STATUS_CONFIG[o.treatment_status]?.text || o.treatment_status,
      URGENCY_LABELS[o.urgency] || 'רגיל',
      o.towing_requested ? 'כן' : 'לא',
      o.vendor_name || '',
      o.reference_number || '',
    ]);
    const bom = '\uFEFF';
    const csv = bom + [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `service-orders-history-${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const formatMonth = (key: string) => {
    const [y, m] = key.split('-');
    const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
    return `${months[parseInt(m) - 1]} ${y}`;
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h1 className="page-header mb-0 flex items-center gap-3"><History size={28} /> היסטוריית שירותים ותחזוקה</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/service-orders')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-muted text-foreground font-bold text-sm min-h-[44px]">
            <ArrowRight size={18} /> חזרה להזמנות
          </button>
          <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-muted text-foreground font-bold text-sm min-h-[44px]">
            <Download size={18} /> ייצוא CSV
          </button>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setViewMode('list')}
          className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-colors ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
          📋 רשימה
        </button>
        <button onClick={() => setViewMode('monthly')}
          className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-colors ${viewMode === 'monthly' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
          <span className="flex items-center justify-center gap-2"><BarChart3 size={16} /> דוח חודשי</span>
        </button>
      </div>

      {/* Search + filter toggle */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..."
            className="w-full pr-12 p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none" />
        </div>
        <button onClick={() => setShowFilters(!showFilters)}
          className={`relative flex items-center gap-1 px-4 py-3 rounded-xl border-2 font-bold transition-colors ${showFilters ? 'border-primary bg-primary/10 text-primary' : 'border-input text-foreground'}`}>
          <Filter size={20} />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">{activeFilterCount}</span>
          )}
        </button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="card-elevated mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-muted-foreground">סינון מתקדם</h3>
            {activeFilterCount > 0 && (
              <button onClick={() => { setFilterCompany(''); setFilterVehicle(''); setFilterStatus(''); setFilterDateFrom(''); setFilterDateTo(''); }}
                className="text-xs text-destructive font-bold">נקה הכל</button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {user?.role === 'super_admin' && (
              <div>
                <label className="block text-sm font-medium mb-1 flex items-center gap-1"><Building2 size={14} /> חברה</label>
                <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}
                  className="w-full p-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none">
                  <option value="">הכל</option>
                  {uniqueCompanies.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1 flex items-center gap-1"><Car size={14} /> רכב</label>
              <select value={filterVehicle} onChange={e => setFilterVehicle(e.target.value)}
                className="w-full p-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none">
                <option value="">הכל</option>
                {uniqueVehicles.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">סטטוס</label>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="w-full p-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none">
                <option value="">הכל</option>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.text}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 flex items-center gap-1"><Calendar size={14} /> מתאריך</label>
              <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                className="w-full p-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 flex items-center gap-1"><Calendar size={14} /> עד תאריך</label>
              <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                className="w-full p-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none" />
            </div>
          </div>
        </div>
      )}

      {/* Summary bar */}
      <div className="flex items-center gap-3 mb-4 text-sm text-muted-foreground">
        <span className="font-bold text-foreground">{filtered.length}</span> הזמנות נמצאו
        {activeFilterCount > 0 && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{activeFilterCount} מסננים פעילים</span>}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">טוען...</div>
      ) : viewMode === 'monthly' ? (
        /* Monthly report view */
        <div className="space-y-3">
          {monthlyReport.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">אין נתונים</div>
          ) : monthlyReport.map(([month, data]) => (
            <div key={month} className="card-elevated">
              <h3 className="text-lg font-bold mb-3">{formatMonth(month)}</h3>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                <MiniStat label="סה״כ" value={data.total} />
                <MiniStat label="הושלמו" value={data.completed} color="text-green-600 dark:text-green-400" />
                <MiniStat label="נדחו/בוטלו" value={data.rejected} color="text-destructive" />
                <MiniStat label="ממתינות" value={data.pending} color="text-amber-600 dark:text-amber-400" />
                <MiniStat label="שינוע" value={data.towing} />
                <MiniStat label="דחופות" value={data.urgent} color="text-destructive" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* List view */
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">לא נמצאו הזמנות</div>
          ) : filtered.map(o => {
            const st = STATUS_CONFIG[o.treatment_status] || STATUS_CONFIG.new;
            return (
              <div key={o.id} className="card-elevated flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold truncate">{o.service_category}</span>
                    <span className={`status-badge ${st.cls} text-xs`}>{st.text}</span>
                    {o.urgency === 'urgent' && <span className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-md font-bold">דחוף</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {o.vehicle_plate && <span className="flex items-center gap-1"><Car size={12} />{o.vehicle_plate}</span>}
                    {o.company_name && <span className="flex items-center gap-1"><Building2 size={12} />{o.company_name}</span>}
                    <span className="flex items-center gap-1"><Calendar size={12} />{new Date(o.created_at).toLocaleDateString('he-IL')}</span>
                  </div>
                </div>
                <ArrowRight size={18} className="text-muted-foreground shrink-0" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="text-center">
      <p className={`text-xl font-bold ${color || 'text-foreground'}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
