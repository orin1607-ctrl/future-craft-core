import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { Shield, RefreshCw, Search, AlertTriangle, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  activeUserIds,
  displayAccessKind,
  displayAccount,
  displayActivityDuration,
  displayOutcome,
  displayTool,
  IDENTITY_HE,
  matchesSecurityFilters,
  needsIdentityAttention,
  redactDetails,
  ROLE_HE,
  SEVERITY_HE,
  sessionCountByUser,
  SOURCE_HE,
  shortFingerprint,
  formatActiveMs,
  type SecurityFilterState,
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
  last_heartbeat_at: string;
  ended_at: string | null;
  accumulated_active_ms: number;
  end_reason: string | null;
  device_summary: string | null;
  is_open: boolean;
};

type Summary = {
  active_now: number;
  active_people_now: number;
  active_tools_now: number;
  unidentified_review: number;
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
  active_people_now: 0,
  active_tools_now: 0,
  unidentified_review: 0,
  logins_today: 0,
  unique_users_today: 0,
  failed_logins_today: 0,
  unidentified_today: 0,
  security_alerts_open: 0,
  github_today: 0,
  supabase_today: 0,
  vps_today: 0,
};

const EMPTY_FILTER: SecurityFilterState = {
  search: '',
  source: '',
  role: '',
  outcome: '',
  identity: '',
  severity: '',
  dateFrom: '',
  dateTo: '',
  hour: '',
  company: '',
  user: '',
  email: '',
  tool: '',
  action: '',
  unidentifiedOnly: false,
  activePeopleOnly: false,
};

function when(iso: string | null | undefined) {
  if (!iso) return '—';
  return format(new Date(iso), 'dd/MM/yyyy HH:mm', { locale: he });
}

function dayPart(iso: string) {
  return format(new Date(iso), 'dd/MM/yyyy', { locale: he });
}

function timePart(iso: string) {
  return format(new Date(iso), 'HH:mm', { locale: he });
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
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<EventRow | null>(null);
  const [timelineKey, setTimelineKey] = useState<{ type: 'session' | 'user'; id: string } | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filter, setFilter] = useState<SecurityFilterState>(EMPTY_FILTER);

  const setF = (patch: Partial<SecurityFilterState>) => setFilter((f) => ({ ...f, ...patch }));

  const load = useCallback(async () => {
    setLoading(true);
    const { data: sum } = await supabase.rpc('security_dashboard_summary' as never);
    if (sum && typeof sum === 'object') setSummary({ ...EMPTY_SUMMARY, ...(sum as Summary) });
    const [{ data: events }, { data: sess }] = await Promise.all([
      supabase.from('security_audit_events' as 'profiles').select('*').order('occurred_at' as never, { ascending: false }).limit(500),
      supabase.from('security_activity_sessions' as 'profiles').select('*').order('last_activity_at' as never, { ascending: false }).limit(80),
    ]);
    setRows((events || []) as unknown as EventRow[]);
    setSessions((sess || []) as unknown as SessionRow[]);
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

  const activeIds = useMemo(() => activeUserIds(sessions), [sessions]);
  const tabsByUser = useMemo(() => sessionCountByUser(sessions), [sessions]);
  const peopleNow = summary.active_people_now || summary.active_now;
  const toolsNow = summary.active_tools_now || 0;
  const unidentifiedNow = summary.unidentified_review || summary.unidentified_today;

  const filtered = useMemo(
    () => rows.filter((r) => matchesSecurityFilters(r, filter, activeIds)),
    [rows, filter, activeIds],
  );

  const companies = [...new Set(rows.map((r) => r.company_name).filter(Boolean))] as string[];

  const timelineEvents = useMemo(() => {
    const key = timelineKey;
    const sel = selected;
    if (key?.type === 'session') return rows.filter((r) => r.session_id === key.id).slice().reverse();
    if (key?.type === 'user') {
      return rows.filter((r) => r.actor_user_id === key.id || r.actor_username === key.id || r.actor_email === key.id).slice().reverse();
    }
    if (!sel) return [];
    return rows.filter((r) => {
      if (sel.session_id && r.session_id === sel.session_id) return true;
      if (sel.actor_user_id && r.actor_user_id === sel.actor_user_id) return true;
      if (sel.actor_username && r.actor_username === sel.actor_username) return true;
      return r.id === sel.id;
    }).slice(0, 50).reverse();
  }, [rows, selected, timelineKey]);

  const relatedSession = selected?.session_id ? sessions.find((s) => s.id === selected.session_id) : null;
  const relatedOpenSessions = selected?.actor_user_id
    ? sessions.filter((s) => s.user_id === selected.actor_user_id && s.is_open)
    : [];

  if (!isSuperAdmin) {
    return (
      <div className="animate-fade-in text-center py-16">
        <Shield size={48} className="mx-auto mb-4 text-muted-foreground opacity-50" />
        <p className="text-xl text-muted-foreground">אין לך הרשאה לצפות במרכז הבקרה ואבטחה</p>
      </div>
    );
  }

  const filters = (
    <>
      <input type="date" value={filter.dateFrom} onChange={(e) => setF({ dateFrom: e.target.value })}
        className="p-2.5 rounded-xl border-2 border-input bg-background text-sm w-full md:w-auto" title="מתאריך" />
      <input type="date" value={filter.dateTo} onChange={(e) => setF({ dateTo: e.target.value })}
        className="p-2.5 rounded-xl border-2 border-input bg-background text-sm w-full md:w-auto" title="עד תאריך" />
      <select value={filter.hour} onChange={(e) => setF({ hour: e.target.value })} className="p-2.5 rounded-xl border-2 border-input bg-background text-sm w-full md:w-auto">
        <option value="">כל השעות</option>
        {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((h) => <option key={h} value={h}>{h}:00</option>)}
      </select>
      <input value={filter.user} onChange={(e) => setF({ user: e.target.value })} placeholder="שם משתמש"
        className="p-2.5 rounded-xl border-2 border-input bg-background text-sm w-full md:w-36" />
      <input value={filter.email} onChange={(e) => setF({ email: e.target.value })} placeholder="אימייל"
        className="p-2.5 rounded-xl border-2 border-input bg-background text-sm w-full md:w-40" />
      <input value={filter.action} onChange={(e) => setF({ action: e.target.value })} placeholder="פעולה"
        className="p-2.5 rounded-xl border-2 border-input bg-background text-sm w-full md:w-36" />
      <select value={filter.company} onChange={(e) => setF({ company: e.target.value })} className="p-2.5 rounded-xl border-2 border-input bg-background text-sm w-full md:w-auto">
        <option value="">כל החברות</option>
        {companies.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <select value={filter.role} onChange={(e) => setF({ role: e.target.value })} className="p-2.5 rounded-xl border-2 border-input bg-background text-sm w-full md:w-auto">
        <option value="">כל סוגי המשתמש</option>
        {Object.entries(ROLE_HE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <select value={filter.source} onChange={(e) => setF({ source: e.target.value })} className="p-2.5 rounded-xl border-2 border-input bg-background text-sm w-full md:w-auto">
        <option value="">כל המערכות</option>
        {Object.entries(SOURCE_HE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <select value={filter.tool} onChange={(e) => setF({ tool: e.target.value })} className="p-2.5 rounded-xl border-2 border-input bg-background text-sm w-full md:w-auto">
        <option value="">כל הכלים</option>
        <option value="cursor">Cursor/Cross</option>
        <option value="claude">Claude Code</option>
        <option value="chatgpt">ChatGPT</option>
        <option value="actions">GitHub Actions</option>
        <option value="other">אחר</option>
      </select>
      <select value={filter.outcome} onChange={(e) => setF({ outcome: e.target.value })} className="p-2.5 rounded-xl border-2 border-input bg-background text-sm w-full md:w-auto">
        <option value="">הצלחה / כישלון / חסימה</option>
        <option value="success">הצליח</option>
        <option value="failure">נכשל</option>
        <option value="blocked">נחסם</option>
      </select>
      <select value={filter.identity} onChange={(e) => setF({ identity: e.target.value })} className="p-2.5 rounded-xl border-2 border-input bg-background text-sm w-full md:w-auto">
        <option value="">מזוהה / לא</option>
        {Object.entries(IDENTITY_HE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <select value={filter.severity} onChange={(e) => setF({ severity: e.target.value })} className="p-2.5 rounded-xl border-2 border-input bg-background text-sm w-full md:w-auto">
        <option value="">רמת חומרה</option>
        {Object.entries(SEVERITY_HE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <select
        value={filter.activePeopleOnly ? 'active' : ''}
        onChange={(e) => setF({ activePeopleOnly: e.target.value === 'active' })}
        className="p-2.5 rounded-xl border-2 border-input bg-background text-sm w-full md:w-auto"
      >
        <option value="">פעיל עכשיו / לא</option>
        <option value="active">פעיל עכשיו באפליקציה</option>
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
        <button type="button" onClick={refreshExternal} disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-xl border-2 border-input bg-background px-3 py-2 text-sm font-medium hover:bg-muted w-full sm:w-auto justify-center">
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          רענון מקורות חיצוניים
        </button>
      </div>
      <p className="text-sm text-muted-foreground">
        זהות וכלי רק לפי הוכחה. כמה טאבים של אותו אדם נספרים כאדם אחד. QA/GitHub/SSH לא נספרים כאדם פעיל.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
        <button type="button" onClick={() => setF({ activePeopleOnly: true, unidentifiedOnly: false })}
          className="card-elevated p-3 text-right min-w-0">
          <p className="text-xs text-muted-foreground">אנשים פעילים עכשיו באפליקציה</p>
          <p className="text-2xl font-bold mt-1">{peopleNow}</p>
          <p className="text-[11px] text-muted-foreground mt-1">אדם אחד גם אם יש כמה טאבים</p>
        </button>
        <div className="card-elevated p-3 min-w-0">
          <p className="text-xs text-muted-foreground">כלים/שירותים פעילים</p>
          <p className="text-2xl font-bold mt-1">{toolsNow}</p>
          <p className="text-[11px] text-muted-foreground mt-1">רק כלי מאושר עם אירוע ב-15 דק׳</p>
        </div>
        <button type="button" onClick={() => setF({ unidentifiedOnly: true, activePeopleOnly: false })}
          className={`card-elevated p-3 text-right min-w-0 ${unidentifiedNow > 0 ? 'border-2 border-amber-500' : ''}`}>
          <p className="text-xs text-muted-foreground">זהות לא מזוהה — דורש בדיקה</p>
          <p className="text-2xl font-bold mt-1">{unidentifiedNow}</p>
          <p className="text-[11px] text-muted-foreground mt-1">אירועים, לא אנשים מחוברים</p>
        </button>
      </div>

      {unidentifiedNow > 0 && (
        <div className="w-full text-right rounded-2xl border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/40 p-3 flex gap-3 items-start">
          <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={22} />
          <div>
            <p className="font-bold text-amber-800 dark:text-amber-200">זהות לא מזוהה — דורש בדיקה</p>
            <p className="text-sm text-amber-800/80">אין ניחוש לפי IP. אין סימון כתוקף בלי הוכחה.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          ['כניסות היום', summary.logins_today],
          ['משתמשי אפליקציה היום', summary.unique_users_today],
          ['כניסות שנכשלו', summary.failed_logins_today],
          ['GitHub היום', summary.github_today],
          ['Supabase היום', summary.supabase_today],
          ['VPS היום', summary.vps_today],
        ].map(([label, value]) => (
          <div key={String(label)} className="card-elevated p-3 min-w-0">
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className="text-xl font-bold mt-1">{value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input value={filter.search} onChange={(e) => setF({ search: e.target.value })} placeholder="חיפוש חופשי: חשבון, פעולה, IP, כלי..."
            className="w-full pr-9 p-2.5 rounded-xl border-2 border-input bg-background text-sm" />
        </div>
        <div className="flex gap-2">
          <button type="button" className="md:hidden text-sm font-medium text-primary" onClick={() => setFiltersOpen((v) => !v)}>
            {filtersOpen ? 'הסתר סינון' : 'הצג סינון'}
          </button>
          <button type="button" className="text-sm text-muted-foreground" onClick={() => setFilter(EMPTY_FILTER)}>נקה סינון</button>
        </div>
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
              return (
                <button key={r.id} type="button" onClick={() => setSelected(r)}
                  className={`w-full text-right card-elevated p-3 space-y-1 ${attention ? 'border-2 border-amber-500' : ''}`}>
                  {attention && <span className="inline-block text-[11px] font-bold text-amber-800 bg-amber-100 rounded-full px-2 py-0.5">זהות לא מזוהה — דורש בדיקה</span>}
                  <p className="text-xs text-muted-foreground">{when(r.occurred_at)}</p>
                  <p className="font-bold">{SOURCE_HE[r.source] || r.source}</p>
                  <p className="text-sm">מי: {displayAccount(r)}</p>
                  <p className="text-sm">פעולה: {r.action_label || r.event_type}</p>
                  <p className="text-sm">תוצאה: {displayOutcome(r)}</p>
                  <p className="text-sm">זמן פעילות: {displayActivityDuration(r).text}</p>
                </button>
              );
            })}
          </div>

          <div className="hidden md:block overflow-x-auto card-elevated p-0">
            <table className="w-full text-sm text-right">
              <thead className="bg-muted/50">
                <tr>
                  {['תאריך', 'שעה', 'מערכת', 'שם משתמש', 'אימייל/Actor', 'חברה', 'סוג משתמש', 'כלי/מקור', 'פעולה', 'תוצאה', 'שעת כניסה', 'פעילות אחרונה', 'שעת יציאה', 'זמן פעילות', 'IP', 'מכשיר', 'רמת אירוע'].map((h) => (
                    <th key={h} className="p-2 font-bold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const attention = needsIdentityAttention(r);
                  const sess = r.session_id ? sessions.find((s) => s.id === r.session_id) : null;
                  return (
                    <tr key={r.id} className={`border-t border-border hover:bg-muted/30 cursor-pointer ${attention ? 'bg-amber-50/70 dark:bg-amber-950/20' : ''}`}
                      onClick={() => setSelected(r)}>
                      <td className="p-2 whitespace-nowrap">{dayPart(r.occurred_at)}</td>
                      <td className="p-2 whitespace-nowrap">{timePart(r.occurred_at)}</td>
                      <td className="p-2">{SOURCE_HE[r.source] || r.source}</td>
                      <td className="p-2">{r.actor_username || displayAccount(r)}</td>
                      <td className="p-2">{r.actor_email || r.actor_username || '—'}</td>
                      <td className="p-2">{r.company_name || '—'}</td>
                      <td className="p-2">{ROLE_HE[r.actor_role || ''] || displayAccessKind(r)}</td>
                      <td className="p-2">{displayTool(r)}</td>
                      <td className="p-2">{r.action_label || r.event_type}</td>
                      <td className="p-2">{displayOutcome(r)}</td>
                      <td className="p-2 whitespace-nowrap">{sess ? timePart(sess.started_at) : '—'}</td>
                      <td className="p-2 whitespace-nowrap">{sess ? timePart(sess.last_activity_at) : timePart(r.occurred_at)}</td>
                      <td className="p-2 whitespace-nowrap">{sess?.ended_at ? timePart(sess.ended_at) : (sess?.is_open ? 'פתוח' : '—')}</td>
                      <td className="p-2">{sess ? formatActiveMs(sess.accumulated_active_ms) : displayActivityDuration(r).text}</td>
                      <td className="p-2 font-mono text-xs">{r.ip_address || '—'}</td>
                      <td className="p-2">{r.device_summary || '—'}</td>
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
        <p className="text-xs text-muted-foreground">כניסה / פעילות אחרונה / יציאה לפי heartbeat. אותו אדם יכול להופיע בכמה טאבים.</p>
        {sessions.slice(0, 20).map((s) => (
          <button key={s.id} type="button" onClick={() => setTimelineKey({ type: 'session', id: s.id })}
            className="w-full text-right text-sm rounded-xl border border-border p-2 hover:bg-muted/40">
            {s.is_open ? 'פתוח' : 'סגור'}
            {s.user_id && tabsByUser.get(s.user_id) ? ` · ${tabsByUser.get(s.user_id)} Sessions לאותו אדם` : ''}
            {' · '}כניסה {when(s.started_at)} · אחרון {when(s.last_activity_at)}
            {s.ended_at ? ` · יציאה ${when(s.ended_at)}` : ''} · {formatActiveMs(s.accumulated_active_ms)}
          </button>
        ))}
      </div>

      {timelineKey && (
        <div className="card-elevated p-3 space-y-2">
          <div className="flex justify-between">
            <p className="font-bold">ציר פעולות</p>
            <button type="button" className="text-sm text-primary" onClick={() => setTimelineKey(null)}>סגור ציר</button>
          </div>
          {timelineEvents.map((e) => (
            <p key={e.id} className="text-sm border-r-2 border-primary pr-2">
              {when(e.occurred_at)} — {e.action_label || e.event_type} · {displayOutcome(e)}
            </p>
          ))}
          {timelineEvents.length === 0 && <p className="text-sm text-muted-foreground">אין פעולות מתועדות.</p>}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setSelected(null)}>
          <div className="bg-background rounded-t-2xl md:rounded-2xl w-full md:max-w-lg max-h-[92vh] overflow-y-auto p-5 space-y-2 shadow-xl" onClick={(e) => e.stopPropagation()} dir="rtl">
            <h2 className="text-lg font-bold">פרטי אירוע</h2>
            {needsIdentityAttention(selected) && (
              <p className="text-sm font-bold text-amber-800 bg-amber-100 rounded-xl px-3 py-2">זהות לא מזוהה — דורש בדיקה</p>
            )}
            <p className="text-sm"><b>מערכת:</b> {SOURCE_HE[selected.source] || selected.source}</p>
            <p className="text-sm"><b>חשבון:</b> {displayAccount(selected)}</p>
            <p className="text-sm"><b>אימייל:</b> {selected.actor_email || 'לא סופק על ידי המקור'}</p>
            <p className="text-sm"><b>Username / Actor:</b> {selected.actor_username || '—'}</p>
            <p className="text-sm"><b>Account ID:</b> {selected.actor_user_id || detailValue(selected, 'actor_id')}</p>
            <p className="text-sm"><b>סוג משתמש:</b> {ROLE_HE[selected.actor_role || ''] || selected.actor_role || '—'}</p>
            <p className="text-sm"><b>חברה:</b> {selected.company_name || '—'}</p>
            <p className="text-sm"><b>כלי:</b> {displayTool(selected)}</p>
            <p className="text-sm"><b>פעולה:</b> {selected.action_label || selected.event_type}</p>
            <p className="text-sm"><b>ענף/אובייקט:</b> {detailValue(selected, 'branch')} / {selected.object_type || '—'}</p>
            <p className="text-sm"><b>תוצאה:</b> {displayOutcome(selected)}</p>
            {relatedSession ? (
              <>
                <p className="text-sm"><b>כניסה:</b> {when(relatedSession.started_at)}</p>
                <p className="text-sm"><b>פעילות אחרונה:</b> {when(relatedSession.last_activity_at)}</p>
                <p className="text-sm"><b>יציאה:</b> {relatedSession.ended_at ? when(relatedSession.ended_at) : 'עדיין פתוח'}</p>
                <p className="text-sm"><b>זמן פעילות:</b> {formatActiveMs(relatedSession.accumulated_active_ms)}</p>
              </>
            ) : (
              <p className="text-sm"><b>זמן פעילות:</b> {displayActivityDuration(selected).text}</p>
            )}
            {relatedOpenSessions.length > 1 && (
              <p className="text-sm"><b>טאבים פתוחים לאותו אדם:</b> {relatedOpenSessions.length} Sessions</p>
            )}
            <p className="text-sm"><b>IP:</b> {selected.ip_address || '—'}</p>
            <p className="text-sm"><b>SSH fingerprint:</b> {shortFingerprint(selected.ssh_fingerprint)}</p>
            <p className="text-sm"><b>מכשיר:</b> {selected.device_summary || '—'}</p>
            <p className="text-sm font-bold mt-2">ציר פעולות</p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {timelineEvents.map((e) => (
                <p key={e.id} className="text-xs">{when(e.occurred_at)} — {e.action_label || e.event_type} · {displayOutcome(e)}</p>
              ))}
            </div>
            <pre className="text-xs bg-muted rounded-xl p-3 overflow-auto max-h-32">{JSON.stringify(redactDetails(selected.details), null, 2)}</pre>
            <div className="flex flex-wrap gap-2">
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
