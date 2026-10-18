/**
 * Typed approval for Dalia AI preview cards.
 *
 * The user may approve (or cancel) the preview card that is currently shown by writing a short, explicit
 * phrase in the chat. This is matched strictly (whole message, not a substring) and is only ever applied to
 * the LAST assistant card that is still pending — never to an older card and never to free-form text.
 */

const APPROVE = new Set([
  'מאשר', 'מאשרת', 'אני מאשר', 'אני מאשרת', 'אישור', 'אשר', 'אשרי', 'אישרתי',
  'שלח', 'שלחי', 'תשלח', 'תשלחי', 'שלח אותו', 'שלחי אותו', 'שלח את המייל', 'שלחי את המייל',
  'שלח את זה', 'שלחי את זה', 'תשלח את זה', 'תשלחי את זה', 'שלח עכשיו', 'תשלח עכשיו',
  'מאשר שליחה', 'מאשרת שליחה', 'אישור שליחה', 'אשר שליחה', 'מאשר לשלוח', 'מאשרת לשלוח',
  'מאשר ושלח', 'מאשרת ושלחי', 'מאושר', 'מאושרת', 'מאושר שלח', 'מאושר תשלח',
  'יש אישור', 'יש אישור תשלח', 'יש אישור לשלוח', 'כן', 'כן שלח', 'כן תשלח', 'כן שלחי', 'כן תשלחי',
  'כן מאשר', 'כן מאשרת', 'אוקי שלח', 'אוקיי שלח', 'אוקי תשלח', 'אוקיי תשלח', 'אוקי שלחי', 'אוקיי שלחי',
  'מאשר לשלוח את הכול', 'מאשר לשלוח הכל', 'מאשר לשלוח את כולם', 'מאשר את כולם', 'מאשר הכל',
  'שלח את כולם', 'תשלח את כולם', 'שלח הכל', 'תשלח הכל', 'שלח את כולם עכשיו',
  'תזמן', 'תתזמן', 'מאשר תזמון', 'מאשרת תזמון', 'אישור תזמון', 'מאשר לתזמן', 'מאשר לתזמן את כולם', 'תזמן הכל', 'תזמן את כולם',
  'approve', 'approved', 'send', 'send it', 'send all', 'approve all', 'yes', 'yes send', 'confirm', 'schedule',
]);

const CANCEL = new Set(['בטל', 'בטלי', 'ביטול', 'לא לשלוח', 'אל תשלח', 'אל תשלחי', 'cancel']);

function normalize(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[.,!?;:"'`׳״()\u200e\u200f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isApprovalText(text: string): boolean {
  const norm = normalize(text);
  if (!norm) return false;
  if (APPROVE.has(norm)) return true;
  if (isCancelText(text)) return false;
  // Natural short approvals like "יש אישור תשלח בבקשה" or "מאשר לשלוח את המייל"
  if (/^(מאשר|מאשרת|מאושר|אישור|אשר|שלח|תשלח|יש אישור)\b/.test(norm)) {
    const words = norm.split(' ');
    if (words.length <= 7) return true;
  }
  return false;
}

export function isCancelText(text: string): boolean {
  return CANCEL.has(normalize(text));
}
