import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { Shield, RefreshCw, Search, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  CLASS_BADGE_CLASS,
  CLASS_HE,
  CLASS_ROW_CLASS,
  activeUserIds,
  activityLayer,
  classifySecurityEvent,
  displayAccessKind,
  displayAccount,
  displayActivityDuration,
  displayOutcome,
  displayTool,
  matchesSecurityFilters,
  redactDetails,
  ROLE_HE,
  sessionCountByUser,
  SOURCE_HE,
  shortFingerprint,
  formatActiveMs,
  type SecurityClass,
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
  classification: '',
  layer: '',
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

function ClassBadge({ value }: { value: SecurityClass }) {
  return (
    <span className={`inline-block text-[11px] font-bold rounded-full px-2 py-0.5 border ${CLASS_BADGE_CLASS[value]}`}>
      {CLASS_HE[value]}
    </span>
  );
}

const FILTER_INPUT = 'mt-1 p-2.5 rounded-xl border-2 border-input bg-background text-sm w-full block';

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
  const approvedInfraToday = rows.filter((r) => activityLayer(r) === 'infra_approved').length;
  const unknownInfraToday = rows.filter((r) => {
    const c = classifySecurityEvent(r);
    return c === 'unidentified' || c === 'review';
  }).length;

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

  const cls = selected ? classifySecurityEvent(selected) : null;

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
        במבט אחד: מי, מאיפה, מאושר או דורש בדיקה, מה עשה ומתי. אין ניחוש זהות. GitHub/VPS לא נספרים כמשתמש אפליקציה.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
        <button type="button" onClick={() => setF({ layer: 'app', activePeopleOnly: true, unidentifiedOnly: false, classification: '' })}
          className="card-elevated p-3 text-right min-w-0 border-r-4 border-r-emerald-500">
          <p className="text-xs text-muted-foreground">משתמשי אפליקציה פעילים עכשיו</p>
          <p className="text-2xl font-bold mt-1">{peopleNow}</p>
          <p className="text-[11px] text-muted-foreground mt-1">מנהל־על / מנהל צי / נהג / לקוח · אדם אחד לכמה טאבים</p>
        </button>
        <button type="button" onClick={() => setF({ layer: 'infra_approved', activePeopleOnly: false, unidentifiedOnly: false, classification: 'approved' })}
          className="card-elevated p-3 text-right min-w-0 border-r-4 border-r-emerald-500">
          <p className="text-xs text-muted-foreground">גישות תשתית מאושרות</p>
          <p className="text-2xl font-bold mt-1">{approvedInfraToday}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Cursor/Cross, GitHub Actions וחשבונות ממופים</p>
        </button>
        <button type="button" onClick={() => setF({ layer: 'infra_unknown', activePeopleOnly: false, unidentifiedOnly: true, classification: '' })}
          className="card-elevated p-3 text-right min-w-0 border-r-4 border-r-amber-500">
          <p className="text-xs text-muted-foreground">לא מזוהה / דורש בדיקה</p>
          <p className="text-2xl font-bold mt-1">{unknownInfraToday}</p>
          <p className="text-[11px] text-muted-foreground mt-1">אירועים בלי שיוך אמין · לא תוקף בלי הוכחה</p>
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          ['כניסות אפליקציה היום', summary.logins_today],
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

      <div className="card-elevated p-3 space-y-3">
        <p className="font-bold text-sm">סינון</p>
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input value={filter.search} onChange={(e) => setF({ search: e.target.value })} placeholder="חיפוש חופשי: שם, אימייל או מילה מהפעולה"
            className="w-full pr-9 p-2.5 rounded-xl border-2 border-input bg-background text-sm" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="md:hidden rounded-xl border-2 px-3 py-2 text-sm font-medium" onClick={() => setFiltersOpen((v) => !v)}>
            {filtersOpen ? 'סגור סינונים' : 'עוד סינונים'}
          </button>
          <button type="button" className="rounded-xl bg-primary text-primary-foreground px-3 py-2 text-sm font-medium" onClick={() => setFilter(EMPTY_FILTER)}>
            נקה סינונים
          </button>
        </div>
        <div className={`${filtersOpen ? 'flex max-h-64 overflow-y-auto' : 'hidden'} md:flex md:max-h-none md:overflow-visible flex-col md:flex-row flex-wrap gap-2 pb-1`}>
          <label className="text-xs font-medium w-full md:w-auto">שם משתמש<input value={filter.user} onChange={(e) => setF({ user: e.target.value })} className={FILTER_INPUT} /></label>
          <label className="text-xs font-medium w-full md:w-auto">אימייל<input value={filter.email} onChange={(e) => setF({ email: e.target.value })} className={FILTER_INPUT} /></label>
          <label className="text-xs font-medium w-full md:w-auto">חברה
            <select value={filter.company} onChange={(e) => setF({ company: e.target.value })} className={FILTER_INPUT}>
              <option value="">הכל</option>
              {companies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium w-full md:w-auto">תפקיד
            <select value={filter.role} onChange={(e) => setF({ role: e.target.value })} className={FILTER_INPUT}>
              <option value="">הכל</option>
              {Object.entries(ROLE_HE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium w-full md:w-auto">מתאריך<input type="date" value={filter.dateFrom} onChange={(e) => setF({ dateFrom: e.target.value })} className={FILTER_INPUT} /></label>
          <label className="text-xs font-medium w-full md:w-auto">עד תאריך<input type="date" value={filter.dateTo} onChange={(e) => setF({ dateTo: e.target.value })} className={FILTER_INPUT} /></label>
          <label className="text-xs font-medium w-full md:w-auto">שעה
            <select value={filter.hour} onChange={(e) => setF({ hour: e.target.value })} className={FILTER_INPUT}>
              <option value="">הכל</option>
              {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((h) => <option key={h} value={h}>{h}:00</option>)}
            </select>
          </label>
          <label className="text-xs font-medium w-full md:w-auto">סוג פעילות
            <select value={filter.layer} onChange={(e) => setF({ layer: e.target.value })} className={FILTER_INPUT}>
              <option value="">הכל</option>
              <option value="app">משתמשי אפליקציה</option>
              <option value="infra_approved">תשתית מאושרת</option>
              <option value="infra_unknown">לא מזוהה / דורש בדיקה</option>
            </select>
          </label>
          <label className="text-xs font-medium w-full md:w-auto">מערכת מקור
            <select value={filter.source} onChange={(e) => setF({ source: e.target.value })} className={FILTER_INPUT}>
              <option value="">הכל</option>
              <option value="app">אפליקציה</option>
              <option value="github">GitHub</option>
              <option value="supabase">Supabase</option>
              <option value="hostinger_vps">Hostinger/VPS</option>
            </select>
          </label>
          <label className="text-xs font-medium w-full md:w-auto">כלי
            <select value={filter.tool} onChange={(e) => setF({ tool: e.target.value })} className={FILTER_INPUT}>
              <option value="">הכל</option>
              <option value="cursor">Cursor/Cross</option>
              <option value="claude">Claude Code</option>
              <option value="chatgpt">ChatGPT</option>
              <option value="actions">GitHub Actions</option>
              <option value="automation">Automation</option>
              <option value="other">אחר</option>
              <option value="unidentified">לא מזוהה</option>
            </select>
          </label>
          <label className="text-xs font-medium w-full md:w-auto">פעולה<input value={filter.action} onChange={(e) => setF({ action: e.target.value })} placeholder="Push, התחברות..." className={FILTER_INPUT} /></label>
          <label className="text-xs font-medium w-full md:w-auto">תוצאה
            <select value={filter.outcome} onChange={(e) => setF({ outcome: e.target.value })} className={FILTER_INPUT}>
              <option value="">הכל</option>
              <option value="success">הצליח</option>
              <option value="failure">נכשל</option>
              <option value="blocked">נחסם</option>
            </select>
          </label>
          <label className="text-xs font-medium w-full md:w-auto">סיווג
            <select value={filter.classification} onChange={(e) => setF({ classification: e.target.value, unidentifiedOnly: false })} className={FILTER_INPUT}>
              <option value="">הכל</option>
              <option value="approved">מאושר / מוכר</option>
              <option value="unidentified">לא מזוהה</option>
              <option value="review">דורש בדיקה</option>
              <option value="failed">נחסם / נכשל</option>
            </select>
          </label>
          <label className="text-xs font-medium w-full md:w-auto">פעיל עכשיו
            <select value={filter.activePeopleOnly ? 'active' : ''} onChange={(e) => setF({ activePeopleOnly: e.target.value === 'active' })} className={FILTER_INPUT}>
              <option value="">הכל</option>
              <option value="active">משתמשי אפליקציה פעילים</option>
            </select>
          </label>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">{filtered.length} אירועים</p>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" /></div>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {filtered.map((r) => {
              const c = classifySecurityEvent(r);
              return (
                <button key={r.id} type="button" onClick={() => setSelected(r)}
                  className={`w-full text-right card-elevated p-3 space-y-2 ${CLASS_ROW_CLASS[c]}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <ClassBadge value={c} />
                    <span className="text-xs font-medium">{timePart(r.occurred_at)}</span>
                  </div>
                  <p className="font-bold leading-snug">{displayAccount(r)}</p>
                  <p className="text-sm"><span className="text-muted-foreground">מערכת:</span> {SOURCE_HE[r.source] || r.source}</p>
                  <p className="text-sm"><span className="text-muted-foreground">פעולה:</span> {r.action_label || r.event_type}</p>
                  <p className="text-sm"><span className="text-muted-foreground">תוצאה:</span> {displayOutcome(r)}</p>
                </button>
              );
            })}
          </div>

          <div className="hidden md:block overflow-x-auto card-elevated p-0">
            <table className="w-full text-sm text-right">
              <thead className="bg-muted/50">
                <tr>
                  {['סיווג', 'תאריך', 'שעה', 'מערכת', 'שם משתמש', 'אימייל/Actor', 'חברה', 'תפקיד', 'כלי', 'פעולה', 'תוצאה', 'פעילות אחרונה', 'זמן פעילות'].map((h) => (
                    <th key={h} className="p-2 font-bold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const c = classifySecurityEvent(r);
                  const sess = r.session_id ? sessions.find((s) => s.id === r.session_id) : null;
                  return (
                    <tr key={r.id} className={`border-t border-border hover:bg-muted/30 cursor-pointer ${CLASS_ROW_CLASS[c]}`} onClick={() => setSelected(r)}>
                      <td className="p-2"><ClassBadge value={c} /></td>
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
                      <td className="p-2 whitespace-nowrap">{sess ? timePart(sess.last_activity_at) : timePart(r.occurred_at)}</td>
                      <td className="p-2">{sess ? formatActiveMs(sess.accumulated_active_ms) : displayActivityDuration(r).text}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="card-elevated p-3 space-y-2">
        <p className="font-bold flex items-center gap-2"><Clock size={16} /> Sessions אפליקציה בלבד</p>
        <p className="text-xs text-muted-foreground">לא כולל GitHub / Supabase / VPS. אותו אדם יכול להופיע בכמה טאבים.</p>
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
        </div>
      )}

      {selected && cls && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setSelected(null)}>
          <div className="bg-background rounded-t-2xl md:rounded-2xl w-full md:max-w-lg max-h-[92vh] overflow-y-auto p-5 space-y-2 shadow-xl" onClick={(e) => e.stopPropagation()} dir="rtl">
            <h2 className="text-lg font-bold">פרטי אירוע</h2>
            <ClassBadge value={cls} />
            <p className="text-sm"><b>מי:</b> {displayAccount(selected)}</p>
            <p className="text-sm"><b>זהות:</b> {selected.actor_username || selected.actor_email || 'זהות לא זמינה'}</p>
            <p className="text-sm"><b>מערכת:</b> {SOURCE_HE[selected.source] || selected.source}</p>
            <p className="text-sm"><b>כלי:</b> {displayTool(selected)}</p>
            <p className="text-sm"><b>תפקיד / חברה:</b> {ROLE_HE[selected.actor_role || ''] || selected.actor_role || '—'} · {selected.company_name || '—'}</p>
            <p className="text-sm"><b>מתי:</b> {when(selected.occurred_at)}</p>
            <p className="text-sm"><b>מה עשה:</b> {selected.action_label || selected.event_type}</p>
            <p className="text-sm"><b>האם הצליח:</b> {displayOutcome(selected)}</p>
            <p className="text-sm"><b>IP:</b> {selected.ip_address || '—'}</p>
            <p className="text-sm"><b>fingerprint:</b> {shortFingerprint(selected.ssh_fingerprint)}</p>
            {relatedSession ? (
              <>
                <p className="text-sm"><b>כניסה:</b> {when(relatedSession.started_at)}</p>
                <p className="text-sm"><b>פעילות אחרונה:</b> {when(relatedSession.last_activity_at)}</p>
                <p className="text-sm"><b>משך:</b> {formatActiveMs(relatedSession.accumulated_active_ms)}</p>
              </>
            ) : (
              <p className="text-sm"><b>משך:</b> {displayActivityDuration(selected).text}</p>
            )}
            {relatedOpenSessions.length > 1 && <p className="text-sm"><b>טאבים לאותו אדם:</b> {relatedOpenSessions.length}</p>}
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {timelineEvents.map((e) => (
                <p key={e.id} className="text-xs">{when(e.occurred_at)} — {e.action_label || e.event_type}</p>
              ))}
            </div>
            <pre className="text-xs bg-muted rounded-xl p-3 overflow-auto max-h-28">{JSON.stringify(redactDetails(selected.details), null, 2)}</pre>
            <button type="button" className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm" onClick={() => setSelected(null)}>סגור</button>
          </div>
        </div>
      )}
    </div>
  );
}
