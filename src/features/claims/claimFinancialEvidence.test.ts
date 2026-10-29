import { describe, it, expect } from 'bun:test';
import {
  getClaimFinancialEvidence,
  VERIFIED_EVIDENCE_REGISTRY,
  CLAIMS_WITHOUT_SURVEYOR_REPORT,
} from './claimFinancialEvidence';

describe('אימות והוכחות חזותיות לדוחות שמאי (Claim Financial Evidence Engine)', () => {
  it('DAL-2026-0007 — מאמת 100% עבור אילן בן עזרי (60294-401) ו-7,843 ₪ עבודות צבע וטשטוש', () => {
    const ev = getClaimFinancialEvidence('DAL-2026-0007', '60294401', 'אילן עובד רינות');
    expect(ev.overallQuality).toBe('verified');
    expect(ev.claimId).toBe('DAL-2026-0007');
    expect(ev.plateNumber).toBe('60294-401');
    expect(ev.clientName).toContain('בנעזרי אילן');

    const paintItem = ev.items.find((i) => i.id === 'paint_labor');
    expect(paintItem).toBeDefined();
    expect(paintItem?.docAmount).toBe(7843.0);
    expect(paintItem?.extractedAmount).toBe(7843.0);
    expect(paintItem?.diff).toBe(0);
    expect(paintItem?.status).toBe('verified');
    expect(paintItem?.cropUrl).toContain('0007-paint-labor-crop.png');
    expect(paintItem?.page).toBe(1);

    // בדיקה חשבונאית מלאה
    expect(ev.accounting.isMathematicallySound).toBe(true);
    expect(ev.accounting.laborSubtotal).toBe(18110.0);
    expect(ev.accounting.partsSubtotal).toBe(4056.0);
    expect(ev.accounting.subtotalBeforeVat).toBe(22166.0);
    expect(ev.accounting.vatRatePercent).toBe(17);
    expect(ev.accounting.vatAmount).toBe(3768.22);
    expect(ev.accounting.directDamageTotal).toBe(25934.22);
    expect(ev.accounting.diminutionOfValue).toBe(5696.01);
    expect(ev.accounting.finalReportTotal).toBe(31630.23);
  });

  it('DAL-2026-0017 — מסומן "דורש בדיקה" עקב פער שם הלקוח (אושרי יעקוב מול כהן אודי)', () => {
    const ev = getClaimFinancialEvidence('DAL-2026-0017', '49325004', 'אושרי יעקוב - אייפרקטיקום');
    expect(ev.overallQuality).toBe('needs_review');
    expect(ev.overallQualityLabel).toContain('דורש בדיקה');
    expect(ev.versions.length).toBe(3);

    // גרסה 1: הצעת תיקון
    const v1 = ev.versions.find((v) => v.versionId === 'V1');
    expect(v1?.docType).toBe('הצעת תיקון ראשונית');
    expect(v1?.totalAmount).toBe(22700.0);
    expect(v1?.isSelected).toBe(false);

    // גרסה 2: חשבונית מוסך
    const v2 = ev.versions.find((v) => v.versionId === 'V2');
    expect(v2?.docType).toBe('חשבונית מוסך');
    expect(v2?.totalAmount).toBe(41702.01);
    expect(v2?.isSelected).toBe(false);

    // גרסה 3: חוות דעת סופית נבחרת
    const v3 = ev.versions.find((v) => v.versionId === 'V3');
    expect(v3?.docType).toBe('חוות דעת שמאי סופית');
    expect(v3?.totalAmount).toBe(50682.74);
    expect(v3?.isSelected).toBe(true);

    // אימות סעיפי הדוח הסופי
    const totalItem = ev.items.find((i) => i.id === 'total');
    expect(totalItem?.docAmount).toBe(50682.74);
    expect(totalItem?.status).toBe('needs_review');
    expect(ev.accounting.diminutionOfValue).toBe(8980.73);
  });

  it('DAL-2026-0020 — מאמת את אליהו אטיאס: 55,839.58 ₪ מדויק מול 55,840 ₪ מעוגל (רכב 63292-003)', () => {
    const ev = getClaimFinancialEvidence('DAL-2026-0020', '63292003', 'אליהו אטיאס');
    expect(ev.overallQuality).toBe('verified');
    expect(ev.plateNumber).toBe('63292-003');

    const exactItem = ev.items.find((i) => i.id === 'total_exact');
    expect(exactItem?.docAmount).toBe(55839.58);

    const roundedItem = ev.items.find((i) => i.id === 'total_rounded');
    expect(roundedItem?.docAmount).toBe(55840.0);

    const laborItem = ev.items.find((i) => i.id === 'labor');
    expect(laborItem?.docAmount).toBe(19714.52);
    expect(laborItem?.cropUrl).toContain('0020-labor-crop.png');

    const diminutionItem = ev.items.find((i) => i.id === 'diminution');
    expect(diminutionItem?.docAmount).toBe(7897.05);

    expect(ev.accounting.isMathematicallySound).toBe(true);
    expect(ev.accounting.vatRatePercent).toBe(17);
    expect(ev.accounting.vatAmount).toBe(6966.01);
  });

  it('DAL-2026-0004 — מאמת את תומר כהן: סכום שומה סופי 54,982 ₪ (איחוד מוקד 1 ו-2) ושכ"ט 3,744 ₪', () => {
    const ev = getClaimFinancialEvidence('DAL-2026-0004', '18391803', 'תומר כהן');
    expect(ev.overallQuality).toBe('verified');
    expect(ev.plateNumber).toBe('18391-803');
    expect(ev.accounting.isMathematicallySound).toBe(true);
    expect(ev.accounting.directDamageTotal).toBe(47444.67);
    expect(ev.accounting.diminutionOfValue).toBe(7537.5);
    expect(ev.accounting.finalReportTotal).toBe(54982.17);
    expect(ev.accounting.surveyorFee).toBe(3744.0);
    expect(ev.accounting.grandTotalWithFee).toBe(58726.17);
    expect(ev.certificate?.isCertified).toBe(true);
    expect(ev.certificate?.certificateText).toContain('בדקתי את מספר הרכב בדוח השמאי');
  });

  it('DAL-2026-0012 — מאמת את אילנה אטיאס: הפרדת תביעה ישנה, שומה עדכנית 38,174 ₪ ושכ"ט 4,329 ₪', () => {
    const ev = getClaimFinancialEvidence('DAL-2026-0012', '6594185', 'אילנה אטיאס');
    expect(ev.overallQuality).toBe('verified');
    expect(ev.plateNumber).toBe('65-941-85');
    expect(ev.versions.length).toBe(2);
    expect(ev.versions.find((v) => v.versionId === 'V1')?.docType).toContain('תביעה קודמת ישנה');
    expect(ev.accounting.isMathematicallySound).toBe(true);
    expect(ev.accounting.directDamageTotal).toBe(34389.34);
    expect(ev.accounting.diminutionOfValue).toBe(3784.86);
    expect(ev.accounting.finalReportTotal).toBe(38174.2);
    expect(ev.accounting.surveyorFee).toBe(4329.0);
    expect(ev.accounting.grandTotalWithFee).toBe(42503.2);
    expect(ev.certificate?.isCertified).toBe(true);
  });

  it('DAL-2026-0003 — מסומן "דורש בדיקה" עקב טעות הקלדת השמאי בלוחית (73779-002 מול 73479002)', () => {
    const ev = getClaimFinancialEvidence('DAL-2026-0003', '73479002', 'שרון / רוני אטיאס');
    expect(ev.overallQuality).toBe('needs_review');
    expect(ev.overallQualityLabel).toContain('דורש בדיקה');

    const totalItem = ev.items.find((i) => i.id === 'total');
    expect(totalItem?.docAmount).toBe(44025.0);
    expect(ev.accounting.diminutionOfValue).toBe(5820.66);
    expect(ev.accounting.directDamageTotal).toBe(38204.24);
  });

  it('DAL-2026-0008 — מוכן להעברה לעו"ד: אימות מלא של שומת שמאי (35,239 ₪), הודעת תשלום ווישור (13,186.36 ₪ + מקדמה 6,000 ₪) ויתרת חוב (15,543.00 ₪)', () => {
    const ev = getClaimFinancialEvidence('DAL-2026-0008', '11874503', 'אלימלך דוד / פלורה כהן');
    expect(ev.overallQuality).toBe('valid');
    expect(ev.overallQualityLabel).toContain('מוכן להעברה לעו"ד');
    expect(ev.reportNumber).toBe('2201-0-1');
    expect(ev.accounting.finalReportTotal).toBe(35239.0);
    expect(ev.accounting.diminutionOfValue).toBe(4997.01);
    expect(ev.accounting.surveyorFee).toBe(2574.0);

    const damageItem = ev.items.find((i) => i.id === 'clause_damage');
    expect(damageItem?.docAmount).toBe(24242.0);

    const disputedItem = ev.items.find((i) => i.id === 'clause_disputed_balance');
    expect(disputedItem?.docAmount).toBe(15543.0);
  });

  it('DAL-2026-0015 — מסומן "דורש בדיקה" ומעדכן לסכום המקור 23,308 ₪ (במקום 21,500 ₪)', () => {
    const ev = getClaimFinancialEvidence('DAL-2026-0015', '64375201', 'מור שטיינמן');
    expect(ev.overallQuality).toBe('needs_review');
    expect(ev.overallQualityLabel).toContain('23,308');

    const totalItem = ev.items.find((i) => i.id === 'total');
    expect(totalItem?.docAmount).toBe(23308.0);
  });

  it('DAL-2026-0016 — מסומן "דורש בדיקה" ומעדכן לסכום המקור 8,706.08 ₪ (במקום 38,900 ₪)', () => {
    const ev = getClaimFinancialEvidence('DAL-2026-0016', '6563513', 'Ipraktikum / שירה בורידא');
    expect(ev.overallQuality).toBe('needs_review');
    expect(ev.overallQualityLabel).toContain('8,706');

    const totalItem = ev.items.find((i) => i.id === 'total');
    expect(totalItem?.docAmount).toBe(8706.08);
  });

  it('DAL-2026-0005 — קריאת PDF סרוק בן 36 עמודים בסך 34,085.85 ₪ ללא איבוד נתונים', () => {
    const ev = getClaimFinancialEvidence('DAL-2026-0005', '71167102', 'טויוטה קורולה');
    expect(ev.overallQuality).toBe('verified');

    const bodyItem = ev.items.find((i) => i.id === 'body_labor');
    expect(bodyItem?.docAmount).toBe(3500.0);

    const paintItem = ev.items.find((i) => i.id === 'paint_labor');
    expect(paintItem?.docAmount).toBe(5900.0);

    const partsItem = ev.items.find((i) => i.id === 'parts');
    expect(partsItem?.docAmount).toBe(14186.28);

    const diminutionItem = ev.items.find((i) => i.id === 'diminution');
    expect(diminutionItem?.docAmount).toBe(3870.44);

    expect(ev.accounting.vatRatePercent).toBe(18);
    expect(ev.accounting.finalReportTotal).toBe(34085.85);
  });

  it('תיקים חסרי דוח שמאי — מציג "חסר דוח שמאי" ולא סכום אפס', () => {
    const missingClaims = ['DAL-2026-0001', 'DAL-2026-0002', 'DAL-2026-0006', 'DAL-2026-0018', 'DAL-2026-0019'];

    for (const id of missingClaims) {
      const ev = getClaimFinancialEvidence(id, '000-00-000', 'לקוח לבדיקה');
      expect(ev.overallQuality).toBe('missing_report');
      expect(ev.overallQualityLabel).toContain('חסר דוח שמאי');
      expect(ev.items[0].clauseName).toBe('דוח שמאי מקורי');
      expect(ev.items[0].docAmount).toBeNull();
      expect(ev.items[0].docAmountFormatted).toBe('חסר דוח שמאי');
      expect(ev.accounting.isMathematicallySound).toBe(false);
    }
  });

  it('דינמי — אי-התאמת מספר רכב בין הכרטיס למסמך מורידה את הסטטוס ל-"דורש בדיקה"', () => {
    const mockComparison = {
      totalDemanded: 11700,
      ourDemand: {
        plate: '11-222-33',
        clientName: 'ישראל ישראלי',
        surveyorName: 'בדיקה דינמית',
        parts: { amount: 5000 },
        labor: { amount: 5000 },
        subtotal: { amount: 10000 },
        vatRatePercent: 17,
        vat: { amount: 1700 },
        totalDemand: { amount: 11700 },
      },
    };

    // מספר רישוי בכרטיס שונה מהמסמך
    const ev = getClaimFinancialEvidence('DAL-2026-9999', '99-888-77', 'ישראל ישראלי', mockComparison, [{ original_name: 'test.pdf' }]);
    expect(ev.overallQuality).toBe('needs_review');
    expect(ev.overallQualityLabel).toContain('אי-התאמת מספר רכב');
  });

  it('דינמי — חילוץ מתוך טבלת השוואת שורות של דוח חדש עם מספר דוח מאומת (OCR rows)', () => {
    const mockRowsComparison = {
      totalDemanded: 13338,
      ourDemand: {
        reportNumber: 'QA-2026-001',
        reportDate: '2026-10-28',
      },
      rows: [
        { category: 'חלפים', demanded: 5400, sourceSnippet: 'סה"כ חלקי חילוף 5,400.00 ₪' },
        { category: 'פחחות / עבודה', demanded: 6000, sourceSnippet: 'סה"כ עבודות ושכר עבודה 6,000.00 ₪' },
        { category: 'מע"מ (17%)', demanded: 1938, sourceSnippet: 'מע"מ (17%) 1,938.00 ₪' },
        { category: 'סה"כ שומה לתשלום', demanded: 13338, sourceSnippet: 'סה"כ שומה סופי 13,338.00 ₪' },
      ],
    };

    const ev = getClaimFinancialEvidence(
      'DAL-QA-RESTORE-20261028',
      '88-999-77',
      'ישראל ישראלי - בדיקת QA',
      mockRowsComparison,
      [{ original_name: 'new-qa-surveyor-report.png', doc_meta: { reportNumber: 'QA-2026-001' } }]
    );
    expect(ev.overallQuality).toBe('verified');
    expect(ev.reportNumber).toBe('QA-2026-001');
    expect(ev.items.find(i => i.id === 'parts')?.docAmount).toBe(5400);
    expect(ev.items.find(i => i.id === 'parts')?.reportNumber).toBe('QA-2026-001');
    expect(ev.items.find(i => i.id === 'labor')?.docAmount).toBe(6000);
    expect(ev.items.find(i => i.id === 'vat')?.docAmount).toBe(1938);
    expect(ev.items.find(i => i.id === 'total')?.docAmount).toBe(13338);
    expect(ev.accounting.isMathematicallySound).toBe(true);
  });

  it('דרישת מקור מידע — ללא מספר דוח שמאי מאומת מוצג "מקור לא מאומת" ונחסם אישור 100%', () => {
    const mockUnverifiedComparison = {
      totalDemanded: 10000,
      rows: [
        { category: 'חלפים', demanded: 10000, sourceSnippet: 'חלפים 10000' },
      ],
    };

    const ev = getClaimFinancialEvidence(
      'DAL-2026-UNVERIFIED',
      '11-222-33',
      'לקוח בדיקה ללא מקור',
      mockUnverifiedComparison,
      [{ original_name: 'unknown_document.png' }]
    );
    expect(ev.overallQuality).toBe('needs_review');
    expect(ev.overallQualityLabel).toContain('מקור לא מאומת');
    expect(ev.certificate?.isCertified).toBe(false);
    expect(ev.items[0].isVerifiedSource).toBe(false);
    expect(ev.items[0].sourceStatusLabel).toBe('מקור לא מאומת');
  });

  it('דרישת מקור מידע מלא — בדיקת 5 הפרמטרים בתיקים DAL-2026-0012, 0004, 0017, 0020, 0007', () => {
    // 0012 אילנה אטיאס
    const ev12 = getClaimFinancialEvidence('DAL-2026-0012', '65-941-85', 'אילנה אטיאס');
    expect(ev12.reportNumber).toBe('2270-0-1');
    expect(ev12.reportDate).toBe('2026-07-12');
    expect(ev12.feeInvoiceNumber).toBe('1345');
    const feeItem12 = ev12.items.find(i => i.id === 'surveyor_fee');
    expect(feeItem12?.invoiceNumber).toBe('1345');
    expect(feeItem12?.page).toBe(5);
    expect(feeItem12?.sourceDoc).toBe('RCV0005.JPG');

    // 0004 תומר כהן
    const ev4 = getClaimFinancialEvidence('DAL-2026-0004', '18391-803', 'תומר כהן');
    expect(ev4.reportNumber).toBe('2153-0-1');
    expect(ev4.feeInvoiceNumber).toBe('1191');
    const feeItem4 = ev4.items.find(i => i.id === 'surveyor_fee');
    expect(feeItem4?.invoiceNumber).toBe('1191');
    expect(feeItem4?.page).toBe(6);

    // 0017 אושרי יעקב
    const ev17 = getClaimFinancialEvidence('DAL-2026-0017', '49325-004', 'אושרי יעקב');
    expect(ev17.reportNumber).toBe('2263-0-1');
    expect(ev17.feeInvoiceNumber).toBe('1305');
    const feeItem17 = ev17.items.find(i => i.id === 'surveyor_fee');
    expect(feeItem17?.invoiceNumber).toBe('1305');

    // 0020 אליהו אטיאס
    const ev20 = getClaimFinancialEvidence('DAL-2026-0020', '63292-003', 'אליהו אטיאס');
    expect(ev20.reportNumber).toBe('2185-0-1');
    expect(ev20.feeInvoiceNumber).toBe('1224');

    // 0007 אילן בן עזרי
    const ev7 = getClaimFinancialEvidence('DAL-2026-0007', '60294-401', 'אילן בן עזרי');
    expect(ev7.reportNumber).toBe('2217-0-1');
    expect(ev7.feeInvoiceNumber).toBe('1249');

    // 0246 אילנה אטיאס — תביעה ראשונה (אירוע מרץ 2025 מול חצי חינם)
    const ev246 = getClaimFinancialEvidence('DAL-2026-0246', '65-941-85', 'אילנה אטיאס');
    expect(ev246.reportNumber).toBe('2063-0-1');
    expect(ev246.reportDate).toBe('2025-03-07');
    expect(ev246.feeInvoiceNumber).toBe('1184');
    expect(ev246.accounting.subtotalBeforeVat).toBe(5748.69);
    expect(ev246.accounting.vatAmount).toBe(977.28);
    expect(ev246.accounting.directDamageWithVat).toBe(6725.97);
    expect(ev246.accounting.surveyorFee).toBe(1872);
    expect(ev246.accounting.grandTotalWithFee).toBe(8597.97);
    expect(ev246.overallQuality).toBe('verified');
  });
});
