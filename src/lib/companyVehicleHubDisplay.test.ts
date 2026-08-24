import { describe, expect, it } from 'vitest';
import {
  companyVehicleHubDisplayConfigKey,
  DEFAULT_COMPANY_VEHICLE_HUB_DISPLAY,
  normalizeCompanyVehicleHubDisplay,
} from './companyVehicleHubDisplay';

describe('companyVehicleHubDisplay', () => {
  it('defaults missing config to recent-actions ON', () => {
    expect(normalizeCompanyVehicleHubDisplay(null)).toEqual(DEFAULT_COMPANY_VEHICLE_HUB_DISPLAY);
    expect(normalizeCompanyVehicleHubDisplay({})).toEqual(DEFAULT_COMPANY_VEHICLE_HUB_DISPLAY);
  });

  it('treats explicit false as OFF without deleting history', () => {
    expect(normalizeCompanyVehicleHubDisplay({ showRecentActionsOnHub: false })).toEqual({
      showRecentActionsOnHub: false,
    });
  });

  it('scopes storage keys per company', () => {
    expect(companyVehicleHubDisplayConfigKey('קיבוץ בארי')).toBe(
      'company_vehicle_hub_display:קיבוץ בארי',
    );
    expect(companyVehicleHubDisplayConfigKey('QA-A')).not.toBe(
      companyVehicleHubDisplayConfigKey('QA-B'),
    );
  });
});
