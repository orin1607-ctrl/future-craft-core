/** Helpers for outbound secure share. No raw token storage. Staging only. */

export const SHARE_RECIPIENT_KINDS = [
  { key: 'surveyor', label: 'שמאי' },
  { key: 'lawyer', label: 'עו"ד' },
  { key: 'insurer', label: 'חברת ביטוח' },
  { key: 'agent', label: 'סוכן' },
  { key: 'client', label: 'לקוח' },
  { key: 'other', label: 'אחר' },
] as const;

export type ShareRecipientKind = (typeof SHARE_RECIPIENT_KINDS)[number]['key'];

export const SHARE_TTL_PRESETS = [
  { key: '24h', hours: 24, label: '24 שעות' },
  { key: '48h', hours: 48, label: '48 שעות' },
  { key: '72h', hours: 72, label: '72 שעות' },
  { key: '7d', hours: 168, label: '7 ימים' },
  { key: 'custom', hours: 0, label: 'מותאם אישית' },
] as const;

export const DEFAULT_SHARE_TTL = '48h';

export type ShareStatus = 'active' | 'expired' | 'revoked';

export type ShareRow = {
  id: string;
  claim_id: string;
  recipient_name: string;
  recipient_kind: string;
  recipient_kind_note?: string;
  recipient_email?: string;
  recipient_phone?: string;
  file_ids: string[];
  file_names?: string[];
  expires_at: string;
  revoked_at?: string | null;
  created_by_name?: string;
  created_at: string;
  opened_at?: string | null;
  last_download_at?: string | null;
  open_count?: number;
  status?: ShareStatus;
};

export function shareKindLabel(kind: string) {
  return SHARE_RECIPIENT_KINDS.find((x) => x.key === kind)?.label || kind || '—';
}

export function shareStatusOf(row: { expires_at?: string; revoked_at?: string | null }, nowMs = Date.now()): ShareStatus {
  if (row.revoked_at) return 'revoked';
  const exp = Date.parse(String(row.expires_at || ''));
  if (Number.isFinite(exp) && exp <= nowMs) return 'expired';
  return 'active';
}

export function shareStatusLabel(st: ShareStatus) {
  if (st === 'revoked') return 'בוטל';
  if (st === 'expired') return 'פג';
  return 'פעיל';
}

export function resolveShareExpiry(preset: string, customLocal?: string, nowMs = Date.now()): { ok: true; expiresAt: string } | { ok: false; error: string } {
  const hit = SHARE_TTL_PRESETS.find((p) => p.key === preset);
  if (!hit) return { ok: false, error: 'תוקף לא תקין' };
  if (hit.key === 'custom') {
    const t = Date.parse(String(customLocal || ''));
    if (!Number.isFinite(t)) return { ok: false, error: 'נא לבחור תאריך ושעת תפוגה' };
    if (t < nowMs + 60_000) return { ok: false, error: 'מועד התפוגה חייב להיות בעתיד' };
    if (t > nowMs + 90 * 86_400_000) return { ok: false, error: 'תוקף מותאם עד 90 יום' };
    return { ok: true, expiresAt: new Date(t).toISOString() };
  }
  return { ok: true, expiresAt: new Date(nowMs + hit.hours * 3600_000).toISOString() };
}

export function isShareImage(mime: string, name = '') {
  return /^image\//i.test(mime) || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(name);
}

export function filesBelongToClaim(fileIds: string[], claimFiles: Array<{ id: string; claim_id?: string }>, claimId: string) {
  const allowed = new Set(claimFiles.filter((f) => !f.claim_id || f.claim_id === claimId).map((f) => f.id));
  const unique = [...new Set(fileIds.map(String).filter(Boolean))];
  if (!unique.length) return { ok: false as const, error: 'נא לבחור לפחות קובץ אחד', ids: [] as string[] };
  if (unique.some((id) => !allowed.has(id))) return { ok: false as const, error: 'קובץ לא שייך לתיק זה', ids: [] as string[] };
  return { ok: true as const, ids: unique };
}

export function fileInShareAllowlist(fileId: string, shareFileIds: unknown, shareClaimId: string, fileClaimId: string) {
  const ids = Array.isArray(shareFileIds) ? shareFileIds.map(String) : [];
  if (!fileId || !shareClaimId || shareClaimId !== fileClaimId) return false;
  return ids.includes(fileId);
}

/** Path with trailing slash so GitHub Pages serves the SPA shell at 200 and does not 301 (which can drop ?t= in WhatsApp / in-app browsers). */
export function sharePublicPath(token: string) {
  const base = (typeof import.meta !== 'undefined' ? String(import.meta.env?.BASE_URL || '/') : '/').replace(/\/$/, '');
  const prefix = base && base !== '/' ? base : '';
  return `${prefix}/claims-share/?t=${encodeURIComponent(token)}`;
}

export function sharePublicUrl(token: string) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${sharePublicPath(token)}`;
}

export function shareWhatsAppHref(message: string, phone = '') {
  const digits = String(phone || '').replace(/\D/g, '');
  const q = encodeURIComponent(message);
  return digits ? `https://wa.me/${digits}?text=${q}` : `https://wa.me/?text=${q}`;
}

export function shareTtlPhrase(preset: string, expiresAt?: string) {
  const hit = SHARE_TTL_PRESETS.find((p) => p.key === preset);
  if (hit && hit.key !== 'custom') return hit.label;
  if (expiresAt) return new Date(expiresAt).toLocaleString('he-IL');
  return '48 שעות';
}

export function shareRecipientMessage(url: string, expiresAt: string, ttlPreset = DEFAULT_SHARE_TTL) {
  const duration = shareTtlPhrase(ttlPreset, expiresAt);
  const untilLine = ttlPreset === 'custom'
    ? `הקישור יהיה זמין עד ${duration} בלבד.`
    : `הקישור יהיה זמין למשך ${duration} בלבד.`;
  return [
    'מצורף קישור מאובטח לצפייה ולהורדת המסמכים והתמונות.',
    untilLine,
    'יש להוריד ולשמור את החומר לפני פקיעת הקישור.',
    '',
    url,
  ].join('\n');
}

export function parseShareFileIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  return [];
}
