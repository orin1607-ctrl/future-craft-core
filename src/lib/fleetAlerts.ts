import { supabase } from '@/integrations/supabase/client';
import { applyCompanyScope } from '@/hooks/useCompanyFilter';
import type { HomeAlertSlotPrefs, HomeAlertSlotType } from '@/lib/homeAlertPrefsTypes';
import { HOME_ALERT_SLOT_LABELS } from '@/lib/homeAlertPrefsTypes';
import { isInsuranceAlertsEnabled } from '@/lib/vehicleInsuranceAlerts';
import { isUpcomingInWindow } from '@/lib/expiryOfficerApproval';
import { applyExcludeArchivedVehicles } from '@/lib/vehicleArchive';
import { getThirdPartyInsuranceExpiry } from '@/lib/vehicleInsuranceUtils';
import { buildAlertsHref } from '@/lib/alertListScope';

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
    applyExcludeArchivedVehicles(
      supabase.from('vehicles').select('id, license_plate, manufacturer, model, test_expiry, insurance_expiry, comprehensive_insurance_expiry, next_service_date, insurance_alerts_enabled, third_party_insurance_expiry, insurances'),
    ),
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
        const matches = fleet.filter((v) => isUpcomingInWindow(v.test_expiry, days));
        const worst = matches.reduce<number | null>((min, v) => {
          const d = daysUntil(v.test_expiry);
          if (d === null) return min;
          return min === null ? d : Math.min(min, d);
        }, null);
        return {
          type: slot.type,
          label,
          count: matches.length,
          subtitle: matches.length === 0 ? 'אין התראות בחלון שנבחר' : `בתוקף · עד ${days} ימים`,
          severity: severityFromDays(worst),
          link: buildAlertsHref({ category: 'test', scope: 'urgent', days }),
        };
      }
      case 'insurance': {
        const matches = fleet.flatMap((v) => {
          if (!isInsuranceAlertsEnabled(v)) return [];
          const rows: string[] = [];
          if (isUpcomingInWindow(v.insurance_expiry, days)) rows.push('insurance');
          if (isUpcomingInWindow(v.comprehensive_insurance_expiry, days)) rows.push('comprehensive');
          if (isUpcomingInWindow(getThirdPartyInsuranceExpiry(v), days)) rows.push('third');
          return rows;
        });
        const worst = fleet.reduce<number | null>((min, v) => {
          if (!isInsuranceAlertsEnabled(v)) return min;
          for (const date of [v.insurance_expiry, v.comprehensive_insurance_expiry, getThirdPartyInsuranceExpiry(v)]) {
            if (!isUpcomingInWindow(date, days)) continue;
            const d = daysUntil(date);
            if (d === null) continue;
            min = min === null ? d : Math.min(min, d);
          }
          return min;
        }, null);
        return {
          type: slot.type,
          label,
          count: matches.length,
          subtitle: matches.length === 0 ? 'אין התראות בחלון שנבחר' : `חובה / מקיף / צד ג׳ · עד ${days} ימים`,
          severity: severityFromDays(worst),
          link: buildAlertsHref({ category: 'insurance', scope: 'urgent', days }),
        };
      }
      case 'comprehensive_insurance': {
        const matches = fleet.filter((v) => {
          if (!isInsuranceAlertsEnabled(v)) return false;
          return isUpcomingInWindow(v.comprehensive_insurance_expiry, days);
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
          subtitle: matches.length === 0 ? 'אין התראות בחלון שנבחר' : `בתוקף · עד ${days} ימים`,
          severity: severityFromDays(worst),
          link: buildAlertsHref({ category: 'comprehensive_insurance', scope: 'urgent', days }),
        };
      }
      case 'service': {
        const byDate = fleet.filter((v) => isUpcomingInWindow(v.next_service_date, days));
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
          link: buildAlertsHref({ category: 'service_order', scope: 'urgent', days }),
        };
      }
      case 'license': {
        const matches = (drivers || []).filter((d) => isUpcomingInWindow(d.license_expiry, days));
        const worst = matches.reduce<number | null>((min, d) => {
          const dd = daysUntil(d.license_expiry);
          if (dd === null) return min;
          return min === null ? dd : Math.min(min, dd);
        }, null);
        return {
          type: slot.type,
          label,
          count: matches.length,
          subtitle: matches.length === 0 ? 'אין התראות בחלון שנבחר' : `בתוקף · עד ${days} ימים`,
          severity: severityFromDays(worst),
          link: buildAlertsHref({ category: 'license', scope: 'urgent', days }),
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
          link: buildAlertsHref({ category: 'service_order', scope: 'urgent' }),
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
