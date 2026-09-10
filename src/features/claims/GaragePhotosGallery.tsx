import { useMemo, useState } from 'react';
import {
  DEFAULT_SHARE_TTL,
  SHARE_TTL_PRESETS,
  resolveShareExpiry,
  shareRecipientMessage,
  shareWhatsAppHref,
} from './claimSecureShare';
import { downloadRemoteFile } from './claimFileDownload';

export type GarageGalleryPhoto = {
  id: string;
  original_name: string;
  mime_type?: string;
  url?: string;
};

type CreatedShare = { url: string; expiresAt: string };

export type ShareExpiryInput = { ttlHours?: number; expiresAt?: string };

type Props = {
  photos: GarageGalleryPhoto[];
  canShare?: boolean;
  busy?: boolean;
  onPreview: (photo: GarageGalleryPhoto) => void;
  onDownload?: (photo: GarageGalleryPhoto) => void;
  onCreateShare: (fileIds: string[], recipientName: string, expiry?: ShareExpiryInput) => Promise<CreatedShare | null>;
};

export default function GaragePhotosGallery({
  photos, canShare = true, busy, onPreview, onDownload, onCreateShare,
}: Props) {
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState('שמאי');
  const [ttl, setTtl] = useState(DEFAULT_SHARE_TTL);
  const [custom, setCustom] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedShare | null>(null);
  const [copyOk, setCopyOk] = useState('');
  const [ttlErr, setTtlErr] = useState('');

  const selected = useMemo(() => photos.filter((p) => picked.includes(p.id)), [photos, picked]);
  const expiry = useMemo(() => resolveShareExpiry(ttl, custom), [ttl, custom]);
  const untilText = expiry.ok ? new Date(expiry.expiresAt).toLocaleString('he-IL') : '—';
  const toggle = (id: string) => setPicked((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  const create = async () => {
    if (!selected.length) return;
    if (!expiry.ok) { setTtlErr(expiry.error); return; }
    setTtlErr('');
    setCreating(true);
    setCopyOk('');
    try {
      const r = await onCreateShare(selected.map((p) => p.id), name.trim() || 'שמאי', {
        ttlHours: ttl === 'custom' ? 0 : SHARE_TTL_PRESETS.find((p) => p.key === ttl)?.hours,
        expiresAt: ttl === 'custom' ? expiry.expiresAt : '',
      });
      setCreated(r);
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    if (!created?.url) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopyOk('הקישור הועתק');
      return;
    } catch { /* fall through */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = created.url;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      setCopyOk('הקישור הועתק');
    } catch {
      setCopyOk('העתיקו ידנית');
    }
  };

  const shareMsg = created?.url ? shareRecipientMessage(created.url, created.expiresAt, ttl) : '';
  const waHref = shareMsg ? shareWhatsAppHref(shareMsg) : '';
  const mailHref = shareMsg
    ? `mailto:?subject=${encodeURIComponent('שיתוף מאובטח — שמאי')}&body=${encodeURIComponent(shareMsg)}`
    : '';

  return (
    <div className="garage-photo-gallery" data-testid="garage-photo-gallery">
      <h3 data-testid="garage-gallery-title">גלריית תמונות מוסך ({photos.length})</h3>
      <p className="garage-gallery-note">רק תמונות מוסך של התיק הזה. לא הגלריה הכללית.</p>
      {canShare ? (
        <div className="garage-gallery-acts">
          <button type="button" className="btn btn-g btn-sm" data-testid="garage-select-all" onClick={() => setPicked(photos.map((p) => p.id))}>בחר הכל</button>
          <button type="button" className="btn btn-g btn-sm" data-testid="garage-select-clear" onClick={() => setPicked([])}>נקה בחירה</button>
          <span data-testid="garage-selected-count">נבחרו {picked.length}</span>
        </div>
      ) : null}
      <div className="garage-thumbs" data-testid="garage-photos">
        {photos.map((p) => (
          <div key={p.id} className={`garage-thumb${picked.includes(p.id) ? ' sel' : ''}`} data-testid={`garage-photo-${p.id}`}>
            {canShare ? (
              <label className="garage-thumb-check">
                <input type="checkbox" data-testid={`garage-pick-${p.id}`} checked={picked.includes(p.id)} onChange={() => toggle(p.id)} />
                בחר
              </label>
            ) : null}
            {p.url ? (
              <button type="button" className="garage-thumb-open" onClick={() => onPreview(p)} data-testid={`garage-preview-${p.id}`}>
                <img src={p.url} alt={p.original_name} />
              </button>
            ) : <span>{p.original_name}</span>}
            {p.url ? (
              <button
                type="button"
                className="btn btn-sm btn-g"
                data-testid={`garage-download-${p.id}`}
                onClick={() => {
                  if (onDownload) onDownload(p);
                  else void downloadRemoteFile(p.url || '', p.original_name);
                }}
              >הורדה</button>
            ) : null}
          </div>
        ))}
      </div>
      {canShare ? (
        <div className="garage-share-box" data-testid="garage-surveyor-share">
          <label className="fl">נשלח אל
            <input className="fi" data-testid="garage-share-to" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="fl">תוקף
            <select className="fse fi" data-testid="garage-share-ttl" value={ttl} onChange={(e) => setTtl(e.target.value)}>
              {SHARE_TTL_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </label>
          {ttl === 'custom' ? (
            <label className="fl">תאריך ושעת תפוגה
              <input className="fi" type="datetime-local" data-testid="garage-share-custom" value={custom} onChange={(e) => setCustom(e.target.value)} />
            </label>
          ) : null}
          <div data-testid="garage-share-until" style={{ fontSize: 13, margin: '6px 0' }}>הקישור יהיה זמין עד: <b>{untilText}</b></div>
          {ttlErr ? <div className="garage-err" data-testid="garage-share-ttl-err">{ttlErr}</div> : null}
          <button
            type="button"
            className="btn btn-p"
            data-testid="garage-create-surveyor-link"
            disabled={creating || busy || !picked.length}
            onClick={() => void create()}
          >
            {creating ? 'יוצר…' : 'צור קישור לשמאי'}
          </button>
        </div>
      ) : null}
      {created?.url ? (
        <div className="cust-link-card" data-testid="garage-share-created">
          <div className="cust-link-title">קישור לשמאי — מוצג פעם אחת</div>
          <div className="cust-link-url" data-testid="garage-share-url">{created.url}</div>
          <div className="cust-link-meta">עד {created.expiresAt ? new Date(created.expiresAt).toLocaleString('he-IL') : '—'}</div>
          <div className="cust-link-acts">
            <button type="button" className="btn btn-p btn-sm" data-testid="garage-share-copy" onClick={() => void copy()}>העתק קישור</button>
            <a className="btn btn-g btn-sm" data-testid="garage-share-wa" href={waHref} target="_blank" rel="noreferrer">שלח ב-WhatsApp</a>
            <a className="btn btn-g btn-sm" data-testid="garage-share-mail" href={mailHref}>שלח במייל</a>
          </div>
          {copyOk ? <div className="cust-link-note">{copyOk}</div> : null}
          <div className="cust-link-note">השמאי רואה רק את התמונות שנבחרו. בלי כניסה למערכת.</div>
        </div>
      ) : null}
    </div>
  );
}
