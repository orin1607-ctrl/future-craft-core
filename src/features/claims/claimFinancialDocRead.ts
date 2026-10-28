/**
 * claimFinancialDocRead.ts
 *
 * מנוע קליטה, זיהוי, חילוץ ובקרה כספית עבור תביעות רכב במערכת דליה (STAGING).
 *
 * יכולות מרכזיות:
 * 1. זיהוי סוגי מסמכים כספיים (דוח שמאי שלנו, דוח נגדי / שומת בקרה, הודעת תשלום, פירוט תשלום וסילוק).
 * 2. חילוץ מדויק ומבוסס עובדות של סעיפי נזק: חלפים, פחחות/עבודה, צבע, מע"מ, סה"כ דרישה, מספר רכב, מספר תביעה ושמאי.
 * 3. חילוץ סכומי אישור מבטח, קיזוזים מפורטים (השתתפות עצמית, כינון, בלאי, דמי פתיחה) וסכום שדווח כתשלום.
 * 4. מנוע השוואת דוחות (דרישה מול אישור ביטוח מול תשלום בפועל) עם הסבר מפורט לכל הפרש.
 * 5. ציטוט מקור מלא (source snippet) לכל סכום וקיזוז, וסימון חריגות לבדיקה ידנית (Manual Review).
 * 6. מודל נתונים חסין דריסות (Concurrency & History Protection) לניהול תשלומים מרובים ב-row_data.
 */

// ==========================================
// 1. טיפוסים (Types & Interfaces)
// ==========================================

export type FinancialDocKind =
  | 'our_surveyor_report'     // דוח שמאי שלנו (DALIA-OUR-REPORT)
  | 'counter_surveyor_report' // דוח נגדי / שומת בקרה / שמאי מבטחת
  | 'payment_notice'          // הודעת תשלום / אישור העברה
  | 'payment_breakdown'       // פירוט תשלום / סילוק תביעה
  | 'repair_estimate'         // הצעת תיקון / אומדן ראשוני בלבד
  | 'surveyor_fee'            // חשבונית שכ"ט שמאי
  | 'vehicle_photo'           // תמונות נזק / רכב ללא סכומים
  | 'unknown_financial_doc';  // מסמך כספי שאינו מזוהה בוודאות

export type DeductionCategory =
  | 'deductible'      // השתתפות עצמית
  | 'reinstatement'   // כינון / כינון שרידים
  | 'depreciation'    // בלאי חלפים / הפחתת גיל
  | 'opening_fee'     // דמי פתיחת תיק
  | 'salvage'         // קיזוז שרידים
  | 'labor_cut'       // הפחתת שעות עבודה / תעריף שעה
  | 'paint_cut'       // הפחתת צבע וחומרים
  | 'part_cut'        // אי-אישור חלף / קיזוז חלפים
  | 'unexplained';    // קיזוז שרירותי או לא מוסבר

export interface DeductionItem {
  id: string;
  category: DeductionCategory;
  label: string;
  amount: number;
  sourceSnippet: string;
  isUnexplained: boolean;
  reason?: string;
  page?: number;
}

export interface ExtractedAmountWithSource {
  amount: number;
  sourceSnippet: string;
  confidence: 'high' | 'medium' | 'low';
  page?: number;
}

/**
 * תוצאת קריאת דוח שמאי שלנו (דרישת המוסך / הלקוח)
 */
export interface OurSurveyorReportExtraction {
  kind: 'our_surveyor_report';
  plateNumber?: string;
  claimNumber?: string;
  surveyorName?: string;
  reportDate?: string;
  isAmended?: boolean;

  // סעיפי נזק עיקריים
  parts: ExtractedAmountWithSource;
  labor: ExtractedAmountWithSource;
  paint: ExtractedAmountWithSource;             // עבודות צבע (שכר עבודה)
  paintMaterials?: ExtractedAmountWithSource;   // חומרי צבע (בנפרד משכר עבודה)
  paintBlending?: ExtractedAmountWithSource;    // טשטוש צבע (בנפרד)
  additionalWorks: ExtractedAmountWithSource; // עבודות נוספות, שינועים ועבודות חוץ
  diminutionOfValue: ExtractedAmountWithSource; // ירידת ערך
  otherOrSalvage: ExtractedAmountWithSource;    // שונות / קיזוז שרידים
  subtotal: ExtractedAmountWithSource;          // סה"כ לפני מע"מ
  vat: ExtractedAmountWithSource;               // מע"מ
  vatRatePercent: number;                       // 17% או 18%
  totalDemand: ExtractedAmountWithSource;       // סה"כ שומה נזק כולל מע"מ
  exactTotalDemand?: ExtractedAmountWithSource; // סה"כ תביעה מדויקת (נזק רכב + ירידת ערך)
  roundedTotalDemand?: ExtractedAmountWithSource; // סה"כ נכלל בחוות הדעת מעוגל בדוח
  surveyorFee?: ExtractedAmountWithSource;       // חשבון עסקה שכ"ט שמאי נפרד

  // ציטוטים ואימות
  allCitations: Record<string, string>;
  confidence: 'high' | 'medium' | 'low';
  needsManualReview: boolean;
  reviewReasons: string[];
}

/**
 * תוצאת קריאת דוח נגדי / שומת בקרה של חברת הביטוח
 */
export interface CounterReportExtraction {
  kind: 'counter_surveyor_report';
  insurerName?: string;
  counterSurveyorName?: string;
  reportDate?: string;

  approvedParts: ExtractedAmountWithSource;
  approvedLabor: ExtractedAmountWithSource;
  approvedPaint: ExtractedAmountWithSource;
  approvedAdditionalWorks?: ExtractedAmountWithSource;
  approvedSubtotal: ExtractedAmountWithSource;
  approvedVat: ExtractedAmountWithSource;
  approvedTotal: ExtractedAmountWithSource;

  deductions: DeductionItem[];
  allCitations: Record<string, string>;
  confidence: 'high' | 'medium' | 'low';
  needsManualReview: boolean;
  reviewReasons: string[];
}

/**
 * תוצאת קריאת הודעת תשלום או פירוט סילוק תביעה
 */
export interface PaymentNoticeExtraction {
  kind: 'payment_notice' | 'payment_breakdown';
  insurerName?: string;
  paymentDate?: string;
  reportedPaidAmount: ExtractedAmountWithSource;
  referenceNumber?: string;
  payeeName?: string;

  approvedTotal?: ExtractedAmountWithSource;
  deductions: DeductionItem[];

  allCitations: Record<string, string>;
  confidence: 'high' | 'medium' | 'low';
  needsManualReview: boolean;
  reviewReasons: string[];
}

/**
 * שורה בטבלת ההשוואה הכספית
 */
export interface ComparisonTableRow {
  category: string;
  demanded: number | null;
  approved: number | null;
  paid: number | null;
  diff: number | null;
  explanation: string;
  sourceSnippet: string;
  status: 'match' | 'reduction' | 'missing' | 'unexplained';
}

/**
 * דוח השוואה כספית מלא
 */
export interface FinancialComparisonResult {
  claimId: string;
  plateNumber: string;
  rows: ComparisonTableRow[];

  totalDemanded: number;
  roundedTotalDemanded?: number;
  surveyorFeeDemanded?: number;
  totalApproved: number;
  totalReportedPaid: number;
  totalVerifiedPaid: number;

  differenceDemandVsApproved: number; // פער בין דרישת השמאי שלנו לאישור חברת הביטוח
  differenceApprovedVsPaid: number;   // פער בין האישור לתשלום בפועל
  totalRemainingUnpaid: number;       // יתרה כוללת לגבייה (דרישה מול שולם בפועל)

  deductionsSummary: DeductionItem[];
  hasUnexplainedDeductions: boolean;
  hasPartCuts: boolean;
  hasLaborCuts: boolean;
  hasPaintCuts: boolean;

  needsManualReview: boolean;
  reviewReasons: string[];
  recommendedAction: string;
}

// ==========================================
// 2. מבנה נתונים חסין דריסה (row_data Architecture)
// ==========================================

export interface VerifiedPaymentEntry {
  id: string;
  amount: number;
  date: string;
  referenceNumber: string;
  paymentMethod: 'bank_transfer' | 'check' | 'credit' | 'other';
  recordedAt: string;
  recordedBy: string;
  verified: boolean;
  verifiedAt?: string;
  verifiedBy?: string;
  notes?: string;
}

export interface FinancialAuditHistoryEntry {
  timestamp: string;
  user: string;
  action: string;
  summary: string;
  diff?: Record<string, { before: unknown; after: unknown }>;
}

export interface FinancialAuditRowData {
  schema_version: 1;
  updated_at: string;
  updated_by: string;
  lock_token: string;

  // דוח השמאי שלנו (כולל גרסה קודמת אם הוגש דוח מתוקן)
  our_demand: OurSurveyorReportExtraction | null;
  previous_demands?: OurSurveyorReportExtraction[];

  // מסמכי חברת הביטוח
  counter_reports: CounterReportExtraction[];
  payment_notices: PaymentNoticeExtraction[];

  // תשלומים שאומתו שהתקבלו בפועל בחשבון (להבדיל מסכום שרק דווח)
  verified_payments: VerifiedPaymentEntry[];

  // תוצאת ההשוואה העדכנית
  latest_comparison: FinancialComparisonResult | null;

  // יומן שינויים בלתי ניתן למחיקה
  history: FinancialAuditHistoryEntry[];
}

// ==========================================
// 3. ביטויים רגולריים וזיהוי טקסט (RegEx & Normalization)
// ==========================================

export function normalizeFinancialText(raw: string): string {
  return String(raw || '')
    .replace(/\r/g, '\n')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function linesOf(text: string): string[] {
  return normalizeFinancialText(text)
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** מנקה מספר מכיל פסיקים או תווי מטבע וממיר ל-number */
export function parseNumberString(numStr: string): number {
  if (!numStr) return 0;
  const clean = numStr.replace(/[^0-9.-]/g, '');
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : Math.round(val * 100) / 100;
}

const AMOUNT_PATTERN = '([0-9]{1,3}(?:,[0-9]{3})+(?:\\.[0-9]{1,2})?|[0-9]+(?:\\.[0-9]{1,2})?)(?![0-9.])';
const CURRENCY_PATTERN = '(?:₪|ש"ח|ש״ח|\\bnis\\b)?';

/**
 * מחלץ סכום ליד מילת מפתח, בסדר קריאה לוגי (Hebrew RTL) או הפוך (Visual PDF)
 */
export function extractAmountForLabel(
  text: string,
  keywords: string[],
  options: {
    rejectIfKeyword?: string[];
    preferLast?: boolean;
    targetAmount?: number;
    preferLineTotal?: boolean;
    minAmount?: number;
  } = {}
): ExtractedAmountWithSource {
  const lines = linesOf(text);
  const hits: Array<{ amount: number; line: string }> = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    // שלילה לפי מילות חסימה
    if (options.rejectIfKeyword && options.rejectIfKeyword.some((k) => line.includes(k))) {
      continue;
    }

    const matchedKeyword = keywords.find((k) => line.toLowerCase().includes(k.toLowerCase()));
    if (!matchedKeyword) continue;

    const PERCENT_MODIFIER = '(?:\\(?\\s*\\d{1,2}%\\s*\\)?|\\[\\s*\\d{1,2}%[^\\]]*\\])?';
    // דפוס 1: מילת מפתח (עם אפשרות לשיעור אחוזים כמו 17% או [18% (שמונה עשר)]) : סכום
    const reForward = new RegExp(`${matchedKeyword}[\\s:\\-–—]*${PERCENT_MODIFIER}[\\s:\\-–—]*${CURRENCY_PATTERN}\\s*${AMOUNT_PATTERN}(?!\\s*%)`, 'i');
    // דפוס 2: סכום מילת מפתח (ויזואלי)
    const reBackward = new RegExp(`${AMOUNT_PATTERN}(?!\\s*%)\\s*${CURRENCY_PATTERN}\\s*[\\s:\\-–—]*${matchedKeyword}`, 'i');

    let hitMatch = reForward.exec(line) || reBackward.exec(line);
    let matchedLine = line;

    // תמיכה בשבירת שורה: מילת מפתח בשורה נוכחית והסכום בשורה הבאה
    if (!hitMatch && idx + 1 < lines.length) {
      const nextLine = lines[idx + 1];
      if (!options.rejectIfKeyword || !options.rejectIfKeyword.some((k) => nextLine.includes(k))) {
        const combined = `${line} ${nextLine}`;
        hitMatch = reForward.exec(combined) || reBackward.exec(combined);
        if (hitMatch) {
          matchedLine = combined;
        }
      }
    }

    if (hitMatch) {
      // אם הסכום שזוהה צמוד לסימן אחוז (למשל 5.00 % או 17%), אין מדובר בסכום כספי אלא בשיעור אחוזים
      const afterMatch = matchedLine.slice(hitMatch.index + hitMatch[0].length);
      if (/^(\s*%|\s*\.\d+\s*%)/.test(afterMatch)) {
        continue;
      }
      let val = parseNumberString(hitMatch[1]);
      if (options.preferLineTotal) {
        // מחלץ את כל המספרים התקינים בשורה ובודק אם קיים סכום כולל של השורה (עמודת סה"כ)
        const allMatches = [...matchedLine.matchAll(/([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)(?![0-9.:])/g)];
        const candidateNums: number[] = [];
        for (const m of allMatches) {
          const aft = matchedLine.slice(m.index + m[0].length);
          if (/^\s*%/.test(aft)) continue;
          if (/^\s*ש['״]/.test(aft)) continue; // שעות עבודה
          const numVal = parseNumberString(m[1]);
          if (numVal > 0) candidateNums.push(numVal);
        }
        if (candidateNums.length > 0) {
          val = Math.max(...candidateNums);
        }
      }
      if (options.minAmount !== undefined && val < options.minAmount) {
        continue;
      }
      if (val > 0) {
        hits.push({ amount: val, line: matchedLine });
      }
    }
  }

  if (hits.length === 0) {
    return {
      amount: 0,
      sourceSnippet: 'לא מופיע במסמך',
      confidence: 'low',
    };
  }

  // אם הוגדר targetAmount (למשל צפי מע"מ מתוך סה"כ לפני מע"מ), נבחר בפגיעה הקרובה ביותר
  if (options.targetAmount !== undefined && hits.length > 0) {
    let best = hits[0];
    let bestDiff = Math.abs(best.amount - options.targetAmount);
    for (const h of hits) {
      const diff = Math.abs(h.amount - options.targetAmount);
      if (diff < bestDiff) {
        best = h;
        bestDiff = diff;
      }
    }
    return {
      amount: best.amount,
      sourceSnippet: best.line.slice(0, 180),
      confidence: 'high',
    };
  }

  const chosen = options.preferLast ? hits[hits.length - 1] : hits[0];
  return {
    amount: chosen.amount,
    sourceSnippet: chosen.line.slice(0, 180),
    confidence: 'high',
  };
}

// ==========================================
// 4. סיווג סוג מסמך כספי (Document Classifier)
// ==========================================

export function classifyFinancialDocumentKind(text: string, fileName = ''): FinancialDocKind {
  const clean = (text + ' ' + fileName).toLowerCase();

  // 1. קוד זיהוי מפורש של דוח שמאי שלנו
  if (/dalia-our-report/i.test(clean)) {
    return 'our_surveyor_report';
  }

  // 2. דוח נגדי / שומת בקרה / שמאי מטעם מבטחת
  if (
    /דוח\s*נגדי|דו"ח\s*נגדי|שומת\s*בקרה|דוח\s*בקרה|חוות\s*דעת\s*נגדית|שמאי\s*מבטחת|שומת\s*ביטוח|הפחתות\s*שומה/i.test(
      clean
    )
  ) {
    return 'counter_surveyor_report';
  }

  // 3. הודעת תשלום / אישור העברה
  if (
    /הודעת\s*תשלום|הודעה\s*על\s*תשלום|אישור\s*תשלום|אישור\s*העברה\s*בנקאית|הודעה\s*על\s*ביצוע\s*תשלום|מכתב\s*העברת\s*תשלום/i.test(
      clean
    )
  ) {
    return 'payment_notice';
  }

  // 4. פירוט סילוק תביעה / פירוט תשלום
  if (
    /פירוט\s*תשלום|פירוט\s*סילוק|מכתב\s*סילוק|דוח\s*חישוב\s*תשלום|פירוט\s*שובר/i.test(
      clean
    )
  ) {
    return 'payment_breakdown';
  }

  // 5. הצעת תיקון / אומדן ראשוני (מופרד מחוות דעת שמאית סופית)
  if (/הצעת\s*תיקון|אומדן\s*ראשוני/i.test(clean) && !/חוות\s*דעת/i.test(clean)) {
    return 'repair_estimate';
  }

  // 6. חשבונית שכר טרחת שמאי
  if (/שכ"?ט\s*שמאי|שכר\s*טרחת\s*שמאי|חשבונית\s*שמאי|קבלה\s*שמאי|חשבון\s*עיסקה\s*שכ"?ט/i.test(clean)) {
    return 'surveyor_fee';
  }

  // 7. תמונות נזק / רכב ללא סכומים
  if (
    /(?:^|\b)(?:תמונ|רכב|פגוש|דלת|כנף|מוקד|photo|img|image|bumper|dsc|pic|damage)(?:$|\b)/i.test(clean) &&
    !/דוח|שומה|חוות\s*דעת|חשבונית|הודעת\s*תשלום|שכ"?ט/i.test(clean)
  ) {
    return 'vehicle_photo';
  }

  // 8. דוח שמאי רגיל (ברירת מחדל לדוח שלנו אם אין סממני נגדי)
  if (
    /חוות\s*דעת\s*שמאי|שומת\s*נזק|דוח\s*שמאי|דו"ח\s*שמאי|שמאות\s*רכב|הערכת\s*נזק\s*לרכב/i.test(
      clean
    )
  ) {
    return 'our_surveyor_report';
  }

  return 'unknown_financial_doc';
}

// ==========================================
// 5. חילוץ דוח השמאי שלנו (Our Surveyor Report)
// ==========================================

export function extractOurSurveyorReport(text: string): OurSurveyorReportExtraction {
  const clean = normalizeFinancialText(text);
  const reviewReasons: string[] = [];
  const citations: Record<string, string> = {};

  // זיהוי דוח מתוקן
  const isAmended = /דוח\s*מתוקן|שומה\s*מתוקנת|שומה\s*סופית\s*מעודכנת/i.test(clean);

  // חילוץ סעיפי נזק: חלפים
  const parts = extractAmountForLabel(
    clean,
    [
      'סה"כ חלקי חילוף',
      'סה״כ חלקי חילוף',
      'מחיר חלקי חילוף',
      'מחיר חלפים',
      'חלקי חילוף',
      'סה"כ חלפים',
      'סה״כ חלפים',
      'חלפים',
      'סה"כ חלקים',
      'חלקים',
    ],
    {
      rejectIfKeyword: ['הובלת חלקים', 'משלוח חלקים', 'הובלה'],
      preferLast: true,
    }
  );
  if (parts.amount > 0) citations['חלפים'] = parts.sourceSnippet;

  // פחחות / עבודה
  const labor = extractAmountForLabel(
    clean,
    [
      'עבודות פחחות',
      'פחחות וצבע',
      'שכר עבודה פחחות',
      'שעות עבודה',
      'שכר עבודה',
      'פחחות',
    ],
    {
      rejectIfKeyword: ['כרטיס עבודה', 'הזמנת עבודה', 'טופס עבודה', 'לפי כרטיס'],
      preferLineTotal: true,
      minAmount: 100,
    }
  );
  if (labor.amount > 0) citations['פחחות / עבודה'] = labor.sourceSnippet;

  // עבודות צבע (שכר עבודה בלבד — נשמר בהפרדה מלאה מחומרי צבע)
  let paint = extractAmountForLabel(
    clean,
    ['עבודות צבע+טשטוש', 'עבודות צבע', 'שכר עבודה צבע', 'עבודת צבע', 'צבע וטשטוש'],
    {
      rejectIfKeyword: ['חומרי צבע', 'חומרים לצבע', 'כרטיס עבודה', 'הזמנת עבודה', 'טופס עבודה', 'לפי כרטיס'],
      preferLineTotal: true,
      minAmount: 100,
    }
  );
  if (paint.amount === 0) {
    paint = extractAmountForLabel(
      clean,
      ['סה"כ צבע', 'צבע וחומרים', 'עבודות צבע'],
      {
        rejectIfKeyword: ['כרטיס עבודה', 'הזמנת עבודה', 'טופס עבודה', 'לפי כרטיס'],
        preferLineTotal: true,
        minAmount: 100,
      }
    );
  }
  if (paint.amount > 0) citations['עבודות צבע'] = paint.sourceSnippet;

  // חומרי צבע (סעיף נפרד לחלוטין משכר עבודות הצבע)
  const paintMaterials = extractAmountForLabel(
    clean,
    ['חומרי צבע', 'חומרים לצבע', 'חומרים וצבע', 'חומרי צבע ועזר'],
    {
      rejectIfKeyword: ['כרטיס עבודה', 'הזמנת עבודה', 'טופס עבודה', 'לפי כרטיס'],
      preferLineTotal: true,
      minAmount: 10,
    }
  );
  if (paintMaterials.amount > 0) citations['חומרי צבע'] = paintMaterials.sourceSnippet;

  // אם הוגדר סעיף חומרי צבע בלבד ללא סעיף עבודות צבע כלל בדוח
  if (paint.amount === 0 && paintMaterials.amount > 0) {
    paint = { ...paintMaterials };
  }

  // טשטוש צבע (אם מופיע כסעיף נפרד בדוח)
  const paintBlending = extractAmountForLabel(
    clean,
    ['טשטוש צבע', 'התאמת צבע וטשטוש', 'עבודות טשטוש'],
    {
      rejectIfKeyword: ['עבודות צבע+טשטוש', 'כרטיס עבודה', 'הזמנת עבודה'],
      preferLineTotal: true,
      minAmount: 10,
    }
  );
  if (paintBlending.amount > 0) citations['טשטוש צבע'] = paintBlending.sourceSnippet;

  // עבודות נוספות ושינועים
  let additionalWorks = extractAmountForLabel(clean, [
    'עבודות נוספות ושינועים',
    'עבודות נוספות',
    'שינועים ועבודות חוץ',
    'שינועים',
    'עבודות עזר',
  ]);
  // אם לא נמצא סכום כולל מפורש אך קיימים סעיפי עבודות נפרדים בדוח (כגון פו"ח, שיפוץ, שינועים, כוון מתלה)
  if (additionalWorks.amount === 0) {
    const totalWorks = extractAmountForLabel(clean, ['סה"כ עבודות', 'סה״כ עבודות']);
    if (totalWorks.amount > 0 && (labor.amount > 0 || paint.amount > 0)) {
      // אם חומרי הצבע נכללו במקטע העבודות (כגון בדוח 0007 שבו מופיע "חומרים לצבע 2745.00" תחת פירוט עבודות)
      const materialsUnderWorks =
        paintMaterials.amount > 0 && totalWorks.sourceSnippet.includes(String(paintMaterials.amount))
          ? paintMaterials.amount
          : (totalWorks.amount - labor.amount - paint.amount >= (paintMaterials.amount || 0) && paintMaterials.amount > 0 && clean.indexOf('חומרים לצבע') < clean.indexOf('סה"כ עבודות'))
          ? paintMaterials.amount
          : 0;
      const remainderWorks = Math.round((totalWorks.amount - labor.amount - paint.amount - materialsUnderWorks) * 100) / 100;
      if (remainderWorks > 0) {
        additionalWorks = {
          amount: remainderWorks,
          sourceSnippet: `עבודות נוספות, שינועים ושונות (מתוך ${totalWorks.sourceSnippet})`,
          confidence: 'high',
        };
      }
    }
  }
  if (additionalWorks.amount > 0) citations['עבודות נוספות ושינועים'] = additionalWorks.sourceSnippet;

  // ירידת ערך
  const diminutionOfValue = extractAmountForLabel(clean, [
    'סה"כ ירידת הערך',
    'סה״כ ירידת הערך',
    'ירידת הערך',
    'ירידת ערך',
    'הפצוי לירידת הערך',
    'פגיעה בערך',
  ]);
  if (diminutionOfValue.amount > 0) citations['ירידת ערך'] = diminutionOfValue.sourceSnippet;

  // שונות / קיזוז שרידים
  const otherOrSalvage = extractAmountForLabel(clean, ['שונות', 'עבודות חוץ', 'קיזוז שרידים', 'שרידים']);
  if (otherOrSalvage.amount > 0) citations['שונות/שרידים'] = otherOrSalvage.sourceSnippet;

  // סה"כ לפני מע"מ
  const subtotal = extractAmountForLabel(clean, [
    'לפני מע"מ',
    'לפני מע״מ',
    'סה"כ נזק שנתבע',
    'סה״כ נזק שנתבע',
    'סה"כ נזק',
    'סה״כ נזק',
    'סה"כ שומה לפני',
  ]);
  if (subtotal.amount > 0) citations['לפני מע"מ'] = subtotal.sourceSnippet;

  // חישוב עקיף / אימות של סה"כ ושיעור מע"מ
  let vatRate = 0.17;
  if (/מע["״]מ\s*18%/i.test(clean)) vatRate = 0.18;

  // מע"מ (תוך שלילת שורות "לפני מע"מ" וחשבונות עסקה נפרדים של שכ"ט)
  const expectedVat = subtotal.amount > 0 ? Math.round(subtotal.amount * vatRate * 100) / 100 : undefined;
  const vat = extractAmountForLabel(clean, ['מע"מ', 'מע״מ', 'ערך מוסף'], {
    targetAmount: expectedVat,
    rejectIfKeyword: [
      'לפני מע"מ',
      'לפני מע״מ',
      'בטרם מע"מ',
      'ללא מע"מ',
      'ללא מע״מ',
      'שמאות',
      'חשבון עיסקה',
      'חשבון עסקה',
      'הוצאות משרד',
      'נסיעות',
      'שכ"ט',
      'סה"כ כולל מע"מ',
      'סה״כ כולל מע״מ',
      'סך הכל כולל מע"מ',
    ],
  });
  if (vat.amount > 0) citations['מע"מ'] = vat.sourceSnippet;

  // סה"כ כולל מע"מ / לתשלום (תוך סינון חשבונות שכ"ט שמאי נפרדים)
  const expectedTotal = subtotal.amount > 0 ? Math.round(subtotal.amount * (1 + vatRate) * 100) / 100 : undefined;
  const totalDemand = extractAmountForLabel(
    clean,
    [
      'סה"כ נכלל בחוות הדעת',
      'סה"כ תביעה שהוגשה',
      'סה"כ נזק שנתבע',
      'סה״כ נזק שנתבע',
      'סה"כ כולל מע"מ',
      'סה״כ כולל מע״מ',
      'סה"כ שומה',
      'סה״כ שומה',
      'סך הכל שומה',
      'סך הכל כולל מע"מ',
      'סה"כ נזק',
      'סה״כ נזק',
      'סה"כ לתשלום',
      'סה״כ לתשלום',
    ],
    {
      preferLast: true,
      targetAmount: expectedTotal,
      rejectIfKeyword: ['שמאות', 'חשבון עיסקה', 'חשבון עסקה', 'הוצאות משרד', 'נסיעות', 'שכ"ט'],
    }
  );
  if (totalDemand.amount > 0) citations['סה"כ כולל מע"מ'] = totalDemand.sourceSnippet;

  // בדיקת תקינות מתמטית (סבירות) - סכום כולל מע"מ לא יכול להיות נמוך מסכום לפני מע"מ
  if (totalDemand.amount > 0 && subtotal.amount > 0 && totalDemand.amount < subtotal.amount) {
    totalDemand.amount = 0; // פוסל סכום שגוי (למשל שכ"ט שמאי במקום נזק רכב)
  }

  // בדיקת תקינות מתמטית (סבירות)
  const calculatedSumBeforeVat = parts.amount + labor.amount + paint.amount + additionalWorks.amount + otherOrSalvage.amount;
  if (totalDemand.amount === 0) {
    if (subtotal.amount > 0) {
      totalDemand.amount = Math.round(subtotal.amount * (1 + vatRate) * 100) / 100;
      totalDemand.confidence = 'medium';
      totalDemand.sourceSnippet = `חושב מסכום לפני מע"מ (${subtotal.amount} ₪ + ${vatRate * 100}%)`;
      citations['סה"כ חושב'] = totalDemand.sourceSnippet;
    } else if (calculatedSumBeforeVat > 0) {
      totalDemand.amount = Math.round(calculatedSumBeforeVat * (1 + vatRate) * 100) / 100;
      totalDemand.confidence = 'medium';
      totalDemand.sourceSnippet = `חושב מסיכום סעיפי הנזק (${calculatedSumBeforeVat} ₪ + ${vatRate * 100}%)`;
      citations['סה"כ חושב מסעיפים'] = totalDemand.sourceSnippet;
    } else {
      reviewReasons.push('לא נמצא סכום דרישה כולל בדוח השמאי');
    }
  }

  // זיהוי פרטי תיק ושמאי
  const plateMatch = clean.match(/(?:מספר\s*רישוי|מס[\'׳.]?\s*רישוי|רישוי|מספר\s*רכב|רכב\s*מס[\'׳.]?|לוחית)[\s:\-–—]*([0-9]{2,3}[-\s]?[0-9]{2,3}[-\s]?[0-9]{2,3})/i);
  const plateNumber = plateMatch ? plateMatch[1].replace(/[^0-9]/g, '') : undefined;

  const claimMatch = clean.match(/(?:תביעה\s*מס[\'׳.]?|מספר\s*תביעה|מס\s*תביעה)[\s:\-–—]*([A-Z0-9\-\/]+)/i);
  const claimNumber = claimMatch ? claimMatch[1].trim() : undefined;

  let surveyorName: string | undefined;
  const surveyorMatch = clean.match(/(?:שם\s*(?:ה)?שמאי|שמאי(?:\s*בודק|\s*מטעם)?)\s*[:\-–—]\s*([א-ת ]{2,25})/i);
  if (surveyorMatch) {
    surveyorName = surveyorMatch[1].trim();
  } else {
    // זיהוי כותרת שמאי בראש המסמך (לדוגמה: "גליל גולן שמאות")
    const headerLines = linesOf(clean).slice(0, 6);
    const surveyorHeader = headerLines.find((l) => /שמאות|שמאי|שמאים/i.test(l) && !/חוות דעת|דוח שמאות/i.test(l));
    if (surveyorHeader) surveyorName = surveyorHeader.slice(0, 40).trim();
  }

  // זיהוי תאריך
  const dateMatch = clean.match(/(?:תאריך|יום)[\s:\-–—]*([0-9]{1,2}[./\-][0-9]{1,2}[./\-][0-9]{2,4})/i);
  const reportDate = dateMatch ? dateMatch[1].trim() : undefined;

  const needsManualReview =
    reviewReasons.length > 0 ||
    totalDemand.confidence !== 'high' ||
    (parts.amount === 0 && labor.amount === 0 && paint.amount === 0);

  if (parts.amount === 0 && labor.amount === 0) {
    reviewReasons.push('לא זוהו סעיפי חלפים או פחחות נפרדים בדוח');
  }

  // שכר טרחת שמאי (חשבון עסקה נפרד)
  const surveyorFee = extractAmountForLabel(
    clean,
    [
      'שכר טרחת השמאי',
      'שכר טרחת שמאי',
      'שכ"ט שמאי',
      'חשבון עיסקה מס',
      'חשבון עסקה מס',
      'חשבון עיסקה',
      'חשבון עסקה',
    ],
    {
      rejectIfKeyword: ['לפי כרטיס עבודה', 'מוסך יוני', 'מרכז הפגושים'],
    }
  );
  if (surveyorFee.amount > 0) citations['שכר טרחת שמאי'] = surveyorFee.sourceSnippet;

  // סכום מעוגל שמופיע בדוח (למשל "סה"כ נכלל בחוות הדעת 55840.00" או "31630.- ש"ח")
  const roundedTotalDemand = extractAmountForLabel(clean, [
    'סה"כ נכלל בחוות הדעת',
    'סה״כ נכלל בחוות הדעת',
    'סך הכל נכלל בחוות הדעת',
  ]);
  if (roundedTotalDemand.amount > 0) citations['סה"כ נכלל בחוות הדעת (מעוגל)'] = roundedTotalDemand.sourceSnippet;

  // חישוב סה"כ תביעה מדויקת: נזק רכב כולל מע"מ + ירידת ערך
  const exactTotalDemandVal = Math.round((totalDemand.amount + (diminutionOfValue.amount || 0)) * 100) / 100;
  const exactTotalDemand: ExtractedAmountWithSource = {
    amount: exactTotalDemandVal,
    sourceSnippet:
      diminutionOfValue.amount > 0
        ? `חישוב מדויק: ${totalDemand.amount.toLocaleString()} ₪ נזק רכב + ${diminutionOfValue.amount.toLocaleString()} ₪ ירידת ערך`
        : totalDemand.sourceSnippet,
    confidence: 'high',
  };

  return {
    kind: 'our_surveyor_report',
    plateNumber,
    claimNumber,
    surveyorName,
    reportDate,
    isAmended,
    parts,
    labor,
    paint,
    paintMaterials: paintMaterials.amount > 0 ? paintMaterials : undefined,
    paintBlending: paintBlending.amount > 0 ? paintBlending : undefined,
    additionalWorks,
    diminutionOfValue,
    otherOrSalvage,
    subtotal,
    vat,
    vatRatePercent: vatRate * 100,
    totalDemand,
    exactTotalDemand,
    roundedTotalDemand: roundedTotalDemand.amount > 0 ? roundedTotalDemand : undefined,
    surveyorFee: surveyorFee.amount > 0 ? surveyorFee : undefined,
    allCitations: citations,
    confidence: needsManualReview ? 'medium' : 'high',
    needsManualReview,
    reviewReasons,
  };
}

// ==========================================
// 6. חילוץ קיזוזים והפחתות (Deductions Extractor)
// ==========================================

export function extractDeductions(text: string): DeductionItem[] {
  const lines = linesOf(text);
  const deductions: DeductionItem[] = [];

  const deductionRules: Array<{
    category: DeductionCategory;
    keywords: string[];
    defaultLabel: string;
    isUnexplained: boolean;
  }> = [
    {
      category: 'deductible',
      keywords: ['השתתפות עצמית', 'דמי השתתפות', 'השתתפות'],
      defaultLabel: 'קיזוז השתתפות עצמית',
      isUnexplained: false,
    },
    {
      category: 'reinstatement',
      keywords: ['כינון', 'דמי כינון', 'כינון סכום ביטוח'],
      defaultLabel: 'קיזוז כינון',
      isUnexplained: false,
    },
    {
      category: 'depreciation',
      keywords: ['בלאי חלפים', 'בלאי', 'הפחתת גיל', 'הפחתת בלאי'],
      defaultLabel: 'הפחתת בלאי לחלפים',
      isUnexplained: false,
    },
    {
      category: 'opening_fee',
      keywords: ['דמי פתיחת תיק', 'פתיחת תיק', 'דמי טיפול'],
      defaultLabel: 'קיזוז דמי פתיחת תיק',
      isUnexplained: false,
    },
    {
      category: 'salvage',
      keywords: ['ערך שרידים', 'קיזוז שרידים', 'שרידים'],
      defaultLabel: 'קיזוז שרידים',
      isUnexplained: false,
    },
    {
      category: 'labor_cut',
      keywords: ['הפחתת שעות', 'הפחתת עבודה', 'הפרש שכר שעה', 'קיזוז עבודה'],
      defaultLabel: 'הפחתה בשעות עבודה / תעריף שעה',
      isUnexplained: false,
    },
    {
      category: 'part_cut',
      keywords: ['אי אישור חלף', 'הפחתת חלפים', 'חלק לא אושר', 'קיזוז חלפים'],
      defaultLabel: 'הפחתה / אי-אישור חלפים',
      isUnexplained: false,
    },
    {
      category: 'unexplained',
      keywords: ['הפחתה נוספת', 'קיזוז כללי', 'ניכוי מיוחד', 'הפחתה שרירותית', 'ניכוי שאינו מוסבר'],
      defaultLabel: 'קיזוז לא מוסבר שנדרש לבדיקה',
      isUnexplained: true,
    },
  ];

  let idCounter = 1;

  for (const line of lines) {
    for (const rule of deductionRules) {
      const matchedKeyword = rule.keywords.find((k) => line.includes(k));
      if (!matchedKeyword) continue;

      // חיפוש סכום בשורה
      const re = new RegExp(`${AMOUNT_PATTERN}`, 'g');
      let match: RegExpExecArray | null;
      while ((match = re.exec(line))) {
        const val = parseNumberString(match[1]);
        if (val > 0) {
          // מניעת כפילויות של אותה שורה
          const already = deductions.some((d) => d.amount === val && d.category === rule.category);
          if (!already) {
            deductions.push({
              id: `DED-${idCounter++}`,
              category: rule.category,
              label: rule.defaultLabel,
              amount: val,
              sourceSnippet: line.slice(0, 180),
              isUnexplained: rule.isUnexplained,
              reason: `זוהה לפי הביטוי "${matchedKeyword}" במסמך`,
            });
          }
        }
      }
    }
  }

  return deductions;
}

// ==========================================
// 7. חילוץ דוח נגדי של חברת הביטוח (Counter Report)
// ==========================================

export function extractCounterSurveyorReport(text: string): CounterReportExtraction {
  const clean = normalizeFinancialText(text);
  const reviewReasons: string[] = [];
  const citations: Record<string, string> = {};

  const approvedParts = extractAmountForLabel(clean, ['חלפים שאושרו', 'חלפים מאושרים', 'חלפים']);
  if (approvedParts.amount > 0) citations['חלפים שאושרו'] = approvedParts.sourceSnippet;

  const approvedLabor = extractAmountForLabel(clean, [
    'פחחות שאושרה',
    'עבודה שאושרה',
    'פחחות מאושרת',
    'שכר עבודה מאושר',
  ]);
  if (approvedLabor.amount > 0) citations['עבודה שאושרה'] = approvedLabor.sourceSnippet;

  const approvedPaint = extractAmountForLabel(clean, [
    'צבע שאושר',
    'חומרי צבע שאושרו',
    'צבע מאושר',
  ]);
  if (approvedPaint.amount > 0) citations['צבע שאושר'] = approvedPaint.sourceSnippet;

  const approvedSubtotal = extractAmountForLabel(clean, [
    'סה"כ מאושר לפני מע"מ',
    'סה״כ מאושר לפני מע״מ',
    'נזק מאושר',
  ]);
  if (approvedSubtotal.amount > 0) citations['מאושר לפני מע"מ'] = approvedSubtotal.sourceSnippet;

  const approvedVat = extractAmountForLabel(clean, ['מע"מ מאושר', 'מע״מ מאושר', 'מע"מ', 'מע״מ'], {
    rejectIfKeyword: ['לפני מע"מ', 'לפני מע״מ', 'בטרם מע"מ', 'ללא מע"מ', 'ללא מע״מ'],
  });
  if (approvedVat.amount > 0) citations['מע"מ מאושר'] = approvedVat.sourceSnippet;

  const approvedTotal = extractAmountForLabel(
    clean,
    [
      'סה"כ שומה מאושרת',
      'סה״כ שומה מאושרת',
      'סה"כ מאושר לתשלום',
      'סה״כ מאושר לתשלום',
      'סך הכל מאושר',
      'שומה נגדית מאושרת',
      'סה"כ שומה נגדית',
    ],
    { preferLast: true }
  );
  if (approvedTotal.amount > 0) citations['סה"כ שומה מאושרת'] = approvedTotal.sourceSnippet;

  // חילוץ קיזוזים והפחתות
  const deductions = extractDeductions(clean);

  // זיהוי שם חברת הביטוח והשמאי הנגדי
  const insurerMatch = clean.match(/(?:חברת\s*ביטוח|מבטחת|החברה)[\s:\-–—]*([א-תA-Za-z\s]{3,25})/i);
  const insurerName = insurerMatch ? insurerMatch[1].trim() : undefined;

  const counterSurveyorMatch = clean.match(/(?:שמאי\s*(?:מבטחת|בודק|נגדי)|שם\s*השמאי)\s*[:\-–—]\s*([א-ת\s]{2,25})/i);
  const counterSurveyorName = counterSurveyorMatch ? counterSurveyorMatch[1].trim() : undefined;

  if (approvedTotal.amount === 0) {
    reviewReasons.push('לא נמצא סכום שומה מאושר כולל בדוח הנגדי');
  }

  const needsManualReview = reviewReasons.length > 0 || approvedTotal.confidence !== 'high';

  return {
    kind: 'counter_surveyor_report',
    insurerName,
    counterSurveyorName,
    approvedParts,
    approvedLabor,
    approvedPaint,
    approvedSubtotal,
    approvedVat,
    approvedTotal,
    deductions,
    allCitations: citations,
    confidence: needsManualReview ? 'medium' : 'high',
    needsManualReview,
    reviewReasons,
  };
}

// ==========================================
// 8. חילוץ הודעת תשלום ופירוט סילוק (Payment Notice)
// ==========================================

export function extractPaymentNotice(text: string): PaymentNoticeExtraction {
  const clean = normalizeFinancialText(text);
  const reviewReasons: string[] = [];
  const citations: Record<string, string> = {};

  const reportedPaidAmount = extractAmountForLabel(
    clean,
    [
      'סכום ששולם',
      'שולם בפועל',
      'סכום ההעברה',
      'סכום התשלום',
      'סך הכל שולם',
      'סה"כ שולם',
      'סה״כ שולם',
      'סכום לפקודת',
      'סך תשלום',
    ],
    { preferLast: true }
  );
  if (reportedPaidAmount.amount > 0) citations['סכום ששולם'] = reportedPaidAmount.sourceSnippet;

  const approvedTotal = extractAmountForLabel(clean, [
    'סכום התביעה שאושר',
    'סך נזק מאושר',
    'סכום שאושר',
  ]);
  if (approvedTotal.amount > 0) citations['סכום שאושר'] = approvedTotal.sourceSnippet;

  const deductions = extractDeductions(clean);

  // תאריך תשלום
  const dateMatch = clean.match(/(?:תאריך\s*תשלום|תאריך\s*ערך|מועד\s*העברה)[\s:\-–—]*([0-9]{1,2}[./\-][0-9]{1,2}[./\-][0-9]{2,4})/i);
  const paymentDate = dateMatch ? dateMatch[1].trim() : undefined;

  // אסמכתא
  const refMatch = clean.match(/(?:אסמכתא|מספר\s*העברה|מספר\s*שיק|מס[\'׳.]?\s*שובר)[\s:\-–—]*([A-Z0-9\-]+)/i);
  const referenceNumber = refMatch ? refMatch[1].trim() : undefined;

  // מוטב
  const payeeMatch = clean.match(/(?:לפקודת|שם\s*המוטב|שולם\s*ל)[\s:\-–—]*([א-תA-Za-z\s]{3,25})/i);
  const payeeName = payeeMatch ? payeeMatch[1].trim() : undefined;

  // חברת ביטוח
  const insurerMatch = clean.match(/(?:משלם|חברת\s*הביטוח|חברה\s*משלמת)[\s:\-–—]*([א-תA-Za-z\s]{3,25})/i);
  const insurerName = insurerMatch ? insurerMatch[1].trim() : undefined;

  if (reportedPaidAmount.amount === 0) {
    reviewReasons.push('לא נמצא סכום תשלום בהודעת התשלום');
  }

  const isBreakdown = /פירוט\s*סילוק|מכתב\s*סילוק|חישוב\s*תשלום/i.test(clean);
  const needsManualReview = reviewReasons.length > 0 || reportedPaidAmount.confidence !== 'high';

  return {
    kind: isBreakdown ? 'payment_breakdown' : 'payment_notice',
    insurerName,
    paymentDate,
    reportedPaidAmount,
    referenceNumber,
    payeeName,
    approvedTotal: approvedTotal.amount > 0 ? approvedTotal : undefined,
    deductions,
    allCitations: citations,
    confidence: needsManualReview ? 'medium' : 'high',
    needsManualReview,
    reviewReasons,
  };
}

// ==========================================
// 9. מנוע השוואת דוחות (Financial Audit Comparator)
// ==========================================

export function compareFinancialAudit(params: {
  claimId: string;
  plateNumber: string;
  ourDemand: OurSurveyorReportExtraction | null;
  counterReport: CounterReportExtraction | null;
  paymentNotice: PaymentNoticeExtraction | null;
  verifiedPayments?: VerifiedPaymentEntry[];
}): FinancialComparisonResult {
  const { claimId, plateNumber, ourDemand, counterReport, paymentNotice, verifiedPayments = [] } = params;

  const rows: ComparisonTableRow[] = [];
  const reviewReasons: string[] = [];

  const verifiedPaidSum = verifiedPayments
    .filter((p) => p.verified)
    .reduce((sum, p) => sum + p.amount, 0);

  const reportedPaidAmount = paymentNotice?.reportedPaidAmount.amount || 0;
  const effectivePaid = verifiedPaidSum > 0 ? verifiedPaidSum : reportedPaidAmount;

  let hasPartCuts = false;
  let hasLaborCuts = false;
  let hasPaintCuts = false;
  let hasUnexplainedDeductions = false;

  // 1. שורת חלפים
  if (ourDemand && ourDemand.parts.amount > 0) {
    const dem = ourDemand.parts.amount;
    const app = counterReport && counterReport.approvedParts.amount > 0 ? counterReport.approvedParts.amount : null;
    const diff = app !== null ? Math.round((dem - app) * 100) / 100 : null;

    let explanation = 'אישור מלא של סעיף החלפים';
    let status: ComparisonTableRow['status'] = 'match';

    if (diff !== null && diff > 0) {
      hasPartCuts = true;
      status = 'reduction';
      const partDeduction = counterReport?.deductions.find((d) => d.category === 'part_cut' || d.category === 'depreciation');
      explanation = partDeduction
        ? `הפחתה של ${diff.toLocaleString()} ₪ בחלפים (${partDeduction.label})`
        : `הפחתה של ${diff.toLocaleString()} ₪ בחלפים ללא נימוק ברור`;
      if (!partDeduction) reviewReasons.push(`הפחתה של ${diff.toLocaleString()} ₪ בסעיף חלפים ללא נימוק`);
    } else if (app === null) {
      explanation = 'טרם התקבל אישור מפורט לחלפים';
      status = 'missing';
    }

    rows.push({
      category: 'חלפים',
      demanded: dem,
      approved: app,
      paid: null,
      diff,
      explanation,
      sourceSnippet: ourDemand.parts.sourceSnippet,
      status,
    });
  }

  // 2. שורת פחחות ועבודה
  if (ourDemand && ourDemand.labor.amount > 0) {
    const dem = ourDemand.labor.amount;
    const app = counterReport && counterReport.approvedLabor.amount > 0 ? counterReport.approvedLabor.amount : null;
    const diff = app !== null ? Math.round((dem - app) * 100) / 100 : null;

    let explanation = 'אישור מלא של שכר העבודה';
    let status: ComparisonTableRow['status'] = 'match';

    if (diff !== null && diff > 0) {
      hasLaborCuts = true;
      status = 'reduction';
      explanation = `הפחתה של ${diff.toLocaleString()} ₪ בשעות עבודה / תעריף שעה`;
      reviewReasons.push(`הפחתה של ${diff.toLocaleString()} ₪ בסעיף פחחות ועבודה`);
    } else if (app === null) {
      explanation = 'טרם התקבל אישור מפורט לעבודה';
      status = 'missing';
    }

    rows.push({
      category: 'פחחות / עבודה',
      demanded: dem,
      approved: app,
      paid: null,
      diff,
      explanation,
      sourceSnippet: ourDemand.labor.sourceSnippet,
      status,
    });
  }

  // 3. שורת צבע וחומרים
  if (ourDemand && ourDemand.paint.amount > 0) {
    const dem = ourDemand.paint.amount;
    const app = counterReport && counterReport.approvedPaint.amount > 0 ? counterReport.approvedPaint.amount : null;
    const diff = app !== null ? Math.round((dem - app) * 100) / 100 : null;

    let explanation = 'אישור מלא של סעיף הצבע';
    let status: ComparisonTableRow['status'] = 'match';

    if (diff !== null && diff > 0) {
      hasPaintCuts = true;
      status = 'reduction';
      explanation = `הפחתה של ${diff.toLocaleString()} ₪ בצבע וחומרים`;
      reviewReasons.push(`הפחתה של ${diff.toLocaleString()} ₪ בסעיף צבע`);
    } else if (app === null) {
      explanation = 'טרם התקבל אישור מפורט לצבע';
      status = 'missing';
    }

    rows.push({
      category: 'עבודות צבע (שכר עבודה)',
      demanded: dem,
      approved: app,
      paid: null,
      diff,
      explanation,
      sourceSnippet: ourDemand.paint.sourceSnippet,
      status,
    });
  }

  // 3ב. שורת חומרי צבע (נשמר בנפרד משכר עבודה)
  if (ourDemand && ourDemand.paintMaterials && ourDemand.paintMaterials.amount > 0) {
    const dem = ourDemand.paintMaterials.amount;
    rows.push({
      category: 'חומרי צבע (נפרד משכר עבודה)',
      demanded: dem,
      approved: null,
      paid: null,
      diff: null,
      explanation: 'חומרי צבע מקוריים/עזר לפי שומה',
      sourceSnippet: ourDemand.paintMaterials.sourceSnippet,
      status: 'missing',
    });
  }

  // 3ג. שורת טשטוש צבע (אם קיים סכום נפרד)
  if (ourDemand && ourDemand.paintBlending && ourDemand.paintBlending.amount > 0) {
    const dem = ourDemand.paintBlending.amount;
    rows.push({
      category: 'טשטוש צבע (התאמת גוון)',
      demanded: dem,
      approved: null,
      paid: null,
      diff: null,
      explanation: 'עבודות התאמת גוון וטשטוש צבע',
      sourceSnippet: ourDemand.paintBlending.sourceSnippet,
      status: 'missing',
    });
  }

  // 4. שורת עבודות נוספות ושינועים
  if (ourDemand && ourDemand.additionalWorks && ourDemand.additionalWorks.amount > 0) {
    const dem = ourDemand.additionalWorks.amount;
    const app =
      counterReport && counterReport.approvedAdditionalWorks && counterReport.approvedAdditionalWorks.amount > 0
        ? counterReport.approvedAdditionalWorks.amount
        : null;
    const diff = app !== null ? Math.round((dem - app) * 100) / 100 : null;

    let explanation = 'אישור מלא של עבודות נוספות ושינועים';
    let status: ComparisonTableRow['status'] = 'match';

    if (diff !== null && diff > 0) {
      status = 'reduction';
      explanation = `הפחתה של ${diff.toLocaleString()} ₪ בעבודות נוספות ושינועים`;
      reviewReasons.push(`הפחתה של ${diff.toLocaleString()} ₪ בסעיף עבודות נוספות ושינועים`);
    } else if (app === null) {
      explanation = 'טרם התקבל אישור מפורט לעבודות נוספות';
      status = 'missing';
    }

    rows.push({
      category: 'עבודות נוספות ושינועים',
      demanded: dem,
      approved: app,
      paid: null,
      diff,
      explanation,
      sourceSnippet: ourDemand.additionalWorks.sourceSnippet,
      status,
    });
  }

  // 5. שורת מע"מ
  if (ourDemand && ourDemand.vat.amount > 0) {
    const dem = ourDemand.vat.amount;
    const app = counterReport && counterReport.approvedVat.amount > 0 ? counterReport.approvedVat.amount : null;
    const diff = app !== null ? Math.round((dem - app) * 100) / 100 : null;

    rows.push({
      category: `מע"מ (${ourDemand.vatRatePercent}%)`,
      demanded: dem,
      approved: app,
      paid: null,
      diff,
      explanation: diff && diff > 0 ? `פער מע"מ עקב הפחתות בסך ${diff.toLocaleString()} ₪` : 'מע"מ תואם',
      sourceSnippet: ourDemand.vat.sourceSnippet,
      status: diff && diff > 0 ? 'reduction' : 'match',
    });
  }

  // 6. שורת ירידת ערך מסחרית
  if (ourDemand && ourDemand.diminutionOfValue && ourDemand.diminutionOfValue.amount > 0) {
    const dem = ourDemand.diminutionOfValue.amount;
    const app = counterReport && counterReport.approvedDiminution && counterReport.approvedDiminution.amount > 0 ? counterReport.approvedDiminution.amount : null;
    const diff = app !== null ? Math.round((dem - app) * 100) / 100 : null;

    rows.push({
      category: 'ירידת ערך מסחרית',
      demanded: dem,
      approved: app,
      paid: null,
      diff,
      explanation: diff && diff > 0 ? `הפחתת ירידת ערך בסך ${diff.toLocaleString()} ₪` : (app === null ? 'טרם התקבל אישור מפורט לירידת ערך' : 'ירידת ערך תואמת לשומה'),
      sourceSnippet: ourDemand.diminutionOfValue.sourceSnippet,
      status: diff && diff > 0 ? 'reduction' : (app === null ? 'missing' : 'match'),
    });
  }

  // 7. שורת שכר טרחת שמאי (מופרד לחלוטין מנזק הרכב)
  if (ourDemand && ourDemand.surveyorFee && ourDemand.surveyorFee.amount > 0) {
    rows.push({
      category: 'שכר טרחת שמאי (חשבון נפרד)',
      demanded: ourDemand.surveyorFee.amount,
      approved: null,
      paid: null,
      diff: null,
      explanation: 'חשבון עסקה נפרד של שכר טרחת שמאי (מופרד מתביעת נזק הרכב)',
      sourceSnippet: ourDemand.surveyorFee.sourceSnippet,
      status: 'missing',
    });
  }

  // 8. קיזוזים והפחתות
  const allDeductions = [...(counterReport?.deductions || []), ...(paymentNotice?.deductions || [])];
  const uniqueDeductions = allDeductions.filter(
    (ded, idx, arr) => arr.findIndex((d) => d.category === ded.category && d.amount === ded.amount) === idx
  );

  for (const deduction of uniqueDeductions) {
    if (deduction.isUnexplained) {
      hasUnexplainedDeductions = true;
      reviewReasons.push(`קיזוז לא מוסבר: ${deduction.label} בסך ${deduction.amount.toLocaleString()} ₪`);
    }

    rows.push({
      category: `קיזוז: ${deduction.label}`,
      demanded: 0,
      approved: -deduction.amount,
      paid: null,
      diff: deduction.amount,
      explanation: deduction.reason || `קיזוז שבוצע על ידי המבטחת (${deduction.sourceSnippet})`,
      sourceSnippet: deduction.sourceSnippet,
      status: deduction.isUnexplained ? 'unexplained' : 'reduction',
    });
  }

  // 9. שורת סיכום כולל (מציג את הסכום המדויק ומציין אם קיים סכום מעוגל בדוח)
  const totalDemanded = ourDemand?.exactTotalDemand?.amount || ourDemand?.totalDemand.amount || 0;
  const roundedNote =
    ourDemand?.roundedTotalDemand && ourDemand.roundedTotalDemand.amount > 0 && ourDemand.roundedTotalDemand.amount !== totalDemanded
      ? ` (מעוגל בדוח: ${ourDemand.roundedTotalDemand.amount.toLocaleString()} ₪)`
      : '';
  const totalApproved = counterReport?.approvedTotal.amount || (paymentNotice?.approvedTotal?.amount ?? 0);
  const diffDemandVsApproved = totalApproved > 0 ? Math.round((totalDemanded - totalApproved) * 100) / 100 : 0;
  const diffApprovedVsPaid =
    totalApproved > 0 && effectivePaid > 0 ? Math.round((totalApproved - effectivePaid) * 100) / 100 : 0;
  const totalRemainingUnpaid = Math.round((totalDemanded - effectivePaid) * 100) / 100;

  rows.push({
    category: `סה"כ שומה לתשלום${roundedNote}`,
    demanded: totalDemanded,
    approved: totalApproved > 0 ? totalApproved : null,
    paid: effectivePaid > 0 ? effectivePaid : null,
    diff: totalRemainingUnpaid,
    explanation:
      totalRemainingUnpaid <= 0
        ? 'התביעה שולמה במלואה'
        : `נותרה יתרה לתשלום של ${totalRemainingUnpaid.toLocaleString()} ₪${roundedNote}`,
    sourceSnippet: ourDemand?.exactTotalDemand?.sourceSnippet || ourDemand?.totalDemand.sourceSnippet || '',
    status: totalRemainingUnpaid <= 0 ? 'match' : 'reduction',
  });

  // המלצה לפעולה
  let recommendedAction = 'ממתין לקבלת דוח נגדי או הודעת תשלום';
  if (totalRemainingUnpaid <= 0 && totalDemanded > 0) {
    recommendedAction = 'התביעה שולמה במלואה. ניתן לסגור את התיק.';
  } else if (hasUnexplainedDeductions) {
    recommendedAction = 'נדרש מכתב השגה דחוף למבטחת עקב קיזוזים לא מוסברים.';
  } else if (hasPartCuts || hasLaborCuts || hasPaintCuts) {
    recommendedAction = 'חברת הביטוח ביצעה הפחתות בשומה. מומלץ להוציא מכתב דרישה להפרשים.';
  } else if (diffApprovedVsPaid > 0) {
    recommendedAction = `קיים פער של ${diffApprovedVsPaid.toLocaleString()} ₪ בין הסכום שאושר לתשלום שהתקבל בפועל.`;
  }

  const needsManualReview =
    reviewReasons.length > 0 ||
    hasUnexplainedDeductions ||
    (ourDemand?.needsManualReview ?? false) ||
    (counterReport?.needsManualReview ?? false);

  return {
    claimId,
    plateNumber,
    rows,
    totalDemanded,
    roundedTotalDemanded: ourDemand?.roundedTotalDemand?.amount,
    surveyorFeeDemanded: ourDemand?.surveyorFee?.amount,
    totalApproved,
    totalReportedPaid: reportedPaidAmount,
    totalVerifiedPaid: verifiedPaidSum,
    differenceDemandVsApproved: diffDemandVsApproved,
    differenceApprovedVsPaid: diffApprovedVsPaid,
    totalRemainingUnpaid,
    deductionsSummary: uniqueDeductions,
    hasUnexplainedDeductions,
    hasPartCuts,
    hasLaborCuts,
    hasPaintCuts,
    needsManualReview,
    reviewReasons,
    recommendedAction,
  };
}

// ==========================================
// 10. ניהול שינויים חסין דריסות (Concurrency & History Protection)
// ==========================================

export function createInitialFinancialAuditRowData(user: string): FinancialAuditRowData {
  const now = new Date().toISOString();
  return {
    schema_version: 1,
    updated_at: now,
    updated_by: user,
    lock_token: `TOK-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    our_demand: null,
    previous_demands: [],
    counter_reports: [],
    payment_notices: [],
    verified_payments: [],
    latest_comparison: null,
    history: [
      {
        timestamp: now,
        user,
        action: 'INIT',
        summary: 'אתחול מבנה בקרה כספית בתיק',
      },
    ],
  };
}

/**
 * מעדכן את נתוני הבקרה הכספית בצורה בטוחה, ללא דריסת שדות אחרים ב-row_data
 * תוך תיעוד היסטורי מקיף והגנה מהתנגשויות (Optimistic Locking).
 */
export function safelyUpdateFinancialAudit(params: {
  existingRowData: Record<string, unknown> | null;
  updatedBy: string;
  expectedLockToken?: string;
  actionSummary: string;
  patch: Partial<Omit<FinancialAuditRowData, 'history' | 'updated_at' | 'updated_by' | 'lock_token' | 'schema_version'>>;
}): { ok: true; newRowData: Record<string, unknown> } | { ok: false; error: string } {
  const { existingRowData, updatedBy, expectedLockToken, actionSummary, patch } = params;

  const row = existingRowData || {};
  const currentAudit = (row.financial_audit as FinancialAuditRowData) || createInitialFinancialAuditRowData(updatedBy);

  // מניעת דריסה במקרה של עריכה מקבילה (Optimistic Locking)
  if (expectedLockToken && currentAudit.lock_token && currentAudit.lock_token !== expectedLockToken) {
    return {
      ok: false,
      error: `התנגשות עריכה: המסמך עודכן במקביל ע"י ${currentAudit.updated_by} ב-${currentAudit.updated_at}. יש לרענן.`,
    };
  }

  const now = new Date().toISOString();
  const nextLockToken = `TOK-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // שמירת גרסה קודמת של דוח השמאי אם מתקבל דוח מתוקן
  let previousDemands = currentAudit.previous_demands || [];
  if (patch.our_demand && currentAudit.our_demand && patch.our_demand.isAmended) {
    previousDemands = [...previousDemands, currentAudit.our_demand];
  }

  const newAudit: FinancialAuditRowData = {
    ...currentAudit,
    ...patch,
    previous_demands: previousDemands,
    updated_at: now,
    updated_by: updatedBy,
    lock_token: nextLockToken,
    history: [
      ...currentAudit.history,
      {
        timestamp: now,
        user: updatedBy,
        action: 'UPDATE',
        summary: actionSummary,
        diff: {
          patch: { before: null, after: patch },
        },
      },
    ],
  };

  return {
    ok: true,
    newRowData: {
      ...row,
      financial_audit: newAudit,
    },
  };
}
