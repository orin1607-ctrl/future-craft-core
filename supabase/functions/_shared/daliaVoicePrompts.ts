// supabase/functions/_shared/daliaVoicePrompts.ts
// Single source of truth for the FIXED (customer-data-free) sentences Dalia speaks in the garage voice flows.
// Shared by the browser (src/features/claims) and the dalia-tts Edge Function, so both sides agree on
// which texts may be sent to a cloud TTS provider and which pre-recorded clip belongs to which sentence.
// Pure TypeScript — no Deno or browser APIs.

/** Workflow questions and system sentences that never contain customer data. */
export const DALIA_FIXED_PROMPTS: readonly string[] = [
  // new_customer
  'שלום, בוא נפתח לקוח חדש במערכת המוסך. מה שם הלקוח?',
  'מה מספר הטלפון שלו?',
  'האם מדובר בלקוח פרטי או בחברה?',
  'מה מספר הרכב (לוחית רישוי)?',
  'מה היצרן והדגם של הרכב?',
  'האם הרכב הגיע עכשיו למוסך?',
  'מה הבעיה או התקלה ברכב?',
  // existing_customer
  'שלום, בוא נאתר לקוח קיים. מה שם הלקוח, מספר הטלפון או מספר הרכב?',
  'לאיזה רכב של הלקוח תרצה להמשיך?',
  'האם לפתוח את כרטיס הרכב כעת?',
  // intake
  'שלום, בוא נקלוט רכב לעבודה ונפתח תיק חדש. מה מספר הרכב?',
  'מה תלונת הלקוח או סיבת הכניסה?',
  'מה הקילומטראז\' הנוכחי של הרכב?',
  'מה מצב הדלק ברכב (לדוגמה: רבע, חצי, מלא)?',
  'כמה מפתחות נמסרו למוסך?',
  'האם יש נזקים קיימים ברכב שצריך לציין?',
  'האם תרצה לצלם תמונות קבלה כעת?',
  // quote + supplement
  'מה התגלה במהלך העבודה הדורש תוספת?',
  'האם מוסיפים עבודה, חלק חילוף או שניהם?',
  'מה המחיר הנוסף של התוספת?',
  'האם להכין את התוספת כרישום פנימי שממתין לאישור, או שהלקוח כבר אישר?',
  'שלום, בוא נכין הצעת מחיר. לאיזה רכב מכינים הצעה, והאם זו הצעה חדשה או תוספת להצעה קיימת?',
  'אילו עבודות נדרשות לביצוע?',
  'אילו חלקי חילוף נדרשים לרכב?',
  'האם המחירים כוללים מע"מ? והאם לתת הנחה?',
  // invoices_credits
  'שלום, מה תרצה לעשות בחשבוניות וזיכויים — לבדוק חשבונית, להכין נתוני חשבונית, או לטפל בזיכוי?',
  'מה מספר הרכב או מספר החשבונית?',
  'שים לב: מאחר וטרם מחובר ספק חשבוניות חיצוני, המערכת תכין טיוטת נתונים בלבד ולא תציג מסמך כחשבונית חוקית. האם להמשיך?',
  // general_expenses
  'שלום, בספקים והוצאות כלליות — מה תרצה לעשות: לחפש ספק, לרשום רכישת חלק, או לבדוק חוב לספק?',
  'מה שם הספק?',
  'האם לפתוח את כרטסת הספק?',
  // find_case / close_case / resume
  'שלום, איזה תיק עבודה אתה מחפש? אפשר לומר מספר רכב, שם לקוח או מספר תיק.',
  'מצאתי את התיק. תרצה לשמוע סטטוס, לראות עבודות, לבדוק חוב או לפתוח אותו?',
  'שלום, איזה תיק עבודה תרצה לסגור? אמור מספר רכב או מספר תיק.',
  'בודק מוכנות לסגירה...',
  'מצאתי את הפעולה האחרונה שלך. תרצה להמשיך מאותה נקודה?',
  // context screen workflows
  'איזו עבודה להוסיף להצעה, ומה המחיר?',
  'איזה חלק חילוף להוסיף, ומה המחיר?',
  'מה התוספת הנדרשת להצעת המחיר?',
  'מה המחיר של התוספת?',
  'האם התוספת כבר אושרה ע״י הלקוח, או שהיא רישום פנימי שממתין לאישור?',
  'מה סכום התשלום, ובאיזה אמצעי (מזומן, אשראי, העברה, צ\'ק)?',
  'איך אוכל לעזור לך כעת?',
  // processVoiceAnswer system replies
  'עצרתי את ההאזנה. כשתרצה להמשיך, אמור "דליה תמשיכי" או לחץ על כפתור ההמשך.',
  'ביטלתי את הפעולה. חזרנו לתפריט הראשי.',
  'מבצעת את השמירה במערכת כעת.',
  'מאשרת ומבצעת את הפעולה כעת.',
  'הפעולה בוטלה לבקשתך ולא נשמרה.',
  'עדכנתי לצד ימין. נמשיך?',
  'עדכנתי לצד שמאל. נמשיך?',
  // workspace system replies
  'עצרתי את ההאזנה. המידע נשמר במערכת. כשתרצה להמשיך, אמור "דליה תמשיכי" או לחץ על כפתור המשך.',
  'ביטלתי את הפעולה לבקשתך. חזרנו למצב רגיל.',
  'אין כרגע פעולה שהופסקה באמצע. במה תרצה שנתחיל?',
  'שלום, אני דליה AI. בדיקת קול בעברית במערכת המוסך.',
];

/**
 * Generic sentences spoken INSTEAD of a sentence that carries customer data, when no on-device Hebrew
 * voice exists and dynamic cloud speech is not approved. The full text always stays on screen.
 */
export const DALIA_SAFE_ALTERNATIVES = {
  confirm: 'סיכמתי את הפרטים על המסך. האם לאשר ולשמור?',
  nextQuestion: 'השאלה הבאה מוצגת על המסך.',
  answerOnScreen: 'התשובה מוצגת על המסך.',
  executedOk: 'הפעולה הושלמה. הפרטים מוצגים על המסך.',
  executedFailed: 'הפעולה לא הושלמה. הפרטים מוצגים על המסך.',
  resume: 'היינו באמצע תהליך. השאלה האחרונה מוצגת על המסך. נמשיך?',
} as const;

/** Whitespace/Unicode normalisation used for every lookup (prompt set, clip manifest, cache). */
export function normalizeSpeechKey(text: string): string {
  return (text || '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

const FIXED_SET = new Set<string>(
  [...DALIA_FIXED_PROMPTS, ...Object.values(DALIA_SAFE_ALTERNATIVES)].map(normalizeSpeechKey),
);

export function isFixedDaliaPrompt(text: string): boolean {
  return FIXED_SET.has(normalizeSpeechKey(text));
}

/** All sentences that should have a pre-recorded clip. */
export function allFixedDaliaSentences(): string[] {
  return Array.from(FIXED_SET);
}

/** Conservative PII detector: phones, long digit runs (IDs, plates, card numbers), e-mails, plate patterns. */
export function containsLikelyPii(text: string): boolean {
  const t = text || '';
  if (/@/.test(t)) return true;
  if (/\b0\d{1,2}[-\s]?\d{3}[-\s]?\d{4}\b/.test(t)) return true; // Israeli phones
  if (/\d{5,}/.test(t.replace(/[-\s]/g, ''))) return true; // IDs, plates, phones written with separators
  if (/\b\d{2,3}-\d{2,3}-\d{2,3}\b/.test(t)) return true; // plate format 12-345-67
  return false;
}

/** Stable short id for a sentence (FNV-1a 32 bit over the normalised text). Same result in Node, Deno and browsers. */
export function speechClipId(text: string): string {
  const s = normalizeSpeechKey(text);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
