import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CLAIM_KINDS, CLOSE_REASONS, DOC_PRESETS, MANDATORY_STATUSES, STATUSES, type ClaimRecord, type ClaimsActor, type ClaimsVehicleHit } from './claimsConstants';
import { createClaimsApi, type ClaimsApi, type MailFollowupRow } from './claimsService';
import './claims.css';

const ST_CSS: Record<string, string> = {
  'חדש': 's-new', 'ממתין לטיפול': 's-wait', 'בטיפול': 's-act',
  'ממתין לחברת ביטוח': 's-wait', 'ממתין לשמאי': 's-wait', 'ממתין למסמכים': 's-doc',
  'ממתין לתשלום': 's-pay', 'אושר לתשלום': 's-done', 'תשלום חלקי': 's-wait',
  'שולם': 's-done', 'נדחה': 's-rej', 'הועבר לטיפול משפטי': 's-leg',
  'בטיפול משפטי': 's-leg', 'הסתיים': 's-done',
};

const FC_MAP: Record<string, string> = {
  fc_name: 'clientName', fc_phone: 'clientPhone', fc_email: 'clientEmail',
  fc_plate: 'plate', fc_model: 'carModel', fc_co: 'insCompany', fc_coEmail: 'insEmail',
  fc_claimNum: 'claimNum', fc_insRepName: 'insRepName', fc_insRepPhone: 'insRepPhone',
  fc_insRepEmail: 'insRepEmail', fc_surv: 'surveyor', fc_survPhone: 'survPhone',
  fc_survEmail: 'survEmail', fc_amount: 'finAmount', fc_approved: 'finApproved',
  fc_paid: 'finPaid', fc_payDate: 'finPayDate', fc_ref: 'finRef',
  fc_nextAction: 'nextAction', fc_nextDate: 'nextDate', fc_notes: 'notes',
  fc_legalReason: 'legalReason', fc_legalLawyer: 'legalLawyer', fc_legalFirm: 'legalFirm',
  fc_legalPhone: 'legalPhone', fc_legalEmail: 'legalEmail', fc_legalDate: 'legalDate',
  fc_legalNotes: 'legalNotes',
  fc_kind: 'claimKind', fc_eventDate: 'eventDate', fc_policyNum: 'policyNum',
  fc_thirdParty: 'thirdParty', fc_thirdPlate: 'thirdPlate', fc_thirdPhone: 'thirdPhone', fc_thirdEmail: 'thirdEmail',
};

function stBadge(s: string) {
  return <span className={`st ${ST_CSS[s] || 's-def'}`}>{s}</span>;
}
function fmt(v: unknown) {
  return `${(Number(v) || 0).toLocaleString('he-IL')}₪`;
}
function fmtWhen(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('he-IL');
}
function fuStatusHe(s: string) {
  const map: Record<string, string> = {
    scheduled: 'מתוזמן',
    completed: 'הושלם',
    cancelled: 'בוטל / נעצר',
    failed: 'נכשל',
    pending: 'ממתין',
    sending: 'בתהליך',
    dry_run_sent: 'Dry Run — לא נשלח',
  };
  return map[s] || s;
}
function toLocalInput(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function val(_form: HTMLFormElement | HTMLElement | null, id: string) {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  return (el?.value || '').trim();
}
function setVal(id: string, v: string) {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  if (el) el.value = v || '';
}

type ToastItem = { id: number; msg: string; type: string };

export function ClaimsScreen({ actor }: { actor: ClaimsActor }) {
  const apiRef = useRef<ClaimsApi>(createClaimsApi(actor));
  const [ready, setReady] = useState(false);
  const [sync, setSync] = useState<'ok' | 'pend' | 'err'>('ok');
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [notifs, setNotifs] = useState<ClaimRecord[]>([]);
  const [view, setView] = useState('dashboard');
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [stFil, setStFil] = useState('');
  const [curId, setCurId] = useState<string | null>(null);
  const [cardTab, setCardTab] = useState('comm');
  const [modal, setModal] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [gHits, setGHits] = useState<ClaimRecord[]>([]);
  const [gOpen, setGOpen] = useState(false);
  const [vehHits, setVehHits] = useState<ClaimsVehicleHit[]>([]);
  const [vehId, setVehId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [comm, setComm] = useState<ClaimRecord[]>([]);
  const [hist, setHist] = useState<ClaimRecord[]>([]);
  const [tasks, setTasks] = useState<ClaimRecord[]>([]);
  const [allTasks, setAllTasks] = useState<ClaimRecord[]>([]);
  const [reportHtml, setReportHtml] = useState('');
  const [inactive, setInactive] = useState<{ days: number; rows: ClaimRecord[] } | null>(null);
  const [sumText, setSumText] = useState('');
  const [exportText, setExportText] = useState('');
  const [tpl, setTpl] = useState<Record<string, { name: string; subject?: string; body: string }>>({});
  const [curTpl, setCurTpl] = useState('');
  const [reminders, setReminders] = useState<ClaimRecord[]>([]);
  const [mailFollowups, setMailFollowups] = useState<MailFollowupRow[]>([]);
  const [fuEditId, setFuEditId] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<Array<{ id: string; full_name: string; company_name: string }>>([]);
  const [docs, setDocs] = useState<{ requests: Array<{ id: string; label: string; status: string; received_at?: string }>; files: Array<{ id: string; doc_request_id: string | null; original_name: string; source: string; created_at: string; uploaded_by_name?: string; mime_type?: string; gmail_message_id?: string | null }> }>({ requests: [], files: [] });
  const [gmailStatus, setGmailStatus] = useState<{ connected?: boolean; email?: string | null; canConnect?: boolean }>({});
  const [gmailList, setGmailList] = useState<Array<Record<string, unknown>>>([]);
  const [gmailImports, setGmailImports] = useState<Array<Record<string, unknown>>>([]);
  const [gmailBusy, setGmailBusy] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [customDoc, setCustomDoc] = useState('');
  const [mineOnly, setMineOnly] = useState(actor.role !== 'super_admin');
  const [formKind, setFormKind] = useState<string>(CLAIM_KINDS[0]);
  const [dashTasks, setDashTasks] = useState<ClaimRecord[]>([]);
  const [dashRems, setDashRems] = useState<ClaimRecord[]>([]);
  const toastN = useRef(0);
  const isSuperAdmin = actor.role === 'super_admin';

  const toast = (msg: string, type = 'ok') => {
    const id = ++toastN.current;
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  };

  const loadAll = useCallback(async () => {
    setSync('pend');
    try {
      const [cr, nr, tr, rr] = await Promise.all([
        apiRef.current.getClaims(),
        apiRef.current.getNotifications(),
        apiRef.current.getTasks(null),
        apiRef.current.getReminders(null),
      ]);
      setClaims(cr.data || []);
      setNotifs(nr.data || []);
      setDashTasks((tr.data || []).filter((t) => t.done !== 'true'));
      setDashRems(rr.data || []);
      if (actor.role === 'super_admin') {
        const a = await apiRef.current.listAssignees();
        setAssignees(a.data || []);
      }
      setSync('ok');
    } catch {
      setSync('err');
    }
  }, []);

  useEffect(() => {
    apiRef.current = createClaimsApi(actor);
    if (!document.getElementById('claims-heebo')) {
      const l = document.createElement('link');
      l.id = 'claims-heebo';
      l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800;900&display=swap';
      document.head.appendChild(l);
    }
    (async () => {
      await loadAll();
      setReady(true);
    })();
  }, [actor.id, loadAll]);

  const unread = notifs.filter((n) => n.read !== 'true').length;
  const cur = claims.find((c) => c.id === curId) || null;
  const workset = mineOnly ? claims.filter((c) => c.assigned_to === actor.id) : claims;
  const cnt = (f: (x: ClaimRecord) => boolean) => workset.filter(f).length;

  const showView = (name: string, f = '') => {
    setView(name);
    setFilter(f);
    if (f) setStFil(f);
    if (name === 'tasks') {
      apiRef.current.getTasks(null).then((r) => setAllTasks((r.data || []).filter((t) => t.done !== 'true')));
    }
    if (name === 'gmail') {
      apiRef.current.invokeGmail('status').then((r) => setGmailStatus({
        connected: r.connected === true,
        email: typeof r.email === 'string' ? r.email : null,
        canConnect: r.canConnect === true,
      }));
    }
    if (name === 'reports') {
      apiRef.current.getReportData().then((r) => {
        if (!r.success) return;
        const s = r.summary;
        const html = [
          `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(165px,1fr));gap:10px;margin-bottom:18px">`,
          [['b', 'תיקים פתוחים', s.open], ['p', 'בטיפול משפטי', s.legal],
            ['b', 'סכום תביעות', fmt(s.totalAmt)], ['y', 'סכום אושר', fmt(s.totalAppr)],
            ['g', 'שולם', fmt(s.totalPaid)], ['r', 'יתרה', fmt(s.balance)]]
            .map((x) => `<div style="background:var(--bg2);border:1px solid var(--br);border-radius:var(--r);padding:13px"><div style="font-size:10px;color:var(--t3);font-weight:700;margin-bottom:4px">${x[1]}</div><div style="font-size:20px;font-weight:800">${x[2]}</div></div>`).join(''),
          `</div>`,
          `<div class="sdiv"><div class="sdiv-t">לפי חברת ביטוח</div><div class="sdiv-l"></div></div>`,
          `<div class="tw"><table><thead><tr><th>חברת ביטוח</th><th>תיקים</th><th>סכום</th><th>שולם</th><th>משפטי</th></tr></thead><tbody>`,
          Object.entries(r.byCompany || {}).sort((a, b) => b[1].count - a[1].count)
            .map((e) => `<tr><td>${e[0]}</td><td>${e[1].count}</td><td>${fmt(e[1].amt)}</td><td>${fmt(e[1].paid)}</td><td>${e[1].legal || 0}</td></tr>`).join(''),
          `</tbody></table></div>`,
        ].join('');
        setReportHtml(html);
      });
    }
  };

  const loadCardData = async (id: string) => {
    const [c, h, t, rem, d, fu, gi] = await Promise.all([
      apiRef.current.getCommLog(id),
      apiRef.current.getHistory(id),
      apiRef.current.getTasks(id),
      apiRef.current.getReminders(id),
      apiRef.current.invokeDocs('list_docs', { claim_id: id }),
      apiRef.current.listMailFollowups(id),
      apiRef.current.invokeGmail('list_imports', { claim_id: id }),
    ]);
    setComm(c.data || []);
    setHist(h.data || []);
    setTasks((t.data || []).filter((x) => x.done !== 'true'));
    setReminders(rem.data || []);
    setMailFollowups(fu.data || []);
    setGmailImports((gi.data as Array<Record<string, unknown>>) || []);
    setDocs({
      requests: (d.requests as typeof docs.requests) || [],
      files: (d.files as typeof docs.files) || [],
    });
  };

  const openMailFollowupModal = async (edit?: MailFollowupRow | null) => {
    setFuEditId(edit?.id || null);
    setModal('moMailFu');
    const c = cur;
    const filled = c ? await apiRef.current.fillTemplate('status_request', {
      ...c,
      claimNum: c.claimNum || c.id,
      clientName: c.clientName || '',
      plate: c.plate || '',
      eventDate: c.eventDate || '',
    }) : { subject: '', body: '' };
    setTimeout(() => {
      if (edit) {
        setVal('fu_to', edit.mail_to);
        setVal('fu_subj', edit.mail_subject);
        setVal('fu_body', edit.mail_body);
        setVal('fu_kind', edit.mail_kind);
        setVal('fu_repeat', edit.repeat_every_days || '7');
        setVal('fu_when', toLocalInput(edit.next_run_at) || toLocalInput(new Date(Date.now() + 3600000).toISOString()));
        setVal('fu_stop', toLocalInput(edit.stop_at));
        setVal('fu_attach', edit.attach_mode || 'none');
      } else {
        setVal('fu_to', c?.insEmail || c?.insRepEmail || '');
        setVal('fu_subj', filled.subject || '');
        setVal('fu_body', filled.body || '');
        setVal('fu_kind', 'email_once');
        setVal('fu_repeat', '7');
        setVal('fu_when', toLocalInput(new Date(Date.now() + 3600000).toISOString()));
        setVal('fu_stop', '');
        setVal('fu_attach', 'none');
      }
    }, 0);
  };

  const openCard = async (id: string) => {
    setCurId(id);
    setCardTab('claim');
    setModal('moCard');
    setLinkUrl('');
    await loadCardData(id);
  };

  const collectClaimForm = (): Record<string, string> => {
    const data: Record<string, string> = {
      id: (document.getElementById('fc_id') as HTMLInputElement)?.value || '',
      status: val(null, 'fc_status'),
      vehicle_id: vehId,
      company_name: companyName,
    };
    Object.entries(FC_MAP).forEach(([fid, key]) => {
      data[key] = val(null, fid);
    });
    return data;
  };

  const openNew = () => {
    Object.keys(FC_MAP).forEach((fid) => setVal(fid, ''));
    setVal('fc_id', '');
    setVal('fc_status', 'חדש');
    setVal('fc_kind', CLAIM_KINDS[0]);
    setFormKind(CLAIM_KINDS[0]);
    setVehId('');
    setCompanyName('');
    setVehHits([]);
    setModal('moClaim');
  };

  const startEdit = (id: string) => {
    const c = claims.find((x) => x.id === id);
    if (!c) return;
    Object.entries(FC_MAP).forEach(([fid, key]) => setVal(fid, c[key] || ''));
    setVal('fc_id', c.id);
    setVal('fc_status', c.status || 'חדש');
    setFormKind(c.claimKind || CLAIM_KINDS[0]);
    setVehId(c.vehicle_id || '');
    setCompanyName(c.company_name || '');
    setModal('moClaim');
  };

  const doSaveClaim = async () => {
    const data = collectClaimForm();
    if (!data.clientName) { toast('נא להזין שם לקוח', 'err'); return; }
    setSync('pend');
    const r = await apiRef.current.saveClaim(data);
    if (r.success) {
      setModal(null);
      await loadAll();
      toast('תיק נשמר ✅');
    } else {
      setSync('err');
      toast(`שגיאה: ${r.error || ''}`, 'err');
    }
  };

  const searchVehicles = async (q: string) => {
    const r = await apiRef.current.searchVehicles(q);
    setVehHits(r.data || []);
  };

  const pickVehicle = (v: ClaimsVehicleHit) => {
    setVehId(v.id);
    setCompanyName(v.company_name || '');
    setVal('fc_plate', v.license_plate || '');
    const model = [v.manufacturer, v.model].filter(Boolean).join(' ');
    if (model) setVal('fc_model', model);
    setVehHits([]);
  };

  const saveStatus = async (newSt: string, note: string) => {
    if (!cur) return;
    if (MANDATORY_STATUSES.includes(newSt) && !note) {
      setModal('moMandNote');
      setVal('mandNote', '');
      (document.getElementById('mandNoteTitle') as HTMLElement | null);
      return;
    }
    setSync('pend');
    const r = await apiRef.current.saveClaim({ ...cur, status: newSt });
    if (r.success) {
      if (note) {
        await apiRef.current.saveCommEntry({ claimId: cur.id, type: 'note', body: note, note: `סטטוס: ${newSt}` });
      }
      setModal('moCard');
      await loadAll();
      await openCard(cur.id);
      toast(`סטטוס עודכן: ${newSt}`);
    }
  };

  const pendingStatus = useRef('');

  const list = useMemo(() => claims.filter((c) => {
    if (mineOnly && c.assigned_to !== actor.id) return false;
    if (search && JSON.stringify(c).toLowerCase().indexOf(search.toLowerCase()) === -1) return false;
    if (stFil && c.status !== stFil) return false;
    if (filter && c.status !== filter) return false;
    return true;
  }), [claims, search, stFil, filter, mineOnly, actor.id]);

  const openDash = workset.filter((x) => x.status !== 'הסתיים' && x.status !== 'שולם').slice(0, 10);
  const myTasks = dashTasks.filter((t) => !mineOnly || workset.some((c) => c.id === t.claimId)).slice(0, 8);
  const myRems = dashRems.filter((r) => !mineOnly || workset.some((c) => c.id === r.claimId)).slice(0, 8);

  if (!ready) {
    return (
      <div className="claims-root" style={{ position: 'relative' }}>
        <div className="ls">
          <div className="ls-logo"><span>דליה</span> ניהול תביעות</div>
          <div className="ls-bar"><div className="ls-fill" style={{ width: '70%' }} /></div>
          <div className="ls-step">טוען נתונים...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="claims-root" style={{ position: 'relative' }}>
      {notifOpen && (
        <div className="notif-panel" style={{ display: 'block' }}>
          <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--br)', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700 }}>🔔 התראות</span>
            <button className="btn btn-g btn-sm" onClick={() => { apiRef.current.markAllNotificationsRead(); setNotifs((n) => n.map((x) => ({ ...x, read: 'true' }))); }}>סמן הכל כנקרא</button>
          </div>
          {notifs.length === 0 ? <div style={{ padding: 16, textAlign: 'center', color: 'var(--t3)' }}>אין התראות</div>
            : notifs.map((n) => (
              <div key={n.id} className={`notif-item ${n.read === 'true' ? '' : 'unread'}`} onClick={() => { apiRef.current.markNotificationRead(n.id); setNotifs((xs) => xs.map((x) => x.id === n.id ? { ...x, read: 'true' } : x)); if (n.claimId) openCard(n.claimId); }}>
                <div>{n.message}</div>
                <div style={{ fontSize: 10, color: 'var(--t3)' }}>{n.createdAt}</div>
              </div>
            ))}
        </div>
      )}

      <div className="app">
        <div className="tb">
          <div className="tb-logo"><span className="tba">דליה</span><span className="tbb">ניהול תביעות</span></div>
          <div className="tb-sep" />
          <div className="tb-nav">
            {[
              ['dashboard', '📊 דשבורד'],
              ['claims', '📋 תיקים'],
              ['gmail', '📧 Gmail'],
              ['tasks', '✅ משימות'],
              ['reports', '📈 דוחות'],
            ].map(([k, l]) => (
              <button key={k} className={`tbn ${view === k ? 'act' : ''}`} onClick={() => showView(k)}>
                {l}{k === 'claims' ? <span className="nb b">{workset.length}</span> : null}
              </button>
            ))}
            <button className="tbn" onClick={async () => {
              const r = await apiRef.current.getTemplates();
              setTpl(r.data || {});
              const first = Object.keys(r.data || {})[0] || '';
              setCurTpl(first);
              if (first && r.data?.[first]) {
                setVal('tpl_subj', r.data[first].subject || '');
                setVal('tpl_body', r.data[first].body || '');
              }
              setModal('moTemplates');
            }}>📝 תבניות</button>
          </div>
          <div className="tb-r">
            <div style={{ position: 'relative' }}>
              <input className="fi" placeholder="🔎 חיפוש גלובלי..." style={{ width: 200, padding: '5px 10px', fontSize: 11.5 }}
                onChange={async (e) => {
                  const q = e.target.value;
                  if (q.length < 2) { setGOpen(false); return; }
                  const r = await apiRef.current.globalSearch(q);
                  setGHits(r.data || []);
                  setGOpen(true);
                }} />
              {gOpen && (
                <div className="veh-drop" style={{ position: 'absolute', left: 0, top: '110%', width: 320, zIndex: 600 }}>
                  {gHits.map((c) => (
                    <div key={c.id} className="veh-item" onClick={() => { setGOpen(false); openCard(c.id); }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{c.clientName}</b>{stBadge(c.status)}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--t3)' }}>{c.id} · {c.plate} · {c.insCompany}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button className="bell-btn" onClick={() => setNotifOpen((v) => !v)}>🔔{unread > 0 && <span className="bell-badge">{unread}</span>}</button>
            <button className="sync-btn" onClick={() => loadAll()}>
              <div className={`sdot ${sync === 'pend' ? 'pend' : sync === 'err' ? 'err' : ''}`} />
              <span>{sync === 'pend' ? 'מסנכרן...' : sync === 'err' ? 'שגיאה' : 'מסונכרן'}</span>
            </button>
            <button className="btn btn-p btn-sm" onClick={openNew}>＋ תיק חדש</button>
          </div>
        </div>

        <div className="body">
          <div className="sb">
            <div className="sb-sec">
              <div className="sb-lbl">ניווט</div>
              <button className={`sb-i ${view === 'dashboard' && !filter ? 'act' : ''}`} onClick={() => showView('dashboard')}><span className="ic">📊</span>דשבורד</button>
              <button className={`sb-i ${view === 'claims' && !filter ? 'act' : ''}`} onClick={() => showView('claims')}><span className="ic">📋</span>{mineOnly ? 'התביעות שלי' : 'כל התיקים'}<span className="sb-bd b">{workset.length}</span></button>
              <button className={`sb-i ${view === 'gmail' ? 'act' : ''}`} onClick={() => showView('gmail')}><span className="ic">📧</span>Gmail</button>
              <button className={`sb-i ${view === 'tasks' ? 'act' : ''}`} onClick={() => showView('tasks')}><span className="ic">✅</span>משימות</button>
              <button className={`sb-i ${view === 'reports' ? 'act' : ''}`} onClick={() => showView('reports')}><span className="ic">📈</span>דוחות</button>
            </div>
            <div className="sb-div" />
            <div className="sb-sec">
              <div className="sb-lbl">לפי סטטוס</div>
              {[
                ['חדש', '🆕', 'sb-bd b'],
                ['בטיפול', '⚙️', 'sb-bd b'],
                ['ממתין לחברת ביטוח', '🏢', 'sb-bd y'],
                ['ממתין לשמאי', '🔍', 'sb-bd y'],
                ['ממתין למסמכים', '📄', 'sb-bd r'],
                ['ממתין לתשלום', '💰', 'sb-bd y'],
                ['בטיפול משפטי', '⚖️', 'sb-bd'],
                ['הסתיים', '✅', 'sb-bd'],
              ].map(([st, ic, bd]) => (
                <button key={st} className={`sb-i ${filter === st ? 'act' : ''}`} onClick={() => showView('claims', st)}>
                  <span className="ic">{ic}</span>{st === 'ממתין לחברת ביטוח' ? 'חברת ביטוח' : st === 'ממתין לשמאי' ? 'שמאי' : st === 'ממתין למסמכים' ? 'מסמכים' : st === 'ממתין לתשלום' ? 'לתשלום' : st === 'בטיפול משפטי' ? 'משפטי' : st}
                  {st !== 'הסתיים' && <span className={bd}>{cnt((x) => x.status === st)}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="main">
            {view === 'dashboard' && (
              <>
                <div className="ph">
                  <div><div className="ph-t">{isSuperAdmin && !mineOnly ? 'דשבורד' : 'התביעות שלי'}<div className="ph-bar" /></div>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{new Date().toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} · {actor.full_name}</div>
                  </div>
                  <div className="ph-a">
                    {isSuperAdmin && (
                      <button className={`btn btn-sm ${mineOnly ? 'btn-p' : 'btn-g'}`} onClick={() => setMineOnly((v) => !v)}>{mineOnly ? 'התביעות שלי' : 'כל התביעות'}</button>
                    )}
                    <button className="btn btn-p btn-sm" onClick={openNew}>＋ תיק חדש</button>
                    <button className="btn btn-g btn-sm" onClick={() => { toast('סריקת Gmail תחובר בשלב הבא', 'inf'); showView('gmail'); }}>📬 סרוק מיילים</button>
                  </div>
                </div>
                <div className="dcg">
                  {[
                    ['b', claims.length, 'סה"כ תיקים'],
                    ['b', cnt((x) => x.status !== 'הסתיים' && x.status !== 'שולם'), 'פתוחים'],
                    ['y', cnt((x) => x.status === 'ממתין לחברת ביטוח'), 'חברת ביטוח'],
                    ['y', cnt((x) => x.status === 'ממתין לשמאי'), 'שמאי'],
                    ['r', cnt((x) => x.status === 'ממתין למסמכים'), 'חסרים מסמכים'],
                    ['y', cnt((x) => x.status === 'ממתין לתשלום'), 'לתשלום'],
                    ['p', cnt((x) => x.status === 'בטיפול משפטי'), 'משפטי'],
                    ['g', cnt((x) => x.status === 'הסתיים' || x.status === 'שולם'), 'הסתיים'],
                  ].map((x) => (
                    <div key={String(x[2])} className="dc"><div className={`dc-bar ${x[0]}`} /><div className={`dc-n ${x[0]}`}>{x[1]}</div><div className="dc-l">{x[2]}</div></div>
                  ))}
                </div>
                <div className="sdiv"><div className="sdiv-t">תיקים פתוחים – דורשים טיפול</div><div className="sdiv-l" /></div>
                <div className="tw"><table><thead><tr><th>מס' תיק</th><th>לקוח</th><th>רכב</th><th>סטטוס</th><th>מטפל</th><th>חסר / ממתין</th><th>פעולה הבאה</th><th>עדכון</th></tr></thead>
                  <tbody>
                    {openDash.length === 0 ? <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--t3)', padding: 24 }}>אין תיקים פתוחים</td></tr>
                      : openDash.map((x) => (
                        <tr key={x.id} onClick={() => openCard(x.id)}>
                          <td style={{ fontWeight: 800, color: 'var(--ac3)', fontSize: 11 }}>{x.id}</td>
                          <td>{x.clientName}</td><td>{x.plate || '—'}</td>
                          <td>{stBadge(x.status)}</td>
                          <td style={{ fontSize: 11 }}>{x.assigned_to_name || '—'}</td>
                          <td style={{ fontSize: 11, color: x.status === 'ממתין למסמכים' ? 'var(--rd2)' : 'var(--t3)' }}>{x.status === 'ממתין למסמכים' ? 'מסמכים' : '—'}</td>
                          <td style={{ fontSize: 11, color: 'var(--yn2)' }}>{x.nextAction || '—'}</td>
                          <td style={{ fontSize: 10, color: 'var(--t3)' }}>{x.updatedAt || '—'}</td>
                        </tr>
                      ))}
                  </tbody>
                </table></div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginTop: 16 }}>
                  <div>
                    <div className="sdiv"><div className="sdiv-t">משימות לביצוע</div><div className="sdiv-l" /></div>
                    {myTasks.length === 0 ? <div style={{ color: 'var(--t3)', fontSize: 12 }}>אין משימות פתוחות</div>
                      : myTasks.map((t) => (
                        <div key={t.id} style={{ background: 'var(--bg2)', border: '1px solid var(--br)', borderRadius: 7, padding: '10px 12px', marginBottom: 7, cursor: 'pointer' }} onClick={() => t.claimId && openCard(t.claimId)}>
                          <div style={{ fontSize: 10, color: 'var(--ac3)' }}>{t.claimId}</div>
                          <div style={{ fontWeight: 600 }}>{t.action}</div>
                          {t.dueDate ? <div style={{ fontSize: 11, color: 'var(--yn2)' }}>📅 {t.dueDate}</div> : null}
                        </div>
                      ))}
                  </div>
                  <div>
                    <div className="sdiv"><div className="sdiv-t">תזכורות</div><div className="sdiv-l" /></div>
                    {myRems.length === 0 ? <div style={{ color: 'var(--t3)', fontSize: 12 }}>אין תזכורות</div>
                      : myRems.map((r) => (
                        <div key={r.id} style={{ background: 'var(--bg2)', border: '1px solid var(--br)', borderRadius: 7, padding: '10px 12px', marginBottom: 7, cursor: 'pointer' }} onClick={() => r.claimId && openCard(r.claimId)}>
                          <div style={{ fontWeight: 600 }}>{r.date} {r.time || ''}</div>
                          <div style={{ fontSize: 12, color: 'var(--t2)' }}>{r.note || r.claimId}</div>
                        </div>
                      ))}
                  </div>
                </div>
              </>
            )}

            {view === 'claims' && (
              <>
                <div className="ph">
                  <div><div className="ph-t">{filter || stFil || (mineOnly ? 'התביעות שלי' : 'כל התיקים')}<div className="ph-bar" /></div></div>
                  <div className="ph-a">
                    {isSuperAdmin && (
                      <button className={`btn btn-sm ${mineOnly ? 'btn-p' : 'btn-g'}`} onClick={() => setMineOnly((v) => !v)}>{mineOnly ? 'שלי' : 'הכול'}</button>
                    )}
                    <input className="fi" placeholder="🔎 חיפוש..." style={{ width: 180 }} value={search} onChange={(e) => setSearch(e.target.value)} />
                    <select className="fse" value={stFil} onChange={(e) => setStFil(e.target.value)} style={{ fontSize: 11.5 }}>
                      <option value="">כל הסטטוסים</option>
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                    <button className="btn btn-p btn-sm" onClick={openNew}>＋ תיק חדש</button>
                  </div>
                </div>
                <div className="tw"><table><thead><tr>
                  <th>מס' תיק</th><th>לקוח</th><th>רכב</th><th>ביטוח</th><th>מס' תביעה</th><th>סטטוס</th><th>מטפל</th><th>רכב במערכת</th><th>עדכון</th><th></th>
                </tr></thead>
                  <tbody>
                    {list.length === 0 ? <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--t3)', padding: 28 }}>לא נמצאו תיקים</td></tr>
                      : list.map((c) => (
                        <tr key={c.id} onClick={() => openCard(c.id)}>
                          <td style={{ fontWeight: 800, color: 'var(--ac3)', fontSize: 11 }}>{c.id}</td>
                          <td><div style={{ fontWeight: 600 }}>{c.clientName}</div>{c.clientPhone ? <div style={{ fontSize: 10, color: 'var(--t3)' }}>{c.clientPhone}</div> : null}</td>
                          <td>{c.plate || '—'}</td><td>{c.insCompany || '—'}</td>
                          <td style={{ color: 'var(--t3)', fontSize: 11 }}>{c.claimNum || '—'}</td>
                          <td>{stBadge(c.status)}</td>
                          <td style={{ fontSize: 11 }}>{c.assigned_to_name || '—'}</td>
                          <td><div className="lbl-pill">{c.vehicle_id ? '✓' : '—'}</div></td>
                          <td style={{ fontSize: 10, color: 'var(--t3)' }}>{c.updatedAt || '—'}</td>
                          <td onClick={(e) => e.stopPropagation()}><button className="btn btn-g btn-sm" onClick={() => startEdit(c.id)}>✏️</button></td>
                        </tr>
                      ))}
                  </tbody>
                </table></div>
              </>
            )}

            {view === 'gmail' && (
              <>
                <div className="ph"><div><div className="ph-t">📧 Gmail – חיבור תיבת דליה<div className="ph-bar" /></div></div></div>
                <div className="gmail-card">
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>
                    {gmailStatus.connected ? `מחובר: ${gmailStatus.email || 'yoni122222@gmail.com'}` : 'לא מחובר עדיין'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.6 }}>
                    העובד לא נכנס לתיבת Gmail. ייבוא וטיוטה רק מתוך תיק מורשה. שליחה חיה כבויה.
                    <br />Scopes: openid, userinfo.email, gmail.readonly, gmail.compose (טיוטה בלבד — send חסום בקוד).
                    <br />Token נשמר בשרת בלבד. ביטול: super_admin כאן, וגם בהרשאות Google.
                  </div>
                  {isSuperAdmin && gmailStatus.connected && (
                    <button className="btn btn-sm" style={{ marginTop: 10, background: 'rgba(239,68,68,.12)', color: 'var(--rd2)' }} onClick={async () => {
                      const r = await apiRef.current.invokeGmail('revoke');
                      if (!r.success) { toast(String(r.error || 'שגיאה'), 'err'); return; }
                      setGmailStatus({ connected: false, email: null, canConnect: true });
                      toast('החיבור בוטל');
                    }}>בטל חיבור Gmail</button>
                  )}
                  {!gmailStatus.connected && (
                    <div style={{ marginTop: 10, fontSize: 12, color: 'var(--yn2)' }}>
                      חיבור OAuth מתבצע במסך האישור המקומי של הבעלים (לא מפה). אחרי האישור רענן דף זה.
                    </div>
                  )}
                </div>
              </>
            )}

            {view === 'tasks' && (
              <>
                <div className="ph"><div><div className="ph-t">משימות פתוחות<div className="ph-bar" /></div></div></div>
                {allTasks.length === 0 ? <div className="empty"><div style={{ fontSize: 28 }}>✅</div><div>אין משימות פתוחות</div></div>
                  : allTasks.map((t) => {
                    const c = claims.find((x) => x.id === t.claimId);
                    return (
                      <div key={t.id} style={{ background: 'var(--bg2)', border: '1px solid var(--br)', borderRadius: 7, padding: '11px 13px', marginBottom: 7, cursor: 'pointer' }} onClick={() => openCard(t.claimId)}>
                        <div style={{ fontSize: 10, color: 'var(--ac3)' }}>{t.claimId}{c ? ` – ${c.clientName}` : ''}</div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{t.action}</div>
                        {t.dueDate ? <div style={{ fontSize: 11, color: 'var(--yn2)' }}>📅 {t.dueDate}</div> : null}
                      </div>
                    );
                  })}
              </>
            )}

            {view === 'reports' && (
              <>
                <div className="ph"><div><div className="ph-t">דוחות ניהול<div className="ph-bar" /></div></div>
                  <div className="ph-a">
                    {[7, 14, 30, 60].map((d) => (
                      <button key={d} className="btn btn-g btn-sm" onClick={async () => {
                        const r = await apiRef.current.getInactiveClaims(d);
                        setInactive({ days: d, rows: r.data || [] });
                      }}>{d} ימים</button>
                    ))}
                  </div>
                </div>
                {inactive && (
                  <div style={{ marginBottom: 16 }}>
                    <div className="sdiv"><div className="sdiv-t">תיקים ללא פעילות – {inactive.days} ימים ({inactive.rows.length})</div><div className="sdiv-l" /></div>
                    <div className="tw"><table><thead><tr><th>מס' תיק</th><th>לקוח</th><th>רכב</th><th>סטטוס</th><th>פעילות אחרונה</th></tr></thead>
                      <tbody>
                        {inactive.rows.length === 0 ? <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--t3)', padding: 20 }}>אין תיקים ללא פעילות</td></tr>
                          : inactive.rows.map((c) => (
                            <tr key={c.id} onClick={() => openCard(c.id)}>
                              <td style={{ fontWeight: 800, color: 'var(--ac3)', fontSize: 11 }}>{c.id}</td>
                              <td>{c.clientName}</td><td>{c.plate || '—'}</td>
                              <td>{stBadge(c.status)}</td>
                              <td style={{ fontSize: 11, color: 'var(--rd2)' }}>{c.lastActivityAt || c.updatedAt || '—'}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table></div>
                  </div>
                )}
                <div dangerouslySetInnerHTML={{ __html: reportHtml }} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* NEW/EDIT */}
      <div className={`ov ${modal === 'moClaim' ? 'open' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
        <div className="modal">
          <div className="mh"><div className="mh-t" id="mClaimT">{val(null, 'fc_id') ? 'עריכת תיק' : 'פתיחת תיק חדש'}</div><button className="mcl" onClick={() => setModal(null)}>✕</button></div>
          <div className="mb">
            <div className="sdiv" style={{ marginTop: 0 }}><div className="sdiv-t">לקוח ורכב</div><div className="sdiv-l" /></div>
            <div className="fg2">
              <div className="fg"><label className="fl">שם לקוח *</label><input className="fi" id="fc_name" /></div>
              <div className="fg"><label className="fl">טלפון</label><input className="fi" id="fc_phone" /></div>
              <div className="fg"><label className="fl">אימייל</label><input className="fi" id="fc_email" type="email" /></div>
              <div className="fg full">
                <label className="fl">שיוך לרכב ב-Oren Car (חיפוש לפי מספר רישוי)</label>
                <input className="fi" placeholder="הקלד מספר רישוי, דגם או חברה..." onChange={(e) => searchVehicles(e.target.value)} />
                {vehId && <div className="lbl-pill" style={{ marginTop: 6 }}>משויך לרכב ✓ · {companyName || '—'}</div>}
                {vehHits.length > 0 && (
                  <div className="veh-drop" style={{ marginTop: 6 }}>
                    {vehHits.map((v) => (
                      <div key={v.id} className="veh-item" onClick={() => pickVehicle(v)}>
                        <b>{v.license_plate}</b> · {[v.manufacturer, v.model].filter(Boolean).join(' ')} · {v.company_name || '—'}
                        {v.internal_number ? ` · פנימי ${v.internal_number}` : ''}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="fg"><label className="fl">מספר רכב *</label><input className="fi" id="fc_plate" /></div>
              <div className="fg"><label className="fl">דגם רכב</label><input className="fi" id="fc_model" /></div>
              <div className="fg"><label className="fl">סטטוס</label>
                <select className="fse fi" id="fc_status">{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
              </div>
              <div className="fg"><label className="fl">סוג התביעה</label>
                <select className="fse fi" id="fc_kind" value={formKind} onChange={(e) => { setFormKind(e.target.value); setVal('fc_kind', e.target.value); }}>{CLAIM_KINDS.map((s) => <option key={s}>{s}</option>)}</select>
              </div>
              <div className="fg"><label className="fl">תאריך אירוע</label><input className="fi" id="fc_eventDate" type="date" /></div>
              <div className="fg"><label className="fl">מספר פוליסה</label><input className="fi" id="fc_policyNum" /></div>
            </div>
            <div className="sdiv"><div className="sdiv-t">חברת ביטוח</div><div className="sdiv-l" /></div>
            <div className="fg2">
              <div className="fg"><label className="fl">חברת ביטוח</label><input className="fi" id="fc_co" list="dlCo" /><datalist id="dlCo"><option>מגדל</option><option>הפניקס</option><option>מנורה מבטחים</option><option>הראל</option><option>כלל ביטוח</option><option>איילון</option><option>שירביט</option><option>ביטוח ישיר</option></datalist></div>
              <div className="fg"><label className="fl">מספר תביעה</label><input className="fi" id="fc_claimNum" /></div>
              <div className="fg"><label className="fl">אימייל ביטוח</label><input className="fi" id="fc_coEmail" type="email" /></div>
              <div className="fg"><label className="fl">נציג – שם</label><input className="fi" id="fc_insRepName" /></div>
              <div className="fg"><label className="fl">נציג – טלפון</label><input className="fi" id="fc_insRepPhone" /></div>
              <div className="fg"><label className="fl">נציג – אימייל</label><input className="fi" id="fc_insRepEmail" type="email" /></div>
            </div>
            <div style={{ display: formKind === 'תביעת צד ג׳' ? 'block' : 'none' }}>
              <div className="sdiv"><div className="sdiv-t">צד ג׳</div><div className="sdiv-l" /></div>
              <div className="fg2">
                <div className="fg"><label className="fl">שם צד ג׳</label><input className="fi" id="fc_thirdParty" /></div>
                <div className="fg"><label className="fl">מספר רכב צד ג׳</label><input className="fi" id="fc_thirdPlate" /></div>
                <div className="fg"><label className="fl">טלפון צד ג׳</label><input className="fi" id="fc_thirdPhone" /></div>
                <div className="fg"><label className="fl">אימייל צד ג׳</label><input className="fi" id="fc_thirdEmail" type="email" /></div>
              </div>
            </div>
            <div className="sdiv"><div className="sdiv-t">שמאי</div><div className="sdiv-l" /></div>
            <div className="fg2">
              <div className="fg"><label className="fl">שם שמאי</label><input className="fi" id="fc_surv" /></div>
              <div className="fg"><label className="fl">טלפון שמאי</label><input className="fi" id="fc_survPhone" /></div>
              <div className="fg"><label className="fl">אימייל שמאי</label><input className="fi" id="fc_survEmail" type="email" /></div>
            </div>
            <div className="sdiv"><div className="sdiv-t">כספי</div><div className="sdiv-l" /></div>
            <div className="fg3">
              <div className="fg"><label className="fl">סכום תביעה (₪)</label><input className="fi" id="fc_amount" type="number" /></div>
              <div className="fg"><label className="fl">סכום אושר (₪)</label><input className="fi" id="fc_approved" type="number" /></div>
              <div className="fg"><label className="fl">סכום שולם (₪)</label><input className="fi" id="fc_paid" type="number" /></div>
              <div className="fg"><label className="fl">תאריך תשלום</label><input className="fi" id="fc_payDate" type="date" /></div>
              <div className="fg"><label className="fl">אסמכתא</label><input className="fi" id="fc_ref" /></div>
            </div>
            <div className="sdiv"><div className="sdiv-t">פעולה הבאה</div><div className="sdiv-l" /></div>
            <div className="fg2">
              <div className="fg"><label className="fl">פעולה</label><input className="fi" id="fc_nextAction" /></div>
              <div className="fg"><label className="fl">תאריך יעד</label><input className="fi" id="fc_nextDate" type="date" /></div>
              <div className="fg full"><label className="fl">הערות</label><textarea className="fta" id="fc_notes" /></div>
            </div>
            <div className="sdiv"><div className="sdiv-t">⚖️ טיפול משפטי</div><div className="sdiv-l" /></div>
            <div className="fg2">
              <div className="fg"><label className="fl">סיבת העברה</label><select className="fse fi" id="fc_legalReason"><option>דחיית תביעה</option><option>תשלום חלקי</option><option>אי תגובה</option><option>מחלוקת כספית</option><option>מחלוקת אחריות</option><option>עיכוב חריג</option><option>אחר</option></select></div>
              <div className="fg"><label className="fl">שם עורך דין</label><input className="fi" id="fc_legalLawyer" /></div>
              <div className="fg"><label className="fl">משרד</label><input className="fi" id="fc_legalFirm" /></div>
              <div className="fg"><label className="fl">טלפון</label><input className="fi" id="fc_legalPhone" /></div>
              <div className="fg"><label className="fl">אימייל</label><input className="fi" id="fc_legalEmail" type="email" /></div>
              <div className="fg"><label className="fl">תאריך העברה</label><input className="fi" id="fc_legalDate" type="date" /></div>
              <div className="fg full"><label className="fl">הערות משפטיות</label><textarea className="fta" id="fc_legalNotes" /></div>
            </div>
            <input type="hidden" id="fc_id" />
          </div>
          <div className="mf"><button className="btn btn-g" onClick={() => setModal(null)}>ביטול</button><button className="btn btn-p" onClick={doSaveClaim}>💾 שמור</button></div>
        </div>
      </div>

      {/* CARD */}
      <div className={`ov ${modal === 'moCard' && cur ? 'open' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
        {cur && (
          <div className="modal" style={{ maxWidth: 940 }}>
            <div className="mh">
              <div>
                <div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 700 }}>{cur.id}</div>
                <div style={{ fontSize: 19, fontWeight: 900, marginBottom: 4 }}>{cur.clientName}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {stBadge(cur.status)}
                  {cur.plate ? <span style={{ fontSize: 11, color: 'var(--t3)' }}>{cur.plate}</span> : null}
                  {cur.insCompany ? <span style={{ fontSize: 11, color: 'var(--t3)' }}>{cur.insCompany}</span> : null}
                  {cur.vehicle_id ? <div className="lbl-pill">רכב משויך</div> : null}
                  {cur.assigned_to_name ? <div className="lbl-pill">מטפל: {cur.assigned_to_name}</div> : <div className="lbl-pill">ללא מטפל</div>}
                  {cur.claimKind ? <div className="lbl-pill">{cur.claimKind}</div> : null}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-g btn-sm" onClick={() => startEdit(cur.id)}>✏️ ערוך</button>
                {isSuperAdmin && <button className="btn btn-p btn-sm" onClick={() => setModal('moAssign')}>👤 הקצה לעובד</button>}
                <button className="mcl" onClick={() => setModal(null)}>✕</button>
              </div>
            </div>
            <div className="ab">
              <button className="ab-btn ab-phone" onClick={() => setModal('moCall')}>📞 שיחה</button>
              <button className="ab-btn ab-wa" onClick={() => { setVal('wa_msg', `שלום, בהמשך לתביעה ${cur.claimNum || cur.id}`); setModal('moWA'); }}>💬 WhatsApp</button>
              <button className="ab-btn ab-mail" onClick={() => { setVal('mail_subj', `תביעה ${cur.id} – ${cur.clientName}`); setVal('mail_body', `שלום,\n\nבהמשך לתביעה מספר ${cur.claimNum || cur.id}\nלקוח: ${cur.clientName}\nרכב: ${cur.plate || '—'}\n\nבברכה,\nדליה ניהול תביעות`); setVal('mail_to', cur.insEmail || cur.clientEmail || ''); setModal('moMail'); }}>📧 מייל</button>
              <button className="ab-btn ab-task" onClick={() => setModal('moTask')}>✅ משימה</button>
              <button className="ab-btn ab-rem" onClick={() => setModal('moRem')}>🔔 תזכורת</button>
              <button className="ab-btn ab-mail" onClick={() => openMailFollowupModal(null)}>📬 מעקב מייל</button>
              <button className="ab-btn ab-mail" onClick={async () => {
                setCardTab('gin');
                setGmailBusy('טוען מיילים…');
                const r = await apiRef.current.invokeGmail('list_messages', { claim_id: cur.id });
                setGmailBusy('');
                if (!r.success) { toast(String(r.error || 'Gmail לא מחובר'), 'err'); return; }
                setGmailList((r.messages as Array<Record<string, unknown>>) || []);
              }}>📥 ייבוא מ-Gmail</button>
              <div className="ab-sep" />
              <button className="ab-btn ab-status" onClick={() => { setVal('sf_st', cur.status); setVal('sf_note', ''); setModal('moStatus'); }}>🔄 סטטוס</button>
              <button className="ab-btn ab-sum" onClick={async () => { const r = await apiRef.current.exportClaimSummary(cur.id); setSumText(r.text || ''); setModal('moSum'); }}>📄 סיכום</button>
              <button className="ab-btn" style={{ background: 'rgba(239,68,68,.12)', color: 'var(--rd2)' }} onClick={() => setModal('moClose')}>🔒 סגור תיק</button>
              <button className="ab-btn ab-sum" onClick={async () => { const r = await apiRef.current.exportClaimSummary(cur.id); setExportText(r.text || ''); setModal('moExport'); }}>📤 ייצוא</button>
            </div>
            <div style={{ padding: '0 18px 18px' }}>
              <div className="tabs">
                {[['claim', '📋 תביעה'], ['client', '👤 לקוח'], ['vehicle', '🚗 רכב'], ['treat', '🛠 טיפול'], ['docs', '📄 מסמכים'], ['gin', '📥 ייבוא Gmail'], ['tasks', '✅ משימות'], ['rems', '🔔 תזכורות'], ['mailfu', '📬 מעקב מייל'], ['timeline', '⏱ היסטוריה']].map(([k, l]) => (
                  <button key={k} className={`tab ${cardTab === k ? 'act' : ''}`} onClick={() => setCardTab(k)}>{l}</button>
                ))}
              </div>
              {cardTab === 'claim' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 11 }}>
                  {[['מספר תיק', cur.id], ['סוג', cur.claimKind || '—'], ['תאריך אירוע', cur.eventDate || '—'], ['תאריך פתיחה', cur.createdAt || '—'],
                    ['סטטוס', cur.status], ['מטפל', cur.assigned_to_name || '—'], ['חברת ביטוח', cur.insCompany || '—'],
                    ['מספר פוליסה', cur.policyNum || '—'], ["מס' תביעה", cur.claimNum || '—'], ['שמאי', cur.surveyor || '—'],
                    ['פעולה הבאה', cur.nextAction || '—'], ['עודכן ע״י', cur.updatedByName || '—'],
                    ['Gmail Message', cur.gmail_message_id || '—'], ['Gmail Thread', cur.gmail_thread_id || '—']].map((f) => (
                      <div key={f[0]}><div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 700 }}>{f[0]}</div><div style={{ fontSize: 12.5, fontWeight: 600 }}>{f[1]}</div></div>
                    ))}
                </div>
              )}
              {cardTab === 'client' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 11 }}>
                  {[['שם לקוח', cur.clientName], ['טלפון', cur.clientPhone || '—'], ['אימייל', cur.clientEmail || '—']].map((f) => (
                    <div key={f[0]}><div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 700 }}>{f[0]}</div><div style={{ fontSize: 12.5, fontWeight: 600 }}>{f[1]}</div></div>
                  ))}
                </div>
              )}
              {cardTab === 'vehicle' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 11 }}>
                  {[['מספר רישוי', cur.plate || '—'], ['דגם', cur.carModel || '—'], ['חברה/לקוח', cur.company_name || '—'], ['רכב במערכת', cur.vehicle_id ? 'משויך' : 'לא משויך']].map((f) => (
                    <div key={f[0]}><div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 700 }}>{f[0]}</div><div style={{ fontSize: 12.5, fontWeight: 600 }}>{f[1]}</div></div>
                  ))}
                </div>
              )}
              {cardTab === 'treat' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 11, marginBottom: 12 }}>
                    {([['פעולה הבאה', cur.nextAction || '—'], ['תאריך יעד', cur.nextDate || '—'], ['הערות טיפול', cur.notes || '—']] as Array<[string, string]>)
                      .concat(cur.claimKind === 'תביעת צד ג׳' ? [['צד ג׳', cur.thirdParty || '—'], ['רכב צד ג׳', cur.thirdPlate || '—']] : [])
                      .map((f) => (
                      <div key={f[0]}><div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 700 }}>{f[0]}</div><div style={{ fontSize: 12.5, fontWeight: 600 }}>{f[1]}</div></div>
                    ))}
                  </div>
                  <div className="sdiv"><div className="sdiv-t">תקשורת והערות</div><div className="sdiv-l" /></div>
                  {comm.length === 0 ? <div className="empty">אין תקשורת מתועדת</div>
                    : comm.map((e) => (
                      <div key={e.id} className={`comm-item ${e.type || ''}`}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 10, fontWeight: 700 }}>{e.type}</span>
                          <span style={{ fontSize: 10, color: 'var(--t3)' }}>{e.at} · {e.by || ''}</span>
                        </div>
                        <div style={{ fontSize: 12.5, color: 'var(--t2)' }}>{e.body || e.note || ''}</div>
                      </div>
                    ))}
                </>
              )}
              {cardTab === 'docs' && (
                <div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 8 }}>בחר אילו מסמכים לבקש מהלקוח — לא אותה רשימה לכל תיק.</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {DOC_PRESETS.map((p) => {
                      const on = docs.requests.some((d) => d.label === p.label);
                      return (
                        <button key={p.key} className={`btn btn-sm ${on ? 'btn-p' : 'btn-g'}`} onClick={async () => {
                          const next = on ? docs.requests.filter((d) => d.label !== p.label) : [...docs.requests, { id: '', label: p.label, status: 'requested' }];
                          await apiRef.current.invokeDocs('save_doc_requests', { claim_id: cur.id, items: next.map((d) => ({ label: d.label })) });
                          await loadCardData(cur.id);
                        }}>{on ? '✓ ' : ''}{p.label}</button>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                    <input className="fi" placeholder="מסמך נוסף..." value={customDoc} onChange={(e) => setCustomDoc(e.target.value)} />
                    <button className="btn btn-p btn-sm" onClick={async () => {
                      if (!customDoc.trim()) return;
                      await apiRef.current.invokeDocs('save_doc_requests', { claim_id: cur.id, items: [...docs.requests, { label: customDoc.trim(), doc_key: 'custom' }] });
                      setCustomDoc('');
                      await loadCardData(cur.id);
                    }}>הוסף</button>
                  </div>
                  {docs.requests.map((d) => (
                    <div key={d.id} style={{ background: 'var(--bg3)', border: '1px solid var(--br)', borderRadius: 7, padding: '10px 12px', marginBottom: 7, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{d.label}</div>
                        <div style={{ fontSize: 11, color: d.status === 'received' ? 'var(--gn2)' : 'var(--yn2)' }}>{d.status === 'received' ? `התקבל${d.received_at ? ` · ${new Date(d.received_at).toLocaleString('he-IL')}` : ''}` : d.status === 'missing' ? 'חסר' : 'התבקש'}</div>
                      </div>
                      <label className="btn btn-g btn-sm">העלאה
                        <input type="file" hidden accept="application/pdf,image/*" onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const up = await apiRef.current.staffUpload(cur.id, d.id, file);
                          if (!up.success) { toast(up.error || 'העלאה נכשלה', 'err'); return; }
                          await loadCardData(cur.id);
                          toast('מסמך הועלה');
                        }} />
                      </label>
                    </div>
                  ))}
                  <div className="sdiv"><div className="sdiv-t">קבצים שהתקבלו</div><div className="sdiv-l" /></div>
                  {docs.files.length === 0 ? <div style={{ color: 'var(--t3)' }}>אין קבצים עדיין</div>
                    : Object.entries(docs.files.reduce((acc: Record<string, typeof docs.files>, f) => {
                      const k = f.source === 'gmail' && f.gmail_message_id ? `gmail:${f.gmail_message_id}` : `one:${f.id}`;
                      (acc[k] = acc[k] || []).push(f);
                      return acc;
                    }, {})).map(([k, group]) => (
                      <div key={k} style={{ background: 'var(--bg3)', border: '1px solid var(--br)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                        {k.startsWith('gmail:') ? <div style={{ fontWeight: 700, marginBottom: 6 }}>גלריה ממייל ({group.length} קבצים)</div> : null}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {group.map((f) => (
                            <div key={f.id} style={{ minWidth: 140, flex: '1 1 140px' }}>
                              <div style={{ fontWeight: 600, fontSize: 12 }}>{f.original_name}</div>
                              <div style={{ fontSize: 10, color: 'var(--t3)' }}>{f.source === 'gmail' ? 'Gmail' : f.source === 'customer' ? 'לקוח' : 'עובד'}</div>
                              <button className="btn btn-g btn-sm" onClick={async () => {
                                const r = await apiRef.current.invokeDocs('signed_url', { claim_id: cur.id, file_id: f.id });
                                if (r.url) window.open(String(r.url), '_blank');
                              }}>צפייה</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-p btn-sm" onClick={async () => {
                      const r = await apiRef.current.invokeDocs('create_link', { claim_id: cur.id });
                      if (!r.success || !r.token) { toast(String(r.error || 'שגיאה'), 'err'); return; }
                      const origin = window.location.origin;
                      const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
                      const url = `${origin}${base && base !== '/' ? base : ''}/claims-upload?t=${r.token}`;
                      setLinkUrl(url);
                      await navigator.clipboard.writeText(url).catch(() => undefined);
                      toast('הקישור הועתק');
                    }}>קישור להעלאת מסמכים</button>
                    <button className="btn btn-g btn-sm" onClick={async () => { await apiRef.current.invokeDocs('revoke_link', { claim_id: cur.id }); setLinkUrl(''); toast('הקישור בוטל'); }}>בטל קישור</button>
                  </div>
                  {linkUrl ? <div style={{ marginTop: 8, fontSize: 11, wordBreak: 'break-all', color: 'var(--ac3)' }}>{linkUrl}</div> : null}
                </div>
              )}
              {cardTab === 'gin' && (
                <div>
                  <div style={{ fontSize: 12, color: 'var(--yn2)', marginBottom: 8 }}>ייבוא בפעולה אחת: המייל + כל המצורפים. אין שליחה חיה. אין שינוי מיילים קיימים בתיבה.</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    <button className="btn btn-p btn-sm" onClick={async () => {
                      setGmailBusy('טוען מיילים…');
                      const r = await apiRef.current.invokeGmail('list_messages', { claim_id: cur.id });
                      setGmailBusy('');
                      if (!r.success) { toast(String(r.error || 'שגיאה'), 'err'); return; }
                      setGmailList((r.messages as Array<Record<string, unknown>>) || []);
                    }}>בחירת מייל</button>
                  </div>
                  {gmailBusy ? <div style={{ fontSize: 12 }}>{gmailBusy}</div> : null}
                  {gmailList.map((m) => (
                    <div key={String(m.id)} className="gmail-card">
                      <div style={{ fontWeight: 700 }}>{String(m.subject || '(ללא נושא)')}</div>
                      <div style={{ fontSize: 11, color: 'var(--t3)' }}>{String(m.from || '')} · {String(m.date || '')}</div>
                      <div style={{ fontSize: 12, margin: '6px 0' }}>{String(m.snippet || '')}</div>
                      <button className="btn btn-p btn-sm" onClick={async () => {
                        setGmailBusy('מייבא את המייל וכל המצורפים…');
                        const r = await apiRef.current.importGmailMessage(cur.id, String(m.id));
                        setGmailBusy('');
                        if (!r.success) { toast(String(r.error || 'ייבוא נכשל'), 'err'); return; }
                        toast(`יובא · ${String(r.total || 0)} קבצים · לא נשלח מייל`);
                        await loadAll();
                        await loadCardData(cur.id);
                      }}>ייבא את המייל וכל המצורפים</button>
                    </div>
                  ))}
                  <div className="sdiv"><div className="sdiv-t">מיילים שכבר יובאו לתיק</div><div className="sdiv-l" /></div>
                  {gmailImports.length === 0 ? <div style={{ color: 'var(--t3)' }}>אין ייבוא עדיין</div>
                    : gmailImports.map((im) => (
                      <div key={String(im.id)} style={{ marginBottom: 8, fontSize: 12 }}>
                        <b>{String(im.subject || '')}</b>
                        <div style={{ color: 'var(--t3)' }}>message {String(im.gmail_message_id || '')} · thread {String(im.gmail_thread_id || '')} · {String(im.attachment_count || 0)} קבצים</div>
                      </div>
                    ))}
                </div>
              )}
              {cardTab === 'tasks' && (
                <>
                  <button className="btn btn-p btn-sm" style={{ marginBottom: 10 }} onClick={() => setModal('moTask')}>＋ הוסף משימה</button>
                  {tasks.length === 0 ? <div style={{ color: 'var(--t3)' }}>אין משימות פתוחות</div>
                    : tasks.map((t) => (
                      <div key={t.id} style={{ background: 'var(--bg3)', border: '1px solid var(--br)', borderRadius: 7, padding: '10px 12px', marginBottom: 7 }}>
                        <div style={{ fontWeight: 600 }}>{t.action}</div>
                        {t.dueDate ? <div style={{ fontSize: 11, color: 'var(--yn2)' }}>📅 {t.dueDate}</div> : null}
                        {t.owner ? <div style={{ fontSize: 11, color: 'var(--t3)' }}>👤 {t.owner}</div> : null}
                      </div>
                    ))}
                </>
              )}
              {cardTab === 'rems' && (
                <>
                  <button className="btn btn-p btn-sm" style={{ marginBottom: 10 }} onClick={() => setModal('moRem')}>＋ תזכורת</button>
                  {reminders.length === 0 ? <div style={{ color: 'var(--t3)' }}>אין תזכורות</div>
                    : reminders.map((r) => (
                      <div key={r.id} style={{ background: 'var(--bg3)', border: '1px solid var(--br)', borderRadius: 7, padding: '10px 12px', marginBottom: 7 }}>
                        <div style={{ fontWeight: 600 }}>{r.date} {r.time || ''}</div>
                        <div style={{ fontSize: 12, color: 'var(--t2)' }}>{r.note || ''}</div>
                      </div>
                    ))}
                </>
              )}
              {cardTab === 'mailfu' && (
                <>
                  <div style={{ fontSize: 11, color: 'var(--yn2)', marginBottom: 10 }}>
                    מצב Dry Run — אין שליחת מייל אמיתית ואין חיבור Gmail. כאן מוצג בדיוק מה היה אמור להישלח.
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    <button className="btn btn-p btn-sm" onClick={() => openMailFollowupModal(null)}>＋ הגדר מעקב מייל</button>
                    {isSuperAdmin && (
                      <button className="btn btn-g btn-sm" onClick={async () => {
                        const r = await apiRef.current.dispatchMailNow();
                        if (!r.success) { toast(String(r.error || 'שגיאה'), 'err'); return; }
                        toast(`Dry Run רץ · עובדו ${String(r.processed ?? 0)} · לא נשלח מייל אמיתי`);
                        if (cur) await loadCardData(cur.id);
                      }}>הרץ Dry Run עכשיו</button>
                    )}
                  </div>
                  {mailFollowups.length === 0 ? <div style={{ color: 'var(--t3)' }}>אין מעקב מייל בתיק זה</div>
                    : mailFollowups.map((fu) => {
                      const last = fu.jobs[0];
                      const prev = (last?.preview && typeof last.preview === 'object') ? last.preview : null;
                      const atts = Array.isArray(prev?.attachments) ? prev.attachments as Array<{ name?: string }> : [];
                      return (
                        <div key={fu.id} className="fu-box">
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                            <div style={{ fontWeight: 700 }}>{fu.mail_kind === 'email_repeat' ? 'חוזר' : 'חד-פעמי'} · {fuStatusHe(fu.status)}</div>
                            <div style={{ fontSize: 11, color: 'var(--t3)' }}>{fu.id}</div>
                          </div>
                          <div className="fu-grid">
                            <div><b>למי</b>{fu.mail_to || '—'}</div>
                            <div><b>מועד מתוכנן</b>{fmtWhen(last?.planned_at || fu.next_run_at)}</div>
                            <div><b>מועד הבא</b>{fu.next_run_at ? fmtWhen(fu.next_run_at) : '—'}</div>
                            <div><b>מי הגדיר</b>{fu.defined_by || '—'}</div>
                            {fu.mail_kind === 'email_repeat' ? <div><b>כל N ימים</b>{fu.repeat_every_days || '—'}</div> : null}
                          </div>
                          <div className="fu-prev">
                            <div style={{ fontWeight: 700, marginBottom: 4 }}>Preview — מה היה אמור להישלח</div>
                            <div><b>נושא:</b> {(prev?.subject as string) || fu.mail_subject || '—'}</div>
                            <pre>{String((prev?.body as string) || fu.mail_body || '')}</pre>
                            <div><b>מסמכים לצירוף:</b> {fu.attach_mode === 'received' ? (atts.length ? atts.map((a) => a.name).filter(Boolean).join(', ') : 'מסמכים שהתקבלו בתיק (אם יש)') : 'ללא מצורפים'}</div>
                            {last ? <div style={{ marginTop: 6, fontSize: 11 }}><b>סטטוס שליחה:</b> {fuStatusHe(last.status)}{last.fail_reason ? ` · ${last.fail_reason}` : ''} · realEmailSend={String(prev?.realEmailSend ?? false)}</div> : null}
                          </div>
                          {fu.status === 'scheduled' && (
                            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                              <button className="btn btn-g btn-sm" onClick={() => openMailFollowupModal(fu)}>עריכה</button>
                              <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,.12)', color: 'var(--rd2)' }} onClick={async () => {
                                const r = await apiRef.current.cancelMailFollowup(fu.id);
                                if (!r.success) { toast(r.error || 'שגיאה', 'err'); return; }
                                toast('המעקב נעצר. ההיסטוריה נשמרה.');
                                if (cur) await loadCardData(cur.id);
                              }}>עצור מעקב</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </>
              )}
              {cardTab === 'timeline' && (
                hist.length === 0 ? <div className="empty">אין היסטוריה עדיין</div>
                  : hist.map((h) => (
                    <div key={h.id} style={{ marginBottom: 14 }}>
                      <div style={{ fontWeight: 600 }}>{h.action}</div>
                      {h.note ? <div style={{ fontSize: 11.5, color: 'var(--t2)' }}>{h.note}</div> : null}
                      <div style={{ fontSize: 10, color: 'var(--t3)' }}>{h.at} · {h.by}</div>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* ASSIGN */}
      <div className={`ov ${modal === 'moAssign' ? 'open' : ''}`}>
        <div className="modal modal-sm">
          <div className="mh"><div className="mh-t">👤 הקצה לעובד</div><button className="mcl" onClick={() => setModal('moCard')}>✕</button></div>
          <div className="mb">
            <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 8 }}>מטפל נוכחי: {cur?.assigned_to_name || 'לא הוקצה'}</div>
            <div className="fg"><label className="fl">עובד מורשה</label>
              <select className="fse fi" id="as_user">
                <option value="">— בחר —</option>
                {assignees.map((a) => <option key={a.id} value={a.id}>{a.full_name}{a.company_name ? ` · ${a.company_name}` : ''}</option>)}
              </select>
            </div>
          </div>
          <div className="mf"><button className="btn btn-g" onClick={() => setModal('moCard')}>ביטול</button>
            <button className="btn btn-p" onClick={async () => {
              const uid = val(null, 'as_user');
              if (!uid || !cur) { toast('בחר עובד', 'err'); return; }
              const r = await apiRef.current.assignClaim(cur.id, uid);
              if (!r.success) { toast(r.error || 'שגיאה', 'err'); return; }
              await loadAll();
              setModal('moCard');
              await loadCardData(cur.id);
              toast('התביעה הוקצתה');
            }}>הקצה</button>
          </div>
        </div>
      </div>

      {/* STATUS */}
      <div className={`ov ${modal === 'moStatus' ? 'open' : ''}`}>
        <div className="modal modal-sm">
          <div className="mh"><div className="mh-t">🔄 עדכון סטטוס</div><button className="mcl" onClick={() => setModal('moCard')}>✕</button></div>
          <div className="mb">
            <div className="fg" style={{ marginBottom: 10 }}><label className="fl">סטטוס חדש</label>
              <select className="fse fi" id="sf_st">{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
            </div>
            <div className="fg"><label className="fl">הערה</label><input className="fi" id="sf_note" placeholder="מה השתנה?" /></div>
          </div>
          <div className="mf"><button className="btn btn-g" onClick={() => setModal('moCard')}>ביטול</button>
            <button className="btn btn-p" onClick={() => {
              const st = val(null, 'sf_st');
              const note = val(null, 'sf_note');
              if (MANDATORY_STATUSES.includes(st) && !note) {
                pendingStatus.current = st;
                setModal('moMandNote');
                return;
              }
              saveStatus(st, note);
            }}>עדכן</button>
          </div>
        </div>
      </div>

      <div className={`ov ${modal === 'moMandNote' ? 'open' : ''}`}>
        <div className="modal modal-sm">
          <div className="mh"><div className="mh-t" id="mandNoteTitle">נדרשת הערה</div><button className="mcl" onClick={() => setModal('moCard')}>✕</button></div>
          <div className="mb"><div className="fg"><label className="fl">הערה / סיבה *</label><textarea className="fta" id="mandNote" /></div></div>
          <div className="mf"><button className="btn btn-g" onClick={() => setModal('moCard')}>ביטול</button>
            <button className="btn btn-p" onClick={() => {
              const note = val(null, 'mandNote');
              if (!note) { toast('נא להזין הסבר', 'err'); return; }
              saveStatus(pendingStatus.current || val(null, 'sf_st'), note);
            }}>אשר שינוי</button>
          </div>
        </div>
      </div>

      <div className={`ov ${modal === 'moCall' ? 'open' : ''}`}>
        <div className="modal modal-sm">
          <div className="mh"><div className="mh-t">📞 רישום שיחת טלפון</div><button className="mcl" onClick={() => setModal('moCard')}>✕</button></div>
          <div className="mb">
            <div className="fg2">
              <div className="fg"><label className="fl">טלפון</label><input className="fi" id="call_phone" defaultValue={cur?.clientPhone} /></div>
              <div className="fg full"><label className="fl">סיכום *</label><textarea className="fta" id="call_sum" /></div>
              <div className="fg full"><label className="fl">המשך טיפול</label><input className="fi" id="call_next" /></div>
            </div>
          </div>
          <div className="mf"><button className="btn btn-g" onClick={() => setModal('moCard')}>ביטול</button>
            <button className="btn btn-p" onClick={async () => {
              const sum = val(null, 'call_sum'); if (!sum) { toast('נא להזין סיכום', 'err'); return; }
              await apiRef.current.saveCommEntry({ claimId: curId || '', type: 'call', contactName: cur?.clientName || '', phone: val(null, 'call_phone'), body: sum, note: val(null, 'call_next') });
              toast('שיחה תועדה');
              if (curId) await openCard(curId);
            }}>💾 שמור שיחה</button>
          </div>
        </div>
      </div>

      <div className={`ov ${modal === 'moWA' ? 'open' : ''}`}>
        <div className="modal modal-sm">
          <div className="mh"><div className="mh-t">💬 שליחת WhatsApp</div><button className="mcl" onClick={() => setModal('moCard')}>✕</button></div>
          <div className="mb">
            <div className="fg"><label className="fl">טלפון</label><input className="fi" id="wa_phone" defaultValue={cur?.clientPhone} /></div>
            <div className="fg"><label className="fl">הודעה</label><textarea className="fta" id="wa_msg" /></div>
          </div>
          <div className="mf"><button className="btn btn-g" onClick={() => setModal('moCard')}>ביטול</button>
            <button className="btn btn-p" style={{ background: '#15803d' }} onClick={async () => {
              const phone = val(null, 'wa_phone'); const msg = val(null, 'wa_msg');
              if (!phone || !msg) { toast('נא להזין טלפון והודעה', 'err'); return; }
              const p = phone.replace(/[^0-9]/g, '');
              const intl = p.startsWith('0') ? `972${p.slice(1)}` : p;
              window.open(`https://wa.me/${intl}?text=${encodeURIComponent(msg)}`, '_blank');
              await apiRef.current.saveCommEntry({ claimId: curId || '', type: 'wa', phone, body: msg, direction: 'out', contactName: cur?.clientName || '' });
              toast('WhatsApp נשלח ותועד');
              if (curId) await openCard(curId);
            }}>💬 שלח + תעד</button>
          </div>
        </div>
      </div>

      <div className={`ov ${modal === 'moMail' ? 'open' : ''}`}>
        <div className="modal modal-md">
          <div className="mh"><div className="mh-t">📧 שליחת מייל</div><button className="mcl" onClick={() => setModal('moCard')}>✕</button></div>
          <div className="mb">
            <div className="fg"><label className="fl">אימייל</label><input className="fi" id="mail_to" /></div>
            <div className="fg"><label className="fl">נושא</label><input className="fi" id="mail_subj" /></div>
            <div className="fg"><label className="fl">תוכן</label><textarea className="fta" id="mail_body" /></div>
            <div style={{ fontSize: 11, color: 'var(--yn2)', marginTop: 8 }}>שליחה חיה כבויה. אפשר לתעד בתיק או ליצור טיוטת Gmail שלא נשלחת.</div>
          </div>
          <div className="mf"><button className="btn btn-g" onClick={() => setModal('moCard')}>ביטול</button>
            <button className="btn btn-p" onClick={async () => {
              const to = val(null, 'mail_to'); if (!to) { toast('נא להזין אימייל', 'err'); return; }
              await apiRef.current.sendEmailFromClaim({ claimId: curId || '', to, subject: val(null, 'mail_subj'), body: val(null, 'mail_body') });
              toast('מייל תועד בתיק (לא נשלח)');
              if (curId) await openCard(curId);
            }}>📧 תעד בתיק</button>
            <button className="btn btn-p" onClick={async () => {
              const to = val(null, 'mail_to'); if (!to) { toast('נא להזין אימייל', 'err'); return; }
              const r = await apiRef.current.invokeGmail('create_draft', {
                claim_id: curId, to, subject: val(null, 'mail_subj'), body: val(null, 'mail_body'),
              });
              if (!r.success) { toast(String(r.error || 'טיוטה נכשלה'), 'err'); return; }
              toast('נוצרה טיוטה ב-Gmail — לא נשלח');
              if (curId) await openCard(curId);
            }}>📝 צור טיוטה</button>
          </div>
        </div>
      </div>

      <div className={`ov ${modal === 'moTask' ? 'open' : ''}`}>
        <div className="modal modal-sm">
          <div className="mh"><div className="mh-t">✅ הוספת משימה</div><button className="mcl" onClick={() => setModal('moCard')}>✕</button></div>
          <div className="mb">
            <div className="fg"><label className="fl">פעולה *</label><input className="fi" id="task_action" /></div>
            <div className="fg"><label className="fl">אחראי</label><input className="fi" id="task_owner" defaultValue={actor.full_name} /></div>
            <div className="fg"><label className="fl">תאריך יעד</label><input className="fi" id="task_date" type="date" /></div>
            <div className="fg"><label className="fl">הערה</label><input className="fi" id="task_note" /></div>
          </div>
          <div className="mf"><button className="btn btn-g" onClick={() => setModal('moCard')}>ביטול</button>
            <button className="btn btn-p" onClick={async () => {
              const action = val(null, 'task_action'); if (!action) { toast('נא להזין פעולה', 'err'); return; }
              await apiRef.current.saveTask({ claimId: curId || '', action, owner: val(null, 'task_owner'), dueDate: val(null, 'task_date'), note: val(null, 'task_note'), done: 'false' });
              toast('משימה נוספה');
              if (curId) await openCard(curId);
            }}>💾 שמור</button>
          </div>
        </div>
      </div>

      <div className={`ov ${modal === 'moRem' ? 'open' : ''}`}>
        <div className="modal modal-sm">
          <div className="mh"><div className="mh-t">🔔 תזכורת</div><button className="mcl" onClick={() => setModal('moCard')}>✕</button></div>
          <div className="mb">
            <div className="fg"><label className="fl">תאריך</label><input className="fi" id="rem_date" type="date" /></div>
            <div className="fg"><label className="fl">הערה</label><input className="fi" id="rem_note" /></div>
          </div>
          <div className="mf"><button className="btn btn-g" onClick={() => setModal('moCard')}>ביטול</button>
            <button className="btn btn-p" onClick={async () => {
              await apiRef.current.saveReminder({ claimId: curId || '', date: val(null, 'rem_date'), note: val(null, 'rem_note'), owner: actor.full_name, sent: 'false' });
              toast('תזכורת נוספה');
              setModal('moCard');
            }}>💾 שמור</button>
          </div>
        </div>
      </div>

      <div className={`ov ${modal === 'moMailFu' ? 'open' : ''}`}>
        <div className="modal modal-md">
          <div className="mh"><div className="mh-t">📬 מעקב מייל / Follow-up</div><button className="mcl" onClick={() => setModal('moCard')}>✕</button></div>
          <div className="mb">
            <div style={{ fontSize: 11, color: 'var(--yn2)', marginBottom: 10 }}>Dry Run בלבד. לא נשלח מייל אמיתי ולא מתבצע OAuth.</div>
            <div className="fg"><label className="fl">נמען *</label><input className="fi" id="fu_to" type="email" /></div>
            <div className="fg"><label className="fl">מועד שליחה *</label><input className="fi" id="fu_when" type="datetime-local" /></div>
            <div className="fg"><label className="fl">סוג</label>
              <select className="fse fi" id="fu_kind">
                <option value="email_once">חד-פעמי</option>
                <option value="email_repeat">כל N ימים</option>
              </select>
            </div>
            <div className="fg"><label className="fl">כל כמה ימים</label><input className="fi" id="fu_repeat" type="number" min={1} defaultValue="7" /></div>
            <div className="fg"><label className="fl">עצור אחרי (אופציונלי)</label><input className="fi" id="fu_stop" type="datetime-local" /></div>
            <div className="fg"><label className="fl">צירוף מסמכים</label>
              <select className="fse fi" id="fu_attach">
                <option value="none">ללא</option>
                <option value="received">מסמכים שהתקבלו בתיק</option>
              </select>
            </div>
            <div className="fg"><label className="fl">נושא</label><input className="fi" id="fu_subj" /></div>
            <div className="fg"><label className="fl">תוכן</label><textarea className="fta" id="fu_body" style={{ minHeight: 120 }} /></div>
            {isSuperAdmin && (
              <label style={{ display: 'flex', gap: 8, fontSize: 12, marginTop: 8 }}>
                <input type="checkbox" id="fu_closed" /> אפשר גם בתיק סגור (super_admin)
              </label>
            )}
          </div>
          <div className="mf"><button className="btn btn-g" onClick={() => setModal('moCard')}>ביטול</button>
            <button className="btn btn-p" onClick={async () => {
              const to = val(null, 'fu_to');
              const when = val(null, 'fu_when');
              if (!to || !when) { toast('נמען ומועד חובה', 'err'); return; }
              const whenIso = new Date(when).toISOString();
              if (Number.isNaN(Date.parse(whenIso))) { toast('מועד לא תקין', 'err'); return; }
              const stop = val(null, 'fu_stop');
              const kind = val(null, 'fu_kind') || 'email_once';
              const r = await apiRef.current.upsertMailFollowup({
                id: fuEditId || undefined,
                claim_id: curId,
                mail_to: to,
                mail_subject: val(null, 'fu_subj'),
                mail_body: val(null, 'fu_body'),
                mail_kind: kind,
                attach_mode: val(null, 'fu_attach') || 'none',
                repeat_every_days: kind === 'email_repeat' ? val(null, 'fu_repeat') || '7' : '',
                next_run_at: whenIso,
                stop_at: stop ? new Date(stop).toISOString() : '',
                allow_on_closed: isSuperAdmin && !!(document.getElementById('fu_closed') as HTMLInputElement | null)?.checked,
              });
              if (!r.success) { toast(r.error || 'שגיאה', 'err'); return; }
              toast(fuEditId ? 'המעקב עודכן' : 'מעקב מייל הוגדר (Dry Run)');
              setFuEditId(null);
              setCardTab('mailfu');
              setModal('moCard');
              if (curId) await loadCardData(curId);
            }}>💾 שמור מעקב</button>
          </div>
        </div>
      </div>

      <div className={`ov ${modal === 'moClose' ? 'open' : ''}`}>
        <div className="modal modal-sm">
          <div className="mh"><div className="mh-t">🔒 סגירת תיק</div><button className="mcl" onClick={() => setModal('moCard')}>✕</button></div>
          <div className="mb">
            <div className="fg"><label className="fl">סטטוס סגירה *</label>
              <select className="fse fi" id="cl_status"><option value="הסתיים">הסתיים</option><option value="שולם">שולם</option><option value="נדחה">נדחה</option><option value="הועבר לטיפול משפטי">הועבר לטיפול משפטי</option></select>
            </div>
            <div className="fg"><label className="fl">סיבת סגירה *</label>
              <select className="fse fi" id="cl_reason"><option value="">— בחר סיבה —</option>{CLOSE_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
            </div>
            <div className="fg"><label className="fl">הערת סגירה</label><textarea className="fta" id="cl_note" /></div>
          </div>
          <div className="mf"><button className="btn btn-g" onClick={() => setModal('moCard')}>ביטול</button>
            <button className="btn btn-rd" onClick={async () => {
              const reason = val(null, 'cl_reason'); if (!reason) { toast('נא לבחור סיבת סגירה', 'err'); return; }
              const r = await apiRef.current.closeClaim(curId || '', reason, val(null, 'cl_note'), val(null, 'cl_status'));
              if (r.success) { setModal(null); await loadAll(); toast(`תיק נסגר: ${reason}`); }
            }}>🔒 סגור תיק</button>
          </div>
        </div>
      </div>

      <div className={`ov ${modal === 'moSum' || modal === 'moExport' ? 'open' : ''}`}>
        <div className="modal modal-md">
          <div className="mh"><div className="mh-t">{modal === 'moExport' ? '📄 ייצוא תיק מלא' : '📄 סיכום תיק'}</div><button className="mcl" onClick={() => setModal('moCard')}>✕</button></div>
          <div className="mb"><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'Heebo,sans-serif', fontSize: 12, lineHeight: 1.8, color: 'var(--t2)' }}>{modal === 'moExport' ? exportText : sumText}</pre></div>
          <div className="mf">
            <button className="btn btn-g" onClick={() => navigator.clipboard.writeText(modal === 'moExport' ? exportText : sumText).then(() => toast('הועתק'))}>📋 העתק</button>
            <button className="btn btn-g" onClick={() => setModal('moCard')}>סגור</button>
          </div>
        </div>
      </div>

      <div className={`ov ${modal === 'moTemplates' ? 'open' : ''}`}>
        <div className="modal modal-md">
          <div className="mh"><div className="mh-t">📝 תבניות הודעות</div><button className="mcl" onClick={() => setModal(null)}>✕</button></div>
          <div className="mb">
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12 }}>
              {Object.keys(tpl).map((k) => (
                <button key={k} className="btn btn-g btn-sm" onClick={async () => {
                  setCurTpl(k);
                  const claimId = val(null, 'tpl_claim');
                  const c = claimId ? claims.find((x) => x.id === claimId) : null;
                  if (c) {
                    const r = await apiRef.current.fillTemplate(k, c);
                    setVal('tpl_subj', r.subject || '');
                    setVal('tpl_body', r.body || '');
                  } else {
                    setVal('tpl_subj', tpl[k].subject || '');
                    setVal('tpl_body', tpl[k].body || '');
                  }
                }}>{tpl[k].name}</button>
              ))}
            </div>
            <div className="fg"><label className="fl">תיק לשיוך</label>
              <select className="fse fi" id="tpl_claim" onChange={async () => { if (curTpl) {
                const c = claims.find((x) => x.id === val(null, 'tpl_claim'));
                if (c) { const r = await apiRef.current.fillTemplate(curTpl, c); setVal('tpl_subj', r.subject || ''); setVal('tpl_body', r.body || ''); }
              } }}>
                <option value="">— ללא תיק ספציפי —</option>
                {claims.map((c) => <option key={c.id} value={c.id}>{c.id} – {c.clientName} – {c.plate || ''}</option>)}
              </select>
            </div>
            <div className="fg"><label className="fl">נושא</label><input className="fi" id="tpl_subj" /></div>
            <div className="fg"><label className="fl">תוכן</label><textarea className="fta" id="tpl_body" style={{ minHeight: 130 }} /></div>
          </div>
          <div className="mf">
            <button className="btn btn-g" onClick={() => setModal(null)}>סגור</button>
            <button className="btn btn-g btn-sm" onClick={() => navigator.clipboard.writeText(val(null, 'tpl_body')).then(() => toast('הועתק'))}>📋 העתק</button>
          </div>
        </div>
      </div>

      <div className="toasts">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.type}`}>{t.type === 'err' ? '❌ ' : t.type === 'inf' ? 'ℹ️ ' : '✅ '}{t.msg}</div>)}
      </div>
    </div>
  );
}
