import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The officer's signature closes the inspection form: it is drawn after every
 * other section, in the PDF (download / print) and on the inspection screen.
 */
describe('officer signature placement', () => {
  it('PDF: the signature block comes after notes, defects, items and tasks', () => {
    const src = readFileSync('src/lib/triInspectionFormPdf.ts', 'utf8');
    const at = (needle: string) => {
      const i = src.indexOf(needle);
      expect(i, needle).toBeGreaterThan(0);
      return i;
    };
    const signature = at("heading('חתימת קצין הרכב')");
    expect(signature).toBeGreaterThan(at("heading('פרטי הביקורת')"));
    expect(signature).toBeGreaterThan(at("'הערות הביקורת'"));
    expect(signature).toBeGreaterThan(at('תקלות שסומנו'));
    expect(signature).toBeGreaterThan(at("heading('סעיפי הבדיקה')"));
    expect(signature).toBeGreaterThan(at("heading('משימות טיפול שנפתחו מהביקורת')"));
    expect(signature).toBeLessThan(at('const pdf = wrapJpegsAsPdf'));
    expect(src.match(/heading\('חתימת קצין הרכב'\)/g)).toHaveLength(1);
  });

  it('PDF: heading and signature box are placed as one block (no page split)', () => {
    const src = readFileSync('src/lib/triInspectionFormPdf.ts', 'utf8');
    const block = src.slice(src.indexOf('if (form.signatureSrc && signature)'));
    expect(block.indexOf('need(SIGNATURE_BLOCK_H)')).toBeGreaterThan(0);
    expect(block.indexOf('need(SIGNATURE_BLOCK_H)')).toBeLessThan(block.indexOf("heading('חתימת קצין הרכב')"));
  });

  it('screen: the signature card is the last section of the inspection', () => {
    const src = readFileSync('src/pages/VehicleInspections.tsx', 'utf8');
    const signature = src.indexOf('data-testid="inspection-signature"');
    expect(signature).toBeGreaterThan(src.indexOf('סעיפי הבדיקה'));
    expect(signature).toBeGreaterThan(src.indexOf('משימות טיפול שנפתחו מהביקורת'));
    expect(src.slice(signature - 120, signature)).toContain('break-inside-avoid');
  });
});
