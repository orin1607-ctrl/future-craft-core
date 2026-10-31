// src/features/claims/claimSmartAlertsModel.ts
/**
 * Smart Alerts & Collections Engine for Claims Management in Dalia.
 * Evaluates claims in real-time for:
 * 1. Overdue verified debts (0-30, 31-60, 61-90, 90+ days)
 * 2. Partial payments and remaining balances
 * 3. Deductions and offsets awaiting clarification
 * 4. Stale/inactive claims (7, 14, 30 days without operational activity)
 * 5. Missing financial documents per stage
 * 6. Legal treatment tracking
 * 7. Conflicting and unverified data quality anomalies
 * 
 * Strict safety rules:
 * - Read-only: no database mutations or automatic messages
 * - No double counting
 * - "אין נתון" / "טרם אומת" for missing values (never misleading 0)
 * - Alerts resolve only upon true data/activity updates (not merely clicking)
 */

import type { ClaimRecord } from './claimsConstants';
import {
  type ClaimFinancialRow,
  type InsurerSummaryRow,
  translateDeductionCategory,
  formatCurrencyOrMissing,
  parseDateSafe,
  parseFinancialNum,
} from './claimFinancialReportsCenterModel';

export type AlertSeverity = 'red' | 'yellow' | 'green';

export type AlertKind =
  | 'overdue_debt'
  | 'partial_payment'
  | 'deduction_clarification'
  | 'stale_claim'
  | 'missing_document'
  | 'legal_open_task'
  | 'data_anomaly';

export interface SmartAlertItem {
  id: string;
  claimId: string;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  description: string;
  clientName: string;
  plate: string;
  insCompany: string;
  assignedToName: string;
  lastActivityDateStr: string;
  lastTreatmentAction: string;
  daysInactive: number;
  amount: number | null;
  agingDays: number | null;
  agingBucket: string;
  missingDocName?: string;
  deductionReason?: string;
  isLegal: boolean;
  legalLawyer?: string;
  sourceDescription: string;
  isResolved: boolean;
}

export interface SmartAlertsSummary {
  totalAlerts: number;
  criticalRedCount: number;
  warningYellowCount: number;
  resolvedGreenCount: number;

  // 7 Primary "מה דורש טיפול היום?" metrics
  overdueDebtsCount: number;
  overdueDebtsAmount: number;

  partialPaymentsCount: number;
  partialPaymentsBalance: number;

  deductionsClarificationCount: number;
  deductionsClarificationAmount: number;

  staleClaimsCount: number;
  staleClaims7Count: number;
  staleClaims14Count: number;
  staleClaims30Count: number;

  missingDocumentsCount: number;
  legalClaimsWithTasksCount: number;
  legalClaimsAmount: number;

  dataAnomaliesCount: number;
}

export interface RecurringDeductionAnalysis {
  category: string;
  categoryLabel: string;
  insurerName: string;
  casesCount: number;
  totalAmount: number;
  averageAmount: number;
  sampleReasons: string[];
}

export interface CycleTimesAnalysis {
  claimsCount: number;
  avgDaysOpenToDemand: number | null;
  avgDaysDemandToPayment: number | null;
  avgDaysOpenToResolution: number | null;
}

export interface CashForecastBucket {
  bucketLabel: string;
  expectedAmount: number;
  claimsCount: number;
  basis: string;
}

export interface ClaimProfitabilityRow {
  claimId: string;
  plate: string;
  clientName: string;
  insCompany: string;
  status: string;
  customerIncome: number | null;
  supplierCost: number | null;
  grossProfit: number | null;
  profitMarginPct: number | null;
  isCalculable: boolean;
  statusNote: string;
}

export interface DataQualityAuditRow {
  claimId: string;
  plate: string;
  clientName: string;
  insCompany: string;
  issueType: 'conflicting_amounts' | 'unbacked_payment' | 'unassigned_insurer' | 'unverified_ai' | 'missing_docs';
  issueDescription: string;
  severity: AlertSeverity;
}

/** Standard settlement window in Israel: 30 days from formal surveyor demand */
const STANDARD_SETTLEMENT_DAYS = 30;

/**
 * Builds all Smart Alerts for a single claim.
 */
export function evaluateClaimAlerts(
  row: ClaimFinancialRow,
  rawClaim: ClaimRecord | Record<string, unknown>,
  staleThresholdDays = 14
): SmartAlertItem[] {
  const alerts: SmartAlertItem[] = [];
  const raw = ((rawClaim as any).row_data && typeof (rawClaim as any).row_data === 'object'
    ? (rawClaim as any).row_data
    : rawClaim) as Record<string, any>;

  const assignedToName = String(
    (rawClaim as any).assigned_to_name ||
    raw.assigned_to_name ||
    (rawClaim as any).assigned_to ||
    raw.assigned_to ||
    'לא שובץ עובד'
  ).trim();

  // True treatment activity date
  const lastTreatmentDate = parseDateSafe(raw.lastTreatmentAt || rawClaim.lastTreatmentAt);
  const lastTreatmentAction = String(
    raw.lastTreatmentAction || (rawClaim as any).lastTreatmentAction || raw.lastStatusNote || ''
  ).trim();

  // Calculate true inactive days based on operational activity (fallback to createdDate)
  const activityDate = lastTreatmentDate || row.demandDate || row.createdDate;
  const now = new Date();
  let daysInactive = 0;
  if (activityDate) {
    const diff = now.getTime() - activityDate.getTime();
    if (diff > 0) daysInactive = Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  // 1. Overdue Debt Alert (חובות באיחור)
  // Strict rule: only true verified debt balances, not unapproved demands!
  if (row.debtAmount !== null && row.debtAmount > 0 && !row.isClosed) {
    const aging = row.agingDays || daysInactive;
    const isOverdue = aging > STANDARD_SETTLEMENT_DAYS;
    const severity: AlertSeverity = aging > 60 ? 'red' : isOverdue ? 'yellow' : 'yellow';

    alerts.push({
      id: `alert-debt-${row.claimId}`,
      claimId: row.claimId,
      kind: 'overdue_debt',
      severity,
      title: isOverdue ? `חוב באיחור (${aging} ימים)` : `יתרת חוב לגבייה (${aging} ימים)`,
      description: `יתרת חוב מאומתת של ${formatCurrencyOrMissing(row.debtAmount)} מול ${row.insCompany}. עברו ${aging} ימים ממועד הדרישה.`,
      clientName: row.clientName,
      plate: row.plate,
      insCompany: row.insCompany,
      assignedToName,
      lastActivityDateStr: row.lastPaymentDateStr || row.demandDateStr || row.createdAtStr,
      lastTreatmentAction: lastTreatmentAction || 'ממתין לגבייה',
      daysInactive,
      amount: row.debtAmount,
      agingDays: aging,
      agingBucket: row.agingBucket,
      isLegal: row.isLegal,
      sourceDescription: row.sourceDescription,
      isResolved: false,
    });
  }

  // 2. Partial Payment Alert (תשלומים חלקיים)
  if (row.paymentStatus === 'partial' && !row.isClosed) {
    alerts.push({
      id: `alert-partial-${row.claimId}`,
      claimId: row.claimId,
      kind: 'partial_payment',
      severity: 'yellow',
      title: 'תשלום חלקי שהתקבל',
      description: `שולמו ${formatCurrencyOrMissing(row.paidAmount)} מתוך סך מאושר של ${formatCurrencyOrMissing(row.approvedAmount || row.demandAmount)}. נותרה יתרה של ${formatCurrencyOrMissing(row.debtAmount)}.`,
      clientName: row.clientName,
      plate: row.plate,
      insCompany: row.insCompany,
      assignedToName,
      lastActivityDateStr: row.lastPaymentDateStr || row.demandDateStr,
      lastTreatmentAction: lastTreatmentAction || 'דרושה דרישת השלמה למבטחת',
      daysInactive,
      amount: row.debtAmount,
      agingDays: row.agingDays,
      agingBucket: row.agingBucket,
      isLegal: row.isLegal,
      sourceDescription: row.sourceDescription,
      isResolved: false,
    });
  }

  // 3. Deductions Awaiting Clarification (קיזוזים שממתינים לבירור)
  if (row.deductionsAmount !== null && row.deductionsAmount > 0 && !row.isClosed) {
    const hasUnexplained = row.deductionsList.some((d) => d.isUnexplained || d.category === 'unexplained' || d.category === 'damage_cut');
    const reasons = row.deductionsList.map((d) => `${translateDeductionCategory(d.category)} (${formatCurrencyOrMissing(d.amount)})`).join(', ');

    alerts.push({
      id: `alert-deduct-${row.claimId}`,
      claimId: row.claimId,
      kind: 'deduction_clarification',
      severity: hasUnexplained ? 'red' : 'yellow',
      title: hasUnexplained ? 'קיזוז חד-צדדי / ללא נימוק מספק' : 'קיזוזים בתיק לבירור',
      description: `בוצעו קיזוזים בסך ${formatCurrencyOrMissing(row.deductionsAmount)} על ידי ${row.insCompany}: ${reasons}`,
      clientName: row.clientName,
      plate: row.plate,
      insCompany: row.insCompany,
      assignedToName,
      lastActivityDateStr: row.lastPaymentDateStr || row.demandDateStr,
      lastTreatmentAction: lastTreatmentAction || 'דרושה פנייה לשמאי / מבטחת להשבת הקיזוז',
      daysInactive,
      amount: row.deductionsAmount,
      agingDays: row.agingDays,
      agingBucket: row.agingBucket,
      deductionReason: reasons,
      isLegal: row.isLegal,
      sourceDescription: row.sourceDescription,
      isResolved: false,
    });
  }

  // 4. Stale/Inactive Claims (תיקים ללא טיפול)
  if (!row.isClosed && daysInactive >= staleThresholdDays) {
    const severity: AlertSeverity = daysInactive >= 30 ? 'red' : 'yellow';

    alerts.push({
      id: `alert-stale-${row.claimId}`,
      claimId: row.claimId,
      kind: 'stale_claim',
      severity,
      title: `תיק ללא פעולה טיפולית (${daysInactive} ימים)`,
      description: `לא בוצעה שום פעולת טיפול מתועדת בתיק במשך ${daysInactive} ימים. פעולה אחרונה: ${lastTreatmentAction || 'לא תועדה'}.`,
      clientName: row.clientName,
      plate: row.plate,
      insCompany: row.insCompany,
      assignedToName,
      lastActivityDateStr: activityDate ? activityDate.toLocaleDateString('he-IL') : '—',
      lastTreatmentAction: lastTreatmentAction || 'דרוש בירור סטטוס או עדכון טיפול',
      daysInactive,
      amount: row.debtAmount || row.demandAmount,
      agingDays: row.agingDays,
      agingBucket: row.agingBucket,
      isLegal: row.isLegal,
      sourceDescription: row.sourceDescription,
      isResolved: false,
    });
  }

  // 5. Missing Financial Documents (מסמכים כספיים חסרים לפי שלב)
  const audit = raw.financial_audit;
  if (!row.isClosed) {
    // Missing surveyor report when demand exists
    if (row.demandAmount !== null && row.demandAmount > 0 && !audit?.our_demand && !raw.appraisalDoc) {
      alerts.push({
        id: `alert-doc-surveyor-${row.claimId}`,
        claimId: row.claimId,
        kind: 'missing_document',
        severity: 'yellow',
        title: 'חסר דוח שומת שמאי',
        description: `הוזן סכום דרישה של ${formatCurrencyOrMissing(row.demandAmount)} אך טרם הועלה או נסרק דוח שמאי לתיק.`,
        clientName: row.clientName,
        plate: row.plate,
        insCompany: row.insCompany,
        assignedToName,
        lastActivityDateStr: row.createdAtStr,
        lastTreatmentAction: 'דרושה העלאת שומת שמאי',
        daysInactive,
        amount: row.demandAmount,
        agingDays: row.agingDays,
        agingBucket: row.agingBucket,
        missingDocName: 'דוח שמאי רכב',
        isLegal: row.isLegal,
        sourceDescription: row.sourceDescription,
        isResolved: false,
      });
    }

    // Missing payment notice when payment reported without document
    if (row.paidAmount !== null && row.paidAmount > 0 && (!audit?.payment_notices || audit.payment_notices.length === 0) && !raw.finRef) {
      alerts.push({
        id: `alert-doc-paynotice-${row.claimId}`,
        claimId: row.claimId,
        kind: 'missing_document',
        severity: 'yellow',
        title: 'חסרה הודעת תשלום / סילוק מהמבטחת',
        description: `נרשם תשלום של ${formatCurrencyOrMissing(row.paidAmount)} אך אין הודעת תשלום רשמית או מספר אסמכתא בתיק.`,
        clientName: row.clientName,
        plate: row.plate,
        insCompany: row.insCompany,
        assignedToName,
        lastActivityDateStr: row.lastPaymentDateStr || row.createdAtStr,
        lastTreatmentAction: 'דרוש צירוף הודעת סילוק/פירוט תשלום',
        daysInactive,
        amount: row.paidAmount,
        agingDays: row.agingDays,
        agingBucket: row.agingBucket,
        missingDocName: 'הודעת תשלום / סילוק',
        isLegal: row.isLegal,
        sourceDescription: row.sourceDescription,
        isResolved: false,
      });
    }
  }

  // 6. Legal Claims with Open Tasks (תיקים בטיפול משפטי)
  if (row.isLegal && !row.isClosed) {
    const legalLawyer = row.legalDetails.lawyer || row.legalDetails.firm || 'עורך דין לא צוין';
    const severity: AlertSeverity = daysInactive >= 30 ? 'red' : 'yellow';

    alerts.push({
      id: `alert-legal-${row.claimId}`,
      claimId: row.claimId,
      kind: 'legal_open_task',
      severity,
      title: 'תיק בטיפול משפטי פעיל',
      description: `מטופל ע"י ${legalLawyer}. סכום פתוח: ${formatCurrencyOrMissing(row.debtAmount || row.disputedAmount || row.demandAmount)}. ${daysInactive} ימים ללא עדכון.`,
      clientName: row.clientName,
      plate: row.plate,
      insCompany: row.insCompany,
      assignedToName,
      lastActivityDateStr: raw.legalDate || row.createdAtStr,
      lastTreatmentAction: lastTreatmentAction || `מעקב טיפול משפטי (${legalLawyer})`,
      daysInactive,
      amount: row.debtAmount || row.disputedAmount || row.demandAmount,
      agingDays: row.agingDays,
      agingBucket: row.agingBucket,
      isLegal: true,
      legalLawyer,
      sourceDescription: row.sourceDescription,
      isResolved: false,
    });
  }

  // 7. Data Quality & Anomalies (נתונים סותרים או לא מאומתים)
  if (row.insCompany === 'ללא חברה' && !row.isClosed && row.demandAmount !== null && row.demandAmount > 0) {
    alerts.push({
      id: `alert-anomaly-noins-${row.claimId}`,
      claimId: row.claimId,
      kind: 'data_anomaly',
      severity: 'yellow',
      title: 'תביעה ללא חברת ביטוח מוגדרת',
      description: `הוזן סכום תביעה של ${formatCurrencyOrMissing(row.demandAmount)} אך לא הוגדרה חברת ביטוח אחראית.`,
      clientName: row.clientName,
      plate: row.plate,
      insCompany: 'ללא חברה',
      assignedToName,
      lastActivityDateStr: row.createdAtStr,
      lastTreatmentAction: 'דרוש שיוך חברת ביטוח',
      daysInactive,
      amount: row.demandAmount,
      agingDays: row.agingDays,
      agingBucket: row.agingBucket,
      isLegal: row.isLegal,
      sourceDescription: row.sourceDescription,
      isResolved: false,
    });
  }

  if (row.demandAmount !== null && row.approvedAmount !== null && row.approvedAmount > row.demandAmount * 1.5) {
    alerts.push({
      id: `alert-anomaly-conflict-${row.claimId}`,
      claimId: row.claimId,
      kind: 'data_anomaly',
      severity: 'red',
      title: 'סכום מאושר חורג מהסכום הנדרש',
      description: `הסכום המאושר (${formatCurrencyOrMissing(row.approvedAmount)}) גבוה משמעותית מסכום הדרישה (${formatCurrencyOrMissing(row.demandAmount)}). דורש אימות.`,
      clientName: row.clientName,
      plate: row.plate,
      insCompany: row.insCompany,
      assignedToName,
      lastActivityDateStr: row.createdAtStr,
      lastTreatmentAction: 'דרושה בדיקת סכומי דרישה ואישור',
      daysInactive,
      amount: row.approvedAmount,
      agingDays: row.agingDays,
      agingBucket: row.agingBucket,
      isLegal: row.isLegal,
      sourceDescription: row.sourceDescription,
      isResolved: false,
    });
  }

  if (row.hasUnverifiedWarning && audit?.auto_read_state === 'needs_review') {
    alerts.push({
      id: `alert-anomaly-ai-${row.claimId}`,
      claimId: row.claimId,
      kind: 'data_anomaly',
      severity: 'yellow',
      title: 'חילוץ AI ממתין לאימות אנושי',
      description: 'המערכת זיהתה מסמך כספי חדש אך רמת הוודאות דורשת בדיקה ואישור משתמש.',
      clientName: row.clientName,
      plate: row.plate,
      insCompany: row.insCompany,
      assignedToName,
      lastActivityDateStr: row.createdAtStr,
      lastTreatmentAction: 'אימות חילוץ בקרה כספית',
      daysInactive,
      amount: row.demandAmount || row.approvedAmount,
      agingDays: row.agingDays,
      agingBucket: row.agingBucket,
      isLegal: row.isLegal,
      sourceDescription: row.sourceDescription,
      isResolved: false,
    });
  }

  return alerts;
}

/**
 * Computes SmartAlertsSummary from an array of SmartAlertItem.
 */
export function computeSmartAlertsSummary(allAlerts: SmartAlertItem[]): SmartAlertsSummary {
  let criticalRedCount = 0;
  let warningYellowCount = 0;
  let resolvedGreenCount = 0;

  let overdueDebtsCount = 0;
  let overdueDebtsAmount = 0;

  let partialPaymentsCount = 0;
  let partialPaymentsBalance = 0;

  let deductionsClarificationCount = 0;
  let deductionsClarificationAmount = 0;

  let staleClaimsCount = 0;
  let staleClaims7Count = 0;
  let staleClaims14Count = 0;
  let staleClaims30Count = 0;

  let missingDocumentsCount = 0;
  let legalClaimsWithTasksCount = 0;
  let legalClaimsAmount = 0;
  let dataAnomaliesCount = 0;

  for (const a of allAlerts) {
    if (a.severity === 'red') criticalRedCount++;
    else if (a.severity === 'yellow') warningYellowCount++;
    else if (a.severity === 'green') resolvedGreenCount++;

    switch (a.kind) {
      case 'overdue_debt':
        overdueDebtsCount++;
        if (a.amount) overdueDebtsAmount += a.amount;
        break;
      case 'partial_payment':
        partialPaymentsCount++;
        if (a.amount) partialPaymentsBalance += a.amount;
        break;
      case 'deduction_clarification':
        deductionsClarificationCount++;
        if (a.amount) deductionsClarificationAmount += a.amount;
        break;
      case 'stale_claim':
        staleClaimsCount++;
        if (a.daysInactive >= 30) staleClaims30Count++;
        else if (a.daysInactive >= 14) staleClaims14Count++;
        else if (a.daysInactive >= 7) staleClaims7Count++;
        break;
      case 'missing_document':
        missingDocumentsCount++;
        break;
      case 'legal_open_task':
        legalClaimsWithTasksCount++;
        if (a.amount) legalClaimsAmount += a.amount;
        break;
      case 'data_anomaly':
        dataAnomaliesCount++;
        break;
    }
  }

  return {
    totalAlerts: allAlerts.length,
    criticalRedCount,
    warningYellowCount,
    resolvedGreenCount,
    overdueDebtsCount,
    overdueDebtsAmount,
    partialPaymentsCount,
    partialPaymentsBalance,
    deductionsClarificationCount,
    deductionsClarificationAmount,
    staleClaimsCount,
    staleClaims7Count,
    staleClaims14Count,
    staleClaims30Count,
    missingDocumentsCount,
    legalClaimsWithTasksCount,
    legalClaimsAmount,
    dataAnomaliesCount,
  };
}

/**
 * Builds all Smart Alerts for an array of claims.
 */
export function buildAllSmartAlerts(
  financialRows: ClaimFinancialRow[],
  rawClaims: Array<ClaimRecord | Record<string, unknown>>,
  staleThresholdDays = 14
): { alerts: SmartAlertItem[]; summary: SmartAlertsSummary } {
  const rawMap = new Map<string, ClaimRecord | Record<string, unknown>>();
  for (const c of rawClaims) {
    if ((c as any).id) rawMap.set(String((c as any).id), c);
  }

  const allAlerts: SmartAlertItem[] = [];

  for (const row of financialRows) {
    const raw = rawMap.get(row.claimId) || {};
    const claimAlerts = evaluateClaimAlerts(row, raw, staleThresholdDays);
    allAlerts.push(...claimAlerts);
  }

  return { alerts: allAlerts, summary: computeSmartAlertsSummary(allAlerts) };
}

/**
 * Report B: Recurring Deductions Analysis (דוח קיזוזים חוזרים)
 * Identifies categories of cuts per insurer with accumulated amount and case frequency.
 */
export function analyzeRecurringDeductions(rows: ClaimFinancialRow[]): RecurringDeductionAnalysis[] {
  const map = new Map<string, {
    category: string;
    insurerName: string;
    casesCount: number;
    totalAmount: number;
    reasons: Set<string>;
  }>();

  for (const r of rows) {
    if (!r.deductionsList || r.deductionsList.length === 0) continue;
    for (const d of r.deductionsList) {
      const key = `${r.insCompany}:::${d.category}`;
      if (!map.has(key)) {
        map.set(key, {
          category: d.category,
          insurerName: r.insCompany,
          casesCount: 0,
          totalAmount: 0,
          reasons: new Set(),
        });
      }
      const item = map.get(key)!;
      item.casesCount++;
      item.totalAmount += d.amount;
      if (d.reason && d.reason !== 'קיזוז ללא נימוק') {
        item.reasons.add(d.reason.slice(0, 60));
      }
    }
  }

  const result: RecurringDeductionAnalysis[] = [];
  for (const val of map.values()) {
    result.push({
      category: val.category,
      categoryLabel: translateDeductionCategory(val.category),
      insurerName: val.insurerName,
      casesCount: val.casesCount,
      totalAmount: val.totalAmount,
      averageAmount: val.casesCount > 0 ? Math.round(val.totalAmount / val.casesCount) : 0,
      sampleReasons: Array.from(val.reasons).slice(0, 3),
    });
  }

  // Sort by highest accumulated cut
  return result.sort((a, b) => b.totalAmount - a.totalAmount);
}

/**
 * Report C: Cycle Times Analysis (דוח זמני טיפול)
 * Computes turnaround times from opening to demand, and from demand to payment.
 */
export function analyzeCycleTimes(rows: ClaimFinancialRow[]): CycleTimesAnalysis {
  let countOpenToDemand = 0;
  let sumOpenToDemand = 0;

  let countDemandToPay = 0;
  let sumDemandToPay = 0;

  let countOpenToResolution = 0;
  let sumOpenToResolution = 0;

  for (const r of rows) {
    if (r.createdDate && r.demandDate) {
      const diffDays = Math.floor((r.demandDate.getTime() - r.createdDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays <= 365) {
        sumOpenToDemand += diffDays;
        countOpenToDemand++;
      }
    }

    if (r.demandDate && r.lastPaymentDate) {
      const diffDays = Math.floor((r.lastPaymentDate.getTime() - r.demandDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays <= 365) {
        sumDemandToPay += diffDays;
        countDemandToPay++;
      }
    }

    if (r.createdDate && r.lastPaymentDate && r.paymentStatus === 'full') {
      const diffDays = Math.floor((r.lastPaymentDate.getTime() - r.createdDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays <= 730) {
        sumOpenToResolution += diffDays;
        countOpenToResolution++;
      }
    }
  }

  return {
    claimsCount: rows.length,
    avgDaysOpenToDemand: countOpenToDemand > 0 ? Math.round(sumOpenToDemand / countOpenToDemand) : null,
    avgDaysDemandToPayment: countDemandToPay > 0 ? Math.round(sumDemandToPay / countDemandToPay) : null,
    avgDaysOpenToResolution: countOpenToResolution > 0 ? Math.round(sumOpenToResolution / countOpenToResolution) : null,
  };
}

/**
 * Report D: Cash Flow Forecast (תחזית גבייה)
 * Strictly separates already received cash from expected collections based only on verified commitments/aging.
 */
export function analyzeCashForecast(rows: ClaimFinancialRow[]): CashForecastBucket[] {
  let imminentAmount = 0;
  let imminentCount = 0;

  let upcomingAmount = 0;
  let upcomingCount = 0;

  let delayedAmount = 0;
  let delayedCount = 0;

  let legalRiskAmount = 0;
  let legalRiskCount = 0;

  for (const r of rows) {
    if (r.isClosed || !r.debtAmount || r.debtAmount <= 0) continue;

    if (r.isLegal) {
      legalRiskAmount += r.debtAmount;
      legalRiskCount++;
      continue;
    }

    const aging = r.agingDays || 0;
    if (aging <= 30) {
      // Under 30 days: within standard settlement window -> Expected soon
      imminentAmount += r.debtAmount;
      imminentCount++;
    } else if (aging <= 60) {
      // 31-60 days: in active follow-up -> Expected this month
      upcomingAmount += r.debtAmount;
      upcomingCount++;
    } else {
      // 61+ days: overdue / hard collection
      delayedAmount += r.debtAmount;
      delayedCount++;
    }
  }

  return [
    {
      bucketLabel: 'צפי גבייה מיידי (בתוך מסגרת 30 יום)',
      expectedAmount: imminentAmount,
      claimsCount: imminentCount,
      basis: 'דרישות שנשלחו בחודש האחרון בתקופת פירעון תקנית',
    },
    {
      bucketLabel: 'צפי גבייה פעיל (31–60 יום)',
      expectedAmount: upcomingAmount,
      claimsCount: upcomingCount,
      basis: 'בטיפול תזכורת ומעקב תשלום מול מחלקות תביעות',
    },
    {
      bucketLabel: 'חובות מעוכבים / גבייה קשה (61+ יום)',
      expectedAmount: delayedAmount,
      claimsCount: delayedCount,
      basis: 'דורש התערבות מנהל תביעות או דרישה לפני תביעה',
    },
    {
      bucketLabel: 'סכומים בהליכים משפטיים',
      expectedAmount: legalRiskAmount,
      claimsCount: legalRiskCount,
      basis: 'מותנה בהכרעה שיפוטית או הסדר פשרה',
    },
  ];
}

/**
 * Report E: Claim Profitability Analysis (דוח רווחיות תיק)
 * Evaluates revenue vs actual parts costs from quotes.
 * Strictly marks "אינה ניתנת לחישוב" when costs are missing.
 */
export function analyzeClaimProfitability(
  rows: ClaimFinancialRow[],
  quotesMap: Map<string, { totalAmount: number; supplierCost?: number; version?: number }>
): ClaimProfitabilityRow[] {
  return rows.map((r) => {
    const q = quotesMap.get(r.claimId);
    const customerIncome = r.paidAmount !== null && r.paidAmount > 0 ? r.paidAmount : r.approvedAmount;
    const supplierCost = q?.supplierCost !== undefined && q.supplierCost > 0 ? q.supplierCost : null;

    let grossProfit: number | null = null;
    let profitMarginPct: number | null = null;
    let isCalculable = false;
    let statusNote = 'חסרים נתוני עלות ספק';

    if (customerIncome !== null && customerIncome > 0 && supplierCost !== null) {
      grossProfit = customerIncome - supplierCost;
      profitMarginPct = customerIncome > 0 ? Math.round((grossProfit / customerIncome) * 100) : 0;
      isCalculable = true;
      statusNote = 'חושב על בסיס חשבוניות ספק והכנסה מאומתת';
    } else if (customerIncome === null) {
      statusNote = 'טרם התקבל אישור/תשלום מאומת';
    }

    return {
      claimId: r.claimId,
      plate: r.plate,
      clientName: r.clientName,
      insCompany: r.insCompany,
      status: r.status,
      customerIncome,
      supplierCost,
      grossProfit,
      profitMarginPct,
      isCalculable,
      statusNote,
    };
  });
}

/**
 * Report F: Data Quality Audit (בקרת איכות נתונים)
 */
export function auditDataQuality(rows: ClaimFinancialRow[]): DataQualityAuditRow[] {
  const issues: DataQualityAuditRow[] = [];

  for (const r of rows) {
    if (r.isClosed) continue;

    // 1. Missing Insurer
    if (r.insCompany === 'ללא חברה' && r.demandAmount !== null && r.demandAmount > 0) {
      issues.push({
        claimId: r.claimId,
        plate: r.plate,
        clientName: r.clientName,
        insCompany: 'ללא חברה',
        issueType: 'unassigned_insurer',
        issueDescription: 'דרישת תשלום קיימת ללא חברת ביטוח משויכת',
        severity: 'yellow',
      });
    }

    // 2. Conflicting Amounts
    if (r.demandAmount !== null && r.approvedAmount !== null && r.approvedAmount > r.demandAmount) {
      issues.push({
        claimId: r.claimId,
        plate: r.plate,
        clientName: r.clientName,
        insCompany: r.insCompany,
        issueType: 'conflicting_amounts',
        issueDescription: `סכום מאושר (${formatCurrencyOrMissing(r.approvedAmount)}) עולה על סכום הדרישה (${formatCurrencyOrMissing(r.demandAmount)})`,
        severity: 'red',
      });
    }

    // 3. Unbacked Payment
    if (r.paidAmount !== null && r.paidAmount > 0 && r.verificationStatus === 'unverified') {
      issues.push({
        claimId: r.claimId,
        plate: r.plate,
        clientName: r.clientName,
        insCompany: r.insCompany,
        issueType: 'unbacked_payment',
        issueDescription: `נרשם תשלום של ${formatCurrencyOrMissing(r.paidAmount)} ללא אסמכתת תשלום או דף חשבון מאומת`,
        severity: 'yellow',
      });
    }

    // 4. Unverified AI Extraction
    if (r.hasUnverifiedWarning) {
      issues.push({
        claimId: r.claimId,
        plate: r.plate,
        clientName: r.clientName,
        insCompany: r.insCompany,
        issueType: 'unverified_ai',
        issueDescription: 'נתונים כספיים שחולצו אוטומטית ממסמכים ודורשים בדיקת עובד',
        severity: 'yellow',
      });
    }
  }

  return issues;
}

/**
 * Section 11: AI Daily Briefing Generator (קריאה בלבד)
 * Formats a clean executive daily briefing on urgent tasks, amounts and reasons.
 */
export function generateDailyAiBriefing(
  summary: SmartAlertsSummary,
  urgentAlerts: SmartAlertItem[]
): string {
  const redAlerts = urgentAlerts.filter((a) => a.severity === 'red');
  const totalUrgentAmount = redAlerts.reduce((acc, a) => acc + (a.amount || 0), 0);

  const lines: string[] = [];
  lines.push('📋 תדריך מנהלים יומי — ניהול תביעות וגבייה');
  lines.push(`תאריך הפקה: ${new Date().toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);
  lines.push('');
  lines.push(`💡 סטטוס כללי: אותרו ${summary.totalAlerts} התראות פעילות, מתוכן ${summary.criticalRedCount} דורשות התערבות דחופה היום.`);
  lines.push(`סה"כ סכומים בסיכון / טיפול דחוף: ${formatCurrencyOrMissing(totalUrgentAmount)}.`);
  lines.push('');
  lines.push('מוקדי הטיפול המרכזיים להיום:');

  if (summary.overdueDebtsCount > 0) {
    lines.push(`1. חובות באיחור: ${summary.overdueDebtsCount} תיקים בסך כולל של ${formatCurrencyOrMissing(summary.overdueDebtsAmount)} עברו את מסגרת 30 הימים מהדרישה.`);
  }

  if (summary.deductionsClarificationCount > 0) {
    lines.push(`2. קיזוזים לבירור: ${summary.deductionsClarificationCount} תיקים עם קיזוזים בסך ${formatCurrencyOrMissing(summary.deductionsClarificationAmount)}, בדגש על הפחתות עבודה ושמאי.`);
  }

  if (summary.staleClaimsCount > 0) {
    lines.push(`3. תיקים ללא טיפול: ${summary.staleClaimsCount} תיקים עומדים ללא פעולה מעבר לסף שנקבע (${summary.staleClaims30Count} מעל 30 יום).`);
  }

  if (summary.partialPaymentsCount > 0) {
    lines.push(`4. תשלומים חלקיים: ${summary.partialPaymentsCount} תיקים שבהם התקבלה מקדמה בלבד ונותרה יתרה לגבייה של ${formatCurrencyOrMissing(summary.partialPaymentsBalance)}.`);
  }

  if (summary.legalClaimsWithTasksCount > 0) {
    lines.push(`5. תיקים משפטיים: ${summary.legalClaimsWithTasksCount} תיקים בייצוג עו"ד בסך של ${formatCurrencyOrMissing(summary.legalClaimsAmount)}.`);
  }

  lines.push('');
  lines.push('תיקים דחופים ראשונים לטיפול:');
  const topRed = redAlerts.slice(0, 5);
  if (topRed.length === 0) {
    lines.push('אין כרגע תיקים ברמת דחיפות אדומה. יש להמשיך מעקב שוטף.');
  } else {
    topRed.forEach((a, idx) => {
      lines.push(`${idx + 1}. תיק ${a.claimId} (רכב ${a.plate} · ${a.clientName}): ${a.title} מול ${a.insCompany}. יתרה: ${formatCurrencyOrMissing(a.amount)}. אחראי: ${a.assignedToName}.`);
    });
  }

  lines.push('');
  lines.push('הערה: הנתונים מבוססים על רשומות מאומתות במערכת בלבד. הטיפול מבוצע ישירות בכרטיס התיק.');

  return lines.join('\n');
}
