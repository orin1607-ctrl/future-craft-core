import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Returns an array of route paths that should be hidden for the current user's company.
 * Only applies to fleet_manager and driver roles — super_admin sees everything.
 */
export function useHiddenButtons(): string[] {
  const { user } = useAuth();
  const [hiddenButtons, setHiddenButtons] = useState<string[]>([]);

  useEffect(() => {
    if (!user || user.role === 'super_admin') {
      setHiddenButtons([]);
      return;
    }

    const companyName = user.company_name;
    if (!companyName) return;

    supabase
      .from('company_settings')
      .select('hidden_buttons')
      .eq('company_name', companyName)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.hidden_buttons) {
          setHiddenButtons(data.hidden_buttons as string[]);
        }
      });
  }, [user?.id, user?.company_name, user?.role]);

  return hiddenButtons;
}

/** All manageable buttons with labels for the settings UI */
export const MANAGEABLE_BUTTONS = [
  { path: '/dashboard', label: 'דשבורד', category: 'בית' },
  { path: '/alerts', label: 'התראות', category: 'בית' },
  { path: '/customers', label: 'לקוחות שלי', category: 'לקוחות' },
  { path: '/attach-customer', label: 'הצמדת נהג ללקוח', category: 'לקוחות' },
  { path: '/customer-docs', label: 'מסמכי לקוח', category: 'לקוחות' },
  { path: '/vehicles', label: 'רכבים', category: 'ניהול צי רכב' },
  { path: '/drivers', label: 'נהגים', category: 'ניהול צי רכב' },
  { path: '/companions', label: 'מלווים', category: 'ניהול צי רכב' },
  { path: '/vehicle-inspections', label: 'ביקורות רכב', category: 'ניהול צי רכב' },
  { path: '/vehicle-tasks', label: 'ליקויים', category: 'ניהול צי רכב' },
  { path: '/history', label: 'היסטוריית שינויים', category: 'ניהול צי רכב' },
  { path: '/faults', label: 'מעקב רכב', category: 'תפעול ושירות' },
  { path: '/service-orders', label: 'שירותים ותחזוקה', category: 'תפעול ושירות' },
  { path: '/routes', label: 'ניהול מסלולים', category: 'תפעול ושירות' },
  { path: '/work-orders', label: 'סידור עבודה', category: 'תפעול ושירות' },
  { path: '/towing', label: 'שינועים', category: 'תפעול ושירות' },
  { path: '/accidents', label: 'דיווח תאונה', category: 'תפעול ושירות' },
  { path: '/reports', label: 'דוחות', category: 'דוחות ובקרה' },
  { path: '/documents', label: 'מסמכים', category: 'דוחות ובקרה' },
  { path: '/expenses', label: 'דלק וחשבוניות', category: 'נהגים' },
  { path: '/promotions', label: 'מבצעים', category: 'כללי' },
  { path: '/internal-chat', label: 'צ\'אט פנימי', category: 'כללי' },
];
