// supabase/functions/_shared/daliaVoicePrompts.ts
// Single source of truth for the FIXED (customer-data-free) sentences Dalia speaks in the garage voice flows.
// Shared by the browser (src/features/claims) and the dalia-tts Edge Function, so both sides agree on
// which texts may be sent to a cloud TTS provider and which pre-recorded clip belongs to which sentence.
// Pure TypeScript — no Deno or browser APIs.

/**
 * Fixed sentences used outside the workflow engine (voice test, payment shortcut opener).
 * The workflow sentences live in DALIA_VOICE_PROMPTS below.
 */
export const DALIA_FIXED_PROMPTS: readonly string[] = [
  'שלום, אני דליה AI. בדיקת קול בעברית במערכת המוסך.',
  "מה סכום התשלום, ובאיזה אמצעי (מזומן, אשראי, העברה, צ'ק)?",
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
  // ---------------------------------------------------------------------------
  // v2: full assistant (openings per spec, questionnaires, reports, general action)
  // ---------------------------------------------------------------------------
  generalAsk: 'מה תרצה לעשות? אפשר לבקש בחופשיות, למשל "תמצאי לי את התיק של אלדן".',
  generalToChat: 'אני מעבירה את הבקשה לצ׳אט של דליה.',
  searchFailed: 'החיפוש במערכת נכשל בגלל תקלה טכנית, ולא בגלל שהרשומה לא קיימת. אפשר לנסות שוב.',
  okDone: 'בסדר.',
  choiceRetry: 'לא הבנתי את הבחירה. אפשר לבחור באחד הכפתורים שעל המסך או לומר את התשובה.',
  // new customer v2
  newCustomerOpen: 'איזה לקוח תרצה לפתוח? מה שם הלקוח או החברה?',
  customerTypeBiz: 'האם מדובר בלקוח פרטי או עסקי?',
  businessId: 'מה מספר ח.פ או העוסק? אפשר לומר "דלג".',
  similarFound: 'מצאתי לקוח דומה שכבר קיים. הפרטים מוצגים על המסך. האם זה אותו לקוח?',
  confirmCustomer: 'סיכמתי את פרטי הלקוח על המסך. האם לאשר את פתיחת הלקוח?',
  vehicleChoice: 'הלקוח נפתח. תרצה לשייך לו רכב? אפשר לשלוח צילום של רישיון הרכב ואנסה למלא את הפרטים, או להגיד לי את הפרטים בדיבור. מה אתה מעדיף?',
  licenseUpload: 'צלם או העלה את רישיון הרכב בכפתורים שמוצגים על המסך.',
  licenseReadOk: 'קראתי את הרישיון. הפרטים מוצגים על המסך לבדיקה. האם הם נכונים?',
  licenseReadFailed: 'לא הצלחתי לקרוא את הרישיון. נמשיך בדיבור. מה מספר הרישוי של הרכב?',
  vehiclePlate: 'מה מספר הרישוי של הרכב?',
  plateTaken: 'מספר הרכב הזה כבר רשום אצל לקוח אחר במוסך. אפשר לומר מספר אחר, או "בלי רכב".',
  year: 'באיזו שנה יוצר הרכב? אפשר לומר "לא ידוע".',
  yearRetry: 'לא הבנתי את השנה. אמור שנה, למשל אלפיים ועשרים, או "לא ידוע".',
  vehicleConfirm: 'פרטי הרכב מוצגים על המסך. האם לשמור את הרכב ללקוח?',
  vehicleSavedOpenWork: 'הרכב נשמר. תרצה לפתוח לו עבודה חדשה?',
  customerAndVehicleSaved: 'הלקוח והרכב נשמרו במערכת.',
  // existing customer v2
  existingOpen: 'איזה לקוח תרצה שאמצא? אפשר לומר שם, טלפון, מספר לקוח או מספר רכב.',
  customerMenu: 'תרצה לפתוח את הכרטיס, לראות רכבים, לראות תיקי עבודה, לעדכן פרטים או לפתוח עבודה חדשה?',
  customerMenuRetry: 'לא הבנתי. כרטיס, רכבים, תיקי עבודה, עדכון פרטים, או עבודה חדשה?',
  customerMenuAgain: 'מה עוד תרצה לעשות עם הלקוח? אפשר לומר "זהו" כדי לסיים.',
  noCustomerCases: 'ללקוח אין תיקי עבודה.',
  updateWhat: 'מה תרצה לעדכן: איש קשר, או להוסיף הערה? שינוי שם או טלפון נעשה בכרטיס הלקוח במסך.',
  contactName: 'מה שם איש הקשר?',
  noteText: 'מה ההערה להוסיף?',
  confirmUpdate: 'העדכון מוצג על המסך. לשמור?',
  customerUpdated: 'פרטי הלקוח עודכנו.',
  // intake v2
  intakeOpen: 'איזה רכב נכנס למוסך? מה מספר הרכב?',
  intakeWork: 'מה העבודה המבוקשת?',
  intakeCondition: 'מה מצב הרכב? למשל מצב הפנים, או נזקים שרואים.',
  intakeOrder: 'האם קיימת הזמנה או אישור עבודה?',
  intakeSavedPhotos: 'פרטי הקבלה נשמרו בתיק. לפני השלמת קבלת הרכב אני צריכה את תמונות הרכב.',
  photoFront: 'חסרה תמונה מקדימה. תרצה לצלם אותה עכשיו?',
  photoRear: 'חסרה תמונה מאחור. תרצה לצלם אותה עכשיו?',
  photoRight: 'חסרה תמונה של צד ימין. תרצה לצלם אותה עכשיו?',
  photoLeft: 'חסרה תמונה של צד שמאל. תרצה לצלם אותה עכשיו?',
  photoDashboard: 'חסר צילום של לוח השעונים, שרואים בו את הקילומטראז\'. תרצה לצלם אותו עכשיו?',
  photoUploadFailed: 'העלאת התמונה נכשלה. אפשר לנסות שוב.',
  photosLater: 'בסדר. קבלת הרכב לא תושלם עד שכל התמונות יצולמו. אפשר להמשיך אחר כך מ"המשך פעולה אחרונה".',
  intakeFinalConfirm: 'כל התמונות התקבלו. האם לאשר שהקליטה הושלמה ולסמן שהרכב התקבל?',
  intakeDoneSaid: 'הרכב סומן כהתקבל.',
  intakeBlockedQuoteFirst: 'בתיק הזה נקבע מסלול הצעת מחיר תחילה, וההצעה עדיין לא אושרה. קבלת הרכב תיפתח אחרי אישור ההצעה.',
  // quote v2
  quoteOpen: 'תרצה הצעת מחיר חדשה, עדכון הצעה קיימת או תוספת עבודה?',
  quoteOpenRetry: 'לא הבנתי. הצעה חדשה, עדכון הצעה, או תוספת עבודה?',
  quoteLocked: 'ההצעה בתיק הזה כבר נשלחה או אושרה, ולכן לא אשנה אותה. אפשר לרשום את השינוי כתוספת עבודה. להמשיך כתוספת?',
  extraKind: 'מדובר בתוספת חלקים, תוספת עבודה או גם וגם?',
  extraKindAbout: 'תרצה להוסיף את זה כחלק, כעבודת החלפה, או את שניהם?',
  // invoices v2
  invoicesOpen: 'תרצה לחפש חשבונית, להכין חיוב או לבצע זיכוי?',
  chargeCase: 'לאיזה לקוח או תיק להכין חיוב? אמור מספר רכב, מספר תיק או שם לקוח.',
  chargeTerms: 'האם התשלום מיידי, או שהלקוח משלם באשראי או אחת לחודש?',
  chargeShown: 'נתוני החיוב מוצגים על המסך. זו טיוטה בלבד, ולא הופק מסמך מס.',
  chargeMarkInvoiced: 'לסמן בתיק שמצב התשלום הוא חיוב לקוח או חברה?',
  markedInvoiced: 'מצב התשלום עודכן לחיוב לקוח או חברה.',
  creditNoProvider: 'לא מחובר ספק חשבוניות מורשה, ולכן אי אפשר להפיק זיכוי מכאן. אפשר לחפש את החשבונית ולראות את מצב הזיכוי שלה. מה מספר החשבונית או מספר הרכב?',
  // suppliers v2
  suppliersOpen: 'תרצה למצוא ספק, לפתוח ספק חדש או לרשום חשבונית ספק?',
  supplierNewName: 'מה שם הספק החדש?',
  supplierPhone: 'מה הטלפון של הספק? אפשר לומר "דלג".',
  supplierCategory: 'האם הספק מספק חלקים או שירות?',
  supplierConfirm: 'פרטי הספק מוצגים על המסך. לשמור את הספק?',
  invoicePhotoAsk: 'יש לך צילום של החשבונית? אפשר לצלם או להעלות אותה, או לומר "בלי צילום".',
  invoiceReadOk: 'קראתי את החשבונית. הפרטים מוצגים על המסך לבדיקה. האם הם נכונים?',
  invoiceReadFailed: 'לא הצלחתי לקרוא את החשבונית. נמשיך בדיבור. מה מספר החשבונית?',
  purchaseDate: 'מה תאריך החשבונית? אפשר לומר "היום".',
  purchaseLink: 'לשייך את החשבונית לתיק עבודה, או להוצאה כללית של המוסך?',
  purchaseKind: 'האם מדובר בחלקים או בשירות?',
  duplicateInvoice: 'חשבונית עם אותו מספר כבר רשומה לספק הזה, ולכן לא אשמור אותה שוב.',
  // find v2
  findOpen: 'איזה תיק תרצה שאמצא? אפשר לומר מספר תיק, מספר רכב, שם לקוח או טלפון.',
  listSummary: 'סיכום התיקים מוצג על המסך. אפשר לפתוח את הרשימה המלאה בכפתור.',
  noCasesInList: 'לא נמצאו תיקים מתאימים.',
  // close v2
  closeMode: 'מצאתי את התיק. תרצה שאשלח לך שאלון סגירה, או שנעבור יחד על השאלות בדיבור?',
  cqWorkDone: 'האם כל העבודות הסתיימו?',
  finishGapsShown: 'כדי לסמן סיום עבודה חסרים פרטים. הם מוצגים על המסך.',
  finishPhotoFront: 'חסרה תמונת סיום מקדימה. תרצה לצלם אותה עכשיו?',
  finishPhotoRear: 'חסרה תמונת סיום מאחור. תרצה לצלם אותה עכשיו?',
  finishPhotoRight: 'חסרה תמונת סיום של צד ימין. תרצה לצלם אותה עכשיו?',
  finishPhotoLeft: 'חסרה תמונת סיום של צד שמאל. תרצה לצלם אותה עכשיו?',
  markFinished: 'לסמן שהעבודה הסתיימה?',
  closeNotReady: 'העבודה עוד לא הסתיימה, ולכן התיק נשאר פתוח.',
  cqExtras: 'האם יש עבודות או חלקים נוספים שלא נרשמו?',
  cqExtrasGo: 'כדאי לרשום אותם קודם כתוספת עבודה. לעבור לרישום תוספת?',
  closeOrderMissing: 'אין בתיק הזמנת עבודה או הצעה מאושרת, ולכן לא אסגור אותו. כדאי להשלים את ההזמנה בתיק קודם.',
  cqAllIncluded: 'האם כל העבודות והחלקים נכללו בהזמנה או בחיוב?',
  closeFixQuote: 'כדאי לעדכן את ההצעה או לרשום תוספת לפני הסגירה. התיק נשאר פתוח.',
  cqMonthly: 'הלקוח עוד לא שילם את מלוא הסכום. האם זה לקוח שמשלם באשראי או אחת לחודש?',
  cqMarkInvoiced: 'אפשר לסגור את התיק תפעולית ולהשאיר את התשלום במעקב, בסטטוס חיוב לקוח או חברה. לסמן כך?',
  cqMarkPaid: 'התשלומים הרשומים מכסים את הסכום. לסמן שמצב התשלום הוא שולם?',
  closeUnpaid: 'הלקוח עוד לא שילם. כדאי לרשום את התשלום לפני הסגירה. התיק נשאר פתוח.',
  closeDeliveryMissing: 'המסירה וחתימת מקבל הרכב נעשות במסך התיק. אחרי שיושלמו אפשר לסגור.',
  cqDecision: 'מה לעשות: לסגור את התיק, או להשאיר אותו פתוח?',
  noArchive: 'הסתרה או ארכוב של תיק לא קיימים במערכת, ומחיקה לא מתבצעת מכאן. אפשר לסגור את התיק או להשאיר אותו פתוח.',
  keptOpen: 'בסדר, התיק נשאר פתוח.',
  // reports
  reportsOpen: 'איזה דוח תרצה? דוח כספי, דוח לפי חברה, דוח תיקי עבודה, דוח הצעות מחיר או דוח פעילות?',
  reportsOpenRetry: 'לא הבנתי. כספי, לפי חברה, תיקי עבודה, הצעות מחיר או פעילות?',
  reportsMode: 'תרצה שאשלח לך שאלון סינון קצר, או שתגיד לי בדיבור בדיוק איזה דוח אתה צריך?',
  reportFreeAsk: 'מה הדוח שאתה צריך? למשל "כמה כסף נכנס השבוע מאלדן".',
  reportCompany: 'של איזו חברה? אפשר לומר שם חברה, או "כולן".',
  reportCompanyNotFound: 'לא מצאתי תיקים של חברה בשם הזה. אפשר לומר שם אחר, או "כולן".',
  reportPeriod: 'איזו תקופה? היום, אתמול, השבוע, החודש, השנה, או תאריכים.',
  reportStatus: 'לכלול תיקים פתוחים, סגורים, או את כולם?',
  reportDetail: 'להציג סיכום בלבד, או גם פירוט רשומות?',
  reportShown: 'הדוח מוצג על המסך.',
  reportNoData: 'אין נתונים מתאימים לתקופה ולסינון שבחרת.',
  reportNoPermission: 'אין לך הרשאה לדוחות של המוסך.',
  // ---------------------------------------------------------------------------
  // v3: topic switching, general chat, small talk
  // ---------------------------------------------------------------------------
  continueFlowAsk: 'תרצה להמשיך בפעולה הקודמת?',
  switchFlowAsk: 'זו בקשה לפעולה אחרת. לעבור אליה? הטיוטה הנוכחית תישמר ואפשר לחזור אליה.',
  backToFlowAsk: 'תרצה לחזור לפעולה שהתחלנו קודם?',
  stayInFlow: 'בסדר, נמשיך מאיפה שהיינו.',
  sideChat: 'אענה על זה, ואחר כך נמשיך בפעולה.',
  generalChatOpen: 'שיחה כללית. אפשר לשאול אותי כל דבר, או לבקש פעולה במערכת.',
  smallTalkHello: 'שלום! אני כאן. במה אוכל לעזור?',
  smallTalkHowAreYou: 'אני מצוינת, תודה ששאלת. במה אוכל לעזור?',
  smallTalkThanks: 'בשמחה! אני כאן אם צריך עוד משהו.',
  caseGapsShown: 'מה שחסר בתיק מוצג על המסך.',
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
