import React, { useMemo, useState, useCallback, useEffect } from 'react';
import type { ClaimRecord } from './claimsConstants';
import { displayClaimNum, isClosedStatus } from './claimsConstants';
import './claims-reports.css';

// Status color mapping for real system statuses
const ST_COLOR_MAP: Record<string, { bg: string; color: string }> = {
  'חדש': { bg: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa' },
  'תביעה חדשה – התקבלה': { bg: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa' },
  'ממתין למילוי הלקוח': { bg: 'rgba(234, 179, 8, 0.2)', color: '#facc15' },
  'ממתין לטיפול': { bg: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24' },
  'בטיפול': { bg: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24' },
  'ממתין למסמכים': { bg: 'rgba(234, 179, 8, 0.2)', color: '#facc15' },
  'ממתין לשמאי': { bg: 'rgba(168, 85, 247, 0.2)', color: '#c084fc' },
  'דוח שמאי התקבל': { bg: 'rgba(99, 102, 241, 0.2)', color: '#818cf8' },
  'ממתין לחברת ביטוח': { bg: 'rgba(249, 115, 22, 0.2)', color: '#fb923c' },
  'ממתין לתשלום': { bg: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24' },
  'אושר לתשלום': { bg: 'rgba(34, 197, 94, 0.2)', color: '#4ade80' },
  'אושר': { bg: 'rgba(34, 197, 94, 0.2)', color: '#4ade80' },
  'אושר חלקית': { bg: 'rgba(234, 88, 12, 0.2)', color: '#fdba74' },
  'תשלום חלקי': { bg: 'rgba(234, 88, 12, 0.2)', color: '#fdba74' },
  'שולם': { bg: 'rgba(22, 163, 74, 0.2)', color: '#86efac' },
  'הועבר לטיפול משפטי': { bg: 'rgba(239, 68, 68, 0.2)', color: '#f87171' },
  'בטיפול משפטי': { bg: 'rgba(220, 38, 38, 0.2)', color: '#ef4444' },
  'תביעה משפטית': { bg: 'rgba(220, 38, 38, 0.2)', color: '#ef4444' },
  'בבדיקה משפטית': { bg: 'rgba(239, 68, 68, 0.2)', color: '#f87171' },
  'ערעור': { bg: 'rgba(217, 70, 239, 0.2)', color: '#f0abfc' },
  'נדחה': { bg: 'rgba(153, 27, 27, 0.25)', color: '#fca5a5' },
  'הסתיים': { bg: 'rgba(100, 116, 139, 0.2)', color: '#94a3b8' },
  'סגור': { bg: 'rgba(100, 116, 139, 0.2)', color: '#94a3b8' },
  'בוטל': { bg: 'rgba(71, 85, 105, 0.2)', color: '#64748b' },
};

function stBadge(s: string) {
  const c = ST_COLOR_MAP[s] || { bg: 'rgba(255, 255, 255, 0.1)', color: '#e2e8f0' };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '6px',
        fontSize: '11px',
        fontWeight: 700,
        backgroundColor: c.bg,
        color: c.color,
        whiteSpace: 'nowrap',
      }}
    >
      {s || 'ללא סטטוס'}
    </span>
  );
}

export interface GarageCaseRecord {
  id: string;
  case_number?: string;
  customer_name_snapshot?: string;
  vehicle_plate_snapshot?: string;
  vehicle_label_snapshot?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  case_data?: {
    route?: string;
    flowStage?: string;
    workOrderSaved?: boolean;
    workOrderAmount?: number | string | null;
    workOrderNumber?: string | null;
    workOrderRef?: string | null;
    workOrderContact?: string | null;
    workOrderDate?: string | null;
    workOrderNotes?: string | null;
    workFinished?: boolean;
    workFinishedAt?: string | null;
    workFinishedBy?: string | null;
    caseClosed?: boolean;
    caseClosedAt?: string | null;
    finalApprovedAmount?: number | string | null;
    workExtraPrice?: number | null;
    totalAmount?: number | null;
    claimNumber?: string | null;
    intakeWorker?: string | null;
    referralSource?: string | null;
    source?: string | null;
    customer_type?: string | null;
    payer?: string | null;
    payingEntity?: string | null;
    workType?: string | null;
    quote?: {
      works?: Array<{ price?: number; desc?: string; type?: string }>;
      parts?: Array<{ price?: number; desc?: string; supplier?: string; name?: string }>;
    };
    quoteWorks?: Array<{ id?: string; part?: string; type?: string; qty?: number; price?: number; desc?: string }>;
    quoteParts?: Array<{ id?: string; name?: string; qty?: number; price?: number; supplier?: string; sku?: string }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ReportItem {
  id: string;
  displayNumber: string;
  originType: 'insurance' | 'garage';
  originLabel: string;
  referralSource: string; // מקור הגעה
  payer: string;          // גורם משלם
  workType: string;       // סוג עבודה
  workDesc: string;       // תיאור עבודה
  workOrderNumber: string;// מספר הזמנת עבודה
  quoteNumber: string;    // מספר הצעת מחיר
  invoiceNumber: string;  // מספר חשבונית
  clientName: string;     // שם לקוח
  clientPhone: string;
  plate: string;          // מספר רכב
  vehicleLabel: string;   // דגם רכב
  insCompany: string;     // חברת ביטוח
  insAgent: string;       // סוכן ביטוח
  appraiser: string;      // שמאי
  status: string;         // סטטוס
  createdAt: Date | null;
  createdAtStr: string;
  closedAt: Date | null;
  closedAtStr: string;
  paymentDate: Date | null;
  paymentDateStr: string;
  isClosed: boolean;
  isOpen: boolean;
  isLegal: boolean;
  // Financial metrics
  claimAmount: number;    // סכום תביעה / שווי עבודה נדרש
  quoteAmount: number;    // סכום הצעת מחיר
  approvedAmount: number; // סכום שאושר
  invoicedAmount: number; // סכום חשבונית
  paidAmount: number;     // סכום שהתקבל בפועל
  balanceAmount: number;  // יתרת חוב
  // Costs & Profitability (only when documented)
  partsCost: number;
  suppliersCost: number;
  laborCost: number;
  totalCost: number;
  hasReliableCost: boolean;
  rawClaim?: ClaimRecord;
  rawGarage?: GarageCaseRecord;
}

interface ClaimsReportsViewProps {
  claims: ClaimRecord[];
  garageCases: GarageCaseRecord[];
  onBack: () => void;
  onOpenClaim: (id: string) => void;
  onOpenGarageCase: (id: string) => void;
}

// All 14 Period Filter Presets
export type PeriodFilter =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'last_7_days'
  | 'this_month'
  | 'last_month'
  | 'last_30_days'
  | 'last_3_months'
  | 'last_6_months'
  | 'last_12_months'
  | 'this_year'
  | 'last_year'
  | 'all'
  | 'custom';

export type OriginFilter = 'all' | 'insurance' | 'garage';

const PERIOD_OPTIONS: Array<{ key: PeriodFilter; label: string; group?: string }> = [
  { key: 'today', label: 'היום' },
  { key: 'yesterday', label: 'אתמול' },
  { key: 'this_week', label: 'השבוע הנוכחי' },
  { key: 'last_week', label: 'השבוע שעבר' },
  { key: 'last_7_days', label: '7 ימים אחרונים' },
  { key: 'this_month', label: 'החודש הנוכחי' },
  { key: 'last_month', label: 'החודש שעבר' },
  { key: 'last_30_days', label: '30 ימים אחרונים' },
  { key: 'last_3_months', label: '3 חודשים אחרונים' },
  { key: 'last_6_months', label: '6 חודשים אחרונים' },
  { key: 'last_12_months', label: '12 חודשים אחרונים' },
  { key: 'this_year', label: 'השנה הנוכחית' },
  { key: 'last_year', label: 'השנה שעברה' },
  { key: 'all', label: 'כל התקופות' },
  { key: 'custom', label: 'טווח מותאם אישית…' },
];

export const REFERRAL_SOURCES = [
  'הכול',
  'לקוח פרטי ישיר',
  'לקוח עסקי',
  'חברת ביטוח',
  'סוכן ביטוח',
  'חברת ליסינג',
  'חברת השכרת רכב',
  'צי רכב',
  'הפניה של לקוח אחר',
  'הפניה של גורם עסקי',
  'מקור אחר',
  'מקור לא ידוע',
] as const;

function parseDateIso(str?: string | null): Date | null {
  if (!str) return null;
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  // Match Hebrew DD/MM/YYYY or DD.MM.YYYY
  const m = String(str).match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})(?:[,\s]+(\d{1,2}):(\d{1,2}))?/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const hh = m[4] ? Number(m[4]) : 12;
    const mm = m[5] ? Number(m[5]) : 0;
    return new Date(y, Number(m[2]) - 1, Number(m[1]), hh, mm);
  }
  return null;
}

function fmtMoney(n: number): string {
  if (!n || isNaN(n)) return '₪0';
  return '₪' + Math.round(n).toLocaleString('he-IL');
}

function fmtDateDisplay(d: Date | null, fallback = '—'): string {
  if (!d) return fallback;
  return d.toLocaleDateString('he-IL', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function safePercentChange(curr: number, prev: number): { text: string; dir: 'up' | 'down' | 'same' | 'na' } {
  if (prev === 0 && curr === 0) return { text: '0%', dir: 'same' };
  if (prev === 0) return { text: 'חדש (—)', dir: 'up' };
  const pct = Math.round(((curr - prev) / prev) * 100);
  if (pct > 0) return { text: `+${pct}%`, dir: 'up' };
  if (pct < 0) return { text: `${pct}%`, dir: 'down' };
  return { text: '0%', dir: 'same' };
}

// Calculate Date Range based on Period Presets in Israel Time
function getPeriodDateBounds(
  period: PeriodFilter,
  customStart?: string,
  customEnd?: string
): { start: Date | null; end: Date | null; prevStart: Date | null; prevEnd: Date | null } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const date = now.getDate();
  const dayOfWeek = now.getDay(); // 0 is Sunday in Israel

  const startOfToday = new Date(year, month, date, 0, 0, 0, 0);
  const endOfToday = new Date(year, month, date, 23, 59, 59, 999);

  switch (period) {
    case 'today': {
      const prevStart = new Date(year, month, date - 1, 0, 0, 0, 0);
      const prevEnd = new Date(year, month, date - 1, 23, 59, 59, 999);
      return { start: startOfToday, end: endOfToday, prevStart, prevEnd };
    }
    case 'yesterday': {
      const start = new Date(year, month, date - 1, 0, 0, 0, 0);
      const end = new Date(year, month, date - 1, 23, 59, 59, 999);
      const prevStart = new Date(year, month, date - 2, 0, 0, 0, 0);
      const prevEnd = new Date(year, month, date - 2, 23, 59, 59, 999);
      return { start, end, prevStart, prevEnd };
    }
    case 'this_week': {
      // In Israel, week starts Sunday (day 0)
      const start = new Date(year, month, date - dayOfWeek, 0, 0, 0, 0);
      const prevStart = new Date(year, month, date - dayOfWeek - 7, 0, 0, 0, 0);
      const prevEnd = new Date(year, month, date - dayOfWeek - 1, 23, 59, 59, 999);
      return { start, end: endOfToday, prevStart, prevEnd };
    }
    case 'last_week': {
      const start = new Date(year, month, date - dayOfWeek - 7, 0, 0, 0, 0);
      const end = new Date(year, month, date - dayOfWeek - 1, 23, 59, 59, 999);
      const prevStart = new Date(year, month, date - dayOfWeek - 14, 0, 0, 0, 0);
      const prevEnd = new Date(year, month, date - dayOfWeek - 8, 23, 59, 59, 999);
      return { start, end, prevStart, prevEnd };
    }
    case 'last_7_days': {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const prevStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const prevEnd = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { start, end: now, prevStart, prevEnd };
    }
    case 'this_month': {
      const start = new Date(year, month, 1, 0, 0, 0, 0);
      const prevStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
      const prevEnd = new Date(year, month, 0, 23, 59, 59, 999); // last day of prev month
      return { start, end: endOfToday, prevStart, prevEnd };
    }
    case 'last_month': {
      const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
      const end = new Date(year, month, 0, 23, 59, 59, 999);
      const prevStart = new Date(year, month - 2, 1, 0, 0, 0, 0);
      const prevEnd = new Date(year, month - 1, 0, 23, 59, 59, 999);
      return { start, end, prevStart, prevEnd };
    }
    case 'last_30_days': {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const prevStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      const prevEnd = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { start, end: now, prevStart, prevEnd };
    }
    case 'last_3_months': {
      const start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const prevStart = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      const prevEnd = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      return { start, end: now, prevStart, prevEnd };
    }
    case 'last_6_months': {
      const start = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      const prevStart = new Date(now.getTime() - 360 * 24 * 60 * 60 * 1000);
      const prevEnd = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      return { start, end: now, prevStart, prevEnd };
    }
    case 'last_12_months': {
      const start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      const prevStart = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
      const prevEnd = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      return { start, end: now, prevStart, prevEnd };
    }
    case 'this_year': {
      const start = new Date(year, 0, 1, 0, 0, 0, 0);
      const prevStart = new Date(year - 1, 0, 1, 0, 0, 0, 0);
      const prevEnd = new Date(year - 1, 11, 31, 23, 59, 59, 999);
      return { start, end: endOfToday, prevStart, prevEnd };
    }
    case 'last_year': {
      const start = new Date(year - 1, 0, 1, 0, 0, 0, 0);
      const end = new Date(year - 1, 11, 31, 23, 59, 59, 999);
      const prevStart = new Date(year - 2, 0, 1, 0, 0, 0, 0);
      const prevEnd = new Date(year - 2, 11, 31, 23, 59, 59, 999);
      return { start, end, prevStart, prevEnd };
    }
    case 'custom': {
      const start = customStart ? new Date(customStart + 'T00:00:00') : null;
      const end = customEnd ? new Date(customEnd + 'T23:59:59') : null;
      let prevStart: Date | null = null;
      let prevEnd: Date | null = null;
      if (start && end) {
        const diff = end.getTime() - start.getTime();
        prevEnd = new Date(start.getTime() - 1000);
        prevStart = new Date(prevEnd.getTime() - diff);
      }
      return { start, end, prevStart, prevEnd };
    }
    case 'all':
    default:
      return { start: null, end: null, prevStart: null, prevEnd: null };
  }
}

// Map referral source cleanly according to specifications
function mapReferralSource(rawSource?: string | null, customType?: string | null, isDirect?: boolean): string {
  const s = String(rawSource || '').trim().toLowerCase();
  const ct = String(customType || '').trim().toLowerCase();

  if (s.includes('ביטוח') || s.includes('מבטחת') || s.includes('insurance')) return 'חברת ביטוח';
  if (s.includes('סוכן') || s.includes('agent')) return 'סוכן ביטוח';
  if (s.includes('ליסינג') || s.includes('leasing')) return 'חברת ליסינג';
  if (s.includes('השכרה') || s.includes('rental')) return 'חברת השכרת רכב';
  if (s.includes('צי') || s.includes('fleet') || ct === 'fleet') return 'צי רכב';
  if (s.includes('עסקי') || s.includes('business') || ct === 'business') return 'לקוח עסקי';
  if (s.includes('הפניה עסקית') || s.includes('גורם עסקי')) return 'הפניה של גורם עסקי';
  if (s.includes('הפניה של לקוח') || s.includes('הפניית לקוח') || s.includes('חבר מביא חבר')) return 'הפניה של לקוח אחר';
  if (s.includes('ישיר') || s.includes('פרטי') || s.includes('טופס לקוח') || s.includes('customer intake') || ct === 'private' || isDirect) {
    return 'לקוח פרטי ישיר';
  }
  if (s.includes('staff') || s.includes('צוות') || s.includes('מוסך')) return 'לקוח פרטי ישיר';
  if (s) return 'מקור אחר';
  return 'מקור לא ידוע';
}

export const ClaimsReportsView: React.FC<ClaimsReportsViewProps> = ({
  claims,
  garageCases,
  onBack,
  onOpenClaim,
  onOpenGarageCase,
}) => {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<
    'summary' | 'garage_works' | 'insurance_claims' | 'financial' | 'companies' | 'sources' | 'vehicle_drilldown' | 'comparison' | 'table' | 'graphs'
  >('summary');

  // Filter state
  const [period, setPeriod] = useState<PeriodFilter>('this_month');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [originType, setOriginType] = useState<OriginFilter>('all');
  const [referralSourceFilter, setReferralSourceFilter] = useState<string>('הכול');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [workTypeFilter, setWorkTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Drilldown modal state: every clickable number opens this!
  const [drilldown, setDrilldown] = useState<{
    title: string;
    items: ReportItem[];
    badgeColor?: string;
  } | null>(null);

  // Table sorting & pagination
  const [sortField, setSortField] = useState<keyof ReportItem>('createdAt');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Vehicle drilldown search
  const [vehicleSearchPlate, setVehicleSearchPlate] = useState<string>('');

  // Close drilldown on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrilldown(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 1. Convert raw records into normalized ReportItems (Safe & Strict, zero invented values)
  const allItems: ReportItem[] = useMemo(() => {
    const list: ReportItem[] = [];

    // --- A. Insurance Claims ---
    for (const c of claims) {
      if (c.deletedAt) continue;
      const created = parseDateIso(c.createdAt || c.updatedAt);
      const isClosed = isClosedStatus(c.status, c.archived);
      const closed = isClosed ? parseDateIso(c.lastActivityAt || c.updatedAt) : null;
      const payDate = parseDateIso(c.finPayDate || c.paymentDate);

      // Financials
      const finClaimed = Number(c.claimAmount || (c as unknown as { finAmount?: string }).finAmount || 0) || 0;
      const finAppr = Number(c.finApproved || (c as unknown as { approvedAmount?: string }).approvedAmount || 0) || 0;
      const finPaid = Number(c.finPaid || (c as unknown as { paidAmount?: string }).paidAmount || 0) || 0;
      // Balance is based on approved amount if approved > 0, else claimed amount, minus paid
      const finBal = finAppr > 0 ? Math.max(0, finAppr - finPaid) : (finClaimed > 0 ? Math.max(0, finClaimed - finPaid) : 0);

      const sourceVal = mapReferralSource(c.referralSource || c.source, null, c.source === 'Customer Accident Intake');
      const isLegal = String(c.status || '').includes('משפטי') || String(c.legalReason || '').length > 0;
      const workType = c.workType || c.claimKind || (c.damageDesc ? 'נזק תאונה' : 'תביעת ביטוח');

      list.push({
        id: c.id,
        displayNumber: displayClaimNum(c),
        originType: 'insurance',
        originLabel: 'תביעת ביטוח',
        referralSource: sourceVal,
        payer: c.payer || c.insCompany || 'חברת ביטוח',
        workType,
        workDesc: c.damageDesc || c.eventDesc || '—',
        workOrderNumber: c.workOrderNumber || '—',
        quoteNumber: c.quoteNum || '—',
        invoiceNumber: c.invoiceNumber || c.garage_invoice || '—',
        clientName: c.clientName || 'לקוח ללא שם',
        clientPhone: c.clientPhone || '',
        plate: c.plate || '—',
        vehicleLabel: c.carMake ? `${c.carMake} ${c.carModel || ''}`.trim() : (c.carModel || '—'),
        insCompany: c.insCompany || c.company_name || 'לא צוינה חברה',
        insAgent: c.agentName || c.insAgent || '—',
        appraiser: c.surveyor || '—',
        status: c.status || 'חדש',
        createdAt: created,
        createdAtStr: fmtDateDisplay(created),
        closedAt: closed,
        closedAtStr: fmtDateDisplay(closed),
        paymentDate: payDate,
        paymentDateStr: fmtDateDisplay(payDate),
        isClosed,
        isOpen: !isClosed,
        isLegal,
        claimAmount: finClaimed || finAppr,
        quoteAmount: Number(c.quoteAmount || 0) || 0,
        approvedAmount: finAppr,
        invoicedAmount: Number(c.invoiceAmount || c.garage_invoice_amount || 0) || 0,
        paidAmount: finPaid,
        balanceAmount: finBal,
        partsCost: 0,
        suppliersCost: 0,
        laborCost: 0,
        totalCost: 0,
        hasReliableCost: false, // Do not fake costs!
        rawClaim: c,
      });
    }

    // --- B. Garage Cases ---
    for (const g of garageCases) {
      const cd = g.case_data || {};
      const created = parseDateIso(g.created_at);
      const isClosed = g.status === 'סגור' || !!cd.caseClosed || !!cd.workFinished;
      const closed = isClosed ? parseDateIso(cd.caseClosedAt || cd.workFinishedAt || g.updated_at) : null;
      const payDate = parseDateIso(cd.paymentDate as string | null);

      // Extract parts and work quote values
      let quoteWorksTotal = 0;
      let quotePartsTotal = 0;
      let suppliersCost = 0;
      let hasPartsData = false;

      const qWorks = cd.quoteWorks || (cd.quote && cd.quote.works) || [];
      const qParts = cd.quoteParts || (cd.quote && cd.quote.parts) || [];

      if (Array.isArray(qWorks)) {
        qWorks.forEach((w) => { quoteWorksTotal += Number(w.price || 0) || 0; });
      }
      if (Array.isArray(qParts)) {
        qParts.forEach((p) => {
          quotePartsTotal += Number(p.price || 0) || 0;
          if (p.supplier || p.sku) suppliersCost += (Number(p.price || 0) || 0) * 0.7; // Example supplier tag if present
          hasPartsData = true;
        });
      }

      const quoteTotal = quoteWorksTotal + quotePartsTotal;
      const woAmt = Number(cd.workOrderAmount || 0) || 0;
      const finalAppr = Number(cd.finalApprovedAmount || 0) || (woAmt > 0 ? woAmt : quoteTotal);
      const paid = isClosed ? finalAppr : 0;
      const bal = isClosed ? 0 : finalAppr;

      const sourceVal = mapReferralSource(cd.referralSource || cd.source, cd.customer_type, !cd.claimNumber);
      const workType = cd.workType || (cd.route === 'intake_first' ? 'כניסה לעבודה' : 'הצעת מחיר') || 'עבודת מוסך';
      const payerVal = (typeof cd.payer === 'string' && cd.payer) || (typeof cd.payingEntity === 'string' && cd.payingEntity) || (cd.claimNumber ? 'חברת ביטוח (תביעה)' : 'לקוח ישיר');

      list.push({
        id: g.id,
        displayNumber: g.case_number || `GC-${g.id.slice(0, 8)}`,
        originType: 'garage',
        originLabel: 'תיק מוסך',
        referralSource: sourceVal,
        payer: payerVal,
        workType,
        workDesc: cd.workOrderNotes ? String(cd.workOrderNotes).slice(0, 80) : (cd.route === 'intake_first' ? 'טיפול מוסך' : 'הצעת מחיר'),
        workOrderNumber: cd.workOrderNumber || `WO-${g.id.slice(0, 6)}`,
        quoteNumber: cd.workOrderRef || '—',
        invoiceNumber: typeof cd.invoiceNumber === 'string' ? cd.invoiceNumber : '—',
        clientName: g.customer_name_snapshot || (typeof cd.customerName === 'string' ? cd.customerName : '') || 'לקוח מוסך',
        clientPhone: typeof cd.customerPhone === 'string' ? cd.customerPhone : '',
        plate: g.vehicle_plate_snapshot || (typeof cd.vehiclePlate === 'string' ? cd.vehiclePlate : '') || '—',
        vehicleLabel: g.vehicle_label_snapshot || '—',
        insCompany: cd.claimNumber ? `מקושר לתביעה ${cd.claimNumber}` : 'מוסך יוני (ישיר)',
        insAgent: '—',
        appraiser: '—',
        status: g.status || (isClosed ? 'סגור' : 'פתוח'),
        createdAt: created,
        createdAtStr: fmtDateDisplay(created),
        closedAt: closed,
        closedAtStr: fmtDateDisplay(closed),
        paymentDate: payDate,
        paymentDateStr: fmtDateDisplay(payDate),
        isClosed,
        isOpen: !isClosed,
        isLegal: false,
        claimAmount: quoteTotal || woAmt || finalAppr,
        quoteAmount: quoteTotal,
        approvedAmount: finalAppr,
        invoicedAmount: woAmt || finalAppr,
        paidAmount: paid,
        balanceAmount: bal,
        partsCost: quotePartsTotal,
        suppliersCost,
        laborCost: quoteWorksTotal,
        totalCost: quotePartsTotal + quoteWorksTotal,
        hasReliableCost: hasPartsData && quoteTotal > 0,
        rawGarage: g,
      });
    }

    return list;
  }, [claims, garageCases]);

  // Distinct Filter options
  const distinctCompanies = useMemo(() => {
    const s = new Set<string>();
    allItems.forEach((i) => {
      if (i.originType === 'insurance' && i.insCompany && i.insCompany !== 'לא צוינה חברה') {
        s.add(i.insCompany);
      }
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'he'));
  }, [allItems]);

  const distinctStatuses = useMemo(() => {
    const s = new Set<string>();
    allItems.forEach((i) => { if (i.status) s.add(i.status); });
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'he'));
  }, [allItems]);

  const distinctWorkTypes = useMemo(() => {
    const s = new Set<string>();
    allItems.forEach((i) => { if (i.workType && i.workType !== '—') s.add(i.workType); });
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'he'));
  }, [allItems]);

  // Date bounds for selected period
  const { start: periodStart, end: periodEnd, prevStart, prevEnd } = useMemo(() => {
    return getPeriodDateBounds(period, customStart, customEnd);
  }, [period, customStart, customEnd]);

  // Main Filter Logic: Applied across all tabs, metrics, charts, and tables
  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      // 1. Origin Filter
      if (originType !== 'all' && item.originType !== originType) return false;

      // 2. Referral Source Filter
      if (referralSourceFilter !== 'הכול' && item.referralSource !== referralSourceFilter) return false;

      // 3. Company Filter
      if (companyFilter !== 'all' && item.insCompany !== companyFilter) return false;

      // 4. Status Filter
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;

      // 5. Work Type Filter
      if (workTypeFilter !== 'all' && item.workType !== workTypeFilter) return false;

      // 6. Free Search Filter across all fields
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const hit =
          item.displayNumber.toLowerCase().includes(q) ||
          item.clientName.toLowerCase().includes(q) ||
          item.plate.toLowerCase().includes(q) ||
          item.insCompany.toLowerCase().includes(q) ||
          item.status.toLowerCase().includes(q) ||
          item.workOrderNumber.toLowerCase().includes(q) ||
          item.referralSource.toLowerCase().includes(q) ||
          item.workType.toLowerCase().includes(q) ||
          item.workDesc.toLowerCase().includes(q) ||
          item.payer.toLowerCase().includes(q) ||
          item.appraiser.toLowerCase().includes(q);
        if (!hit) return false;
      }

      // 7. Period Date Bounds Filter
      if (period === 'all') return true;
      if (!periodStart && !periodEnd) return true;
      if (!item.createdAt) return true; // keep undated items so nothing is lost

      if (periodStart && item.createdAt < periodStart) return false;
      if (periodEnd && item.createdAt > periodEnd) return false;

      return true;
    });
  }, [
    allItems,
    originType,
    referralSourceFilter,
    companyFilter,
    statusFilter,
    workTypeFilter,
    searchQuery,
    period,
    periodStart,
    periodEnd,
  ]);

  // Previous Period Items for Comparison Tab
  const prevPeriodItems = useMemo(() => {
    if (!prevStart || !prevEnd) return [];
    return allItems.filter((item) => {
      if (originType !== 'all' && item.originType !== originType) return false;
      if (referralSourceFilter !== 'הכול' && item.referralSource !== referralSourceFilter) return false;
      if (companyFilter !== 'all' && item.insCompany !== companyFilter) return false;
      if (!item.createdAt) return false;
      return item.createdAt >= prevStart && item.createdAt <= prevEnd;
    });
  }, [allItems, prevStart, prevEnd, originType, referralSourceFilter, companyFilter]);

  // Drilldown opener helper
  const openDrilldown = useCallback((title: string, items: ReportItem[], badgeColor = '#3b82f6') => {
    setDrilldown({ title, items, badgeColor });
  }, []);

  // 2. High-Precision KPIs (Calculated on current filter)
  const kpis = useMemo(() => {
    let insuranceCount = 0;
    let garageCount = 0;
    let openCount = 0;
    let closedCount = 0;
    let legalCount = 0;
    let waitingApprovalCount = 0;

    let totalClaimedOrWork = 0;
    let totalApproved = 0;
    let totalPaid = 0;
    let totalBalance = 0;
    let totalInvoiced = 0;
    let totalCostRecorded = 0;
    let reliableCostCount = 0;

    const uniqueClients = new Set<string>();
    const uniqueVehicles = new Set<string>();

    for (const item of filteredItems) {
      if (item.originType === 'insurance') insuranceCount++;
      else garageCount++;

      if (item.isOpen) openCount++;
      if (item.isClosed) closedCount++;
      if (item.isLegal) legalCount++;
      if (item.approvedAmount === 0 && item.claimAmount > 0) waitingApprovalCount++;

      totalClaimedOrWork += item.claimAmount;
      totalApproved += item.approvedAmount;
      totalPaid += item.paidAmount;
      totalBalance += item.balanceAmount;
      totalInvoiced += item.invoicedAmount;

      if (item.hasReliableCost) {
        totalCostRecorded += item.totalCost;
        reliableCostCount++;
      }

      if (item.clientName && item.clientName !== 'לקוח ללא שם') {
        uniqueClients.add(item.clientName.trim());
      }
      if (item.plate && item.plate !== '—') {
        uniqueVehicles.add(item.plate.trim());
      }
    }

    const avgWorkOrder = garageCount > 0 ? Math.round(totalClaimedOrWork / garageCount) : 0;
    const avgClaim = insuranceCount > 0 ? Math.round(totalClaimedOrWork / insuranceCount) : 0;

    return {
      total: filteredItems.length,
      insuranceCount,
      garageCount,
      openCount,
      closedCount,
      legalCount,
      waitingApprovalCount,
      uniqueClientsCount: uniqueClients.size,
      uniqueVehiclesCount: uniqueVehicles.size,
      totalClaimedOrWork,
      totalApproved,
      totalPaid,
      totalBalance,
      totalInvoiced,
      totalCostRecorded,
      reliableCostCount,
      avgWorkOrder,
      avgClaim,
    };
  }, [filteredItems]);

  // 3. Comparison Metrics (Current Period vs Previous Period)
  const comparison = useMemo(() => {
    const calc = (list: ReportItem[]) => {
      let totalClaimed = 0;
      let totalPaid = 0;
      let totalBalance = 0;
      let insCount = 0;
      let garCount = 0;
      let closed = 0;
      for (const i of list) {
        totalClaimed += i.claimAmount;
        totalPaid += i.paidAmount;
        totalBalance += i.balanceAmount;
        if (i.originType === 'insurance') insCount++;
        else garCount++;
        if (i.isClosed) closed++;
      }
      return {
        total: list.length,
        insCount,
        garCount,
        closed,
        totalClaimed,
        totalPaid,
        totalBalance,
      };
    };

    const curr = calc(filteredItems);
    const prev = calc(prevPeriodItems);

    return {
      curr,
      prev,
      diffTotal: curr.total - prev.total,
      pctTotal: safePercentChange(curr.total, prev.total),
      diffGar: curr.garCount - prev.garCount,
      pctGar: safePercentChange(curr.garCount, prev.garCount),
      diffIns: curr.insCount - prev.insCount,
      pctIns: safePercentChange(curr.insCount, prev.insCount),
      diffClosed: curr.closed - prev.closed,
      pctClosed: safePercentChange(curr.closed, prev.closed),
      diffClaimed: curr.totalClaimed - prev.totalClaimed,
      pctClaimed: safePercentChange(curr.totalClaimed, prev.totalClaimed),
      diffPaid: curr.totalPaid - prev.totalPaid,
      pctPaid: safePercentChange(curr.totalPaid, prev.totalPaid),
      diffBalance: curr.totalBalance - prev.totalBalance,
      pctBalance: safePercentChange(curr.totalBalance, prev.totalBalance),
    };
  }, [filteredItems, prevPeriodItems]);

  // 4. Status Stats for Breakdown
  const statusStats = useMemo(() => {
    const map = new Map<string, { count: number; amount: number; paid: number; balance: number; items: ReportItem[] }>();
    for (const item of filteredItems) {
      const st = item.status || 'אחר';
      let entry = map.get(st);
      if (!entry) {
        entry = { count: 0, amount: 0, paid: 0, balance: 0, items: [] };
        map.set(st, entry);
      }
      entry.count++;
      entry.amount += item.claimAmount;
      entry.paid += item.paidAmount;
      entry.balance += item.balanceAmount;
      entry.items.push(item);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count);
  }, [filteredItems]);

  // 5. Insurance Company Comparison Stats
  const companyStats = useMemo(() => {
    const map = new Map<
      string,
      {
        total: number;
        open: number;
        closed: number;
        waiting: number;
        legal: number;
        claimedAmt: number;
        approvedAmt: number;
        paidAmt: number;
        balanceAmt: number;
        items: ReportItem[];
      }
    >();

    for (const item of filteredItems) {
      if (item.originType !== 'insurance') continue;
      const co = item.insCompany || 'ללא חברה';
      let entry = map.get(co);
      if (!entry) {
        entry = {
          total: 0,
          open: 0,
          closed: 0,
          waiting: 0,
          legal: 0,
          claimedAmt: 0,
          approvedAmt: 0,
          paidAmt: 0,
          balanceAmt: 0,
          items: [],
        };
        map.set(co, entry);
      }
      entry.total++;
      if (item.isOpen) entry.open++;
      if (item.isClosed) entry.closed++;
      if (item.status.includes('ממתין')) entry.waiting++;
      if (item.isLegal) entry.legal++;
      entry.claimedAmt += item.claimAmount;
      entry.approvedAmt += item.approvedAmount;
      entry.paidAmt += item.paidAmount;
      entry.balanceAmt += item.balanceAmount;
      entry.items.push(item);
    }

    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [filteredItems]);

  // 6. Referral Sources Stats
  const sourceStats = useMemo(() => {
    const map = new Map<string, { count: number; totalAmt: number; paidAmt: number; balanceAmt: number; items: ReportItem[] }>();
    for (const item of filteredItems) {
      const src = item.referralSource || 'מקור לא ידוע';
      let entry = map.get(src);
      if (!entry) {
        entry = { count: 0, totalAmt: 0, paidAmt: 0, balanceAmt: 0, items: [] };
        map.set(src, entry);
      }
      entry.count++;
      entry.totalAmt += item.claimAmount;
      entry.paidAmt += item.paidAmount;
      entry.balanceAmt += item.balanceAmount;
      entry.items.push(item);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count);
  }, [filteredItems]);

  // 7. Work Types Stats (for Garage & Claims)
  const workTypeStats = useMemo(() => {
    const map = new Map<string, { count: number; amount: number; paid: number; items: ReportItem[] }>();
    for (const item of filteredItems) {
      const wt = item.workType || 'כללי';
      let entry = map.get(wt);
      if (!entry) {
        entry = { count: 0, amount: 0, paid: 0, items: [] };
        map.set(wt, entry);
      }
      entry.count++;
      entry.amount += item.claimAmount;
      entry.paid += item.paidAmount;
      entry.items.push(item);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count);
  }, [filteredItems]);

  // 8. Top Clients by Volume
  const topClients = useMemo(() => {
    const map = new Map<string, { name: string; count: number; vehicles: Set<string>; totalAmt: number; paidAmt: number; balanceAmt: number; items: ReportItem[] }>();
    for (const item of filteredItems) {
      const name = item.clientName || 'ללא שם';
      let entry = map.get(name);
      if (!entry) {
        entry = { name, count: 0, vehicles: new Set<string>(), totalAmt: 0, paidAmt: 0, balanceAmt: 0, items: [] };
        map.set(name, entry);
      }
      entry.count++;
      if (item.plate && item.plate !== '—') entry.vehicles.add(item.plate);
      entry.totalAmt += item.claimAmount;
      entry.paidAmt += item.paidAmount;
      entry.balanceAmt += item.balanceAmount;
      entry.items.push(item);
    }
    return Array.from(map.values()).sort((a, b) => b.totalAmt - a.totalAmt);
  }, [filteredItems]);

  // 9. Vehicle Drilldown Details
  const vehicleDrilldownData = useMemo(() => {
    if (!vehicleSearchPlate.trim()) return null;
    const cleanPlate = vehicleSearchPlate.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const matched = allItems.filter((i) => i.plate.toLowerCase().replace(/[^a-z0-9]/g, '').includes(cleanPlate));
    if (matched.length === 0) return { plate: vehicleSearchPlate, items: [], totalClaimed: 0, totalPaid: 0, totalBal: 0 };

    let totalClaimed = 0;
    let totalPaid = 0;
    let totalBal = 0;
    for (const m of matched) {
      totalClaimed += m.claimAmount;
      totalPaid += m.paidAmount;
      totalBal += m.balanceAmount;
    }

    return {
      plate: matched[0]?.plate || vehicleSearchPlate,
      items: matched,
      totalClaimed,
      totalPaid,
      totalBal,
    };
  }, [allItems, vehicleSearchPlate]);

  // 10. Central Detailed Table Sorting & Pagination
  const sortedItems = useMemo(() => {
    const list = [...filteredItems];
    list.sort((a, b) => {
      let va = a[sortField];
      let vb = b[sortField];
      if (va instanceof Date) va = va.getTime();
      if (vb instanceof Date) vb = vb.getTime();
      if (typeof va === 'string' && typeof vb === 'string') {
        const cmp = va.localeCompare(vb, 'he');
        return sortAsc ? cmp : -cmp;
      }
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortAsc ? va - vb : vb - va;
      }
      return 0;
    });
    return list;
  }, [filteredItems, sortField, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSize));
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedItems.slice(start, start + pageSize);
  }, [sortedItems, currentPage, pageSize]);

  const handleSort = (field: keyof ReportItem) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  // Export to CSV / Excel with Hebrew BOM
  const handleExportCsv = (customItems?: ReportItem[], filenamePrefix = 'דוח_תביעות_ומוסך') => {
    const targetItems = customItems || filteredItems;
    const headers = [
      'מספר תיק',
      'סוג תיק',
      'מקור הגעה',
      'גורם משלם',
      'סוג עבודה',
      'תאריך פתיחה',
      'שם לקוח',
      'טלפון',
      'מספר רכב',
      'דגם רכב',
      'חברת ביטוח',
      'סטטוס',
      'סכום נדרש / שווי (₪)',
      'הצעת מחיר (₪)',
      'סכום מאושר (₪)',
      'חשבונית (₪)',
      'שולם בפועל (₪)',
      'יתרת חוב (₪)',
      'תאריך סגירה',
    ];

    const rows = targetItems.map((item) => [
      `"${item.displayNumber}"`,
      `"${item.originLabel}"`,
      `"${item.referralSource}"`,
      `"${item.payer.replace(/"/g, '""')}"`,
      `"${item.workType.replace(/"/g, '""')}"`,
      `"${item.createdAtStr}"`,
      `"${item.clientName.replace(/"/g, '""')}"`,
      `"${item.clientPhone}"`,
      `"${item.plate}"`,
      `"${item.vehicleLabel.replace(/"/g, '""')}"`,
      `"${item.insCompany.replace(/"/g, '""')}"`,
      `"${item.status}"`,
      item.claimAmount,
      item.quoteAmount,
      item.approvedAmount,
      item.invoicedAmount,
      item.paidAmount,
      item.balanceAmount,
      `"${item.closedAtStr}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Clear all filters
  const handleClearFilters = () => {
    setPeriod('this_month');
    setCustomStart('');
    setCustomEnd('');
    setOriginType('all');
    setReferralSourceFilter('הכול');
    setCompanyFilter('all');
    setStatusFilter('all');
    setWorkTypeFilter('all');
    setSearchQuery('');
    setCurrentPage(1);
  };

  return (
    <div className="cr-root" data-testid="claims-reports-view">
      {/* 1. TOP HEADER BAR */}
      <div className="cr-header no-print">
        <div className="cr-header-left">
          <button type="button" className="cr-btn cr-btn-back" onClick={onBack} data-testid="reports-back-btn">
            ← חזרה לרשימת התיקים
          </button>
          <div className="cr-title-wrap">
            <h1 className="cr-title">📊 מרכז דוחות ניהולי – תביעות ביטוח ומוסך יוני</h1>
            <p className="cr-subtitle">
              שליטה ובקרה מלאה: סינון לפי תקופה, מקור הגעה, לקוח, חברת ביטוח ומצב טיפול ({filteredItems.length} תיקים נכללים)
            </p>
          </div>
        </div>

        <div className="cr-header-actions">
          <button
            type="button"
            className="cr-btn cr-btn-export"
            onClick={() => handleExportCsv(filteredItems)}
            data-testid="reports-export-csv"
          >
            📥 ייצוא ל-Excel / CSV
          </button>
          <button type="button" className="cr-btn cr-btn-print" onClick={() => window.print()} data-testid="reports-print-btn">
            🖨️ הדפסה / PDF
          </button>
        </div>
      </div>

      {/* 2. ADVANCED UNIFIED FILTER CONTROL PANEL */}
      <div className="cr-filter-panel no-print">
        {/* Row 1: Period + Custom Range + Case Origin */}
        <div className="cr-filter-row">
          <div className="cr-filter-group">
            <label className="cr-filter-label">📅 תקופה:</label>
            <select
              className="cr-select"
              value={period}
              onChange={(e) => setPeriod(e.target.value as PeriodFilter)}
              data-testid="reports-period-select"
            >
              {PERIOD_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </div>

          {period === 'custom' && (
            <div className="cr-custom-dates" data-testid="reports-custom-range">
              <label className="cr-filter-label">מ-</label>
              <input
                type="date"
                className="cr-date-in"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                data-testid="reports-custom-start"
              />
              <label className="cr-filter-label">עד</label>
              <input
                type="date"
                className="cr-date-in"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                data-testid="reports-custom-end"
              />
            </div>
          )}

          <div className="cr-filter-group">
            <label className="cr-filter-label">🏷️ סוג תיק:</label>
            <div className="cr-pill-group">
              <button
                type="button"
                className={`cr-pill ${originType === 'all' ? 'active' : ''}`}
                onClick={() => setOriginType('all')}
                data-testid="reports-filter-all"
              >
                הכול ({allItems.length})
              </button>
              <button
                type="button"
                className={`cr-pill ${originType === 'insurance' ? 'active' : ''}`}
                onClick={() => setOriginType('insurance')}
                data-testid="reports-filter-insurance"
              >
                🛡️ ביטוח ({claims.length})
              </button>
              <button
                type="button"
                className={`cr-pill ${originType === 'garage' ? 'active' : ''}`}
                onClick={() => setOriginType('garage')}
                data-testid="reports-filter-garage"
              >
                🔧 מוסך ({garageCases.length})
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: Referral Source, Insurer, Status, Work Type */}
        <div className="cr-filter-row" style={{ marginTop: 10 }}>
          <div className="cr-filter-group">
            <label className="cr-filter-label">🎯 מקור הגעה:</label>
            <select
              className="cr-select"
              value={referralSourceFilter}
              onChange={(e) => setReferralSourceFilter(e.target.value)}
              data-testid="reports-source-select"
            >
              {REFERRAL_SOURCES.map((src) => (
                <option key={src} value={src}>{src}</option>
              ))}
            </select>
          </div>

          <div className="cr-filter-group">
            <label className="cr-filter-label">🏢 חברת ביטוח:</label>
            <select
              className="cr-select"
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              data-testid="reports-company-filter"
            >
              <option value="all">כל חברות הביטוח ({distinctCompanies.length})</option>
              {distinctCompanies.map((co) => (
                <option key={co} value={co}>{co}</option>
              ))}
            </select>
          </div>

          <div className="cr-filter-group">
            <label className="cr-filter-label">📋 סטטוס:</label>
            <select
              className="cr-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              data-testid="reports-status-filter"
            >
              <option value="all">כל הסטטוסים ({distinctStatuses.length})</option>
              {distinctStatuses.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          <div className="cr-filter-group">
            <label className="cr-filter-label">⚙️ סוג עבודה:</label>
            <select
              className="cr-select"
              value={workTypeFilter}
              onChange={(e) => setWorkTypeFilter(e.target.value)}
              data-testid="reports-worktype-filter"
            >
              <option value="all">כל סוגי העבודה ({distinctWorkTypes.length})</option>
              {distinctWorkTypes.map((wt) => (
                <option key={wt} value={wt}>{wt}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 3: Central Free Search + Reset */}
        <div className="cr-filter-row" style={{ marginTop: 10 }}>
          <div className="cr-filter-group" style={{ flex: 1 }}>
            <input
              type="text"
              className="cr-search-in"
              placeholder="🔎 חיפוש חופשי: מספר רכב, שם לקוח, מספר תביעה, מספר הזמנה, חברה, סוכן, שמאי, תיאור..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="reports-search-input"
            />
          </div>

          <button
            type="button"
            className="cr-btn cr-btn-clear"
            onClick={handleClearFilters}
            data-testid="reports-clear-filter"
          >
            נקה סינון
          </button>
        </div>
      </div>

      {/* 3. NAVIGATION VIEW TABS */}
      <div className="cr-view-tabs no-print">
        {[
          ['summary', '📊 לוח סיכום ראשי'],
          ['garage_works', `🔧 עבודות מוסך (${kpis.garageCount})`],
          ['insurance_claims', `🛡️ תביעות ביטוח (${kpis.insuranceCount})`],
          ['financial', '💰 דוח כספי מלא'],
          ['companies', `🏢 חברות ביטוח (${companyStats.length})`],
          ['sources', `🎯 מקורות הגעה ולקוחות (${sourceStats.length})`],
          ['vehicle_drilldown', '🚗 ניתוח לפי מספר רכב'],
          ['comparison', '⚖️ השוואת תקופות'],
          ['table', `📄 טבלת פירוט מרכזית (${filteredItems.length})`],
          ['graphs', '📈 תרשימים וגרפים'],
        ].map(([k, l]) => (
          <button
            key={k}
            type="button"
            className={`cr-vtab ${activeTab === k ? 'active' : ''}`}
            onClick={() => setActiveTab(k as typeof activeTab)}
            data-testid={`reports-tab-${k}`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* 4. TAB: SUMMARY DASHBOARD (לוח סיכום ראשי) */}
      {activeTab === 'summary' && (
        <section className="cr-section">
          <div className="cr-section-title">
            <span>📌 לוח סיכום ראשי – כל הנתונים לחיצים לפירוט מלא</span>
            <span className="cr-badge-info">לחץ על כל כרטיס כדי לראות את רשימת התיקים המדויקת</span>
          </div>

          <div className="cr-kpi-grid">
            <div
              className="cr-kpi-card highlight cursor-pointer"
              onClick={() => openDrilldown('סך כל התיקים בסינון הנוכחי', filteredItems, '#3b82f6')}
              data-testid="kpi-total-cases"
            >
              <div className="cr-kpi-val">{kpis.total}</div>
              <div className="cr-kpi-lbl">סך תיקים בסינון הנבחר</div>
              <div className="cr-kpi-sub">תביעות ביטוח + כרטיסי מוסך (לחץ לפירוט)</div>
            </div>

            <div
              className="cr-kpi-card cursor-pointer"
              onClick={() => openDrilldown('עבודות מוסך שנכנסו', filteredItems.filter((i) => i.originType === 'garage'), '#f59e0b')}
              data-testid="kpi-garage-cases"
            >
              <div className="cr-kpi-val" style={{ color: '#fbbf24' }}>{kpis.garageCount}</div>
              <div className="cr-kpi-lbl">עבודות והזמנות מוסך</div>
              <div className="cr-kpi-sub">ממוצע להזמנה: {fmtMoney(kpis.avgWorkOrder)}</div>
            </div>

            <div
              className="cr-kpi-card cursor-pointer"
              onClick={() => openDrilldown('תביעות ביטוח שנפתחו', filteredItems.filter((i) => i.originType === 'insurance'), '#60a5fa')}
              data-testid="kpi-insurance-cases"
            >
              <div className="cr-kpi-val" style={{ color: '#60a5fa' }}>{kpis.insuranceCount}</div>
              <div className="cr-kpi-lbl">תביעות ביטוח</div>
              <div className="cr-kpi-sub">ממוצע לתביעה: {fmtMoney(kpis.avgClaim)}</div>
            </div>

            <div
              className="cr-kpi-card warn cursor-pointer"
              onClick={() => openDrilldown('תיקים פתוחים בטיפול', filteredItems.filter((i) => i.isOpen), '#f59e0b')}
              data-testid="kpi-open-cases"
            >
              <div className="cr-kpi-val">{kpis.openCount}</div>
              <div className="cr-kpi-lbl">תיקים פתוחים כעת</div>
              <div className="cr-kpi-sub">דורשים טיפול / בעבודה שוטפת</div>
            </div>

            <div
              className="cr-kpi-card success cursor-pointer"
              onClick={() => openDrilldown('תיקים ועבודות שהסתיימו / נסגרו', filteredItems.filter((i) => i.isClosed), '#22c55e')}
              data-testid="kpi-closed-cases"
            >
              <div className="cr-kpi-val">{kpis.closedCount}</div>
              <div className="cr-kpi-lbl">עבודות שהושלמו / נסגרו</div>
              <div className="cr-kpi-sub">הסתיימו במלואן</div>
            </div>

            <div
              className="cr-kpi-card cursor-pointer"
              onClick={() => openDrilldown('לקוחות ייחודיים שטופלו בתקופה', filteredItems, '#a855f7')}
              data-testid="kpi-unique-clients"
            >
              <div className="cr-kpi-val" style={{ color: '#c084fc' }}>{kpis.uniqueClientsCount}</div>
              <div className="cr-kpi-lbl">לקוחות ייחודיים בתקופה</div>
              <div className="cr-kpi-sub">ללא כפילויות של אותו לקוח</div>
            </div>

            <div
              className="cr-kpi-card cursor-pointer"
              onClick={() => openDrilldown('רכבים שונים שטופלו בתקופה', filteredItems, '#06b6d4')}
              data-testid="kpi-unique-vehicles"
            >
              <div className="cr-kpi-val" style={{ color: '#22d3ee' }}>{kpis.uniqueVehiclesCount}</div>
              <div className="cr-kpi-lbl">רכבים שונים שטופלו</div>
              <div className="cr-kpi-sub">ספירת לוחיות רישוי נפרדות</div>
            </div>

            <div
              className="cr-kpi-card danger cursor-pointer"
              onClick={() => openDrilldown('תיקים בטיפול משפטי', filteredItems.filter((i) => i.isLegal), '#ef4444')}
              data-testid="kpi-legal-cases"
            >
              <div className="cr-kpi-val">{kpis.legalCount}</div>
              <div className="cr-kpi-lbl">בטיפול משפטי / עו"ד</div>
              <div className="cr-kpi-sub">מחלוקת משפטית או דחייה</div>
            </div>
          </div>

          {/* Quick Financial Summary Row */}
          <div className="cr-section-title" style={{ marginTop: 24 }}>
            <span>💰 תמצית כספית לתקופה (לחיץ לפירוט מלא)</span>
          </div>

          <div className="cr-financial-grid">
            <div
              className="cr-fin-card highlight cursor-pointer"
              onClick={() => openDrilldown('כלל התיקים והסכומים הנדרשים', filteredItems)}
            >
              <div className="cr-fin-label">סך שווי פעילות נדרש</div>
              <div className="cr-fin-val" style={{ color: 'var(--ac3)' }}>{fmtMoney(kpis.totalClaimedOrWork)}</div>
              <div className="cr-fin-sub">ביטוח + מוסך יחד בתקופה</div>
            </div>

            <div
              className="cr-fin-card success cursor-pointer"
              onClick={() => openDrilldown('תיקים עם סכומים שאושרו לתשלום', filteredItems.filter((i) => i.approvedAmount > 0))}
            >
              <div className="cr-fin-label">סכום שאושר לתשלום</div>
              <div className="cr-fin-val" style={{ color: 'var(--gn2)' }}>{fmtMoney(kpis.totalApproved)}</div>
              <div className="cr-fin-sub">אושר ע"י מבטחת / מוסך</div>
            </div>

            <div
              className="cr-fin-card success cursor-pointer"
              onClick={() => openDrilldown('תיקים עם תקבולים שנפרעו בפועל', filteredItems.filter((i) => i.paidAmount > 0))}
            >
              <div className="cr-fin-label">תקבולים שהתקבלו בפועל</div>
              <div className="cr-fin-val" style={{ color: 'var(--gn2)' }}>{fmtMoney(kpis.totalPaid)}</div>
              <div className="cr-fin-sub">נפרעו לחשבון (ללא כפילויות)</div>
            </div>

            <div
              className="cr-fin-card danger cursor-pointer"
              onClick={() => openDrilldown('תיקים עם יתרת חוב פתוחה לגבייה', filteredItems.filter((i) => i.balanceAmount > 0))}
            >
              <div className="cr-fin-label">יתרת חוב פתוחה לגבייה</div>
              <div className="cr-fin-val" style={{ color: 'var(--rd2)' }}>{fmtMoney(kpis.totalBalance)}</div>
              <div className="cr-fin-sub">ממתין לגבייה / סילוק</div>
            </div>
          </div>
        </section>
      )}

      {/* 5. TAB: GARAGE WORKS & WORK ORDERS (דוח עבודות מוסך והזמנות) */}
      {activeTab === 'garage_works' && (
        <section className="cr-section">
          <div className="cr-section-title">
            <span>🔧 דוח עבודות שנכנסו למוסך והזמנות עבודה</span>
            <span className="cr-badge-info">{kpis.garageCount} כרטיסי מוסך בסינון</span>
          </div>

          {/* Work types breakdown */}
          <div className="cr-cards-subgrid" style={{ marginBottom: 20 }}>
            {workTypeStats.map(([wt, data]) => (
              <div
                key={wt}
                className="cr-kpi-card cursor-pointer"
                onClick={() => openDrilldown(`עבודות מסוג: ${wt}`, data.items, '#fbbf24')}
              >
                <div className="cr-kpi-val" style={{ fontSize: 18, color: '#fbbf24' }}>{data.count} עבודות</div>
                <div className="cr-kpi-lbl">{wt}</div>
                <div className="cr-kpi-sub">סך שווי: {fmtMoney(data.amount)}</div>
              </div>
            ))}
          </div>

          {/* Garage works table */}
          <div className="cr-table-wrap">
            <table className="cr-table" data-testid="garage-works-table">
              <thead>
                <tr>
                  <th>מספר הזמנה / תיק</th>
                  <th>תאריך כניסה</th>
                  <th>לקוח</th>
                  <th>מספר רכב</th>
                  <th>מקור הגעה</th>
                  <th>סוג עבודה</th>
                  <th>תיאור עבודה</th>
                  <th>סטטוס</th>
                  <th>הצעת מחיר</th>
                  <th>מאושר</th>
                  <th>שולם בפועל</th>
                  <th>יתרה לתשלום</th>
                  <th>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.filter((i) => i.originType === 'garage').length === 0 ? (
                  <tr>
                    <td colSpan={13} style={{ textAlign: 'center', padding: 28, color: 'var(--t3)' }}>
                      לא נמצאו עבודות מוסך התואמות את הסינון הנוכחי.
                    </td>
                  </tr>
                ) : (
                  filteredItems.filter((i) => i.originType === 'garage').map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => onOpenGarageCase(item.id)}
                      style={{ cursor: 'pointer' }}
                      data-testid={`garage-row-${item.id}`}
                    >
                      <td style={{ fontWeight: 800, color: '#fbbf24' }}>{item.displayNumber}</td>
                      <td>{item.createdAtStr}</td>
                      <td style={{ fontWeight: 600 }}>{item.clientName}</td>
                      <td><strong>{item.plate}</strong></td>
                      <td><span className="cr-pill-sm">{item.referralSource}</span></td>
                      <td>{item.workType}</td>
                      <td style={{ fontSize: 11, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.workDesc}
                      </td>
                      <td>{stBadge(item.status)}</td>
                      <td>{fmtMoney(item.quoteAmount)}</td>
                      <td style={{ color: 'var(--gn2)', fontWeight: 600 }}>{fmtMoney(item.approvedAmount)}</td>
                      <td style={{ color: 'var(--gn2)', fontWeight: 700 }}>{fmtMoney(item.paidAmount)}</td>
                      <td style={{ color: item.balanceAmount > 0 ? 'var(--rd2)' : 'inherit', fontWeight: 700 }}>
                        {fmtMoney(item.balanceAmount)}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="cr-btn cr-btn-open"
                          onClick={() => onOpenGarageCase(item.id)}
                          data-testid={`open-garage-case-${item.id}`}
                        >
                          פתח כרטיס ›
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 6. TAB: INSURANCE CLAIMS (דוח תביעות ביטוח) */}
      {activeTab === 'insurance_claims' && (
        <section className="cr-section">
          <div className="cr-section-title">
            <span>🛡️ דוח תביעות ביטוח מפורט לפי 15 סטטוסים אמיתיים</span>
            <span className="cr-badge-info">{kpis.insuranceCount} תביעות ביטוח בסינון</span>
          </div>

          <div className="cr-status-grid">
            {statusStats.map(([st, data]) => {
              const insItems = data.items.filter((i) => i.originType === 'insurance');
              if (insItems.length === 0) return null;
              const pct = kpis.insuranceCount > 0 ? Math.round((insItems.length / kpis.insuranceCount) * 100) : 0;
              return (
                <div
                  key={st}
                  className={`cr-status-card cursor-pointer ${statusFilter === st ? 'selected' : ''}`}
                  onClick={() => openDrilldown(`תביעות ביטוח בסטטוס: ${st}`, insItems)}
                  data-testid={`status-card-${st}`}
                >
                  <div className="cr-status-head">
                    <span className="cr-status-badge">{stBadge(st)}</span>
                    <span className="cr-status-count" style={{ fontSize: 16 }}>{insItems.length} תביעות</span>
                  </div>
                  <div className="cr-status-pct-bar">
                    <div className="cr-status-pct-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="cr-status-foot">
                    <span>{pct}% מסך התביעות</span>
                    <span style={{ fontWeight: 700 }}>{fmtMoney(data.amount)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 7. TAB: FINANCIAL REPORT (דוח כספי מלא ומבוקר) */}
      {activeTab === 'financial' && (
        <section className="cr-section">
          <div className="cr-section-title">
            <span>💰 דוח כספי מבוקר – הפרדה מוחלטת בין דרישה, הצעה ותקבול</span>
            <span className="cr-badge-info">ללא ספירת תשלומים חלקיים פעמיים</span>
          </div>

          <div className="cr-financial-grid">
            <div className="cr-fin-card cursor-pointer" onClick={() => openDrilldown('תביעות ביטוח נדרשות', filteredItems.filter((i) => i.originType === 'insurance'))}>
              <div className="cr-fin-label">סך תביעות ביטוח נדרשות</div>
              <div className="cr-fin-val">{fmtMoney(filteredItems.filter((i) => i.originType === 'insurance').reduce((acc, x) => acc + x.claimAmount, 0))}</div>
              <div className="cr-fin-sub">{kpis.insuranceCount} תביעות ביטוח</div>
            </div>

            <div className="cr-fin-card cursor-pointer" onClick={() => openDrilldown('עבודות מוסך (הזמנות/הצעות)', filteredItems.filter((i) => i.originType === 'garage'))}>
              <div className="cr-fin-label">סך שווי עבודות מוסך</div>
              <div className="cr-fin-val">{fmtMoney(filteredItems.filter((i) => i.originType === 'garage').reduce((acc, x) => acc + x.claimAmount, 0))}</div>
              <div className="cr-fin-sub">{kpis.garageCount} כרטיסי מוסך</div>
            </div>

            <div className="cr-fin-card highlight cursor-pointer" onClick={() => openDrilldown('סך כולל מצרפי של כל הפעילות', filteredItems)}>
              <div className="cr-fin-label">סך כולל מצרפי של כל הפעילות</div>
              <div className="cr-fin-val" style={{ color: 'var(--ac3)' }}>{fmtMoney(kpis.totalClaimedOrWork)}</div>
              <div className="cr-fin-sub">ביטוח + מוסך יחד</div>
            </div>

            <div className="cr-fin-card success cursor-pointer" onClick={() => openDrilldown('סכומים מאושרים', filteredItems.filter((i) => i.approvedAmount > 0))}>
              <div className="cr-fin-label">סכום שאושר לתשלום</div>
              <div className="cr-fin-val" style={{ color: 'var(--gn2)' }}>{fmtMoney(kpis.totalApproved)}</div>
              <div className="cr-fin-sub">אושר סופית</div>
            </div>

            <div className="cr-fin-card success cursor-pointer" onClick={() => openDrilldown('תקבולים שהתקבלו בפועל', filteredItems.filter((i) => i.paidAmount > 0))}>
              <div className="cr-fin-label">סכום שהתקבל בפועל (תקבולים)</div>
              <div className="cr-fin-val" style={{ color: 'var(--gn2)' }}>{fmtMoney(kpis.totalPaid)}</div>
              <div className="cr-fin-sub">שולם לחשבון</div>
            </div>

            <div className="cr-fin-card danger cursor-pointer" onClick={() => openDrilldown('יתרת חובות פתוחים', filteredItems.filter((i) => i.balanceAmount > 0))}>
              <div className="cr-fin-label">יתרת חוב פתוחה לגבייה</div>
              <div className="cr-fin-val" style={{ color: 'var(--rd2)' }}>{fmtMoney(kpis.totalBalance)}</div>
              <div className="cr-fin-sub">טרם נפרע במלואו</div>
            </div>

            <div className="cr-fin-card cursor-pointer" onClick={() => openDrilldown('עלויות חלפים וספקים מתועדות', filteredItems.filter((i) => i.hasReliableCost))}>
              <div className="cr-fin-label">עלויות חלקים וספקים מתועדות</div>
              <div className="cr-fin-val">{kpis.reliableCostCount > 0 ? fmtMoney(kpis.totalCostRecorded) : 'נתון חסר'}</div>
              <div className="cr-fin-sub">לפי {kpis.reliableCostCount} תיקים עם פירוט</div>
            </div>

            <div className="cr-fin-card cursor-pointer">
              <div className="cr-fin-label">רווח גולמי מחושב</div>
              <div className="cr-fin-val" style={{ color: kpis.reliableCostCount > 0 ? 'var(--gn2)' : 'var(--t3)' }}>
                {kpis.reliableCostCount > 0
                  ? fmtMoney(Math.max(0, kpis.totalApproved - kpis.totalCostRecorded))
                  : 'נתוני עלות חסרים'}
              </div>
              <div className="cr-fin-sub">מחושב אך ורק כאשר קיימים נתוני אמת</div>
            </div>
          </div>
        </section>
      )}

      {/* 8. TAB: INSURANCE COMPANIES COMPARISON (חברות ביטוח) */}
      {activeTab === 'companies' && (
        <section className="cr-section">
          <div className="cr-section-title">
            <span>🏢 דוח פעילות מול חברות הביטוח והשוואה</span>
            <span className="cr-badge-info">{companyStats.length} חברות פעילות</span>
          </div>

          <div className="cr-table-wrap">
            <table className="cr-table" data-testid="companies-table">
              <thead>
                <tr>
                  <th>חברת ביטוח</th>
                  <th>סך תביעות</th>
                  <th>פתוחות</th>
                  <th>נסגרו</th>
                  <th>ממתינות</th>
                  <th>משפטי</th>
                  <th>סך נדרש</th>
                  <th>מאושר</th>
                  <th>שולם בפועל</th>
                  <th>יתרת חוב</th>
                  <th>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {companyStats.map(([co, d]) => (
                  <tr key={co} onClick={() => openDrilldown(`תביעות מול: ${co}`, d.items)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 800, color: 'var(--ac3)' }}>{co}</td>
                    <td><strong>{d.total}</strong></td>
                    <td><span className="cr-pill-sm warn">{d.open}</span></td>
                    <td><span className="cr-pill-sm success">{d.closed}</span></td>
                    <td>{d.waiting}</td>
                    <td>{d.legal > 0 ? <span className="cr-pill-sm danger">{d.legal}</span> : '0'}</td>
                    <td>{fmtMoney(d.claimedAmt)}</td>
                    <td style={{ color: 'var(--gn2)' }}>{fmtMoney(d.approvedAmt)}</td>
                    <td style={{ color: 'var(--gn2)', fontWeight: 700 }}>{fmtMoney(d.paidAmt)}</td>
                    <td style={{ color: d.balanceAmt > 0 ? 'var(--rd2)' : 'inherit', fontWeight: 700 }}>
                      {fmtMoney(d.balanceAmt)}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="cr-btn cr-btn-sm"
                        onClick={() => openDrilldown(`תביעות מול: ${co}`, d.items)}
                      >
                        פירוט תיקים ({d.total})
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 9. TAB: REFERRAL SOURCES & CLIENTS (מקורות הגעה ולקוחות) */}
      {activeTab === 'sources' && (
        <section className="cr-section">
          <div className="cr-section-title">
            <span>🎯 פילוח מקורות הגעת עבודה ולקוחות מובילים</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
            {/* Sources summary table */}
            <div>
              <h3 style={{ fontSize: 16, marginBottom: 10 }}>חלוקה לפי מקור הגעה</h3>
              <div className="cr-table-wrap">
                <table className="cr-table">
                  <thead>
                    <tr>
                      <th>מקור הגעה</th>
                      <th>כמות תיקים</th>
                      <th>סך שווי</th>
                      <th>שולם בפועל</th>
                      <th>יתרת חוב</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sourceStats.map(([src, d]) => (
                      <tr key={src} onClick={() => openDrilldown(`מקור הגעה: ${src}`, d.items)} style={{ cursor: 'pointer' }}>
                        <td style={{ fontWeight: 700 }}>{src}</td>
                        <td><strong>{d.count}</strong></td>
                        <td>{fmtMoney(d.totalAmt)}</td>
                        <td style={{ color: 'var(--gn2)' }}>{fmtMoney(d.paidAmt)}</td>
                        <td style={{ color: d.balanceAmt > 0 ? 'var(--rd2)' : 'inherit' }}>{fmtMoney(d.balanceAmt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Top clients table */}
            <div>
              <h3 style={{ fontSize: 16, marginBottom: 10 }}>לקוחות מובילים לפי שווי פעילות</h3>
              <div className="cr-table-wrap">
                <table className="cr-table">
                  <thead>
                    <tr>
                      <th>שם לקוח</th>
                      <th>תיקים</th>
                      <th>רכבים</th>
                      <th>סך שווי</th>
                      <th>יתרת חוב</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topClients.slice(0, 10).map((cl) => (
                      <tr key={cl.name} onClick={() => openDrilldown(`כל התיקים של הלקוח: ${cl.name}`, cl.items)} style={{ cursor: 'pointer' }}>
                        <td style={{ fontWeight: 700, color: 'var(--ac3)' }}>{cl.name}</td>
                        <td>{cl.count}</td>
                        <td>{cl.vehicles.size}</td>
                        <td style={{ fontWeight: 700 }}>{fmtMoney(cl.totalAmt)}</td>
                        <td style={{ color: cl.balanceAmt > 0 ? 'var(--rd2)' : 'inherit' }}>{fmtMoney(cl.balanceAmt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 10. TAB: VEHICLE DRILLDOWN (ניתוח לפי מספר רכב) */}
      {activeTab === 'vehicle_drilldown' && (
        <section className="cr-section">
          <div className="cr-section-title">
            <span>🚗 היסטוריה וניתוח מלא לפי מספר רכב</span>
          </div>

          <div style={{ display: 'flex', gap: 10, maxWidth: 500, marginBottom: 20 }}>
            <input
              type="text"
              className="cr-search-in"
              placeholder="הזן מספר לוחית רישוי (לדוגמה: 12-345-67)..."
              value={vehicleSearchPlate}
              onChange={(e) => setVehicleSearchPlate(e.target.value)}
              data-testid="vehicle-drilldown-input"
            />
            {vehicleSearchPlate && (
              <button type="button" className="cr-btn cr-btn-clear" onClick={() => setVehicleSearchPlate('')}>
                נקה
              </button>
            )}
          </div>

          {vehicleDrilldownData && (
            <div>
              <div className="cr-financial-grid" style={{ marginBottom: 20 }}>
                <div className="cr-fin-card">
                  <div className="cr-fin-label">מספר כניסות / תיקים לרכב</div>
                  <div className="cr-fin-val">{vehicleDrilldownData.items.length}</div>
                </div>
                <div className="cr-fin-card">
                  <div className="cr-fin-label">סך פעילות כספית</div>
                  <div className="cr-fin-val">{fmtMoney(vehicleDrilldownData.totalClaimed)}</div>
                </div>
                <div className="cr-fin-card success">
                  <div className="cr-fin-label">שולם בפועל</div>
                  <div className="cr-fin-val" style={{ color: 'var(--gn2)' }}>{fmtMoney(vehicleDrilldownData.totalPaid)}</div>
                </div>
                <div className="cr-fin-card danger">
                  <div className="cr-fin-label">יתרת חוב פתוחה</div>
                  <div className="cr-fin-val" style={{ color: 'var(--rd2)' }}>{fmtMoney(vehicleDrilldownData.totalBal)}</div>
                </div>
              </div>

              <div className="cr-table-wrap">
                <table className="cr-table">
                  <thead>
                    <tr>
                      <th>מספר תיק</th>
                      <th>סוג</th>
                      <th>תאריך</th>
                      <th>לקוח</th>
                      <th>חברה / גורם</th>
                      <th>סטטוס</th>
                      <th>סכום</th>
                      <th>שולם</th>
                      <th>יתרה</th>
                      <th>פעולה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicleDrilldownData.items.map((item) => (
                      <tr key={item.id}>
                        <td style={{ fontWeight: 800 }}>{item.displayNumber}</td>
                        <td>{item.originType === 'insurance' ? '🛡️ ביטוח' : '🔧 מוסך'}</td>
                        <td>{item.createdAtStr}</td>
                        <td>{item.clientName}</td>
                        <td>{item.insCompany}</td>
                        <td>{stBadge(item.status)}</td>
                        <td>{fmtMoney(item.claimAmount)}</td>
                        <td style={{ color: 'var(--gn2)' }}>{fmtMoney(item.paidAmount)}</td>
                        <td style={{ color: item.balanceAmount > 0 ? 'var(--rd2)' : 'inherit' }}>{fmtMoney(item.balanceAmount)}</td>
                        <td>
                          <button
                            type="button"
                            className="cr-btn cr-btn-open cr-btn-sm"
                            onClick={() => {
                              if (item.originType === 'insurance') onOpenClaim(item.id);
                              else onOpenGarageCase(item.id);
                            }}
                          >
                            פתח תיק
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 11. TAB: PERIOD COMPARISON (השוואת תקופות) */}
      {activeTab === 'comparison' && (
        <section className="cr-section">
          <div className="cr-section-title">
            <span>⚖️ השוואת תקופות – ביצועים נוכחיים לעומת תקופה מקבילה קודמת</span>
            <span className="cr-badge-info">ללא עיוות אחוזים בחלוקה באפס</span>
          </div>

          <div className="cr-table-wrap">
            <table className="cr-table" data-testid="period-comparison-table">
              <thead>
                <tr>
                  <th>מדד פעילות</th>
                  <th>תקופה נוכחית ({period})</th>
                  <th>תקופה קודמת מקבילה</th>
                  <th>שינוי מספרי (Δ)</th>
                  <th>שינוי באחוזים (%)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 700 }}>סך כל התיקים החדשים</td>
                  <td><strong>{comparison.curr.total}</strong></td>
                  <td>{comparison.prev.total}</td>
                  <td style={{ direction: 'ltr', textAlign: 'right' }}>{comparison.diffTotal > 0 ? `+${comparison.diffTotal}` : comparison.diffTotal}</td>
                  <td>
                    <span className={`cr-pill-sm ${comparison.pctTotal.dir === 'up' ? 'success' : comparison.pctTotal.dir === 'down' ? 'danger' : ''}`}>
                      {comparison.pctTotal.text}
                    </span>
                  </td>
                </tr>

                <tr>
                  <td style={{ fontWeight: 700 }}>עבודות והזמנות מוסך</td>
                  <td><strong>{comparison.curr.garCount}</strong></td>
                  <td>{comparison.prev.garCount}</td>
                  <td style={{ direction: 'ltr', textAlign: 'right' }}>{comparison.diffGar > 0 ? `+${comparison.diffGar}` : comparison.diffGar}</td>
                  <td>
                    <span className={`cr-pill-sm ${comparison.pctGar.dir === 'up' ? 'success' : comparison.pctGar.dir === 'down' ? 'danger' : ''}`}>
                      {comparison.pctGar.text}
                    </span>
                  </td>
                </tr>

                <tr>
                  <td style={{ fontWeight: 700 }}>תביעות ביטוח חדשות</td>
                  <td><strong>{comparison.curr.insCount}</strong></td>
                  <td>{comparison.prev.insCount}</td>
                  <td style={{ direction: 'ltr', textAlign: 'right' }}>{comparison.diffIns > 0 ? `+${comparison.diffIns}` : comparison.diffIns}</td>
                  <td>
                    <span className={`cr-pill-sm ${comparison.pctIns.dir === 'up' ? 'success' : comparison.pctIns.dir === 'down' ? 'danger' : ''}`}>
                      {comparison.pctIns.text}
                    </span>
                  </td>
                </tr>

                <tr>
                  <td style={{ fontWeight: 700 }}>תיקים ועבודות שנסגרו</td>
                  <td><strong>{comparison.curr.closed}</strong></td>
                  <td>{comparison.prev.closed}</td>
                  <td style={{ direction: 'ltr', textAlign: 'right' }}>{comparison.diffClosed > 0 ? `+${comparison.diffClosed}` : comparison.diffClosed}</td>
                  <td>
                    <span className={`cr-pill-sm ${comparison.pctClosed.dir === 'up' ? 'success' : comparison.pctClosed.dir === 'down' ? 'danger' : ''}`}>
                      {comparison.pctClosed.text}
                    </span>
                  </td>
                </tr>

                <tr>
                  <td style={{ fontWeight: 700 }}>סך שווי פעילות נדרש</td>
                  <td style={{ fontWeight: 700 }}>{fmtMoney(comparison.curr.totalClaimed)}</td>
                  <td>{fmtMoney(comparison.prev.totalClaimed)}</td>
                  <td style={{ direction: 'ltr', textAlign: 'right' }}>{fmtMoney(comparison.diffClaimed)}</td>
                  <td>
                    <span className={`cr-pill-sm ${comparison.pctClaimed.dir === 'up' ? 'success' : comparison.pctClaimed.dir === 'down' ? 'danger' : ''}`}>
                      {comparison.pctClaimed.text}
                    </span>
                  </td>
                </tr>

                <tr>
                  <td style={{ fontWeight: 700 }}>תקבולים שהתקבלו בפועל</td>
                  <td style={{ fontWeight: 700, color: 'var(--gn2)' }}>{fmtMoney(comparison.curr.totalPaid)}</td>
                  <td>{fmtMoney(comparison.prev.totalPaid)}</td>
                  <td style={{ direction: 'ltr', textAlign: 'right' }}>{fmtMoney(comparison.diffPaid)}</td>
                  <td>
                    <span className={`cr-pill-sm ${comparison.pctPaid.dir === 'up' ? 'success' : comparison.pctPaid.dir === 'down' ? 'danger' : ''}`}>
                      {comparison.pctPaid.text}
                    </span>
                  </td>
                </tr>

                <tr>
                  <td style={{ fontWeight: 700 }}>יתרת חובות פתוחים</td>
                  <td style={{ fontWeight: 700, color: 'var(--rd2)' }}>{fmtMoney(comparison.curr.totalBalance)}</td>
                  <td>{fmtMoney(comparison.prev.totalBalance)}</td>
                  <td style={{ direction: 'ltr', textAlign: 'right' }}>{fmtMoney(comparison.diffBalance)}</td>
                  <td>
                    <span className={`cr-pill-sm ${comparison.pctBalance.dir === 'up' ? 'danger' : comparison.pctBalance.dir === 'down' ? 'success' : ''}`}>
                      {comparison.pctBalance.text}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 12. TAB: DETAILED MASTER DATA TABLE (טבלת פירוט מרכזית) */}
      {activeTab === 'table' && (
        <section className="cr-section">
          <div className="cr-section-title">
            <span>📄 טבלת פירוט התיקים שנכללו בדוח ({filteredItems.length} רשומות)</span>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className="cr-badge-info">הסיכומים מחושבים על כל הרשומות</span>
              <select
                className="cr-select cr-btn-sm"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value={25}>25 לעמוד</option>
                <option value={50}>50 לעמוד</option>
                <option value={100}>100 לעמוד</option>
              </select>
            </div>
          </div>

          <div className="cr-table-wrap">
            <table className="cr-table" data-testid="reports-details-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('displayNumber')} style={{ cursor: 'pointer' }}>מספר תיק ↕</th>
                  <th>סוג תיק</th>
                  <th onClick={() => handleSort('createdAt')} style={{ cursor: 'pointer' }}>תאריך פתיחה ↕</th>
                  <th onClick={() => handleSort('clientName')} style={{ cursor: 'pointer' }}>שם לקוח ↕</th>
                  <th onClick={() => handleSort('plate')} style={{ cursor: 'pointer' }}>מספר רכב ↕</th>
                  <th>מקור הגעה</th>
                  <th>חברת ביטוח / גורם משלם</th>
                  <th onClick={() => handleSort('status')} style={{ cursor: 'pointer' }}>סטטוס ↕</th>
                  <th onClick={() => handleSort('claimAmount')} style={{ cursor: 'pointer' }}>סכום נדרש ↕</th>
                  <th onClick={() => handleSort('approvedAmount')} style={{ cursor: 'pointer' }}>מאושר ↕</th>
                  <th onClick={() => handleSort('paidAmount')} style={{ cursor: 'pointer' }}>שולם בפועל ↕</th>
                  <th onClick={() => handleSort('balanceAmount')} style={{ cursor: 'pointer' }}>יתרה לתשלום ↕</th>
                  <th>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.length === 0 ? (
                  <tr>
                    <td colSpan={13} style={{ textAlign: 'center', padding: 32, color: 'var(--t3)' }}>
                      לא נמצאו תיקים התואמים את הסינון הנוכחי.
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => {
                        if (item.originType === 'insurance') onOpenClaim(item.id);
                        else onOpenGarageCase(item.id);
                      }}
                      style={{ cursor: 'pointer' }}
                      data-testid={`report-row-${item.id}`}
                    >
                      <td style={{ fontWeight: 800, color: item.originType === 'garage' ? '#fbbf24' : 'var(--ac3)' }}>
                        {item.displayNumber}
                      </td>
                      <td>
                        <span className={`cr-pill-sm ${item.originType === 'insurance' ? 'ins' : 'gar'}`}>
                          {item.originType === 'insurance' ? '🛡️ ביטוח' : '🔧 מוסך'}
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>{item.createdAtStr}</td>
                      <td style={{ fontWeight: 600 }}>{item.clientName}</td>
                      <td><strong>{item.plate}</strong></td>
                      <td><span className="cr-pill-sm">{item.referralSource}</span></td>
                      <td>{item.insCompany}</td>
                      <td>{stBadge(item.status)}</td>
                      <td>{fmtMoney(item.claimAmount)}</td>
                      <td style={{ color: 'var(--gn2)', fontWeight: 600 }}>{fmtMoney(item.approvedAmount)}</td>
                      <td style={{ color: 'var(--gn2)', fontWeight: 700 }}>{fmtMoney(item.paidAmount)}</td>
                      <td style={{ color: item.balanceAmount > 0 ? 'var(--rd2)' : 'inherit', fontWeight: 700 }}>
                        {fmtMoney(item.balanceAmount)}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="cr-btn cr-btn-open cr-btn-sm"
                          onClick={() => {
                            if (item.originType === 'insurance') onOpenClaim(item.id);
                            else onOpenGarageCase(item.id);
                          }}
                          data-testid={`open-case-btn-${item.id}`}
                        >
                          פתח תיק ›
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
              <button
                type="button"
                className="cr-btn cr-btn-sm"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                › עמוד קודם
              </button>
              <span>עמוד {currentPage} מתוך {totalPages}</span>
              <button
                type="button"
                className="cr-btn cr-btn-sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                עמוד הבא ‹
              </button>
            </div>
          )}
        </section>
      )}

      {/* 13. TAB: GRAPHS & VISUAL DASHBOARD (גרפים ותרשימים) */}
      {activeTab === 'graphs' && (
        <section className="cr-section">
          <div className="cr-section-title">
            <span>📈 תרשימים והתפלגות ניהולית בזמן אמת</span>
          </div>

          <div className="cr-graphs-grid">
            {/* Donut Chart: Insurance vs Garage */}
            <div className="cr-graph-card">
              <div className="cr-graph-title">חלוקת תיקים: ביטוח מול מוסך</div>
              <div className="cr-donut-wrap">
                <svg viewBox="0 0 100 100" className="cr-donut-svg">
                  {(() => {
                    const total = filteredItems.length || 1;
                    const insPct = (kpis.insuranceCount / total) * 100;
                    const garPct = 100 - insPct;
                    return (
                      <>
                        <circle cx="50" cy="50" r="38" fill="transparent" stroke="var(--bg3)" strokeWidth="18" />
                        <circle
                          cx="50"
                          cy="50"
                          r="38"
                          fill="transparent"
                          stroke="var(--ac2)"
                          strokeWidth="18"
                          strokeDasharray={`${insPct * 2.38} 238`}
                          transform="rotate(-90 50 50)"
                        />
                        <circle
                          cx="50"
                          cy="50"
                          r="38"
                          fill="transparent"
                          stroke="#f59e0b"
                          strokeWidth="18"
                          strokeDasharray={`${garPct * 2.38} 238`}
                          strokeDashoffset={`-${insPct * 2.38}`}
                          transform="rotate(-90 50 50)"
                        />
                      </>
                    );
                  })()}
                </svg>
                <div className="cr-donut-center">
                  <div style={{ fontSize: 20, fontWeight: 900 }}>{filteredItems.length}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>סך הכל</div>
                </div>
              </div>
              <div className="cr-graph-legend">
                <div className="cr-legend-item cursor-pointer" onClick={() => openDrilldown('תביעות ביטוח', filteredItems.filter((i) => i.originType === 'insurance'))}>
                  <span className="cr-legend-dot" style={{ background: 'var(--ac2)' }} />
                  <span>תביעות ביטוח ({kpis.insuranceCount})</span>
                </div>
                <div className="cr-legend-item cursor-pointer" onClick={() => openDrilldown('עבודות מוסך', filteredItems.filter((i) => i.originType === 'garage'))}>
                  <span className="cr-legend-dot" style={{ background: '#f59e0b' }} />
                  <span>כרטיסי מוסך ({kpis.garageCount})</span>
                </div>
              </div>
            </div>

            {/* Financial Overview Bars */}
            <div className="cr-graph-card">
              <div className="cr-graph-title">התפלגות כספית: נדרש מול שולם ויתרה</div>
              <div className="cr-bar-chart">
                <div className="cr-bar-row">
                  <div className="cr-bar-lbl">סך שווי נדרש</div>
                  <div className="cr-bar-track">
                    <div className="cr-bar-fill" style={{ width: '100%', background: 'var(--ac2)' }} />
                  </div>
                  <div className="cr-bar-num">{fmtMoney(kpis.totalClaimedOrWork)}</div>
                </div>

                <div className="cr-bar-row">
                  <div className="cr-bar-lbl">מאושר לתשלום</div>
                  <div className="cr-bar-track">
                    <div
                      className="cr-bar-fill"
                      style={{
                        width: `${kpis.totalClaimedOrWork > 0 ? (kpis.totalApproved / kpis.totalClaimedOrWork) * 100 : 0}%`,
                        background: 'var(--gn2)',
                      }}
                    />
                  </div>
                  <div className="cr-bar-num">{fmtMoney(kpis.totalApproved)}</div>
                </div>

                <div className="cr-bar-row">
                  <div className="cr-bar-lbl">שולם בפועל</div>
                  <div className="cr-bar-track">
                    <div
                      className="cr-bar-fill"
                      style={{
                        width: `${kpis.totalClaimedOrWork > 0 ? (kpis.totalPaid / kpis.totalClaimedOrWork) * 100 : 0}%`,
                        background: '#22c55e',
                      }}
                    />
                  </div>
                  <div className="cr-bar-num">{fmtMoney(kpis.totalPaid)}</div>
                </div>

                <div className="cr-bar-row">
                  <div className="cr-bar-lbl">יתרת חוב לגבייה</div>
                  <div className="cr-bar-track">
                    <div
                      className="cr-bar-fill"
                      style={{
                        width: `${kpis.totalClaimedOrWork > 0 ? (kpis.totalBalance / kpis.totalClaimedOrWork) * 100 : 0}%`,
                        background: 'var(--rd2)',
                      }}
                    />
                  </div>
                  <div className="cr-bar-num">{fmtMoney(kpis.totalBalance)}</div>
                </div>
              </div>
            </div>

            {/* Referral Sources Bar Breakdown */}
            <div className="cr-graph-card" style={{ gridColumn: '1 / -1' }}>
              <div className="cr-graph-title">התפלגות לפי מקור הגעת העבודה</div>
              <div className="cr-bar-chart">
                {sourceStats.map(([src, d]) => (
                  <div
                    key={src}
                    className="cr-bar-row cursor-pointer"
                    onClick={() => openDrilldown(`מקור הגעה: ${src}`, d.items)}
                  >
                    <div className="cr-bar-lbl">{src}</div>
                    <div className="cr-bar-track">
                      <div
                        className="cr-bar-fill"
                        style={{
                          width: `${filteredItems.length > 0 ? (d.count / filteredItems.length) * 100 : 0}%`,
                          background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                        }}
                      />
                    </div>
                    <div className="cr-bar-num">{d.count} תיקים ({fmtMoney(d.totalAmt)})</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 14. INTERACTIVE DRILLDOWN MODAL (דרישה 14: כל מספר בדוח לחיץ!) */}
      {drilldown && (
        <div className="cr-modal-ov" onClick={() => setDrilldown(null)} data-testid="drilldown-modal">
          <div className="cr-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="cr-modal-head">
              <div className="cr-modal-title-wrap">
                <h2 className="cr-modal-title" style={{ color: drilldown.badgeColor || '#3b82f6' }}>
                  {drilldown.title}
                </h2>
                <span className="cr-badge-info">{drilldown.items.length} תיקים נכללים</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  className="cr-btn cr-btn-export cr-btn-sm"
                  onClick={() => handleExportCsv(drilldown.items, `פירוט_${drilldown.title.replace(/\s+/g, '_')}`)}
                >
                  📥 ייצא לרשימה
                </button>
                <button
                  type="button"
                  className="cr-modal-close"
                  onClick={() => setDrilldown(null)}
                  data-testid="drilldown-modal-close"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="cr-modal-body">
              <div className="cr-table-wrap">
                <table className="cr-table">
                  <thead>
                    <tr>
                      <th>מספר תיק</th>
                      <th>סוג</th>
                      <th>תאריך פתיחה</th>
                      <th>שם לקוח</th>
                      <th>מספר רכב</th>
                      <th>מקור הגעה</th>
                      <th>חברת ביטוח / גורם</th>
                      <th>סטטוס</th>
                      <th>סכום נדרש</th>
                      <th>מאושר</th>
                      <th>שולם בפועל</th>
                      <th>יתרה</th>
                      <th>פעולה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drilldown.items.length === 0 ? (
                      <tr>
                        <td colSpan={13} style={{ textAlign: 'center', padding: 24, color: 'var(--t3)' }}>
                          אין תיקים ברשימה זו.
                        </td>
                      </tr>
                    ) : (
                      drilldown.items.map((item) => (
                        <tr key={item.id}>
                          <td style={{ fontWeight: 800, color: item.originType === 'garage' ? '#fbbf24' : 'var(--ac3)' }}>
                            {item.displayNumber}
                          </td>
                          <td>
                            <span className={`cr-pill-sm ${item.originType === 'insurance' ? 'ins' : 'gar'}`}>
                              {item.originType === 'insurance' ? '🛡️ ביטוח' : '🔧 מוסך'}
                            </span>
                          </td>
                          <td>{item.createdAtStr}</td>
                          <td style={{ fontWeight: 600 }}>{item.clientName}</td>
                          <td><strong>{item.plate}</strong></td>
                          <td><span className="cr-pill-sm">{item.referralSource}</span></td>
                          <td>{item.insCompany}</td>
                          <td>{stBadge(item.status)}</td>
                          <td>{fmtMoney(item.claimAmount)}</td>
                          <td style={{ color: 'var(--gn2)' }}>{fmtMoney(item.approvedAmount)}</td>
                          <td style={{ color: 'var(--gn2)', fontWeight: 700 }}>{fmtMoney(item.paidAmount)}</td>
                          <td style={{ color: item.balanceAmount > 0 ? 'var(--rd2)' : 'inherit', fontWeight: 700 }}>
                            {fmtMoney(item.balanceAmount)}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="cr-btn cr-btn-open cr-btn-sm"
                              onClick={() => {
                                setDrilldown(null);
                                if (item.originType === 'insurance') onOpenClaim(item.id);
                                else onOpenGarageCase(item.id);
                              }}
                              data-testid={`drilldown-open-case-${item.id}`}
                            >
                              פתח תיק ›
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClaimsReportsView;
