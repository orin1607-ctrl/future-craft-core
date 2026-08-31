import type { LeadDirectoryRecord } from '@/features/telemarketing/lib/leadImport/types';

export type ContactFilter = 'all' | 'mobile' | 'landline' | 'both' | 'email' | 'no_phone' | 'full';

function digits(value: string | null | undefined): string {
  return String(value || '').replace(/[^0-9*]/g, '');
}

export function isMobilePhone(value: string | null | undefined): boolean {
  return /^05\d{7,9}$/.test(digits(value));
}

export function isLandlinePhone(value: string | null | undefined): boolean {
  const d = digits(value);
  return /^0[23489]\d{6,8}$/.test(d) || /^07\d{7,9}$/.test(d);
}

export function leadPhoneList(row: Pick<LeadDirectoryRecord, 'phone' | 'extra'>): string[] {
  const extra = row.extra || {};
  return [row.phone, extra.phone1, extra.phone2, extra.phone3, extra.phone4].filter((p) => digits(p).length >= 8);
}

export function leadHasMobile(row: Pick<LeadDirectoryRecord, 'phone' | 'extra'>): boolean {
  return leadPhoneList(row).some(isMobilePhone);
}

export function leadHasLandline(row: Pick<LeadDirectoryRecord, 'phone' | 'extra'>): boolean {
  return leadPhoneList(row).some((p) => isLandlinePhone(p) || (!isMobilePhone(p) && digits(p).length >= 8));
}

export function leadHasEmail(row: Pick<LeadDirectoryRecord, 'email' | 'extra'>): boolean {
  const extra = row.extra || {};
  return String(row.email || extra.contact1_email || '').includes('@');
}

export function matchesContactFilter(row: Pick<LeadDirectoryRecord, 'phone' | 'email' | 'extra'>, filter: ContactFilter): boolean {
  if (filter === 'all') return true;
  const mobile = leadHasMobile(row);
  const landline = leadHasLandline(row);
  const email = leadHasEmail(row);
  const phones = leadPhoneList(row);
  if (filter === 'mobile') return mobile;
  if (filter === 'landline') return landline;
  if (filter === 'both') return mobile && landline;
  if (filter === 'email') return email;
  if (filter === 'no_phone') return phones.length === 0;
  if (filter === 'full') return phones.length > 0 && email;
  return true;
}
