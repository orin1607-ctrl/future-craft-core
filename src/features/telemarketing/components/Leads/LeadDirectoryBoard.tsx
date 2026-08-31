import { useEffect, useMemo, useState } from 'react';
import { exportToCsv } from '@/utils/exportCsv';
import type { LeadAssignResult, LeadAssignmentEvent, LeadDirectoryRecord, LeadImportBatch } from '@/features/telemarketing/lib/leadImport/types';
import {
  assignLeadsToAgent,
  listAssignableAgents,
  listLeadAssignmentEvents,
  listLeadDirectory,
  listLeadImportBatches,
  previewLeadDelete,
  setLeadsArchived,
  setLeadsWorkPriority,
} from '@/features/telemarketing/services/leadDirectoryService';
import { getLeadStates } from '@/features/telemarketing/services/leadStateService';
import { getFollowUps } from '@/features/telemarketing/services/telemarketingService';
import { supabase } from '@/integrations/supabase/client';
import { isUsableLeadKey, leadKey } from '@/features/telemarketing/lib/leadKey';
import {
  describeDirectoryFilters,
  EMPTY_DIRECTORY_EXTRA,
  filterDirectoryRows,
  isDirectoryFilterActive,
  isWorkPriorityExhausted,
  selectAllLabel,
  sortDirectoryRows,
  summarizeAgentLeadWorkload,
  summarizeWorkPriority,
  type AgentFilter,
  type DirectoryExtraFilter,
  type DirectorySort,
  type LeadActivityHints,
  type WaveFilter,
} from '@/features/telemarketing/lib/leadAssign/selectScope';
import type { ContactFilter } from '@/features/telemarketing/lib/leadAssign/leadContact';
import { MACRO_REGIONS } from '@/features/telemarketing/lib/leadAssign/leadGeo';

const FEATURED_CITIES = ['תל אביב יפו', 'ראשון לציון', 'חולון', 'בת ים', 'פתח תקווה', 'רחובות', 'ירושלים', 'הרצליה', 'חיפה', 'נתניה', 'רמת גן', 'בני ברק'];
const CONTACT_OPTIONS: { id: ContactFilter; label: string }[] = [
  { id: 'all', label: 'כל פרטי הקשר' },
  { id: 'mobile', label: 'יש נייד' },
  { id: 'landline', label: 'יש טלפון' },
  { id: 'both', label: 'יש טלפון ונייד' },
  { id: 'email', label: 'יש מייל' },
  { id: 'no_phone', label: 'חסר טלפון' },
  { id: 'full', label: 'פרטי קשר מלאים' },
];

export function LeadDirectoryBoard({
  isAdmin,
  reloadToken,
  onPick,
  onClaimNext,
  readOnly = false,
}: {
  isAdmin?: boolean;
  reloadToken?: number;
  onPick?: (lead: LeadDirectoryRecord) => void;
  onClaimNext?: () => void;
  readOnly?: boolean;
}) {
  const [rows, setRows] = useState<LeadDirectoryRecord[]>([]);
  const [batches, setBatches] = useState<LeadImportBatch[]>([]);
  const [events, setEvents] = useState<LeadAssignmentEvent[]>([]);
  const [agents, setAgents] = useState<{ id: string; displayName: string }[]>([]);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [agentFilter, setAgentFilter] = useState<AgentFilter>('all');
  const [fleetPreset, setFleetPreset] = useState('all');
  const [fleetMin, setFleetMin] = useState('');
  const [fleetMax, setFleetMax] = useState('');
  const [fleetSort, setFleetSort] = useState<DirectorySort>('default');
  const [waveFilter, setWaveFilter] = useState<WaveFilter>('all');
  const [extraFilter, setExtraFilter] = useState<DirectoryExtraFilter>(EMPTY_DIRECTORY_EXTRA);
  const [priorityPreview, setPriorityPreview] = useState<'add' | 'remove' | null>(null);
  const [priorityBusy, setPriorityBusy] = useState(false);
  const [priorityResult, setPriorityResult] = useState('');
  const [activityHints, setActivityHints] = useState<LeadActivityHints>({ callKeys: [], stateKeys: [], openFollowupKeys: [] });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignAgentId, setAssignAgentId] = useState('');
  const [assignPreview, setAssignPreview] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignResult, setAssignResult] = useState<LeadAssignResult | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [deletePreview, setDeletePreview] = useState('');
  const [listOpen, setListOpen] = useState(!isAdmin);

  const load = async () => {
    try {
      if (!isAdmin) {
        setRows(await listLeadDirectory());
        return;
      }
      const [dirRows, nextBatches, nextEvents, nextAgents, states, openFollowups, callRes] = await Promise.all([
        listLeadDirectory(),
        listLeadImportBatches().catch(() => []),
        listLeadAssignmentEvents().catch(() => []),
        listAssignableAgents().catch(() => []),
        getLeadStates().catch(() => []),
        getFollowUps({ status: 'open' }).catch(() => []),
        supabase.from('telemarketing_calls').select('phone, company_name').limit(5000),
      ]);
      setRows(dirRows);
      setBatches(nextBatches);
      setEvents(nextEvents);
      setAgents(nextAgents);
      setActivityHints({
        callKeys: (callRes.data || [])
          .map((row) => leadKey(String(row.phone || ''), String(row.company_name || '')))
          .filter((key) => isUsableLeadKey(key)),
        stateKeys: states.map((state) => ({ key: state.leadKey, color: state.leadColor })),
        openFollowupKeys: openFollowups
          .map((fu) => leadKey(fu.phone, fu.companyName))
          .filter((key) => isUsableLeadKey(key)),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בטעינת מאגר לידים');
    }
  };

  useEffect(() => {
    void load();
  }, [reloadToken, isAdmin]);

  const fleetRange = useMemo(() => {
    const min = fleetMin.trim() === '' ? null : Number(fleetMin);
    const max = fleetMax.trim() === '' ? null : Number(fleetMax);
    return {
      min: min != null && Number.isFinite(min) ? min : null,
      max: max != null && Number.isFinite(max) ? max : null,
      unknownOnly: fleetPreset === 'unknown',
    };
  }, [fleetMin, fleetMax, fleetPreset]);

  const filtered = useMemo(
    () => sortDirectoryRows(filterDirectoryRows(rows, query, agentFilter, fleetRange, waveFilter, extraFilter), fleetSort),
    [rows, query, agentFilter, fleetRange, fleetSort, waveFilter, extraFilter],
  );
  const workload = useMemo(
    () => (isAdmin ? summarizeAgentLeadWorkload(rows, agents, activityHints) : []),
    [isAdmin, rows, agents, activityHints],
  );
  const priorityStats = useMemo(
    () => (isAdmin ? summarizeWorkPriority(rows, activityHints) : { total: 0, remaining: 0, treated: 0 }),
    [isAdmin, rows, activityHints],
  );
  const industries = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      if (row.industry.trim()) set.add(row.industry);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'he'));
  }, [rows]);
  const cityCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) {
      if (row.archivedAt) continue;
      if (waveFilter === 'new' && row.leadWave !== 'new') continue;
      if (waveFilter === 'old' && row.leadWave !== 'old') continue;
      const city = row.region.trim();
      if (!city) continue;
      map.set(city, (map.get(city) || 0) + 1);
    }
    return map;
  }, [rows, waveFilter]);
  const filterActive = isDirectoryFilterActive(query, agentFilter, fleetRange, waveFilter, extraFilter);
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
  const selectedAssignedNames = [...new Set(selectedRows.map((row) => row.assignedName || 'ללא שיוך'))];
  const filterSummary = describeDirectoryFilters({
    query,
    agentFilter,
    agentName: agents.find((a) => a.id === agentFilter)?.displayName,
    fleet: fleetRange,
    wave: waveFilter,
    extra: extraFilter,
  });

  const patchExtra = (patch: Partial<DirectoryExtraFilter>) => {
    setExtraFilter((prev) => ({ ...prev, ...patch }));
  };

  const runWorkPriority = async (priority: boolean) => {
    if (readOnly || selected.size === 0) return;
    setPriorityBusy(true);
    setError('');
    setPriorityResult('');
    try {
      const updated = await setLeadsWorkPriority(Array.from(selected), priority);
      clearSelection();
      await load();
      setPriorityPreview(null);
      setPriorityResult(priority ? `נוספו לעדיפות לעבודה: ${updated}` : `הוסרו מעדיפות לעבודה: ${updated}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בעדיפות לעבודה');
    } finally {
      setPriorityBusy(false);
    }
  };

  const runArchive = async (archived: boolean) => {
    if (readOnly || selected.size === 0) return;
    setArchiveBusy(true);
    setError('');
    try {
      await setLeadsArchived(Array.from(selected), archived);
      clearSelection();
      setArchiveConfirm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בארכיון');
    } finally {
      setArchiveBusy(false);
    }
  };

  const runDeletePreview = async () => {
    if (selected.size !== 1) {
      setDeletePreview('מחיקה אפשרית רק לליד אחד בכל פעם, ורק אם אין היסטוריה. עדיפות לארכיון.');
      return;
    }
    try {
      const preview = await previewLeadDelete(Array.from(selected)[0]);
      setDeletePreview(`${preview.companyName} (#${preview.leadNumber}): שיחות ${preview.calls}, Follow-up ${preview.followups}, שיוכים ${preview.assignmentEvents}. ${preview.reason}`);
    } catch (e) {
      setDeletePreview(e instanceof Error ? e.message : 'שגיאה בתצוגת מחיקה');
    }
  };

  const runAssign = async () => {
    if (readOnly || !assignAgentId || selected.size === 0) return;
    setAssigning(true);
    setError('');
    try {
      const result = await assignLeadsToAgent(Array.from(selected), assignAgentId);
      setAssignPreview(false);
      clearSelection();
      try {
        await load();
      } catch {
        /* assignment already succeeded — do not retry or hide the result */
      }
      setAssignResult(result);
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
        <div>
          <h2 className="text-xl font-black">📋 מאגר לידים</h2>
          <p className="text-sm text-muted-foreground" data-testid="lead-directory-count">
            {filterActive ? `${filtered.length} תוצאות מסוננות מתוך ${rows.length} לידים` : `${rows.length} לידים במאגר`}
          </p>
          {isAdmin && (
            <div className="space-y-0.5" data-testid="lead-work-priority-count">
              <p className="text-sm font-black">⭐ סה״כ לידים בעדיפות: {priorityStats.total}</p>
              <p className="text-sm font-black">📞 נשארו לעבודה: {priorityStats.remaining}</p>
              <p className="text-sm font-black">✅ כבר טופלו: {priorityStats.treated}</p>
              {isWorkPriorityExhausted(priorityStats) && (
                <p className="text-sm font-black text-emerald-800" data-testid="lead-work-priority-exhausted">✅ נגמרו הלידים בעדיפות</p>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <button
              type="button"
              data-testid="lead-directory-toggle"
              className="min-h-12 rounded-xl bg-emerald-700 px-4 font-bold text-white"
              onClick={() => setListOpen((open) => !open)}
              aria-expanded={listOpen}
            >
              {listOpen ? 'הסתר רשימת לידים' : 'הצג רשימת לידים'}
            </button>
          )}
          {onClaimNext && (
            <button type="button" data-testid="lead-claim-next" className="min-h-12 rounded-xl bg-emerald-700 px-4 font-bold text-white disabled:opacity-50" onClick={onClaimNext} disabled={readOnly} title={readOnly ? 'מצב בדיקה' : undefined}>
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
      {(!isAdmin || listOpen) && (
      <div data-testid="lead-directory-list" className="space-y-3">
      {isAdmin && (
        <div className="space-y-2 rounded-xl border border-border p-3" data-testid="lead-agent-workload">
          <p className="text-xs font-black">מצב לידים לפי עובד</p>
          <p className="text-xs text-muted-foreground">
            פעילות = שיחה/ניסיון שיחה או רמזור קיים. פתוחים = Follow-up פתוח או רמזור צהוב. לחיצה מסננת את המאגר לעובד.
          </p>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {workload.map((item) => (
              <button
                key={item.agentId}
                type="button"
                data-testid={`lead-agent-workload-${item.agentId}`}
                className={`rounded-xl border p-3 text-right ${agentFilter === item.agentId ? 'border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30' : 'border-border'}`}
                onClick={() => setAgentFilter(item.agentId as AgentFilter)}
              >
                <p className="font-black">{item.displayName}</p>
                <p className="text-sm">סה״כ משויכים: {item.assigned}</p>
                <p className="text-sm">בוצעה פעילות: {item.withActivity}</p>
                <p className="text-sm">טרם בוצעה פעילות: {item.withoutActivity}</p>
                <p className="text-sm">פתוחים להמשך טיפול: {item.openFollowup}</p>
              </button>
            ))}
          </div>
        </div>
      )}
      {isAdmin && (
        <div className="flex flex-wrap gap-2" data-testid="lead-wave-filter">
          {([
            { id: 'all', label: 'כל הלידים' },
            { id: 'old', label: 'לידים ישנים' },
            { id: 'new', label: 'לידים חדשים' },
          ] as const).map((wave) => (
            <button
              key={wave.id}
              type="button"
              data-testid={`lead-wave-${wave.id}`}
              className={`min-h-12 rounded-xl px-4 text-sm font-black ${waveFilter === wave.id ? 'bg-primary text-primary-foreground' : 'border border-border bg-background'}`}
              onClick={() => setWaveFilter(wave.id)}
            >
              {wave.label}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-2 md:grid-cols-2">
        <label className="text-xs font-semibold">
          חיפוש
          <input
            data-testid="lead-directory-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חברה / טלפון / עיר / תחום / מספר ליד"
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
              <option value="archive">ארכיון</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.displayName}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {isAdmin && (
        <div className="space-y-2 rounded-xl border border-border p-3" data-testid="lead-fleet-filter">
          <p className="text-xs font-black">סינון לפי כמות רכבים</p>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'all', label: 'הכל', min: '', max: '' },
              { id: '5-10', label: '5–10', min: '5', max: '10' },
              { id: '11-20', label: '11–20', min: '11', max: '20' },
              { id: '21-30', label: '21–30', min: '21', max: '30' },
              { id: '31-40', label: '31–40', min: '31', max: '40' },
              { id: '5-40', label: '5–40', min: '5', max: '40' },
              { id: 'over-40', label: 'מעל 40', min: '41', max: '' },
              { id: '40plus', label: '40+', min: '40', max: '' },
              { id: 'unknown', label: 'ללא נתון', min: '', max: '' },
            ].map((preset) => (
              <button
                key={preset.id}
                type="button"
                data-testid={`lead-fleet-preset-${preset.id}`}
                className={`min-h-10 rounded-xl px-3 text-sm font-bold ${fleetPreset === preset.id ? 'bg-emerald-700 text-white' : 'border border-border'}`}
                onClick={() => {
                  setFleetPreset(preset.id);
                  setFleetMin(preset.min);
                  setFleetMax(preset.max);
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <label className="text-xs font-semibold">
              מינימום רכבים
              <input
                data-testid="lead-fleet-min"
                type="number"
                min={0}
                value={fleetMin}
                onChange={(e) => {
                  setFleetPreset('custom');
                  setFleetMin(e.target.value);
                }}
                className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-3"
                placeholder="למשל 5"
              />
            </label>
            <label className="text-xs font-semibold">
              מקסימום רכבים
              <input
                data-testid="lead-fleet-max"
                type="number"
                min={0}
                value={fleetMax}
                onChange={(e) => {
                  setFleetPreset('custom');
                  setFleetMax(e.target.value);
                }}
                className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-3"
                placeholder="למשל 15"
              />
            </label>
            <label className="text-xs font-semibold">
              מיון
              <select
                data-testid="lead-fleet-sort"
                value={fleetSort}
                onChange={(e) => setFleetSort(e.target.value as DirectorySort)}
                className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-3"
              >
                <option value="default">ללא מיון מיוחד</option>
                <option value="priority_first">עדיפות לעבודה קודם</option>
                <option value="city_asc">עיר א–ב</option>
                <option value="fleet_asc">כמות רכבים — מהנמוך לגבוה</option>
                <option value="fleet_desc">כמות רכבים — מהגבוה לנמוך</option>
              </select>
            </label>
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="space-y-3 rounded-xl border border-amber-400/40 bg-amber-50/40 p-3 dark:bg-amber-950/20" data-testid="lead-work-priority-filters">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-black">⭐ עדיפות לעבודה — סינון במנהל־על בלבד</p>
            <div className="flex flex-wrap gap-2">
              {([
                { id: 'all', label: 'הכל' },
                { id: 'priority', label: `רק עדיפות (${priorityStats.total})` },
                { id: 'not_priority', label: 'לא בעדיפות' },
              ] as const).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`lead-priority-view-${item.id}`}
                  className={`min-h-10 rounded-xl px-3 text-sm font-bold ${extraFilter.priority === item.id ? 'bg-amber-600 text-white' : 'border border-border bg-background'}`}
                  onClick={() => patchExtra({ priority: item.id })}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            סינון לא משנה כלום לתאיר. רק אישור מפורש מוסיף או מסיר עדיפות. השיוך נשאר כמו שהוא.
            פעילות = שיחה/ניסיון או רמזור קיים, כמו במצב לידים לפי עובד.
          </p>
          <div className="rounded-xl border border-amber-500/40 bg-background p-3" data-testid="lead-work-priority-status">
            <p className="text-sm font-black">⭐ סה״כ לידים בעדיפות: {priorityStats.total}</p>
            <p className="text-sm font-black">📞 נשארו לעבודה: {priorityStats.remaining}</p>
            <p className="text-sm font-black">✅ כבר טופלו: {priorityStats.treated}</p>
            {isWorkPriorityExhausted(priorityStats) ? (
              <p className="mt-1 text-sm font-black text-emerald-800" data-testid="lead-work-priority-exhausted-panel">✅ נגמרו הלידים בעדיפות</p>
            ) : priorityStats.total === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">אין כרגע קבוצת עדיפות.</p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">נשארו {priorityStats.remaining} לידים בקבוצת העדיפות.</p>
            )}
          </div>
          <div>
            <p className="mb-1 text-xs font-black">📍 אזור</p>
            <div className="flex flex-wrap gap-2">
              {[{ id: '', label: 'כל הארץ' }, { id: 'ללא אזור', label: 'ללא אזור' }, ...MACRO_REGIONS.map((m) => ({ id: m, label: m }))].map((item) => (
                <button
                  key={item.id || 'all-macro'}
                  type="button"
                  data-testid={`lead-macro-${item.id || 'all'}`}
                  className={`min-h-10 rounded-xl px-3 text-sm font-bold ${extraFilter.macro === item.id || (!extraFilter.macro && !item.id) ? 'bg-primary text-primary-foreground' : 'border border-border bg-background'}`}
                  onClick={() => patchExtra({ macro: item.id, city: '' })}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-black">עיר</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="lead-city-all"
                className={`min-h-10 rounded-xl px-3 text-sm font-bold ${!extraFilter.city ? 'bg-primary text-primary-foreground' : 'border border-border bg-background'}`}
                onClick={() => patchExtra({ city: '' })}
              >
                כל הערים
              </button>
              {FEATURED_CITIES.filter((city) => (cityCounts.get(city) || 0) > 0).map((city) => (
                <button
                  key={city}
                  type="button"
                  data-testid={`lead-city-${city}`}
                  className={`min-h-10 rounded-xl px-3 text-sm font-bold ${extraFilter.city === city ? 'bg-primary text-primary-foreground' : 'border border-border bg-background'}`}
                  onClick={() => patchExtra({ city, macro: '' })}
                >
                  {city} ({cityCounts.get(city)})
                </button>
              ))}
            </div>
            <label className="mt-2 block text-xs font-semibold">
              עיר נוספת מהמאגר
              <select
                data-testid="lead-city-select"
                value={extraFilter.city && !FEATURED_CITIES.includes(extraFilter.city) && extraFilter.city !== '__none__' ? extraFilter.city : ''}
                onChange={(e) => patchExtra({ city: e.target.value, macro: '' })}
                className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-3"
              >
                <option value="">בחרו עיר מהנתונים האמיתיים</option>
                {[...cityCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'he')).map(([city, count]) => (
                  <option key={city} value={city}>{city} ({count})</option>
                ))}
              </select>
            </label>
            <p className="mt-1 text-xs text-muted-foreground">רדיוס בק״מ אינו זמין — אין קואורדינטות בלידים. אין מרחק מזויף.</p>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <label className="text-xs font-semibold">
              תחום פעילות
              <select
                data-testid="lead-industry-filter"
                value={extraFilter.industry}
                onChange={(e) => patchExtra({ industry: e.target.value })}
                className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-3"
              >
                <option value="">כל התחומים מהמאגר</option>
                {industries.map((industry) => (
                  <option key={industry} value={industry}>{industry}</option>
                ))}
              </select>
            </label>
            <div>
              <p className="mb-1 text-xs font-black">☎️ פרטי קשר</p>
              <div className="flex flex-wrap gap-2">
                {CONTACT_OPTIONS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`lead-contact-${item.id}`}
                    className={`min-h-10 rounded-xl px-3 text-sm font-bold ${extraFilter.contact === item.id ? 'bg-emerald-700 text-white' : 'border border-border bg-background'}`}
                    onClick={() => patchExtra({ contact: item.id })}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

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
            disabled={selected.size === 0 || readOnly}
          >
            שייך לעובד ({selected.size})
          </button>
          <button
            type="button"
            data-testid="lead-priority-add"
            className="min-h-12 rounded-xl bg-amber-600 px-4 font-bold text-white disabled:opacity-50"
            onClick={() => { setPriorityPreview('add'); setPriorityResult(''); }}
            disabled={selected.size === 0 || readOnly}
          >
            ⭐ הוסף לעדיפות לעבודה ({selected.size})
          </button>
          <button
            type="button"
            data-testid="lead-priority-remove"
            className="min-h-12 rounded-xl border border-amber-600 px-4 font-bold text-amber-800 disabled:opacity-50"
            onClick={() => { setPriorityPreview('remove'); setPriorityResult(''); }}
            disabled={selected.size === 0 || readOnly}
          >
            הסר מעדיפות לעבודה ({selected.size})
          </button>
          <button type="button" data-testid="lead-archive" className="min-h-12 rounded-xl border border-border px-3 font-bold disabled:opacity-50" disabled={selected.size === 0 || archiveBusy || readOnly} onClick={() => setArchiveConfirm(true)}>
            העבר לארכיון
          </button>
          {agentFilter === 'archive' && (
            <button type="button" data-testid="lead-unarchive" className="min-h-12 rounded-xl border border-border px-3 font-bold disabled:opacity-50" disabled={selected.size === 0 || archiveBusy || readOnly} onClick={() => void runArchive(false)}>
              החזר לפעילות
            </button>
          )}
          <button type="button" data-testid="lead-delete-preview" className="min-h-12 rounded-xl border border-destructive/40 px-3 font-bold text-destructive disabled:opacity-50" disabled={selected.size === 0 || readOnly} onClick={() => void runDeletePreview()}>
            מחיקה (Preview)
          </button>
          {archiveConfirm && (
            <div className="w-full space-y-2 rounded-xl border border-amber-400/50 bg-amber-50 p-3 dark:bg-amber-950/30" data-testid="lead-archive-confirm">
              <p className="font-bold">להעביר {selected.size} לידים לארכיון? הם ייעלמו מתור העובדים. ההיסטוריה נשמרת.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" data-testid="lead-archive-confirm-yes" className="min-h-12 rounded-xl bg-amber-700 px-4 font-bold text-white disabled:opacity-50" disabled={archiveBusy || readOnly} onClick={() => void runArchive(true)}>
                  אישור ארכיון
                </button>
                <button type="button" className="min-h-12 rounded-xl border border-border px-4 font-bold" onClick={() => setArchiveConfirm(false)}>ביטול</button>
              </div>
            </div>
          )}
          {deletePreview && <p className="w-full text-xs font-semibold text-amber-800" data-testid="lead-delete-preview-text">{deletePreview}</p>}
          {priorityResult && <p className="w-full text-xs font-semibold text-emerald-800" data-testid="lead-priority-result">{priorityResult}</p>}
          {filterActive && <p className="text-xs font-semibold text-amber-700">הבחירה חלה רק על התוצאות המוצגות, לא על כל המאגר.</p>}
        </div>
      )}

      {isAdmin && priorityPreview && (
        <div className="space-y-3 rounded-xl border border-amber-500 bg-amber-50 p-3 dark:bg-amber-950/30" data-testid="lead-priority-preview">
          <p className="font-black">⭐ עדיפות לעבודה</p>
          <p>עובדת: {selectedAssignedNames.join(', ') || '—'}</p>
          <p data-testid="lead-priority-preview-count">לידים שנבחרו: {selected.size}</p>
          <p className="text-xs text-muted-foreground">השיוך לא משתנה. זה רק סדר בתור העבודה הבא, ולא מחליף ליד פעיל.</p>
          {filterSummary.length > 0 && (
            <div>
              <p className="text-xs font-black">סינון:</p>
              <ul className="list-disc pr-5 text-sm">
                {filterSummary.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="min-h-12 rounded-xl border border-border px-4 font-bold" onClick={() => setPriorityPreview(null)} disabled={priorityBusy}>
              ביטול
            </button>
            <button
              type="button"
              data-testid="lead-priority-confirm"
              className="min-h-12 rounded-xl bg-amber-600 px-4 font-bold text-white disabled:opacity-50"
              disabled={priorityBusy || readOnly || selected.size === 0}
              onClick={() => void runWorkPriority(priorityPreview === 'add')}
            >
              {priorityBusy ? 'מעדכן...' : priorityPreview === 'add' ? 'אישור' : 'אישור הסרה'}
            </button>
          </div>
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
                disabled={!assignAgentId || selected.size === 0 || readOnly}
                onClick={() => setAssignPreview(true)}
              >
                Preview / אישור
              </button>
              <button type="button" className="min-h-12 rounded-xl border border-border px-4 font-bold" onClick={() => setAssignOpen(false)}>ביטול</button>
            </div>
          )}
          {error && <p className="text-sm font-semibold text-destructive" data-testid="lead-assign-error">{error}</p>}
          {assignPreview && chosenAgent && (
            <div className="space-y-2" data-testid="lead-assign-confirm-box">
              <p className="font-bold">
                אתה עומד לשייך {selected.size} לידים ל{chosenAgent.displayName}. להמשיך?
              </p>
              {selected.size > 80 && (
                <p className="text-xs text-muted-foreground">השיוך יבוצע במנות קטנות באותו מנגנון קיים, כדי לא להיתקע.</p>
              )}
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
                  disabled={assigning || readOnly}
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

      <div className="max-h-[55vh] overflow-auto" data-testid="lead-directory-table-wrap">
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
              {isAdmin && <th className="p-2">עדיפות</th>}
              <th className="p-2">חברה</th>
              <th className="p-2">תחום</th>
              <th className="p-2">אזור</th>
              <th className="p-2">צי רכב</th>
              <th className="p-2">טלפון</th>
              <th className="p-2">מייל</th>
              <th className="p-2">עובד משויך</th>
              <th className="p-2">גל</th>
              <th className="p-2">מקור</th>
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
                {isAdmin && <td className="p-2">{row.workPriorityAt ? '⭐' : ''}</td>}
                <td className="p-2 font-bold">{row.companyName}</td>
                <td className="p-2">{row.industry}</td>
                <td className="p-2">{row.region}</td>
                <td className="p-2" data-testid="lead-fleet-cell">{row.fleetSize.trim() ? row.fleetSize : 'ללא נתון'}</td>
                <td className="p-2" dir="ltr">
                  {row.phone}
                  {row.extra?.phone1 && row.extra.phone1 !== row.phone ? (
                    <span className="block text-xs text-muted-foreground">{row.extra.phone1}</span>
                  ) : null}
                </td>
                <td className="p-2" dir="ltr">{row.email}</td>
                <td className="p-2" data-testid="lead-assigned-cell">{row.assignedName || 'ללא שיוך'}</td>
                <td className="p-2">{row.leadWave === 'new' ? 'חדש' : 'ישן'}</td>
                <td className="p-2">{row.source === 'manual_agent' ? 'יצירה ידנית' : row.source || '—'}</td>
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
    </div>
      )}
    </section>
  );
}
