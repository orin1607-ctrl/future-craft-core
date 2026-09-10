import { describe, expect, it } from 'vitest';
import { dueCount } from '@/features/telemarketing/components/FollowUp/FollowUpBoard';
import type { FollowUpWorkItem } from '@/features/telemarketing/types';

function item(bucket: FollowUpWorkItem['bucket']): FollowUpWorkItem {
  return {
    id: bucket,
    callId: 'c',
    companyName: 'x',
    phone: '1',
    actionNeeded: 'a',
    owner: null,
    dueDate: '2026-08-24',
    dueTime: '10:00',
    urgency: 'רגיל',
    managerNote: null,
    status: bucket === 'done' ? 'done' : 'open',
    completedBy: null,
    completedAt: null,
    closedByCallId: null,
    createdAt: '2026-08-24T00:00:00Z',
    employeeId: 'e',
    employeeName: 'agent',
    lastResult: 'דיברנו',
    lastSummary: 'sum',
    lastRecordingPath: null,
    bucket,
  };
}

describe('dueCount', () => {
  it('counts only late and today for the agent badge', () => {
    expect(dueCount([item('late'), item('today'), item('future'), item('done')])).toBe(2);
  });
});
