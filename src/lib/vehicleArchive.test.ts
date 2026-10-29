import { describe, expect, it } from 'vitest';
import {
  buildArchivedVehicleRefs,
  EMPTY_ARCHIVED_VEHICLE_REFS,
  excludeArchivedVehicles,
  isArchivedVehicleRef,
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

describe('archived vehicle refs (alerts that point at a vehicle by plate or vid)', () => {
  const rows = [
    { id: 'a1', license_plate: '11-111-11', status: 'archived' },
    { id: 'v2', license_plate: '22-222-22', status: 'active' },
    // An old archived row whose plate now belongs to an active vehicle.
    { id: 'a3', license_plate: '33-333-33', status: 'archived' },
    { id: 'v3', license_plate: '33-333-33', status: 'active' },
  ];

  it('flags alerts of an archived vehicle by id or by plate', () => {
    const refs = buildArchivedVehicleRefs(rows);
    expect(isArchivedVehicleRef(refs, { vehicleId: 'a1' })).toBe(true);
    expect(isArchivedVehicleRef(refs, { plate: '11111-11' })).toBe(true);
    expect(isArchivedVehicleRef(refs, { vehicleId: 'v2', plate: '22-222-22' })).toBe(false);
    expect(isArchivedVehicleRef(refs, { plate: '22-222-22' })).toBe(false);
  });

  it('never hides an active vehicle that reuses an archived plate', () => {
    const refs = buildArchivedVehicleRefs(rows);
    expect(isArchivedVehicleRef(refs, { plate: '33-333-33' })).toBe(false);
    expect(isArchivedVehicleRef(refs, { vehicleId: 'v3' })).toBe(false);
  });

  it('a vehicle restored from the archive is active again on the next read', () => {
    const restored = rows.map((r) => (r.id === 'a1' ? { ...r, status: 'active' } : r));
    const refs = buildArchivedVehicleRefs(restored);
    expect(isArchivedVehicleRef(refs, { vehicleId: 'a1' })).toBe(false);
    expect(isArchivedVehicleRef(refs, { plate: '11-111-11' })).toBe(false);
  });

  it('alerts without a vehicle (driver / company alerts) are never filtered', () => {
    const refs = buildArchivedVehicleRefs(rows);
    expect(isArchivedVehicleRef(refs, {})).toBe(false);
    expect(isArchivedVehicleRef(EMPTY_ARCHIVED_VEHICLE_REFS, { plate: '11-111-11' })).toBe(false);
  });
});
