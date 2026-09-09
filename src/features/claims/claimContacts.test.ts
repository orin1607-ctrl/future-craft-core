import { describe, expect, it } from 'vitest';
import {
  contactMatchesQuery,
  emailsUnknownToDirectory,
  normEmail,
  normPhoneDigits,
  parseFromAddr,
  phoneUnknownToDirectory,
  projectClaimContacts,
  rankContactsForClaim,
  sameCompany,
  type ClaimContact,
} from './claimContacts';

const c = (partial: Partial<ClaimContact> & { id: string; full_name: string }): ClaimContact => ({
  role: 'other',
  company_name: '',
  department: '',
  note: '',
  active: true,
  listed_in_directory: true,
  channels: [],
  ...partial,
});

describe('claimContacts helpers', () => {
  it('normalizes email and phone without inventing values', () => {
    expect(normEmail('  Foo@Migdal.CO.IL ')).toBe('foo@migdal.co.il');
    expect(normPhoneDigits('054-123-4567')).toBe('972541234567');
    expect(normPhoneDigits('')).toBe('');
  });

  it('parses From display name as a suggestion only', () => {
    expect(parseFromAddr('יוני <yoni@example.com>')).toEqual({ name: 'יוני', email: 'yoni@example.com' });
    expect(parseFromAddr('yoni@example.com')).toEqual({ name: '', email: 'yoni@example.com' });
  });

  it('projects existing claim fields without treating them as directory rows', () => {
    const rows = projectClaimContacts({
      clientName: 'יוני',
      clientEmail: 'yoni@example.com',
      clientPhone: '0500000000',
      insCompany: 'מגדל',
      insEmail: 'claims@example.com',
      agentName: 'אפרת',
    } as Record<string, string>);
    expect(rows.some((r) => r.role === 'client' && r.source === 'claim_fields')).toBe(true);
    expect(rows.some((r) => r.role === 'insurer' && r.company_name === 'מגדל')).toBe(true);
    expect(rows.some((r) => r.role === 'agent' && r.full_name === 'אפרת')).toBe(true);
    expect(rows.every((r) => r.id.startsWith('claim-'))).toBe(true);
  });

  it('ranks claim-linked and same-insurer contacts first', () => {
    const ranked = rankContactsForClaim([
      c({ id: '1', full_name: 'אחר', role: 'other' }),
      c({ id: '2', full_name: 'מגדל מסמכים', role: 'insurer_dept', company_name: 'מגדל' }),
      c({ id: '3', full_name: 'אפרת', role: 'agent', linked: true }),
      c({ id: '4', full_name: 'לקוח', role: 'client' }),
    ], { insCompany: 'מגדל' });
    expect(ranked.map((x) => x.id)).toEqual(['3', '2', '4', '1']);
  });

  it('detects unknown emails/phones against the directory only', () => {
    const dir = [c({
      id: '1',
      full_name: 'שמור',
      channels: [{ id: 'e', contact_id: '1', kind: 'email', value: 'a@x.com', value_norm: 'a@x.com', label: '' }],
    })];
    expect(emailsUnknownToDirectory('a@x.com, new@x.com', dir)).toEqual(['new@x.com']);
    expect(phoneUnknownToDirectory('0541234567', dir)).toBe('972541234567');
    expect(phoneUnknownToDirectory('0541234567', [c({
      id: '2',
      full_name: 'p',
      channels: [{ id: 'p', contact_id: '2', kind: 'phone', value: '0541234567', value_norm: '972541234567', label: '' }],
    })])).toBe('');
  });

  it('filters search across name company role and channels', () => {
    const row = c({
      id: '1',
      full_name: 'אפרת כהן',
      role: 'agent',
      company_name: 'מגדל',
      channels: [{ id: 'e', contact_id: '1', kind: 'email', value: 'efrat@x.com', value_norm: 'efrat@x.com', label: '' }],
    });
    expect(contactMatchesQuery(row, 'אפרת')).toBe(true);
    expect(contactMatchesQuery(row, 'מגדל')).toBe(true);
    expect(contactMatchesQuery(row, 'efrat@x.com')).toBe(true);
    expect(contactMatchesQuery(row, 'הראל')).toBe(false);
  });

  it('does not treat empty insurer names as the same company', () => {
    expect(sameCompany('', '')).toBe(false);
    expect(sameCompany('מגדל', 'מגדל')).toBe(true);
  });
});
