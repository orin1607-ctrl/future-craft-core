import { useEffect, useState } from 'react';
import { exportToCsv } from '@/utils/exportCsv';
import type { LeadDirectoryRecord, LeadImportBatch } from '@/features/telemarketing/lib/leadImport/types';
import { listLeadDirectory, listLeadImportBatches } from '@/features/telemarketing/services/leadDirectoryService';

export function LeadDirectoryBoard({
  isAdmin,
  reloadToken,
  onPick,
}: {
  isAdmin?: boolean;
  reloadToken?: number;
  onPick?: (lead: LeadDirectoryRecord) => void;
}) {
  const [rows, setRows] = useState<LeadDirectoryRecord[]>([]);
  const [batches, setBatches] = useState<LeadImportBatch[]>([]);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setRows(await listLeadDirectory());
      if (isAdmin) setBatches(await listLeadImportBatches().catch(() => []));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בטעינת מאגר לידים');
    }
  };

  useEffect(() => {
    void load();
  }, [reloadToken, isAdmin]);

  const exportRows = () => {
    exportToCsv(
      'telemarketing-lead-directory',
      [
        { key: 'leadNumber', label: 'מספר' },
        { key: 'companyName', label: 'חברה' },
        { key: 'industry', label: 'תחום' },
        { key: 'region', label: 'אזור' },
        { key: 'fleetSize', label: 'צי רכב' },
        { key: 'phone', label: 'טלפון' },
        { key: 'email', label: 'מייל' },
        { key: 'source', label: 'מקור' },
      ],
      rows,
    );
  };

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4" data-testid="lead-directory-board">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-black">מאגר לידים</h2>
        <div className="flex gap-2">
          <button type="button" className="min-h-12 rounded-xl border border-border px-4 font-bold" onClick={() => void load()}>רענן</button>
          <button type="button" data-testid="lead-directory-export" className="min-h-12 rounded-xl bg-primary px-4 font-bold text-primary-foreground" onClick={exportRows} disabled={rows.length === 0}>
            Export
          </button>
        </div>
      </div>
      {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
      <p className="text-sm text-muted-foreground">{rows.length} לידים במאגר</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right">
              <th className="p-2">מספר</th>
              <th className="p-2">חברה</th>
              <th className="p-2">תחום</th>
              <th className="p-2">אזור</th>
              <th className="p-2">צי רכב</th>
              <th className="p-2">טלפון</th>
              <th className="p-2">מייל</th>
              {onPick && <th className="p-2"> </th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="p-2">{row.leadNumber}</td>
                <td className="p-2 font-bold">{row.companyName}</td>
                <td className="p-2">{row.industry}</td>
                <td className="p-2">{row.region}</td>
                <td className="p-2">{row.fleetSize}</td>
                <td className="p-2" dir="ltr">{row.phone}</td>
                <td className="p-2" dir="ltr">{row.email}</td>
                {onPick && (
                  <td className="p-2">
                    <button type="button" className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white" onClick={() => onPick(row)}>
                      הליד הבא
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isAdmin && batches.length > 0 && (
        <div className="rounded-xl border border-border p-3 text-xs">
          <p className="mb-2 font-bold">היסטוריית Import (מנהל בלבד)</p>
          {batches.map((batch) => (
            <p key={batch.id}>
              {batch.source} · {batch.importedCount}/{batch.rowCount} · {batch.id.slice(0, 8)} · sha {batch.rawInputSha256?.slice(0, 10) || '-'}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
