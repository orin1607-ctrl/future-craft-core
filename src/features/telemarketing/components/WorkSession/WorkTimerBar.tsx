import { Briefcase, Square } from 'lucide-react';
import { formatDay, formatStamp } from '@/features/telemarketing/lib/formatTime';

interface Props {
  status: 'idle' | 'in_progress' | 'ended';
  elapsedSeconds: number;
  reportElapsedSeconds?: number;
  starting: boolean;
  startedAt?: string | null;
  endedAt?: string | null;
  employeeName?: string | null;
  locked?: boolean;
  onStart: () => void;
  onEnd: () => void;
}

function formatMMSS(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function WorkTimerBar({ status, elapsedSeconds, reportElapsedSeconds = 0, starting, startedAt, endedAt, employeeName, locked = false, onStart, onEnd }: Props) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {status === 'idle' && (
        <button
          type="button"
          data-testid="tele-start-work"
          onClick={onStart}
          disabled={starting || locked}
          title={locked ? 'עבור למצב עבודה' : undefined}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-sky-700 py-4 text-lg font-bold text-white active:scale-[0.99] disabled:opacity-50"
        >
          <Briefcase size={22} />
          {starting ? 'מתחיל משימה...' : 'התחל משימת עבודה'}
        </button>
      )}
      {status === 'in_progress' && (
        <div className="text-center">
          <p className="mb-2 text-sm text-muted-foreground">משימת עבודה פעילה</p>
          <p className="mb-3 font-mono text-3xl font-bold text-foreground">{formatMMSS(elapsedSeconds)}</p>
          {startedAt && (
            <p className="mb-3 text-xs text-muted-foreground">
              {formatDay(startedAt)} · התחלה {formatStamp(startedAt)}
              {employeeName ? ` · ${employeeName}` : ''}
            </p>
          )}
          <button
            type="button"
            data-testid="tele-end-work"
            onClick={onEnd}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-destructive py-4 text-lg font-bold text-destructive-foreground"
          >
            <Square size={20} />
            סיום משימת עבודה
          </button>
        </div>
      )}
      {status === 'ended' && (
        <div className="text-center text-sm font-semibold text-muted-foreground">
          <p data-testid="tele-work-duration">המשימה הסתיימה — משך {formatMMSS(elapsedSeconds)} · יש להשלים דיווח למטה</p>
          <p className="mt-1 font-mono text-xl font-black text-foreground" data-testid="tele-work-report-duration">זמן דיווח {formatMMSS(reportElapsedSeconds)}</p>
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
