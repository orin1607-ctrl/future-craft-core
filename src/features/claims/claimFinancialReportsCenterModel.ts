// src/features/claims/claimFinancialReportsCenterModel.ts
/**
 * Authoritative financial data engine for the Claims Financial Reports Center.
 * Handles normalization, multi-source financial extraction (audits, quotes, manual entries),
 * strict prevention of double counting, aging calculation, deduction categorization,
 * and 15 executive KPI calculations.
 */

import type { ClaimRecord } from './claimsConstants';

export interface DeductionItem {
  id?: string;
  amount: number;
  reason: string;
  category: 'deductible' | 'reinstatement' | 'depreciation' | 'labor_cut' | 'paint_cut' | 'part_cut' | 'advance_payment' | 'unexplained' | string;
  isUnexplained?: boolean;
  sourceSnippet?: string;
}

export type VerificationStatus = 'verified' | 'ai_extracted' | 'manual' | 'unverified';
export type PaymentStatusKind = 'full' | 'partial' | 'unpaid' | 'no_data';
export type AgingBucket = '0-30' | '31-60' | '61-90' | '90+' | 'none';

export interface ClaimFinancialRow {
  claimId: string;
  plate: string;
  clientName: string;
  claimNum: string;
  rawInsCompany: string;
  insCompany: string; // Normalized
  status: string;
  isClosed: boolean;
  isLegal: boolean;
  legalDetails: { firm?: string; lawyer?: string; reason?: string };

  // Dates
  createdAtStr: string;
  createdDate: Date | null;
  demandDateStr: string;
  demandDate: Date | null;
  lastPaymentDateStr: string;
  lastPaymentDate: Date | null;

  // Aging
  agingDays: number | null;
  agingBucket: AgingBucket;

  // Financial figures (null means NO DATA - never display 0 for missing data)
  quoteAmount: number | null;
  surveyorAmount: number | null;
  demandAmount: number | null;
  approvedAmount: number | null;
  paidAmount: number | null;
  deductionsAmount: number | null;
  deductionsList: DeductionItem[];
  disputedAmount: number | null;
  debtAmount: number | null; // Open debt to be collected

  // Status & Traceability
  paymentStatus: PaymentStatusKind;
  verificationStatus: VerificationStatus;
  sourceKind: 'audit_ocr' | 'quote' | 'field' | 'none';
  sourceDescription: string;
  sourceSnippet?: string;
  hasUnverifiedWarning: boolean;
}

export interface InsurerSummaryRow {
  insurerName: string;
  claimsCount: number;
  openClaimsCount: number;
  totalDemanded: number;
  totalApproved: number;
  totalPaid: number;
  totalDeductions: number;
  totalDisputed: number;
  totalDebt: number;
  unpaidClaimsCount: number;
  legalClaimsCount: number;
  verifiedRatePct: number;
}

export interface KpiCardData {
  id: string;
  title: string;
  valueText: string;
  numericValue: number;
  subtext: string;
  count?: number;
  tone: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  icon: string;
  drilldownKey: string;
  isCurrency: boolean;
}

export interface FinancialCenterFilters {
  searchTerm: string;
  insurer: string;
  period: 'all' | 'this_month' | 'last_month' | 'quarter' | 'year' | 'custom';
  customFrom: string;
  customTo: string;
  dateBasis: 'created' | 'demand' | 'payment';
  statusKind: 'all' | 'open_debt' | 'fully_paid' | 'partially_paid' | 'unpaid' | 'disputed' | 'legal' | 'pending_verification';
}

/** Normalize insurance company name variants to canonical names */
export function normalizeInsurerName(raw: unknown): string {
  if (!raw || typeof raw !== 'string') return 'ללא חברה';
  const clean = raw.trim();
  if (!clean || clean === '—' || clean === 'null' || clean === 'undefined') return 'ללא חברה';

  if (/הראל/i.test(clean)) return 'הראל';
  if (/פניקס/i.test(clean)) return 'הפניקס';
  if (/מגדל/i.test(clean)) return 'מגדל';
  if (/כלל/i.test(clean)) return 'כלל';
  if (/אילון|איילון/i.test(clean)) return 'איילון';
  if (/ישיר/i.test(clean)) return 'ביטוח ישיר';
  if (/ליברה/i.test(clean)) return 'ליברה';
  if (/aig/i.test(clean)) return 'AIG';
  if (/הכשרה/i.test(clean)) return 'הכשרה';
  if (/שלמה|sixt/i.test(clean)) return 'שלמה SIXT';
  if (/wesure|ווישור/i.test(clean)) return 'WeSure';
  if (/qa ביטוח|בדיקות/i.test(clean)) return 'QA ביטוח';

  return clean;
}

/** Helper to parse numbers safely */
export function parseFinancialNum(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : null;
  }
  if (typeof val === 'string') {
    const s = val.trim();
    if (!s || s === '—' || s === 'null' || s === 'undefined' || s === 'אין נתון' || s === 'טרם אומת') {
      return null;
    }
    const clean = s.replace(/[^\d.-]/g, '');
    if (!clean) return null;
    const n = parseFloat(clean);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Parse dates from various string formats (ISO, DD/MM/YYYY, Hebrew locale) */
export function parseDateSafe(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  if (typeof val !== 'string') return null;

  const s = val.trim();
  if (!s) return null;

  // Try DD/MM/YYYY or DD.MM.YYYY
  const dmyMatch = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    let year = parseInt(dmyMatch[3], 10);
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // Try standard ISO or locale
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  return null;
}

/** Format currency in ILS or "אין נתון" if null */
export function formatCurrencyOrMissing(val: number | null | undefined, missingPlaceholder = 'אין נתון'): string {
  if (val === null || val === undefined) return missingPlaceholder;
  return `₪${Math.round(val).toLocaleString('he-IL')}`;
}

/** Format currency with decimals */
export function formatCurrencyDetailed(val: number | null | undefined, missingPlaceholder = 'אין נתון'): string {
  if (val === null || val === undefined) return missingPlaceholder;
  return `₪${val.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Translate deduction categories to clean Hebrew labels */
export function translateDeductionCategory(category: string): string {
  switch (category) {
    case 'deductible':
      return 'השתתפות עצמית';
    case 'reinstatement':
      return 'כינון';
    case 'depreciation':
      return 'בלאי';
    case 'direct_damage_cut':
    case 'damage_cut':
      return 'הפחתת נזק ישיר';
    case 'labor_cut':
      return 'הפחתת עבודה';
    case 'paint_cut':
      return 'הפחתת צבע';
    case 'part_cut':
      return 'הפחתת חלפים';
    case 'diminution_cut':
      return 'הפחתת ירידת ערך';
    case 'advance_payment':
      return 'קיזוז מקדמה';
    case 'unexplained':
      return 'הפחתה ללא נימוק';
    default:
      return category || 'שונות';
  }
}

/** Compute aging bucket from day count */
export function getAgingBucket(days: number | null): AgingBucket {
  if (days === null || days < 0) return 'none';
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

/**
 * Builds an authoritative financial row for a claim.
 * Prevents double-counting by strictly assigning single authoritative numbers:
 * Quote vs Surveyor Demanded vs Insurer Approved vs Actual Received Payment vs Offsets.
 */
export function buildClaimFinancialRow(
  claim: ClaimRecord | Record<string, unknown>,
  quoteData?: { totalAmount: number; version?: number } | null
): ClaimFinancialRow {
  const rowData = ((claim as any).row_data && typeof (claim as any).row_data === 'object'
    ? (claim as any).row_data
    : claim) as Record<string, any>;

  const id = String(claim.id || rowData.id || '');
  const plate = String(claim.plate || rowData.plate || '—');
  const clientName = String(claim.clientName || rowData.clientName || rowData.client_name || 'לקוח לא צוין');
  const claimNum = String(claim.claimNum || rowData.claimNum || '—');
  const rawInsCompany = String(claim.insCompany || rowData.insCompany || '');
  const insCompany = normalizeInsurerName(rawInsCompany);
  const status = String(claim.status || rowData.status || 'פתוח');
  const isClosed = status === 'הסתיים' || status === 'סגור' || status === 'בוטל' || claim.archived === 'true' || rowData.archived === 'true';

  // Legal status
  const legalFirm = String(claim.legalFirm || rowData.legalFirm || '').trim();
  const legalLawyer = String(claim.legalLawyer || rowData.legalLawyer || '').trim();
  const legalReason = String(claim.legalReason || rowData.legalReason || '').trim();
  const isLegal = Boolean(legalFirm || legalLawyer || status.includes('משפטי') || rowData.legalDate);

  // Dates
  const createdAtStr = String(claim.createdAt || rowData.createdAt || (claim as any).created_at || '');
  const createdDate = parseDateSafe(createdAtStr);

  // Financial audit data if present
  const audit = rowData.financial_audit || null;

  // 1. Quote Amount
  let quoteAmount: number | null = null;
  if (quoteData && typeof quoteData.totalAmount === 'number' && quoteData.totalAmount > 0) {
    quoteAmount = quoteData.totalAmount;
  }

  // 2. Surveyor / Demanded Amount
  let surveyorAmount: number | null = null;
  let demandAmount: number | null = null;
  let demandDateStr = '';
  let demandDate: Date | null = null;

  if (audit?.our_demand) {
    const dVal = parseFinancialNum(audit.our_demand.totalDemanded?.amount ?? audit.our_demand.totalDemanded);
    if (dVal !== null && dVal > 0) {
      surveyorAmount = dVal;
      demandAmount = dVal;
    } else {
      const parts = parseFinancialNum(audit.our_demand.parts?.amount ?? audit.our_demand.parts) || 0;
      const labor = parseFinancialNum(audit.our_demand.labor?.amount ?? audit.our_demand.labor) || 0;
      const paint = parseFinancialNum(audit.our_demand.paint?.amount ?? audit.our_demand.paint) || 0;
      const dim = parseFinancialNum(audit.our_demand.diminution?.amount ?? audit.our_demand.diminution) || 0;
      const fee = parseFinancialNum(audit.our_demand.surveyorFee?.amount ?? audit.our_demand.surveyorFee) || 0;
      const vat = parseFinancialNum(audit.our_demand.vat?.amount ?? audit.our_demand.vat) || 0;
      const sum = parts + labor + paint + dim + fee + vat;
      if (sum > 0) {
        surveyorAmount = sum;
        demandAmount = sum;
      }
    }
  }

  if (demandAmount === null && audit?.latest_comparison?.totalDemanded) {
    demandAmount = parseFinancialNum(audit.latest_comparison.totalDemanded);
  }

  // Fallback to manual fields
  if (demandAmount === null) {
    const finAmount = parseFinancialNum(claim.finAmount || rowData.finAmount || claim.claimAmount || rowData.claimAmount);
    if (finAmount !== null && finAmount > 0) {
      demandAmount = finAmount;
    }
  }

  if (audit?.our_demand?.reportDate) {
    demandDateStr = String(audit.our_demand.reportDate);
    demandDate = parseDateSafe(demandDateStr);
  } else if (rowData.eventDate) {
    demandDateStr = String(rowData.eventDate);
    demandDate = parseDateSafe(demandDateStr);
  }

  // 3. Approved Amount
  let approvedAmount: number | null = null;
  if (audit?.latest_comparison?.totalApproved !== undefined) {
    const num = parseFinancialNum(audit.latest_comparison.totalApproved);
    if (num !== null && num > 0) approvedAmount = num;
  }
  if (approvedAmount === null && Array.isArray(audit?.counter_reports) && audit.counter_reports.length > 0) {
    const counter = audit.counter_reports[0];
    const cVal = parseFinancialNum(counter.totalApproved?.amount ?? counter.totalApproved);
    if (cVal !== null && cVal > 0) approvedAmount = cVal;
  }
  if (approvedAmount === null) {
    const finApproved = parseFinancialNum(claim.finApproved || rowData.finApproved || claim.approvedAmount || rowData.approvedAmount);
    if (finApproved !== null && finApproved > 0) {
      approvedAmount = finApproved;
    }
  }

  // 4. Actual Received Payment
  let paidAmount: number | null = null;
  let lastPaymentDateStr = '';
  let lastPaymentDate: Date | null = null;

  // First priority: verified payments in bank / ledger
  if (Array.isArray(audit?.verified_payments) && audit.verified_payments.length > 0) {
    let sum = 0;
    for (const vp of audit.verified_payments) {
      const v = parseFinancialNum(vp.amount);
      if (v !== null) {
        sum += v;
        if (vp.paymentDate && !lastPaymentDateStr) {
          lastPaymentDateStr = String(vp.paymentDate);
          lastPaymentDate = parseDateSafe(lastPaymentDateStr);
        }
      }
    }
    if (sum > 0) paidAmount = sum;
  }

  // Second priority: payment notice from insurer
  if (paidAmount === null && Array.isArray(audit?.payment_notices) && audit.payment_notices.length > 0) {
    const pn = audit.payment_notices[0];
    const pVal = parseFinancialNum(pn.totalWithAdvance ?? pn.totalPaid?.amount ?? pn.totalPaid);
    if (pVal !== null && pVal > 0) {
      paidAmount = pVal;
      if (pn.noticeDate) {
        lastPaymentDateStr = String(pn.noticeDate);
        lastPaymentDate = parseDateSafe(lastPaymentDateStr);
      }
    }
  }

  // Fallback to manual paid fields
  if (paidAmount === null) {
    const finPaid = parseFinancialNum(claim.finPaid || rowData.finPaid || claim.paidAmount || rowData.paidAmount);
    if (finPaid !== null && finPaid > 0) {
      paidAmount = finPaid;
      lastPaymentDateStr = String(claim.finPayDate || rowData.finPayDate || '');
      lastPaymentDate = parseDateSafe(lastPaymentDateStr);
    }
  }

  // NOTE: Strict rule: closed status does NOT mean paid! Only actual recorded payments count.

  // 5. Deductions & Offsets
  const deductionsList: DeductionItem[] = [];
  if (Array.isArray(audit?.latest_comparison?.deductionsSummary)) {
    for (const d of audit.latest_comparison.deductionsSummary) {
      const amt = parseFinancialNum(d.amount);
      if (amt !== null && amt > 0) {
        deductionsList.push({
          id: d.id,
          amount: amt,
          reason: String(d.reason || d.label || 'קיזוז ללא נימוק'),
          category: String(d.category || 'unexplained'),
          isUnexplained: Boolean(d.isUnexplained),
          sourceSnippet: d.sourceSnippet,
        });
      }
    }
  }
  // Fallback to counter reports deductions if summary empty
  if (deductionsList.length === 0 && Array.isArray(audit?.counter_reports)) {
    for (const cr of audit.counter_reports) {
      if (Array.isArray(cr.deductions)) {
        for (const cd of cr.deductions) {
          const amt = parseFinancialNum(cd.amount);
          if (amt !== null && amt > 0) {
            deductionsList.push({
              amount: amt,
              reason: String(cd.reason || 'הפחתת שמאי נגדי'),
              category: String(cd.category || 'damage_cut'),
              sourceSnippet: cd.sourceSnippet,
            });
          }
        }
      }
    }
  }

  const deductionsAmount = deductionsList.length > 0 ? deductionsList.reduce((acc, curr) => acc + curr.amount, 0) : null;

  // 6. Disputed Amount
  let disputedAmount: number | null = null;
  if (Array.isArray(audit?.payment_notices) && audit.payment_notices.length > 0) {
    const pn = audit.payment_notices[0];
    const disp = parseFinancialNum(pn.disputedDifference?.amount ?? pn.disputedDifference);
    if (disp !== null && disp > 0) disputedAmount = disp;
  }
  if (disputedAmount === null && demandAmount !== null && approvedAmount !== null && demandAmount > approvedAmount) {
    disputedAmount = demandAmount - approvedAmount;
  }

  // 7. Open Debt Balance
  let debtAmount: number | null = null;
  const effectiveBaseAmount = approvedAmount !== null && approvedAmount > 0 ? approvedAmount : demandAmount;
  if (effectiveBaseAmount !== null && effectiveBaseAmount > 0) {
    const paid = paidAmount || 0;
    const diff = effectiveBaseAmount - paid;
    debtAmount = diff > 0 ? diff : 0;
  } else if (paidAmount !== null && paidAmount > 0) {
    debtAmount = 0;
  }

  // 8. Payment status kind
  let paymentStatus: PaymentStatusKind = 'no_data';
  if (effectiveBaseAmount !== null && effectiveBaseAmount > 0) {
    if (paidAmount === null || paidAmount === 0) {
      paymentStatus = 'unpaid';
    } else if (paidAmount >= effectiveBaseAmount) {
      paymentStatus = 'full';
    } else {
      paymentStatus = 'partial';
    }
  } else if (paidAmount !== null && paidAmount > 0) {
    paymentStatus = 'full';
  }

  // 9. Aging Calculation
  let agingDays: number | null = null;
  const agingRefDate = demandDate || createdDate;
  if (agingRefDate && debtAmount !== null && debtAmount > 0) {
    const now = new Date();
    const diffMs = now.getTime() - agingRefDate.getTime();
    if (diffMs > 0) {
      agingDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }
  }
  const agingBucket = getAgingBucket(agingDays);

  // 10. Traceability & Verification
  let verificationStatus: VerificationStatus = 'unverified';
  let sourceKind: 'audit_ocr' | 'quote' | 'field' | 'none' = 'none';
  let sourceDescription = 'ללא נתונים כספיים';
  let sourceSnippet = '';

  if (audit) {
    sourceKind = 'audit_ocr';
    sourceDescription = 'מערכת בקרה כספית (מסמכי שומה / הודעת סילוק)';
    verificationStatus = audit.verified_payments?.length > 0 ? 'verified' : 'ai_extracted';
    if (audit.auto_read_state === 'needs_review') {
      verificationStatus = 'unverified';
      sourceDescription += ' (ממתין לאימות אנושי)';
    }
  } else if (quoteAmount !== null && quoteAmount > 0) {
    sourceKind = 'quote';
    sourceDescription = 'הצעת מחיר פנימית שנשמרה בתיק';
    verificationStatus = 'manual';
  } else if (demandAmount !== null || approvedAmount !== null || paidAmount !== null) {
    sourceKind = 'field';
    sourceDescription = 'הזנה ידנית בכרטיס תביעה';
    verificationStatus = 'manual';
  }

  const hasUnverifiedWarning = verificationStatus === 'unverified' || (demandAmount !== null && paidAmount === null && !approvedAmount);

  return {
    claimId: id,
    plate,
    clientName,
    claimNum,
    rawInsCompany,
    insCompany,
    status,
    isClosed,
    isLegal,
    legalDetails: { firm: legalFirm, lawyer: legalLawyer, reason: legalReason },
    createdAtStr,
    createdDate,
    demandDateStr,
    demandDate,
    lastPaymentDateStr,
    lastPaymentDate,
    agingDays,
    agingBucket,
    quoteAmount,
    surveyorAmount,
    demandAmount,
    approvedAmount,
    paidAmount,
    deductionsAmount,
    deductionsList,
    disputedAmount,
    debtAmount,
    paymentStatus,
    verificationStatus,
    sourceKind,
    sourceDescription,
    sourceSnippet,
    hasUnverifiedWarning,
  };
}

/** Check if row falls inside the filter date range */
export function isRowInDateRange(
  row: ClaimFinancialRow,
  basis: 'created' | 'demand' | 'payment',
  period: 'all' | 'this_month' | 'last_month' | 'quarter' | 'year' | 'custom',
  customFrom: string,
  customTo: string
): boolean {
  if (period === 'all') return true;

  let d: Date | null = null;
  if (basis === 'created') d = row.createdDate;
  else if (basis === 'demand') d = row.demandDate || row.createdDate;
  else if (basis === 'payment') d = row.lastPaymentDate || row.demandDate || row.createdDate;

  if (!d) return true; // If no date, do not omit strictly unless custom range set

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  if (period === 'this_month') {
    return d.getFullYear() === year && d.getMonth() === month;
  }
  if (period === 'last_month') {
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    return d.getFullYear() === prevYear && d.getMonth() === prevMonth;
  }
  if (period === 'quarter') {
    const currentQuarter = Math.floor(month / 3);
    const rowQuarter = Math.floor(d.getMonth() / 3);
    return d.getFullYear() === year && currentQuarter === rowQuarter;
  }
  if (period === 'year') {
    return d.getFullYear() === year;
  }
  if (period === 'custom') {
    if (customFrom) {
      const fromD = new Date(customFrom);
      fromD.setHours(0, 0, 0, 0);
      if (d < fromD) return false;
    }
    if (customTo) {
      const toD = new Date(customTo);
      toD.setHours(23, 59, 59, 999);
      if (d > toD) return false;
    }
    return true;
  }
  return true;
}

/** Filter claims based on the full filter state */
export function filterFinancialRows(rows: ClaimFinancialRow[], filters: FinancialCenterFilters): ClaimFinancialRow[] {
  const q = filters.searchTerm.trim().toLowerCase();

  return rows.filter((r) => {
    // 1. Text search
    if (q) {
      const match =
        r.clientName.toLowerCase().includes(q) ||
        r.plate.replace(/[^\d]/g, '').includes(q.replace(/[^\d]/g, '')) ||
        r.claimNum.toLowerCase().includes(q) ||
        r.insCompany.toLowerCase().includes(q) ||
        r.claimId.toLowerCase().includes(q);
      if (!match) return false;
    }

    // 2. Insurer
    if (filters.insurer && filters.insurer !== 'all') {
      if (r.insCompany !== filters.insurer) return false;
    }

    // 3. Status Kind
    if (filters.statusKind && filters.statusKind !== 'all') {
      switch (filters.statusKind) {
        case 'open_debt':
          if (!r.debtAmount || r.debtAmount <= 0) return false;
          break;
        case 'fully_paid':
          if (r.paymentStatus !== 'full') return false;
          break;
        case 'partially_paid':
          if (r.paymentStatus !== 'partial') return false;
          break;
        case 'unpaid':
          if (r.paymentStatus !== 'unpaid') return false;
          break;
        case 'disputed':
          if (!r.disputedAmount || r.disputedAmount <= 0) return false;
          break;
        case 'legal':
          if (!r.isLegal) return false;
          break;
        case 'pending_verification':
          if (!r.hasUnverifiedWarning) return false;
          break;
      }
    }

    // 4. Date range
    return isRowInDateRange(r, filters.dateBasis, filters.period, filters.customFrom, filters.customTo);
  });
}

/**
 * Calculates the 15 KPI cards for the Financial Reports Center.
 * Strictly avoids showing "0" when data is missing or unverified.
 */
export function compute15FinancialKpis(rows: ClaimFinancialRow[]): KpiCardData[] {
  let sumClaimDemands = 0;
  let countClaimDemands = 0;

  let sumQuotes = 0;
  let countQuotes = 0;

  let sumSurveyors = 0;
  let countSurveyors = 0;

  let sumDemandsToInsurers = 0;
  let countDemandsToInsurers = 0;

  let sumApproved = 0;
  let countApproved = 0;

  let sumPaid = 0;
  let countPaid = 0;

  let sumOpenDebt = 0;
  let countOpenDebt = 0;

  let sumDeductions = 0;
  let countDeductions = 0;

  let sumDisputed = 0;
  let countDisputed = 0;

  let sumLegal = 0;
  let countLegal = 0;

  let countOpenClaims = 0;
  let countFullyPaid = 0;
  let countPartiallyPaid = 0;
  let countUnpaid = 0;

  let sumPendingVerification = 0;
  let countPendingVerification = 0;

  for (const r of rows) {
    if (!r.isClosed) countOpenClaims++;

    if (r.demandAmount !== null && r.demandAmount > 0) {
      sumClaimDemands += r.demandAmount;
      countClaimDemands++;

      if (r.insCompany !== 'ללא חברה') {
        sumDemandsToInsurers += r.demandAmount;
        countDemandsToInsurers++;
      }
    }

    if (r.quoteAmount !== null && r.quoteAmount > 0) {
      sumQuotes += r.quoteAmount;
      countQuotes++;
    }

    if (r.surveyorAmount !== null && r.surveyorAmount > 0) {
      sumSurveyors += r.surveyorAmount;
      countSurveyors++;
    }

    if (r.approvedAmount !== null && r.approvedAmount > 0) {
      sumApproved += r.approvedAmount;
      countApproved++;
    }

    if (r.paidAmount !== null && r.paidAmount > 0) {
      sumPaid += r.paidAmount;
      countPaid++;
    }

    if (r.debtAmount !== null && r.debtAmount > 0) {
      sumOpenDebt += r.debtAmount;
      countOpenDebt++;
    }

    if (r.deductionsAmount !== null && r.deductionsAmount > 0) {
      sumDeductions += r.deductionsAmount;
      countDeductions++;
    }

    if (r.disputedAmount !== null && r.disputedAmount > 0) {
      sumDisputed += r.disputedAmount;
      countDisputed++;
    }

    if (r.isLegal) {
      const legalVal = r.demandAmount || r.quoteAmount || 0;
      sumLegal += legalVal;
      countLegal++;
    }

    if (r.paymentStatus === 'full') countFullyPaid++;
    else if (r.paymentStatus === 'partial') countPartiallyPaid++;
    else if (r.paymentStatus === 'unpaid') countUnpaid++;

    if (r.hasUnverifiedWarning) {
      sumPendingVerification += r.debtAmount || r.demandAmount || 0;
      countPendingVerification++;
    }
  }

  const kpis: KpiCardData[] = [
    {
      id: 'kpi-1-demands',
      title: 'סך סכומי התביעות',
      valueText: countClaimDemands > 0 ? formatCurrencyOrMissing(sumClaimDemands) : 'אין נתון',
      numericValue: sumClaimDemands,
      subtext: countClaimDemands > 0 ? `${countClaimDemands} תיקים עם דרישה כספית` : 'טרם הוזנו סכומים',
      count: countClaimDemands,
      tone: 'primary',
      icon: '📋',
      drilldownKey: 'demands',
      isCurrency: true,
    },
    {
      id: 'kpi-2-quotes',
      title: 'סך הצעות המחיר',
      valueText: countQuotes > 0 ? formatCurrencyOrMissing(sumQuotes) : 'אין נתון',
      numericValue: sumQuotes,
      subtext: countQuotes > 0 ? `${countQuotes} הצעות מחיר במערכת` : 'אין הצעות לתקופה זו',
      count: countQuotes,
      tone: 'info',
      icon: '🧾',
      drilldownKey: 'quotes',
      isCurrency: true,
    },
    {
      id: 'kpi-3-surveyors',
      title: 'סך שומות שמאי',
      valueText: countSurveyors > 0 ? formatCurrencyOrMissing(sumSurveyors) : 'אין נתון',
      numericValue: sumSurveyors,
      subtext: countSurveyors > 0 ? `${countSurveyors} דוחות שמאי מאומתים` : 'טרם נסרקו שומות',
      count: countSurveyors,
      tone: 'neutral',
      icon: '🔍',
      drilldownKey: 'surveyors',
      isCurrency: true,
    },
    {
      id: 'kpi-4-demands-insurers',
      title: 'דרישות לחברות ביטוח',
      valueText: countDemandsToInsurers > 0 ? formatCurrencyOrMissing(sumDemandsToInsurers) : 'אין נתון',
      numericValue: sumDemandsToInsurers,
      subtext: countDemandsToInsurers > 0 ? `${countDemandsToInsurers} תביעות מול מבטחות` : 'ללא דרישות ביטוח',
      count: countDemandsToInsurers,
      tone: 'primary',
      icon: '🏢',
      drilldownKey: 'demands_insurers',
      isCurrency: true,
    },
    {
      id: 'kpi-5-approved',
      title: 'סך סכומים שאושרו',
      valueText: countApproved > 0 ? formatCurrencyOrMissing(sumApproved) : 'טרם אומת',
      numericValue: sumApproved,
      subtext: countApproved > 0 ? `${countApproved} תיקים עם אישור מבטחת` : 'ממתין לדוחות נגדיים',
      count: countApproved,
      tone: 'success',
      icon: '✅',
      drilldownKey: 'approved',
      isCurrency: true,
    },
    {
      id: 'kpi-6-paid',
      title: 'תשלומים שהתקבלו בפועל',
      valueText: countPaid > 0 ? formatCurrencyOrMissing(sumPaid) : 'אין נתון',
      numericValue: sumPaid,
      subtext: countPaid > 0 ? `${countPaid} תשלומים בפועל / הודעות` : 'לא נרשמו תקבולים',
      count: countPaid,
      tone: 'success',
      icon: '💰',
      drilldownKey: 'paid',
      isCurrency: true,
    },
    {
      id: 'kpi-7-debt',
      title: 'יתרת חוב פתוחה לגבייה',
      valueText: countOpenDebt > 0 ? formatCurrencyOrMissing(sumOpenDebt) : '₪0',
      numericValue: sumOpenDebt,
      subtext: countOpenDebt > 0 ? `${countOpenDebt} תיקים עם יתרה לגבייה` : 'אין חובות פתוחים',
      count: countOpenDebt,
      tone: sumOpenDebt > 0 ? 'danger' : 'success',
      icon: '⚖️',
      drilldownKey: 'open_debt',
      isCurrency: true,
    },
    {
      id: 'kpi-8-deductions',
      title: 'סך קיזוזים והפחתות',
      valueText: countDeductions > 0 ? formatCurrencyOrMissing(sumDeductions) : '₪0',
      numericValue: sumDeductions,
      subtext: countDeductions > 0 ? `${countDeductions} תיקים עם קיזוזים (השתתפות/בלאי)` : 'ללא קיזוזים',
      count: countDeductions,
      tone: 'warning',
      icon: '✂️',
      drilldownKey: 'deductions',
      isCurrency: true,
    },
    {
      id: 'kpi-9-disputed',
      title: 'סכומים במחלוקת',
      valueText: countDisputed > 0 ? formatCurrencyOrMissing(sumDisputed) : '₪0',
      numericValue: sumDisputed,
      subtext: countDisputed > 0 ? `${countDisputed} תיקים עם פערים לתביעה` : 'אין מחלוקות פעילות',
      count: countDisputed,
      tone: sumDisputed > 0 ? 'warning' : 'neutral',
      icon: '⚡',
      drilldownKey: 'disputed',
      isCurrency: true,
    },
    {
      id: 'kpi-10-legal',
      title: 'סכומים בתיקים משפטיים',
      valueText: countLegal > 0 ? formatCurrencyOrMissing(sumLegal) : '₪0',
      numericValue: sumLegal,
      subtext: countLegal > 0 ? `${countLegal} תיקים בייצוג משפטי` : 'אין תיקים משפטיים',
      count: countLegal,
      tone: countLegal > 0 ? 'danger' : 'neutral',
      icon: '⚖️',
      drilldownKey: 'legal',
      isCurrency: true,
    },
    {
      id: 'kpi-11-open-claims',
      title: 'תיקים פתוחים',
      valueText: String(countOpenClaims),
      numericValue: countOpenClaims,
      subtext: `מתוך ${rows.length} תיקים בסה"כ`,
      count: countOpenClaims,
      tone: 'info',
      icon: '📂',
      drilldownKey: 'open_claims',
      isCurrency: false,
    },
    {
      id: 'kpi-12-paid-full',
      title: 'שולמו במלואם',
      valueText: String(countFullyPaid),
      numericValue: countFullyPaid,
      subtext: 'תשלום מלא התקבל',
      count: countFullyPaid,
      tone: 'success',
      icon: '🏁',
      drilldownKey: 'fully_paid',
      isCurrency: false,
    },
    {
      id: 'kpi-13-paid-partial',
      title: 'שולמו חלקית',
      valueText: String(countPartiallyPaid),
      numericValue: countPartiallyPaid,
      subtext: 'התקבל תשלום חלקי / מקדמה',
      count: countPartiallyPaid,
      tone: 'warning',
      icon: '⏳',
      drilldownKey: 'partially_paid',
      isCurrency: false,
    },
    {
      id: 'kpi-14-unpaid',
      title: 'טרם שולמו כלל',
      valueText: String(countUnpaid),
      numericValue: countUnpaid,
      subtext: 'ממתינים לתשלום ראשון',
      count: countUnpaid,
      tone: countUnpaid > 0 ? 'danger' : 'success',
      icon: '🛑',
      drilldownKey: 'unpaid',
      isCurrency: false,
    },
    {
      id: 'kpi-15-verification',
      title: 'ממתינים לבדיקה ואימות',
      valueText: countPendingVerification > 0 ? formatCurrencyOrMissing(sumPendingVerification) : 'הכל מאומת',
      numericValue: sumPendingVerification,
      subtext: countPendingVerification > 0 ? `${countPendingVerification} תיקים דורשים אימות נתונים` : 'כל הנתונים תקינים',
      count: countPendingVerification,
      tone: countPendingVerification > 0 ? 'warning' : 'success',
      icon: '🛡️',
      drilldownKey: 'pending_verification',
      isCurrency: true,
    },
  ];

  return kpis;
}

/** Summarize financial metrics by normalized insurance company */
export function computeInsurersSummary(rows: ClaimFinancialRow[]): InsurerSummaryRow[] {
  const map = new Map<string, {
    claimsCount: number;
    openClaimsCount: number;
    totalDemanded: number;
    totalApproved: number;
    totalPaid: number;
    totalDeductions: number;
    totalDisputed: number;
    totalDebt: number;
    unpaidClaimsCount: number;
    legalClaimsCount: number;
    verifiedClaimsCount: number;
  }>();

  for (const r of rows) {
    const key = r.insCompany;
    if (!map.has(key)) {
      map.set(key, {
        claimsCount: 0,
        openClaimsCount: 0,
        totalDemanded: 0,
        totalApproved: 0,
        totalPaid: 0,
        totalDeductions: 0,
        totalDisputed: 0,
        totalDebt: 0,
        unpaidClaimsCount: 0,
        legalClaimsCount: 0,
        verifiedClaimsCount: 0,
      });
    }

    const item = map.get(key)!;
    item.claimsCount++;
    if (!r.isClosed) item.openClaimsCount++;
    if (r.demandAmount) item.totalDemanded += r.demandAmount;
    if (r.approvedAmount) item.totalApproved += r.approvedAmount;
    if (r.paidAmount) item.totalPaid += r.paidAmount;
    if (r.deductionsAmount) item.totalDeductions += r.deductionsAmount;
    if (r.disputedAmount) item.totalDisputed += r.disputedAmount;
    if (r.debtAmount) item.totalDebt += r.debtAmount;
    if (r.paymentStatus === 'unpaid') item.unpaidClaimsCount++;
    if (r.isLegal) item.legalClaimsCount++;
    if (r.verificationStatus === 'verified') item.verifiedClaimsCount++;
  }

  const result: InsurerSummaryRow[] = [];
  for (const [insurerName, stats] of map.entries()) {
    result.push({
      insurerName,
      ...stats,
      verifiedRatePct: stats.claimsCount > 0 ? Math.round((stats.verifiedClaimsCount / stats.claimsCount) * 100) : 0,
    });
  }

  // Sort by highest debt, then by claims count
  return result.sort((a, b) => b.totalDebt - a.totalDebt || b.claimsCount - a.claimsCount);
}

/** Export summary and detail tables to UTF-8 BOM CSV for Hebrew Excel compatibility */
export function exportFinancialToCsv(
  rows: ClaimFinancialRow[],
  kpis: KpiCardData[],
  insurers: InsurerSummaryRow[]
): string {
  const lines: string[] = [];

  // 1. Title & KPIs Summary
  lines.push('מרכז דוחות כספיים - תביעות וביטוח');
  lines.push(`הופק בתאריך: ${new Date().toLocaleString('he-IL')}`);
  lines.push('');
  lines.push('מדדי מפתח כספיים (15 KPIs)');
  lines.push('מדד,ערך,פירוט,כמות תיקים');
  for (const k of kpis) {
    lines.push(`"${k.title}","${k.valueText.replace(/"/g, '""')}","${k.subtext.replace(/"/g, '""')}",${k.count || 0}`);
  }

  lines.push('');
  lines.push('סיכום לפי חברות ביטוח');
  lines.push('חברת ביטוח,מספר תיקים,פתוחים,סך דרישות,אושר,שולם בפועל,קיזוזים,מחלוקת,יתרת חוב,תיקים שלא שולמו,משפטי');
  for (const ins of insurers) {
    lines.push(
      `"${ins.insurerName}",${ins.claimsCount},${ins.openClaimsCount},${Math.round(ins.totalDemanded)},${Math.round(ins.totalApproved)},${Math.round(ins.totalPaid)},${Math.round(ins.totalDeductions)},${Math.round(ins.totalDisputed)},${Math.round(ins.totalDebt)},${ins.unpaidClaimsCount},${ins.legalClaimsCount}`
    );
  }

  lines.push('');
  lines.push('דוח מפורט - תיקי תביעות');
  lines.push('מספר תיק,רכב,לקוח,חברת ביטוח,סטטוס,סכום דרישה,אושר,שולם בפועל,קיזוזים,יתרת חוב,גיל החוב (ימים),מצב תשלום,אימות,משפטי');
  for (const r of rows) {
    lines.push(
      `"${r.claimId}","${r.plate}","${r.clientName.replace(/"/g, '""')}","${r.insCompany}","${r.status}",${r.demandAmount ? Math.round(r.demandAmount) : '""'},${r.approvedAmount ? Math.round(r.approvedAmount) : '""'},${r.paidAmount ? Math.round(r.paidAmount) : '""'},${r.deductionsAmount ? Math.round(r.deductionsAmount) : '""'},${r.debtAmount ? Math.round(r.debtAmount) : '""'},${r.agingDays !== null ? r.agingDays : '""'},"${r.paymentStatus}","${r.verificationStatus}","${r.isLegal ? 'כן' : 'לא'}"`
    );
  }

  // Prepend UTF-8 BOM
  return '\uFEFF' + lines.join('\r\n');
}
