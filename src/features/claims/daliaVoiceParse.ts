// Pure parsers for spoken Hebrew answers in the garage voice workflows.
// They never guess: when a value cannot be read with confidence they return null and Dalia asks again.

const UNITS: Record<string, number> = {
  אפס: 0,
  אחד: 1, אחת: 1,
  שניים: 2, שתיים: 2, שני: 2, שתי: 2,
  שלוש: 3, שלושה: 3,
  ארבע: 4, ארבעה: 4,
  חמש: 5, חמישה: 5,
  שש: 6, שישה: 6,
  שבע: 7, שבעה: 7,
  שמונה: 8,
  תשע: 9, תשעה: 9,
};
const TENS: Record<string, number> = {
  עשר: 10, עשרה: 10, עשרים: 20, שלושים: 30, ארבעים: 40, חמישים: 50, שישים: 60, שבעים: 70, שמונים: 80, תשעים: 90,
};
const HUNDREDS: Record<string, number> = { מאה: 100, מאתיים: 200 };
const THOUSAND_CONSTRUCT: Record<string, number> = {
  שלושת: 3, ארבעת: 4, חמשת: 5, ששת: 6, שבעת: 7, שמונת: 8, תשעת: 9, עשרת: 10,
};
const CURRENCY = new Set(['שקל', 'שקלים', 'ש"ח', 'ש״ח', 'שח', '₪', 'שקלים.', 'nis']);

function tokens(text: string): string[] {
  return String(text || '')
    .replace(/₪/g, ' ₪ ')
    .replace(/[,;!?״"]+(?=\s|$)/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[.,;:!?()]+|[.,;:!?()]+$/g, ''))
    .filter(Boolean);
}

/** Strips the conjunction prefix ו (and sometimes ה) Hebrew glues to number words. */
function bare(token: string): string {
  if (token.length > 2 && token.startsWith('ו')) return token.slice(1);
  return token;
}

function isNumberWord(token: string): boolean {
  const t = bare(token);
  return (
    /^\d+(?:[.,]\d+)?$/.test(t) ||
    t in UNITS || t in TENS || t in HUNDREDS || t in THOUSAND_CONSTRUCT ||
    t === 'מאות' || t === 'אלף' || t === 'אלפים' || t === 'אלפיים' || t === 'חצי'
  );
}

/**
 * Reads a number spoken in Hebrew words and/or digits: "מאה עשרים אלף" → 120000, "אלף וחמש מאות" → 1500,
 * "3 אלף" → 3000, "שלושת אלפים ומאתיים" → 3200, "450" → 450. Returns null when no number is present.
 */
export function parseHebrewNumber(text: string): number | null {
  const toks = tokens(text).map(bare);
  let total = 0;
  let group = 0;
  let seen = false;
  for (let i = 0; i < toks.length; i += 1) {
    const t = toks[i];
    const next = toks[i + 1];
    if (/^\d+(?:[.,]\d+)?$/.test(t)) {
      group += parseFloat(t.replace(',', '.'));
      seen = true;
    } else if (t in UNITS) {
      const u = UNITS[t];
      if (next === 'מאות') {
        group += u * 100;
        i += 1;
      } else if (next === 'עשר' || next === 'עשרה') {
        group += 10 + u;
        i += 1;
      } else {
        group += u;
      }
      seen = true;
    } else if (t in TENS) {
      group += TENS[t];
      seen = true;
    } else if (t in HUNDREDS) {
      group += HUNDREDS[t];
      seen = true;
    } else if (t in THOUSAND_CONSTRUCT && (next === 'אלפים' || next === 'אלף')) {
      total += THOUSAND_CONSTRUCT[t] * 1000;
      i += 1;
      seen = true;
    } else if (t === 'אלפיים') {
      total += 2000;
      seen = true;
    } else if (t === 'אלף' || t === 'אלפים') {
      total += (group || 1) * 1000;
      group = 0;
      seen = true;
    } else if (t === 'חצי' && seen) {
      // "אלף וחצי" → +500, "מאה וחצי" → +50
      group += total && !group ? 500 : group >= 100 ? 50 : 0.5;
    }
  }
  if (!seen) return null;
  return total + group;
}

const DIGIT_WORDS: Record<string, string> = {
  אפס: '0', אחד: '1', אחת: '1', שתיים: '2', שניים: '2', שתים: '2', שלוש: '3', שלושה: '3', ארבע: '4', ארבעה: '4',
  חמש: '5', חמישה: '5', שש: '6', שישה: '6', שבע: '7', שבעה: '7', שמונה: '8', תשע: '9', תשעה: '9',
};

/** Digit runs in an answer, with digit words ("אפס חמש שתיים…") turned into digits. */
export function digitRuns(text: string): string[] {
  const converted = tokens(text)
    .map((t) => DIGIT_WORDS[bare(t)] ?? t)
    .join(' ');
  const runs = converted.match(/\+?\d[\d\s-]*\d|\d/g) || [];
  return runs.map((r) => r.replace(/\D/g, '')).filter(Boolean);
}

function phoneFromDigits(d: string): string | null {
  let digits = d;
  if (digits.startsWith('972') && digits.length >= 11) digits = `0${digits.slice(3)}`;
  if (digits.length === 10 && /^0[57]/.test(digits)) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length === 9 && /^0[2-489]/.test(digits)) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return null;
}

/** Israeli phone number (mobile 05x / 07x, or landline), formatted like the garage screen, or null. */
export function extractPhone(text: string): string | null {
  const runs = digitRuns(text);
  for (const r of runs) {
    const p = phoneFromDigits(r);
    if (p) return p;
  }
  const joined = runs.join('');
  return phoneFromDigits(joined);
}

/** Vehicle plate: 7–8 digits (also older 5–6 digit plates), never a phone number. */
export function extractPlate(text: string): string | null {
  const runs = digitRuns(text);
  const candidates = runs.length > 1 ? [...runs, runs.join('')] : runs;
  for (const r of candidates) {
    if (phoneFromDigits(r)) continue;
    if (r.length >= 7 && r.length <= 8) return r;
  }
  for (const r of candidates) {
    if (phoneFromDigits(r)) continue;
    if (r.length >= 5 && r.length <= 6) return r;
  }
  return null;
}

const YES = new Set(['כן', 'נכון', 'בטח', 'בהחלט', 'אשר', 'מאשר', 'מאשרת', 'אישור', 'תאשרי', 'שמור', 'שמרי', 'תשמרי', 'לשמור', 'בסדר', 'יאללה', 'אוקיי', 'אוקי', 'ok', 'okay', 'סגור', 'תסגרי', 'מעולה', 'כמובן', 'הגיע', 'פתחי', 'תפתחי']);
const NO = new Set(['לא', 'אל', 'שלילי']);

/**
 * 'yes' | 'no' | null. A negation wins over a yes-word ("לא לשמור", "אל תשמרי", "לא הגיע"),
 * unless the answer opens with a clear yes ("כן, אבל לא עכשיו" stays ambiguous → null).
 */
export function parseYesNo(text: string): 'yes' | 'no' | null {
  const toks = tokens(text).map((t) => t.toLowerCase());
  if (!toks.length) return null;
  const isYes = (t: string) => YES.has(t) || YES.has(bare(t));
  const hasNo = toks.some((t) => NO.has(t));
  const hasYes = toks.some(isYes);
  if (hasNo && hasYes) {
    if (NO.has(toks[0])) return 'no';
    return null;
  }
  if (hasNo) return 'no';
  if (hasYes) return 'yes';
  return null;
}

/** Intake fuel level in the screen's own chip values: ריק, 1/4, 1/2, 3/4, מלא. */
export function parseFuel(text: string): string | null {
  const t = String(text || '');
  if (/שלושה\s*רבעים|3\s*\/\s*4|שלוש\s*רבעים/.test(t)) return '3/4';
  if (/מלא/.test(t)) return 'מלא';
  if (/חצי|1\s*\/\s*2/.test(t)) return '1/2';
  if (/רבע|1\s*\/\s*4/.test(t)) return '1/4';
  if (/ריק|רזרבה|אין דלק|נורה/.test(t)) return 'ריק';
  return null;
}

/** True when the answer says "none / nothing / no more". */
export function isNoneAnswer(text: string): boolean {
  // \b does not work with Hebrew letters in JS regexes, so the word end is spelled out.
  return /^(אין|לא|ללא|זהו|זה הכל|זה הכול|סיימתי|סיימנו|מספיק|אין יותר|אין עוד|לא צריך|בלי)(?=$|[\s,.!])/.test(String(text || '').trim());
}

/** "בלי מחיר" / "עוד לא יודע" → the user explicitly leaves the price open. */
export function isNoPriceAnswer(text: string): boolean {
  return /בלי מחיר|אין מחיר|ללא מחיר|לא יודע|לא ידוע|אחר כך|נעדכן/.test(String(text || ''));
}

const ORDINALS: Array<[RegExp, number]> = [
  [/(^|\s)(ה?ראשון|ה?ראשונה|אחד|אחת|1)(\s|$)/, 1],
  [/(^|\s)(ה?שני|ה?שנייה|שתיים|שניים|2)(\s|$)/, 2],
  [/(^|\s)(ה?שלישי|ה?שלישית|שלוש|שלושה|3)(\s|$)/, 3],
  [/(^|\s)(ה?רביעי|ה?רביעית|ארבע|ארבעה|4)(\s|$)/, 4],
  [/(^|\s)(ה?חמישי|ה?חמישית|חמש|חמישה|5)(\s|$)/, 5],
  [/(^|\s)(ה?שישי|ה?שישית|שש|שישה|6)(\s|$)/, 6],
];

/**
 * Index (0-based) of the item the user picked from a numbered list: by position ("השני", "מספר 2")
 * or by a distinctive part of its label (name, plate, case number). null when unclear.
 */
export function pickFromList(text: string, labels: string[]): number | null {
  const t = String(text || '').trim();
  if (!t) return null;
  const digits = t.replace(/\D/g, '');
  if (digits.length >= 4) {
    const hits = labels.map((l, i) => (l.replace(/\D/g, '').includes(digits) ? i : -1)).filter((i) => i >= 0);
    if (hits.length === 1) return hits[0];
  }
  const stripped = t.replace(/^(מספר|את|ה?לקוח|ה?תיק|ה?רכב|ה?ספק)\s+/g, ' ').trim();
  for (const [re, n] of ORDINALS) {
    if (re.test(` ${stripped} `) && n <= labels.length && stripped.split(/\s+/).length <= 3) return n - 1;
  }
  const words = t.split(/\s+/).filter((w) => w.length >= 2 && !/^(את|של|זה|הוא|היא|לקוח|תיק|רכב)$/.test(w));
  if (!words.length) return null;
  const scored = labels.map((l, i) => ({ i, score: words.filter((w) => l.includes(w)).length }));
  const best = Math.max(...scored.map((s) => s.score));
  if (best <= 0) return null;
  const top = scored.filter((s) => s.score === best);
  return top.length === 1 ? top[0].i : null;
}

const NAME_PREFIX = /^(שם ה?לקוח( הוא)?|השם( שלו| שלה)?( הוא)?|קוראים לו|קוראים לה|הלקוח( הוא)?|זה|הוא|היא|שמו|שמה)\s+/;

/** A person or company name from free speech, without phone/plate digits. null when nothing usable. */
export function extractName(text: string): string | null {
  let t = String(text || '').trim();
  for (let i = 0; i < 2; i += 1) t = t.replace(NAME_PREFIX, '');
  t = t
    .replace(/(טלפון|מספר|נייד|פלאפון|רכב)[^א-תA-Za-z]*[\d\s-]{5,}.*$/, '')
    .replace(/\+?\d[\d\s-]{4,}\d/g, '')
    .replace(/[,.;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!/[א-תA-Za-z]{2,}/.test(t)) return null;
  if (t.split(' ').length > 6) return null;
  return t;
}

export type CustomerKind = 'private' | 'business';
export function parseCustomerType(text: string): CustomerKind | null {
  if (/חבר|עסק|בע"מ|בע״מ|צי|ליסינג|עמות|מוסד/.test(text)) return 'business';
  if (/פרטי|אדם|רגיל/.test(text)) return 'private';
  return null;
}

const MAKES = [
  'טויוטה', 'יונדאי', 'קיה', 'מאזדה', 'סקודה', 'פולקסווגן', 'שברולט', 'ניסאן', 'סובארו', 'מיצובישי', 'פיג\'ו', 'פיגו',
  'סיטרואן', 'רנו', 'פורד', 'הונדה', 'ב.מ.וו', 'במוו', 'ב מ וו', 'מרצדס', 'אאודי', 'סוזוקי', 'דאצ\'יה', 'דאציה', 'סיאט', 'אופל', 'וולוו', 'טסלה',
  'לקסוס', 'ג\'יפ', 'גיפ', 'BYD', 'בי וואי די', 'MG', 'אם ג\'י', 'גילי', 'צ\'רי', 'איסוזו', 'דייהטסו', 'אלפא רומיאו', 'פיאט', 'מיני', 'לנד רובר', 'ג\'נסיס',
];

/** Splits "טויוטה קורולה 2018" into make "טויוטה", model "קורולה 2018". Unknown make → everything in model. */
export function splitMakeModel(text: string): { make: string; model: string } {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  const make = MAKES.find((m) => t === m || t.startsWith(`${m} `));
  if (!make) return { make: '', model: t };
  return { make, model: t.slice(make.length).trim() };
}

export type SpokenLine = { name: string; qty: number; price: number | null };

const QTY_UNITS = /^(יחידות|יחידה|יח'|יח|חלקים|פריטים|צמיגים|גלגלים|ליטר|ליטרים|שעות|שעה)$/;
const FILLER_END = new Set(['במחיר', 'מחיר', 'עולה', 'עולים', 'ב', 'של', 'כל', 'אחד', 'ליחידה', 'סך', 'בסך', 'ועוד', 'מע"מ', 'מע״מ', 'פלוס', 'כולל', 'לפני']);

/**
 * A quote line from speech: "החלפת רפידות קדמיות 450 שקל", "שני מגבים 60 שקל כל אחד",
 * "פילטר שמן כמות 2 במחיר 80". Price is null when none was said (Dalia then asks for it).
 */
export function parseSpokenLine(text: string): SpokenLine | null {
  const toks = tokens(text);
  if (!toks.length) return null;
  let qty = 1;
  const used = new Set<number>();
  // quantity: "כמות 2", "2 יחידות", "פעמיים", "זוג"
  for (let i = 0; i < toks.length; i += 1) {
    if (toks[i] === 'כמות' && i + 1 < toks.length && isNumberWord(toks[i + 1])) {
      qty = parseHebrewNumber(toks[i + 1]) || 1;
      used.add(i); used.add(i + 1);
    } else if (i + 1 < toks.length && isNumberWord(toks[i]) && QTY_UNITS.test(toks[i + 1])) {
      qty = parseHebrewNumber(toks[i]) || 1;
      used.add(i);
    } else if (toks[i] === 'זוג') {
      qty = 2; used.add(i);
    } else if (toks[i] === 'פעמיים') {
      qty = 2; used.add(i);
    }
  }
  // price: the number run right before a currency word, else the last number run at the end of the line
  let price: number | null = null;
  const runEnd = (() => {
    const cur = toks.findIndex((t, i) => !used.has(i) && CURRENCY.has(t));
    if (cur > 0) {
      used.add(cur);
      return cur - 1;
    }
    let end = toks.length - 1;
    while (end >= 0 && (FILLER_END.has(toks[end]) || used.has(end))) end -= 1;
    return end;
  })();
  if (runEnd >= 0 && !used.has(runEnd) && isNumberWord(toks[runEnd])) {
    let start = runEnd;
    while (start - 1 >= 0 && !used.has(start - 1) && isNumberWord(toks[start - 1])) start -= 1;
    // A leading count belongs to the item ("שני מגבים"), not to the price.
    if (start === 0 && runEnd === 0) {
      /* the whole line is a number — no item name */
    }
    const value = parseHebrewNumber(toks.slice(start, runEnd + 1).join(' '));
    if (value !== null && value > 0) {
      price = value;
      for (let i = start; i <= runEnd; i += 1) used.add(i);
    }
  }
  // a leading spoken count ("שני מגבים", "4 צמיגים") is the quantity when no other quantity was given
  if (qty === 1 && toks.length > 1 && !used.has(0) && isNumberWord(toks[0]) && !/^\d{3,}$/.test(toks[0])) {
    const n = parseHebrewNumber(toks[0]);
    if (n && n > 1 && n < 50) {
      qty = n;
      used.add(0);
    }
  }
  const nameToks = toks.filter((_, i) => !used.has(i) && !CURRENCY.has(toks[i]));
  while (nameToks.length && FILLER_END.has(nameToks[nameToks.length - 1])) nameToks.pop();
  while (nameToks.length && /^(ו?עוד|גם|צריך|להוסיף|תוסיפי|תוסיף|הוסיפי|עבודה|חלק)$/.test(nameToks[0])) nameToks.shift();
  const name = nameToks.join(' ').trim();
  if (!/[א-תA-Za-z]{2,}/.test(name)) return null;
  return { name, qty, price };
}

/** Payment method label as the garage server tool stores it. */
export function parsePaymentMethod(text: string): { method: string; label: string } | null {
  if (/אשראי|כרטיס|ויזה|מאסטר/.test(text)) return { method: 'credit_card', label: 'כרטיס אשראי' };
  if (/העברה|בנק/.test(text)) return { method: 'transfer', label: 'העברה בנקאית' };
  if (/ביט|bit/i.test(text)) return { method: 'bit', label: 'ביט' };
  if (/צ'ק|צ׳ק|צק|שיק|צ'יק/.test(text)) return { method: 'check', label: 'צ\'ק' };
  if (/מזומן|קאש|cash/i.test(text)) return { method: 'cash', label: 'מזומן' };
  return null;
}
