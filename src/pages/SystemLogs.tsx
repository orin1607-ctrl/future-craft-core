import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { FileText, Search, Building2, Car } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

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
  work_assignment: 'סידור עבודה', service_order: 'שירותים ותחזוקה',
  approval_request: 'בקשת אישור', handover: 'חילופי רכב',
};

export default function SystemLogs() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterEntity, setFilterEntity] = useState('');
  const [companies, setCompanies] = useState<string[]>([]);

  const isSuperAdmin = user?.role === 'super_admin';

  useEffect(() => {
    if (!isSuperAdmin) return;
    loadLogs();
    supabase.from('profiles').select('company_name').then(({ data }) => {
      if (data) setCompanies([...new Set(data.map(d => d.company_name).filter(Boolean) as string[])]);
    });
  }, [isSuperAdmin]);

  const loadLogs = async () => {
    setLoading(true);
    let query = supabase.from('system_logs').select('*').order('created_at', { ascending: false }).limit(500);
    const { data } = await query;
    if (data) setLogs(data as LogEntry[]);
    setLoading(false);
  };

  if (!isSuperAdmin) {
    return (
      <div className="animate-fade-in text-center py-16">
        <FileText size={48} className="mx-auto mb-4 text-muted-foreground opacity-50" />
        <p className="text-xl text-muted-foreground">אין לך הרשאה לצפות בלוג המערכת</p>
      </div>
    );
  }

  const filtered = logs.filter(l => {
    if (search && !l.user_name.includes(search) && !l.details.includes(search) && !l.vehicle_plate.includes(search) && !l.entity_id.includes(search)) return false;
    if (filterCompany && l.company_name !== filterCompany) return false;
    if (filterDate && !l.created_at.startsWith(filterDate)) return false;
    if (filterEntity && l.entity_type !== filterEntity) return false;
    return true;
  });

  return (
    <div className="animate-fade-in space-y-4">
      <h1 className="page-header flex items-center gap-3"><FileText size={28} /> לוג מערכת</h1>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..."
            className="w-full pr-10 p-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none" />
        </div>
        <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}
          className="p-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none">
          <option value="">כל החברות</option>
          {companies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterEntity} onChange={e => setFilterEntity(e.target.value)}
          className="p-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none">
          <option value="">כל הסוגים</option>
          {Object.entries(ENTITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
          className="p-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none" />
      </div>

      <p className="text-sm text-muted-foreground">{filtered.length} רשומות</p>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="card-elevated text-center py-12 text-muted-foreground">אין רשומות בלוג</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(l => (
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
    </div>
  );
}
