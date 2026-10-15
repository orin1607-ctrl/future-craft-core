import type { KeyboardEvent, SyntheticEvent } from 'react';
import { Link } from 'react-router-dom';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { daysLeftLabel, type DriverAlertItem } from '@/lib/driverTrackingData';

const stop = (e: SyntheticEvent) => e.stopPropagation();

function formatHebrewDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const s = String(isoDate).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

export default function DriverAlertDot({
  alerts,
  driverId,
}: {
  alerts: DriverAlertItem[] | null | undefined;
  driverId?: string;
}) {
  const urgentAlerts = (alerts || []).filter((a) => a.urgent);
  if (urgentAlerts.length === 0) return null;

  const count = urgentAlerts.length;
  const first = urgentAlerts[0];
  const firstDaysText = daysLeftLabel(first.daysLeft);
  const label = `קיימת התראה קרובה או באיחור: ${first.label} (${firstDaysText})${count > 1 ? ` (${count} התראות)` : ''}`;

  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      (e.currentTarget as HTMLElement).click();
    }
  };

  const targetLink = driverId
    ? `/drivers?driverId=${encodeURIComponent(driverId)}&section=documents`
    : '/driver-tracking';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          aria-label={label}
          title={label}
          data-testid="driver-alert-dot"
          onClick={stop}
          onKeyDown={onKeyDown}
          className="group inline-flex shrink-0 min-w-[24px] -my-2 items-center justify-center cursor-pointer align-middle focus:outline-none"
        >
          <span className="inline-flex min-w-[18px] h-[18px] px-1 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold leading-none group-focus-visible:ring-2 group-focus-visible:ring-destructive group-focus-visible:ring-offset-1">
            {count > 1 ? count : null}
          </span>
        </span>
      </PopoverTrigger>
      <PopoverContent
        dir="rtl"
        align="center"
        collisionPadding={12}
        className="w-68 p-3 text-right space-y-2 z-50"
        onClick={stop}
        onPointerDown={stop}
        onKeyDown={stop}
      >
        <p className="text-sm font-bold text-foreground">
          התראות חידוש לנהג
          {count > 1 ? ` · ${count} דורשות טיפול` : ''}
        </p>
        <ul className="space-y-1.5 max-h-48 overflow-y-auto">
          {urgentAlerts.map((a) => (
            <li key={a.id} className="text-xs border-b border-border/40 pb-1 last:border-0 last:pb-0">
              <div className="flex justify-between gap-2 font-medium">
                <span className="truncate">{a.label}</span>
                <span className="font-bold text-destructive shrink-0">{daysLeftLabel(a.daysLeft)}</span>
              </div>
              {a.dueAt && (
                <div className="text-[11px] text-muted-foreground">
                  מועד: {formatHebrewDate(a.dueAt)}
                </div>
              )}
            </li>
          ))}
        </ul>
        <Link
          to={targetLink}
          className="block text-xs font-bold text-primary underline underline-offset-2 pt-1"
        >
          לכרטיס הנהג והמסמכים →
        </Link>
      </PopoverContent>
    </Popover>
  );
}
