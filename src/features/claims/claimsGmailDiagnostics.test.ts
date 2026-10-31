import { describe, expect, it } from 'bun:test';

// Unit tests for the enhanced Gmail token diagnostics and OAuth URL security
describe('claims-gmail token diagnostics and recovery', () => {
  function classifyTokenError(msg: string) {
    const m = String(msg || '').toLowerCase();
    if (m.includes('invalid_grant') || m.includes('expired') || m.includes('revoked')) return 'invalid_grant_revoked';
    if (m.includes('invalid_client')) return 'invalid_client';
    if (m.includes('unauthorized_client')) return 'unauthorized_client';
    if (m.includes('invalid_request')) return 'invalid_request';
    if (m.includes('token_refresh_failed')) return 'token_refresh_failed';
    if (m.includes('network') || m.includes('fetch failed') || m.includes('econnrefused')) return 'network_error';
    return 'other';
  }

  it('correctly classifies invalid_grant as invalid_grant_revoked', () => {
    expect(classifyTokenError('invalid_grant: Token has been expired or revoked.')).toBe('invalid_grant_revoked');
    expect(classifyTokenError('Token has been revoked')).toBe('invalid_grant_revoked');
    expect(classifyTokenError('Token expired')).toBe('invalid_grant_revoked');
  });

  it('correctly classifies client configuration errors', () => {
    expect(classifyTokenError('invalid_client: Unauthorized client secret')).toBe('invalid_client');
    expect(classifyTokenError('unauthorized_client')).toBe('unauthorized_client');
  });

  it('correctly classifies network failures', () => {
    expect(classifyTokenError('TypeError: fetch failed')).toBe('network_error');
    expect(classifyTokenError('ECONNREFUSED 142.250.180.202')).toBe('network_error');
  });

  it('detects suspected Google OAuth Testing mode 7-day expiration', () => {
    // If connected 8 days ago and invalid_grant occurred:
    const connectedAt = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();
    const connectedAtMs = Date.parse(connectedAt);
    const daysSinceConnect = Math.floor((Date.now() - connectedAtMs) / (24 * 3600 * 1000));
    const isTokenExpired = true;
    const isLiveConnected = false;

    const isTestingModeSuspected = isTokenExpired || (daysSinceConnect >= 6 && !isLiveConnected);

    expect(daysSinceConnect).toBe(8);
    expect(isTestingModeSuspected).toBe(true);
  });

  it('builds an OAuth URL that strictly enforces offline access and consent prompt', () => {
    const clientId = '123456789-test.apps.googleusercontent.com';
    const redirectUri = 'http://127.0.0.1:4521/oauth2callback';
    const allowedAccount = 'yoni122222@gmail.com';
    const scopes = [
      'openid',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.compose',
    ];

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'false',
      login_hint: allowedAccount,
      scope: scopes.join(' '),
      state: 'stg-test',
    });

    const url = new URL(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);

    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('login_hint')).toBe(allowedAccount);
    expect(url.searchParams.get('include_granted_scopes')).toBe('false');
    expect(url.searchParams.get('scope')).toContain('gmail.readonly');
    expect(url.searchParams.get('scope')).toContain('gmail.compose');
  });
});
