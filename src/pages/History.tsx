import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { History as HistoryIcon, Wrench, AlertTriangle, Car, FileText, RefreshCw, Filter, Search, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompanyFilter, applyCompanyScope } from '@/hooks/useCompanyFilter';

type EventType = 'fault' | 'accident' | 'handover' | 'service' | 'expense';

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
  accident: { label: 'תאונה', icon: AlertTriangle, colorCls: 'bg-destructive/10 text-destructive' },
  handover: { label: 'החלפת רכב', icon: RefreshCw, colorCls: 'bg-info/10 text-info' },
  service: { label: 'שירותים ותחזוקה', icon: Car, colorCls: 'bg-primary/10 text-primary' },
  expense: { label: 'הוצאה', icon: FileText, colorCls: 'bg-accent/10 text-accent-foreground' },
};

export default function HistoryPage() {
  const navigate = useNavigate();
  const companyFilter = useCompanyFilter();
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<EventType | ''>('');

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);

    const [faultsRes, accidentsRes, handoversRes, servicesRes, expensesRes] = await Promise.all([
      applyCompanyScope(supabase.from('faults').select('*'), companyFilter).order('created_at', { ascending: false }),
      applyCompanyScope(supabase.from('accidents').select('*'), companyFilter).order('created_at', { ascending: false }),
      applyCompanyScope(supabase.from('vehicle_handovers').select('*'), companyFilter).order('created_at', { ascending: false }),
      applyCompanyScope(supabase.from('service_orders').select('*'), companyFilter).order('created_at', { ascending: false }),
      applyCompanyScope(supabase.from('expenses').select('*'), companyFilter).order('created_at', { ascending: false }),
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
      <h1 className="page-header flex items-center gap-3">
        <HistoryIcon size={28} />
        היסטוריה
      </h1>

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
    </div>
  );
}
