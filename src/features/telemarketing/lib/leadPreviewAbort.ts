export type TeleWorkStatus = 'idle' | 'in_progress' | 'ended';

/**
 * Safe abort of a lead preview: local UI only.
 * Allowed only before a real call or work session exists.
 * A started call (in_progress) or pending report (ended) is real activity — do not discard it.
 */
export function canAbortLeadPreview(callStatus: TeleWorkStatus, workStatus: TeleWorkStatus): boolean {
  return callStatus === 'idle' && workStatus === 'idle';
}
