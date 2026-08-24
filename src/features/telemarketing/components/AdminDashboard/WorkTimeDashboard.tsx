import { useEffect, useMemo, useState } from 'react';
import { getActivityJournal, getWorkTimeSummary } from '@/features/telemarketing/services/telemarketingService';
import { localDateStr } from '@/features/telemarketing/lib/localDate';
import { formatDay, formatDurationSeconds, formatTimeRange } from '@/features/telemarketing/lib/formatTime';
import type { ActivityJournalItem, WorkTimeSummary } from '@/features/telemarketing/types';

function formatDuration(seconds: number | null): string {
  return formatDurationSeconds(seconds) === '-' ? "0:00" : formatDurationSeconds(seconds);
}

function formatRange(start: string, end: string | null): string {
  return `${formatDay(start)} · ${formatTimeRange(start, end)}`;
}

export function WorkTimeDashboard({ selectedAgent }: { selectedAgent: string | null }) {
  const today = localDateStr();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [summary, setSummary] = useState<WorkTimeSummary[]>([]);
  const [journal, setJournal] = useState<ActivityJournalItem[]>([]);

  const load = async () => {
    const [s, j] = await Promise.all([getWorkTimeSummary({ from, to }), getActivityJournal({ from, to })]);
    setSummary(s);
    setJournal(j);
  };

  useEffect(() => {
    void load().catch(() => {
      setSummary([]);
      setJournal([]);
    });
  }, [from, to]);

  const filteredSummary = selectedAgent ? summary.filter((row) => row.employeeName === selectedAgent) : summary;
  const filteredJournal = useMemo(
    () => (selectedAgent ? journal.filter((row) => row.employeeName === selectedAgent) : journal),
    [journal, selectedAgent],
  );
  const byEmployee = useMemo(() => {
    const map = new Map<string, ActivityJournalItem[]>();
    for (const item of filteredJournal) {
      const list = map.get(item.employeeName) ?? [];
      list.push(item);
      map.set(item.employeeName, list);
    }
    return map;
  }, [filteredJournal]);

  return (
    <section className="space-y-4">
      <h3 className="text-lg font-bold">זמן עבודה ויומן פעילות</h3>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-semibold">
          מתאריך
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-2" />
        </label>
        <label className="text-xs font-semibold">
          עד תאריך
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-2" />
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {filteredSummary.map((row) => (
          <div key={row.employeeId} className="rounded-2xl border border-border bg-card p-4">
            <p className="font-bold">{row.employeeName}</p>
            <p className="mt-2 text-sm">שיחות: {row.callCount} · {formatDuration(row.callSeconds)}</p>
            <p className="text-sm">משימות: {row.workCount} · {formatDuration(row.workSeconds)}</p>
            <p className="text-sm font-semibold">סה״כ: {formatDuration(row.totalSeconds)}</p>
            <p className="text-xs text-muted-foreground">ממוצע שיחה {formatDuration(row.avgCallSeconds)} · ממוצע משימה {formatDuration(row.avgWorkSeconds)}</p>
          </div>
        ))}
        {filteredSummary.length === 0 && <p className="text-sm text-muted-foreground">אין פעילות בטווח שנבחר</p>}
      </div>
      {Array.from(byEmployee.entries()).map(([name, items]) => (
        <div key={name} className="rounded-2xl border border-border bg-card p-4">
          <h4 className="mb-2 font-bold">יומן — {name}</h4>
          <ol className="space-y-2">
            {items.map((item) => (
              <li key={item.id} className="rounded-xl border border-border p-3 text-sm">
                <p className="font-semibold">
                  {formatRange(item.startedAt, item.endedAt)} — {item.title}
                </p>
                <p className="text-muted-foreground">{item.kind === 'call' ? 'שיחה' : 'משימת עבודה'} · {formatDuration(item.durationSeconds)}</p>
                {item.detail && <p className="mt-1">{item.detail}</p>}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}
