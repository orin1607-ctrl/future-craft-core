/**
 * Which claim a shared file belongs to. Same conservative rules as incoming Gmail
 * (claims-gmail/matchIncoming.ts): auto only when exactly one claim fits; any doubt → the user picks.
 */
import { matchIncomingMail, type MatchClaim, type MatchResult } from '../../../../supabase/functions/claims-gmail/matchIncoming.ts';
import type { ClaimRecord } from '../claimsConstants';

export const SHARE_NOTE_TAG = '[share_to_dalia]';
export const MAX_SHARE_BYTES = 15 * 1024 * 1024;

const ALLOWED_MIME = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/i;
const ALLOWED_EXT = /\.(pdf|jpe?g|png|webp|heic|heif)$/i;
/** Camera / WhatsApp names carry a date (IMG-20261027-WA0001) that would read as a plate. */
const AUTO_NAME = /^(IMG|VID|DOC|PXL|PTT|Screenshot|photo|image|signal|WhatsApp)[-_ ]/i;

export type ShareFileCheck = { ok: true; isPdf: boolean } | { ok: false; error: string };

export function checkSharedFile(file: { name: string; type: string; size: number }): ShareFileCheck {
  const typeOk = ALLOWED_MIME.test(file.type || '') || ALLOWED_EXT.test(file.name || '');
  if (!typeOk) return { ok: false, error: 'סוג קובץ לא נתמך — רק PDF או תמונה' };
  if (!file.size) return { ok: false, error: 'הקובץ ריק' };
  if (file.size > MAX_SHARE_BYTES) return { ok: false, error: 'הקובץ גדול מ-15MB' };
  const isPdf = /pdf/i.test(file.type || '') || /\.pdf$/i.test(file.name || '');
  return { ok: true, isPdf };
}

export function toMatchClaim(c: ClaimRecord): MatchClaim {
  return {
    id: c.id,
    claimNum: c.claimNum,
    plate: c.plate,
    eventDate: c.eventDate,
    clientName: c.clientName,
    insCompany: c.insCompany,
  };
}

export function matchSharedFile(
  file: { name: string; text?: string; sharedText?: string },
  claims: ClaimRecord[],
): MatchResult {
  const name = String(file.name || '');
  return matchIncomingMail(
    {
      messageId: 'share',
      subject: file.sharedText || '',
      body: file.text || '',
      filenames: AUTO_NAME.test(name) ? [] : [name],
    },
    claims.map(toMatchClaim),
  );
}

export function shareNote(auto: boolean, reason: string) {
  return `${SHARE_NOTE_TAG} שותף מהטלפון · ${auto ? `שויך אוטומטית: ${reason}` : 'שויך ידנית'}`.slice(0, 500);
}

export function claimLabel(c: ClaimRecord | undefined) {
  if (!c) return '';
  return [c.claimNum || c.id, c.plate, c.clientName].filter(Boolean).join(' · ');
}
