import { describe, expect, it } from 'vitest';
import {
  filterDirectoryRows,
  isDirectoryFilterActive,
  isWorkPriorityExhausted,
  parseFleetSize,
  selectAllLabel,
  sortDirectoryRows,
  summarizeAgentLeadWorkload,
  summarizeWorkPriority,
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
    leadWave: 'old',
    workPriorityAt: null,
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

  it('filters old vs new lead waves', () => {
    const mixed = [
      row({ id: '1', leadNumber: '1', leadWave: 'old' }),
      row({ id: '2', leadNumber: '2', leadWave: 'new' }),
    ];
    expect(filterDirectoryRows(mixed, '', 'all', { min: null, max: null }, 'old').map((r) => r.id)).toEqual(['1']);
    expect(filterDirectoryRows(mixed, '', 'all', { min: null, max: null }, 'new').map((r) => r.id)).toEqual(['2']);
    expect(isDirectoryFilterActive('', 'all', { min: null, max: null }, 'new')).toBe(true);
  });

  it('unknown fleet preset keeps rows without a vehicle count', () => {
    const fleetRows = [
      row({ id: '1', fleetSize: '8+' }),
      row({ id: '2', fleetSize: '' }),
    ];
    expect(filterDirectoryRows(fleetRows, '', 'all', { min: null, max: null, unknownOnly: true }).map((r) => r.id)).toEqual(['2']);
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

  it('summarizes assigned / activity / idle / open follow-up without double-counting a lead', () => {
    const agents = [
      { id: 'tair', displayName: 'תאיר' },
      { id: 'avi', displayName: 'אבי' },
    ];
    const directory = [
      row({ id: '1', assignedTo: 'tair', assignedName: 'תאיר', phone: '03-111', companyName: 'אלפא' }),
      row({ id: '2', assignedTo: 'tair', assignedName: 'תאיר', phone: '03-222', companyName: 'בטא' }),
      row({ id: '3', assignedTo: 'tair', assignedName: 'תאיר', phone: '03-333', companyName: 'גמא' }),
      row({ id: '4', assignedTo: null, phone: '03-444', companyName: 'דלתא' }),
    ];
    const summary = summarizeAgentLeadWorkload(directory, agents, {
      callKeys: ['p:03111'],
      stateKeys: [
        { key: 'p:03222', color: 'yellow' },
        { key: 'p:03111', color: 'red' },
      ],
      openFollowupKeys: ['p:03222'],
    });
    const tair = summary.find((s) => s.agentId === 'tair')!;
    const avi = summary.find((s) => s.agentId === 'avi')!;
    const none = summary.find((s) => s.agentId === 'unassigned')!;
    expect(tair.assigned).toBe(3);
    expect(tair.withActivity).toBe(2);
    expect(tair.withoutActivity).toBe(1);
    expect(tair.openFollowup).toBe(1);
    expect(avi.assigned).toBe(0);
    expect(avi.withActivity).toBe(0);
    expect(none.assigned).toBe(1);
    expect(tair.withActivity + tair.withoutActivity).toBe(tair.assigned);
  });

  it('combines city + mobile + new wave and select-all stays on filtered ids', () => {
    const mixed = [
      row({ id: '1', leadWave: 'new', region: 'ראשון לציון', phone: '0501234567', workPriorityAt: null }),
      row({ id: '2', leadWave: 'new', region: 'ראשון לציון', phone: '0312345678' }),
      row({ id: '3', leadWave: 'new', region: 'חולון', phone: '0509999999' }),
      row({ id: '4', leadWave: 'old', region: 'ראשון לציון', phone: '0501111111' }),
    ];
    const extra = { city: 'ראשון לציון', macro: '', industry: '', contact: 'mobile' as const, priority: 'all' as const };
    const filtered = filterDirectoryRows(mixed, '', 'all', { min: null, max: null }, 'new', extra);
    expect(filtered.map((r) => r.id)).toEqual(['1']);
    expect(isDirectoryFilterActive('', 'all', { min: null, max: null }, 'new', extra)).toBe(true);
    expect(selectAllLabel(filtered.length, mixed.length, true)).toContain('בתוצאות המסוננות (1)');
    expect(selectAllLabel(filtered.length, mixed.length, true)).toContain('לא את כל המאגר (4)');
  });

  it('filters work priority without changing assignment fields', () => {
    const mixed = [
      row({ id: '1', assignedTo: 'tair', workPriorityAt: '2026-08-31T08:00:00Z' }),
      row({ id: '2', assignedTo: 'tair', workPriorityAt: null }),
    ];
    const extra = { city: '', macro: '', industry: '', contact: 'all' as const, priority: 'priority' as const };
    const filtered = filterDirectoryRows(mixed, '', 'tair', { min: null, max: null }, 'all', extra);
    expect(filtered.map((r) => r.id)).toEqual(['1']);
    expect(filtered[0].assignedTo).toBe('tair');
  });

  it('sorts priority group first then by mark time', () => {
    const mixed = [
      row({ id: 'a', workPriorityAt: '2026-08-31T10:00:00Z' }),
      row({ id: 'b', workPriorityAt: null }),
      row({ id: 'c', workPriorityAt: '2026-08-31T08:00:00Z' }),
    ];
    expect(sortDirectoryRows(mixed, 'priority_first').map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });

  it('counts remaining vs treated with the same activity keys as workload', () => {
    const mixed = [
      row({ id: '1', workPriorityAt: '2026-08-31T08:00:00Z', phone: '03-111', companyName: 'אלפא' }),
      row({ id: '2', workPriorityAt: '2026-08-31T08:01:00Z', phone: '03-222', companyName: 'בטא' }),
      row({ id: '3', workPriorityAt: null, phone: '03-333', companyName: 'גמא' }),
    ];
    const empty = summarizeWorkPriority(mixed, { callKeys: [], stateKeys: [], openFollowupKeys: [] });
    expect(empty).toEqual({ total: 2, remaining: 2, treated: 0 });
    expect(isWorkPriorityExhausted(empty)).toBe(false);

    const afterOne = summarizeWorkPriority(mixed, {
      callKeys: ['p:03111'],
      stateKeys: [],
      openFollowupKeys: [],
    });
    expect(afterOne).toEqual({ total: 2, remaining: 1, treated: 1 });
    expect(isWorkPriorityExhausted(afterOne)).toBe(false);

    const afterAll = summarizeWorkPriority(mixed, {
      callKeys: ['p:03111'],
      stateKeys: [{ key: 'p:03222', color: 'red' }],
      openFollowupKeys: [],
    });
    expect(afterAll).toEqual({ total: 2, remaining: 0, treated: 2 });
    expect(isWorkPriorityExhausted(afterAll)).toBe(true);
  });

  it('does not show exhausted when there is no priority group', () => {
    expect(isWorkPriorityExhausted({ total: 0, remaining: 0 })).toBe(false);
  });
});
