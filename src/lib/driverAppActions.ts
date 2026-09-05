/**
 * Catalog of driver-app actions and notification settings.
 * UI + visibility read this catalog. Adding an action later is a catalog
 * change plus optional defaults — not a new screen.
 *
 * Notification toggles are stored only. Existing email / WhatsApp senders
 * are not changed by this module.
 */

export type ConditionOption = {
  value: string;
  label: string;
};

export type DriverActionSurface = 'dashboard' | 'sidebar' | 'mobile';

export type DriverAppActionDef = {
  key: string;
  label: string;
  dashboardLabel: string;
  description: string;
  routes: string[];
  surfaces: DriverActionSurface[];
  hasNotifications: boolean;
  conditions: { field: string; label: string; options: ConditionOption[] } | null;
};

export type ActionSettingState = {
  action_key: string;
  visible_to_driver: boolean;
  email_enabled: boolean;
  email_to_fleet_managers: boolean;
  email_to_dalia: boolean;
  email_extra: string;
  whatsapp_enabled: boolean;
  whatsapp_to_dalia: boolean;
  whatsapp_extra: string;
  /** all = every saved request; by_value = only selected condition_values */
  condition_mode: 'all' | 'by_value';
  condition_values: string[];
};

export const DRIVER_APP_ALWAYS_VISIBLE_ROUTES = ['/dashboard'] as const;

/**
 * Actions that already exist on the driver dashboard / sidebar / mobile nav.
 * Labels match the live driver UI.
 */
export const DRIVER_APP_ACTIONS: DriverAppActionDef[] = [
  {
    key: 'fault',
    label: 'דיווח תקלה',
    dashboardLabel: 'דיווח מעקב רכב',
    description: 'פתיחת תקלה במעקב רכב',
    routes: ['/faults'],
    surfaces: ['dashboard', 'sidebar', 'mobile'],
    hasNotifications: true,
    conditions: {
      field: 'urgency',
      label: 'דחיפות',
      options: [
        { value: 'normal', label: 'רגילה' },
        { value: 'urgent', label: 'דחופה' },
        { value: 'critical', label: 'קריטית' },
      ],
    },
  },
  {
    key: 'accident',
    label: 'דיווח תאונה',
    dashboardLabel: 'דיווח תאונה',
    description: 'דיווח תאונה',
    routes: ['/accidents'],
    surfaces: ['dashboard', 'sidebar'],
    hasNotifications: true,
    conditions: null,
  },
  {
    key: 'service_order',
    label: 'הזמנת שירות',
    dashboardLabel: 'שירותים ותחזוקה',
    description: 'קריאת שירות ותחזוקה',
    routes: ['/service-orders'],
    surfaces: ['dashboard'],
    hasNotifications: true,
    conditions: {
      field: 'urgency',
      label: 'דחיפות',
      options: [
        { value: 'normal', label: 'רגילה' },
        { value: 'urgent', label: 'דחופה' },
      ],
    },
  },
  {
    key: 'emergency',
    label: 'בקשת חירום',
    dashboardLabel: 'יצירת קשר עם מוקד',
    description: 'שירותי חירום 24/7 — כולל בקשה שנשמרת במערכת',
    routes: ['/emergency'],
    surfaces: ['dashboard', 'sidebar'],
    hasNotifications: true,
    conditions: null,
  },
  {
    key: 'expenses',
    label: 'חשבונית דלק / הוצאה',
    dashboardLabel: 'העלאת חשבונית דלק / הוצאה',
    description: 'העלאת חשבונית דלק או הוצאה',
    routes: ['/expenses'],
    surfaces: ['dashboard', 'sidebar', 'mobile'],
    hasNotifications: false,
    conditions: null,
  },
  {
    key: 'history',
    label: 'היסטוריית טיפולים',
    dashboardLabel: 'היסטוריית טיפולים לרכב',
    description: 'צפייה בהיסטוריית טיפולים',
    routes: ['/history'],
    surfaces: ['dashboard', 'sidebar'],
    hasNotifications: false,
    conditions: null,
  },
  {
    key: 'work_schedule',
    label: 'סידור עבודה',
    dashboardLabel: 'סידור עבודה שלי',
    description: 'לוח זמנים וסידור עבודה של הנהג',
    routes: ['/driver-schedule', '/work-orders'],
    surfaces: ['dashboard', 'sidebar'],
    hasNotifications: false,
    conditions: null,
  },
  {
    key: 'declarations',
    label: 'תצהיר נהג',
    dashboardLabel: 'תצהיר נהג',
    description: 'תצהירי נהג',
    routes: ['/driver-declarations'],
    surfaces: ['dashboard'],
    hasNotifications: false,
    conditions: null,
  },
  {
    key: 'handover',
    label: 'החלפת נהג',
    dashboardLabel: 'החלפת נהג',
    description: 'מסירת רכב / החלפת נהג',
    routes: ['/handover'],
    surfaces: ['sidebar'],
    hasNotifications: false,
    conditions: null,
  },
  {
    key: 'driver_notifications',
    label: 'התראות נהג',
    dashboardLabel: 'התראות',
    description: 'מסך התראות פנימיות של הנהג',
    routes: ['/driver-notifications'],
    surfaces: ['sidebar', 'mobile'],
    hasNotifications: false,
    conditions: null,
  },
];

export function findActionByRoute(path: string): DriverAppActionDef | undefined {
  const normalized = path.split('?')[0];
  return DRIVER_APP_ACTIONS.find((action) => action.routes.includes(normalized));
}

export function defaultActionSetting(action: DriverAppActionDef): ActionSettingState {
  const base: ActionSettingState = {
    action_key: action.key,
    visible_to_driver: true,
    email_enabled: false,
    email_to_fleet_managers: false,
    email_to_dalia: false,
    email_extra: '',
    whatsapp_enabled: false,
    whatsapp_to_dalia: false,
    whatsapp_extra: '',
    condition_mode: 'all',
    condition_values: [],
  };

  // Starting defaults mirror today's live notify behavior (stored only, not wired).
  if (action.key === 'fault') {
    return {
      ...base,
      email_enabled: true,
      email_to_fleet_managers: true,
      condition_mode: 'by_value',
      condition_values: ['urgent', 'critical'],
    };
  }
  if (action.key === 'accident' || action.key === 'service_order') {
    return {
      ...base,
      email_enabled: true,
      email_to_fleet_managers: true,
      condition_mode: 'all',
      condition_values: [],
    };
  }
  return base;
}

export function mergeActionSettings(
  saved: Array<Partial<ActionSettingState> & { action_key: string }>,
): Record<string, ActionSettingState> {
  const byKey = new Map(saved.map((row) => [row.action_key, row]));
  const merged: Record<string, ActionSettingState> = {};
  for (const action of DRIVER_APP_ACTIONS) {
    const defaults = defaultActionSetting(action);
    const row = byKey.get(action.key);
    if (!row) {
      merged[action.key] = defaults;
      continue;
    }
    merged[action.key] = {
      ...defaults,
      ...row,
      action_key: action.key,
      email_extra: row.email_extra ?? '',
      whatsapp_extra: row.whatsapp_extra ?? '',
      condition_values: Array.isArray(row.condition_values) ? row.condition_values : defaults.condition_values,
    };
  }
  return merged;
}

export function isDriverRouteVisible(
  path: string,
  settingsByKey: Record<string, ActionSettingState>,
): boolean {
  const normalized = path.split('?')[0];
  if ((DRIVER_APP_ALWAYS_VISIBLE_ROUTES as readonly string[]).includes(normalized)) {
    return true;
  }
  const action = findActionByRoute(normalized);
  if (!action) return true;
  return settingsByKey[action.key]?.visible_to_driver !== false;
}
