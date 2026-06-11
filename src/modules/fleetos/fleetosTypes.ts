/**
 * FleetOS AI — shared types (extends Dalia schema, no new DB tables).
 */

export type DaliaRole =
  | 'super_admin'
  | 'fleet_admin'
  | 'manager'
  | 'driver'
  | 'customer';

export type VehicleStatus = 'driving' | 'stopped' | 'fault' | 'offline';

/** Fixed top KPIs — always these three, sourced from Dalia tracking data. */
export type FixedKpiKey = 'vehicles_active' | 'vehicles_idling' | 'vehicles_in_garage';

export const FIXED_KPI_LABELS: Record<FixedKpiKey, string> = {
  vehicles_active: 'רכבים פעילים',
  vehicles_idling: 'רכבים עם מנוע מונע',
  vehicles_in_garage: 'רכבים במוסך',
};

export type AlertTypeKey =
  | 'engine_light'
  | 'fault_active'
  | 'service_urgent'
  | 'in_garage'
  | 'km_threshold'
  | 'no_comm';

export const ALERT_OPTIONS: { key: AlertTypeKey; label: string }[] = [
  { key: 'engine_light', label: 'מנורה דלוקה' },
  { key: 'fault_active', label: 'תקלה פעילה' },
  { key: 'service_urgent', label: 'טיפול מתקרב' },
  { key: 'in_garage', label: 'רכב במוסך' },
  { key: 'km_threshold', label: 'חריגת ק"מ' },
  { key: 'no_comm', label: 'רכב לא מחובר' },
];

export interface FleetOSDashboardPrefs {
  alerts: [AlertTypeKey, AlertTypeKey, AlertTypeKey];
}

export const DEFAULT_PREFS: FleetOSDashboardPrefs = {
  alerts: ['engine_light', 'fault_active', 'service_urgent'],
};

export interface ModuleVisibility {
  canSeeFuel: boolean;
  canSeeAI: boolean;
  canSeeCosts: boolean;
  canSeeDrivers: boolean;
  canSeeAlerts: boolean;
  canSeeGPS: boolean;
}

export function getVisibilityForRole(role: DaliaRole): ModuleVisibility {
  const full: ModuleVisibility = {
    canSeeFuel: true,
    canSeeAI: true,
    canSeeCosts: true,
    canSeeDrivers: true,
    canSeeAlerts: true,
    canSeeGPS: true,
  };
  switch (role) {
    case 'super_admin':
    case 'fleet_admin':
      return full;
    case 'manager':
      return { ...full, canSeeAI: false };
    case 'customer':
      return {
        canSeeFuel: false,
        canSeeAI: false,
        canSeeCosts: false,
        canSeeDrivers: false,
        canSeeAlerts: true,
        canSeeGPS: true,
      };
    case 'driver':
      return {
        canSeeFuel: false,
        canSeeAI: false,
        canSeeCosts: false,
        canSeeDrivers: false,
        canSeeAlerts: true,
        canSeeGPS: false,
      };
    default:
      return full;
  }
}

export interface FleetOSKpiSnapshot {
  vehicles_active: number;
  vehicles_idling: number;
  vehicles_in_garage: number;
  total: number;
}
