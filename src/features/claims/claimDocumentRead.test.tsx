import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ClaimDocsLibrary from './ClaimDocsLibrary';
import {
  DOCUMENT_READ_AUTORUN,
  analyzeDocumentText,
  answerFromDocumentRead,
  belongsToClaim,
  documentReadCaption,
  mergeDocumentRead,
  pendingDocumentRead,
  readClaimDocument,
  readFromOcrText,
} from './claimDocumentRead';
import { matchIncomingMail } from '../../../supabase/functions/claims-gmail/matchIncoming.ts';

const HEBREW = `
דוח שמאי
מספר תביעה DAL-2026-0042
מספר רכב 12-345-67
תאריך 12/09/2026
סכום 1500 ₪
ההחלטה: אושר תשלום
חסר צילום רישיון
`;

function pdfWithText(text: string) {
  const stream = text.split('\n').map((line, index) => {
    const y = 720 - index * 18;
    return `BT /F1 12 Tf 40 ${y} Td (${line.replace(/[()\\]/g, '')}) Tj ET`;
  }).join('\n');
  const objects = [
    '1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj',
    '2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj',
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj',
    `4 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream\nendobj`,
    '5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(body.length);
    body += `${obj}\n`;
  }
  const xrefPos = body.length;
  let xref = 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i += 1) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  body += `${xref}trailer<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return new TextEncoder().encode(body);
}

describe('claim document reading', () => {
  it('keeps automatic reading off and marks a saved file as pending only', () => {
    expect(DOCUMENT_READ_AUTORUN).toBe(false);
    expect(pendingDocumentRead('abc123')).toEqual({ read_status: 'pending', read_sha: 'abc123' });
    const gmail = readFileSync(resolve(process.cwd(), 'supabase/functions/claims-gmail/index.ts'), 'utf8');
    expect(gmail).toContain('read_status: "pending"');
    expect(gmail).toContain('read_sha: digest');
    expect(gmail).not.toContain('readClaimDocument');
    expect(gmail).not.toContain('recognizeClaimImages');
  });

  it('reads a text PDF and ignores a claim number that exists only in the file name', async () => {
    const bytes = pdfWithText('Survey report\nClaim DAL-2026-0077\nPlate 98-765-43\nDate 01/10/2026\nAmount 250 NIS\nDecision approved');
    const read = await readClaimDocument({
      bytes,
      mimeType: 'application/pdf',
      fileName: 'DAL-2099-9999-secret.pdf',
      claimId: 'CLAIM-A',
      sha256: 'sha-en',
    });
    expect(read.read_status).toBe('ready');
    expect(read.read_source).toBe('pdf_text');
    expect(read.read_claim_nums).toContain('DAL-2026-0077');
    expect(read.read_claim_nums).not.toContain('DAL-2099-9999');
    expect(read.read_plates).toContain('9876543');
    expect(read.read_amounts).toContain('250');
    expect(read.read_doc_type).toBe('דוח שמאי');
    expect(read.read_insurer_decision.toLowerCase()).toContain('approved');
    expect(read.read_recommendation).toContain('ללא שינוי סטטוס');
  }, 15000);

  it('reads a scanned PDF through OCR and keeps the claim it was already attached to', async () => {
    const read = await readClaimDocument({
      bytes: pdfWithText(''),
      mimeType: 'application/pdf',
      fileName: 'scan.pdf',
      claimId: 'CLAIM-A',
      sha256: 'sha-scan',
      ocr: async () => HEBREW,
    });
    expect(read.read_status).toBe('ready');
    expect(read.read_source).toBe('ocr');
    expect(read.read_claim_id).toBe('CLAIM-A');
    expect(belongsToClaim(read, 'CLAIM-A')).toBe(true);
    expect(belongsToClaim(read, 'CLAIM-B')).toBe(false);
    expect(read.read_claim_nums).toBe('DAL-2026-0042');
    expect(read.read_plates).toBe('1234567');
    expect(read.read_dates).toContain('2026-09-12');
    expect(read.read_amounts).toContain('1500');
    expect(read.read_doc_type).toBe('דוח שמאי');
    expect(read.read_insurer_decision).toContain('אושר תשלום');
    expect(read.read_missing).toContain('חסר צילום רישיון');
    expect(read.read_evidence).toContain('אושר תשלום');
  }, 15000);

  it('reads a Hebrew image from OCR text', async () => {
    const read = await readClaimDocument({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/png',
      fileName: 'page.png',
      claimId: 'CLAIM-A',
      sha256: 'sha-he',
      ocr: async () => HEBREW,
    });
    expect(read.read_source).toBe('ocr');
    expect(read.read_summary).toContain('דוח שמאי');
    expect(read.read_claim_nums).toBe('DAL-2026-0042');
  });

  it('reads an English document and answers only from that text', async () => {
    const bytes = pdfWithText('Invoice\nClaim DAL-2026-0088\nPlate 11-222-33\nDate 02/10/2026\nAmount 80 NIS\nDecision declined\nMissing quote');
    const read = await readClaimDocument({
      bytes,
      mimeType: 'application/pdf',
      claimId: 'CLAIM-EN',
      sha256: 'sha-en-2',
    });
    expect(read.read_source).toBe('pdf_text');
    expect(read.read_doc_type).toBe('חשבונית');
    const amount = answerFromDocumentRead('what is the amount?', read);
    expect(amount.answer).toContain('80');
    expect(amount.source).toContain('טקסט מתוך ה-PDF');
    const absent = answerFromDocumentRead('מה מספר הטלפון?', read);
    expect(absent.answer).toContain('לא מופיע במסמך');
  }, 15000);

  it('marks an unreadable file and does not invent details', async () => {
    const read = await readClaimDocument({
      bytes: new Uint8Array([9, 9, 9]),
      mimeType: 'image/jpeg',
      fileName: 'DAL-2026-0042.jpg',
      claimId: 'CLAIM-A',
      sha256: 'sha-blank',
      ocr: async () => '   ',
    });
    expect(read.read_status).toBe('unreadable');
    expect(read.read_source).toBe('none');
    expect(read.read_text).toBe('');
    expect(read.read_claim_nums).toBe('לא מופיע במסמך');
    expect(JSON.stringify(read)).not.toContain('DAL-2026-0042');
    const answer = answerFromDocumentRead('מה הסכום?', read);
    expect(answer.answer).toContain('אינה קריאה');
    expect(answer.source).toContain('לא נוסף מידע');
  });

  it('does not analyze the same fingerprint twice', async () => {
    const first = analyzeDocumentText(HEBREW, 'ocr', 'CLAIM-A', 'sha-same');
    const ocr = vi.fn(async () => HEBREW);
    const again = await readClaimDocument({
      bytes: new Uint8Array(),
      mimeType: 'application/pdf',
      claimId: 'CLAIM-A',
      sha256: 'sha-same',
      existingMeta: first,
      ocr,
    });
    expect(again.read_text).toBe(first.read_text);
    expect(ocr).not.toHaveBeenCalled();
  });

  it('keeps only labeled facts from a dense document and drops uncertain OCR', () => {
    const dense = `
הערות 11111111
מספר תביעה DAL-2026-2042
רכב 90-000-01
תאריך 12/09/2026
סכום 1500 ₪
קוד 22222222
אושר
`;
    const read = analyzeDocumentText(dense, 'ocr', 'CLAIM-A', 'sha-dense');
    expect(read.read_claim_nums).toBe('DAL-2026-2042');
    expect(read.read_plates).toBe('9000001');
    expect(read.read_amounts).toBe('1500');
    expect(read.read_dates).toContain('2026-09-12');
    expect(read.read_plates).not.toContain('11111111');
    expect(read.read_plates).not.toContain('22222222');
    expect(read.read_plate_src).toContain('90-000-01');
    expect(read.read_amount_src).toContain('1500');
    const garbled = analyzeDocumentText('2 תביעה\nסימנים לא ברורים', 'ocr', 'CLAIM-A', 'sha-garbled');
    expect(garbled.read_claim_nums).toBe('לא מופיע במסמך');
    expect(garbled.read_plates).toBe('לא מופיע במסמך');
    expect(garbled.read_amounts).toBe('לא מופיע במסמך');
    const unsure = readFromOcrText(HEBREW, 20, 'CLAIM-A', 'sha-unsure');
    expect(unsure.read_status).toBe('unreadable');
    expect(unsure.read_summary).toContain('לא ודאי');
    expect(JSON.stringify(unsure)).not.toContain('DAL-2026-0042');
    const screen = readFileSync(resolve(process.cwd(), 'src/features/claims/ClaimsScreen.tsx'), 'utf8');
    expect(screen).toContain('documentReadCaption');
    expect(screen).not.toContain('readClaimDocument');
    expect(screen).not.toContain('useBuiltinOcr');
  });

  it('keeps mail matching on the claim number and does not retarget the document', () => {
    const match = matchIncomingMail(
      { messageId: 'm1', subject: 'DAL-2026-0042', body: 'מסמך מצורף' },
      [
        { id: 'CLAIM-A', claimNum: 'DAL-2026-0042' },
        { id: 'CLAIM-B', claimNum: 'DAL-2026-0099', plate: '1234567' },
      ],
    );
    expect(match).toMatchObject({ decision: 'auto', claimId: 'CLAIM-A', via: 'claim_number' });
    const read = analyzeDocumentText(HEBREW, 'pdf_text', match.claimId || '', 'sha-match');
    expect(belongsToClaim(read, 'CLAIM-A')).toBe(true);
    expect(belongsToClaim(read, 'CLAIM-B')).toBe(false);
  });

  it('shows the summary, extracted details, and the source on the claim document', () => {
    const read = analyzeDocumentText(HEBREW, 'ocr', 'CLAIM-A', 'sha-ui');
    const caption = documentReadCaption(read);
    expect(caption?.summary).toContain('דוח שמאי');
    expect(caption?.details).toContain('1500');
    expect(caption?.details).toContain('המלצה למשתמש בלבד');
    expect(caption?.source).toContain('OCR');
    expect(caption?.source).toContain('אושר תשלום');
    expect(caption?.details).toContain('מקור:');
    const plate = answerFromDocumentRead('מה מספר הרכב?', read);
    expect(plate.answer).toContain('1234567');
    expect(plate.source).toContain('12-345-67');
  });

  it('stores the read on the same document and refuses another claim', async () => {
    const read = analyzeDocumentText(HEBREW, 'ocr', 'CLAIM-A', 'sha-ui');
    const saved = mergeDocumentRead({
      id: 'DOC-1',
      claim_id: 'CLAIM-A',
      storage_path: 'CLAIM-A/gmail/m1/file.pdf',
      doc_meta: { staff_type: 'surveyor_report' },
    }, read);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.row.id).toBe('DOC-1');
    expect(saved.row.storage_path).toBe('CLAIM-A/gmail/m1/file.pdf');
    expect(saved.row.doc_meta?.staff_type).toBe('surveyor_report');
    expect(saved.row.doc_meta?.read_amounts).toContain('1500');
    expect(mergeDocumentRead({ id: 'DOC-1', claim_id: 'CLAIM-B' }, read).ok).toBe(false);
    const leaked = await readClaimDocument({
      bytes: new Uint8Array(),
      mimeType: 'application/pdf',
      claimId: 'CLAIM-B',
      sha256: 'sha-ui',
      existingMeta: read,
    });
    expect(leaked.read_claim_id).toBe('CLAIM-B');
    expect(leaked.read_text).not.toContain('DAL-2026-0042');
    render(
      <ClaimDocsLibrary
        files={[{ id: 'DOC-1', original_name: 'sample.pdf', mime_type: 'application/pdf', source: 'gmail', doc_meta: read }]}
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
      />,
    );
    const note = screen.getByTestId('doc-read-DOC-1');
    expect(note.textContent).toContain('סיכום');
    expect(note.textContent).toContain('1500');
    expect(note.textContent).toContain('מקור');
  });
});
