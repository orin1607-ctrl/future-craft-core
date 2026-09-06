import { InternalNumber } from '@/components/vehicles/vehiclePlateDisplay';
import { lastTriInspectionDisplay } from '@/lib/triInspectionDisplay';
import { cn } from '@/lib/utils';

export function TriInspectionMetaCard({
  lastInspectionDate,
  internalNumber,
  year,
}: {
  lastInspectionDate: string | null;
  internalNumber?: string | null;
  year?: number | string | null;
}) {
  const last = lastTriInspectionDisplay(lastInspectionDate);
  const yearText = year === 0 || year == null || String(year).trim() === '' ? '—' : String(year);

  return (
    <div
      className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 space-y-3"
      data-testid="tri-inspection-meta"
    >
      <div>
        <p className="text-sm font-medium text-muted-foreground">בדיקה אחרונה</p>
        <p
          className={cn('text-xl font-black', last.hasDate ? 'text-foreground' : 'text-muted-foreground')}
          data-testid="tri-last-inspection-date"
        >
          {last.dateText}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">התאריך שבו בוצעה בדיקת התלת האחרונה בפועל</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">מספר פנימי</p>
          <p className="text-lg" data-testid="tri-internal-number">
            <InternalNumber value={internalNumber} className="text-lg" />
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">שנת הרכב</p>
          <p className="text-lg font-bold" data-testid="tri-vehicle-year">
            {yearText}
          </p>
        </div>
      </div>
    </div>
  );
}
