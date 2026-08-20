import { supabase } from '@/integrations/supabase/client';
import type { HomeAlertPrefs } from '@/lib/homeAlertPrefsTypes';
import { DEFAULT_HOME_ALERT_PREFS } from '@/lib/homeAlertPrefsTypes';

export const HOME_ALERT_PREFS_KEY_PREFIX = 'home_alert_prefs:';

export function homeAlertPrefsConfigKey(userId: string): string {
  return `${HOME_ALERT_PREFS_KEY_PREFIX}${userId}`;
}

function normalizePrefs(raw: unknown): HomeAlertPrefs | null {
  if (!raw || typeof raw !== 'object') return null;
  const slots = (raw as HomeAlertPrefs).slots;
  if (!Array.isArray(slots) || slots.length !== 3) return null;
  return {
    slots: slots.map((s) => ({
      type: s.type,
      daysBefore: s.daysBefore,
      targetDate: s.targetDate,
      alertTime: s.alertTime,
      hidden: Boolean(s.hidden),
    })) as HomeAlertPrefs['slots'],
  };
}

export async function fetchHomeAlertPrefs(userId: string): Promise<HomeAlertPrefs | null> {
  const { data, error } = await supabase
    .from('dalia_form_config')
    .select('config_value')
    .eq('config_key', homeAlertPrefsConfigKey(userId))
    .maybeSingle();

  if (error) {
    console.warn('[homeAlertPrefsApi] fetch failed', error.message);
    return null;
  }

  return normalizePrefs((data as { config_value?: unknown } | null)?.config_value);
}

export async function saveHomeAlertPrefs(userId: string, prefs: HomeAlertPrefs): Promise<void> {
  const payload = {
    config_key: homeAlertPrefsConfigKey(userId),
    config_value: prefs,
    updated_at: new Date().toISOString(),
    updated_by: userId,
  };

  const { error } = await supabase.from('dalia_form_config').upsert(payload, {
    onConflict: 'config_key',
  });

  if (error) throw new Error(error.message || 'שגיאה בשמירת העדפות התראות בית');
}

export function parseLocalHomeAlertPrefs(raw: string | null): HomeAlertPrefs {
  if (!raw) return DEFAULT_HOME_ALERT_PREFS;
  try {
    return normalizePrefs(JSON.parse(raw)) ?? DEFAULT_HOME_ALERT_PREFS;
  } catch {
    return DEFAULT_HOME_ALERT_PREFS;
  }
}
