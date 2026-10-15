import { cn } from '@/lib/utils';
import type { DriverSummaryKey } from '@/lib/driverTrackingData';

const DEFS: { key: DriverSummaryKey; label: string; color: string }[] = [
  { key: 'total', label: 'סה"כ נהגים', color: 'text-primary' },
  { key: 'open', label: 'התראות פתוחות', color: 'text-warning' },
  { key: 'overdue', label: 'באיחור', color: 'text-destructive' },
  { key: 'in_progress', label: 'בטיפול', color: 'text-warning' },
  { key: 'completed', label: 'הושלמו', color: 'text-success' },
];

export default function DriverTrackingSummaryGrid({
  counts,
  activeKey,
  onSelect,
}: {
  counts: Record<DriverSummaryKey, number>;
  activeKey: DriverSummaryKey | null;
  onSelect: (key: DriverSummaryKey) => void;
}) {
  return (
    <div>
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">סיכום נהגים</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        {DEFS.map(({ key, label, color }) => (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            className={cn(
              'card-elevated text-right p-3 min-h-[72px] transition-all hover:shadow-lg',
              activeKey === key && 'border-2 border-primary bg-primary/5',
            )}
          >
            <p className={cn('text-2xl font-black leading-none mb-1', color)}>{counts[key]}</p>
            <p className="text-[11px] text-muted-foreground leading-snug">{label}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
