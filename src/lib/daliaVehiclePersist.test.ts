import { describe, it, expect } from 'vitest';
import { buildVehiclePayloadFromDalia } from '@/lib/daliaVehiclePersist';
import { loadDaliaFromVehicleRow, getAllDisplayFields } from '@/lib/daliaVehicleLoad';
import { PREVIEW_VEHICLE } from '@/dev/vehicleHubPreviewMock';

describe('buildVehiclePayloadFromDalia', () => {
  const user = { id: 'u1', company_name: 'דליה', full_name: 'בדיקה' };
  const extras = {
    docs: [],
    departments: ['לוגיסטיקה'],
    route: 'ליסינג תפעולי',
    maintMethod: 'דליה',
    sectionSaved: { 1: true },
  };

  it('maps vehicle_color and end_or_scrap_date to direct columns', () => {
    const { payload } = buildVehiclePayloadFromDalia(
      {
        vehicle_plate: '1234567',
        manufacturer: 'טויוטה',
        model: 'קורולה',
        vehicle_color: 'לבן',
        end_or_scrap_date: '2030-12-31',
        vehicle_status: 'פעיל',
      },
      extras,
      user,
    );
    expect(payload.vehicle_color).toBe('לבן');
    expect(payload.end_or_scrap_date).toBe('2030-12-31');
    expect(payload.license_plate).toBe('1234567');
  });

  it('packs maint_notes into maintenance_details JSON', () => {
    const { payload } = buildVehiclePayloadFromDalia(
      {
        vehicle_plate: '7654321',
        maint_notes: 'הערת תחזוקה',
        vehicle_status: 'פעיל',
      },
      extras,
      user,
    );
    const maint = JSON.parse(String(payload.maintenance_details));
    expect(maint.notes).toBe('הערת תחזוקה');
  });

  it('round-trip: save → load → hub displays populated fields', () => {
    const allValues: Record<string, string> = {
      vehicle_plate: '1112223',
      internal_number: 'INT-RT',
      manufacturer: 'טויוטה',
      model: 'קורולה',
      vehicle_color: 'לבן',
      end_or_scrap_date: '2030-12-31',
      vehicle_status: 'פעיל',
      assigned_driver: 'אבי כהן',
      ownership_route: 'ליסינג תפעולי',
      op_company: 'חברת ליס',
      op_monthly_cost: '3000',
      mandatory_insurance_company: 'הפניקס',
      mandatory_insurance_cost: '4000',
      coverage_glass: 'true',
      current_km: '50000',
      maintenance_method: 'דליה',
      maint_supervisor: 'דני',
    };
    const { payload } = buildVehiclePayloadFromDalia(allValues, extras, user);
    const loaded = loadDaliaFromVehicleRow(payload as Record<string, unknown>);
    expect(loaded.values.vehicle_color).toBe('לבן');
    expect(loaded.values.op_company).toBe('חברת ליס');
    const hubFields = getAllDisplayFields(payload as Record<string, unknown>);
    expect(hubFields.length).toBeGreaterThan(15);
    const keys = new Set(hubFields.map((f) => f.key));
    expect(keys.has('vehicle_color')).toBe(true);
    expect(keys.has('op_company')).toBe(true);
    expect(keys.has('mandatory_insurance_company')).toBe(true);
  });

  it('preview mock hub shows only populated fields (~39 not 291)', () => {
    const hubFields = getAllDisplayFields(PREVIEW_VEHICLE as unknown as Record<string, unknown>);
    // Mock has partial data — 39 populated keys in preview, not all 291 slots
    expect(hubFields.length).toBe(39);
    expect(hubFields.length).toBeGreaterThan(20);
    expect(hubFields.length).toBeLessThan(80);
  });
});
