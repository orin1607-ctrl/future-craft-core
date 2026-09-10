import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { triggerBlobDownload } from '@/features/claims/claimFileDownload';
import {
  blobToDisplayBlob,
  mapPool,
  nextPhotoIndex,
  prevPhotoIndex,
  swipeDeltaToDir,
} from '@/features/claims/shareImageDisplay';

const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claims-docs`;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type ShareFile = { id: string; name: string; mime: string; bytes: number; image: boolean };

type DisplaySlot = { url: string; error?: string };

const SHARE_ALBUM_CSS = `
  html, body.claims-public-page { margin: 0; background: #f4f5f7; }
  .claims-public-page [aria-label="סגור"], .claims-public-page [aria-label="מצב כהה"], .claims-public-page [aria-label="מצב בהיר"] { display: none !important; }
  .share-pub{min-height:100vh;margin:0;padding:0;font-family:Heebo,Arial,sans-serif;direction:rtl;color:#102033;background:#f4f5f7}
  .share-head{padding:18px 16px 12px;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px}
  .share-head-main{flex:1;min-width:180px}
  .share-pub h1{font-size:28px;line-height:1.15;font-weight:800;margin:0}
  .share-count{margin-top:4px;font-size:16px;font-weight:700;color:#3b4a5c}
  .share-pub .meta{color:#5b6b7c;font-size:12px;width:100%}
  .share-pub .acts{display:flex;flex-wrap:wrap;gap:8px}
  .share-pub .btn{border:0;border-radius:8px;padding:8px 12px;font-weight:700;cursor:pointer;background:#1d4ed8;color:#fff}
  .share-pub .btn-g{background:#e8eef6;color:#123}
  .share-pub .btn:disabled{opacity:.45;cursor:default}
  .share-pub .card{background:#fff;border:1px solid #d7deea;border-radius:10px;padding:12px;margin-bottom:8px}
  .share-docs{padding:20px 16px 48px}
  .share-docs h2{font-size:18px;margin:0 0 10px}
  .share-pub .gal{display:grid;gap:3px;width:100%;grid-template-columns:repeat(3,minmax(0,1fr))}
  .share-pub .thumb-tile{position:relative;min-width:0}
  .share-pub .thumb-btn{position:relative;display:block;width:100%;padding:0;border:0;border-radius:0;overflow:hidden;background:#d8dee8;aspect-ratio:1;cursor:pointer}
  .share-pub .thumb-btn img{width:100%;height:100%;object-fit:cover;display:block}
  .share-pub .thumb-ph{display:flex;align-items:center;justify-content:center;height:100%;color:#5b6b7c;font-size:13px}
  .share-pub .thumb-dl{position:absolute;top:6px;left:6px;z-index:1;border:0;border-radius:7px;padding:4px 7px;font-size:11px;font-weight:700;cursor:pointer;background:rgba(15,23,42,.55);color:#fff}
  .share-pub .err{color:#b91c1c;margin:8px 16px}
  .share-loading-msg{padding:24px 16px;color:#5b6b7c}
  .share-lb{position:fixed;inset:0;z-index:9999;background:#0b1020;display:flex;flex-direction:column;color:#fff}
  .share-lb .btn{border:0;border-radius:8px;padding:8px 12px;font-weight:700;cursor:pointer;background:#1d4ed8;color:#fff}
  .share-lb .btn-g{background:#243044;color:#fff}
  .share-lb-top{display:flex;align-items:center;gap:8px;padding:10px 12px;flex-shrink:0;background:#0b1020}
  .share-lb-top b{flex:1;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .share-lb-stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;position:relative;touch-action:pan-y;background:#0b1020}
  .share-lb-stage img{max-width:min(100%,1200px);max-height:100%;width:auto;height:auto;object-fit:contain;user-select:none;-webkit-user-drag:none}
  .share-lb-nav{position:absolute;top:50%;transform:translateY(-50%);width:48px;height:64px;border:0;border-radius:10px;background:rgba(255,255,255,.16);color:#fff;font-size:28px;cursor:pointer}
  .share-lb-nav.prev{right:10px}
  .share-lb-nav.next{left:10px}
  .share-lb-nav:disabled{opacity:.25}
  @media (max-width: 700px){
    .share-lb-nav{width:40px;height:52px}
    .share-pub h1{font-size:26px}
  }
  @media (max-width: 380px){
    .share-pub .gal{grid-template-columns:repeat(2,minmax(0,1fr))}
  }
  @media (min-width: 720px){
    .share-pub h1{font-size:32px}
    .share-pub .gal{grid-template-columns:repeat(4,minmax(0,1fr));gap:4px}
    .share-head{padding:20px 20px 14px}
    .share-docs{padding:24px 20px 56px}
  }
  @media (min-width: 1100px){
    .share-pub .gal{grid-template-columns:repeat(5,minmax(0,1fr))}
  }
  @media (min-width: 1440px){
    .share-pub .gal{grid-template-columns:repeat(6,minmax(0,1fr))}
  }
`;

export default function ClaimsSharePage() {
  const [params] = useSearchParams();
  const token = params.get('t') || params.get('token') || '';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [files, setFiles] = useState<ShareFile[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, DisplaySlot>>({});
  const [full, setFull] = useState<Record<string, DisplaySlot>>({});
  const [busy, setBusy] = useState('');
  const [viewer, setViewer] = useState<number | null>(null);
  const urlsRef = useRef<string[]>([]);
  const touchX = useRef<number | null>(null);
  const inflight = useRef(new Map<string, Promise<DisplaySlot>>());
  const thumbsRef = useRef<Record<string, DisplaySlot>>({});
  const fullRef = useRef<Record<string, DisplaySlot>>({});

  const pubHeaders = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

  const rememberUrl = (url: string) => {
    urlsRef.current.push(url);
    return url;
  };

  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    const res = await fetch(FN, { method: 'POST', headers: pubHeaders, body: JSON.stringify({ action, token, ...extra }) });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  };

  const fetchFileBlob = async (fileId: string, purpose: 'preview' | 'download' = 'preview') => {
    const res = await fetch(FN, {
      method: 'POST',
      headers: pubHeaders,
      body: JSON.stringify({ action: 'public_share_file', token, file_id: fileId, purpose }),
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (/json/i.test(ct)) return null;
    return res.blob();
  };

  const decodeUrl = (url: string) => new Promise<boolean>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0);
    img.onerror = () => resolve(false);
    img.src = url;
  });

  const displayUrlFor = (f: ShareFile) => {
    const cached = fullRef.current[f.id] || thumbsRef.current[f.id];
    if (cached) return Promise.resolve(cached);
    const pending = inflight.current.get(f.id);
    if (pending) return pending;
    const p = (async (): Promise<DisplaySlot> => {
      try {
        const blob = await fetchFileBlob(f.id, 'preview');
        if (!blob) return { url: '', error: 'לא נטען' };
        const mime = f.mime || blob.type || '';
        const out = await blobToDisplayBlob(blob, mime, f.name);
        const url = rememberUrl(URL.createObjectURL(out.blob));
        if (!(await decodeUrl(url))) return { url: '', error: 'לא נטען' };
        return { url };
      } catch {
        return { url: '', error: 'לא נטען' };
      }
    })();
    inflight.current.set(f.id, p);
    return p;
  };

  const putThumb = (id: string, slot: DisplaySlot) => {
    thumbsRef.current[id] = slot;
    setThumbs((prev) => ({ ...prev, [id]: slot }));
  };

  const putFull = (id: string, slot: DisplaySlot) => {
    fullRef.current[id] = slot;
    setFull((prev) => ({ ...prev, [id]: slot }));
  };

  const load = async () => {
    if (!token) { setError('קישור לא תקין'); setLoading(false); return; }
    try {
      const r = await call('public_share_get');
      if (!r.ok || r.json.success === false) {
        const e = String(r.json.error || '');
        setError(e === 'expired' ? 'הקישור פג תוקף' : e === 'revoked' ? 'הקישור בוטל' : 'קישור לא תקין');
        setLoading(false);
        return;
      }
      setExpiresAt(String(r.json.expiresAt || ''));
      const next = (r.json.files || []) as ShareFile[];
      setFiles(next);
      setLoading(false);
      const imgs = next.filter((f) => f.image);
      await mapPool(imgs, 6, async (f) => {
        const slot = await displayUrlFor(f);
        putThumb(f.id, slot);
      });
    } catch {
      setError('קישור לא תקין');
      setLoading(false);
    }
  };

  useEffect(() => {
    document.title = 'גלריית תמונות';
    document.documentElement.lang = 'he';
    document.documentElement.dir = 'rtl';
    document.body.classList.add('claims-public-page');
    return () => {
      document.body.classList.remove('claims-public-page');
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      urlsRef.current = [];
    };
  }, []);

  useEffect(() => { void load(); }, [token]);

  const images = useMemo(() => files.filter((f) => f.image), [files]);
  const docs = useMemo(() => files.filter((f) => !f.image), [files]);
  const thumbsLoaded = images.filter((f) => thumbs[f.id]).length;
  const thumbsReady = images.length > 0 && thumbsLoaded === images.length;

  const ensureFull = useCallback(async (f: ShareFile) => {
    if (fullRef.current[f.id]?.url) return fullRef.current[f.id];
    if (thumbsRef.current[f.id]?.url) {
      putFull(f.id, thumbsRef.current[f.id]);
      return thumbsRef.current[f.id];
    }
    const slot = await displayUrlFor(f);
    putFull(f.id, slot);
    if (!thumbsRef.current[f.id]?.url) putThumb(f.id, slot);
    return slot;
  }, []);

  const openViewer = async (index: number) => {
    const f = images[index];
    if (!f) return;
    setViewer(index);
    await ensureFull(f);
    const around = [images[index - 1], images[index + 1]].filter(Boolean) as ShareFile[];
    around.forEach((n) => { void ensureFull(n); });
  };

  const go = useCallback(async (dir: 'next' | 'prev') => {
    setViewer((cur) => {
      if (cur == null) return cur;
      return dir === 'next' ? nextPhotoIndex(cur, images.length) : prevPhotoIndex(cur, images.length);
    });
  }, [images.length]);

  useEffect(() => {
    if (viewer == null) return;
    const f = images[viewer];
    if (f) void ensureFull(f);
    const peekNext = images[viewer + 1];
    const peekPrev = images[viewer - 1];
    if (peekNext) void ensureFull(peekNext);
    if (peekPrev) void ensureFull(peekPrev);
  }, [viewer, images, ensureFull]);

  useEffect(() => {
    if (viewer == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewer(null);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); void go('next'); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); void go('prev'); }
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [viewer, go]);

  const downloadOne = async (f: ShareFile) => {
    setBusy(f.id);
    const blob = await fetchFileBlob(f.id, 'download');
    setBusy('');
    if (!blob) { setError('לא ניתן להוריד'); return; }
    triggerBlobDownload(blob, f.name || 'file');
  };

  const openDoc = async (f: ShareFile) => {
    setBusy(f.id);
    const blob = await fetchFileBlob(f.id, 'preview');
    setBusy('');
    if (!blob) { setError('לא ניתן לפתוח'); return; }
    const url = rememberUrl(URL.createObjectURL(blob));
    putFull(f.id, { url });
    window.open(url, '_blank', 'noopener');
  };

  const binary = async (action: string, filename: string) => {
    setBusy(action);
    const res = await fetch(FN, {
      method: 'POST',
      headers: pubHeaders,
      body: JSON.stringify({ action, token }),
    });
    setBusy('');
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.blocked ? 'BLOCKED' : String(json.error || json.hint || 'ההורדה נכשלה'));
      return;
    }
    triggerBlobDownload(await res.blob(), filename);
  };

  if (loading) {
    return (
      <div className="share-pub" data-testid="share-loading">
        <style>{SHARE_ALBUM_CSS}</style>
        <header className="share-head"><h1>גלריית תמונות</h1></header>
        <div className="share-loading-msg">טוען…</div>
      </div>
    );
  }
  if (error && !files.length) {
    return (
      <div className="share-pub" data-testid="share-error">
        <style>{SHARE_ALBUM_CSS}</style>
        <header className="share-head"><h1>גלריית תמונות</h1></header>
        <div className="err">{error}</div>
      </div>
    );
  }

  const current = viewer != null ? images[viewer] : null;
  const currentSlot = current ? (full[current.id] || thumbs[current.id]) : null;

  const lightbox = viewer != null && current ? (
    <div
      className="share-lb"
      data-testid="share-lightbox"
      onTouchStart={(e) => { touchX.current = e.changedTouches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        touchX.current = null;
        if (start == null) return;
        const dir = swipeDeltaToDir((e.changedTouches[0]?.clientX ?? start) - start);
        if (dir) void go(dir);
      }}
    >
      <div className="share-lb-top">
        <b data-testid="share-preview-name">{current.name}</b>
        <span data-testid="share-lb-pos">{viewer + 1} / {images.length}</span>
        <button className="btn" type="button" data-testid="share-preview-download" onClick={() => void downloadOne(current)}>הורדה</button>
        <button className="btn btn-g" type="button" data-testid="share-lb-close" onClick={() => setViewer(null)}>סגור</button>
      </div>
      <div className="share-lb-stage" data-testid="share-preview">
        <button className="share-lb-nav prev" type="button" data-testid="share-lb-prev" disabled={viewer <= 0} onClick={() => void go('prev')} aria-label="הקודם">‹</button>
        {currentSlot?.url
          ? <img src={currentSlot.url} alt={current.name} data-testid="share-lb-img" />
          : <div data-testid="share-lb-missing">{currentSlot?.error || 'טוען…'}</div>}
        <button className="share-lb-nav next" type="button" data-testid="share-lb-next" disabled={viewer >= images.length - 1} onClick={() => void go('next')} aria-label="הבא">›</button>
      </div>
    </div>
  ) : null;

  return (
    <div className="share-pub" data-testid="share-page">
      <style>{SHARE_ALBUM_CSS}</style>
      <header className="share-head">
        <div className="share-head-main">
          <h1 data-testid="share-gallery-title">גלריית תמונות</h1>
          {images.length ? (
            <div className="share-count" data-testid="share-pub-count">{images.length} תמונות</div>
          ) : (
            <div className="share-count" data-testid="share-pub-count">אין תמונות</div>
          )}
        </div>
        <div className="acts">
          <button className="btn" data-testid="share-pub-zip" type="button" disabled={busy === 'public_share_zip' || !files.length} onClick={() => void binary('public_share_zip', 'claim-share.zip')}>הורד הכל</button>
        </div>
        <div className="meta">
          קישור מאובטח לקריאה ולהורדה בלבד
          {expiresAt ? ` · עד ${new Date(expiresAt).toLocaleString('he-IL')}` : ''}
          {images.length && !thumbsReady ? ` · נטענו ${thumbsLoaded} מתוך ${images.length}` : ''}
        </div>
      </header>
      {error ? <div className="err" data-testid="share-err">{error}</div> : null}
      <div
        className="meta"
        data-testid="share-thumbs-progress"
        data-loaded={thumbsLoaded}
        data-total={images.length}
        hidden
      />

      <div
        className="gal"
        data-testid="share-gallery"
        data-thumbs-ready={thumbsReady ? '1' : '0'}
        data-thumbs-loaded={thumbsLoaded}
        data-thumbs-total={images.length}
      >
        {images.map((f, idx) => (
          <div key={f.id} className="thumb-tile">
            <button
              type="button"
              className="thumb-btn"
              data-testid={`share-pub-img-${f.id}`}
              onClick={() => void openViewer(idx)}
              aria-label={f.name}
            >
              {thumbs[f.id]?.url
                ? <img src={thumbs[f.id].url} alt={f.name} data-testid={`share-thumb-${f.id}`} />
                : <span className="thumb-ph" data-testid={`share-thumb-ph-${f.id}`}>{thumbs[f.id]?.error || 'טוען…'}</span>}
            </button>
            <button type="button" className="thumb-dl" data-testid={`share-pub-dl-${f.id}`} onClick={() => void downloadOne(f)}>הורדה</button>
          </div>
        ))}
      </div>

      {docs.length ? (
        <section className="share-docs" data-testid="share-docs">
          <h2>מסמכים</h2>
          {docs.map((f) => (
            <div key={f.id} className="card" data-testid={`share-pub-file-${f.id}`}>
              <div>{f.name}</div>
              <div className="acts">
                <button className="btn" type="button" data-testid={`share-pub-view-${f.id}`} onClick={() => void openDoc(f)}>Preview</button>
                <button className="btn btn-g" type="button" data-testid={`share-pub-dl-${f.id}`} onClick={() => void downloadOne(f)}>Download</button>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {lightbox && typeof document !== 'undefined' ? createPortal(lightbox, document.body) : null}
    </div>
  );
}
