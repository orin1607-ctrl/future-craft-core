import { describe, expect, it } from 'vitest';
import { formatVehicleIds, internalNumberClassName } from './vehiclePlateDisplay';

describe('vehiclePlateDisplay', () => {
  it('formatVehicleIds joins plate and internal', () => {
    expect(formatVehicleIds('1234567', '917')).toBe('1234567 · 917');
  });

  it('exports red bold class for internal numbers', () => {
    expect(internalNumberClassName).toContain('destructive');
    expect(internalNumberClassName).toContain('font-bold');
  });
});
