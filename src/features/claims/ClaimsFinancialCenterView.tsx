// src/features/claims/ClaimsFinancialCenterView.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ClaimRecord } from './claimsConstants';
import {
  type ClaimFinancialRow,
  type InsurerSummaryRow,
  type KpiCardData,
  type FinancialCenterFilters,
  buildClaimFinancialRow,
  compute15FinancialKpis,
  computeInsurersSummary,
  filterFinancialRows,
  exportFinancialToCsv,
  formatCurrencyOrMissing,
  formatCurrencyDetailed,
  translateDeductionCategory,
} from './claimFinancialReportsCenterModel';
import { computeTotals } from './claimQuoteModel';
import './claim-financial-center.css';

export interface ClaimsFinancialCenterViewProps {
  claims: ClaimRecord[];
  onOpenClaim: (id: string) => void;
  onBack: () => void;
  onOpenAiReports?: () => void;
}

type SubTabKind = 'insurers' | 'debts' | 'payments' | 'traceability';
type DebtSortKind = 'debt_desc' | 'aging_desc' | 'insurer';

export default function ClaimsFinancialCenterView({
  claims,
  onOpenClaim,
  onBack,
  onOpenAiReports,
}: ClaimsFinancialCenterViewProps) {
  // 1. Loading & Database State
  const [dbQuotes, setDbQuotes] = useState<Map<string, { totalAmount: number; version: number }>>(new Map());
  const [dbClaimsRows, setDbClaimsRows] = useState<Map<string, Record<string, unknown>>>(new Map());
  const [loadingData, setLoadingData] = useState<boolean>(true);

  // 2. Filters
  const [filters, setFilters] = useState<FinancialCenterFilters>({
    searchTerm: '',
    insurer: 'all',
    period: 'all',
    customFrom: '',
    customTo: '',
    dateBasis: 'created',
    statusKind: 'all',
  });

  // 3. Sub-tabs & Sorting
  const [activeSubTab, setActiveSubTab] = useState<SubTabKind>('insurers');
  const [debtSort, setDebtSort] = useState<DebtSortKind>('debt_desc');

  // 4. Drilldown Modal State
  const [drilldownModal, setDrilldownModal] = useState<{
    title: string;
    description: string;
    rows: ClaimFinancialRow[];
  } | null>(null);

  // 5. Fetch enriched data (quotes & latest full claims_records with row_data)
  useEffect(() => {
    let active = true;

    async function loadEnrichedData() {
      try {
        setLoadingData(true);

        // Fetch quotes
        const { data: quotesData } = await supabase
          .from('claim_quotes' as never)
          .select('id, claim_id, quote_no, version, updated_at, data');

        const qMap = new Map<string, { totalAmount: number; version: number }>();
        if (quotesData && Array.isArray(quotesData)) {
          for (const q of quotesData as any[]) {
            if (!q.claim_id) continue;
            let total = 0;
            if (q.data) {
              try {
                const totals = computeTotals(q.data);
                total = totals.saleTotalCustomer || 0;
              } catch {
                total = 0;
              }
            }
            // Keep the latest or highest version
            const existing = qMap.get(q.claim_id);
            if (!existing || (q.version || 0) >= existing.version) {
              qMap.set(q.claim_id, { totalAmount: total, version: q.version || 1 });
            }
          }
        }

        // Fetch claims_records for rich row_data (audits, comparisons)
        const { data: recordsData } = await supabase
          .from('claims_records' as never)
          .select('id, plate, client_name, status, row_data, created_at, updated_at');

        const cMap = new Map<string, Record<string, unknown>>();
        if (recordsData && Array.isArray(recordsData)) {
          for (const r of recordsData as any[]) {
            cMap.set(r.id, r);
          }
        }

        if (active) {
          setDbQuotes(qMap);
          setDbClaimsRows(cMap);
        }
      } catch (err) {
        console.warn('FinancialCenter: Error loading enriched data:', err);
      } finally {
        if (active) setLoadingData(false);
      }
    }

    loadEnrichedData();
    return () => {
      active = false;
    };
  }, []);

  // 6. Build All Authoritative Financial Rows
  const allFinancialRows = useMemo<ClaimFinancialRow[]>(() => {
    // Merge claims prop with enriched db claims
    const seen = new Set<string>();
    const rows: ClaimFinancialRow[] = [];

    // First use db claims if loaded, else fallback to prop
    const sourceList = dbClaimsRows.size > 0 ? Array.from(dbClaimsRows.values()) : claims;

    for (const c of sourceList) {
      const id = String((c as any).id || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);

      const quote = dbQuotes.get(id) || null;
      const finRow = buildClaimFinancialRow(c, quote);
      rows.push(finRow);
    }

    // Add any claims in props not found in db query
    for (const c of claims) {
      if (!c.id || seen.has(c.id)) continue;
      seen.add(c.id);
      const quote = dbQuotes.get(c.id) || null;
      rows.push(buildClaimFinancialRow(c, quote));
    }

    return rows;
  }, [claims, dbClaimsRows, dbQuotes]);

  // 7. Filtered rows
  const filteredRows = useMemo<ClaimFinancialRow[]>(() => {
    return filterFinancialRows(allFinancialRows, filters);
  }, [allFinancialRows, filters]);

  // 8. 15 KPI Cards calculation
  const kpis = useMemo<KpiCardData[]>(() => {
    return compute15FinancialKpis(filteredRows);
  }, [filteredRows]);

  // 9. Insurers Summary
  const insurersSummary = useMemo<InsurerSummaryRow[]>(() => {
    return computeInsurersSummary(filteredRows);
  }, [filteredRows]);

  // 10. Distinct Insurers list for filter dropdown
  const insurerFilterOptions = useMemo<Array<{ name: string; count: number }>>(() => {
    const counts = new Map<string, number>();
    for (const r of allFinancialRows) {
      counts.set(r.insCompany, (counts.get(r.insCompany) || 0) + 1);
    }
    const list: Array<{ name: string; count: number }> = [];
    for (const [name, count] of counts.entries()) {
      list.push({ name, count });
    }
    return list.sort((a, b) => b.count - a.count);
  }, [allFinancialRows]);

  // 11. Debts Ledger Rows (sorted)
  const debtsRows = useMemo<ClaimFinancialRow[]>(() => {
    const list = filteredRows.filter((r) => r.debtAmount !== null && r.debtAmount > 0);
    return list.sort((a, b) => {
      if (debtSort === 'debt_desc') {
        return (b.debtAmount || 0) - (a.debtAmount || 0);
      }
      if (debtSort === 'aging_desc') {
        return (b.agingDays || 0) - (a.agingDays || 0);
      }
      if (debtSort === 'insurer') {
        return a.insCompany.localeCompare(b.insCompany, 'he');
      }
      return 0;
    });
  }, [filteredRows, debtSort]);

  // 12. Payments Ledger Rows (chronological)
  const paymentsRows = useMemo<ClaimFinancialRow[]>(() => {
    return filteredRows.filter((r) => (r.paidAmount !== null && r.paidAmount > 0) || (r.deductionsAmount !== null && r.deductionsAmount > 0));
  }, [filteredRows]);

  // 13. Handle KPI Click Drilldown
  const handleKpiClick = useCallback((kpi: KpiCardData) => {
    let matching: ClaimFinancialRow[] = [];
    let desc = '';

    switch (kpi.drilldownKey) {
      case 'demands':
        matching = filteredRows.filter((r) => r.demandAmount !== null && r.demandAmount > 0);
        desc = 'רשימת כל התיקים עם סכום תביעה או דרישה כספית';
        break;
      case 'quotes':
        matching = filteredRows.filter((r) => r.quoteAmount !== null && r.quoteAmount > 0);
        desc = 'רשימת כל התיקים שבהם קיימת הצעת מחיר שמורה';
        break;
      case 'surveyors':
        matching = filteredRows.filter((r) => r.surveyorAmount !== null && r.surveyorAmount > 0);
        desc = 'רשימת כל התיקים עם דוח שומה / שמאי מאומת';
        break;
      case 'demands_insurers':
        matching = filteredRows.filter((r) => r.demandAmount !== null && r.demandAmount > 0 && r.insCompany !== 'ללא חברה');
        desc = 'רשימת תביעות עם דרישות פעילות מול חברות ביטוח';
        break;
      case 'approved':
        matching = filteredRows.filter((r) => r.approvedAmount !== null && r.approvedAmount > 0);
        desc = 'רשימת תיקים שבהם אושר סכום לפי דוח שמאי נגדי או אישור מבטחת';
        break;
      case 'paid':
        matching = filteredRows.filter((r) => r.paidAmount !== null && r.paidAmount > 0);
        desc = 'רשימת תיקים שבהם התקבל תשלום בפועל או הודעת סילוק';
        break;
      case 'open_debt':
        matching = filteredRows.filter((r) => r.debtAmount !== null && r.debtAmount > 0);
        desc = 'רשימת כל התיקים עם יתרת חוב פתוחה לגבייה';
        break;
      case 'deductions':
        matching = filteredRows.filter((r) => r.deductionsAmount !== null && r.deductionsAmount > 0);
        desc = 'רשימת תיקים שבהם בוצעו קיזוזים (השתתפות עצמית, כינון, בלאי, הפחתות)';
        break;
      case 'disputed':
        matching = filteredRows.filter((r) => r.disputedAmount !== null && r.disputedAmount > 0);
        desc = 'רשימת תיקים עם פער כספי במחלוקת מול חברת הביטוח';
        break;
      case 'legal':
        matching = filteredRows.filter((r) => r.isLegal);
        desc = 'רשימת תיקים הנמצאים בטיפול או ייצוג משפטי';
        break;
      case 'open_claims':
        matching = filteredRows.filter((r) => !r.isClosed);
        desc = 'רשימת התיקים הפתוחים הפעילים במערכת';
        break;
      case 'fully_paid':
        matching = filteredRows.filter((r) => r.paymentStatus === 'full');
        desc = 'תיקים ששולמו במלואם';
        break;
      case 'partially_paid':
        matching = filteredRows.filter((r) => r.paymentStatus === 'partial');
        desc = 'תיקים ששולמו חלקית וממתינים להשלמת יתרה';
        break;
      case 'unpaid':
        matching = filteredRows.filter((r) => r.paymentStatus === 'unpaid');
        desc = 'תיקים עם דרישה כספית שטרם התקבל בהם כל תשלום';
        break;
      case 'pending_verification':
        matching = filteredRows.filter((r) => r.hasUnverifiedWarning);
        desc = 'תיקים שבהם הנתונים הכספיים דורשים אימות או בדיקת מסמך';
        break;
      default:
        matching = filteredRows;
        desc = 'רשימת תיקים תואמת';
        break;
    }

    setDrilldownModal({
      title: `${kpi.title} (${matching.length})`,
      description: desc,
      rows: matching,
    });
  }, [filteredRows]);

  // 14. Insurer Drilldown Click
  const handleInsurerDrilldown = useCallback((insName: string) => {
    const matching = filteredRows.filter((r) => r.insCompany === insName);
    setDrilldownModal({
      title: `פירוט תיקים — ${insName} (${matching.length})`,
      description: `כל תיקי התביעות המשויכים למבטחת ${insName}`,
      rows: matching,
    });
  }, [filteredRows]);

  // 15. Export CSV
  const handleExportCsv = useCallback(() => {
    const csvContent = exportFinancialToCsv(filteredRows, kpis, insurersSummary);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `dalia-financial-report-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [filteredRows, kpis, insurersSummary]);

  // 16. Print Report
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <div className="cfc-container" data-testid="claims-financial-center">
      {/* 1. Header Bar */}
      <header className="cfc-header">
        <div className="cfc-header-info">
          <h2 className="cfc-header-title">
            <span> מרכז דוחות כספיים – תביעות וביטוח</span>
            <span className="cfc-badge-pill" data-testid="cfc-realtime-badge">
              ● זמן אמת
            </span>
            {loadingData && <span style={{ fontSize: 11, color: 'var(--t3)' }}>טוען נתונים מועשרים...</span>}
          </h2>
          <p className="cfc-header-sub">
            תמונת מצב כספית מקיפה: דרישות, שומות, אישורי מבטחות, תקבולים, קיזוזים מנומקים ויתרות חוב פתוחות לגבייה.
          </p>
        </div>

        <div className="cfc-header-actions">
          {onOpenAiReports && (
            <button
              type="button"
              className="btn btn-g btn-sm"
              onClick={onOpenAiReports}
              style={{ fontWeight: 700, borderColor: 'var(--ac)' }}
              title="פתיחת עוזר דוחות כספיים AI"
              data-testid="cfc-ai-btn"
            >
              <span>✨</span> דליה AI מאזן
            </button>
          )}

          <button
            type="button"
            className="btn btn-g btn-sm"
            onClick={handleExportCsv}
            title="ייצוא כל הדוחות והנתונים לקובץ Excel CSV תואם עברית"
            data-testid="cfc-export-csv-btn"
          >
            <span>📊</span> ייצוא לאקסל
          </button>

          <button
            type="button"
            className="btn btn-g btn-sm"
            onClick={handlePrint}
            title="הדפסת דוח מנהלים או שמירה כ-PDF"
            data-testid="cfc-print-btn"
          >
            <span>🖨️</span> הדפסה / PDF
          </button>

          <button
            type="button"
            className="btn btn-g btn-sm"
            onClick={onBack}
            style={{ fontWeight: 600 }}
            data-testid="cfc-back-btn"
          >
            ← חזרה לתיקים
          </button>
        </div>
      </header>

      {/* 2. Advanced Filters Bar */}
      <section className="cfc-filter-bar" data-testid="cfc-filters-bar">
        {/* Row 1: Search, Insurer, Period, Date Basis */}
        <div className="cfc-filter-row">
          <input
            type="search"
            className="cfc-search-input"
            placeholder="חיפוש לפי לקוח, מספר רכב, חברת ביטוח, מספר תביעה או תיק..."
            value={filters.searchTerm}
            onChange={(e) => setFilters((prev) => ({ ...prev, searchTerm: e.target.value }))}
            data-testid="cfc-search-input"
          />

          <select
            className="cfc-select"
            value={filters.insurer}
            onChange={(e) => setFilters((prev) => ({ ...prev, insurer: e.target.value }))}
            data-testid="cfc-insurer-select"
          >
            <option value="all">כל חברות הביטוח ({allFinancialRows.length})</option>
            {insurerFilterOptions.map((opt) => (
              <option key={opt.name} value={opt.name}>
                {opt.name} ({opt.count})
              </option>
            ))}
          </select>

          <select
            className="cfc-select"
            value={filters.period}
            onChange={(e) => setFilters((prev) => ({ ...prev, period: e.target.value as any }))}
            data-testid="cfc-period-select"
          >
            <option value="all">כל התקופות</option>
            <option value="this_month">החודש הנוכחי</option>
            <option value="last_month">החודש שעבר</option>
            <option value="quarter">רבעון נוכחי</option>
            <option value="year">השנה הנוכחית</option>
            <option value="custom">טווח תאריכים מותאם...</option>
          </select>

          <select
            className="cfc-select"
            value={filters.dateBasis}
            onChange={(e) => setFilters((prev) => ({ ...prev, dateBasis: e.target.value as any }))}
            title="בסיס תאריך לסינון"
            data-testid="cfc-date-basis-select"
          >
            <option value="created">לפי תאריך פתיחה</option>
            <option value="demand">לפי תאריך דרישה / אירוע</option>
            <option value="payment">לפי תאריך תשלום</option>
          </select>

          {filters.period === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="date"
                className="cfc-select"
                value={filters.customFrom}
                onChange={(e) => setFilters((prev) => ({ ...prev, customFrom: e.target.value }))}
                data-testid="cfc-custom-from"
              />
              <span>עד</span>
              <input
                type="date"
                className="cfc-select"
                value={filters.customTo}
                onChange={(e) => setFilters((prev) => ({ ...prev, customTo: e.target.value }))}
                data-testid="cfc-custom-to"
              />
            </div>
          )}
        </div>

        {/* Row 2: Status Quick Filter Pills */}
        <div className="cfc-filter-pills" data-testid="cfc-status-pills">
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', marginLeft: 4 }}>סינון מהיר:</span>
          {[
            { id: 'all', label: 'הכל' },
            { id: 'open_debt', label: '⚖️ יתרת חוב פתוחה' },
            { id: 'fully_paid', label: '🏁 שולם במלואו' },
            { id: 'partially_paid', label: '⏳ שולם חלקית' },
            { id: 'unpaid', label: '🛑 טרם שולם' },
            { id: 'disputed', label: '⚡ במחלוקת' },
            { id: 'legal', label: '⚖️ תיקים משפטיים' },
            { id: 'pending_verification', label: '🛡️ דורש אימות' },
          ].map((pill) => (
            <button
              key={pill.id}
              type="button"
              className={`cfc-filter-pill ${filters.statusKind === pill.id ? 'active' : ''}`}
              onClick={() => setFilters((prev) => ({ ...prev, statusKind: pill.id as any }))}
              data-testid={`cfc-status-pill-${pill.id}`}
            >
              {pill.label}
            </button>
          ))}
          {(filters.searchTerm || filters.insurer !== 'all' || filters.statusKind !== 'all' || filters.period !== 'all') && (
            <button
              type="button"
              className="btn btn-g btn-sm"
              style={{ fontSize: 11, padding: '2px 8px', marginRight: 'auto' }}
              onClick={() =>
                setFilters({
                  searchTerm: '',
                  insurer: 'all',
                  period: 'all',
                  customFrom: '',
                  customTo: '',
                  dateBasis: 'created',
                  statusKind: 'all',
                })
              }
              data-testid="cfc-reset-filters-btn"
            >
              איפוס סינונים
            </button>
          )}
        </div>
      </section>

      {/* 3. Primary Dashboard: 15 Real-Time KPI Cards */}
      <section className="cfc-kpi-grid" data-testid="cfc-15-kpis-grid">
        {kpis.map((kpi) => (
          <div
            key={kpi.id}
            className="cfc-kpi-card"
            data-testid={`cfc-kpi-${kpi.id}`}
            onClick={() => handleKpiClick(kpi)}
            title="לחץ לצפייה ברשימת התיקים המתאימים (Drilldown)"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && handleKpiClick(kpi)}
          >
            <div className="cfc-kpi-card-head">
              <span className="cfc-kpi-card-title">
                <span className="cfc-kpi-card-icon">{kpi.icon}</span>
                {kpi.title}
              </span>
              <span style={{ fontSize: 10, color: 'var(--t3)' }}>🔍 פירוט</span>
            </div>

            <div className={`cfc-kpi-card-value ${kpi.tone}`}>{kpi.valueText}</div>

            <div className="cfc-kpi-card-sub">{kpi.subtext}</div>
          </div>
        ))}
      </section>

      {/* 4. Sub-Tab Navigation Bar */}
      <nav className="cfc-nav-tabs" data-testid="cfc-sub-tabs">
        <button
          type="button"
          className={`cfc-tab-btn ${activeSubTab === 'insurers' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('insurers')}
          data-testid="cfc-tab-insurers"
        >
          <span>🏢 סיכומים לפי חברות ביטוח</span>
          <span className="cfc-tab-count">{insurersSummary.length}</span>
        </button>

        <button
          type="button"
          className={`cfc-tab-btn ${activeSubTab === 'debts' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('debts')}
          data-testid="cfc-tab-debts"
        >
          <span>⚖️ דוח חובות וגבייה (Aging)</span>
          <span className="cfc-tab-count">{debtsRows.length}</span>
        </button>

        <button
          type="button"
          className={`cfc-tab-btn ${activeSubTab === 'payments' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('payments')}
          data-testid="cfc-tab-payments"
        >
          <span>💳 דוח תשלומים וקיזוזים</span>
          <span className="cfc-tab-count">{paymentsRows.length}</span>
        </button>

        <button
          type="button"
          className={`cfc-tab-btn ${activeSubTab === 'traceability' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('traceability')}
          data-testid="cfc-tab-traceability"
        >
          <span>🔍 מעקב מקורות כספיים ואימות</span>
          <span className="cfc-tab-count">{filteredRows.length}</span>
        </button>
      </nav>

      {/* 5. Sub-Tab Contents */}

      {/* Tab 1: Insurers Breakdown Table */}
      {activeSubTab === 'insurers' && (
        <div className="cfc-table-card" data-testid="cfc-insurers-table-card">
          <div className="cfc-table-header-bar">
            <div>
              <b style={{ fontSize: 14 }}>סיכומי תיקים, דרישות ותקבולים לפי חברת ביטוח</b>
              <div style={{ fontSize: 12, color: 'var(--t2)' }}>
                לחץ על שם חברה לסינון או על "פירוט תיקים" לצפייה ברשימת התיקים המלאה
              </div>
            </div>
          </div>

          <div className="cfc-table-responsive">
            <table className="cfc-table" data-testid="cfc-insurers-table">
              <thead>
                <tr>
                  <th>חברת ביטוח</th>
                  <th>סה"כ תיקים</th>
                  <th>תיקים פתוחים</th>
                  <th>סך דרישות</th>
                  <th>סכום שאושר</th>
                  <th>שולם בפועל</th>
                  <th>קיזוזים</th>
                  <th>במחלוקת</th>
                  <th>יתרת חוב לגבייה</th>
                  <th>טרם שולמו</th>
                  <th>משפטי</th>
                  <th>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {insurersSummary.length === 0 ? (
                  <tr>
                    <td colSpan={12} style={{ textAlign: 'center', padding: 24, color: 'var(--t2)' }}>
                      לא נמצאו נתונים התואמים את הסינון הנוכחי.
                    </td>
                  </tr>
                ) : (
                  insurersSummary.map((ins) => (
                    <tr key={ins.insurerName} data-testid={`cfc-insurer-row-${ins.insurerName}`}>
                      <td>
                        <button
                          type="button"
                          className="btn btn-g btn-sm"
                          style={{ fontWeight: 800, padding: '2px 8px' }}
                          onClick={() => setFilters((prev) => ({ ...prev, insurer: ins.insurerName }))}
                          title={`סנן את כל המרכז לפי ${ins.insurerName}`}
                        >
                          {ins.insurerName}
                        </button>
                      </td>
                      <td>{ins.claimsCount}</td>
                      <td>{ins.openClaimsCount}</td>
                      <td>{ins.totalDemanded > 0 ? formatCurrencyOrMissing(ins.totalDemanded) : 'אין נתון'}</td>
                      <td>{ins.totalApproved > 0 ? formatCurrencyOrMissing(ins.totalApproved) : 'טרם אומת'}</td>
                      <td style={{ color: ins.totalPaid > 0 ? '#16a34a' : 'inherit', fontWeight: 600 }}>
                        {ins.totalPaid > 0 ? formatCurrencyOrMissing(ins.totalPaid) : '₪0'}
                      </td>
                      <td style={{ color: ins.totalDeductions > 0 ? '#d97706' : 'inherit' }}>
                        {ins.totalDeductions > 0 ? formatCurrencyOrMissing(ins.totalDeductions) : '₪0'}
                      </td>
                      <td style={{ color: ins.totalDisputed > 0 ? '#b45309' : 'inherit' }}>
                        {ins.totalDisputed > 0 ? formatCurrencyOrMissing(ins.totalDisputed) : '₪0'}
                      </td>
                      <td style={{ color: ins.totalDebt > 0 ? '#dc2626' : 'inherit', fontWeight: 700 }}>
                        {ins.totalDebt > 0 ? formatCurrencyOrMissing(ins.totalDebt) : '₪0'}
                      </td>
                      <td>{ins.unpaidClaimsCount}</td>
                      <td>{ins.legalClaimsCount}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-p btn-sm"
                          style={{ fontSize: 11, padding: '2px 8px' }}
                          onClick={() => handleInsurerDrilldown(ins.insurerName)}
                          data-testid={`cfc-drill-insurer-${ins.insurerName}`}
                        >
                          פירוט תיקים ({ins.claimsCount})
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {insurersSummary.length > 0 && (
                <tfoot>
                  <tr>
                    <td>סה"כ כללי</td>
                    <td>{insurersSummary.reduce((acc, c) => acc + c.claimsCount, 0)}</td>
                    <td>{insurersSummary.reduce((acc, c) => acc + c.openClaimsCount, 0)}</td>
                    <td>{formatCurrencyOrMissing(insurersSummary.reduce((acc, c) => acc + c.totalDemanded, 0))}</td>
                    <td>{formatCurrencyOrMissing(insurersSummary.reduce((acc, c) => acc + c.totalApproved, 0))}</td>
                    <td>{formatCurrencyOrMissing(insurersSummary.reduce((acc, c) => acc + c.totalPaid, 0))}</td>
                    <td>{formatCurrencyOrMissing(insurersSummary.reduce((acc, c) => acc + c.totalDeductions, 0))}</td>
                    <td>{formatCurrencyOrMissing(insurersSummary.reduce((acc, c) => acc + c.totalDisputed, 0))}</td>
                    <td style={{ color: '#dc2626' }}>
                      {formatCurrencyOrMissing(insurersSummary.reduce((acc, c) => acc + c.totalDebt, 0))}
                    </td>
                    <td>{insurersSummary.reduce((acc, c) => acc + c.unpaidClaimsCount, 0)}</td>
                    <td>{insurersSummary.reduce((acc, c) => acc + c.legalClaimsCount, 0)}</td>
                    <td>—</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Debts & Aging Table */}
      {activeSubTab === 'debts' && (
        <div className="cfc-table-card" data-testid="cfc-debts-table-card">
          <div className="cfc-table-header-bar">
            <div>
              <b style={{ fontSize: 14 }}>דוח חובות פתוחים וגיל חוב (Aging) לגבייה</b>
              <div style={{ fontSize: 12, color: 'var(--t2)' }}>
                {debtsRows.length} תיקים עם יתרת חוב פתוחה לגבייה · סה"כ חוב:{' '}
                {formatCurrencyOrMissing(debtsRows.reduce((acc, r) => acc + (r.debtAmount || 0), 0))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>מיון לפי:</span>
              <button
                type="button"
                className={`btn btn-sm ${debtSort === 'debt_desc' ? 'btn-p' : 'btn-g'}`}
                onClick={() => setDebtSort('debt_desc')}
                data-testid="cfc-sort-debt"
              >
                חוב גבוה לנמוך
              </button>
              <button
                type="button"
                className={`btn btn-sm ${debtSort === 'aging_desc' ? 'btn-p' : 'btn-g'}`}
                onClick={() => setDebtSort('aging_desc')}
                data-testid="cfc-sort-aging"
              >
                גיל חוב (ישן לחדש)
              </button>
              <button
                type="button"
                className={`btn btn-sm ${debtSort === 'insurer' ? 'btn-p' : 'btn-g'}`}
                onClick={() => setDebtSort('insurer')}
                data-testid="cfc-sort-insurer"
              >
                חברת ביטוח
              </button>
            </div>
          </div>

          <div className="cfc-table-responsive">
            <table className="cfc-table" data-testid="cfc-debts-table">
              <thead>
                <tr>
                  <th>מספר תיק</th>
                  <th>רכב</th>
                  <th>לקוח</th>
                  <th>חברת ביטוח</th>
                  <th>תאריך דרישה</th>
                  <th>גיל החוב (ימים)</th>
                  <th>סכום דרישה</th>
                  <th>אושר</th>
                  <th>שולם בפועל</th>
                  <th>יתרת חוב</th>
                  <th>מצב</th>
                  <th>פעולה</th>
                </tr>
              </thead>
              <tbody>
                {debtsRows.length === 0 ? (
                  <tr>
                    <td colSpan={12} style={{ textAlign: 'center', padding: 24, color: 'var(--t2)' }}>
                      🎉 אין חובות פתוחים התואמים את הסינון הנוכחי.
                    </td>
                  </tr>
                ) : (
                  debtsRows.map((r) => {
                    let agingClass = 'cfc-aging-0-30';
                    if (r.agingBucket === '31-60') agingClass = 'cfc-aging-31-60';
                    else if (r.agingBucket === '61-90') agingClass = 'cfc-aging-61-90';
                    else if (r.agingBucket === '90+') agingClass = 'cfc-aging-90-plus';

                    return (
                      <tr key={r.claimId} data-testid={`cfc-debt-row-${r.claimId}`}>
                        <td style={{ fontWeight: 700 }}>{r.claimId}</td>
                        <td style={{ direction: 'ltr', textAlign: 'right' }}>{r.plate}</td>
                        <td>{r.clientName}</td>
                        <td>
                          <span className="cfc-badge-pill">{r.insCompany}</span>
                        </td>
                        <td>{r.demandDateStr || r.createdAtStr || '—'}</td>
                        <td>
                          {r.agingDays !== null ? (
                            <span className={`cfc-aging-badge ${agingClass}`}>
                              {r.agingDays} ימים ({r.agingBucket})
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>{formatCurrencyOrMissing(r.demandAmount)}</td>
                        <td>{formatCurrencyOrMissing(r.approvedAmount, 'טרם אומת')}</td>
                        <td>{formatCurrencyOrMissing(r.paidAmount, '₪0')}</td>
                        <td style={{ fontWeight: 800, color: '#dc2626' }}>{formatCurrencyOrMissing(r.debtAmount)}</td>
                        <td>
                          {r.isLegal ? (
                            <span className="cfc-aging-badge cfc-aging-90-plus">משפטי</span>
                          ) : r.paymentStatus === 'partial' ? (
                            <span className="cfc-status-badge cfc-status-partial">שולם חלקי</span>
                          ) : (
                            <span className="cfc-status-badge cfc-status-unpaid">טרם שולם</span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-p btn-sm"
                            style={{ fontSize: 11, padding: '3px 8px' }}
                            onClick={() => onOpenClaim(r.claimId)}
                            data-testid={`cfc-open-debt-claim-${r.claimId}`}
                          >
                            פתח כרטיס תיק
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Payments & Deductions Table */}
      {activeSubTab === 'payments' && (
        <div className="cfc-table-card" data-testid="cfc-payments-table-card">
          <div className="cfc-table-header-bar">
            <div>
              <b style={{ fontSize: 14 }}>דוח תשלומים בפועל, קיזוזים והפחתות מנומקות</b>
              <div style={{ fontSize: 12, color: 'var(--t2)' }}>
                מעקב כרונולוגי אחר סכומי כסף שהתקבלו, מועדי תשלום ונימוקי הפחתה של חברות הביטוח
              </div>
            </div>
          </div>

          <div className="cfc-table-responsive">
            <table className="cfc-table" data-testid="cfc-payments-table">
              <thead>
                <tr>
                  <th>תאריך תשלום</th>
                  <th>תיק / רכב</th>
                  <th>לקוח</th>
                  <th>חברת ביטוח</th>
                  <th>מצב תשלום</th>
                  <th>סכום דרישה</th>
                  <th>שולם בפועל</th>
                  <th>סך קיזוז</th>
                  <th>פירוט קיזוזים ונימוקים</th>
                  <th>יתרה שנותרה</th>
                  <th>פעולה</th>
                </tr>
              </thead>
              <tbody>
                {paymentsRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', padding: 24, color: 'var(--t2)' }}>
                      לא נמצאו תשלומים או קיזוזים התואמים את הסינון הנוכחי.
                    </td>
                  </tr>
                ) : (
                  paymentsRows.map((r) => (
                    <tr key={r.claimId} data-testid={`cfc-payment-row-${r.claimId}`}>
                      <td>{r.lastPaymentDateStr || r.demandDateStr || '—'}</td>
                      <td>
                        <b>{r.claimId}</b>
                        <div style={{ fontSize: 11, color: 'var(--t3)', direction: 'ltr', textAlign: 'right' }}>
                          {r.plate}
                        </div>
                      </td>
                      <td>{r.clientName}</td>
                      <td>{r.insCompany}</td>
                      <td>
                        {r.paymentStatus === 'full' ? (
                          <span className="cfc-status-badge cfc-status-full">שולם מלא</span>
                        ) : r.paymentStatus === 'partial' ? (
                          <span className="cfc-status-badge cfc-status-partial">שולם חלקי</span>
                        ) : (
                          <span className="cfc-status-badge cfc-status-unpaid">קיזוז ללא תשלום</span>
                        )}
                      </td>
                      <td>{formatCurrencyOrMissing(r.demandAmount)}</td>
                      <td style={{ fontWeight: 800, color: '#16a34a' }}>{formatCurrencyOrMissing(r.paidAmount)}</td>
                      <td style={{ fontWeight: 700, color: r.deductionsAmount ? '#d97706' : 'inherit' }}>
                        {formatCurrencyOrMissing(r.deductionsAmount, '₪0')}
                      </td>
                      <td>
                        {r.deductionsList.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 300 }}>
                            {r.deductionsList.map((d, idx) => (
                              <div
                                key={idx}
                                style={{
                                  fontSize: 11,
                                  background: '#fffbeb',
                                  border: '1px solid #fde68a',
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                }}
                              >
                                <b>
                                  {translateDeductionCategory(d.category)}: {formatCurrencyOrMissing(d.amount)}
                                </b>
                                <div style={{ color: '#78350f', fontSize: 10 }}>{d.reason}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--t3)', fontSize: 11 }}>ללא קיזוז</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 700, color: r.debtAmount && r.debtAmount > 0 ? '#dc2626' : '#16a34a' }}>
                        {formatCurrencyOrMissing(r.debtAmount, '₪0')}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-p btn-sm"
                          style={{ fontSize: 11, padding: '3px 8px' }}
                          onClick={() => onOpenClaim(r.claimId)}
                          data-testid={`cfc-open-pay-claim-${r.claimId}`}
                        >
                          כרטיס תיק
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Full Traceability Ledger */}
      {activeSubTab === 'traceability' && (
        <div className="cfc-table-card" data-testid="cfc-trace-table-card">
          <div className="cfc-table-header-bar">
            <div>
              <b style={{ fontSize: 14 }}>מעקב מקורות כספיים ואימות נתונים</b>
              <div style={{ fontSize: 12, color: 'var(--t2)' }}>
                פירוט מלא של כל נתון כספי: מקור הזנה, סטטוס סריקת AI/OCR, רמת מהימנות ומסמך מקור
              </div>
            </div>
          </div>

          <div className="cfc-table-responsive">
            <table className="cfc-table" data-testid="cfc-trace-table">
              <thead>
                <tr>
                  <th>תיק</th>
                  <th>רכב ולקוח</th>
                  <th>חברת ביטוח</th>
                  <th>מקור הנתון הכספי</th>
                  <th>רמת אימות</th>
                  <th>סכום דרישה</th>
                  <th>אושר</th>
                  <th>שולם</th>
                  <th>יתרת חוב</th>
                  <th>פעולה</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.slice(0, 100).map((r) => {
                  let vBadge = <span className="cfc-verify-badge cfc-verify-warning">טרם אומת</span>;
                  if (r.verificationStatus === 'verified') {
                    vBadge = <span className="cfc-verify-badge cfc-verify-verified">✓ מאומת בבנק/מסמך</span>;
                  } else if (r.verificationStatus === 'ai_extracted') {
                    vBadge = <span className="cfc-verify-badge cfc-verify-ai">✨ חילוץ AI/OCR</span>;
                  } else if (r.verificationStatus === 'manual') {
                    vBadge = <span className="cfc-verify-badge cfc-verify-manual">✍️ הזנה ידנית</span>;
                  }

                  return (
                    <tr key={r.claimId} data-testid={`cfc-trace-row-${r.claimId}`}>
                      <td>
                        <b>{r.claimId}</b>
                      </td>
                      <td>
                        <div>{r.clientName}</div>
                        <div style={{ fontSize: 11, color: 'var(--t3)', direction: 'ltr', textAlign: 'right' }}>
                          {r.plate}
                        </div>
                      </td>
                      <td>{r.insCompany}</td>
                      <td>
                        <span style={{ fontSize: 11 }}>{r.sourceDescription}</span>
                      </td>
                      <td>{vBadge}</td>
                      <td>{formatCurrencyOrMissing(r.demandAmount)}</td>
                      <td>{formatCurrencyOrMissing(r.approvedAmount, 'טרם אומת')}</td>
                      <td>{formatCurrencyOrMissing(r.paidAmount, '₪0')}</td>
                      <td style={{ fontWeight: 700, color: r.debtAmount && r.debtAmount > 0 ? '#dc2626' : 'inherit' }}>
                        {formatCurrencyOrMissing(r.debtAmount, '₪0')}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-g btn-sm"
                          style={{ fontSize: 11, padding: '3px 8px' }}
                          onClick={() => onOpenClaim(r.claimId)}
                          data-testid={`cfc-open-trace-claim-${r.claimId}`}
                        >
                          פתח תיק
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. Drilldown Modal */}
      {drilldownModal && (
        <div
          className="cfc-modal-overlay"
          onClick={() => setDrilldownModal(null)}
          data-testid="cfc-drilldown-modal-overlay"
        >
          <div
            className="cfc-modal"
            onClick={(e) => e.stopPropagation()}
            data-testid="cfc-drilldown-modal"
          >
            <div className="cfc-modal-head">
              <div>
                <h3 className="cfc-modal-title">{drilldownModal.title}</h3>
                <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>
                  {drilldownModal.description}
                </div>
              </div>
              <button
                type="button"
                className="cfc-modal-close"
                onClick={() => setDrilldownModal(null)}
                aria-label="סגור חלון פירוט"
                data-testid="cfc-drilldown-close"
              >
                ✕
              </button>
            </div>

            <div className="cfc-modal-body">
              <div className="cfc-table-responsive">
                <table className="cfc-table" data-testid="cfc-drilldown-table">
                  <thead>
                    <tr>
                      <th>מספר תיק</th>
                      <th>רכב</th>
                      <th>לקוח</th>
                      <th>חברת ביטוח</th>
                      <th>סטטוס</th>
                      <th>סכום דרישה</th>
                      <th>אושר</th>
                      <th>שולם</th>
                      <th>יתרת חוב</th>
                      <th>אימות</th>
                      <th>פעולה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drilldownModal.rows.length === 0 ? (
                      <tr>
                        <td colSpan={11} style={{ textAlign: 'center', padding: 24, color: 'var(--t2)' }}>
                          אין תיקים ברשימה זו.
                        </td>
                      </tr>
                    ) : (
                      drilldownModal.rows.map((r) => (
                        <tr key={r.claimId} data-testid={`cfc-drill-row-${r.claimId}`}>
                          <td style={{ fontWeight: 700 }}>{r.claimId}</td>
                          <td style={{ direction: 'ltr', textAlign: 'right' }}>{r.plate}</td>
                          <td>{r.clientName}</td>
                          <td>{r.insCompany}</td>
                          <td>
                            <span className="cfc-badge-pill">{r.status}</span>
                          </td>
                          <td>{formatCurrencyOrMissing(r.demandAmount)}</td>
                          <td>{formatCurrencyOrMissing(r.approvedAmount, 'טרם אומת')}</td>
                          <td>{formatCurrencyOrMissing(r.paidAmount, '₪0')}</td>
                          <td style={{ fontWeight: 700, color: r.debtAmount && r.debtAmount > 0 ? '#dc2626' : 'inherit' }}>
                            {formatCurrencyOrMissing(r.debtAmount, '₪0')}
                          </td>
                          <td>
                            {r.verificationStatus === 'verified' ? (
                              <span className="cfc-verify-badge cfc-verify-verified">מאומת</span>
                            ) : r.verificationStatus === 'ai_extracted' ? (
                              <span className="cfc-verify-badge cfc-verify-ai">AI</span>
                            ) : (
                              <span className="cfc-verify-badge cfc-verify-manual">ידני</span>
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-p btn-sm"
                              style={{ fontSize: 11, padding: '2px 8px' }}
                              onClick={() => {
                                setDrilldownModal(null);
                                onOpenClaim(r.claimId);
                              }}
                              data-testid={`cfc-drill-open-${r.claimId}`}
                            >
                              פתח תיק
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
}
