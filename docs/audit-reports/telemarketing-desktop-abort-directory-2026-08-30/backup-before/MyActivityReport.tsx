import { useEffect, useMemo, useState } from 'react';
import { localDateStr } from '@/features/telemarketing/lib/localDate';
import { formatDay, formatDurationSeconds, formatStamp, formatTimeRange } from '@/features/telemarketing/lib/formatTime';
import { activityDatePreset, type ActivityDatePreset } from '@/features/telemarketing/lib/activityDatePresets';
import {
  groupActivityByDay,
  groupLeadActivity,
  loadMyActivityReport,
  lockFiltersToSelf,
  quoteCount,
  uniqueWorkedLeadCount,
  type ActivityFilters,
  type ActivityReport,
  type EmployeeActivityRow,
} from '@/features/telemarketing/services/activityReportService';
import { formatLeadTitle } from '@/features/telemarketing/lib/leadLabel';
import { TeleInnerNav, useRegisterTeleCloser } from '@/features/telemarketing/components/Nav/TeleInnerNav';
import { WorkDaySummary } from '@/features/telemarketing/components/ActivityReport/WorkDaySummary';
import { exportToCsv } from '@/utils/exportCsv';

const PRESETS: { id: ActivityDatePreset; label: string }[] = [
  { id: 'today', label: 'היום' },
  { id: 'yesterday', label: 'אתמול' },
  { id: 'week', label: 'השבוע' },
  { id: 'month', label: 'החודש' },
  { id: 'custom', label: 'טווח מותאם' },
];

function pct(value: number | null): string {
  return value == null ? '-' : `${value}%`;
}

export function MyActivityReport({
  employeeName,
  onBack,
  onHome,
}: {
  employeeName: string;
  onBack: () => void;
  onHome: () => void;
}) {
  const today = localDateStr();
  const [preset, setPreset] = useState<ActivityDatePreset>('today');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [fromTime, setFromTime] = useState('');
  const [toTime, setToTime] = useState('');
  const [report, setReport] = useState<ActivityReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [openLead, setOpenLead] = useState<string | null>(null);

  useRegisterTeleCloser(true, onBack);

  const applyPreset = (kind: ActivityDatePreset) => {
    setPreset(kind);
    setFromTime('');
    setToTime('');
    if (kind === 'custom') return;
    const range = activityDatePreset(kind);
    setFrom(range.from);
    setTo(range.to);
  };

  const filters: ActivityFilters = useMemo(
    () =>
      lockFiltersToSelf(
        {
          from,
          to,
          employeeName: '',
          result: '',
          status: '',
          fromTime: fromTime || undefined,
          toTime: toTime || undefined,
        },
        employeeName,
      ),
    [from, to, fromTime, toTime, employeeName],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadMyActivityReport(employeeName, filters)
      .then((next) => {
        if (!cancelled) setReport(next);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'שגיאה בטעינת הדוח');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [employeeName, filters.from, filters.to, filters.fromTime, filters.toTime]);

  const row: EmployeeActivityRow | null = report?.employees[0] || report?.totals || null;
  const leads = report ? groupLeadActivity(report.calls, report.historical) : [];
  const quotes = report ? quoteCount(report.calls) : 0;
  const days = report ? groupActivityByDay(report) : [];
  const singleDay = from === to;
  const periodLabel = singleDay
    ? `${formatDay(from)}${fromTime || toTime ? ` | ${(fromTime || '00:00')}–${(toTime || '23:59')}` : ''}`
    : `${formatDay(from)} – ${formatDay(to)}`;
  const summaryTitle = singleDay ? `סיכום יום עבודה — ${formatDay(from)}` : `סיכום תקופה — ${periodLabel}`;

  const selectDay = (day: string) => {
    setPreset('custom');
    setFrom(day);
    setTo(day);
    setFromTime('');
    setToTime('');
  };

  const exportReport = () => {
    if (!report || !row) return;
    exportToCsv(
      'telemarketing-my-report',
      [
        { key: 'field', label: 'שדה' },
        { key: 'value', label: 'ערך' },
      ],
      [
        { field: 'עובד', value: employeeName },
        { field: 'תקופה', value: periodLabel },
        { field: 'פעילות ראשונה', value: formatStamp(row.firstActivityAt) },
        { field: 'פעילות אחרונה', value: formatStamp(row.lastActivityAt) },
        { field: 'חלון פעילות (משך)', value: formatDurationSeconds(row.activityWindowSeconds) },
        { field: 'חלון פעילות (שעות שעון)', value: formatTimeRange(row.firstActivityAt, row.lastActivityAt) },
        { field: 'סה״כ זמן עבודה מדוד', value: formatDurationSeconds(row.measuredWorkSeconds) },
        { field: 'זמן היסטורי / הוזן ידנית', value: formatDurationSeconds(row.historicalSeconds || 0) },
        { field: 'לידים שטופלו', value: uniqueWorkedLeadCount(report.calls, report.historical) },
        { field: 'ניסיונות חיוג', value: row.dialAttempts },
        { field: 'נענו', value: row.answered },
        { field: 'לא ענו', value: row.noAnswer },
        { field: 'המשך טיפול', value: row.continuedTreatments },
        { field: 'Follow-up', value: row.followUps },
        { field: 'מתעניינים', value: row.interested },
        { field: 'לידים חמים', value: row.hotLeads },
        { field: 'פגישות', value: row.meetings },
        { field: 'הצעות מחיר', value: quotes },
        { field: 'זמן שיחות', value: formatDurationSeconds(row.callSeconds) },
        { field: 'זמן דיווחי שיחה', value: formatDurationSeconds(row.reportSeconds) },
        { field: 'זמן טיפול בשיחות', value: formatDurationSeconds(row.callTreatmentSeconds) },
        { field: 'זמן משימות', value: formatDurationSeconds(row.workSeconds) },
        { field: 'זמן דיווחי משימות', value: formatDurationSeconds(row.workReportSeconds) },
        { field: 'זמן טיפול במשימות', value: formatDurationSeconds(row.workTreatmentSeconds) },
        { field: 'פניות 🟣', value: row.daliaReports },
        { field: 'מענה מתוך חיוגים', value: pct(row.answerRate) },
        { field: 'מתעניינים מתוך נענו', value: pct(row.interestRate) },
        { field: 'פגישות מתוך מתעניינים', value: pct(row.meetingRate) },
        ...days.map((slice) => ({
          field: `יום ${formatDay(slice.day)}`,
          value: `${formatTimeRange(slice.row.firstActivityAt, slice.row.lastActivityAt)} · מדוד ${formatDurationSeconds(slice.row.measuredWorkSeconds)} · ${slice.row.dialAttempts} חיוגים · ${slice.leadCount} לידים`,
        })),
        ...leads.flatMap((lead) => {
          const attempts = lead.attempts.map((a) => ({
            field: `${formatLeadTitle(lead.leadNumber, lead.companyName)} · ניסיון ${a.attempt}`,
            value: `${formatStamp(a.startedAt)} · שיחה ${formatDurationSeconds(a.callSeconds)} · דיווח ${formatDurationSeconds(a.reportSeconds)} · טיפול ${formatDurationSeconds(a.treatmentSeconds)} · ${a.result || 'ללא תוצאה'}${a.followUp ? ` · ${a.followUp}` : ''}`,
          }));
          if ((lead.totals.historicalSeconds || 0) > 0) {
            attempts.push({
              field: `${formatLeadTitle(lead.leadNumber, lead.companyName)} · זמן היסטורי`,
              value: `${formatDurationSeconds(lead.totals.historicalSeconds)} · הוזן ידנית · אין שעות התחלה/סיום`,
            });
          }
          return attempts;
        }),
      ],
    );
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background" data-testid="tele-my-report-screen">
      <div className="sticky top-0 z-10 border-b border-border bg-card p-3">
        <TeleInnerNav onBack={onBack} onHome={onHome} />
        <h2 className="text-center text-xl font-black">📊 הדוח שלי</h2>
        <p className="text-center text-xs text-muted-foreground">{employeeName} · {periodLabel}</p>
      </div>
      <div className="mx-auto w-full max-w-lg flex-1 space-y-3 overflow-y-auto p-4 pb-10">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PRESETS.map((item) => (
            <button
              key={item.id}
              type="button"
              data-testid={`my-report-preset-${item.id}`}
              onClick={() => applyPreset(item.id)}
              className={`min-h-11 rounded-xl px-2 text-sm font-bold ${preset === item.id ? 'bg-primary text-primary-foreground' : 'border border-border'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold">
            מתאריך
            <input type="date" data-testid="my-report-from" value={from} onChange={(e) => { setPreset('custom'); setFrom(e.target.value); }} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background p-2" />
          </label>
          <label className="text-xs font-semibold">
            עד תאריך
            <input type="date" data-testid="my-report-to" value={to} onChange={(e) => { setPreset('custom'); setTo(e.target.value); }} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background p-2" />
          </label>
          {singleDay && (
            <>
              <label className="text-xs font-semibold">
                משעה
                <input type="time" data-testid="my-report-from-time" value={fromTime} onChange={(e) => setFromTime(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background p-2" />
              </label>
              <label className="text-xs font-semibold">
                עד שעה
                <input type="time" data-testid="my-report-to-time" value={toTime} onChange={(e) => setToTime(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background p-2" />
              </label>
            </>
          )}
        </div>
        {loading && <p className="text-sm text-muted-foreground">טוען דוח...</p>}
        {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
        {row && report && (
          <>
            <WorkDaySummary
              title={summaryTitle}
              row={row}
              leadCount={uniqueWorkedLeadCount(report.calls, report.historical)}
              quotes={quotes}
              days={days}
              onSelectDay={selectDay}
            />
            <button type="button" data-testid="my-report-export" onClick={exportReport} className="min-h-12 w-full rounded-xl bg-primary font-black text-primary-foreground">
              הפק דוח / Export
            </button>
            <h3 className="pt-2 text-base font-black">פירוט לידים</h3>
            {leads.length === 0 && <p className="text-sm text-muted-foreground">אין לידים בטווח שנבחר</p>}
            <div className="space-y-2">
              {leads.map((lead) => {
                const key = lead.leadNumber || lead.companyName;
                const open = openLead === key;
                const last = lead.attempts[lead.attempts.length - 1];
                return (
                  <div key={key} className="rounded-xl border border-border bg-card p-3" data-testid="my-report-lead">
                    <button type="button" className="w-full text-right" onClick={() => setOpenLead(open ? null : key)}>
                      <p className="font-black">{formatLeadTitle(lead.leadNumber, lead.companyName)}</p>
                      <p className="text-xs text-muted-foreground">
                        {lead.attempts[0] ? formatStamp(lead.attempts[0].startedAt) : 'זמן היסטורי / הוזן ידנית'}
                        {' · '}שיחה {formatDurationSeconds(lead.totals.callSeconds)} · דיווח {formatDurationSeconds(lead.totals.reportSeconds)} · טיפול {formatDurationSeconds(lead.totals.treatmentSeconds)}
                        {(lead.totals.historicalSeconds || 0) > 0 ? ` · היסטורי ${formatDurationSeconds(lead.totals.historicalSeconds)}` : ''}
                        {' · '}{last?.result || ((lead.totals.historicalSeconds || 0) > 0 ? 'הוזן ידנית' : 'ללא תוצאה')}
                        {last?.followUp ? ` · ${last.followUp}` : ''}
                        {lead.attempts.length > 1 ? ` · ${lead.attempts.length} ניסיונות` : ''}
                      </p>
                    </button>
                    {open && (
                      <ol className="mt-2 space-y-1 text-xs" data-testid="my-report-lead-attempts">
                        {lead.attempts.map((a) => (
                          <li key={a.callId} className="rounded-lg border border-border p-2">
                            ניסיון {a.attempt}: {formatStamp(a.startedAt)} · שיחה {formatDurationSeconds(a.callSeconds)} · דיווח {formatDurationSeconds(a.reportSeconds)} · טיפול {formatDurationSeconds(a.treatmentSeconds)} · {a.result || 'ללא תוצאה'}
                          </li>
                        ))}
                        {(lead.totals.historicalSeconds || 0) > 0 && (
                          <li className="rounded-lg border border-sky-600/40 p-2" data-testid="my-report-lead-historical">
                            זמן היסטורי / הוזן ידנית: {formatDurationSeconds(lead.totals.historicalSeconds)} · אין שעות התחלה/סיום
                          </li>
                        )}
                      </ol>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
