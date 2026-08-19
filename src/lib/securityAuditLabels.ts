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
  unidentified: 'זהות לא מזוהה',
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

export const AUTHORIZED_TOOL_LABEL: Record<string, string> = {
  cursor_cross: 'AUTHORIZED — CURSOR/CROSS',
  claude_code: 'AUTHORIZED — CLAUDE CODE',
  chatgpt: 'AUTHORIZED — CHATGPT',
  github_actions: 'AUTHORIZED — GITHUB ACTIONS',
  automation: 'AUTHORIZED — AUTOMATION',
};

export const TOOL_FILTER_KIND: Record<string, string> = {
  cursor: 'cursor_cross',
  claude: 'claude_code',
  chatgpt: 'chatgpt',
  actions: 'github_actions',
  automation: 'automation',
  other: 'other',
  unidentified: 'unidentified',
};

export type IdentityKind = 'identified' | 'identity_unavailable' | 'unidentified';
export type ApprovalStatus = 'approved' | 'review' | 'unapproved' | 'failed';
/** Row color tone — identity gap is yellow, not the same as "needs review". */
export type SecurityClass = 'approved' | 'unidentified' | 'review' | 'failed';

export const APPROVAL_HE: Record<ApprovalStatus, string> = {
  approved: 'מאושר על ידינו',
  review: 'דורש בדיקה',
  unapproved: 'לא מאושר',
  failed: 'נכשל / נחסם',
};

export const CLASS_HE: Record<SecurityClass, string> = {
  approved: 'מאושר על ידינו',
  unidentified: 'זהות חסרה',
  review: 'דורש בדיקה',
  failed: 'נכשל / נחסם',
};

export const IDENTITY_BADGE_CLASS: Record<IdentityKind, string> = {
  identified: 'bg-emerald-50 text-emerald-900 border-emerald-400',
  identity_unavailable: 'bg-amber-100 text-amber-900 border-amber-400',
  unidentified: 'bg-amber-100 text-amber-900 border-amber-400',
};

export const APPROVAL_BADGE_CLASS: Record<ApprovalStatus, string> = {
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-500',
  review: 'bg-orange-100 text-orange-900 border-orange-500',
  unapproved: 'bg-red-100 text-red-800 border-red-500',
  failed: 'bg-red-100 text-red-800 border-red-500',
};

export const CLASS_BADGE_CLASS: Record<SecurityClass, string> = {
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-500',
  unidentified: 'bg-amber-100 text-amber-900 border-amber-400',
  review: 'bg-orange-100 text-orange-900 border-orange-500',
  failed: 'bg-red-100 text-red-800 border-red-500',
};

export const CLASS_ROW_CLASS: Record<SecurityClass, string> = {
  approved: 'border-r-4 border-r-emerald-500',
  unidentified: 'border-r-4 border-r-amber-400',
  review: 'border-r-4 border-r-orange-500',
  failed: 'border-r-4 border-r-red-500',
};

const FAILED_EVENT_TYPES = new Set([
  'login_failed', 'ssh_login_failed', 'otp_failed', 'unauthorized_page',
  'forbidden_action', 'session_invalid', 'unauthorized_anonymous', 'invalid_token',
]);

/** Proven Staging QA seeds we created. Never infer QA from source/time alone. */
const APPROVED_QA_SOURCE_REFS = new Set([
  'identity-seed-supabase',
  'identity-seed-push-orin',
  'identity-seed-gha',
]);

const APPROVED_GITHUB_LOGINS = new Set([
  'orin1607-ctrl',
  'github-actions[bot]',
  'github-actions',
  'cursor[bot]',
  'cursoragent',
]);

function isAccessFailure(row: SecurityIdentityRow): boolean {
  if (row.outcome === 'failure') return true;
  if (FAILED_EVENT_TYPES.has(row.event_type || '')) return true;
  const blob = `${row.result_label || ''} ${row.outcome || ''}`;
  return /נדחה|נחסם|blocked/i.test(blob);
}

function hasPersonFields(row: SecurityIdentityRow): boolean {
  return !!(row.actor_user_id || (row.actor_email || '').trim() || (row.actor_username || '').trim());
}

export function isMappedAuthorizedTool(row: SecurityIdentityRow): boolean {
  return !!(row.access_kind && AUTHORIZED_TOOL_LABEL[row.access_kind] && row.tool_name !== 'לא מזוהה');
}

export function isApprovedQaEvent(row: SecurityIdentityRow): boolean {
  const ref = (row.source_ref || '').trim();
  if (APPROVED_QA_SOURCE_REFS.has(ref)) return true;
  const details = row.details || {};
  if (details.qa === true || details.approval_basis === 'qa') return true;
  return false;
}

function githubLogin(row: SecurityIdentityRow): string {
  return (row.actor_username || row.actor_email || '').trim().toLowerCase();
}

export function isApprovedGithubActor(row: SecurityIdentityRow): boolean {
  const login = githubLogin(row);
  if (!login) return false;
  if (APPROVED_GITHUB_LOGINS.has(login)) return true;
  if (row.access_kind === 'github_actions' || row.access_kind === 'cursor_cross') return true;
  return false;
}

/** Who/what we could identify. Separate from approval. */
export function classifyIdentity(row: SecurityIdentityRow): IdentityKind {
  const noPerson = !hasPersonFields(row);
  if (row.source === 'supabase' && noPerson) return 'identity_unavailable';
  if (row.identity_status === 'identity_unavailable' && noPerson) return 'identity_unavailable';

  if (row.source === 'hostinger_vps') {
    if (isMappedAuthorizedTool(row)) {
      return hasPersonFields(row) && row.identity_status === 'identified' && row.actor_username !== 'root'
        ? 'identified'
        : 'identity_unavailable';
    }
    return 'unidentified';
  }

  if (row.source === 'github') {
    if ((row.actor_username || row.actor_email || '').trim()) return 'identified';
    return 'identity_unavailable';
  }

  if (row.source === 'app' && (row.actor_user_id || row.actor_email || row.actor_username)) {
    return 'identified';
  }

  if (row.identity_status === 'identified' && hasPersonFields(row)) return 'identified';
  if (row.identity_status === 'identity_unavailable') return 'identity_unavailable';
  return 'unidentified';
}

export function classifyApproval(row: SecurityIdentityRow): ApprovalStatus {
  if (isAccessFailure(row)) return 'failed';
  if (isApprovedQaEvent(row)) return 'approved';
  if (isMappedAuthorizedTool(row)) return 'approved';
  if (row.source === 'app' && classifyIdentity(row) === 'identified') return 'approved';
  if (row.source === 'github') {
    if (isApprovedGithubActor(row)) return 'approved';
    if (classifyIdentity(row) === 'identified') return 'unapproved';
    return 'review';
  }
  return 'review';
}

export function approvalLabel(row: SecurityIdentityRow): string {
  const status = classifyApproval(row);
  if (status === 'approved' && isApprovedQaEvent(row)) return 'מאושר — בדיקת QA';
  return APPROVAL_HE[status];
}

/** Visual tone: missing identity is yellow only when approval is not a problem. */
export function classifySecurityEvent(row: SecurityIdentityRow): SecurityClass {
  const approval = classifyApproval(row);
  const identity = classifyIdentity(row);
  if (approval === 'failed' || approval === 'unapproved') return 'failed';
  if (approval === 'review') return 'review';
  if (approval === 'approved' && identity !== 'identified') return 'unidentified';
  return 'approved';
}

export function activityLayer(row: SecurityIdentityRow): 'app' | 'infra_approved' | 'infra_unknown' {
  if (row.source === 'app') return 'app';
  return classifyApproval(row) === 'approved' ? 'infra_approved' : 'infra_unknown';
}

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
  severity?: string | null;
  company_name?: string | null;
  actor_user_id?: string | null;
  action_label?: string;
  occurred_at?: string;
  source_ref?: string | null;
  details?: Record<string, unknown> | null;
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
  if (row.access_kind && AUTHORIZED_TOOL_LABEL[row.access_kind] && row.tool_name !== 'לא מזוהה') {
    return AUTHORIZED_TOOL_LABEL[row.access_kind];
  }
  if (!row.tool_name || row.tool_name === 'לא מזוהה') return 'כלי/אדם לא מזוהה';
  return row.tool_name;
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
  return { kind: 'event', text: 'זמן פעילות לא זמין' };
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

export const IL_TZ = 'Asia/Jerusalem';
export type DatePreset = 'all' | 'today' | 'yesterday' | '7d' | '30d' | 'specific' | 'range';

export const DATE_PRESET_HE: Record<DatePreset, string> = {
  all: 'הכול',
  today: 'היום',
  yesterday: 'אתמול',
  '7d': '7 ימים אחרונים',
  '30d': '30 ימים אחרונים',
  specific: 'תאריך מסוים',
  range: 'טווח תאריכים',
};

export function israelYmd(iso: string | Date, timeZone = IL_TZ): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function israelHour(iso: string | Date, timeZone = IL_TZ): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '';
  const raw = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hour12: false,
  }).format(d);
  return raw.replace(/[^\d]/g, '').padStart(2, '0').slice(0, 2);
}

export function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export function formatIlDay(ymd: string): string {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

export function resolveFilterDateRange(
  filter: Pick<SecurityFilterState, 'datePreset' | 'dateFrom' | 'dateTo'>,
  now = new Date(),
): { from: string | null; to: string | null } {
  const today = israelYmd(now);
  const preset = filter.datePreset || 'all';
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const yest = shiftYmd(today, -1);
      return { from: yest, to: yest };
    }
    case '7d':
      return { from: shiftYmd(today, -6), to: today };
    case '30d':
      return { from: shiftYmd(today, -29), to: today };
    case 'specific': {
      const day = filter.dateFrom || today;
      return { from: day, to: day };
    }
    case 'range':
      return { from: filter.dateFrom || null, to: filter.dateTo || null };
    default:
      return { from: null, to: null };
  }
}

export function activeDateRangeLabel(
  filter: Pick<SecurityFilterState, 'datePreset' | 'dateFrom' | 'dateTo'>,
  now = new Date(),
): string {
  const { from, to } = resolveFilterDateRange(filter, now);
  const preset = filter.datePreset || 'all';
  if (preset === 'all' || (!from && !to)) return 'טווח זמן פעיל: הכול';
  if (from && to && from === to) {
    const name = preset === 'today' ? 'היום' : preset === 'yesterday' ? 'אתמול' : 'תאריך מסוים';
    return `טווח זמן פעיל: ${name} · ${formatIlDay(from)} (שעון ישראל)`;
  }
  if (from && to) {
    return `טווח זמן פעיל: ${DATE_PRESET_HE[preset] || 'טווח'} · ${formatIlDay(from)} – ${formatIlDay(to)} (שעון ישראל)`;
  }
  if (from) return `טווח זמן פעיל: מ־${formatIlDay(from)} (שעון ישראל)`;
  return `טווח זמן פעיל: עד ${formatIlDay(to || '')} (שעון ישראל)`;
}

export type SecurityFilterState = {
  search: string;
  source: string;
  role: string;
  outcome: string;
  identity: string;
  severity: string;
  dateFrom: string;
  dateTo: string;
  hour: string;
  company: string;
  user: string;
  email: string;
  tool: string;
  action: string;
  unidentifiedOnly: boolean;
  activePeopleOnly: boolean;
  classification: string;
  approval: string;
  layer: string;
  datePreset: DatePreset;
};

export type SessionLike = {
  user_id: string;
  is_open: boolean;
  last_heartbeat_at?: string | null;
};

export function activeUserIds(sessions: SessionLike[], withinMs = 3 * 60_000): Set<string> {
  const now = Date.now();
  const ids = new Set<string>();
  for (const s of sessions) {
    if (!s.is_open || !s.last_heartbeat_at) continue;
    if (now - new Date(s.last_heartbeat_at).getTime() <= withinMs) ids.add(s.user_id);
  }
  return ids;
}

export function countDistinctActivePeople(sessions: SessionLike[]): number {
  return activeUserIds(sessions).size;
}

export function sessionCountByUser(sessions: SessionLike[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of sessions) {
    if (!s.is_open) continue;
    map.set(s.user_id, (map.get(s.user_id) || 0) + 1);
  }
  return map;
}

export function matchesSecurityFilters(
  row: SecurityIdentityRow & { occurred_at?: string; action_label?: string; company_name?: string | null; actor_user_id?: string | null },
  filter: SecurityFilterState,
  activeIds: Set<string>,
  now = new Date(),
): boolean {
  if (filter.unidentifiedOnly && classifyIdentity(row) !== 'unidentified') return false;
  const approval = filter.approval || filter.classification;
  if (approval && classifyApproval(row) !== approval) return false;
  if (filter.layer && activityLayer(row) !== filter.layer) return false;
  if (filter.activePeopleOnly) {
    if (row.source !== 'app' || !row.actor_user_id || !activeIds.has(row.actor_user_id)) return false;
  }
  if (filter.source && row.source !== filter.source) return false;
  if (filter.role && row.actor_role !== filter.role) return false;
  if (filter.outcome) {
    if (filter.outcome === 'blocked') {
      const blob = `${row.result_label || ''} ${row.outcome || ''}`;
      if (!/נדחה|נחסם|blocked/i.test(blob)) return false;
    } else if (row.outcome !== filter.outcome) return false;
  }
  if (filter.identity && classifyIdentity(row) !== filter.identity) return false;
  if (filter.severity && row.severity !== filter.severity) return false;
  if (filter.company && (row.company_name || '') !== filter.company) return false;
  if (filter.tool) {
    if (filter.tool === 'unidentified') {
      if (displayTool(row) !== 'כלי/אדם לא מזוהה') return false;
    } else if (filter.tool === 'other') {
      if (row.access_kind && AUTHORIZED_TOOL_LABEL[row.access_kind]) return false;
    } else {
      const kind = TOOL_FILTER_KIND[filter.tool];
      if (kind && row.access_kind !== kind) return false;
    }
  }
  if (filter.action) {
    const blob = `${row.action_label || ''} ${row.event_type || ''}`.toLowerCase();
    if (!blob.includes(filter.action.toLowerCase())) return false;
  }
  if (filter.user) {
    const blob = `${row.actor_username || ''} ${displayAccount(row)}`.toLowerCase();
    if (!blob.includes(filter.user.toLowerCase())) return false;
  }
  if (filter.email) {
    if (!(row.actor_email || '').toLowerCase().includes(filter.email.toLowerCase())) return false;
  }
  const occurred = row.occurred_at || '';
  if (occurred) {
    const day = israelYmd(occurred);
    const { from, to } = resolveFilterDateRange(filter, now);
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (filter.hour && israelHour(occurred) !== filter.hour) return false;
  } else if (filter.datePreset && filter.datePreset !== 'all') {
    return false;
  }
  if (filter.search) {
    const blob = `${displayAccount(row)} ${row.action_label} ${row.event_type} ${row.ip_address} ${row.company_name} ${row.tool_name} ${row.actor_username} ${row.actor_email}`.toLowerCase();
    if (!blob.includes(filter.search.toLowerCase())) return false;
  }
  return true;
}
