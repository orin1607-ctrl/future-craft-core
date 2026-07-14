import { useEffect, useState } from 'react';
import { Copy, FilePlus2, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  createDocumentRequest,
  listDocumentTypes,
  type DocumentEntityType,
  type DocumentTypeDef,
} from '@/lib/documentRequestClient';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: DocumentEntityType;
  entityId: string;
  entityLabel: string;
  recipientName?: string;
  recipientPhone?: string;
  recipientEmail?: string;
  onCreated?: () => void;
};

export default function RequestDocumentDialog({
  open,
  onOpenChange,
  entityType,
  entityId,
  entityLabel,
  recipientName = '',
  recipientPhone = '',
  recipientEmail = '',
  onCreated,
}: Props) {
  const [types, setTypes] = useState<DocumentTypeDef[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [docKey, setDocKey] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resultUrl, setResultUrl] = useState('');
  const [messagePreview, setMessagePreview] = useState('');

  useEffect(() => {
    if (!open) return;
    setResultUrl('');
    setMessagePreview('');
    setNotes('');
    setLoadingTypes(true);
    listDocumentTypes(entityType)
      .then((list) => {
        setTypes(list);
        setDocKey(list[0]?.key || '');
      })
      .catch((err) => toast.error(err.message || 'שגיאה בטעינת סוגי מסמך'))
      .finally(() => setLoadingTypes(false));
  }, [open, entityType]);

  const submit = async () => {
    if (!docKey) {
      toast.error('יש לבחור סוג מסמך');
      return;
    }
    setSubmitting(true);
    try {
      const res = await createDocumentRequest({
        document_type_key: docKey,
        entity_type: entityType,
        entity_id: entityId,
        entity_label: entityLabel,
        recipient_name: recipientName || entityLabel,
        recipient_phone: recipientPhone,
        recipient_email: recipientEmail,
        channel: 'link',
        notes,
      });
      setResultUrl(res.upload_url);
      setMessagePreview(res.message_preview);
      toast.success('הבקשה נוצרה — העתק/י את הקישור לנמען');
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שגיאה ביצירת בקשה');
    } finally {
      setSubmitting(false);
    }
  };

  const copyUrl = async () => {
    if (!resultUrl) return;
    await navigator.clipboard.writeText(resultUrl);
    toast.success('הקישור הועתק');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FilePlus2 size={18} />
            בקש מסמך
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            {entityType === 'driver' ? 'נהג' : entityType === 'vehicle' ? 'רכב' : 'ישות'}:{' '}
            <strong>{entityLabel}</strong>
          </p>

          {!resultUrl ? (
            <>
              <div>
                <Label htmlFor="doc-type">סוג המסמך</Label>
                <select
                  id="doc-type"
                  value={docKey}
                  onChange={(e) => setDocKey(e.target.value)}
                  disabled={loadingTypes}
                  className="mt-1 w-full p-3 rounded-xl border-2 border-input bg-background text-sm"
                >
                  {types.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label_he}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="doc-notes">הערות (אופציונלי)</Label>
                <textarea
                  id="doc-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="mt-1 w-full p-3 rounded-xl border-2 border-input bg-background text-sm resize-none"
                />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                ייווצר קישור אישי ומאובטח להעלאה. בשלב A השליחה היא דרך העתקת הקישור.
                WhatsApp יחובר בשלב B — בלי קבלת קבצים בצ׳אט.
              </p>
            </>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Link2 size={12} /> קישור העלאה
                </p>
                <p className="text-xs break-all font-mono" dir="ltr">
                  {resultUrl}
                </p>
              </div>
              {messagePreview && (
                <div className="rounded-xl border border-border p-3 whitespace-pre-wrap text-xs">
                  {messagePreview}
                </div>
              )}
              <Button type="button" variant="outline" className="w-full gap-2" onClick={copyUrl}>
                <Copy size={16} />
                העתק קישור
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {resultUrl ? 'סגור' : 'ביטול'}
          </Button>
          {!resultUrl && (
            <Button type="button" onClick={submit} disabled={submitting || loadingTypes || !docKey}>
              {submitting ? 'יוצר…' : 'צור קישור'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
