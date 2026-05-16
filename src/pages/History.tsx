import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { History as HistoryIcon, Wrench, AlertTriangle, Car, FileText, RefreshCw, Filter, Search, ExternalLink, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter, applyCompanyScope } from '@/hooks/useCompanyFilter';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

type EventType = 'fault' | 'defect' | 'accident' | 'handover' | 'service' | 'supplier_order' | 'expense' | 'document' | 'inspection' | 'alert';

interface HistoryEvent {
  id: string;
  type: EventType;
  date: string;
  title: string;
  description: string;
  vehiclePlate: string;
  driverName: string;
  status: string;
  meta?: string;
}

const typeConfig: Record<EventType, { label: string; icon: typeof Wrench; colorCls: string }> = {
  fault: { label: 'תקלה', icon: Wrench, colorCls: 'bg-warning/10 text-warning' },
  defect: { label: 'ליקוי', icon: AlertTriangle, colorCls: 'bg-warning/10 text-warning' },
  accident: { label: 'תאונה', icon: AlertTriangle, colorCls: 'bg-destructive/10 text-destructive' },
  handover: { label: 'החלפת רכב', icon: RefreshCw, colorCls: 'bg-info/10 text-info' },
  service: { label: 'שירותים ותחזוקה', icon: Car, colorCls: 'bg-primary/10 text-primary' },
  supplier_order: { label: 'הזמנת ספק', icon: Wrench, colorCls: 'bg-primary/10 text-primary' },
  expense: { label: 'הוצאה', icon: FileText, colorCls: 'bg-accent/10 text-accent-foreground' },
  document: { label: 'מסמך', icon: FileText, colorCls: 'bg-muted text-foreground' },
  inspection: { label: 'ביקורת רכב', icon: Car, colorCls: 'bg-info/10 text-info' },
  alert: { label: 'התראה', icon: AlertTriangle, colorCls: 'bg-warning/10 text-warning' },
};

export default function HistoryPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const companyFilter = useCompanyFilter();
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<EventType | ''>('');
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importVehicleId, setImportVehicleId] = useState('');
  const [importing, setImporting] = useState(false);
  const [vehicles, setVehicles] = useState<Array<{ id: string; license_plate: string; internal_number: string; company_name: string }>>([]);

  useEffect(() => {
    loadHistory();
    loadVehicles();
  }, []);

  const loadVehicles = async () => {
    const { data } = await applyCompanyScope(supabase.from('vehicles').select('id, license_plate, internal_number, company_name'), companyFilter).order('license_plate');
    if (data) setVehicles(data as any);
  };

  const handleImport = async () => {
    if (!importFile || !importVehicleId) { toast.error('בחר רכב וקובץ'); return; }
    const vehicle = vehicles.find(v => v.id === importVehicleId);
    if (!vehicle) { toast.error('רכב לא נמצא'); return; }
    setImporting(true);
    try {
      const buf = await importFile.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (rows.length === 0) { toast.error('הקובץ ריק'); setImporting(false); return; }

      const pick = (row: any, keys: string[]) => {
        for (const k of keys) {
          for (const rk of Object.keys(row)) {
            if (rk.toString().toLowerCase().trim() === k.toLowerCase()) return row[rk];
          }
        }
        return '';
      };

      const records = rows.map(r => {
        const dateRaw = pick(r, ['תאריך', 'date', 'Date']);
        let dateIso = new Date().toISOString();
        if (dateRaw instanceof Date) dateIso = dateRaw.toISOString();
        else if (dateRaw) {
          const d = new Date(dateRaw);
          if (!isNaN(d.getTime())) dateIso = d.toISOString();
        }
        return {
          service_category: String(pick(r, ['קטגוריה', 'category', 'סוג']) || 'שירות'),
          description: String(pick(r, ['תיאור', 'description', 'פירוט']) || ''),
          vendor_name: String(pick(r, ['ספק', 'vendor', 'מוסך']) || ''),
          notes: String(pick(r, ['הערות', 'notes', 'amount', 'סכום']) || ''),
          service_date: dateIso.slice(0, 10),
          date_time: dateIso,
          vehicle_plate: vehicle.license_plate,
          vehicle_id: vehicle.id,
          company_name: vehicle.company_name,
          treatment_status: 'completed',
          imported: true,
          imported_source: importFile.name,
          imported_at: new Date().toISOString(),
          created_by: user?.id,
        } as any;
      });

      const { error } = await (supabase.from('service_orders') as any).insert(records);
      if (error) { toast.error('שגיאה בייבוא: ' + error.message); }
      else {
        toast.success(`יובאו ${records.length} רשומות`);
        setImportOpen(false); setImportFile(null); setImportVehicleId('');
        loadHistory();
      }
    } catch (e: any) {
      toast.error('שגיאה בקריאת הקובץ');
    } finally {
      setImporting(false);
    }
  };


  const loadHistory = async () => {
    setLoading(true);

    const [faultsRes, accidentsRes, handoversRes, servicesRes, expensesRes, tasksRes, inspectionsRes, referralsRes, alertsRes, docsRes] = await Promise.all([
      applyCompanyScope(supabase.from('faults').select('*'), companyFilter).order('created_at', { ascending: false }),
      applyCompanyScope(supabase.from('accidents').select('*'), companyFilter).order('created_at', { ascending: false }),
      applyCompanyScope(supabase.from('vehicle_handovers').select('*'), companyFilter).order('created_at', { ascending: false }),
      applyCompanyScope(supabase.from('service_orders').select('*'), companyFilter).order('created_at', { ascending: false }),
      applyCompanyScope(supabase.from('expenses').select('*'), companyFilter).order('created_at', { ascending: false }),
      applyCompanyScope(supabase.from('vehicle_tasks').select('*'), companyFilter).order('created_at', { ascending: false }),
      applyCompanyScope(supabase.from('vehicle_inspections').select('*'), companyFilter).order('created_at', { ascending: false }),
      applyCompanyScope(supabase.from('fault_referrals').select('*, faults:fault_id(vehicle_plate), service_order:service_order_id(vehicle_plate)') as any, companyFilter).order('created_at', { ascending: false }),
      applyCompanyScope(supabase.from('custom_alerts').select('*'), companyFilter).order('created_at', { ascending: false }),
      applyCompanyScope(supabase.from('document_metadata').select('*'), companyFilter).order('created_at', { ascending: false }),
    ]);

    const all: HistoryEvent[] = [];

    (faultsRes.data || []).forEach((f: any) => all.push({
      id: f.id, type: 'fault', date: f.date || f.created_at,
      title: f.fault_type || 'תקלה', description: f.description || '',
      vehiclePlate: f.vehicle_plate || '', driverName: f.driver_name || '',
      status: f.status || 'new', meta: f.urgency,
    }));

    (accidentsRes.data || []).forEach((a: any) => all.push({
      id: a.id, type: 'accident', date: a.date || a.created_at,
      title: 'תאונה', description: a.description || '',
      vehiclePlate: a.vehicle_plate || '', driverName: a.driver_name || '',
      status: a.status || 'open', meta: a.location,
    }));

    (handoversRes.data || []).forEach((h: any) => all.push({
      id: h.id, type: 'handover', date: h.date_time || h.created_at,
      title: h.action_type === 'return' ? 'החזרת רכב' : 'איסוף רכב',
      description: `${h.giving_driver_name || ''} → ${h.receiving_driver_name || ''}`,
      vehiclePlate: h.vehicle_plate || '', driverName: h.giving_driver_name || '',
      status: '', meta: h.location_name,
    }));

    (servicesRes.data || []).forEach((s: any) => all.push({
      id: s.id, type: 'service', date: s.date_time || s.created_at,
      title: s.service_category || 'שירות', description: s.description || '',
      vehiclePlate: s.vehicle_plate || '', driverName: s.driver_name || '',
      status: s.treatment_status || 'new', meta: s.vendor_name,
    }));

    (expensesRes.data || []).forEach((e: any) => all.push({
      id: e.id, type: 'expense', date: e.date || e.created_at,
      title: e.category || 'הוצאה', description: `₪${(e.amount || 0).toLocaleString()} - ${e.vendor || ''}`,
      vehiclePlate: e.vehicle_plate || '', driverName: e.driver_name || '',
      status: '', meta: e.invoice_number,
    }));

    (tasksRes.data || []).forEach((t: any) => all.push({
      id: t.id, type: 'defect', date: t.created_at,
      title: t.title || 'ליקוי', description: t.description || '',
      vehiclePlate: t.vehicle_plate || '', driverName: '',
      status: t.status || 'open', meta: t.resolved_by_name,
    }));

    (inspectionsRes.data || []).forEach((i: any) => all.push({
      id: i.id, type: 'inspection', date: i.inspection_date || i.created_at,
      title: i.inspection_type === 'pre_trip' ? 'בדיקה לפני נסיעה' : 'ביקורת תקופתית',
      description: i.notes || '',
      vehiclePlate: i.vehicle_plate || '', driverName: i.inspector_name || '',
      status: i.overall_status || '', meta: '',
    }));

    (referralsRes.data || []).forEach((r: any) => all.push({
      id: r.id, type: 'supplier_order', date: r.created_at,
      title: `הזמנת עבודה - ${r.provider_name || ''}`,
      description: r.notes || '',
      vehiclePlate: r.faults?.vehicle_plate || r.service_order?.vehicle_plate || '',
      driverName: r.requested_by_name || '',
      status: r.status || 'pending_approval', meta: r.provider_type,
    }));

    (alertsRes.data || []).forEach((a: any) => all.push({
      id: a.id, type: 'alert', date: a.alert_date || a.created_at,
      title: a.title || 'התראה', description: a.description || '',
      vehiclePlate: '', driverName: '',
      status: a.is_active ? 'active' : '', meta: a.alert_type,
    }));

    (docsRes.data || []).forEach((d: any) => all.push({
      id: d.id, type: 'document', date: d.created_at,
      title: d.original_name || d.category || 'מסמך',
      description: d.category || '',
      vehiclePlate: d.vehicle_plate || '', driverName: d.driver_name || '',
      status: '', meta: '',
    }));

    all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setEvents(all);
    setLoading(false);
  };

  const filtered = events.filter(e => {
    const matchType = !filterType || e.type === filterType;
    const matchSearch = !search || e.title.includes(search) || e.description.includes(search) || e.vehiclePlate.includes(search) || e.driverName.includes(search);
    return matchType && matchSearch;
  });

  // Group by date
  const grouped: Record<string, HistoryEvent[]> = {};
  filtered.forEach(e => {
    const day = new Date(e.date).toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' });
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(e);
  });

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <h1 className="page-header flex items-center gap-3 mb-0">
          <HistoryIcon size={28} />
          היסטוריה
        </h1>
        <button onClick={() => setImportOpen(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 text-primary font-bold text-sm">
          <Upload size={16} /> ייבוא Excel
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..."
          className="w-full pr-12 p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none" />
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        <button onClick={() => setFilterType('')}
          className={`px-4 py-2.5 rounded-xl text-base font-medium whitespace-nowrap transition-colors ${!filterType ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
          הכל ({events.length})
        </button>
        {(Object.entries(typeConfig) as [EventType, typeof typeConfig.fault][]).map(([key, cfg]) => {
          const count = events.filter(e => e.type === key).length;
          return (
            <button key={key} onClick={() => setFilterType(filterType === key ? '' : key)}
              className={`px-4 py-2.5 rounded-xl text-base font-medium whitespace-nowrap transition-colors ${filterType === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              {cfg.label} ({count})
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          <RefreshCw size={32} className="mx-auto mb-4 animate-spin" />
          <p className="text-lg">טוען היסטוריה...</p>
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <HistoryIcon size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-xl">אין אירועים</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([day, dayEvents]) => (
            <div key={day}>
              <h2 className="text-sm font-bold text-muted-foreground mb-3 sticky top-0 bg-background py-1 z-10">{day}</h2>
              <div className="space-y-3 relative before:absolute before:right-[27px] before:top-0 before:bottom-0 before:w-0.5 before:bg-border">
                {dayEvents.map(ev => {
                  const cfg = typeConfig[ev.type];
                  const Icon = cfg.icon;
                  return (
                    <button key={ev.id} onClick={() => {
                      const routes: Record<EventType, string> = {
                        fault: '/faults', accident: '/accidents', handover: '/vehicle-handover',
                        service: '/service-orders', expense: '/expenses',
                        defect: '/vehicle-tasks', inspection: '/vehicle-inspections',
                        supplier_order: '/service-orders', alert: '/alerts', document: '/documents',
                      };
                      navigate(routes[ev.type]);
                    }} className="card-elevated mr-6 relative w-full text-right hover:shadow-lg hover:border-primary/30 transition-all cursor-pointer">
                      {/* Timeline dot */}
                      <div className={`absolute -right-[33px] top-4 w-10 h-10 rounded-full flex items-center justify-center ${cfg.colorCls} border-2 border-background`}>
                        <Icon size={18} />
                      </div>
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${cfg.colorCls}`}>{cfg.label}</span>
                          <p className="text-lg font-bold">{ev.title}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground whitespace-nowrap">
                            {new Date(ev.date).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <ExternalLink size={14} className="text-primary opacity-60" />
                        </div>
                      </div>
                      {ev.description && <p className="text-muted-foreground">{ev.description}</p>}
                      <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                        {ev.vehiclePlate && <span>🚗 {ev.vehiclePlate}</span>}
                        {ev.driverName && <span>👤 {ev.driverName}</span>}
                        {ev.meta && <span>📌 {ev.meta}</span>}
                        {ev.status && <span className="status-badge status-active text-xs">{ev.status}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle>ייבוא היסטוריית טיפולים מ-Excel</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              עמודות מזוהות: תאריך, קטגוריה, תיאור, ספק, הערות.
              הרשומות יישמרו תחת "שירותים ותחזוקה" וישויכו לרכב הנבחר.
            </p>
            <div>
              <label className="text-sm font-bold mb-1 block">בחר רכב</label>
              <select value={importVehicleId} onChange={e => setImportVehicleId(e.target.value)}
                className="w-full p-3 rounded-xl border-2 border-input bg-background">
                <option value="">-- בחר --</option>
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.license_plate} {v.internal_number ? `(${v.internal_number})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-bold mb-1 block">קובץ Excel / CSV</label>
              <input type="file" accept=".xlsx,.xls,.csv"
                onChange={e => setImportFile(e.target.files?.[0] || null)}
                className="w-full p-2 rounded-xl border-2 border-input bg-background text-sm" />
            </div>
            <button onClick={handleImport} disabled={importing || !importFile || !importVehicleId}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50">
              {importing ? 'מייבא...' : 'ייבא'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
