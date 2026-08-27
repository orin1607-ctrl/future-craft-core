import type { LeadDirectoryRecord } from '@/features/telemarketing/lib/leadImport/types';

export type AgentFilter = 'all' | 'unassigned' | 'archive' | string;
export type DirectorySort = 'default' | 'fleet_asc' | 'fleet_desc';
export type FleetFilter = { min: number | null; max: number | null };

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
): LeadDirectoryRecord[] {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => {
    const archived = Boolean(row.archivedAt);
    if (agentFilter === 'archive') {
      if (!archived) return false;
    } else if (archived) {
      return false;
    }
    if (agentFilter === 'unassigned' && row.assignedTo) return false;
    if (agentFilter !== 'all' && agentFilter !== 'unassigned' && agentFilter !== 'archive' && row.assignedTo !== agentFilter) return false;
    const size = parseFleetSize(row.fleetSize);
    if (fleet.min != null && (size == null || size < fleet.min)) return false;
    if (fleet.max != null && (size == null || size > fleet.max)) return false;
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

export function isDirectoryFilterActive(query: string, agentFilter: AgentFilter, fleet: FleetFilter = { min: null, max: null }): boolean {
  return query.trim() !== '' || agentFilter !== 'all' || fleet.min != null || fleet.max != null;
}

export function selectAllLabel(filteredCount: number, totalCount: number, filterActive: boolean): string {
  if (!filterActive) return `בחר הכול במאגר (${filteredCount})`;
  return `בחר הכול בתוצאות המסוננות (${filteredCount}) — לא את כל המאגר (${totalCount})`;
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
