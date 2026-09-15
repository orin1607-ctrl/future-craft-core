/**
 * Detect a priced order / approved amount from garage mail or document text.
 * Never invent a price. Never auto-write the case total.
 */

export type PriceDetection = {
  likelyPricedOrder: boolean;
  amount: number | null;
  label: string;
  reason: string;
};

export type PriceCompare = {
  status: 'match' | 'mismatch' | 'unknown';
  sent: number | null;
  returned: number | null;
  message: string;
};

const PRICED_HINT = /הזמנה מתומחרת|מתומחרת|אישור מחיר|אושר המחיר|אושר לתשלום|סכום מאושר|סה["״']?כ לתשלום|לתשלום|approved amount|total due/i;

function parseAmountToken(raw: string) {
  const cleaned = String(raw || '').replace(/[^\d.,]/g, '').replace(/,/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) return null;
  return Math.round(n);
}

export function extractMoneyAmounts(text: string): number[] {
  const hay = String(text || '');
  const found: number[] = [];
  const re = /(?:₪|ש["״']?ח|NIS|ILS)?\s*(\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d{1,2})?\s*(?:₪|ש["״']?ח|NIS|ILS)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(hay))) {
    const n = parseAmountToken(m[1]);
    if (n && n >= 10) found.push(n);
  }
  return [...new Set(found)];
}

export function detectPricedOrder(input: {
  subject?: string;
  body?: string;
  filenames?: string[];
}): PriceDetection {
  const hay = `${input.subject || ''}\n${input.body || ''}\n${(input.filenames || []).join(' ')}`;
  const amounts = extractMoneyAmounts(hay);
  const hinted = PRICED_HINT.test(hay);
  if (!amounts.length) {
    return {
      likelyPricedOrder: hinted,
      amount: null,
      label: hinted ? 'ייתכן אישור מחיר — הסכום לא זוהה' : 'לא זוהה מחיר',
      reason: hinted ? 'יש ניסוח של אישור/הזמנה מתומחרת אבל אין סכום ברור. דורש בדיקה ידנית.' : 'אין סכום ברור במסמך/מייל. לא ממציאים מחיר.',
    };
  }
  const labeled = hay.match(/(?:סה["״']?כ(?:\s+לתשלום)?|סכום מאושר|מחיר מאושר|לתשלום|total|amount)[^\d₪]{0,24}([₪\d.,]+)/i);
  const labeledAmt = labeled ? parseAmountToken(labeled[1]) : null;
  const amount = labeledAmt || (amounts.length === 1 ? amounts[0] : null);
  if (!amount) {
    return {
      likelyPricedOrder: hinted || amounts.length > 0,
      amount: null,
      label: 'נמצאו כמה סכומים — דורש בדיקה ידנית',
      reason: `סכומים אפשריים: ${amounts.join(', ')}. לא בוחרים אוטומטית.`,
    };
  }
  return {
    likelyPricedOrder: hinted || Boolean(labeledAmt),
    amount,
    label: `נמצא מחיר מאושר/מתומחר: ${amount.toLocaleString('he-IL')} ₪`,
    reason: labeledAmt ? 'סכום ליד תווית מחיר/לתשלום' : 'סכום יחיד במסמך',
  };
}

export function compareSentAndReturned(sent: number | null | undefined, returned: number | null | undefined): PriceCompare {
  const s = Number(sent);
  const r = Number(returned);
  const sentOk = Number.isFinite(s) && s > 0 ? Math.round(s) : null;
  const retOk = Number.isFinite(r) && r > 0 ? Math.round(r) : null;
  if (sentOk == null || retOk == null) {
    return {
      status: 'unknown',
      sent: sentOk,
      returned: retOk,
      message: 'אין מספיק נתונים להשוואת מחיר שנשלח מול מחיר שחזר.',
    };
  }
  if (sentOk === retOk) {
    return {
      status: 'match',
      sent: sentOk,
      returned: retOk,
      message: `התאמה: המחיר שנשלח והמחיר שחזר זהים (${sentOk.toLocaleString('he-IL')} ₪).`,
    };
  }
  return {
    status: 'mismatch',
    sent: sentOk,
    returned: retOk,
    message: `פער במחיר: נשלח ${sentOk.toLocaleString('he-IL')} ₪ · חזר ${retOk.toLocaleString('he-IL')} ₪. לא מעדכנים אוטומטית.`,
  };
}
