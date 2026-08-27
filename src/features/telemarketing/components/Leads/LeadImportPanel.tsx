import { useState } from 'react';
import { applyColumnMapping, mappingIsComplete, suggestColumnMapping } from '@/features/telemarketing/lib/leadImport/mapColumns';
import { parseSheetText } from '@/features/telemarketing/lib/leadImport/parseSheetText';
import { LEAD_DIRECTORY_FIELDS, type ColumnMapping, type LeadImportPreview, type LeadImportSource, type ParsedSheet } from '@/features/telemarketing/lib/leadImport/types';
import { buildLeadImportPreview, rowsReadyToImport } from '@/features/telemarketing/lib/leadImport/validateLeads';
import { commitLeadImport, loadExistingLeadIndex } from '@/features/telemarketing/services/leadDirectoryService';

const FIELD_LABEL: Record<string, string> = {
  lead_number: 'מספר ליד',
  company_name: 'חברה',
  industry: 'תחום',
  region: 'אזור',
  fleet_size: 'צי רכב',
  phone: 'טלפון',
  email: 'מייל',
  skip: 'דלג',
  '': 'בחר ידנית',
};

type Step = 'input' | 'map' | 'preview' | 'done';

export function LeadImportPanel({ isAdmin, onImported, readOnly = false }: { isAdmin: boolean; onImported: () => void; readOnly?: boolean }) {
  const [step, setStep] = useState<Step>('input');
  const [raw, setRaw] = useState('');
  const [source, setSource] = useState<LeadImportSource>('pasted_sheet');
  const [fileName, setFileName] = useState('');
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [preview, setPreview] = useState<LeadImportPreview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ batchId: string; importedCount: number; skippedCount: number } | null>(null);

  const reset = () => {
    setStep('input');
    setRaw('');
    setSource('pasted_sheet');
    setFileName('');
    setSheet(null);
    setMapping({});
    setPreview(null);
    setError('');
    setBusy(false);
    setResult(null);
  };

  const parseInput = async (text: string, nextSource: LeadImportSource, name = '') => {
    if (readOnly) return;
    setError('');
    try {
      const parsed = parseSheetText(text);
      setRaw(text);
      setSource(nextSource);
      setFileName(name);
      setSheet(parsed);
      setMapping(suggestColumnMapping(parsed.headers));
      setPreview(null);
      setStep('map');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'לא ניתן לפענח את ההדבקה');
    }
  };

  const onFile = async (file: File) => {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      setError('קובץ Excel בינארי לא נקרא ישירות. העתיקו מהגיליון והדביקו, או שמרו כ-CSV/TSV.');
      return;
    }
    const text = await file.text();
    await parseInput(text, 'csv', file.name);
  };

  const goPreview = async () => {
    if (!sheet) return;
    if (!mappingIsComplete(mapping, sheet.headers.length)) {
      setError('יש למפות את כל העמודות. עמודה לא מוכרת — בחרו ידנית או דלגו. בלי ניחוש.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const existing = await loadExistingLeadIndex();
      const rows = applyColumnMapping(sheet, mapping);
      setPreview(buildLeadImportPreview(rows, existing));
      setStep('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בבדיקת כפילויות');
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = async () => {
    if (readOnly || !preview) return;
    const ready = rowsReadyToImport(preview);
    setBusy(true);
    setError('');
    try {
      const committed = await commitLeadImport({
        source,
        fileName,
        mapping,
        rawText: raw,
        rows: ready,
      });
      setResult(committed);
      setStep('done');
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'הייבוא נכשל — לא נשמר Batch חלקי');
    } finally {
      setBusy(false);
    }
  };

  const mappedPreviewRows = preview?.rows || [];

  if (!isAdmin) return null;

  return (
    <section className="space-y-3 rounded-2xl border border-violet-500/30 bg-card p-4" data-testid="lead-import-panel">
      <h2 className="text-xl font-black">ייבוא למאגר לידים</h2>
      <p className="text-sm text-muted-foreground">
        מקור אמת אחד: הדבקה מ־Google Sheets/Excel או קובץ CSV נכנסים לאותו Mapping → Preview → Validation → Import.
      </p>
      {readOnly && <p className="rounded-xl border border-amber-400/50 bg-amber-50 p-2 text-sm font-semibold dark:bg-amber-950/30">מצב בדיקת מנהל־על — ייבוא חסום.</p>}

      {step === 'input' && (
        <div className="space-y-3">
          <label className="block text-sm font-bold">הדבק נתונים מ־Google Sheets / Excel</label>
          <textarea
            data-testid="lead-import-paste"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={'העתיקו טווח מהגיליון (כולל שורת כותרות) והדביקו כאן.\nמספר	חברה	תחום	אזור	צי רכב	טלפון	מייל'}
            className="min-h-40 w-full rounded-xl border border-border bg-background p-3 font-mono text-sm"
            dir="rtl"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="lead-import-parse"
              className="min-h-12 rounded-xl bg-primary px-4 font-bold text-primary-foreground disabled:opacity-50"
              disabled={readOnly}
              onClick={() => void parseInput(raw, 'pasted_sheet')}
            >
              זהה כותרות
            </button>
            <label className="min-h-12 cursor-pointer rounded-xl border border-border px-4 py-3 font-bold">
              קובץ CSV/TSV
              <input type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
            </label>
          </div>
        </div>
      )}

      {step === 'map' && sheet && (
        <div className="space-y-3">
          <p className="text-sm font-semibold">זוהו {sheet.pastedCount} שורות · מפריד: {sheet.delimiter === 'tab' ? 'Tab (Sheets/Excel)' : sheet.delimiter}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {sheet.headers.map((header, index) => (
                    <th key={`${header}-${index}`} className="p-2 text-right">
                      <p className="mb-1 font-bold">{header || `עמודה ${index + 1}`}</p>
                      <select
                        value={mapping[index] || ''}
                        onChange={(e) => setMapping((prev) => ({ ...prev, [index]: e.target.value as ColumnMapping[number] }))}
                        className="min-h-10 w-full rounded-lg border border-border bg-background p-1"
                      >
                        <option value="">{FIELD_LABEL['']}</option>
                        {LEAD_DIRECTORY_FIELDS.map((field) => (
                          <option key={field} value={field}>{FIELD_LABEL[field]}</option>
                        ))}
                        <option value="skip">{FIELD_LABEL.skip}</option>
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="min-h-12 rounded-xl border border-border px-4 font-bold" onClick={reset}>ביטול</button>
            <button type="button" className="min-h-12 rounded-xl border border-border px-4 font-bold" onClick={() => setStep('input')}>חזרה</button>
            <button type="button" data-testid="lead-import-preview" className="min-h-12 rounded-xl bg-primary px-4 font-bold text-primary-foreground" disabled={busy} onClick={() => void goPreview()}>
              {busy ? 'בודק...' : 'Preview ו־Validation'}
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && preview && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
            <Stat label="הודבקו" value={preview.pastedCount} />
            <Stat label="תקינות" value={preview.validCount} />
            <Stat label="בעייתיות" value={preview.invalidCount} />
            <Stat label="כפילויות / Conflicts" value={preview.duplicateCount} />
            <Stat label="ייכנסו בפועל" value={preview.willImportCount} />
          </div>
          <div className="max-h-80 overflow-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/40">
                  <th className="p-2">#</th>
                  <th className="p-2">מספר</th>
                  <th className="p-2">חברה</th>
                  <th className="p-2">תחום</th>
                  <th className="p-2">אזור</th>
                  <th className="p-2">צי רכב</th>
                  <th className="p-2">טלפון</th>
                  <th className="p-2">מייל</th>
                </tr>
              </thead>
              <tbody>
                {mappedPreviewRows.map((row) => (
                  <tr key={row.rowIndex} className="border-t border-border">
                    <td className="p-2">{row.rowIndex}</td>
                    <td className="p-2">{row.lead_number}</td>
                    <td className="p-2">{row.company_name}</td>
                    <td className="p-2">{row.industry}</td>
                    <td className="p-2">{row.region}</td>
                    <td className="p-2">{row.fleet_size}</td>
                    <td className="p-2" dir="ltr">{row.phone}</td>
                    <td className="p-2" dir="ltr">{row.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.issues.length > 0 && (
            <ul className="max-h-40 overflow-auto rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
              {preview.issues.slice(0, 20).map((issue, i) => (
                <li key={`${issue.rowIndex}-${issue.kind}-${i}`}>שורה {issue.rowIndex}: {issue.message}</li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">שום שורה לא נשמרת ל־DB לפני אישור. ביטול לא משאיר Batch.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="min-h-12 rounded-xl border border-border px-4 font-bold" onClick={reset}>ביטול</button>
            <button type="button" className="min-h-12 rounded-xl border border-border px-4 font-bold" onClick={() => setStep('map')}>חזרה</button>
            <button
              type="button"
              data-testid="lead-import-confirm"
              className="min-h-12 rounded-xl bg-emerald-700 px-4 font-bold text-white disabled:opacity-50"
              disabled={busy || preview.willImportCount === 0 || readOnly}
              onClick={() => void confirmImport()}
            >
              {busy ? 'מייבא...' : `אישור Import (${preview.willImportCount})`}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="space-y-2">
          <p className="font-bold text-emerald-700">הייבוא הושלם. Batch: {result.batchId.slice(0, 8)}</p>
          <p className="text-sm">נכנסו {result.importedCount} · דולגו {result.skippedCount}</p>
          <button type="button" className="min-h-12 rounded-xl bg-primary px-4 font-bold text-primary-foreground" onClick={reset}>הדבקה נוספת</button>
        </div>
      )}

      {error && <p className="rounded-lg bg-destructive/10 p-2 text-sm font-semibold text-destructive">{error}</p>}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-black">{value}</p>
    </div>
  );
}
