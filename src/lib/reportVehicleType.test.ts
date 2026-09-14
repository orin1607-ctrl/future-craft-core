import { describe, expect, it } from 'vitest';
import { DEFAULT_VEHICLE_TYPES } from '@/lib/vehicleTypesConfig';
import { VEHICLE_EXPIRY_SELECT } from '@/lib/vehicleExpiryShared';
import {
  buildPlateToVehicleType,
  lookupVehicleTypeForPlate,
  uniqueReportVehicleTypes,
  vehicleTypeMatches,
} from './reportVehicleType';

const normalizePlate = (plate: string) => plate.replace(/[-\s]/g, '').toUpperCase();

const typesWithForklift = [
  ...DEFAULT_VEHICLE_TYPES,
  { id: 'forklift', label: 'מלגזה' },
];

describe('data source', () => {
  it('reads the existing vehicles.vehicle_type column — no new field', () => {
    expect(VEHICLE_EXPIRY_SELECT.split(',')).toContain('vehicle_type');
  });
});

describe('vehicleTypeMatches', () => {
  it('treats empty selection as הכל — every tool is included', () => {
    expect(vehicleTypeMatches('מלגזה', '', typesWithForklift)).toBe(true);
    expect(vehicleTypeMatches('רכב פרטי', null, typesWithForklift)).toBe(true);
    expect(vehicleTypeMatches('', '', typesWithForklift)).toBe(true);
  });

  it('selecting מלגזה keeps only tools defined as מלגזה', () => {
    expect(vehicleTypeMatches('מלגזה', 'מלגזה', typesWithForklift)).toBe(true);
    expect(vehicleTypeMatches('  מלגזה  ', 'מלגזה', typesWithForklift)).toBe(true);
    expect(vehicleTypeMatches('forklift', 'מלגזה', typesWithForklift)).toBe(true);
    expect(vehicleTypeMatches('רכב פרטי', 'מלגזה', typesWithForklift)).toBe(false);
    expect(vehicleTypeMatches('משאית', 'מלגזה', typesWithForklift)).toBe(false);
    expect(vehicleTypeMatches('', 'מלגזה', typesWithForklift)).toBe(false);
    expect(vehicleTypeMatches(null, 'מלגזה', typesWithForklift)).toBe(false);
  });

  it('matches stored config id against the Hebrew label', () => {
    expect(vehicleTypeMatches('private', 'רכב פרטי', DEFAULT_VEHICLE_TYPES)).toBe(true);
    expect(vehicleTypeMatches('רכב פרטי', 'private', DEFAULT_VEHICLE_TYPES)).toBe(true);
    expect(vehicleTypeMatches('commercial', 'רכב פרטי', DEFAULT_VEHICLE_TYPES)).toBe(false);
  });
});

describe('uniqueReportVehicleTypes', () => {
  it('lists configured labels plus values already stored on vehicles', () => {
    const options = uniqueReportVehicleTypes(
      [
        { vehicle_type: 'מלגזה' },
        { vehicle_type: 'מלגזה' },
        { vehicle_type: 'רכב פרטי' },
        { vehicle_type: '  ' },
      ],
      typesWithForklift,
    );
    expect(options).toContain('מלגזה');
    expect(options).toContain('רכב פרטי');
    expect(options).not.toContain('אחר');
    expect(options.filter((t) => t === 'מלגזה')).toHaveLength(1);
  });
});

describe('plate lookup + combined filters', () => {
  const vehicles = [
    { license_plate: '12-345-67', vehicle_type: 'מלגזה' },
    { license_plate: '98-765-43', vehicle_type: 'רכב פרטי' },
    { license_plate: '11-111-11', vehicle_type: 'מלגזה' },
  ];
  const plateToType = buildPlateToVehicleType(vehicles, normalizePlate);

  it('maps plates (including normalized) to vehicles.vehicle_type', () => {
    expect(lookupVehicleTypeForPlate('12-345-67', plateToType, normalizePlate)).toBe('מלגזה');
    expect(lookupVehicleTypeForPlate('1234567', plateToType, normalizePlate)).toBe('מלגזה');
    expect(lookupVehicleTypeForPlate('98-765-43', plateToType, normalizePlate)).toBe('רכב פרטי');
  });

  it('works together with an existing plate filter without dropping מלגזה rows', () => {
    const plateFilter = '12-345-67';
    const typeFilter = 'מלגזה';
    const rows = vehicles.filter((v) => {
      if (v.license_plate !== plateFilter) return false;
      return vehicleTypeMatches(v.vehicle_type, typeFilter, typesWithForklift);
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].license_plate).toBe('12-345-67');
  });

  it('הכל + existing company-style pass-through still returns every tool', () => {
    const rows = vehicles.filter((v) => vehicleTypeMatches(v.vehicle_type, '', typesWithForklift));
    expect(rows).toHaveLength(3);
  });

  it('excludes related records whose plate is not a מלגזה', () => {
    const faults = [
      { vehicle_plate: '12-345-67', note: 'forklift fault' },
      { vehicle_plate: '98-765-43', note: 'car fault' },
    ];
    const filtered = faults.filter((f) =>
      vehicleTypeMatches(
        lookupVehicleTypeForPlate(f.vehicle_plate, plateToType, normalizePlate),
        'מלגזה',
        typesWithForklift,
      ),
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].note).toBe('forklift fault');
  });
});
