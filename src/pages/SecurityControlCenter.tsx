import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { Shield, RefreshCw, Search, AlertTriangle, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  displayAccessKind,
  displayAccount,
  displayActivityDuration,
  displayOutcome,
  displayTool,
  IDENTITY_HE,
  needsIdentityAttention,
  redactDetails,
  ROLE_HE,
  SEVERITY_HE,
  SOURCE_HE,
  shortFingerprint,
  formatActiveMs,
  type SecurityIdentityRow,
} from '@/lib/securityAuditLabels';

type EventRow = SecurityIdentityRow & {
  id: string;
  occurred_at: string;
  event_type: string;
  action_label: string;
  company_name: string | null;
  device_summary: string | null;
  severity: string;
  source_ref: string | null;
  details: Record<string, unknown>;
  actor_user_id: string | null;
};

type SessionRow = {
  id: string;
  user_id: string;
  started_at: string;
  last_activity_at: string;
  ended_at: string | null;
  accumulated_active_ms: number;
  end_reason: string | null;
  device_summary: string | null;
  is_open: boolean;
};

type AlertRow = {
  id: string;
  title: string;
  body: string;
  severity: string;
  created_at: string;
  acknowledged_at: string | null;
  event_id: string | null;
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

function when(iso: string) {
  return format(new Date(iso), 'dd/MM/yyyy HH:mm', { locale: he });
}

function detailValue(row: EventRow, key: string): string {
  const v = row.details?.[key];
  return v == null || v === '' ? '—' : String(v);
}

export default function SecurityControlCenter() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const [rows, setRows] = useState<EventRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<EventRow | null>(null);
  const [timelineKey, setTimelineKey] = useState<{ type: 'session' | 'user'; id: string } | null>(null);
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterSource, setFilterSource] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterOutcome, setFilterOutcome] = useState('');
  const [filterIdentity, setFilterIdentity] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [unidentifiedOnly, setUnidentifiedOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: sum } = await supabase.rpc('security_dashboard_summary' as never);
    if (sum && typeof sum === 'object') setSummary({ ...EMPTY_SUMMARY, ...(sum as Summary) });
    const [{ data: events }, { data: sess }, { data: inbox }] = await Promise.all([
      supabase.from('security_audit_events' as 'profiles').select('*').order('occurred_at' as never, { ascending: false }).limit(500),
      supabase.from('security_activity_sessions' as 'profiles').select('*').order('last_activity_at' as never, { ascending: false }).limit(80),
      supabase.from('security_alert_inbox' as 'profiles').select('*').order('created_at' as never, { ascending: false }).limit(40),
    ]);
    setRows((events || []) as unknown as EventRow[]);
    setSessions((sess || []) as unknown as SessionRow[]);
    setAlerts((inbox || []) as unknown as AlertRow[]);
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
      if (unidentifiedOnly && !needsIdentityAttention(r)) return false;
      if (filterSource && r.source !== filterSource) return false;
      if (filterRole && r.actor_role !== filterRole) return false;
      if (filterOutcome && r.outcome !== filterOutcome) return false;
      if (filterIdentity && r.identity_status !== filterIdentity) return false;
      if (filterSeverity && r.severity !== filterSeverity) return false;
      if (filterDate && !r.occurred_at.startsWith(filterDate)) return false;
      if (filterCompany && (r.company_name || '') !== filterCompany) return false;
      if (filterUser) {
        const blob = `${r.actor_email || ''} ${r.actor_username || ''}`.toLowerCase();
        if (!blob.includes(filterUser.toLowerCase())) return false;
      }
      if (search) {
        const blob = `${displayAccount(r)} ${r.action_label} ${r.event_type} ${r.ip_address} ${r.company_name} ${r.tool_name} ${r.actor_username}`.toLowerCase();
        if (!blob.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, filterSource, filterRole, filterOutcome, filterIdentity, filterSeverity, filterDate, filterCompany, filterUser, search, unidentifiedOnly]);

  const companies = [...new Set(rows.map((r) => r.company_name).filter(Boolean))] as string[];
  const unidentifiedCount = rows.filter(needsIdentityAttention).length;
  const openAlerts = alerts.filter((a) => !a.acknowledged_at);

  const timelineEvents = useMemo(() => {
    if (!timelineKey && !selected) return [];
    if (timelineKey?.type === 'session') {
      return rows.filter((r) => r.session_id === timelineKey.id).slice().reverse();
    }
    if (timelineKey?.type === 'user') {
      return rows.filter((r) => r.actor_user_id === timelineKey.id || r.actor_username === timelineKey.id || r.actor_email === timelineKey.id).slice().reverse();
    }
    if (!selected) return [];
    return rows.filter((r) => {
      if (selected.session_id && r.session_id === selected.session_id) return true;
      if (selected.actor_user_id && r.actor_user_id === selected.actor_user_id) return true;
      if (selected.actor_username && r.actor_username === selected.actor_username) return true;
      if (selected.actor_email && r.actor_email === selected.actor_email) return true;
      return r.id === selected.id;
    }).slice(0, 40).reverse();
  }, [rows, selected, timelineKey]);

  const relatedSession = selected?.session_id
    ? sessions.find((s) => s.id === selected.session_id)
    : null;

  if (!isSuperAdmin) {
    return (
      <div className="animate-fade-in text-center py-16">
        <Shield size={48} className="mx-auto mb-4 text-muted-foreground opacity-50" />
        <p className="text-xl text-muted-foreground">אין לך הרשאה לצפות במרכז הבקרה ואבטחה</p>
      </div>
    );
  }

  const cards: { label: string; value: number; warn?: boolean }[] = [
    { label: 'משתמשים פעילים עכשיו', value: summary.active_now },
    { label: 'כניסות היום', value: summary.logins_today },
    { label: 'משתמשים ייחודיים היום', value: summary.unique_users_today },
    { label: 'כניסות שנכשלו', value: summary.failed_logins_today },
    { label: 'גישה לא מזוהה', value: summary.unidentified_today || unidentifiedCount, warn: true },
    { label: 'התראות אבטחה', value: summary.security_alerts_open },
    { label: 'פעילות GitHub', value: summary.github_today },
    { label: 'פעילות Supabase', value: summary.supabase_today },
    { label: 'פעילות Hostinger/VPS', value: summary.vps_today },
  ];

  const filters = (
    <>
      <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)}
        className="p-2.5 rounded-xl border-2 border-input bg-background text-sm w-full md:w-auto" />
      <input value={filterUser} onChange={(e) => setFilterUser(e.target.value)} placeholder="חשבון / משתמש"
        className="p-2.5 rounded-xl border-2 border-input bg-background text-sm w-full md:w-40" />
      <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} className="p-2.5 rounded-xl border-2 border-input bg-background text-sm w-full md:w-auto">
        <option value="">כל החברות</option>
        {companies.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className="p-2.5 rounded-xl border-2 border-input bg-background text-sm w-full md:w-auto">
        <option value="">כל סוגי המשתמש</option>
        {Object.entries(ROLE_HE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="p-2.5 rounded-xl border-2 border-input bg-background text-sm w-full md:w-auto">
        <option value="">כל המקורות</option>
        {Object.entries(SOURCE_HE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <select value={filterOutcome} onChange={(e) => setFilterOutcome(e.target.value)} className="p-2.5 rounded-xl border-2 border-input bg-background text-sm w-full md:w-auto">
        <option value="">הצלחה / כישלון</option>
        <option value="success">הצליח</option>
        <option value="failure">נכשל</option>
      </select>
      <select value={filterIdentity} onChange={(e) => setFilterIdentity(e.target.value)} className="p-2.5 rounded-xl border-2 border-input bg-background text-sm w-full md:w-auto">
        <option value="">מזוהה / לא</option>
        {Object.entries(IDENTITY_HE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)} className="p-2.5 rounded-xl border-2 border-input bg-background text-sm w-full md:w-auto">
        <option value="">רמת חומרה</option>
        {Object.entries(SEVERITY_HE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </>
  );

  return (
    <div className="animate-fade-in space-y-4 max-w-full overflow-x-hidden" dir="rtl">
      <Link to="/admin-home" className="text-primary text-sm font-medium inline-block">← חזרה למרכז ניהול</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-header flex items-center gap-3 mb-0 text-xl md:text-2xl">
          <Shield size={28} className="text-primary shrink-0" />
          מרכז בקרה ואבטחה
        </h1>
        <button
          type="button"
          onClick={refreshExternal}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-xl border-2 border-input bg-background px-3 py-2 text-sm font-medium hover:bg-muted w-full sm:w-auto justify-center"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          רענון מקורות חיצוניים
        </button>
      </div>
      <p className="text-sm text-muted-foreground">
        זהות וכלי מוצגים רק לפי הוכחה מהמקור. אין ניחוש לפי IP. זמן פעילות באפליקציה לפי heartbeat.
      </p>

      {(summary.unidentified_today > 0 || unidentifiedCount > 0) && (
        <button
          type="button"
          onClick={() => setUnidentifiedOnly((v) => !v)}
          className="w-full text-right rounded-2xl border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/40 p-3 flex gap-3 items-start"
        >
          <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={22} />
          <div>
            <p className="font-bold text-amber-800 dark:text-amber-200">גישה לא מזוהה</p>
            <p className="text-sm text-amber-800/80 dark:text-amber-200/80">
              {summary.unidentified_today || unidentifiedCount} אירועים ללא שיוך אמין לחשבון או כלי מוכר.
              {unidentifiedOnly ? ' מציג רק אותם — לחץ להסרה.' : ' לחץ לסינון.'}
            </p>
          </div>
        </button>
      )}

      {openAlerts.length > 0 && (
        <div className="rounded-2xl border border-border bg-muted/40 p-3 space-y-2">
          <p className="text-sm font-bold">התראות בתוך המערכת ({openAlerts.length})</p>
          {openAlerts.slice(0, 5).map((a) => (
            <p key={a.id} className="text-sm">{a.title} · {when(a.created_at)}</p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
        {cards.map((c) => (
          <div key={c.label} className={`card-elevated p-3 min-w-0 ${c.warn && c.value > 0 ? 'border-2 border-amber-500' : ''}`}>
            <p className="text-[11px] sm:text-xs text-muted-foreground leading-tight">{c.label}</p>
            <p className="text-xl sm:text-2xl font-bold mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש חשבון, פעולה, IP, כלי..."
            className="w-full pr-9 p-2.5 rounded-xl border-2 border-input bg-background text-sm" />
        </div>
        <button type="button" className="md:hidden text-sm font-medium text-primary" onClick={() => setFiltersOpen((v) => !v)}>
          {filtersOpen ? 'הסתר סינון' : 'הצג סינון'}
        </button>
        <div className={`${filtersOpen ? 'flex' : 'hidden'} md:flex flex-col md:flex-row flex-wrap gap-2`}>
          {filters}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">{filtered.length} אירועים</p>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" /></div>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {filtered.map((r) => {
              const attention = needsIdentityAttention(r);
              const duration = displayActivityDuration(r);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelected(r)}
                  className={`w-full text-right card-elevated p-3 space-y-1 ${attention ? 'border-2 border-amber-500' : ''}`}
                >
                  {attention && <span className="inline-block text-[11px] font-bold text-amber-800 bg-amber-100 rounded-full px-2 py-0.5">לא מזוהה</span>}
                  <p className="text-xs text-muted-foreground">{when(r.occurred_at)}</p>
                  <p className="font-bold">{SOURCE_HE[r.source] || r.source}</p>
                  <p className="text-sm">מי: {displayAccount(r)}</p>
                  <p className="text-sm">סוג/כלי: {displayAccessKind(r)} · {displayTool(r)}</p>
                  <p className="text-sm">פעולה: {r.action_label || r.event_type}</p>
                  <p className="text-sm">תוצאה: {displayOutcome(r)}</p>
                  <p className="text-sm">זמן פעילות: {duration.kind === 'event' ? duration.text : duration.text}</p>
                  <p className="text-xs text-muted-foreground">רמת אבטחה: {SEVERITY_HE[r.severity] || r.severity}</p>
                </button>
              );
            })}
          </div>

          <div className="hidden md:block overflow-x-auto card-elevated p-0">
            <table className="w-full text-sm text-right">
              <thead className="bg-muted/50">
                <tr>
                  {['תאריך ושעה', 'מקור', 'חשבון', 'סוג גישה / כלי', 'פעולה', 'תוצאה', 'זמן פעילות', 'זיהוי', 'רמת אירוע'].map((h) => (
                    <th key={h} className="p-2 font-bold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const attention = needsIdentityAttention(r);
                  const duration = displayActivityDuration(r);
                  return (
                    <tr
                      key={r.id}
                      className={`border-t border-border hover:bg-muted/30 cursor-pointer ${attention ? 'bg-amber-50/70 dark:bg-amber-950/20' : ''}`}
                      onClick={() => setSelected(r)}
                    >
                      <td className="p-2 whitespace-nowrap">{when(r.occurred_at)}</td>
                      <td className="p-2">{SOURCE_HE[r.source] || r.source}</td>
                      <td className="p-2">{displayAccount(r)}</td>
                      <td className="p-2">{displayAccessKind(r)} · {displayTool(r)}</td>
                      <td className="p-2">{r.action_label || r.event_type}</td>
                      <td className="p-2">{displayOutcome(r)}</td>
                      <td className="p-2">{duration.text}</td>
                      <td className="p-2">{attention ? 'לא מזוהה' : (IDENTITY_HE[r.identity_status] || r.identity_status)}</td>
                      <td className="p-2">{SEVERITY_HE[r.severity] || r.severity}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="card-elevated p-3 space-y-2">
        <p className="font-bold flex items-center gap-2"><Clock size={16} /> Sessions באפליקציה</p>
        <p className="text-xs text-muted-foreground">כניסה / פעילות אחרונה / יציאה / זמן פעילות מצטבר לפי heartbeat בלבד. אין המצאת session ל-GitHub/VPS.</p>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {sessions.length === 0 && <p className="text-sm text-muted-foreground">אין sessions עדיין.</p>}
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setTimelineKey({ type: 'session', id: s.id })}
              className="w-full text-right text-sm rounded-xl border border-border p-2 hover:bg-muted/40"
            >
              <span className="font-medium">{s.is_open ? 'פתוח' : 'סגור'}</span>
              {' · '}כניסה {when(s.started_at)}
              {' · '}אחרון {when(s.last_activity_at)}
              {s.ended_at ? ` · יציאה ${when(s.ended_at)}` : ''}
              {' · '}{formatActiveMs(s.accumulated_active_ms)}
            </button>
          ))}
        </div>
      </div>

      {timelineKey && (
        <div className="card-elevated p-3 space-y-2">
          <div className="flex justify-between items-center">
            <p className="font-bold">ציר פעולות</p>
            <button type="button" className="text-sm text-primary" onClick={() => setTimelineKey(null)}>סגור ציר</button>
          </div>
          {timelineEvents.map((e) => (
            <p key={e.id} className="text-sm border-r-2 border-primary pr-2">
              {when(e.occurred_at)} — {e.action_label || e.event_type} · {displayOutcome(e)} · {e.object_type || '—'}
            </p>
          ))}
          {timelineEvents.length === 0 && <p className="text-sm text-muted-foreground">אין פעולות מתועדות ל-session זה.</p>}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setSelected(null)}>
          <div
            className="bg-background rounded-t-2xl md:rounded-2xl w-full md:max-w-lg max-h-[92vh] overflow-y-auto p-5 space-y-2 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <h2 className="text-lg font-bold">פרטי אירוע</h2>
            {needsIdentityAttention(selected) && (
              <p className="text-sm font-bold text-amber-800 bg-amber-100 rounded-xl px-3 py-2">גישה לא מזוהה — אין שיוך אמין לאדם או כלי מוכר</p>
            )}
            <p className="text-sm"><b>מערכת:</b> {SOURCE_HE[selected.source] || selected.source}</p>
            <p className="text-sm"><b>חשבון:</b> {displayAccount(selected)}</p>
            <p className="text-sm"><b>אימייל:</b> {selected.actor_email || 'לא סופק על ידי המקור'}</p>
            <p className="text-sm"><b>Username / Actor:</b> {selected.actor_username || '—'}</p>
            <p className="text-sm"><b>סוג גישה:</b> {displayAccessKind(selected)}</p>
            <p className="text-sm"><b>כלי מזוהה:</b> {displayTool(selected)}</p>
            <p className="text-sm"><b>פעולה:</b> {selected.action_label || selected.event_type}</p>
            <p className="text-sm"><b>סוג אובייקט:</b> {selected.object_type || detailValue(selected, 'object_type')}</p>
            <p className="text-sm"><b>Repository / Branch:</b> {detailValue(selected, 'repo')} / {detailValue(selected, 'branch')}</p>
            <p className="text-sm"><b>תוצאה:</b> {displayOutcome(selected)}</p>
            <p className="text-sm"><b>שעת אירוע:</b> {when(selected.occurred_at)}</p>
            {relatedSession ? (
              <>
                <p className="text-sm"><b>כניסה:</b> {when(relatedSession.started_at)}</p>
                <p className="text-sm"><b>פעילות אחרונה:</b> {when(relatedSession.last_activity_at)}</p>
                <p className="text-sm"><b>יציאה:</b> {relatedSession.ended_at ? when(relatedSession.ended_at) : 'עדיין פתוח'}</p>
                <p className="text-sm"><b>זמן פעילות:</b> {formatActiveMs(relatedSession.accumulated_active_ms)}</p>
              </>
            ) : (
              <p className="text-sm"><b>משך פעילות:</b> {displayActivityDuration(selected).text}</p>
            )}
            <p className="text-sm"><b>IP:</b> {selected.ip_address || '—'}</p>
            <p className="text-sm"><b>SSH fingerprint:</b> {shortFingerprint(selected.ssh_fingerprint)}</p>
            <p className="text-sm"><b>Authentication:</b> {selected.auth_method || selected.device_summary || '—'}</p>
            <p className="text-sm"><b>Session:</b> {selected.session_id || '—'}</p>
            <p className="text-sm"><b>מזהה טכני:</b> {selected.source_ref || '—'}</p>
            <p className="text-sm font-bold mt-2">ציר פעולות קשור</p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {timelineEvents.map((e) => (
                <p key={e.id} className="text-xs">
                  {when(e.occurred_at)} — {e.action_label || e.event_type} · {displayOutcome(e)}
                </p>
              ))}
            </div>
            <pre className="text-xs bg-muted rounded-xl p-3 overflow-auto max-h-40">{JSON.stringify(redactDetails(selected.details), null, 2)}</pre>
            <div className="flex gap-2">
              {selected.session_id && (
                <button type="button" className="rounded-xl border px-4 py-2 text-sm" onClick={() => { setTimelineKey({ type: 'session', id: selected.session_id! }); setSelected(null); }}>
                  ציר Session
                </button>
              )}
              {(selected.actor_user_id || selected.actor_username) && (
                <button type="button" className="rounded-xl border px-4 py-2 text-sm" onClick={() => { setTimelineKey({ type: 'user', id: selected.actor_user_id || selected.actor_username || '' }); setSelected(null); }}>
                  ציר משתמש
                </button>
              )}
              <button type="button" className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm" onClick={() => setSelected(null)}>סגור</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
