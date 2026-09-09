import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_SHARE_TTL,
  SHARE_RECIPIENT_KINDS,
  SHARE_TTL_PRESETS,
  isShareImage,
  resolveShareExpiry,
  shareKindLabel,
  sharePublicUrl,
  shareRecipientMessage,
  shareStatusLabel,
  shareStatusOf,
  type ShareRow,
} from './claimSecureShare';
import type { ClaimsApi } from './claimsService';

type FileRow = { id: string; original_name: string; mime_type?: string; byte_size?: number; doc_kind?: string; doc_meta?: { staff_type?: string } | null };

type Props = {
  open: boolean;
  claimId: string;
  files: FileRow[];
  presetIds?: string[];
  api: ClaimsApi;
  toast: (msg: string, kind?: 'ok' | 'err') => void;
  onClose: () => void;
  onMail: (to: string, subject: string, body: string) => void;
  onWhatsApp: (phone: string, body: string) => void;
};

export default function SecureShareModal({
  open, claimId, files, presetIds, api, toast, onClose, onMail, onWhatsApp,
}: Props) {
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('surveyor');
  const [kindNote, setKindNote] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [ttl, setTtl] = useState(DEFAULT_SHARE_TTL);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [createdUrl, setCreatedUrl] = useState('');
  const [createdUntil, setCreatedUntil] = useState('');
  const [shares, setShares] = useState<ShareRow[]>([]);

  const images = files.filter((f) => isShareImage(f.mime_type || '', f.original_name));
  const docs = files.filter((f) => !isShareImage(f.mime_type || '', f.original_name));
  const garage = files.filter((f) => f.doc_kind === 'garage_photo' || String((f as { doc_meta?: { staff_type?: string } }).doc_meta?.staff_type || '') === 'garage_photos');

  const expiry = useMemo(() => resolveShareExpiry(ttl, custom), [ttl, custom]);
  const untilText = expiry.ok ? new Date(expiry.expiresAt).toLocaleString('he-IL') : '—';

  const loadShares = async () => {
    const r = await api.invokeDocs('list_shares', { claim_id: claimId });
    setShares((r.shares as ShareRow[]) || []);
  };

  useEffect(() => {
    if (!open) return;
    setPicked(presetIds?.length ? [...presetIds] : []);
    setName('');
    setKind('surveyor');
    setKindNote('');
    setEmail('');
    setPhone('');
    setTtl(DEFAULT_SHARE_TTL);
    setCustom('');
    setCreatedUrl('');
    setCreatedUntil('');
    void loadShares();
  }, [open, claimId, (presetIds || []).join(',')]);

  if (!open) return null;

  const toggle = (id: string) => setPicked((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const setMany = (ids: string[]) => setPicked([...new Set(ids)]);

  const create = async () => {
    if (!picked.length) { toast('נא לבחור לפחות קובץ אחד', 'err'); return; }
    if (!name.trim()) { toast('חובה למלא «נשלח אל»', 'err'); return; }
    if (!kind) { toast('חובה לבחור סוג מקבל', 'err'); return; }
    if (!expiry.ok) { toast(expiry.error, 'err'); return; }
    setBusy(true);
    try {
      const r = await api.invokeDocs('create_share', {
        claim_id: claimId,
        recipient_name: name.trim(),
        recipient_kind: kind,
        recipient_kind_note: kindNote,
        recipient_email: email,
        recipient_phone: phone,
        file_ids: picked,
        ttl_hours: ttl === 'custom' ? 0 : SHARE_TTL_PRESETS.find((p) => p.key === ttl)?.hours,
        expires_at: ttl === 'custom' ? expiry.expiresAt : '',
      });
      if (!r.success || !r.token) { toast(String(r.error || 'יצירת הקישור נכשלה'), 'err'); return; }
      const url = sharePublicUrl(String(r.token));
      setCreatedUrl(url);
      setCreatedUntil(String(r.expiresAt || expiry.expiresAt));
      toast('הקישור נוצר. הוא מוצג פעם אחת בלבד.');
      await loadShares();
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!createdUrl) return;
    try { await navigator.clipboard.writeText(createdUrl); toast('הקישור הועתק'); }
    catch { toast('העתיקו ידנית', 'err'); }
  };

  const revoke = async (id: string) => {
    const r = await api.invokeDocs('revoke_share', { claim_id: claimId, share_id: id });
    if (!r.success) { toast(String(r.error || 'ביטול נכשל'), 'err'); return; }
    toast('הקישור בוטל מיד');
    await loadShares();
  };

  const row = (f: FileRow) => (
    <label key={f.id} className="pick-row" data-testid={`share-file-${f.id}`}>
      <input type="checkbox" checked={picked.includes(f.id)} onChange={() => toggle(f.id)} />
      <span>{f.original_name}</span>
      <span className="pick-sz">{Math.round(Number(f.byte_size || 0) / 1024)} KB</span>
    </label>
  );

  return (
    <div className="ov open" data-testid="mo-secure-share">
      <div className="modal modal-md">
        <div className="mh"><div className="mh-t">שיתוף מאובטח</div><button className="mcl" onClick={onClose}>✕</button></div>
        <div className="mb">
          <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 10 }}>
            המקבל רואה רק את מה שנבחר. claims-docs נשאר פרטי. הקישור המלא מוצג פעם אחת — אין חשיפה מחדש.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            <button type="button" className="btn btn-g btn-sm" data-testid="share-all" onClick={() => setMany(files.map((f) => f.id))}>בחר הכל</button>
            <button type="button" className="btn btn-g btn-sm" data-testid="share-clear" onClick={() => setPicked([])}>נקה בחירה</button>
            <button type="button" className="btn btn-g btn-sm" data-testid="share-docs" onClick={() => setMany(docs.map((f) => f.id))}>כל המסמכים</button>
            <button type="button" className="btn btn-g btn-sm" data-testid="share-images" onClick={() => setMany(images.map((f) => f.id))}>כל התמונות</button>
            <button type="button" className="btn btn-g btn-sm" data-testid="share-garage" onClick={() => setMany(garage.map((f) => f.id))}>תמונות מוסך</button>
          </div>
          <div data-testid="share-count" style={{ fontWeight: 700, marginBottom: 8 }}>נבחרו לשיתוף {picked.length} קבצים / תמונות</div>
          {picked.length ? (
            <div data-testid="share-picked-names" style={{ fontSize: 12, marginBottom: 10, color: 'var(--t2)' }}>
              {files.filter((f) => picked.includes(f.id)).map((f) => f.original_name).join(' · ')}
            </div>
          ) : null}
          {docs.length ? <div className="sdiv"><div className="sdiv-t">מסמכים</div><div className="sdiv-l" /></div> : null}
          {docs.map(row)}
          {images.length ? <div className="sdiv"><div className="sdiv-t">תמונות</div><div className="sdiv-l" /></div> : null}
          {images.map(row)}
          {!files.length ? <div style={{ color: 'var(--t3)' }}>אין קבצים בתיק</div> : null}

          <div className="fg"><label className="fl">נשלח אל *</label>
            <input className="fi" data-testid="share-to" value={name} onChange={(e) => setName(e.target.value)} placeholder="שם המקבל" />
          </div>
          <div className="fg"><label className="fl">סוג מקבל *</label>
            <select className="fse fi" data-testid="share-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              {SHARE_RECIPIENT_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
          </div>
          {kind === 'other' ? (
            <div className="fg"><label className="fl">תיאור (אחר)</label>
              <input className="fi" data-testid="share-kind-note" value={kindNote} onChange={(e) => setKindNote(e.target.value)} />
            </div>
          ) : null}
          <div className="fg"><label className="fl">Email (רשות)</label>
            <input className="fi" data-testid="share-email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="fg"><label className="fl">טלפון (רשות)</label>
            <input className="fi" data-testid="share-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="fg"><label className="fl">תוקף</label>
            <select className="fse fi" data-testid="share-ttl" value={ttl} onChange={(e) => setTtl(e.target.value)}>
              {SHARE_TTL_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
          {ttl === 'custom' ? (
            <div className="fg"><label className="fl">תאריך ושעת תפוגה</label>
              <input className="fi" type="datetime-local" data-testid="share-custom" value={custom} onChange={(e) => setCustom(e.target.value)} />
            </div>
          ) : null}
          <div data-testid="share-until" style={{ fontSize: 13, margin: '8px 0 12px' }}>הקישור יהיה זמין עד: <b>{untilText}</b></div>

          {createdUrl ? (
            <div className="cust-link-card" data-testid="share-created">
              <div className="cust-link-title">הקישור נוצר — מוצג פעם אחת</div>
              <div className="cust-link-url" data-testid="share-url">{createdUrl}</div>
              <div className="cust-link-meta">עד {createdUntil ? new Date(createdUntil).toLocaleString('he-IL') : untilText}</div>
              <div className="cust-link-acts">
                <button type="button" className="btn btn-p btn-sm" data-testid="share-copy" onClick={() => void copy()}>העתק קישור</button>
                <button type="button" className="btn btn-g btn-sm" data-testid="share-mail" onClick={() => onMail(email, `שיתוף מאובטח — ${name}`, shareRecipientMessage(createdUrl, createdUntil, ttl))}>שלח במייל</button>
                <button type="button" className="btn btn-g btn-sm" data-testid="share-wa" onClick={() => onWhatsApp(phone, shareRecipientMessage(createdUrl, createdUntil, ttl))}>שלח ב-WhatsApp</button>
              </div>
              <div className="cust-link-note">אם הקישור יאבד — בטלו וצרו שיתוף חדש. אין חשיפה מחדש.</div>
            </div>
          ) : null}

          <div className="sdiv" style={{ marginTop: 16 }}><div className="sdiv-t">שיתופים פעילים / היסטוריה</div><div className="sdiv-l" /></div>
          <div data-testid="share-history">
            {!shares.length ? <div style={{ color: 'var(--t3)', fontSize: 12 }}>אין שיתופים בתיק זה</div> : shares.map((s) => {
              const st = s.status || shareStatusOf(s);
              return (
                <div key={s.id} data-testid={`share-row-${s.id}`} style={{ background: 'var(--bg3)', border: '1px solid var(--br)', borderRadius: 7, padding: 10, marginBottom: 8 }}>
                  <div style={{ fontWeight: 700 }}>{s.recipient_name} · {shareKindLabel(s.recipient_kind)}</div>
                  <div style={{ fontSize: 12 }}>סטטוס: {shareStatusLabel(st)} · {s.file_ids?.length || 0} קבצים</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>נוצר: {s.created_at ? new Date(s.created_at).toLocaleString('he-IL') : '—'} · {s.created_by_name || '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>עד: {s.expires_at ? new Date(s.expires_at).toLocaleString('he-IL') : '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>נפתח: {s.opened_at ? new Date(s.opened_at).toLocaleString('he-IL') : 'טרם'} · הורדה: {s.last_download_at ? new Date(s.last_download_at).toLocaleString('he-IL') : 'טרם'}</div>
                  <div style={{ fontSize: 11 }}>{(s.file_names || []).join(' · ')}</div>
                  {st === 'active' ? <button type="button" className="btn btn-sm" data-testid={`share-revoke-${s.id}`} style={{ marginTop: 6, background: 'rgba(239,68,68,.12)', color: 'var(--rd2)' }} onClick={() => void revoke(s.id)}>בטל קישור עכשיו</button> : null}
                </div>
              );
            })}
          </div>
        </div>
        <div className="mf">
          <button className="btn btn-g" onClick={onClose}>סגור</button>
          <button className="btn btn-p" data-testid="share-create" disabled={busy || !picked.length || !name.trim()} onClick={() => void create()}>{busy ? 'יוצר…' : 'צור קישור מאובטח'}</button>
        </div>
      </div>
    </div>
  );
}
