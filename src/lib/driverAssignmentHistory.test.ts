import { describe, expect, it } from 'vitest';
import {
  DRIVER_ASSIGNMENT_EVENT_TYPE,
  buildDriverAssignmentHistoryRow,
  parseInitialKm,
} from './driverAssignmentHistory';

describe('parseInitialKm', () => {
  it('accepts empty as no value', () => {
    expect(parseInitialKm('')).toEqual({ km: null, error: null });
    expect(parseInitialKm('   ')).toEqual({ km: null, error: null });
  });

  it('parses grouped thousands', () => {
    expect(parseInitialKm('85,420')).toEqual({ km: 85420, error: null });
    expect(parseInitialKm('85 420')).toEqual({ km: 85420, error: null });
  });

  it('rejects non-numeric input', () => {
    expect(parseInitialKm('abc').error).toBeTruthy();
  });
});

describe('buildDriverAssignmentHistoryRow', () => {
  it('stores driver, vehicle, time and initial km without implying vehicle odometer overwrite', () => {
    const row = buildDriverAssignmentHistoryRow({
      vehicleId: 'veh-1',
      companyName: 'אורן קאר',
      driverId: 'drv-1',
      driverName: 'ישראל ישראלי',
      vehiclePlate: '12-345-67',
      initialKm: 85420,
      assignedAt: new Date('2026-09-06T10:00:00.000Z'),
      createdBy: 'admin-1',
    });
    expect(row.event_type).toBe(DRIVER_ASSIGNMENT_EVENT_TYPE);
    expect(row.vehicle_id).toBe('veh-1');
    expect(row.assigned_driver_id).toBe('drv-1');
    expect(row.odometer).toBe(85420);
    expect(row.description).toContain('ישראל ישראלי');
    expect(row.description).toContain('12-345-67');
    expect(row.source).toBe('driver_assignment');
  });
});
