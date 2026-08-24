import { Phone, Square } from 'lucide-react';
import { formatDay, formatStamp } from '@/features/telemarketing/lib/formatTime';

interface Props {
  status: 'idle' | 'in_progress' | 'ended';
  elapsedSeconds: number;
  starting: boolean;
  isRecording?: boolean;
  startedAt?: string | null;
  endedAt?: string | null;
  employeeName?: string | null;
  onStart: () => void;
  onEnd: () => void;
}

function formatMMSS(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function CallTimerBar({ status, elapsedSeconds, starting, isRecording = false, startedAt, endedAt, employeeName, onStart, onEnd }: Props) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {status === 'idle' && (
        <button
          type="button"
          onClick={onStart}
          disabled={starting}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-4 text-lg font-bold text-white active:scale-[0.99] disabled:opacity-50"
        >
          <Phone size={22} />
          {starting ? 'מתחיל שיחה...' : 'התחל שיחה'}
        </button>
      )}

      {status === 'in_progress' && (
        <div className="text-center">
          <p className="mb-2 text-sm text-muted-foreground">השיחה פעילה</p>
          {isRecording && (
            <p className="mb-2 text-sm font-bold text-destructive" aria-live="polite">
              🔴 מקליט
            </p>
          )}
          <p className="mb-3 font-mono text-3xl font-bold text-foreground">{formatMMSS(elapsedSeconds)}</p>
          {startedAt && (
            <p className="mb-3 text-xs text-muted-foreground">
              {formatDay(startedAt)} · התחלה {formatStamp(startedAt)}
              {employeeName ? ` · ${employeeName}` : ''}
            </p>
          )}
          <button
            type="button"
            onClick={onEnd}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-destructive py-4 text-lg font-bold text-destructive-foreground active:scale-[0.99]"
          >
            <Square size={20} />
            סיום שיחה
          </button>
        </div>
      )}

      {status === 'ended' && (
        <div className="text-center text-sm font-semibold text-muted-foreground">
          השיחה הסתיימה — משך {formatMMSS(elapsedSeconds)} · יש להשלים דיווח למטה
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
