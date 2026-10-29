import { describe, expect, it } from 'bun:test';
import {
  getFailureDiagnostic,
  CLAIM_PAGE_AUDITS,
  SYSTEM_CROSS_CLAIM_CHECKS,
  AI_OWNER_RECOMMENDATIONS,
} from './claimAuditDiagnostics';
import { getClaimFinancialEvidence } from './claimFinancialEvidence';

describe('בדיקות מנגנון אבחון אימות, עמודים, כפילויות רוחביות והמלצות AI (V16)', () => {
  it('1. כפתור "למה לא אומת?" — מחזיר את כל 7 שדות האבחון הנדרשים לתיק אושרי יעקוב (0017)', () => {
    const diag = getFailureDiagnostic('DAL-2026-0017', 'mismatch', 'זהות מבוטח', '49325-004');
    expect(diag.targetField).toContain('אימות זהות מבוטח');
    expect(diag.whatAttempted).toBeTruthy();
    expect(diag.whatFound).toContain('כהן אודי');
    expect(diag.inspectedFile).toBe('rcv0001.JPG');
    expect(diag.inspectedPage).toBe(1);
    expect(diag.whatFailed).toContain('התאמת שם הלקוח');
    expect(diag.knownReason).toBeTruthy();
    expect(diag.actionableSolution).toBeTruthy();
    expect(diag.canRetry).toBe(true);
    expect(diag.mismatchedNames?.cardClient).toContain('אושרי יעקוב');
    expect(diag.mismatchedNames?.docInsured).toContain('כהן אודי');
  });

  it('2. כפתור "למה לא אומת?" — מחזיר אבחון ברור לחסר דוח שמאי בתיק DAL-2026-0275 / 0001', () => {
    const diag = getFailureDiagnostic('DAL-2026-0275', 'missing', 'דוח שמאי', '73479002');
    expect(diag.targetField).toContain('איתור וחילוץ דוח שמאי');
    expect(diag.whatFound).toContain('טופס הודעה מקוון');
    expect(diag.whatFailed).toContain('חסר דוח שמאי');
    expect(diag.knownReason).toContain('טרם הגיש חוות דעת');
    expect(diag.actionableSolution).toContain('להעלות את קובץ דוח השמאי');
    expect(diag.canRetry).toBe(true);
  });

  it('3. בדיקת כל העמודים והמסמכים בתיק — שיוך עמודים ובידוד ארכיון בתיק אילנה עטיאס (0012)', () => {
    const pages = CLAIM_PAGE_AUDITS['DAL-2026-0012'];
    expect(pages).toBeDefined();
    expect(pages.length).toBeGreaterThanOrEqual(5);

    const p1 = pages.find(p => p.pageNumber === 1);
    expect(p1?.status).toBe('verified');
    expect(p1?.plateDetected).toBe('65-941-85');
    expect(p1?.reportNumberDetected).toBe('2270-0-1');

    const archivePage = pages.find(p => p.status === 'archived');
    expect(archivePage).toBeDefined();
    expect(archivePage?.reportNumberDetected).toBe('2063-0-1');
    expect(archivePage?.suspicionReason).toContain('ארכיון היסטורי');
  });

  it('4. בדיקת כפילויות רוחבית — מזהה לגיטימיות של שני אירועים ביטוחיים נפרדים לרכב 73479002 (0003 מול 0275)', () => {
    const check = SYSTEM_CROSS_CLAIM_CHECKS.find(c => c.plateA === '73479002' && c.plateB === '73479002');
    expect(check).toBeDefined();
    expect(check?.isLegitimateMultiClaim).toBe(true);
    expect(check?.claimIdA).toBe('DAL-2026-0003');
    expect(check?.claimIdB).toBe('DAL-2026-0275');
    expect(check?.suspicionLevel).toBe('safe');
    expect(check?.actionNeeded).toContain('אין צורך באיחוד');
  });

  it('5. דוח בעיות והמלצות AI — כולל פניות אישיות ומפורשות ליוני ("יוני, אני צריך...") לכל התיקים המרכזיים', () => {
    expect(AI_OWNER_RECOMMENDATIONS.length).toBeGreaterThanOrEqual(4);

    const rec0012 = AI_OWNER_RECOMMENDATIONS.find(r => r.claimId === 'DAL-2026-0012');
    expect(rec0012?.whatAiNeedsFromUser).toContain('יוני, אני צריך שתאשר איזה משני הדוחות הוא הדוח הסופי');

    const rec0004 = AI_OWNER_RECOMMENDATIONS.find(r => r.claimId === 'DAL-2026-0004');
    expect(rec0004?.whatAiNeedsFromUser).toContain('יוני, מצאתי שהדוח המקורי בעמוד 4 כולל שני מוקדי נזק בסך 54,982 ₪');

    const rec0017 = AI_OWNER_RECOMMENDATIONS.find(r => r.claimId === 'DAL-2026-0017');
    expect(rec0017?.whatAiNeedsFromUser).toContain('יוני, מספר הרכב והשלדה בדוח תואמים במדויק אך שם המבוטח שונה');

    const rec0001 = AI_OWNER_RECOMMENDATIONS.find(r => r.claimId === 'DAL-2026-0275');
    expect(rec0001?.whatAiNeedsFromUser).toContain('יוני, בתיק זה חסר דוח שמאי');
  });

  it('6. תעודת אימות מפורטת — מציגה את כל 15 הפרמטרים המחייבים ב-getClaimFinancialEvidence', () => {
    const ev12 = getClaimFinancialEvidence('DAL-2026-0012', '65-941-85', 'אילנה עטיאס');
    expect(ev12.claimId).toBe('DAL-2026-0012');
    expect(ev12.clientName).toContain('אילנה');
    expect(ev12.plateNumber).toContain('65-941-85');
    expect(ev12.reportNumber).toBe('2270-0-1');
    expect(ev12.reportDate).toBe('2026-07-12');
    expect(ev12.plateSourceLocation).toContain('rcv0001.JPG');
    expect(ev12.pagesCheckedCount).toBe(5);
    expect(ev12.suspiciousPagesCount).toBe(1);
    expect(ev12.crossClaimCheckStatus).toBeTruthy();
    expect(ev12.accounting.finalReportTotal).toBe(38174.2);
    expect(ev12.accounting.surveyorFee).toBe(4329);
    expect(ev12.overallQuality).toBe('verified');
  });
});
