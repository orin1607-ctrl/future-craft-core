import { describe, expect, it } from 'vitest';
import { canAccessRoute } from './routeAccess';
import {
  APPROVAL_HE,
  IDENTITY_HE,
  activityLayer,
  approvalLabel,
  classifyApproval,
  classifyIdentity,
  classifySecurityEvent,
  countDistinctActivePeople,
  displayAccount,
  displayActivityDuration,
  displayTool,
  matchesSecurityFilters,
  needsIdentityAttention,
  redactDetails,
  shortFingerprint,
  type SecurityFilterState,
} from './securityAuditLabels';

const emptyFilter = (patch: Partial<SecurityFilterState> = {}): SecurityFilterState => ({
  search: '', source: '', role: '', outcome: '', identity: '', severity: '',
  dateFrom: '', dateTo: '', hour: '', company: '', user: '', email: '', tool: '', action: '',
  unidentifiedOnly: false, activePeopleOnly: false, classification: '', approval: '', layer: '',
  ...patch,
});

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
    const empty = emptyFilter({ source: 'github' });
    expect(matchesSecurityFilters({
      source: 'github', identity_status: 'identified', actor_username: 'orin1607-ctrl', action_label: 'Push',
    }, empty, new Set())).toBe(true);
    expect(matchesSecurityFilters({
      source: 'app', identity_status: 'identified', actor_username: 'x',
    }, empty, new Set())).toBe(false);
  });
});

describe('identity vs approval are separate fields', () => {
  const ssh1411 = {
    source: 'hostinger_vps' as const,
    identity_status: 'identified',
    actor_username: 'root',
    access_kind: 'ssh',
    tool_name: 'לא מזוהה',
    outcome: 'success',
    event_type: 'ssh_login_success',
    action_label: 'כניסת SSH',
    ssh_fingerprint: 'SHA256:+cjDBmC5TAOzoHndrQ5QM84kUwCbP7AgosH8ociBSME',
    source_ref: 'SHA256:+cjDBmC5TAOzoHndrQ5QM84kUwCbP7AgosH8ociBSME',
  };

  const supabase1418 = {
    source: 'supabase' as const,
    identity_status: 'identity_unavailable',
    actor_username: null,
    actor_email: null,
    access_kind: 'api',
    tool_name: 'Supabase',
    outcome: 'unknown',
    event_type: 'auth_audit',
    action_label: 'אירוע Auth',
    source_ref: 'identity-seed-supabase',
    details: { note: 'Supabase did not supply actor — identity unavailable' },
  };

  it('approves Cursor/Cross only when the fingerprint is the mapped key', () => {
    const cursor = {
      source: 'hostinger_vps' as const,
      identity_status: 'identity_unavailable',
      actor_username: 'root',
      access_kind: 'cursor_cross',
      tool_name: 'Cursor/Cross',
      outcome: 'success',
      ssh_fingerprint: 'SHA256:Ji7fUE2KcaJyxEhnHse0EqmL97LuuBuaOERJl+xtE4c',
    };
    expect(classifyApproval(cursor)).toBe('approved');
    expect(classifyIdentity(cursor)).toBe('identity_unavailable');
  });

  it('does not approve SSH 14:11 without Cursor/Cross key proof', () => {
    expect(classifyIdentity(ssh1411)).toBe('unidentified');
    expect(classifyApproval(ssh1411)).toBe('review');
    expect(approvalLabel(ssh1411)).toBe('דורש בדיקה');
    expect(ssh1411.ssh_fingerprint).not.toContain('Ji7fUE2KcaJyxEhnHse0EqmL97LuuBuaOERJl+xtE4c');
  });

  it('marks Staging QA Supabase 14:18 as identity unavailable + approved QA', () => {
    expect(classifyIdentity(supabase1418)).toBe('identity_unavailable');
    expect(classifyApproval(supabase1418)).toBe('approved');
    expect(approvalLabel(supabase1418)).toBe('מאושר — בדיקת QA');
    expect(classifySecurityEvent(supabase1418)).toBe('unidentified');
  });

  it('does not treat missing identity as unapproved or attacker', () => {
    expect(JSON.stringify({ ...IDENTITY_HE, ...APPROVAL_HE })).not.toMatch(/תוקף|לא מורשה|חיצוני/);
    expect(classifyApproval(supabase1418)).not.toBe('unapproved');
    expect(classifyApproval(supabase1418)).not.toBe('review');
  });

  it('does not approve a source just because it is GitHub or Supabase', () => {
    expect(classifyApproval({
      source: 'supabase',
      identity_status: 'identity_unavailable',
      outcome: 'success',
    })).toBe('review');
    expect(classifyApproval({
      source: 'github',
      identity_status: 'identified',
      actor_username: 'random-collaborator',
      outcome: 'success',
    })).toBe('unapproved');
  });

  it('filters approval and identity independently', () => {
    expect(matchesSecurityFilters(supabase1418, emptyFilter({ approval: 'approved' }), new Set())).toBe(true);
    expect(matchesSecurityFilters(supabase1418, emptyFilter({ identity: 'identity_unavailable' }), new Set())).toBe(true);
    expect(matchesSecurityFilters(supabase1418, emptyFilter({ identity: 'unidentified' }), new Set())).toBe(false);
    expect(matchesSecurityFilters(ssh1411, emptyFilter({ approval: 'review' }), new Set())).toBe(true);
    expect(matchesSecurityFilters(ssh1411, emptyFilter({ approval: 'approved' }), new Set())).toBe(false);
    expect(matchesSecurityFilters(ssh1411, emptyFilter({ identity: 'unidentified' }), new Set())).toBe(true);
  });
});

describe('security filters remaining', () => {
  it('does not count infrastructure events as app-active people', () => {
    const github = {
      source: 'github' as const,
      identity_status: 'identified' as const,
      actor_username: 'orin1607-ctrl',
      actor_user_id: null,
    };
    const vps = {
      source: 'hostinger_vps' as const,
      identity_status: 'identified' as const,
      actor_username: 'root',
      actor_user_id: null,
      access_kind: 'cursor_cross',
      tool_name: 'Cursor/Cross',
    };
    expect(activityLayer(github)).toBe('infra_approved');
    expect(activityLayer(vps)).toBe('infra_approved');
    expect(matchesSecurityFilters(github, emptyFilter({ activePeopleOnly: true }), new Set(['u1']))).toBe(false);
    expect(matchesSecurityFilters(vps, emptyFilter({ layer: 'app' }), new Set())).toBe(false);
  });

  it('filters by classification, tool, company, free search and clear-equivalent empty', () => {
    const approved = {
      source: 'github' as const,
      identity_status: 'identified' as const,
      actor_username: 'orin1607-ctrl',
      action_label: 'Push',
      company_name: 'אכבים',
      occurred_at: '2026-08-19T14:05:00.000Z',
      outcome: 'success',
    };
    const review = {
      source: 'hostinger_vps' as const,
      identity_status: 'unidentified' as const,
      actor_username: 'root',
      tool_name: 'לא מזוהה',
      action_label: 'כניסת SSH',
      outcome: 'success',
      occurred_at: '2026-08-19T14:12:00.000Z',
    };
    expect(matchesSecurityFilters(approved, emptyFilter({ approval: 'approved' }), new Set())).toBe(true);
    expect(matchesSecurityFilters(review, emptyFilter({ approval: 'approved' }), new Set())).toBe(false);
    expect(matchesSecurityFilters(review, emptyFilter({ unidentifiedOnly: true }), new Set())).toBe(true);
    expect(matchesSecurityFilters(approved, emptyFilter({ unidentifiedOnly: true }), new Set())).toBe(false);
    expect(matchesSecurityFilters(approved, emptyFilter({ user: 'orin1607' }), new Set())).toBe(true);
    expect(matchesSecurityFilters(approved, emptyFilter({ company: 'אכבים' }), new Set())).toBe(true);
    expect(matchesSecurityFilters(approved, emptyFilter({ search: 'Push' }), new Set())).toBe(true);
    expect(matchesSecurityFilters(approved, emptyFilter({ dateFrom: '2026-08-19', dateTo: '2026-08-19' }), new Set())).toBe(true);
    expect(matchesSecurityFilters(review, emptyFilter({ tool: 'unidentified' }), new Set())).toBe(true);
    expect(matchesSecurityFilters(approved, emptyFilter(), new Set())).toBe(true);
  });

  it('active people filter requires app source and heartbeat user id', () => {
    const app = {
      source: 'app' as const,
      identity_status: 'identified' as const,
      actor_user_id: 'user-1',
      actor_username: 'יוני אטיאס',
    };
    expect(matchesSecurityFilters(app, emptyFilter({ activePeopleOnly: true }), new Set(['user-1']))).toBe(true);
    expect(matchesSecurityFilters(app, emptyFilter({ activePeopleOnly: true }), new Set(['other']))).toBe(false);
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
