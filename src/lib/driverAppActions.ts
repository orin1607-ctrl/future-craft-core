/**
 * Catalog of driver-app actions and notification settings.
 * UI + visibility read this catalog. Adding an action later is a catalog
 * change plus optional defaults — not a new screen.
 *
 * Notification toggles are stored only. Existing email / WhatsApp senders
 * are not changed by this module. No messages are sent from here.
 */

export type ConditionOption = {
  value: string;
  label: string;
};

export type DriverActionSurface = 'dashboard' | 'sidebar' | 'mobile' | 'inline';

export type SafetyLevel = 'normal' | 'warning' | 'critical';

export type DriverAppActionDef = {
  key: string;
  label: string;
  dashboardLabel: string;
  description: string;
  routes: string[];
  surfaces: DriverActionSurface[];
  hasNotifications: boolean;
  conditions: { field: string; label: string; options: ConditionOption[] } | null;
  safetyLevel: SafetyLevel;
  safetyWarning: string | null;
};

export type ActionSettingState = {
  action_key: string;
  visible_to_driver: boolean;
  email_enabled: boolean;
  email_to_fleet_managers: boolean;
  email_to_company_contact: boolean;
  email_to_dalia: boolean;
  email_extra: string;
  whatsapp_enabled: boolean;
  whatsapp_to_fleet_managers: boolean;
  whatsapp_to_company_contact: boolean;
  whatsapp_to_dalia: boolean;
  whatsapp_extra: string;
  /** all = every saved request; by_value = only selected condition_values */
  condition_mode: 'all' | 'by_value';
  condition_values: string[];
};

export type CompanyDriverAppConfig = {
  dalia_service_enabled: boolean;
  contact_email: string;
  contact_whatsapp: string;
};

export type GlobalDaliaContact = {
  email: string;
  whatsapp: string;
};

export type RecipientKey = 'fleet_managers' | 'company_contact' | 'dalia' | 'extra';

export const DRIVER_APP_ALWAYS_VISIBLE_ROUTES = ['/dashboard'] as const;

const EMERGENCY_SAFETY_WARNING =
  'פעולה רגישה — שינוי ההגדרה עלול למנוע מהנהג גישה לשירות חירום.';

/**
 * Actions that already exist on the driver dashboard / sidebar / mobile nav
 * or as live inline buttons. Labels match the live driver UI.
 *
 * Not in this catalog (intentionally):
 * - Help overlay (documentation, not a company operational action)
 * - Driving exam (assigned per driver; hiding it would block a required exam)
 * - Logout / dashboard shell
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
    safetyLevel: 'normal',
    safetyWarning: null,
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
    safetyLevel: 'warning',
    safetyWarning: 'פעולה רגישה — הסתרה תמנע מהנהג לדווח על תאונה מתוך האפליקציה.',
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
    safetyLevel: 'normal',
    safetyWarning: null,
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
    description: 'שירותי חירום 24/7 — כולל שיחה ו-WhatsApp מתוך מסך החירום',
    routes: ['/emergency'],
    surfaces: ['dashboard', 'sidebar'],
    hasNotifications: true,
    safetyLevel: 'critical',
    safetyWarning: EMERGENCY_SAFETY_WARNING,
    conditions: null,
  },
  {
    key: 'whatsapp_contact',
    label: 'WhatsApp / התקשרות',
    dashboardLabel: 'WhatsApp / חירום',
    description:
      'כפתור WhatsApp וחירום הצף במסך דיווח תקלה. שולט בנראות בלבד — לא משנה את מספר החירום הקיים של החברה.',
    routes: [],
    surfaces: ['inline'],
    hasNotifications: true,
    safetyLevel: 'critical',
    safetyWarning: EMERGENCY_SAFETY_WARNING,
    conditions: null,
  },
  {
    key: 'expenses',
    label: 'חשבונית דלק / הוצאה',
    dashboardLabel: 'העלאת חשבונית דלק / הוצאה',
    description: 'העלאת חשבונית דלק או הוצאה',
    routes: ['/expenses'],
    surfaces: ['dashboard', 'sidebar', 'mobile'],
    hasNotifications: true,
    safetyLevel: 'normal',
    safetyWarning: null,
    conditions: null,
  },
  {
    key: 'history',
    label: 'היסטוריית טיפולים',
    dashboardLabel: 'היסטוריית טיפולים לרכב',
    description: 'צפייה בהיסטוריית טיפולים',
    routes: ['/history'],
    surfaces: ['dashboard', 'sidebar'],
    hasNotifications: true,
    safetyLevel: 'normal',
    safetyWarning: null,
    conditions: null,
  },
  {
    key: 'work_schedule',
    label: 'סידור עבודה',
    dashboardLabel: 'סידור עבודה שלי',
    description: 'לוח זמנים וסידור עבודה של הנהג',
    routes: ['/driver-schedule', '/work-orders'],
    surfaces: ['dashboard', 'sidebar'],
    hasNotifications: true,
    safetyLevel: 'normal',
    safetyWarning: null,
    conditions: null,
  },
  {
    key: 'declarations',
    label: 'תצהיר נהג',
    dashboardLabel: 'תצהיר נהג',
    description: 'תצהירי נהג',
    routes: ['/driver-declarations'],
    surfaces: ['dashboard'],
    hasNotifications: true,
    safetyLevel: 'normal',
    safetyWarning: null,
    conditions: null,
  },
  {
    key: 'handover',
    label: 'החלפת נהג',
    dashboardLabel: 'החלפת נהג',
    description: 'מסירת רכב / החלפת נהג',
    routes: ['/handover'],
    surfaces: ['sidebar'],
    hasNotifications: true,
    safetyLevel: 'normal',
    safetyWarning: null,
    conditions: null,
  },
  {
    key: 'driver_notifications',
    label: 'התראות נהג',
    dashboardLabel: 'התראות',
    description: 'מסך התראות פנימיות של הנהג',
    routes: ['/driver-notifications'],
    surfaces: ['sidebar', 'mobile'],
    hasNotifications: true,
    safetyLevel: 'normal',
    safetyWarning: null,
    conditions: null,
  },
];

export function emptyCompanyDriverAppConfig(): CompanyDriverAppConfig {
  return {
    dalia_service_enabled: false,
    contact_email: '',
    contact_whatsapp: '',
  };
}

export function findActionByRoute(path: string): DriverAppActionDef | undefined {
  const normalized = path.split('?')[0];
  return DRIVER_APP_ACTIONS.find((action) => action.routes.includes(normalized));
}

export function findActionByKey(key: string): DriverAppActionDef | undefined {
  return DRIVER_APP_ACTIONS.find((action) => action.key === key);
}

export function defaultActionSetting(action: DriverAppActionDef): ActionSettingState {
  const base: ActionSettingState = {
    action_key: action.key,
    visible_to_driver: true,
    email_enabled: false,
    email_to_fleet_managers: false,
    email_to_company_contact: false,
    email_to_dalia: false,
    email_extra: '',
    whatsapp_enabled: false,
    whatsapp_to_fleet_managers: false,
    whatsapp_to_company_contact: false,
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
  saved: Array<{ action_key: string } & Record<string, unknown>>,
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
    const conditionValues = row.condition_values;
    merged[action.key] = {
      ...defaults,
      visible_to_driver: row.visible_to_driver === false ? false : (typeof row.visible_to_driver === 'boolean' ? row.visible_to_driver : defaults.visible_to_driver),
      email_enabled: typeof row.email_enabled === 'boolean' ? row.email_enabled : defaults.email_enabled,
      email_to_fleet_managers: typeof row.email_to_fleet_managers === 'boolean' ? row.email_to_fleet_managers : defaults.email_to_fleet_managers,
      email_to_company_contact: typeof row.email_to_company_contact === 'boolean' ? row.email_to_company_contact : defaults.email_to_company_contact,
      email_to_dalia: typeof row.email_to_dalia === 'boolean' ? row.email_to_dalia : defaults.email_to_dalia,
      email_extra: typeof row.email_extra === 'string' ? row.email_extra : defaults.email_extra,
      whatsapp_enabled: typeof row.whatsapp_enabled === 'boolean' ? row.whatsapp_enabled : defaults.whatsapp_enabled,
      whatsapp_to_fleet_managers: typeof row.whatsapp_to_fleet_managers === 'boolean' ? row.whatsapp_to_fleet_managers : defaults.whatsapp_to_fleet_managers,
      whatsapp_to_company_contact: typeof row.whatsapp_to_company_contact === 'boolean' ? row.whatsapp_to_company_contact : defaults.whatsapp_to_company_contact,
      whatsapp_to_dalia: typeof row.whatsapp_to_dalia === 'boolean' ? row.whatsapp_to_dalia : defaults.whatsapp_to_dalia,
      whatsapp_extra: typeof row.whatsapp_extra === 'string' ? row.whatsapp_extra : defaults.whatsapp_extra,
      condition_mode: row.condition_mode === 'by_value' ? 'by_value' : (row.condition_mode === 'all' ? 'all' : defaults.condition_mode),
      condition_values: Array.isArray(conditionValues) ? conditionValues.filter((v): v is string => typeof v === 'string') : defaults.condition_values,
      action_key: action.key,
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

export function conditionMatches(setting: ActionSettingState, fieldValue?: string | null): boolean {
  if (setting.condition_mode === 'all') return true;
  if (!fieldValue) return false;
  return setting.condition_values.includes(fieldValue);
}

export type StoredRecipientTarget = {
  key: RecipientKey;
  channel: 'email' | 'whatsapp';
  destination: string;
};

/**
 * Builds the stored recipient list for a future send step.
 * Dalia is included only when the company Dalia service is ON and a global
 * contact exists. Never invents a company-owner address.
 */
export function collectStoredRecipients(params: {
  setting: ActionSettingState;
  companyConfig: CompanyDriverAppConfig;
  dalia: GlobalDaliaContact;
}): StoredRecipientTarget[] {
  const { setting, companyConfig, dalia } = params;
  const targets: StoredRecipientTarget[] = [];

  if (setting.email_enabled) {
    if (setting.email_to_fleet_managers) {
      targets.push({ key: 'fleet_managers', channel: 'email', destination: 'fleet_managers' });
    }
    if (setting.email_to_company_contact && companyConfig.contact_email.trim()) {
      targets.push({
        key: 'company_contact',
        channel: 'email',
        destination: companyConfig.contact_email.trim(),
      });
    }
    if (setting.email_to_dalia && companyConfig.dalia_service_enabled && dalia.email.trim()) {
      targets.push({ key: 'dalia', channel: 'email', destination: dalia.email.trim() });
    }
    if (setting.email_extra.trim()) {
      targets.push({ key: 'extra', channel: 'email', destination: setting.email_extra.trim() });
    }
  }

  if (setting.whatsapp_enabled) {
    if (setting.whatsapp_to_fleet_managers) {
      targets.push({ key: 'fleet_managers', channel: 'whatsapp', destination: 'fleet_managers' });
    }
    if (setting.whatsapp_to_company_contact && companyConfig.contact_whatsapp.trim()) {
      targets.push({
        key: 'company_contact',
        channel: 'whatsapp',
        destination: companyConfig.contact_whatsapp.trim(),
      });
    }
    if (setting.whatsapp_to_dalia && companyConfig.dalia_service_enabled && dalia.whatsapp.trim()) {
      targets.push({ key: 'dalia', channel: 'whatsapp', destination: dalia.whatsapp.trim() });
    }
    if (setting.whatsapp_extra.trim()) {
      targets.push({ key: 'extra', channel: 'whatsapp', destination: setting.whatsapp_extra.trim() });
    }
  }

  return targets;
}

export function safetyCriticalActions(): DriverAppActionDef[] {
  return DRIVER_APP_ACTIONS.filter((action) => action.safetyLevel === 'critical');
}
