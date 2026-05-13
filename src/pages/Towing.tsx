import { useState, useEffect } from 'react';
import { Truck, Search, CheckCircle, Clock, MapPin, Phone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter, applyCompanyScope } from '@/hooks/useCompanyFilter';
import { toast } from 'sonner';

interface TowingItem {
  id: string;
  source: 'fault' | 'service_order';
  vehicle_plate: string;
  driver_name: string;
  description: string;
  date: string;
  status: string;
  towing_approved: boolean;
  towing_completed: boolean;
  towing_address?: string;
  towing_contact?: string;
  company_name: string;
}

export default function Towing() {
  const { user } = useAuth();
  const companyFilter = useCompanyFilter();
  const [items, setItems] = useState<TowingItem[]>([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'completed'>('all');
  const [loading, setLoading] = useState(true);

  const isManager = user?.role === 'fleet_manager' || user?.role === 'super_admin';

  const loadData = async () => {
    setLoading(true);
    const [faultsRes, ordersRes] = await Promise.all([
      applyCompanyScope(
        supabase.from('faults').select('*').eq('towing_required', true),
        companyFilter
      ).order('created_at', { ascending: false }),
      applyCompanyScope(
        supabase.from('service_orders').select('*').eq('towing_requested', true),
        companyFilter
      ).order('created_at', { ascending: false }),
    ]);

    const all: TowingItem[] = [];

    (faultsRes.data || []).forEach((f: any) => all.push({
      id: f.id,
      source: 'fault',
      vehicle_plate: f.vehicle_plate || '',
      driver_name: f.driver_name || '',
      description: f.description || '',
      date: f.date || f.created_at,
      status: f.status || 'new',
      towing_approved: f.towing_approved || false,
      towing_completed: f.towing_completed || false,
      company_name: f.company_name || '',
    }));

    (ordersRes.data || []).forEach((s: any) => all.push({
      id: s.id,
      source: 'service_order',
      vehicle_plate: s.vehicle_plate || '',
      driver_name: s.driver_name || '',
      description: s.description || '',
      date: s.date_time || s.created_at,
      status: s.treatment_status || 'new',
      towing_approved: true, // service orders are pre-approved
      towing_completed: false,
      towing_address: s.towing_address || '',
      towing_contact: s.towing_contact || '',
      company_name: s.company_name || '',
    }));

    all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setItems(all);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [companyFilter]);

  const handleApproveTowing = async (item: TowingItem) => {
    if (item.source === 'fault') {
      const { error } = await supabase.from('faults').update({
        towing_approved: true,
        towing_approved_by: user?.full_name || '',
        towing_approved_at: new Date().toISOString(),
      }).eq('id', item.id);
      if (error) toast.error('שגיאה');
      else { toast.success('שינוע אושר'); loadData(); }
    }
  };

  const handleCompleteTowing = async (item: TowingItem) => {
    if (item.source === 'fault') {
      const { error } = await supabase.from('faults').update({
        towing_completed: true,
        towing_completed_at: new Date().toISOString(),
      }).eq('id', item.id);
      if (error) toast.error('שגיאה');
      else { toast.success('שינוע הושלם'); loadData(); }
    }
  };

  const filtered = items.filter(i => {
    const matchSearch = !search || i.vehicle_plate?.includes(search) || i.driver_name?.includes(search) || i.description?.includes(search);
    let matchStatus = true;
    if (filterStatus === 'pending') matchStatus = !i.towing_approved;
    if (filterStatus === 'approved') matchStatus = i.towing_approved && !i.towing_completed;
    if (filterStatus === 'completed') matchStatus = i.towing_completed;
    return matchSearch && matchStatus;
  });

  const pendingCount = items.filter(i => !i.towing_approved).length;
  const approvedCount = items.filter(i => i.towing_approved && !i.towing_completed).length;
  const completedCount = items.filter(i => i.towing_completed).length;

  return (
    <div className="animate-fade-in">
      <h1 className="page-header flex items-center gap-3"><Truck size={28} /> שינועים</h1>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="card-elevated text-center">
          <Clock size={20} className="mx-auto mb-1 text-warning" />
          <p className="text-2xl font-black">{pendingCount}</p>
          <p className="text-xs text-muted-foreground">ממתין לאישור</p>
        </div>
        <div className="card-elevated text-center">
          <Truck size={20} className="mx-auto mb-1 text-primary" />
          <p className="text-2xl font-black">{approvedCount}</p>
          <p className="text-xs text-muted-foreground">מאושר</p>
        </div>
        <div className="card-elevated text-center">
          <CheckCircle size={20} className="mx-auto mb-1 text-accent-foreground" />
          <p className="text-2xl font-black">{completedCount}</p>
          <p className="text-xs text-muted-foreground">הושלם</p>
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..."
          className="w-full pr-12 p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none" />
      </div>

      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {[
          { key: 'all' as const, label: `הכל (${items.length})` },
          { key: 'pending' as const, label: `ממתין (${pendingCount})` },
          { key: 'approved' as const, label: `מאושר (${approvedCount})` },
          { key: 'completed' as const, label: `הושלם (${completedCount})` },
        ].map(f => (
          <button key={f.key} onClick={() => setFilterStatus(f.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${filterStatus === f.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Truck size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-xl">אין בקשות שינוע</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => (
            <div key={`${item.source}-${item.id}`} className="card-elevated">
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                  item.towing_completed ? 'bg-accent/10' : item.towing_approved ? 'bg-primary/10' : 'bg-warning/10'
                }`}>
                  {item.towing_completed ? (
                    <CheckCircle size={24} className="text-accent-foreground" />
                  ) : item.towing_approved ? (
                    <Truck size={24} className="text-primary" />
                  ) : (
                    <Clock size={24} className="text-warning" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-lg font-bold">{item.vehicle_plate}</p>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-lg ${item.source === 'fault' ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary'}`}>
                        {item.source === 'fault' ? 'תקלה' : 'שירותים ותחזוקה'}
                      </span>
                      <span className={`status-badge ${
                        item.towing_completed ? 'status-active' : item.towing_approved ? 'status-pending' : 'status-urgent'
                      }`}>
                        {item.towing_completed ? 'הושלם' : item.towing_approved ? 'מאושר' : 'ממתין'}
                      </span>
                    </div>
                  </div>
                  <p className="text-muted-foreground line-clamp-1">{item.description}</p>
                  <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                    <span>👤 {item.driver_name}</span>
                    <span>📅 {new Date(item.date).toLocaleDateString('he-IL')}</span>
                    {item.towing_address && <span className="flex items-center gap-1"><MapPin size={12} /> {item.towing_address}</span>}
                    {item.towing_contact && <span className="flex items-center gap-1"><Phone size={12} /> {item.towing_contact}</span>}
                  </div>

                  {isManager && !item.towing_completed && (
                    <div className="flex gap-2 mt-3">
                      {!item.towing_approved && (
                        <button onClick={() => handleApproveTowing(item)}
                          className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold">
                          ✅ אשר שינוע
                        </button>
                      )}
                      {item.towing_approved && !item.towing_completed && (
                        <button onClick={() => handleCompleteTowing(item)}
                          className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold">
                          🏁 סמן כהושלם
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
