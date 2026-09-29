import { useState } from 'react';
import { displayClaimNum, type ClaimRecord } from '@/features/claims/claimsConstants';
import { customerKindLabel, customerStatusLabel, customerStatusOf } from '@/features/claims/claimWorkAlerts';
import {
  completedTreatments, filesForTreatment, isTreatmentItem, openTreatments, recurringForTreatment, treatmentLabelOf, treatmentStatusHe,
} from '@/features/claims/treatmentCenter';
import { customerTableLabel } from '@/features/claims/customerRequestModel';
import { contactRoleLabel, CONTACT_ROLES } from '@/features/claims/claimContacts';
import { shareKindLabel, shareStatusLabel, shareStatusOf } from '@/features/claims/claimSecureShare';
import type { CardData, ClaimFileRow } from './useClaimsV2Data';
import type { CardTab } from './V2ClaimCard';
import { extraFields, FIELD_GROUPS, fieldValue, fmtDay, fmtFull, fmtWhen } from './v2Model';
import { CopyButton, Locked } from './v2Ui';

/* ---------------- details ---------------- */
export function V2Details({ claim }: { claim: ClaimRecord }) {
  const extras = extraFields(claim);
  const always = new Set(['claim', 'client', 'vehicle', 'insurer', 'surveyor']);
  return (
    <div className="v2-list" style={{ gap: 14 }}>
      <div className="v2-actions"><Locked label="✎ ערוך פרטי תיק" /><span className="v2-hint">כל השדות שקיימים ברשומת התביעה</span></div>
      {FIELD_GROUPS.map((g) => {
        const filled = g.fields.filter(([k]) => fieldValue(claim, k));
        if (!always.has(g.key) && !filled.length) return null;
        return (
          <div className="v2-box" key={g.key}>
            <div className="v2-sec-h">{g.title}<span className="ln" /></div>
            <dl className="v2-grid v2-kv" style={{ margin: 0 }}>
              {g.fields.map(([k, label]) => {
                const v = k === 'claimNum' ? displayClaimNum({ claimNum: claim.claimNum }) : fieldValue(claim, k);
                if (!v && !always.has(g.key)) return null;
                return <div key={k}><dt>{label}</dt><dd>{v || '—'}</dd></div>;
              })}
            </dl>
          </div>
        );
      })}
      {extras.length ? (
        <details className="v2-box">
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>שדות נוספים שקיימים ברשומה ({extras.length})</summary>
          <dl className="v2-grid v2-kv" style={{ margin: '10px 0 0' }}>
            {extras.map(([k, v]) => <div key={k}><dt dir="ltr" style={{ textAlign: 'right' }}>{k}</dt><dd>{v}</dd></div>)}
          </dl>
        </details>
      ) : null}
    </div>
  );
}

/* ---------------- work ---------------- */
export function V2Work({ claim, card, onOpenFile, onGoTab }: {
  claim: ClaimRecord; card: CardData; onOpenFile: (f: ClaimFileRow) => void; onGoTab: (t: CardTab) => void;
}) {
  const [openId, setOpenId] = useState('');
  const open = openTreatments(card.tasks);
  const done = completedTreatments(card.tasks);
  const cust = card.tasks.filter((t) => !isTreatmentItem(t) && t.audience === 'customer');
  const internal = card.tasks.filter((t) => !isTreatmentItem(t) && t.audience !== 'customer');
  const openInternal = internal.filter((t) => t.done !== 'true');
  const closedInternal = internal.filter((t) => t.done === 'true');
  return (
    <div>
      {claim.treatmentPending === 'true' ? (
        <div className="v2-banner" style={{ marginBottom: 12 }}><span>נדרש עדכון טיפול: {claim.treatmentPendingAction || 'פעולה משמעותית'}</span><Locked label="השלם עדכון טיפול" /></div>
      ) : null}
      <div className="v2-kpis" style={{ marginBottom: 14 }}>
        <div><b>{fmtDay(claim.lastTreatmentAt) || '—'}</b><span>טיפול אחרון{claim.lastTreatmentAction ? ` · ${claim.lastTreatmentAction}` : ''}</span></div>
        <div><b>{fmtDay(claim.nextDate) || '—'}</b><span>טיפול הבא{claim.nextAction ? ` · ${claim.nextAction}` : ''}</span></div>
        <div><b>{open.length}</b><span>טיפולים פעילים</span></div>
        <div><b>{openInternal.length}</b><span>משימות פתוחות</span></div>
        <div><b>{card.reminders.length}</b><span>תזכורות</span></div>
        <div><b>{card.followups.filter((f) => f.status === 'scheduled').length}</b><span>מעקבי מייל פעילים</span></div>
      </div>
      <div className="v2-actions" style={{ marginBottom: 14 }}>
        <Locked label="עדכון טיפול" className="v2-btn sm pri" /><Locked label="בקשה ללקוח" /><Locked label="＋ משימה פנימית" /><Locked label="＋ תזכורת" /><Locked label="＋ מעקב מייל" />
      </div>

      <div className="v2-sec"><div className="v2-sec-h need">טיפולים פעילים ({open.length})<span className="ln" /></div>
        {open.length === 0 ? <div className="v2-hint">אין טיפול פתוח</div> : (
          <div className="v2-list">{open.map((t) => {
            const files = filesForTreatment(t, card.files);
            const rec = recurringForTreatment(card.followups, t.id);
            const isOpen = openId === t.id;
            return (
              <div className="v2-item" key={t.id}>
                <button type="button" className="v2-item-h" style={{ border: 0, background: 'none', padding: 0, textAlign: 'right' }} aria-expanded={isOpen} onClick={() => setOpenId(isOpen ? '' : t.id)}>
                  <b>{treatmentLabelOf(t)}</b><span className="chip c-treat">{treatmentStatusHe(t)}</span>
                </button>
                <div className="v2-hint">{[t.dueDate ? `יעד ${fmtDay(t.dueDate)}` : '', t.createdAt ? `נפתח ${fmtWhen(t.createdAt)}` : '', files.length ? `${files.length} מסמכים` : '', rec.length ? `${rec.length} מיילים חוזרים` : ''].filter(Boolean).join(' · ')}</div>
                {isOpen ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                    <div className="v2-hint">מרכז טיפול – צפייה</div>
                    {t.note ? <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{t.note}</div> : null}
                    {t.requestText ? <div className="v2-hint">בקשה: {t.requestText}</div> : null}
                    {files.length ? <div className="v2-files">{files.map((f) => <button type="button" key={f.id} className="v2-file" onClick={() => onOpenFile(f as ClaimFileRow)}>📎 {f.original_name}</button>)}</div> : <div className="v2-hint">אין מסמכים משויכים לטיפול</div>}
                    {rec.length ? rec.map((r) => <div key={r.id} className="v2-hint">מייל חוזר אל {r.mail_to || '—'} · {r.status}</div>) : null}
                    {t.gmailMessageId ? <button type="button" className="v2-btn ghost sm" onClick={() => onGoTab('mail')}>למייל המקורי</button> : null}
                    <div className="v2-actions">
                      <Locked label="עדכון טיפול" /><Locked label="אשר מסמך" /><Locked label="דחה מסמך" /><Locked label="בקש מסמך" />
                      <Locked label="שלח במייל" /><Locked label="השב" /><Locked label="מעקב" /><Locked label="מייל חוזר" /><Locked label="סגור טיפול" />
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}</div>
        )}
      </div>

      <div className="v2-sec"><div className="v2-sec-h">בקשות ללקוח ({cust.length})<span className="ln" /></div>
        {cust.length === 0 ? <div className="v2-hint">אין בקשות ללקוח</div> : (
          <div className="v2-list">{cust.map((t) => (
            <div className="v2-item" key={t.id}>
              <div className="v2-item-h"><b>{customerTableLabel(t) || customerKindLabel(t.customerKind || t.action || '')}</b><span className={`chip ${customerStatusOf(t) === 'received' ? 'c-need' : customerStatusOf(t) === 'done' ? 'c-done' : 'c-wait'}`}>{customerStatusLabel(customerStatusOf(t))}</span></div>
              {t.requestText ? <div className="v2-hint">{t.requestText}</div> : null}
              <div className="v2-hint">{[t.channel ? `ערוץ: ${t.channel}` : '', t.sentAt ? `נשלח ${fmtWhen(t.sentAt)}` : '', t.dueDate ? `יעד ${fmtDay(t.dueDate)}` : ''].filter(Boolean).join(' · ')}</div>
              <div className="v2-actions"><Locked label="אשר" /><Locked label="שלח שוב" /><Locked label="שנה סטטוס" /></div>
            </div>
          ))}</div>
        )}
      </div>

      <div className="v2-sec"><div className="v2-sec-h">משימות פתוחות ({openInternal.length})<span className="ln" /></div>
        {openInternal.length === 0 ? <div className="v2-hint">אין משימות פתוחות</div> : (
          <div className="v2-list">{openInternal.map((t) => (
            <div className="v2-item" key={t.id}>
              <div className="v2-item-h"><b>{t.action || 'משימה'}</b>{t.gmailMessageId ? <button type="button" className="chip c-info" onClick={() => onGoTab('mail')}>ממייל</button> : null}</div>
              {t.note ? <div className="v2-hint">{t.note}</div> : null}
              <div className="v2-hint">{[t.dueDate ? `יעד ${fmtDay(t.dueDate)}` : '', t.workStatus || '', t.owner || ''].filter(Boolean).join(' · ')}</div>
              <div className="v2-actions"><Locked label="שנה סטטוס" /></div>
            </div>
          ))}</div>
        )}
      </div>

      <div className="v2-sec"><div className="v2-sec-h">תזכורות ({card.reminders.length})<span className="ln" /></div>
        {card.reminders.length === 0 ? <div className="v2-hint">אין תזכורות</div> : (
          <div className="v2-list">{card.reminders.map((r) => (
            <div className="v2-item" key={r.id}><div className="v2-item-h"><b>{r.note || 'תזכורת'}</b><span className="v2-when">{fmtDay(r.date)} {r.time || ''}</span></div></div>
          ))}</div>
        )}
      </div>

      <div className="v2-sec"><div className="v2-sec-h">מעקבי מייל, מיילים מתוזמנים וחוזרים ({card.followups.length})<span className="ln" /></div>
        {card.followups.length === 0 ? <div className="v2-hint">אין מעקב מייל בתיק</div> : (
          <div className="v2-list">{card.followups.map((f) => (
            <div className="v2-item" key={f.id}>
              <div className="v2-item-h"><b>{f.mail_subject || '(ללא נושא)'}</b><span className="chip c-info">{f.status}</span></div>
              <div className="v2-hint">{[f.mail_kind === 'email_repeat' ? 'מייל חוזר' : f.purpose === 'scheduled_send' ? 'מייל מתוזמן' : 'מעקב', `אל ${f.mail_to || '—'}`, f.next_run_at ? `הבא ${fmtFull(f.next_run_at)}` : '', f.repeat_every_days ? `כל ${f.repeat_every_days} ימים` : '', f.jobs?.length ? `${f.jobs.length} ריצות` : ''].filter(Boolean).join(' · ')}</div>
              <div className="v2-actions"><Locked label="עריכה" /><Locked label="ביטול" /><Locked label="Retry" /><Locked label="שליחת בדיקה" /></div>
            </div>
          ))}</div>
        )}
      </div>

      {(done.length || closedInternal.length) ? (
        <details className="v2-box">
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>טיפולים ומשימות שהושלמו ({done.length + closedInternal.length})</summary>
          <div className="v2-list" style={{ marginTop: 10 }}>
            {[...done, ...closedInternal].map((t) => (
              <div className="v2-item" key={t.id}><div className="v2-item-h"><b>{isTreatmentItem(t) ? treatmentLabelOf(t) : (t.action || 'משימה')}</b><span className="chip c-done">הושלם</span></div>
                {t.completedAt ? <div className="v2-hint">{fmtFull(t.completedAt)}</div> : null}</div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

/* ---------------- people, links, shares ---------------- */
export function V2People({ claim, card, revealLink }: {
  claim: ClaimRecord; card: CardData; revealLink: (claimId: string) => Promise<{ ok: boolean; token: string; url: string; error: string }>;
}) {
  const [link, setLink] = useState<{ url: string; error: string } | null>(null);
  const byRole = CONTACT_ROLES.map((r) => ({ role: r, list: card.contacts.filter((c) => c.role === r.key) })).filter((g) => g.list.length);
  const other = card.contacts.filter((c) => !CONTACT_ROLES.some((r) => r.key === c.role));
  const groups = other.length ? [...byRole, { role: { key: '_', label: 'אחר' }, list: other }] : byRole;
  const show = async () => {
    const r = await revealLink(claim.id);
    if (!r.ok) { setLink({ url: '', error: r.error === 'revoked' ? 'הקישור בוטל' : r.error === 'expired' ? 'הקישור פג תוקף' : 'אין קישור שניתן להציג – צריך להנפיק חדש בממשק הקיים' }); return; }
    const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    setLink({ url: r.url || `${window.location.origin}${base && base !== '/' ? base : ''}/claims-upload?t=${r.token}`, error: '' });
  };
  return (
    <div>
      <div className="v2-sec"><div className="v2-sec-h">אנשי קשר בתיק ({card.contacts.length})<span className="ln" /></div>
        <div className="v2-actions" style={{ marginBottom: 10 }}><Locked label="＋ הוסף איש קשר" /><Locked label="שייך מהמאגר" /><Locked label="טען מחלקות חברות ביטוח" /></div>
        {card.contacts.length === 0 ? <div className="v2-hint">אין אנשי קשר משויכים</div> : groups.map((g) => (
          <div key={g.role.key} style={{ marginBottom: 12 }}>
            <div className="v2-hint" style={{ fontWeight: 800, marginBottom: 6 }}>{g.role.label}</div>
            <div className="v2-list">{g.list.map((c) => (
              <div className="v2-item" key={c.id}>
                <div className="v2-item-h"><b>{c.full_name}</b><span className="v2-chips">{c.is_primary_treatment ? <span className="chip c-treat">ראשי לטיפול</span> : null}<span className="chip c-info">{contactRoleLabel(c.role)}</span></span></div>
                {c.company_name || c.department ? <div className="v2-hint">{[c.company_name, c.department].filter(Boolean).join(' · ')}</div> : null}
                <div className="v2-files">{c.channels.map((ch) => (
                  <span key={ch.id} className="v2-file"><span dir="ltr">{ch.value}</span><CopyButton text={ch.value} label="העתק" className="v2-btn ghost sm" /></span>
                ))}</div>
                <div className="v2-actions"><Locked label="התקשר" /><Locked label="מייל" /><Locked label="WhatsApp" /><Locked label="ראשי לטיפול" /></div>
              </div>
            ))}</div>
          </div>
        ))}
      </div>

      <div className="v2-sec"><div className="v2-sec-h">קישורים ללקוח<span className="ln" /></div>
        <div className="v2-list">
          <div className="v2-link-box">
            <b>קישור העלאת מסמכים</b>
            <div className="v2-hint">{card.uploadLink?.active ? `פעיל · נוצר ${fmtWhen(card.uploadLink.created_at)} · בתוקף עד ${fmtFull(card.uploadLink.expires_at)}` : card.uploadLink ? 'לא פעיל (פג תוקף או בוטל)' : 'אין קישור'}</div>
            {card.uploadLink?.active ? <div className="v2-actions"><button type="button" className="v2-btn sm" onClick={() => void show()}>הצג קישור</button></div> : null}
            {link?.url ? <div className="v2-url">{link.url}</div> : null}
            {link?.url ? <div className="v2-actions"><CopyButton text={link.url} label="העתק קישור" /><a className="v2-btn sm" href={link.url} target="_blank" rel="noopener noreferrer">פתח קישור</a></div> : null}
            {link?.error ? <div className="v2-hint">{link.error}</div> : null}
            <div className="v2-actions"><Locked label="שתף / WhatsApp" /><Locked label="צור קישור חדש" /><Locked label="בטל קישור" /></div>
          </div>
          <div className="v2-link-box">
            <b>קישור טופס אירוע / חתימה</b>
            <div className="v2-hint">הקישור נוצר בכל שליחה מחדש ולא נשמר לצפייה בתיק.{claim.source === 'Customer Accident Intake' ? ' התיק נפתח מטופס לקוח.' : ''}</div>
            <div className="v2-actions"><Locked label="שלח ללקוח לחתימה" /></div>
          </div>
        </div>
      </div>

      <div className="v2-sec"><div className="v2-sec-h">שיתופים מאובטחים ({card.shares.length})<span className="ln" /></div>
        <div className="v2-actions" style={{ marginBottom: 10 }}><Locked label="＋ צור שיתוף מאובטח" /></div>
        {card.shares.length === 0 ? <div className="v2-hint">אין שיתופים</div> : (
          <div className="v2-list">{card.shares.map((s) => (
            <div className="v2-item" key={s.id}>
              <div className="v2-item-h"><b>{s.recipient_name || '—'} · {shareKindLabel(s.recipient_kind)}</b><span className="chip c-info">{shareStatusLabel(shareStatusOf(s))}</span></div>
              <div className="v2-hint">{(s.file_names || []).length || s.file_ids.length} קבצים · נוצר {fmtWhen(s.created_at)}{s.created_by_name ? ` ע״י ${s.created_by_name}` : ''} · תוקף {fmtFull(s.expires_at)}</div>
              <div className="v2-hint">{s.opened_at ? `נפתח ${fmtWhen(s.opened_at)}` : 'טרם נפתח'}{s.open_count ? ` · ${s.open_count} פתיחות` : ''}{s.last_download_at ? ` · הורדה אחרונה ${fmtWhen(s.last_download_at)}` : ''}</div>
              {(s.file_names || []).length ? <div className="v2-hint">{(s.file_names || []).join(', ')}</div> : null}
              <div className="v2-actions"><Locked label="בטל קישור" /></div>
            </div>
          ))}</div>
        )}
      </div>
    </div>
  );
}

/* ---------------- history ---------------- */
export function V2History({ card }: { card: CardData }) {
  const [onlyStatus, setOnlyStatus] = useState(false);
  const statusRows = card.history.filter((h) => h.type === 'status' || h.type === 'treatment' || h.type === 'new');
  const rows = onlyStatus ? statusRows : card.history;
  return (
    <div>
      <div className="v2-actions" style={{ marginBottom: 12 }}>
        <div className="v2-seg" role="group" aria-label="סוג היסטוריה">
          <button type="button" aria-pressed={!onlyStatus} onClick={() => setOnlyStatus(false)}>כל ההיסטוריה<span className="v2-cnt">{card.history.length}</span></button>
          <button type="button" aria-pressed={onlyStatus} onClick={() => setOnlyStatus(true)}>סטטוסים וטיפולים<span className="v2-cnt">{statusRows.length}</span></button>
        </div>
        <Locked label="📞 רישום שיחה" />
      </div>
      <div className="v2-sec">
        {rows.length === 0 ? <div className="v2-hint">אין היסטוריה עדיין</div> : (
          <div className="v2-list">{rows.map((h) => (
            <div className="v2-item" key={h.id}>
              <div className="v2-item-h"><b>{h.action}</b><span className="v2-when">{h.at || ''}</span></div>
              {(h.valueBefore || h.valueAfter) ? <div className="v2-hint">{h.valueBefore || '—'} → {h.valueAfter || '—'}</div> : null}
              {h.note ? <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{h.note}</div> : null}
              {h.by ? <div className="v2-hint">{h.by}</div> : null}
            </div>
          ))}</div>
        )}
      </div>
      <div className="v2-sec"><div className="v2-sec-h">יומן תקשורת – שיחות והערות ({card.comm.length})<span className="ln" /></div>
        {card.comm.length === 0 ? <div className="v2-hint">אין רשומות</div> : (
          <div className="v2-list">{card.comm.map((c) => (
            <div className="v2-item" key={c.id}>
              <div className="v2-item-h"><b>{c.type === 'call' ? 'שיחה' : c.type === 'note' ? 'הערה' : c.type === 'whatsapp' ? 'WhatsApp' : (c.type || 'רשומה')}{c.contactName ? ` · ${c.contactName}` : ''}{c.phone ? ` · ${c.phone}` : ''}</b><span className="v2-when">{c.at || c.createdAt || ''}</span></div>
              {c.body ? <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{c.body}</div> : null}
              {c.note ? <div className="v2-hint">{c.note}</div> : null}
              {c.by || c.createdBy ? <div className="v2-hint">{c.by || c.createdBy}</div> : null}
            </div>
          ))}</div>
        )}
      </div>
    </div>
  );
}
