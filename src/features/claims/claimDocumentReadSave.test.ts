import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { documentReadCaption } from './claimDocumentRead';
import { prepareSelectedDocumentRead } from './claimDocumentReadSave';
import { applyStoredReadMeta } from '../../../supabase/functions/_shared/claimDocumentReadJob';

const root = process.cwd();
const sample = new Uint8Array(readFileSync(resolve(root, 'docs/audit-reports/claims-doc-read-live-ocr-2026-10-11/samples/sample-text.pdf')));

describe('save one selected document read', () => {
  it('saves a sample PDF on the same meta and reads the summary back', async () => {
    const prev = { staff_type: 'surveyor_report', staff_title: 'דוח שמאי', staff_note: 'נשאר' };
    const save = vi.fn(async (patch: Record<string, string>) => ({ success: true, doc_meta: { ...prev, ...patch } }));
    const first = await prepareSelectedDocumentRead({
      claimId: 'CLAIM-SAMPLE',
      fileName: 'DAL-2099-9999.pdf',
      mimeType: 'application/pdf',
      existingMeta: prev,
      bytes: sample,
      sha256: 'sample-text',
      save,
    });
    expect(first.saved).toBe(true);
    expect(first.meta?.staff_type).toBe('surveyor_report');
    expect(first.meta?.staff_title).toBe('דוח שמאי');
    expect(first.meta?.staff_note).toBe('נשאר');
    expect(first.meta?.read_status).toBe('ready');
    expect(first.meta?.read_claim_nums).toContain('DAL-2026-2042');
    expect(first.meta?.read_claim_nums).not.toContain('2099');
    expect(first.meta?.read_plates).toContain('9000001');
    expect(save).toHaveBeenCalledTimes(1);
    const patch = save.mock.calls[0][0];
    expect(patch.staff_type).toBeUndefined();
    expect(patch.read_claim_id).toBe('CLAIM-SAMPLE');
    const caption = documentReadCaption(first.meta);
    expect(caption?.summary).toContain('סיכום');
    expect(caption?.source).toContain('PDF');
    expect(caption?.details).toContain('1500');

    const second = await prepareSelectedDocumentRead({
      claimId: 'CLAIM-SAMPLE',
      fileName: 'DAL-2099-9999.pdf',
      mimeType: 'application/pdf',
      existingMeta: first.meta,
      bytes: sample,
      sha256: 'sample-text',
      save,
    });
    expect(second.saved).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
    expect(second.meta?.read_text).toBe(first.meta?.read_text);
  });

  it('keeps a previous analysis when a later read fails or names another claim', () => {
    const prev = {
      staff_type: 'surveyor_report',
      read_status: 'ready',
      read_sha: 'sample-text',
      read_claim_id: 'CLAIM-SAMPLE',
      read_summary: 'סיכום קודם',
      read_text: 'תביעה DAL-2026-2042',
      read_source: 'pdf_text',
    };
    const failed = applyStoredReadMeta(prev, {
      read_status: 'failed',
      read_sha: 'sample-text',
      read_claim_id: 'CLAIM-SAMPLE',
      read_source: 'none',
      read_summary: 'הקריאה נכשלה',
      read_text: '',
    }, 'CLAIM-SAMPLE');
    expect(failed.ok).toBe(true);
    if (!failed.ok) return;
    expect(failed.changed).toBe(false);
    expect(failed.meta.read_status).toBe('ready');
    expect(failed.meta.read_text).toContain('DAL-2026-2042');
    expect(failed.meta.staff_type).toBe('surveyor_report');
    const other = applyStoredReadMeta(prev, {
      read_status: 'ready',
      read_sha: 'other',
      read_claim_id: 'CLAIM-OTHER',
      read_source: 'pdf_text',
      read_summary: 'אסור',
      read_text: 'DAL-2026-0002',
    }, 'CLAIM-SAMPLE');
    expect(other.ok).toBe(false);
    const docs = readFileSync(resolve(root, 'supabase/functions/claims-docs/index.ts'), 'utf8');
    expect(docs).toContain('applyStoredReadMeta');
    expect(docs).toContain('.eq("id", fileId).eq("claim_id", claimId)');
    expect(docs).toContain('update({ doc_meta: readApplied.meta })');
    expect(docs).toContain('if (staffTouched || !hasRead)');
    const screen = readFileSync(resolve(root, 'src/features/claims/ClaimsScreen.tsx'), 'utf8');
    expect(screen).toContain('prepareSelectedDocumentRead');
    expect(screen).not.toContain('readClaimDocument');
    expect(screen).not.toContain('useBuiltinOcr');
  });
});
