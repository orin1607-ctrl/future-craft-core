import { describe, expect, it } from 'vitest';
import { formatOpenDuration, isChatClosed, openDurationSeconds, validateDaliaCare } from '@/features/telemarketing/lib/teamChat';

describe('dalia team chat timing', () => {
  it('never returns a negative open duration', () => {
    expect(openDurationSeconds('2026-08-24T12:00:00.000Z', '2026-08-24T11:00:00.000Z')).toBe(0);
  });

  it('freezes duration at closed_at', () => {
    expect(openDurationSeconds('2026-08-24T10:00:00.000Z', '2026-08-24T10:01:30.000Z')).toBe(90);
  });

  it('formats long and short open times', () => {
    expect(formatOpenDuration('2026-08-24T10:00:00.000Z', '2026-08-24T10:00:05.000Z')).toBe('פתוח כבר 00:00:05');
    expect(formatOpenDuration('2026-08-24T10:00:00.000Z', '2026-08-24T12:14:00.000Z')).toBe('פתוח 2 שעות ו-14 דקות');
  });

  it('treats completed and archive as closed', () => {
    expect(isChatClosed('הושלם')).toBe(true);
    expect(isChatClosed('ארכיון')).toBe(true);
    expect(isChatClosed('חדש')).toBe(false);
    expect(isChatClosed('בטיפול')).toBe(false);
  });
});

describe('dalia care validation', () => {
  it('skips when the agent does not need Dalia care', () => {
    expect(validateDaliaCare({ needsDaliaCare: false })).toBeNull();
  });

  it('requires type, detail, and other-text', () => {
    expect(validateDaliaCare({ needsDaliaCare: true })).toMatch(/סוג טיפול/);
    expect(validateDaliaCare({ needsDaliaCare: true, daliaCareType: 'שליחת Email' })).toMatch(/מה צריך/);
    expect(validateDaliaCare({ needsDaliaCare: true, daliaCareType: 'אחר', daliaCareDetail: 'x' })).toMatch(/לפרט/);
    expect(validateDaliaCare({
      needsDaliaCare: true,
      daliaCareType: 'שליחת Email',
      daliaCareDetail: 'לשלוח חומר היום',
    })).toBeNull();
  });
});
