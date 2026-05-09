import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface ImportRow {
  full_name?: string;
  id_number?: string;
  email?: string;
  phone?: string;
  license_number?: string;
  license_expiry?: string;
  license_types?: string;
  city?: string;
  street?: string;
  status?: string;
  last_exam_date?: string;
  exam_expiry?: string;
  license_image_url?: string;
  declaration_url?: string;
  notes?: string;
}

interface ImportError {
  row: number;
  full_name: string;
  reason: string;
}

export default function DriverImport() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: ImportError[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
          else inQuotes = false;
        } else current += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ',') { result.push(current.trim()); current = ''; }
        else current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const mapHeader = (header: string): string | null => {
    const normalized = header.trim().replace(/"/g, '');
    const map: Record<string, string> = {
      'שם מלא': 'full_name', 'שם': 'full_name', 'full_name': 'full_name',
      'תעודת זהות': 'id_number', 'ת.ז': 'id_number', 'ת"ז': 'id_number', 'תז': 'id_number', 'id_number': 'id_number',
      'אימייל': 'email', 'מייל': 'email', 'דוא"ל': 'email', 'email': 'email',
      'טלפון': 'phone', 'נייד': 'phone', 'phone': 'phone',
      'מספר רישיון': 'license_number', 'מס רישיון': 'license_number', 'license_number': 'license_number',
      'תוקף רישיון': 'license_expiry', 'license_expiry': 'license_expiry',
      'סוג רישיון': 'license_types', 'סוגי רישיון': 'license_types',
      'עיר': 'city', 'city': 'city',
      'רחוב': 'street', 'כתובת': 'street', 'street': 'street',
      'סטטוס': 'status', 'סטטוס נהג': 'status', 'status': 'status',
      'מבחן אחרון': 'last_exam_date', 'תאריך מבחן אחרון': 'last_exam_date',
      'מבחן הבא': 'exam_expiry', 'תאריך מבחן הבא': 'exam_expiry', 'תוקף מבחן': 'exam_expiry',
      'צילום רישיון נהיגה': 'license_image_url', 'צילום רישיון': 'license_image_url',
      'תצהיר נהג': 'declaration_url', 'תצהיר': 'declaration_url',
      'הערות': 'notes', 'notes': 'notes',
    };
    return map[normalized] || null;
  };

  const parseCSV = (text: string): ImportRow[] => {
    const cleanText = text.replace(/^\uFEFF/, '');
    const lines = cleanText.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = parseCSVLine(lines[0]).map(h => h.replace(/"/g, '').trim());
    const parsed: ImportRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length === 0 || (values.length === 1 && !values[0])) continue;
      const row: any = {};
      let hasData = false;
      headers.forEach((h, idx) => {
        const key = mapHeader(h);
        if (key) {
          const val = (values[idx] || '').replace(/"/g, '').trim();
          row[key] = val;
          if (val) hasData = true;
        }
      });
      if (hasData) parsed.push(row as ImportRow);
    }
    return parsed;
  };

  const normalizeStatus = (s?: string): string => {
    if (!s) return 'active';
    const t = s.trim();
    if (['active', 'פעיל'].includes(t)) return 'active';
    if (['inactive', 'לא פעיל', 'מושבת'].includes(t)) return 'inactive';
    return 'active';
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (file.name.endsWith('.csv')) {
      const text = await file.text();
      const parsed = parseCSV(text);
      setRows(parsed);
      setImportResult(null);
      if (parsed.length === 0) toast.error('לא נמצאו שורות בקובץ. ודא שהכותרות תואמות.');
      else toast.success(`נקראו ${parsed.length} שורות`);
    } else {
      toast.error('נא להעלות קובץ CSV. לייצוא מאקסל: שמור כ-CSV (UTF-8)');
    }
  };

  const handleImport = async () => {
    if (rows.length === 0) return;
    setImporting(true);
    let success = 0;
    let failed = 0;
    const errors: ImportError[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.full_name) {
        failed++;
        errors.push({ row: i + 2, full_name: '—', reason: 'חסר שם מלא' });
        continue;
      }

      const licenseTypes = row.license_types
        ? row.license_types.split(/[,;|\/]/).map(s => s.trim()).filter(Boolean)
        : [];

      const payload: any = {
        full_name: row.full_name,
        id_number: row.id_number || '',
        email: row.email || '',
        phone: row.phone || '',
        license_number: row.license_number || '',
        license_expiry: row.license_expiry || null,
        license_types: licenseTypes,
        city: row.city || '',
        street: row.street || '',
        status: normalizeStatus(row.status),
        last_exam_date: row.last_exam_date || null,
        exam_expiry: row.exam_expiry || null,
        license_image_url: row.license_image_url || '',
        notes: [row.declaration_url ? `תצהיר: ${row.declaration_url}` : '', row.notes].filter(Boolean).join(' | '),
        company_name: user?.company_name || '',
        created_by: user?.id,
      };

      const { error } = await supabase.from('drivers').insert(payload);
      if (error) {
        console.error('Import error for row', i + 2, row.full_name, error);
        failed++;
        errors.push({ row: i + 2, full_name: row.full_name, reason: error.message || 'שגיאת הכנסה' });
      } else {
        success++;
      }
    }

    setImporting(false);
    setImportResult({ success, failed, errors });
    if (success > 0) toast.success(`${success} נהגים יובאו בהצלחה`);
    if (failed > 0) toast.error(`${failed} נהגים נכשלו`);
  };

  return (
    <div className="animate-fade-in">
      <h1 className="page-header flex items-center gap-3"><FileSpreadsheet size={28} /> יבוא נהגים מקובץ</h1>

      <div className="card-elevated mb-6">
        <h2 className="text-lg font-bold mb-3">הנחיות</h2>
        <ul className="text-muted-foreground text-sm space-y-1 list-disc list-inside">
          <li>שמור את קובץ האקסל כ-CSV (UTF-8)</li>
          <li>השורה הראשונה חייבת לכלול כותרות עמודות</li>
          <li>כותרות נתמכות: שם מלא, תעודת זהות, אימייל, טלפון, מספר רישיון, תוקף רישיון, סוג רישיון, עיר, רחוב, סטטוס, מבחן אחרון, מבחן הבא, צילום רישיון נהיגה, תצהיר נהג, הערות</li>
          <li>שדה חובה: שם מלא</li>
          <li>סוג רישיון יכול להכיל ערכים מרובים מופרדים בפסיק (לדוגמה: B, C1)</li>
        </ul>
      </div>

      <button onClick={() => fileRef.current?.click()}
        className="w-full flex items-center justify-center gap-3 py-6 rounded-xl border-2 border-dashed border-input bg-muted/50 text-xl font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors mb-6">
        <Upload size={28} /> 📁 בחר קובץ CSV
      </button>
      <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />

      {rows.length > 0 && !importResult && (
        <div className="space-y-4">
          <div className="card-elevated">
            <h2 className="text-lg font-bold mb-3">תצוגה מקדימה ({rows.length} שורות)</h2>
            <div className="overflow-x-auto">
              <table className="text-sm w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-right p-2">#</th>
                    <th className="text-right p-2">שם מלא</th>
                    <th className="text-right p-2">ת.ז</th>
                    <th className="text-right p-2">טלפון</th>
                    <th className="text-right p-2">תוקף רישיון</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map((r, i) => (
                    <tr key={i} className={`border-b border-border ${!r.full_name ? 'bg-destructive/10' : ''}`}>
                      <td className="p-2 text-muted-foreground">{i + 1}</td>
                      <td className="p-2 font-bold">{r.full_name || <span className="text-destructive">חסר!</span>}</td>
                      <td className="p-2">{r.id_number || '—'}</td>
                      <td className="p-2">{r.phone || '—'}</td>
                      <td className="p-2">{r.license_expiry || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 20 && <p className="text-sm text-muted-foreground mt-2 text-center">...ועוד {rows.length - 20} שורות</p>}
            </div>
          </div>

          <button onClick={handleImport} disabled={importing}
            className="w-full py-5 rounded-xl text-xl font-bold bg-primary text-primary-foreground disabled:opacity-50">
            {importing ? 'מייבא...' : `📥 ייבא ${rows.length} נהגים`}
          </button>
        </div>
      )}

      {importResult && (
        <div className="card-elevated text-center space-y-4">
          <div className="flex items-center justify-center gap-2 text-2xl font-bold">
            {importResult.failed === 0 ? <CheckCircle2 size={32} className="text-success" /> : <AlertTriangle size={32} className="text-warning" />}
            היבוא הושלם
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-success/10">
              <p className="text-3xl font-bold text-success">{importResult.success}</p>
              <p className="text-sm text-muted-foreground">יובאו בהצלחה</p>
            </div>
            <div className="p-4 rounded-xl bg-destructive/10">
              <p className="text-3xl font-bold text-destructive">{importResult.failed}</p>
              <p className="text-sm text-muted-foreground">נכשלו</p>
            </div>
          </div>
          {importResult.errors.length > 0 && (
            <div className="text-right">
              <h3 className="font-bold text-lg mb-2 text-destructive">פירוט שגיאות:</h3>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {importResult.errors.map((err, i) => (
                  <div key={i} className="text-sm p-2 rounded-lg bg-destructive/5 border border-destructive/20">
                    שורה {err.row} | שם: {err.full_name} | {err.reason}
                  </div>
                ))}
              </div>
            </div>
          )}
          <button onClick={() => { setRows([]); setImportResult(null); }}
            className="w-full py-4 rounded-xl bg-primary text-primary-foreground font-bold text-lg">
            ייבוא נוסף
          </button>
        </div>
      )}
    </div>
  );
}
