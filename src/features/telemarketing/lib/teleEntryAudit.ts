import { securityRecordAction } from '@/lib/securityAuditClient';
import { TELE_AUDIT_ACTION } from '@/features/telemarketing/lib/teleEntryMode';

export async function recordTeleEntryAudit(
  action: (typeof TELE_AUDIT_ACTION)[keyof typeof TELE_AUDIT_ACTION],
  details?: Record<string, unknown>,
): Promise<void> {
  await securityRecordAction('settings_change', {
    action,
    objectType: 'tele_entry_mode',
    details: { source: 'tele_entry_mode', ...details },
  });
}
