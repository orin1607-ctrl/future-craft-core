import { supabase } from '@/integrations/supabase/client';
import { securityRecordAction } from '@/lib/securityAuditClient';

export interface StuckPreviewItem {
  kind?: string;
  label?: string;
  since?: string;
  count?: number;
}

export interface StuckPreview {
  employeeId: string;
  employeeName: string;
  hasStuck: boolean;
  openCall: Record<string, unknown> | null;
  openWork: Record<string, unknown> | null;
  claimedLeads: Record<string, unknown>[];
  willReset: StuckPreviewItem[];
  willNot: string[];
}

export interface StuckReleaseResult {
  ok: boolean;
  didReset: boolean;
  employeeId: string;
  employeeName?: string;
  releasedCallIds: string[];
  releasedWorkIds: string[];
  releasedClaimIds: string[];
  message?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

function mapPreview(raw: unknown): StuckPreview {
  const row = asRecord(raw) || {};
  const claimed = Array.isArray(row.claimedLeads) ? row.claimedLeads : Array.isArray(row.claimedleads) ? row.claimedleads : [];
  const will = Array.isArray(row.willReset) ? row.willReset : Array.isArray(row.willreset) ? row.willreset : [];
  const willNot = Array.isArray(row.willNot) ? row.willNot : Array.isArray(row.willnot) ? row.willnot : [];
  return {
    employeeId: String(row.employeeId ?? row.employeeid ?? ''),
    employeeName: String(row.employeeName ?? row.employeename ?? ''),
    hasStuck: Boolean(row.hasStuck ?? row.hasstuck),
    openCall: asRecord(row.openCall ?? row.opencall),
    openWork: asRecord(row.openWork ?? row.openwork),
    claimedLeads: claimed.map((item) => asRecord(item) || {}),
    willReset: will.map((item) => {
      const rec = asRecord(item) || {};
      return {
        kind: rec.kind ? String(rec.kind) : undefined,
        label: rec.label ? String(rec.label) : undefined,
        since: rec.since ? String(rec.since) : undefined,
        count: rec.count != null ? Number(rec.count) : undefined,
      };
    }),
    willNot: willNot.map((item) => String(item)),
  };
}

export async function previewStuckAction(employeeId: string): Promise<StuckPreview> {
  const { data, error } = await supabase.rpc('telemarketing_preview_stuck_action' as never, {
    p_employee_id: employeeId,
  } as never);
  if (error) throw new Error(error.message || 'שגיאה בבדיקת מצב תקוע');
  return mapPreview(data);
}

export async function releaseStuckAction(employeeId: string): Promise<StuckReleaseResult> {
  const { data, error } = await supabase.rpc('telemarketing_release_stuck_action' as never, {
    p_employee_id: employeeId,
  } as never);
  if (error) throw new Error(error.message || 'שגיאה באיפוס פעולה תקועה');
  const row = asRecord(data) || {};
  const result: StuckReleaseResult = {
    ok: row.ok !== false,
    didReset: Boolean(row.didReset ?? row.didreset),
    employeeId: String(row.employeeId ?? row.employeeid ?? employeeId),
    employeeName: row.employeeName || row.employeename ? String(row.employeeName ?? row.employeename) : undefined,
    releasedCallIds: asIdList(row.releasedCallIds ?? row.releasedcallids),
    releasedWorkIds: asIdList(row.releasedWorkIds ?? row.releasedworkids),
    releasedClaimIds: asIdList(row.releasedClaimIds ?? row.releasedclaimids),
    message: row.message ? String(row.message) : undefined,
  };
  await securityRecordAction('settings_change', {
    action: 'איפוס פעולה תקועה',
    objectType: 'tele_stuck_reset',
    outcome: result.ok ? 'success' : 'failure',
    result: result.didReset ? 'אופס מצב תקוע' : (result.message || 'אין מצב פעיל'),
    details: {
      source: 'tele_stuck_reset',
      employeeId: result.employeeId,
      employeeName: result.employeeName || null,
      releasedCallIds: result.releasedCallIds,
      releasedWorkIds: result.releasedWorkIds,
      releasedClaimIds: result.releasedClaimIds,
      didReset: result.didReset,
    },
  });
  return result;
}
