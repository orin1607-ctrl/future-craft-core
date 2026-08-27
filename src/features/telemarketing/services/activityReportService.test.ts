import { describe, expect, it } from 'vitest';
import {
  buildActivityReport,
  groupActivityByDay,
  groupLeadActivity,
  isAnsweredResult,
  isNoAnswerResult,
  lockFiltersToSelf,
  quoteCount,
  uniqueLeadCount,
} from '@/features/telemarketing/services/activityReportService';
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
    expect(report.totals.callTreatmentSeconds).toBe(150);
    expect(report.totals.reportSeconds).toBe(0);
    expect(report.totals.callSeconds + report.totals.reportSeconds).toBe(report.totals.callTreatmentSeconds);
    expect(report.totals.callSeconds + report.totals.reportSeconds + report.totals.callTreatmentSeconds).not.toBe(report.totals.measuredWorkSeconds);
    expect(report.totals.answerRate).toBe(50);
    expect(report.meetings[0].when).toBe('2026-08-26 11:00');
    expect(report.unmeasured.length).toBeGreaterThan(0);
    expect(report.unmeasured.every((u) => u.measured === false)).toBe(true);
  });

  it('counts treatment once: 8 min call + 3 min report = 11, not 22', () => {
    const report = buildActivityReport({
      filters,
      calls: [
        call({
          id: 't1',
          durationSeconds: 480,
          reportDurationSeconds: 180,
          treatmentDurationSeconds: 660,
          result: 'מעוניין',
        }),
      ],
      work: [],
      followUps: [],
      chats: [],
    });
    expect(report.totals.callSeconds).toBe(480);
    expect(report.totals.reportSeconds).toBe(180);
    expect(report.totals.callTreatmentSeconds).toBe(660);
    expect(report.totals.measuredWorkSeconds).toBe(660);
    expect(report.totals.callSeconds + report.totals.reportSeconds + report.totals.callTreatmentSeconds).toBe(1320);
  });

  it('filters a single lead and sums two attempts without double counting', () => {
    const report = buildActivityReport({
      filters: { ...filters, leadQuery: '7' },
      calls: [
        call({
          id: 'a1',
          leadNumber: '7',
          companyName: 'אלפא',
          durationSeconds: 80,
          reportDurationSeconds: 45,
          treatmentDurationSeconds: 125,
          result: 'לא ענה',
        }),
        call({
          id: 'a2',
          leadNumber: '7',
          companyName: 'אלפא',
          startedAt: '2026-08-24T08:00:00.000Z',
          endedAt: '2026-08-24T08:06:10.000Z',
          durationSeconds: 370,
          reportDurationSeconds: 120,
          treatmentDurationSeconds: 490,
          result: 'לחזור אליו',
        }),
        call({ id: 'other', leadNumber: '8', companyName: 'בטא', durationSeconds: 999, result: 'מעוניין' }),
      ],
      work: [],
      followUps: [],
      chats: [],
      directory: [{ leadNumber: '7', companyName: 'אלפא', assignedName: 'תאיר', source: 'pasted_sheet', createdAt: '2026-08-01T00:00:00.000Z' } as never],
    });
    expect(report.calls).toHaveLength(2);
    expect(report.leadDetail?.leadNumber).toBe('7');
    expect(report.leadDetail?.attempts).toHaveLength(2);
    expect(report.leadDetail?.totals.callSeconds).toBe(450);
    expect(report.leadDetail?.totals.reportSeconds).toBe(165);
    expect(report.leadDetail?.totals.treatmentSeconds).toBe(615);
    expect(report.totals.measuredWorkSeconds).toBe(615);
    expect(report.totals.measuredWorkSeconds).toBe(report.totals.callSeconds + report.totals.reportSeconds);
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

  it('locks employee filters to self and groups lead attempts with the same timing snapshot', () => {
    const locked = lockFiltersToSelf({ ...filters, employeeName: 'מישהו אחר' }, 'תאיר');
    expect(locked.employeeName).toBe('תאיר');
    const tair = call({
      id: 'self',
      employeeName: 'תאיר',
      leadNumber: '40',
      companyName: 'QA-SELF',
      durationSeconds: 80,
      reportDurationSeconds: 20,
      treatmentDurationSeconds: 100,
    });
    const other = call({
      id: 'other-emp',
      employeeName: 'אבי טלמיטינג',
      leadNumber: '41',
      companyName: 'OTHER',
      durationSeconds: 999,
    });
    const report = buildActivityReport({
      filters: locked,
      calls: [tair, other],
      work: [],
      followUps: [],
      chats: [],
    });
    expect(report.calls).toHaveLength(1);
    expect(report.totals.dialAttempts).toBe(1);
    expect(report.totals.callSeconds).toBe(80);
    expect(report.totals.reportSeconds).toBe(20);
    expect(report.totals.callTreatmentSeconds).toBe(100);
    const grouped = groupLeadActivity(report.calls);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].attempts).toHaveLength(1);
    expect(grouped[0].totals).toEqual({ attemptCount: 1, callSeconds: 80, reportSeconds: 20, treatmentSeconds: 100, historicalSeconds: 0 });
    expect(uniqueLeadCount(report.calls)).toBe(1);
  });

  it('uses hour bounds without changing day-only totals when times are empty', () => {
    const midday = call({
      startedAt: '2026-08-24T12:00:00.000Z',
      endedAt: '2026-08-24T12:01:00.000Z',
      durationSeconds: 60,
    });
    const withHours = buildActivityReport({
      filters: { ...filters, fromTime: '00:00', toTime: '00:00' },
      calls: [midday],
      work: [],
      followUps: [],
      chats: [],
    });
    const dayOnly = buildActivityReport({
      filters,
      calls: [midday],
      work: [],
      followUps: [],
      chats: [],
    });
    expect(dayOnly.totals.dialAttempts).toBe(1);
    expect(withHours.totals.dialAttempts).toBe(0);
  });

  it('keeps activity window distinct from measured work and does not double-count treatment', () => {
    const report = buildActivityReport({
      filters,
      calls: [
        call({
          id: 'w1',
          startedAt: '2026-08-24T07:00:00.000Z',
          endedAt: '2026-08-24T07:10:00.000Z',
          durationSeconds: 600,
          reportDurationSeconds: 120,
          treatmentDurationSeconds: 720,
          treatedEndedAt: '2026-08-24T07:12:00.000Z',
        }),
        call({
          id: 'w2',
          startedAt: '2026-08-24T09:00:00.000Z',
          endedAt: '2026-08-24T09:05:00.000Z',
          durationSeconds: 300,
          reportDurationSeconds: 0,
          treatmentDurationSeconds: 300,
          treatedEndedAt: '2026-08-24T09:05:00.000Z',
          result: 'לא ענה',
          leadRating: 'קר',
        }),
      ],
      work: [],
      followUps: [],
      chats: [],
    });
    expect(report.totals.callSeconds).toBe(900);
    expect(report.totals.reportSeconds).toBe(120);
    expect(report.totals.callTreatmentSeconds).toBe(1020);
    expect(report.totals.measuredWorkSeconds).toBe(1020);
    expect(report.totals.callSeconds + report.totals.reportSeconds + report.totals.callTreatmentSeconds).not.toBe(report.totals.measuredWorkSeconds);
    expect(report.totals.activityWindowSeconds).toBeGreaterThan(report.totals.measuredWorkSeconds);
  });

  it('groups a multi-day report with the same calculator per local day', () => {
    const report = buildActivityReport({
      filters: { from: '2026-08-24', to: '2026-08-25', employeeName: '', result: '', status: '' },
      calls: [
        call({
          id: 'd1',
          startedAt: '2026-08-24T07:00:00.000Z',
          endedAt: '2026-08-24T07:10:00.000Z',
          durationSeconds: 100,
          reportDurationSeconds: 20,
          treatmentDurationSeconds: 120,
          leadNumber: '40',
        }),
        call({
          id: 'd2',
          startedAt: '2026-08-25T07:00:00.000Z',
          endedAt: '2026-08-25T07:05:00.000Z',
          durationSeconds: 50,
          reportDurationSeconds: 10,
          treatmentDurationSeconds: 60,
          leadNumber: '41',
          companyName: 'XYZ',
        }),
      ],
      work: [],
      followUps: [],
      chats: [],
    });
    const days = groupActivityByDay(report);
    expect(days).toHaveLength(2);
    expect(days[0].row.measuredWorkSeconds + days[1].row.measuredWorkSeconds).toBe(report.totals.measuredWorkSeconds);
    expect(days[0].row.dialAttempts + days[1].row.dialAttempts).toBe(report.totals.dialAttempts);
    expect(quoteCount(report.calls)).toBe(0);
  });

  it('adds historical/manual seconds once and never as auto-measured call time', () => {
    const historical = [
      {
        id: 'h1',
        employeeId: 't',
        employeeName: 'תאיר',
        workDate: '2026-08-26',
        leadNumber: '1',
        companyName: 'א',
        phone: '1',
        durationSeconds: 360,
        note: 'זמן היסטורי / הוזן ידנית',
        source: 'manual_historical',
      },
      {
        id: 'h2',
        employeeId: 't',
        employeeName: 'תאיר',
        workDate: '2026-08-26',
        leadNumber: '5',
        companyName: 'ב',
        phone: '2',
        durationSeconds: 5040,
        note: 'זמן היסטורי / הוזן ידנית',
        source: 'manual_historical',
      },
    ];
    const report = buildActivityReport({
      filters: { from: '2026-08-26', to: '2026-08-26', employeeName: 'תאיר', result: '', status: '' },
      calls: [],
      work: [],
      followUps: [],
      chats: [],
      historical,
    });
    expect(report.totals.historicalSeconds).toBe(5400);
    expect(report.totals.measuredWorkSeconds).toBe(0);
    expect(report.totals.callSeconds).toBe(0);
    expect(report.totals.reportSeconds).toBe(0);
    expect(report.totals.totalWorkSeconds).toBe(5400);
    expect(report.totals.callSeconds + report.totals.historicalSeconds).toBe(5400);
    const nextDay = buildActivityReport({
      filters: { from: '2026-08-27', to: '2026-08-27', employeeName: 'תאיר', result: '', status: '' },
      calls: [],
      work: [],
      followUps: [],
      chats: [],
      historical,
    });
    expect(nextDay.totals.historicalSeconds).toBe(0);
    expect(nextDay.totals.totalWorkSeconds).toBe(0);
    const withHours = buildActivityReport({
      filters: { from: '2026-08-26', to: '2026-08-26', employeeName: 'תאיר', result: '', status: '', fromTime: '09:00', toTime: '10:00' },
      calls: [],
      work: [],
      followUps: [],
      chats: [],
      historical,
    });
    expect(withHours.totals.historicalSeconds).toBe(0);
  });
});
