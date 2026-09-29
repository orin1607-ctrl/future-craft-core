import { useEffect, useState } from 'react';
import { displayClaimNum, type ClaimRecord } from '@/features/claims/claimsConstants';
import { customerTableLabel } from '@/features/claims/customerRequestModel';
import { isTreatmentItem, treatmentLabelOf } from '@/features/claims/treatmentCenter';
import { fmtDay, fmtFull } from './v2Model';
import { CopyButton, Locked, Modal } from './v2Ui';

type Reports = {
  data: () => Promise<unknown>;
  inactive: (days: number) => Promise<unknown>;
  templates: () => Promise<unknown>;
  fill: (key: string, claim: Record<string, string>) => Promise<unknown>;
};

const money = (n: unknown) => `${Math.round(Number(n) || 0).toLocaleString('he-IL')} ₪`;

export function V2TasksView({ tasks, claims, onOpen }: { tasks: ClaimRecord[]; claims: ClaimRecord[]; onOpen: (claimId: string) => void }) {
  const open = tasks.filter((t) => t.done !== 'true');
  return (
    <div>
      <div className="v2-lh"><h2>משימות פתוחות – כל התיקים ({open.length})</h2><Locked label="＋ משימה" /></div>
      {open.length === 0 ? <div className="v2-empty">אין משימות פתוחות</div> : (
        <div className="v2-list">
          {open.map((t) => {
            const c = claims.find((x) => x.id === t.claimId);
            const title = isTreatmentItem(t) ? treatmentLabelOf(t) : t.audience === 'customer' ? (customerTableLabel(t) || t.action) : (t.action || 'משימה');
            return (
              <button type="button" key={t.id} className="v2-item" style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => t.claimId && onOpen(t.claimId)}>
                <div className="v2-item-h"><b>{c?.clientName || 'ללא שם לקוח'}</b><span className="v2-hint">{c ? displayClaimNum({ claimNum: c.claimNum }) : ''}{c?.insCompany ? ` · ${c.insCompany}` : ''}</span></div>
                <div style={{ fontWeight: 600 }}>{title}</div>
                <div className="v2-hint">{[t.dueDate ? `יעד ${fmtDay(t.dueDate)}` : '', t.workStatus || '', c?.assigned_to_name ? `מטפל: ${c.assigned_to_name}` : ''].filter(Boolean).join(' · ')}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function V2ReportsView({ reports, onOpen }: { reports: Reports; onOpen: (claimId: string) => void }) {
  const [rep, setRep] = useState<Record<string, unknown> | null>(null);
  const [days, setDays] = useState(14);
  const [inactive, setInactive] = useState<ClaimRecord[] | null>(null);
  useEffect(() => { void reports.data().then((r) => setRep(r as Record<string, unknown>)).catch(() => setRep({})); }, [reports]);
  useEffect(() => {
    setInactive(null);
    void reports.inactive(days).then((r) => setInactive(((r as { data?: ClaimRecord[] }).data) || [])).catch(() => setInactive([]));
  }, [reports, days]);
  const s = (rep?.summary || {}) as Record<string, number>;
  const byStatus = (rep?.byStatus || {}) as Record<string, number>;
  const byCo = (rep?.byCompany || {}) as Record<string, { count: number; amt: number; paid: number; legal: number }>;
  const bySurv = (rep?.bySurveyor || {}) as Record<string, { count: number; paid: number }>;
  return (
    <div>
      <div className="v2-lh"><h2>דוחות ניהול</h2><span className="v2-hint">קריאה בלבד</span></div>
      {!rep ? <div className="v2-empty">טוען דוח…</div> : (
        <>
          <div className="v2-kpis">
            <div><b>{s.total ?? 0}</b><span>סה״כ תיקים</span></div>
            <div><b>{s.open ?? 0}</b><span>פתוחים</span></div>
            <div><b>{s.legal ?? 0}</b><span>בטיפול משפטי</span></div>
            <div><b>{money(s.totalAmt)}</b><span>סכום תביעות</span></div>
            <div><b>{money(s.totalAppr)}</b><span>אושר</span></div>
            <div><b>{money(s.totalPaid)}</b><span>שולם</span></div>
            <div><b>{money(s.balance)}</b><span>יתרה לגבייה</span></div>
            <div><b>{String(rep.openTasks ?? 0)}</b><span>משימות פתוחות</span></div>
          </div>
          <div className="v2-sec" style={{ marginTop: 16 }}><div className="v2-sec-h">לפי סטטוס<span className="ln" /></div>
            <div className="v2-status">{Object.entries(byStatus).map(([k, n]) => <span key={k} className="v2-pill">{k} · {n}</span>)}</div>
          </div>
          <div className="v2-sec"><div className="v2-sec-h">לפי חברת ביטוח<span className="ln" /></div>
            <div className="v2-table-wrap" style={{ display: 'block' }}><table style={{ minWidth: 520 }}><thead><tr><th>חברה</th><th>תיקים</th><th>סכום</th><th>שולם</th><th>משפטי</th></tr></thead>
              <tbody>{Object.entries(byCo).map(([k, v]) => <tr key={k} style={{ cursor: 'default' }}><td>{k}</td><td className="num">{v.count}</td><td className="num">{money(v.amt)}</td><td className="num">{money(v.paid)}</td><td className="num">{v.legal}</td></tr>)}</tbody></table></div>
          </div>
          <div className="v2-sec"><div className="v2-sec-h">לפי שמאי<span className="ln" /></div>
            <div className="v2-status">{Object.entries(bySurv).map(([k, v]) => <span key={k} className="v2-pill">{k} · {v.count}</span>)}</div>
          </div>
        </>
      )}
      <div className="v2-sec"><div className="v2-sec-h">תיקים ללא פעילות<span className="ln" /></div>
        <div className="v2-seg" role="group" aria-label="ימים" style={{ marginBottom: 10 }}>
          {[7, 14, 30, 60].map((d) => <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>{d} ימים</button>)}
        </div>
        {inactive === null ? <div className="v2-hint">טוען…</div> : inactive.length === 0 ? <div className="v2-hint">אין תיקים ללא פעילות בטווח הזה</div> : (
          <div className="v2-list">{inactive.map((c) => (
            <button type="button" key={c.id} className="v2-item" style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => onOpen(c.id)}>
              <div className="v2-item-h"><b>{c.clientName || '—'}</b><span className="v2-pill">{c.status || '—'}</span></div>
              <div className="v2-hint">{displayClaimNum({ claimNum: c.claimNum })} · {c.insCompany || '—'} · פעילות אחרונה {fmtDay(c.lastActivityAt || c.updatedAt) || '—'}</div>
            </button>
          ))}</div>
        )}
      </div>
    </div>
  );
}

export function V2GmailView({ gmail, pending, claims, isSuperAdmin, onOpen }: {
  gmail: { connected: boolean; email: string; lastScanAt: string; sendEnabled: boolean | null };
  pending: Array<Record<string, unknown>>;
  claims: ClaimRecord[];
  isSuperAdmin: boolean;
  onOpen: (claimId: string) => void;
}) {
  const review = pending.filter((p) => !p.imported_at && String(p.decision) !== 'auto');
  const assigned = pending.filter((p) => !p.imported_at && p.assigned_claim_id);
  return (
    <div>
      <div className="v2-lh"><h2>Gmail – חיבור תיבת דליה</h2>
        <Locked label="סרוק מיילים נכנסים" />
        <Locked label="סריקת יוצאים (תצוגה)" title="גם התצוגה מעדכנת את חיבור Gmail בשרת – לכן לא מחובר בשלב הזה" />
      </div>
      <div className="v2-box" style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700 }}>{gmail.connected ? `מחובר: ${gmail.email || '—'}` : 'לא מחובר'}</div>
        <div className="v2-hint">{gmail.lastScanAt ? `סריקה אחרונה: ${fmtFull(gmail.lastScanAt)}` : ''}{gmail.sendEnabled === null ? '' : ` · שליחה חיה ${gmail.sendEnabled ? 'פעילה' : 'כבויה'}`}</div>
        {isSuperAdmin ? <div style={{ marginTop: 8 }}><Locked label="בטל חיבור Gmail" /></div> : null}
      </div>
      <div className="v2-sec"><div className="v2-sec-h wait">דורש בדיקת שיוך ({review.length})<span className="ln" /></div>
        {review.length === 0 ? <div className="v2-hint">אין מיילים שממתינים לשיוך ידני</div> : (
          <div className="v2-list">{review.map((p) => (
            <div className="v2-item" key={String(p.id)}>
              <div className="v2-item-h"><b>{String(p.subject || '(ללא נושא)')}</b><span className="v2-when">{String(p.sent_at || '')}</span></div>
              <div className="v2-hint">{String(p.from_addr || '')}</div>
              {p.reason ? <div className="v2-hint">{String(p.reason)}</div> : null}
              <div className="v2-actions"><Locked label="בחירת תביעה ושיוך ידני" /></div>
            </div>
          ))}</div>
        )}
      </div>
      {assigned.length ? (
        <div className="v2-sec"><div className="v2-sec-h">שויכו וממתינים לייבוא ({assigned.length})<span className="ln" /></div>
          <div className="v2-list">{assigned.map((p) => {
            const c = claims.find((x) => x.id === String(p.assigned_claim_id));
            return (
              <button type="button" key={String(p.id)} className="v2-item" style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => c && onOpen(c.id)}>
                <b>{String(p.subject || '(ללא נושא)')}</b><span className="v2-hint">{c ? `${c.clientName || ''} · ${displayClaimNum({ claimNum: c.claimNum })}` : String(p.assigned_claim_id)}</span>
              </button>
            );
          })}</div>
        </div>
      ) : null}
    </div>
  );
}

export function V2TemplatesModal({ reports, claims, onClose }: { reports: Reports; claims: ClaimRecord[]; onClose: () => void }) {
  const [tpls, setTpls] = useState<Record<string, { name: string; subject?: string; body: string }>>({});
  const [key, setKey] = useState('');
  const [claimId, setClaimId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  useEffect(() => {
    void reports.templates().then((r) => {
      const data = ((r as { data?: Record<string, { name: string; subject?: string; body: string }> }).data) || {};
      setTpls(data);
      const first = Object.keys(data)[0] || '';
      setKey(first);
    }).catch(() => setTpls({}));
  }, [reports]);
  useEffect(() => {
    const t = tpls[key];
    if (!t) return;
    const c = claims.find((x) => x.id === claimId);
    if (!c) { setSubject(t.subject || ''); setBody(t.body); return; }
    void reports.fill(key, c as unknown as Record<string, string>).then((r) => {
      const x = r as { subject?: string; body?: string };
      setSubject(String(x.subject || '')); setBody(String(x.body || ''));
    });
  }, [key, claimId, tpls, claims, reports]);
  return (
    <Modal title="תבניות הודעות" onClose={onClose} footer={<><CopyButton text={body} label="העתק תוכן" /><CopyButton text={subject} label="העתק נושא" /><button type="button" className="v2-btn sm" onClick={onClose}>סגור</button></>}>
      <div className="v2-note">מילוי והעתקה בלבד. שום דבר לא נשלח ולא נשמר.</div>
      <div className="v2-actions">
        <select className="v2-input" aria-label="תבנית" value={key} onChange={(e) => setKey(e.target.value)}>
          {Object.entries(tpls).map(([k, t]) => <option key={k} value={k}>{t.name}</option>)}
        </select>
        <select className="v2-input" aria-label="תיק לשיוך" value={claimId} onChange={(e) => setClaimId(e.target.value)}>
          <option value="">— ללא תיק ספציפי —</option>
          {claims.map((c) => <option key={c.id} value={c.id}>{displayClaimNum({ claimNum: c.claimNum })} · {c.clientName}</option>)}
        </select>
      </div>
      {subject ? <div><div className="v2-hint">נושא</div><div className="v2-pre">{subject}</div></div> : null}
      <div><div className="v2-hint">תוכן</div><pre className="v2-pre">{body}</pre></div>
    </Modal>
  );
}
