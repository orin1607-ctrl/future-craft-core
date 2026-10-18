import { describe, expect, it } from 'vitest';
import { investigationFromRow, investigationPayload, yesNoLabel } from './accidentInvestigation';

describe('accident investigation fields', () => {
  it('reads unknown or missing values as empty', () => {
    expect(investigationFromRow(null)).toEqual({ driverAtFault: '', investigationDone: '', investigationConclusions: '' });
    expect(investigationFromRow({ driver_at_fault: 'maybe', investigation_done: 'no' }).driverAtFault).toBe('');
  });

  it('writes nothing when the investigation was not touched', () => {
    const row = investigationFromRow({ driver_at_fault: 'yes', investigation_done: 'no', investigation_conclusions: 'x' });
    expect(investigationPayload(row, row)).toEqual({});
    expect(investigationPayload(investigationFromRow(null))).toEqual({});
  });

  it('writes only the changed fields and clears with null', () => {
    const initial = investigationFromRow({ driver_at_fault: 'yes', investigation_done: 'yes', investigation_conclusions: 'old' });
    expect(
      investigationPayload({ driverAtFault: '', investigationDone: 'yes', investigationConclusions: '  new  ' }, initial),
    ).toEqual({ driver_at_fault: null, investigation_conclusions: 'new' });
  });

  it('labels yes / no answers in Hebrew', () => {
    expect(yesNoLabel('yes', '—')).toBe('כן');
    expect(yesNoLabel('no', '—')).toBe('לא');
    expect(yesNoLabel(null, 'טרם נקבע')).toBe('טרם נקבע');
  });
});
