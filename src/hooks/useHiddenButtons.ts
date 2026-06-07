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

/** All manageable buttons with labels for the settings UI (matches sidebar IA groups) */
export const MANAGEABLE_BUTTONS = [
  { path: '/dashboard', label: 'דשבורד', category: 'דשבורד' },
  { path: '/promotions', label: 'מבצעים', category: 'דשבורד' },
  { path: '/vehicles', label: 'רשימת רכבים', category: 'רכבים' },
  { path: '/vehicle-inspections', label: 'ביקורות רכב', category: 'רכבים' },
  { path: '/private-vehicle-inspection', label: 'בדיקה תלת/חצי', category: 'רכבים' },
  { path: '/vehicle-tasks', label: 'ליקויים', category: 'רכבים' },
  { path: '/vehicle-import', label: 'יבוא רכבים', category: 'רכבים' },
  { path: '/vehicle-lookup', label: 'בדיקת רכב ממשלתי', category: 'רכבים' },
  { path: '/vehicle-exchange', label: 'החלפת רכב', category: 'רכבים' },
  { path: '/drivers', label: 'רשימת נהגים', category: 'נהגים' },
  { path: '/health-declaration', label: 'הצהרת בריאות', category: 'נהגים' },
  { path: '/driver-declarations', label: 'תצהירי נהגים', category: 'נהגים' },
  { path: '/companions', label: 'מלווים', category: 'נהגים' },
  { path: '/customers', label: 'לקוחות שלי', category: 'לקוחות' },
  { path: '/customer-docs', label: 'מסמכי לקוח', category: 'לקוחות' },
  { path: '/attach-car', label: 'הצמדת רכב לנהג', category: 'תפעול' },
  { path: '/attach-customer', label: 'הצמדת נהג ללקוח', category: 'תפעול' },
  { path: '/routes', label: 'ניהול מסלולים', category: 'תפעול' },
  { path: '/work-orders', label: 'סידור עבודה', category: 'תפעול' },
  { path: '/pickup-appointments', label: 'תיאומי איסוף', category: 'תפעול' },
  { path: '/faults', label: 'תקלות', category: 'תפעול' },
  { path: '/service-orders', label: 'הזמנת שירות', category: 'תפעול' },
  { path: '/towing', label: 'שינועים', category: 'תפעול' },
  { path: '/accidents', label: 'דיווח תאונה', category: 'תפעול' },
  { path: '/history', label: 'היסטוריה', category: 'תפעול' },
  { path: '/emergency', label: 'מספרי חירום', category: 'תפעול' },
  { path: '/internal-chat', label: 'צ\'אט פנימי', category: 'תפעול' },
  { path: '/alerts', label: 'התראות ועדכונים', category: 'התראות' },
  { path: '/reports', label: 'דוחות', category: 'דוחות' },
  { path: '/documents', label: 'מסמכים', category: 'דוחות' },
  { path: '/settings', label: 'הגדרות', category: 'ניהול מערכת' },
  { path: '/approval-settings', label: 'הגדרות אישורים', category: 'ניהול מערכת' },
  { path: '/suppliers', label: 'ניהול ספקים', category: 'ניהול מערכת' },
  { path: '/expenses', label: 'דלק וחשבוניות', category: 'נהגים' },
];
