import { describe, expect, it } from 'vitest';
import { agentHomeActionsVisible } from './agentHomeVisibility';

describe('agentHomeActionsVisible', () => {
  it('keeps Start Call visible when idle', () => {
    expect(agentHomeActionsVisible('idle', 'idle')).toBe(true);
  });

  it('keeps Start Call visible while a work report is pending', () => {
    expect(agentHomeActionsVisible('idle', 'ended')).toBe(true);
  });

  it('keeps Start Call visible while a call report is pending', () => {
    expect(agentHomeActionsVisible('ended', 'idle')).toBe(true);
  });

  it('hides Start Call only during a live call or work timer', () => {
    expect(agentHomeActionsVisible('in_progress', 'idle')).toBe(false);
    expect(agentHomeActionsVisible('idle', 'in_progress')).toBe(false);
  });
});
