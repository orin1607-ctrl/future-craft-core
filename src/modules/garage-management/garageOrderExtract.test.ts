import { describe, expect, it } from 'vitest';
import { extractCustomerOrderDocument, extractCustomerOrderFields, extractNote, extractPlateHint } from './garageOrderExtract';

const sample = `
הזמנת עבודה
לקוח: חברת צי QA
איש קשר: רותי
מספר הזמנה: 88900123
מספר תיק / אסמכתא: TK-4421
תאריך הזמנה: 12/09/2026
לוחית: 12-345-67
`;

function pdfWithText(text: string) {
  const stream = `BT /F1 12 Tf 40 700 Td (${text.replace(/[()\\]/g, '')}) Tj ET`;
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
  for (let i = 1; i <= 5; i += 1) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += `${xref}trailer<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return new TextEncoder().encode(body);
}

describe('garage customer-order extract', () => {
  it('reads order number, case/ref and date from document text', () => {
    const fields = extractCustomerOrderFields(sample);
    expect(fields.order_number).toBe('88900123');
    expect(fields.case_ref).toBe('TK-4421');
    expect(fields.order_date).toBe('12/09/2026');
  });

  it('does not treat a filename argument as document content', () => {
    expect(extractCustomerOrderFields('')).toEqual({
      order_number: '',
      case_ref: '',
      order_date: '',
    });
    expect(extractCustomerOrderFields('invoice-scan.jpg')).toEqual({
      order_number: '',
      case_ref: '',
      order_date: '',
    });
  });

  it('does not extract the customer name from the order', () => {
    const fields = extractCustomerOrderFields(sample);
    expect(JSON.stringify(fields)).not.toMatch(/חברת צי/);
    expect(JSON.stringify(fields)).not.toMatch(/רותי/);
    expect(Object.keys(fields).sort()).toEqual(['case_ref', 'order_date', 'order_number']);
  });

  it('exposes a plate hint for worker verification without putting it in saved fields', () => {
    expect(extractPlateHint(sample)).toMatch(/12-345-67|1234567/);
    expect(Object.keys(extractCustomerOrderFields(sample))).not.toContain('plate');
  });

  it('normalizes ISO dates and ignores unlabeled noise', () => {
    const fields = extractCustomerOrderFields('Order Number 5510\nOrder Date 2026-09-12\nupdate 01/01/2020');
    expect(fields.order_number).toBe('5510');
    expect(fields.order_date).toBe('12/09/2026');
  });

  it('describes the real source without claiming filename extraction', () => {
    const note = extractNote('pdf_text', {
      order_number: '1',
      case_ref: '',
      order_date: '12/09/2026',
    });
    expect(note).toContain('חולץ מטקסט המסמך');
    expect(note).not.toContain('שם הקובץ');
    expect(extractNote('ocr', { order_number: '', case_ref: '', order_date: '' })).toContain('OCR');
    expect(extractNote('none', { order_number: '', case_ref: '', order_date: '' })).toContain('לא משתמשים בשם הקובץ');
  });

  it('reads a text PDF and ignores the filename', async () => {
    const bytes = pdfWithText('Order Number 88900123 File Number TK-4421 Order Date 12/09/2026');
    const res = await extractCustomerOrderDocument({
      bytes,
      mimeType: 'application/pdf',
      fileName: 'order-PO-8821-from-filename.pdf',
    });
    expect(res.source).toBe('pdf_text');
    expect(res.fields.order_number).toBe('88900123');
    expect(res.fields.case_ref).toBe('TK-4421');
    expect(res.fields.order_date).toBe('12/09/2026');
    expect(res.fields.order_number).not.toBe('8821');
    expect(res.note).toContain('חולץ מטקסט המסמך');
  }, 15000);
});
