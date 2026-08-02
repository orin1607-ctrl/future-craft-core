import { useCallback, useEffect, useState } from 'react';
import { Check, FilePlus2, History, RefreshCw, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import RequestDocumentDialog from '@/components/documents/RequestDocumentDialog';
import AdminUploadDocumentDialog from '@/components/documents/AdminUploadDocumentDialog';
import {
  decideDocumentRequest,
  listEntityDocumentHistory,
  REQUEST_STATUS_LABELS,
  type DocumentEntityType,
  type DocumentRequestRow,
  type DocumentVersionRow,
} from '@/lib/documentRequestClient';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { toast } from 'sonner';

type Props = {
  entityType: DocumentEntityType;
  entityId: string;
  entityLabel: string;
  recipientName?: string;
  recipientPhone?: string;
  recipientEmail?: string;
  companyName?: string;
};

export default function EntityDocumentRequestsPanel({
  entityType,
  entityId,
  entityLabel,
  recipientName,
  recipientPhone,
  recipientEmail,
  companyName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<DocumentRequestRow[]>([]);
  const [versions, setVersions] = useState<DocumentVersionRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listEntityDocumentHistory(entityType, entityId);
      setRequests(data.requests);
      setVersions(data.versions);
    } catch {
      setRequests([]);
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onDecide = async (requestId: string, decision: 'approve' | 'reject') => {
    const note =
      decision === 'reject'
        ? window.prompt('סיבת הדחייה (תופיע בהיסטוריה):', '') || ''
        : window.prompt('הערת אישור (אופציונלי):', '') || '';
    if (decision === 'reject' && !note.trim()) {
      toast.error('חובה לציין סיבת דחייה');
      return;
    }
    setBusyId(requestId);
    try {
      await decideDocumentRequest({ request_id: requestId, decision, note });
      toast.success(decision === 'approve' ? 'המסמך אושר' : 'המסמך נדחה');
      await load();
      if (decision === 'reject') {
        toast.message('ניתן ללחוץ «בקש מסמך» לשליחה מחדש עם הערה');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שגיאה בעדכון סטטוס');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-6 pt-6 border-t border-border space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <History size={18} />
          בקשות מסמכים והיסטוריה
        </h2>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} />
            רענון
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setUploadOpen(true)}>
            <Upload size={14} />
            העלה מהמחשב
          </Button>
          <Button type="button" className="gap-1" onClick={() => setOpen(true)}>
            <FilePlus2 size={16} />
            בקש מסמך
          </Button>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">טוען…</p>}

      {!loading && requests.length === 0 && versions.length === 0 && (
        <p className="text-sm text-muted-foreground">אין בקשות או גרסאות מסמך עדיין</p>
      )}

      {requests.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">בקשות</p>
          {requests.slice(0, 10).map((r) => (
            <div key={r.id} className="rounded-xl border border-border p-3 text-sm space-y-2">
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <span className="font-bold">{r.document_type_key}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted">
                  {REQUEST_STATUS_LABELS[r.status] || r.status}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                נוצר: {format(new Date(r.created_at), 'dd/MM/yyyy HH:mm', { locale: he })}
                {r.requested_by_name ? ` · ע״י ${r.requested_by_name}` : ''}
                {r.channel ? ` · ערוץ: ${r.channel}` : ''}
              </p>
              <p className="text-xs text-muted-foreground">
                נשלח: {r.sent_at ? format(new Date(r.sent_at), 'dd/MM/yyyy HH:mm', { locale: he }) : '—'}
                {' · '}
                נפתח: {r.opened_at ? format(new Date(r.opened_at), 'dd/MM/yyyy HH:mm', { locale: he }) : '—'}
                {' · '}
                הועלה: {r.uploaded_at ? format(new Date(r.uploaded_at), 'dd/MM/yyyy HH:mm', { locale: he }) : '—'}
              </p>
              {['pending_approval', 'uploaded'].includes(r.status) && (
                <div className="flex gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1"
                    disabled={busyId === r.id}
                    onClick={() => void onDecide(r.id, 'approve')}
                  >
                    <Check size={14} />
                    אשר
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    disabled={busyId === r.id}
                    onClick={() => void onDecide(r.id, 'reject')}
                  >
                    <X size={14} />
                    דחה
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {versions.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">גרסאות מסמך (ללא מחיקה)</p>
          {versions.slice(0, 15).map((v) => (
            <div key={v.id} className="rounded-xl border border-border p-3 text-sm flex items-center justify-between gap-2">
              <div>
                <p className="font-medium">
                  {v.document_type_key} · v{v.version_no}
                  {v.is_current ? ' · עדכני' : ''}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(v.created_at), 'dd/MM/yyyy HH:mm', { locale: he })} · {v.original_name || 'קובץ'}
                </p>
              </div>
              {v.public_url && (
                <a
                  href={v.public_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary font-medium shrink-0"
                >
                  פתח
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      <AdminUploadDocumentDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        entityType={entityType}
        entityId={entityId}
        entityLabel={entityLabel}
        companyName={companyName}
        onUploaded={() => void load()}
      />

      <RequestDocumentDialog
        open={open}
        onOpenChange={setOpen}
        entityType={entityType}
        entityId={entityId}
        entityLabel={entityLabel}
        recipientName={recipientName}
        recipientPhone={recipientPhone}
        recipientEmail={recipientEmail}
        onCreated={() => void load()}
      />
    </div>
  );
}
