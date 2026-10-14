import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isQaClaimId } from '../../../supabase/functions/_shared/claimQaScope';
import { OCR_DEFAULT_MODEL } from '../../../supabase/functions/_shared/claimDocumentOcr';

const root = resolve(__dirname, '../../..');

describe('QA claim scope', () => {
  it('recognises fictitious QA claims only', () => {
    expect(isQaClaimId('DAL-QA-AI-001')).toBe(true);
    expect(isQaClaimId('DAL-QA-GALLERY-1789025793215')).toBe(true);
    expect(isQaClaimId('DAL-2026-0003')).toBe(false);
    expect(isQaClaimId('DAL-QA-')).toBe(false);
    expect(isQaClaimId('dal-qa-1')).toBe(false);
    expect(isQaClaimId(' DAL-QA-1 ')).toBe(true);
    expect(isQaClaimId('X-DAL-QA-1')).toBe(false);
    expect(isQaClaimId(undefined)).toBe(false);
  });

  it('keeps every customer gate off: QA access is the only opening', () => {
    const tools = readFileSync(resolve(root, 'supabase/functions/help-ai-chat/claimsTools.ts'), 'utf8');
    expect(tools).toContain('export const CLAIMS_CHAT_DOC_TEXT_TO_MODEL = false;');
    expect(tools).toContain('return CLAIMS_CHAT_DOC_TEXT_TO_MODEL || isQaClaimId(claimId);');
    // Every stored read passes the claim it belongs to.
    const calls = tools.match(/storedDocumentRead\([^)]*\)/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const c of calls.filter((c) => !c.includes('meta: unknown'))) expect(c).toContain('claimId');
    const job = readFileSync(resolve(root, 'supabase/functions/_shared/claimDocumentReadJob.ts'), 'utf8');
    expect(job).toContain('export const DOCUMENT_READ_CUSTOMER_DOCS = false;');
    expect(job).toContain("export const DOCUMENT_READ_OCR_PROVIDER: 'none' | 'gemini' = 'none';");
  });

  it('uses an OCR model that still exists', () => {
    expect(OCR_DEFAULT_MODEL).not.toMatch(/gemini-2\.5/);
  });
});
