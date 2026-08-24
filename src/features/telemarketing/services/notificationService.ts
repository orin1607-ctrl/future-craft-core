import { supabase } from '@/integrations/supabase/client';
import type { TelemarketingCall } from '@/features/telemarketing/types';

/**
 * Notifications run only after call + follow-up are saved.
 * Failure here must never undo business data.
 */
export async function sendFollowUpNotifications(call: TelemarketingCall): Promise<void> {
  if (!call.needsFollowUp) return;
  try {
    await supabase.functions.invoke('notify-telemarketing-followup', {
      body: { callId: call.id },
    });
  } catch {
    // Status is recorded inside the edge function when possible.
  }
}

export async function retryFailedNotifications(callId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('notify-telemarketing-followup', {
    body: { callId, retry: true },
  });
  if (error) throw new Error('שליחה מחדש נכשלה');
}
