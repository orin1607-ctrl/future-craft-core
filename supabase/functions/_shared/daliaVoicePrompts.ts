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

/**
 * Sentences of the conversational garage workflows (daliaVoiceEngine). Every question and every result
 * Dalia speaks is fixed text; names, numbers and lists are only shown on screen.
 */
export const DALIA_VOICE_PROMPTS = {
  // new customer
  newCustomerName: 'שלום, בוא נפתח לקוח חדש במערכת המוסך. מה שם הלקוח?',
  customerNameRetry: 'לא קלטתי את שם הלקוח. מה שם הלקוח?',
  phone: 'מה מספר הטלפון שלו?',
  phoneInvalid: 'מספר הטלפון לא נשמע תקין. אמור את המספר שוב, ספרה אחרי ספרה.',
  customerType: 'האם מדובר בלקוח פרטי או בחברה?',
  customerTypeRetry: 'לא הבנתי. האם הלקוח פרטי או חברה?',
  companyName: 'מה שם החברה?',
  plate: 'מה מספר הרכב (לוחית רישוי)?',
  plateInvalid: 'מספר הרכב לא נשמע תקין. אמור את מספר הרכב שוב, ספרה אחרי ספרה.',
  model: 'מה היצרן והדגם של הרכב?',
  arrivedNow: 'האם הרכב הגיע עכשיו למוסך?',
  yesNoRetry: 'לא הבנתי. אפשר לענות כן או לא.',
  complaint: 'מה הבעיה או התקלה ברכב?',
  // shared confirmation / control
  confirmRetry: 'לא הבנתי. כדי לשמור אמור כן. כדי לא לשמור אמור לא.',
  notSaved: 'בסדר, לא שמרתי. אפשר לומר מה לתקן, למשל "תקני את הטלפון", או לומר "בטל".',
  cancelled: 'ביטלתי את הפעולה. לא נשמר דבר.',
  paused: 'עצרתי. המידע נשמר. כדי להמשיך, לחץ על "המשך פעולה אחרונה".',
  notUnderstood: 'לא הבנתי את התשובה. אפשר לומר שוב?',
  noActions: 'פעולה זו זמינה רק ממסך ניהול המוסך.',
  // existing customer
  existingQuery: 'שלום, בוא נאתר לקוח קיים. מה שם הלקוח, מספר הטלפון או מספר הרכב?',
  customerNotFound: 'לא מצאתי לקוח מתאים. אפשר לנסות שם אחר, טלפון או מספר רכב, או לומר "לקוח חדש".',
  customerOne: 'מצאתי לקוח אחד. הפרטים מוצגים על המסך. האם זה הלקוח?',
  customerMany: 'מצאתי כמה לקוחות. הרשימה מוצגת על המסך. אמור את המספר של הלקוח ברשימה.',
  tooMany: 'נמצאו יותר מדי תוצאות. אפשר לומר שם מלא, טלפון או מספר רכב.',
  pickRetry: 'לא הבנתי את הבחירה. אמור את המספר ברשימה, למשל "הראשון".',
  customerAction: 'מה תרצה לעשות: לפתוח תיק עבודה חדש, או לפתוח תיק קיים של הלקוח?',
  customerActionRetry: 'לא הבנתי. לפתוח תיק עבודה חדש, או תיק קיים?',
  noOpenCasesNew: 'ללקוח אין תיקים פתוחים. לפתוח תיק עבודה חדש?',
  casesMany: 'מצאתי כמה תיקים. הרשימה מוצגת על המסך. אמור את המספר של התיק ברשימה.',
  caseOne: 'מצאתי תיק עבודה. הפרטים מוצגים על המסך. האם זה התיק?',
  vehicleOne: 'ללקוח יש רכב אחד. הפרטים מוצגים על המסך. לפתוח את התיק עבור הרכב הזה?',
  vehicleMany: 'ללקוח יש כמה רכבים. הרשימה מוצגת על המסך. אמור את המספר ברשימה, או מספר רכב חדש.',
  vehicleNewPlate: 'מה מספר הרכב החדש?',
  openingCase: 'פותחת את התיק.',
  // intake
  intakePlate: 'שלום, בוא נקלוט רכב לעבודה ונפתח תיק חדש. מה מספר הרכב?',
  vehicleNotFoundName: 'הרכב לא קיים במערכת, אז נפתח גם לקוח חדש. מה שם הלקוח?',
  intakeComplaint: 'מה תלונת הלקוח או סיבת הכניסה?',
  km: 'מה הקילומטראז\' הנוכחי של הרכב?',
  kmRetry: 'לא הבנתי את הקילומטראז\'. אמור מספר, למשל מאה עשרים אלף.',
  fuel: 'מה מצב הדלק ברכב (לדוגמה: רבע, חצי, מלא)?',
  fuelRetry: 'לא הבנתי. מצב הדלק: ריק, רבע, חצי, שלושה רבעים או מלא?',
  keys: 'כמה מפתחות נמסרו למוסך?',
  keysRetry: 'לא הבנתי. כמה מפתחות נמסרו? אמור מספר.',
  lights: 'האם יש נורות אזהרה דולקות בלוח השעונים?',
  lightsWhich: 'אילו נורות דולקות?',
  items: 'האם נשארו חפצים ברכב?',
  itemsWhich: 'אילו חפצים נשארו ברכב?',
  // quote
  quoteCase: 'לאיזה רכב או תיק עבודה מכינים הצעה? אמור מספר רכב או מספר תיק.',
  caseNotFound: 'לא מצאתי תיק עבודה פתוח. אפשר לומר מספר רכב, מספר תיק או שם לקוח אחר.',
  quoteScope: 'להוסיף עבודות וחלקים להצעת המחיר, או לרשום תוספת עבודה שהתגלתה?',
  quoteScopeRetry: 'לא הבנתי. הצעת מחיר או תוספת עבודה?',
  works: 'אילו עבודות נדרשות לביצוע?',
  workPrice: 'מה המחיר של העבודה, לפני מע"מ?',
  priceRetry: 'לא הבנתי את המחיר. אמור סכום בשקלים, או "בלי מחיר".',
  moreWorks: 'רשמתי. יש עוד עבודה? אפשר לומר את העבודה הבאה, או "זהו".',
  parts: 'אילו חלקי חילוף נדרשים לרכב?',
  partPrice: 'מה המחיר של החלק, לפני מע"מ?',
  moreParts: 'רשמתי. יש עוד חלק? אפשר לומר את החלק הבא, או "זהו".',
  emptyQuote: 'לא נרשמו עבודות או חלקים, אז אין מה לשמור. אפשר לומר עבודה או חלק, או "בטל".',
  addWork: 'איזו עבודה להוסיף להצעה, ומה המחיר?',
  addPart: 'איזה חלק חילוף להוסיף, ומה המחיר?',
  supplementText: 'מה התגלה במהלך העבודה הדורש תוספת?',
  supplementPrice: 'מה המחיר הנוסף של התוספת?',
  supplementStatus: 'האם התוספת כבר אושרה ע״י הלקוח, או שהיא רישום פנימי שממתין לאישור?',
  // payment
  paymentAmount: 'מה סכום התשלום?',
  paymentMethod: 'באיזה אמצעי שולם: מזומן, אשראי, העברה, ביט או צ\'ק?',
  // close / find
  closeQuery: 'שלום, איזה תיק עבודה תרצה לסגור? אמור מספר רכב או מספר תיק.',
  closeGaps: 'לא ניתן לסגור את התיק כרגע. מה שחסר מוצג על המסך.',
  closeConfirm: 'התיק מוכן לסגירה. האם לסגור את התיק?',
  findQuery: 'שלום, איזה תיק עבודה אתה מחפש? אפשר לומר מספר רכב, שם לקוח או מספר תיק.',
  caseFoundOpen: 'מצאתי את התיק. הפרטים מוצגים על המסך. לפתוח אותו?',
  okNotOpening: 'בסדר. הפרטים נשארים על המסך.',
  // invoices & credits
  invoicesSub: 'שלום, מה תרצה לעשות בחשבוניות וזיכויים — לבדוק חשבונית, להכין נתוני חשבונית, או לטפל בזיכוי?',
  invoicesSubRetry: 'לא הבנתי. לבדוק חשבונית, להכין נתוני חשבונית, או לטפל בזיכוי?',
  invoiceQuery: 'מה מספר הרכב או מספר החשבונית?',
  invoiceNotFound: 'לא מצאתי חשבונית מתאימה. אפשר לומר מספר אחר.',
  invoiceFound: 'מצאתי חשבונית. הפרטים מוצגים על המסך.',
  invoicesFound: 'מצאתי כמה חשבוניות. הרשימה מוצגת על המסך.',
  invoiceDraftQuery: 'לאיזה רכב או תיק עבודה להכין נתוני חשבונית? אמור מספר רכב או מספר תיק.',
  invoiceDraftShown: 'נתוני החשבונית מוצגים על המסך. זו טיוטה בלבד, ולא הופקה חשבונית רשמית.',
  // suppliers & expenses
  expensesSub: 'שלום, בספקים והוצאות כלליות — מה תרצה לעשות: לחפש ספק, לרשום רכישת חלק, או לבדוק חוב לספק?',
  expensesSubRetry: 'לא הבנתי. לחפש ספק, לרשום רכישת חלק, או לבדוק חוב לספק?',
  supplierName: 'מה שם הספק?',
  supplierNotFoundCreate: 'לא מצאתי ספק בשם הזה. לפתוח ספק חדש?',
  supplierOne: 'מצאתי ספק. הפרטים מוצגים על המסך. האם זה הספק?',
  suppliersMany: 'מצאתי כמה ספקים. הרשימה מוצגת על המסך. אמור את המספר של הספק ברשימה.',
  supplierShown: 'פרטי הספק מוצגים על המסך.',
  supplierDebtShown: 'החשבוניות הפתוחות של הספק מוצגות על המסך.',
  supplierNotCreated: 'בסדר, לא פתחתי ספק חדש.',
  purchaseInvoiceNumber: 'מה מספר החשבונית של הספק?',
  purchaseTotal: 'מה הסכום הכולל של החשבונית, כולל מע"מ?',
  purchaseCase: 'לאיזה רכב או תיק שייכת הרכישה? אפשר לומר "לא שייך".',
  // resume
  resumeNone: 'אין כרגע פעולה שהופסקה באמצע. במה תרצה שנתחיל?',
  resumeAsk: 'מצאתי את הפעולה האחרונה שלך. תרצה להמשיך מאותה נקודה?',
  resumeDeclined: 'בסדר, ביטלתי את הפעולה הקודמת.',
  // results
  customerAndCaseCreated: 'הלקוח והתיק נשמרו במערכת. פותחת את התיק.',
  customerOnlyCreated: 'הלקוח נשמר במערכת.',
  caseCreated: 'תיק העבודה נפתח. פותחת את התיק.',
  intakeSaved: 'פרטי קבלת הרכב נשמרו. את תמונות הקבלה והחתימה משלימים במסך התיק.',
  quoteSaved: 'הצעת המחיר עודכנה בתיק. שליחה ללקוח נעשית ממסך התיק.',
  supplementSaved: 'התוספת נרשמה כרישום פנימי שממתין לאישור הלקוח.',
  paymentSaved: 'התשלום נרשם בתיק.',
  paymentDuplicate: 'תשלום זהה נרשם בתיק לפני פחות מעשר דקות, ולכן לא רשמתי אותו שוב.',
  caseClosed: 'התיק נסגר.',
  supplierCreated: 'הספק החדש נשמר במערכת.',
  invoiceSaved: 'חשבונית הספק נרשמה במערכת.',
} as const;

/** Whitespace/Unicode normalisation used for every lookup (prompt set, clip manifest, cache). */
export function normalizeSpeechKey(text: string): string {
  return (text || '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

const FIXED_SET = new Set<string>(
  [...DALIA_FIXED_PROMPTS, ...Object.values(DALIA_SAFE_ALTERNATIVES), ...Object.values(DALIA_VOICE_PROMPTS)].map(normalizeSpeechKey),
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
