import { describe, expect, it } from 'vitest';
import { shouldSkipHubReopen } from './vehicleHubOpenGuard';

describe('shouldSkipHubReopen', () => {
  it('skips hub reopen while the edit form is open', () => {
    expect(shouldSkipHubReopen('form')).toBe(true);
  });

  it('allows hub open from the list and the hub itself', () => {
    expect(shouldSkipHubReopen('list')).toBe(false);
    expect(shouldSkipHubReopen('detail')).toBe(false);
  });
});
