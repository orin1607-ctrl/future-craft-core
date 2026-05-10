import { useState, useEffect, useCallback } from 'react';
import { FileText, Search, Upload, Download, Trash2, Eye, FolderOpen, File, Image, FileSpreadsheet, Filter, ArrowRight, Car, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { buildStoragePath } from '@/lib/storage';

interface DocCategory {
  key: string;
  label: string;
  icon: string;
  folder: string;
  scope: 'vehicle' | 'driver' | 'expense';
}

const vehicleDocs: DocCategory[] = [
  { key: 'vehicle-license', label: 'רישיונות רכב', icon: '🚗', folder: 'vehicle-license', scope: 'vehicle' },
  { key: 'insurance', label: 'ביטוח חובה', icon: '🛡️', folder: 'insurance', scope: 'vehicle' },
  { key: 'comprehensive', label: 'ביטוח מקיף', icon: '📋', folder: 'comprehensive', scope: 'vehicle' },
  { key: 'test', label: 'טסט', icon: '✅', folder: 'test', scope: 'vehicle' },
];

const driverDocs: DocCategory[] = [
  { key: 'driver-license', label: 'רישיונות נהיגה', icon: '🪪', folder: 'driver-license', scope: 'driver' },
  { key: 'health', label: 'אישורי בריאות', icon: '🏥', folder: 'health', scope: 'driver' },
  { key: 'contracts', label: 'הסכמי עבודה', icon: '📝', folder: 'contracts', scope: 'driver' },
  { key: 'other', label: 'אחר', icon: '📎', folder: 'other', scope: 'driver' },
];

const expenseDocs: DocCategory[] = [
  { key: 'fuel', label: 'חשבוניות דלק', icon: '⛽', folder: 'fuel', scope: 'expense' },
  { key: 'maintenance', label: 'חשבוניות תחזוקה', icon: '🔧', folder: 'maintenance', scope: 'expense' },
  { key: 'vendors', label: 'חשבוניות ספקים', icon: '🏪', folder: 'vendors', scope: 'expense' },
  { key: 'receipts', label: 'קבלות', icon: '🧾', folder: 'receipts', scope: 'expense' },
];

const allCategories = [...vehicleDocs, ...driverDocs, ...expenseDocs];

interface DocMeta {
  id: string;
  file_path: string;
  category: string;
  company_name: string;
  vehicle_plate: string;
  driver_name: string;
  manufacturer: string;
  model: string;
  original_name: string;
  created_at: string;
  source?: 'metadata' | 'vehicle' | 'driver' | 'health' | 'expense';
  source_table?: string;
  source_id?: string;
  source_field?: string;
}

// Aggregate docs that live as URL columns on other tables (vehicles/drivers/expenses/health)
async function fetchAggregatedDocs(companyFilter: string | null): Promise<DocMeta[]> {
  const out: DocMeta[] = [];

  // Vehicles
  let vq = supabase.from('vehicles').select('id, license_plate, manufacturer, model, company_name, license_doc_url, insurance_doc_url, comprehensive_insurance_doc_url, third_party_insurance_doc_url, updated_at');
  if (companyFilter) vq = vq.eq('company_name', companyFilter);
  const { data: vehicles } = await vq;
  vehicles?.forEach((v: any) => {
    const base = { company_name: v.company_name || '', vehicle_plate: v.license_plate || '', manufacturer: v.manufacturer || '', model: v.model || '', driver_name: '', created_at: v.updated_at, source: 'vehicle' as const, source_table: 'vehicles', source_id: v.id };
    if (v.license_doc_url) out.push({ ...base, id: `v-lic-${v.id}`, file_path: v.license_doc_url, category: 'vehicle-license', original_name: `רישיון רכב ${v.license_plate || ''}`, source_field: 'license_doc_url' });
    if (v.insurance_doc_url) out.push({ ...base, id: `v-ins-${v.id}`, file_path: v.insurance_doc_url, category: 'insurance', original_name: `ביטוח חובה ${v.license_plate || ''}`, source_field: 'insurance_doc_url' });
    if (v.comprehensive_insurance_doc_url) out.push({ ...base, id: `v-comp-${v.id}`, file_path: v.comprehensive_insurance_doc_url, category: 'comprehensive', original_name: `ביטוח מקיף ${v.license_plate || ''}`, source_field: 'comprehensive_insurance_doc_url' });
    if (v.third_party_insurance_doc_url) out.push({ ...base, id: `v-tp-${v.id}`, file_path: v.third_party_insurance_doc_url, category: 'comprehensive', original_name: `ביטוח צד ג' ${v.license_plate || ''}`, source_field: 'third_party_insurance_doc_url' });
  });

  // Drivers
  let dq = supabase.from('drivers').select('id, full_name, company_name, license_image_url, updated_at');
  if (companyFilter) dq = dq.eq('company_name', companyFilter);
  const { data: drivers } = await dq;
  drivers?.forEach((d: any) => {
    if (d.license_image_url) out.push({ id: `d-lic-${d.id}`, file_path: d.license_image_url, category: 'driver-license', company_name: d.company_name || '', vehicle_plate: '', driver_name: d.full_name || '', manufacturer: '', model: '', original_name: `רישיון נהיגה ${d.full_name || ''}`, created_at: d.updated_at, source: 'driver', source_table: 'drivers', source_id: d.id, source_field: 'license_image_url' });
  });

  // Health declarations
  let hq = supabase.from('driver_health_declarations').select('id, driver_name, company_name, license_image_url, created_at');
  if (companyFilter) hq = hq.eq('company_name', companyFilter);
  const { data: health } = await hq;
  health?.forEach((h: any) => {
    if (h.license_image_url) out.push({ id: `h-${h.id}`, file_path: h.license_image_url, category: 'health', company_name: h.company_name || '', vehicle_plate: '', driver_name: h.driver_name || '', manufacturer: '', model: '', original_name: `הצהרת בריאות ${h.driver_name || ''}`, created_at: h.created_at, source: 'health', source_table: 'driver_health_declarations', source_id: h.id, source_field: 'license_image_url' });
  });

  // Expenses
  let eq2 = supabase.from('expenses').select('id, category, vehicle_plate, driver_name, company_name, image_url, created_at');
  if (companyFilter) eq2 = eq2.eq('company_name', companyFilter);
  const { data: expenses } = await eq2;
  expenses?.forEach((e: any) => {
    if (!e.image_url) return;
    const cat = (e.category || '').toString();
    let key: string = 'receipts';
    if (cat.includes('דלק')) key = 'fuel';
    else if (cat.includes('תיקון') || cat.includes('שמן') || cat.includes('צמיג')) key = 'maintenance';
    else if (cat.includes('ספק')) key = 'vendors';
    out.push({ id: `e-${e.id}`, file_path: e.image_url, category: key, company_name: e.company_name || '', vehicle_plate: e.vehicle_plate || '', driver_name: e.driver_name || '', manufacturer: '', model: '', original_name: `${cat || 'קבלה'} ${e.vehicle_plate || ''}`.trim(), created_at: e.created_at, source: 'expense', source_table: 'expenses', source_id: e.id, source_field: 'image_url' });
  });

  return out;
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext || '')) return <Image size={20} className="text-info" />;
  if (['pdf'].includes(ext || '')) return <FileText size={20} className="text-destructive" />;
  if (['xls', 'xlsx', 'csv'].includes(ext || '')) return <FileSpreadsheet size={20} className="text-success" />;
  return <File size={20} className="text-muted-foreground" />;
}

function formatSize(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Documents() {
  const { user } = useAuth();
  const companyFilter = useCompanyFilter();
  const isManager = user?.role === 'fleet_manager' || user?.role === 'super_admin';
  const isDriver = user?.role === 'driver';
  const companyName = user?.company_name || '';

  const [selectedCategory, setSelectedCategory] = useState<DocCategory | null>(null);
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Filter states (manager only)
  const [filterVehicle, setFilterVehicle] = useState('');
  const [filterDriver, setFilterDriver] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterManufacturer, setFilterManufacturer] = useState('');
  const [filterModel, setFilterModel] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Upload form fields
  const [uploadVehicle, setUploadVehicle] = useState('');
  const [uploadDriver, setUploadDriver] = useState('');
  const [uploadManufacturer, setUploadManufacturer] = useState('');
  const [uploadModel, setUploadModel] = useState('');
  const [showUploadForm, setShowUploadForm] = useState(false);

  // Driver's assigned vehicle
  const [driverVehicle, setDriverVehicle] = useState<{ license_plate: string; manufacturer: string; model: string } | null>(null);
  const [driverProfile, setDriverProfile] = useState<{ full_name: string } | null>(null);

  // Load driver's vehicle
  useEffect(() => {
    if (!isDriver || !user?.id) return;
    const loadDriverData = async () => {
      const { data: vehicle } = await supabase
        .from('vehicles')
        .select('license_plate, manufacturer, model')
        .eq('assigned_driver_id', user.id)
        .maybeSingle();
      if (vehicle) setDriverVehicle(vehicle);

      const { data: driver } = await supabase
        .from('drivers')
        .select('full_name')
        .eq('email', user.email)
        .maybeSingle();
      if (driver) setDriverProfile(driver);
    };
    loadDriverData();
  }, [isDriver, user?.id, user?.email]);

  // Load category counts (metadata + aggregated sources)
  const loadCounts = useCallback(async () => {
    let query = supabase.from('document_metadata').select('category');
    if (companyFilter) query = query.eq('company_name', companyFilter);
    if (isDriver && driverVehicle) {
      query = query.or(`vehicle_plate.eq.${driverVehicle.license_plate},driver_name.eq.${driverProfile?.full_name || ''}`);
    }
    const { data } = await query;
    const counts: Record<string, number> = {};
    allCategories.forEach(c => { counts[c.key] = 0; });
    data?.forEach(d => { if (counts[d.category] !== undefined) counts[d.category]++; });

    const aggregated = await fetchAggregatedDocs(companyFilter || null);
    aggregated.forEach(d => {
      if (counts[d.category] === undefined) return;
      if (isDriver) {
        const cat = allCategories.find(c => c.key === d.category);
        if (!cat) return;
        if (cat.scope === 'vehicle' && d.vehicle_plate !== driverVehicle?.license_plate) return;
        if (cat.scope === 'driver' && d.driver_name !== driverProfile?.full_name) return;
        if (cat.scope === 'expense') return;
      }
      counts[d.category]++;
    });
    setCategoryCounts(counts);
  }, [companyFilter, isDriver, driverVehicle, driverProfile]);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  // Load docs for category (metadata + aggregated)
  const loadDocs = useCallback(async (cat: DocCategory) => {
    setLoadingFiles(true);
    let query = supabase.from('document_metadata').select('*').eq('category', cat.key).order('created_at', { ascending: false });
    if (companyFilter) query = query.eq('company_name', companyFilter);

    if (isDriver) {
      if (cat.scope === 'vehicle' && driverVehicle) query = query.eq('vehicle_plate', driverVehicle.license_plate);
      else if (cat.scope === 'driver' && driverProfile) query = query.eq('driver_name', driverProfile.full_name);
      else if (cat.scope === 'expense') { setDocs([]); setLoadingFiles(false); return; }
    }

    const { data, error } = await query;
    if (error) toast.error('שגיאה בטעינת מסמכים');
    const metadataDocs = ((data || []) as any[]).map(d => ({ ...d, source: 'metadata' as const })) as DocMeta[];

    const aggregated = (await fetchAggregatedDocs(companyFilter || null)).filter(d => d.category === cat.key);
    let aggFiltered = aggregated;
    if (isDriver) {
      if (cat.scope === 'vehicle' && driverVehicle) aggFiltered = aggregated.filter(d => d.vehicle_plate === driverVehicle.license_plate);
      else if (cat.scope === 'driver' && driverProfile) aggFiltered = aggregated.filter(d => d.driver_name === driverProfile.full_name);
      else if (cat.scope === 'expense') aggFiltered = [];
    }

    const merged = [...metadataDocs, ...aggFiltered].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    setDocs(merged);
    setLoadingFiles(false);
  }, [companyFilter, isDriver, driverVehicle, driverProfile]);

  const openCategory = (cat: DocCategory) => {
    setSelectedCategory(cat);
    setSearchQuery('');
    setShowFilters(false);
    loadDocs(cat);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length || !selectedCategory || !companyName || !user?.id) return;
    setUploading(true);
    const file = e.target.files[0];
    const path = buildStoragePath(user.id, selectedCategory.folder, file.name);

    const { error } = await supabase.storage.from('documents').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    });
    if (error) {
      toast.error('שגיאה בהעלאת הקובץ: ' + error.message);
      setUploading(false);
      e.target.value = '';
      return;
    }

    // Save metadata
    const { error: metaError } = await supabase.from('document_metadata').insert({
      file_path: path,
      category: selectedCategory.key,
      company_name: companyName,
      vehicle_plate: uploadVehicle,
      driver_name: uploadDriver,
      manufacturer: uploadManufacturer,
      model: uploadModel,
      original_name: file.name,
      uploaded_by: user?.id,
    } as any);

    if (metaError) console.error('Meta save error:', metaError);

    toast.success('הקובץ הועלה בהצלחה');
    loadDocs(selectedCategory);
    loadCounts();
    setUploading(false);
    setShowUploadForm(false);
    setUploadVehicle('');
    setUploadDriver('');
    setUploadManufacturer('');
    setUploadModel('');
    e.target.value = '';
  };

  const resolveUrl = (doc: DocMeta) => {
    if (/^https?:\/\//i.test(doc.file_path)) return doc.file_path;
    const { data } = supabase.storage.from('documents').getPublicUrl(doc.file_path);
    return data.publicUrl;
  };

  const handleDelete = async (doc: DocMeta) => {
    if (!confirm('למחוק מסמך זה?')) return;
    if (doc.source && doc.source !== 'metadata') {
      // Aggregated doc — clear the URL on the source row instead of deleting from storage
      if (doc.source_table && doc.source_id && doc.source_field) {
        const { error } = await supabase.from(doc.source_table as any).update({ [doc.source_field]: null }).eq('id', doc.source_id);
        if (error) { toast.error('שגיאה במחיקה'); return; }
        toast.success('נמחק');
        if (selectedCategory) { loadDocs(selectedCategory); loadCounts(); }
      }
      return;
    }
    const { error: storageErr } = await supabase.storage.from('documents').remove([doc.file_path]);
    if (storageErr) { toast.error('שגיאה במחיקה'); return; }
    await supabase.from('document_metadata').delete().eq('id', doc.id);
    toast.success('נמחק');
    if (selectedCategory) { loadDocs(selectedCategory); loadCounts(); }
  };

  const handleDownload = (doc: DocMeta) => {
    window.open(resolveUrl(doc), '_blank');
  };

  const handlePreview = (doc: DocMeta) => {
    setPreviewUrl(resolveUrl(doc));
  };

  // Apply filters
  let filteredDocs = docs.filter(d =>
    !searchQuery || d.original_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  if (isManager && filterVehicle) filteredDocs = filteredDocs.filter(d => d.vehicle_plate?.includes(filterVehicle));
  if (isManager && filterDriver) filteredDocs = filteredDocs.filter(d => d.original_name?.toLowerCase().includes(filterDriver.toLowerCase()) || d.category?.toLowerCase().includes(filterDriver.toLowerCase()));
  if (isManager && filterCompany) filteredDocs = filteredDocs.filter(d => d.company_name?.includes(filterCompany));
  if (isManager && filterManufacturer) filteredDocs = filteredDocs.filter(d => d.manufacturer?.includes(filterManufacturer));
  if (isManager && filterModel) filteredDocs = filteredDocs.filter(d => d.model?.includes(filterModel));

  const activeFilterCount = [filterVehicle, filterDriver, filterCompany, filterManufacturer, filterModel].filter(Boolean).length;

  // Driver only sees vehicle + driver docs
  const visibleVehicleDocs = vehicleDocs;
  const visibleDriverDocs = driverDocs;

  // Category list view
  if (!selectedCategory) {
    return (
      <div className="animate-fade-in">
        <h1 className="page-header flex items-center gap-3"><FileText size={28} /> מסמכים</h1>

        <CategorySection title="מסמכי רכב" description="טסט, ביטוח, רישיון רכב" categories={visibleVehicleDocs} counts={categoryCounts} onOpen={openCategory} icon={<Car size={20} className="text-primary" />} />
        <CategorySection title="מסמכי נהגים" description="רישיונות נהיגה, תעודות, אישורים" categories={visibleDriverDocs} counts={categoryCounts} onOpen={openCategory} icon={<User size={20} className="text-primary" />} />
        {!isDriver && (
          <CategorySection title="חשבוניות והוצאות" description="חשבוניות דלק, תחזוקה וספקים" categories={expenseDocs} counts={categoryCounts} onOpen={openCategory} />
        )}

        {isDriver && driverVehicle && (
          <div className="card-elevated mt-4 p-4">
            <p className="text-sm text-muted-foreground">הרכב המשויך אליך</p>
            <p className="font-bold text-lg">{driverVehicle.license_plate} • {driverVehicle.manufacturer} {driverVehicle.model}</p>
          </div>
        )}
      </div>
    );
  }

  const inputClass = "w-full p-3 text-base rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none";

  // Files list view
  return (
    <div className="animate-fade-in">
      <button onClick={() => { setSelectedCategory(null); setDocs([]); setShowFilters(false); }} className="flex items-center gap-2 text-primary text-lg font-medium mb-4 min-h-[48px]">
        <ArrowRight size={20} /> חזרה למסמכים
      </button>

      <div className="flex items-center gap-3 mb-4">
        <span className="text-3xl">{selectedCategory.icon}</span>
        <div>
          <h1 className="text-2xl font-bold">{selectedCategory.label}</h1>
          <p className="text-sm text-muted-foreground">{filteredDocs.length} מסמכים</p>
        </div>
      </div>

      {/* Search & Actions */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="חיפוש מסמך..." className="w-full pr-10 p-3 rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none text-lg" />
        </div>
        {isManager && (
          <button onClick={() => setShowFilters(!showFilters)} className={`relative flex items-center gap-1 px-3 py-3 rounded-xl border-2 font-bold transition-colors ${showFilters ? 'border-primary bg-primary/10 text-primary' : 'border-input text-foreground'}`}>
            <Filter size={18} />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">{activeFilterCount}</span>
            )}
          </button>
        )}
        {isManager && (
          <button onClick={() => setShowUploadForm(!showUploadForm)} className="flex items-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 active:scale-95 transition-transform">
            <Upload size={20} />
            <span className="hidden sm:inline">העלאה</span>
          </button>
        )}
      </div>

      {/* Manager Filters */}
      {isManager && showFilters && (
        <div className="card-elevated mb-4 space-y-3">
          <h3 className="font-bold text-sm text-muted-foreground">סינון מסמכים</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">מספר רכב</label>
              <input value={filterVehicle} onChange={e => setFilterVehicle(e.target.value)} className={inputClass} placeholder="חיפוש לפי לוחית..." />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">סוג המסמך</label>
              <input value={filterDriver} onChange={e => setFilterDriver(e.target.value)} className={inputClass} placeholder="סוג מסמך..." />
            </div>
            {user?.role === 'super_admin' && (
              <div>
                <label className="block text-sm font-medium mb-1">שם חברה</label>
                <input value={filterCompany} onChange={e => setFilterCompany(e.target.value)} className={inputClass} placeholder="חברה..." />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">{selectedCategory?.key === 'other' ? 'תאריך כולל שנה' : 'יצרן'}</label>
              <input value={filterManufacturer} onChange={e => setFilterManufacturer(e.target.value)} className={inputClass} placeholder={selectedCategory?.key === 'other' ? 'dd/mm/yyyy' : 'יצרן...'} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{selectedCategory?.key === 'other' ? 'הערות' : 'דגם'}</label>
              <input value={filterModel} onChange={e => setFilterModel(e.target.value)} className={inputClass} placeholder={selectedCategory?.key === 'other' ? 'הערות...' : 'דגם...'} />
            </div>
          </div>
          {activeFilterCount > 0 && (
            <button onClick={() => { setFilterVehicle(''); setFilterDriver(''); setFilterCompany(''); setFilterManufacturer(''); setFilterModel(''); }} className="text-sm text-primary font-medium">
              ✕ נקה סינון
            </button>
          )}
        </div>
      )}

      {/* Upload Form */}
      {isManager && showUploadForm && (
        <div className="card-elevated mb-4 space-y-3">
          <h3 className="font-bold">העלאת מסמך חדש</h3>
          <p className="text-sm text-muted-foreground">מלא פרטים לשיוך המסמך (אופציונלי)</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">מספר רכב</label>
              <input value={uploadVehicle} onChange={e => setUploadVehicle(e.target.value)} className={inputClass} placeholder="לוחית רישוי" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{selectedCategory?.key === 'other' ? 'סוג המסמך' : 'שם נהג'}</label>
              <input value={uploadDriver} onChange={e => setUploadDriver(e.target.value)} className={inputClass} placeholder={selectedCategory?.key === 'other' ? 'סוג מסמך' : 'שם הנהג'} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{selectedCategory?.key === 'other' ? 'תאריך כולל שנה' : 'יצרן'}</label>
              <input value={uploadManufacturer} onChange={e => setUploadManufacturer(e.target.value)} className={inputClass} placeholder={selectedCategory?.key === 'other' ? 'dd/mm/yyyy' : 'יצרן'} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{selectedCategory?.key === 'other' ? 'הערות' : 'דגם'}</label>
              <input value={uploadModel} onChange={e => setUploadModel(e.target.value)} className={inputClass} placeholder={selectedCategory?.key === 'other' ? 'הערות' : 'דגם'} />
            </div>
          </div>
          <label className={`inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-bold cursor-pointer hover:bg-primary/90 active:scale-95 transition-transform ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            <Upload size={18} />
            {uploading ? 'מעלה...' : 'בחר קובץ והעלה'}
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv" />
          </label>
        </div>
      )}

      {/* Files */}
      {loadingFiles ? (
        <div className="text-center py-12 text-muted-foreground">טוען מסמכים...</div>
      ) : filteredDocs.length === 0 ? (
        <div className="text-center py-12">
          <FolderOpen size={48} className="mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground text-lg">אין מסמכים בקטגוריה זו</p>
          {isManager && <p className="text-sm text-muted-foreground mt-1">לחץ על "העלאה" כדי להוסיף מסמך</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredDocs.map(doc => {
            const nameExt = doc.original_name?.split('.').pop()?.toLowerCase() || '';
            const pathLower = (doc.file_path || '').toLowerCase();
            const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(nameExt) || /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(pathLower);
            const isPdf = nameExt === 'pdf' || /\.pdf(\?|$)/i.test(pathLower);

            return (
              <div key={doc.id} className="card-elevated flex items-center gap-3 p-3">
                {getFileIcon(doc.original_name || doc.file_path)}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate text-sm">{doc.original_name || doc.file_path.split('/').pop()}</p>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mt-0.5">
                    {doc.vehicle_plate && <span className="bg-muted px-1.5 py-0.5 rounded">🚗 {doc.vehicle_plate}</span>}
                    {doc.driver_name && <span className="bg-muted px-1.5 py-0.5 rounded">👤 {doc.driver_name}</span>}
                    {doc.manufacturer && <span className="bg-muted px-1.5 py-0.5 rounded">{doc.manufacturer} {doc.model}</span>}
                    {doc.created_at && <span>{new Date(doc.created_at).toLocaleDateString('he-IL')}</span>}
                  </div>
                </div>
                <div className="flex gap-1">
                  {(isImage || isPdf) && (
                    <button onClick={() => handlePreview(doc)} className="p-2 rounded-lg hover:bg-muted transition-colors" title="תצוגה מקדימה">
                      <Eye size={18} className="text-info" />
                    </button>
                  )}
                  <button onClick={() => handleDownload(doc)} className="p-2 rounded-lg hover:bg-muted transition-colors" title="הורדה">
                    <Download size={18} className="text-primary" />
                  </button>
                  {isManager && (
                    <button onClick={() => handleDelete(doc)} className="p-2 rounded-lg hover:bg-destructive/10 transition-colors" title="מחיקה">
                      <Trash2 size={18} className="text-destructive" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={(open) => { if (!open) setPreviewUrl(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle>תצוגה מקדימה</DialogTitle>
            <DialogDescription className="sr-only">תצוגה מקדימה של מסמך</DialogDescription>
          </DialogHeader>
          {previewUrl && (
            previewUrl.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i) ? (
              <img src={previewUrl} alt="תצוגה מקדימה" className="w-full max-h-[75vh] object-contain p-4" />
            ) : (
              <iframe src={previewUrl} className="w-full h-[75vh]" title="תצוגה מקדימה" />
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategorySection({ title, description, categories, counts, onOpen, icon }: {
  title: string;
  description: string;
  categories: DocCategory[];
  counts: Record<string, number>;
  onOpen: (cat: DocCategory) => void;
  icon?: React.ReactNode;
}) {
  return (
    <div className="card-elevated mb-4">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <h2 className="text-lg font-bold">{title}</h2>
      </div>
      <p className="text-muted-foreground mb-4 text-sm">{description}</p>
      <div className="grid grid-cols-2 gap-3">
        {categories.map(cat => (
          <button
            key={cat.key}
            onClick={() => onOpen(cat)}
            className="p-4 rounded-xl bg-muted/50 border border-border flex items-center gap-3 hover:bg-muted hover:border-primary/30 transition-colors text-right active:scale-[0.98]"
          >
            <span className="text-2xl">{cat.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{cat.label}</p>
              <p className="text-xs text-muted-foreground">{counts[cat.key] || 0} מסמכים</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
