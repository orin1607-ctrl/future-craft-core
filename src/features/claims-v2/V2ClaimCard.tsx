import { useMemo, useState } from 'react';
import ClaimImage from '@/features/claims/ClaimImage';
import { displayClaimNum, docsOrderLabel, docsOrderOf, type ClaimRecord } from '@/features/claims/claimsConstants';
import { buildClaimRowAlerts, shortStatusNote, type AlertContext } from '@/features/claims/claimWorkAlerts';
import { completedTreatments, isTreatmentItem, openTreatments, treatmentLabelOf, treatmentStatusHe } from '@/features/claims/treatmentCenter';
import { customerTableLabel } from '@/features/claims/customerRequestModel';
import { contactRoleLabel } from '@/features/claims/claimContacts';
import { shareKindLabel, shareStatusLabel, shareStatusOf } from '@/features/claims/claimSecureShare';
import { isImageFile } from '@/features/claims/ClaimsScreen';
import V2MailPanel from './V2MailPanel';
import V2Gallery from './V2Gallery';
import { buildMailView, mailViewCounts } from './claimMailView';
import type { CardData, ClaimFileRow } from './useClaimsV2Data';
import { extraFields, FIELD_GROUPS, fieldValue, fmtDay, fmtFull, fmtWhen } from './v2Model';

type Tab = 'details' | 'mail' | 'gallery' | 'work' | 'people' | 'history';
type Viewer = { name: string; mime: string; url: string; list: ClaimFileRow[]; idx: number };

export default function V2ClaimCard({ claim, card, loading, alertCtx, ownMailbox, pending, signedUrls, signedUrl, onBack, onOldUi }: {
  claim: ClaimRecord;
  card: CardData | null;
  loading: boolean;
  alertCtx: AlertContext;
  ownMailbox: string;
  pending: Array<Record<string, unknown>>;
  signedUrls: (claimId: string, ids: string[]) => Promise<Record<string, string>>;
  signedUrl: (claimId: string, fileId: string) => Promise<string>;
  onBack: () => void;
  onOldUi: () => void;
}) {
  const [tab, setTab] = useState<Tab>('mail');
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [viewerErr, setViewerErr] = useState('');
  const alerts = buildClaimRowAlerts(claim, alertCtx);
  const mailAct = useMemo(() => (card ? mailViewCounts(buildMailView({
    claim, imports: card.imports, sends: card.sends, ownMailbox, ctx: alertCtx, contacts: card.contacts, files: card.files,
  }).threads).act : 0), [card, claim, alertCtx, ownMailbox]);

  const openFile = async (f: ClaimFileRow, list?: ClaimFileRow[]) => {
    setViewerErr('');
    const url = await signedUrl(claim.id, f.id);
    if (!url) { setViewerErr(`לא ניתן לפתוח את "${f.original_name}"`); return; }
    const l = list && list.length ? list : [f];
    setViewer({ name: f.original_name, mime: f.mime_type || '', url, list: l, idx: Math.max(0, l.findIndex((x) => x.id === f.id)) });
  };
  const step = async (d: number) => {
    if (!viewer) return;
    const idx = (viewer.idx + d + viewer.list.length) % viewer.list.length;
    const f = viewer.list[idx];
    const url = await signedUrl(claim.id, f.id);
    if (url) setViewer({ ...viewer, idx, url, name: f.original_name, mime: f.mime_type || '' });
  };

  const tabs: Array<[Tab, string, number | null, boolean]> = [
    ['details', 'פרטים', null, false],
    ['mail', 'דואר ותקשורת', card ? mailAct : null, true],
    ['gallery', 'גלריה ומסמכים', card ? card.files.length : null, false],
    ['work', 'טיפול ומעקב', card ? openTreatments(card.tasks).length + card.tasks.filter((t) => !isTreatmentItem(t) && t.done !== 'true').length : null, false],
    ['people', 'אנשי קשר ושיתופים', card ? card.contacts.length : null, false],
    ['history', 'היסטוריה', card ? card.history.length : null, false],
  ];

  return (
    <div>
      <div className="v2-crumb"><button type="button" onClick={onBack}>תיקים</button> › {displayClaimNum({ claimNum: claim.claimNum })}</div>
      <section className="v2-head" aria-label="פרטי תיק">
        <div className="v2-head-row">
          <h2 className="v2-name">{claim.clientName || 'ללא שם לקוח'}</h2>
          <span className="v2-num">תביעה {displayClaimNum({ claimNum: claim.claimNum })}</span>
          <span className="v2-pill">{claim.status || '—'}</span>
          {claim.archived === 'true' ? <span className="chip c-info">בארכיון</span> : null}
          {claim.claimKind ? <span className="chip c-info">{claim.claimKind}</span> : null}
        </div>
        <div className="v2-facts">
          <span>{claim.insCompany || 'ללא חברת ביטוח'}</span>
          <span>רכב <b>{claim.plate || '—'}</b></span>
          <span className="desk">מטפל <b>{claim.assigned_to_name || 'ללא מטפל'}</b></span>
          <span className="desk">טיפול אחרון <b>{fmtDay(claim.lastTreatmentAt) || '—'}</b></span>
          <span className="v2-next">טיפול הבא {fmtDay(claim.nextDate) || '—'}</span>
          {claim.lastStatusNote ? <span className="desk">הערה אחרונה: {shortStatusNote(claim.lastStatusNote, 80)}</span> : null}
          {docsOrderOf({ docsOrderStatus: claim.docsOrderStatus }) ? <span className="desk">{docsOrderLabel(docsOrderOf({ docsOrderStatus: claim.docsOrderStatus }))}</span> : null}
        </div>
        {alerts.length ? (
          <div className="v2-chips">{alerts.map((a) => <span key={a.key} className={`chip ${a.tone === 'need' ? 'c-need' : a.tone === 'wait' ? 'c-wait' : 'c-info'}`} title={a.why}>{a.label}</span>)}</div>
        ) : null}
        <div className="v2-readonly">
          <span>שלב ניסיון: צפייה בלבד. מייל, עדכון טיפול, סטטוס, משימות, העלאה ושיתוף מתבצעים בממשק הקיים.</span>
          <button type="button" className="v2-btn sm pri" onClick={onOldUi}>לביצוע פעולות – לממשק הקיים</button>
        </div>
      </section>

      <div className="v2-tabs" role="tablist">
        {tabs.map(([k, label, n, hot]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {label}{n !== null ? <span className={`v2-cnt${hot && n ? ' need' : ''}`}>{n}</span> : null}
          </button>
        ))}
      </div>

      {viewerErr ? <div className="v2-err">{viewerErr}</div> : null}
      {!card || loading ? <div className="v2-empty">טוען את נתוני התיק…</div> : (
        <>
          {tab === 'details' ? <Details claim={claim} card={card} /> : null}
          {tab === 'mail' ? (
            <V2MailPanel claim={claim} card={card} alertCtx={alertCtx} ownMailbox={ownMailbox} pending={pending} onOpenFile={(f) => void openFile(f)} onOldUi={onOldUi} />
          ) : null}
          {tab === 'gallery' ? (
            <V2Gallery claimId={claim.id} card={card} signedUrls={signedUrls} onOpenFile={(f, list) => void openFile(f, list)} />
          ) : null}
          {tab === 'work' ? <Work card={card} /> : null}
          {tab === 'people' ? <People card={card} /> : null}
          {tab === 'history' ? <History card={card} /> : null}
        </>
      )}

      {viewer ? (
        <div className="v2-viewer" role="dialog" aria-label={viewer.name}>
          <div className="v2-viewer-h">
            <b>{viewer.name}</b>
            {viewer.list.length > 1 ? <span>{viewer.idx + 1} / {viewer.list.length}</span> : null}
            {viewer.list.length > 1 ? <button type="button" className="v2-btn sm" onClick={() => void step(-1)}>הקודם</button> : null}
            {viewer.list.length > 1 ? <button type="button" className="v2-btn sm" onClick={() => void step(1)}>הבא</button> : null}
            <a className="v2-btn sm" href={viewer.url} target="_blank" rel="noopener noreferrer">פתח בלשונית חדשה</a>
            <button type="button" className="v2-btn sm" onClick={() => setViewer(null)}>סגור ✕</button>
          </div>
          <div className="v2-viewer-b">
            {isImageFile({ original_name: viewer.name, mime_type: viewer.mime } as ClaimFileRow)
              ? <ClaimImage src={viewer.url} alt={viewer.name} mime={viewer.mime} preview />
              : /pdf/i.test(`${viewer.mime} ${viewer.name}`)
                ? <iframe title={viewer.name} src={viewer.url} style={{ width: '100%', height: '100%', border: 0, background: '#fff', borderRadius: 8 }} />
                : <a className="v2-btn pri" href={viewer.url} target="_blank" rel="noopener noreferrer">פתיחת הקובץ</a>}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Details({ claim, card }: { claim: ClaimRecord; card: CardData }) {
  const extras = extraFields(claim);
  return (
    <div className="v2-list" style={{ gap: 14 }}>
      {FIELD_GROUPS.map((g) => {
        const filled = g.fields.filter(([k]) => fieldValue(claim, k));
        if (g.key !== 'claim' && g.key !== 'client' && g.key !== 'vehicle' && !filled.length) return null;
        return (
          <div className="v2-box" key={g.key}>
            <div className="v2-sec-h">{g.title}<span className="ln" /></div>
            <dl className="v2-grid v2-kv" style={{ margin: 0 }}>
              {g.fields.map(([k, label]) => {
                const v = k === 'claimNum' ? displayClaimNum({ claimNum: claim.claimNum }) : fieldValue(claim, k);
                if (!v && g.key !== 'claim' && g.key !== 'client' && g.key !== 'vehicle') return null;
                return <div key={k}><dt>{label}</dt><dd>{v || '—'}</dd></div>;
              })}
            </dl>
          </div>
        );
      })}
      {card.garage ? (
        <div className="v2-box">
          <div className="v2-sec-h">שיוך מוסך / צילומי מוסך<span className="ln" /></div>
          <dl className="v2-grid v2-kv" style={{ margin: 0 }}>
            {Object.entries(card.garage).filter(([, v]) => typeof v === 'string' && v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>)}
          </dl>
        </div>
      ) : null}
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

function Work({ card }: { card: CardData }) {
  const open = openTreatments(card.tasks);
  const done = completedTreatments(card.tasks);
  const other = card.tasks.filter((t) => !isTreatmentItem(t));
  const openTasks = other.filter((t) => t.done !== 'true');
  const closedTasks = other.filter((t) => t.done === 'true');
  return (
    <div>
      <div className="v2-sec"><div className="v2-sec-h need">טיפולים פעילים ({open.length})<span className="ln" /></div>
        {open.length === 0 ? <div className="v2-hint">אין טיפול פתוח</div> : (
          <div className="v2-list">{open.map((t) => (
            <div className="v2-item" key={t.id}>
              <div className="v2-item-h"><b>{treatmentLabelOf(t)}</b><span className="chip c-treat">{treatmentStatusHe(t)}</span></div>
              {t.note ? <div className="v2-hint">{t.note}</div> : null}
              <div className="v2-hint">{[t.dueDate ? `יעד ${fmtDay(t.dueDate)}` : '', t.createdAt ? `נפתח ${fmtWhen(t.createdAt)}` : ''].filter(Boolean).join(' · ')}</div>
            </div>
          ))}</div>
        )}
      </div>
      <div className="v2-sec"><div className="v2-sec-h">משימות ובקשות ללקוח פתוחות ({openTasks.length})<span className="ln" /></div>
        {openTasks.length === 0 ? <div className="v2-hint">אין משימות פתוחות</div> : (
          <div className="v2-list">{openTasks.map((t) => (
            <div className="v2-item" key={t.id}>
              <div className="v2-item-h"><b>{t.audience === 'customer' ? (customerTableLabel(t) || t.action) : (t.action || 'משימה')}</b>
                {t.audience === 'customer' ? <span className="chip c-wait">בקשה ללקוח</span> : t.gmailMessageId ? <span className="chip c-info">ממייל</span> : null}</div>
              {t.note || t.requestText ? <div className="v2-hint">{t.requestText || t.note}</div> : null}
              <div className="v2-hint">{[t.dueDate ? `יעד ${fmtDay(t.dueDate)}` : '', t.workStatus || '', t.owner || ''].filter(Boolean).join(' · ')}</div>
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
      {(done.length || closedTasks.length) ? (
        <details className="v2-box">
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>טיפולים ומשימות שהושלמו ({done.length + closedTasks.length})</summary>
          <div className="v2-list" style={{ marginTop: 10 }}>
            {[...done, ...closedTasks].map((t) => (
              <div className="v2-item" key={t.id}><div className="v2-item-h"><b>{isTreatmentItem(t) ? treatmentLabelOf(t) : (t.action || 'משימה')}</b><span className="chip c-done">הושלם</span></div>
                {t.completedAt ? <div className="v2-hint">{fmtFull(t.completedAt)}</div> : null}</div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function People({ card }: { card: CardData }) {
  return (
    <div>
      <div className="v2-sec"><div className="v2-sec-h">אנשי קשר בתיק ({card.contacts.length})<span className="ln" /></div>
        {card.contacts.length === 0 ? <div className="v2-hint">אין אנשי קשר משויכים</div> : (
          <div className="v2-list">{card.contacts.map((c) => (
            <div className="v2-item" key={c.id}>
              <div className="v2-item-h"><b>{c.full_name}</b><span className="chip c-info">{contactRoleLabel(c.role)}{c.is_primary_treatment ? ' · ראשי' : ''}</span></div>
              {c.company_name || c.department ? <div className="v2-hint">{[c.company_name, c.department].filter(Boolean).join(' · ')}</div> : null}
              <div className="v2-files">{c.channels.map((ch) => <span key={ch.id} className="v2-file" dir="ltr">{ch.value}</span>)}</div>
            </div>
          ))}</div>
        )}
      </div>
      <div className="v2-sec"><div className="v2-sec-h">קישור העלאה ללקוח<span className="ln" /></div>
        <div className="v2-hint">{card.uploadLink?.active ? `פעיל עד ${fmtFull(card.uploadLink.expires_at)}` : 'אין קישור פעיל'}</div>
      </div>
      <div className="v2-sec"><div className="v2-sec-h">שיתופים מאובטחים ({card.shares.length})<span className="ln" /></div>
        {card.shares.length === 0 ? <div className="v2-hint">אין שיתופים</div> : (
          <div className="v2-list">{card.shares.map((s) => (
            <div className="v2-item" key={s.id}>
              <div className="v2-item-h"><b>{s.recipient_name || '—'} · {shareKindLabel(s.recipient_kind)}</b><span className="chip c-info">{shareStatusLabel(shareStatusOf(s))}</span></div>
              <div className="v2-hint">{(s.file_names || []).length || s.file_ids.length} קבצים · נוצר {fmtWhen(s.created_at)} · תוקף {fmtFull(s.expires_at)}{s.open_count ? ` · נפתח ${s.open_count} פעמים` : ''}</div>
            </div>
          ))}</div>
        )}
      </div>
    </div>
  );
}

function History({ card }: { card: CardData }) {
  return (
    <div>
      <div className="v2-sec"><div className="v2-sec-h">היסטוריית התיק ({card.history.length})<span className="ln" /></div>
        {card.history.length === 0 ? <div className="v2-hint">אין היסטוריה עדיין</div> : (
          <div className="v2-list">{card.history.map((h) => (
            <div className="v2-item" key={h.id}>
              <div className="v2-item-h"><b>{h.action}</b><span className="v2-when">{h.at || ''}</span></div>
              {(h.valueBefore || h.valueAfter) ? <div className="v2-hint">{h.valueBefore || '—'} → {h.valueAfter || '—'}</div> : null}
              {h.note ? <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{h.note}</div> : null}
              {h.by ? <div className="v2-hint">{h.by}</div> : null}
            </div>
          ))}</div>
        )}
      </div>
      {card.comm.length ? (
        <div className="v2-sec"><div className="v2-sec-h">יומן תקשורת – שיחות והערות ({card.comm.length})<span className="ln" /></div>
          <div className="v2-list">{card.comm.map((c) => (
            <div className="v2-item" key={c.id}>
              <div className="v2-item-h"><b>{c.type === 'call' ? 'שיחה' : c.type === 'note' ? 'הערה' : (c.type || 'רשומה')}{c.contactName ? ` · ${c.contactName}` : ''}</b><span className="v2-when">{c.at || c.createdAt || ''}</span></div>
              {c.body ? <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{c.body}</div> : null}
              {c.note ? <div className="v2-hint">{c.note}</div> : null}
            </div>
          ))}</div>
        </div>
      ) : null}
    </div>
  );
}
