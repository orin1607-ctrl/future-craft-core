import { useEffect, useState, type ReactNode } from 'react';
import { Download, Eye, File, FileText, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { resolvePrivateDocumentUrl } from '@/lib/accidentDocuments';
import {
  fileNameFromDocument,
  getDocumentKind,
  isImageDocument,
  triggerDocumentDownload,
} from '@/lib/documentDisplayUtils';

function useResolvedDocumentUrl(raw: string | null | undefined) {
  const [resolved, setResolved] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    if (!raw) {
      setResolved('');
      setReady(true);
      return;
    }
    void resolvePrivateDocumentUrl(raw).then((url) => {
      if (cancelled) return;
      setResolved(url);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [raw]);

  return { resolved, ready };
}

export function PrivateDocumentOpenLink({
  url,
  className,
  children,
}: {
  url: string;
  className?: string;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      className={className}
      disabled={busy || !url}
      onClick={async () => {
        setBusy(true);
        const signed = await resolvePrivateDocumentUrl(url);
        setBusy(false);
        if (!signed) {
          toast.error('לא ניתן לפתוח את המסמך');
          return;
        }
        window.open(signed, '_blank', 'noopener,noreferrer');
      }}
    >
      {children}
    </button>
  );
}

export function DocumentPreviewDialog({
  open,
  url,
  fileName,
  onOpenChange,
}: {
  open: boolean;
  url: string | null;
  fileName?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const title = fileName || (url ? fileNameFromDocument(url) : 'תצוגת מסמך');
  const kind = url ? getDocumentKind(`${fileName || ''} ${url}`) : 'other';
  const { resolved, ready } = useResolvedDocumentUrl(open ? url : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2 border-b border-border">
          <DialogTitle className="truncate pe-8">{title}</DialogTitle>
          <DialogDescription className="sr-only">תצוגה מלאה של מסמך</DialogDescription>
        </DialogHeader>
        {url && (
          <div className="p-4 overflow-auto max-h-[calc(92vh-5rem)]">
            {!ready ? (
              <p className="text-center text-muted-foreground py-12">טוען מסמך...</p>
            ) : !resolved ? (
              <p className="text-center text-muted-foreground py-12">לא ניתן לפתוח את המסמך</p>
            ) : kind === 'image' ? (
              <img src={resolved} alt={title} className="mx-auto w-full max-h-[75vh] object-contain rounded-lg" />
            ) : kind === 'pdf' ? (
              <iframe src={resolved} title={title} className="w-full h-[75vh] rounded-lg border border-border bg-muted" />
            ) : (
              <div className="text-center py-12 space-y-4">
                <File size={48} className="mx-auto text-muted-foreground" />
                <p className="text-muted-foreground">אין תצוגה מקדימה לסוג קובץ זה</p>
                <button
                  type="button"
                  onClick={() => triggerDocumentDownload(resolved, title)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-medium"
                >
                  <Download size={16} /> הורד קובץ
                </button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function useDocumentPreview() {
  const [preview, setPreview] = useState<{ url: string; fileName?: string } | null>(null);
  return {
    preview,
    openPreview: (url: string, fileName?: string) => setPreview({ url, fileName }),
    closePreview: () => setPreview(null),
    PreviewDialog: (
      <DocumentPreviewDialog
        open={!!preview}
        url={preview?.url ?? null}
        fileName={preview?.fileName}
        onOpenChange={(open) => { if (!open) setPreview(null); }}
      />
    ),
  };
}

function DocumentKindVisual({
  url,
  fileName,
  size = 'md',
  onClick,
}: {
  url: string;
  fileName?: string;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}) {
  const kind = getDocumentKind(`${fileName || ''} ${url}`);
  const dims = size === 'sm' ? 'w-14 h-14' : size === 'lg' ? 'w-24 h-24' : 'w-16 h-16';
  const iconSize = size === 'sm' ? 22 : size === 'lg' ? 36 : 28;

  if (kind === 'image') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${dims} shrink-0 rounded-xl overflow-hidden border border-border bg-muted hover:ring-2 hover:ring-primary/40 transition-all`}
        title="תצוגה מלאה"
      >
        {url ? (
          <img src={url} alt={fileName || 'תמונה'} className="w-full h-full object-cover" />
        ) : (
          <File size={iconSize} className="text-muted-foreground m-auto" />
        )}
      </button>
    );
  }

  if (kind === 'pdf') {
    return (
      <div className={`${dims} shrink-0 rounded-xl border border-destructive/20 bg-destructive/10 flex flex-col items-center justify-center gap-0.5`}>
        <FileText size={iconSize} className="text-destructive" />
        <span className="text-[10px] font-bold text-destructive">PDF</span>
      </div>
    );
  }

  return (
    <div className={`${dims} shrink-0 rounded-xl border border-border bg-muted flex items-center justify-center`}>
      <File size={iconSize} className="text-muted-foreground" />
    </div>
  );
}

function DocumentActions({
  url,
  fileName,
  onPreview,
  onDelete,
  showView = true,
  compact = false,
}: {
  url: string;
  fileName: string;
  onPreview?: () => void;
  onDelete?: () => void;
  showView?: boolean;
  compact?: boolean;
}) {
  const kind = getDocumentKind(`${fileName} ${url}`);
  const canPreview = kind === 'image' || kind === 'pdf';

  const btn = compact
    ? 'p-2 rounded-lg hover:bg-muted transition-colors'
    : 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors';

  return (
    <div className="flex items-center gap-1 shrink-0">
      {showView && canPreview && onPreview && (
        <button type="button" onClick={onPreview} className={`${btn} text-info hover:bg-info/10`} title="צפייה">
          <Eye size={compact ? 18 : 16} />
          {!compact && <span>צפייה</span>}
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          if (!url) {
            toast.error('לא ניתן לפתוח את המסמך');
            return;
          }
          triggerDocumentDownload(url, fileName);
        }}
        className={`${btn} text-primary hover:bg-primary/10`}
        title="הורדה"
      >
        <Download size={compact ? 18 : 16} />
        {!compact && <span>הורדה</span>}
      </button>
      {onDelete && (
        <button type="button" onClick={onDelete} className={`${btn} text-destructive hover:bg-destructive/10`} title="מחיקה">
          <Trash2 size={compact ? 18 : 16} />
        </button>
      )}
    </div>
  );
}

export function DocumentCard({
  url,
  fileName: fileNameProp,
  label,
  meta,
  onDelete,
  compact = false,
}: {
  url: string;
  fileName?: string;
  label?: string;
  meta?: ReactNode;
  onDelete?: () => void;
  compact?: boolean;
}) {
  const fileName = fileNameProp || fileNameFromDocument(url, label || 'מסמך');
  const [previewOpen, setPreviewOpen] = useState(false);
  const kind = getDocumentKind(`${fileName} ${url}`);
  const { resolved, ready } = useResolvedDocumentUrl(url);

  const openPreview = () => {
    if (!ready) return;
    if (!resolved) {
      toast.error('לא ניתן לפתוח את המסמך');
      return;
    }
    if (kind === 'image' || kind === 'pdf') setPreviewOpen(true);
    else triggerDocumentDownload(resolved, fileName);
  };

  return (
    <>
      <div className={`card-elevated flex items-center gap-3 ${compact ? 'p-2.5' : 'p-3'}`}>
        <DocumentKindVisual
          url={resolved}
          fileName={fileName}
          size={compact ? 'sm' : 'md'}
          onClick={kind === 'image' ? openPreview : undefined}
        />
        <div className="flex-1 min-w-0">
          {label && <p className="text-xs text-muted-foreground mb-0.5">{label}</p>}
          <p className={`font-medium truncate ${compact ? 'text-sm' : ''}`}>{fileName}</p>
          {meta}
        </div>
        <DocumentActions url={resolved} fileName={fileName} onPreview={openPreview} onDelete={onDelete} compact={compact} />
      </div>
      <DocumentPreviewDialog open={previewOpen} url={url} fileName={fileName} onOpenChange={setPreviewOpen} />
    </>
  );
}

export function DocumentAttachment({ label, url, fileName }: { label: string; url: string; fileName?: string }) {
  return <DocumentCard url={url} fileName={fileName} label={label} compact />;
}

export function DocumentGallery({
  urls,
  fileNames,
  title,
}: {
  urls: string[];
  fileNames?: string[];
  title?: string;
}) {
  const [preview, setPreview] = useState<{ url: string; fileName?: string } | null>(null);

  if (!urls.length) return null;

  return (
    <div>
      {title && <p className="text-sm text-muted-foreground mb-2 font-medium">{title} ({urls.length})</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {urls.map((url, i) => {
          const fileName = fileNames?.[i] || fileNameFromDocument(url, `${title || 'מסמך'} ${i + 1}`);

          if (isImageDocument(`${fileName} ${url}`)) {
            return (
              <GalleryImage key={`${url}-${i}`} url={url} fileName={fileName} onOpen={() => setPreview({ url, fileName })} />
            );
          }

          return (
            <DocumentCard key={`${url}-${i}`} url={url} fileName={fileName} compact />
          );
        })}
      </div>
      <DocumentPreviewDialog
        open={!!preview}
        url={preview?.url ?? null}
        fileName={preview?.fileName}
        onOpenChange={(open) => { if (!open) setPreview(null); }}
      />
    </div>
  );
}

function GalleryImage({ url, fileName, onOpen }: { url: string; fileName: string; onOpen: () => void }) {
  const { resolved } = useResolvedDocumentUrl(url);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative rounded-xl overflow-hidden aspect-square border border-border hover:ring-2 hover:ring-primary/40 transition-all"
    >
      {resolved ? (
        <img src={resolved} alt={fileName} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-muted" />
      )}
    </button>
  );
}
