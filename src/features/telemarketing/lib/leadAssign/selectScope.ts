import type { LeadDirectoryRecord } from '@/features/telemarketing/lib/leadImport/types';

export type AgentFilter = 'all' | 'unassigned' | 'archive' | string;

export function filterDirectoryRows(
  rows: LeadDirectoryRecord[],
  query: string,
  agentFilter: AgentFilter,
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
    if (!q) return true;
    const hay = [row.leadNumber, row.companyName, row.phone, row.email, row.assignedName, row.industry, row.region]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

export function isDirectoryFilterActive(query: string, agentFilter: AgentFilter): boolean {
  return query.trim() !== '' || agentFilter !== 'all';
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
  const fleet = Number(String(lead.fleetSize || '').replace(/[^\d]/g, ''));
  return {
    companyName: lead.companyName,
    contactName: '',
    contactRole: '',
    phone: lead.phone,
    email: lead.email,
    vehicleCount: Number.isFinite(fleet) && fleet > 0 ? fleet : null,
    city: lead.region,
  };
}
