import { describe, expect, it } from 'vitest';
import { applyFleetOSFilters } from './fleetosFilters';
import { EMPTY_FLEETOS_FILTERS } from './FleetOSFilterBar';
import type { FleetOSVehicleRow } from './fleetosData';
import { trackingRowToFleetOS } from './fleetosData';
import { excludeMappedUnknownDevices } from './starlink/loadOverlay';
import { assignmentOnlyOverlay } from './starlink/emptyOverlay';
import type { TrackingVehicleRow } from '@/lib/vehicleTrackingData';

function row(over: Partial<FleetOSVehicleRow> = {}): FleetOSVehicleRow {
  return {
    id: '295b935a-16f9-4e7a-a920-7bae92a4dc9a',
    plate: '36806603',
    status: 'stopped',
    status_text: 'פעיל',
    company_name: 'אכבים',
    make: 'איסוזו',
    model: 'די מקס',
    year: 2023,
    telematics: assignmentOnlyOverlay('043284', null),
    ...over,
  };
}

describe('FleetOS ERM assign UI queries', () => {
  it('plate filter also matches assigned Unit ID so 043284 does not empty the list', () => {
    const filtered = applyFleetOSFilters([row()], { ...EMPTY_FLEETOS_FILTERS, plate: '043284' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].plate).toBe('36806603');
  });

  it('plate filter still matches license plate', () => {
    const filtered = applyFleetOSFilters([row()], { ...EMPTY_FLEETOS_FILTERS, plate: '36806603' });
    expect(filtered).toHaveLength(1);
  });

  it('hides unknown_device rows after the unit is mapped in gps_devices', () => {
    const visible = excludeMappedUnknownDevices(
      [
        { id: 'a', unitHint: '043284' },
        { id: 'b', unitHint: '999999' },
      ],
      ['043284'],
    );
    expect(visible.map((r) => r.unitHint)).toEqual(['999999']);
  });

  it('passes year through so assigned vehicle shows 2023', () => {
    const tracking = {
      id: '295b935a-16f9-4e7a-a920-7bae92a4dc9a',
      license_plate: '36806603',
      internal_number: '—',
      company_name: 'אכבים',
      department: null,
      manufacturer: 'איסוזו',
      model: 'די מקס',
      year: 2023,
      driver_name: null,
      status: 'active',
      status_text: 'פעיל',
      current_location: null,
      odometer: 1111,
      service_status: null,
      in_garage: false,
      days_in_garage: 0,
      has_open_fault: false,
      has_open_defect: false,
      has_open_accident: false,
      has_open_alert: false,
      has_active_service: false,
      has_active_transport: false,
      test_expiry: null,
      insurance_expiry: null,
      insurance_alerts_enabled: false,
      insurance_alerts_red_enabled: false,
      alert_items: [],
      alert_kinds: [],
      notes: null,
    } as TrackingVehicleRow;
    const mapped = trackingRowToFleetOS(tracking);
    expect(mapped?.year).toBe(2023);
    expect(mapped?.make).toBe('איסוזו');
    expect(mapped?.model).toBe('די מקס');
    expect(mapped?.plate).toBe('36806603');
  });
});
