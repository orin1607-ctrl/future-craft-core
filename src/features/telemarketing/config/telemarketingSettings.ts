import { supabase } from '@/integrations/supabase/client';
import type { TelemarketingSettings } from '@/features/telemarketing/types';

const DEFAULTS: TelemarketingSettings = {
  managerWhatsappNumber: '0534338601',
  managerNotificationEmail: '',
  whatsappEnabled: true,
  emailEnabled: true,
};

export async function getTelemarketingSettings(): Promise<TelemarketingSettings> {
  const { data, error } = await supabase.from('telemarketing_settings').select('key, value');
  if (error || !data) return DEFAULTS;

  const map: Record<string, string> = {};
  for (const row of data) map[row.key] = row.value;

  return {
    managerWhatsappNumber: map.manager_whatsapp_number || DEFAULTS.managerWhatsappNumber,
    managerNotificationEmail: map.manager_notification_email || '',
    whatsappEnabled: map.whatsapp_enabled ? map.whatsapp_enabled === 'true' : DEFAULTS.whatsappEnabled,
    emailEnabled: map.email_enabled ? map.email_enabled === 'true' : DEFAULTS.emailEnabled,
  };
}

export async function updateTelemarketingSetting(key: string, value: string): Promise<void> {
  const { error } = await supabase
    .from('telemarketing_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error('שגיאה בעדכון הגדרה: ' + error.message);
}
