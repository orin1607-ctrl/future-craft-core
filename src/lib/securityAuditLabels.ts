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
