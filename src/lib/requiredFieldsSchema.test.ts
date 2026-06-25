import { describe, expect, it } from 'vitest';
import {
  buildDefaultRequiredMap,
  fieldConfigId,
  isFieldRequiredInMap,
  mergeRequiredFields,
} from './requiredFieldsSchema';

describe('requiredFieldsSchema', () => {
  it('defaults vehicle_plate required, comprehensive insurance optional', () => {
    const map = buildDefaultRequiredMap();
    expect(map[fieldConfigId('vehicles', 'vehicle_plate')]).toBe(true);
    expect(isFieldRequiredInMap('vehicles', 'comprehensive_insurance_company', map)).toBe(false);
    expect(isFieldRequiredInMap('vehicles', 'third_party_insurance_end', map)).toBe(false);
  });

  it('merges overrides over defaults', () => {
    const merged = mergeRequiredFields({
      [fieldConfigId('vehicles', 'manufacturer')]: true,
      [fieldConfigId('vehicles', 'vehicle_plate')]: false,
    });
    expect(isFieldRequiredInMap('vehicles', 'manufacturer', merged)).toBe(true);
    expect(isFieldRequiredInMap('vehicles', 'vehicle_plate', merged)).toBe(false);
  });
});
