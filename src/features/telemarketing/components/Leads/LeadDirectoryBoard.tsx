import { useEffect, useMemo, useState } from 'react';
import { exportToCsv } from '@/utils/exportCsv';
import type { LeadAssignResult, LeadAssignmentEvent, LeadDirectoryRecord, LeadImportBatch } from '@/features/telemarketing/lib/leadImport/types';
import {
  assignLeadsToAgent,
  listAssignableAgents,
  listLeadAssignmentEvents,
  listLeadDirectory,
  listLeadImportBatches,
} from '@/features/telemarketing/services/leadDirectoryService';
import {
  filterDirectoryRows,
  isDirectoryFilterActive,
  selectAllLabel,
  type AgentFilter,
} from '@/features/telemarketing/lib/leadAssign/selectScope';

export function LeadDirectoryBoard({
  isAdmin,
  reloadToken,
  onPick,
  onClaimNext,
}: {
  isAdmin?: boolean;
  reloadToken?: number;
  onPick?: (lead: LeadDirectoryRecord) => void;
  onClaimNext?: () => void;
}) {
  const [rows, setRows] = useState<LeadDirectoryRecord[]>([]);
  const [batches, setBatches] = useState<LeadImportBatch[]>([]);
  const [events, setEvents] = useState<LeadAssignmentEvent[]>([]);
  const [agents, setAgents] = useState<{ id: string; displayName: string }[]>([]);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [agentFilter, setAgentFilter] = useState<AgentFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignAgentId, setAssignAgentId] = useState('');
  const [assignPreview, setAssignPreview] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignResult, setAssignResult] = useState<LeadAssignResult | null>(null);

  const load = async () => {
    try {
      setRows(await listLeadDirectory());
      if (isAdmin) {
        setBatches(await listLeadImportBatches().catch(() => []));
        setEvents(await listLeadAssignmentEvents().catch(() => []));
        setAgents(await listAssignableAgents().catch(() => []));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בטעינת מאגר לידים');
    }
  };

  useEffect(() => {
    void load();
  }, [reloadToken, isAdmin]);

  const filtered = useMemo(() => filterDirectoryRows(rows, query, agentFilter), [rows, query, agentFilter]);
  const filterActive = isDirectoryFilterActive(query, agentFilter);
  const filteredIds = filtered.map((row) => row.id);
  const selectedVisible = filteredIds.filter((id) => selected.has(id));
  const allFilteredSelected = filteredIds.length > 0 && selectedVisible.length === filteredIds.length;

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelected(new Set(filteredIds));
  };

  const clearSelection = () => setSelected(new Set());

  const chosenAgent = agents.find((a) => a.id === assignAgentId);
  const selectedRows = rows.filter((row) => selected.has(row.id));

  const runAssign = async () => {
    if (!assignAgentId || selected.size === 0) return;
    setAssigning(true);
    setError('');
    try {
      const result = await assignLeadsToAgent(Array.from(selected), assignAgentId);
      setAssignResult(result);
      setAssignPreview(false);
      clearSelection();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בשיוך לידים');
    } finally {
      setAssigning(false);
    }
  };

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
        { key: 'assignedName', label: 'עובד משויך' },
        { key: 'source', label: 'מקור' },
      ],
      filterActive ? filtered : rows,
    );
  };

  return (
    <section id="lead-directory" className="scroll-mt-24 space-y-3 rounded-2xl border border-border bg-card p-4" data-testid="lead-directory-board">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-black">מאגר לידים</h2>
        <div className="flex flex-wrap gap-2">
          {onClaimNext && (
            <button type="button" data-testid="lead-claim-next" className="min-h-12 rounded-xl bg-emerald-700 px-4 font-bold text-white" onClick={onClaimNext}>
              הליד הבא
            </button>
          )}
          <button type="button" className="min-h-12 rounded-xl border border-border px-4 font-bold" onClick={() => void load()}>רענן</button>
          <button type="button" data-testid="lead-directory-export" className="min-h-12 rounded-xl bg-primary px-4 font-bold text-primary-foreground" onClick={exportRows} disabled={rows.length === 0}>
            Export
          </button>
        </div>
      </div>
      {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
      <p className="text-sm text-muted-foreground">
        {filterActive ? `${filtered.length} תוצאות מסוננות מתוך ${rows.length} לידים במאגר` : `${rows.length} לידים במאגר`}
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="text-xs font-semibold">
          חיפוש
          <input
            data-testid="lead-directory-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חברה / טלפון / מספר ליד"
            className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-3"
          />
        </label>
        {isAdmin && (
          <label className="text-xs font-semibold">
            עובד משויך
            <select
              data-testid="lead-filter-agent"
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value as AgentFilter)}
              className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-3"
            >
              <option value="all">כל העובדים</option>
              <option value="unassigned">ללא עובד משויך</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.displayName}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3">
          <button type="button" data-testid="lead-select-all" className="min-h-12 rounded-xl border border-border px-3 font-bold" onClick={selectAllFiltered} disabled={filteredIds.length === 0}>
            {selectAllLabel(filteredIds.length, rows.length, filterActive)}
          </button>
          <button type="button" data-testid="lead-clear-selection" className="min-h-12 rounded-xl border border-border px-3 font-bold" onClick={clearSelection} disabled={selected.size === 0}>
            נקה בחירה
          </button>
          <button
            type="button"
            data-testid="lead-assign-open"
            className="min-h-12 rounded-xl bg-primary px-4 font-bold text-primary-foreground disabled:opacity-50"
            onClick={() => { setAssignOpen(true); setAssignPreview(false); setAssignResult(null); }}
            disabled={selected.size === 0}
          >
            שייך לעובד ({selected.size})
          </button>
          {filterActive && <p className="text-xs font-semibold text-amber-700">הבחירה חלה רק על התוצאות המוצגות, לא על כל המאגר.</p>}
        </div>
      )}

      {isAdmin && assignOpen && (
        <div className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-3" data-testid="lead-assign-dialog">
          <p className="font-black">שיוך לידים לעובד</p>
          <label className="block text-xs font-semibold">
            עובד
            <select
              data-testid="lead-assign-agent"
              value={assignAgentId}
              onChange={(e) => setAssignAgentId(e.target.value)}
              className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-3"
            >
              <option value="">בחרו עובד טלמיטינג</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.displayName}</option>
              ))}
            </select>
          </label>
          {!assignPreview && !assignResult && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="lead-assign-preview"
                className="min-h-12 rounded-xl bg-primary px-4 font-bold text-primary-foreground disabled:opacity-50"
                disabled={!assignAgentId || selected.size === 0}
                onClick={() => setAssignPreview(true)}
              >
                Preview / אישור
              </button>
              <button type="button" className="min-h-12 rounded-xl border border-border px-4 font-bold" onClick={() => setAssignOpen(false)}>ביטול</button>
            </div>
          )}
          {assignPreview && chosenAgent && (
            <div className="space-y-2" data-testid="lead-assign-confirm-box">
              <p className="font-bold">
                אתה עומד לשייך {selected.size} לידים ל{chosenAgent.displayName}. להמשיך?
              </p>
              {selectedRows.some((row) => row.assignedTo && row.assignedTo !== assignAgentId) && (
                <p className="text-sm font-semibold text-amber-800">
                  חלק מהלידים כבר משויכים לעובד אחר — לאחר אישור הם יועברו, אלא אם הם בשיחה/טיפול פעיל.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="lead-assign-confirm"
                  className="min-h-12 rounded-xl bg-emerald-700 px-4 font-bold text-white disabled:opacity-50"
                  disabled={assigning}
                  onClick={() => void runAssign()}
                >
                  {assigning ? 'משייך...' : 'אישור שיוך'}
                </button>
                <button type="button" className="min-h-12 rounded-xl border border-border px-4 font-bold" onClick={() => setAssignPreview(false)} disabled={assigning}>חזרה</button>
              </div>
            </div>
          )}
          {assignResult && (
            <div data-testid="lead-assign-result" className="space-y-1 text-sm">
              <p className="font-black">
                {assignResult.skippedCount > 0 ? 'שיוך חלקי' : 'השיוך הושלם'}
              </p>
              <p>שויכו: {assignResult.assignedCount}</p>
              <p>לא שויכו: {assignResult.skippedCount}</p>
              {assignResult.skipped.map((item, idx) => (
                <p key={`${item.leadNumber}-${idx}`} className="text-destructive">
                  {item.leadNumber || 'ליד'} {item.companyName} — {item.reason}
                </p>
              ))}
              <button type="button" className="min-h-12 rounded-xl border border-border px-4 font-bold" onClick={() => { setAssignOpen(false); setAssignResult(null); }}>סגור</button>
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right">
              {isAdmin && (
                <th className="p-2">
                  <input
                    type="checkbox"
                    data-testid="lead-select-all-checkbox"
                    checked={allFilteredSelected}
                    onChange={() => (allFilteredSelected ? clearSelection() : selectAllFiltered())}
                    aria-label="בחר הכול בתוצאות המוצגות"
                  />
                </th>
              )}
              <th className="p-2">מספר</th>
              <th className="p-2">חברה</th>
              <th className="p-2">תחום</th>
              <th className="p-2">אזור</th>
              <th className="p-2">צי רכב</th>
              <th className="p-2">טלפון</th>
              <th className="p-2">מייל</th>
              <th className="p-2">עובד משויך</th>
              {onPick && <th className="p-2"> </th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} className="border-t border-border" data-lead-number={row.leadNumber}>
                {isAdmin && (
                  <td className="p-2">
                    <input
                      type="checkbox"
                      data-testid={`lead-row-checkbox-${row.leadNumber || row.id}`}
                      checked={selected.has(row.id)}
                      onChange={() => toggleOne(row.id)}
                      aria-label={`בחר ליד ${row.leadNumber || row.companyName}`}
                    />
                  </td>
                )}
                <td className="p-2">{row.leadNumber}</td>
                <td className="p-2 font-bold">{row.companyName}</td>
                <td className="p-2">{row.industry}</td>
                <td className="p-2">{row.region}</td>
                <td className="p-2">{row.fleetSize}</td>
                <td className="p-2" dir="ltr">{row.phone}</td>
                <td className="p-2" dir="ltr">{row.email}</td>
                <td className="p-2" data-testid="lead-assigned-cell">{row.assignedName || 'ללא שיוך'}</td>
                {onPick && (
                  <td className="p-2">
                    <button type="button" className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white" onClick={() => onPick(row)}>
                      בחר ליד
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
      {isAdmin && events.length > 0 && (
        <div className="rounded-xl border border-border p-3 text-xs" data-testid="lead-assignment-history">
          <p className="mb-2 font-bold">היסטוריית שיוך</p>
          {events.slice(0, 20).map((event) => (
            <p key={event.id}>
              ליד {event.leadNumber || '—'} · {event.previousAgentName || 'ללא'} → {event.newAgentName} · {event.changedByName} · {new Date(event.createdAt).toLocaleString('he-IL')}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
