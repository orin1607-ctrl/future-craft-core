/** Per-vehicle gates for insurance alert surfaces (not documents/dates). */

export type VehicleInsuranceAlertFields = {
  insurance_alerts_enabled?: boolean | null;
  insurance_alerts_red_enabled?: boolean | null;
};

/** When false: no insurance 30/7/1 alerts, tracking, FleetOS, or sent notifications. */
export function isInsuranceAlertsEnabled(vehicle: VehicleInsuranceAlertFields | null | undefined): boolean {
  return vehicle?.insurance_alerts_enabled !== false;
}

/** When false: insurance alerts may show but without red/destructive styling. Default true. */
export function isInsuranceRedHighlightEnabled(vehicle: VehicleInsuranceAlertFields | null | undefined): boolean {
  return vehicle?.insurance_alerts_red_enabled !== false;
}

/** Red styling for insurance warnings only when alerts are on and red highlight is on. */
export function shouldShowInsuranceRed(vehicle: VehicleInsuranceAlertFields | null | undefined): boolean {
  return isInsuranceAlertsEnabled(vehicle) && isInsuranceRedHighlightEnabled(vehicle);
}
