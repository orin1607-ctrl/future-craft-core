import { describe, expect, it } from 'vitest';
import { getAllDisplayFields } from './daliaVehicleLoad';

describe('vehicle card department display', () => {
  it('shows the stored department and the empty label without writing data', () => {
    const filled = getAllDisplayFields({ department: 'הסעות', license_plate: '1' });
    expect(filled.find((field) => field.key === 'department')).toMatchObject({
      label: 'מחלקה',
      value: 'הסעות',
      section: '1. פרטי רכב',
    });
    const empty = getAllDisplayFields({ department: '  ', license_plate: '1' });
    expect(empty.find((field) => field.key === 'department')?.value).toBe('לא משויך למחלקה');
  });

  it('does not display a stored object string as a field value', () => {
    const fields = getAllDisplayFields({
      inspections_certificates: '[object Object]',
      license_plate: '19807',
      department: 'גדש',
    });
    expect(fields.some((field) => field.value.includes('object Object'))).toBe(false);
    expect(fields.find((field) => field.key === 'accessories_validity')).toBeUndefined();
    expect(fields.find((field) => field.key === 'accessories_validity_date')).toBeUndefined();
    expect(fields.find((field) => field.key === 'department')?.value).toBe('גדש');
  });
});
