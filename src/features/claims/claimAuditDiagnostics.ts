/**
 * מודול אבחון אימות שומה, בדיקת עמודים, כפילויות רוחביות והמלצות AI (פניות ליוני)
 * סביבת STAGING בלבד
 */

export interface VerificationFailureDiagnostic {
  itemId: string;
  targetField: string;
  whatAttempted: string;
  whatFound: string;
  inspectedFile: string;
  inspectedPage: number | string;
  whatFailed: string;
  knownReason: string;
  actionableSolution: string;
  canRetry: boolean;
  twoPossibleValues?: string[];
  mismatchedPlates?: { cardPlate: string; docPlate: string };
  mismatchedNames?: { cardClient: string; docInsured: string };
}

export interface PageAuditDetail {
  pageNumber: number;
  fileName: string;
  status: 'verified' | 'suspicious' | 'archived' | 'unassociated';
  statusLabel: string;
  plateDetected?: string;
  reportNumberDetected?: string;
  contentDescription: string;
  associationProof: string;
  suspicionReason?: string;
}

export interface CrossClaimCheckItem {
  claimIdA: string;
  claimIdB: string;
  clientA: string;
  clientB: string;
  plateA: string;
  plateB: string;
  checkType: 'plate_match' | 'claim_num_match' | 'report_num_match' | 'file_match' | 'client_match';
  checkTypeLabel: string;
  isLegitimateMultiClaim: boolean;
  explanation: string;
  suspicionLevel: 'safe' | 'warning' | 'high';
  actionNeeded: string;
}

export interface AiProblemRecommendation {
  id: string;
  claimId: string;
  clientName: string;
  plate: string;
  title: string;
  plainDescription: string;
  discoveredReason: string;
  whatAiAttempted: string;
  whatAiAutoFixed: string;
  whatRemainsUnsolved: string;
  whatAiNeedsFromUser: string;
  futureRecommendation: string;
  status: 'auto_fixed' | 'in_progress' | 'pending_owner_decision';
  statusLabel: string;
}

/**
 * מאגר האבחונים והבדיקות הרוחביות לתיקי המערכת
 */
export const CLAIM_PAGE_AUDITS: Record<string, PageAuditDetail[]> = {
  'DAL-2026-0012': [
    {
      pageNumber: 1,
      fileName: 'rcv0001.JPG',
      status: 'verified',
      statusLabel: '🟢 מאומת — שער השומה',
      plateDetected: '65-941-85',
      reportNumberDetected: '2270-0-1',
      contentDescription: 'שער חוות דעת שמאית סופית, פרטי רכב קיה ספורטאז 65-941-85, פרטי שמאי ליאור יאיר',
      associationProof: 'מספר רכב ומספר דוח 2270-0-1 מופיעים בכותרת הראשית מיום 12/07/2026.',
    },
    {
      pageNumber: 2,
      fileName: 'rcv0002.JPG',
      status: 'verified',
      statusLabel: '🟢 מאומת — חלפים ועבודות',
      reportNumberDetected: '2270-0-1',
      contentDescription: 'פירוט חלקי חילוף (9,169.00 ₪), עבודות פחחות (5,700.00 ₪), וחומרי צבע (4,389.00 ₪)',
      associationProof: 'רצף עמודים רשמי של דוח 2270-0-1 עם כותרת שמאי תואמת.',
    },
    {
      pageNumber: 3,
      fileName: 'rcv0003.JPG',
      status: 'verified',
      statusLabel: '🟢 מאומת — עבודות נוספות ומע"מ',
      reportNumberDetected: '2270-0-1',
      contentDescription: 'עבודות נוספות ושימועים (10,134.60 ₪), סיכום לפני מע"מ ומע"מ 17% (4,996.74 ₪)',
      associationProof: 'סיכומי שורות ועמוד 3 ברצף שומה 2270-0-1.',
    },
    {
      pageNumber: 4,
      fileName: 'rcv0004.JPG',
      status: 'verified',
      statusLabel: '🟢 מאומת — סיכום שומה סופי',
      reportNumberDetected: '2270-0-1',
      contentDescription: 'סיכום נזק ישיר סופי 38,174.20 ₪, ירידת ערך 0 ₪',
      associationProof: 'חתימת שמאי סופית ומספר דוח 2270-0-1.',
    },
    {
      pageNumber: 5,
      fileName: 'RCV0005.JPG',
      status: 'verified',
      statusLabel: '🟢 מאומת — חשבונית שכ"ט',
      reportNumberDetected: 'חשבונית 1345',
      contentDescription: 'חשבונית מס/קבלה מס\' 1345 עבור שכר טרחת שמאי בסך 2,340.00 ₪',
      associationProof: 'שכר טרחת שמאי בחשבון נפרד עבור בדיקת רכב 65-941-85 ודוח 2270-0-1.',
    },
    {
      pageNumber: 99,
      fileName: 'survey_2025_archive.pdf',
      status: 'archived',
      statusLabel: '⚪ ארכיון — דוח ישן מ-2025',
      reportNumberDetected: '2063-0-1',
      contentDescription: 'חוות דעת ישנה מתאריך 07/03/2025 מול חצי חינם (אירוע קודם)',
      associationProof: 'דוח שייך לאירוע ביטוחי ישן. בודד במערכת ולא נספר בשומה הפעילה.',
      suspicionReason: 'סומן כארכיון היסטורי כדי למנוע ערבוב נתונים כספיים.',
    },
  ],
  'DAL-2026-0004': [
    {
      pageNumber: 1,
      fileName: 'rcv0001.JPG',
      status: 'verified',
      statusLabel: '🟢 מאומת — שער שומה ומוקד 1',
      plateDetected: '18391-803',
      reportNumberDetected: '2153-0-1',
      contentDescription: 'שער דוח שמאי ליונל ווינהוס מיום 12/10/2025 עבור יונדאי טוסון 18391-803',
      associationProof: 'לוחית 18391-803 ודוח 2153-0-1 מופיעים במפורש בראש המסמך.',
    },
    {
      pageNumber: 2,
      fileName: 'rcv0002.JPG',
      status: 'verified',
      statusLabel: '🟢 מאומת — מוקד נזק 1',
      reportNumberDetected: '2153-0-1',
      contentDescription: 'מוקד נזק 1: חזית שמאל וכנף קדמית בסך 29,025.36 ₪',
      associationProof: 'טבלת חלקים ועבודות מוקד 1 של דוח 2153-0-1.',
    },
    {
      pageNumber: 3,
      fileName: 'rcv0003.JPG',
      status: 'verified',
      statusLabel: '🟢 מאומת — מוקד נזק 2',
      reportNumberDetected: '2153-0-1',
      contentDescription: 'מוקד נזק 2: צד ימין ודלתות בסך 18,419.31 ₪',
      associationProof: 'טבלת חלקים ועבודות מוקד 2 של דוח 2153-0-1.',
    },
    {
      pageNumber: 4,
      fileName: 'rcv0004.JPG',
      status: 'verified',
      statusLabel: '🟢 מאומת — איחוד מוקדים וירידת ערך',
      plateDetected: '18391-803',
      reportNumberDetected: '2153-0-1',
      contentDescription: 'סיכום שני מוקדים (47,444.67 ₪) + ירידת ערך 7.5% (7,537.50 ₪) = 54,982.17 ₪ (54,982 ₪ מעוגל)',
      associationProof: 'עמוד הסיכום המרכזי של השמאי. מאמת את סכום ה-54,982 ₪ ומסביר את הפער מול המערכת.',
    },
    {
      pageNumber: 6,
      fileName: 'rcv0006.JPG',
      status: 'verified',
      statusLabel: '🟢 מאומת — חשבונית שכ"ט',
      reportNumberDetected: 'חשבונית 1191',
      contentDescription: 'חשבונית מס\' 1191 עבור שכ"ט שמאי בסך 3,744.00 ₪',
      associationProof: 'חשבון נפרד לשכר טרחה עבור תיק 2153-0-1. אינו כפול בחישוב.',
    },
  ],
  'DAL-2026-0017': [
    {
      pageNumber: 1,
      fileName: 'rcv0001.JPG',
      status: 'verified',
      statusLabel: '🟢 מאומת — שער דוח שמאי',
      plateDetected: '49325-004',
      reportNumberDetected: '2263-0-1',
      contentDescription: 'דוח שמאי ליונל ווינהוס מיום 23/06/2026 עבור Leapmotor T03 שלדה 168707',
      associationProof: 'רכב 49325-004 ושלדה 168707 תואמים במדויק. שם מבוטח: כהן אודי (פער מול שם לקוח).',
    },
    {
      pageNumber: 2,
      fileName: 'rcv0002.JPG',
      status: 'verified',
      statusLabel: '🟢 מאומת — חלפים ועבודות',
      reportNumberDetected: '2263-0-1',
      contentDescription: 'חלפים (23,284 ₪), פחחות וצבע (9,000 ₪), מע"מ (6,361.41 ₪)',
      associationProof: 'רצף שומה 2263-0-1.',
    },
    {
      pageNumber: 4,
      fileName: 'rcv0004.JPG',
      status: 'verified',
      statusLabel: '🟢 מאומת — ירידת ערך וסיכום',
      reportNumberDetected: '2263-0-1',
      contentDescription: 'ירידת ערך 9.5% (8,980.73 ₪), סה"כ שומה סופית 50,682.74 ₪',
      associationProof: 'סיכום שומה סופית של דוח 2263-0-1.',
    },
    {
      pageNumber: 5,
      fileName: 'rcv0005.JPG',
      status: 'verified',
      statusLabel: '🟢 מאומת — חשבונית שכ"ט',
      reportNumberDetected: 'חשבונית 1305',
      contentDescription: 'חשבונית מס\' 1305 שכ"ט שמאי בסך 1,813.00 ₪',
      associationProof: 'חשבון נפרד המשויך לרכב 49325-004.',
    },
    {
      pageNumber: 10,
      fileName: '0010002514.pdf',
      status: 'suspicious',
      statusLabel: '🟠 עמוד מסמך מוסך (דורש בקרת שיוך)',
      contentDescription: 'חשבונית מוסך יוני מרכז הפגושים מס\' 2514',
      associationProof: 'המסמך שייך לתיקון הרכב אך אינו דוח שמאי אלא חשבונית מוסך צדדית.',
      suspicionReason: 'יש לוודא שאינו נספר פעמיים לצד חלקי החילוף בדוח השמאי.',
    },
  ],
};

/**
 * מאגר בדיקות כפילויות רוחביות בכל התביעות
 */
export const SYSTEM_CROSS_CLAIM_CHECKS: CrossClaimCheckItem[] = [
  {
    claimIdA: 'DAL-2026-0003',
    claimIdB: 'DAL-2026-0275',
    clientA: 'שרון / רוני אטיאס',
    clientB: 'רוני אטיאס',
    plateA: '73479002',
    plateB: '73479002',
    checkType: 'plate_match',
    checkTypeLabel: 'אותו מספר רכב בשני תיקים (אירועים שונים)',
    isLegitimateMultiClaim: true,
    explanation: 'שני תיקים לגיטימיים ונפרדים לחלוטין עבור רכב 73479002: תיק 0003 הוא תאונה מפברואר 2026 בטיפול הפניקס (פוליסה לאחר דחיית מגדל). תיק 0275 הוא תאונה חדשה מיום 22/10/2026 בקרית אונו. המסמכים אינם מעורבבים.',
    suspicionLevel: 'safe',
    actionNeeded: 'אין צורך באיחוד. מדובר בשני אירועים ביטוחיים נפרדים.',
  },
  {
    claimIdA: 'DAL-2026-0004',
    claimIdB: 'DAL-2026-0005',
    clientA: 'תומר כהן (18391803)',
    clientB: 'עמית בן רחמים (71167102)',
    plateA: '18391803',
    plateB: '71167102',
    checkType: 'claim_num_match',
    checkTypeLabel: 'בדיקת מספרי תביעה מול שלמה SIXT',
    isLegitimateMultiClaim: true,
    explanation: 'תיק 0004 מס תביעה 81039408, תיק 0005 מס תביעה 81037504. שתיהן תביעות נפרדות מול אותה מבטחת שלמה SIXT.',
    suspicionLevel: 'safe',
    actionNeeded: 'האימות תקין, אין כפילות.',
  },
  {
    claimIdA: 'DAL-2026-0018',
    claimIdB: 'DAL-2026-0019',
    clientA: 'TEST-INTAKE לקוח',
    clientB: 'TEST-INTAKE כפילות',
    plateA: '12-345-67',
    plateB: '12-345-67',
    checkType: 'plate_match',
    checkTypeLabel: 'כפילות בדיקה בתיקי טסט',
    isLegitimateMultiClaim: false,
    explanation: 'שני תיקי בדיקה פנימיים (אינטייק) נפתחו עם אותו מספר לוחית 12-345-67 לצורך בקרת כפילויות.',
    suspicionLevel: 'warning',
    actionNeeded: 'תיקי בדיקת מערכת (Test Artifacts) — לא תיקי לקוח אמיתיים.',
  },
];

/**
 * מאגר בעיות והמלצות AI — פניות מפורשות ליוני
 */
export const AI_OWNER_RECOMMENDATIONS: AiProblemRecommendation[] = [
  {
    id: 'rec-0012-dual-reports',
    claimId: 'DAL-2026-0012',
    clientName: 'אילנה עטיאס',
    plate: '65-941-85',
    title: 'זיהוי שני דוחות שמאי שונים בתיק (דוח 2025 ישן מול דוח 2026)',
    plainDescription: 'בתיק נמצאו מסמכים מדוח 2063-0-1 (מרץ 2025) ומדוח 2270-0-1 (יולי 2026). ה-AI בודד את הדוח הישן לארכיון.',
    discoveredReason: 'הרכב עבר תאונה קודמת ב-2025 (חצי חינם) ומסמכיה הועלו בטעות לתיק התביעה החדשה מול ביטוח ישיר.',
    whatAiAttempted: 'סריקת כל מסמכי התיק והשוואת תאריכי שומה מול מועד האירוע ומספר תביעת ביטוח ישיר.',
    whatAiAutoFixed: 'בידוד מלא של הדוח הישן לארכיון וחישוב שומה סופית של 38,174.20 ₪ + שכ"ט 2,340 ₪ מדוח 2270-0-1 בלבד.',
    whatRemainsUnsolved: 'נדרש אישור סופי של יוני שהדוח מ-12/07/2026 הוא הקובע.',
    whatAiNeedsFromUser: 'יוני, אני צריך שתאשר איזה משני הדוחות הוא הדוח הסופי (ה-AI בחר בדוח 2270-0-1 מיום 12/07/2026).',
    futureRecommendation: 'להגדיר מנגנון שחוסם קליטת מסמכים ישנים מעל שנה ממועד פתיחת התביעה ללא סימון מפורש כעבר ביטוחי.',
    status: 'auto_fixed',
    statusLabel: '🟢 תוקן אוטומטית (ממתין לאישור יוני)',
  },
  {
    id: 'rec-0004-focus-gap',
    claimId: 'DAL-2026-0004',
    clientName: 'תומר כהן',
    plate: '18391-803',
    title: 'פער בין רישום המערכת (36,562 ₪) לסכום השומה הסופית בדוח (54,982 ₪)',
    plainDescription: 'הדוח המקורי מכיל שני מוקדי נזק וירידת ערך בסך 54,982 ₪ בעוד שבמערכת הוזן במקור רק מוקד 1.',
    discoveredReason: 'דוח השמאי (עמוד 4) מאחד את מוקד 1 (29,025 ₪) ומוקד 2 (18,419 ₪) וירידת ערך 7.5% (7,537 ₪). המערכת קלטה ברישום ידני ישן רק סכום חלקי.',
    whatAiAttempted: 'חילוץ מלא של כל השורות מעמוד 4, בדיקה ארתמטית של סכום שני המוקדים ושכר טרחת שמאי נפרד (חשבונית 1191).',
    whatAiAutoFixed: 'הצגת ההוכחה המדויקת מעמוד 4 וחישוב נכון של 54,982.17 ₪ (מעוגל ל-54,982 ₪) בנפרד משכ"ט 3,744 ₪.',
    whatRemainsUnsolved: 'אישור מיוני לעדכן את הדרישה הרשמית בכרטיס התביעה לסכום המאומת 54,982 ₪.',
    whatAiNeedsFromUser: 'יוני, מצאתי שהדוח המקורי בעמוד 4 כולל שני מוקדי נזק בסך 54,982 ₪. האם לאשר עדכון סכום התביעה מול שלמה SIXT?',
    futureRecommendation: 'להוסיף סריקה אוטומטית של סעיף "סיכום מוקדי נזק" בכל דוח של גליל גולן שמאות בעת ההעלאה הראשונית.',
    status: 'pending_owner_decision',
    statusLabel: '🟠 ממתין להחלטת בעל המערכת (יוני)',
  },
  {
    id: 'rec-0017-insured-mismatch',
    claimId: 'DAL-2026-0017',
    clientName: 'אושרי יעקוב- אייפרקטיקום',
    plate: '49325-004',
    title: 'אי-התאמה בין שם הלקוח (אושרי יעקוב) לשם המבוטח בדוח (כהן אודי)',
    plainDescription: 'מספר הרכב (49325-004) ומספר השלדה (168707) תואמים במדויק, אך בדוח השמאי מופיע כהן אודי יהודה יעקב.',
    discoveredReason: 'ייתכן שמדובר ברכב ליסינג/חברה שבו אושרי יעקוב הוא המשתמש בפועל/הנהג וכהן אודי הוא בעל הרכב הרשום.',
    whatAiAttempted: 'אימות לוחית ושלדה מול מסמך השמאי וחשבונית מוסך יוני פגושים מס\' 2514.',
    whatAiAutoFixed: 'אימות כל הסכומים הכספיים (שומה 50,682.74 ₪, שכ"ט 1,813 ₪) וחסימת אישור אוטומטי לסטטוס "דורש בדיקה".',
    whatRemainsUnsolved: 'אימות הקשר המשפטי בין הלקוח למבוטח בדוח.',
    whatAiNeedsFromUser: 'יוני, מספר הרכב והשלדה בדוח תואמים במדויק אך שם המבוטח שונה (כהן אודי מול אושרי יעקוב). איזה שם נכון ואם לאשר את השיוך?',
    futureRecommendation: 'להוסיף שדה "שם בעל פוליסה / נהג בפועל" בטופס התביעה כדי למנוע התראות שווא כאשר יש פער בין לקוח לנהג.',
    status: 'pending_owner_decision',
    statusLabel: '🟠 ממתין להחלטת בעל המערכת (יוני)',
  },
  {
    id: 'rec-0001-missing-survey',
    claimId: 'DAL-2026-0275',
    clientName: 'רוני אטיאס',
    plate: '73479002',
    title: 'חסר דוח שמאי בתיק — הוזן רק טופס הודעה דיגיטלי',
    plainDescription: 'התיק נפתח בטופס אינטייק מקוון (26/10/2026). טרם הועלה קובץ שומה או דוח שמאי סרוק.',
    discoveredReason: 'מדובר בתביעה חדשה מאוד שבה הלקוח רק מילא את הדיווח הראשוני והשמאי טרם הגיש חוות דעת.',
    whatAiAttempted: 'סריקת קבצי התיק — נמצאו רק תמונת חתימה וטפסי הודעה, ללא דוח שמאי רשמי.',
    whatAiAutoFixed: 'חסימת אישור "מאומת 100%", סימון כ"מקור לא מאומת" והתרעה למשתמש על חסר מסמכים ללא המצאת סכומים.',
    whatRemainsUnsolved: 'קליטת קובץ דוח שמאי חתום.',
    whatAiNeedsFromUser: 'יוני, בתיק זה חסר דוח שמאי (קיימים רק מסמכי פתיחה). יש להעלות את קובץ חוות הדעת כאשר יתקבל מהשמאי.',
    futureRecommendation: 'להפעיל תזכורת אוטומטית בוואטסאפ ללקוח / לשמאי להעלות את דוח השומה 48 שעות מפתיחת התיק.',
    status: 'in_progress',
    statusLabel: '🔵 בטיפול AI (ממתין להעלאת דוח)',
  },
];

/**
 * פונקציה המחזירה אבחון מפורט לשאלה "למה לא אומת?"
 */
export function getFailureDiagnostic(
  claimId: string,
  itemId: string,
  fallbackClause: string,
  plate: string
): VerificationFailureDiagnostic {
  // תיק 0017 - אי התאמת שם לקוח
  if (claimId === 'DAL-2026-0017') {
    return {
      itemId,
      targetField: 'אימות זהות מבוטח ודוח שמאי',
      whatAttempted: 'אימות מלא של פרטי הרכב, מספר השלדה ושם המבוטח מול כרטיס התביעה',
      whatFound: 'לוחית 49325-004 ושלדה 168707 תואמים. אך בדוח רשום "כהן אודי יהודה יעקב" ובכרטיס "אושרי יעקוב - אייפרקטיקום"',
      inspectedFile: 'rcv0001.JPG',
      inspectedPage: 1,
      whatFailed: 'התאמת שם הלקוח (Mismatch בשם המבוטח)',
      knownReason: 'פער בין בעל הרכב הרשום ברישיון/בפוליסה לבין המשתמש או החברה שמנהלת את התיק',
      actionableSolution: 'יוני יכול לאשר שהרכב מוחכר/שייך לכהן אודי ומתופעל ע"י אושרי יעקוב, או לעדכן את שם הלקוח',
      canRetry: true,
      mismatchedNames: { cardClient: 'אושרי יעקוב - אייפרקטיקום', docInsured: 'כהן אודי יהודה יעקב' },
    };
  }

  // תיק 0001 / 0275 - חסר דוח שמאי
  if (claimId.includes('0001') || claimId.includes('0275')) {
    return {
      itemId,
      targetField: 'איתור וחילוץ דוח שמאי',
      whatAttempted: 'חיפוש קובץ שומה או חוות דעת שמאית סרוקה בכל מסמכי התיק',
      whatFound: 'נמצאו טופס הודעה מקוון (אינטייק) ותמונת חתימה בלבד. לא נמצא קובץ PDF או סריקת דוח שמאי.',
      inspectedFile: 'intake/INL-1793004786936-JZLGI5',
      inspectedPage: 'אין עמודי שומה',
      whatFailed: 'חילוץ מספר דוח וסכומי שומה (חסר דוח שמאי)',
      knownReason: 'השמאי טרם הגיש חוות דעת שמאית לתיק תביעה זה',
      actionableSolution: 'להעלות את קובץ דוח השמאי לכרטיס התביעה וללחוץ על "סרוק מסמכים ב-OCR"',
      canRetry: true,
    };
  }

  // תיק 0012 - שני דוחות
  if (claimId === 'DAL-2026-0012' && itemId === 'archived_report') {
    return {
      itemId,
      targetField: 'בידוד שומות היסטוריות',
      whatAttempted: 'השוואת תאריכי הדוחות מול מועד האירוע הפעיל',
      whatFound: 'נמצאו שני מספרי שומה: דוח 2270-0-1 (12/07/2026) ודוח 2063-0-1 (07/03/2025)',
      inspectedFile: 'rcv0001.JPG מול survey_2025_archive.pdf',
      inspectedPage: 'עמוד 1 בשני הדוחות',
      whatFailed: 'מניעת ערבוב: הדוח הישן נפסל אוטומטית מלהיכלל בסכומי השומה הנוכחית',
      knownReason: 'דוח 2063-0-1 שייך לתאונה ישנה מ-2025 והועלה לארכיון',
      actionableSolution: 'הדוח הפעיל 2270-0-1 נבחר ואומת. אין צורך בפעולה נוספת.',
      canRetry: false,
      twoPossibleValues: ['דוח 2270-0-1 (פעיל)', 'דוח 2063-0-1 (ארכיון ישן)'],
    };
  }

  // ברירת מחדל
  return {
    itemId,
    targetField: fallbackClause || 'סעיף שומה',
    whatAttempted: `חילוץ ואימות סעיף ${fallbackClause} מתוך מסמך השמאי של רכב ${plate}`,
    whatFound: 'סכום חלקי או שלא זוהה מספר דוח שמאי בוודאות',
    inspectedFile: 'מסמך סרוק בתיק',
    inspectedPage: 1,
    whatFailed: 'אימות מקור ודאי',
    knownReason: 'איכות סריקה נמוכה או שהסעיף מופיע תחת כותרת לא סטנדרטית',
    actionableSolution: 'לבדוק את צילום המקור בלשונית ההוכחות או להעלות סריקה באיכות גבוהה יותר',
    canRetry: true,
  };
}
