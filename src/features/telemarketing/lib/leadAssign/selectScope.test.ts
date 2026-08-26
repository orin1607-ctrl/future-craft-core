import { describe, expect, it } from 'vitest';
import {
  filterDirectoryRows,
  isDirectoryFilterActive,
  selectAllLabel,
} from './selectScope';
import type { LeadDirectoryRecord } from '@/features/telemarketing/lib/leadImport/types';

function row(partial: Partial<LeadDirectoryRecord> & { id: string }): LeadDirectoryRecord {
  return {
    leadNumber: '',
    companyName: '',
    industry: '',
    region: '',
    fleetSize: '',
    phone: '',
    email: '',
    extra: {},
    importBatchId: null,
    source: '',
    createdAt: '',
    assignedTo: null,
    assignedName: '',
    assignedAt: null,
    claimedBy: null,
    claimedAt: null,
    ...partial,
  };
}

describe('lead assign select scope', () => {
  const rows = [
    row({ id: '1', leadNumber: '1', companyName: 'אלפא', assignedTo: 'tair', assignedName: 'טאיר' }),
    row({ id: '2', leadNumber: '2', companyName: 'בטא', assignedTo: null, assignedName: '' }),
    row({ id: '3', leadNumber: '3', companyName: 'גמא', assignedTo: 'avi', assignedName: 'אבי' }),
  ];

  it('select-all with no filter covers the whole pool', () => {
    const filtered = filterDirectoryRows(rows, '', 'all');
    expect(filtered.map((r) => r.id)).toEqual(['1', '2', '3']);
    expect(isDirectoryFilterActive('', 'all')).toBe(false);
    expect(selectAllLabel(filtered.length, rows.length, false)).toBe('בחר הכול במאגר (3)');
  });

  it('select-all with search only covers filtered results', () => {
    const filtered = filterDirectoryRows(rows, 'בטא', 'all');
    expect(filtered.map((r) => r.id)).toEqual(['2']);
    expect(isDirectoryFilterActive('בטא', 'all')).toBe(true);
    expect(selectAllLabel(filtered.length, rows.length, true)).toContain('בתוצאות המסוננות (1)');
    expect(selectAllLabel(filtered.length, rows.length, true)).toContain('לא את כל המאגר (3)');
  });

  it('unassigned filter excludes assigned leads', () => {
    const filtered = filterDirectoryRows(rows, '', 'unassigned');
    expect(filtered.map((r) => r.id)).toEqual(['2']);
  });

  it('employee filter shows only that employee', () => {
    const filtered = filterDirectoryRows(rows, '', 'tair');
    expect(filtered.map((r) => r.id)).toEqual(['1']);
  });
});
