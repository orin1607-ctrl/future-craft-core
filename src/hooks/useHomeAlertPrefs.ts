import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchHomeAlertPrefs,
  parseLocalHomeAlertPrefs,
  saveHomeAlertPrefs,
} from '@/lib/homeAlertPrefsApi';
import {
  DEFAULT_HOME_ALERT_PREFS,
  HOME_ALERT_PREFS_STORAGE_PREFIX,
  type HomeAlertPrefs,
  type HomeAlertSlotPrefs,
  type HomeAlertSlotType,
  HOME_ALERT_SLOT_LABELS,
} from '@/lib/homeAlertPrefsTypes';

export type { HomeAlertPrefs, HomeAlertSlotPrefs, HomeAlertSlotType };
export { HOME_ALERT_SLOT_LABELS, DEFAULT_HOME_ALERT_PREFS };

function loadLocalPrefs(userId: string): HomeAlertPrefs {
  try {
    const raw = localStorage.getItem(`${HOME_ALERT_PREFS_STORAGE_PREFIX}${userId}`);
    return parseLocalHomeAlertPrefs(raw);
  } catch {
    return DEFAULT_HOME_ALERT_PREFS;
  }
}

export function useHomeAlertPrefs(userId: string | undefined) {
  const [prefs, setPrefsState] = useState<HomeAlertPrefs>(DEFAULT_HOME_ALERT_PREFS);
  const [loading, setLoading] = useState(Boolean(userId));

  useEffect(() => {
    if (!userId) {
      setPrefsState(DEFAULT_HOME_ALERT_PREFS);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const fromDb = await fetchHomeAlertPrefs(userId);
      if (cancelled) return;

      if (fromDb) {
        setPrefsState(fromDb);
        localStorage.setItem(`${HOME_ALERT_PREFS_STORAGE_PREFIX}${userId}`, JSON.stringify(fromDb));
        setLoading(false);
        return;
      }

      const local = loadLocalPrefs(userId);
      setPrefsState(local);
      setLoading(false);

      try {
        await saveHomeAlertPrefs(userId, local);
      } catch (err) {
        console.warn('[useHomeAlertPrefs] migrate local → DB failed', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const setPrefs = useCallback(
    (next: HomeAlertPrefs) => {
      setPrefsState(next);
      if (!userId) return;

      localStorage.setItem(`${HOME_ALERT_PREFS_STORAGE_PREFIX}${userId}`, JSON.stringify(next));
      void saveHomeAlertPrefs(userId, next).catch((err) => {
        console.warn('[useHomeAlertPrefs] save failed', err);
      });
    },
    [userId],
  );

  const resetPrefs = useCallback(() => {
    setPrefs(DEFAULT_HOME_ALERT_PREFS);
  }, [setPrefs]);

  return useMemo(
    () => ({ prefs, setPrefs, resetPrefs, loading }),
    [prefs, setPrefs, resetPrefs, loading],
  );
}
