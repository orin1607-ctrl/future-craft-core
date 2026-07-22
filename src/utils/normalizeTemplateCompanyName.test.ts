import { describe, expect, it } from 'vitest';
import { normalizeTemplateCompanyName } from '@/utils/declarationTemplates';

describe('normalizeTemplateCompanyName', () => {
  it('trims company names so save/load hit the same row', () => {
    expect(normalizeTemplateCompanyName('  Acme  ')).toBe('Acme');
    expect(normalizeTemplateCompanyName('')).toBe('');
    expect(normalizeTemplateCompanyName(null)).toBe('');
    expect(normalizeTemplateCompanyName(undefined)).toBe('');
  });
});
