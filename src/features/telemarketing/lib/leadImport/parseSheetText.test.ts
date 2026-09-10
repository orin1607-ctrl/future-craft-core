import { describe, expect, it } from 'vitest';
import { applyColumnMapping, mappingIsComplete, suggestColumnMapping } from './mapColumns';
import { detectDelimiter, parseSheetText } from './parseSheetText';
import { MAX_LEAD_IMPORT_ROWS } from './types';
import { buildLeadImportPreview, phoneMatchKey } from './validateLeads';

const SAMPLE = [
  'מספר\tחברה\tתחום\tאזור\tצי רכב\tטלפון\tמייל',
  '1\tמערכות אשד\tבטיחות אש\tחולון\t25+\t03-5584555\tinfo@ashd.co.il',
  '2\tפייר אאוט\tכיבוי אש\t"ראשל""צ"\t20+\t03-9518818\toffice@fireout.co.il',
  '11\tקומסקו\t"צמ""ה ושירות"\tצור יגאל\t50\t09-7633222\tinfo@comasco.co.il',
  '16\tבלדי\tמזון והפצה\tמרכז\t45+\t1-800-300-300\tsales@baladi.co.il',
  '17\tמי עדן שירות\tטכנאים\tמרכז\t40+\t*5335\tservice@meyeden.co.il',
  '26\t"ד""ר ביוב"\tתשתיות\tמרכז\t20+\t1-800-25-26-27\tinfo@drbiuv.co.il',
  '29\tטורנדו שירות\tמיזוג אוויר\tמרכז\t50\t*5055\tservice@tornado.co.il',
  '',
  '',
].join('\n');

describe('parseSheetText', () => {
  it('detects Google Sheets tab paste and drops trailing empty rows', () => {
    expect(detectDelimiter(SAMPLE)).toBe('tab');
    const sheet = parseSheetText(SAMPLE);
    expect(sheet.headers).toEqual(['מספר', 'חברה', 'תחום', 'אזור', 'צי רכב', 'טלפון', 'מייל']);
    expect(sheet.pastedCount).toBe(7);
    expect(sheet.truncatedEmptyRows).toBe(2);
  });

  it('keeps Hebrew quotes, plus signs, stars and 1-800 as text', () => {
    const sheet = parseSheetText(SAMPLE);
    const mapping = suggestColumnMapping(sheet.headers);
    const rows = applyColumnMapping(sheet, mapping);
    expect(rows[1].region).toBe('ראשל"צ');
    expect(rows[2].industry).toBe('צמ"ה ושירות');
    expect(rows[5].company_name).toBe('ד"ר ביוב');
    expect(rows[0].fleet_size).toBe('25+');
    expect(rows[3].phone).toBe('1-800-300-300');
    expect(rows[4].phone).toBe('*5335');
    expect(phoneMatchKey(rows[0].phone).startsWith('0') || rows[0].phone.startsWith('0')).toBe(true);
    expect(rows[0].phone).toBe('03-5584555');
  });

  it('rejects oversized pastes without importing', () => {
    const header = 'מספר\tחברה';
    const lines = [header, ...Array.from({ length: MAX_LEAD_IMPORT_ROWS + 1 }, (_, i) => `${i + 1}\tחברה ${i}`)];
    expect(() => parseSheetText(lines.join('\n'))).toThrow(/יותר מדי שורות/);
  });
});

describe('mapping and validation', () => {
  it('auto-maps known Hebrew headers and leaves unknown columns unmapped', () => {
    const mapping = suggestColumnMapping(['מספר', 'חברה', 'הערה סודית', 'טלפון']);
    expect(mapping[0]).toBe('lead_number');
    expect(mapping[1]).toBe('company_name');
    expect(mapping[2]).toBe('');
    expect(mapping[3]).toBe('phone');
    expect(mappingIsComplete(mapping, 4)).toBe(false);
    expect(mappingIsComplete({ 0: 'lead_number', 1: 'company_name', 2: 'skip', 3: 'phone' }, 4)).toBe(true);
  });

  it('does not block a different company that shares a switchboard phone', () => {
    const preview = buildLeadImportPreview(
      [
        { rowIndex: 2, lead_number: '', company_name: 'אלפא', industry: '', region: '', fleet_size: '', phone: '03-1111111', email: '', extra: {} },
        { rowIndex: 3, lead_number: '', company_name: 'בטא', industry: '', region: '', fleet_size: '', phone: '03-1111111', email: '', extra: {} },
      ],
      { numbers: new Set(), companies: new Set(), phones: new Set(['031111111']), emails: new Set() },
    );
    expect(preview.willImportCount).toBe(2);
    expect(preview.issues.some((issue) => issue.kind === 'existing_phone')).toBe(true);
  });

  it('blocks an existing company name even when the phone differs', () => {
    const preview = buildLeadImportPreview(
      [{ rowIndex: 2, lead_number: '', company_name: 'עיריית חולון', industry: '', region: '', fleet_size: '', phone: '03-000', email: '', extra: {} }],
      { numbers: new Set(), companies: new Set(['עיריית חולון']), phones: new Set(), emails: new Set() },
    );
    expect(preview.willImportCount).toBe(0);
    expect(preview.issues.some((issue) => issue.kind === 'existing_company')).toBe(true);
  });

  it('flags existing and in-file duplicates without merging', () => {
    const sheet = parseSheetText(SAMPLE);
    const rows = applyColumnMapping(sheet, suggestColumnMapping(sheet.headers));
    const preview = buildLeadImportPreview(
      [...rows, { ...rows[0], rowIndex: 99, company_name: 'כפיל' }],
      {
        numbers: new Set(['1']),
        companies: new Set(),
        phones: new Set(['035584555']),
        emails: new Set(),
      },
    );
    expect(preview.issues.some((issue) => issue.kind === 'existing_number')).toBe(true);
    expect(preview.issues.some((issue) => issue.kind === 'duplicate_in_file_number')).toBe(true);
    expect(preview.willImportCount).toBeLessThan(preview.pastedCount);
  });
});
