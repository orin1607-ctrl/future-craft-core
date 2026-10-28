import { describe, it, expect } from 'bun:test';
import {
  getClaimFinancialEvidence,
  VERIFIED_EVIDENCE_REGISTRY,
  CLAIMS_WITHOUT_SURVEYOR_REPORT,
} from './claimFinancialEvidence';

describe('אימות והוכחות חזותיות לדוחות שמאי (Claim Financial Evidence Engine)', () => {
  it('משימה 1 & 6: DAL-2026-0007 — מאמת 7,843 ₪ שכר עבודת צבע וטשטוש עם צילום מקור', () => {
    const ev = getClaimFinancialEvidence('DAL-2026-0007', '100-34-403', 'עדן טזזו');
    expect(ev.overallQuality).toBe('verified');
    expect(ev.claimId).toBe('DAL-2026-0007');

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

  it('משימה 4 & 6: DAL-2026-0017 — מפריד בין 3 גרסאות שמאות (22,700 ₪ vs 41,702 ₪ vs 50,682.74 ₪)', () => {
    const ev = getClaimFinancialEvidence('DAL-2026-0017', '331-54-302', 'אסתי גורביץ');
    expect(ev.overallQuality).toBe('verified');
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
    expect(v3?.cropUrl).toContain('0017-final-survey-crop.png');

    // אימות סעיפי הדוח הסופי
    const totalItem = ev.items.find((i) => i.id === 'total');
    expect(totalItem?.docAmount).toBe(50682.74);
    expect(totalItem?.diff).toBe(0);
    expect(ev.accounting.diminutionOfValue).toBe(8980.73);
  });

  it('משימה 1 & 6: DAL-2026-0020 — מאמת את אליהו אטיאס: 55,839.58 ₪ מדויק מול 55,840 ₪ מעוגל', () => {
    const ev = getClaimFinancialEvidence('DAL-2026-0020', '286-66-802', 'אליהו אטיאס');
    expect(ev.overallQuality).toBe('verified');

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

  it('משימה 2 & 6: DAL-2026-0005 — קריאת PDF סרוק בן 36 עמודים בסך 34,085.85 ₪ ללא איבוד נתונים', () => {
    const ev = getClaimFinancialEvidence('DAL-2026-0005', '123-45-678', 'ישראלי ישראל');
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

  it('משימה 5: תיקים חסרי דוח שמאי — מציג "חסר דוח שמאי" ולא סכום אפס', () => {
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

  it('משימה 3: דינמי — חישוב חשבונאי מלא לתיק חדש עם בדיקת מע"מ 17%', () => {
    const mockComparison = {
      totalDemanded: 11700,
      ourDemand: {
        surveyorName: 'בדיקה דינמית',
        parts: { amount: 5000, sourceSnippet: 'חלפים: 5,000 ש"ח' },
        labor: { amount: 3000, sourceSnippet: 'פחחות: 3,000 ש"ח' },
        paint: { amount: 2000, sourceSnippet: 'צבע: 2,000 ש"ח' },
        diminutionOfValue: { amount: 0 },
        subtotal: { amount: 10000 },
        vatRatePercent: 17,
        vat: { amount: 1700 },
        totalDemand: { amount: 11700 },
      },
    };

    const ev = getClaimFinancialEvidence('DAL-2026-9999', '999-99-999', 'לקוח חדש', mockComparison, [{ original_name: 'test.pdf' }]);
    expect(ev.overallQuality).toBe('verified');
    expect(ev.accounting.isMathematicallySound).toBe(true);
    expect(ev.accounting.subtotalBeforeVat).toBe(10000);
    expect(ev.accounting.vatAmount).toBe(1700);
    expect(ev.accounting.finalReportTotal).toBe(11700);
  });
});
