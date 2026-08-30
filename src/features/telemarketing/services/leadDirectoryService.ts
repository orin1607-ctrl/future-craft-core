import { supabase } from '@/integrations/supabase/client';
import { emailMatchKey, numberMatchKey, phoneMatchKey, companyMatchKey } from '@/features/telemarketing/lib/leadImport/validateLeads';
import type {
  ColumnMapping,
  ExistingLeadIndex,
  LeadAssignResult,
  LeadAssignmentEvent,
  LeadDirectoryRecord,
  LeadImportBatch,
  LeadImportSource,
  MappedLeadRow,
} from '@/features/telemarketing/lib/leadImport/types';
import { getTelemarketingAgents } from '@/features/telemarketing/services/teamChatService';
import { lookupLeadNumber } from '@/features/telemarketing/lib/leadLabel';

let directoryCache: { at: number; rows: LeadDirectoryRecord[] } | null = null;

export function invalidateLeadDirectoryCache() {
  directoryCache = null;
}

export async function getLeadDirectoryCached(): Promise<LeadDirectoryRecord[]> {
  if (directoryCache && Date.now() - directoryCache.at < 20000) return directoryCache.rows;
  const rows = await listLeadDirectory();
  directoryCache = { at: Date.now(), rows };
  return rows;
}

export async function attachLeadNumbers<T extends { phone?: string | null; companyName?: string | null }>(
  items: T[],
): Promise<(T & { leadNumber: string | null })[]> {
  const rows = await getLeadDirectoryCached();
  return items.map((item) => ({
    ...item,
    leadNumber: lookupLeadNumber(rows, item.phone, item.companyName),
  }));
}

function mapDirectory(row: Record<string, unknown>): LeadDirectoryRecord {
  return {
    id: String(row.id),
    leadNumber: String(row.lead_number || ''),
    companyName: String(row.company_name || ''),
    industry: String(row.industry || ''),
    region: String(row.region || ''),
    fleetSize: String(row.fleet_size || ''),
    phone: String(row.phone || ''),
    email: String(row.email || ''),
    extra: (row.extra as Record<string, string>) || {},
    importBatchId: (row.import_batch_id as string | null) ?? null,
    source: String(row.source || ''),
    createdAt: String(row.created_at),
    assignedTo: (row.assigned_to as string | null) ?? null,
    assignedName: String(row.assigned_name || ''),
    assignedAt: (row.assigned_at as string | null) ?? null,
    claimedBy: (row.claimed_by as string | null) ?? null,
    claimedAt: (row.claimed_at as string | null) ?? null,
    archivedAt: (row.archived_at as string | null) ?? null,
    leadWave: row.lead_wave === 'new' ? 'new' : 'old',
  };
}

export async function listLeadDirectory(): Promise<LeadDirectoryRecord[]> {
  const { data, error } = await supabase
    .from('telemarketing_lead_directory')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(4000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []).map((row) => mapDirectory(row as Record<string, unknown>));
  directoryCache = { at: Date.now(), rows };
  return rows;
}

export async function listLeadImportBatches(): Promise<LeadImportBatch[]> {
  const { data, error } = await supabase
    .from('telemarketing_lead_import_batches')
    .select('id, source, file_name, status, row_count, imported_count, skipped_count, duplicate_count, invalid_count, mapping, raw_input_sha256, raw_input_preview, created_at, committed_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    source: String(row.source),
    fileName: (row.file_name as string | null) ?? null,
    status: String(row.status),
    rowCount: Number(row.row_count || 0),
    importedCount: Number(row.imported_count || 0),
    skippedCount: Number(row.skipped_count || 0),
    duplicateCount: Number(row.duplicate_count || 0),
    invalidCount: Number(row.invalid_count || 0),
    mapping: (row.mapping || {}) as ColumnMapping,
    rawInputSha256: (row.raw_input_sha256 as string | null) ?? null,
    rawInputPreview: (row.raw_input_preview as string | null) ?? null,
    createdAt: String(row.created_at),
    committedAt: (row.committed_at as string | null) ?? null,
  }));
}

export async function loadExistingLeadIndex(): Promise<ExistingLeadIndex> {
  const rows = await listLeadDirectory();
  return {
    numbers: new Set(rows.map((row) => numberMatchKey(row.leadNumber)).filter(Boolean)),
    companies: new Set(rows.map((row) => companyMatchKey(row.companyName)).filter(Boolean)),
    phones: new Set(rows.map((row) => phoneMatchKey(row.phone)).filter(Boolean)),
    emails: new Set(rows.map((row) => emailMatchKey(row.email)).filter(Boolean)),
  };
}

export async function sha256Text(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function commitLeadImport(payload: {
  source: LeadImportSource;
  fileName?: string;
  mapping: ColumnMapping;
  rawText: string;
  rows: MappedLeadRow[];
}): Promise<{ batchId: string; importedCount: number; skippedCount: number; duplicateCount: number; invalidCount: number; rowCount: number }> {
  const sha = await sha256Text(payload.rawText);
  const { data, error } = await supabase.rpc('telemarketing_commit_lead_import', {
    p_source: payload.source,
    p_file_name: payload.fileName || null,
    p_mapping: payload.mapping,
    p_raw_sha: sha,
    p_raw_preview: payload.rawText.slice(0, 4000),
    p_rows: payload.rows.map((row) => ({
      lead_number: row.lead_number,
      company_name: row.company_name,
      industry: row.industry,
      region: row.region,
      fleet_size: row.fleet_size,
      phone: row.phone,
      email: row.email,
      extra: row.extra,
    })),
  });
  if (error) throw new Error(error.message);
  const result = data as Record<string, unknown>;
  return {
    batchId: String(result.batchId || result.batchid || ''),
    importedCount: Number(result.importedCount ?? result.importedcount ?? 0),
    skippedCount: Number(result.skippedCount ?? result.skippedcount ?? 0),
    duplicateCount: Number(result.duplicateCount ?? result.duplicatecount ?? 0),
    invalidCount: Number(result.invalidCount ?? result.invalidcount ?? 0),
    rowCount: Number(result.rowCount ?? result.rowcount ?? 0),
  };
}

export async function listAssignableAgents(): Promise<{ id: string; displayName: string }[]> {
  const agents = await getTelemarketingAgents();
  if (agents.length === 0) return [];
  const { data } = await supabase.from('profiles').select('id, is_active').in('id', agents.map((a) => a.id));
  const active = new Set((data ?? []).filter((p) => p.is_active !== false).map((p) => String(p.id)));
  return agents.filter((a) => active.has(a.id));
}

export async function assignLeadsToAgent(leadIds: string[], agentId: string): Promise<LeadAssignResult> {
  const { data, error } = await supabase.rpc('telemarketing_assign_leads' as never, {
    p_lead_ids: leadIds,
    p_agent_id: agentId,
  } as never);
  if (error) throw new Error(error.message);
  const result = (data || {}) as Record<string, unknown>;
  const skippedRaw = Array.isArray(result.skipped) ? result.skipped : [];
  return {
    assignedCount: Number(result.assignedCount ?? result.assignedcount ?? 0),
    skippedCount: Number(result.skippedCount ?? result.skippedcount ?? 0),
    skipped: skippedRaw.map((item) => {
      const row = (item || {}) as Record<string, unknown>;
      return {
        leadNumber: String(row.leadNumber ?? row.leadnumber ?? ''),
        companyName: String(row.companyName ?? row.companyname ?? ''),
        reason: String(row.reason || ''),
      };
    }),
    agentName: String(result.agentName ?? result.agentname ?? ''),
    agentId: String(result.agentId ?? result.agentid ?? agentId),
  };
}

export async function unassignLeads(leadIds: string[]): Promise<{ unassignedCount: number; skippedCount: number; skipped: { leadNumber: string; companyName: string; reason: string }[] }> {
  const { data, error } = await supabase.rpc('telemarketing_unassign_leads' as never, {
    p_lead_ids: leadIds,
  } as never);
  if (error) throw new Error(error.message);
  const result = (data || {}) as Record<string, unknown>;
  const skippedRaw = Array.isArray(result.skipped) ? result.skipped : [];
  return {
    unassignedCount: Number(result.unassignedCount ?? result.unassignedcount ?? 0),
    skippedCount: Number(result.skippedCount ?? result.skippedcount ?? 0),
    skipped: skippedRaw.map((item) => {
      const row = (item || {}) as Record<string, unknown>;
      return {
        leadNumber: String(row.leadNumber ?? row.leadnumber ?? ''),
        companyName: String(row.companyName ?? row.companyname ?? ''),
        reason: String(row.reason || ''),
      };
    }),
  };
}

export async function createManualDirectoryLead(payload: {
  companyName: string;
  phone: string;
  email?: string;
  industry?: string;
  region?: string;
  fleetSize?: string;
}): Promise<{ action: 'created' | 'existing' | 'duplicate_other'; lead: LeadDirectoryRecord | null; leadNumber?: string }> {
  const { data, error } = await supabase.rpc('telemarketing_create_manual_lead' as never, {
    p_company_name: payload.companyName || '',
    p_phone: payload.phone || '',
    p_email: payload.email || '',
    p_industry: payload.industry || '',
    p_region: payload.region || '',
    p_fleet_size: payload.fleetSize || '',
  } as never);
  if (error) throw new Error(error.message);
  invalidateLeadDirectoryCache();
  const result = (data || {}) as Record<string, unknown>;
  const action = String(result.action || '') as 'created' | 'existing' | 'duplicate_other';
  const leadRaw = result.lead as Record<string, unknown> | undefined;
  return {
    action,
    lead: leadRaw ? mapDirectory(leadRaw) : null,
    leadNumber: String(result.leadNumber ?? result.leadnumber ?? leadRaw?.lead_number ?? ''),
  };
}

export async function setLeadsArchived(leadIds: string[], archived: boolean): Promise<number> {
  const { data, error } = await supabase.rpc('telemarketing_set_leads_archived' as never, {
    p_lead_ids: leadIds,
    p_archived: archived,
  } as never);
  if (error) throw new Error(error.message);
  const result = (data || {}) as Record<string, unknown>;
  return Number(result.updatedCount ?? result.updatedcount ?? 0);
}

export async function previewLeadDelete(leadId: string): Promise<{ leadNumber: string; companyName: string; calls: number; followups: number; assignmentEvents: number; canDelete: boolean; reason: string }> {
  const { data, error } = await supabase.rpc('telemarketing_preview_lead_delete' as never, { p_lead_id: leadId } as never);
  if (error) throw new Error(error.message);
  const result = (data || {}) as Record<string, unknown>;
  return {
    leadNumber: String(result.leadNumber ?? result.leadnumber ?? ''),
    companyName: String(result.companyName ?? result.companyname ?? ''),
    calls: Number(result.calls ?? 0),
    followups: Number(result.followups ?? 0),
    assignmentEvents: Number(result.assignmentEvents ?? result.assignmentevents ?? 0),
    canDelete: Boolean(result.canDelete ?? result.candelete),
    reason: String(result.reason || ''),
  };
}

export async function claimNextAssignedLead(): Promise<LeadDirectoryRecord | null> {
  const { data, error } = await supabase.rpc('telemarketing_claim_next_lead' as never);
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapDirectory(data as Record<string, unknown>);
}

export async function claimAssignedLead(leadId: string): Promise<LeadDirectoryRecord> {
  const { data, error } = await supabase.rpc('telemarketing_claim_lead' as never, { p_lead_id: leadId } as never);
  if (error) throw new Error(error.message);
  if (!data) throw new Error('הליד לא נמצא בתור');
  return mapDirectory(data as Record<string, unknown>);
}

export async function listLeadAssignmentEvents(): Promise<LeadAssignmentEvent[]> {
  const { data, error } = await supabase
    .from('telemarketing_lead_assignment_events' as never)
    .select('id, lead_id, lead_number, previous_agent_id, previous_agent_name, new_agent_id, new_agent_name, changed_by, changed_by_name, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    leadId: String(row.lead_id || ''),
    leadNumber: String(row.lead_number || ''),
    previousAgentId: (row.previous_agent_id as string | null) ?? null,
    previousAgentName: String(row.previous_agent_name || ''),
    newAgentId: (row.new_agent_id as string | null) ?? null,
    newAgentName: String(row.new_agent_name || ''),
    changedBy: (row.changed_by as string | null) ?? null,
    changedByName: String(row.changed_by_name || ''),
    createdAt: String(row.created_at || ''),
  }));
}
