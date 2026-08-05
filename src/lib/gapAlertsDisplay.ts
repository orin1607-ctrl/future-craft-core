import type { GapAlertConfigItem, GapAlertValues } from '@/lib/vehicleGapAlertsDefaults';

export function buildGapAlertDetailRows(
  items: GapAlertConfigItem[],
  values: GapAlertValues,
): { label: string; value: string; isSummary?: boolean }[] {
  return [...items]
    .filter((item) => item.visible)
    .sort((a, b) => a.order - b.order)
    .map((item) => ({
      label: item.displayLabel,
      value: values[item.key] ?? '—',
      isSummary: item.locked === true,
    }));
}
