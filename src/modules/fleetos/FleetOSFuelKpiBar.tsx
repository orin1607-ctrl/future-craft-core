import { cn } from '@/lib/utils';
import type { FleetOSFuelKpis } from './fleetosFuelTypes';

export default function FleetOSFuelKpiBar({ kpis, loading }: { kpis: FleetOSFuelKpis; loading?: boolean }) {
  const tiles = [
    { label: 'עלות דלק', value: loading ? '…' : `₪${kpis.fuel_cost.toLocaleString('he-IL')}`, sub: `${kpis.fuel_count} תדלוקים`, urgent: false },
    { label: 'עלות טעינה', value: loading ? '…' : `₪${kpis.charge_cost.toLocaleString('he-IL')}`, sub: `${kpis.charge_count} טעינות`, urgent: false },
    { label: 'חריגות', value: loading ? '…' : String(kpis.open_anomalies), sub: 'פתוחות', urgent: kpis.open_anomalies > 0 },
    { label: 'ליטרים', value: loading ? '…' : String(kpis.total_liters), sub: 'סה״כ', urgent: false },
    { label: 'קמ/ל׳', value: loading ? '…' : kpis.avg_consumption, sub: 'ממוצע', urgent: false },
    { label: 'חשבוניות חסרות', value: loading ? '…' : String(kpis.missing_invoices), sub: 'לבדיקה', urgent: kpis.missing_invoices > 0 },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
      {tiles.map((t) => (
        <div
          key={t.label}
          className={cn(
            'card-elevated p-3 text-right',
            t.urgent && 'ring-1 ring-destructive/40',
          )}
        >
          <p className="text-[10px] sm:text-xs font-bold text-muted-foreground mb-1 truncate">{t.label}</p>
          <p className={cn('text-xl sm:text-2xl font-black text-primary leading-none', t.urgent && 'text-destructive')}>
            {t.value}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1 font-semibold">{t.sub}</p>
        </div>
      ))}
    </div>
  );
}
