import { cn } from '@/lib/utils';
import type { DriverValidityKey } from '@/lib/driverTrackingData';

const DEFS: { key: DriverValidityKey; label: string; color: string }[] = [
  { key: 'license_soon', label: 'רישיונות נהיגה – עומדים לפוג', color: 'text-warning' },
  { key: 'exam_renewal', label: 'מבחני נהיגה – נדרש חידוש', color: 'text-warning' },
  { key: 'health_soon', label: 'הצהרות בריאות – עומדות לפוג', color: 'text-warning' },
  { key: 'safety_renewal', label: 'הדרכות בטיחות – נדרש חידוש', color: 'text-warning' },
  { key: 'document_soon', label: 'מסמכי נהגים – עומדים לפוג', color: 'text-warning' },
  { key: 'expired', label: 'תוקף שעבר – דורש טיפול', color: 'text-destructive' },
];

export default function DriverTrackingExpiryGrid({
  counts,
  activeKey,
  onSelect,
}: {
  counts: Record<DriverValidityKey, number>;
  activeKey: DriverValidityKey | null;
  onSelect: (key: DriverValidityKey) => void;
}) {
  return (
    <div>
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">תוקפים ומועדי חידוש</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
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
