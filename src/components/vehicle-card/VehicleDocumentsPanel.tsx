import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { buildStoragePath } from '@/lib/storage';
import { Upload, Download, Trash2, FileText, Loader2 } from 'lucide-react';

export const VEHICLE_DOC_CATEGORIES = [
  { key: 'insurance', label: 'ביטוח חובה', folder: 'insurance' },
  { key: 'comprehensive', label: 'ביטוח מקיף', folder: 'comprehensive' },
  { key: 'third_party', label: 'ביטוח צד ג׳', folder: 'third-party' },
  { key: 'leasing', label: 'ליסינג', folder: 'leasing' },
  { key: 'loan', label: 'הלוואות', folder: 'loans' },
  { key: 'pledge', label: 'שעבודים', folder: 'pledges' },
  { key: 'service', label: 'טיפולים', folder: 'services' },
  { key: 'inspection_report', label: 'תסקירים', folder: 'inspections' },
  { key: 'vehicle-license', label: 'רישיון רכב', folder: 'vehicle-license' },
  { key: 'test', label: 'טסט', folder: 'test' },
  { key: 'general', label: 'מסמכים כלליים', folder: 'general' },
];

interface DocRow {
  id: string;
  file_path: string;
  category: string;
  original_name: string;
  created_at: string;
}

export default function VehicleDocumentsPanel({ vehicle }: { vehicle: any }) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<string>('insurance');
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const plate = vehicle?.license_plate || '';
  const companyName = vehicle?.company_name || user?.company_name || '';

  const load = useCallback(async () => {
    if (!plate) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('document_metadata')
      .select('id, file_path, category, original_name, created_at')
      .eq('vehicle_plate', plate)
      .order('created_at', { ascending: false });
    if (error) toast.error('שגיאה בטעינת מסמכים');
    setDocs((data || []) as DocRow[]);
    setLoading(false);
  }, [plate]);

  useEffect(() => { load(); }, [load]);

  const onPick = () => fileRef.current?.click();

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user?.id) return;
    if (!plate) { toast.error('לרכב אין מספר רישוי'); return; }

    const cat = VEHICLE_DOC_CATEGORIES.find(c => c.key === category)!;
    setUploading(true);
    const path = buildStoragePath(user.id, `vehicles/${plate}/${cat.folder}`, file.name);

    const { error: upErr } = await supabase.storage.from('documents').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    });
    if (upErr) {
      toast.error('שגיאה בהעלאה: ' + upErr.message);
      setUploading(false);
      return;
    }

    const { error: metaErr } = await supabase.from('document_metadata').insert({
      file_path: path,
      category: cat.key,
      company_name: companyName,
      vehicle_plate: plate,
      manufacturer: vehicle?.manufacturer || '',
      model: vehicle?.model || '',
      original_name: file.name,
      uploaded_by: user.id,
    } as any);
    if (metaErr) {
      toast.error('שגיאה בשמירת פרטים');
      setUploading(false);
      return;
    }

    toast.success(`הקובץ הועלה לקטגוריית ${cat.label}`);
    setUploading(false);
    load();
  };

  const resolveUrl = (d: DocRow) => {
    if (/^https?:\/\//i.test(d.file_path)) return d.file_path;
    return supabase.storage.from('documents').getPublicUrl(d.file_path).data.publicUrl;
  };

  const onDelete = async (d: DocRow) => {
    if (!confirm('למחוק מסמך זה?')) return;
    await supabase.storage.from('documents').remove([d.file_path]);
    await supabase.from('document_metadata').delete().eq('id', d.id);
    toast.success('נמחק');
    load();
  };

  const labelOf = (key: string) => VEHICLE_DOC_CATEGORIES.find(c => c.key === key)?.label || key;

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        כל המסמכים שמועלים כאן משויכים לרכב {plate || '—'} בלבד.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end border border-border rounded-lg p-3 bg-muted/30">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">קטגוריית מסמך</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {VEHICLE_DOC_CATEGORIES.map(c => (
                <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Input ref={fileRef} type="file" className="hidden" onChange={onUpload} />
          <Button onClick={onPick} disabled={uploading || !plate}>
            {uploading ? <Loader2 size={14} className="ml-1 animate-spin" /> : <Upload size={14} className="ml-1" />}
            העלה מסמך
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-semibold">מסמכי הרכב ({docs.length})</div>
        {loading ? (
          <div className="text-sm text-muted-foreground py-4 text-center">טוען…</div>
        ) : docs.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
            עדיין לא הועלו מסמכים לרכב זה
          </div>
        ) : (
          <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
            {docs.map(d => (
              <div key={d.id} className="flex items-center gap-2 p-2 hover:bg-muted/40">
                <FileText size={16} className="text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{d.original_name || d.file_path.split('/').pop()}</div>
                  <div className="text-xs text-muted-foreground">
                    {labelOf(d.category)} · {new Date(d.created_at).toLocaleDateString('he-IL')}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => window.open(resolveUrl(d), '_blank')}>
                  <Download size={14} />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onDelete(d)}>
                  <Trash2 size={14} className="text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
