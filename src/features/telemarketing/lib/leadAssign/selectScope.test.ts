import { describe, expect, it } from 'vitest';
import {
  filterDirectoryRows,
  isDirectoryFilterActive,
  parseFleetSize,
  selectAllLabel,
  sortDirectoryRows,
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
    archivedAt: null,
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

  it('hides archived leads unless archive filter is on', () => {
    const withArchive = [
      ...rows,
      row({ id: '4', leadNumber: '4', companyName: 'ארכיון', archivedAt: '2026-08-26T00:00:00Z' }),
    ];
    expect(filterDirectoryRows(withArchive, '', 'all').map((r) => r.id)).toEqual(['1', '2', '3']);
    expect(filterDirectoryRows(withArchive, '', 'archive').map((r) => r.id)).toEqual(['4']);
  });

  it('parses fleet size from first digits only', () => {
    expect(parseFleetSize('300+')).toBe(300);
    expect(parseFleetSize('5–10')).toBe(5);
    expect(parseFleetSize('')).toBeNull();
    expect(parseFleetSize('אין')).toBeNull();
  });

  it('filters by fleet range and excludes unknown sizes', () => {
    const fleetRows = [
      row({ id: '1', leadNumber: '1', fleetSize: '8+' }),
      row({ id: '2', leadNumber: '2', fleetSize: '25+' }),
      row({ id: '3', leadNumber: '3', fleetSize: '50+' }),
      row({ id: '4', leadNumber: '4', fleetSize: '' }),
    ];
    expect(filterDirectoryRows(fleetRows, '', 'all', { min: 5, max: 10 }).map((r) => r.id)).toEqual(['1']);
    expect(filterDirectoryRows(fleetRows, '', 'all', { min: 5, max: 40 }).map((r) => r.id)).toEqual(['1', '2']);
    expect(filterDirectoryRows(fleetRows, '', 'all', { min: 41, max: null }).map((r) => r.id)).toEqual(['3']);
    expect(isDirectoryFilterActive('', 'all', { min: 5, max: 10 })).toBe(true);
  });

  it('sorts by fleet with unknown last', () => {
    const fleetRows = [
      row({ id: 'a', fleetSize: '40+' }),
      row({ id: 'b', fleetSize: '' }),
      row({ id: 'c', fleetSize: '8+' }),
    ];
    expect(sortDirectoryRows(fleetRows, 'fleet_asc').map((r) => r.id)).toEqual(['c', 'a', 'b']);
    expect(sortDirectoryRows(fleetRows, 'fleet_desc').map((r) => r.id)).toEqual(['a', 'c', 'b']);
  });
});
