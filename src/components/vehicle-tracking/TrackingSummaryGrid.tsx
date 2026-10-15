import { cn } from '@/lib/utils';
import type { SummaryFilterKey } from '@/lib/vehicleTrackingData';

const DEFS: { key: SummaryFilterKey; label: string; color?: string }[] = [
  { key: 'total', label: 'סה"כ רכבים', color: 'text-primary' },
  { key: 'officerAlert', label: 'התראות קצין רכב' },
  { key: 'active', label: 'רכבים פעילים', color: 'text-success' },
  { key: 'service', label: 'בטיפול', color: 'text-warning' },
  { key: 'transport', label: 'בשינוע', color: 'text-info' },
  { key: 'accident', label: 'בתאונה', color: 'text-destructive' },
  { key: 'defect', label: 'רכבים עם ליקויים', color: 'text-warning' },
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
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-8 gap-2">
        {DEFS.map(({ key, label, color }) => {
          const isOfficer = key === 'officerAlert';
          const officerAlertCount = counts.officerAlert || 0;
          const hasOfficerAlerts = isOfficer && officerAlertCount > 0;
          const numColor = isOfficer
            ? hasOfficerAlerts
              ? 'text-destructive'
              : 'text-muted-foreground'
            : (color || 'text-primary');

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className={cn(
                'card-elevated text-right p-3 min-h-[72px] transition-all hover:shadow-lg',
                hasOfficerAlerts && 'border-destructive/40 bg-destructive/5 hover:border-destructive/60',
                activeKey === key && (hasOfficerAlerts ? 'border-2 border-destructive bg-destructive/10' : 'border-2 border-primary bg-primary/5'),
              )}
            >
              <p className={cn('text-2xl font-black leading-none mb-1', numColor)}>{counts[key]}</p>
              <p className="text-[11px] text-muted-foreground leading-snug">{label}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
