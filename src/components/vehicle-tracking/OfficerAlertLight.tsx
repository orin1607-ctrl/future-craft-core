import type { KeyboardEvent, SyntheticEvent } from 'react';
import { Link } from 'react-router-dom';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  ALL_OFFICER_ALERTS_URL,
  formatOfficerDueDate,
  officerAlertDaysText,
  type VehicleOfficerAlertLight,
} from '@/lib/vehicleOfficerAlertLight';

// The row and the mobile card open the vehicle on click; React bubbles portal
// events too, so the light and its panel keep their clicks to themselves.
const stop = (e: SyntheticEvent) => e.stopPropagation();

/**
 * Light next to the plate: yellow when an open officer action is due within the
 * window (today included), red once one is overdue. No light when nothing is open.
 */
export default function OfficerAlertLight({ light }: { light: VehicleOfficerAlertLight | null | undefined }) {
  if (!light || light.alerts.length === 0) return null;
  const count = light.alerts.length;
  const first = light.alerts[0];
  const red = light.color === 'red';
  const label = `${first.label}: ${officerAlertDaysText(first.daysLeft)}${count > 1 ? ` (${count} פעולות)` : ''}`;

  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      (e.currentTarget as HTMLElement).click();
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        {/* A span, not a button: the mobile card that holds it is itself a button. */}
        <span
          role="button"
          tabIndex={0}
          aria-label={label}
          title={label}
          data-testid="officer-alert-light"
          data-light-color={light.color}
          onClick={stop}
          onKeyDown={onKeyDown}
          className="group inline-flex shrink-0 min-w-[24px] -my-2 items-center justify-center cursor-pointer align-middle focus:outline-none"
        >
          {/* The global 44px touch height applies to this wrapper; the dot inside stays round. */}
          <span
            className={cn(
              'inline-flex min-w-[18px] h-[18px] px-1 items-center justify-center rounded-full text-[10px] font-bold leading-none group-focus-visible:ring-2 group-focus-visible:ring-offset-1',
              red
                ? 'bg-destructive text-destructive-foreground group-focus-visible:ring-destructive'
                : 'bg-yellow-400 text-yellow-950 group-focus-visible:ring-yellow-500',
            )}
          >
            {count > 1 ? count : null}
          </span>
        </span>
      </PopoverTrigger>
      <PopoverContent
        dir="rtl"
        align="center"
        collisionPadding={12}
        className="w-72 p-3 text-right space-y-2"
        onClick={stop}
        onPointerDown={stop}
        onKeyDown={stop}
      >
        <p className="text-sm font-bold">
          {red ? 'פעולות באיחור' : 'פעולות קרובות'}
          {count > 1 ? ` · ${count}` : ''}
        </p>
        <ul className="space-y-2">
          {light.alerts.map((a) => (
            <li key={a.id} className="text-xs border-b border-border/60 pb-1.5 last:border-0" data-testid="officer-alert-entry">
              <div className="flex justify-between gap-2">
                <Link to={a.link} className="font-bold text-primary underline underline-offset-2 truncate">
                  {a.label}
                </Link>
                <span className={cn('font-bold shrink-0', a.level === 'overdue' ? 'text-destructive' : 'text-yellow-700 dark:text-yellow-400')}>
                  {officerAlertDaysText(a.daysLeft)}
                </span>
              </div>
              <span className="text-muted-foreground">מועד: {formatOfficerDueDate(a.dueDate)}</span>
            </li>
          ))}
        </ul>
        <Link to={ALL_OFFICER_ALERTS_URL} className="block text-sm font-bold text-primary underline underline-offset-2">
          לכל התראות קצין הרכב
        </Link>
      </PopoverContent>
    </Popover>
  );
}
