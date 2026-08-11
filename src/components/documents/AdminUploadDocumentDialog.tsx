import { useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
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
  adminUploadEntityDocument,
  listDocumentTypes,
  type DocumentEntityType,
  type DocumentTypeDef,
} from '@/lib/documentRequestClient';
import { computeExpiryFromValidity, formatIsraelDate } from '@/lib/driverDocumentExpiry';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: DocumentEntityType;
  entityId: string;
  entityLabel: string;
  companyName?: string;
  onUploaded?: () => void;
};

export default function AdminUploadDocumentDialog({
  open,
  onOpenChange,
  entityType,
  entityId,
  entityLabel,
  companyName,
  onUploaded,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [types, setTypes] = useState<DocumentTypeDef[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [docKey, setDocKey] = useState('');
  const [documentDate, setDocumentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [expiryDate, setExpiryDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setDocumentDate(new Date().toISOString().split('T')[0]);
    setExpiryDate('');
    if (fileRef.current) fileRef.current.value = '';
    setLoadingTypes(true);
    listDocumentTypes(entityType)
      .then((list) => {
        setTypes(list);
        setDocKey(list[0]?.key || '');
      })
      .catch((err) => toast.error(err.message || 'שגיאה בטעינת סוגי מסמך'))
      .finally(() => setLoadingTypes(false));
  }, [open, entityType]);

  const selected = types.find((t) => t.key === docKey);
  const autoExpiry =
    selected?.validity_years && documentDate
      ? computeExpiryFromValidity(documentDate, selected.validity_years)
      : null;

  useEffect(() => {
    if (autoExpiry) setExpiryDate(autoExpiry);
  }, [autoExpiry, docKey]);

  const submit = async () => {
    if (!docKey || !file) {
      toast.error('יש לבחור סוג מסמך וקובץ');
      return;
    }
    setSubmitting(true);
    try {
      await adminUploadEntityDocument({
        entityType,
        entityId,
        entityLabel,
        documentTypeKey: docKey,
        file,
        expiryDate: expiryDate || autoExpiry || undefined,
        documentDate,
        companyName,
      });
      toast.success('המסמך הועלה בהצלחה');
      onOpenChange(false);
      onUploaded?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שגיאה בהעלאה');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload size={18} />
            העלאת מסמך מהמחשב
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            העלאה ישירה עבור <strong>{entityLabel}</strong>. בקשת מסמך מהנהג (קישור לטלפון) נשארת זמינה בנפרד.
          </p>

          <div className="space-y-2">
            <Label>סוג מסמך</Label>
            <select
              value={docKey}
              onChange={(e) => setDocKey(e.target.value)}
              disabled={loadingTypes}
              className="w-full p-3 rounded-xl border border-input bg-background text-sm"
            >
              {types.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label_he}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>תאריך מסמך / הופק</Label>
            <input
              type="date"
              value={documentDate}
              onChange={(e) => setDocumentDate(e.target.value)}
              className="w-full p-3 rounded-xl border border-input bg-background text-sm"
            />
          </div>

          {(selected?.requires_expiry || selected?.validity_years) && (
            <div className="space-y-2">
              <Label>תאריך תוקף {selected?.validity_years ? `(אוטומטי: ${selected.validity_years} שנים)` : ''}</Label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full p-3 rounded-xl border border-input bg-background text-sm"
                readOnly={!!selected?.validity_years}
              />
              {autoExpiry && (
                <p className="text-xs text-muted-foreground">תוקף מחושב: {formatIsraelDate(autoExpiry)}</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>קובץ מהמחשב</Label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,image/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-sm"
            />
            <p className="text-xs text-muted-foreground">PDF · JPG · PNG · WEBP · HEIC (עד 10MB)</p>
            {file && <p className="text-xs font-medium">{file.name}</p>}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            ביטול
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={submitting || !file || !docKey}>
            {submitting ? 'מעלה…' : 'העלה מסמך'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
