import { describe, expect, it } from 'vitest';
import { canAccessRoute } from './routeAccess';
import {
  countDistinctActivePeople,
  displayAccount,
  displayActivityDuration,
  displayTool,
  matchesSecurityFilters,
  needsIdentityAttention,
  redactDetails,
  shortFingerprint,
} from './securityAuditLabels';

describe('security identity display — no guessing', () => {
  it('shows GitHub account as the source reports it', () => {
    expect(displayAccount({
      source: 'github',
      actor_username: 'orin1607-ctrl',
      identity_status: 'identified',
    })).toBe('GitHub — orin1607-ctrl');
  });

  it('does not invent an email', () => {
    expect(displayAccount({
      source: 'github',
      actor_username: 'orin1607-ctrl',
      actor_email: null,
      identity_status: 'identified',
    })).not.toMatch(/@/);
  });

  it('shows GitHub Actions only from proven actor', () => {
    expect(displayTool({
      source: 'github',
      identity_status: 'identified',
      access_kind: 'github_actions',
      tool_name: 'GitHub Actions',
    })).toBe('AUTHORIZED — GITHUB ACTIONS');
  });

  it('does not guess Cursor from IP-only VPS row', () => {
    expect(displayTool({
      source: 'hostinger_vps',
      actor_username: 'root',
      identity_status: 'identified',
      access_kind: 'ssh',
      tool_name: 'לא מזוהה',
      ip_address: '79.181.173.191',
    })).toBe('כלי/אדם לא מזוהה');
  });

  it('marks unidentified access without attacker language', () => {
    const row = {
      source: 'hostinger_vps' as const,
      actor_username: 'root',
      identity_status: 'unidentified',
      tool_name: 'לא מזוהה',
      event_type: 'ssh_login_failed',
    };
    expect(needsIdentityAttention(row)).toBe(true);
    expect(displayAccount(row)).toBe('root');
  });

  it('does not invent duration for external events', () => {
    expect(displayActivityDuration({
      source: 'github',
      identity_status: 'identified',
      active_ms: null,
    }).text).toBe('זמן פעילות לא זמין');
  });

  it('shortens fingerprints and redacts secrets', () => {
    expect(shortFingerprint('SHA256:Ji7fUE2KcaJyxEhnHse0EqmL97LuuBuaOERJl+xtE4c')).toMatch(/^SHA256:Ji7f…E4c$/);
    expect(redactDetails({ token: 'secret', note: 'ok' })).toEqual({ note: 'ok' });
  });

  it('counts one person across several open tabs', () => {
    const uid = 'user-1';
    const sessions = [
      { user_id: uid, is_open: true, last_heartbeat_at: new Date().toISOString() },
      { user_id: uid, is_open: true, last_heartbeat_at: new Date().toISOString() },
      { user_id: uid, is_open: true, last_heartbeat_at: new Date().toISOString() },
    ];
    expect(countDistinctActivePeople(sessions)).toBe(1);
  });

  it('filters by source and unidentified without mixing people', () => {
    const empty = {
      search: '', source: 'github', role: '', outcome: '', identity: '', severity: '',
      dateFrom: '', dateTo: '', hour: '', company: '', user: '', email: '', tool: '', action: '',
      unidentifiedOnly: false, activePeopleOnly: false,
    };
    expect(matchesSecurityFilters({
      source: 'github', identity_status: 'identified', actor_username: 'orin1607-ctrl', action_label: 'Push',
    }, empty, new Set())).toBe(true);
    expect(matchesSecurityFilters({
      source: 'app', identity_status: 'identified', actor_username: 'x',
    }, empty, new Set())).toBe(false);
  });
});

describe('security-center route access', () => {
  it('allows super_admin and blocks others', () => {
    expect(canAccessRoute('/security-center', 'super_admin')).toBe(true);
    expect(canAccessRoute('/security-center', 'fleet_manager')).toBe(false);
    expect(canAccessRoute('/security-center', 'driver')).toBe(false);
    expect(canAccessRoute('/security-center', 'private_customer')).toBe(false);
  });
});
