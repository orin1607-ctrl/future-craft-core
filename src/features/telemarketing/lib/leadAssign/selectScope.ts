import type { LeadDirectoryRecord } from '@/features/telemarketing/lib/leadImport/types';
import { isUsableLeadKey, leadKey } from '@/features/telemarketing/lib/leadKey';

export type AgentFilter = 'all' | 'unassigned' | 'archive' | string;
export type DirectorySort = 'default' | 'fleet_asc' | 'fleet_desc';
export type WaveFilter = 'all' | 'old' | 'new';
export type FleetFilter = { min: number | null; max: number | null; unknownOnly?: boolean };

/** First integer in the stored fleet text. Does not invent a size when none exists. */
export function parseFleetSize(raw: string | null | undefined): number | null {
  const m = String(raw || '').match(/\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function filterDirectoryRows(
  rows: LeadDirectoryRecord[],
  query: string,
  agentFilter: AgentFilter,
  fleet: FleetFilter = { min: null, max: null },
  wave: WaveFilter = 'all',
): LeadDirectoryRecord[] {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => {
    const archived = Boolean(row.archivedAt);
    if (agentFilter === 'archive') {
      if (!archived) return false;
    } else if (archived) {
      return false;
    }
    if (wave === 'old' && row.leadWave !== 'old') return false;
    if (wave === 'new' && row.leadWave !== 'new') return false;
    if (agentFilter === 'unassigned' && row.assignedTo) return false;
    if (agentFilter !== 'all' && agentFilter !== 'unassigned' && agentFilter !== 'archive' && row.assignedTo !== agentFilter) return false;
    const size = parseFleetSize(row.fleetSize);
    if (fleet.unknownOnly) {
      if (size != null) return false;
    } else {
      if (fleet.min != null && (size == null || size < fleet.min)) return false;
      if (fleet.max != null && (size == null || size > fleet.max)) return false;
    }
    if (!q) return true;
    const hay = [row.leadNumber, row.companyName, row.phone, row.email, row.assignedName, row.industry, row.region, row.fleetSize]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

export function sortDirectoryRows(rows: LeadDirectoryRecord[], sort: DirectorySort): LeadDirectoryRecord[] {
  if (sort === 'default') return rows;
  const copy = [...rows];
  copy.sort((a, b) => {
    const fa = parseFleetSize(a.fleetSize);
    const fb = parseFleetSize(b.fleetSize);
    if (fa == null && fb == null) return 0;
    if (fa == null) return 1;
    if (fb == null) return -1;
    return sort === 'fleet_asc' ? fa - fb : fb - fa;
  });
  return copy;
}

export function isDirectoryFilterActive(
  query: string,
  agentFilter: AgentFilter,
  fleet: FleetFilter = { min: null, max: null },
  wave: WaveFilter = 'all',
): boolean {
  return query.trim() !== '' || agentFilter !== 'all' || wave !== 'all' || Boolean(fleet.unknownOnly) || fleet.min != null || fleet.max != null;
}

export function selectAllLabel(filteredCount: number, totalCount: number, filterActive: boolean): string {
  if (!filterActive) return `בחר הכול במאגר (${filteredCount})`;
  return `בחר הכול בתוצאות המסוננות (${filteredCount}) — לא את כל המאגר (${totalCount})`;
}

export type AgentLeadWorkload = {
  agentId: string;
  displayName: string;
  assigned: number;
  withActivity: number;
  withoutActivity: number;
  openFollowup: number;
};

export type LeadActivityHints = {
  callKeys: Iterable<string>;
  stateKeys: Iterable<{ key: string; color?: string | null }>;
  openFollowupKeys: Iterable<string>;
};

const UNASSIGNED_ID = 'unassigned';

function asKeySet(values: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const value of values) {
    if (isUsableLeadKey(value)) out.add(value);
  }
  return out;
}

/** Per-agent counts from directory + existing call/state/follow-up keys. Unique by directory row. */
export function summarizeAgentLeadWorkload(
  rows: LeadDirectoryRecord[],
  agents: { id: string; displayName: string }[],
  hints: LeadActivityHints,
): AgentLeadWorkload[] {
  const activityKeys = asKeySet(hints.callKeys);
  for (const state of hints.stateKeys) {
    if (isUsableLeadKey(state.key)) activityKeys.add(state.key);
  }
  const openKeys = asKeySet(hints.openFollowupKeys);
  for (const state of hints.stateKeys) {
    if (state.color === 'yellow' && isUsableLeadKey(state.key)) openKeys.add(state.key);
  }

  const byAgent = new Map<string, AgentLeadWorkload>();
  const ensure = (id: string, name: string) => {
    const current = byAgent.get(id);
    if (current) return current;
    const created: AgentLeadWorkload = {
      agentId: id,
      displayName: name,
      assigned: 0,
      withActivity: 0,
      withoutActivity: 0,
      openFollowup: 0,
    };
    byAgent.set(id, created);
    return created;
  };

  for (const agent of agents) ensure(agent.id, agent.displayName);
  const unassigned = ensure(UNASSIGNED_ID, 'ללא עובד משויך');

  for (const row of rows) {
    if (row.archivedAt) continue;
    const bucket = row.assignedTo
      ? ensure(row.assignedTo, row.assignedName || 'עובד')
      : unassigned;
    bucket.assigned += 1;
    const key = leadKey(row.phone, row.companyName);
    const hadActivity = isUsableLeadKey(key) && activityKeys.has(key);
    if (hadActivity) bucket.withActivity += 1;
    else bucket.withoutActivity += 1;
    if (isUsableLeadKey(key) && openKeys.has(key)) bucket.openFollowup += 1;
  }

  const ordered = agents.map((agent) => byAgent.get(agent.id)!);
  const extras = [...byAgent.values()].filter(
    (row) => row.agentId !== UNASSIGNED_ID && !agents.some((agent) => agent.id === row.agentId),
  );
  return [...ordered, ...extras, unassigned];
}

export function directoryLeadToCustomer(lead: LeadDirectoryRecord): {
  companyName: string;
  contactName: string;
  contactRole: string;
  phone: string;
  email: string;
  vehicleCount: number | null;
  city: string;
} {
  const fleet = parseFleetSize(lead.fleetSize);
  return {
    companyName: lead.companyName,
    contactName: '',
    contactRole: '',
    phone: lead.phone,
    email: lead.email,
    vehicleCount: fleet,
    city: lead.region,
  };
}
