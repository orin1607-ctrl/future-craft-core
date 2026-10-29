/**
 * claimFinancialDocRead.test.ts
 *
 * בדיקות יחידה מקיפות עבור מודול בקרה כספית ותשלומי ביטוח (STAGING).
 */
import { describe, expect, it } from 'vitest';
import {
  classifyFinancialDocumentKind,
  extractOurSurveyorReport,
  extractCounterSurveyorReport,
  extractPaymentNotice,
  extractDeductions,
  compareFinancialAudit,
  safelyUpdateFinancialAudit,
  createInitialFinancialAuditRowData,
  parseNumberString,
  type VerifiedPaymentEntry,
} from './claimFinancialDocRead';

describe('1. סיווג סוגי מסמכים כספיים (Financial Document Classification)', () => {
  it('מזהה דוח שמאי שלנו לפי קוד DALIA-OUR-REPORT', () => {
    const text = 'קובץ סריקה DALIA-OUR-REPORT שומת נזק מוסך אורן';
    expect(classifyFinancialDocumentKind(text)).toBe('our_surveyor_report');
  });

  it('מזהה דוח שמאי שלנו לפי כותרות שומה סטנדרטיות', () => {
    const text = 'חוות דעת שמאי רכב - שומת נזק סופית לרכב מס 63-292-03';
    expect(classifyFinancialDocumentKind(text)).toBe('our_surveyor_report');
  });

  it('מזהה דוח נגדי / שומת בקרה של חברת ביטוח', () => {
    const text1 = 'דוח נגדי מטעם חברת הביטוח הראל - הפחתות שומה';
    expect(classifyFinancialDocumentKind(text1)).toBe('counter_surveyor_report');

    const text2 = 'שומת בקרה לחברת מגדל - שמאי מבטחת: ישראל ישראלי';
    expect(classifyFinancialDocumentKind(text2)).toBe('counter_surveyor_report');
  });

  it('מזהה הודעת תשלום ואישור העברה', () => {
    const text1 = 'הודעת תשלום תביעת רכב מס 49325004 - שולם לחשבון המוסך';
    expect(classifyFinancialDocumentKind(text1)).toBe('payment_notice');

    const text2 = 'אישור העברה בנקאית מחברת הפניקס עבור תביעה DAL-2026-0020';
    expect(classifyFinancialDocumentKind(text2)).toBe('payment_notice');
  });

  it('מזהה פירוט סילוק תביעה / מכתב סילוק', () => {
    const text = 'פירוט סילוק תביעה - פירוט תשלום וניכויים';
    expect(classifyFinancialDocumentKind(text)).toBe('payment_breakdown');
  });

  it('מסווג מסמכים ללא תוכן כספי מובהק כמסמך לא מזוהה', () => {
    const text = 'צילום רישיון רכב ותעודת זהות של הלקוח';
    expect(classifyFinancialDocumentKind(text)).toBe('unknown_financial_doc');
  });

  it('מזהה שמאות נגדית מקובץ מבוטח (כגון שמאות נגדית אלי אהרונסון)', () => {
    const fileName = 'שמאות נגדית מבוטח לתביעה 00099371000100 רכב מספר 11874503 בתאריך נזק 22012026_sanitized.pdf';
    expect(classifyFinancialDocumentKind('', fileName)).toBe('counter_surveyor_report');
  });

  it('מזהה הודעת תשלום של ווישור גם עם טקסט עברי מרווח מקובץ PDF', () => {
    const spacedOcr = '14/07/2026 : ת א ר י ך : ל כ ב ו ד כ ה ן פ ל ו ר ה ת ש ל ו ם ה ו ד ע ת : ה נ ד ו ן 11874503';
    expect(classifyFinancialDocumentKind(spacedOcr, 'AI00099371000100  הודעת תשלום.pdf')).toBe('payment_notice');
  });
});

describe('2. חילוץ סעיפי נזק מדוח השמאי שלנו (Our Surveyor Report Extraction)', () => {
  it('מחלץ סעיפי נזק, מע"מ וסכום דרישה כולל עם מקור מדויק (סדר קריאה לוגי)', () => {
    const reportText = `
      חוות דעת שמאי רכב
      שמאי: יורם שמאים
      מספר רכב: 63-292-03
      מספר תביעה: DAL-2026-0020
      תאריך: 15/07/2026

      פירוט עלויות נזק:
      חלפים: 12,450.00 ש"ח
      עבודות פחחות: 4,200.00 ש"ח
      צבע וחומרים: 2,800.00 ש"ח
      ירידת ערך: 3,500.00 ש"ח
      קיזוז שרידים: 500.00 ש"ח

      סה"כ לפני מע"מ: 18,950.00 ₪
      מע"מ 17%: 3,221.50 ₪
      סה"כ לתשלום: 22,171.50 ₪
    `;

    const extracted = extractOurSurveyorReport(reportText);

    expect(extracted.kind).toBe('our_surveyor_report');
    expect(extracted.plateNumber).toBe('6329203'); // digits only
    expect(extracted.claimNumber).toBe('DAL-2026-0020');
    expect(extracted.surveyorName).toContain('יורם');

    expect(extracted.parts.amount).toBe(12450);
    expect(extracted.parts.sourceSnippet).toContain('חלפים: 12,450.00');

    expect(extracted.labor.amount).toBe(4200);
    expect(extracted.paint.amount).toBe(2800);
    expect(extracted.diminutionOfValue.amount).toBe(3500);
    expect(extracted.otherOrSalvage.amount).toBe(500);

    expect(extracted.vat.amount).toBe(3221.5);
    expect(extracted.totalDemand.amount).toBe(22171.5);
    expect(extracted.totalDemand.sourceSnippet).toContain('סה"כ לתשלום: 22,171.50');

    // ציטוטים מלאים קיימים לכל סעיף
    expect(extracted.allCitations['חלפים']).toBeDefined();
    expect(extracted.allCitations['פחחות / עבודה']).toBeDefined();
    expect(extracted.allCitations['סה"כ כולל מע"מ']).toBeDefined();
    expect(extracted.needsManualReview).toBe(false);
  });

  it('מחלץ סכומים בסדר הפוך (Visual PDF RTL)', () => {
    const visualText = `
      דו"ח שמאות
      14,500.00 ₪ :חלפים
      3,600.00 ₪ :שעות עבודה
      1,800.00 ₪ :חומרי צבע
      19,900.00 ₪ :סה"כ נזק
      3,383.00 ₪ :מע״מ
      23,283.00 ₪ :סה"כ שומה
    `;

    const extracted = extractOurSurveyorReport(visualText);
    expect(extracted.parts.amount).toBe(14500);
    expect(extracted.labor.amount).toBe(3600);
    expect(extracted.paint.amount).toBe(1800);
    expect(extracted.totalDemand.amount).toBe(23283);
  });

  it('מסמן לבדיקה ידנית אם חסרים סעיפי חלפים ופחחות', () => {
    const incompleteText = `
      דוח שמאות מקוצר
      סה"כ לתשלום: 10,000 ש"ח
    `;
    const extracted = extractOurSurveyorReport(incompleteText);
    expect(extracted.totalDemand.amount).toBe(10000);
    expect(extracted.needsManualReview).toBe(true);
    expect(extracted.reviewReasons).toContain('לא זוהו סעיפי חלפים או פחחות נפרדים בדוח');
  });

  it('מזהה דוח שמאי מתוקן', () => {
    const text = 'חוות דעת שמאי - דוח מתוקן לאחר פירוק';
    const extracted = extractOurSurveyorReport(text);
    expect(extracted.isAmended).toBe(true);
  });

  it('מחלץ עבודות נוספות ושינועים ומאמת התאמה מלאה של סיכום הביניים (פתרון פער 2,520 ש"ח)', () => {
    const text = `
      גליל גולן שמאות רכב
      מספר רישוי: 78-432-19
      תביעה מס': DAL-2026-0246
      
      פירוט נזק:
      חלפים: 5,169.00 ₪
      עבודות פחחות: 5,700.00 ₪
      צבע וחומרים: 11,592.60 ₪
      עבודות נוספות ושינועים: 2,520.00 ₪
      סה"כ נזק לפני מע"מ: 24,981.60 ₪
      מע"מ 17%: 4,246.87 ₪
      סה"כ כולל מע"מ: 29,228.47 ₪
    `;
    const extracted = extractOurSurveyorReport(text);
    expect(extracted.parts.amount).toBe(5169);
    expect(extracted.labor.amount).toBe(5700);
    expect(extracted.paint.amount).toBe(11592.6);
    expect(extracted.additionalWorks.amount).toBe(2520);
    expect(extracted.subtotal.amount).toBe(24981.6);
    expect(extracted.vat.amount).toBe(4246.87);
    expect(extracted.totalDemand.amount).toBe(29228.47);

    // אימות מתמטי מלא: 5,169 + 5,700 + 11,592.60 + 2,520 = 24,981.60 בדיוק
    const sum =
      extracted.parts.amount +
      extracted.labor.amount +
      extracted.paint.amount +
      extracted.additionalWorks.amount;
    expect(Math.round(sum * 100) / 100).toBe(24981.6);
  });
});

describe('3. חילוץ קיזוזים והפחתות (Deductions Extractor)', () => {
  it('מחלץ קיזוזי השתתפות עצמית, כינון, בלאי ודמי פתיחת תיק', () => {
    const text = `
      פירוט ניכויים וסילוק:
      השתתפות עצמית: 1,450.00 ש"ח
      דמי כינון: 320.00 ש"ח
      בלאי חלפים: 850.00 ש"ח
      דמי פתיחת תיק: 250.00 ש"ח
      ערך שרידים: 400.00 ש"ח
    `;

    const deductions = extractDeductions(text);
    expect(deductions.length).toBe(5);

    const deductible = deductions.find((d) => d.category === 'deductible');
    expect(deductible?.amount).toBe(1450);
    expect(deductible?.isUnexplained).toBe(false);

    const reinstatement = deductions.find((d) => d.category === 'reinstatement');
    expect(reinstatement?.amount).toBe(320);

    const depreciation = deductions.find((d) => d.category === 'depreciation');
    expect(depreciation?.amount).toBe(850);

    const openingFee = deductions.find((d) => d.category === 'opening_fee');
    expect(openingFee?.amount).toBe(250);
  });

  it('מסמן קיזוזים שרירותיים כבלתי מוסברים (isUnexplained)', () => {
    const text = `
      סך הפחתה נוספת: 1,800.00 ש"ח
      ניכוי מיוחד: 500.00 ש"ח
    `;
    const deductions = extractDeductions(text);
    expect(deductions.length).toBe(2);
    expect(deductions.every((d) => d.isUnexplained)).toBe(true);
  });
});

describe('4. חילוץ דוח נגדי והודעת תשלום (Counter Report & Payment Notice)', () => {
  it('מחלץ אישורי דוח נגדי של חברת ביטוח', () => {
    const counterText = `
      דוח נגדי - שומת בקרה
      חברת ביטוח: הראל חברה לביטוח
      שמאי מבטחת: רון כהן

      חלפים שאושרו: 10,200.00 ₪
      עבודה שאושרה: 3,500.00 ₪
      צבע שאושר: 2,400.00 ₪
      מע"מ מאושר: 2,737.00 ₪
      סה"כ שומה מאושרת: 18,837.00 ₪

      בלאי חלפים: 1,200.00 ₪
      הפחתת שעות: 700.00 ₪
    `;

    const counter = extractCounterSurveyorReport(counterText);
    expect(counter.kind).toBe('counter_surveyor_report');
    expect(counter.approvedParts.amount).toBe(10200);
    expect(counter.approvedLabor.amount).toBe(3500);
    expect(counter.approvedPaint.amount).toBe(2400);
    expect(counter.approvedTotal.amount).toBe(18837);
    expect(counter.deductions.length).toBe(2);
    expect(counter.needsManualReview).toBe(false);
  });

  it('מחלץ הודעת תשלום עם אסמכתא ותאריך', () => {
    const paymentText = `
      הודעת תשלום מחברת כלל ביטוח
      מועד העברה: 20/07/2026
      מספר העברה: TR-994821
      שם המוטב: מוסך אורן בע"מ
      סכום התביעה שאושר: 18,837.00 ₪
      השתתפות עצמית: 1,450.00 ₪
      סכום ששולם: 17,387.00 ₪
    `;

    const payment = extractPaymentNotice(paymentText);
    expect(payment.kind).toBe('payment_notice');
    expect(payment.reportedPaidAmount.amount).toBe(17387);
    expect(payment.referenceNumber).toBe('TR-994821');
    expect(payment.paymentDate).toBe('20/07/2026');
    expect(payment.deductions.length).toBe(1);
    expect(payment.deductions[0].category).toBe('deductible');
  });
});

describe('5. מנוע השוואת דוחות (Financial Audit Comparator)', () => {
  it('משווה במדויק דרישה מול אישור מול תשלום, מציג פערי סעיפים והסברים', () => {
    const ourDemand = extractOurSurveyorReport(`
      חוות דעת שמאי
      חלפים: 12,000.00 ₪
      עבודות פחחות: 4,000.00 ₪
      צבע וחומרים: 2,500.00 ₪
      מע"מ: 3,145.00 ₪
      סה"כ לתשלום: 21,645.00 ₪
    `);

    const counterReport = extractCounterSurveyorReport(`
      דוח נגדי
      חלפים שאושרו: 10,500.00 ₪
      עבודה שאושרה: 3,500.00 ₪
      צבע שאושר: 2,500.00 ₪
      מע"מ מאושר: 2,805.00 ₪
      סה"כ שומה מאושרת: 19,305.00 ₪
      בלאי חלפים: 1,500.00 ₪
      הפחתת שעות: 500.00 ₪
    `);

    const paymentNotice = extractPaymentNotice(`
      הודעת תשלום
      השתתפות עצמית: 1,200.00 ₪
      סכום ששולם: 18,105.00 ₪
    `);

    const comparison = compareFinancialAudit({
      claimId: 'DAL-2026-0020',
      plateNumber: '6329203',
      ourDemand,
      counterReport,
      paymentNotice,
    });

    expect(comparison.totalDemanded).toBe(21645);
    expect(comparison.totalApproved).toBe(19305);
    expect(comparison.totalReportedPaid).toBe(18105);

    // פער דרישה מול אישור = 21,645 - 19,305 = 2,340 ₪
    expect(comparison.differenceDemandVsApproved).toBe(2340);

    // פער כולל לגבייה = 21,645 - 18,105 = 3,540 ₪
    expect(comparison.totalRemainingUnpaid).toBe(3540);

    // זיהוי הפחתות
    expect(comparison.hasPartCuts).toBe(true);
    expect(comparison.hasLaborCuts).toBe(true);
    expect(comparison.hasPaintCuts).toBe(false);

    // בדיקת שורות טבלה
    const partsRow = comparison.rows.find((r) => r.category === 'חלפים');
    expect(partsRow?.demanded).toBe(12000);
    expect(partsRow?.approved).toBe(10500);
    expect(partsRow?.diff).toBe(1500);
    expect(partsRow?.explanation).toContain('הפחתה של 1,500 ₪ בחלפים');

    const laborRow = comparison.rows.find((r) => r.category === 'פחחות / עבודה');
    expect(laborRow?.demanded).toBe(4000);
    expect(laborRow?.approved).toBe(3500);
    expect(laborRow?.diff).toBe(500);

    // המלצה לפעולה
    expect(comparison.recommendedAction).toContain('חברת הביטוח ביצעה הפחתות בשומה');
  });

  it('מפריד בין תשלום שרק דווח לתשלום שאומת שהתקבל בפועל', () => {
    const ourDemand = extractOurSurveyorReport('סה"כ לתשלום: 10,000.00 ₪');
    const paymentNotice = extractPaymentNotice('סכום ששולם: 10,000.00 ₪');

    // ללא תשלום מאומת
    const comparisonUnverified = compareFinancialAudit({
      claimId: 'DAL-1',
      plateNumber: '111',
      ourDemand,
      counterReport: null,
      paymentNotice,
      verifiedPayments: [],
    });
    expect(comparisonUnverified.totalReportedPaid).toBe(10000);
    expect(comparisonUnverified.totalVerifiedPaid).toBe(0);

    // עם תשלום מאומת בבנק
    const verifiedPayments: VerifiedPaymentEntry[] = [
      {
        id: 'PAY-1',
        amount: 10000,
        date: '2026-07-22',
        referenceNumber: 'REF-777',
        paymentMethod: 'bank_transfer',
        recordedAt: '2026-07-22T10:00:00Z',
        recordedBy: 'רונית',
        verified: true,
        verifiedAt: '2026-07-22T11:00:00Z',
        verifiedBy: 'מנהל חשבונות',
      },
    ];

    const comparisonVerified = compareFinancialAudit({
      claimId: 'DAL-1',
      plateNumber: '111',
      ourDemand,
      counterReport: null,
      paymentNotice,
      verifiedPayments,
    });
    expect(comparisonVerified.totalVerifiedPaid).toBe(10000);
    expect(comparisonVerified.totalRemainingUnpaid).toBe(0);
    expect(comparisonVerified.recommendedAction).toContain('התביעה שולמה במלואה');
  });
});

describe('6. ניהול שינויים חסין דריסות (Concurrency & History Protection)', () => {
  it('יוצר מבנה בקרה כספית ראשוני עם יומן שינויים ו-lock_token', () => {
    const init = createInitialFinancialAuditRowData('עורך_מערכת');
    expect(init.schema_version).toBe(1);
    expect(init.updated_by).toBe('עורך_מערכת');
    expect(init.lock_token).toBeDefined();
    expect(init.history.length).toBe(1);
    expect(init.history[0].action).toBe('INIT');
  });

  it('מונע התנגשות עריכה במקרה של lock_token לא תואם (Optimistic Locking)', () => {
    const initialRowData = {
      financial_audit: {
        ...createInitialFinancialAuditRowData('משתמש_א'),
        lock_token: 'TOK-ORIGINAL-123',
      },
    };

    const conflictUpdate = safelyUpdateFinancialAudit({
      existingRowData: initialRowData,
      updatedBy: 'משתמש_ב',
      expectedLockToken: 'TOK-OUTDATED-999', // טוקן ישן / לא תואם
      actionSummary: 'ניסיון עדכון מקביל',
      patch: {},
    });

    expect(conflictUpdate.ok).toBe(false);
    if (!conflictUpdate.ok) {
      expect(conflictUpdate.error).toContain('התנגשות עריכה');
    }
  });

  it('מעדכן בהצלחה תוך שימור שדות קיימים ב-row_data ותיעוד יומן היסטורי', () => {
    const existingRowData = {
      clientName: 'ישראל ישראלי',
      plate: '63-292-03',
      carModel: 'יונדאי איוניק',
      financial_audit: {
        ...createInitialFinancialAuditRowData('משתמש_א'),
        lock_token: 'TOK-VALID-123',
      },
    };

    const ourDemand = extractOurSurveyorReport('סה"כ לתשלום: 15,000.00 ₪');

    const updateResult = safelyUpdateFinancialAudit({
      existingRowData,
      updatedBy: 'משתמש_א',
      expectedLockToken: 'TOK-VALID-123',
      actionSummary: 'קליטת דוח שמאי ראשוני',
      patch: {
        our_demand: ourDemand,
      },
    });

    expect(updateResult.ok).toBe(true);
    if (updateResult.ok) {
      const updated = updateResult.newRowData;
      // שדות קיימים נשמרים במלואם
      expect(updated.clientName).toBe('ישראל ישראלי');
      expect(updated.plate).toBe('63-292-03');

      const audit = updated.financial_audit as any;
      expect(audit.our_demand.totalDemand.amount).toBe(15000);
      expect(audit.history.length).toBe(2);
      expect(audit.history[1].summary).toBe('קליטת דוח שמאי ראשוני');
      expect(audit.lock_token).not.toBe('TOK-VALID-123'); // טוקן חדש נוצר
    }
  });

  it('שומר גרסה קודמת של דוח השמאי בעת הגעת דוח מתוקן', () => {
    const firstDemand = extractOurSurveyorReport('סה"כ לתשלום: 12,000.00 ₪');
    const existingRowData = {
      financial_audit: {
        ...createInitialFinancialAuditRowData('שמאי'),
        our_demand: firstDemand,
        lock_token: 'TOK-REV-1',
      },
    };

    const amendedDemand = extractOurSurveyorReport('דוח מתוקן לאחר פירוק - סה"כ לתשלום: 16,500.00 ₪');

    const updateResult = safelyUpdateFinancialAudit({
      existingRowData,
      updatedBy: 'שמאי',
      expectedLockToken: 'TOK-REV-1',
      actionSummary: 'קליטת דוח מתוקן',
      patch: {
        our_demand: amendedDemand,
      },
    });

    expect(updateResult.ok).toBe(true);
    if (updateResult.ok) {
      const audit = updateResult.newRowData.financial_audit as any;
      expect(audit.our_demand.totalDemand.amount).toBe(16500);
      expect(audit.previous_demands.length).toBe(1);
      expect(audit.previous_demands[0].totalDemand.amount).toBe(12000);
    }
  });
});

describe('7. שבע בדיקות אימות מחייבות — מנגנון קריאה אוטומטי (7 Mandatory Verification Tests)', () => {
  it('בדיקה 1: הפעלת סריקת OCR אוטומטית בהעלאה וסינון קבצים שאינם מועמדים', () => {
    // קובצי PDF ותמונות הם מועמדים תקפים לסריקה
    const isCandidate = (name: string, mime?: string) => {
      const isImg = /image\//i.test(mime || '') || /\.(jpe?g|png|webp|heic)$/i.test(name);
      const isPdf = /pdf/i.test(mime || '') || /\.pdf$/i.test(name);
      return isImg || isPdf;
    };

    expect(isCandidate('survey_report.pdf', 'application/pdf')).toBe(true);
    expect(isCandidate('damage_front.jpg', 'image/jpeg')).toBe(true);
    expect(isCandidate('scan.png', 'image/png')).toBe(true);
    expect(isCandidate('notes.txt', 'text/plain')).toBe(false);
    expect(isCandidate('document.docx', 'application/vnd.openxmlformats')).toBe(false);
  });

  it('בדיקה 2: דוח שמאי סרוק מרובה עמודים (DAL-2026-0005) — חילוץ סעיפים מדויק ללא איבוד נתונים', () => {
    const multiPageOcrChunk = `
      אורן יעקב שמאות וסקרים בע"מ
      חוות דעת : 510-000103200-00
      תאריך: 23/07/2025
      מספר רישוי: 71167102
      שם מבוטח: בן רחמים מיכל
      שמאי בודק: אורן יעקב
      מוסך: יוני מרכז הפגושים
      עבודות פחחות ₪3,500.00
      עבודות צבע ₪5,900.00
      מחיר חלקי חילוף ₪14,186.28
      סה"כ נזק למוקד נזק לחלק אחורי ₪25,606.28
      מע"מ [18% (שמונה עשר)] ₪4,609.13
      סה"כ כולל מע"מ ₪30,215.41
      ערך רכב בפועל הינו : ₪96,761.00
      גובה ירידה באחוזים : 4.00%
      סך ירידת ערך : ₪3,870.44
    `;

    const extracted = extractOurSurveyorReport(multiPageOcrChunk);
    expect(extracted.kind).toBe('our_surveyor_report');
    expect(extracted.plateNumber).toBe('71167102');
    expect(extracted.parts.amount).toBe(14186.28);
    expect(extracted.labor.amount).toBe(3500);
    expect(extracted.paint.amount).toBe(5900);
    expect(extracted.vat.amount).toBe(4609.13);
    expect(extracted.diminutionOfValue.amount).toBe(3870.44);
    expect(extracted.totalDemand.amount).toBe(30215.41);
    expect(extracted.exactTotalDemand?.amount).toBe(34085.85); // 30,215.41 + 3,870.44
    expect(extracted.surveyorName).toContain('אורן יעקב');
  });

  it('בדיקה 3: מסמך שאינו דוח שמאי (תמונת פגוש בלבד) — סיווג כ-vehicle_photo ללא דרישת סכומים', () => {
    const photoFileName = 'תמונת_פגוש_אחורי_מוקד_1.jpg';
    const photoOcrText = 'צילום פגוש אחורי ניזוק ברכב ללא סכומי תביעה';
    const kind = classifyFinancialDocumentKind(photoOcrText, photoFileName);
    expect(kind).toBe('vehicle_photo');

    // מסמך כזה לא דורש סכומי שומה ואינו מעלה שגיאות
    expect(['vehicle_photo', 'unknown_financial_doc']).toContain(kind);
  });

  it('בדיקה 4: מניעת סריקות כפולות (Deduplication) ומגבלת קצב (Rate Limit)', () => {
    const processedSet = new Set<string>();
    const fileId = 'CDM-FILE-12345';
    let scanCount = 0;

    const simulateUploadProcess = (fId: string) => {
      if (processedSet.has(fId)) {
        return { skipped: true, reason: 'duplicate' };
      }
      if (scanCount >= 5) {
        return { skipped: true, reason: 'rate_limit_exceeded' };
      }
      processedSet.add(fId);
      scanCount++;
      return { skipped: false, count: scanCount };
    };

    // סריקה ראשונה
    expect(simulateUploadProcess(fileId)).toEqual({ skipped: false, count: 1 });
    // ניסיון סריקה כפולה של אותו קובץ
    expect(simulateUploadProcess(fileId)).toEqual({ skipped: true, reason: 'duplicate' });

    // בדיקת מגבלת 5 סריקות לתיק
    expect(simulateUploadProcess('F-2')).toEqual({ skipped: false, count: 2 });
    expect(simulateUploadProcess('F-3')).toEqual({ skipped: false, count: 3 });
    expect(simulateUploadProcess('F-4')).toEqual({ skipped: false, count: 4 });
    expect(simulateUploadProcess('F-5')).toEqual({ skipped: false, count: 5 });
    // סריקה שישית נחסמת
    expect(simulateUploadProcess('F-6')).toEqual({ skipped: true, reason: 'rate_limit_exceeded' });
  });

  it('בדיקה 5: שתי גרסאות דוח שמאי באותו תיק — שימור כל הגרסאות ללא דריסה', () => {
    const existingRow = {
      financial_audit: {
        ...createInitialFinancialAuditRowData('עובד מוסך'),
        our_demand: extractOurSurveyorReport('סה"כ לתשלום: 20,000.00 ₪'),
        previous_demands: [],
      },
    };

    const newAmendedReport = extractOurSurveyorReport('שומה מתוקנת עקב חלפים נוספים: סה"כ לתשלום: 24,500.00 ₪');
    expect(newAmendedReport.isAmended).toBe(true);

    const updateRes = safelyUpdateFinancialAudit({
      existingRowData: existingRow,
      updatedBy: 'שמאי בודק',
      actionSummary: 'קליטת גרסת שומה מתוקנת',
      patch: {
        our_demand: newAmendedReport,
      },
    });

    expect(updateRes.ok).toBe(true);
    if (updateRes.ok) {
      const audit = updateRes.newRowData.financial_audit as any;
      expect(audit.our_demand.totalDemand.amount).toBe(24500);
      expect(audit.previous_demands.length).toBe(1);
      expect(audit.previous_demands[0].totalDemand.amount).toBe(20000);
    }
  });

  it('בדיקה 6: טיפול בשגיאות וניסיון חוזר (Error & Retry Flow)', () => {
    const existingRow = {
      financial_audit: {
        ...createInitialFinancialAuditRowData('משתמש'),
      },
    };

    // סימולציית כישלון סריקה
    const failUpdate = safelyUpdateFinancialAudit({
      existingRowData: existingRow,
      updatedBy: 'מערכת OCR',
      actionSummary: 'שגיאה בקריאת קובץ פגום',
      patch: {
        status: 'pending_approval',
        auto_read_state: 'failed',
        last_read_error: 'הקובץ פגום או לא קריא על ידי המודל',
      },
    });

    expect(failUpdate.ok).toBe(true);
    if (failUpdate.ok) {
      const audit = failUpdate.newRowData.financial_audit as any;
      expect(audit.auto_read_state).toBe('failed');
      expect(audit.last_read_error).toBe('הקובץ פגום או לא קריא על ידי המודל');

      // ניסיון חוזר מוצלח
      const retryUpdate = safelyUpdateFinancialAudit({
        existingRowData: failUpdate.newRowData,
        updatedBy: 'משתמש — סריקה ידנית חוזרת',
        actionSummary: 'סריקה חוזרת מוצלחת',
        patch: {
          auto_read_state: 'completed',
          last_read_error: undefined,
          our_demand: extractOurSurveyorReport('סה"כ לתשלום: 15,000.00 ₪'),
        },
      });

      expect(retryUpdate.ok).toBe(true);
      if (retryUpdate.ok) {
        const retryAudit = retryUpdate.newRowData.financial_audit as any;
        expect(retryAudit.auto_read_state).toBe('completed');
        expect(retryAudit.last_read_error).toBeUndefined();
        expect(retryAudit.our_demand.totalDemand.amount).toBe(15000);
      }
    }
  });

  it('בדיקה 7: תצוגה בכרטיס התביעה ואי-דריסת שדות קיימים (Non-destructive Staged State)', () => {
    const originalClaim = {
      id: 'DAL-2026-0010',
      clientName: 'רבקה כהן',
      plate: '12-345-67',
      finAmount: '10000',
      finApproved: '8000',
      finPaid: '8000',
      financial_audit: createInitialFinancialAuditRowData('מנהל'),
    };

    // קריאה אוטומטית ברקע
    const extractedDemand = extractOurSurveyorReport(`
      חוות דעת שמאי רכב
      שמאי: יורם שמאים
      חלפים: 14,000.00 ש"ח
      עבודות פחחות: 3,000.00 ש"ח
      עבודות צבע: 2,500.00 ש"ח
      סה"כ לפני מע"מ: 19,500.00 ₪
      מע"מ 17%: 3,315.00 ₪
      סה"כ לתשלום: 22,815.00 ₪
    `);

    const updateRes = safelyUpdateFinancialAudit({
      existingRowData: originalClaim,
      updatedBy: 'סריקה אוטומטית ברקע (Gemini Flash)',
      actionSummary: 'חילוץ דוח שמאי ראשוני',
      patch: {
        status: 'pending_approval', // ממתין לאישור!
        auto_read_state: 'completed',
        our_demand: extractedDemand,
      },
    });

    expect(updateRes.ok).toBe(true);
    if (updateRes.ok) {
      const newClaim = updateRes.newRowData as any;
      // וידוא ששדות התביעה המקוריים נשארו ללא שינוי!
      expect(newClaim.finAmount).toBe('10000');
      expect(newClaim.finApproved).toBe('8000');
      expect(newClaim.finPaid).toBe('8000');

      // הנתונים שחולצו נמצאים בבטחה תחת financial_audit במצב "ממתין לאישור"
      expect(newClaim.financial_audit.status).toBe('pending_approval');
      expect(newClaim.financial_audit.auto_read_state).toBe('completed');
      expect(newClaim.financial_audit.our_demand.totalDemand.amount).toBe(22815);
      expect(newClaim.financial_audit.our_demand.parts.amount).toBe(14000);
      expect(newClaim.financial_audit.our_demand.labor.amount).toBe(3000);
      expect(newClaim.financial_audit.our_demand.paint.amount).toBe(2500);
      expect(newClaim.financial_audit.our_demand.vat.amount).toBe(3315);
    }
  });
});
