import { describe, expect, it } from 'vitest';
import { homePathForRole, postLoginPathForRole } from './postLoginHome';

describe('homePathForRole', () => {
  it('sends telemarketing agents to the caller screen', () => {
    expect(homePathForRole('telemarketing_agent')).toBe('/telemarketing');
  });

  it('keeps other roles on dashboard', () => {
    expect(homePathForRole('super_admin')).toBe('/dashboard');
    expect(homePathForRole('driver')).toBe('/dashboard');
  });

  it('sends claims workers to Claims', () => {
    expect(homePathForRole('driver', { claimsWorkerOnly: true })).toBe('/claims');
  });
});

describe('postLoginPathForRole', () => {
  it('ignores a saved chat deep-link for agents', () => {
    expect(postLoginPathForRole('telemarketing_agent', '/telemarketing?daliaChat=abc')).toBe('/telemarketing');
    expect(postLoginPathForRole('telemarketing_agent', '/internal-chat')).toBe('/telemarketing');
  });

  it('does not rewrite manager destinations', () => {
    expect(postLoginPathForRole('super_admin', '/telemarketing/admin')).toBe('/telemarketing/admin');
    expect(postLoginPathForRole('super_admin', '/dashboard')).toBe('/dashboard');
  });
});

describe('replaceToAgentWorkHome', () => {
  it('is exported for agent login full-page landing', async () => {
    const mod = await import('./postLoginHome');
    expect(typeof mod.replaceToAgentWorkHome).toBe('function');
  });
});
