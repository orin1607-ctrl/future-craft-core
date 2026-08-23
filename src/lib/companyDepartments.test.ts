import { describe, expect, it } from 'vitest';
import { collectDepartmentsFromVehicles, mergeDepartmentNames } from './companyDepartments';

describe('mergeDepartmentNames', () => {
  it('unions vehicle and driver departments into one company list', () => {
    expect(mergeDepartmentNames(['אחזקה', ' ביטחון '], ['חקלאות', 'אחזקה', ''])).toEqual([
      'אחזקה',
      'ביטחון',
      'חקלאות',
    ]);
  });

  it('ignores empty values', () => {
    expect(mergeDepartmentNames([null, undefined, '  '], [])).toEqual([]);
  });
});

describe('collectDepartmentsFromVehicles', () => {
  it('keeps company scope and includes import_buffer departments', () => {
    const names = collectDepartmentsFromVehicles(
      [
        { company_name: 'QA-A', department: 'אחזקה', import_buffer: { departments: ['ביטחון'] } },
        { company_name: 'QA-B', department: 'זר', import_buffer: null },
        { company_name: 'QA-A', department: null, import_buffer: { departments: ['חקלאות'] } },
      ],
      'QA-A',
    );
    expect(names).toEqual(['אחזקה', 'ביטחון', 'חקלאות']);
  });
});
