/**
 * The vehicle hub URL (?vehicleId=&view=hub) stays on screen while the Dalia
 * edit form is open. Re-running hub-open in that state would force viewMode
 * back to 'detail' and close the editor immediately.
 */
export function shouldSkipHubReopen(viewMode: string): boolean {
  return viewMode === 'form';
}
