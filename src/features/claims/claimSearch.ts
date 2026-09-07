/** Existing dashboard search matcher. No second search box. */

import type { ClaimRecord } from './claimsConstants';

function norm(s: string) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function digits(s: string) {
  return String(s || '').replace(/[-\s]/g, '').toLowerCase();
}

export function claimSearchHaystacks(c: ClaimRecord): string[] {
  return [
    c.clientName,
    c.clientPhone,
    c.plate,
    c.claimNum,
    c.id,
    c.insCompany,
    c.surveyor,
    c.company_name,
    c.clientEmail,
    c.assigned_to_name,
    c.status,
  ].map((v) => String(v || ''));
}

/** Every whitespace token must hit at least one field. Name tokens are order-independent. */
export function claimMatchesSearch(c: ClaimRecord, rawQuery: string): boolean {
  const q = norm(rawQuery);
  if (!q) return true;
  const tokens = q.split(' ').filter(Boolean);
  if (!tokens.length) return true;
  const fields = claimSearchHaystacks(c);
  const name = norm(c.clientName || '');
  return tokens.every((tok) => {
    const d = digits(tok);
    if (name && name.split(' ').includes(tok)) return true;
    if (name && name.includes(tok)) return true;
    return fields.some((f) => {
      const n = norm(f);
      if (n.includes(tok)) return true;
      if (d && digits(f).includes(d) && d.length >= 2) return true;
      return false;
    });
  });
}

export function searchEmptyLabel(hasQuery: boolean, fallback: string) {
  return hasQuery ? 'לא נמצאו תוצאות' : fallback;
}
