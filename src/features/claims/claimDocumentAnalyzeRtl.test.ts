// Fictitious text only. Hebrew PDFs often come out of the text layer in visual order.
import { describe, expect, it } from 'vitest';
import { NOT_IN_DOC, analyzeDocumentText } from '../../../supabase/functions/_shared/claimDocumentAnalyze';

const read = (text: string) => analyzeDocumentText(text, 'pdf_text', 'DAL-QA-AI-001', 'sha');

// The lines exactly as the fictitious survey PDF printed by a browser comes out of pdf.js.
const VISUAL_ORDER = [
  'דוח שמאי',
  'QA-AI-001 מספר תביעה:',
  '99-002-18 מספר רכב:',
  '02/10/2026 תאריך בדיקה:',
  '₪ לפני מע"מ.',
  '3,850 הערכת נזק:',
  '.₪ 0 ירידת ערך:',
  'חסרים בתיק: רישיון נהיגה של הנהג.',
].join('\n');

describe('document reading: Hebrew text in either order', () => {
  it('finds the amount and the insurer claim number when the PDF is in visual order', () => {
    const r = read(VISUAL_ORDER);
    expect(r.read_amounts).toBe('3,850');
    expect(r.read_amount_src).toContain('3,850 הערכת נזק');
    expect(r.read_claim_nums).toBe('QA-AI-001');
    expect(r.read_claim_src).toBe('QA-AI-001 מספר תביעה:');
    expect(r.read_doc_type).toBe('דוח שמאי');
    expect(r.read_dates).toBe('2026-10-02');
  });

  it('reads the logical order too, and the currency on either side', () => {
    const r = read('חשבונית מס\nתביעה מספר: 4471-22\nסה"כ לתשלום: 4,543.00 ₪\nTotal NIS 4,543.00');
    expect(r.read_amounts).toBe('4,543.00');
    expect(r.read_claim_nums).toBe('4471-22');
  });

  it('keeps DAL claim ids', () => {
    expect(read('נושא: DAL-2026-0013\nסכום: 1,200').read_claim_nums).toBe('DAL-2026-0013');
  });

  it('does not invent: unlabeled numbers, zero, years and phone numbers are not amounts or claim numbers', () => {
    const r = read('מכתב כללי\nטלפון 050-1234567\nשנת ייצור 2019\nירידת ערך: 0 ₪\nמספר פוליסה 778899');
    expect(r.read_amounts).toBe(NOT_IN_DOC);
    expect(r.read_claim_nums).toBe(NOT_IN_DOC);
    expect(r.read_amount_src).toBe('');
  });

  it('needs a digit in a claim number next to the label', () => {
    expect(read('מספר תביעה: בטיפול').read_claim_nums).toBe(NOT_IN_DOC);
  });
});
