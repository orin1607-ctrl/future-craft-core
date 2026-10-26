/**
 * DocumentViewerModal.tsx
 * Universal responsive viewer for PDFs and Images on phone and desktop.
 * - Multi-page rendering / canvas for PDFs via PDF.js (works on mobile browsers where iframe PDF viewer fails!)
 * - Zoom in / out / reset
 * - Page navigation
 * - Direct WhatsApp and Email sharing with attached file support
 * - Download and print
 */

import React, { useEffect, useRef, useState } from 'react';
import ClaimImage from './ClaimImage';
import { downloadRemoteFile } from './claimFileDownload';
import {
  isMobileDevice,
  shareDocToEmail,
  shareDocToWhatsApp,
  type DocShareContext,
  type DocShareFile,
} from './claimDocShare';
import './document-viewer.css';

type Props = {
  file: DocShareFile | null;
  ctx: DocShareContext;
  onClose: () => void;
  pos?: string;
  canPrev?: boolean;
  canNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onInternalEmail?: (seed: { to: string; subject: string; body: string; file_ids: string[] }) => void;
  toast?: (msg: string, type?: string) => void;
};

export default function DocumentViewerModal({
  file,
  ctx,
  onClose,
  pos,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onInternalEmail,
  toast,
}: Props) {
  const [scale, setScale] = useState(1);
  const [pdfPages, setPdfPages] = useState<number>(0);
  const [pdfCurrentPage, setPdfCurrentPage] = useState<number>(1);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const [sharing, setSharing] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<any>(null);
  const pdfDocRef = useRef<any>(null);

  const isImg = file ? (file.mime || '').startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name) : false;
  const isPdf = file ? (file.mime || '').includes('pdf') || /\.pdf$/i.test(file.name) : false;
  const isMobile = isMobileDevice();

  // Reset state on file change
  useEffect(() => {
    setScale(1);
    setPdfPages(0);
    setPdfCurrentPage(1);
    setPdfError(false);
    pdfDocRef.current = null;
  }, [file?.url]);

  // Load PDF with PDF.js for crisp mobile & desktop rendering
  useEffect(() => {
    if (!file?.url || !isPdf) return;

    let active = true;
    setPdfLoading(true);
    setPdfError(false);

    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        if (typeof Worker !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
          const { default: workerUrl } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
          pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        }

        const loadingTask = pdfjs.getDocument({
          url: file.url,
          disableRange: false,
          isEvalSupported: false,
        });

        const doc = await loadingTask.promise;
        if (!active) return;

        pdfDocRef.current = doc;
        setPdfPages(doc.numPages);
        setPdfCurrentPage(1);
        setPdfLoading(false);
      } catch (err) {
        console.warn('[DocumentViewerModal] PDF.js load failed, will fallback to iframe', err);
        if (active) {
          setPdfError(true);
          setPdfLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [file?.url, isPdf]);

  // Render current PDF page to canvas
  useEffect(() => {
    if (!pdfDocRef.current || !canvasRef.current || isPdf === false) return;

    let active = true;
    (async () => {
      try {
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {
            // ignore
          }
        }

        const page = await pdfDocRef.current.getPage(pdfCurrentPage);
        if (!active) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const containerWidth = Math.min(window.innerWidth - 32, 900);
        const fitScale = (containerWidth / baseViewport.width) * scale;
        const viewport = page.getViewport({ scale: Math.max(0.6, fitScale) });

        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderContext = {
          canvasContext: context,
          viewport,
        };

        const task = page.render(renderContext);
        renderTaskRef.current = task;
        await task.promise;
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn('[DocumentViewerModal] Page render error', err);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [pdfCurrentPage, scale, isPdf]);

  if (!file) return null;

  const zoomIn = () => setScale((s) => Math.min(2.5, Number((s + 0.25).toFixed(2))));
  const zoomOut = () => setScale((s) => Math.max(0.5, Number((s - 0.25).toFixed(2))));
  const zoomReset = () => setScale(1);

  const handleWhatsApp = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const res = await shareDocToWhatsApp(
        file,
        ctx,
        '',
        (msg) => toast?.(msg, 'inf')
      );
      if (res.method === 'native') toast?.('שותף בהצלחה', 'ok');
      else if (res.method === 'wa_link') toast?.('נפתח WhatsApp לשליחה', 'ok');
    } catch {
      toast?.('השיתוף נכשל', 'err');
    } finally {
      setSharing(false);
    }
  };

  const handleEmail = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const res = await shareDocToEmail(file, ctx, {
        onInternalCompose: onInternalEmail,
      });
      if (res.method === 'internal') {
        toast?.('נפתח עורך המייל עם הקובץ המצורף', 'ok');
        onClose();
      } else if (res.method === 'native') {
        toast?.('שותף בהצלחה', 'ok');
      } else {
        toast?.('נפתחה תוכנת האימייל במכשיר', 'ok');
      }
    } catch {
      toast?.('השליחה נכשלה', 'err');
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="dvm-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} data-testid="doc-viewer-modal">
      <div className="dvm-container" dir="rtl" role="dialog" aria-label={`צפייה במסמך: ${file.name}`}>
        {/* Header Bar */}
        <div className="dvm-header">
          <div className="dvm-title-wrap">
            <b className="dvm-filename" title={file.name}>{file.name}</b>
            {pos ? <span className="dvm-pos">{pos}</span> : null}
          </div>

          <div className="dvm-actions">
            {/* Nav prev/next */}
            {(canPrev || canNext) && (
              <div className="dvm-nav-group">
                <button type="button" className="dvm-btn dvm-btn-icon" disabled={!canPrev} onClick={onPrev} title="מסמך קודם">◀</button>
                <button type="button" className="dvm-btn dvm-btn-icon" disabled={!canNext} onClick={onNext} title="מסמך הבא">▶</button>
              </div>
            )}

            {/* Sharing actions */}
            <button
              type="button"
              className="dvm-btn dvm-btn-wa"
              data-testid="doc-share-wa"
              onClick={handleWhatsApp}
              disabled={sharing}
              title="שליחה בוואטסאפ"
            >
              💬 WhatsApp
            </button>

            <button
              type="button"
              className="dvm-btn dvm-btn-mail"
              data-testid="doc-share-email"
              onClick={handleEmail}
              disabled={sharing}
              title="שליחה באימייל"
            >
              ✉️ אימייל
            </button>

            {/* Download */}
            <button
              type="button"
              className="dvm-btn"
              data-testid="doc-viewer-download"
              onClick={() => { void downloadRemoteFile(file.url, file.name); }}
              title="הורדת הקובץ למכשיר"
            >
              📥 הורדה
            </button>

            {/* Print on desktop */}
            {!isMobile && (
              <button
                type="button"
                className="dvm-btn"
                onClick={() => {
                  const w = window.open(file.url, '_blank', 'noopener');
                  w?.addEventListener('load', () => { try { w.print(); } catch { /* ignore */ } });
                }}
                title="הדפסה"
              >
                🖨️ הדפס
              </button>
            )}

            <button type="button" className="dvm-btn dvm-btn-close" onClick={onClose} aria-label="סגור">✕</button>
          </div>
        </div>

        {/* Zoom & Page Controls (when applicable) */}
        <div className="dvm-toolbar">
          <div className="dvm-zoom-group">
            <button type="button" className="dvm-btn dvm-btn-sm" onClick={zoomOut} disabled={scale <= 0.5}>−</button>
            <span className="dvm-scale-label" onClick={zoomReset} title="אפס זום">{Math.round(scale * 100)}%</span>
            <button type="button" className="dvm-btn dvm-btn-sm" onClick={zoomIn} disabled={scale >= 2.5}>+</button>
            {scale !== 1 && (
              <button type="button" className="dvm-btn dvm-btn-sm" onClick={zoomReset}>איפוס</button>
            )}
          </div>

          {isPdf && pdfPages > 1 && (
            <div className="dvm-page-group">
              <button
                type="button"
                className="dvm-btn dvm-btn-sm"
                disabled={pdfCurrentPage <= 1}
                onClick={() => setPdfCurrentPage((p) => Math.max(1, p - 1))}
              >
                עמוד קודם
              </button>
              <span>עמוד {pdfCurrentPage} מתוך {pdfPages}</span>
              <button
                type="button"
                className="dvm-btn dvm-btn-sm"
                disabled={pdfCurrentPage >= pdfPages}
                onClick={() => setPdfCurrentPage((p) => Math.min(pdfPages, p + 1))}
              >
                עמוד הבא
              </button>
            </div>
          )}
        </div>

        {/* Main Content Area */}
        <div className="dvm-body">
          {isImg ? (
            <div className="dvm-img-wrap" style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}>
              <ClaimImage className="dvm-img" src={file.url} alt={file.name} mime={file.mime} preview />
            </div>
          ) : isPdf && !pdfError ? (
            <div className="dvm-canvas-wrap">
              {pdfLoading && <div className="dvm-loading">טוען PDF לצפייה…</div>}
              <canvas ref={canvasRef} className="dvm-canvas" />
            </div>
          ) : (
            /* Fallback for other formats or if PDF.js failed */
            <div className="dvm-frame-wrap">
              <iframe className="dvm-frame" title={file.name} src={file.url} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
