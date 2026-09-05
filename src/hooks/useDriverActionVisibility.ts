import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  ActionSettingState,
  DRIVER_APP_ACTIONS,
  isDriverRouteVisible,
  mergeActionSettings,
} from '@/lib/driverAppActions';

/**
 * Driver-facing visibility. Super Admin / fleet managers are never hidden
 * by this catalog — only role=driver.
 */
export function useDriverActionVisibility() {
  const { user } = useAuth();
  const [settingsByKey, setSettingsByKey] = useState<Record<string, ActionSettingState>>(
    () => mergeActionSettings([]),
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || user.role !== 'driver' || !user.company_name) {
      setSettingsByKey(mergeActionSettings([]));
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    supabase
      .from('driver_app_action_settings')
      .select('action_key, visible_to_driver')
      .eq('company_name', user.company_name)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('driver_app_action_settings load failed', error);
          setSettingsByKey(mergeActionSettings([]));
        } else {
          setSettingsByKey(mergeActionSettings(data || []));
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role, user?.company_name]);

  const isPathVisible = useCallback(
    (path: string) => {
      if (user?.role !== 'driver') return true;
      return isDriverRouteVisible(path, settingsByKey);
    },
    [settingsByKey, user?.role],
  );

  const isActionVisible = useCallback(
    (actionKey: string) => {
      if (user?.role !== 'driver') return true;
      return settingsByKey[actionKey]?.visible_to_driver !== false;
    },
    [settingsByKey, user?.role],
  );

  const visibleDashboardActions = useMemo(
    () => DRIVER_APP_ACTIONS.filter((a) => a.surfaces.includes('dashboard') && isActionVisible(a.key)),
    [isActionVisible],
  );

  return { loading, isPathVisible, isActionVisible, visibleDashboardActions, settingsByKey };
}
