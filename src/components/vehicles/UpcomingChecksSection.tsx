import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { fetchCompanySettings } from '@/lib/companySettings';
import { cn } from '@/lib/utils';
import { isVehicleArchived } from '@/lib/vehicleArchive';
import { isInsuranceAlertsEnabled } from '@/lib/vehicleInsuranceAlerts';
import { OFFICER_ALERT_TYPE } from '@/lib/vehicleActionFollowUp';
import {
  ALERT_DUE_LEVEL_LABELS,
  DEFAULT_OFFICER_ALERT_WINDOW_DAYS,
  formatOfficerDueDate,
  officerAlertWindowDays,
  type AlertDueLevel,
} from '@/lib/vehicleOfficerAlertLight';
import {
  buildUpcomingChecks,
  type OpenOfficerAlert,
  type UpcomingCheck,
  type UpcomingChecksVehicle,
  type UpcomingInspection,
} from '@/lib/vehicleUpcomingChecks';

/** Same colours as the tracking light: yellow = due within the window, red = overdue. */
const LEVEL_CHIP: Record<AlertDueLevel, string> = {
  overdue: 'bg-destructive/10 text-destructive border-destructive/40',
  due_soon: 'bg-yellow-400/20 text-yellow-800 border-yellow-500/50 dark:text-yellow-300',
  ok: 'bg-success/10 text-success border-success/30',
  none: 'bg-muted text-muted-foreground border-border',
};

const LEVEL_DOT: Record<AlertDueLevel, string> = {
  overdue: 'bg-destructive',
  due_soon: 'bg-yellow-400',
  ok: 'bg-success',
  none: 'bg-muted-foreground/40',
};

type Props = {
  vehicle: UpcomingChecksVehicle & {
    company_name?: string | null;
    status?: string | null;
    management_type?: string | null;
    insurance_alerts_enabled?: boolean | null;
  };
  inspection: UpcomingInspection | null;
  onOpenDrill: (drill: 'insurance_licenses' | 'service') => void;
  previewMode?: boolean;
};

export default function UpcomingChecksSection({ vehicle: v, inspection, onOpenDrill, previewMode = false }: Props) {
  const [windowDays, setWindowDays] = useState(DEFAULT_OFFICER_ALERT_WINDOW_DAYS);
  const [officerAlerts, setOfficerAlerts] = useState<OpenOfficerAlert[]>([]);
  const archived = isVehicleArchived(v.status);

  useEffect(() => {
    if (previewMode || !v.company_name) return;
    let cancelled = false;
    void fetchCompanySettings(v.company_name).then((s) => {
      if (!cancelled) setWindowDays(officerAlertWindowDays(s?.alert_days_before));
    });
    return () => {
      cancelled = true;
    };
  }, [v.company_name, previewMode]);

  useEffect(() => {
    if (previewMode || !v.id) return;
    let cancelled = false;
    void supabase
      .from('custom_alerts')
      .select('id, title, description, alert_date, company_name')
      .eq('alert_type', OFFICER_ALERT_TYPE)
      .eq('is_active', true)
      .ilike('description', `%vid:${v.id}%`)
      .then(({ data }) => {
        if (cancelled) return;
        setOfficerAlerts(
          ((data || []) as (OpenOfficerAlert & { company_name: string | null })[]).filter(
            (a) => !v.company_name || (a.company_name || '') === v.company_name,
          ),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [v.id, v.company_name, previewMode]);

  const checks = useMemo(
    () =>
      buildUpcomingChecks({
        vehicle: v,
        inspection,
        officerAlerts,
        insuranceRelevant: isInsuranceAlertsEnabled(v),
        windowDays,
      }),
    [v, inspection, officerAlerts, windowDays],
  );

  return (
    <section className="card-elevated mb-4 p-0 overflow-hidden" data-testid="upcoming-checks" aria-labelledby="upcoming-checks-title">
      <div className="px-4 pt-3 pb-2 flex flex-wrap items-center justify-between gap-2 border-b border-border">
        <h2 id="upcoming-checks-title" className="text-sm font-bold flex items-center gap-2">
          <CalendarClock size={16} className="text-primary" />
          בדיקות קרובות ומועדי חידוש
        </h2>
        <span className="text-[11px] text-muted-foreground">
          {archived ? 'הרכב בארכיון — מוצג לעיון בלבד, ללא התראות' : `מתקרב = עד ${windowDays} ימים`}
        </span>
      </div>
      <ul className="divide-y divide-border">
        {checks.map((c) => (
          <CheckRow key={c.key} check={c} archived={archived} onOpenDrill={onOpenDrill} />
        ))}
      </ul>
    </section>
  );
}

function CheckRow({
  check: c,
  archived,
  onOpenDrill,
}: {
  check: UpcomingCheck;
  archived: boolean;
  onOpenDrill: Props['onOpenDrill'];
}) {
  // An archived vehicle takes no part in alerts: dates stay visible, colours do not.
  const level: AlertDueLevel = archived && c.dueDate ? 'ok' : c.level;
  const statusText = archived && c.dueDate ? 'ללא התראה (ארכיון)' : ALERT_DUE_LEVEL_LABELS[c.level];
  const linkCls = 'text-xs font-bold text-primary underline underline-offset-2 whitespace-nowrap min-h-[32px] inline-flex items-center';

  return (
    <li className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1" data-testid={`upcoming-check-${c.key}`} data-level={level}>
      <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', archived ? 'bg-muted-foreground/40' : LEVEL_DOT[level])} aria-hidden />
      <div className="flex-1 min-w-[10rem]">
        <p className="text-sm font-bold leading-tight">{c.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {c.dueDate ? formatOfficerDueDate(c.dueDate) : 'לא הוגדר מועד'}
          {c.dueDate && !archived ? ` · ${c.daysText}` : ''}
        </p>
        {c.note && <p className="text-[11px] text-muted-foreground mt-0.5">{c.note}</p>}
      </div>
      <span className={cn('status-badge border text-[11px] shrink-0', archived ? LEVEL_CHIP.none : LEVEL_CHIP[level])}>
        {statusText}
      </span>
      {c.target.kind === 'link' ? (
        <Link to={c.target.to} className={linkCls}>
          {c.targetLabel}
        </Link>
      ) : (
        <button type="button" className={linkCls} onClick={() => onOpenDrill((c.target as { drill: 'insurance_licenses' | 'service' }).drill)}>
          {c.targetLabel}
        </button>
      )}
    </li>
  );
}
