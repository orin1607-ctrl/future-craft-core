import { describe, expect, it } from 'vitest';
import { buildTimingSnapshot, matchesLeadQuery, treatmentSeconds, stampReportSubmit } from '@/features/telemarketing/lib/callTiming';

describe('call timing', () => {
  it('adds call + report once as treatment and never as 8+3+11', () => {
    expect(treatmentSeconds(480, 180)).toBe(660);
    const snap = buildTimingSnapshot({
      startedAt: '2026-08-26T07:00:00.000Z',
      endedAt: '2026-08-26T07:08:00.000Z',
      durationSeconds: 480,
      reportStartedAt: '2026-08-26T07:08:00.000Z',
      reportEndedAt: '2026-08-26T07:11:00.000Z',
      reportDurationSeconds: 180,
      treatedEndedAt: '2026-08-26T07:11:00.000Z',
      treatmentDurationSeconds: 660,
    });
    expect(snap.callSeconds + snap.reportSeconds).toBe(snap.treatmentSeconds);
    expect(snap.callSeconds + snap.reportSeconds + snap.treatmentSeconds).not.toBe(snap.treatmentSeconds);
  });

  it('matches lead number or company', () => {
    expect(matchesLeadQuery('7', '7', 'אלפא')).toBe(true);
    expect(matchesLeadQuery('#7', '7', 'אלפא')).toBe(true);
    expect(matchesLeadQuery('אלפא', '7', 'אלפא בע"מ')).toBe(true);
    expect(matchesLeadQuery('8', '7', 'אלפא')).toBe(false);
  });

  it('caps new report duration at 180 seconds without changing call duration', () => {
    const stamped = stampReportSubmit({
      ended_at: '2026-08-30T10:00:00.000Z',
      duration_seconds: 90,
      report_started_at: '2026-08-30T10:00:00.000Z',
    }, new Date('2026-08-30T10:08:00.000Z'));
    expect(stamped.report_duration_seconds).toBe(180);
    expect(stamped.treatment_duration_seconds).toBe(270);
    expect(stamped.report_ended_at).toBe('2026-08-30T10:08:00.000Z');
  });
});
