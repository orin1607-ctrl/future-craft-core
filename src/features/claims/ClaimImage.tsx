import { useEffect, useState } from 'react';
import { claimDisplayBlob } from './claimImageDisplay';

/** Converts only the browser display; original signed URLs remain used for downloads. */
export default function ClaimImage({ src, alt, mime = '', className, preview = false }: {
  src: string; alt: string; mime?: string; className?: string; preview?: boolean;
}) {
  const special = /\.(tiff?|hei[cf])$/i.test(alt) || /image\/(tiff|hei[cf])/i.test(mime);
  const [fallback, setFallback] = useState(false);
  const [page, setPage] = useState(0);
  const [display, setDisplay] = useState<{ source: string; page: number; url?: string; pages?: number; error?: boolean } | null>(null);
  useEffect(() => { setPage(0); setFallback(false); }, [src]);
  useEffect(() => {
    if (!special && !fallback) return;
    const controller = new AbortController();
    let disposed = false;
    let objectUrl: string | undefined;
    setDisplay(null);
    void (async () => {
      try {
        const response = await fetch(src, { signal: controller.signal });
        if (!response.ok) throw new Error('image-fetch');
        const result = await claimDisplayBlob(await response.blob(), alt, mime, page);
        if (disposed) return;
        objectUrl = URL.createObjectURL(result.blob);
        setDisplay({ source: src, page, url: objectUrl, pages: result.pages });
      } catch {
        if (!disposed) setDisplay({ source: src, page, error: true });
      }
    })();
    return () => { disposed = true; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src, alt, mime, special, fallback, page]);
  const current = display?.source === src && display.page === page ? display : null;
  if ((special || fallback) && !current) return <span role="status">טוען תמונה…</span>;
  if (current?.error) return <span role="status">לא ניתן להציג תמונה זו. ניתן להוריד את הקובץ המקורי.</span>;
  return <>
    {preview && (current?.pages || 0) > 1 ? <div className="doc-preview-pages">
      <button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)}>עמוד קודם</button>
      <span>עמוד {page + 1} מתוך {current?.pages}</span>
      <button type="button" disabled={page + 1 >= (current?.pages || 1)} onClick={() => setPage(p => p + 1)}>עמוד הבא</button>
    </div> : null}
    <img className={className} src={current?.url || src} alt={alt} onError={() => {
      if (!fallback && !special) setFallback(true);
      else setDisplay({ source: src, page, error: true });
    }} />
  </>;
}
