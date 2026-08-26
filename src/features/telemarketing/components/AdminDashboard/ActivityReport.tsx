import { useCallback, useEffect, useState } from 'react';
import { localDateStr } from '@/features/telemarketing/lib/localDate';
import { formatDay, formatDurationSeconds, formatStamp, formatTimeRange } from '@/features/telemarketing/lib/formatTime';
import { loadActivityReport, groupActivityByDay, quoteCount, uniqueLeadCount } from '@/features/telemarketing/services/activityReportService';
import type { ActivityFilters, ActivityReport, LeadActivityDetail } from '@/features/telemarketing/services/activityReportService';
import { CALL_RESULTS } from '@/features/telemarketing/types';
import { formatLeadTitle } from '@/features/telemarketing/lib/leadLabel';
import { buildTimingSnapshot } from '@/features/telemarketing/lib/callTiming';
import { TeleInnerNav, useRegisterTeleCloser } from '@/features/telemarketing/components/Nav/TeleInnerNav';
import { WorkDaySummary } from '@/features/telemarketing/components/ActivityReport/WorkDaySummary';

const EMPTY: ActivityFilters = {
  from: localDateStr(),
  to: localDateStr(),
  employeeName: '',
  result: '',
  status: '',
  leadQuery: '',
};

function pct(value: number | null): string {
  return value == null ? '-' : `${value}%`;
}

function unmeasuredLabel(value: number | null | undefined): string {
  return value == null ? 'לא נמדד' : formatDurationSeconds(value);
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
  }, [filters.from, filters.to, filters.employeeName, filters.result, filters.status, filters.leadQuery]);

  const employees = report?.employeeNames ?? [];
  const showLeadScreen = Boolean(report?.leadDetail);
  const clearLeadQuery = useCallback(() => {
    setFilters((f) => ({ ...f, leadQuery: '' }));
    requestAnimationFrame(() => {
      document.getElementById('activity-report')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);
  useRegisterTeleCloser(showLeadScreen, clearLeadQuery);

  return (
    <section id="activity-report" className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-xl font-black">דוח פעילות וביצועי עובד</h2>
      <p className="text-xs text-muted-foreground">
        כל המספרים מגיעים משיחות, משימות, Follow-up ופניות דליה שנשמרו. אין נתונים מומצאים. סה״כ זמן עבודה סופר כל שנייה פעם אחת (טיפול = שיחה + דיווח).
      </p>
      <div className="grid gap-2 md:grid-cols-5">
        <label className="text-xs font-semibold">
          מתאריך
          <input type="date" data-testid="activity-from-date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-2" />
        </label>
        <label className="text-xs font-semibold">
          עד תאריך
          <input type="date" data-testid="activity-to-date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-2" />
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
        <select data-testid="activity-employee-filter" value={filters.employeeName} onChange={(e) => setFilters((f) => ({ ...f, employeeName: e.target.value }))} className="min-h-12 rounded-lg border border-border bg-background p-2 text-sm">
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
        <label className="text-xs font-semibold md:col-span-2">
          ליד / שם חברה
          <input
            type="search"
            data-testid="activity-lead-query"
            value={filters.leadQuery || ''}
            onChange={(e) => setFilters((f) => ({ ...f, leadQuery: e.target.value }))}
            placeholder="מספר ליד או שם חברה"
            className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-2"
          />
        </label>
      </div>
      {loading && <p className="text-sm text-muted-foreground">טוען דוח...</p>}
      {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
      {report && showLeadScreen && report.leadDetail && (
        <div data-testid="tele-internal-card">
          <TeleInnerNav onBack={clearLeadQuery} />
          <LeadDetailCard detail={report.leadDetail} />
        </div>
      )}
      {report && !showLeadScreen && (
        <>
          {filters.employeeName && (
            <WorkDaySummary
              title={filters.from === filters.to ? `סיכום יום עבודה — ${formatDay(filters.from)}` : `סיכום תקופה — ${formatDay(filters.from)} – ${formatDay(filters.to)}`}
              row={report.employees[0] || report.totals}
              leadCount={uniqueLeadCount(report.calls)}
              quotes={quoteCount(report.calls)}
              days={groupActivityByDay(report)}
              onSelectDay={(day) => setFilters((f) => ({ ...f, from: day, to: day }))}
            />
          )}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4" data-testid="activity-totals">
            <Stat label="ניסיונות חיוג" value={String(report.totals.dialAttempts)} />
            <Stat label="נענו" value={String(report.totals.answered)} />
            <Stat label="לא ענו" value={String(report.totals.noAnswer)} />
            <Stat label="מספר שגוי" value={String(report.totals.wrongNumber)} />
            <Stat label="המשך טיפול" value={String(report.totals.continuedTreatments)} />
            <Stat label="מתעניינים" value={String(report.totals.interested)} />
            <Stat label="לידים חמים/דחופים" value={String(report.totals.hotLeads)} />
            <Stat label="פגישות (רוצה פגישה)" value={String(report.totals.meetings)} />
            <Stat label="לא מעוניינים" value={String(report.totals.notInterested)} />
            <Stat label="חזרות בטווח" value={String(report.totals.followUps)} />
            <Stat label="פניות דליה" value={String(report.totals.daliaReports)} />
            <Stat label="משך שיחות" value={formatDurationSeconds(report.totals.callSeconds)} />
            <Stat label="זמן דיווחי שיחה" value={formatDurationSeconds(report.totals.reportSeconds)} />
            <Stat label="סה״כ טיפול בשיחות" value={formatDurationSeconds(report.totals.callTreatmentSeconds)} />
            <Stat label="זמן משימות" value={formatDurationSeconds(report.totals.workSeconds)} />
            <Stat label="דיווחי משימות" value={formatDurationSeconds(report.totals.workReportSeconds)} />
            <Stat label="טיפול במשימות" value={formatDurationSeconds(report.totals.workTreatmentSeconds)} />
            <Stat label="סה״כ זמן עבודה מדוד" value={formatDurationSeconds(report.totals.measuredWorkSeconds)} />
            <Stat label="משך פניות דליה" value={unmeasuredLabel(report.totals.daliaSeconds)} />
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
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="p-2 text-right">עובד</th>
                  <th className="p-2 text-right">חלון</th>
                  <th className="p-2 text-right">זמן מדוד</th>
                  <th className="p-2 text-right">שיחות</th>
                  <th className="p-2 text-right">דיווח שיחה</th>
                  <th className="p-2 text-right">טיפול שיחות</th>
                  <th className="p-2 text-right">משימות</th>
                  <th className="p-2 text-right">חיוגים</th>
                  <th className="p-2 text-right">נענו</th>
                  <th className="p-2 text-right">לא ענה</th>
                  <th className="p-2 text-right">המשך טיפול</th>
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
                    <td className="p-2">{formatDurationSeconds(row.reportSeconds)}</td>
                    <td className="p-2">{formatDurationSeconds(row.callTreatmentSeconds)}</td>
                    <td className="p-2">{formatDurationSeconds(row.workTreatmentSeconds)}</td>
                    <td className="p-2">{row.dialAttempts}</td>
                    <td className="p-2">{row.answered}</td>
                    <td className="p-2">{row.noAnswer}</td>
                    <td className="p-2">{row.continuedTreatments}</td>
                    <td className="p-2">{row.interested}</td>
                    <td className="p-2">{row.followUps}</td>
                    <td className="p-2">{row.meetings}</td>
                  </tr>
                ))}
                {report.employees.length === 0 && (
                  <tr><td className="p-3 text-muted-foreground" colSpan={14}>אין פעילות בטווח</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <DetailList
            title="שיחות — משך כל ניסיון"
            items={report.calls.map((c) => {
              const snap = buildTimingSnapshot(c);
              return `${formatStamp(c.startedAt)} ${formatLeadTitle(c.leadNumber, c.companyName)} · ${c.employeeName} · ${c.result || 'ללא תוצאה'} · שיחה ${formatDurationSeconds(snap.callSeconds)} · דיווח ${formatDurationSeconds(c.status === 'completed' ? snap.reportSeconds : 0)} · טיפול ${formatDurationSeconds(c.status === 'completed' ? snap.treatmentSeconds : 0)} · סיום שיחה ${formatStamp(c.endedAt)} · סיום טיפול ${formatStamp(c.treatedEndedAt || c.reportEndedAt)}`;
            })}
          />
          <DetailList title="משימות שאינן שיחה" items={report.work.map((s) => {
            const snap = buildTimingSnapshot(s);
            return `${formatStamp(s.startedAt)} ${formatLeadTitle(s.leadNumber, s.companyName)} · ${s.employeeName} · ${s.taskType || 'משימה'} · ביצוע ${formatDurationSeconds(snap.callSeconds)} · דיווח ${formatDurationSeconds(s.status === 'completed' ? snap.reportSeconds : 0)} · טיפול ${formatDurationSeconds(s.status === 'completed' ? snap.treatmentSeconds : 0)}`;
          })} />
          <DetailList title="לקוחות לחזרה" items={report.followUps.map((f) => `${formatLeadTitle(f.leadNumber, f.companyName)} · ${f.employeeName} · חזרה ${f.dueDate}${f.dueTime ? ` ${f.dueTime}` : ''} · נוצר ${formatStamp(f.createdAt)}`)} />
          <DetailList title="פגישות שנקבעו" items={report.meetings.map((m) => `${formatLeadTitle(m.leadNumber, m.companyName)} · ${m.employeeName} · ${m.when}`)} />
          <DetailList title="לא מעוניינים" items={report.notInterested.map((n) => `${formatStamp(n.at)} · ${formatLeadTitle(n.leadNumber, n.companyName)} · ${n.employeeName} · ${n.reason}`)} />
          <DetailList title="מתעניינים" items={report.interested.map((n) => `${formatStamp(n.at)} · ${formatLeadTitle(n.leadNumber, n.companyName)} · ${n.employeeName} · ${n.result}`)} />
          <DetailList title="לידים חמים" items={report.hotLeads.map((n) => `${formatStamp(n.at)} · ${formatLeadTitle(n.leadNumber, n.companyName)} · ${n.employeeName} · ${n.rating}`)} />
          <DetailList title="הערות עובד" items={report.notes.map((n) => `${formatStamp(n.at)} · ${formatLeadTitle(n.leadNumber, n.companyName)} · ${n.employeeName} — ${n.note}`)} />
          <DetailList title="דיווחים / פניות לצוות דליה" items={report.daliaReports.map((c) => `${formatStamp(c.openedAt)} · ${c.agentName} · ${c.careType} · ${formatLeadTitle(c.leadNumber, c.companyName || 'ללא לקוח')} · ${c.status} · זמן כתיבה: לא נמדד`)} />
        </>
      )}
    </section>
  );
}

function LeadDetailCard({ detail }: { detail: LeadActivityDetail }) {
  return (
    <div className="space-y-3 rounded-2xl border border-emerald-700/40 bg-emerald-50 p-4 dark:bg-emerald-950/30" data-testid="activity-lead-detail">
      <h3 className="text-lg font-black" data-testid="activity-lead-title">{formatLeadTitle(detail.leadNumber, detail.companyName)}</h3>
      <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
        <Stat label="עובד משויך" value={detail.assignedName || 'ללא שיוך'} />
        <Stat label="מקור הליד" value={detail.source || '—'} />
        <Stat label="תאריך יצירה" value={formatStamp(detail.createdAt)} />
        <Stat label="סטטוס נוכחי" value={detail.currentStatus || '—'} />
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4" data-testid="activity-lead-totals">
        <Stat label="מספר ניסיונות" value={String(detail.totals.attemptCount)} />
        <Stat label="סה״כ זמן שיחות" value={formatDurationSeconds(detail.totals.callSeconds)} />
        <Stat label="סה״כ זמן דיווח" value={formatDurationSeconds(detail.totals.reportSeconds)} />
        <Stat label="סה״כ זמן טיפול בליד" value={formatDurationSeconds(detail.totals.treatmentSeconds)} />
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-background">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="p-2 text-right">ניסיון</th>
              <th className="p-2 text-right">תאריך</th>
              <th className="p-2 text-right">התחלת טיפול</th>
              <th className="p-2 text-right">סיום שיחה</th>
              <th className="p-2 text-right">זמן שיחה</th>
              <th className="p-2 text-right">זמן דיווח</th>
              <th className="p-2 text-right">סיום טיפול</th>
              <th className="p-2 text-right">סה״כ</th>
              <th className="p-2 text-right">עובד</th>
              <th className="p-2 text-right">תוצאה</th>
            </tr>
          </thead>
          <tbody>
            {detail.attempts.map((row) => (
              <tr key={row.callId} className="border-t border-border" data-testid={`activity-lead-attempt-${row.attempt}`}>
                <td className="p-2 font-semibold">{row.attempt}</td>
                <td className="p-2">{row.date}</td>
                <td className="p-2">{formatStamp(row.startedAt)}</td>
                <td className="p-2">{formatStamp(row.callEndedAt)}</td>
                <td className="p-2">{formatDurationSeconds(row.callSeconds)}</td>
                <td className="p-2">{formatDurationSeconds(row.reportSeconds)}</td>
                <td className="p-2">{formatStamp(row.treatedEndedAt)}</td>
                <td className="p-2 font-bold">{formatDurationSeconds(row.treatmentSeconds)}</td>
                <td className="p-2">{row.employeeName}</td>
                <td className="p-2">{row.result || '—'}</td>
              </tr>
            ))}
            {detail.attempts.length === 0 && (
              <tr><td className="p-3 text-muted-foreground" colSpan={10}>אין ניסיונות בטווח שנבחר</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {detail.attempts.map((row) => (
        (row.notes || row.followUp || row.leadRating) ? (
          <p key={`${row.callId}-meta`} className="text-xs text-muted-foreground">
            ניסיון {row.attempt}: {row.leadRating || ''}{row.notes ? ` · ${row.notes}` : ''}{row.followUp ? ` · Follow-up ${row.followUp}` : ''}
          </p>
        ) : null
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-3" data-stat-label={label}>
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
