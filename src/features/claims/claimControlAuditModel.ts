// src/features/claims/claimControlAuditModel.ts
/**
 * Case & Document Control Audit Engine for Claims Management in Dalia.
 * 
 * Classifies every claim into 4 distinct, unambiguous operational audit states:
 * - 🟢 Green (תקין): Audit completed, all essential documents present, no major blockers.
 * - 🟡 Yellow (לתשומת לב / חסר מסמך): Missing specific required documents, awaiting signature or details.
 * - 🔴 Red (ליקוי מהותי / חריגת מועד): Overdue critical debt, conflicting figures, rejected document, or severe inactivity.
 * - ⚪ Gray (טרם נבדק / חסר מידע): Fresh intake or unverified claim with insufficient baseline data.
 * 
 * Strict rule: "לא נבדק" is never confused with "תקין".
 * Read-only analysis.
 */

import type { ClaimRecord } from './claimsConstants';
import { type ClaimFinancialRow, parseDateSafe } from './claimFinancialReportsCenterModel';
import type { SmartAlertItem } from './claimSmartAlertsModel';

export type ControlAuditStatus = 'green' | 'yellow' | 'red' | 'gray';

export interface ClaimDocChecklist {
  hasSurveyorReport: boolean;
  hasInvoice: boolean;
  hasAccidentNotice: boolean;
  hasDriverLicense: boolean;
  hasVehicleLicense: boolean;
  hasDamagePhotos: boolean;
  missingItems: string[];
}

export interface ClaimControlAuditRow {
  claimId: string;
  plate: string;
  clientName: string;
  clientPhone: string;
  insCompany: string;
  claimKind: string;
  status: string;
  isClosed: boolean;
  assignedToName: string;
  createdAtStr: string;
  daysSinceCreation: number;
  auditStatus: ControlAuditStatus;
  auditStatusLabel: string;
  docChecklist: ClaimDocChecklist;
  findings: string[];
  actionRequired: string;
  lastActivityDateStr: string;
}

export interface ControlAuditSummary {
  totalClaims: number;
  greenCount: number;
  yellowCount: number;
  redCount: number;
  grayCount: number;
  missingInvoicesCount: number;
  missingSurveyorReportsCount: number;
  missingAccidentFormsCount: number;
  missingPhotosCount: number;
  unverifiedAiCount: number;
}

/**
 * Checks document checklist for a single claim record.
 */
export function checkClaimDocuments(
  claim: ClaimRecord | Record<string, any>,
  financialRow?: ClaimFinancialRow
): ClaimDocChecklist {
  const raw = ((claim as any).row_data && typeof (claim as any).row_data === 'object'
    ? (claim as any).row_data
    : claim) as Record<string, any>;

  const files = Array.isArray(raw.files) ? raw.files : Array.isArray((claim as any).files) ? (claim as any).files : [];

  let hasSurveyorReport = false;
  let hasInvoice = false;
  let hasAccidentNotice = false;
  let hasDriverLicense = false;
  let hasVehicleLicense = false;
  let hasDamagePhotos = false;

  // 1. Inspect attached files
  for (const f of files) {
    const kind = String(f.doc_kind || f.docKind || f.kind || '').toLowerCase();
    const name = String(f.original_name || f.name || f.fileName || '').toLowerCase();
    const staffType = String(f.doc_meta?.staff_type || f.staffType || '').toLowerCase();

    if (kind.includes('surveyor') || staffType.includes('surveyor') || /שמאי|שמאות|survey/.test(name)) {
      if (kind.includes('photo') || /תמונ/.test(name)) {
        hasDamagePhotos = true;
      } else {
        hasSurveyorReport = true;
      }
    }
    if (kind.includes('invoice') || staffType.includes('invoice') || /חשבונית|invoice/.test(name)) {
      hasInvoice = true;
    }
    if (kind.includes('accident') || staffType.includes('accident') || /הודעה|טופס אירוע|תאונה/.test(name)) {
      hasAccidentNotice = true;
    }
    if (kind.includes('license') || staffType.includes('license') || /רישיון/.test(name)) {
      if (/רכב|vehicle/.test(name) || staffType.includes('vehicle')) {
        hasVehicleLicense = true;
      } else {
        hasDriverLicense = true;
      }
    }
    if (kind.includes('photo') || /תמונ|photo|img|jpg|png/.test(name)) {
      hasDamagePhotos = true;
    }
  }

  // 2. Check direct fields on claim
  if (raw.surveyorReport || raw.surveyorReportUrl || raw.surveyorDocId) hasSurveyorReport = true;
  if (raw.garageInvoice || raw.invoiceNum || raw.invoiceDocId || (financialRow && financialRow.paidAmount && financialRow.paidAmount > 0)) {
    hasInvoice = true;
  }
  if (raw.accidentForm || raw.accidentNoticeDocId || raw.eventDate) hasAccidentNotice = true;
  if (raw.driverLicense || raw.licenseDriverDocId) hasDriverLicense = true;
  if (raw.vehicleLicense || raw.licenseVehicleDocId) hasVehicleLicense = true;

  // 3. Compile missing items list
  const missingItems: string[] = [];
  if (!hasSurveyorReport) missingItems.push('דוח שמאי');
  if (!hasInvoice) missingItems.push('חשבונית תיקון');
  if (!hasAccidentNotice) missingItems.push('טופס דיווח תאונה');
  if (!hasDriverLicense && !hasVehicleLicense) missingItems.push('רישיונות רכב/נהג');
  if (!hasDamagePhotos) missingItems.push('צילומי נזק');

  return {
    hasSurveyorReport,
    hasInvoice,
    hasAccidentNotice,
    hasDriverLicense,
    hasVehicleLicense,
    hasDamagePhotos,
    missingItems,
  };
}

/**
 * Evaluates the control audit status of a single claim.
 */
export function evaluateClaimControlAudit(
  claim: ClaimRecord | Record<string, any>,
  financialRow?: ClaimFinancialRow,
  claimAlerts?: SmartAlertItem[]
): ClaimControlAuditRow {
  const raw = ((claim as any).row_data && typeof (claim as any).row_data === 'object'
    ? (claim as any).row_data
    : claim) as Record<string, any>;

  const claimId = String((claim as any).id || raw.id || '');
  const plate = String((claim as any).plate || raw.plate || '—');
  const clientName = String((claim as any).clientName || raw.clientName || (claim as any).client_name || 'לקוח ללא שם');
  const clientPhone = String((claim as any).clientPhone || raw.clientPhone || '');
  const insCompany = String((claim as any).insCompany || raw.insCompany || (claim as any).company_name || 'לא צוינה');
  const claimKind = String((claim as any).claimKind || raw.claimKind || 'תביעת ביטוח');
  const status = String((claim as any).status || raw.status || 'חדש');
  const isClosed = status === 'הסתיים' || status === 'סגור' || status === 'בוטל' || (claim as any).archived === 'true';

  const assignedToName = String(
    (claim as any).assigned_to_name ||
    raw.assigned_to_name ||
    (claim as any).assigned_to ||
    raw.assigned_to ||
    'לא שובץ עובד'
  ).trim();

  // Creation date & age
  const createdAtStr = String((claim as any).createdAt || raw.createdAt || (claim as any).created_at || '').slice(0, 10);
  const createdDate = parseDateSafe(createdAtStr);
  const now = new Date();
  let daysSinceCreation = 0;
  if (createdDate) {
    const diff = now.getTime() - createdDate.getTime();
    if (diff > 0) daysSinceCreation = Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  // Last activity
  const lastActivityDateStr = String(
    raw.lastTreatmentAt || (claim as any).last_activity_at || raw.updatedAt || createdAtStr || '—'
  ).slice(0, 10);

  const docChecklist = checkClaimDocuments(claim, financialRow);
  const findings: string[] = [];

  // Alerts linked to this claim
  const alerts = claimAlerts || [];
  const hasRedAlert = alerts.some((a) => a.severity === 'red');
  const hasYellowAlert = alerts.some((a) => a.severity === 'yellow');

  // Check data quality anomalies
  if (financialRow) {
    if (financialRow.approvedAmount && financialRow.demandAmount && financialRow.approvedAmount > financialRow.demandAmount) {
      findings.push('סכום מאושר עולה על סכום הדרישה');
    }
    if (financialRow.paidAmount && financialRow.paidAmount > 0 && financialRow.verificationStatus === 'unverified') {
      findings.push('תשלום ללא אסמכתת פירעון מאומתת');
    }
    if (financialRow.debtAmount && financialRow.debtAmount > 0 && (financialRow.agingDays || 0) > 60) {
      findings.push(`יתרת חוב באיחור קריטי של ${financialRow.agingDays} ימים`);
    }
  }

  // Determine audit status
  let auditStatus: ControlAuditStatus = 'gray';
  let auditStatusLabel = 'טרם נבדק';
  let actionRequired = 'נדרשת בדיקת בקרה ראשונית';

  if (isClosed) {
    // Closed claim: if no red alerts and no missing essential payment, marked green
    if (!hasRedAlert && (!financialRow || !financialRow.debtAmount || financialRow.debtAmount === 0)) {
      auditStatus = 'green';
      auditStatusLabel = 'הסתיים ותקין';
      actionRequired = 'תיק סגור ומבוקר במלואו';
    } else {
      auditStatus = 'yellow';
      auditStatusLabel = 'סגור עם יתרת חוב/ממצא';
      actionRequired = 'לוודא סגירה חשבונאית מלאה';
    }
  } else if (hasRedAlert || findings.some((f) => f.includes('איחור קריטי') || f.includes('סכום מאושר עולה'))) {
    // Red condition
    auditStatus = 'red';
    auditStatusLabel = 'ליקוי מהותי / דחוף';
    actionRequired = findings[0] || 'טיפול מיידי בחריגת מועד או אי-התאמה כספית';
  } else if (docChecklist.missingItems.length > 0 || hasYellowAlert || status === 'ממתין למסמכים') {
    // Yellow condition: missing documents or warning alerts
    auditStatus = 'yellow';
    auditStatusLabel = 'חסר מסמך / בבדיקה';
    actionRequired = `השלמת מסמכים: ${docChecklist.missingItems.slice(0, 2).join(', ')}`;
  } else if (daysSinceCreation <= 3 && docChecklist.missingItems.length >= 3) {
    // Gray condition: fresh claim that hasn't gone through intake audit
    auditStatus = 'gray';
    auditStatusLabel = 'קליטה חדשה / טרם נבדק';
    actionRequired = 'ביצוע בדיקת קליטה ופתיחת דרישת מסמכים';
  } else if (docChecklist.missingItems.length === 0 && !hasYellowAlert) {
    // Green condition: all docs present and clean
    auditStatus = 'green';
    auditStatusLabel = 'בקרה הושלמה — תקין';
    actionRequired = 'מעקב שוטף עד קבלת תשלום';
  } else {
    // Fallback: unreviewed
    auditStatus = 'gray';
    auditStatusLabel = 'טרם בוצעה בקרה';
    actionRequired = 'נדרשת בדיקת מסמכים';
  }

  return {
    claimId,
    plate,
    clientName,
    clientPhone,
    insCompany,
    claimKind,
    status,
    isClosed,
    assignedToName,
    createdAtStr,
    daysSinceCreation,
    auditStatus,
    auditStatusLabel,
    docChecklist,
    findings,
    actionRequired,
    lastActivityDateStr,
  };
}

/**
 * Computes the overall Case & Document Control summary across all claims.
 */
export function computeControlAuditSummary(rows: ClaimControlAuditRow[]): ControlAuditSummary {
  let greenCount = 0;
  let yellowCount = 0;
  let redCount = 0;
  let grayCount = 0;

  let missingInvoicesCount = 0;
  let missingSurveyorReportsCount = 0;
  let missingAccidentFormsCount = 0;
  let missingPhotosCount = 0;
  let unverifiedAiCount = 0;

  for (const r of rows) {
    if (r.auditStatus === 'green') greenCount++;
    else if (r.auditStatus === 'yellow') yellowCount++;
    else if (r.auditStatus === 'red') redCount++;
    else if (r.auditStatus === 'gray') grayCount++;

    if (!r.docChecklist.hasInvoice && !r.isClosed) missingInvoicesCount++;
    if (!r.docChecklist.hasSurveyorReport && !r.isClosed) missingSurveyorReportsCount++;
    if (!r.docChecklist.hasAccidentNotice && !r.isClosed) missingAccidentFormsCount++;
    if (!r.docChecklist.hasDamagePhotos && !r.isClosed) missingPhotosCount++;
    if (r.findings.some((f) => f.includes('אסמכתת'))) unverifiedAiCount++;
  }

  return {
    totalClaims: rows.length,
    greenCount,
    yellowCount,
    redCount,
    grayCount,
    missingInvoicesCount,
    missingSurveyorReportsCount,
    missingAccidentFormsCount,
    missingPhotosCount,
    unverifiedAiCount,
  };
}
