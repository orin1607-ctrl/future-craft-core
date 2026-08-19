/** Client helpers for Security Control Center. Never send passwords/tokens. */

export type SecuritySource = 'app' | 'supabase' | 'github' | 'hostinger_vps';

export function deviceSummary(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'דפדפן';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : 'מכשיר';
  return `${browser} / ${os}`;
}

export function formatActiveMs(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h} שע׳ ${m} דק׳`;
  if (m > 0) return `${m} דק׳ ${s} שנ׳`;
  return `${s} שנ׳`;
}

export const ROLE_HE: Record<string, string> = {
  super_admin: 'מנהל על',
  fleet_manager: 'מנהל צי',
  driver: 'נהג',
  private_customer: 'לקוח פרטי',
  business_customer: 'לקוח עסקי',
  unidentified: 'לא מזוהה',
  github_actor: 'גורם GitHub',
  other: 'משתמש אחר',
  identity_unavailable: 'זהות לא זמינה',
};

export const SOURCE_HE: Record<string, string> = {
  app: 'האפליקציה',
  supabase: 'Supabase',
  github: 'GitHub',
  hostinger_vps: 'Hostinger / VPS',
};

export const SEVERITY_HE: Record<string, string> = {
  info: 'מידע',
  warning: 'אזהרה',
  high: 'גבוה',
  critical: 'קריטי',
};

export const IDENTITY_HE: Record<string, string> = {
  identified: 'מזוהה',
  unidentified: 'לא מזוהה',
  identity_unavailable: 'זהות לא זמינה',
};

export const OUTCOME_HE: Record<string, string> = {
  success: 'הצליח',
  failure: 'נכשל',
  unknown: 'לא ידוע',
};

export const ACCESS_KIND_HE: Record<string, string> = {
  human: 'אדם',
  cursor_cross: 'Cursor/Cross',
  claude_code: 'Claude Code',
  chatgpt: 'ChatGPT',
  github_actions: 'GitHub Actions',
  bot: 'Bot',
  automation: 'Automation',
  ssh: 'SSH',
  api: 'API',
  other: 'כלי אחר',
  unidentified: 'לא מזוהה',
};

export type SecurityIdentityRow = {
  source: string;
  actor_email?: string | null;
  actor_username?: string | null;
  actor_role?: string | null;
  identity_status: string;
  access_kind?: string | null;
  tool_name?: string | null;
  object_type?: string | null;
  ssh_fingerprint?: string | null;
  auth_method?: string | null;
  active_ms?: number | null;
  session_id?: string | null;
  ip_address?: string | null;
  result_label?: string | null;
  outcome?: string | null;
  event_type?: string | null;
};

export function displayAccount(row: SecurityIdentityRow): string {
  const username = (row.actor_username || '').trim();
  const email = (row.actor_email || '').trim();
  if (row.source === 'github') {
    if (username) return `GitHub — ${username}`;
    if (email) return `GitHub — ${email}`;
    return 'זהות לא זמינה';
  }
  if (row.source === 'hostinger_vps') {
    if (username) return username;
    if (row.actor_role?.startsWith('ssh:')) return row.actor_role.slice(4);
    return 'לא מזוהה';
  }
  if (row.source === 'supabase') {
    return username || email || 'זהות לא זמינה';
  }
  return username || email || (row.identity_status === 'identity_unavailable' ? 'זהות לא זמינה' : 'לא מזוהה');
}

export function displayTool(row: SecurityIdentityRow): string {
  if (row.tool_name && row.tool_name.trim()) return row.tool_name;
  if (row.access_kind && ACCESS_KIND_HE[row.access_kind]) return ACCESS_KIND_HE[row.access_kind];
  return 'לא מזוהה';
}

export function displayAccessKind(row: SecurityIdentityRow): string {
  if (row.access_kind && ACCESS_KIND_HE[row.access_kind]) return ACCESS_KIND_HE[row.access_kind];
  return 'לא מזוהה';
}

export function shortFingerprint(fp: string | null | undefined): string {
  if (!fp) return '—';
  const raw = fp.replace(/^SHA256:/, '');
  if (raw.length <= 12) return fp;
  return `SHA256:${raw.slice(0, 4)}…${raw.slice(-3)}`;
}

export function displayOutcome(row: SecurityIdentityRow): string {
  const label = (row.result_label || '').trim();
  if (label) return label;
  if (row.outcome && OUTCOME_HE[row.outcome]) return OUTCOME_HE[row.outcome];
  return row.outcome || '—';
}

export function displayActivityDuration(row: SecurityIdentityRow): { kind: 'session' | 'event'; text: string } {
  if (row.source === 'app' && row.active_ms != null && row.active_ms > 0) {
    return { kind: 'session', text: formatActiveMs(row.active_ms) };
  }
  if (row.session_id && row.active_ms != null && row.active_ms > 0) {
    return { kind: 'session', text: formatActiveMs(row.active_ms) };
  }
  return { kind: 'event', text: 'משך פעילות: לא זמין' };
}

export function needsIdentityAttention(row: SecurityIdentityRow): boolean {
  if (row.identity_status === 'unidentified') return true;
  if (row.tool_name === 'לא מזוהה') return true;
  if (row.identity_status === 'identity_unavailable' && !row.actor_username && !row.actor_email) return true;
  if (row.event_type === 'ssh_login_failed') return true;
  return false;
}

export function redactDetails(details: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const blocked = new Set([
    'password', 'token', 'secret', 'authorization', 'api_key', 'apikey',
    'private_key', 'service_role', 'access_token', 'refresh_token',
    'cookie', 'cookies', 'ssh_key', 'credential',
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details || {})) {
    if (blocked.has(k.toLowerCase())) continue;
    if (typeof v === 'string' && /(BEGIN .*PRIVATE KEY|ghp_|sk-|eyJ)/i.test(v)) continue;
    out[k] = v;
  }
  return out;
}
