import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, FileText, FolderOpen, Search, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { uploadDocument, deleteStoredDocument } from '@/lib/uploadDocument';
import { DocumentCard, useDocumentPreview } from '@/components/documents/DocumentViewer';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const DRIVER_DOC_CATEGORIES = ['driver-license', 'health', 'contracts', 'other'] as const;
const FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,image/*,application/pdf';

interface DocRow {
  id: string;
  file_path: string;
  category: string;
  company_name: string | null;
  driver_name: string | null;
  original_name: string | null;
  display_name?: string | null;
  document_date?: string | null;
  created_at: string | null;
}

type Props = {
  driverId: string;
  driverName: string;
  companyName: string;
};

function docPublicUrl(filePath: string) {
  return supabase.storage.from('documents').getPublicUrl(filePath).data.publicUrl;
}

const CATEGORY_LABELS: Record<string, string> = {
  'driver-license': 'רישיון נהיגה',
  health: 'אישור בריאות',
  contracts: 'הסכם עבודה',
  other: 'אחר',
};

export default function DriverDocumentsPanel({ driverId, driverName, companyName }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [docName, setDocName] = useState('');
  const [docDate, setDocDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [docCategory, setDocCategory] = useState<string>('other');
  const [busyDeleteId, setBusyDeleteId] = useState<string | null>(null);
  const { PreviewDialog } = useDocumentPreview();

  const load = useCallback(async () => {
    if (!companyName || !driverName) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('document_metadata')
        .select('*')
        .eq('company_name', companyName)
        .eq('driver_name', driverName)
        .in('category', [...DRIVER_DOC_CATEGORIES])
        .order('created_at', { ascending: false });
      if (error) throw error;
      setDocs((data || []) as DocRow[]);
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [companyName, driverName]);

  useEffect(() => {
    void load();
  }, [load, driverId]);

  const filtered = docs.filter((d) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const label = (d.display_name || d.original_name || '').toLowerCase();
    const cat = (CATEGORY_LABELS[d.category] || d.category).toLowerCase();
    return label.includes(q) || cat.includes(q);
  });

  const uploadReady = docName.trim().length > 0 && !!docDate;

  const handleUpload = async (file: File) => {
    if (!docName.trim()) {
      toast.error('חובה להזין שם מסמך לפני העלאה');
      return;
    }
    if (!docDate) {
      toast.error('חובה להזין תאריך הכנסת מסמך');
      return;
    }

    setUploading(true);
    const folderMap: Record<string, string> = {
      'driver-license': 'driver-license',
      health: 'health',
      contracts: 'contracts',
      other: 'other',
    };
    const result = await uploadDocument({
      file,
      storageFolder: folderMap[docCategory] || 'other',
      category: docCategory,
      companyName,
      driverName,
      displayName: docName.trim(),
      documentDate: docDate,
    });
    setUploading(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    if (docCategory === 'driver-license') {
      await supabase.from('drivers').update({ license_image_url: result.publicUrl }).eq('id', driverId);
    }

    toast.success('המסמך הועלה ונשמר במערכת');
    setShowUpload(false);
    setDocName('');
    await load();
  };

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void handleUpload(file);
  };

  const handleDelete = async (doc: DocRow) => {
    if (!confirm(`למחוק את המסמך "${doc.display_name || doc.original_name || 'ללא שם'}"?`)) return;
    setBusyDeleteId(doc.id);
    const res = await deleteStoredDocument(doc.file_path, doc.id);
    setBusyDeleteId(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success('המסמך נמחק');
    await load();
  };

  return (
    <div className="mt-6 pt-6 border-t border-border space-y-4">
      {PreviewDialog}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <FileText size={18} />
            מסמכי נהג — העלאת קובץ
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            PDF · JPG · PNG · WEBP · HEIC מהמחשב, מהטלפון, מהגלריה או מהמצלמה
          </p>
        </div>
        <Button type="button" size="sm" className="gap-1" onClick={() => setShowUpload((v) => !v)}>
          <Upload size={14} />
          {showUpload ? 'סגור טופס' : 'העלה מסמך'}
        </Button>
      </div>

      {showUpload && (
        <div className="rounded-xl border-2 border-primary/30 p-4 space-y-4 bg-primary/5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>שם המסמך *</Label>
              <input
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                className="w-full p-3 rounded-xl border border-input bg-background text-sm"
                placeholder="לדוגמה: רישיון מעודכן"
              />
            </div>
            <div className="space-y-1">
              <Label>תאריך הכנסת מסמך *</Label>
              <input
                type="date"
                value={docDate}
                onChange={(e) => setDocDate(e.target.value)}
                className="w-full p-3 rounded-xl border border-input bg-background text-sm"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>סוג מסמך</Label>
            <select
              value={docCategory}
              onChange={(e) => setDocCategory(e.target.value)}
              className="w-full p-3 rounded-xl border border-input bg-background text-sm"
            >
              {DRIVER_DOC_CATEGORIES.map((k) => (
                <option key={k} value={k}>
                  {CATEGORY_LABELS[k]}
                </option>
              ))}
            </select>
          </div>

          {!uploadReady && (
            <p className="text-sm text-amber-700 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2">
              מלא שם מסמך ותאריך — ואז בחר קובץ להעלאה.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label
              className={`flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-sm transition-colors ${
                uploadReady && !uploading
                  ? 'bg-primary text-primary-foreground cursor-pointer hover:opacity-90'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              }`}
            >
              <FolderOpen size={18} />
              {uploading ? 'מעלה…' : 'בחר קובץ (PDF / תמונה)'}
              <input
                ref={fileRef}
                type="file"
                accept={FILE_ACCEPT}
                onChange={onFilePicked}
                disabled={!uploadReady || uploading}
                className="hidden"
              />
            </label>
            <label
              className={`flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-sm transition-colors ${
                uploadReady && !uploading
                  ? 'bg-primary/90 text-primary-foreground cursor-pointer hover:opacity-90'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              }`}
            >
              <Camera size={18} />
              {uploading ? 'מעלה…' : 'צלם / גלריה (מובייל)'}
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onFilePicked}
                disabled={!uploadReady || uploading}
                className="hidden"
              />
            </label>
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש מסמך לפי שם או סוג..."
          className="w-full pr-10 p-3 rounded-xl border border-input bg-background text-sm"
        />
      </div>

      {loading && <p className="text-sm text-muted-foreground">טוען מסמכים…</p>}
      {!loading && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">אין מסמכים בהיסטוריה — העלה קובץ באמצעות הכפתור למעלה</p>
      )}

      <div className="space-y-2">
        {filtered.map((d) => {
          const url = docPublicUrl(d.file_path);
          const title = d.display_name || d.original_name || 'מסמך';
          const dateStr = d.document_date
            ? format(new Date(d.document_date), 'dd/MM/yyyy', { locale: he })
            : d.created_at
              ? format(new Date(d.created_at), 'dd/MM/yyyy', { locale: he })
              : '—';
          return (
            <DocumentCard
              key={d.id}
              url={url}
              fileName={title}
              label={CATEGORY_LABELS[d.category] || d.category}
              meta={<span className="text-xs text-muted-foreground">{dateStr}</span>}
              compact
              onDelete={busyDeleteId === d.id ? undefined : () => void handleDelete(d)}
            />
          );
        })}
      </div>
    </div>
  );
}
