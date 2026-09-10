import { describe, expect, it } from 'vitest';
import type { StuckPreview } from '@/features/telemarketing/services/stuckActionService';
import { deriveAgentNowStatus } from './agentNowStatus';

function preview(partial: Partial<StuckPreview>): StuckPreview {
  return {
    employeeId: 'tair',
    employeeName: 'תאיר',
    hasStuck: true,
    openCall: null,
    openWork: null,
    claimedLeads: [],
    willReset: [],
    willNot: [],
    ...partial,
  };
}

describe('deriveAgentNowStatus', () => {
  it('shows idle when nothing is open', () => {
    const status = deriveAgentNowStatus(preview({ hasStuck: false }));
    expect(status.kind).toBe('idle');
    expect(status.label).toBe('🟢 פנויה');
  });

  it('shows on-call from an in-progress call', () => {
    const status = deriveAgentNowStatus(preview({
      openCall: { kind: 'active_call', company_name: 'שפיר', started_at: '2026-08-31T07:10:00Z' },
      claimedLeads: [{ lead_number: '316', company_name: 'שפיר', claimed_at: '2026-08-31T07:10:00Z' }],
    }));
    expect(status.kind).toBe('on_call');
    expect(status.label).toBe('📞 בשיחה');
    expect(status.leadNumber).toBe('316');
    expect(status.companyName).toBe('שפיר');
    expect(status.callStartedAt).toBe('2026-08-31T07:10:00Z');
  });

  it('shows reporting after the call ended but is still in_progress', () => {
    const status = deriveAgentNowStatus(preview({
      openCall: {
        kind: 'pending_report',
        company_name: 'שפיר',
        started_at: '2026-08-31T07:10:00Z',
        ended_at: '2026-08-31T07:18:00Z',
        report_started_at: '2026-08-31T07:18:05Z',
      },
      claimedLeads: [{ lead_number: '316', company_name: 'שפיר' }],
    }));
    expect(status.kind).toBe('on_report');
    expect(status.label).toBe('📝 בדיווח');
    expect(status.reportStartedAt).toBe('2026-08-31T07:18:05Z');
    expect(status.callStartedAt).toBe('2026-08-31T07:10:00Z');
  });

  it('shows working-on-lead from a claimed directory row', () => {
    const status = deriveAgentNowStatus(preview({
      claimedLeads: [{ lead_number: '316', company_name: 'שפיר הנדסה', claimed_at: '2026-08-31T07:10:10Z' }],
    }));
    expect(status.kind).toBe('on_lead');
    expect(status.label).toBe('🟡 עובדת על ליד');
    expect(status.leadNumber).toBe('316');
    expect(status.companyName).toBe('שפיר הנדסה');
    expect(status.activityStartedAt).toBe('2026-08-31T07:10:10Z');
  });

  it('does not invent a call just because a lead is claimed', () => {
    const status = deriveAgentNowStatus(preview({
      claimedLeads: [{ lead_number: '316', company_name: 'שפיר' }],
    }));
    expect(status.kind).not.toBe('on_call');
    expect(status.callStartedAt).toBeNull();
  });
});
