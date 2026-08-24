import { describe, expect, it } from 'vitest';
import { homePathForRole } from './postLoginHome';

describe('homePathForRole', () => {
  it('sends telemarketing agents to the caller screen', () => {
    expect(homePathForRole('telemarketing_agent')).toBe('/telemarketing');
  });

  it('keeps other roles on dashboard', () => {
    expect(homePathForRole('super_admin')).toBe('/dashboard');
    expect(homePathForRole('driver')).toBe('/dashboard');
  });
});
