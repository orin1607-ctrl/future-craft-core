import { cn } from '@/lib/utils';
import type { SummaryFilterKey } from '@/lib/vehicleTrackingData';

const DEFS: { key: SummaryFilterKey; label: string; color: string }[] = [
  { key: 'total', label: 'סה"כ רכבים', color: 'text-primary' },
  { key: 'active', label: 'רכבים פעילים', color: 'text-success' },
  { key: 'service', label: 'בטיפול', color: 'text-warning' },
  { key: 'transport', label: 'בשינוע', color: 'text-info' },
  { key: 'accident', label: 'בתאונה', color: 'text-destructive' },
  { key: 'defect', label: 'עם ליקויים', color: 'text-warning' },
  { key: 'fault', label: 'עם תקלה', color: 'text-warning' },
  { key: 'alert', label: 'עם התראות', color: 'text-warning' },
  { key: 'garage', label: 'במוסך', color: 'text-warning' },
  { key: 'disabled', label: 'מושבתים', color: 'text-muted-foreground' },
  { key: 'nodriver', label: 'ללא נהג', color: 'text-muted-foreground' },
  { key: 'testSoon', label: 'טסט קרוב', color: 'text-warning' },
  { key: 'insSoon', label: 'ביטוח קרוב', color: 'text-destructive' },
  { key: 'km', label: 'חריגת ק"מ', color: 'text-warning' },
];

export default function TrackingSummaryGrid({
  counts,
  activeKey,
  onSelect,
}: {
  counts: Record<SummaryFilterKey, number>;
  activeKey: SummaryFilterKey | null;
  onSelect: (key: SummaryFilterKey) => void;
}) {
  return (
    <div>
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">סיכום צי</p>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2">
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
