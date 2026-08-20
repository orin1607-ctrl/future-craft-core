import { describe, expect, it } from 'vitest';
import { vehicleNeedsTrackingAttention, type TrackingVehicleRow } from './vehicleTrackingData';

function row(partial: Partial<TrackingVehicleRow>): TrackingVehicleRow {
  return {
    id: 'v1',
    license_plate: '1',
    internal_number: '1',
    company_name: 'QA',
    department: null,
    manufacturer: 'x',
    model: 'y',
    year: 2020,
    driver_name: null,
    status: 'active',
    status_text: 'פעיל',
    current_location: '—',
    odometer: 0,
    service_status: null,
    in_garage: false,
    days_in_garage: 0,
    has_open_fault: false,
    has_open_defect: false,
    has_open_accident: false,
    has_open_alert: true,
    has_active_service: false,
    has_active_transport: false,
    test_expiry: null,
    insurance_expiry: null,
    insurance_alerts_enabled: true,
    insurance_alerts_red_enabled: true,
    alert_items: [],
    alert_kinds: [],
    ...partial,
  };
}

describe('vehicleNeedsTrackingAttention', () => {
  it('does not treat missing license document alone as dashboard attention', () => {
    expect(
      vehicleNeedsTrackingAttention(
        row({
          alert_items: [{ kind: 'license', label: 'רישיון', detail: 'חסר', hubLink: '/' }],
          alert_kinds: ['license'],
        }),
      ),
    ).toBe(false);
  });

  it('counts expired/upcoming test as attention', () => {
    expect(
      vehicleNeedsTrackingAttention(
        row({
          alert_items: [{ kind: 'test', label: 'טסט', detail: 'פג', hubLink: '/' }],
          alert_kinds: ['test'],
        }),
      ),
    ).toBe(true);
  });
});
