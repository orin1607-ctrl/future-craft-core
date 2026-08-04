import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Search, Trash2, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { uploadDocument, deleteStoredDocument } from '@/lib/uploadDocument';
import { DocumentCard } from '@/components/documents/DocumentViewer';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const DRIVER_DOC_CATEGORIES = ['driver-license', 'health', 'contracts', 'other'] as const;

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

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!docName.trim()) {
      toast.error('חובה להזין שם מסמך');
      e.target.value = '';
      return;
    }
    if (!docDate) {
      toast.error('חובה להזין תאריך הכנסת מסמך');
      e.target.value = '';
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
    e.target.value = '';

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    if (docCategory === 'driver-license') {
      await supabase.from('drivers').update({ license_image_url: result.publicUrl }).eq('id', driverId);
    }

    toast.success('המסמך הועלה בהצלחה');
    setShowUpload(false);
    setDocName('');
    await load();
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
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <FileText size={18} />
          מסמכי נהג
        </h2>
        <Button type="button" size="sm" className="gap-1" onClick={() => setShowUpload((v) => !v)}>
          <Upload size={14} />
          העלאת מסמך
        </Button>
      </div>

      {showUpload && (
        <div className="rounded-xl border border-border p-4 space-y-3 bg-muted/20">
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
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,image/*,application/pdf"
              onChange={(e) => void handleUpload(e)}
              disabled={uploading}
              className="w-full text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">PDF · JPG · PNG (עד 10MB)</p>
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש מסמך..."
          className="w-full pr-10 p-3 rounded-xl border border-input bg-background text-sm"
        />
      </div>

      {loading && <p className="text-sm text-muted-foreground">טוען מסמכים…</p>}
      {!loading && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">אין מסמכים להצגה</p>
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
            <div key={d.id} className="flex items-center gap-2 rounded-xl border border-border p-2">
              <div className="flex-1 min-w-0">
                <DocumentCard url={url} fileName={title} compact />
                <p className="text-xs text-muted-foreground px-2">
                  {CATEGORY_LABELS[d.category] || d.category} · {dateStr}
                </p>
              </div>
              <button
                type="button"
                disabled={busyDeleteId === d.id}
                onClick={() => void handleDelete(d)}
                className="shrink-0 p-2 rounded-lg text-destructive hover:bg-destructive/10"
                title="מחק מסמך"
              >
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
