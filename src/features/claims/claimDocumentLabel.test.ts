import { describe, expect, it } from 'vitest';
import {
  UNKNOWN_DOC_TYPE,
  classifyDocumentText,
  documentDisplayTitle,
  documentLabel,
  senderFromText,
} from '../../../supabase/functions/_shared/claimDocumentLabel';
import { analyzeDocumentText } from './claimDocumentRead';

describe('classifyDocumentText', () => {
  it.each([
    ['דו"ח שמאי\nרכב 12-345-67', 'דוח שמאי'],
    ['Survey report\nPlate 11-222-33', 'דוח שמאי'],
    ['חשבונית מס 1044\nתיקון פחחות וצבע', 'חשבונית תיקון'],
    ['Invoice\nClaim DAL-2026-0088\nMissing quote', 'חשבונית'],
    ['הצעת מחיר לתיקון הרכב', 'הצעת מחיר'],
    ['אישור תשלום\nהועברו 4,500 ש"ח', 'אישור תשלום'],
    ['דרישת תשלום בגין נזק לרכב', 'דרישת תשלום'],
    ['אישור כיסוי ביטוחי לרכב', 'אישור כיסוי ביטוחי'],
    ['אישור מוסך על סיום התיקון', 'אישור מוסך'],
    ['רישיון רכב\nמשרד התחבורה', 'רישיון רכב'],
    ['טופס הודעה על תאונת דרכים', 'טופס תביעה'],
    ['כתב תביעה\nבית משפט השלום', 'מסמך משפטי'],
    ['הראל חברה לביטוח\nמחלקת תביעות\nהנדון: פנייתך', 'מכתב חברת ביטוח'],
  ])('%s → %s', (text, expected) => {
    expect(classifyDocumentText(text)).toBe(expected);
  });

  it('prefers the specific type over an insurer letterhead', () => {
    expect(classifyDocumentText('מגדל חברה לביטוח\nדוח שמאי סופי')).toBe('דוח שמאי');
  });

  it('marks unclear text for review instead of guessing', () => {
    expect(classifyDocumentText('שלום, מצורף הקובץ')).toBe(UNKNOWN_DOC_TYPE);
    expect(classifyDocumentText('')).toBe(UNKNOWN_DOC_TYPE);
  });
});

describe('senderFromText', () => {
  it('finds an insurer by whole word, with the source line', () => {
    expect(senderFromText('הפניקס חברה לביטוח\nאישור תשלום')).toEqual({ sender: 'הפניקס', source: 'הפניקס חברה לביטוח' });
  });

  it('does not treat a common word as an insurer', () => {
    expect(senderFromText('בכלל לא צוין מבטח').sender).toBe('');
  });

  it('falls back to a From line and leaves unknown empty', () => {
    expect(senderFromText('מאת: מוסך הדר\nהצעת מחיר').sender).toBe('מוסך הדר');
    expect(senderFromText('מסמך ללא שולח').sender).toBe('');
  });
});

describe('documentLabel', () => {
  it('builds a Hebrew title and description from a stored read', () => {
    const read = analyzeDocumentText(
      'הראל חברה לביטוח\nדוח שמאי\nמספר רכב 12-345-67\nתאריך 05/09/2026\nסכום 12,400 ש"ח',
      'pdf_text',
      'C1',
      'sha1',
    );
    const label = documentLabel(read);
    expect(label?.status).toBe('ready');
    expect(label?.docType).toBe('דוח שמאי');
    expect(label?.title).toBe('דוח שמאי – רכב 1234567');
    expect(label?.description).toContain('מאת הראל');
    expect(label?.description).toContain('12,400');
    expect(label?.needsReview).toBe(false);
  });

  it('does not show facts that are not in the document', () => {
    const read = analyzeDocumentText('הצעת מחיר לתיקון פגוש קדמי', 'pdf_text', 'C1', 'sha2');
    const label = documentLabel(read);
    expect(label?.title).toBe('הצעת מחיר');
    expect(label?.description).toBe('הצעת מחיר');
  });

  it('marks unknown and unreadable documents for review', () => {
    const unknown = documentLabel(analyzeDocumentText('שלום, מצורף הקובץ ששלחתם אתמול', 'ocr', 'C1', 'sha3'));
    expect(unknown?.title).toBe(UNKNOWN_DOC_TYPE);
    expect(unknown?.statusLabel).toBe('דורש בדיקה');
    expect(documentLabel({ read_status: 'unreadable' })?.needsReview).toBe(true);
  });

  it('reclassifies older reads saved with the previous unknown text', () => {
    const label = documentLabel({ read_status: 'ready', read_doc_type: 'לא זוהה סוג מתוכן המסמך', read_text: 'אישור כיסוי ביטוחי' });
    expect(label?.docType).toBe('אישור כיסוי ביטוחי');
  });

  it('reports pending, processing and failed without a title', () => {
    expect(documentLabel({ read_status: 'pending' })).toMatchObject({ statusLabel: 'ממתין לקריאה', title: '' });
    expect(documentLabel({ read_status: 'processing' })).toMatchObject({ statusLabel: 'בעיבוד', title: '' });
    expect(documentLabel({ read_status: 'failed' })).toMatchObject({ statusLabel: 'הקריאה נכשלה', needsReview: true });
    expect(documentLabel({})).toBeNull();
  });
});

describe('documentDisplayTitle', () => {
  const read = { read_status: 'ready', read_doc_type: 'חשבונית', read_plates: '11-222-33', read_text: 'Invoice' };

  it('keeps the manual title first', () => {
    expect(documentDisplayTitle({ original_name: 'a.pdf', doc_meta: { ...read, staff_title: 'חשבונית מוסך יוני' } })).toBe('חשבונית מוסך יוני');
  });

  it('uses the read title second and the file name last', () => {
    expect(documentDisplayTitle({ original_name: 'a.pdf', doc_meta: read })).toBe('חשבונית – רכב 11-222-33');
    expect(documentDisplayTitle({ original_name: 'a.pdf', doc_meta: { read_status: 'pending' } })).toBe('a.pdf');
    expect(documentDisplayTitle({ original_name: 'a.pdf', doc_meta: null })).toBe('a.pdf');
  });
});
