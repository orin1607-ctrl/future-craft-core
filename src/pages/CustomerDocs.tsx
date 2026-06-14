import { useState, useEffect } from 'react';
import { FileText, Upload, Search, Building2 } from 'lucide-react';
import { DocumentCard } from '@/components/documents/DocumentViewer';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter, applyCompanyScope } from '@/hooks/useCompanyFilter';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { buildStoragePath } from '@/lib/storage';

interface DocMetadata {
  id: string;
  file_path: string;
  original_name: string;
  category: string;
  vehicle_plate: string;
  driver_name: string;
  company_name: string;
  manufacturer: string;
  model: string;
  created_at: string;
}

const CATEGORIES = [
  { value: '', label: 'הכל' },
  { value: 'agreement', label: 'הסכם' },
  { value: 'invoice', label: 'חשבונית' },
  { value: 'insurance', label: 'ביטוח' },
  { value: 'license', label: 'רישיון' },
  { value: 'test', label: 'טסט' },
  { value: 'report', label: 'דוח' },
  { value: 'other', label: 'אחר' },
];

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(CATEGORIES.filter(c => c.value).map(c => [c.value, c.label]));

export default function CustomerDocs() {
  const { user } = useAuth();
  const companyFilter = useCompanyFilter();
  const [docs, setDocs] = useState<DocMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [uploading, setUploading] = useState(false);

  // Upload form
  const [showUpload, setShowUpload] = useState(false);
  const [uploadCategory, setUploadCategory] = useState('other');
  const [uploadVehicle, setUploadVehicle] = useState('');
  const [uploadDriver, setUploadDriver] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const isManager = user?.role === 'fleet_manager' || user?.role === 'super_admin';

  useEffect(() => {
    loadDocs();
  }, [companyFilter]);

  const loadDocs = async () => {
    setLoading(true);
    const { data } = await applyCompanyScope(
      supabase.from('document_metadata').select('*').order('created_at', { ascending: false }),
      companyFilter
    );
    if (data) setDocs(data as DocMetadata[]);
    setLoading(false);
  };

  const handleUpload = async (e?: React.MouseEvent) => {
    if (!uploadFile || !user?.id) return;
    setUploading(true);

    const filePath = buildStoragePath(user.id, uploadCategory || 'other', uploadFile.name);

    const { error: storageError } = await supabase.storage
      .from('documents')
      .upload(filePath, uploadFile, {
        cacheControl: '3600',
        upsert: false,
        contentType: uploadFile.type || undefined,
      });

    if (storageError) {
      toast.error('שגיאה בהעלאת הקובץ: ' + storageError.message);
      setUploading(false);
      return;
    }

    const { error: metaError } = await supabase.from('document_metadata').insert({
      file_path: filePath,
      original_name: uploadFile.name,
      category: uploadCategory,
      vehicle_plate: uploadVehicle,
      driver_name: uploadDriver,
      company_name: user.company_name,
      uploaded_by: user.id,
    });

    if (metaError) {
      toast.error('שגיאה בשמירת המסמך');
    } else {
      toast.success('המסמך הועלה בהצלחה');
      setShowUpload(false);
      setUploadFile(null);
      setUploadVehicle('');
      setUploadDriver('');
      loadDocs();
    }
    setUploading(false);
  };

  const handleDelete = async (doc: DocMetadata) => {
    if (!confirm(`למחוק את ${doc.original_name}?`)) return;

    await supabase.storage.from('documents').remove([doc.file_path]);
    await supabase.from('document_metadata').delete().eq('id', doc.id);
    toast.success('המסמך נמחק');
    loadDocs();
  };

  const docPublicUrl = (filePath: string) =>
    supabase.storage.from('documents').getPublicUrl(filePath).data.publicUrl;

  const filtered = docs.filter(d => {
    if (filterCategory && d.category !== filterCategory) return false;
    if (search && !d.original_name?.includes(search) && !d.vehicle_plate?.includes(search) && !d.driver_name?.includes(search)) return false;
    return true;
  });

  const selectClass = "w-full p-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none";

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="page-header flex items-center gap-3 !mb-0"><FileText size={28} /> מסמכי לקוח</h1>
        {isManager && (
          <button onClick={() => setShowUpload(!showUpload)}
            className="flex items-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm">
            <Upload size={18} /> העלאת מסמך
          </button>
        )}
      </div>

      {/* Upload Form */}
      {showUpload && (
        <div className="card-elevated space-y-4 border-2 border-primary/30">
          <h3 className="font-bold text-lg">העלאת מסמך חדש</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">קטגוריה</label>
              <select value={uploadCategory} onChange={e => setUploadCategory(e.target.value)} className={selectClass}>
                {CATEGORIES.filter(c => c.value).map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">מספר רכב (אופציונלי)</label>
              <input value={uploadVehicle} onChange={e => setUploadVehicle(e.target.value)} placeholder="12-345-67" className={selectClass} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">שם נהג (אופציונלי)</label>
              <input value={uploadDriver} onChange={e => setUploadDriver(e.target.value)} placeholder="שם הנהג" className={selectClass} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">קובץ</label>
              <input type="file" onChange={e => setUploadFile(e.target.files?.[0] || null)}
                className={selectClass} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleUpload} disabled={!uploadFile || uploading}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-50">
              {uploading ? 'מעלה...' : 'העלה'}
            </button>
            <button onClick={() => setShowUpload(false)}
              className="px-4 py-3 rounded-xl bg-muted text-muted-foreground font-bold text-sm">
              ביטול
            </button>
          </div>
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..."
            className="w-full pr-12 p-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none" />
        </div>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className={`${selectClass} w-auto`}>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {/* Stats */}
      <div className="flex gap-2 text-sm text-muted-foreground">
        <span>{filtered.length} מסמכים</span>
        {filterCategory && <span>• סינון: {CATEGORY_LABELS[filterCategory]}</span>}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="card-elevated text-center py-12">
          <FileText size={48} className="mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-xl text-muted-foreground">אין מסמכים</p>
          <p className="text-sm text-muted-foreground mt-1">העלה מסמכים באמצעות הכפתור למעלה</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(doc => (
            <DocumentCard
              key={doc.id}
              url={docPublicUrl(doc.file_path)}
              fileName={doc.original_name || undefined}
              label={CATEGORY_LABELS[doc.category] || doc.category}
              meta={(
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  {doc.company_name && <span className="flex items-center gap-1"><Building2 size={12} /> {doc.company_name}</span>}
                  {doc.vehicle_plate && <span>🚗 {doc.vehicle_plate}</span>}
                  {doc.driver_name && <span>👤 {doc.driver_name}</span>}
                  <span>{format(new Date(doc.created_at), 'dd/MM/yyyy', { locale: he })}</span>
                </div>
              )}
              onDelete={isManager ? () => handleDelete(doc) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
