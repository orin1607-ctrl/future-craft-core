import { formatClock, formatDay, formatDurationSeconds, formatStamp, formatTimeRange } from '@/features/telemarketing/lib/formatTime';

export function TimeStampMeta({
  startedAt,
  endedAt,
  durationSeconds,
  employeeName,
  extra,
}: {
  startedAt?: string | null;
  endedAt?: string | null;
  durationSeconds?: number | null;
  employeeName?: string | null;
  extra?: string | null;
}) {
  if (!startedAt && !employeeName && !extra) return null;
  const showRange = endedAt !== undefined;
  return (
    <p className="text-xs text-muted-foreground">
      {startedAt ? `${formatDay(startedAt)} · ${showRange ? formatTimeRange(startedAt, endedAt) : formatClock(startedAt)}` : ''}
      {durationSeconds != null ? ` · משך ${formatDurationSeconds(durationSeconds)}` : ''}
      {employeeName ? ` · ${employeeName}` : ''}
      {extra ? ` · ${extra}` : ''}
    </p>
  );
}

export function TimeStampLines({
  startedAt,
  endedAt,
  durationSeconds,
  employeeName,
  createdAt,
  completedAt,
}: {
  startedAt?: string | null;
  endedAt?: string | null;
  durationSeconds?: number | null;
  employeeName?: string | null;
  createdAt?: string | null;
  completedAt?: string | null;
}) {
  return (
    <ul className="space-y-0.5 text-xs text-muted-foreground">
      {employeeName && <li>עובד: {employeeName}</li>}
      {createdAt && <li>נוצר: {formatStamp(createdAt)}</li>}
      {startedAt && <li>התחלה: {formatStamp(startedAt)}</li>}
      {endedAt && <li>סיום: {formatStamp(endedAt)}</li>}
      {startedAt && !endedAt && <li>סיום: פעיל</li>}
      {durationSeconds != null && <li>משך: {formatDurationSeconds(durationSeconds)}</li>}
      {completedAt && <li>הושלם: {formatStamp(completedAt)}</li>}
    </ul>
  );
}
