import { useEffect, useMemo, useState } from 'react';
import ClaimImage from '@/features/claims/ClaimImage';
import { CLAIM_DOC_TYPES } from '@/features/claims/claimsConstants';
import { docTypeStatus, effectiveKind, fileLabel, invoiceFiles, isImageFile, kindHe, surveyorBundle } from '@/features/claims/ClaimsScreen';
import type { CardData, ClaimFileRow } from './useClaimsV2Data';
import { fmtBytes, fmtWhen } from './v2Model';

type Section = 'all' | 'photos' | 'docs' | 'surveyor' | 'invoice' | 'checklist';

const SOURCE_HE: Record<string, string> = { customer: 'לקוח', staff: 'צוות', gmail: 'Gmail', garage: 'מוסך' };

export default function V2Gallery({ claimId, card, signedUrls, onOpenFile }: {
  claimId: string;
  card: CardData;
  signedUrls: (claimId: string, ids: string[]) => Promise<Record<string, string>>;
  onOpenFile: (f: ClaimFileRow, list?: ClaimFileRow[]) => void;
}) {
  const [sec, setSec] = useState<Section>('all');
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const images = useMemo(() => card.files.filter((f) => isImageFile(f)), [card.files]);
  const docs = useMemo(() => card.files.filter((f) => !isImageFile(f)), [card.files]);
  const surveyor = useMemo(() => surveyorBundle(card.files, card.imports), [card.files, card.imports]);
  const invoices = useMemo(() => invoiceFiles(card.files), [card.files]);
  const checklist = useMemo(
    () => CLAIM_DOC_TYPES.map((t) => ({ t, st: docTypeStatus(t, card.files, card.requests, Boolean(card.uploadLink?.active)) })),
    [card.files, card.requests, card.uploadLink],
  );

  useEffect(() => {
    let live = true;
    const ids = images.map((f) => f.id);
    if (!ids.length) return;
    void signedUrls(claimId, ids).then((m) => { if (live) setThumbs(m); });
    return () => { live = false; };
  }, [claimId, images, signedUrls]);

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
          const kind = kindHe(effectiveKind(f));
          return (
            <div className="v2-doc-row" key={f.id}>
              <div>
                <div className="v2-doc-name">{fileLabel(f)}</div>
                <div className="v2-hint">{[kind, SOURCE_HE[f.source] || f.source, f.uploaded_by_name, fmtBytes(f.byte_size)].filter(Boolean).join(' · ')}</div>
              </div>
              <span className="v2-when">{fmtWhen(f.created_at)}</span>
              <button type="button" className="v2-btn sm" onClick={() => onOpenFile(f)}>פתיחה</button>
            </div>
          );
        })}
      </div>
    )
  );

  const tabs: Array<[Section, string, number]> = [
    ['all', 'הכול', card.files.length],
    ['photos', 'תמונות', images.length],
    ['docs', 'מסמכים', docs.length],
    ['surveyor', 'דוח שמאי', surveyor.reports.length + surveyor.photos.length + surveyor.attachments.length],
    ['invoice', 'חשבונית מוסך', invoices.length],
    ['checklist', 'רשימת מסמכים', checklist.filter((x) => x.st.key === 'missing' || x.st.key === 'needed' || x.st.key === 'waiting').length],
  ];

  return (
    <div>
      <div className="v2-mtop">
        <div className="v2-seg" role="group" aria-label="גלריה" style={{ flexWrap: 'wrap' }}>
          {tabs.map(([k, label, n]) => (
            <button key={k} type="button" aria-pressed={sec === k} onClick={() => setSec(k)}>{label}<span className="v2-cnt">{n}</span></button>
          ))}
        </div>
      </div>
      {(sec === 'all' || sec === 'photos') ? (
        <div className="v2-sec"><div className="v2-sec-h">תמונות ({images.length})<span className="ln" /></div>{photoGrid(images)}</div>
      ) : null}
      {(sec === 'all' || sec === 'docs') ? (
        <div className="v2-sec"><div className="v2-sec-h">מסמכים ({docs.length})<span className="ln" /></div>{docList(docs)}</div>
      ) : null}
      {sec === 'surveyor' ? (
        <>
          <div className="v2-sec"><div className="v2-sec-h">דוח שמאי ({surveyor.reports.length})<span className="ln" /></div>{docList(surveyor.reports)}</div>
          <div className="v2-sec"><div className="v2-sec-h">תמונות שמאי ({surveyor.photos.length})<span className="ln" /></div>{photoGrid(surveyor.photos)}</div>
          <div className="v2-sec"><div className="v2-sec-h">קבצים נלווים ({surveyor.attachments.length})<span className="ln" /></div>{docList(surveyor.attachments)}</div>
        </>
      ) : null}
      {sec === 'invoice' ? (
        <div className="v2-sec"><div className="v2-sec-h">חשבונית מוסך ({invoices.length})<span className="ln" /></div>
          {photoGrid(invoices.filter((f) => isImageFile(f)))}
          <div style={{ height: 10 }} />
          {docList(invoices.filter((f) => !isImageFile(f)))}
        </div>
      ) : null}
      {sec === 'checklist' ? (
        <>
          <div className="v2-sec"><div className="v2-sec-h">מסמכים לפי סוג<span className="ln" /></div>
            <div className="v2-check">
              {checklist.map(({ t, st }) => (
                <div key={t.key}><span>{t.label}</span><span className={`st-${st.key}`}>{st.label}</span></div>
              ))}
            </div>
          </div>
          {card.requests.length ? (
            <div className="v2-sec"><div className="v2-sec-h">בקשות מסמכים בתיק ({card.requests.length})<span className="ln" /></div>
              <div className="v2-check">
                {card.requests.map((r) => (
                  <div key={r.id}><span>{r.label}</span><span className="v2-hint">{r.status}{r.received_at ? ` · ${fmtWhen(r.received_at)}` : ''}</span></div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
