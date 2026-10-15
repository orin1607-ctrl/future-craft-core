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
});
