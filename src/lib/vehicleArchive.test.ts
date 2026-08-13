import { describe, expect, it } from 'vitest';
import {
  excludeArchivedVehicles,
  isVehicleArchived,
  isVehicleInActiveFleet,
} from './vehicleArchive';

describe('vehicleArchive', () => {
  it('treats only status archived as archived', () => {
    expect(isVehicleArchived('archived')).toBe(true);
    expect(isVehicleArchived('Archived')).toBe(true);
    expect(isVehicleArchived('active')).toBe(false);
    expect(isVehicleArchived('in_service')).toBe(false);
    expect(isVehicleArchived('out_of_service')).toBe(false);
    expect(isVehicleArchived(null)).toBe(false);
  });

  it('active fleet excludes archived only', () => {
    expect(isVehicleInActiveFleet('active')).toBe(true);
    expect(isVehicleInActiveFleet('out_of_service')).toBe(true);
    expect(isVehicleInActiveFleet('archived')).toBe(false);
  });

  it('excludeArchivedVehicles filters rows', () => {
    const rows = [
      { id: '1', status: 'active' },
      { id: '2', status: 'archived' },
      { id: '3', status: 'in_service' },
    ];
    expect(excludeArchivedVehicles(rows).map((r) => r.id)).toEqual(['1', '3']);
  });
});
