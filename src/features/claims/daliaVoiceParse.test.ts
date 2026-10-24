import { describe, expect, it } from 'vitest';
import {
  digitRuns,
  extractName,
  extractPhone,
  extractPlate,
  isNoneAnswer,
  isNoPriceAnswer,
  parseCustomerType,
  parseFuel,
  parseHebrewNumber,
  parsePaymentMethod,
  parseSpokenLine,
  parseYesNo,
  pickFromList,
  splitMakeModel,
} from './daliaVoiceParse';

describe('parseHebrewNumber', () => {
  it.each([
    ['450', 450],
    ['מאה עשרים אלף', 120000],
    ['אלף וחמש מאות', 1500],
    ['שלושת אלפים ומאתיים', 3200],
    ['3 אלף', 3000],
    ['אלפיים', 2000],
    ['שבע מאות וחמישים', 750],
    ['חמש עשרה', 15],
    ['אלף וחצי', 1500],
    ['מאה ארבעים וחמש אלף', 145000],
    ['80 שקל', 80],
  ])('%s → %d', (text, value) => {
    expect(parseHebrewNumber(text)).toBe(value);
  });
  it('returns null when there is no number', () => {
    expect(parseHebrewNumber('אין לי מושג')).toBeNull();
  });
});

describe('phone and plate', () => {
  it('reads phones written or spoken digit by digit', () => {
    expect(extractPhone('052-1234567')).toBe('052-1234567');
    expect(extractPhone('0521234567')).toBe('052-1234567');
    expect(extractPhone('אפס חמש שתיים אחת שתיים שלוש ארבע חמש שש שבע')).toBe('052-1234567');
    expect(extractPhone('052 123 4567')).toBe('052-1234567');
    expect(extractPhone('+972521234567')).toBe('052-1234567');
    expect(extractPhone('03-5551234')).toBe('03-5551234');
  });
  it('rejects numbers that are not phones', () => {
    expect(extractPhone('12345')).toBeNull();
    expect(extractPhone('מספר לא ידוע')).toBeNull();
  });
  it('reads plates and never mistakes a phone for a plate', () => {
    expect(extractPlate('12-345-67')).toBe('1234567');
    expect(extractPlate('123 45 678')).toBe('12345678');
    expect(extractPlate('0521234567')).toBeNull();
    expect(extractPlate('אחת שתיים שלוש ארבע חמש שש שבע')).toBe('1234567');
    expect(extractPlate('אין')).toBeNull();
  });
  it('digitRuns keeps groups apart', () => {
    expect(digitRuns('רכב 1234567 טלפון 0521112222')).toEqual(['1234567', '0521112222']);
  });
});

describe('yes / no', () => {
  it.each([
    ['כן', 'yes'], ['כן תשמרי', 'yes'], ['אשר', 'yes'], ['בטח', 'yes'], ['יאללה', 'yes'], ['נכון', 'yes'],
    ['לא', 'no'], ['לא לשמור', 'no'], ['אל תשמרי', 'no'], ['ממש לא', 'no'], ['לא הגיע', 'no'], ['לא, תודה', 'no'],
  ])('%s → %s', (text, expected) => {
    expect(parseYesNo(text)).toBe(expected);
  });
  it('unclear answers are null', () => {
    expect(parseYesNo('אולי')).toBeNull();
    expect(parseYesNo('כן אבל לא עכשיו')).toBeNull();
    expect(parseYesNo('')).toBeNull();
  });
});

describe('field parsers', () => {
  it('fuel maps to the intake screen chips', () => {
    expect(parseFuel('חצי מיכל')).toBe('1/2');
    expect(parseFuel('רבע')).toBe('1/4');
    expect(parseFuel('שלושה רבעים')).toBe('3/4');
    expect(parseFuel('מלא')).toBe('מלא');
    expect(parseFuel('על רזרבה')).toBe('ריק');
    expect(parseFuel('לא בדקתי')).toBeNull();
  });
  it('names drop prefixes and digits', () => {
    expect(extractName('קוראים לו משה כהן')).toBe('משה כהן');
    expect(extractName('שם הלקוח הוא דנה לוי')).toBe('דנה לוי');
    expect(extractName('משה כהן 052-1234567')).toBe('משה כהן');
    expect(extractName('0521234567')).toBeNull();
  });
  it('customer type', () => {
    expect(parseCustomerType('חברה')).toBe('business');
    expect(parseCustomerType('זה עסק')).toBe('business');
    expect(parseCustomerType('פרטי')).toBe('private');
    expect(parseCustomerType('לא יודע')).toBeNull();
  });
  it('make and model', () => {
    expect(splitMakeModel('טויוטה קורולה 2018')).toEqual({ make: 'טויוטה', model: 'קורולה 2018' });
    expect(splitMakeModel('משהו לא מוכר')).toEqual({ make: '', model: 'משהו לא מוכר' });
  });
  it('payment method', () => {
    expect(parsePaymentMethod('באשראי')?.method).toBe('credit_card');
    expect(parsePaymentMethod('מזומן')?.label).toBe('מזומן');
    expect(parsePaymentMethod('ביט')?.method).toBe('bit');
    expect(parsePaymentMethod('משהו')).toBeNull();
  });
  it('none / no price answers', () => {
    expect(isNoneAnswer('זהו')).toBe(true);
    expect(isNoneAnswer('אין')).toBe(true);
    expect(isNoneAnswer('החלפת שמן')).toBe(false);
    expect(isNoPriceAnswer('בלי מחיר')).toBe(true);
  });
});

describe('parseSpokenLine (quote items)', () => {
  it.each([
    ['החלפת רפידות קדמיות 450 שקל', { name: 'החלפת רפידות קדמיות', qty: 1, price: 450 }],
    ['פילטר שמן כמות 2 במחיר 80', { name: 'פילטר שמן', qty: 2, price: 80 }],
    ['שני מגבים 60 שקל', { name: 'מגבים', qty: 2, price: 60 }],
    ['צבע לדלת אלף ומאתיים שקל', { name: 'צבע לדלת', qty: 1, price: 1200 }],
    ['יישור פח', { name: 'יישור פח', qty: 1, price: null }],
    ['4 צמיגים 350 שקל', { name: 'צמיגים', qty: 4, price: 350 }],
  ])('%s', (text, expected) => {
    expect(parseSpokenLine(text)).toEqual(expected);
  });
  it('a bare number is not an item', () => {
    expect(parseSpokenLine('450')).toBeNull();
  });
});

describe('pickFromList', () => {
  const labels = ['1. משה כהן · 052-1111111', '2. משה לוי · 054-2222222', '3. דנה כהן · 050-3333333'];
  it('by position', () => {
    expect(pickFromList('הראשון', labels)).toBe(0);
    expect(pickFromList('מספר 2', labels)).toBe(1);
    expect(pickFromList('השלישית', labels)).toBe(2);
  });
  it('by name or number fragment', () => {
    expect(pickFromList('דנה', labels)).toBe(2);
    expect(pickFromList('משה לוי', labels)).toBe(1);
    expect(pickFromList('2222222', labels)).toBe(1);
  });
  it('ambiguous → null', () => {
    expect(pickFromList('משה', labels)).toBeNull();
    expect(pickFromList('החמישי', labels)).toBeNull();
  });
});
