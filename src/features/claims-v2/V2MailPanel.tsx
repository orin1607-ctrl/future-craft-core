import { useMemo, useState } from 'react';
import { CLAIM_DOC_TYPES, type ClaimRecord } from '@/features/claims/claimsConstants';
import { detectMailRequests, type AlertContext } from '@/features/claims/claimWorkAlerts';
import { gmailOpenHref } from '@/features/claims/claimMailThread';
import { parseFromAddr } from '@/features/claims/claimContacts';
import { isOpenTreatment, treatmentLabelOf } from '@/features/claims/treatmentCenter';
import { docTypeStatus } from '@/features/claims/ClaimsScreen';
import { buildMailView, mailViewCounts, rowMatches, sectionOf, type MailFilter, type MailRowView, type ThreadView } from './claimMailView';
import type { CardData, ClaimFileRow } from './useClaimsV2Data';
import type { CardTab } from './V2ClaimCard';
import { fmtFull, fmtWhen } from './v2Model';
import { Locked } from './v2Ui';

/** Send-journal tracking labels as shown in the current journal (display only). */
const TRACK_HE: Record<string, string> = { sent: 'נשלח', waiting_reply: 'ממתין לתשובה', reply_received: 'התקבלה תשובה', needs_action: 'דורש טיפול נוסף', done: 'הושלם' };

function stateChip(r: MailRowView) {
  switch (r.state) {
    case 'need': return <span className="chip c-need">דורש טיפול</span>;
    case 'reply': return <span className="chip c-reply">תשובה התקבלה – לבדוק</span>;
    case 'treating': return <span className="chip c-treat">בטיפול</span>;
    case 'handled': return <span className="chip c-done">טופל</span>;
    case 'waiting': return <span className="chip c-wait">ממתין לתשובה</span>;
    case 'overdue': return <span className="chip c-overdue">ממתין לתשובה · באיחור</span>;
    case 'sent': return <span className="chip c-sent">נשלח</span>;
    default: return null;
  }
}

function threadChip(t: ThreadView) {
  if (t.state === 'act') {
    const reply = t.mails.some((m) => m.state === 'reply');
    return <span className={`chip ${reply ? 'c-reply' : 'c-need'}`}>{reply ? 'תשובה התקבלה – לבדוק' : 'דורש טיפול'}</span>;
  }
  if (t.state === 'treating') return <span className="chip c-treat">בטיפול</span>;
  if (t.state === 'wait') return <span className="chip c-wait">ממתין לתשובה{t.last.due ? ` · עד ${fmtWhen(t.last.due)}` : ''}</span>;
  if (t.state === 'overdue') return <span className="chip c-overdue">ממתין לתשובה · באיחור</span>;
  return <span className="chip c-done">טופל / לידיעה</span>;
}

/** "קיים בתיק / חסר" for a request found in the mail text, using the existing doc-type status. */
function requestPresence(label: string, card: CardData) {
  const t = CLAIM_DOC_TYPES.find((d) => d.label === label || d.aliases.includes(label) || d.label.includes(label) || label.includes(d.label));
  if (!t) return null;
  const st = docTypeStatus(t, card.files, card.requests, Boolean(card.uploadLink?.active));
  return st.key === 'exists' || st.key === 'received' ? { ok: true, text: 'קיים בתיק' } : { ok: false, text: st.label };
}

export default function V2MailPanel({ claim, card, alertCtx, ownMailbox, pending, onOpenFile, onGoTab, onOldUi }: {
  claim: ClaimRecord;
  card: CardData;
  alertCtx: AlertContext;
  ownMailbox: string;
  pending: Array<Record<string, unknown>>;
  onOpenFile: (f: ClaimFileRow) => void;
  onGoTab: (t: CardTab) => void;
  onOldUi: () => void;
}) {
  const [filter, setFilter] = useState<MailFilter>('all');
  const [q, setQ] = useState('');
  const view = useMemo(() => buildMailView({
    claim, imports: card.imports, sends: card.sends, ownMailbox, ctx: alertCtx, contacts: card.contacts, files: card.files,
  }), [claim, card, alertCtx, ownMailbox]);
  const counts = mailViewCounts(view.threads);
  const [openThreads, setOpenThreads] = useState<Record<string, boolean>>({});
  const [openMail, setOpenMail] = useState<Record<string, boolean>>({});
  const stateByMid = useMemo(() => {
    const m = new Map<string, MailRowView>();
    for (const t of view.threads) for (const r of t.mails) if (r.mail.gmail_message_id) m.set(r.mail.gmail_message_id, r);
    return m;
  }, [view]);

  const visible = view.threads
    .map((t) => ({ t, rows: t.mails.filter((r) => rowMatches(r, filter, q)) }))
    .filter((x) => x.rows.length > 0);
  const sections: Array<{ key: 'act' | 'wait' | 'rest'; title: string; cls: string }> = [
    { key: 'act', title: 'דורש ממך פעולה', cls: 'need' },
    { key: 'wait', title: 'ממתין לתשובה', cls: 'wait' },
    { key: 'rest', title: 'טופל ולידיעה', cls: '' },
  ];
  const assignedPending = pending.filter((p) => String(p.assigned_claim_id || '') === claim.id && !p.imported_at);
  const knownEmails = new Set(card.contacts.flatMap((c) => c.channels.filter((ch) => ch.kind === 'email').map((ch) => ch.value_norm)));

  const isThreadOpen = (t: ThreadView) => openThreads[t.key] ?? (t.state === 'act' || t.state === 'treating');
  const isMailOpen = (r: MailRowView, rows: MailRowView[]) => {
    const mid = r.mail.gmail_message_id || r.mail.id;
    if (openMail[mid] !== undefined) return openMail[mid];
    return r === rows[rows.length - 1] || r.state === 'need' || r.state === 'reply';
  };

  const renderMail = (r: MailRowView, rows: MailRowView[]) => {
    const m = r.mail;
    const mid = m.gmail_message_id || m.id;
    const open = isMailOpen(r, rows);
    const files = card.files.filter((f) => m.gmail_message_id && f.gmail_message_id === m.gmail_message_id);
    const mailTasks = card.tasks.filter((x) => x.gmailMessageId && x.gmailMessageId === m.gmail_message_id);
    const detected = m.direction === 'incoming' ? detectMailRequests(`${m.subject || ''}\n${m.body_text || ''}`) : [];
    const gmailHref = gmailOpenHref({ threadId: m.gmail_thread_id, messageId: m.gmail_message_id, authUser: ownMailbox });
    const dirLbl = m.direction === 'incoming' ? 'נכנס' : 'יוצא';
    const sender = parseFromAddr(m.from_addr);
    const unknownSender = m.direction === 'incoming' && sender.email && !knownEmails.has(sender.email);
    const reqList = detected.map((d) => {
      const p = requestPresence(d.label, card);
      return <div key={d.type}>• {d.label}{p ? <> — <b style={{ color: p.ok ? 'var(--ok)' : 'var(--wait)' }}>{p.text}</b></> : null}</div>;
    });
    return (
      <div key={m.id} data-v2-mail={mid}>
        <button type="button" className={`v2-mrow${open ? ' open' : ''}`} aria-expanded={open} onClick={() => setOpenMail((p) => ({ ...p, [mid]: !open }))}>
          <span className={`v2-dir ${m.direction}`}>{dirLbl}</span>
          <span className={`v2-from${r.state === 'need' || r.state === 'reply' ? ' hot' : ''}`} data-dir={dirLbl}>{m.direction === 'outgoing' ? `אני → ${r.to}` : r.who}</span>
          <span className="v2-snip">{r.snippet}</span>
          <span className="v2-when">{fmtWhen(m.sent_at)}</span>
          <span className="v2-mend">{r.attachCount ? <span className="v2-att">📎 {r.attachCount}</span> : null}{stateChip(r)}</span>
        </button>
        {open ? (
          <div className="v2-mbody">
            <div className="v2-mb-head">
              <span><b>מאת</b> <span dir="ltr">{m.from_addr || (m.direction === 'outgoing' ? ownMailbox : '—')}</span></span>
              <span><b>אל</b> <span dir="ltr">{m.to_addr || '—'}</span></span>
              {m.cc_addr ? <span><b>עותק</b> <span dir="ltr">{m.cc_addr}</span></span> : null}
              <span><b>תאריך</b> {fmtFull(m.sent_at)}</span>
              {m.send_no ? <span><b>שליחה</b> #{m.send_no}</span> : null}
            </div>
            <div style={{ fontWeight: 700 }}>{m.subject || '(ללא נושא)'}</div>
            {(r.state === 'need' || r.state === 'reply') ? (
              <div className={`v2-need${r.state === 'reply' ? ' reply' : ''}`}>
                <h4>{r.state === 'reply' ? 'תשובה למייל ששלחת – עדיין מסומנת לטיפול' : 'המייל מסומן "דורש טיפול" בתיק'}</h4>
                {reqList.length ? reqList : <div>אין בקשה מזוהה בטקסט.</div>}
              </div>
            ) : r.state === 'treating' ? (
              <div className="v2-need info"><h4>מקושר לטיפול פתוח</h4>
                {card.tasks.filter((x) => x.gmailMessageId === m.gmail_message_id && isOpenTreatment(x)).map((x) => <div key={x.id}>• {treatmentLabelOf(x)}</div>)}
              </div>
            ) : (r.state === 'waiting' || r.state === 'overdue') ? (
              <div className="v2-need wait"><h4>{r.state === 'overdue' ? 'עבר מועד המעקב – עדיין אין תשובה' : `ממתין לתשובה${r.due ? ` עד ${fmtFull(r.due)}` : ''}`}</h4>
                <div>לפי מעקב השליחה ביומן השליחות.</div>
              </div>
            ) : reqList.length ? (
              <div className="v2-need info"><h4>בקשה שזוהתה בטקסט</h4>{reqList}</div>
            ) : null}
            {String(m.body_text || '').trim().length > 2
              ? <pre className="v2-mb-text">{m.body_text}</pre>
              : <div className="v2-hint">{m.direction === 'outgoing' ? 'תוכן המייל שנשלח לא נשמר בתיק. אפשר לפתוח אותו ב-Gmail.' : 'גוף המייל ריק'}</div>}
            {files.length ? (
              <div className="v2-files">{files.map((f) => <button type="button" key={f.id} className="v2-file" onClick={() => onOpenFile(f)}>📎 {f.original_name}</button>)}</div>
            ) : m.file_names?.length ? (
              <div className="v2-files">{m.file_names.map((n) => <span key={n} className="v2-file">📎 {n}</span>)}</div>
            ) : <div className="v2-hint">אין קבצים מצורפים שמורים למייל זה</div>}
            <div className="v2-need info">
              <h4>הערה פנימית</h4>
              <div style={{ whiteSpace: 'pre-wrap' }}>{m.staff_note || <span className="v2-hint">אין הערה</span>}</div>
              <div className="v2-actions" style={{ marginTop: 6 }}><Locked label="ערוך הערה" /></div>
            </div>
            {mailTasks.length ? (
              <div className="v2-actions">
                <span className="v2-hint">משימות מהמייל:</span>
                {mailTasks.map((x) => <button type="button" key={x.id} className="chip c-info" onClick={() => onGoTab('work')}>{x.action || treatmentLabelOf(x)}</button>)}
              </div>
            ) : null}
            <div className="v2-acts">
              {gmailHref ? <a className="v2-btn sm" href={gmailHref} target="_blank" rel="noopener noreferrer">פתח ב-Gmail</a> : null}
              {m.direction === 'incoming' ? <><Locked label="השב" className="v2-btn sm pri" /><Locked label="השב לכולם" /></> : null}
              <Locked label="העבר" />
              {(r.state === 'need' || r.state === 'reply') ? <><Locked label="קראתי – טופל" /><Locked label="השאר להמשך" /><Locked label="המשך כטיפול" /></> : null}
              {m.direction === 'incoming' ? <Locked label="תגובה מוצעת" /> : null}
              {unknownSender ? <Locked label="+ שמור שולח באנשי קשר" /> : null}
              <button type="button" className="v2-btn ghost sm" onClick={onOldUi}>לביצוע בממשק הקיים ↩</button>
            </div>
            <details className="v2-tech">
              <summary>פרטים טכניים</summary>
              <dl>
                <dt>From</dt><dd>{m.from_addr || '—'}</dd>
                <dt>To</dt><dd>{m.to_addr || '—'}</dd>
                <dt>CC</dt><dd>{m.cc_addr || '—'}</dd>
                <dt>Thread</dt><dd>{m.gmail_thread_id || '—'}</dd>
                <dt>Message</dt><dd>{m.gmail_message_id || '—'}</dd>
                <dt>Source</dt><dd>{m.source}</dd>
              </dl>
            </details>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div>
      <div className="v2-mtop">
        <div className="v2-seg" role="group" aria-label="סינון מיילים">
          {([
            ['all', 'הכול', counts.total, false],
            ['need', 'דורש טיפול', counts.act, true],
            ['in', 'נכנס', counts.incoming, false],
            ['out', 'יוצא', counts.outgoing, false],
          ] as Array<[MailFilter, string, number, boolean]>).map(([k, label, n, hot]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {label}<span className={`v2-cnt${hot && n ? ' need' : ''}`}>{n}</span>
            </button>
          ))}
        </div>
        <input className="v2-input" style={{ width: 240 }} placeholder="חיפוש במיילים של התיק" aria-label="חיפוש במיילים של התיק" value={q} onChange={(e) => setQ(e.target.value)} />
        <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 8 }}><Locked label="✉ מייל חדש" className="v2-btn sm pri" /><Locked label="בקשה ללקוח" /></span>
      </div>
      <div className="v2-summary">
        <span className="s-need"><b>{counts.act}</b> דורשים ממך פעולה</span>
        <span className="s-wait"><b>{counts.waitThreads}</b> ממתינים לתשובה{counts.overdueThreads ? ` (${counts.overdueThreads} באיחור)` : ''}</span>
        <span><b>{counts.newToday}</b> נכנסו היום</span>
        <span><b>{counts.total}</b> מיילים ב-{counts.threads} שרשורים</span>
      </div>
      {view.missingNeedIds.length ? (
        <div className="v2-need" style={{ marginBottom: 12 }}>
          <h4>{view.missingNeedIds.length} מיילים מסומנים לטיפול אך עדיין לא נקלטו בתיק</h4>
          {view.missingNeedIds.map((id) => {
            const t = alertCtx.tasks.find((x) => x.gmailMessageId === id);
            const href = gmailOpenHref({ threadId: t?.gmailThreadId, messageId: id, authUser: ownMailbox });
            return <div key={id}>• {t?.action || 'מייל חדש'}{href ? <> · <a href={href} target="_blank" rel="noopener noreferrer">פתח ב-Gmail</a></> : null}</div>;
          })}
        </div>
      ) : null}
      {assignedPending.length ? (
        <div className="v2-need info" style={{ marginBottom: 12 }}>
          <h4>{assignedPending.length} מיילים שויכו לתיק וממתינים לייבוא</h4>
          {assignedPending.map((p) => <div key={String(p.id)}>• {String(p.subject || '(ללא נושא)')} · {String(p.from_addr || '')}</div>)}
        </div>
      ) : null}
      {view.total === 0 ? <div className="v2-empty">אין מיילים בתיק הזה.</div> : null}
      {view.total > 0 && visible.length === 0 ? <div className="v2-empty">אין מיילים שמתאימים לסינון.</div> : null}
      {sections.map((s) => {
        const list = visible.filter((x) => sectionOf(x.t) === s.key);
        if (!list.length) return null;
        return (
          <div className="v2-sec" key={s.key}>
            <div className={`v2-sec-h ${s.cls}`}>{s.title} ({list.length})<span className="ln" /></div>
            {list.map(({ t, rows }) => {
              const open = isThreadOpen(t);
              return (
                <div key={t.key} className={`v2-thread st-${t.state}`}>
                  <button type="button" className="v2-th-head" aria-expanded={open} onClick={() => setOpenThreads((p) => ({ ...p, [t.key]: !open }))}>
                    <span className="v2-th-subj">{t.subject}</span>
                    <span className="v2-th-meta">{t.participants.slice(0, 3).join(', ') || '—'} · {t.mails.length} מיילים ({t.inCount} נכנסים, {t.outCount} יוצאים){rows.length !== t.mails.length ? ` · מוצגים ${rows.length}` : ''}</span>
                    <span className="v2-th-last"><b>{t.last.mail.direction === 'outgoing' ? 'אני' : t.last.who}:</b> {t.last.snippet}</span>
                    <span className="v2-th-side"><span className="v2-when">{fmtWhen(t.last.mail.sent_at)}</span>{threadChip(t)}<span className="v2-chev">{open ? 'סגור ▲' : 'פתח ▼'}</span></span>
                  </button>
                  {open ? <div className="v2-mails">{rows.map((r) => renderMail(r, rows))}</div> : null}
                </div>
              );
            })}
          </div>
        );
      })}
      <div className="v2-tools">
        <details>
          <summary>יומן שליחות ({card.sends.length})</summary>
          <div className="v2-list" style={{ marginTop: 10 }}>
            {card.sends.length === 0 ? <div className="v2-hint">אין שליחות מתועדות בתיק</div> : card.sends.map((s) => {
              const names = Array.isArray(s.file_names) ? (s.file_names as string[]) : [];
              const row = stateByMid.get(String(s.gmail_message_id || ''));
              const track = String(s.track_status || '');
              return (
                <div className="v2-item" key={String(s.id)}>
                  <div className="v2-item-h"><b>שליחה #{String(s.send_no || '—')} · {String(s.subject || '')}</b><span className="v2-chips">{row ? stateChip(row) : null}<span className="chip c-info">{TRACK_HE[track] || track || 'נשלח'}</span></span></div>
                  <div className="v2-hint">{fmtFull(s.sent_at)} · אל {String(s.to_addr || '—')}{s.track_due ? ` · מעקב עד ${fmtFull(s.track_due)}` : ''}</div>
                  <div className="v2-hint">מסמכים שנשלחו: {names.length ? names.join(', ') : 'ללא מצורפים'}</div>
                  <div className="v2-actions">
                    {gmailOpenHref({ threadId: s.gmail_thread_id, messageId: s.gmail_message_id, authUser: ownMailbox })
                      ? <a className="v2-btn sm" href={gmailOpenHref({ threadId: s.gmail_thread_id, messageId: s.gmail_message_id, authUser: ownMailbox }) || '#'} target="_blank" rel="noopener noreferrer">פתח ב-Gmail</a> : null}
                    <Locked label="עדכן מעקב" />
                  </div>
                </div>
              );
            })}
          </div>
        </details>
        <details>
          <summary>ייבוא מייל מ-Gmail</summary>
          <div className="v2-note" style={{ marginTop: 8 }}>ייבוא ידני של מייל שלא שויך אוטומטית, עם כל המצורפים.</div>
          <div className="v2-actions" style={{ marginTop: 8 }}><Locked label="בחירת מייל לייבוא" /></div>
        </details>
      </div>
    </div>
  );
}
