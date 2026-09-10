import { Phone, Square } from 'lucide-react';
import { formatDay, formatStamp } from '@/features/telemarketing/lib/formatTime';
import {
  capReportDurationSeconds,
  REPORT_DURATION_CAP_SECONDS,
  reportDurationPhase,
} from '@/features/telemarketing/lib/callLifecycle';

interface Props {
  status: 'idle' | 'in_progress' | 'ended';
  elapsedSeconds: number;
  reportElapsedSeconds?: number;
  starting: boolean;
  isRecording?: boolean;
  startedAt?: string | null;
  endedAt?: string | null;
  employeeName?: string | null;
  leadLabel?: string | null;
  locked?: boolean;
  canVoidUnstarted?: boolean;
  voiding?: boolean;
  onStart: () => void;
  onEnd: () => void;
  onVoidUnstarted?: () => void;
}

function formatMMSS(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function CallTimerBar({
  status,
  elapsedSeconds,
  reportElapsedSeconds = 0,
  starting,
  isRecording = false,
  startedAt,
  endedAt,
  employeeName,
  leadLabel,
  locked = false,
  canVoidUnstarted = false,
  voiding = false,
  onStart,
  onEnd,
  onVoidUnstarted,
}: Props) {
  const displayReport = capReportDurationSeconds(reportElapsedSeconds);
  const phase = reportDurationPhase(reportElapsedSeconds);
  return (
    <div className="rounded-2xl border border-border bg-card p-4" data-report-cap-seconds={REPORT_DURATION_CAP_SECONDS}>
      {status === 'idle' && (
        <button
          type="button"
          data-testid="tele-start-call"
          onClick={onStart}
          disabled={starting || locked}
          title={locked ? 'עבור למצב עבודה' : undefined}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-4 text-lg font-bold text-white active:scale-[0.99] disabled:opacity-50"
        >
          <Phone size={22} />
          {starting ? 'מתחיל שיחה...' : 'התחל שיחה'}
        </button>
      )}

      {status === 'in_progress' && (
        <div className="text-center">
          <p className="mb-2 text-sm text-muted-foreground">השיחה פעילה</p>
          {leadLabel && <p className="mb-2 text-base font-black" data-testid="tele-lead-number">{leadLabel}</p>}
          {isRecording && (
            <p className="mb-2 text-sm font-bold text-destructive" aria-live="polite">
              🔴 מקליט
            </p>
          )}
          <p className="mb-3 font-mono text-3xl font-bold text-foreground" data-testid="tele-call-duration">{formatMMSS(elapsedSeconds)}</p>
          {startedAt && (
            <p className="mb-3 text-xs text-muted-foreground">
              {formatDay(startedAt)} · התחלה {formatStamp(startedAt)}
              {employeeName ? ` · ${employeeName}` : ''}
            </p>
          )}
          <button
            type="button"
            data-testid="tele-end-call"
            onClick={onEnd}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-destructive py-4 text-lg font-bold text-destructive-foreground active:scale-[0.99]"
          >
            <Square size={20} />
            סיום שיחה
          </button>
          {canVoidUnstarted && onVoidUnstarted && (
            <button
              type="button"
              data-testid="tele-void-unstarted-call"
              onClick={onVoidUnstarted}
              disabled={voiding || locked}
              className="mt-2 flex min-h-12 w-full items-center justify-center rounded-xl border-2 border-border bg-background px-4 text-base font-black disabled:opacity-50"
            >
              {voiding ? 'מבטל...' : 'ביטול — השיחה לא התחילה'}
            </button>
          )}
        </div>
      )}

      {status === 'ended' && (
        <div className="text-center text-sm font-semibold text-muted-foreground">
          <p data-testid="tele-call-duration">השיחה הסתיימה — משך {formatMMSS(elapsedSeconds)} · יש להשלים דיווח למטה</p>
          <p className="mt-1 font-mono text-xl font-black text-foreground" data-testid="tele-report-duration">
            זמן דיווח {formatMMSS(displayReport)} / 03:00
          </p>
          {phase === 'warn' && (
            <p className="mt-2 rounded-lg bg-amber-100 p-2 text-sm font-black text-amber-900 dark:bg-amber-950/40 dark:text-amber-100" data-testid="tele-report-warn">
              נותרו 30 שניות לדיווח. סיימו עכשיו — הטקסט שנכתב נשמר.
            </p>
          )}
          {phase === 'cap' && (
            <p className="mt-2 rounded-lg bg-destructive/15 p-2 text-sm font-black text-destructive" data-testid="tele-report-cap">
              הגעתם לגבול 3 דקות. הזמן שנשמר לדיווח הוא 03:00. הטופס לא נמחק — יש לשלוח עכשיו.
            </p>
          )}
          {startedAt && (
            <p className="mt-1 text-xs font-normal">
              {formatDay(startedAt)} · {formatStamp(startedAt)} – {endedAt ? formatStamp(endedAt) : 'סיום'}
              {employeeName ? ` · ${employeeName}` : ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
