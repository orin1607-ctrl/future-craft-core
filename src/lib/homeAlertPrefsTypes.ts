export type HomeAlertSlotType =
  | 'test'
  | 'insurance'
  | 'service'
  | 'comprehensive_insurance'
  | 'license'
  | 'fault'
  | 'service_order';

export interface HomeAlertSlotPrefs {
  type: HomeAlertSlotType;
  daysBefore: number;
  targetDate?: string;
  alertTime?: string;
  hidden?: boolean;
}

export interface HomeAlertPrefs {
  slots: [HomeAlertSlotPrefs, HomeAlertSlotPrefs, HomeAlertSlotPrefs];
}

export const HOME_ALERT_SLOT_LABELS: Record<HomeAlertSlotType, string> = {
  test: 'טסט מתקרב',
  insurance: 'ביטוח מתקרב',
  service: 'טיפול תקופתי מתקרב',
  comprehensive_insurance: 'ביטוח מקיף מתקרב',
  license: 'רישיון נהיגה מתקרב',
  fault: 'תקלות דחופות',
  service_order: 'הזמנות שירות פתוחות',
};

export const DEFAULT_HOME_ALERT_PREFS: HomeAlertPrefs = {
  slots: [
    { type: 'test', daysBefore: 30 },
    { type: 'insurance', daysBefore: 30 },
    { type: 'service', daysBefore: 30 },
  ],
};

export const HOME_ALERT_PREFS_STORAGE_PREFIX = 'dalia_home_alerts_';
