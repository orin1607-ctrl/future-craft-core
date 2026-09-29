import { useEffect, useMemo, useState } from 'react';
import ClaimImage from '@/features/claims/ClaimImage';
import { CLAIM_DOC_TYPES, DOCS_ORDER, docsOrderLabel, docsOrderOf, type ClaimRecord } from '@/features/claims/claimsConstants';
import { docTypeStatus, effectiveKind, fileLabel, invoiceFiles, isImageFile, kindHe, surveyorBundle } from '@/features/claims/ClaimsScreen';
import { DOC_LIB_SECTIONS, filesForLibCategory, libTypeLabel } from '@/features/claims/claimDocLibrary';
import { formatGarageReviewedAt, garagePhotosOf, garageReviewLabel, garageStatusLabel, type GarageAssignment } from '@/features/claims/claimGarage';
import type { CardData, ClaimFileRow } from './useClaimsV2Data';
import { fmtBytes, fmtWhen } from './v2Model';
import { Locked } from './v2Ui';

type Section = 'all' | 'topics' | 'photos' | 'docs' | 'surveyor' | 'invoice' | 'garage' | 'checklist';
const SOURCE_HE: Record<string, string> = { customer: 'לקוח', staff: 'צוות', gmail: 'Gmail', garage: 'מוסך' };

export default function V2Gallery({ claim, card, signedUrls, onOpenFile }: {
  claim: ClaimRecord;
  card: CardData;
  signedUrls: (claimId: string, ids: string[]) => Promise<Record<string, string>>;
  onOpenFile: (f: ClaimFileRow, list?: ClaimFileRow[]) => void;
}) {
  const [sec, setSec] = useState<Section>('all');
  const [topic, setTopic] = useState('all');
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const images = useMemo(() => card.files.filter((f) => isImageFile(f)), [card.files]);
  const docs = useMemo(() => card.files.filter((f) => !isImageFile(f)), [card.files]);
  const surveyor = useMemo(() => surveyorBundle(card.files, card.imports), [card.files, card.imports]);
  const invoices = useMemo(() => invoiceFiles(card.files), [card.files]);
  const garagePhotos = useMemo(() => garagePhotosOf(card.files), [card.files]);
  const checklist = useMemo(
    () => CLAIM_DOC_TYPES.map((t) => ({ t, st: docTypeStatus(t, card.files, card.requests, Boolean(card.uploadLink?.active)) })),
    [card.files, card.requests, card.uploadLink],
  );
  const missingCount = checklist.filter((x) => x.st.key === 'missing' || x.st.key === 'needed' || x.st.key === 'waiting').length;
  const garage = card.garage as GarageAssignment | null;
  const docsOrder = docsOrderOf({ docsOrderStatus: claim.docsOrderStatus });

  useEffect(() => {
    let live = true;
    const ids = images.map((f) => f.id);
    if (!ids.length) return;
    void signedUrls(claim.id, ids).then((m) => { if (live) setThumbs(m); });
    return () => { live = false; };
  }, [claim.id, images, signedUrls]);

  const photoGrid = (list: ClaimFileRow[]) => (
    list.length === 0 ? <div className="v2-hint">אין תמונות</div> : (
      <div className="v2-gal">
        {list.map((f) => (
          <button type="button" key={f.id} className="v2-gal-item" title={fileLabel(f)} onClick={() => onOpenFile(f, list)}>
            {thumbs[f.id] ? <ClaimImage src={thumbs[f.id]} alt={f.original_name} mime={f.mime_type} /> : <span>{f.original_name}</span>}
          </button>
        ))}
      </div>
    )
  );
  const docList = (list: ClaimFileRow[]) => (
    list.length === 0 ? <div className="v2-hint">אין מסמכים</div> : (
      <div className="v2-list">
        {list.map((f) => {
          const kind = kindHe(effectiveKind(f)) || libTypeLabel(f);
          const meta = (f.doc_meta && typeof f.doc_meta === 'object') ? f.doc_meta : {};
          return (
            <div className="v2-doc-row" key={f.id}>
              <div>
                <div className="v2-doc-name">{fileLabel(f)}</div>
                <div className="v2-hint">{[kind, meta.doc_status ? `מצב: ${meta.doc_status}` : '', SOURCE_HE[f.source] || f.source, f.uploaded_by_name, fmtBytes(f.byte_size), f.gmail_message_id ? 'ממייל' : ''].filter(Boolean).join(' · ')}</div>
              </div>
              <span className="v2-when">{fmtWhen(f.created_at)}</span>
              <span className="v2-actions" style={{ flexWrap: 'nowrap' }}>
                <button type="button" className="v2-btn sm" onClick={() => onOpenFile(f)}>פתיחה</button>
                <Locked label="עריכה" title="סיווג, שינוי שם ושינוי סטטוס מסמך – לא מחובר עדיין" />
              </span>
            </div>
          );
        })}
      </div>
    )
  );
  const mixed = (list: ClaimFileRow[]) => (
    <>
      {list.some((f) => isImageFile(f)) ? photoGrid(list.filter((f) => isImageFile(f))) : null}
      {list.some((f) => !isImageFile(f)) ? <div style={{ marginTop: 10 }}>{docList(list.filter((f) => !isImageFile(f)))}</div> : null}
      {list.length === 0 ? <div className="v2-hint">אין קבצים</div> : null}
    </>
  );

  const tabs: Array<[Section, string, number]> = [
    ['all', 'הכול', card.files.length],
    ['topics', 'לפי נושא', card.files.length - garagePhotos.length],
    ['photos', 'תמונות', images.length],
    ['docs', 'מסמכים', docs.length],
    ['surveyor', 'דוח שמאי', surveyor.reports.length + surveyor.photos.length + surveyor.attachments.length],
    ['invoice', 'חשבונית מוסך', invoices.length],
    ['garage', 'מוסך', garagePhotos.length],
    ['checklist', 'רשימת מסמכים', missingCount],
  ];

  return (
    <div>
      <div className="v2-actions" style={{ marginBottom: 10 }}>
        <span className={`chip ${docsOrder === 'organized' ? 'c-done' : docsOrder === 'needs_sort' ? 'c-wait' : 'c-info'}`}>מצב סדר מסמכים: {docsOrderLabel(docsOrder) || 'לא הוגדר'}</span>
        <Locked label="שינוי מצב" title={`אפשרויות: ${DOCS_ORDER.map((x) => x.label).join(' / ')} – לא מחובר עדיין`} />
        <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
          <Locked label="⬆ העלאה" className="v2-btn sm pri" /><Locked label="שיתוף מאובטח" /><Locked label="שיתוף לפי נושא" />
        </span>
      </div>
      <div className="v2-mtop">
        <div className="v2-seg" role="group" aria-label="גלריה" style={{ flexWrap: 'wrap' }}>
          {tabs.map(([k, label, n]) => (
            <button key={k} type="button" aria-pressed={sec === k} onClick={() => setSec(k)}>{label}<span className={`v2-cnt${k === 'checklist' && n ? ' need' : ''}`}>{n}</span></button>
          ))}
        </div>
      </div>
      {(sec === 'all' || sec === 'photos') ? (
        <div className="v2-sec"><div className="v2-sec-h">תמונות ({images.length})<span className="ln" /></div>{photoGrid(images)}</div>
      ) : null}
      {(sec === 'all' || sec === 'docs') ? (
        <div className="v2-sec"><div className="v2-sec-h">מסמכים ({docs.length})<span className="ln" /></div>{docList(docs)}</div>
      ) : null}
      {sec === 'topics' ? (
        <>
          <div className="v2-topics" role="group" aria-label="נושא">
            <button type="button" aria-pressed={topic === 'all'} onClick={() => setTopic('all')}>הכול<span className="v2-cnt">{filesForLibCategory(card.files, 'all').length}</span></button>
            {DOC_LIB_SECTIONS.map((s) => {
              const n = filesForLibCategory(card.files, s.key).length;
              if (!n) return null;
              return <button key={s.key} type="button" aria-pressed={topic === s.key} onClick={() => setTopic(s.key)}>{s.label}<span className="v2-cnt">{n}</span></button>;
            })}
          </div>
          {topic === 'all'
            ? DOC_LIB_SECTIONS.map((s) => {
              const list = filesForLibCategory(card.files, s.key);
              if (!list.length) return null;
              return <div className="v2-sec" key={s.key}><div className="v2-sec-h">{s.label} ({list.length})<span className="ln" /></div>{mixed(list)}</div>;
            })
            : mixed(filesForLibCategory(card.files, topic))}
        </>
      ) : null}
      {sec === 'surveyor' ? (
        <>
          <div className="v2-sec"><div className="v2-sec-h">דוח שמאי ({surveyor.reports.length})<span className="ln" /></div>{docList(surveyor.reports)}</div>
          <div className="v2-sec"><div className="v2-sec-h">תמונות שמאי ({surveyor.photos.length})<span className="ln" /></div>{photoGrid(surveyor.photos)}</div>
          <div className="v2-sec"><div className="v2-sec-h">קבצים נלווים ({surveyor.attachments.length})<span className="ln" /></div>{docList(surveyor.attachments)}</div>
        </>
      ) : null}
      {sec === 'invoice' ? <div className="v2-sec"><div className="v2-sec-h">חשבונית מוסך ({invoices.length})<span className="ln" /></div>{mixed(invoices)}</div> : null}
      {sec === 'garage' ? (
        <>
          <div className="v2-box" style={{ marginBottom: 12 }}>
            <div className="v2-sec-h">צילומי מוסך – שיוך ובדיקה<span className="ln" /></div>
            {garage ? (
              <dl className="v2-grid v2-kv" style={{ margin: 0 }}>
                <div><dt>עובד</dt><dd>{garage.worker_name || '—'}</dd></div>
                <div><dt>סטטוס</dt><dd>{garageStatusLabel(garage.status)}</dd></div>
                <div><dt>תמונות</dt><dd>{garage.photo_count ?? garagePhotos.length}</dd></div>
                <div><dt>בדיקה</dt><dd>{garageReviewLabel(garage.review_status) || '—'}</dd></div>
                {garage.review_note ? <div><dt>הערת בדיקה</dt><dd>{garage.review_note}</dd></div> : null}
                {garage.reviewed_at ? <div><dt>נבדק</dt><dd>{formatGarageReviewedAt(garage.reviewed_at)}{garage.reviewed_by_name ? ` · ${garage.reviewed_by_name}` : ''}</dd></div> : null}
                {garage.assigned_at ? <div><dt>שויך</dt><dd>{fmtWhen(garage.assigned_at)}{garage.assigned_by_name ? ` · ${garage.assigned_by_name}` : ''}</dd></div> : null}
                {garage.worker_note ? <div><dt>הערת עובד</dt><dd>{garage.worker_note}</dd></div> : null}
              </dl>
            ) : <div className="v2-hint">לא שויך עובד לצילומי מוסך</div>}
            <div className="v2-actions" style={{ marginTop: 10 }}>
              {garage?.worker_id ? (
                <a className="v2-btn sm" target="_blank" rel="noopener noreferrer"
                  href={`${(import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')}garage?worker=${encodeURIComponent(garage.worker_id)}`}>פתח פורטל עובד</a>
              ) : null}
              <Locked label={garage ? 'החלף שיוך' : 'שייך עובד לצילומי מוסך'} />
              {garage ? <><Locked label="אשר צילומים" /><Locked label="דרוש השלמה" /><Locked label="בטל שיוך" /></> : null}
              <Locked label="שיתוף צילומי מוסך" />
            </div>
          </div>
          <div className="v2-sec"><div className="v2-sec-h">צילומי מוסך ({garagePhotos.length})<span className="ln" /></div>{photoGrid(garagePhotos)}</div>
        </>
      ) : null}
      {sec === 'checklist' ? (
        <>
          <div className="v2-sec"><div className="v2-sec-h">מסמכים לפי סוג<span className="ln" /></div>
            <div className="v2-check">
              {checklist.map(({ t, st }) => (
                <div key={t.key}>
                  <span>{t.label}</span>
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <span className={`st-${st.key}`}>{st.label}</span>
                    {st.key === 'missing' ? <Locked label="בקש" /> : null}
                    {t.key === 'accident_notice' ? <Locked label="חתימה" title="חתימה על טופס האירוע – לא מחובר עדיין" /> : null}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="v2-sec"><div className="v2-sec-h">בקשות מסמכים בתיק ({card.requests.length})<span className="ln" /></div>
            {card.requests.length === 0 ? <div className="v2-hint">אין בקשות מסמכים</div> : (
              <div className="v2-check">
                {card.requests.map((r) => (
                  <div key={r.id}><span>{r.label}</span><span className="v2-hint">{r.status === 'requested' ? 'נדרש' : r.status === 'received' ? 'התקבל' : r.status}{r.received_at ? ` · ${fmtWhen(r.received_at)}` : ''}</span></div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
