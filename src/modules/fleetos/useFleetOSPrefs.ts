import { useCallback, useMemo, useState } from 'react';
import { DEFAULT_PREFS, type FleetOSDashboardPrefs } from './fleetosTypes';

const STORAGE_PREFIX = 'dalia_fleetos_dashboard_';

function loadPrefs(userId: string): FleetOSDashboardPrefs {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as FleetOSDashboardPrefs;
    if (!parsed?.alerts || parsed.alerts.length !== 3) return DEFAULT_PREFS;
    return parsed;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function useFleetOSPrefs(userId: string | undefined) {
  const [prefs, setPrefsState] = useState<FleetOSDashboardPrefs>(() =>
    userId ? loadPrefs(userId) : DEFAULT_PREFS,
  );

  const setPrefs = useCallback(
    (next: FleetOSDashboardPrefs) => {
      setPrefsState(next);
      if (userId) {
        localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(next));
      }
    },
    [userId],
  );

  return useMemo(() => ({ prefs, setPrefs }), [prefs, setPrefs]);
}
