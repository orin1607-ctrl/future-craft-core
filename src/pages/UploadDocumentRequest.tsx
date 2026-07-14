import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, FileUp, Loader2 } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import {
  publicGetDocumentRequest,
  publicOpenDocumentRequest,
  publicUploadDocumentRequest,
  REQUEST_STATUS_LABELS,
} from '@/lib/documentRequestClient';

type RequestView = {
  id: string;
  status: string;
  document_type_key: string;
  document_type_label?: string;
  entity_type: string;
  entity_label: string;
  recipient_name: string;
  requires_expiry?: boolean;
  allowed_mime_types?: string[];
  max_file_bytes?: number;
  allow_multiple?: boolean;
  token_expires_at: string;
  opened_at?: string | null;
  uploaded_at?: string | null;
};

export default function UploadDocumentRequest() {
  const [params] = useSearchParams();
  const token = params.get('t') || params.get('token') || '';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [req, setReq] = useState<RequestView | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [expiry, setExpiry] = useState('');
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('קישור לא תקין');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        await publicOpenDocumentRequest(token);
        const data = await publicGetDocumentRequest(token);
        setReq(data);
        if (data.status === 'uploaded' || data.status === 'pending_approval' || data.status === 'approved') {
          if (!data.allow_multiple) setDone(true);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'שגיאה בטעינה');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const onUpload = async () => {
    if (!file || !token) return;
    if (req?.requires_expiry && !expiry) {
      toast.error('נא למלא תאריך תפוגה');
      return;
    }
    setUploading(true);
    try {
      await publicUploadDocumentRequest({ token, file, expiry_date: expiry || undefined });
      setDone(true);
      toast.success('המסמך הועלה בהצלחה');
      const data = await publicGetDocumentRequest(token);
      setReq(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'העלאה נכשלה');
    } finally {
      setUploading(false);
    }
  };

  const accept = (req?.allowed_mime_types || ['image/*', 'application/pdf'])
    .map((m) => (m.startsWith('image/') ? 'image/*' : m))
    .join(',');

  return (
    <div className="min-h-screen bg-background text-foreground p-4" dir="rtl">
      <Toaster position="top-center" richColors />
      <div className="max-w-md mx-auto space-y-4 pt-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">העלאת מסמך</h1>
          <p className="text-sm text-muted-foreground">מערכת דליה · קישור מאובטח אישי</p>
        </div>

        {loading && (
          <div className="flex justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="animate-spin" />
            טוען…
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-center">
            <p className="font-bold text-destructive">לא ניתן לפתוח את הקישור</p>
            <p className="text-sm mt-1 text-muted-foreground">{error}</p>
          </div>
        )}

        {req && !loading && (
          <div className="rounded-2xl border border-border p-4 space-y-4 shadow-sm">
            <div>
              <p className="text-xs text-muted-foreground">סוג מסמך</p>
              <p className="text-lg font-bold">{req.document_type_label || req.document_type_key}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">ישות</p>
                <p className="font-medium">{req.entity_label || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">סטטוס</p>
                <p className="font-medium">{REQUEST_STATUS_LABELS[req.status] || req.status}</p>
              </div>
            </div>

            {done ? (
              <div className="text-center py-6 space-y-2">
                <CheckCircle2 className="mx-auto text-green-600" size={40} />
                <p className="font-bold text-lg">המסמך התקבל</p>
                <p className="text-sm text-muted-foreground">
                  {req.status === 'pending_approval' ? 'ממתין לאישור מנהל' : 'נשמר במערכת'}
                </p>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  יש להעלות את המסמך כאן בלבד. אין לשלוח קבצים בתשובה להודעת WhatsApp.
                </p>
                {req.requires_expiry && (
                  <div>
                    <label className="text-sm font-medium">תאריך תפוגה</label>
                    <input
                      type="date"
                      value={expiry}
                      onChange={(e) => setExpiry(e.target.value)}
                      className="mt-1 w-full p-3 rounded-xl border-2 border-input bg-background"
                    />
                  </div>
                )}
                <div>
                  <label className="flex flex-col items-center justify-center gap-2 min-h-[140px] rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 cursor-pointer p-4">
                    <FileUp size={28} className="text-primary" />
                    <span className="font-medium">{file ? file.name : 'צלמו או בחרו קובץ'}</span>
                    <span className="text-xs text-muted-foreground">תמונה או PDF</span>
                    <input
                      type="file"
                      accept={accept.includes('image') ? 'image/*,application/pdf,.pdf' : accept}
                      capture="environment"
                      className="hidden"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  disabled={!file || uploading}
                  onClick={() => void onUpload()}
                  className={`w-full py-4 rounded-2xl text-lg font-bold ${
                    file && !uploading
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {uploading ? 'מעלה…' : 'העלה מסמך'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
