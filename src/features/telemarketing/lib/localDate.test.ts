import { describe, expect, it } from 'vitest';
import { followUpBucket, localDateStr } from '@/features/telemarketing/lib/localDate';

describe('followUpBucket', () => {
  it('marks completed follow-ups as done even if the date is in the past', () => {
    expect(followUpBucket('2000-01-01', null, 'done')).toBe('done');
  });

  it('marks past due dates as late', () => {
    expect(followUpBucket('2000-01-01', null, 'open')).toBe('late');
  });

  it('marks future due dates as future', () => {
    expect(followUpBucket('2099-01-01', '09:00', 'open')).toBe('future');
  });

  it('marks today without a due time as today', () => {
    expect(followUpBucket(localDateStr(), null, 'open')).toBe('today');
  });

  it('marks today with an already-passed due time as late', () => {
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() === 0) {
      expect(followUpBucket(localDateStr(), '00:00', 'open')).toBe('today');
      return;
    }
    expect(followUpBucket(localDateStr(), '00:00', 'open')).toBe('late');
  });
});
