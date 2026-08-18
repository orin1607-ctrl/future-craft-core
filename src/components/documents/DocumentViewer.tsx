import { useEffect, useState, type ReactNode } from 'react';
import { Download, Eye, File, FileText, Trash2 } from 'lucide-react';
import { resolveDocumentUrl, extractDocumentsStoragePath } from '@/lib/documentUrl';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  fileNameFromDocument,
  getDocumentKind,
  isImageDocument,
  triggerDocumentDownload,
} from '@/lib/documentDisplayUtils';

function useResolvedDocumentUrl(url: string | null | undefined) {
  const [resolved, setResolved] = useState(url || '');
  useEffect(() => {
    let cancelled = false;
    if (!url) {
      setResolved('');
      return;
    }
    const path = extractDocumentsStoragePath(url);
    resolveDocumentUrl(url).then((next) => {
      if (!cancelled) setResolved(next || (path ? '' : url));
    });
    return () => { cancelled = true; };
  }, [url]);
  return resolved;
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
  const resolvedUrl = useResolvedDocumentUrl(url);
  const title = fileName || (url ? fileNameFromDocument(url) : 'תצוגת מסמך');
  const kind = resolvedUrl ? getDocumentKind(`${fileName || ''} ${resolvedUrl}`) : 'other';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2 border-b border-border">
          <DialogTitle className="truncate pe-8">{title}</DialogTitle>
          <DialogDescription className="sr-only">תצוגה מלאה של מסמך</DialogDescription>
        </DialogHeader>
        {resolvedUrl && (
          <div className="p-4 overflow-auto max-h-[calc(92vh-5rem)]">
            {kind === 'image' ? (
              <img src={resolvedUrl} alt={title} className="mx-auto w-full max-h-[75vh] object-contain rounded-lg" />
            ) : kind === 'pdf' ? (
              <iframe src={resolvedUrl} title={title} className="w-full h-[75vh] rounded-lg border border-border bg-muted" />
            ) : (
              <div className="text-center py-12 space-y-4">
                <File size={48} className="mx-auto text-muted-foreground" />
                <p className="text-muted-foreground">אין תצוגה מקדימה לסוג קובץ זה</p>
                <button
                  type="button"
                  onClick={() => triggerDocumentDownload(resolvedUrl, title)}
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
        <img src={url} alt={fileName || 'תמונה'} className="w-full h-full object-cover" />
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
        onClick={() => triggerDocumentDownload(url, fileName)}
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
  const resolvedUrl = useResolvedDocumentUrl(url);
  const fileName = fileNameProp || fileNameFromDocument(url, label || 'מסמך');
  const [previewOpen, setPreviewOpen] = useState(false);
  const kind = getDocumentKind(`${fileName} ${resolvedUrl || url}`);

  const openPreview = () => {
    if (kind === 'image' || kind === 'pdf') setPreviewOpen(true);
    else triggerDocumentDownload(url, fileName);
  };

  return (
    <>
      <div className={`card-elevated flex items-center gap-3 ${compact ? 'p-2.5' : 'p-3'}`}>
        <DocumentKindVisual
          url={resolvedUrl || url}
          fileName={fileName}
          size={compact ? 'sm' : 'md'}
          onClick={kind === 'image' ? openPreview : undefined}
        />
        <div className="flex-1 min-w-0">
          {label && <p className="text-xs text-muted-foreground mb-0.5">{label}</p>}
          <p className={`font-medium truncate ${compact ? 'text-sm' : ''}`}>{fileName}</p>
          {meta}
        </div>
        <DocumentActions url={resolvedUrl || url} fileName={fileName} onPreview={openPreview} onDelete={onDelete} compact={compact} />
      </div>
      <DocumentPreviewDialog open={previewOpen} url={resolvedUrl || url} fileName={fileName} onOpenChange={setPreviewOpen} />
    </>
  );
}

export function DocumentAttachment({ label, url, fileName }: { label: string; url: string; fileName?: string }) {
  return <DocumentCard url={url} fileName={fileName} label={label} compact />;
}

export function ResolvedStorageImg({ url, alt, className }: { url: string; alt: string; className?: string }) {
  const resolved = useResolvedDocumentUrl(url);
  if (!resolved) return null;
  return <img src={resolved} alt={alt} className={className} />;
}

export function ResolvedStorageLink({
  url,
  className,
  children,
}: {
  url: string;
  className?: string;
  children: ReactNode;
}) {
  const resolved = useResolvedDocumentUrl(url);
  if (!resolved) return <span className={className}>{children}</span>;
  return (
    <a href={resolved} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  );
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
              <button
                key={`${url}-${i}`}
                type="button"
                onClick={() => setPreview({ url, fileName })}
                className="relative rounded-xl overflow-hidden aspect-square border border-border hover:ring-2 hover:ring-primary/40 transition-all"
              >
                <ResolvedStorageImg url={url} alt={fileName} className="w-full h-full object-cover" />
              </button>
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

