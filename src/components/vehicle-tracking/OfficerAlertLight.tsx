import type { KeyboardEvent, SyntheticEvent } from 'react';
import { Link } from 'react-router-dom';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { OFFICER_ALERT_LABEL } from '@/lib/vehicleActionFollowUp';
import {
  ALL_OFFICER_ALERTS_URL,
  formatOfficerDueDate,
  officerAlertDaysText,
  type VehicleOfficerAlertLight,
} from '@/lib/vehicleOfficerAlertLight';

// The row and the mobile card open the vehicle on click; React bubbles portal
// events too, so the light and its panel keep their clicks to themselves.
const stop = (e: SyntheticEvent) => e.stopPropagation();

/** Solid red light next to the plate when a fleet-officer alert is due or overdue. */
export default function OfficerAlertLight({ light }: { light: VehicleOfficerAlertLight | null | undefined }) {
  if (!light || light.alerts.length === 0) return null;
  const count = light.alerts.length;
  const first = light.alerts[0];
  const label = `${OFFICER_ALERT_LABEL}: ${officerAlertDaysText(first.daysLeft)}${count > 1 ? ` (${count} התראות)` : ''}`;

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
          onClick={stop}
          onKeyDown={onKeyDown}
          className="group inline-flex shrink-0 min-w-[24px] -my-2 items-center justify-center cursor-pointer align-middle focus:outline-none"
        >
          {/* The global 44px touch height applies to this wrapper; the dot inside stays round. */}
          <span className="inline-flex min-w-[18px] h-[18px] px-1 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold leading-none group-focus-visible:ring-2 group-focus-visible:ring-destructive group-focus-visible:ring-offset-1">
            {count > 1 ? count : null}
          </span>
        </span>
      </PopoverTrigger>
      <PopoverContent
        dir="rtl"
        align="center"
        collisionPadding={12}
        className="w-64 p-3 text-right space-y-2"
        onClick={stop}
        onPointerDown={stop}
        onKeyDown={stop}
      >
        <p className="text-sm font-bold">
          {OFFICER_ALERT_LABEL}
          {count > 1 ? ` · ${count} פתוחות` : ''}
        </p>
        <ul className="space-y-1">
          {light.alerts.map((a) => (
            <li key={a.id} className="flex justify-between gap-2 text-xs">
              <span className="text-muted-foreground">מועד: {formatOfficerDueDate(a.dueDate)}</span>
              <span className="font-bold text-destructive">{officerAlertDaysText(a.daysLeft)}</span>
            </li>
          ))}
        </ul>
        <Link to={ALL_OFFICER_ALERTS_URL} className="block text-sm font-bold text-primary underline underline-offset-2">
          לכל ההתראות
        </Link>
      </PopoverContent>
    </Popover>
  );
}
