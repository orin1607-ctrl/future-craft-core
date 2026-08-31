import type { StuckPreview } from '@/features/telemarketing/services/stuckActionService';

export type AgentNowKind = 'idle' | 'on_call' | 'on_report' | 'on_lead';

export type AgentNowStatus = {
  kind: AgentNowKind;
  label: string;
  employeeId: string;
  employeeName: string;
  leadNumber: string;
  companyName: string;
  activityStartedAt: string | null;
  callStartedAt: string | null;
  reportStartedAt: string | null;
};

function str(row: Record<string, unknown> | null | undefined, ...keys: string[]): string {
  if (!row) return '';
  for (const key of keys) {
    const value = row[key];
    if (value != null && String(value).trim()) return String(value);
  }
  return '';
}

function claimedLead(preview: StuckPreview): Record<string, unknown> | null {
  return preview.claimedLeads[0] || null;
}

/** Map existing stuck-preview rows to a manager-facing live status. Read-only. */
export function deriveAgentNowStatus(preview: StuckPreview): AgentNowStatus {
  const call = preview.openCall;
  const work = preview.openWork;
  const claim = claimedLead(preview);
  const callKind = str(call, 'kind');
  const workKind = str(work, 'kind');
  const base = {
    employeeId: preview.employeeId,
    employeeName: preview.employeeName,
    leadNumber: '',
    companyName: '',
    activityStartedAt: null as string | null,
    callStartedAt: null as string | null,
    reportStartedAt: null as string | null,
  };

  if (call && callKind !== 'pending_report') {
    return {
      ...base,
      kind: 'on_call',
      label: '📞 בשיחה',
      leadNumber: str(claim, 'lead_number', 'leadNumber'),
      companyName: str(call, 'company_name', 'companyName') || str(claim, 'company_name', 'companyName'),
      activityStartedAt: str(call, 'started_at', 'startedAt') || null,
      callStartedAt: str(call, 'started_at', 'startedAt') || null,
    };
  }
  if (call && callKind === 'pending_report') {
    return {
      ...base,
      kind: 'on_report',
      label: '📝 בדיווח',
      leadNumber: str(claim, 'lead_number', 'leadNumber'),
      companyName: str(call, 'company_name', 'companyName') || str(claim, 'company_name', 'companyName'),
      activityStartedAt: str(call, 'ended_at', 'endedAt') || str(call, 'report_started_at', 'reportStartedAt') || null,
      callStartedAt: str(call, 'started_at', 'startedAt') || null,
      reportStartedAt: str(call, 'report_started_at', 'reportStartedAt') || str(call, 'ended_at', 'endedAt') || null,
    };
  }
  if (work && workKind === 'pending_work_report') {
    return {
      ...base,
      kind: 'on_report',
      label: '📝 בדיווח',
      leadNumber: str(claim, 'lead_number', 'leadNumber'),
      companyName: str(work, 'company_name', 'companyName') || str(claim, 'company_name', 'companyName'),
      activityStartedAt: str(work, 'ended_at', 'endedAt') || str(work, 'report_started_at', 'reportStartedAt') || null,
      reportStartedAt: str(work, 'report_started_at', 'reportStartedAt') || str(work, 'ended_at', 'endedAt') || null,
    };
  }
  if (work && workKind !== 'pending_work_report') {
    return {
      ...base,
      kind: 'on_lead',
      label: '🟡 עובדת על ליד',
      leadNumber: str(claim, 'lead_number', 'leadNumber'),
      companyName: str(work, 'company_name', 'companyName') || str(claim, 'company_name', 'companyName'),
      activityStartedAt: str(work, 'started_at', 'startedAt') || null,
    };
  }
  if (claim) {
    return {
      ...base,
      kind: 'on_lead',
      label: '🟡 עובדת על ליד',
      leadNumber: str(claim, 'lead_number', 'leadNumber'),
      companyName: str(claim, 'company_name', 'companyName'),
      activityStartedAt: str(claim, 'claimed_at', 'claimedAt') || null,
    };
  }
  return {
    ...base,
    kind: 'idle',
    label: '🟢 פנויה',
  };
}
