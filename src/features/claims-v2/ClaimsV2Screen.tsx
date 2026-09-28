import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { displayClaimNum, STATUSES, type ClaimRecord, type ClaimsActor } from '@/features/claims/claimsConstants';
import { buildClaimRowAlerts, countUntreatedMails } from '@/features/claims/claimWorkAlerts';
import { claimMatchesSearch } from '@/features/claims/claimSearch';
import { useClaimsV2Data } from './useClaimsV2Data';
import V2ClaimCard from './V2ClaimCard';
import { fmtDay } from './v2Model';
import './claims-v2.css';

type View = 'dash' | 'list' | 'card';

export default function ClaimsV2Screen({ actor }: { actor: ClaimsActor }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const data = useClaimsV2Data(actor);
  const claimId = params.get('claim') || '';
  const [view, setView] = useState<View>(claimId ? 'card' : 'dash');
  const [archive, setArchive] = useState(false);
  const [stFil, setStFil] = useState('');
  const [insFil, setInsFil] = useState('');
  const [whoFil, setWhoFil] = useState('');
  const [needOnly, setNeedOnly] = useState(false);
  const [q, setQ] = useState('');
  const [drawer, setDrawer] = useState(false);
  const goOld = () => navigate('/claims');

  const cur = data.claims.find((c) => c.id === claimId) || null;
  const { loadCard } = data;
  useEffect(() => {
    if (claimId) void loadCard(claimId);
  }, [claimId, loadCard]);

  const openClaim = (id: string) => { setParams({ claim: id }); setView('card'); setDrawer(false); };
  const show = (v: View) => { if (v !== 'card') setParams({}); setView(v); setDrawer(false); };

  const active = useMemo(() => data.claims.filter((c) => c.archived !== 'true'), [data.claims]);
  const archived = useMemo(() => data.claims.filter((c) => c.archived === 'true'), [data.claims]);
  const alertsOf = useMemo(() => {
    const m = new Map<string, ReturnType<typeof buildClaimRowAlerts>>();
    for (const c of data.claims) m.set(c.id, buildClaimRowAlerts(c, data.alertCtx));
    return m;
  }, [data.claims, data.alertCtx]);
  const needsAction = (c: ClaimRecord) => (alertsOf.get(c.id) || []).some((a) => a.tone === 'need');
  const mailsToHandle = active.reduce((n, c) => n + countUntreatedMails(c, data.alertCtx), 0);
  const statusCounts = STATUSES.map((s) => [s, active.filter((c) => c.status === s).length] as const).filter(([, n]) => n > 0);
  const insurers = [...new Set(data.claims.map((c) => c.insCompany).filter(Boolean))].sort();
  const handlers = [...new Map(data.claims.filter((c) => c.assigned_to).map((c) => [c.assigned_to, c.assigned_to_name || c.assigned_to])).entries()];

  const base = archive ? archived : active;
  const list = base.filter((c) => (!stFil || c.status === stFil)
    && (!insFil || c.insCompany === insFil)
    && (!whoFil || (whoFil === '__none' ? !c.assigned_to : c.assigned_to === whoFil))
    && (!needOnly || needsAction(c))
    && claimMatchesSearch(c, q));
  const sorted = list.slice().sort((a, b) => Number(needsAction(b)) - Number(needsAction(a)));

  const chipsFor = (c: ClaimRecord) => (alertsOf.get(c.id) || []).slice(0, 3).map((a) => (
    <span key={a.key} className={`chip ${a.tone === 'need' ? 'c-need' : a.tone === 'wait' ? 'c-wait' : 'c-info'}`} title={a.why}>{a.label}</span>
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
                <td className="num">{fmtDay(c.lastTreatmentAt) || '—'}</td>
                <td className="num">{fmtDay(c.nextDate) || '—'}</td>
                <td><div className="v2-chips">{chipsFor(c)}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="v2-mcards">
        {rows.map((c) => (
          <button type="button" key={c.id} className={`v2-mcard${needsAction(c) ? ' hot' : ''}`} onClick={() => openClaim(c.id)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{c.clientName || '—'}</b><span className="v2-pill">{c.status || '—'}</span></div>
            <div className="v2-hint">{displayClaimNum({ claimNum: c.claimNum })} · {c.plate || '—'} · {c.insCompany || '—'}</div>
            <div className="v2-chips">{chipsFor(c)}</div>
            <div className="v2-hint">טיפול הבא {fmtDay(c.nextDate) || '—'}</div>
          </button>
        ))}
      </div>
      {rows.length === 0 ? <div className="v2-empty">{q ? 'לא נמצאו תיקים שמתאימים לחיפוש' : 'אין תיקים'}</div> : null}
    </>
  );

  return (
    <div className="claims-v2">
      <div className="v2-trial">
        <span>ממשק חדש – ניסיון (STAGING). צפייה בלבד: לא נשמר ולא נשלח כלום מכאן.</span>
        <button type="button" className="v2-btn sm" onClick={goOld} data-testid="claims-v2-back">חזרה לממשק הקיים</button>
      </div>
      <div className="v2-top">
        <button type="button" className="v2-icon" aria-label="תפריט" onClick={() => setDrawer(true)}>☰</button>
        <div className="v2-brand"><b>דליה</b><span>ניהול תביעות</span></div>
        <nav className="v2-nav" aria-label="ניווט">
          <button type="button" aria-current={view === 'dash' ? 'page' : undefined} onClick={() => show('dash')}>דשבורד</button>
          <button type="button" aria-current={view !== 'dash' ? 'page' : undefined} onClick={() => show('list')}>תיקים<span className="v2-cnt">{active.length}</span></button>
        </nav>
        <div className="v2-top-end">
          <input className="v2-input v2-top-search" style={{ width: 230 }} placeholder="חיפוש תיק, לקוח, רכב…" aria-label="חיפוש תיקים" value={q}
            onChange={(e) => { setQ(e.target.value); if (view !== 'list') show('list'); }} />
          <button type="button" className="v2-btn sm" onClick={() => void data.loadAll()} disabled={data.loading}>{data.loading ? 'טוען…' : 'רענון'}</button>
        </div>
      </div>

      <div className="v2-scroll">
        {data.error ? <div className="v2-err">{data.error}</div> : null}
        {data.loading && !data.claims.length ? <div className="v2-empty">טוען תיקים…</div> : null}

        {view === 'dash' && !(data.loading && !data.claims.length) ? (
          <>
            <div className="v2-lh"><h2>דשבורד</h2><span className="v2-hint">{actor.full_name}</span></div>
            <div className="v2-tiles">
              <button type="button" className="v2-tile" onClick={() => { setArchive(false); setStFil(''); setNeedOnly(false); show('list'); }}><b>{active.length}</b><span>תיקים פעילים</span></button>
              <button type="button" className="v2-tile need" onClick={() => { setArchive(false); setStFil(''); setNeedOnly(true); show('list'); }}><b>{active.filter(needsAction).length}</b><span>תיקים שדורשים פעולה</span></button>
              <div className="v2-tile need"><b>{mailsToHandle}</b><span>מיילים שמסומנים לטיפול</span></div>
              <div className="v2-tile wait"><b>{data.pending.filter((p) => !p.imported_at && String(p.decision) !== 'auto').length}</b><span>מיילים שממתינים לשיוך (בממשק הקיים)</span></div>
              <div className="v2-tile"><b>{data.tasks.filter((t) => t.done !== 'true').length}</b><span>משימות פתוחות</span></div>
              <div className="v2-tile"><b>{data.reminders.length}</b><span>תזכורות</span></div>
              <button type="button" className="v2-tile" onClick={() => { setArchive(false); setWhoFil('__none'); show('list'); }}><b>{active.filter((c) => !c.assigned_to).length}</b><span>ללא עובד מטפל</span></button>
              <button type="button" className="v2-tile" onClick={() => { setArchive(true); setStFil(''); show('list'); }}><b>{archived.length}</b><span>בארכיון</span></button>
            </div>
            <div className="v2-sec-h">לפי סטטוס<span className="ln" /></div>
            <div className="v2-status" style={{ marginTop: 8 }}>
              {statusCounts.map(([s, n]) => <button key={s} type="button" aria-pressed="false" onClick={() => { setArchive(false); setStFil(s); setNeedOnly(false); show('list'); }}>{s}<span className="v2-cnt">{n}</span></button>)}
            </div>
            <div className="v2-sec-h" style={{ marginTop: 10 }}>תיקים שדורשים פעולה<span className="ln" /></div>
            <div style={{ marginTop: 8 }}>{table(active.filter(needsAction).slice(0, 25))}</div>
          </>
        ) : null}

        {view === 'list' ? (
          <>
            <div className="v2-lh">
              <h2>{archive ? 'תיקים בארכיון' : needOnly ? 'תיקים שדורשים פעולה' : 'תיקים פעילים'}</h2>
              <div className="v2-seg" role="group" aria-label="פעילים או ארכיון">
                <button type="button" aria-pressed={!archive} onClick={() => setArchive(false)}>פעילים<span className="v2-cnt">{active.length}</span></button>
                <button type="button" aria-pressed={archive} onClick={() => setArchive(true)}>ארכיון<span className="v2-cnt">{archived.length}</span></button>
              </div>
              <input className="v2-input" style={{ width: 200 }} placeholder="חיפוש…" aria-label="חיפוש בתיקים" value={q} onChange={(e) => setQ(e.target.value)} />
              <select className="v2-input" aria-label="חברת ביטוח" value={insFil} onChange={(e) => setInsFil(e.target.value)}>
                <option value="">כל חברות הביטוח</option>{insurers.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              <select className="v2-input" aria-label="עובד מטפל" value={whoFil} onChange={(e) => setWhoFil(e.target.value)}>
                <option value="">כל העובדים</option><option value="__none">ללא עובד מטפל</option>
                {handlers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
              {needOnly ? <button type="button" className="v2-btn sm" onClick={() => setNeedOnly(false)}>הצג את כל התיקים</button> : null}
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

        {view === 'card' ? (
          cur ? (
            <V2ClaimCard
              key={cur.id}
              claim={cur}
              card={data.card && data.card.claimId === cur.id ? data.card : null}
              loading={data.cardLoading}
              alertCtx={data.alertCtx}
              ownMailbox={data.ownMailbox}
              pending={data.pending}
              signedUrls={data.signedUrls}
              signedUrl={data.signedUrl}
              onBack={() => show('list')}
              onOldUi={goOld}
            />
          ) : data.loading ? <div className="v2-empty">טוען…</div> : <div className="v2-empty">התיק לא נמצא. <button type="button" className="v2-btn sm" onClick={() => show('list')}>לרשימת התיקים</button></div>
        ) : null}
      </div>

      <div className="v2-bottom"><button type="button" className="v2-btn" onClick={goOld}>חזרה לממשק הקיים</button></div>

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
              <button type="button" onClick={() => { setArchive(false); setStFil(''); show('list'); }}>תיקים פעילים<span className="v2-cnt">{active.length}</span></button>
              <button type="button" onClick={() => { setArchive(false); setNeedOnly(true); show('list'); }}>דורשים פעולה<span className="v2-cnt need">{active.filter(needsAction).length}</span></button>
            </div>
            <div className="v2-drawer-sec">
              <span className="lbl">לפי סטטוס</span>
              {statusCounts.map(([s, n]) => <button key={s} type="button" onClick={() => { setArchive(false); setStFil(s); setNeedOnly(false); show('list'); }}>{s}<span className="v2-cnt">{n}</span></button>)}
              <button type="button" onClick={() => { setArchive(true); setStFil(''); show('list'); }}>ארכיון<span className="v2-cnt">{archived.length}</span></button>
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

