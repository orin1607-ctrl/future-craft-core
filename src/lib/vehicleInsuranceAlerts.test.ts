import { describe, expect, it } from 'vitest';
import {
  isInsuranceAlertsEnabled,
  isInsuranceRedHighlightEnabled,
  shouldShowInsuranceRed,
} from './vehicleInsuranceAlerts';

describe('vehicleInsuranceAlerts', () => {
  it('defaults alerts and red highlight to enabled', () => {
    expect(isInsuranceAlertsEnabled({})).toBe(true);
    expect(isInsuranceRedHighlightEnabled({})).toBe(true);
    expect(shouldShowInsuranceRed({})).toBe(true);
  });

  it('disables alerts when insurance_alerts_enabled is false', () => {
    expect(isInsuranceAlertsEnabled({ insurance_alerts_enabled: false })).toBe(false);
    expect(shouldShowInsuranceRed({ insurance_alerts_enabled: false, insurance_alerts_red_enabled: true })).toBe(false);
  });

  it('allows alerts without red when red toggle is off', () => {
    expect(
      shouldShowInsuranceRed({ insurance_alerts_enabled: true, insurance_alerts_red_enabled: false }),
    ).toBe(false);
    expect(isInsuranceAlertsEnabled({ insurance_alerts_enabled: true, insurance_alerts_red_enabled: false })).toBe(true);
  });
});
