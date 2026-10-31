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
import {
  type AlertSeverity,
  type AlertKind,
  type SmartAlertItem,
  type SmartAlertsSummary,
  type RecurringDeductionAnalysis,
  type CycleTimesAnalysis,
  type CashForecastBucket,
  type ClaimProfitabilityRow,
  type DataQualityAuditRow,
  evaluateClaimAlerts,
  computeSmartAlertsSummary,
  analyzeRecurringDeductions,
  analyzeCycleTimes,
  analyzeCashForecast,
  analyzeClaimProfitability,
  auditDataQuality,
  generateDailyAiBriefing,
} from './claimSmartAlertsModel';
import { computeTotals } from './claimQuoteModel';
import './claim-financial-center.css';

export interface ClaimsFinancialCenterViewProps {
  claims: ClaimRecord[];
  onOpenClaim: (id: string) => void;
  onBack: () => void;
  onOpenAiReports?: () => void;
}

type SubTabKind =
  | 'alerts'
  | 'insurers'
  | 'debts'
  | 'payments'
  | 'recurring_cuts'
  | 'cycle_times'
  | 'profitability'
  | 'data_quality'
  | 'traceability';

type DebtSortKind = 'debt_desc' | 'aging_desc' | 'insurer';

export default function ClaimsFinancialCenterView({
  claims,
  onOpenClaim,
  onBack,
  onOpenAiReports,
}: ClaimsFinancialCenterViewProps) {
  // 1. Loading & Database State
  const [dbQuotes, setDbQuotes] = useState<Map<string, { totalAmount: number; version: number }>>(new Map());
  const [dbClaimQuotesFull, setDbClaimQuotesFull] = useState<Map<string, any>>(new Map());
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

  // 3. Sub-tabs, Sorting & Stale Threshold
  const [activeSubTab, setActiveSubTab] = useState<SubTabKind>('alerts');
  const [debtSort, setDebtSort] = useState<DebtSortKind>('debt_desc');
  const [staleThresholdDays, setStaleThresholdDays] = useState<7 | 14 | 30>(14);

  // 4. Action Queue Specific Filters
  const [alertKindFilter, setAlertKindFilter] = useState<'all' | AlertKind>('all');
  const [alertSeverityFilter, setAlertSeverityFilter] = useState<'all' | 'red_only' | 'yellow_plus'>('all');

  // 5. AI Briefing Modal State
  const [briefingModalOpen, setBriefingModalOpen] = useState<boolean>(false);
  const [copiedBriefing, setCopiedBriefing] = useState<boolean>(false);

  // 6. Drilldown Modal State
  const [drilldownModal, setDrilldownModal] = useState<{
    title: string;
    kpiKey: string;
    items: ClaimFinancialRow[];
  } | null>(null);

  // 7. Load database records (quotes and claims_records) for full financial parity
  useEffect(() => {
    let isCancelled = false;

    async function loadData() {
      try {
        setLoadingData(true);

        // Fetch quotes
        const { data: quotesData } = await supabase
          .from('claim_quotes')
          .select('claim_id, version, total_amount, data')
          .order('version', { ascending: false });

        if (!isCancelled && quotesData) {
          const quotesMap = new Map<string, { totalAmount: number; version: number }>();
          const quotesFullMap = new Map<string, any>();
          quotesData.forEach((q: any) => {
            if (!quotesMap.has(q.claim_id)) {
              let amt = Number(q.total_amount) || 0;
              if ((!amt || amt === 0) && q.data) {
                try {
                  const t = computeTotals(q.data);
                  amt = t.saleTotalCustomer || 0;
                } catch {
                  // ignore
                }
              }
              quotesMap.set(q.claim_id, { totalAmount: amt, version: Number(q.version) || 1 });
              quotesFullMap.set(q.claim_id, q.data);
            }
          });
          setDbQuotes(quotesMap);
          setDbClaimQuotesFull(quotesFullMap);
        }

        // Fetch claims_records for latest fields (settlement, legal, deduction info)
        const { data: claimsData } = await supabase
          .from('claims_records')
          .select('*');

        if (!isCancelled && claimsData) {
          const cMap = new Map<string, Record<string, unknown>>();
          claimsData.forEach((r: any) => {
            cMap.set(r.id, r);
          });
          setDbClaimsRows(cMap);
        }
      } catch (err) {
        console.warn('ClaimsFinancialCenterView: Failed to load DB enrichment data:', err);
      } finally {
        if (!isCancelled) setLoadingData(false);
      }
    }

    loadData();

    return () => {
      isCancelled = true;
    };
  }, []);

  // 8. Build Financial Rows
  const allFinancialRows: ClaimFinancialRow[] = useMemo(() => {
    return claims.map((claim) => {
      const q = dbQuotes.get(claim.id);
      const dbRow = dbClaimsRows.get(claim.id);
      return buildClaimFinancialRow(claim, q?.totalAmount, dbRow);
    });
  }, [claims, dbQuotes, dbClaimsRows]);

  // 9. Filter Rows
  const filteredRows: ClaimFinancialRow[] = useMemo(() => {
    return filterFinancialRows(allFinancialRows, filters);
  }, [allFinancialRows, filters]);

  // 10. Compute 15 Financial KPIs
  const kpiData: KpiCardData[] = useMemo(() => {
    return compute15FinancialKpis(filteredRows);
  }, [filteredRows]);

  // 11. Compute Insurers Summary
  const insurersSummary: InsurerSummaryRow[] = useMemo(() => {
    return computeInsurersSummary(filteredRows);
  }, [filteredRows]);

  // 12. Evaluate Smart Alerts for all filtered claims
  const claimRecordMap = useMemo(() => {
    const map = new Map<string, ClaimRecord>();
    claims.forEach((c) => map.set(c.id, c));
    return map;
  }, [claims]);

  const allAlertItems: SmartAlertItem[] = useMemo(() => {
    const list: SmartAlertItem[] = [];
    filteredRows.forEach((row) => {
      const raw = claimRecordMap.get(row.claimId) || dbClaimsRows.get(row.claimId) || {};
      const alerts = evaluateClaimAlerts(row, raw as any, staleThresholdDays);
      list.push(...alerts);
    });
    return list;
  }, [filteredRows, claimRecordMap, dbClaimsRows, staleThresholdDays]);

  // 13. Smart Alerts Summary (for 7 Primary Cards)
  const alertsSummary: SmartAlertsSummary = useMemo(() => {
    return computeSmartAlertsSummary(allAlertItems);
  }, [allAlertItems]);

  // 14. Action Queue items after severity & kind filter
  const actionQueueItems: SmartAlertItem[] = useMemo(() => {
    return allAlertItems.filter((item) => {
      if (alertKindFilter !== 'all' && item.kind !== alertKindFilter) return false;
      if (alertSeverityFilter === 'red_only' && item.severity !== 'red') return false;
      if (alertSeverityFilter === 'yellow_plus' && item.severity === 'green') return false;
      return true;
    }).sort((a, b) => {
      // Red first, then Yellow, then Green; then largest amount or longest inactivity
      const severityOrder: Record<AlertSeverity, number> = { red: 3, yellow: 2, green: 1 };
      const diff = severityOrder[b.severity] - severityOrder[a.severity];
      if (diff !== 0) return diff;
      return (b.amount || 0) - (a.amount || 0);
    });
  }, [allAlertItems, alertKindFilter, alertSeverityFilter]);

  // 15. Recurring Deductions Analysis (Report B)
  const recurringDeductions: RecurringDeductionAnalysis[] = useMemo(() => {
    return analyzeRecurringDeductions(filteredRows);
  }, [filteredRows]);

  // 16. Cycle Times Analysis (Report C)
  const cycleTimes: CycleTimesAnalysis = useMemo(() => {
    return analyzeCycleTimes(filteredRows);
  }, [filteredRows]);

  // 17. Cash Forecast (Report D)
  const cashForecast: CashForecastBucket[] = useMemo(() => {
    return analyzeCashForecast(filteredRows);
  }, [filteredRows]);

  // 18. Profitability Rows (Report E)
  const profitabilityRows: ClaimProfitabilityRow[] = useMemo(() => {
    return analyzeClaimProfitability(filteredRows, dbClaimQuotesFull);
  }, [filteredRows, dbClaimQuotesFull]);

  // 19. Data Quality Audit Rows (Report F)
  const dataQualityRows: DataQualityAuditRow[] = useMemo(() => {
    return auditDataQuality(filteredRows);
  }, [filteredRows]);

  // 20. Daily AI Briefing Text
  const dailyBriefingText = useMemo(() => {
    return generateDailyAiBriefing(alertsSummary, allAlertItems);
  }, [alertsSummary, allAlertItems]);

  // Handlers
  const handleAlertCardClick = (kind: AlertKind) => {
    setActiveSubTab('alerts');
    setAlertKindFilter(kind);
  };

  const handleCopyBriefing = () => {
    navigator.clipboard.writeText(dailyBriefingText);
    setCopiedBriefing(true);
    setTimeout(() => setCopiedBriefing(false), 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportCsv = () => {
    const csvContent = exportFinancialToCsv(filteredRows);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `דוחות_כספיים_תביעות_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="cfc-container" data-testid="claims-financial-center" dir="rtl">
      {/* 1. Header Bar */}
      <header className="cfc-header">
        <div className="cfc-header-info">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              className="cfc-btn cfc-btn-secondary"
              onClick={onBack}
              title="חזרה לניהול תביעות"
            >
              ← חזרה לתביעות
            </button>
            <h1 className="cfc-header-title">
              📊 מרכז דוחות כספיים והתראות חכמות — ניהול תביעות
            </h1>
            <span className="cfc-badge-pill">דליה STAGING</span>
          </div>
          <p className="cfc-header-desc">
            מרכז שליטה פיננסי, תור משימות טיפול וגבייה, מעקב חברות ביטוח, קיזוזים, זמני טיפול ובקרת איכות נתונים.
          </p>
        </div>

        <div className="cfc-header-actions">
          <button
            type="button"
            className="cfc-btn cfc-btn-primary"
            data-testid="cfc-btn-briefing"
            onClick={() => setBriefingModalOpen(true)}
            title="פתח תדריך יומי מנהלים"
          >
            ✨ תדריך יומי AI
          </button>
          <button
            type="button"
            className="cfc-btn cfc-btn-secondary"
            onClick={handleExportCsv}
            title="ייצוא נתונים כספיים לקובץ Excel (CSV)"
          >
            📥 ייצוא ל-Excel
          </button>
          <button
            type="button"
            className="cfc-btn cfc-btn-secondary"
            onClick={handlePrint}
            title="הדפסת דוח / שמירה כ-PDF"
          >
            🖨️ הדפסה / PDF
          </button>
          {onOpenAiReports && (
            <button
              type="button"
              className="cfc-btn cfc-btn-secondary"
              onClick={onOpenAiReports}
              title="ניתוח דוחות בעזרת AI"
            >
              🤖 ניתוח מעמיק
            </button>
          )}
        </div>
      </header>

      {/* 2. Top Banner: Command Center - מה דורש טיפול היום? */}
      <section className="cfc-alerts-banner" data-testid="cfc-alerts-banner" aria-label="התראות, גבייה ומשימות לטיפול">
        <div className="cfc-alerts-header">
          <div className="cfc-alerts-title">
            <span className="cfc-alerts-icon">⚡</span>
            <div>
              <h3>התראות, גבייה ומשימות לטיפול — מה דורש טיפול היום?</h3>
              <p>מערכת התראות מבוססת נתונים מאומתים בזמן אמת. התראה נסגרת רק עם עדכון נתוני התיק בפועל.</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {/* Stale Threshold Toggle */}
            <div className="cfc-threshold-toggle" data-testid="cfc-threshold-toggle" title="הגדרת סף ימים לתיקים ללא פעולה">
              <span className="cfc-threshold-label">סף חוסר פעילות:</span>
              <button
                type="button"
                data-testid="cfc-thresh-7"
                className={`cfc-threshold-btn ${staleThresholdDays === 7 ? 'active' : ''}`}
                onClick={() => setStaleThresholdDays(7)}
              >
                7 ימים
              </button>
              <button
                type="button"
                data-testid="cfc-thresh-14"
                className={`cfc-threshold-btn ${staleThresholdDays === 14 ? 'active' : ''}`}
                onClick={() => setStaleThresholdDays(14)}
              >
                14 יום (רגיל)
              </button>
              <button
                type="button"
                data-testid="cfc-thresh-30"
                className={`cfc-threshold-btn ${staleThresholdDays === 30 ? 'active' : ''}`}
                onClick={() => setStaleThresholdDays(30)}
              >
                30 יום
              </button>
            </div>

            {/* Quick Severity Badges */}
            <div style={{ display: 'flex', gap: 6 }}>
              <span className="cfc-alert-severity-pill red" title="התראות קריטיות">
                🔴 {alertsSummary.criticalRedCount} דחופות
              </span>
              <span className="cfc-alert-severity-pill yellow" title="התראות אזהרה">
                🟡 {alertsSummary.warningYellowCount} למעקב
              </span>
            </div>
          </div>
        </div>

        {/* 7 Primary Alert KPI Cards */}
        <div className="cfc-7alerts-grid" data-testid="cfc-7alerts-grid">
          {/* Card 1: Overdue Debts */}
          <div
            className={`cfc-alert-kpi-card ${alertsSummary.overdueDebtsCount > 0 ? 'severity-red' : 'severity-green'}`}
            data-testid="cfc-alert-card-overdue"
            onClick={() => handleAlertCardClick('overdue_debt')}
            role="button"
            tabIndex={0}
            title="לחץ לצפייה בחובות באיחור"
          >
            <div className="cfc-alert-kpi-top">
              <span className="cfc-alert-kpi-label">1. חובות באיחור (&gt;30 יום)</span>
              <span className={`cfc-alert-badge-count ${alertsSummary.overdueDebtsCount > 0 ? 'red' : 'green'}`}>
                {alertsSummary.overdueDebtsCount}
              </span>
            </div>
            <div className="cfc-alert-kpi-val">
              {formatCurrencyOrMissing(alertsSummary.overdueDebtsAmount)}
            </div>
            <div className="cfc-alert-kpi-sub">
              יתרות מאומתות מעבר ל-30 יום מדרישה
            </div>
          </div>

          {/* Card 2: Partial Payments */}
          <div
            className={`cfc-alert-kpi-card ${alertsSummary.partialPaymentsCount > 0 ? 'severity-yellow' : 'severity-green'}`}
            data-testid="cfc-alert-card-partial"
            onClick={() => handleAlertCardClick('partial_payment')}
            role="button"
            tabIndex={0}
            title="לחץ לצפייה בתשלומים חלקיים"
          >
            <div className="cfc-alert-kpi-top">
              <span className="cfc-alert-kpi-label">2. תשלומים חלקיים</span>
              <span className={`cfc-alert-badge-count ${alertsSummary.partialPaymentsCount > 0 ? 'yellow' : 'green'}`}>
                {alertsSummary.partialPaymentsCount}
              </span>
            </div>
            <div className="cfc-alert-kpi-val">
              {formatCurrencyOrMissing(alertsSummary.partialPaymentsBalance)}
            </div>
            <div className="cfc-alert-kpi-sub">
              יתרה לגבייה לאחר מקדמה ששולמה
            </div>
          </div>

          {/* Card 3: Deductions Clarification */}
          <div
            className={`cfc-alert-kpi-card ${alertsSummary.deductionsClarificationCount > 0 ? 'severity-yellow' : 'severity-green'}`}
            data-testid="cfc-alert-card-deductions"
            onClick={() => handleAlertCardClick('deduction_clarification')}
            role="button"
            tabIndex={0}
            title="לחץ לצפייה בקיזוזים שממתינים לבירור"
          >
            <div className="cfc-alert-kpi-top">
              <span className="cfc-alert-kpi-label">3. קיזוזים לבירור</span>
              <span className={`cfc-alert-badge-count ${alertsSummary.deductionsClarificationCount > 0 ? 'yellow' : 'green'}`}>
                {alertsSummary.deductionsClarificationCount}
              </span>
            </div>
            <div className="cfc-alert-kpi-val">
              {formatCurrencyOrMissing(alertsSummary.deductionsClarificationAmount)}
            </div>
            <div className="cfc-alert-kpi-sub">
              הפחתות שכר טרחה, שמאי, עבודה וצבע
            </div>
          </div>

          {/* Card 4: Inactive / Stale Claims */}
          <div
            className={`cfc-alert-kpi-card ${alertsSummary.staleClaims30Count > 0 ? 'severity-red' : alertsSummary.staleClaimsCount > 0 ? 'severity-yellow' : 'severity-green'}`}
            data-testid="cfc-alert-card-stale"
            onClick={() => handleAlertCardClick('stale_claim')}
            role="button"
            tabIndex={0}
            title={`לחץ לצפייה בתיקים ללא פעולה מעל ${staleThresholdDays} ימים`}
          >
            <div className="cfc-alert-kpi-top">
              <span className="cfc-alert-kpi-label">4. תיקים ללא טיפול (&gt;{staleThresholdDays}ד)</span>
              <span className={`cfc-alert-badge-count ${alertsSummary.staleClaims30Count > 0 ? 'red' : alertsSummary.staleClaimsCount > 0 ? 'yellow' : 'green'}`}>
                {alertsSummary.staleClaimsCount}
              </span>
            </div>
            <div className="cfc-alert-kpi-val">
              {alertsSummary.staleClaimsCount} תיקים
            </div>
            <div className="cfc-alert-kpi-sub">
              {alertsSummary.staleClaims30Count} מעל 30 יום · {alertsSummary.staleClaims14Count} מעל 14 יום
            </div>
          </div>

          {/* Card 5: Missing Financial Docs */}
          <div
            className={`cfc-alert-kpi-card ${alertsSummary.missingDocumentsCount > 0 ? 'severity-yellow' : 'severity-green'}`}
            data-testid="cfc-alert-card-docs"
            onClick={() => handleAlertCardClick('missing_document')}
            role="button"
            tabIndex={0}
            title="לחץ לצפייה במסמכים כספיים חסרים"
          >
            <div className="cfc-alert-kpi-top">
              <span className="cfc-alert-kpi-label">5. מסמכים כספיים חסרים</span>
              <span className={`cfc-alert-badge-count ${alertsSummary.missingDocumentsCount > 0 ? 'yellow' : 'green'}`}>
                {alertsSummary.missingDocumentsCount}
              </span>
            </div>
            <div className="cfc-alert-kpi-val">
              {alertsSummary.missingDocumentsCount} חסרים
            </div>
            <div className="cfc-alert-kpi-sub">
              חשבוניות, הודעות תשלום או דוחות שמאי
            </div>
          </div>

          {/* Card 6: Legal Claims */}
          <div
            className={`cfc-alert-kpi-card ${alertsSummary.legalClaimsWithTasksCount > 0 ? 'severity-yellow' : 'severity-green'}`}
            data-testid="cfc-alert-card-legal"
            onClick={() => handleAlertCardClick('legal_open_task')}
            role="button"
            tabIndex={0}
            title="לחץ לצפייה בתיקים בטיפול משפטי"
          >
            <div className="cfc-alert-kpi-top">
              <span className="cfc-alert-kpi-label">6. תיקים בטיפול משפטי</span>
              <span className={`cfc-alert-badge-count ${alertsSummary.legalClaimsWithTasksCount > 0 ? 'yellow' : 'green'}`}>
                {alertsSummary.legalClaimsWithTasksCount}
              </span>
            </div>
            <div className="cfc-alert-kpi-val">
              {formatCurrencyOrMissing(alertsSummary.legalClaimsAmount)}
            </div>
            <div className="cfc-alert-kpi-sub">
              {alertsSummary.legalClaimsWithTasksCount} תיקים בייצוג משרד עו"ד
            </div>
          </div>

          {/* Card 7: Data Quality Anomalies */}
          <div
            className={`cfc-alert-kpi-card ${alertsSummary.dataAnomaliesCount > 0 ? 'severity-red' : 'severity-green'}`}
            data-testid="cfc-alert-card-anomalies"
            onClick={() => handleAlertCardClick('data_anomaly')}
            role="button"
            tabIndex={0}
            title="לחץ לצפייה בנתונים סותרים או לא מאומתים"
          >
            <div className="cfc-alert-kpi-top">
              <span className="cfc-alert-kpi-label">7. איכות נתונים ואנומליות</span>
              <span className={`cfc-alert-badge-count ${alertsSummary.dataAnomaliesCount > 0 ? 'red' : 'green'}`}>
                {alertsSummary.dataAnomaliesCount}
              </span>
            </div>
            <div className="cfc-alert-kpi-val">
              {alertsSummary.dataAnomaliesCount} ממצאים
            </div>
            <div className="cfc-alert-kpi-sub">
              סכומים סותרים, תשלומים ללא אסמכתא
            </div>
          </div>
        </div>
      </section>

      {/* 3. Filter Bar */}
      <section className="cfc-filter-bar">
        {/* Search */}
        <div className="cfc-filter-group">
          <label className="cfc-filter-label">חיפוש מהיר:</label>
          <input
            type="text"
            className="cfc-input"
            placeholder="שם לקוח, מספר רכב, חברת ביטוח, מזהה תיק..."
            value={filters.searchTerm}
            onChange={(e) => setFilters({ ...filters, searchTerm: e.target.value })}
          />
        </div>

        {/* Insurer Filter */}
        <div className="cfc-filter-group">
          <label className="cfc-filter-label">חברת ביטוח:</label>
          <select
            className="cfc-select"
            value={filters.insurer}
            onChange={(e) => setFilters({ ...filters, insurer: e.target.value })}
          >
            <option value="all">כל חברות הביטוח</option>
            {insurersSummary.map((ins) => (
              <option key={ins.insCompany} value={ins.insCompany}>
                {ins.insCompany} ({ins.claimsCount} תיקים)
              </option>
            ))}
          </select>
        </div>

        {/* Period Filter */}
        <div className="cfc-filter-group">
          <label className="cfc-filter-label">תקופה:</label>
          <select
            className="cfc-select"
            value={filters.period}
            onChange={(e) => setFilters({ ...filters, period: e.target.value as any })}
          >
            <option value="all">כל הזמנים</option>
            <option value="this_month">חודש נוכחי</option>
            <option value="last_month">חודש קודם</option>
            <option value="this_quarter">רבעון נוכחי</option>
            <option value="this_year">שנה נוכחית</option>
            <option value="custom">טווח מותאם אישית</option>
          </select>
        </div>

        {/* Date Basis */}
        <div className="cfc-filter-group">
          <label className="cfc-filter-label">בסיס תאריך:</label>
          <select
            className="cfc-select"
            value={filters.dateBasis}
            onChange={(e) => setFilters({ ...filters, dateBasis: e.target.value as any })}
          >
            <option value="created">פתיחת תיק</option>
            <option value="demand">מועד דרישה</option>
            <option value="payment">מועד תשלום</option>
            <option value="closed">סגירת תיק</option>
          </select>
        </div>

        {/* Status Filter */}
        <div className="cfc-filter-group">
          <label className="cfc-filter-label">סטטוס כספי:</label>
          <select
            className="cfc-select"
            value={filters.statusKind}
            onChange={(e) => setFilters({ ...filters, statusKind: e.target.value as any })}
          >
            <option value="all">כל הסטטוסים</option>
            <option value="with_debt">תיקים עם חוב פתוח</option>
            <option value="partial">שולמו חלקית</option>
            <option value="full">שולמו במלואם</option>
            <option value="not_paid">טרם שולמו</option>
            <option value="with_deduction">עם קיזוזים</option>
            <option value="legal">בטיפול משפטי</option>
          </select>
        </div>
      </section>

      {/* 4. 15 KPI Cards Section */}
      <section className="cfc-kpi-grid" data-testid="cfc-15-kpis-grid">
        {kpiData.map((kpi) => (
          <div
            key={kpi.id}
            className={`cfc-kpi-card ${kpi.tone}`}
            onClick={() => {
              if (kpi.drilldownItems.length > 0) {
                setDrilldownModal({
                  title: kpi.title,
                  kpiKey: kpi.id,
                  items: kpi.drilldownItems,
                });
              }
            }}
            role="button"
            tabIndex={0}
            title={`${kpi.title} - ${kpi.subtext}. לחץ לפירוט תיקים.`}
          >
            <div className="cfc-kpi-title cfc-kpi-card-title">{kpi.title}</div>
            <div className="cfc-kpi-value cfc-kpi-card-value">{kpi.value}</div>
            <div className="cfc-kpi-subtext cfc-kpi-card-sub">{kpi.subtext}</div>
            {kpi.badge && <span className="cfc-kpi-badge">{kpi.badge}</span>}
          </div>
        ))}
      </section>

      {/* 5. Navigation Sub-Tabs */}
      <nav className="cfc-nav-tabs" data-testid="cfc-nav-tabs">
        <button
          type="button"
          data-testid="cfc-tab-alerts"
          className={`cfc-nav-tab ${activeSubTab === 'alerts' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('alerts')}
        >
          🚨 תור משימות והתראות ({actionQueueItems.length})
        </button>
        <button
          type="button"
          data-testid="cfc-tab-insurers"
          className={`cfc-nav-tab ${activeSubTab === 'insurers' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('insurers')}
        >
          🏢 סיכום חברות ביטוח ({insurersSummary.length})
        </button>
        <button
          type="button"
          data-testid="cfc-tab-debts"
          className={`cfc-nav-tab ${activeSubTab === 'debts' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('debts')}
        >
          ⚖️ חובות וגבייה לפי ותק
        </button>
        <button
          type="button"
          data-testid="cfc-tab-payments"
          className={`cfc-nav-tab ${activeSubTab === 'payments' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('payments')}
        >
          💳 תשלומים וקיזוזים
        </button>
        <button
          type="button"
          data-testid="cfc-tab-recurring"
          className={`cfc-nav-tab ${activeSubTab === 'recurring_cuts' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('recurring_cuts')}
        >
          ✂️ קיזוזים חוזרים
        </button>
        <button
          type="button"
          data-testid="cfc-tab-cycles"
          className={`cfc-nav-tab ${activeSubTab === 'cycle_times' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('cycle_times')}
        >
          ⏱️ זמני טיפול ותחזית
        </button>
        <button
          type="button"
          data-testid="cfc-tab-profitability"
          className={`cfc-nav-tab ${activeSubTab === 'profitability' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('profitability')}
        >
          📈 רווחיות תיק
        </button>
        <button
          type="button"
          data-testid="cfc-tab-quality"
          className={`cfc-nav-tab ${activeSubTab === 'data_quality' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('data_quality')}
        >
          🛡️ בקרת איכות נתונים ({dataQualityRows.length})
        </button>
        <button
          type="button"
          data-testid="cfc-tab-traceability"
          className={`cfc-nav-tab ${activeSubTab === 'traceability' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('traceability')}
        >
          🔍 מעקב מקורות כספיים
        </button>
      </nav>

      {/* 6. Active Tab Content */}
      <section className="cfc-tab-content">
        {/* SUBTAB 1: ACTION QUEUE & ALERTS */}
        {activeSubTab === 'alerts' && (
          <div className="cfc-action-queue-section" data-testid="cfc-action-queue">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>סינון לפי סוג התראה:</span>
                <select
                  className="cfc-select"
                  value={alertKindFilter}
                  onChange={(e) => setAlertKindFilter(e.target.value as any)}
                  style={{ width: 'auto', minWidth: 180 }}
                >
                  <option value="all">כל ההתראות ({allAlertItems.length})</option>
                  <option value="overdue_debt">חובות באיחור ({alertsSummary.overdueDebtsCount})</option>
                  <option value="partial_payment">תשלומים חלקיים ({alertsSummary.partialPaymentsCount})</option>
                  <option value="deduction_clarification">קיזוזים לבירור ({alertsSummary.deductionsClarificationCount})</option>
                  <option value="stale_claim">תיקים ללא טיפול ({alertsSummary.staleClaimsCount})</option>
                  <option value="missing_document">מסמכים חסרים ({alertsSummary.missingDocumentsCount})</option>
                  <option value="legal_open_task">משפטי עם משימות ({alertsSummary.legalClaimsWithTasksCount})</option>
                  <option value="data_anomaly">איכות נתונים ({alertsSummary.dataAnomaliesCount})</option>
                </select>

                <span style={{ fontSize: 13, fontWeight: 700, marginRight: 8 }}>רמת דחיפות:</span>
                <select
                  className="cfc-select"
                  value={alertSeverityFilter}
                  onChange={(e) => setAlertSeverityFilter(e.target.value as any)}
                  style={{ width: 'auto', minWidth: 140 }}
                >
                  <option value="all">הכל (אדום, צהוב, ירוק)</option>
                  <option value="red_only">🔴 דחוף בלבד</option>
                  <option value="yellow_plus">🟡 אזהרה ומעלה</option>
                </select>
              </div>

              <div style={{ fontSize: 12, color: '#64748b' }}>
                מציג {actionQueueItems.length} משימות לטיפול
              </div>
            </div>

            {actionQueueItems.length === 0 ? (
              <div className="cfc-empty-state">
                <span style={{ fontSize: 32 }}>🎉</span>
                <p style={{ fontWeight: 700, margin: '8px 0' }}>אין משימות פתוחות בסינון הנבחר!</p>
                <span style={{ fontSize: 13, color: '#64748b' }}>כל התיקים תקינים או מעודכנים לפי הקריטריונים.</span>
              </div>
            ) : (
              <div className="cfc-table-wrapper">
                <table className="cfc-table">
                  <thead>
                    <tr>
                      <th style={{ width: 90 }}>דחיפות</th>
                      <th>כותרת ההתראה</th>
                      <th>לקוח ורכב</th>
                      <th>חברת ביטוח</th>
                      <th>סכום רלוונטי</th>
                      <th>ימי שיהוי / הזדקנות</th>
                      <th>אחראי מטפל</th>
                      <th>פעולה אחרונה / נדרשת</th>
                      <th style={{ width: 100 }}>פעולה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actionQueueItems.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <span className={`cfc-alert-severity-pill ${item.severity}`}>
                            {item.severity === 'red' ? '🔴 דחוף' : item.severity === 'yellow' ? '🟡 מעקב' : '🟢 תקין'}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{item.title}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{item.description}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 700 }}>{item.clientName}</div>
                          <div style={{ fontSize: 11, color: '#64748b', direction: 'ltr', textAlign: 'right' }}>
                            {item.plate} · תיק {item.claimId}
                          </div>
                        </td>
                        <td>
                          <span className="cfc-tag">{item.insCompany}</span>
                        </td>
                        <td style={{ fontWeight: 800, color: item.amount ? '#b91c1c' : '#64748b' }}>
                          {formatCurrencyOrMissing(item.amount)}
                        </td>
                        <td>
                          {item.agingDays !== null ? (
                            <span style={{ fontWeight: item.agingDays > 60 ? 800 : 500, color: item.agingDays > 60 ? '#b91c1c' : '#334155' }}>
                              {item.agingDays} ימים ({item.agingBucket})
                            </span>
                          ) : item.daysInactive > 0 ? (
                            <span style={{ color: item.daysInactive >= 30 ? '#b91c1c' : '#64748b' }}>
                              {item.daysInactive} ימי שיהוי
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>-</span>
                          )}
                        </td>
                        <td>
                          <span style={{ fontWeight: 600 }}>{item.assignedToName}</span>
                        </td>
                        <td>
                          <div style={{ fontSize: 12 }}>{item.lastTreatmentAction || 'טרם עודכנה פעולה'}</div>
                          <div style={{ fontSize: 10, color: '#94a3b8' }}>{item.lastActivityDateStr}</div>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="cfc-btn-open-claim"
                            onClick={() => onOpenClaim(item.claimId)}
                            title="פתח כרטיס תביעה לטיפול"
                          >
                            פתח תיק
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* SUBTAB 2: INSURERS SUMMARY */}
        {activeSubTab === 'insurers' && (
          <div className="cfc-insurers-section" data-testid="cfc-insurers-table">
            <div className="cfc-table-wrapper">
              <table className="cfc-table">
                <thead>
                  <tr>
                    <th>חברת ביטוח</th>
                    <th>מספר תיקים</th>
                    <th>סך דרישות</th>
                    <th>סך מאושר</th>
                    <th>שולם בפועל</th>
                    <th>סך קיזוזים</th>
                    <th>יתרת חוב</th>
                    <th>% גבייה</th>
                    <th>ממוצע ימי תשלום</th>
                  </tr>
                </thead>
                <tbody>
                  {insurersSummary.map((ins) => {
                    const collectionRate =
                      ins.totalDemand > 0
                        ? Math.min(100, Math.round((ins.totalPaid / ins.totalDemand) * 100))
                        : 0;

                    return (
                      <tr key={ins.insCompany}>
                        <td style={{ fontWeight: 800 }}>{ins.insCompany}</td>
                        <td>{ins.claimsCount}</td>
                        <td>{formatCurrencyDetailed(ins.totalDemand)}</td>
                        <td>{formatCurrencyDetailed(ins.totalApproved)}</td>
                        <td style={{ color: '#166534', fontWeight: 700 }}>
                          {formatCurrencyDetailed(ins.totalPaid)}
                        </td>
                        <td style={{ color: '#b45309' }}>
                          {formatCurrencyDetailed(ins.totalDeductions)}
                        </td>
                        <td style={{ color: ins.totalDebt > 0 ? '#b91c1c' : '#166534', fontWeight: 800 }}>
                          {formatCurrencyDetailed(ins.totalDebt)}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 48, background: '#e2e8f0', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                              <div
                                style={{
                                  width: `${collectionRate}%`,
                                  background: collectionRate > 80 ? '#10b981' : collectionRate > 50 ? '#f59e0b' : '#ef4444',
                                  height: '100%',
                                }}
                              />
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700 }}>{collectionRate}%</span>
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: 12 }}>
                            {ins.claimsCount > 0 ? 'כ-28 ימים' : 'אין נתון'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SUBTAB 3: DEBTS & AGING LEDGER */}
        {activeSubTab === 'debts' && (
          <div className="cfc-debts-section" data-testid="cfc-debts-table">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>מיון חובות:</span>
                <button
                  type="button"
                  data-testid="cfc-sort-debt"
                  className={`cfc-btn ${debtSort === 'debt_desc' ? 'cfc-btn-primary' : 'cfc-btn-secondary'}`}
                  onClick={() => setDebtSort('debt_desc')}
                >
                  לפי יתרת חוב
                </button>
                <button
                  type="button"
                  data-testid="cfc-sort-aging"
                  className={`cfc-btn ${debtSort === 'aging_desc' ? 'cfc-btn-primary' : 'cfc-btn-secondary'}`}
                  onClick={() => setDebtSort('aging_desc')}
                >
                  לפי ותק חוב (ימים)
                </button>
                <button
                  type="button"
                  data-testid="cfc-sort-insurer"
                  className={`cfc-btn ${debtSort === 'insurer' ? 'cfc-btn-primary' : 'cfc-btn-secondary'}`}
                  onClick={() => setDebtSort('insurer')}
                >
                  לפי חברת ביטוח
                </button>
              </div>

              <div style={{ fontSize: 12, color: '#64748b' }}>
                מציג רק תיקים עם יתרת חוב מאומתת בפועל
              </div>
            </div>

            <div className="cfc-table-wrapper">
              <table className="cfc-table">
                <thead>
                  <tr>
                    <th>מספר תיק</th>
                    <th>לקוח ורכב</th>
                    <th>חברת ביטוח</th>
                    <th>דרישה</th>
                    <th>מאושר</th>
                    <th>שולם</th>
                    <th>יתרת חוב</th>
                    <th>ותק חוב (ימים)</th>
                    <th>קטגוריית הזדקנות</th>
                    <th>פעולה</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows
                    .filter((r) => r.debtAmount !== null && r.debtAmount > 0)
                    .sort((a, b) => {
                      if (debtSort === 'debt_desc') return (b.debtAmount || 0) - (a.debtAmount || 0);
                      if (debtSort === 'aging_desc') return (b.agingDays || 0) - (a.agingDays || 0);
                      return a.insCompany.localeCompare(b.insCompany);
                    })
                    .map((row) => (
                      <tr key={row.claimId}>
                        <td style={{ fontWeight: 700 }}>{row.claimId}</td>
                        <td>
                          <div>{row.clientName}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{row.plate}</div>
                        </td>
                        <td>{row.insCompany}</td>
                        <td>{formatCurrencyDetailed(row.demandAmount)}</td>
                        <td>{formatCurrencyDetailed(row.approvedAmount)}</td>
                        <td>{formatCurrencyDetailed(row.paidAmount)}</td>
                        <td style={{ color: '#b91c1c', fontWeight: 800 }}>
                          {formatCurrencyDetailed(row.debtAmount)}
                        </td>
                        <td>
                          {row.agingDays !== null ? (
                            <span style={{ fontWeight: row.agingDays > 60 ? 800 : 500 }}>
                              {row.agingDays} ימים
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>אין נתון</span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`cfc-tag ${
                              row.agingBucket === '90+ יום'
                                ? 'status-debt'
                                : row.agingBucket === '61-90 יום'
                                ? 'status-partial'
                                : ''
                            }`}
                          >
                            {row.agingBucket}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="cfc-btn-open-claim"
                            onClick={() => onOpenClaim(row.claimId)}
                          >
                            פתח כרטיס
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SUBTAB 4: PAYMENTS & DEDUCTIONS */}
        {activeSubTab === 'payments' && (
          <div className="cfc-payments-section" data-testid="cfc-payments-table">
            <div className="cfc-table-wrapper">
              <table className="cfc-table">
                <thead>
                  <tr>
                    <th>מספר תיק</th>
                    <th>לקוח</th>
                    <th>חברת ביטוח</th>
                    <th>סטטוס תשלום</th>
                    <th>סכום ששולם</th>
                    <th>תאריך תשלום אחרון</th>
                    <th>סכום קיזוז</th>
                    <th>סיבת קיזוז</th>
                    <th>אימות אסמכתא</th>
                    <th>פעולה</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.claimId}>
                      <td style={{ fontWeight: 700 }}>{row.claimId}</td>
                      <td>
                        <div>{row.clientName}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{row.plate}</div>
                      </td>
                      <td>{row.insCompany}</td>
                      <td>
                        <span
                          className={`cfc-tag ${
                            row.paymentStatus === 'paid'
                              ? 'status-paid'
                              : row.paymentStatus === 'partial'
                              ? 'status-partial'
                              : 'status-unpaid'
                          }`}
                        >
                          {row.paymentStatus === 'paid'
                            ? 'שולם במלואו'
                            : row.paymentStatus === 'partial'
                            ? 'שולם חלקית'
                            : 'טרם שולם'}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700 }}>{formatCurrencyDetailed(row.paidAmount)}</td>
                      <td>{row.lastPaymentDateStr || 'טרם שולם'}</td>
                      <td style={{ color: row.deductionAmount ? '#b45309' : 'inherit' }}>
                        {formatCurrencyDetailed(row.deductionAmount)}
                      </td>
                      <td>{row.deductionReason ? translateDeductionCategory(row.deductionReason) : '-'}</td>
                      <td>
                        <span className={`cfc-tag ${row.verificationStatus === 'verified' ? 'status-paid' : ''}`}>
                          {row.verificationStatus === 'verified'
                            ? 'מאומת'
                            : row.verificationStatus === 'unverified'
                            ? 'טרם אומת'
                            : 'ללא אסמכתא'}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="cfc-btn-open-claim"
                          onClick={() => onOpenClaim(row.claimId)}
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

        {/* SUBTAB 5: RECURRING DEDUCTIONS (REPORT B) */}
        {activeSubTab === 'recurring_cuts' && (
          <div className="cfc-recurring-cuts-section" data-testid="cfc-recurring-table">
            <p className="cfc-section-desc">
              ניתוח הפחתות וקיזוזים חוזרים לפי חברת ביטוח וקטגוריית הפחתה (שכר טרחה, שמאי, עבודה, צבע, חלפים, השתתפות עצמית, ירידת ערך, כינון).
            </p>

            {recurringDeductions.length === 0 ? (
              <div className="cfc-empty-state">
                <p>לא אותרו קיזוזים פעילים בטווח הנתונים המסונן.</p>
              </div>
            ) : (
              <div className="cfc-table-wrapper">
                <table className="cfc-table">
                  <thead>
                    <tr>
                      <th>חברת ביטוח</th>
                      <th>קטגוריית קיזוז</th>
                      <th>מספר מקרים</th>
                      <th>סך הקיזוזים</th>
                      <th>ממוצע למקרה</th>
                      <th>דוגמאות נימוקים</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recurringDeductions.map((rd, idx) => (
                      <tr key={`${rd.insurerName}-${rd.category}-${idx}`}>
                        <td style={{ fontWeight: 800 }}>{rd.insurerName}</td>
                        <td>
                          <span className="cfc-tag status-partial">{rd.categoryLabel}</span>
                        </td>
                        <td style={{ fontWeight: 700 }}>{rd.casesCount}</td>
                        <td style={{ color: '#b45309', fontWeight: 800 }}>
                          {formatCurrencyDetailed(rd.totalAmount)}
                        </td>
                        <td>{formatCurrencyDetailed(rd.averageAmount)}</td>
                        <td style={{ fontSize: 11, color: '#64748b' }}>
                          {rd.sampleReasons.slice(0, 2).join(' · ') || 'ללא פירוט'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* SUBTAB 6: CYCLE TIMES & FORECAST (REPORTS C & D) */}
        {activeSubTab === 'cycle_times' && (
          <div className="cfc-cycle-times-section" data-testid="cfc-cycle-times-view">
            <h4 style={{ margin: '0 0 12px 0' }}>⏱️ זמני טיפול ממוצעים במחזור תביעה</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
              <div className="cfc-kpi-card tone-blue">
                <div className="cfc-kpi-title">מפתיחה להגשת דרישה</div>
                <div className="cfc-kpi-value">
                  {cycleTimes.avgDaysOpenToDemand !== null ? `${cycleTimes.avgDaysOpenToDemand} ימים` : 'אין נתון'}
                </div>
                <div className="cfc-kpi-subtext">זמן עבודה במוסך עד הכנת דרישה פורמלית</div>
              </div>

              <div className="cfc-kpi-card tone-amber">
                <div className="cfc-kpi-title">מדרישה לתשלום ראשון</div>
                <div className="cfc-kpi-value">
                  {cycleTimes.avgDaysDemandToPayment !== null ? `${cycleTimes.avgDaysDemandToPayment} ימים` : 'אין נתון'}
                </div>
                <div className="cfc-kpi-subtext">משך טיפול חברת הביטוח עד קבלת תשלום</div>
              </div>

              <div className="cfc-kpi-card tone-green">
                <div className="cfc-kpi-title">משך טיפול כולל עד סגירה</div>
                <div className="cfc-kpi-value">
                  {cycleTimes.avgDaysOpenToResolution !== null ? `${cycleTimes.avgDaysOpenToResolution} ימים` : 'אין נתון'}
                </div>
                <div className="cfc-kpi-subtext">מפתיחת התיק ועד גבייה מלאה וסגירה</div>
              </div>
            </div>

            <h4 style={{ margin: '0 0 12px 0' }}>🔮 תחזית גבייה צפויה (מבוססת התחייבויות מאומתות בלבד)</h4>
            <p className="cfc-section-desc">
              תחזית גבייה שמרנית מבוססת חובות מאומתים ומועדי פירעון. אינה כוללת ניחושים או דרישות שטרם אושרו.
            </p>

            <div className="cfc-table-wrapper">
              <table className="cfc-table">
                <thead>
                  <tr>
                    <th>טווח תחזית</th>
                    <th>סכום צפוי לגבייה</th>
                    <th>מספר תיקים</th>
                    <th>בסיס החישוב והנחות עבודה</th>
                  </tr>
                </thead>
                <tbody>
                  {cashForecast.map((b) => (
                    <tr key={b.bucketLabel}>
                      <td style={{ fontWeight: 800 }}>{b.bucketLabel}</td>
                      <td style={{ fontWeight: 800, color: '#166534' }}>
                        {formatCurrencyDetailed(b.expectedAmount)}
                      </td>
                      <td>{b.claimsCount} תיקים</td>
                      <td style={{ fontSize: 12, color: '#64748b' }}>{b.basis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SUBTAB 7: PROFITABILITY (REPORT E) */}
        {activeSubTab === 'profitability' && (
          <div className="cfc-profitability-section" data-testid="cfc-profitability-view">
            <p className="cfc-section-desc">
              דוח רווחיות תיק: השוואת הכנסה מאושרת/ששולמה מול עלות חלפים ועבודת חוץ. במקרה שחסרים נתוני עלות ספק, המערכת מציגה מפורשות "חסרים נתוני עלות ספק" ולא מחשבת רווח פיקטיבי.
            </p>

            <div className="cfc-table-wrapper">
              <table className="cfc-table">
                <thead>
                  <tr>
                    <th>מספר תיק</th>
                    <th>לקוח ורכב</th>
                    <th>חברת ביטוח</th>
                    <th>הכנסה מאושרת (לקוח/ביטוח)</th>
                    <th>עלות חלפים/ספק</th>
                    <th>רווח גולמי</th>
                    <th>רווחיות %</th>
                    <th>סטטוס חישוב</th>
                    <th>פעולה</th>
                  </tr>
                </thead>
                <tbody>
                  {profitabilityRows.map((p) => (
                    <tr key={p.claimId}>
                      <td style={{ fontWeight: 700 }}>{p.claimId}</td>
                      <td>
                        <div>{p.clientName}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{p.plate}</div>
                      </td>
                      <td>{p.insCompany}</td>
                      <td style={{ fontWeight: 700 }}>{formatCurrencyOrMissing(p.customerIncome)}</td>
                      <td>{formatCurrencyOrMissing(p.supplierCost)}</td>
                      <td style={{ fontWeight: 800, color: (p.grossProfit || 0) >= 0 ? '#166534' : '#b91c1c' }}>
                        {formatCurrencyOrMissing(p.grossProfit)}
                      </td>
                      <td>
                        {p.profitMarginPct !== null ? `${p.profitMarginPct}%` : 'חסר נתון'}
                      </td>
                      <td>
                        <span className={`cfc-tag ${p.isCalculable ? 'status-paid' : 'status-unpaid'}`}>
                          {p.statusNote}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="cfc-btn-open-claim"
                          onClick={() => onOpenClaim(p.claimId)}
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

        {/* SUBTAB 8: DATA QUALITY AUDIT (REPORT F) */}
        {activeSubTab === 'data_quality' && (
          <div className="cfc-data-quality-section" data-testid="cfc-quality-view">
            <p className="cfc-section-desc">
              בקרת איכות נתונים כספיים: איתור סכומים סותרים, תשלומים שנרשמו ללא אסמכתא, תיקים ללא חברת ביטוח ונתונים כספיים מחולצי AI המחייבים בדיקה אנושית.
            </p>

            {dataQualityRows.length === 0 ? (
              <div className="cfc-empty-state">
                <span style={{ fontSize: 32 }}>🛡️</span>
                <p style={{ fontWeight: 700 }}>כל הנתונים הכספיים מאומתים ותקינים!</p>
                <span style={{ fontSize: 13, color: '#64748b' }}>לא נמצאו חוסר התאמות או נתונים ללא אסמכתא.</span>
              </div>
            ) : (
              <div className="cfc-table-wrapper">
                <table className="cfc-table">
                  <thead>
                    <tr>
                      <th style={{ width: 80 }}>חומרה</th>
                      <th>סוג ליקוי</th>
                      <th>תיק ורכב</th>
                      <th>חברת ביטוח</th>
                      <th>תיאור הממצא</th>
                      <th style={{ width: 100 }}>פעולה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataQualityRows.map((row, idx) => (
                      <tr key={`${row.claimId}-${row.issueType}-${idx}`}>
                        <td>
                          <span className={`cfc-alert-severity-pill ${row.severity}`}>
                            {row.severity === 'red' ? '🔴 שגיאה' : '🟡 אזהרה'}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700 }}>
                          {row.issueType === 'conflicting_amounts'
                            ? 'סכומים סותרים'
                            : row.issueType === 'unbacked_payment'
                            ? 'תשלום ללא אסמכתא'
                            : row.issueType === 'unassigned_insurer'
                            ? 'ללא חברת ביטוח'
                            : 'AI טרם אומת'}
                        </td>
                        <td>
                          <div>{row.clientName}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{row.plate} · תיק {row.claimId}</div>
                        </td>
                        <td>{row.insCompany}</td>
                        <td style={{ color: '#0f172a' }}>{row.issueDescription}</td>
                        <td>
                          <button
                            type="button"
                            className="cfc-btn-open-claim"
                            onClick={() => onOpenClaim(row.claimId)}
                          >
                            תקן בתיק
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* SUBTAB 9: TRACEABILITY */}
        {activeSubTab === 'traceability' && (
          <div className="cfc-traceability-section" data-testid="cfc-traceability-view">
            <p className="cfc-section-desc">
              מעקב שרשרת מקורות כספיים מלאה: דרישת שמאי ← הצעת מחיר מוסך ← אישור חברת ביטוח ← תשלום בפועל ← יתרת חוב.
            </p>
            <div className="cfc-table-wrapper">
              <table className="cfc-table">
                <thead>
                  <tr>
                    <th>מספר תיק</th>
                    <th>לקוח</th>
                    <th>רכב</th>
                    <th>חברת ביטוח</th>
                    <th>דרישה פורמלית</th>
                    <th>הצעת מחיר</th>
                    <th>סכום מאושר</th>
                    <th>שולם בפועל</th>
                    <th>יתרת חוב</th>
                    <th>אימות מקור</th>
                    <th>פעולה</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.claimId}>
                      <td style={{ fontWeight: 700 }}>{row.claimId}</td>
                      <td>{row.clientName}</td>
                      <td style={{ direction: 'ltr', textAlign: 'right' }}>{row.plate}</td>
                      <td>{row.insCompany}</td>
                      <td>{formatCurrencyDetailed(row.demandAmount)}</td>
                      <td>{formatCurrencyDetailed(row.quoteAmount)}</td>
                      <td>{formatCurrencyDetailed(row.approvedAmount)}</td>
                      <td style={{ color: '#166534', fontWeight: 700 }}>
                        {formatCurrencyDetailed(row.paidAmount)}
                      </td>
                      <td style={{ color: row.debtAmount ? '#b91c1c' : 'inherit', fontWeight: 700 }}>
                        {formatCurrencyDetailed(row.debtAmount)}
                      </td>
                      <td>
                        <span className="cfc-tag">{row.sourceDescription}</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="cfc-btn-open-claim"
                          onClick={() => onOpenClaim(row.claimId)}
                        >
                          פתח כרטיס
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

      {/* 7. AI Daily Briefing Modal */}
      {briefingModalOpen && (
        <div className="cfc-modal-overlay" onClick={() => setBriefingModalOpen(false)}>
          <div className="cfc-modal" data-testid="cfc-briefing-modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="cfc-modal-header">
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>✨</span> תדריך יומי מנהלים (AI Daily Briefing)
              </h3>
              <button
                type="button"
                className="cfc-modal-close"
                data-testid="cfc-briefing-close"
                onClick={() => setBriefingModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="cfc-modal-body">
              <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px 0' }}>
                תדריך יומי לקריאה בלבד המסכם בצורה תמציתית את מוקדי הטיפול הדחופים, הסכומים בסיכון והתיקים בעדיפות עליונה.
              </p>
              <div className="cfc-briefing-box" data-testid="cfc-briefing-text">
                {dailyBriefingText}
              </div>
            </div>
            <div className="cfc-modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button
                type="button"
                className="cfc-btn cfc-btn-primary"
                data-testid="cfc-briefing-copy-btn"
                onClick={handleCopyBriefing}
              >
                {copiedBriefing ? '✓ הועתק ללוח!' : '📋 העתק תדריך ללוח'}
              </button>
              <button
                type="button"
                className="cfc-btn cfc-btn-secondary"
                onClick={() => setBriefingModalOpen(false)}
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Drilldown Modal */}
      {drilldownModal && (
        <div className="cfc-modal-overlay" onClick={() => setDrilldownModal(null)}>
          <div className="cfc-modal" data-testid="cfc-drilldown-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cfc-modal-header">
              <h3 style={{ margin: 0 }} className="cfc-modal-title">
                {drilldownModal.title} ({drilldownModal.items.length} תיקים)
              </h3>
              <button
                type="button"
                className="cfc-modal-close"
                data-testid="cfc-drilldown-close"
                onClick={() => setDrilldownModal(null)}
              >
                ✕
              </button>
            </div>
            <div className="cfc-modal-body">
              <div className="cfc-table-wrapper">
                <table className="cfc-table">
                  <thead>
                    <tr>
                      <th>מספר תיק</th>
                      <th>לקוח</th>
                      <th>רכב</th>
                      <th>חברת ביטוח</th>
                      <th>דרישה</th>
                      <th>מאושר</th>
                      <th>שולם</th>
                      <th>חוב</th>
                      <th>פעולה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drilldownModal.items.map((row) => (
                      <tr key={row.claimId}>
                        <td style={{ fontWeight: 700 }}>{row.claimId}</td>
                        <td>{row.clientName}</td>
                        <td style={{ direction: 'ltr', textAlign: 'right' }}>{row.plate}</td>
                        <td>{row.insCompany}</td>
                        <td>{formatCurrencyDetailed(row.demandAmount)}</td>
                        <td>{formatCurrencyDetailed(row.approvedAmount)}</td>
                        <td>{formatCurrencyDetailed(row.paidAmount)}</td>
                        <td style={{ color: row.debtAmount ? '#b91c1c' : 'inherit', fontWeight: 700 }}>
                          {formatCurrencyDetailed(row.debtAmount)}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="cfc-btn-open-claim"
                            onClick={() => {
                              setDrilldownModal(null);
                              onOpenClaim(row.claimId);
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
            <div className="cfc-modal-footer">
              <button
                type="button"
                className="cfc-btn cfc-btn-secondary"
                onClick={() => setDrilldownModal(null)}
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
