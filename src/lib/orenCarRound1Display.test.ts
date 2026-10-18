import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { fieldConfigId } from './requiredFieldsSchema';
import { validateRequiredModuleFields } from './requiredFieldsValidate';

describe('round-1 Oren Car display fixes', () => {
  it('keeps the top license upload and hides only the unused test-file upload', () => {
    const src = readFileSync('src/components/vehicles/vehicleNewDalia/VehicleNewFormDalia.tsx', 'utf8');
    expect(src).toContain('העלאת קובץ רישיון');
    expect(src).toContain('FileWrap name="license_file"');
    expect(src).not.toMatch(/<Fld label="העלאת קובץ טסט"/);
    expect(src).not.toContain('FileWrap name="test_file"');
    expect(src).toContain('קישור מסמך טסט');
  });

  it('imports useSearchParams so ביקורת רכב does not crash on a black screen', () => {
    const src = readFileSync('src/pages/VehicleInspections.tsx', 'utf8');
    expect(src).toMatch(/import \{ useSearchParams \} from 'react-router-dom'/);
    expect(src).toContain('const [searchParams] = useSearchParams()');
  });

  it('does not block vehicle save when a hidden test-file field is marked required', () => {
    const result = validateRequiredModuleFields(
      'vehicles',
      { vehicle_plate: '1234567' },
      { [fieldConfigId('vehicles', 'test_file_name')]: true },
    );
    expect(result).toEqual({ ok: true });
  });
});
