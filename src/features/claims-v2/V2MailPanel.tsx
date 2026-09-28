import { useMemo, useState } from 'react';
import type { ClaimRecord } from '@/features/claims/claimsConstants';
import { detectMailRequests, type AlertContext } from '@/features/claims/claimWorkAlerts';
import { gmailOpenHref } from '@/features/claims/claimMailThread';
import { treatmentLabelOf, isOpenTreatment } from '@/features/claims/treatmentCenter';
import { buildMailView, mailViewCounts, rowMatches, sectionOf, type MailFilter, type MailRowView, type ThreadView } from './claimMailView';
import type { CardData, ClaimFileRow } from './useClaimsV2Data';
import { fmtFull, fmtWhen } from './v2Model';

function stateChip(r: MailRowView) {
  switch (r.state) {
    case 'need': return <span className="chip c-need">דורש טיפול</span>;
    case 'reply': return <span className="chip c-reply">תשובה חזרה – לבדוק</span>;
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
    return <span className={`chip ${reply ? 'c-reply' : 'c-need'}`}>{reply ? 'תשובה חזרה – לבדוק' : 'דורש טיפול'}</span>;
  }
  if (t.state === 'treating') return <span className="chip c-treat">בטיפול</span>;
  if (t.state === 'wait') return <span className="chip c-wait">ממתין לתשובה{t.last.due ? ` · עד ${fmtWhen(t.last.due)}` : ''}</span>;
  if (t.state === 'overdue') return <span className="chip c-overdue">ממתין לתשובה · באיחור</span>;
  return <span className="chip c-done">טופל / לידיעה</span>;
}

export default function V2MailPanel({ claim, card, alertCtx, ownMailbox, pending, onOpenFile, onOldUi }: {
  claim: ClaimRecord;
  card: CardData;
  alertCtx: AlertContext;
  ownMailbox: string;
  pending: Array<Record<string, unknown>>;
  onOpenFile: (f: ClaimFileRow) => void;
  onOldUi: () => void;
}) {
  const [filter, setFilter] = useState<MailFilter>('all');
  const [q, setQ] = useState('');
  const view = useMemo(() => buildMailView({
    claim,
    imports: card.imports,
    sends: card.sends,
    ownMailbox,
    ctx: alertCtx,
    contacts: card.contacts,
    files: card.files,
  }), [claim, card, alertCtx, ownMailbox]);
  const counts = mailViewCounts(view.threads);
  const [openThreads, setOpenThreads] = useState<Record<string, boolean>>({});
  const [openMail, setOpenMail] = useState<Record<string, boolean>>({});

  const visible = view.threads
    .map((t) => ({ t, rows: t.mails.filter((r) => rowMatches(r, filter, q)) }))
    .filter((x) => x.rows.length > 0);
  const sections: Array<{ key: 'act' | 'wait' | 'rest'; title: string; cls: string }> = [
    { key: 'act', title: 'דורש ממך פעולה', cls: 'need' },
    { key: 'wait', title: 'ממתין לתשובה', cls: 'wait' },
    { key: 'rest', title: 'טופל ולידיעה', cls: '' },
  ];
  const assignedPending = pending.filter((p) => String(p.assigned_claim_id || '') === claim.id && !p.imported_at);

  const isThreadOpen = (t: ThreadView) => openThreads[t.key] ?? (t.state === 'act' || t.state === 'treating');
  const isMailOpen = (t: ThreadView, r: MailRowView, rows: MailRowView[]) => {
    const mid = r.mail.gmail_message_id || r.mail.id;
    if (openMail[mid] !== undefined) return openMail[mid];
    return r === rows[rows.length - 1] || r.state === 'need' || r.state === 'reply';
  };

  const renderMail = (t: ThreadView, r: MailRowView, rows: MailRowView[]) => {
    const m = r.mail;
    const mid = m.gmail_message_id || m.id;
    const open = isMailOpen(t, r, rows);
    const files = card.files.filter((f) => m.gmail_message_id && f.gmail_message_id === m.gmail_message_id);
    const mailTasks = card.tasks.filter((x) => x.gmailMessageId && x.gmailMessageId === m.gmail_message_id);
    const detected = m.direction === 'incoming' ? detectMailRequests(`${m.subject || ''}\n${m.body_text || ''}`) : [];
    const gmailHref = gmailOpenHref({ threadId: m.gmail_thread_id, messageId: m.gmail_message_id, authUser: ownMailbox });
    const dirLbl = m.direction === 'incoming' ? 'נכנס' : 'יוצא';
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
              <span><b>{m.direction === 'incoming' ? 'מאת' : 'נשלח אל'}</b> {m.direction === 'incoming' ? m.from_addr : m.to_addr}</span>
              {m.cc_addr ? <span><b>עותק</b> {m.cc_addr}</span> : null}
              <span><b>תאריך</b> {fmtFull(m.sent_at)}</span>
              {m.send_no ? <span><b>שליחה</b> #{m.send_no}</span> : null}
            </div>
            {(r.state === 'need' || r.state === 'reply') ? (
              <div className={`v2-need${r.state === 'reply' ? ' reply' : ''}`}>
                <h4>{r.state === 'reply' ? 'תשובה למייל ששלחת – עדיין מסומנת לטיפול' : 'המייל מסומן "דורש טיפול" בתיק'}</h4>
                {detected.length ? detected.map((d) => <div key={d.type}>• {d.label}</div>) : <div>אין בקשה מזוהה בטקסט. פתחו את המייל והחליטו מה לעשות.</div>}
              </div>
            ) : r.state === 'treating' ? (
              <div className="v2-need info"><h4>מקושר לטיפול פתוח</h4>
                {card.tasks.filter((x) => x.gmailMessageId === m.gmail_message_id && isOpenTreatment(x)).map((x) => <div key={x.id}>• {treatmentLabelOf(x)}</div>)}
              </div>
            ) : (r.state === 'waiting' || r.state === 'overdue') ? (
              <div className="v2-need wait"><h4>{r.state === 'overdue' ? 'עבר מועד המעקב – עדיין אין תשובה' : `ממתין לתשובה${r.due ? ` עד ${fmtFull(r.due)}` : ''}`}</h4>
                <div>לפי מעקב השליחה ביומן השליחות.</div>
              </div>
            ) : detected.length ? (
              <div className="v2-need info"><h4>בקשה שזוהתה בטקסט</h4>{detected.map((d) => <div key={d.type}>• {d.label}</div>)}</div>
            ) : null}
            {String(m.body_text || '').trim().length > 2
              ? <pre className="v2-mb-text">{m.body_text}</pre>
              : <div className="v2-hint">{m.direction === 'outgoing' ? 'תוכן המייל שנשלח לא נשמר בתיק. אפשר לפתוח אותו ב-Gmail.' : 'גוף המייל ריק'}</div>}
            {files.length ? (
              <div className="v2-files">{files.map((f) => <button type="button" key={f.id} className="v2-file" onClick={() => onOpenFile(f)}>📎 {f.original_name}</button>)}</div>
            ) : m.file_names?.length ? (
              <div className="v2-files">{m.file_names.map((n) => <span key={n} className="v2-file">📎 {n}</span>)}</div>
            ) : null}
            {m.staff_note ? <div className="v2-need info"><h4>הערה פנימית</h4><div style={{ whiteSpace: 'pre-wrap' }}>{m.staff_note}</div></div> : null}
            {mailTasks.length ? (
              <div className="v2-hint">משימות מהמייל: {mailTasks.map((x) => x.action || treatmentLabelOf(x)).filter(Boolean).join(' · ')}</div>
            ) : null}
            <div className="v2-acts">
              {gmailHref ? <a className="v2-btn sm" href={gmailHref} target="_blank" rel="noopener noreferrer">פתח ב-Gmail</a> : null}
              {m.direction === 'incoming' ? (
                <>
                  <button type="button" className="v2-btn sm" disabled title="זמין בממשק הקיים">השב</button>
                  <button type="button" className="v2-btn sm" disabled title="זמין בממשק הקיים">השב לכולם</button>
                  {(r.state === 'need' || r.state === 'reply') ? (
                    <>
                      <button type="button" className="v2-btn sm" disabled title="זמין בממשק הקיים">קראתי – טופל</button>
                      <button type="button" className="v2-btn sm" disabled title="זמין בממשק הקיים">השאר להמשך</button>
                      <button type="button" className="v2-btn sm" disabled title="זמין בממשק הקיים">המשך כטיפול</button>
                    </>
                  ) : null}
                </>
              ) : null}
              <button type="button" className="v2-btn sm" disabled title="זמין בממשק הקיים">העבר</button>
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
      </div>
      <div className="v2-summary">
        <span className="s-need"><b>{counts.act}</b> דורשים ממך פעולה</span>
        <span className="s-wait"><b>{counts.waitThreads}</b> ממתינים לתשובה{counts.overdueThreads ? ` (${counts.overdueThreads} באיחור)` : ''}</span>
        <span><b>{counts.newToday}</b> נכנסו היום</span>
        <span><b>{counts.total}</b> מיילים ב-{counts.threads} שרשורים</span>
      </div>
      {view.missingNeedIds.length ? (
        <div className="v2-need" style={{ marginBottom: 12 }}>
          <h4>{view.missingNeedIds.length} מיילים מסומנים לטיפול אך עדיין לא מופיעים ברשימה</h4>
          {view.missingNeedIds.map((id) => {
            const t = alertCtx.tasks.find((x) => x.gmailMessageId === id);
            return <div key={id}>• {t?.action || 'מייל חדש'}</div>;
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
                  {open ? <div className="v2-mails">{rows.map((r) => renderMail(t, r, rows))}</div> : null}
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
              return (
                <div className="v2-item" key={String(s.id)}>
                  <div className="v2-item-h"><b>שליחה #{String(s.send_no || '—')} · {String(s.subject || '')}</b><span className="v2-when">{fmtFull(s.sent_at)}</span></div>
                  <div className="v2-hint">אל {String(s.to_addr || '—')}{s.track_due ? ` · מעקב עד ${fmtFull(s.track_due)}` : ''}</div>
                  <div className="v2-hint">מסמכים: {names.length ? names.join(', ') : 'ללא מצורפים'}</div>
                </div>
              );
            })}
          </div>
        </details>
        <details>
          <summary>מעקבי מייל ומיילים מתוזמנים ({card.followups.length})</summary>
          <div className="v2-list" style={{ marginTop: 10 }}>
            {card.followups.length === 0 ? <div className="v2-hint">אין מעקב מייל בתיק</div> : card.followups.map((f) => (
              <div className="v2-item" key={f.id}>
                <div className="v2-item-h"><b>{f.mail_subject || '(ללא נושא)'}</b><span className="chip c-info">{f.status}</span></div>
                <div className="v2-hint">אל {f.mail_to || '—'}{f.next_run_at ? ` · הבא ${fmtFull(f.next_run_at)}` : ''}{f.repeat_every_days ? ` · כל ${f.repeat_every_days} ימים` : ''}</div>
              </div>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
