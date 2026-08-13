import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export { isDriverHubDashboardHidden } from '@/lib/hiddenButtons';

/**
 * Returns hidden button keys for the current user's company.
 * Only applies to fleet_manager and driver roles — super_admin sees everything.
 */
export function useHiddenButtonsState(): { hiddenButtons: string[]; ready: boolean } {
  const { user } = useAuth();
  const [hiddenButtons, setHiddenButtons] = useState<string[]>([]);
  const [ready, setReady] = useState(!user || user.role === 'super_admin');

  useEffect(() => {
    if (!user || user.role === 'super_admin') {
      setHiddenButtons([]);
      setReady(true);
      return;
    }

    const companyName = user.company_name;
    if (!companyName) {
      setReady(true);
      return;
    }

    setReady(false);
    supabase
      .from('company_settings')
      .select('hidden_buttons')
      .eq('company_name', companyName)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.hidden_buttons) {
          setHiddenButtons(data.hidden_buttons as string[]);
        } else {
          setHiddenButtons([]);
        }
        setReady(true);
      });
  }, [user?.id, user?.company_name, user?.role]);

  return { hiddenButtons, ready };
}

export function useHiddenButtons(): string[] {
  return useHiddenButtonsState().hiddenButtons;
}

/** Dashboard home cards — hidden via hidden_buttons[] */
export const DASHBOARD_CARD_BUTTONS = [
  { path: '/vehicles', label: 'רכבים', category: 'כרטיסי דשבורד' },
  { path: '/drivers', label: 'נהגים', category: 'כרטיסי דשבורד' },
  { path: '/vehicle-tracking', label: 'מעקב רכבים', category: 'כרטיסי דשבורด' },
  { path: '/fleetos-ai', label: 'מיקום צי חכם (FleetOS)', category: 'כרטיסי דשבורד' },
  { path: '/transport', label: 'חברות הסעות', category: 'כרטיסי דשבורד' },
  { path: '/reports', label: 'דוחות', category: 'כרטיסי דשבורד' },
  { path: '/fleet-managers', label: 'מנהלי צי', category: 'כרטיסי דשבורד' },
  { path: '/user-management', label: 'משתמשים', category: 'כרטיסי דשבורד' },
  { path: '/admin-home', label: 'מרכז ניהול', category: 'כרטיסי דשבורד' },
  { path: '/ai-marketing', label: 'ניהול שיווק', category: 'כרטיסי דשבורד' },
];

/** All manageable buttons with labels for the settings UI (matches sidebar IA) */
export const MANAGEABLE_BUTTONS = [
  { path: '/dashboard', label: 'בית', category: 'ניווט' },
  { path: '/vehicles', label: 'רשימת רכבים', category: 'ניווט' },
  { path: '/drivers', label: 'רשימת נהגים', category: 'ניווט' },
  { path: '/vehicle-tracking', label: 'מעקב רכבים', category: 'ניווט' },
  { path: '/fleetos-ai', label: 'מיקום צי חכם (FleetOS)', category: 'ניווט' },
  { path: '/transport', label: 'חברות הסעות', category: 'ניווט' },
  { path: '/faults', label: 'תקלות', category: 'ניווט' },
  { path: '/reports', label: 'דוחות', category: 'ניווט' },
  { path: '/fleet-managers', label: 'מנהלי צי', category: 'ניווט' },
  { path: '/customers', label: 'לקוחות', category: 'ניווט' },
  { path: '/alerts', label: 'התראות', category: 'ניווט' },
  { path: '/emergency', label: 'חירום', category: 'ניווט' },
  { path: '/internal-chat', label: 'צ\'אט', category: 'ניווט' },
  { path: '/admin-home', label: 'מרכז ניהול', category: 'מרכז ניהול' },
  { path: '/ai-marketing', label: 'ניהול שיווק', category: 'מרכז ניהול' },
  { path: '/dalia-settings', label: 'Dalia Settings', category: 'מרכז ניהול' },
  { path: '/user-management', label: 'משתמשים (דשבורד)', category: 'כרטיסי דשבורד' },
  { path: '/expenses', label: 'דלק וחשבוניות', category: 'נהג' },
  { path: 'driver-hub-dashboard', label: 'פתח דשבורד נהג', category: 'נהג' },
  ...DASHBOARD_CARD_BUTTONS.filter((b) => b.path !== '/user-management' && b.path !== '/admin-home'),
];
