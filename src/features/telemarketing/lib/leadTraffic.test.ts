import { describe, expect, it } from 'vitest';
import { isExplicitCloseResult, suggestedLeadTraffic } from '@/features/telemarketing/lib/leadTraffic';

describe('lead traffic mapping', () => {
  it('does not mark no-answer as red', () => {
    expect(suggestedLeadTraffic('לא ענה', false)).toEqual({ color: 'yellow', status: 'no_answer' });
    expect(suggestedLeadTraffic('לא ענה', true)).toEqual({ color: 'yellow', status: 'no_answer' });
    expect(isExplicitCloseResult('לא ענה')).toBe(false);
  });

  it('marks not-interested as red with a required close status', () => {
    expect(suggestedLeadTraffic('לא מעוניין', false)).toEqual({ color: 'red', status: 'not_interested' });
    expect(isExplicitCloseResult('לא מעוניין')).toBe(true);
  });

  it('marks a booked meeting as green without dropping a remaining follow-up color', () => {
    expect(suggestedLeadTraffic('רוצה פגישה', true)).toEqual({ color: 'green', status: 'meeting_booked' });
  });
});
