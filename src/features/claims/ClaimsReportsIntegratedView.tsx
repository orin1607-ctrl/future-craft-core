// src/features/claims/ClaimsReportsIntegratedView.tsx
import React, { useState, useMemo, useCallback } from 'react';
import type { ClaimRecord } from './claimsConstants';
import { displayClaimNum } from './claimsConstants';
import type { GarageCaseRecord } from './ClaimsReportsView';
import ClaimQuotesReportSection from './ClaimQuotesReportSection';
import './claim-quote.css';

export interface ClaimsReportsIntegratedViewProps {
  claims: ClaimRecord[];
  garageCases: GarageCaseRecord[];
  onBack: () => void;
  onOpenClaim: (id: string) => void;
  onOpenGarageCase: (id: string) => void;
  onOpenAiReports?: () => void;
}

interface UnifiedReportRow {
  id: string;
  kind: 'insurance' | 'garage';
  caseNum: string;
  clientName: string;
  clientPhone: string;
  plate: string;
  insCompany: string;
  referralSource: string;
  workType: string;
  status: string;
  isClosed: boolean;
  dateStr: string;
  dateObj: Date | null;
  quoteAmount: number;
  approvedAmount: number;
  invoiceAmount: number;
  paidAmount: number;
  balanceDue: number;
}

type PeriodOption =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | '3_months'
  | '6_months'
  | 'year_back'
  | 'this_year'
  | 'last_year'
  | 'all'
  | 'custom';

const PERIOD_LABELS: Record<PeriodOption, string> = {
  this_month: 'החודש הנוכחי',
  last_month: 'החודש שעבר',
  this_week: 'השבוע הנוכחי',
  last_week: 'השבוע שעבר',
  today: 'היום',
  yesterday: 'אתמול',
  '3_months': '3 חודשים אחרונים',
  '6_months': 'חצי שנה אחרונה',
  year_back: 'שנה אחורה',
  this_year: 'השנה הנוכחית',
  last_year: 'השנה שעברה',
  all: 'כל התקופות',
  custom: 'טווח תאריכים מותאם...',
};

function parseNum(val: unknown): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (typeof val === 'string') {
    const clean = val.replace(/[^\d.-]/g, '');
    const n = parseFloat(clean);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function fmtCurrency(n: number): string {
  if (!n) return '₪0';
  return `₪${Math.round(n).toLocaleString('he-IL')}`;
}

function normalizeSource(raw: unknown): string {
  if (!raw || typeof raw !== 'string') return 'מקור לא צוין';
  const s = raw.trim();
  if (!s || s === '—' || s === 'unknown' || s === 'null') return 'מקור לא צוין';
  if (/פרטי|ישיר/i.test(s)) return 'לקוח פרטי ישיר';
  if (/עסקי|חברה/i.test(s)) return 'לקוח עסקי';
  if (/סוכן/i.test(s)) return 'סוכן ביטוח';
  if (/ליסינג/i.test(s)) return 'חברת ליסינג';
  if (/השכרה/i.test(s)) return 'השכרת רכב';
  if (/צי/i.test(s)) return 'צי רכב';
  if (/ביטוח/i.test(s)) return 'חברת ביטוח';
  if (/הפניה|חבר/i.test(s)) return 'הפניה';
  return s;
}

function normalizeWorkType(raw: unknown): string {
  if (!raw || typeof raw !== 'string') return 'עבודה כללית';
  const s = raw.trim();
  if (!s || s === '—' || s === 'כללי') return 'עבודה כללית';
  if (/פחחות/i.test(s)) return 'פחחות וצבע';
  if (/צבע/i.test(s)) return 'פחחות וצבע';
  if (/תאונ/i.test(s)) return 'תיקון נזק תאונה';
  if (/מכונאות|מנוע|בלמים|שמנים|טיפול/i.test(s)) return 'מכונאות וטיפולים';
  if (/חשמל|מיזוג/i.test(s)) return 'חשמל ומיזוג';
  if (/שמשות|זכוכית/i.test(s)) return 'שמשות ומיגון';
  return s;
}

export default function ClaimsReportsIntegratedView({
  claims,
  garageCases,
  onBack,
  onOpenClaim,
  onOpenGarageCase,
  onOpenAiReports,
}: ClaimsReportsIntegratedViewProps) {
  // Filters
  const [period, setPeriod] = useState<PeriodOption>('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [activityKind, setActivityKind] = useState<'all' | 'garage' | 'insurance'>('all');
  const [filterSource, setFilterSource] = useState('all');
  const [filterInsCo, setFilterInsCo] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterWorkType, setFilterWorkType] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Drilldown modal state
  const [drillModal, setDrillModal] = useState<{ title: string; rows: UnifiedReportRow[] } | null>(null);

  // 1. Build unified deduplicated records pool
  const unifiedRows = useMemo<UnifiedReportRow[]>(() => {
    const list: UnifiedReportRow[] = [];
    const seenIds = new Set<string>();

    // A. Insurance Claims
    for (const c of claims) {
      if (!c || !c.id || seenIds.has(c.id)) continue;
      seenIds.add(c.id);

      const dStr = c.createdAt || c.updatedAt || '';
      const dObj = dStr ? new Date(dStr) : null;
      const isClosed = c.status === 'הסתיים' || c.status === 'סגור' || c.status === 'בוטל' || c.archived === 'true';

      const claimTotal = parseNum(c.claimAmount || (c as any).amount || 0);
      const approved = parseNum(c.approvedAmount || (c as any).approved_amount || (c.status?.includes('אושר') ? claimTotal : 0));
      const invoice = parseNum((c as any).invoiceAmount || claimTotal);
      const paid = parseNum(c.paidAmount || (c as any).paid_amount || (c.status?.includes('שולם') ? approved || claimTotal : 0));
      const balance = Math.max(0, (approved || invoice || claimTotal) - paid);

      list.push({
        id: c.id,
        kind: 'insurance',
        caseNum: displayClaimNum(c) || c.id.slice(0, 8),
        clientName: c.clientName || 'ללא שם',
        clientPhone: c.clientPhone || '',
        plate: c.plate || '—',
        insCompany: c.insCompany || 'לא צוינה',
        referralSource: normalizeSource(c.source || (c as any).referral_source),
        workType: normalizeWorkType(c.claimKind || 'תביעת ביטוח'),
        status: c.status || 'חדש',
        isClosed,
        dateStr: dStr ? dStr.slice(0, 10) : '—',
        dateObj: dObj && !isNaN(dObj.getTime()) ? dObj : null,
        quoteAmount: claimTotal,
        approvedAmount: approved,
        invoiceAmount: invoice,
        paidAmount: paid,
        balanceDue: balance,
      });
    }

    // B. Garage Cases
    for (const g of garageCases) {
      if (!g || !g.id || seenIds.has(g.id)) continue;
      seenIds.add(g.id);

      const cd = g.case_data || {};
      const dStr = g.created_at || g.updated_at || '';
      const dObj = dStr ? new Date(dStr) : null;
      const isClosed = g.status === 'סגור' || !!cd.caseClosed || !!cd.workFinished;

      // Extract work order and quote numbers
      const quoteVal = parseNum(cd.workOrderAmount || cd.totalAmount || (cd.quote as any)?.total || 0);
      const approved = parseNum(cd.finalApprovedAmount || (cd.quote as any)?.approved || (isClosed ? quoteVal : 0));
      const invoice = parseNum(cd.workOrderAmount || quoteVal);
      const paid = parseNum((cd as any).paidAmount || (cd as any).paid_amount || (isClosed ? approved || quoteVal : 0));
      const balance = Math.max(0, (approved || quoteVal) - paid);

      const insCo = (typeof cd.claimNumber === 'string' && cd.claimNumber) ? `תביעה: ${cd.claimNumber}` : 'מוסך כללי';

      list.push({
        id: g.id,
        kind: 'garage',
        caseNum: g.case_number || (cd.workOrderNumber ? `הזמנה ${cd.workOrderNumber}` : `מוסך-${g.id.slice(0, 6)}`),
        clientName: g.customer_name_snapshot || (typeof cd.customerName === 'string' ? cd.customerName : '') || 'לקוח מוסך',
        clientPhone: typeof cd.customerPhone === 'string' ? cd.customerPhone : '',
        plate: g.vehicle_plate_snapshot || (typeof cd.vehiclePlate === 'string' ? cd.vehiclePlate : '') || '—',
        insCompany: insCo,
        referralSource: normalizeSource(cd.referralSource || cd.source || cd.customer_type),
        workType: normalizeWorkType(cd.workType || (cd.quoteWorks && cd.quoteWorks[0]?.type) || 'עבודת מוסך'),
        status: g.status || (isClosed ? 'סגור' : 'בטיפול'),
        isClosed,
        dateStr: dStr ? dStr.slice(0, 10) : '—',
        dateObj: dObj && !isNaN(dObj.getTime()) ? dObj : null,
        quoteAmount: quoteVal,
        approvedAmount: approved,
        invoiceAmount: invoice,
        paidAmount: paid,
        balanceDue: balance,
      });
    }

    return list;
  }, [claims, garageCases]);

  // 2. Resolve date boundaries
  const dateRange = useMemo<{ start: Date | null; end: Date | null }>(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    switch (period) {
      case 'today':
        return { start: startOfToday, end: endOfToday };
      case 'yesterday': {
        const yStart = new Date(startOfToday);
        yStart.setDate(yStart.getDate() - 1);
        const yEnd = new Date(endOfToday);
        yEnd.setDate(yEnd.getDate() - 1);
        return { start: yStart, end: yEnd };
      }
      case 'this_week': {
        const day = startOfToday.getDay(); // 0 is Sunday in IL
        const wStart = new Date(startOfToday);
        wStart.setDate(wStart.getDate() - day);
        return { start: wStart, end: endOfToday };
      }
      case 'last_week': {
        const day = startOfToday.getDay();
        const lwStart = new Date(startOfToday);
        lwStart.setDate(lwStart.getDate() - day - 7);
        const lwEnd = new Date(lwStart);
        lwEnd.setDate(lwEnd.getDate() + 6);
        lwEnd.setHours(23, 59, 59, 999);
        return { start: lwStart, end: lwEnd };
      }
      case 'this_month': {
        const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return { start: mStart, end: endOfToday };
      }
      case 'last_month': {
        const lmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        return { start: lmStart, end: lmEnd };
      }
      case '3_months': {
        const d3 = new Date(startOfToday);
        d3.setDate(d3.getDate() - 90);
        return { start: d3, end: endOfToday };
      }
      case '6_months': {
        const d6 = new Date(startOfToday);
        d6.setDate(d6.getDate() - 180);
        return { start: d6, end: endOfToday };
      }
      case 'year_back': {
        const dy = new Date(startOfToday);
        dy.setDate(dy.getDate() - 365);
        return { start: dy, end: endOfToday };
      }
      case 'this_year': {
        const tyStart = new Date(now.getFullYear(), 0, 1);
        return { start: tyStart, end: endOfToday };
      }
      case 'last_year': {
        const lyStart = new Date(now.getFullYear() - 1, 0, 1);
        const lyEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
        return { start: lyStart, end: lyEnd };
      }
      case 'custom': {
        const cStart = customFrom ? new Date(`${customFrom}T00:00:00`) : null;
        const cEnd = customTo ? new Date(`${customTo}T23:59:59`) : null;
        return { start: cStart, end: cEnd };
      }
      case 'all':
      default:
        return { start: null, end: null };
    }
  }, [period, customFrom, customTo]);

  // 3. Filter unified rows
  const filteredRows = useMemo(() => {
    return unifiedRows.filter((r) => {
      // Period
      if (dateRange.start && r.dateObj && r.dateObj < dateRange.start) return false;
      if (dateRange.end && r.dateObj && r.dateObj > dateRange.end) return false;

      // Activity Kind
      if (activityKind === 'garage' && r.kind !== 'garage') return false;
      if (activityKind === 'insurance' && r.kind !== 'insurance') return false;

      // Source
      if (filterSource !== 'all' && r.referralSource !== filterSource) return false;

      // Insurance Co
      if (filterInsCo !== 'all' && r.insCompany !== filterInsCo) return false;

      // Status
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;

      // Work Type
      if (filterWorkType !== 'all' && r.workType !== filterWorkType) return false;

      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const haystack = `${r.caseNum} ${r.clientName} ${r.plate} ${r.insCompany} ${r.referralSource} ${r.workType} ${r.status}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [unifiedRows, dateRange, activityKind, filterSource, filterInsCo, filterStatus, filterWorkType, searchTerm]);

  // 4. Summaries & KPIs
  const kpis = useMemo(() => {
    const total = filteredRows.length;
    const garageCount = filteredRows.filter((r) => r.kind === 'garage').length;
    const insuranceCount = filteredRows.filter((r) => r.kind === 'insurance').length;
    const openCount = filteredRows.filter((r) => !r.isClosed).length;
    const closedCount = filteredRows.filter((r) => r.isClosed).length;

    const uniqueClients = new Set(filteredRows.map((r) => r.clientName.trim()).filter(Boolean)).size;
    const uniquePlates = new Set(filteredRows.map((r) => r.plate.trim()).filter((p) => p && p !== '—')).size;

    const sumQuote = filteredRows.reduce((acc, r) => acc + r.quoteAmount, 0);
    const sumApproved = filteredRows.reduce((acc, r) => acc + r.approvedAmount, 0);
    const sumInvoice = filteredRows.reduce((acc, r) => acc + r.invoiceAmount, 0);
    const sumPaid = filteredRows.reduce((acc, r) => acc + r.paidAmount, 0);
    const sumBalance = filteredRows.reduce((acc, r) => acc + r.balanceDue, 0);

    const sumGarage = filteredRows.filter((r) => r.kind === 'garage').reduce((acc, r) => acc + (r.approvedAmount || r.quoteAmount), 0);
    const sumIns = filteredRows.filter((r) => r.kind === 'insurance').reduce((acc, r) => acc + (r.approvedAmount || r.quoteAmount), 0);
    const sumTotalActivity = sumGarage + sumIns;

    return {
      total,
      garageCount,
      insuranceCount,
      openCount,
      closedCount,
      uniqueClients,
      uniquePlates,
      sumQuote,
      sumApproved,
      sumInvoice,
      sumPaid,
      sumBalance,
      sumGarage,
      sumIns,
      sumTotalActivity,
    };
  }, [filteredRows]);

  // Unique options for dropdowns
  const sourceOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of unifiedRows) if (r.referralSource) s.add(r.referralSource);
    return Array.from(s).sort();
  }, [unifiedRows]);

  const insCoOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of unifiedRows) if (r.insCompany && r.insCompany !== 'מוסך כללי') s.add(r.insCompany);
    return Array.from(s).sort();
  }, [unifiedRows]);

  const statusOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of unifiedRows) if (r.status) s.add(r.status);
    return Array.from(s).sort();
  }, [unifiedRows]);

  const workTypeOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of unifiedRows) if (r.workType) s.add(r.workType);
    return Array.from(s).sort();
  }, [unifiedRows]);

  // Breakdown by Referral Source
  const sourceBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; sum: number }>();
    for (const r of filteredRows) {
      const src = r.referralSource || 'לא צוין';
      const cur = map.get(src) || { count: 0, sum: 0 };
      cur.count += 1;
      cur.sum += r.approvedAmount || r.quoteAmount;
      map.set(src, cur);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count);
  }, [filteredRows]);

  // Breakdown by Insurance Company
  const insBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; approved: number; paid: number; balance: number }>();
    for (const r of filteredRows.filter((x) => x.kind === 'insurance')) {
      const co = r.insCompany || 'לא צוינה';
      const cur = map.get(co) || { count: 0, approved: 0, paid: 0, balance: 0 };
      cur.count += 1;
      cur.approved += r.approvedAmount || r.quoteAmount;
      cur.paid += r.paidAmount;
      cur.balance += r.balanceDue;
      map.set(co, cur);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count);
  }, [filteredRows]);

  // Open item helper
  const handleOpenRow = (r: UnifiedReportRow) => {
    if (r.kind === 'garage') {
      onOpenGarageCase(r.id);
    } else {
      onOpenClaim(r.id);
    }
  };

  return (
    <div className="claims-reports-integrated" style={{ width: '100%', minWidth: 0 }}>
      {/* 1. Page Header matching existing ClaimsScreen */}
      <div className="ph" style={{ marginBottom: 14 }}>
        <div>
          <div className="ph-t" data-testid="claims-reports-heading">
            דוחות ניהול – מוסך ותביעות ביטוח
            <div className="ph-bar" />
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 4 }}>
            סיכום פעילות ובקרה כספית מלאה · {filteredRows.length} רשומות בתקופה הנבחרת
          </div>
        </div>
        <div className="ph-a">
          {onOpenAiReports && (
            <button
              type="button"
              className="btn btn-g btn-sm"
              data-testid="reports-open-ai-btn"
              onClick={onOpenAiReports}
              style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, borderColor: 'var(--ac)' }}
              title="פתיחת עוזר דוחות ניהוליים ומאזן משותף"
            >
              <span>✨</span> דליה AI דוחות ומאזן
            </button>
          )}
          <button
            type="button"
            className="btn btn-g btn-sm"
            data-testid="claims-reports-back-btn"
            onClick={onBack}
            style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            ← חזרה לכל התיקים
          </button>
        </div>
      </div>

      {/* 2. Top Filter Bar (Period, Activity Kind, and Search) */}
      <div
        style={{
          background: 'var(--bg2)',
          border: '1px solid var(--br2)',
          borderRadius: 'var(--r)',
          padding: '10px 12px',
          marginBottom: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {/* Row 1: Activity Kind Toggle + Period Select */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          {/* Origin Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', marginLeft: 4 }}>פעילות:</span>
            <button
              type="button"
              className={`btn btn-sm ${activityKind === 'all' ? 'btn-p' : 'btn-g'}`}
              data-testid="rep-filter-kind-all"
              onClick={() => setActivityKind('all')}
              style={{ borderRadius: 'var(--r2)' }}
            >
              הכול ({unifiedRows.length})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${activityKind === 'garage' ? 'btn-p' : 'btn-g'}`}
              data-testid="rep-filter-kind-garage"
              onClick={() => setActivityKind('garage')}
              style={{ borderRadius: 'var(--r2)' }}
            >
              ניהול מוסך ({unifiedRows.filter((r) => r.kind === 'garage').length})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${activityKind === 'insurance' ? 'btn-p' : 'btn-g'}`}
              data-testid="rep-filter-kind-insurance"
              onClick={() => setActivityKind('insurance')}
              style={{ borderRadius: 'var(--r2)' }}
            >
              תביעות ביטוח ({unifiedRows.filter((r) => r.kind === 'insurance').length})
            </button>
          </div>

          {/* Period Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)' }}>תקופה:</span>
            <select
              className="fse"
              value={period}
              onChange={(e) => setPeriod(e.target.value as PeriodOption)}
              data-testid="rep-period-select"
              style={{ minWidth: 150, fontSize: 12 }}
            >
              {Object.entries(PERIOD_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Custom date range inputs if period === 'custom' */}
        {period === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingTop: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--t2)' }}>מתאריך:</span>
            <input
              type="date"
              className="fi"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              style={{ fontSize: 12 }}
            />
            <span style={{ fontSize: 12, color: 'var(--t2)' }}>עד תאריך:</span>
            <input
              type="date"
              className="fi"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              style={{ fontSize: 12 }}
            />
          </div>
        )}

        {/* Row 2: Secondary Dropdown Filters + Search */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            paddingTop: 4,
            borderTop: '1px solid var(--br2)',
          }}
        >
          {/* Referral Source */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--t3)' }}>מקור:</span>
            <select
              className="fse"
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value)}
              style={{ fontSize: 11.5, padding: '4px 6px' }}
            >
              <option value="all">כל המקורות</option>
              {sourceOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Insurance Company */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--t3)' }}>חב׳ ביטוח:</span>
            <select
              className="fse"
              value={filterInsCo}
              onChange={(e) => setFilterInsCo(e.target.value)}
              style={{ fontSize: 11.5, padding: '4px 6px' }}
            >
              <option value="all">כל החברות</option>
              {insCoOptions.map((co) => (
                <option key={co} value={co}>
                  {co}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--t3)' }}>סטטוס:</span>
            <select
              className="fse"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ fontSize: 11.5, padding: '4px 6px' }}
            >
              <option value="all">כל הסטטוסים</option>
              {statusOptions.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          {/* Work Type */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--t3)' }}>סוג עבודה:</span>
            <select
              className="fse"
              value={filterWorkType}
              onChange={(e) => setFilterWorkType(e.target.value)}
              style={{ fontSize: 11.5, padding: '4px 6px' }}
            >
              <option value="all">כל הסוגים</option>
              {workTypeOptions.map((wt) => (
                <option key={wt} value={wt}>
                  {wt}
                </option>
              ))}
            </select>
          </div>

          {/* Free Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 'auto', flex: '1 1 180px' }}>
            <input
              type="text"
              className="fi"
              placeholder="חיפוש: רכב, לקוח, תביעה, הזמנה..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: '100%', fontSize: 11.5, padding: '5px 8px' }}
            />
          </div>

          {/* Reset Filters */}
          {(filterSource !== 'all' || filterInsCo !== 'all' || filterStatus !== 'all' || filterWorkType !== 'all' || searchTerm) && (
            <button
              type="button"
              className="btn btn-g btn-sm"
              onClick={() => {
                setFilterSource('all');
                setFilterInsCo('all');
                setFilterStatus('all');
                setFilterWorkType('all');
                setSearchTerm('');
              }}
              style={{ fontSize: 11 }}
            >
              נקה סינון
            </button>
          )}
        </div>
      </div>

      {/* 3. Operational KPIs Section (Cards are clickable for Drilldown) */}
      <div className="sdiv" style={{ marginBottom: 10 }}>
        <div className="sdiv-t">תמונת מצב תפעולית (לחץ על מדד לצפייה בפירוט)</div>
        <div className="sdiv-l" />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: 8,
          marginBottom: 16,
        }}
      >
        {/* Total Cases */}
        <div
          onClick={() => setDrillModal({ title: 'כל התיקים והעבודות בתקופה', rows: filteredRows })}
          data-testid="rep-kpi-total"
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--br2)',
            borderRadius: 'var(--r)',
            padding: '10px 12px',
            cursor: 'pointer',
            transition: 'border-color 0.15s',
          }}
          title="לחץ לפירוט מלא"
        >
          <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600 }}>סה״כ תיקים ועבודות</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--ac3)', marginTop: 2 }}>{kpis.total}</div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>{PERIOD_LABELS[period]}</div>
        </div>

        {/* Garage Works */}
        <div
          onClick={() => setDrillModal({ title: 'עבודות מוסך והזמנות עבודה', rows: filteredRows.filter((r) => r.kind === 'garage') })}
          data-testid="rep-kpi-garage"
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--br2)',
            borderRadius: 'var(--r)',
            padding: '10px 12px',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600 }}>עבודות מוסך</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--t)', marginTop: 2 }}>{kpis.garageCount}</div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>הזמנות שנפתחו</div>
        </div>

        {/* Insurance Claims */}
        <div
          onClick={() => setDrillModal({ title: 'תביעות ביטוח', rows: filteredRows.filter((r) => r.kind === 'insurance') })}
          data-testid="rep-kpi-insurance"
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--br2)',
            borderRadius: 'var(--r)',
            padding: '10px 12px',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600 }}>תביעות ביטוח</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#60a5fa', marginTop: 2 }}>{kpis.insuranceCount}</div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>תיקי ביטוח</div>
        </div>

        {/* Open Cases */}
        <div
          onClick={() => setDrillModal({ title: 'תיקים ועבודות פתוחות בטיפול', rows: filteredRows.filter((r) => !r.isClosed) })}
          data-testid="rep-kpi-open"
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--br2)',
            borderRadius: 'var(--r)',
            padding: '10px 12px',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600 }}>בטיפול פעיל</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--yn2)', marginTop: 2 }}>{kpis.openCount}</div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>עדיין פתוחים</div>
        </div>

        {/* Closed Cases */}
        <div
          onClick={() => setDrillModal({ title: 'עבודות ותביעות שהסתיימו / נסגרו', rows: filteredRows.filter((r) => r.isClosed) })}
          data-testid="rep-kpi-closed"
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--br2)',
            borderRadius: 'var(--r)',
            padding: '10px 12px',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600 }}>הסתיימו / נסגרו</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--gn2)', marginTop: 2 }}>{kpis.closedCount}</div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>הושלמו במלואן</div>
        </div>

        {/* Unique Clients */}
        <div
          onClick={() => setDrillModal({ title: 'לקוחות שנכנסו בתקופה', rows: filteredRows })}
          data-testid="rep-kpi-clients"
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--br2)',
            borderRadius: 'var(--r)',
            padding: '10px 12px',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600 }}>לקוחות ייחודיים</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--t)', marginTop: 2 }}>{kpis.uniqueClients}</div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>ללא כפילויות</div>
        </div>

        {/* Unique Vehicles */}
        <div
          onClick={() => setDrillModal({ title: 'רכבים שטופלו בתקופה', rows: filteredRows })}
          data-testid="rep-kpi-plates"
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--br2)',
            borderRadius: 'var(--r)',
            padding: '10px 12px',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600 }}>רכבים שטופלו</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--t)', marginTop: 2 }}>{kpis.uniquePlates}</div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>מספרי רישוי</div>
        </div>
      </div>

      {/* 4. Financial Overview Section */}
      <div className="sdiv" style={{ marginBottom: 10 }}>
        <div className="sdiv-t">מאזן כספי, חיובים ותשלומים (ללא כפילויות)</div>
        <div className="sdiv-l" />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 8,
          marginBottom: 18,
        }}
      >
        {/* Total Activity Amount */}
        <div
          onClick={() => setDrillModal({ title: 'כל הפעילות הכספית', rows: filteredRows })}
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--br2)',
            borderRadius: 'var(--r)',
            padding: '10px 12px',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600 }}>סך כל הפעילות</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t)', marginTop: 2 }}>{fmtCurrency(kpis.sumTotalActivity)}</div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>מוסך + ביטוח</div>
        </div>

        {/* Garage Work Amount */}
        <div
          onClick={() => setDrillModal({ title: 'הכנסות עבודות מוסך', rows: filteredRows.filter((r) => r.kind === 'garage') })}
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--br2)',
            borderRadius: 'var(--r)',
            padding: '10px 12px',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600 }}>עבודות מוסך</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t)', marginTop: 2 }}>{fmtCurrency(kpis.sumGarage)}</div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>סכום הזמנות</div>
        </div>

        {/* Insurance Claims Amount */}
        <div
          onClick={() => setDrillModal({ title: 'סכומי תביעות ביטוח', rows: filteredRows.filter((r) => r.kind === 'insurance') })}
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--br2)',
            borderRadius: 'var(--r)',
            padding: '10px 12px',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600 }}>תביעות ביטוח</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#60a5fa', marginTop: 2 }}>{fmtCurrency(kpis.sumIns)}</div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>דרישות תביעה</div>
        </div>

        {/* Quotes Amount */}
        <div
          onClick={() => setDrillModal({ title: 'הצעות מחיר שניתנו', rows: filteredRows.filter((r) => r.quoteAmount > 0) })}
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--br2)',
            borderRadius: 'var(--r)',
            padding: '10px 12px',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600 }}>הצעות מחיר</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t2)', marginTop: 2 }}>{fmtCurrency(kpis.sumQuote)}</div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>הצעות שנמסרו</div>
        </div>

        {/* Approved Amount */}
        <div
          onClick={() => setDrillModal({ title: 'סכומים שאושרו לתשלום', rows: filteredRows.filter((r) => r.approvedAmount > 0) })}
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--br2)',
            borderRadius: 'var(--r)',
            padding: '10px 12px',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600 }}>סכום שאושר</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--gn2)', marginTop: 2 }}>{fmtCurrency(kpis.sumApproved)}</div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>אישור ביטוח / לקוח</div>
        </div>

        {/* Received / Paid Amount */}
        <div
          onClick={() => setDrillModal({ title: 'תשלומים שהתקבלו בפועל', rows: filteredRows.filter((r) => r.paidAmount > 0) })}
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--br2)',
            borderRadius: 'var(--r)',
            padding: '10px 12px',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600 }}>התקבל בפועל</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--gn2)', marginTop: 2 }}>{fmtCurrency(kpis.sumPaid)}</div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>שולם במלואו/חלקי</div>
        </div>

        {/* Outstanding Debt */}
        <div
          onClick={() => setDrillModal({ title: 'יתרות חוב שטרם שולמו', rows: filteredRows.filter((r) => r.balanceDue > 0) })}
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--br2)',
            borderRadius: 'var(--r)',
            padding: '10px 12px',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600 }}>יתרת חוב פתוחה</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: kpis.sumBalance > 0 ? 'var(--rd2)' : 'var(--t3)', marginTop: 2 }}>
            {fmtCurrency(kpis.sumBalance)}
          </div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>ממתין לתשלום</div>
        </div>
      </div>

      {/* 5. Breakdown Sections (Referral Sources & Insurance Companies) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 12,
          marginBottom: 18,
        }}
      >
        {/* Source Breakdown Table */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--br2)', borderRadius: 'var(--r)', padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--t)', marginBottom: 8 }}>
            🎯 פילוח לפי מקור הגעה
          </div>
          <div className="tw" style={{ maxHeight: 220 }}>
            <table>
              <thead>
                <tr>
                  <th>מקור הגעה</th>
                  <th>כמות</th>
                  <th>סכום</th>
                  <th>חלק מהסך</th>
                </tr>
              </thead>
              <tbody>
                {sourceBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: 'var(--t3)', padding: 12 }}>
                      אין נתונים בתקופה זו
                    </td>
                  </tr>
                ) : (
                  sourceBreakdown.map(([src, d]) => (
                    <tr
                      key={src}
                      style={{ cursor: 'pointer' }}
                      onClick={() =>
                        setDrillModal({
                          title: `תיקים ממקור: ${src}`,
                          rows: filteredRows.filter((r) => r.referralSource === src),
                        })
                      }
                      title="לחץ לפירוט תיקים"
                    >
                      <td style={{ fontWeight: 600 }}>{src}</td>
                      <td>{d.count}</td>
                      <td>{fmtCurrency(d.sum)}</td>
                      <td style={{ color: 'var(--t3)', fontSize: 11 }}>
                        {kpis.total > 0 ? `${Math.round((d.count / kpis.total) * 100)}%` : '0%'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Insurance Companies Breakdown */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--br2)', borderRadius: 'var(--r)', padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--t)', marginBottom: 8 }}>
            🏢 פילוח מול חברות ביטוח
          </div>
          <div className="tw" style={{ maxHeight: 220 }}>
            <table>
              <thead>
                <tr>
                  <th>חברת ביטוח</th>
                  <th>תיקים</th>
                  <th>סכום מאושר</th>
                  <th>יתרה</th>
                </tr>
              </thead>
              <tbody>
                {insBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: 'var(--t3)', padding: 12 }}>
                      אין תביעות ביטוח בתקופה זו
                    </td>
                  </tr>
                ) : (
                  insBreakdown.map(([co, d]) => (
                    <tr
                      key={co}
                      style={{ cursor: 'pointer' }}
                      onClick={() =>
                        setDrillModal({
                          title: `תביעות ביטוח: ${co}`,
                          rows: filteredRows.filter((r) => r.insCompany === co),
                        })
                      }
                      title="לחץ לפירוט תביעות"
                    >
                      <td style={{ fontWeight: 600 }}>{co}</td>
                      <td>{d.count}</td>
                      <td style={{ color: 'var(--gn2)' }}>{fmtCurrency(d.approved)}</td>
                      <td style={{ color: d.balance > 0 ? 'var(--rd2)' : 'var(--t3)' }}>{fmtCurrency(d.balance)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 5b. Supplier invoices & quotes: purchase cost vs sale per claim */}
      <ClaimQuotesReportSection claims={claims} onOpenClaim={onOpenClaim} />

      {/* 6. Filtered Cases List Table / Mobile Cards */}
      <div className="sdiv" style={{ marginBottom: 10 }}>
        <div className="sdiv-t">
          רשימת כל התיקים והעבודות ({filteredRows.length})
        </div>
        <div className="sdiv-l" />
      </div>

      <div className="tw" style={{ width: '100%', marginBottom: 20 }}>
        <table>
          <thead>
            <tr>
              <th>סוג</th>
              <th>מספר תיק / הזמנה</th>
              <th>לקוח</th>
              <th>רכב</th>
              <th>מקור הגעה</th>
              <th>סוג עבודה</th>
              <th>סטטוס</th>
              <th>תאריך</th>
              <th>סכום</th>
              <th>שולם</th>
              <th>פעולה</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ textAlign: 'center', color: 'var(--t3)', padding: 24 }}>
                  לא נמצאו תיקים או עבודות העונים לתנאי הסינון
                </td>
              </tr>
            ) : (
              filteredRows.map((r) => (
                <tr key={`${r.kind}-${r.id}`} style={{ cursor: 'pointer' }} onClick={() => handleOpenRow(r)}>
                  <td>
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontSize: 10.5,
                        fontWeight: 700,
                        background: r.kind === 'garage' ? 'rgba(245,158,11,0.18)' : 'rgba(59,130,246,0.18)',
                        color: r.kind === 'garage' ? '#f59e0b' : '#60a5fa',
                      }}
                    >
                      {r.kind === 'garage' ? 'מוסך' : 'ביטוח'}
                    </span>
                  </td>
                  <td style={{ fontWeight: 800, color: 'var(--ac3)', fontSize: 11 }}>{r.caseNum}</td>
                  <td style={{ fontWeight: 600 }}>{r.clientName}</td>
                  <td dir="ltr" style={{ textAlign: 'right', fontSize: 11 }}>{r.plate}</td>
                  <td style={{ fontSize: 11, color: 'var(--t2)' }}>{r.referralSource}</td>
                  <td style={{ fontSize: 11 }}>{r.workType}</td>
                  <td>
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontSize: 10.5,
                        fontWeight: 600,
                        background: r.isClosed ? 'rgba(100,116,139,0.18)' : 'rgba(34,197,94,0.18)',
                        color: r.isClosed ? '#94a3b8' : 'var(--gn2)',
                      }}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--t3)' }}>{r.dateStr}</td>
                  <td style={{ fontWeight: 700 }}>{fmtCurrency(r.approvedAmount || r.quoteAmount)}</td>
                  <td style={{ color: 'var(--gn2)', fontSize: 11 }}>{fmtCurrency(r.paidAmount)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="btn btn-g btn-sm"
                      onClick={() => handleOpenRow(r)}
                      style={{ fontSize: 11, padding: '3px 8px' }}
                    >
                      פתח
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 7. Drilldown Modal (Native Claims Modal Layout) */}
      {drillModal && (
        <div
          className="ov open"
          style={{ zIndex: 9999 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setDrillModal(null);
          }}
        >
          <div className="modal" style={{ maxWidth: 880, width: '95vw', maxHeight: '88vh' }}>
            <div className="mh">
              <div className="mh-t" style={{ fontSize: 15, fontWeight: 800 }}>
                📋 {drillModal.title} ({drillModal.rows.length} רשומות)
              </div>
              <button type="button" className="mcl" onClick={() => setDrillModal(null)}>
                ✕
              </button>
            </div>
            <div className="mb" style={{ overflowY: 'auto', padding: 12 }}>
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th>סוג</th>
                      <th>מספר</th>
                      <th>לקוח</th>
                      <th>רכב</th>
                      <th>מקור</th>
                      <th>סטטוס</th>
                      <th>סכום</th>
                      <th>פעולה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drillModal.rows.map((r) => (
                      <tr key={`drill-${r.kind}-${r.id}`}>
                        <td>
                          <span
                            style={{
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontSize: 10,
                              fontWeight: 700,
                              background: r.kind === 'garage' ? 'rgba(245,158,11,0.18)' : 'rgba(59,130,246,0.18)',
                              color: r.kind === 'garage' ? '#f59e0b' : '#60a5fa',
                            }}
                          >
                            {r.kind === 'garage' ? 'מוסך' : 'ביטוח'}
                          </span>
                        </td>
                        <td style={{ fontWeight: 800, color: 'var(--ac3)', fontSize: 11 }}>{r.caseNum}</td>
                        <td style={{ fontWeight: 600 }}>{r.clientName}</td>
                        <td dir="ltr" style={{ textAlign: 'right', fontSize: 11 }}>{r.plate}</td>
                        <td style={{ fontSize: 11, color: 'var(--t3)' }}>{r.referralSource}</td>
                        <td style={{ fontSize: 11 }}>{r.status}</td>
                        <td style={{ fontWeight: 700 }}>{fmtCurrency(r.approvedAmount || r.quoteAmount)}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-p btn-sm"
                            onClick={() => {
                              setDrillModal(null);
                              handleOpenRow(r);
                            }}
                            style={{ fontSize: 11, padding: '3px 8px' }}
                          >
                            צפה בתיק
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
