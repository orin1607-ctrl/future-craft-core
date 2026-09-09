import { describe, expect, it } from 'vitest';
import {
  applyTemplateToClaim,
  customerTableLabel,
  customerWaitSuffix,
  fillClaimPlaceholders,
  parseRequestTemplates,
  DEFAULT_REQUEST_TEMPLATES,
} from './customerRequestModel';
import type { ClaimRecord } from './claimsConstants';

describe('customer request templates', () => {
  it('fills claim placeholders', () => {
    expect(fillClaimPlaceholders('שלום {{clientName}} {{claimNum}}', { clientName: 'רותם', claimNum: 'DAL-1' })).toBe('שלום רותם DAL-1');
  });
  it('falls back to builtin templates on empty/invalid JSON', () => {
    expect(parseRequestTemplates('').map((t) => t.id)).toEqual(DEFAULT_REQUEST_TEMPLATES.map((t) => t.id));
    expect(parseRequestTemplates('not-json')[0].name).toBe('תצהיר לחברת ביטוח');
  });
  it('applies a template onto a claim', () => {
    const filled = applyTemplateToClaim(DEFAULT_REQUEST_TEMPLATES[0], {
      clientName: 'דנה',
      plate: '12-345-67',
      claimNum: 'DAL-2026-0099',
      eventDate: '2026-01-02',
      insCompany: 'מגדל',
    });
    expect(filled.kind).toBe('affidavit');
    expect(filled.needsSignature).toBe(true);
    expect(filled.letterTo).toBe('מגדל');
    expect(filled.letterBody).toContain('דנה');
    expect(filled.letterBody).toContain('12-345-67');
  });
});

describe('customer table labels', () => {
  it('shows waiting label with request kind', () => {
    const t = { audience: 'customer', customerStatus: 'sent', customerKind: 'affidavit', done: 'false' } as ClaimRecord;
    expect(customerWaitSuffix(t)).toBe('תצהיר');
    expect(customerTableLabel(t)).toBe('ממתין ללקוח — תצהיר');
  });
  it('uses doc label for a missing document', () => {
    const t = { audience: 'customer', customerStatus: 'sent', customerKind: 'send_doc', docLabel: 'רישיון נהיגה', done: 'false' } as ClaimRecord;
    expect(customerTableLabel(t)).toBe('ממתין ללקוח — רישיון נהיגה');
  });
  it('switches to received-for-review and hides when done', () => {
    const open = { audience: 'customer', customerStatus: 'received', customerKind: 'affidavit', done: 'false' } as ClaimRecord;
    expect(customerTableLabel(open)).toBe('התקבל — לבדיקה');
    const done = { audience: 'customer', customerStatus: 'done', customerKind: 'affidavit', done: 'true' } as ClaimRecord;
    expect(customerTableLabel(done)).toBe('');
  });
});
