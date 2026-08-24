import { useEffect, useState } from 'react';
import { localDateStr } from '@/features/telemarketing/lib/localDate';
import { formatDurationSeconds, formatStamp, formatTimeRange } from '@/features/telemarketing/lib/formatTime';
import { loadActivityReport } from '@/features/telemarketing/services/activityReportService';
import type { ActivityFilters, ActivityReport } from '@/features/telemarketing/services/activityReportService';
import { CALL_RESULTS } from '@/features/telemarketing/types';

const EMPTY: ActivityFilters = {
  from: localDateStr(),
  to: localDateStr(),
  employeeName: '',
  result: '',
  status: '',
};

function pct(value: number | null): string {
  return value == null ? '-' : `${value}%`;
}

export function ActivityReportPanel() {
  const [filters, setFilters] = useState<ActivityFilters>(EMPTY);
  const [report, setReport] = useState<ActivityReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await loadActivityReport(filters));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה בטעינת הדוח');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [filters.from, filters.to, filters.employeeName, filters.result, filters.status]);

  const employees = report?.employeeNames ?? [];

  return (
    <section id="activity-report" className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-xl font-black">דוח פעילות וביצועי עובד</h2>
      <p className="text-xs text-muted-foreground">
        כל המספרים מגיעים משיחות, משימות, Follow-up ופניות דליה שנשמרו. אין נתונים מומצאים.
      </p>
      <div className="grid gap-2 md:grid-cols-5">
        <label className="text-xs font-semibold">
          מתאריך
          <input type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-2" />
        </label>
        <label className="text-xs font-semibold">
          עד תאריך
          <input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-2" />
        </label>
        <button
          type="button"
          onClick={() => {
            const today = localDateStr();
            setFilters((f) => ({ ...f, from: today, to: today }));
          }}
          className="min-h-12 rounded-lg border border-border px-3 text-sm font-semibold"
        >
          היום
        </button>
        <select value={filters.employeeName} onChange={(e) => setFilters((f) => ({ ...f, employeeName: e.target.value }))} className="min-h-12 rounded-lg border border-border bg-background p-2 text-sm">
          <option value="">כל העובדים</option>
          {employees.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <select value={filters.result} onChange={(e) => setFilters((f) => ({ ...f, result: e.target.value }))} className="min-h-12 rounded-lg border border-border bg-background p-2 text-sm">
          <option value="">כל תוצאות השיחה</option>
          {CALL_RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as ActivityFilters['status'] }))} className="min-h-12 rounded-lg border border-border bg-background p-2 text-sm">
          <option value="">כל סטטוסי השיחה</option>
          <option value="completed">הושלמו</option>
          <option value="in_progress">פתוחות</option>
        </select>
      </div>
      {loading && <p className="text-sm text-muted-foreground">טוען דוח...</p>}
      {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
      {report && (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="ניסיונות חיוג" value={String(report.totals.dialAttempts)} />
            <Stat label="נענו" value={String(report.totals.answered)} />
            <Stat label="לא ענו" value={String(report.totals.noAnswer)} />
            <Stat label="מספר שגוי" value={String(report.totals.wrongNumber)} />
            <Stat label="מתעניינים" value={String(report.totals.interested)} />
            <Stat label="לידים חמים/דחופים" value={String(report.totals.hotLeads)} />
            <Stat label="פגישות (רוצה פגישה)" value={String(report.totals.meetings)} />
            <Stat label="לא מעוניינים" value={String(report.totals.notInterested)} />
            <Stat label="חזרות בטווח" value={String(report.totals.followUps)} />
            <Stat label="פניות דליה" value={String(report.totals.daliaReports)} />
            <Stat label="משך שיחות" value={formatDurationSeconds(report.totals.callSeconds)} />
            <Stat label="זמן משימות (לא שיחה)" value={formatDurationSeconds(report.totals.workSeconds)} />
            <Stat label="זמן עבודה מדוד" value={formatDurationSeconds(report.totals.measuredWorkSeconds)} />
            <Stat label="משך פניות דליה" value={formatDurationSeconds(report.totals.daliaSeconds)} />
            <Stat label="מענה מתוך חיוגים" value={pct(report.totals.answerRate)} />
            <Stat label="מתעניינים מתוך נענו" value={pct(report.totals.interestRate)} />
            <Stat label="פגישות מתוך מתעניינים" value={pct(report.totals.meetingRate)} />
          </div>

          <div className="rounded-xl border border-amber-400/40 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
            <p className="font-bold">מה לא נמדד — בכוונה</p>
            <ul className="mt-1 list-disc pr-5 text-xs">
              {report.unmeasured.map((item) => (
                <li key={item.label}><span className="font-semibold">{item.label}:</span> {item.reason}</li>
              ))}
            </ul>
            {report.totals.firstActivityAt && (
              <p className="mt-2 text-xs">
                חלון פעילות (ראשונה→אחרונה): {formatStamp(report.totals.firstActivityAt)} – {formatStamp(report.totals.lastActivityAt)}
                {report.totals.activityWindowSeconds > report.totals.measuredWorkSeconds
                  ? ` · פער ${formatDurationSeconds(report.totals.activityWindowSeconds - report.totals.measuredWorkSeconds)} (לא הפסקה מתועדת)`
                  : ''}
              </p>
            )}
          </div>

          <h3 className="font-black">תוצאות שיחות</h3>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {CALL_RESULTS.map((result) => {
              const count = report.calls.filter((c) => c.result === result).length;
              if (!count) return null;
              return <Stat key={result} label={result} value={String(count)} />;
            })}
            {report.calls.some((c) => !c.result) && (
              <Stat label="ללא תוצאה" value={String(report.calls.filter((c) => !c.result).length)} />
            )}
          </div>

          <h3 className="font-black">השוואה בין עובדים</h3>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="p-2 text-right">עובד</th>
                  <th className="p-2 text-right">חלון</th>
                  <th className="p-2 text-right">זמן מדוד</th>
                  <th className="p-2 text-right">זמן שיחות</th>
                  <th className="p-2 text-right">חיוגים</th>
                  <th className="p-2 text-right">נענו</th>
                  <th className="p-2 text-right">מתעניינים</th>
                  <th className="p-2 text-right">חזרות</th>
                  <th className="p-2 text-right">פגישות</th>
                </tr>
              </thead>
              <tbody>
                {report.employees.map((row) => (
                  <tr key={row.employeeId || row.employeeName} className="border-t border-border">
                    <td className="p-2 font-semibold">{row.employeeName}</td>
                    <td className="p-2">{formatTimeRange(row.firstActivityAt, row.lastActivityAt)}</td>
                    <td className="p-2">{formatDurationSeconds(row.measuredWorkSeconds)}</td>
                    <td className="p-2">{formatDurationSeconds(row.callSeconds)}</td>
                    <td className="p-2">{row.dialAttempts}</td>
                    <td className="p-2">{row.answered}</td>
                    <td className="p-2">{row.interested}</td>
                    <td className="p-2">{row.followUps}</td>
                    <td className="p-2">{row.meetings}</td>
                  </tr>
                ))}
                    {report.employees.length === 0 && (
                  <tr><td className="p-3 text-muted-foreground" colSpan={9}>אין פעילות בטווח</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <DetailList title="שיחות — משך כל שיחה" items={report.calls.map((c) => `${formatStamp(c.startedAt)} ${formatTimeRange(c.startedAt, c.endedAt)} · ${c.employeeName} · ${c.companyName || 'ללא שם'} · ${c.result || 'ללא תוצאה'} · ${formatDurationSeconds(c.durationSeconds)}`)} />
          <DetailList title="משימות שאינן שיחה" items={report.work.map((s) => `${formatStamp(s.startedAt)} ${formatTimeRange(s.startedAt, s.endedAt)} · ${s.employeeName} · ${s.taskType || 'משימה'} · ${s.companyName || 'ללא לקוח'} · ${formatDurationSeconds(s.durationSeconds)}`)} />
          <DetailList title="לקוחות לחזרה" items={report.followUps.map((f) => `${f.companyName} · ${f.employeeName} · חזרה ${f.dueDate}${f.dueTime ? ` ${f.dueTime}` : ''} · נוצר ${formatStamp(f.createdAt)}`)} />
          <DetailList title="פגישות שנקבעו" items={report.meetings.map((m) => `${m.companyName} · ${m.employeeName} · ${m.when}`)} />
          <DetailList title="לא מעוניינים" items={report.notInterested.map((n) => `${formatStamp(n.at)} · ${n.companyName} · ${n.employeeName} · ${n.reason}`)} />
          <DetailList title="מתעניינים" items={report.interested.map((n) => `${formatStamp(n.at)} · ${n.companyName} · ${n.employeeName} · ${n.result}`)} />
          <DetailList title="לידים חמים" items={report.hotLeads.map((n) => `${formatStamp(n.at)} · ${n.companyName} · ${n.employeeName} · ${n.rating}`)} />
          <DetailList title="הערות עובד" items={report.notes.map((n) => `${formatStamp(n.at)} · ${n.companyName} · ${n.employeeName} — ${n.note}`)} />
          <DetailList title="דיווחים / פניות לצוות דליה" items={report.daliaReports.map((c) => `${formatStamp(c.openedAt)}${c.closedAt ? `–${formatStamp(c.closedAt)}` : '–פתוח'} · ${c.agentName} · ${c.careType} · ${c.companyName || 'ללא לקוח'} · ${c.status}`)} />
        </>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-black">{value}</p>
    </div>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="mb-2 font-black">{title} ({items.length})</h3>
      {items.length === 0 && <p className="text-sm text-muted-foreground">אין רשומות</p>}
      <ul className="space-y-1 text-sm">
        {items.slice(0, 80).map((line, i) => (
          <li key={`${title}-${i}`} className="rounded-lg border border-border p-2">{line}</li>
        ))}
      </ul>
    </div>
  );
}
