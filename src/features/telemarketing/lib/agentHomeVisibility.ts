/** Idle home actions (Start Call, 🟣) stay visible unless a live timer is running. */
export function agentHomeActionsVisible(
  callStatus: 'idle' | 'in_progress' | 'ended',
  workStatus: 'idle' | 'in_progress' | 'ended',
): boolean {
  return callStatus !== 'in_progress' && workStatus !== 'in_progress';
}
