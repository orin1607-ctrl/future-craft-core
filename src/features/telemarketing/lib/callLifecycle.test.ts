import { describe, expect, it } from 'vitest';
import {
  canVoidUnstartedCall,
  capReportDurationSeconds,
  isReleasedStatus,
  REPORT_DURATION_CAP_SECONDS,
  reportDurationPhase,
  UNSTARTED_VOID_GRACE_SECONDS,
} from './callLifecycle';

describe('call lifecycle helpers', () => {
  it('treats released as non-work status', () => {
    expect(isReleasedStatus('released')).toBe(true);
    expect(isReleasedStatus('in_progress')).toBe(false);
    expect(isReleasedStatus('completed')).toBe(false);
  });

  it('allows void only before endCall and inside the accidental-click window', () => {
    expect(canVoidUnstartedCall({ endedAt: null, elapsedSeconds: 0 })).toBe(true);
    expect(canVoidUnstartedCall({ endedAt: null, elapsedSeconds: UNSTARTED_VOID_GRACE_SECONDS - 1 })).toBe(true);
    expect(canVoidUnstartedCall({ endedAt: null, elapsedSeconds: UNSTARTED_VOID_GRACE_SECONDS })).toBe(false);
    expect(canVoidUnstartedCall({ endedAt: '2026-08-30T10:00:00.000Z', elapsedSeconds: 2 })).toBe(false);
  });

  it('caps report duration at 3 minutes without changing call time', () => {
    expect(capReportDurationSeconds(0)).toBe(0);
    expect(capReportDurationSeconds(179)).toBe(179);
    expect(capReportDurationSeconds(180)).toBe(180);
    expect(capReportDurationSeconds(600)).toBe(REPORT_DURATION_CAP_SECONDS);
    expect(reportDurationPhase(149)).toBe('ok');
    expect(reportDurationPhase(150)).toBe('warn');
    expect(reportDurationPhase(180)).toBe('cap');
  });
});
