import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APPROVED_QA_CLAIMS,
  isApprovedQaClaimId,
  isQaClaimId,
  isQaClaimRow,
} from '../../../supabase/functions/_shared/claimQaScope';
import { OCR_DEFAULT_MODEL } from '../../../supabase/functions/_shared/claimDocumentOcr';

const root = resolve(__dirname, '../../..');

describe('QA claim scope', () => {
  it('recognises the QA prefix only', () => {
    expect(isQaClaimId('DAL-QA-AI-001')).toBe(true);
    expect(isQaClaimId('DAL-2026-0003')).toBe(false);
    expect(isQaClaimId('DAL-QA-')).toBe(false);
    expect(isQaClaimId('dal-qa-1')).toBe(false);
    expect(isQaClaimId('X-DAL-QA-1')).toBe(false);
    expect(isQaClaimId(undefined)).toBe(false);
  });

  it('approves only the ids on the list in code, not every QA-looking id', () => {
    expect([...APPROVED_QA_CLAIMS]).toEqual(['DAL-QA-AI-001']);
    expect(isApprovedQaClaimId('DAL-QA-AI-001')).toBe(true);
    expect(isApprovedQaClaimId(' DAL-QA-AI-001 ')).toBe(true);
    // Older QA claims and claims made by the AI "test claim" onboarding are not approved.
    expect(isApprovedQaClaimId('DAL-QA-GALLERY-1789025793215')).toBe(false);
    expect(isApprovedQaClaimId('DAL-QA-AI-1791999999999')).toBe(false);
    expect(isApprovedQaClaimId('DAL-QA-AI-0010')).toBe(false);
    expect(isApprovedQaClaimId('DAL-2026-0003')).toBe(false);
  });

  it('needs the claim row itself marked QA and not deleted', () => {
    expect(isQaClaimRow({ isQa: 'true' })).toBe(true);
    expect(isQaClaimRow({ isQa: true })).toBe(true);
    expect(isQaClaimRow({})).toBe(false);
    expect(isQaClaimRow({ isQa: 'false' })).toBe(false);
    expect(isQaClaimRow({ isQa: 'true', deletedAt: '2026-10-15' })).toBe(false);
    expect(isQaClaimRow(null)).toBe(false);
  });

  it('keeps every customer gate off and checks all three conditions in both functions', () => {
    const tools = readFileSync(resolve(root, 'supabase/functions/help-ai-chat/claimsTools.ts'), 'utf8');
    expect(tools).toContain('export const CLAIMS_CHAT_DOC_TEXT_TO_MODEL = false;');
    expect(tools).toContain('if (!isApprovedQaClaimId(claimId)) return false;');
    expect(tools).toContain('return !!data && isQaClaimRow(data.row_data);');
    expect(tools).toContain('if (opts.contentAllowed !== true) {');
    // Every stored read gets the result of the async check, never the claim id alone.
    const calls = (tools.match(/storedDocumentRead\([^)]*\)/g) || []).filter((c) => !c.includes('meta: unknown'));
    expect(calls).toHaveLength(3);
    for (const c of calls) expect(c).toContain('contentAllowed');
    const read = readFileSync(resolve(root, 'supabase/functions/claims-doc-read/index.ts'), 'utf8');
    // One check for the schedule, on-demand reading and QA seeding: approved id AND claim row marked QA.
    expect(read).toContain('&& (!qaOnly || (isApprovedQaClaimId(c.id) && isQaClaimRow(c.row_data)));');
    expect(read).toContain('const live = new Set((claims || []).filter((c) => claimReadable(c))');
    expect(read).toContain('if (!claimRow || !claimReadable(claimRow');
    expect(read).toContain('if (!isApprovedQaClaimId(claimId)) return json({ ok: false, error: "not_an_approved_qa_claim" }, 403);');
    expect(read).toContain('if (!claimRow || !isQaClaimRow(claimRow.row_data)) return json({ ok: false, error: "claim_not_marked_qa" }, 403);');
    // The chat reads a document now only when content is allowed (approved QA), never for other claims.
    expect(tools).toContain('if (contentAllowed && !hasFinalRead(meta)) {');
    const job = readFileSync(resolve(root, 'supabase/functions/_shared/claimDocumentReadJob.ts'), 'utf8');
    expect(job).toContain('export const DOCUMENT_READ_CUSTOMER_DOCS = false;');
    expect(job).toContain("export const DOCUMENT_READ_OCR_PROVIDER: 'none' | 'gemini' = 'none';");
  });

  it('uses an OCR model that still exists', () => {
    expect(OCR_DEFAULT_MODEL).not.toMatch(/gemini-2\.5/);
  });
});
