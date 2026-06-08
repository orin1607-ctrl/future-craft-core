import { supabase } from '@/integrations/supabase/client';
import { applyCompanyScope } from '@/hooks/useCompanyFilter';
import type { HomeAlertSlotPrefs, HomeAlertSlotType } from '@/hooks/useHomeAlertPrefs';
import { HOME_ALERT_SLOT_LABELS } from '@/hooks/useHomeAlertPrefs';

export type FleetAlertSeverity = 'critical' | 'warning' | 'info';

export interface FleetAlertSlotSummary {
  type: HomeAlertSlotType;
  label: string;
  count: number;
  subtitle: string;
  severity: FleetAlertSeverity;
  link: string;
}

const daysUntil = (dateValue: string | null | undefined): number | null => {
  if (!dateValue) return null;
  return Math.ceil((new Date(dateValue).getTime() - Date.now()) / 86400000);
};

const severityFromDays = (days: number | null): FleetAlertSeverity => {
  if (days === null) return 'info';
  if (days <= 0) return 'critical';
  if (days <= 14) return 'warning';
  return 'info';
};

const OPEN_STATUSES = ['new', 'open', 'in_progress', 'pending', 'pending_approval', 'חדש', 'פתוח', 'בטיפול'];

export async function loadFleetAlertSlotSummaries(
  companyFilter: string | null,
  slots: HomeAlertSlotPrefs[],
): Promise<FleetAlertSlotSummary[]> {
  const { data: vehicles } = await applyCompanyScope(
    supabase.from('vehicles').select('id, license_plate, manufacturer, model, test_expiry, insurance_expiry, comprehensive_insurance_expiry, next_service_date'),
    companyFilter,
  );

  const { data: drivers } = await applyCompanyScope(
    supabase.from('drivers').select('id, license_expiry'),
    companyFilter,
  );

  const { data: faults } = await applyCompanyScope(
    supabase
      .from('faults')
      .select('id, urgency, status')
      .in('urgency', ['urgent', 'high', 'critical', 'דחוף', 'גבוהה'])
      .in('status', ['new', 'open', 'חדש', 'פתוח', 'בטיפול', 'in_progress']),
    companyFilter,
  );

  const { data: serviceOrders } = await applyCompanyScope(
    supabase.from('service_orders').select('id, treatment_status, service_category, vehicle_plate'),
    companyFilter,
  );

  const fleet = vehicles || [];
  const openOrders = (serviceOrders || []).filter((o) =>
    OPEN_STATUSES.includes((o.treatment_status || '').toLowerCase()) ||
    OPEN_STATUSES.includes(o.treatment_status || ''),
  );

  return slots.map((slot) => {
    const label = HOME_ALERT_SLOT_LABELS[slot.type];
    const days = slot.daysBefore;

    switch (slot.type) {
      case 'test': {
        const matches = fleet.filter((v) => {
          const d = daysUntil(v.test_expiry);
          return d !== null && d <= days;
        });
        const worst = matches.reduce<number | null>((min, v) => {
          const d = daysUntil(v.test_expiry);
          if (d === null) return min;
          return min === null ? d : Math.min(min, d);
        }, null);
        return {
          type: slot.type,
          label,
          count: matches.length,
          subtitle: matches.length === 0 ? 'אין התראות בחלון שנבחר' : worst !== null && worst <= 0 ? 'יש רכבים שפג תוקף הטסט' : `בעוד עד ${days} ימים`,
          severity: severityFromDays(worst),
          link: '/alerts',
        };
      }
      case 'insurance': {
        const matches = fleet.filter((v) => {
          const d = daysUntil(v.insurance_expiry);
          return d !== null && d <= days;
        });
        const worst = matches.reduce<number | null>((min, v) => {
          const d = daysUntil(v.insurance_expiry);
          if (d === null) return min;
          return min === null ? d : Math.min(min, d);
        }, null);
        return {
          type: slot.type,
          label,
          count: matches.length,
          subtitle: matches.length === 0 ? 'אין התראות בחלון שנבחר' : worst !== null && worst <= 0 ? 'יש רכבים שפג הביטוח' : `בעוד עד ${days} ימים`,
          severity: severityFromDays(worst),
          link: '/alerts',
        };
      }
      case 'comprehensive_insurance': {
        const matches = fleet.filter((v) => {
          const d = daysUntil(v.comprehensive_insurance_expiry);
          return d !== null && d <= days;
        });
        const worst = matches.reduce<number | null>((min, v) => {
          const d = daysUntil(v.comprehensive_insurance_expiry);
          if (d === null) return min;
          return min === null ? d : Math.min(min, d);
        }, null);
        return {
          type: slot.type,
          label,
          count: matches.length,
          subtitle: matches.length === 0 ? 'אין התראות בחלון שנבחר' : `בעוד עד ${days} ימים`,
          severity: severityFromDays(worst),
          link: '/alerts',
        };
      }
      case 'service': {
        const byDate = fleet.filter((v) => {
          const d = daysUntil(v.next_service_date);
          return d !== null && d <= days;
        });
        const periodicOrders = openOrders.filter((o) =>
          (o.service_category || '').toLowerCase().includes('תקופ'),
        );
        const count = byDate.length + periodicOrders.length;
        return {
          type: slot.type,
          label,
          count,
          subtitle: count === 0 ? 'אין טיפולים מתקרבים' : `${byDate.length} לפי תאריך · ${periodicOrders.length} הזמנות פתוחות`,
          severity: count > 0 ? 'warning' : 'info',
          link: '/service-orders',
        };
      }
      case 'license': {
        const matches = (drivers || []).filter((d) => {
          const dd = daysUntil(d.license_expiry);
          return dd !== null && dd <= days;
        });
        const worst = matches.reduce<number | null>((min, d) => {
          const dd = daysUntil(d.license_expiry);
          if (dd === null) return min;
          return min === null ? dd : Math.min(min, dd);
        }, null);
        return {
          type: slot.type,
          label,
          count: matches.length,
          subtitle: matches.length === 0 ? 'אין התראות בחלון שנבחר' : `בעוד עד ${days} ימים`,
          severity: severityFromDays(worst),
          link: '/alerts',
        };
      }
      case 'fault': {
        const count = (faults || []).length;
        return {
          type: slot.type,
          label,
          count,
          subtitle: count === 0 ? 'אין תקלות דחופות' : 'תקלות דורשות טיפול',
          severity: count > 0 ? 'critical' : 'info',
          link: '/faults',
        };
      }
      case 'service_order': {
        const count = openOrders.length;
        return {
          type: slot.type,
          label,
          count,
          subtitle: count === 0 ? 'אין הזמנות פתוחות' : 'הזמנות שירות פעילות',
          severity: count > 0 ? 'warning' : 'info',
          link: '/service-orders',
        };
      }
      default:
        return {
          type: slot.type,
          label,
          count: 0,
          subtitle: '',
          severity: 'info',
          link: '/alerts',
        };
    }
  });
}
