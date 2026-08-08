/** Per-vehicle gate for insurance-only alert surfaces (not documents/dates). */

export type VehicleInsuranceAlertFields = {
  insurance_alerts_enabled?: boolean | null;
};

export function isInsuranceAlertsEnabled(vehicle: VehicleInsuranceAlertFields | null | undefined): boolean {
  return vehicle?.insurance_alerts_enabled !== false;
}
