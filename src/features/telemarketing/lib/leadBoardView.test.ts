import { describe, expect, it } from 'vitest';
import {
  colorFilterForView,
  colorsToRender,
  DEFAULT_LEAD_BOARD_VIEW,
  followUpBucketForView,
  isFollowUpBoardView,
} from './leadBoardView';

describe('lead board view', () => {
  it('defaults to yellow traffic-light, not follow-up', () => {
    expect(DEFAULT_LEAD_BOARD_VIEW).toBe('yellow');
    expect(isFollowUpBoardView(DEFAULT_LEAD_BOARD_VIEW)).toBe(false);
    expect(colorFilterForView('yellow')).toBe('yellow');
    expect(colorsToRender('yellow')).toEqual(['yellow']);
  });

  it('keeps follow-up and today as follow-up-source views', () => {
    expect(isFollowUpBoardView('followup')).toBe(true);
    expect(isFollowUpBoardView('today')).toBe(true);
    expect(followUpBucketForView('today')).toBe('today');
    expect(followUpBucketForView('followup')).toBe('');
    expect(colorFilterForView('followup')).toBe('');
  });

  it('does not mix red/green into the yellow-only view', () => {
    expect(colorsToRender('red')).toEqual(['red']);
    expect(colorsToRender('green')).toEqual(['green']);
    expect(colorsToRender('all')).toEqual(['yellow', 'red', 'green']);
    expect(colorsToRender('followup')).toEqual([]);
  });
});
