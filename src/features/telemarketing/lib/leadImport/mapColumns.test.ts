import { describe, expect, it } from 'vitest';
import { applyColumnMapping, suggestColumnMapping } from './mapColumns';
import { parseSheetText } from './parseSheetText';

const REORDERED = [
  'מייל\tטלפון\tחברה\tמספר\tצי רכב',
  'a@b.co.il\t03-1111111\tחברה א\t88\t40+',
].join('\n');

describe('column order independence', () => {
  it('maps by header name, not position', () => {
    const sheet = parseSheetText(REORDERED);
    const rows = applyColumnMapping(sheet, suggestColumnMapping(sheet.headers));
    expect(rows[0].company_name).toBe('חברה א');
    expect(rows[0].lead_number).toBe('88');
    expect(rows[0].fleet_size).toBe('40+');
    expect(rows[0].phone).toBe('03-1111111');
  });

  it('maps Dalia CSV Hebrew headers including estimated fleet size', () => {
    const sheet = parseSheetText('שם החברה,עיר/אזור,טלפון,מייל (כללי/שירות),כמות רכבים מוערכת\nאלפא,נתניה,03-111,info@a.co.il,8+');
    const rows = applyColumnMapping(sheet, suggestColumnMapping(sheet.headers));
    expect(rows[0].company_name).toBe('אלפא');
    expect(rows[0].region).toBe('נתניה');
    expect(rows[0].phone).toBe('03-111');
    expect(rows[0].email).toBe('info@a.co.il');
    expect(rows[0].fleet_size).toBe('8+');
  });
});
