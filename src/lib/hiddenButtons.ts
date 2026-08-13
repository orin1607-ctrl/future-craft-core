/** Same toggle key as settings UI — also accept the Hebrew label if stored that way. */
export function isDriverHubDashboardHidden(hiddenButtons: string[]): boolean {
  return hiddenButtons.some((k) => {
    const s = String(k || '');
    return s === 'driver-hub-dashboard' || s.includes('דשבורד נהג');
  });
}
