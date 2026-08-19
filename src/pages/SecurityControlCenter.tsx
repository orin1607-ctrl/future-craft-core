import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { Shield, RefreshCw, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  formatActiveMs,
  IDENTITY_HE,
  OUTCOME_HE,
  ROLE_HE,
  SEVERITY_HE,
  SOURCE_HE,
} from '@/lib/securityAuditLabels';

type EventRow = {
  id: string;
  occurred_at: string;
  source: string;
  event_type: string;
  actor_email: string | null;
  actor_role: string | null;
  company_name: string | null;
  identity_status: string;
  outcome: string;
  action_label: string;
  result_label: string;
  active_ms: number | null;
  ip_address: string | null;
  device_summary: string | null;
  severity: string;
  source_ref: string | null;
  details: Record<string, unknown>;
};

type Summary = {
  active_now: number;
  logins_today: number;
  unique_users_today: number;
  failed_logins_today: number;
  unidentified_today: number;
  security_alerts_open: number;
  github_today: number;
  supabase_today: number;
  vps_today: number;
};

const EMPTY_SUMMARY: Summary = {
  active_now: 0,
  logins_today: 0,
  unique_users_today: 0,
  failed_logins_today: 0,
  unidentified_today: 0,
  security_alerts_open: 0,
  github_today: 0,
  supabase_today: 0,
  vps_today: 0,
};

export default function SecurityControlCenter() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const [rows, setRows] = useState<EventRow[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<EventRow | null>(null);
  const [search, setSearch] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterOutcome, setFilterOutcome] = useState('');
  const [filterIdentity, setFilterIdentity] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterUser, setFilterUser] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data: sum } = await supabase.rpc('security_dashboard_summary' as never);
    if (sum && typeof sum === 'object') setSummary({ ...EMPTY_SUMMARY, ...(sum as Summary) });
    const { data } = await supabase
      .from('security_audit_events' as 'profiles')
      .select('*')
      .order('occurred_at' as never, { ascending: false })
      .limit(400);
    setRows((data || []) as unknown as EventRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    load();
  }, [isSuperAdmin, load]);

  const refreshExternal = async () => {
    setRefreshing(true);
    const { data: { session } } = await supabase.auth.getSession();
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/security-collect-sources`;
    await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session?.access_token || ''}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }).catch(() => undefined);
    await load();
    setRefreshing(false);
  };

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filterSource && r.source !== filterSource) return false;
      if (filterRole && r.actor_role !== filterRole) return false;
      if (filterOutcome && r.outcome !== filterOutcome) return false;
      if (filterIdentity && r.identity_status !== filterIdentity) return false;
      if (filterSeverity && r.severity !== filterSeverity) return false;
      if (filterDate && !r.occurred_at.startsWith(filterDate)) return false;
      if (filterCompany && (r.company_name || '') !== filterCompany) return false;
      if (filterUser && !(r.actor_email || '').includes(filterUser)) return false;
      if (search) {
        const blob = `${r.actor_email} ${r.action_label} ${r.event_type} ${r.ip_address} ${r.company_name}`.toLowerCase();
        if (!blob.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, filterSource, filterRole, filterOutcome, filterIdentity, filterSeverity, filterDate, filterCompany, filterUser, search]);

  const companies = [...new Set(rows.map((r) => r.company_name).filter(Boolean))] as string[];

  if (!isSuperAdmin) {
    return (
      <div className="animate-fade-in text-center py-16">
        <Shield size={48} className="mx-auto mb-4 text-muted-foreground opacity-50" />
        <p className="text-xl text-muted-foreground">אין לך הרשאה לצפות במרכז הבקרה ואבטחה</p>
      </div>
    );
  }

  const cards: { label: string; value: number }[] = [
    { label: 'משתמשים פעילים עכשיו', value: summary.active_now },
    { label: 'כניסות היום', value: summary.logins_today },
    { label: 'משתמשים ייחודיים היום', value: summary.unique_users_today },
    { label: 'כניסות שנכשלו', value: summary.failed_logins_today },
    { label: 'לא מזוהים היום', value: summary.unidentified_today },
    { label: 'התראות אבטחה', value: summary.security_alerts_open },
    { label: 'פעילות GitHub', value: summary.github_today },
    { label: 'פעילות Supabase', value: summary.supabase_today },
    { label: 'פעילות Hostinger/VPS', value: summary.vps_today },
  ];

  return (
    <div className="animate-fade-in space-y-4" dir="rtl">
      <Link to="/admin-home" className="text-primary text-sm font-medium inline-block">← חזרה למרכז ניהול</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-header flex items-center gap-3 mb-0">
          <Shield size={28} className="text-primary" />
          מרכז בקרה ואבטחה
        </h1>
        <button
          type="button"
          onClick={refreshExternal}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-xl border-2 border-input bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          רענון מקורות חיצוניים
        </button>
      </div>
      <p className="text-sm text-muted-foreground">
        יומן גישה בלבד. זמן פעילות נמדד לפי פעילות אמיתית (heartbeat), לא לפי דפדפן פתוח.
        אם זהות לא סופקה על ידי המקור — מוצג «זהות לא זמינה».
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="card-elevated p-3">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="text-2xl font-bold mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש..."
            className="w-full pr-9 p-2.5 rounded-xl border-2 border-input bg-background text-sm" />
        </div>
        <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)}
          className="p-2.5 rounded-xl border-2 border-input bg-background text-sm" />
        <input value={filterUser} onChange={(e) => setFilterUser(e.target.value)} placeholder="משתמש (אימייל)"
          className="p-2.5 rounded-xl border-2 border-input bg-background text-sm w-40" />
        <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} className="p-2.5 rounded-xl border-2 border-input bg-background text-sm">
          <option value="">כל החברות</option>
          {companies.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className="p-2.5 rounded-xl border-2 border-input bg-background text-sm">
          <option value="">כל סוגי המשתמש</option>
          {Object.entries(ROLE_HE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="p-2.5 rounded-xl border-2 border-input bg-background text-sm">
          <option value="">כל המקורות</option>
          {Object.entries(SOURCE_HE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterOutcome} onChange={(e) => setFilterOutcome(e.target.value)} className="p-2.5 rounded-xl border-2 border-input bg-background text-sm">
          <option value="">הצלחה / כישלון</option>
          <option value="success">הצליח</option>
          <option value="failure">נכשל</option>
        </select>
        <select value={filterIdentity} onChange={(e) => setFilterIdentity(e.target.value)} className="p-2.5 rounded-xl border-2 border-input bg-background text-sm">
          <option value="">מזוהה / לא</option>
          <option value="identified">מזוהה</option>
          <option value="unidentified">לא מזוהה</option>
          <option value="identity_unavailable">זהות לא זמינה</option>
        </select>
        <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)} className="p-2.5 rounded-xl border-2 border-input bg-background text-sm">
          <option value="">רמת חומרה</option>
          {Object.entries(SEVERITY_HE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <p className="text-sm text-muted-foreground">{filtered.length} אירועים</p>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" /></div>
      ) : (
        <div className="overflow-x-auto card-elevated p-0">
          <table className="w-full text-sm text-right">
            <thead className="bg-muted/50">
              <tr>
                {['תאריך ושעה', 'מקור', 'משתמש', 'סוג משתמש', 'חברה', 'זיהוי', 'פעולה', 'תוצאה', 'זמן פעילות', 'IP', 'מכשיר', 'רמת אירוע'].map((h) => (
                  <th key={h} className="p-2 font-bold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => setSelected(r)}>
                  <td className="p-2 whitespace-nowrap">{format(new Date(r.occurred_at), 'dd/MM/yyyy HH:mm', { locale: he })}</td>
                  <td className="p-2">{SOURCE_HE[r.source] || r.source}</td>
                  <td className="p-2">{r.actor_email || (r.identity_status === 'identity_unavailable' ? 'זהות לא זמינה' : 'לא מזוהה')}</td>
                  <td className="p-2">{ROLE_HE[r.actor_role || ''] || r.actor_role || '—'}</td>
                  <td className="p-2">{r.company_name || '—'}</td>
                  <td className="p-2">{IDENTITY_HE[r.identity_status] || r.identity_status}</td>
                  <td className="p-2">{r.action_label || r.event_type}</td>
                  <td className="p-2">{r.result_label || OUTCOME_HE[r.outcome] || r.outcome}</td>
                  <td className="p-2">{formatActiveMs(r.active_ms)}</td>
                  <td className="p-2 font-mono text-xs">{r.ip_address || '—'}</td>
                  <td className="p-2">{r.device_summary || '—'}</td>
                  <td className="p-2">{SEVERITY_HE[r.severity] || r.severity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-background rounded-2xl max-w-lg w-full p-5 space-y-2 shadow-xl" onClick={(e) => e.stopPropagation()} dir="rtl">
            <h2 className="text-lg font-bold">פרטי אירוע</h2>
            <p className="text-sm"><b>מזהה:</b> {selected.id}</p>
            <p className="text-sm"><b>סוג:</b> {selected.event_type}</p>
            <p className="text-sm"><b>ייחוס:</b> {selected.source_ref || '—'}</p>
            <pre className="text-xs bg-muted rounded-xl p-3 overflow-auto max-h-48">{JSON.stringify(selected.details || {}, null, 2)}</pre>
            <button type="button" className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm" onClick={() => setSelected(null)}>סגור</button>
          </div>
        </div>
      )}
    </div>
  );
}
