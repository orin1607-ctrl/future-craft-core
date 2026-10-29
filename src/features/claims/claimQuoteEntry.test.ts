import { describe, expect, it } from 'vitest';
import { ALL_CATEGORIES, PART_TYPES } from './claimQuoteModel';
import {
  QUOTE_CATEGORY_LABELS,
  describeQuoteEntry,
  entryWorkAmount,
  planQuoteEntry,
  resolvePartType,
  resolveQuoteCategory,
} from '../../../supabase/functions/_shared/claimQuoteEntry';

// The garage quote the owner gave for the staging test (shortened only where it repeats).
const QUOTE = `הצעת מחיר לתיקון רכב – מוסך יוני
מספר רכב: 84488901
1. עבודות פחחות
1. פירוק והרכבת פגוש – 3 שעות.
2. החלפת כנף קדמית שמאל – 3 שעות.
3. תיקון פחחות דלת קדמית – 2 שעות.
4. פירוק והרכבת סף פלסטיק כולל שיפוץ – 2 שעות.
5. תיקון פחחות סף תחתון מברזל כולל יישור – 1.5 שעות.
6. מתיחת שלדה ויישור דופן צד שמאל – 2.5 שעות.
7. החלפת פנס ויישור פח משקף – 1.5 שעות.
סה"כ עבודות פחחות: 15.5 שעות.
2. עבודות צבע
יש להפעיל את מחשבון הצבע האוטומטי הקיים במערכת בהתאם לחלקי המרכב המעורבים בתיקון.
3. עבודות חשמל
1. עבודות חשמל ותיקון – 0.8 שעות.
מחיר: 350 ₪.
4. עבודות מכונאות
1. החלפת מסרק הגה, כולל פירוק מסרק ההגה ופירוק הגשר התחתון – 2.5 שעות.
2. החלפת יחידת הגה כוח חשמלית, כולל מחשב בקרת ההיגוי – 2.5 שעות.
3. החלפת תפוח הגה – 1.5 שעות.
סה"כ עבודות מכונאות: 6.5 שעות.
5. כיוון פרונט
כיוון זוויות היגוי ומתלה קדמי באמצעות מכשור לכיוון פרונט.
מחיר גלובלי: 420 ₪.
6. תקנה
סעיף תקנה.
מחיר גלובלי: 1,250 ₪.
7. עבודות פנצ'רמאכר
פירוק גלגל מהרכב, פירוק ובדיקת החישוק הישן שניזוק וקביעת אי-תקינותו.
זמן עבודה: 1.2 שעות.
8. כיול מחשב הגה חשמלי
כיול ותכנות יחידת הבקרה של מערכת הגה הכוח החשמלי – EPS ECU, באמצעות מחשב דיאגנוסטיקה.
מחיר גלובלי: 470 ₪.
9. אבחון וכיול כללי של מחשבי הרכב
סריקה, אבחון, תכנות וכיול כללי של מערכות הבקרה האלקטרוניות ברכב.
מחיר גלובלי: 1,200 ₪.
10. הכנת רכב חשמלי לעבודה – נוהל בטיחות מתח גבוה
מחיר גלובלי: 980 ₪.
11. חלקי חילוף
1| תומך שפם לפנס ראשי שמאל| מקורי| להשלמה
2| פנס ראשי שמאל LED| משומש| להשלמה
3| מסרק הגה| מקורי| להשלמה
4| תפוח הגה| טרם נקבע| להשלמה
7| ביטנה קדמית שמאל| חליפית| להשלמה
9| מגן קדמי חיצוני| מקורי חדש| להשלמה
12| יחידת הגה כוח חשמלית (EPS)| טרם נקבע| להשלמה
13| מחשב בקרת מערכת ההיגוי החשמלית (EPS ECU)| טרם נקבע| להשלמה
14| קליפסים, תפסני חיבור וחומרי עזר להרכבת חלקי מרכב| חומרי עזר| להשלמה
12. רכב חלופי
אספקת רכב חלופי לתקופת תיקון הרכב.
- כמות: 4 ימים.
- מחיר ליום: 180 ₪.
- סה"כ: 720 ₪.
סה"כ שעות עבודה שנרשמו: 24 שעות.
סה"כ חיובים עם סכומים ידועים: 5,390 ₪ לפני מע"מ.`;

// What the model proposes after reading it.
const MODEL = {
  works: [
    { section: 'עבודות פחחות', label: 'פירוק והרכבת פגוש', hours: 3 },
    { section: 'עבודות פחחות', label: 'החלפת כנף קדמית שמאל', hours: 3 },
    { section: 'עבודות פחחות', label: 'תיקון פחחות דלת קדמית', hours: 2 },
    { section: 'עבודות פחחות', label: 'פירוק והרכבת סף פלסטיק כולל שיפוץ', hours: 2 },
    { section: 'עבודות פחחות', label: 'תיקון פחחות סף תחתון מברזל כולל יישור', hours: 1.5 },
    { section: 'עבודות פחחות', label: 'מתיחת שלדה ויישור דופן צד שמאל', hours: 2.5 },
    { section: 'עבודות פחחות', label: 'החלפת פנס ויישור פח משקף', hours: 1.5 },
    { section: 'עבודות צבע', label: 'עבודות צבע לפי מחשבון הצבע' },
    { section: 'עבודות חשמל', label: 'עבודות חשמל ותיקון', hours: 0.8, price: 350 },
    { section: 'עבודות מכונאות', label: 'החלפת מסרק הגה, כולל פירוק מסרק ההגה ופירוק הגשר התחתון', hours: 2.5 },
    { section: 'עבודות מכונאות', label: 'החלפת יחידת הגה כוח חשמלית, כולל מחשב בקרת ההיגוי', hours: 2.5 },
    { section: 'עבודות מכונאות', label: 'החלפת תפוח הגה', hours: 1.5 },
    { section: 'כיוון פרונט', label: 'כיוון זוויות היגוי ומתלה קדמי', price: '420' },
    { section: 'תקנה', label: 'סעיף תקנה', price: '1,250' },
    { section: "עבודות פנצ'רמאכר", label: 'פירוק גלגל מהרכב ובדיקת החישוק', hours: 1.2 },
    { section: 'כיול מחשב הגה חשמלי', label: 'כיול ותכנות יחידת הבקרה של מערכת הגה הכוח החשמלי EPS ECU', price: 470 },
    { section: 'אבחון וכיול כללי של מחשבי הרכב', label: 'סריקה, אבחון, תכנות וכיול כללי של מערכות הבקרה', price: 1200 },
    { section: 'הכנת רכב חשמלי לעבודה – נוהל בטיחות מתח גבוה', label: 'הכנת רכב חשמלי לעבודה – נוהל בטיחות מתח גבוה', price: 980 },
    { section: 'רכב חלופי', label: 'אספקת רכב חלופי לתקופת תיקון הרכב', quantity: 4, unit_price: 180 },
  ],
  parts: [
    { name: 'תומך שפם לפנס ראשי שמאל', type: 'מקורי' },
    { name: 'פנס ראשי שמאל LED', type: 'משומש' },
    { name: 'מסרק הגה', type: 'מקורי' },
    { name: 'תפוח הגה', type: 'טרם נקבע' },
    { name: 'ביטנה קדמית שמאל', type: 'חליפית' },
    { name: 'מגן קדמי חיצוני', type: 'מקורי חדש' },
    { name: 'יחידת הגה כוח חשמלית (EPS)', type: 'טרם נקבע' },
    { name: 'מחשב בקרת מערכת ההיגוי החשמלית (EPS ECU)', type: 'טרם נקבע' },
    { name: 'קליפסים, תפסני חיבור וחומרי עזר להרכבת חלקי מרכב', type: 'חומרי עזר' },
  ],
};

describe('quote categories match the calculator', () => {
  it('uses only category and part-type keys the quote calculator has', () => {
    const calc = new Set(ALL_CATEGORIES.map((c) => c.key));
    for (const key of Object.keys(QUOTE_CATEGORY_LABELS)) expect(calc.has(key)).toBe(true);
    const types = new Set(PART_TYPES.map((t) => t.key));
    for (const k of ['מקורי', 'משומש', 'חליפית', 'משופץ', 'חומרי עזר']) expect(types.has(resolvePartType(k))).toBe(true);
    expect(resolvePartType('טרם נקבע')).toBe('');
  });

  it('maps section names to the right calculator category', () => {
    expect(resolveQuoteCategory('עבודות פחחות')).toBe('body');
    expect(resolveQuoteCategory('עבודות מכונאות')).toBe('mech');
    expect(resolveQuoteCategory('עבודות חשמל')).toBe('electric');
    expect(resolveQuoteCategory('כיוון פרונט')).toBe('alignment');
    expect(resolveQuoteCategory("עבודות פנצ'רמאכר")).toBe('tire_repair');
    expect(resolveQuoteCategory('כיול מחשב הגה חשמלי')).toBe('calibration');
    expect(resolveQuoteCategory('אבחון וכיול כללי של מחשבי הרכב')).toBe('calibration');
    expect(resolveQuoteCategory('הכנת רכב חשמלי לעבודה – נוהל בטיחות מתח גבוה')).toBe('ev');
    expect(resolveQuoteCategory('תקנה')).toBe('custom:תקנה');
    expect(resolveQuoteCategory('רכב חלופי')).toBe('custom:רכב חלופי');
  });
});

describe('planQuoteEntry on the owner\'s quote', () => {
  const plan = planQuoteEntry(MODEL, QUOTE, 380);

  it('reads every work line, prices by hours or globally, and never multiplies a global price', () => {
    expect(plan.works).toHaveLength(18);
    const electric = plan.works.find((w) => w.category === 'electric')!;
    expect(electric).toMatchObject({ pricing: 'global', price: 350, hours: 0.8 });
    expect(entryWorkAmount(electric, 380)).toBe(350);
    const bumper = plan.works.find((w) => w.label === 'פירוק והרכבת פגוש')!;
    expect(bumper).toMatchObject({ pricing: 'hours', hours: 3 });
    expect(entryWorkAmount(bumper, 380)).toBe(1140);
    expect(plan.works.filter((w) => w.category === 'calibration')).toHaveLength(2);
    expect(plan.works.find((w) => w.category === 'custom:רכב חלופי')).toMatchObject({ pricing: 'global', price: 720, note: '4 × 180 ₪' });
  });

  it('leaves paint to the paint calculator (no manual paint line)', () => {
    expect(plan.works.some((w) => w.category === 'paint')).toBe(false);
    expect(plan.paintLeftToCalculator).toHaveLength(1);
  });

  it('keeps each part separately, without a price and with its type', () => {
    expect(plan.parts).toHaveLength(9);
    expect(plan.parts.every((p) => p.price === 0)).toBe(true);
    expect(plan.parts.find((p) => p.name.startsWith('יחידת הגה'))?.partType).toBe('');
    expect(plan.parts.find((p) => p.name.startsWith('מחשב בקרת'))).toBeTruthy();
    expect(plan.parts.find((p) => p.name === 'ביטנה קדמית שמאל')?.partType).toBe('new_aftermarket');
  });

  it('checks the lines against the totals written in the quote', () => {
    expect(plan.checks).toEqual(expect.arrayContaining([
      expect.stringMatching(/^✓ עבודות פחחות: בהצעה 15\.5/),
      expect.stringMatching(/^✓ עבודות מכונאות: בהצעה 6\.5/),
      expect.stringMatching(/^✓ סה״כ שעות: בהצעה 24/),
      expect.stringMatching(/^✓ סכומים ידועים: בהצעה 5,390/),
    ]));
  });

  it('rejects lines, hours or prices that are not in the quote (nothing invented)', () => {
    const bad = planQuoteEntry({
      works: [
        { section: 'עבודות פחחות', label: 'החלפת גג מלא', hours: 4 },
        { section: 'עבודות פחחות', label: 'פירוק והרכבת פגוש', hours: 7 },
        { section: 'כיוון פרונט', label: 'כיוון זוויות היגוי', price: 999 },
      ],
      parts: [{ name: 'מנוע חדש', type: 'מקורי' }],
    }, QUOTE);
    expect(bad.works).toEqual([]);
    expect(bad.parts).toEqual([]);
    expect(bad.rejected).toHaveLength(4);
  });

  it('writes a preview with the claim, every category, parts, paint rule and checks', () => {
    const text = describeQuoteEntry({ id: 'DAL-QA-QUOTE-0001', clientName: 'לקוח בדיקה', plate: '84-488-901' }, plan, { quoteNo: 2, existingQuotes: 1 });
    expect(text).toContain('תיק DAL-QA-QUOTE-0001');
    expect(text).toContain('הצעת מחיר חדשה מס׳ 2');
    expect(text).toContain('הצעות קיימות בתיק לא ישתנו');
    expect(text).toContain('עבודות פחחות');
    expect(text).toContain('מחשבון הצבע');
    expect(text).toContain('חלקי חילוף (9)');
    expect(text).toContain('מחיר להשלמה');
  });
});

describe('the saved quote, as the calculator computes it', () => {
  it('keeps every line, prices hours by the claim rate and adds no paint line', async () => {
    const { buildQuoteEntryData } = await import('./claimQuoteEntrySave');
    const { computeTotals } = await import('./claimQuoteModel');
    const plan = planQuoteEntry(MODEL, QUOTE, 380);
    const data = buildQuoteEntryData({ clientName: 'לקוח בדיקה', plate: '84-488-901' }, { claim_id: 'DAL-QA-QUOTE-0001', hour_rate: 380, works: plan.works, parts: plan.parts }, { previewId: 'P-QUOTE-1', byName: 'QA', at: 'x' });
    expect(data.works).toHaveLength(18);
    expect(data.parts).toHaveLength(9);
    expect(data.works.some((w) => w.category === 'paint' || w.source === 'paint_calc')).toBe(false);
    const t = computeTotals(data);
    expect(t.body).toBe(15.5 * 380);
    expect(t.mech).toBe(6.5 * 380);
    // Globals (350+420+1250+470+1200+980+720) + puncture repair 1.2 h × 380.
    expect(t.extras).toBe(5390 + 1.2 * 380);
    expect(t.parts).toBe(0);
    expect(data.categories).toEqual(expect.arrayContaining(['electric', 'alignment', 'calibration', 'ev', 'tire_repair', 'custom:תקנה', 'custom:רכב חלופי']));
  });
});
