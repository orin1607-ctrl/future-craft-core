import { formatClock, formatDay, formatDurationSeconds, formatStamp, formatTimeRange } from '@/features/telemarketing/lib/formatTime';
import type { EmployeeActivityRow, WorkDaySlice } from '@/features/telemarketing/services/activityReportService';

function pct(value: number | null): string {
  return value == null ? '-' : `${value}%`;
}

function unmeasured(value: number | null | undefined): string {
  return value == null ? 'לא נמדד' : formatDurationSeconds(value);
}

export function WorkDaySummary({
  title,
  row,
  leadCount,
  quotes,
  days,
  onSelectDay,
}: {
  title: string;
  row: EmployeeActivityRow;
  leadCount: number;
  quotes: number;
  days?: WorkDaySlice[];
  onSelectDay?: (day: string) => void;
}) {
  const multi = (days?.length || 0) > 1;
  return (
    <section className="space-y-3 rounded-2xl border-2 border-primary/40 bg-card p-3" data-testid="workday-summary">
      <div>
        <h3 className="text-center text-lg font-black">{title}</h3>
        <p className="mt-1 text-center text-xs text-muted-foreground">
          חלון הפעילות הוא המרחק בין הפעילות הראשונה לאחרונה. זמן העבודה המדוד סופר רק שיחה + דיווח + משימות, כל שנייה פעם אחת. הפער אינו הפסקה.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Hero testId="workday-summary-first" label="פעילות ראשונה" value={formatStamp(row.firstActivityAt)} raw={row.firstActivityAt || ''} />
        <Hero testId="workday-summary-last" label="פעילות אחרונה" value={formatStamp(row.lastActivityAt)} raw={row.lastActivityAt || ''} />
        <Hero
          testId="workday-summary-window"
          label="חלון פעילות"
          value={formatDurationSeconds(row.activityWindowSeconds)}
          raw={String(row.activityWindowSeconds)}
          hint={formatTimeRange(row.firstActivityAt, row.lastActivityAt)}
          emphasize="window"
        />
        <Hero
          testId="workday-summary-measured"
          label="זמן עבודה מדוד בפועל"
          value={formatDurationSeconds(row.measuredWorkSeconds)}
          raw={String(row.measuredWorkSeconds)}
          hint="שיחות + דיווחים + משימות שנמדדו אוטומטית"
          emphasize="measured"
        />
        {(row.historicalSeconds || 0) > 0 && (
          <Hero
            testId="workday-summary-historical"
            label="זמן היסטורי / הוזן ידנית"
            value={formatDurationSeconds(row.historicalSeconds)}
            raw={String(row.historicalSeconds)}
            hint="לא נמדד אוטומטית. אין שעות התחלה/סיום."
            emphasize="historical"
          />
        )}
      </div>
      <div className="grid grid-cols-2 gap-2" data-testid="workday-summary-times">
        <Mini testId="workday-summary-callsec" label="זמן שיחות" value={formatDurationSeconds(row.callSeconds)} raw={String(row.callSeconds)} />
        <Mini testId="workday-summary-reportsec" label="זמן דיווח שיחות" value={formatDurationSeconds(row.reportSeconds)} raw={String(row.reportSeconds)} />
        <Mini testId="workday-summary-treatsec" label="טיפול כולל בשיחות" value={formatDurationSeconds(row.callTreatmentSeconds)} raw={String(row.callTreatmentSeconds)} />
        <Mini testId="workday-summary-worksec" label="זמן משימות" value={formatDurationSeconds(row.workSeconds)} raw={String(row.workSeconds)} />
        <Mini testId="workday-summary-workreportsec" label="דיווחי משימות" value={formatDurationSeconds(row.workReportSeconds)} raw={String(row.workReportSeconds)} />
        <Mini testId="workday-summary-worktreatsec" label="טיפול כולל במשימות" value={formatDurationSeconds(row.workTreatmentSeconds)} raw={String(row.workTreatmentSeconds)} />
        {(row.historicalSeconds || 0) > 0 && (
          <Mini testId="workday-summary-histsec" label="זמן היסטורי / הוזן ידנית" value={formatDurationSeconds(row.historicalSeconds)} raw={String(row.historicalSeconds)} />
        )}
      </div>
      <div className="grid grid-cols-3 gap-2" data-testid="workday-summary-counts">
        <Mini testId="workday-summary-leads" label="לידים שטופלו" value={String(leadCount)} raw={String(leadCount)} />
        <Mini testId="workday-summary-dials" label="ניסיונות חיוג" value={String(row.dialAttempts)} raw={String(row.dialAttempts)} />
        <Mini testId="workday-summary-answered" label="נענו" value={String(row.answered)} raw={String(row.answered)} />
        <Mini testId="workday-summary-noanswer" label="לא נענו" value={String(row.noAnswer)} raw={String(row.noAnswer)} />
        <Mini testId="workday-summary-continued" label="המשך טיפול" value={String(row.continuedTreatments)} raw={String(row.continuedTreatments)} />
        <Mini testId="workday-summary-followups" label="Follow-up" value={String(row.followUps)} raw={String(row.followUps)} />
        <Mini testId="workday-summary-interested" label="מתעניינים" value={String(row.interested)} raw={String(row.interested)} />
        <Mini testId="workday-summary-hot" label="לידים חמים" value={String(row.hotLeads)} raw={String(row.hotLeads)} />
        <Mini testId="workday-summary-meetings" label="פגישות" value={String(row.meetings)} raw={String(row.meetings)} />
        <Mini testId="workday-summary-quotes" label="הצעות מחיר" value={String(quotes)} raw={String(quotes)} />
        <Mini testId="workday-summary-dalia" label="פניות 🟣" value={String(row.daliaReports)} raw={String(row.daliaReports)} />
        <Mini testId="workday-summary-daliasec" label="משך פניות דליה" value={unmeasured(row.daliaSeconds)} raw="unmeasured" />
      </div>
      <p className="text-xs text-muted-foreground">
        מענה {pct(row.answerRate)} · מתעניינים {pct(row.interestRate)} · פגישות {pct(row.meetingRate)}
      </p>
      {multi && days && (
        <div className="space-y-2" data-testid="workday-by-day">
          <p className="text-sm font-black">פירוט לפי יום</p>
          {days.map((slice) => (
            <button
              key={slice.day}
              type="button"
              data-testid={`workday-day-${slice.day}`}
              onClick={() => onSelectDay?.(slice.day)}
              className="min-h-12 w-full rounded-xl border border-border bg-background p-3 text-right text-sm"
            >
              <span className="font-black">{formatDay(slice.day)}</span>
              {' | '}
              {formatClock(slice.row.firstActivityAt)}–{formatClock(slice.row.lastActivityAt)}
              {' | '}
              זמן מדוד {formatDurationSeconds(slice.row.measuredWorkSeconds)}
              {(slice.row.historicalSeconds || 0) > 0 ? ` | היסטורי ${formatDurationSeconds(slice.row.historicalSeconds)}` : ''}
              {' | '}
              {slice.row.dialAttempts} חיוגים
              {' | '}
              {slice.leadCount} לידים
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function Hero({
  label,
  value,
  testId,
  raw,
  hint,
  emphasize,
}: {
  label: string;
  value: string;
  testId: string;
  raw: string;
  hint?: string;
  emphasize?: 'window' | 'measured' | 'historical';
}) {
  const cls =
    emphasize === 'measured'
      ? 'border-emerald-600/50 bg-emerald-50 dark:bg-emerald-950/30'
      : emphasize === 'historical'
        ? 'border-sky-600/50 bg-sky-50 dark:bg-sky-950/30'
        : emphasize === 'window'
        ? 'border-amber-500/50 bg-amber-50 dark:bg-amber-950/30'
        : 'border-border bg-background';
  return (
    <div className={`rounded-xl border p-3 ${cls}`} data-testid={testId} data-value={raw} data-stat-label={label}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-black">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Mini({ label, value, testId, raw }: { label: string; value: string; testId: string; raw: string }) {
  return (
    <div className="rounded-xl border border-border p-2" data-testid={testId} data-value={raw} data-stat-label={label}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-black">{value}</p>
    </div>
  );
}
