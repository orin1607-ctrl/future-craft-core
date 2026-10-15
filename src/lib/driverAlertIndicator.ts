import { loadDriverTrackingRows } from '@/lib/driverTrackingLoad';
import type { DriverAlertItem } from '@/lib/driverTrackingData';

/**
 * Loads urgent driver alerts mapped by driver ID.
 * Scoped to company, read-only, reusing Cross's driver tracking validity calculations.
 */
export async function loadDriverAlertsMap(
  companyFilter: string | null,
): Promise<Map<string, DriverAlertItem[]>> {
  try {
    const rows = await loadDriverTrackingRows(companyFilter);
    const map = new Map<string, DriverAlertItem[]>();
    for (const row of rows) {
      const urgent = (row.alertItems || []).filter((a) => a.urgent);
      if (urgent.length > 0) {
        map.set(row.id, urgent);
      }
    }
    return map;
  } catch (err) {
    console.error('Failed to load driver alerts map:', err);
    return new Map();
  }
}
