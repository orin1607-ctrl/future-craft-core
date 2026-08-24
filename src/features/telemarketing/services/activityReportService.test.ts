import { describe, expect, it } from 'vitest';
import { buildActivityReport, isAnsweredResult, isNoAnswerResult } from '@/features/telemarketing/services/activityReportService';
import type { FollowUpWorkItem, TeamChat, TelemarketingCall, TelemarketingWorkSession } from '@/features/telemarketing/types';

const filters = { from: '2026-08-24', to: '2026-08-24', employeeName: '', result: '', status: '' as const };

function call(partial: Partial<TelemarketingCall>): TelemarketingCall {
  return {
    id: partial.id || 'c1',
    employeeId: 'e1',
    employeeName: 'נציג א',
    customerId: null,
    companyName: 'ABC',
    phone: '0500000000',
    startedAt: '2026-08-24T07:00:00.000Z',
    endedAt: '2026-08-24T07:10:00.000Z',
    durationSeconds: 600,
    status: 'completed',
    result: 'מעוניין',
    leadRating: 'חם',
    summary: 'סיכום',
    needsFollowUp: false,
    nextAction: null,
    followUpOwner: null,
    followUpDate: null,
    followUpTime: null,
    followUpUrgency: null,
    managerNote: null,
    whatsappStatus: 'not_applicable',
    emailStatus: 'not_applicable',
    recordingPath: null,
    recordingStatus: 'none',
    recordingMime: null,
    sourceFollowUpId: null,
    clientToken: 't',
    createdAt: '2026-08-24T07:00:00.000Z',
    updatedAt: '2026-08-24T07:10:00.000Z',
    ...partial,
  };
}

describe('activity report uses only real mappings', () => {
  it('treats no-answer separately from answered and never invents busy/disconnected', () => {
    expect(isNoAnswerResult('לא ענה')).toBe(true);
    expect(isAnsweredResult('לא ענה')).toBe(false);
    expect(isAnsweredResult('דיברנו')).toBe(true);
  });

  it('computes dials, conversions and measured work from stored durations', () => {
    const report = buildActivityReport({
      filters,
      calls: [
        call({ id: '1', result: 'לא ענה', durationSeconds: 30, leadRating: 'פושר' }),
        call({
          id: '2',
          result: 'רוצה פגישה',
          durationSeconds: 120,
          leadRating: 'חם',
          followUpDate: '2026-08-26',
          followUpTime: '11:00',
        }),
      ],
      work: [
        {
          id: 'w1',
          employeeId: 'e1',
          employeeName: 'נציג א',
          customerId: null,
          companyName: 'ABC',
          phone: '0500000000',
          taskType: 'חיפוש מידע',
          description: 'בדקתי',
          note: null,
          needsFollowUp: false,
          startedAt: '2026-08-24T08:00:00.000Z',
          endedAt: '2026-08-24T08:20:00.000Z',
          durationSeconds: 1200,
          status: 'completed',
          clientToken: 'w',
          createdAt: '2026-08-24T08:00:00.000Z',
        } as TelemarketingWorkSession,
      ],
      followUps: [] as FollowUpWorkItem[],
      chats: [] as TeamChat[],
    });
    expect(report.totals.dialAttempts).toBe(2);
    expect(report.totals.answered).toBe(1);
    expect(report.totals.noAnswer).toBe(1);
    expect(report.totals.meetings).toBe(1);
    expect(report.totals.interested).toBe(1);
    expect(report.totals.hotLeads).toBe(1);
    expect(report.totals.callSeconds).toBe(150);
    expect(report.totals.workSeconds).toBe(1200);
    expect(report.totals.measuredWorkSeconds).toBe(1350);
    expect(report.totals.answerRate).toBe(50);
    expect(report.meetings[0].when).toBe('2026-08-26 11:00');
    expect(report.unmeasured.length).toBeGreaterThan(0);
    expect(report.unmeasured.every((u) => u.measured === false)).toBe(true);
  });

  it('does not double-count the same call across totals', () => {
    const report = buildActivityReport({
      filters,
      calls: [call({ id: 'same', result: 'מעוניין', durationSeconds: 60, leadRating: 'חם' })],
      work: [],
      followUps: [],
      chats: [],
    });
    expect(report.totals.dialAttempts).toBe(1);
    expect(report.totals.answered).toBe(1);
    expect(report.totals.interested).toBe(1);
    expect(report.totals.hotLeads).toBe(1);
    expect(report.calls).toHaveLength(1);
  });
});
