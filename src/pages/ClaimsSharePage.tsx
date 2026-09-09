import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claims-docs`;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type ShareFile = { id: string; name: string; mime: string; bytes: number; image: boolean };

export default function ClaimsSharePage() {
  const [params] = useSearchParams();
  const token = params.get('t') || '';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [files, setFiles] = useState<ShareFile[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ url: string; name: string; mime: string } | null>(null);
  const [busy, setBusy] = useState('');

  const pubHeaders = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    const res = await fetch(FN, { method: 'POST', headers: pubHeaders, body: JSON.stringify({ action, token, ...extra }) });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  };

  const load = async () => {
    if (!token) { setError('קישור לא תקין'); setLoading(false); return; }
    const r = await call('public_share_get');
    if (!r.ok || r.json.success === false) {
      const e = String(r.json.error || '');
      setError(e === 'expired' ? 'הקישור פג תוקף' : e === 'revoked' ? 'הקישור בוטל' : 'קישור לא תקין');
      setLoading(false);
      return;
    }
    setExpiresAt(String(r.json.expiresAt || ''));
    setFiles(r.json.files || []);
    setPicked((r.json.files || []).map((f: ShareFile) => f.id));
    setLoading(false);
  };

  useEffect(() => {
    document.title = 'שיתוף מאובטח';
    document.documentElement.lang = 'he';
    document.documentElement.dir = 'rtl';
    document.body.classList.add('claims-public-page');
    return () => document.body.classList.remove('claims-public-page');
  }, []);

  useEffect(() => { void load(); }, [token]);

  const images = files.filter((f) => f.image);
  const docs = files.filter((f) => !f.image);
  const selected = useMemo(() => files.filter((f) => picked.includes(f.id)), [files, picked]);

  const openFile = async (f: ShareFile, purpose = 'preview') => {
    setBusy(f.id);
    const r = await call('public_share_url', { file_id: f.id, purpose });
    setBusy('');
    if (!r.ok || !r.json.url) { setError(r.json.blocked ? 'BLOCKED' : 'לא ניתן לפתוח'); return; }
    if (purpose === 'preview') setPreview({ url: r.json.url, name: f.name, mime: f.mime || r.json.mime });
    else {
      const a = document.createElement('a');
      a.href = r.json.url;
      a.download = f.name;
      a.rel = 'noopener';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  const binary = async (action: string, filename: string, ids?: string[]) => {
    setBusy(action);
    const res = await fetch(FN, {
      method: 'POST',
      headers: pubHeaders,
      body: JSON.stringify({ action, token, ...(ids ? { file_ids: ids } : {}) }),
    });
    setBusy('');
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.blocked ? 'BLOCKED' : String(json.error || json.hint || 'ההורדה נכשלה'));
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const printFile = async (f: ShareFile) => {
    const r = await call('public_share_url', { file_id: f.id, purpose: 'preview' });
    if (!r.json.url) return;
    const w = window.open(r.json.url, '_blank', 'noopener');
    w?.addEventListener('load', () => { try { w.print(); } catch { /* ignore */ } });
  };

  if (loading) return <div className="share-pub" data-testid="share-loading">טוען…</div>;
  if (error && !files.length) return <div className="share-pub" data-testid="share-error">{error}</div>;

  return (
    <div className="share-pub" data-testid="share-page">
      <style>{`
        .claims-public-page [aria-label="סגור"], .claims-public-page [aria-label="מצב כהה"], .claims-public-page [aria-label="מצב בהיר"] { display: none !important; }
        .share-pub{max-width:880px;margin:0 auto;padding:20px 16px 48px;font-family:Heebo,Arial,sans-serif;direction:rtl;color:#102033}
        .share-pub h1{font-size:22px;margin:0 0 6px}
        .share-pub .meta{color:#5b6b7c;font-size:13px;margin-bottom:14px}
        .share-pub .acts{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
        .share-pub .btn{border:0;border-radius:8px;padding:8px 12px;font-weight:700;cursor:pointer;background:#1d4ed8;color:#fff}
        .share-pub .btn-g{background:#e8eef6;color:#123}
        .share-pub .card{background:#fff;border:1px solid #d7deea;border-radius:10px;padding:12px;margin-bottom:8px}
        .share-pub .gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
        .share-pub .thumb{width:100%;height:120px;object-fit:cover;border-radius:8px;background:#eef}
        .share-pub .preview{margin:12px 0;border:1px solid #d7deea;border-radius:10px;overflow:hidden;background:#111}
        .share-pub .preview iframe,.share-pub .preview img{width:100%;min-height:360px;border:0}
        .share-pub .err{color:#b91c1c;margin:8px 0}
      `}</style>
      <h1>שיתוף מאובטח</h1>
      <div className="meta">חומר שנבחר לשיתוף בלבד. המסך לקריאה ולהורדה. הקישור זמין עד {expiresAt ? new Date(expiresAt).toLocaleString('he-IL') : '—'}</div>
      {error ? <div className="err" data-testid="share-err">{error}</div> : null}
      <div className="acts">
        <button className="btn btn-g" data-testid="share-pub-all" type="button" onClick={() => setPicked(files.map((f) => f.id))}>בחר הכל</button>
        <button className="btn btn-g" data-testid="share-pub-clear" type="button" onClick={() => setPicked([])}>נקה</button>
        <button className="btn btn-g" data-testid="share-pub-docs-only" type="button" onClick={() => setPicked(docs.map((f) => f.id))}>רק מסמכים</button>
        <button className="btn btn-g" data-testid="share-pub-photos-only" type="button" onClick={() => setPicked(images.map((f) => f.id))}>רק תמונות</button>
        <button className="btn" data-testid="share-pub-zip" type="button" disabled={busy === 'public_share_zip' || !files.length} onClick={() => void binary('public_share_zip', 'claim-share.zip')}>הורד הכל / ZIP</button>
        <button className="btn btn-g" data-testid="share-pub-selected" type="button" disabled={!selected.length} onClick={() => void binary('public_share_zip', 'claim-share-selected.zip', picked)}>הורד נבחרים</button>
        <button className="btn btn-g" data-testid="share-pub-pdf" type="button" disabled={!files.length} onClick={() => void binary('public_share_bundle_pdf', 'claim-share-bundle.pdf')}>הפק / הורד PDF מרוכז</button>
      </div>
      <div data-testid="share-pub-count">נבחרו {picked.length} מתוך {files.length}</div>

      {preview ? (
        <div className="preview" data-testid="share-preview">
          <div style={{ background: '#fff', color: '#123', padding: 8, display: 'flex', gap: 8 }}>
            <b data-testid="share-preview-name">{preview.name}</b>
            <a className="btn" href={preview.url} download={preview.name} data-testid="share-preview-download">הורדה</a>
            <button className="btn btn-g" type="button" data-testid="share-preview-print" onClick={() => { const w = window.open(preview.url, '_blank', 'noopener'); w?.addEventListener('load', () => { try { w.print(); } catch { /* ignore */ } }); }}>Print</button>
            <button className="btn btn-g" type="button" onClick={() => setPreview(null)}>סגור</button>
          </div>
          {preview.mime.startsWith('image/')
            ? <img src={preview.url} alt={preview.name} />
            : <iframe title={preview.name} src={preview.url} />}
        </div>
      ) : null}

      {docs.length ? <h2>מסמכים</h2> : null}
      {docs.map((f) => (
        <div key={f.id} className="card" data-testid={`share-pub-file-${f.id}`}>
          <label><input type="checkbox" checked={picked.includes(f.id)} onChange={(e) => setPicked((p) => e.target.checked ? [...p, f.id] : p.filter((x) => x !== f.id))} /> {f.name}</label>
          <div className="acts">
            <button className="btn" type="button" data-testid={`share-pub-view-${f.id}`} onClick={() => void openFile(f)}>Preview</button>
            <button className="btn btn-g" type="button" data-testid={`share-pub-dl-${f.id}`} onClick={() => void openFile(f, 'download')}>Download</button>
            <button className="btn btn-g" type="button" data-testid={`share-pub-print-${f.id}`} onClick={() => void printFile(f)}>Print</button>
          </div>
        </div>
      ))}

      {images.length ? <h2>תמונות</h2> : null}
      <div className="gal">
        {images.map((f) => (
          <div key={f.id} className="card" data-testid={`share-pub-img-${f.id}`}>
            <label><input type="checkbox" checked={picked.includes(f.id)} onChange={(e) => setPicked((p) => e.target.checked ? [...p, f.id] : p.filter((x) => x !== f.id))} /> {f.name}</label>
            <button className="btn" type="button" style={{ width: '100%', marginTop: 6 }} onClick={() => void openFile(f)}>פתיחה בגודל מלא</button>
            <button className="btn btn-g" type="button" style={{ width: '100%', marginTop: 6 }} data-testid={`share-pub-dl-${f.id}`} onClick={() => void openFile(f, 'download')}>Download</button>
          </div>
        ))}
      </div>
    </div>
  );
}
