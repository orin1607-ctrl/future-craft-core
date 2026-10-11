import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ClaimDocsLibrary from './ClaimDocsLibrary';
import { readClaimDocument } from './claimDocumentRead';
import {
  DOCUMENT_READ_CRON_ENABLED,
  DOCUMENT_READ_CUSTOMER_DOCS,
  planClaimDocuments,
  planExistingDocument,
  prepareReadMessage,
  processStoredDocument,
  serverReadGate,
  type StoredClaimDoc,
} from '../../../supabase/functions/_shared/claimDocumentReadJob';

const root = process.cwd();

function doc(partial: Partial<StoredClaimDoc> & Pick<StoredClaimDoc, 'id' | 'claim_id'>): StoredClaimDoc {
  return {
    content_sha256: 'sha-1',
    storage_path: `${partial.claim_id}/gmail/file.pdf`,
    original_name: 'sample.pdf',
    mime_type: 'application/pdf',
    doc_meta: { staff_type: 'surveyor_report' },
    ...partial,
  };
}

describe('claim document read job', () => {
  it('keeps the server gate closed and does not schedule work', () => {
    expect(DOCUMENT_READ_CUSTOMER_DOCS).toBe(false);
    expect(DOCUMENT_READ_CRON_ENABLED).toBe(false);
    expect(serverReadGate()).toEqual({ cronEnabled: false, customerApproved: false, autorun: false, gemini: false });
    const edge = readFileSync(resolve(root, 'supabase/functions/claims-doc-read/index.ts'), 'utf8');
    expect(edge).toContain('customer_docs_not_approved');
    expect(edge).toContain('usfeoerkpcafxxlyuldl');
    expect(edge).not.toContain('cron.schedule');
    // The function reads the database now, but only for the internal scheduler and behind the switches.
    expect(edge).toContain('x-dalia-internal-key');
    expect(edge).toContain('CLAIMS_DOC_READ_ONLY_CLAIMS');
    expect(edge).not.toMatch(/generativelanguage|GEMINI_API_KEY|api\.anthropic|api\.openai/);
    const gmail = readFileSync(resolve(root, 'supabase/functions/claims-gmail/index.ts'), 'utf8');
    expect(gmail).toContain('read_status: "pending"');
    expect(gmail).not.toContain('processStoredDocument');
    expect(gmail).not.toContain('readClaimDocument');
  });

  it('prepares one claim without reading another claim or starting a scan', () => {
    const mine = doc({ id: 'doc-a', claim_id: 'claim-a' });
    const other = doc({ id: 'doc-b', claim_id: 'claim-b' });
    const closed = planClaimDocuments([mine, other], 'claim-a');
    expect(closed.ok).toBe(false);
    expect(closed.queued).toEqual([]);
    expect(closed.candidates).toEqual(['doc-a']);
    expect(closed.leftAlone).toEqual(['doc-b']);
    const opened = planClaimDocuments([mine, other], 'claim-a', { customerApproved: true });
    expect(opened.queued).toEqual(['doc-a']);
    expect(opened.leftAlone).toEqual(['doc-b']);
    const one = planExistingDocument(mine, 'claim-a', { customerApproved: true });
    expect(one.reason).toBe('queued');
    expect(one.doc.id).toBe('doc-a');
    expect(one.doc.storage_path).toBe(mine.storage_path);
    expect(one.doc.doc_meta?.read_status).toBe('pending');
    expect(one.doc.doc_meta?.staff_type).toBe('surveyor_report');
    expect(planExistingDocument(other, 'claim-a', { customerApproved: true }).reason).toBe('other_claim');
  });

  it('does not extract a file while customer reading is closed', async () => {
    const extract = vi.fn();
    const result = await processStoredDocument(doc({ id: 'doc-a', claim_id: 'claim-a' }), new Uint8Array([1]), extract);
    expect(result.reason).toBe('customer_not_approved');
    expect(result.extracted).toBe(false);
    expect(result.wrote).toBe(false);
    expect(extract).not.toHaveBeenCalled();
  });

  it('stores a text PDF on the same document and skips a second read', async () => {
    const bytes = new Uint8Array(readFileSync(resolve(root, 'docs/audit-reports/claims-doc-read-live-ocr-2026-10-11/samples/sample-text.pdf')));
    const row = doc({ id: 'doc-text', claim_id: 'CLAIM-SAMPLE', content_sha256: 'sample-text', original_name: 'DAL-2099-9999.pdf' });
    let calls = 0;
    const first = await processStoredDocument(row, bytes, async (input) => {
      calls += 1;
      return readClaimDocument({
        bytes: input.bytes,
        mimeType: input.mimeType,
        fileName: input.filename,
        claimId: input.claimId,
        sha256: input.contentSha256,
      });
    }, { customerApproved: true });
    expect(calls).toBe(1);
    expect(first.doc.id).toBe('doc-text');
    expect(first.doc.storage_path).toBe(row.storage_path);
    expect(first.doc.doc_meta?.staff_type).toBe('surveyor_report');
    expect(first.doc.doc_meta?.read_status).toBe('ready');
    expect(first.doc.doc_meta?.read_claim_nums).toContain('DAL-2026-2042');
    expect(first.doc.doc_meta?.read_plates).toContain('9000001');
    expect(first.doc.doc_meta?.read_claim_nums).not.toContain('2099');
    const second = await processStoredDocument(first.doc, bytes, async () => {
      calls += 1;
      throw new Error('should not read again');
    }, { customerApproved: true });
    expect(calls).toBe(1);
    expect(second.reason).toBe('already_read');
    expect(second.extracted).toBe(false);
  });

  it('records OCR failure and an empty file without inventing facts', async () => {
    const row = doc({ id: 'doc-a', claim_id: 'claim-a' });
    const crashed = await processStoredDocument(row, new Uint8Array([1, 2, 3]), async () => {
      throw new Error('ocr down');
    }, { customerApproved: true });
    expect(crashed.doc.id).toBe('doc-a');
    expect(crashed.doc.doc_meta?.read_status).toBe('failed');
    expect(crashed.doc.doc_meta?.read_text).toBe('');
    expect(JSON.stringify(crashed.doc.doc_meta)).not.toContain('DAL-');
    const empty = await processStoredDocument(row, new Uint8Array(), async () => {
      throw new Error('should not extract');
    }, { customerApproved: true });
    expect(empty.doc.doc_meta?.read_status).toBe('failed');
    expect(empty.extracted).toBe(false);
  });

  it('refuses a result that names another claim', async () => {
    const row = doc({ id: 'doc-a', claim_id: 'claim-a' });
    const result = await processStoredDocument(row, new Uint8Array([1]), async () => ({
      read_status: 'ready',
      read_sha: 'sha-1',
      read_claim_id: 'claim-b',
      read_summary: 'אסור',
      read_claim_nums: 'DAL-2026-2042',
    }), { customerApproved: true });
    expect(result.wrote).toBe(false);
    expect(result.reason).toBe('other_claim');
    expect(result.doc.doc_meta?.read_claim_nums).toBeUndefined();
  });

  it('shows a prepare action that does not read the file', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(
      <ClaimDocsLibrary
        files={[{ id: 'doc-a', original_name: 'scan.pdf', source: 'gmail', doc_meta: null }]}
        picked={[]}
        category="all"
        thumbs={{}}
        isImage={() => false}
        fileLabel={(f) => f.original_name}
        onCategory={() => undefined}
        onToggle={() => undefined}
        onToggleAll={() => undefined}
        onPreview={() => undefined}
        onDownload={() => undefined}
        onPrint={() => undefined}
        onShareTopic={() => undefined}
        onRename={() => undefined}
        onPrepareRead={(f) => prepareReadMessage({ id: f.id, claim_id: 'claim-a', content_sha256: 'sha-1' }, 'claim-a')}
      />,
    );
    fireEvent.click(screen.getByTestId('doc-read-prepare-doc-a'));
    expect(screen.getByTestId('doc-read-plan-doc-a').textContent).toContain('לא בוצעה עכשיו');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
