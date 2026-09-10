import { supabase } from '@/integrations/supabase/client';
import { leadKey, isUsableLeadKey } from '@/features/telemarketing/lib/leadKey';
import type { TelemarketingLeadState } from '@/features/telemarketing/types';
import type { LeadColor } from '@/features/telemarketing/lib/leadTraffic';
import { attachLeadNumbers } from '@/features/telemarketing/services/leadDirectoryService';

const TABLE_STATES = 'telemarketing_lead_states';
const TABLE_EVENTS = 'telemarketing_lead_status_events';

function mapState(row: Record<string, unknown>): TelemarketingLeadState {
  return {
    id: String(row.id),
    leadKey: String(row.lead_key),
    companyName: String(row.company_name || ''),
    contactName: (row.contact_name as string | null) ?? undefined,
    phone: String(row.phone || ''),
    employeeId: (row.employee_id as string | null) ?? null,
    employeeName: (row.employee_name as string | null) ?? null,
    leadColor: row.lead_color as LeadColor,
    leadStatus: String(row.lead_status),
    reason: (row.reason as string | null) ?? null,
    changedAt: String(row.changed_at),
    changedBy: (row.changed_by as string | null) ?? null,
  };
}

export async function getLeadStates(): Promise<TelemarketingLeadState[]> {
  const { data, error } = await supabase.from(TABLE_STATES).select('*').order('changed_at', { ascending: false });
  if (error) throw new Error(error.message);
  return attachLeadNumbers((data ?? []).map((row) => mapState(row as Record<string, unknown>)));
}

export async function upsertLeadState(payload: {
  phone: string;
  companyName: string;
  contactName?: string;
  employeeId: string;
  employeeName: string;
  color: LeadColor;
  status: string;
  reason?: string;
}): Promise<TelemarketingLeadState> {
  const key = leadKey(payload.phone, payload.companyName);
  if (!isUsableLeadKey(key)) throw new Error('חובה שם חברה או טלפון כדי לשמור סטטוס ליד');
  if (payload.color === 'red' && !payload.reason?.trim()) {
    throw new Error('ליד אדום — חובה לכתוב סיבת סגירה');
  }

  const now = new Date().toISOString();
  const row = {
    lead_key: key,
    company_name: payload.companyName,
    contact_name: payload.contactName ?? null,
    phone: payload.phone,
    employee_id: payload.employeeId,
    employee_name: payload.employeeName,
    lead_color: payload.color,
    lead_status: payload.status,
    reason: payload.reason?.trim() || null,
    changed_at: now,
    changed_by: payload.employeeId,
  };

  const { data, error } = await supabase.from(TABLE_STATES).upsert(row, { onConflict: 'lead_key' }).select('*').single();
  if (error) throw new Error(error.message);

  await supabase.from(TABLE_EVENTS).insert({
    lead_key: key,
    lead_color: payload.color,
    lead_status: payload.status,
    reason: payload.reason?.trim() || null,
    changed_by: payload.employeeId,
    changed_at: now,
  });

  return mapState(data as Record<string, unknown>);
}

export async function closeOpenFollowUpsForLead(phone: string, companyName: string, completedBy: string): Promise<void> {
  const { data: followUps } = await supabase.from('telemarketing_followups').select('id, phone, company_name, status');
  const key = leadKey(phone, companyName);
  const mine = (followUps ?? []).filter((f) => f.status === 'open' && leadKey(String(f.phone), String(f.company_name)) === key);
  for (const fu of mine) {
    await supabase
      .from('telemarketing_followups')
      .update({
        status: 'done',
        completed_by: completedBy,
        completed_at: new Date().toISOString(),
      })
      .eq('id', fu.id)
      .eq('status', 'open');
  }
}

export async function getLeadStatusEvents(key: string): Promise<
  { id: string; leadColor: LeadColor; leadStatus: string; reason: string | null; changedAt: string; changedBy: string | null }[]
> {
  const { data, error } = await supabase
    .from(TABLE_EVENTS)
    .select('*')
    .eq('lead_key', key)
    .order('changed_at', { ascending: false })
    .limit(30);
  if (error || !data) return [];
  return data.map((row) => ({
    id: String(row.id),
    leadColor: row.lead_color as LeadColor,
    leadStatus: String(row.lead_status),
    reason: (row.reason as string | null) ?? null,
    changedAt: String(row.changed_at),
    changedBy: (row.changed_by as string | null) ?? null,
  }));
}
