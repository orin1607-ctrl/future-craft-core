import { useMemo, useState } from 'react';
import ClaimImage from '@/features/claims/ClaimImage';
import { displayClaimNum, docsOrderLabel, docsOrderOf, type ClaimRecord } from '@/features/claims/claimsConstants';
import { buildClaimRowAlerts, shortStatusNote, type AlertContext, type ClaimAlert } from '@/features/claims/claimWorkAlerts';
import { isImageFile } from '@/features/claims/ClaimsScreen';
import V2MailPanel from './V2MailPanel';
import V2Gallery from './V2Gallery';
import { V2Details, V2History, V2People, V2Work } from './V2Sections';
import { buildMailView, mailViewCounts } from './claimMailView';
import type { CardData, ClaimFileRow } from './useClaimsV2Data';
import { fmtDay } from './v2Model';
import { CopyButton, Locked, Menu, Modal } from './v2Ui';
import { isOpenTreatment, isTreatmentItem } from '@/features/claims/treatmentCenter';

export type CardTab = 'details' | 'mail' | 'gallery' | 'work' | 'people' | 'history';
type Viewer = { name: string; mime: string; url: string; dl: string; list: ClaimFileRow[]; idx: number };
type Summaries = {
  internalSummary: (claimId: string) => Promise<unknown>;
  externalSummary: (claimId: string, extra?: { mailBody?: string; docNames?: string[] }) => Promise<unknown>;
};

export default function V2ClaimCard(props: {
  claim: ClaimRecord;
  initialTab?: CardTab;
  card: CardData | null;
  loading: boolean;
  alertCtx: AlertContext;
  ownMailbox: string;
  pending: Array<Record<string, unknown>>;
  isSuperAdmin: boolean;
  signedUrls: (claimId: string, ids: string[]) => Promise<Record<string, string>>;
  signedUrl: (claimId: string, fileId: string, download?: { filename: string }) => Promise<string>;
  revealLink: (claimId: string) => Promise<{ ok: boolean; token: string; url: string; error: string }>;
  reports: Summaries;
  onBack: () => void;
  onOldUi: () => void;
}) {
  const { claim, card, loading, alertCtx, ownMailbox, pending, isSuperAdmin, signedUrls, signedUrl, revealLink, reports, onBack, onOldUi } = props;
  const [tab, setTab] = useState<CardTab>(props.initialTab || 'mail');
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [viewerErr, setViewerErr] = useState('');
  const [summary, setSummary] = useState<{ title: string; text: string } | null>(null);
  const alerts = buildClaimRowAlerts(claim, alertCtx);
  const mailAct = useMemo(() => (card ? mailViewCounts(buildMailView({
    claim, imports: card.imports, sends: card.sends, ownMailbox, ctx: alertCtx, contacts: card.contacts, files: card.files,
  }).threads).act : 0), [card, claim, alertCtx, ownMailbox]);
  const docsOrder = docsOrderOf({ docsOrderStatus: claim.docsOrderStatus });

  const openFile = async (f: ClaimFileRow, list?: ClaimFileRow[]) => {
    setViewerErr('');
    const [url, dl] = await Promise.all([signedUrl(claim.id, f.id), signedUrl(claim.id, f.id, { filename: f.original_name || 'document' })]);
    if (!url) { setViewerErr(`לא ניתן לפתוח את "${f.original_name}"`); return; }
    const l = list && list.length ? list : [f];
    setViewer({ name: f.original_name, mime: f.mime_type || '', url, dl: dl || url, list: l, idx: Math.max(0, l.findIndex((x) => x.id === f.id)) });
  };
  const step = async (d: number) => {
    if (!viewer) return;
    const idx = (viewer.idx + d + viewer.list.length) % viewer.list.length;
    const f = viewer.list[idx];
    const [url, dl] = await Promise.all([signedUrl(claim.id, f.id), signedUrl(claim.id, f.id, { filename: f.original_name || 'document' })]);
    if (url) setViewer({ ...viewer, idx, url, dl: dl || url, name: f.original_name, mime: f.mime_type || '' });
  };
  const showSummary = async (kind: 'internal' | 'external') => {
    setSummary({ title: kind === 'internal' ? 'סיכום פנימי – לא לשליחה החוצה' : 'סיכום חיצוני – מותר להעברה', text: 'טוען…' });
    const r = kind === 'internal'
      ? await reports.internalSummary(claim.id)
      : await reports.externalSummary(claim.id, {
        mailBody: (card?.imports || []).map((im) => String(im.body_text || '')).filter((t) => t.trim().length > 2).join('\n\n'),
        docNames: (card?.files || []).map((f) => f.original_name),
      });
    const x = r as { text?: string; error?: string };
    setSummary({ title: kind === 'internal' ? 'סיכום פנימי – לא לשליחה החוצה' : 'סיכום חיצוני – מותר להעברה', text: String(x.text || x.error || '') });
  };
  const alertTab = (a: ClaimAlert): CardTab => (a.key.startsWith('treat_') || a.key.startsWith('cust_') ? 'work' : a.key === 'garage_review' ? 'gallery' : 'mail');

  const openWork = card ? card.tasks.filter((t) => (isTreatmentItem(t) ? isOpenTreatment(t) : t.done !== 'true')).length : null;
  const tabs: Array<[CardTab, string, number | null, boolean]> = [
    ['details', 'פרטים', null, false],
    ['mail', 'דואר ותקשורת', card ? mailAct : null, true],
    ['gallery', 'גלריה ומסמכים', card ? card.files.length : null, false],
    ['work', 'טיפול ומעקב', openWork, false],
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
          <button type="button" className="v2-pill v2-pill-btn" disabled title="שינוי סטטוס – לא מחובר עדיין (זמין בממשק הקיים)">{claim.status || '—'} 🔒</button>
          {claim.archived === 'true' ? <span className="chip c-info">בארכיון</span> : null}
          {claim.claimKind ? <span className="chip c-info">{claim.claimKind}</span> : null}
          {claim.duplicateSuspect === 'true' ? <span className="chip c-wait">חשד לכפילות</span> : null}
          {claim.source === 'Customer Accident Intake' ? <span className="chip c-info">טופס לקוח</span> : null}
          {docsOrder ? <span className={`chip ${docsOrder === 'organized' ? 'c-done' : docsOrder === 'needs_sort' ? 'c-wait' : 'c-info'}`}>{docsOrderLabel(docsOrder)}</span> : null}
        </div>
        <div className="v2-facts">
          <span>{claim.insCompany || 'ללא חברת ביטוח'}</span>
          <span>רכב <b>{claim.plate || '—'}</b></span>
          <span className="desk">מטפל <button type="button" className="v2-btn ghost sm v2-locked" style={{ padding: 0 }} disabled title={isSuperAdmin ? 'הקצאה לעובד מטפל – לא מחובר עדיין' : 'הקצאה – super_admin בלבד'}><b>{claim.assigned_to_name || 'ללא מטפל'}</b> 🔒</button></span>
          <span className="desk">טיפול אחרון <b>{fmtDay(claim.lastTreatmentAt) || '—'}</b></span>
          <span className="v2-next">טיפול הבא {fmtDay(claim.nextDate) || '—'}</span>
          {claim.lastStatusNote ? <span className="desk">הערה אחרונה: {shortStatusNote(claim.lastStatusNote, 80)}</span> : null}
        </div>
        {alerts.length ? (
          <div className="v2-chips">{alerts.map((a) => (
            <button type="button" key={a.key} className={`chip ${a.tone === 'need' ? 'c-need' : a.tone === 'wait' ? 'c-wait' : 'c-info'}`} title={a.why} onClick={() => setTab(alertTab(a))}>{a.label}</button>
          ))}</div>
        ) : null}
        {claim.treatmentPending === 'true' ? (
          <div className="v2-banner"><span>נדרש עדכון טיפול: {claim.treatmentPendingAction || 'פעולה משמעותית'}</span><Locked label="השלם עדכון טיפול" /></div>
        ) : null}
        <div className="v2-actions">
          <Locked label="✉ מייל חדש" className="v2-btn pri v2-primary-act" />
          <Locked label="עדכון טיפול" className="v2-btn v2-primary-act" />
          <Locked label="בקשה ללקוח" className="v2-btn v2-primary-act" />
          <Menu label="עוד ▾" align="end" testId="claims-v2-card-more" items={[
            { kind: 'title', label: 'קריאה והעתקה' },
            { kind: 'action', label: 'סיכום פנימי', onClick: () => void showSummary('internal') },
            { kind: 'action', label: 'סיכום חיצוני', onClick: () => void showSummary('external') },
            { kind: 'action', label: 'פתח בממשק הקיים', onClick: onOldUi },
            { kind: 'sep' },
            { kind: 'title', label: 'תקשורת' },
            { kind: 'locked', label: 'רישום שיחה' },
            { kind: 'locked', label: 'WhatsApp' },
            { kind: 'locked', label: 'שליחה לחברת ביטוח' },
            { kind: 'locked', label: 'טיפול משפטי' },
            { kind: 'locked', label: 'שלח ללקוח לחתימה' },
            { kind: 'locked', label: 'שיתוף מאובטח' },
            { kind: 'locked', label: 'ייבוא מ-Gmail' },
            { kind: 'sep' },
            { kind: 'title', label: 'טיפול' },
            { kind: 'locked', label: 'משימה' },
            { kind: 'locked', label: 'תזכורת' },
            { kind: 'locked', label: 'מעקב מייל' },
            { kind: 'locked', label: 'סטטוס' },
            ...(isSuperAdmin ? [{ kind: 'locked' as const, label: 'הקצה לעובד מטפל' }] : []),
            { kind: 'locked', label: 'שייך עובד לצילומי מוסך' },
            { kind: 'sep' },
            { kind: 'title', label: 'סגירה ומחיקה' },
            { kind: 'locked', label: 'סגור תיק' },
            { kind: 'locked', label: claim.archived === 'true' ? 'שחזר מארכיון' : 'העבר לארכיון' },
            { kind: 'locked', label: 'מחק תיק' },
          ]} />
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
          {tab === 'details' ? <V2Details claim={claim} /> : null}
          {tab === 'mail' ? (
            <V2MailPanel claim={claim} card={card} alertCtx={alertCtx} ownMailbox={ownMailbox} pending={pending}
              onOpenFile={(f) => void openFile(f)} onGoTab={(t) => setTab(t)} onOldUi={onOldUi} />
          ) : null}
          {tab === 'gallery' ? (
            <V2Gallery claim={claim} card={card} signedUrls={signedUrls} onOpenFile={(f, list) => void openFile(f, list)} />
          ) : null}
          {tab === 'work' ? <V2Work claim={claim} card={card} onOpenFile={(f) => void openFile(f)} onGoTab={(t) => setTab(t)} /> : null}
          {tab === 'people' ? <V2People claim={claim} card={card} revealLink={revealLink} /> : null}
          {tab === 'history' ? <V2History card={card} /> : null}
        </>
      )}

      {summary ? (
        <Modal title={summary.title} wide onClose={() => setSummary(null)} footer={<><CopyButton text={summary.text} label="📋 העתק" /><button type="button" className="v2-btn sm" onClick={() => setSummary(null)}>סגור</button></>}>
          <pre className="v2-pre">{summary.text}</pre>
        </Modal>
      ) : null}

      {viewer ? (
        <div className="v2-viewer" role="dialog" aria-label={viewer.name}>
          <div className="v2-viewer-h">
            <b>{viewer.name}</b>
            {viewer.list.length > 1 ? <span>{viewer.idx + 1} / {viewer.list.length}</span> : null}
            {viewer.list.length > 1 ? <button type="button" className="v2-btn sm" onClick={() => void step(-1)}>הקודם</button> : null}
            {viewer.list.length > 1 ? <button type="button" className="v2-btn sm" onClick={() => void step(1)}>הבא</button> : null}
            <a className="v2-btn sm" href={viewer.dl} download={viewer.name}>הורדה</a>
            <a className="v2-btn sm" href={viewer.url} target="_blank" rel="noopener noreferrer">פתח להדפסה</a>
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
