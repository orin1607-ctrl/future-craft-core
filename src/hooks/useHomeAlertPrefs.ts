import { useCallback, useMemo, useState } from 'react';

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

const STORAGE_PREFIX = 'dalia_home_alerts_';

function loadPrefs(userId: string): HomeAlertPrefs {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
    if (!raw) return DEFAULT_HOME_ALERT_PREFS;
    const parsed = JSON.parse(raw) as HomeAlertPrefs;
    if (!parsed?.slots || parsed.slots.length !== 3) return DEFAULT_HOME_ALERT_PREFS;
    return parsed;
  } catch {
    return DEFAULT_HOME_ALERT_PREFS;
  }
}

export function useHomeAlertPrefs(userId: string | undefined) {
  const [prefs, setPrefsState] = useState<HomeAlertPrefs>(() =>
    userId ? loadPrefs(userId) : DEFAULT_HOME_ALERT_PREFS,
  );

  const setPrefs = useCallback(
    (next: HomeAlertPrefs) => {
      setPrefsState(next);
      if (userId) {
        localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(next));
      }
    },
    [userId],
  );

  const resetPrefs = useCallback(() => {
    setPrefs(DEFAULT_HOME_ALERT_PREFS);
  }, [setPrefs]);

  return useMemo(() => ({ prefs, setPrefs, resetPrefs }), [prefs, setPrefs, resetPrefs]);
}
