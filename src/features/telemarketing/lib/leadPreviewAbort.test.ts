import { describe, expect, it } from 'vitest';
import { canAbortLeadPreview } from './leadPreviewAbort';

describe('canAbortLeadPreview', () => {
  it('allows cancel after opening a lead, before any real activity', () => {
    expect(canAbortLeadPreview('idle', 'idle')).toBe(true);
  });

  it('blocks cancel once a call timer is running', () => {
    expect(canAbortLeadPreview('in_progress', 'idle')).toBe(false);
  });

  it('blocks cancel while a call report is pending', () => {
    expect(canAbortLeadPreview('ended', 'idle')).toBe(false);
  });

  it('blocks cancel once a work timer is running', () => {
    expect(canAbortLeadPreview('idle', 'in_progress')).toBe(false);
  });

  it('blocks cancel while a work report is pending', () => {
    expect(canAbortLeadPreview('idle', 'ended')).toBe(false);
  });
});
