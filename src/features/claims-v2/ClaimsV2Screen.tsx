import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  claimHasNextAction, displayClaimNum, docsOrderOf, DOCS_ORDER, isClosedStatus, STATUSES,
  type ClaimRecord, type ClaimsActor,
} from '@/features/claims/claimsConstants';
import { buildClaimRowAlerts, countUntreatedMails, type ClaimAlert } from '@/features/claims/claimWorkAlerts';
import { claimMatchesSearch } from '@/features/claims/claimSearch';
import { useClaimsV2Data } from './useClaimsV2Data';
import V2ClaimCard, { type CardTab } from './V2ClaimCard';
import { V2GmailView, V2ReportsView, V2TasksView, V2TemplatesModal } from './V2Tools';
import { daysFromToday, fmtDay } from './v2Model';
import { Locked, Menu } from './v2Ui';
import './claims-v2.css';

type View = 'dash' | 'list' | 'card' | 'tasks' | 'reports' | 'gmail';
type WorkFil = '' | 'need' | 'today' | 'overdue' | 'later' | 'waiting_reply' | 'waiting_docs' | 'unassigned' | 'no_next' | 'docs_needs_sort' | 'open_tasks' | 'reminders';

const WORK_LABEL: Record<Exclude<WorkFil, ''>, string> = {
  need: 'דורשים פעולה', today: 'דורשות טיפול היום', overdue: 'טיפול באיחור', later: 'טיפול בהמשך',
  waiting_reply: 'ממתינים לתשובה (חברת ביטוח)', waiting_docs: 'ממתינים למסמכים', unassigned: 'ללא עובד מטפל',
  no_next: 'ללא פעולה הבאה', docs_needs_sort: 'דורשים סידור מסמכים', open_tasks: 'עם משימות פתוחות', reminders: 'עם תזכורות',
};

export default function ClaimsV2Screen({ actor }: { actor: ClaimsActor }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const data = useClaimsV2Data(actor);
  const isSuperAdmin = actor.role === 'super_admin';
  const claimId = params.get('claim') || '';
  const tabParam = (params.get('tab') || '') as CardTab | '';
  const [view, setView] = useState<View>(claimId ? 'card' : 'dash');
  const [archive, setArchive] = useState(false);
  const [mineOnly, setMineOnly] = useState(!isSuperAdmin);
  const [stFil, setStFil] = useState('');
  const [insFil, setInsFil] = useState('');
  const [whoFil, setWhoFil] = useState('');
  const [docsFil, setDocsFil] = useState('');
  const [workFil, setWorkFil] = useState<WorkFil>('');
  const [q, setQ] = useState('');
  const [drawer, setDrawer] = useState(false);
  const [bell, setBell] = useState(false);
  const [templates, setTemplates] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const goOld = useCallback(() => navigate('/claims'), [navigate]);

  useEffect(() => {
    if (!bell) return;
    const close = (e: MouseEvent) => { if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBell(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [bell]);

  const cur = data.claims.find((c) => c.id === claimId) || null;
  const { loadCard } = data;
  useEffect(() => { if (claimId) void loadCard(claimId); }, [claimId, loadCard]);

  const openClaim = (id: string, tab?: CardTab) => {
    setParams(tab ? { claim: id, tab } : { claim: id });
    setView('card'); setDrawer(false); setBell(false);
  };
  const show = (v: View) => { if (v !== 'card') setParams({}); setView(v); setDrawer(false); };
  const openList = (opts: { work?: WorkFil; status?: string; archive?: boolean; ins?: string; who?: string; docs?: string } = {}) => {
    setArchive(Boolean(opts.archive)); setWorkFil(opts.work || ''); setStFil(opts.status || '');
    setInsFil(opts.ins || ''); setWhoFil(opts.who || ''); setDocsFil(opts.docs || '');
    show('list');
  };

  const isMine = useCallback((c: ClaimRecord) => c.assigned_to === actor.id || c.created_by === actor.id, [actor.id]);
  const active = useMemo(() => data.claims.filter((c) => c.archived !== 'true'), [data.claims]);
  const archived = useMemo(() => data.claims.filter((c) => c.archived === 'true'), [data.claims]);
  const workset = useMemo(() => (mineOnly ? active.filter(isMine) : active), [active, mineOnly, isMine]);
  const alertsOf = useMemo(() => {
    const m = new Map<string, ClaimAlert[]>();
    for (const c of data.claims) m.set(c.id, buildClaimRowAlerts(c, data.alertCtx));
    return m;
  }, [data.claims, data.alertCtx]);
  const needsAction = useCallback((c: ClaimRecord) => (alertsOf.get(c.id) || []).some((a) => a.tone === 'need'), [alertsOf]);

  const workMatch = useCallback((c: ClaimRecord, f: WorkFil) => {
    if (!f) return true;
    const d = daysFromToday(c.nextDate || '');
    if (f === 'need') return needsAction(c);
    if (f === 'today') return d === 0;
    if (f === 'overdue') return isClosedStatus(c.status, c.archived) ? false : (d !== null && d < 0);
    if (f === 'later') return d !== null && d > 0;
    if (f === 'waiting_reply') return c.status === 'ממתין לחברת ביטוח';
    if (f === 'waiting_docs') return c.status === 'ממתין למסמכים';
    if (f === 'unassigned') return !c.assigned_to;
    if (f === 'no_next') return !claimHasNextAction(c);
    if (f === 'docs_needs_sort') return docsOrderOf({ docsOrderStatus: c.docsOrderStatus }) === 'needs_sort';
    if (f === 'open_tasks') return data.tasks.some((t) => t.claimId === c.id && t.done !== 'true');
    if (f === 'reminders') return data.reminders.some((r) => r.claimId === c.id);
    return true;
  }, [needsAction, data.tasks, data.reminders]);

  const counts = useMemo(() => {
    const inWs = (claimRef: string) => !mineOnly || workset.some((c) => c.id === claimRef);
    return {
      all: workset.length,
      need: workset.filter(needsAction).length,
      today: workset.filter((c) => workMatch(c, 'today')).length,
      overdue: workset.filter((c) => workMatch(c, 'overdue')).length,
      later: workset.filter((c) => workMatch(c, 'later')).length,
      openTasks: data.tasks.filter((t) => t.done !== 'true' && inWs(t.claimId)).length,
      reminders: data.reminders.filter((r) => inWs(r.claimId)).length,
      newMail: data.notifs.filter((x) => x.type === 'gmail_auto' && x.read !== 'true').length,
      mailsToHandle: workset.reduce((n, c) => n + countUntreatedMails(c, data.alertCtx), 0),
      review: data.pending.filter((p) => !p.imported_at && String(p.decision) !== 'auto').length,
      waitingReply: workset.filter((c) => workMatch(c, 'waiting_reply')).length,
      waitingDocs: workset.filter((c) => workMatch(c, 'waiting_docs')).length,
      unassigned: workset.filter((c) => workMatch(c, 'unassigned')).length,
      noNext: workset.filter((c) => workMatch(c, 'no_next')).length,
      docsNeedsSort: workset.filter((c) => workMatch(c, 'docs_needs_sort')).length,
    };
  }, [workset, needsAction, workMatch, data.tasks, data.reminders, data.notifs, data.alertCtx, data.pending, mineOnly]);

  const insurers = [...new Set(data.claims.map((c) => c.insCompany).filter(Boolean))].sort();
  const insCounts = insurers.map((co) => [co, workset.filter((c) => c.insCompany === co).length] as const).filter(([, n]) => n > 0);
  const handlers = [...new Map(data.claims.filter((c) => c.assigned_to).map((c) => [c.assigned_to, c.assigned_to_name || c.assigned_to])).entries()];
  const statusCounts = STATUSES.map((s) => [s, workset.filter((c) => c.status === s).length] as const).filter(([, n]) => n > 0);

  const base = archive ? (mineOnly ? archived.filter(isMine) : archived) : workset;
  const list = base.filter((c) => (!stFil || c.status === stFil)
    && (!insFil || c.insCompany === insFil)
    && (!whoFil || (whoFil === '__none' ? !c.assigned_to : c.assigned_to === whoFil))
    && (!docsFil || docsOrderOf({ docsOrderStatus: c.docsOrderStatus }) === docsFil)
    && workMatch(c, workFil)
    && claimMatchesSearch(c, q));
  const sorted = list.slice().sort((a, b) => Number(needsAction(b)) - Number(needsAction(a)));

  const alertTab = (a: ClaimAlert): CardTab => (a.key === 'mail_action' || a.key === 'new_mail' ? 'mail' : a.key.startsWith('treat_') || a.key.startsWith('cust_') ? 'work' : a.key === 'garage_review' ? 'gallery' : 'mail');
  const chipsFor = (c: ClaimRecord) => (alertsOf.get(c.id) || []).slice(0, 3).map((a) => (
    <button type="button" key={a.key} className={`chip ${a.tone === 'need' ? 'c-need' : a.tone === 'wait' ? 'c-wait' : 'c-info'}`} title={a.why}
      onClick={(e) => { e.stopPropagation(); openClaim(c.id, alertTab(a)); }}>{a.label}</button>
  ));

  const table = (rows: ClaimRecord[]) => (
    <>
      <div className="v2-table-wrap">
        <table>
          <thead><tr><th>מספר תביעה</th><th>לקוח</th><th>רכב</th><th>חברת ביטוח</th><th>סטטוס</th><th>מטפל</th><th>טיפול אחרון</th><th>טיפול הבא</th><th>מה פתוח</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} tabIndex={0} onClick={() => openClaim(c.id)} onKeyDown={(e) => { if (e.key === 'Enter') openClaim(c.id); }}>
                <td className="num">{displayClaimNum({ claimNum: c.claimNum })}</td>
                <td><b>{c.clientName || '—'}</b></td>
                <td className="num">{c.plate || '—'}</td>
                <td>{c.insCompany || '—'}</td>
                <td><span className="v2-pill">{c.status || '—'}</span></td>
                <td>{c.assigned_to_name || '—'}</td>
                <td className="num">
                  {c.lastTreatmentAt ? <button type="button" className="v2-btn ghost sm" style={{ padding: 0 }} title="להיסטוריה" onClick={(e) => { e.stopPropagation(); openClaim(c.id, 'history'); }}>{fmtDay(c.lastTreatmentAt)}</button> : '—'}
                </td>
                <td className="num">{fmtDay(c.nextDate) || '—'}</td>
                <td><div className="v2-chips">{chipsFor(c)}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="v2-mcards">
        {rows.map((c) => (
          <div key={c.id} role="button" tabIndex={0} className={`v2-mcard${needsAction(c) ? ' hot' : ''}`} onClick={() => openClaim(c.id)} onKeyDown={(e) => { if (e.key === 'Enter') openClaim(c.id); }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{c.clientName || '—'}</b><span className="v2-pill">{c.status || '—'}</span></div>
            <div className="v2-hint">{displayClaimNum({ claimNum: c.claimNum })} · {c.plate || '—'} · {c.insCompany || '—'}</div>
            <div className="v2-chips">{chipsFor(c)}</div>
            <div className="v2-hint">טיפול הבא {fmtDay(c.nextDate) || '—'}</div>
          </div>
        ))}
      </div>
      {rows.length === 0 ? <div className="v2-empty">{q ? 'לא נמצאו תיקים שמתאימים לחיפוש' : 'אין תיקים'}</div> : null}
    </>
  );

  const tile = (n: number, label: string, onClick?: () => void, tone = '') => (
    onClick
      ? <button type="button" className={`v2-tile ${tone}`} onClick={onClick}><b>{n}</b><span>{label}</span></button>
      : <div className={`v2-tile ${tone}`}><b>{n}</b><span>{label}</span></div>
  );

  const unread = data.notifs.filter((n) => n.read !== 'true');
  const openNotif = (n: ClaimRecord) => {
    setBell(false);
    if (n.type === 'gmail_review' || !n.claimId) { show('gmail'); return; }
    openClaim(n.claimId, n.type === 'gmail_auto' ? 'mail' : /מסמך/.test(String(n.message || '')) ? 'work' : 'details');
  };

  const topMore = (
    <Menu label="עוד ▾" align="start" testId="claims-v2-top-more" items={[
      { kind: 'title', label: 'כלים' },
      { kind: 'action', label: 'תבניות הודעות', onClick: () => setTemplates(true) },
      { kind: 'action', label: 'דוחות ניהול', onClick: () => show('reports') },
      { kind: 'action', label: 'משימות פתוחות – כל התיקים', onClick: () => show('tasks') },
      { kind: 'action', label: 'Gmail – חיבור ותור שיוך', onClick: () => show('gmail') },
      { kind: 'sep' },
      { kind: 'title', label: 'פעולות (בשלב הבא)' },
      { kind: 'locked', label: 'שלח טופס דיווח / פתיחת תיק ללקוח' },
      { kind: 'locked', label: 'סרוק מיילים נכנסים' },
      { kind: 'locked', label: 'סריקת מיילים יוצאים (תצוגה)', hint: 'גם "תצוגה" מעדכנת את חיבור Gmail בשרת – לכן לא מחובר' },
    ]} />
  );

  return (
    <div className="claims-v2">
      <div className="v2-trial">
        <span>ממשק חדש – ניסיון (STAGING). צפייה בלבד: לא נשמר ולא נשלח כלום מכאן. 🔒 = פעולה שעדיין לא מחוברת.</span>
        <button type="button" className="v2-btn sm" onClick={goOld} data-testid="claims-v2-back">חזרה לממשק הקיים</button>
      </div>
      <div className="v2-top">
        <button type="button" className="v2-icon" aria-label="תפריט" onClick={() => setDrawer(true)}>☰</button>
        <div className="v2-brand"><b>דליה</b><span>ניהול תביעות</span></div>
        <nav className="v2-nav" aria-label="ניווט">
          <button type="button" aria-current={view === 'dash' ? 'page' : undefined} onClick={() => show('dash')}>דשבורד</button>
          <button type="button" aria-current={view === 'list' || view === 'card' ? 'page' : undefined} onClick={() => openList()}>תיקים<span className="v2-cnt">{workset.length}</span></button>
          <button type="button" aria-current={view === 'tasks' ? 'page' : undefined} onClick={() => show('tasks')}>משימות</button>
        </nav>
        <div className="v2-top-end">
          <input className="v2-input v2-top-search" style={{ width: 220 }} placeholder="חיפוש תיק, לקוח, רכב…" aria-label="חיפוש תיקים" value={q}
            onChange={(e) => { setQ(e.target.value); if (view !== 'list') show('list'); }} />
          <div className="v2-menu-wrap v2-bell" ref={bellRef}>
            <button type="button" className="v2-btn sm" aria-expanded={bell} aria-label="התראות" onClick={() => setBell((v) => !v)} data-testid="claims-v2-bell">
              🔔{unread.length ? <span className="v2-cnt need">{unread.length}</span> : null}
            </button>
            {bell ? (
              <div className="v2-notif" role="dialog" aria-label="התראות">
                <div className="v2-notif-h"><b>התראות ({unread.length})</b><Locked label="סמן הכל כנקרא" /></div>
                {unread.length === 0 ? <div className="v2-empty">אין התראות</div> : unread.map((n) => {
                  const c = data.claims.find((x) => x.id === n.claimId);
                  return (
                    <button type="button" key={n.id} className="v2-notif-row" onClick={() => openNotif(n)}>
                      <b>{n.type === 'gmail_auto' ? 'מייל שויך לתיק' : n.type === 'gmail_review' ? 'מייל לבדיקת שיוך' : (n.type || 'התראה')}{c ? ` · ${c.clientName || displayClaimNum({ claimNum: c.claimNum })}` : ''}</b>
                      <span className="v2-hint" style={{ whiteSpace: 'pre-line' }}>{String(n.message || '').slice(0, 220)}</span>
                      <span className="v2-hint">{n.createdAt || ''}</span>
                    </button>
                  );
                })}
                <div className="v2-note" style={{ margin: 8 }}>פתיחת התראה כאן לא מסמנת אותה כנקראה.</div>
              </div>
            ) : null}
          </div>
          <button type="button" className="v2-btn sm" onClick={() => void data.loadAll()} disabled={data.loading}>{data.loading ? 'טוען…' : 'רענון'}</button>
          <span className="v2-top-search"><Locked label="＋ תיק חדש" className="v2-btn sm pri" /></span>
          <span className="v2-top-search">{topMore}</span>
        </div>
      </div>

      <div className="v2-scroll">
        {data.error ? <div className="v2-err">{data.error}</div> : null}
        {data.loading && !data.claims.length ? <div className="v2-empty">טוען תיקים…</div> : null}

        {view === 'dash' && !(data.loading && !data.claims.length) ? (
          <>
            <div className="v2-lh">
              <h2>{mineOnly ? 'התביעות שלי' : 'דשבורד'}</h2>
              {isSuperAdmin ? (
                <div className="v2-seg" role="group" aria-label="היקף">
                  <button type="button" aria-pressed={!mineOnly} onClick={() => setMineOnly(false)}>כל התביעות</button>
                  <button type="button" aria-pressed={mineOnly} onClick={() => setMineOnly(true)}>שלי</button>
                </div>
              ) : null}
              <span className="v2-hint">{actor.full_name}</span>
            </div>
            <div className="v2-tiles">
              {tile(counts.all, mineOnly ? 'התביעות שלי' : 'כל התביעות', () => openList())}
              {tile(counts.need, 'דורשים פעולה', () => openList({ work: 'need' }), 'need')}
              {tile(counts.today, 'דורשות טיפול היום', () => openList({ work: 'today' }), 'wait')}
              {tile(counts.overdue, 'טיפול באיחור', () => openList({ work: 'overdue' }), 'need')}
              {tile(counts.later, 'טיפול בהמשך', () => openList({ work: 'later' }))}
              {tile(counts.mailsToHandle, 'מיילים שמסומנים לטיפול', () => openList({ work: 'need' }), 'need')}
              {tile(counts.newMail, 'מיילים חדשים (התראות)', () => setBell(true))}
              {tile(counts.review, 'דורשים בדיקת שיוך', () => show('gmail'), 'wait')}
              {tile(counts.openTasks, 'משימות פתוחות', () => show('tasks'))}
              {tile(counts.reminders, 'תזכורות', () => openList({ work: 'reminders' }))}
              {tile(counts.waitingReply, 'ממתינים לתשובה', () => openList({ work: 'waiting_reply' }), 'wait')}
              {tile(counts.waitingDocs, 'ממתינים למסמכים', () => openList({ work: 'waiting_docs' }), 'wait')}
              {tile(counts.unassigned, 'ללא עובד מטפל', () => openList({ work: 'unassigned' }))}
              {tile(counts.noNext, 'ללא פעולה הבאה', () => openList({ work: 'no_next' }), 'wait')}
              {tile(counts.docsNeedsSort, 'דורשים סידור מסמכים', () => openList({ work: 'docs_needs_sort' }))}
              {tile(archived.length, 'בארכיון', () => openList({ archive: true }))}
            </div>
            <div className="v2-sec-h">חברות ביטוח<span className="ln" /></div>
            <div className="v2-status" style={{ marginTop: 8 }}>
              {insCounts.map(([co, n]) => <button key={co} type="button" aria-pressed="false" onClick={() => openList({ ins: co })}>{co}<span className="v2-cnt">{n}</span></button>)}
            </div>
            <div className="v2-sec-h" style={{ marginTop: 10 }}>לפי סטטוס<span className="ln" /></div>
            <div className="v2-status" style={{ marginTop: 8 }}>
              {statusCounts.map(([s, n]) => <button key={s} type="button" aria-pressed="false" onClick={() => openList({ status: s })}>{s}<span className="v2-cnt">{n}</span></button>)}
            </div>
            <div className="v2-sec-h" style={{ marginTop: 10 }}>תיקים שדורשים פעולה<span className="ln" /></div>
            <div style={{ marginTop: 8 }}>{table(workset.filter(needsAction).slice(0, 25))}</div>
          </>
        ) : null}

        {view === 'list' ? (
          <>
            <div className="v2-lh">
              <h2>{archive ? 'תיקים בארכיון' : workFil ? WORK_LABEL[workFil] : mineOnly ? 'התביעות שלי' : 'תיקים פעילים'}</h2>
              <div className="v2-seg" role="group" aria-label="פעילים או ארכיון">
                <button type="button" aria-pressed={!archive} onClick={() => setArchive(false)}>פעילים<span className="v2-cnt">{workset.length}</span></button>
                <button type="button" aria-pressed={archive} onClick={() => setArchive(true)}>ארכיון<span className="v2-cnt">{archived.length}</span></button>
              </div>
              {isSuperAdmin ? (
                <div className="v2-seg" role="group" aria-label="היקף">
                  <button type="button" aria-pressed={!mineOnly} onClick={() => setMineOnly(false)}>הכול</button>
                  <button type="button" aria-pressed={mineOnly} onClick={() => setMineOnly(true)}>שלי</button>
                </div>
              ) : null}
              <input className="v2-input" style={{ width: 190 }} placeholder="חיפוש…" aria-label="חיפוש בתיקים" value={q} onChange={(e) => setQ(e.target.value)} />
              <select className="v2-input" aria-label="חברת ביטוח" value={insFil} onChange={(e) => setInsFil(e.target.value)}>
                <option value="">כל חברות הביטוח</option>{insurers.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              <select className="v2-input" aria-label="עובד מטפל" value={whoFil} onChange={(e) => setWhoFil(e.target.value)}>
                <option value="">כל העובדים</option><option value="__none">ללא עובד מטפל</option>
                {handlers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
              <select className="v2-input" aria-label="מצב מסמכים" value={docsFil} onChange={(e) => setDocsFil(e.target.value)}>
                <option value="">כל מצב המסמכים</option>{DOCS_ORDER.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
              {workFil ? <button type="button" className="v2-btn sm" onClick={() => setWorkFil('')}>נקה "{WORK_LABEL[workFil]}"</button> : null}
              <Menu label="עוד ▾" align="end" items={[
                { kind: 'title', label: 'פעולות על כמה תיקים (בשלב הבא)' },
                { kind: 'locked', label: 'בחירה מרובה' },
                { kind: 'locked', label: 'שייך לעובד תביעות' },
                { kind: 'locked', label: 'העבר לארכיון' },
                { kind: 'locked', label: 'מחיקה (soft)' },
              ]} />
            </div>
            <div className="v2-status" role="group" aria-label="סינון לפי סטטוס">
              <button type="button" aria-pressed={!stFil} onClick={() => setStFil('')}>כל הסטטוסים<span className="v2-cnt">{base.length}</span></button>
              {STATUSES.map((s) => {
                const n = base.filter((c) => c.status === s).length;
                if (!n && stFil !== s) return null;
                return <button key={s} type="button" aria-pressed={stFil === s} onClick={() => setStFil(stFil === s ? '' : s)}>{s}<span className="v2-cnt">{n}</span></button>;
              })}
            </div>
            {table(sorted)}
          </>
        ) : null}

        {view === 'tasks' ? <V2TasksView tasks={data.tasks} claims={data.claims} onOpen={(id) => openClaim(id, 'work')} /> : null}
        {view === 'reports' ? <V2ReportsView reports={data.reports} onOpen={(id) => openClaim(id)} /> : null}
        {view === 'gmail' ? <V2GmailView gmail={data.gmail} pending={data.pending} claims={data.claims} isSuperAdmin={isSuperAdmin} onOpen={(id) => openClaim(id, 'mail')} /> : null}

        {view === 'card' ? (
          cur ? (
            <V2ClaimCard
              key={cur.id}
              claim={cur}
              initialTab={tabParam || undefined}
              card={data.card && data.card.claimId === cur.id ? data.card : null}
              loading={data.cardLoading}
              alertCtx={data.alertCtx}
              ownMailbox={data.ownMailbox}
              pending={data.pending}
              isSuperAdmin={isSuperAdmin}
              signedUrls={data.signedUrls}
              signedUrl={data.signedUrl}
              revealLink={data.revealLink}
              reports={data.reports}
              onBack={() => openList()}
              onOldUi={goOld}
            />
          ) : data.loading ? <div className="v2-empty">טוען…</div> : <div className="v2-empty">התיק לא נמצא. <button type="button" className="v2-btn sm" onClick={() => openList()}>לרשימת התיקים</button></div>
        ) : null}
      </div>

      <div className="v2-bottom"><button type="button" className="v2-btn" onClick={goOld}>חזרה לממשק הקיים</button></div>

      {templates ? <V2TemplatesModal reports={data.reports} claims={workset} onClose={() => setTemplates(false)} /> : null}

      {drawer ? (
        <>
          <div className="v2-drawer-ov" onClick={() => setDrawer(false)} />
          <div className="v2-drawer" role="dialog" aria-label="תפריט">
            <div className="v2-drawer-sec" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <b style={{ padding: '4px 8px' }}>תפריט</b>
              <button type="button" className="v2-btn ghost sm" onClick={() => setDrawer(false)} aria-label="סגור">✕</button>
            </div>
            <div className="v2-drawer-sec">
              <button type="button" onClick={() => show('dash')}>דשבורד</button>
              <button type="button" onClick={() => openList()}>תיקים פעילים<span className="v2-cnt">{workset.length}</span></button>
              <button type="button" onClick={() => openList({ work: 'need' })}>דורשים פעולה<span className="v2-cnt need">{counts.need}</span></button>
              <button type="button" onClick={() => show('tasks')}>משימות פתוחות<span className="v2-cnt">{counts.openTasks}</span></button>
              <button type="button" onClick={() => { setDrawer(false); setBell(true); }}>התראות<span className="v2-cnt">{unread.length}</span></button>
            </div>
            <div className="v2-drawer-sec">
              <span className="lbl">לפי סטטוס</span>
              {statusCounts.map(([s, n]) => <button key={s} type="button" onClick={() => openList({ status: s })}>{s}<span className="v2-cnt">{n}</span></button>)}
              <button type="button" onClick={() => openList({ archive: true })}>ארכיון<span className="v2-cnt">{archived.length}</span></button>
            </div>
            <div className="v2-drawer-sec">
              <span className="lbl">כלים</span>
              <button type="button" onClick={() => { setDrawer(false); setTemplates(true); }}>תבניות הודעות</button>
              <button type="button" onClick={() => show('reports')}>דוחות ניהול</button>
              <button type="button" onClick={() => show('gmail')}>Gmail – חיבור ותור שיוך</button>
              <button type="button" disabled className="v2-locked">＋ תיק חדש 🔒</button>
              <button type="button" disabled className="v2-locked">שלח טופס דיווח ללקוח 🔒</button>
            </div>
            <div className="v2-drawer-sec">
              <button type="button" onClick={goOld}>חזרה לממשק הקיים</button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
