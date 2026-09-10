import { describe, expect, it } from 'vitest';
import { formatLeadTitle, lookupLeadNumber } from '@/features/telemarketing/lib/leadLabel';

const rows = [
  { leadNumber: '1', phone: '03-5584555', companyName: 'מערכות אשד' },
  { leadNumber: '2', phone: '03-9518818', companyName: 'פייר אאוט' },
];

describe('lead labels', () => {
  it('looks up by normalized phone', () => {
    expect(lookupLeadNumber(rows, '035584555', '')).toBe('1');
  });

  it('looks up by company when phone is missing', () => {
    expect(lookupLeadNumber(rows, '', 'מערכות אשד')).toBe('1');
  });

  it('formats the permanent business number', () => {
    expect(formatLeadTitle('1', 'מערכות אשד')).toBe('ליד #1 — מערכות אשד');
    expect(formatLeadTitle('30', '')).toBe('ליד #30');
  });
});
