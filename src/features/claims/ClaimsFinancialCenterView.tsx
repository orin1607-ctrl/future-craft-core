// src/features/claims/ClaimsFinancialCenterView.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ClaimRecord } from './claimsConstants';
import { displayClaimNum } from './claimsConstants';
import type { GarageCaseRecord } from './ClaimsReportsView';
import ClaimQuotesReportSection from './ClaimQuotesReportSection';
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
import {
  type ControlAuditStatus,
  type ClaimControlAuditRow,
  type ControlAuditSummary,
  evaluateClaimControlAudit,
  computeControlAuditSummary,
} from './claimControlAuditModel';
import {
  type CommunicationStatsSummary,
  type CommunicationLogRow,
  loadCommunicationReportData,
} from './claimCommunicationReportsModel';
import { computeTotals } from './claimQuoteModel';
import './claim-financial-center.css';

export interface ClaimsFinancialCenterViewProps {
  claims: ClaimRecord[];
  garageCases?: GarageCaseRecord[];
  onOpenClaim: (id: string) => void;
  onOpenGarageCase?: (id: string) => void;
  onBack: () => void;
  onOpenAiReports?: () => void;
}

export type MainTabKind =
  | 'overview'
  | 'finances'
  | 'control'
  | 'alerts'
  | 'insurers'
  | 'communication'
  | 'operational';

type FinancesSubTab = 'kpis' | 'debts' | 'payments' | 'cycles' | 'profitability' | 'traceability';
type DebtSortKind = 'debt_desc' | 'aging_desc' | 'insurer';

export default function ClaimsFinancialCenterView({
  claims,
  garageCases = [],
  onOpenClaim,
  onOpenGarageCase,
  onBack,
  onOpenAiReports,
}: ClaimsFinancialCenterViewProps) {
  // 1. Top-Level Tab Navigation (7 Logical Tabs)
  const [activeTab, setActiveTab] = useState<MainTabKind>('overview');

  // 2. Sub-Tabs & View Specific States
  const [financesSubTab, setFinancesSubTab] = useState<FinancesSubTab>('kpis');
  const [debtSort, setDebtSort] = useState<DebtSortKind>('debt_desc');
  const [staleThresholdDays, setStaleThresholdDays] = useState<7 | 14 | 30>(14);
  const [controlStatusFilter, setControlStatusFilter] = useState<'all' | ControlAuditStatus>('all');
  const [alertKindFilter, setAlertKindFilter] = useState<'all' | AlertKind>('all');
  const [alertSeverityFilter, setAlertSeverityFilter] = useState<'all' | 'red_only' | 'yellow_plus'>('all');

  // 3. Database Enrichment State
  const [dbQuotes, setDbQuotes] = useState<Map<string, { totalAmount: number; version: number }>>(new Map());
  const [dbClaimQuotesFull, setDbClaimQuotesFull] = useState<Map<string, any>>(new Map());
  const [dbClaimsRows, setDbClaimsRows] = useState<Map<string, Record<string, unknown>>>(new Map());
  const [loadingDb, setLoadingDb] = useState<boolean>(true);

  // 4. Communication Log & Stats
  const [commSummary, setCommSummary] = useState<CommunicationStatsSummary>({
    totalSent: 0,
    autoSent: 0,
    manualSent: 0,
    pendingQueued: 0,
    failedCount: 0,
    receivedCount: 0,
    unassignedReviewCount: 0,
    claimsWithAutoAlerts: 0,
    claimsWaitingReply: 0,
    remindersCreated: 0,
    remindersCompleted: 0,
  });
  const [commLogs, setCommLogs] = useState<CommunicationLogRow[]>([]);
  const [loadingComm, setLoadingComm] = useState<boolean>(false);

  // 5. Global Financial Filters
  const [filters, setFilters] = useState<FinancialCenterFilters>({
    searchTerm: '',
    insurer: 'all',
    period: 'all',
    customFrom: '',
    customTo: '',
    dateBasis: 'created',
    statusKind: 'all',
  });

  // 6. Modals
  const [briefingModalOpen, setBriefingModalOpen] = useState<boolean>(false);
  const [copiedBriefing, setCopiedBriefing] = useState<boolean>(false);
  const [drilldownModal, setDrilldownModal] = useState<{
    title: string;
    items: Array<{
      claimId: string;
      plate: string;
      clientName: string;
      insCompany: string;
      status: string;
      subtext?: string;
      amount?: number | null;
    }>;
  } | null>(null);

  // Load database records for full financial parity
  useEffect(() => {
    let isCancelled = false;

    async function loadData() {
      try {
        setLoadingDb(true);

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
        if (!isCancelled) setLoadingDb(false);
      }
    }

    loadData();

    return () => {
      isCancelled = true;
    };
  }, []);

  // Load Communication Data on mount
  useEffect(() => {
    let isCancelled = false;
    async function loadComm() {
      try {
        setLoadingComm(true);
        const res = await loadCommunicationReportData(claims);
        if (!isCancelled) {
          setCommSummary(res.summary);
          setCommLogs(res.rows);
        }
      } catch (err) {
        console.warn('Failed to load communication report data:', err);
      } finally {
        if (!isCancelled) setLoadingComm(false);
      }
    }
    loadComm();
    return () => {
      isCancelled = true;
    };
  }, [claims]);

  // Build Financial Rows
  const allFinancialRows: ClaimFinancialRow[] = useMemo(() => {
    return claims.map((claim) => {
      const q = dbQuotes.get(claim.id);
      const dbRow = dbClaimsRows.get(claim.id);
      return buildClaimFinancialRow(claim, q?.totalAmount, dbRow);
    });
  }, [claims, dbQuotes, dbClaimsRows]);

  const filteredFinancialRows: ClaimFinancialRow[] = useMemo(() => {
    return filterFinancialRows(allFinancialRows, filters);
  }, [allFinancialRows, filters]);

  // Compute 15 Financial KPIs
  const kpiData: KpiCardData[] = useMemo(() => {
    return compute15FinancialKpis(filteredFinancialRows);
  }, [filteredFinancialRows]);

  // Compute Insurers Summary
  const insurersSummary: InsurerSummaryRow[] = useMemo(() => {
    return computeInsurersSummary(filteredFinancialRows);
  }, [filteredFinancialRows]);

  // Smart Alerts
  const claimRecordMap = useMemo(() => {
    const map = new Map<string, ClaimRecord>();
    claims.forEach((c) => map.set(c.id, c));
    return map;
  }, [claims]);

  const allAlertItems: SmartAlertItem[] = useMemo(() => {
    const list: SmartAlertItem[] = [];
    filteredFinancialRows.forEach((row) => {
      const raw = claimRecordMap.get(row.claimId) || dbClaimsRows.get(row.claimId) || {};
      const alerts = evaluateClaimAlerts(row, raw as any, staleThresholdDays);
      list.push(...alerts);
    });
    return list;
  }, [filteredFinancialRows, claimRecordMap, dbClaimsRows, staleThresholdDays]);

  const alertsSummary: SmartAlertsSummary = useMemo(() => {
    return computeSmartAlertsSummary(allAlertItems);
  }, [allAlertItems]);

  const actionQueueItems: SmartAlertItem[] = useMemo(() => {
    return allAlertItems.filter((item) => {
      if (alertKindFilter !== 'all' && item.kind !== alertKindFilter) return false;
      if (alertSeverityFilter === 'red_only' && item.severity !== 'red') return false;
      if (alertSeverityFilter === 'yellow_plus' && item.severity === 'green') return false;
      return true;
    }).sort((a, b) => {
      const severityOrder: Record<AlertSeverity, number> = { red: 3, yellow: 2, green: 1 };
      const diff = severityOrder[b.severity] - severityOrder[a.severity];
      if (diff !== 0) return diff;
      return (b.amount || 0) - (a.amount || 0);
    });
  }, [allAlertItems, alertKindFilter, alertSeverityFilter]);

  // Count distinct affected claims in alerts
  const affectedClaimsCount = useMemo(() => {
    const ids = new Set(allAlertItems.map((a) => a.claimId));
    return ids.size;
  }, [allAlertItems]);

  // Case & Document Control Audit Rows
  const controlAuditRows: ClaimControlAuditRow[] = useMemo(() => {
    const finMap = new Map<string, ClaimFinancialRow>();
    allFinancialRows.forEach((r) => finMap.set(r.claimId, r));

    const alertsByClaim = new Map<string, SmartAlertItem[]>();
    allAlertItems.forEach((a) => {
      const list = alertsByClaim.get(a.claimId) || [];
      list.push(a);
      alertsByClaim.set(a.claimId, list);
    });

    return claims.map((c) => {
      const fRow = finMap.get(c.id);
      const cAlerts = alertsByClaim.get(c.id) || [];
      const dbRow = dbClaimsRows.get(c.id) || {};
      return evaluateClaimControlAudit(c, fRow, cAlerts);
    });
  }, [claims, allFinancialRows, allAlertItems, dbClaimsRows]);

  const controlSummary: ControlAuditSummary = useMemo(() => {
    return computeControlAuditSummary(controlAuditRows);
  }, [controlAuditRows]);

  const filteredControlRows: ClaimControlAuditRow[] = useMemo(() => {
    return controlAuditRows.filter((r) => {
      if (controlStatusFilter !== 'all' && r.auditStatus !== controlStatusFilter) return false;
      if (filters.searchTerm) {
        const q = filters.searchTerm.toLowerCase();
        return (
          r.clientName.toLowerCase().includes(q) ||
          r.plate.includes(q) ||
          r.claimId.toLowerCase().includes(q) ||
          r.insCompany.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [controlAuditRows, controlStatusFilter, filters.searchTerm]);

  // Financial Analytics Sub-Reports
  const recurringDeductions: RecurringDeductionAnalysis[] = useMemo(() => {
    return analyzeRecurringDeductions(filteredFinancialRows);
  }, [filteredFinancialRows]);

  const cycleTimes: CycleTimesAnalysis = useMemo(() => {
    return analyzeCycleTimes(filteredFinancialRows);
  }, [filteredFinancialRows]);

  const cashForecast: CashForecastBucket[] = useMemo(() => {
    return analyzeCashForecast(filteredFinancialRows);
  }, [filteredFinancialRows]);

  const profitabilityRows: ClaimProfitabilityRow[] = useMemo(() => {
    return analyzeClaimProfitability(filteredFinancialRows, dbClaimQuotesFull);
  }, [filteredFinancialRows, dbClaimQuotesFull]);

  const dailyBriefingText = useMemo(() => {
    return generateDailyAiBriefing(alertsSummary, allAlertItems);
  }, [alertsSummary, allAlertItems]);

  // 10 Core Overview Indicators
  const overviewMetrics = useMemo(() => {
    const totalClaims = claims.length;
    const openClaims = claims.filter((c) => c.status !== 'הסתיים' && c.status !== 'סגור' && c.status !== 'בוטל' && (c as any).archived !== 'true');
    const closedClaims = claims.filter((c) => c.status === 'הסתיים' || c.status === 'סגור' || c.status === 'בוטל' || (c as any).archived === 'true');
    const waitingTreatment = openClaims.filter((c) => c.nextAction || (c as any).treatmentItem || (c as any).lastTreatmentAction);
    const inactiveClaims = controlAuditRows.filter((r) => !r.isClosed && r.daysSinceCreation >= staleThresholdDays);
    const legalClaims = filteredFinancialRows.filter((r) => r.isLegal);
    const missingDocsClaims = controlAuditRows.filter((r) => !r.isClosed && r.docChecklist.missingItems.length > 0);
    const activeAlertsClaims = filteredFinancialRows.filter((r) => allAlertItems.some((a) => a.claimId === r.claimId));

    const totalDebts = filteredFinancialRows.reduce((acc, r) => acc + (r.debtAmount || 0), 0);
    const totalPaid = filteredFinancialRows.reduce((acc, r) => acc + (r.paidAmount || 0), 0);

    return {
      totalClaims,
      openClaims,
      closedClaims,
      waitingTreatment,
      inactiveClaims,
      legalClaims,
      missingDocsClaims,
      activeAlertsClaims,
      totalDebts,
      totalPaid,
    };
  }, [claims, controlAuditRows, filteredFinancialRows, allAlertItems, staleThresholdDays]);

  // Click Handlers
  const handleOpenClaimSafe = (id: string) => {
    if (drilldownModal) setDrilldownModal(null);
    onOpenClaim(id);
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
    const csvContent = exportFinancialToCsv(filteredFinancialRows);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `דוחות_תביעות_דליה_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="cfc-container" data-testid="claims-financial-center" dir="rtl">
      {/* 1. Header Bar */}
      <header className="cfc-header">
        <div className="cfc-header-info">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="cfc-btn cfc-btn-secondary"
              onClick={onBack}
              title="חזרה למסך ניהול תביעות"
              data-testid="cfc-btn-back"
            >
              ← חזרה לתביעות
            </button>
            <h1 className="cfc-header-title">
              📊 מרכז דוחות ניהול תביעות — דשבורד מנהלים
            </h1>
            <span className="cfc-badge-pill">דליה STAGING</span>
          </div>
          <p className="cfc-header-desc">
            תמונת מצב ניהולית מלאה: סקירה כללית, כספים וגבייה, בקרת מסמכים, התראות, חברות ביטוח ואימיילים מתועדים.
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
            data-testid="cfc-btn-export"
          >
            📥 ייצוא ל-Excel
          </button>
          <button
            type="button"
            className="cfc-btn cfc-btn-secondary"
            onClick={handlePrint}
            title="הדפסת דוח / שמירה כ-PDF"
            data-testid="cfc-btn-print"
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

      {/* 2. Top-Level 7 Primary Navigation Tabs */}
      <nav className="cfc-main-nav" data-testid="cfc-main-nav">
        <button
          type="button"
          data-testid="tab-overview"
          className={`cfc-main-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <span>📊 א. סקירה כללית</span>
        </button>
        <button
          type="button"
          data-testid="tab-finances"
          className={`cfc-main-tab ${activeTab === 'finances' ? 'active' : ''}`}
          onClick={() => setActiveTab('finances')}
        >
          <span>💰 ב. כספים וגבייה</span>
          <span className="cfc-main-tab-badge">{formatCurrencyDetailed(overviewMetrics.totalDebts)}</span>
        </button>
        <button
          type="button"
          data-testid="tab-control"
          className={`cfc-main-tab ${activeTab === 'control' ? 'active' : ''}`}
          onClick={() => setActiveTab('control')}
        >
          <span>🛡️ ג. בקרת תיקים ומסמכים</span>
          <span className="cfc-main-tab-badge">{controlSummary.yellowCount + controlSummary.redCount}</span>
        </button>
        <button
          type="button"
          data-testid="tab-alerts"
          className={`cfc-main-tab ${activeTab === 'alerts' ? 'active' : ''}`}
          onClick={() => setActiveTab('alerts')}
        >
          <span>⚡ ד. התראות ומשימות</span>
          <span className="cfc-main-tab-badge">{alertsSummary.criticalRedCount + alertsSummary.warningYellowCount}</span>
        </button>
        <button
          type="button"
          data-testid="tab-insurers"
          className={`cfc-main-tab ${activeTab === 'insurers' ? 'active' : ''}`}
          onClick={() => setActiveTab('insurers')}
        >
          <span>🏢 ה. חברות ביטוח</span>
          <span className="cfc-main-tab-badge">{insurersSummary.length}</span>
        </button>
        <button
          type="button"
          data-testid="tab-communication"
          className={`cfc-main-tab ${activeTab === 'communication' ? 'active' : ''}`}
          onClick={() => setActiveTab('communication')}
        >
          <span>✉️ ו. תקשורת ואימיילים</span>
          <span className="cfc-main-tab-badge">{commSummary.totalSent}</span>
        </button>
        <button
          type="button"
          data-testid="tab-operational"
          className={`cfc-main-tab ${activeTab === 'operational' ? 'active' : ''}`}
          onClick={() => setActiveTab('operational')}
        >
          <span>🔧 ז. דוחות נוספים ותפעוליים</span>
          <span className="cfc-main-tab-badge">{garageCases.length}</span>
        </button>
      </nav>

      {/* 3. TAB 1: א. סקירה כללית (Executive Overview) */}
      {activeTab === 'overview' && (
        <div className="cfc-view-body" data-testid="cfc-view-overview">
          {/* Executive Summary Box */}
          <div className="cfc-summary-box">
            <div className="cfc-summary-content">
              <h2 className="cfc-summary-title">💡 תמונת מצב תפעולית וכספית</h2>
              <p className="cfc-summary-text">
                במערכת רשומים <strong>{overviewMetrics.totalClaims}</strong> תיקי תביעה, מתוכם{' '}
                <strong>{overviewMetrics.openClaims.length}</strong> בטיפול פעיל ו-
                <strong>{overviewMetrics.closedClaims.length}</strong> סגורים ומבוקרים. אותרו{' '}
                <strong style={{ color: '#b91c1c' }}>{overviewMetrics.activeAlertsClaims.length}</strong> תיקים עם התראות פעילות,{' '}
                <strong>{overviewMetrics.missingDocsClaims.length}</strong> תיקים חסרי מסמכים, ויתרת חוב מאומתת בסך{' '}
                <strong style={{ color: '#b91c1c' }}>{formatCurrencyDetailed(overviewMetrics.totalDebts)}</strong>.
              </p>
            </div>
            <div className="cfc-summary-actions">
              <button
                type="button"
                className="cfc-btn cfc-btn-primary"
                onClick={() => setBriefingModalOpen(true)}
              >
                ✨ הפק תדריך מנהלים יומי
              </button>
            </div>
          </div>

          {/* 10 Core Indicator Cards */}
          <div className="cfc-overview-grid" data-testid="cfc-overview-10-cards">
            {/* Card 1: Total Claims */}
            <div
              className="cfc-overview-card tone-blue"
              data-testid="overview-card-total"
              onClick={() => {
                setDrilldownModal({
                  title: 'כלל תיקי התביעה במערכת',
                  items: claims.map((c) => ({
                    claimId: c.id,
                    plate: c.plate || '—',
                    clientName: c.clientName || '—',
                    insCompany: c.insCompany || 'לא צוינה',
                    status: c.status || 'חדש',
                    subtext: c.claimKind || 'תביעה',
                  })),
                });
              }}
              title="לחץ לצפייה בכל התיקים"
            >
              <div className="cfc-overview-card-top">
                <span className="cfc-overview-card-title">1. סה"כ תיקים</span>
                <span className="cfc-overview-card-icon">📁</span>
              </div>
              <div className="cfc-overview-card-val">{overviewMetrics.totalClaims}</div>
              <div className="cfc-overview-card-sub">כלל הרשומות במערכת דליה</div>
            </div>

            {/* Card 2: Open Claims */}
            <div
              className="cfc-overview-card tone-blue"
              data-testid="overview-card-open"
              onClick={() => {
                setDrilldownModal({
                  title: 'תיקי תביעה פתוחים בטיפול',
                  items: overviewMetrics.openClaims.map((c) => ({
                    claimId: c.id,
                    plate: c.plate || '—',
                    clientName: c.clientName || '—',
                    insCompany: c.insCompany || 'לא צוינה',
                    status: c.status || 'חדש',
                    subtext: c.nextAction || 'פתוח בטיפול',
                  })),
                });
              }}
              title="לחץ לצפייה בתיקים הפתוחים"
            >
              <div className="cfc-overview-card-top">
                <span className="cfc-overview-card-title">2. תיקים פתוחים</span>
                <span className="cfc-overview-card-icon">📂</span>
              </div>
              <div className="cfc-overview-card-val">{overviewMetrics.openClaims.length}</div>
              <div className="cfc-overview-card-sub">בטיפול פעיל מול ביטוח/לקוח</div>
            </div>

            {/* Card 3: Closed Claims */}
            <div
              className="cfc-overview-card tone-green"
              data-testid="overview-card-closed"
              onClick={() => {
                setDrilldownModal({
                  title: 'תיקי תביעה סגורים',
                  items: overviewMetrics.closedClaims.map((c) => ({
                    claimId: c.id,
                    plate: c.plate || '—',
                    clientName: c.clientName || '—',
                    insCompany: c.insCompany || 'לא צוינה',
                    status: c.status || 'סגור',
                    subtext: 'הטיפול הסתיים',
                  })),
                });
              }}
              title="לחץ לצפייה בתיקים סגורים"
            >
              <div className="cfc-overview-card-top">
                <span className="cfc-overview-card-title">3. תיקים סגורים</span>
                <span className="cfc-overview-card-icon">✅</span>
              </div>
              <div className="cfc-overview-card-val">{overviewMetrics.closedClaims.length}</div>
              <div className="cfc-overview-card-sub">הסתיימו לאחר גבייה מלאה</div>
            </div>

            {/* Card 4: Waiting Treatment */}
            <div
              className="cfc-overview-card tone-amber"
              data-testid="overview-card-waiting"
              onClick={() => {
                setDrilldownModal({
                  title: 'תיקים שממתינים לפעולת טיפול',
                  items: overviewMetrics.waitingTreatment.map((c) => ({
                    claimId: c.id,
                    plate: c.plate || '—',
                    clientName: c.clientName || '—',
                    insCompany: c.insCompany || 'לא צוינה',
                    status: c.status || 'ממתין',
                    subtext: c.nextAction || 'דרושה פעולה',
                  })),
                });
              }}
              title="לחץ לצפייה בתיקים שממתינים לטיפול"
            >
              <div className="cfc-overview-card-top">
                <span className="cfc-overview-card-title">4. ממתינים לטיפול</span>
                <span className="cfc-overview-card-icon">⏳</span>
              </div>
              <div className="cfc-overview-card-val">{overviewMetrics.waitingTreatment.length}</div>
              <div className="cfc-overview-card-sub">מוגדרת פעולה נדרשת</div>
            </div>

            {/* Card 5: Inactive Claims */}
            <div
              className="cfc-overview-card tone-amber"
              data-testid="overview-card-inactive"
              onClick={() => {
                setDrilldownModal({
                  title: `תיקים ללא פעילות מעל ${staleThresholdDays} ימים`,
                  items: overviewMetrics.inactiveClaims.map((r) => ({
                    claimId: r.claimId,
                    plate: r.plate,
                    clientName: r.clientName,
                    insCompany: r.insCompany,
                    status: r.status,
                    subtext: `${r.daysSinceCreation} ימים ממועד פתיחה`,
                  })),
                });
              }}
              title="לחץ לצפייה בתיקים ללא פעילות"
            >
              <div className="cfc-overview-card-top">
                <span className="cfc-overview-card-title">5. ללא פעילות (&gt;{staleThresholdDays}ד)</span>
                <span className="cfc-overview-card-icon">💤</span>
              </div>
              <div className="cfc-overview-card-val">{overviewMetrics.inactiveClaims.length}</div>
              <div className="cfc-overview-card-sub">ללא פעולה מבצעית מתועדת</div>
            </div>

            {/* Card 6: Legal Claims */}
            <div
              className="cfc-overview-card tone-amber"
              data-testid="overview-card-legal"
              onClick={() => {
                setDrilldownModal({
                  title: 'תיקים בטיפול משפטי',
                  items: overviewMetrics.legalClaims.map((r) => ({
                    claimId: r.claimId,
                    plate: r.plate,
                    clientName: r.clientName,
                    insCompany: r.insCompany,
                    status: r.status,
                    amount: r.debtAmount,
                    subtext: 'בייצוג משרד עורכי דין',
                  })),
                });
              }}
              title="לחץ לצפייה בתיקים משפטיים"
            >
              <div className="cfc-overview-card-top">
                <span className="cfc-overview-card-title">6. טיפול משפטי</span>
                <span className="cfc-overview-card-icon">⚖️</span>
              </div>
              <div className="cfc-overview-card-val">{overviewMetrics.legalClaims.length}</div>
              <div className="cfc-overview-card-sub">הועברו לעו"ד / בתביעה משפטית</div>
            </div>

            {/* Card 7: Missing Documents */}
            <div
              className="cfc-overview-card tone-amber"
              data-testid="overview-card-missing-docs"
              onClick={() => {
                setDrilldownModal({
                  title: 'תיקים שחסרים בהם מסמכים',
                  items: overviewMetrics.missingDocsClaims.map((r) => ({
                    claimId: r.claimId,
                    plate: r.plate,
                    clientName: r.clientName,
                    insCompany: r.insCompany,
                    status: r.status,
                    subtext: `חסר: ${r.docChecklist.missingItems.join(', ')}`,
                  })),
                });
              }}
              title="לחץ לצפייה בתיקים חסרי מסמכים"
            >
              <div className="cfc-overview-card-top">
                <span className="cfc-overview-card-title">7. חסרים מסמכים</span>
                <span className="cfc-overview-card-icon">📑</span>
              </div>
              <div className="cfc-overview-card-val">{overviewMetrics.missingDocsClaims.length}</div>
              <div className="cfc-overview-card-sub">דוח שמאי, חשבונית או טופס</div>
            </div>

            {/* Card 8: Active Alerts */}
            <div
              className="cfc-overview-card tone-red"
              data-testid="overview-card-alerts"
              onClick={() => {
                setDrilldownModal({
                  title: 'תיקים עם התראות פעילות',
                  items: overviewMetrics.activeAlertsClaims.map((r) => ({
                    claimId: r.claimId,
                    plate: r.plate,
                    clientName: r.clientName,
                    insCompany: r.insCompany,
                    status: r.status,
                    amount: r.debtAmount,
                    subtext: 'קיימת התראה פעילה בתיק',
                  })),
                });
              }}
              title="לחץ לצפייה בתיקים עם התראות"
            >
              <div className="cfc-overview-card-top">
                <span className="cfc-overview-card-title">8. עם התראות</span>
                <span className="cfc-overview-card-icon">🚨</span>
              </div>
              <div className="cfc-overview-card-val">{overviewMetrics.activeAlertsClaims.length}</div>
              <div className="cfc-overview-card-sub">סך {alertsSummary.totalAlerts} התראות פעילות</div>
            </div>

            {/* Card 9: Total Debts */}
            <div
              className="cfc-overview-card tone-red"
              data-testid="overview-card-debts"
              onClick={() => {
                setDrilldownModal({
                  title: 'יתרות חוב מאומתות לגבייה',
                  items: filteredFinancialRows
                    .filter((r) => r.debtAmount && r.debtAmount > 0)
                    .map((r) => ({
                      claimId: r.claimId,
                      plate: r.plate,
                      clientName: r.clientName,
                      insCompany: r.insCompany,
                      status: r.status,
                      amount: r.debtAmount,
                      subtext: `ותק: ${r.agingDays || 0} ימים`,
                    })),
                });
              }}
              title="לחץ לצפייה בפירוט יתרות חוב"
            >
              <div className="cfc-overview-card-top">
                <span className="cfc-overview-card-title">9. יתרות חוב מאומתות</span>
                <span className="cfc-overview-card-icon">💳</span>
              </div>
              <div className="cfc-overview-card-val">{formatCurrencyDetailed(overviewMetrics.totalDebts)}</div>
              <div className="cfc-overview-card-sub">יתרות חוב פתוחות מול ביטוח</div>
            </div>

            {/* Card 10: Received Payments */}
            <div
              className="cfc-overview-card tone-green"
              data-testid="overview-card-paid"
              onClick={() => {
                setDrilldownModal({
                  title: 'תקבולים שהתקבלו בפועל',
                  items: filteredFinancialRows
                    .filter((r) => r.paidAmount && r.paidAmount > 0)
                    .map((r) => ({
                      claimId: r.claimId,
                      plate: r.plate,
                      clientName: r.clientName,
                      insCompany: r.insCompany,
                      status: r.status,
                      amount: r.paidAmount,
                      subtext: r.lastPaymentDateStr || 'שולם',
                    })),
                });
              }}
              title="לחץ לצפייה בתקבולים שהתקבלו בפועל"
            >
              <div className="cfc-overview-card-top">
                <span className="cfc-overview-card-title">10. כספים שהתקבלו</span>
                <span className="cfc-overview-card-icon">💰</span>
              </div>
              <div className="cfc-overview-card-val">{formatCurrencyDetailed(overviewMetrics.totalPaid)}</div>
              <div className="cfc-overview-card-sub">תשלומים שנפרעו ואומתו</div>
            </div>
          </div>
        </div>
      )}

      {/* 4. TAB 2: ב. כספים וגבייה (Finances & Collections) */}
      {activeTab === 'finances' && (
        <div className="cfc-view-body" data-testid="cfc-view-finances">
          {/* Sub-Nav Pills */}
          <div className="cfc-sub-nav">
            <button
              type="button"
              className={`cfc-sub-nav-btn ${financesSubTab === 'kpis' ? 'active' : ''}`}
              onClick={() => setFinancesSubTab('kpis')}
              data-testid="fin-subtab-kpis"
            >
              📊 15 מדדים כספיים
            </button>
            <button
              type="button"
              className={`cfc-sub-nav-btn ${financesSubTab === 'debts' ? 'active' : ''}`}
              onClick={() => setFinancesSubTab('debts')}
              data-testid="fin-subtab-debts"
            >
              ⚖️ ספר חובות והזדקנות ({filteredFinancialRows.filter((r) => r.debtAmount && r.debtAmount > 0).length})
            </button>
            <button
              type="button"
              className={`cfc-sub-nav-btn ${financesSubTab === 'payments' ? 'active' : ''}`}
              onClick={() => setFinancesSubTab('payments')}
              data-testid="fin-subtab-payments"
            >
              💳 תשלומים וקיזוזים
            </button>
            <button
              type="button"
              className={`cfc-sub-nav-btn ${financesSubTab === 'cycles' ? 'active' : ''}`}
              onClick={() => setFinancesSubTab('cycles')}
              data-testid="fin-subtab-cycles"
            >
              ⏱️ זמני טיפול ותחזית תזרים
            </button>
            <button
              type="button"
              className={`cfc-sub-nav-btn ${financesSubTab === 'profitability' ? 'active' : ''}`}
              onClick={() => setFinancesSubTab('profitability')}
              data-testid="fin-subtab-profitability"
            >
              📈 רווחיות תיק (ספק מול לקוח)
            </button>
            <button
              type="button"
              className={`cfc-sub-nav-btn ${financesSubTab === 'traceability' ? 'active' : ''}`}
              onClick={() => setFinancesSubTab('traceability')}
              data-testid="fin-subtab-traceability"
            >
              🔍 מעקב מקורות כספיים
            </button>
          </div>

          {/* Sub-Filter Bar */}
          <div className="cfc-filter-bar">
            <div className="cfc-filter-group">
              <label className="cfc-filter-label">חיפוש:</label>
              <input
                type="text"
                className="cfc-input"
                placeholder="לקוח, מספר רכב, חברת ביטוח..."
                value={filters.searchTerm}
                onChange={(e) => setFilters({ ...filters, searchTerm: e.target.value })}
              />
            </div>
            <div className="cfc-filter-group">
              <label className="cfc-filter-label">חברת ביטוח:</label>
              <select
                className="cfc-select"
                value={filters.insurer}
                onChange={(e) => setFilters({ ...filters, insurer: e.target.value })}
              >
                <option value="all">כל החברות</option>
                {insurersSummary.map((ins) => (
                  <option key={ins.insCompany} value={ins.insCompany}>
                    {ins.insCompany} ({ins.claimsCount})
                  </option>
                ))}
              </select>
            </div>
            <div className="cfc-filter-group">
              <label className="cfc-filter-label">תקופה:</label>
              <select
                className="cfc-select"
                value={filters.period}
                onChange={(e) => setFilters({ ...filters, period: e.target.value as any })}
              >
                <option value="all">כל התקופות</option>
                <option value="this_month">החודש הנוכחי</option>
                <option value="last_month">חודש שעבר</option>
                <option value="this_year">השנה הנוכחית</option>
              </select>
            </div>
          </div>

          {/* Sub-Tab 1: 15 KPI Cards */}
          {financesSubTab === 'kpis' && (
            <div className="cfc-kpi-grid" data-testid="cfc-15-kpis-grid">
              {kpiData.map((kpi) => (
                <div
                  key={kpi.id}
                  className={`cfc-kpi-card ${kpi.tone}`}
                  onClick={() => {
                    if (kpi.drilldownItems.length > 0) {
                      setDrilldownModal({
                        title: kpi.title,
                        items: kpi.drilldownItems.map((r) => ({
                          claimId: r.claimId,
                          plate: r.plate,
                          clientName: r.clientName,
                          insCompany: r.insCompany,
                          status: r.status,
                          amount: r.debtAmount || r.paidAmount || r.approvedAmount || r.demandAmount,
                        })),
                      });
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  title={`${kpi.title} - לחץ לפירוט תיקים`}
                >
                  <div className="cfc-kpi-card-title">{kpi.title}</div>
                  <div className="cfc-kpi-card-value">{kpi.value}</div>
                  <div className="cfc-kpi-card-sub">{kpi.subtext}</div>
                </div>
              ))}
            </div>
          )}

          {/* Sub-Tab 2: Debts & Aging Ledger */}
          {financesSubTab === 'debts' && (
            <div className="cfc-table-wrapper" data-testid="cfc-debts-table">
              <div style={{ padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'center', background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>מיון יתרות חוב:</span>
                <button
                  type="button"
                  className={`cfc-btn ${debtSort === 'debt_desc' ? 'cfc-btn-primary' : 'cfc-btn-secondary'}`}
                  onClick={() => setDebtSort('debt_desc')}
                  data-testid="cfc-sort-debt"
                >
                  לפי יתרת חוב
                </button>
                <button
                  type="button"
                  className={`cfc-btn ${debtSort === 'aging_desc' ? 'cfc-btn-primary' : 'cfc-btn-secondary'}`}
                  onClick={() => setDebtSort('aging_desc')}
                  data-testid="cfc-sort-aging"
                >
                  לפי ותק חוב (ימים)
                </button>
                <button
                  type="button"
                  className={`cfc-btn ${debtSort === 'insurer' ? 'cfc-btn-primary' : 'cfc-btn-secondary'}`}
                  onClick={() => setDebtSort('insurer')}
                  data-testid="cfc-sort-insurer"
                >
                  לפי חברת ביטוח
                </button>
              </div>
              <table className="cfc-table">
                <thead>
                  <tr>
                    <th>מספר תיק</th>
                    <th>לקוח ורכב</th>
                    <th>חברת ביטוח</th>
                    <th>דרישה פורמלית</th>
                    <th>סכום מאושר</th>
                    <th>שולם בפועל</th>
                    <th>יתרת חוב מאומתת</th>
                    <th>ותק חוב (ימים)</th>
                    <th>קטגוריית הזדקנות</th>
                    <th>פעולה</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFinancialRows
                    .filter((r) => r.debtAmount !== null && r.debtAmount > 0)
                    .sort((a, b) => {
                      if (debtSort === 'debt_desc') return (b.debtAmount || 0) - (a.debtAmount || 0);
                      if (debtSort === 'aging_desc') return (b.agingDays || 0) - (a.agingDays || 0);
                      return a.insCompany.localeCompare(b.insCompany);
                    })
                    .map((row) => (
                      <tr key={row.claimId}>
                        <td style={{ fontWeight: 800 }}>{row.claimId}</td>
                        <td>
                          <div style={{ fontWeight: 700 }}>{row.clientName}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{row.plate}</div>
                        </td>
                        <td>{row.insCompany}</td>
                        <td>{formatCurrencyDetailed(row.demandAmount)}</td>
                        <td>{formatCurrencyDetailed(row.approvedAmount)}</td>
                        <td style={{ color: '#166534', fontWeight: 700 }}>{formatCurrencyDetailed(row.paidAmount)}</td>
                        <td style={{ color: '#b91c1c', fontWeight: 800 }}>{formatCurrencyDetailed(row.debtAmount)}</td>
                        <td>
                          <span style={{ fontWeight: (row.agingDays || 0) > 60 ? 800 : 500 }}>
                            {row.agingDays || 0} ימים
                          </span>
                        </td>
                        <td>
                          <span className={`cfc-tag ${row.agingBucket === '90+ יום' ? 'status-debt' : 'status-partial'}`}>
                            {row.agingBucket}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="cfc-btn-open-claim"
                            onClick={() => handleOpenClaimSafe(row.claimId)}
                          >
                            פתח כרטיס
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Sub-Tab 3: Payments & Deductions */}
          {financesSubTab === 'payments' && (
            <div className="cfc-table-wrapper" data-testid="cfc-payments-table">
              <table className="cfc-table">
                <thead>
                  <tr>
                    <th>מספר תיק</th>
                    <th>לקוח ורכב</th>
                    <th>חברת ביטוח</th>
                    <th>סטטוס תשלום</th>
                    <th>סכום ששולם</th>
                    <th>מועד תשלום אחרון</th>
                    <th>סכום קיזוז</th>
                    <th>נימוק קיזוז</th>
                    <th>אימות אסמכתא</th>
                    <th>פעולה</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFinancialRows.map((row) => (
                    <tr key={row.claimId}>
                      <td style={{ fontWeight: 800 }}>{row.claimId}</td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{row.clientName}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{row.plate}</div>
                      </td>
                      <td>{row.insCompany}</td>
                      <td>
                        <span className={`cfc-tag ${row.paymentStatus === 'paid' ? 'status-paid' : row.paymentStatus === 'partial' ? 'status-partial' : 'status-debt'}`}>
                          {row.paymentStatus === 'paid' ? 'שולם במלואו' : row.paymentStatus === 'partial' ? 'שולם חלקית' : 'טרם שולם'}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700 }}>{formatCurrencyDetailed(row.paidAmount)}</td>
                      <td>{row.lastPaymentDateStr || 'טרם שולם'}</td>
                      <td style={{ color: row.deductionAmount ? '#b45309' : 'inherit', fontWeight: row.deductionAmount ? 700 : 400 }}>
                        {formatCurrencyDetailed(row.deductionAmount)}
                      </td>
                      <td>{row.deductionReason ? translateDeductionCategory(row.deductionReason) : '-'}</td>
                      <td>
                        <span className={`cfc-tag ${row.verificationStatus === 'verified' ? 'status-paid' : ''}`}>
                          {row.verificationStatus === 'verified' ? 'מאומת' : 'טרם אומת'}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="cfc-btn-open-claim"
                          onClick={() => handleOpenClaimSafe(row.claimId)}
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

          {/* Sub-Tab 4: Cycle Times & Forecast */}
          {financesSubTab === 'cycles' && (
            <div className="cfc-table-wrapper" data-testid="cfc-cycle-times-view" style={{ padding: 16 }}>
              <h3 style={{ margin: '0 0 12px 0' }}>⏱️ זמני טיפול ממוצעים במחזור תביעה</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 20 }}>
                <div className="cfc-kpi-card tone-blue">
                  <div className="cfc-kpi-card-title">מפתיחה להגשת דרישה</div>
                  <div className="cfc-kpi-card-value">{cycleTimes.avgDaysOpenToDemand !== null ? `${cycleTimes.avgDaysOpenToDemand} ימים` : 'אין נתון'}</div>
                  <div className="cfc-kpi-card-sub">משך איסוף מסמכים ועבודה במוסך</div>
                </div>
                <div className="cfc-kpi-card tone-amber">
                  <div className="cfc-kpi-card-title">מדרישה לתשלום ראשון</div>
                  <div className="cfc-kpi-card-value">{cycleTimes.avgDaysDemandToPayment !== null ? `${cycleTimes.avgDaysDemandToPayment} ימים` : 'אין נתון'}</div>
                  <div className="cfc-kpi-card-sub">משך טיפול חברת הביטוח עד פירעון</div>
                </div>
                <div className="cfc-kpi-card tone-green">
                  <div className="cfc-kpi-card-title">משך טיפול כולל לסגירה</div>
                  <div className="cfc-kpi-card-value">{cycleTimes.avgDaysOpenToResolution !== null ? `${cycleTimes.avgDaysOpenToResolution} ימים` : 'אין נתון'}</div>
                  <div className="cfc-kpi-card-sub">מפתיחת התיק עד גבייה מלאה</div>
                </div>
              </div>

              <h3 style={{ margin: '16px 0 12px 0' }}>🔮 תחזית גבייה צפויה (התחייבויות מאומתות בלבד)</h3>
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
                      <td style={{ fontWeight: 800, color: '#166534' }}>{formatCurrencyDetailed(b.expectedAmount)}</td>
                      <td>{b.claimsCount} תיקים</td>
                      <td style={{ fontSize: 12, color: '#475569' }}>{b.basis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Sub-Tab 5: Profitability */}
          {financesSubTab === 'profitability' && (
            <div className="cfc-table-wrapper" data-testid="cfc-profitability-view">
              <table className="cfc-table">
                <thead>
                  <tr>
                    <th>מספר תיק</th>
                    <th>לקוח ורכב</th>
                    <th>חברת ביטוח</th>
                    <th>הכנסה מאושרת</th>
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
                      <td style={{ fontWeight: 800 }}>{p.claimId}</td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{p.clientName}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{p.plate}</div>
                      </td>
                      <td>{p.insCompany}</td>
                      <td style={{ fontWeight: 700 }}>{formatCurrencyOrMissing(p.customerIncome)}</td>
                      <td>{formatCurrencyOrMissing(p.supplierCost)}</td>
                      <td style={{ fontWeight: 800, color: (p.grossProfit || 0) >= 0 ? '#166534' : '#b91c1c' }}>
                        {formatCurrencyOrMissing(p.grossProfit)}
                      </td>
                      <td>{p.profitMarginPct !== null ? `${p.profitMarginPct}%` : '—'}</td>
                      <td>
                        <span className={`cfc-tag ${p.isCalculable ? 'status-paid' : ''}`}>
                          {p.statusNote}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="cfc-btn-open-claim"
                          onClick={() => handleOpenClaimSafe(p.claimId)}
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

          {/* Sub-Tab 6: Traceability */}
          {financesSubTab === 'traceability' && (
            <div className="cfc-table-wrapper" data-testid="cfc-traceability-view">
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
                  {filteredFinancialRows.map((row) => (
                    <tr key={row.claimId}>
                      <td style={{ fontWeight: 800 }}>{row.claimId}</td>
                      <td>{row.clientName}</td>
                      <td dir="ltr" style={{ textAlign: 'right' }}>{row.plate}</td>
                      <td>{row.insCompany}</td>
                      <td>{formatCurrencyDetailed(row.demandAmount)}</td>
                      <td>{formatCurrencyDetailed(row.quoteAmount)}</td>
                      <td>{formatCurrencyDetailed(row.approvedAmount)}</td>
                      <td style={{ color: '#166534', fontWeight: 700 }}>{formatCurrencyDetailed(row.paidAmount)}</td>
                      <td style={{ color: row.debtAmount ? '#b91c1c' : 'inherit', fontWeight: 700 }}>
                        {formatCurrencyDetailed(row.debtAmount)}
                      </td>
                      <td><span className="cfc-tag">{row.sourceDescription}</span></td>
                      <td>
                        <button
                          type="button"
                          className="cfc-btn-open-claim"
                          onClick={() => handleOpenClaimSafe(row.claimId)}
                        >
                          פתח כרטיס
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

      {/* 5. TAB 3: ג. בקרת תיקים ומסמכים (Case & Document Control) */}
      {activeTab === 'control' && (
        <div className="cfc-view-body" data-testid="cfc-view-control">
          {/* 4 Status Summary Cards */}
          <div className="cfc-control-grid" data-testid="cfc-control-4-cards">
            {/* Green: Completed & Clean */}
            <div
              className={`cfc-control-card status-green ${controlStatusFilter === 'green' ? 'active' : ''}`}
              data-testid="control-card-green"
              onClick={() => setControlStatusFilter(controlStatusFilter === 'green' ? 'all' : 'green')}
              role="button"
              tabIndex={0}
              title="לחץ לסינון תיקים תקינים"
            >
              <div className="cfc-control-label">
                <span>🟢</span>
                <span>הבקרה הושלמה — תקין</span>
              </div>
              <div className="cfc-control-count">{controlSummary.greenCount}</div>
              <div className="cfc-control-sub">כל מסמכי הליבה קיימים וללא ליקויים</div>
            </div>

            {/* Yellow: Missing docs / in review */}
            <div
              className={`cfc-control-card status-yellow ${controlStatusFilter === 'yellow' ? 'active' : ''}`}
              data-testid="control-card-yellow"
              onClick={() => setControlStatusFilter(controlStatusFilter === 'yellow' ? 'all' : 'yellow')}
              role="button"
              tabIndex={0}
              title="לחץ לסינון תיקים חסרי מסמך"
            >
              <div className="cfc-control-label">
                <span>🟡</span>
                <span>חסר מסמך / בבדיקה</span>
              </div>
              <div className="cfc-control-count">{controlSummary.yellowCount}</div>
              <div className="cfc-control-sub">ממתין להשלמת טופס, חשבונית או שמאות</div>
            </div>

            {/* Red: Critical finding / overdue */}
            <div
              className={`cfc-control-card status-red ${controlStatusFilter === 'red' ? 'active' : ''}`}
              data-testid="control-card-red"
              onClick={() => setControlStatusFilter(controlStatusFilter === 'red' ? 'all' : 'red')}
              role="button"
              tabIndex={0}
              title="לחץ לסינון תיקים עם ליקוי מהותי"
            >
              <div className="cfc-control-label">
                <span>🔴</span>
                <span>ליקוי מהותי / חריגת מועד</span>
              </div>
              <div className="cfc-control-count">{controlSummary.redCount}</div>
              <div className="cfc-control-sub">איחור קריטי, אי-התאמה כספית או שיהוי</div>
            </div>

            {/* Gray: Fresh / not reviewed */}
            <div
              className={`cfc-control-card status-gray ${controlStatusFilter === 'gray' ? 'active' : ''}`}
              data-testid="control-card-gray"
              onClick={() => setControlStatusFilter(controlStatusFilter === 'gray' ? 'all' : 'gray')}
              role="button"
              tabIndex={0}
              title="לחץ לסינון תיקים שטרם נבדקו"
            >
              <div className="cfc-control-label">
                <span>⚪</span>
                <span>טרם נבדק / חסר מידע</span>
              </div>
              <div className="cfc-control-count">{controlSummary.grayCount}</div>
              <div className="cfc-control-sub">קליטה חדשה שטרם עברה בקרת איכות</div>
            </div>
          </div>

          {/* Document Missing Breakdown Banner */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', background: '#f8fafc', padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1' }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>סיכום חוסרים עיקריים:</span>
            <span className="cfc-tag">📑 חסרי דוח שמאי: {controlSummary.missingSurveyorReportsCount}</span>
            <span className="cfc-tag">🧾 חסרי חשבונית: {controlSummary.missingInvoicesCount}</span>
            <span className="cfc-tag">📝 חסרי טופס דיווח: {controlSummary.missingAccidentFormsCount}</span>
            <span className="cfc-tag">📷 חסרי צילומי נזק: {controlSummary.missingPhotosCount}</span>
          </div>

          {/* Control Table */}
          <div className="cfc-table-wrapper" data-testid="cfc-control-table">
            <table className="cfc-table">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>סטטוס בקרה</th>
                  <th>מספר תיק</th>
                  <th>לקוח ורכב</th>
                  <th>חברת ביטוח</th>
                  <th>מסמכים קיימים / חסרים</th>
                  <th>ממצאי בקרה ופעולה נדרשת</th>
                  <th>אחראי טיפול</th>
                  <th>פעולה</th>
                </tr>
              </thead>
              <tbody>
                {filteredControlRows.map((r) => (
                  <tr key={r.claimId}>
                    <td>
                      <span className={`cfc-alert-severity-pill ${r.auditStatus}`}>
                        {r.auditStatus === 'green' ? '🟢 תקין' : r.auditStatus === 'yellow' ? '🟡 חסר מסמך' : r.auditStatus === 'red' ? '🔴 ליקוי' : '⚪ טרם נבדק'}
                      </span>
                    </td>
                    <td style={{ fontWeight: 800 }}>{r.claimId}</td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{r.clientName}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{r.plate}</div>
                    </td>
                    <td><span className="cfc-tag">{r.insCompany}</span></td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                        <span className={`cfc-doc-badge ${r.docChecklist.hasSurveyorReport ? 'ok' : 'missing'}`}>
                          {r.docChecklist.hasSurveyorReport ? '✓ שמאי' : '✗ שמאי'}
                        </span>
                        <span className={`cfc-doc-badge ${r.docChecklist.hasInvoice ? 'ok' : 'missing'}`}>
                          {r.docChecklist.hasInvoice ? '✓ חשבונית' : '✗ חשבונית'}
                        </span>
                        <span className={`cfc-doc-badge ${r.docChecklist.hasAccidentNotice ? 'ok' : 'missing'}`}>
                          {r.docChecklist.hasAccidentNotice ? '✓ דיווח' : '✗ דיווח'}
                        </span>
                        <span className={`cfc-doc-badge ${r.docChecklist.hasDamagePhotos ? 'ok' : 'missing'}`}>
                          {r.docChecklist.hasDamagePhotos ? '✓ תמונות' : '✗ תמונות'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{r.actionRequired}</div>
                      {r.findings.length > 0 && (
                        <div style={{ fontSize: 11, color: '#b91c1c' }}>{r.findings.join(' · ')}</div>
                      )}
                    </td>
                    <td>{r.assignedToName}</td>
                    <td>
                      <button
                        type="button"
                        className="cfc-btn-open-claim"
                        onClick={() => handleOpenClaimSafe(r.claimId)}
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

      {/* 6. TAB 4: ד. התראות ומשימות (Alerts & Action Queue) */}
      {activeTab === 'alerts' && (
        <div className="cfc-view-body" data-testid="cfc-view-alerts">
          <section className="cfc-alerts-banner" data-testid="cfc-alerts-banner">
            <div className="cfc-alerts-header">
              <div className="cfc-alerts-title">
                <span className="cfc-alerts-icon">⚡</span>
                <div>
                  <h3>תור משימות והתראות — מה דורש טיפול היום?</h3>
                  <p>
                    סה"כ <strong>{alertsSummary.totalAlerts}</strong> התראות ב-
                    <strong>{affectedClaimsCount}</strong> תיקים מושפעים. התראה נסגרת רק עם עדכון נתוני התיק בפועל.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div className="cfc-threshold-toggle" data-testid="cfc-threshold-toggle">
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

                <div style={{ display: 'flex', gap: 6 }}>
                  <span className="cfc-alert-severity-pill red">🔴 {alertsSummary.criticalRedCount} דחופות</span>
                  <span className="cfc-alert-severity-pill yellow">🟡 {alertsSummary.warningYellowCount} למעקב</span>
                </div>
              </div>
            </div>

            {/* 7 Alert Cards */}
            <div className="cfc-7alerts-grid" data-testid="cfc-7alerts-grid">
              <div
                className={`cfc-alert-kpi-card ${alertsSummary.overdueDebtsCount > 0 ? 'severity-red' : 'severity-green'}`}
                data-testid="cfc-alert-card-overdue"
                onClick={() => setAlertKindFilter(alertKindFilter === 'overdue_debt' ? 'all' : 'overdue_debt')}
              >
                <div className="cfc-alert-kpi-top">
                  <span className="cfc-alert-kpi-label">1. חובות באיחור</span>
                  <span className={`cfc-alert-badge-count ${alertsSummary.overdueDebtsCount > 0 ? 'red' : 'green'}`}>
                    {alertsSummary.overdueDebtsCount}
                  </span>
                </div>
                <div className="cfc-alert-kpi-val">{formatCurrencyOrMissing(alertsSummary.overdueDebtsAmount)}</div>
                <div className="cfc-alert-kpi-sub">&gt;30 יום מהדרישה</div>
              </div>

              <div
                className={`cfc-alert-kpi-card ${alertsSummary.partialPaymentsCount > 0 ? 'severity-yellow' : 'severity-green'}`}
                data-testid="cfc-alert-card-partial"
                onClick={() => setAlertKindFilter(alertKindFilter === 'partial_payment' ? 'all' : 'partial_payment')}
              >
                <div className="cfc-alert-kpi-top">
                  <span className="cfc-alert-kpi-label">2. תשלומים חלקיים</span>
                  <span className={`cfc-alert-badge-count ${alertsSummary.partialPaymentsCount > 0 ? 'yellow' : 'green'}`}>
                    {alertsSummary.partialPaymentsCount}
                  </span>
                </div>
                <div className="cfc-alert-kpi-val">{formatCurrencyOrMissing(alertsSummary.partialPaymentsBalance)}</div>
                <div className="cfc-alert-kpi-sub">יתרה לגבייה</div>
              </div>

              <div
                className={`cfc-alert-kpi-card ${alertsSummary.deductionsClarificationCount > 0 ? 'severity-yellow' : 'severity-green'}`}
                data-testid="cfc-alert-card-deductions"
                onClick={() => setAlertKindFilter(alertKindFilter === 'deduction_clarification' ? 'all' : 'deduction_clarification')}
              >
                <div className="cfc-alert-kpi-top">
                  <span className="cfc-alert-kpi-label">3. קיזוזים לבירור</span>
                  <span className={`cfc-alert-badge-count ${alertsSummary.deductionsClarificationCount > 0 ? 'yellow' : 'green'}`}>
                    {alertsSummary.deductionsClarificationCount}
                  </span>
                </div>
                <div className="cfc-alert-kpi-val">{formatCurrencyOrMissing(alertsSummary.deductionsClarificationAmount)}</div>
                <div className="cfc-alert-kpi-sub">הפחתות שכר טרחה ושמאי</div>
              </div>

              <div
                className={`cfc-alert-kpi-card ${alertsSummary.staleClaimsCount > 0 ? 'severity-yellow' : 'severity-green'}`}
                data-testid="cfc-alert-card-stale"
                onClick={() => setAlertKindFilter(alertKindFilter === 'stale_claim' ? 'all' : 'stale_claim')}
              >
                <div className="cfc-alert-kpi-top">
                  <span className="cfc-alert-kpi-label">4. ללא טיפול (&gt;{staleThresholdDays}ד)</span>
                  <span className={`cfc-alert-badge-count ${alertsSummary.staleClaimsCount > 0 ? 'yellow' : 'green'}`}>
                    {alertsSummary.staleClaimsCount}
                  </span>
                </div>
                <div className="cfc-alert-kpi-val">{alertsSummary.staleClaimsCount} תיקים</div>
                <div className="cfc-alert-kpi-sub">{alertsSummary.staleClaims30Count} מעל 30 יום</div>
              </div>

              <div
                className={`cfc-alert-kpi-card ${alertsSummary.missingDocumentsCount > 0 ? 'severity-yellow' : 'severity-green'}`}
                data-testid="cfc-alert-card-docs"
                onClick={() => setAlertKindFilter(alertKindFilter === 'missing_document' ? 'all' : 'missing_document')}
              >
                <div className="cfc-alert-kpi-top">
                  <span className="cfc-alert-kpi-label">5. מסמכים חסרים</span>
                  <span className={`cfc-alert-badge-count ${alertsSummary.missingDocumentsCount > 0 ? 'yellow' : 'green'}`}>
                    {alertsSummary.missingDocumentsCount}
                  </span>
                </div>
                <div className="cfc-alert-kpi-val">{alertsSummary.missingDocumentsCount} חסרים</div>
                <div className="cfc-alert-kpi-sub">חשבוניות / הודעות תשלום</div>
              </div>

              <div
                className={`cfc-alert-kpi-card ${alertsSummary.legalClaimsWithTasksCount > 0 ? 'severity-yellow' : 'severity-green'}`}
                data-testid="cfc-alert-card-legal"
                onClick={() => setAlertKindFilter(alertKindFilter === 'legal_open_task' ? 'all' : 'legal_open_task')}
              >
                <div className="cfc-alert-kpi-top">
                  <span className="cfc-alert-kpi-label">6. משפטי עם משימות</span>
                  <span className={`cfc-alert-badge-count ${alertsSummary.legalClaimsWithTasksCount > 0 ? 'yellow' : 'green'}`}>
                    {alertsSummary.legalClaimsWithTasksCount}
                  </span>
                </div>
                <div className="cfc-alert-kpi-val">{formatCurrencyOrMissing(alertsSummary.legalClaimsAmount)}</div>
                <div className="cfc-alert-kpi-sub">{alertsSummary.legalClaimsWithTasksCount} תיקים</div>
              </div>

              <div
                className={`cfc-alert-kpi-card ${alertsSummary.dataAnomaliesCount > 0 ? 'severity-red' : 'severity-green'}`}
                data-testid="cfc-alert-card-anomalies"
                onClick={() => setAlertKindFilter(alertKindFilter === 'data_anomaly' ? 'all' : 'data_anomaly')}
              >
                <div className="cfc-alert-kpi-top">
                  <span className="cfc-alert-kpi-label">7. איכות נתונים</span>
                  <span className={`cfc-alert-badge-count ${alertsSummary.dataAnomaliesCount > 0 ? 'red' : 'green'}`}>
                    {alertsSummary.dataAnomaliesCount}
                  </span>
                </div>
                <div className="cfc-alert-kpi-val">{alertsSummary.dataAnomaliesCount} ממצאים</div>
                <div className="cfc-alert-kpi-sub">סכומים סותרים / ללא אסמכתא</div>
              </div>
            </div>
          </section>

          {/* Action Queue Table */}
          <div className="cfc-table-wrapper" data-testid="cfc-action-queue">
            <table className="cfc-table">
              <thead>
                <tr>
                  <th style={{ width: 90 }}>דחיפות</th>
                  <th>כותרת ההתראה</th>
                  <th>לקוח ורכב</th>
                  <th>חברת ביטוח</th>
                  <th>סכום רלוונטי</th>
                  <th>שיהוי / ותק</th>
                  <th>אחראי טיפול</th>
                  <th>פעולה נדרשת</th>
                  <th>פעולה</th>
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
                      <div style={{ fontSize: 11, color: '#64748b' }}>{item.plate} · תיק {item.claimId}</div>
                    </td>
                    <td><span className="cfc-tag">{item.insCompany}</span></td>
                    <td style={{ fontWeight: 800, color: item.amount ? '#b91c1c' : '#64748b' }}>
                      {formatCurrencyOrMissing(item.amount)}
                    </td>
                    <td>
                      {item.agingDays !== null ? (
                        <span>{item.agingDays} ימים ({item.agingBucket})</span>
                      ) : (
                        <span>{item.daysInactive} ימי שיהוי</span>
                      )}
                    </td>
                    <td>{item.assignedToName}</td>
                    <td>{item.lastTreatmentAction || 'ממתין לעדכון פעולה'}</td>
                    <td>
                      <button
                        type="button"
                        className="cfc-btn-open-claim"
                        onClick={() => handleOpenClaimSafe(item.claimId)}
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

      {/* 7. TAB 5: ה. חברות ביטוח (Insurers) */}
      {activeTab === 'insurers' && (
        <div className="cfc-view-body" data-testid="cfc-view-insurers">
          <div className="cfc-table-wrapper" data-testid="cfc-insurers-table">
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
                  <th>זמן תשלום ממוצע</th>
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
                      <td style={{ color: '#166534', fontWeight: 700 }}>{formatCurrencyDetailed(ins.totalPaid)}</td>
                      <td style={{ color: '#b45309' }}>{formatCurrencyDetailed(ins.totalDeductions)}</td>
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
                      <td>{ins.claimsCount > 0 ? 'כ-28 ימים' : 'אין נתון'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Recurring Deductions Breakdown */}
          <h3 style={{ margin: '16px 0 10px 0' }}>✂️ דוח קיזוזים והפחתות חוזרים לפי חברת ביטוח</h3>
          <div className="cfc-table-wrapper" data-testid="cfc-recurring-table">
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
                    <td><span className="cfc-tag status-partial">{rd.categoryLabel}</span></td>
                    <td style={{ fontWeight: 700 }}>{rd.casesCount}</td>
                    <td style={{ color: '#b45309', fontWeight: 800 }}>{formatCurrencyDetailed(rd.totalAmount)}</td>
                    <td>{formatCurrencyDetailed(rd.averageAmount)}</td>
                    <td style={{ fontSize: 11, color: '#64748b' }}>{rd.sampleReasons.slice(0, 2).join(' · ') || 'ללא פירוט'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 8. TAB 6: ו. תקשורת ואימיילים אוטומטיים (Communication & Automated Emails) */}
      {activeTab === 'communication' && (
        <div className="cfc-view-body" data-testid="cfc-view-communication">
          <div style={{ background: '#f0f9ff', border: '1px solid #7dd3fc', borderRadius: 10, padding: '12px 16px', color: '#0369a1', fontSize: 13 }}>
            🔒 <strong>דוח תקשורת לקריאה בלבד:</strong> מרכז נתוני שליחה, מעקבים ותזכורות מתוך יומן המערכת. אינו מפעיל סנכרון ואינו מבצע שליחות.
          </div>

          {/* 10 Communication KPI Cards */}
          <div className="cfc-overview-grid" data-testid="cfc-comm-10-cards">
            <div className="cfc-overview-card tone-blue">
              <div className="cfc-overview-card-top">
                <span className="cfc-overview-card-title">אימיילים שנשלחו</span>
                <span className="cfc-overview-card-icon">📤</span>
              </div>
              <div className="cfc-overview-card-val">{commSummary.totalSent}</div>
              <div className="cfc-overview-card-sub">נשלחו בפועל</div>
            </div>

            <div className="cfc-overview-card tone-blue">
              <div className="cfc-overview-card-top">
                <span className="cfc-overview-card-title">נשלחו אוטומטית</span>
                <span className="cfc-overview-card-icon">⚡</span>
              </div>
              <div className="cfc-overview-card-val">{commSummary.autoSent}</div>
              <div className="cfc-overview-card-sub">מעקבים מתוזמנים</div>
            </div>

            <div className="cfc-overview-card tone-blue">
              <div className="cfc-overview-card-top">
                <span className="cfc-overview-card-title">נשלחו ידנית</span>
                <span className="cfc-overview-card-icon">✍️</span>
              </div>
              <div className="cfc-overview-card-val">{commSummary.manualSent}</div>
              <div className="cfc-overview-card-sub">על ידי עובד</div>
            </div>

            <div className="cfc-overview-card tone-amber">
              <div className="cfc-overview-card-top">
                <span className="cfc-overview-card-title">ממתינים לשליחה</span>
                <span className="cfc-overview-card-icon">⏳</span>
              </div>
              <div className="cfc-overview-card-val">{commSummary.pendingQueued}</div>
              <div className="cfc-overview-card-sub">בתור מתוזמן</div>
            </div>

            <div className="cfc-overview-card tone-red">
              <div className="cfc-overview-card-top">
                <span className="cfc-overview-card-title">נכשלו בשליחה</span>
                <span className="cfc-overview-card-icon">⚠️</span>
              </div>
              <div className="cfc-overview-card-val">{commSummary.failedCount}</div>
              <div className="cfc-overview-card-sub">שגיאת כתובת / שרת</div>
            </div>

            <div className="cfc-overview-card tone-green">
              <div className="cfc-overview-card-top">
                <span className="cfc-overview-card-title">הודעות שהתקבלו</span>
                <span className="cfc-overview-card-icon">📥</span>
              </div>
              <div className="cfc-overview-card-val">{commSummary.receivedCount}</div>
              <div className="cfc-overview-card-sub">שויכו לתיקים</div>
            </div>

            <div className="cfc-overview-card tone-amber">
              <div className="cfc-overview-card-top">
                <span className="cfc-overview-card-title">ממתינים לשיוך</span>
                <span className="cfc-overview-card-icon">🔍</span>
              </div>
              <div className="cfc-overview-card-val">{commSummary.unassignedReviewCount}</div>
              <div className="cfc-overview-card-sub">נדרשת בדיקת עובד</div>
            </div>

            <div className="cfc-overview-card tone-blue">
              <div className="cfc-overview-card-top">
                <span className="cfc-overview-card-title">תיקים עם מעקב אוטומטי</span>
                <span className="cfc-overview-card-icon">🤖</span>
              </div>
              <div className="cfc-overview-card-val">{commSummary.claimsWithAutoAlerts}</div>
              <div className="cfc-overview-card-sub">קיבלו הודעת התראה</div>
            </div>

            <div className="cfc-overview-card tone-amber">
              <div className="cfc-overview-card-top">
                <span className="cfc-overview-card-title">ממתינים לתגובה</span>
                <span className="cfc-overview-card-icon">💬</span>
              </div>
              <div className="cfc-overview-card-val">{commSummary.claimsWaitingReply}</div>
              <div className="cfc-overview-card-sub">לאחר שליחת הודעה</div>
            </div>

            <div className="cfc-overview-card tone-green">
              <div className="cfc-overview-card-top">
                <span className="cfc-overview-card-title">תזכורות שהושלמו</span>
                <span className="cfc-overview-card-icon">🔔</span>
              </div>
              <div className="cfc-overview-card-val">{commSummary.remindersCompleted}</div>
              <div className="cfc-overview-card-sub">מתוך {commSummary.remindersCreated} שנוצרו</div>
            </div>
          </div>

          {/* Communication Log Table */}
          <div className="cfc-table-wrapper" data-testid="cfc-comm-table">
            <table className="cfc-table">
              <thead>
                <tr>
                  <th>סטטוס שליחה</th>
                  <th>מספר תיק</th>
                  <th>לקוח ורכב</th>
                  <th>נמען</th>
                  <th>נושא הודעה</th>
                  <th>אופן שליחה</th>
                  <th>תאריך ושעה</th>
                  <th>פעולה</th>
                </tr>
              </thead>
              <tbody>
                {commLogs.slice(0, 50).map((log) => (
                  <tr key={log.id}>
                    <td>
                      <span className={`cfc-alert-severity-pill ${log.status === 'sent' ? 'green' : log.status === 'failed' ? 'red' : 'yellow'}`}>
                        {log.statusLabel}
                      </span>
                    </td>
                    <td style={{ fontWeight: 800 }}>{log.claimId}</td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{log.clientName}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{log.plate}</div>
                    </td>
                    <td>{log.recipient}</td>
                    <td style={{ maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {log.subject}
                    </td>
                    <td>
                      <span className="cfc-tag">{log.mode === 'auto' ? 'אוטומטי' : 'ידני'}</span>
                    </td>
                    <td>{log.dateStr}</td>
                    <td>
                      <button
                        type="button"
                        className="cfc-btn-open-claim"
                        onClick={() => handleOpenClaimSafe(log.claimId)}
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

      {/* 9. TAB 7: ז. דוחות נוספים ותפעוליים (Operational & Garage Reports) */}
      {activeTab === 'operational' && (
        <div className="cfc-view-body" data-testid="cfc-view-operational">
          {/* Supplier Quotes & Purchase Costs Section */}
          <ClaimQuotesReportSection claims={claims} onOpenClaim={handleOpenClaimSafe} />

          {/* Garage Cases Section */}
          <h3 style={{ margin: '16px 0 10px 0' }}>🚗 כרטיסי עבודה ותיקי מוסך ({garageCases.length})</h3>
          <div className="cfc-table-wrapper" data-testid="cfc-operational-garage-table">
            <table className="cfc-table">
              <thead>
                <tr>
                  <th>מספר הזמנה/תיק</th>
                  <th>שם לקוח</th>
                  <th>מספר רכב</th>
                  <th>סוג עבודה</th>
                  <th>סטטוס</th>
                  <th>תאריך פתיחה</th>
                  <th>פעולה</th>
                </tr>
              </thead>
              <tbody>
                {garageCases.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>
                      אין כרטיסי עבודה מוסך בתקופה הנבחרת
                    </td>
                  </tr>
                ) : (
                  garageCases.slice(0, 50).map((g) => {
                    const cd = g.case_data || {};
                    return (
                      <tr key={g.id}>
                        <td style={{ fontWeight: 800 }}>{g.case_number || `מוסך-${g.id.slice(0, 6)}`}</td>
                        <td>{g.customer_name_snapshot || (typeof cd.customerName === 'string' ? cd.customerName : '—')}</td>
                        <td dir="ltr" style={{ textAlign: 'right' }}>{g.vehicle_plate_snapshot || (typeof cd.vehiclePlate === 'string' ? cd.vehiclePlate : '—')}</td>
                        <td>{cd.workType || 'עבודה כללית'}</td>
                        <td><span className="cfc-tag">{g.status || 'בטיפול'}</span></td>
                        <td>{String(g.created_at || '').slice(0, 10)}</td>
                        <td>
                          {onOpenGarageCase && (
                            <button
                              type="button"
                              className="cfc-btn-open-claim"
                              onClick={() => onOpenGarageCase(g.id)}
                            >
                              פתח מוסך
                            </button>
                          )}
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

      {/* 10. AI Daily Briefing Modal */}
      {briefingModalOpen && (
        <div className="cfc-modal-overlay" onClick={() => setBriefingModalOpen(false)}>
          <div className="cfc-modal" data-testid="cfc-briefing-modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="cfc-modal-header">
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>✨</span> תדריך מנהלים יומי (AI Daily Briefing)
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
              <p style={{ fontSize: 12, color: '#475569', margin: '0 0 12px 0' }}>
                תדריך לקריאה בלבד המרכז את מוקדי הטיפול הדחופים, הסכומים בסיכון והתיקים בעדיפות עליונה להיום.
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

      {/* 11. Drilldown Modal */}
      {drilldownModal && (
        <div className="cfc-modal-overlay" onClick={() => setDrilldownModal(null)}>
          <div className="cfc-modal" data-testid="cfc-drilldown-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cfc-modal-header">
              <h3 style={{ margin: 0 }} className="cfc-modal-title">
                📋 {drilldownModal.title} ({drilldownModal.items.length} תיקים)
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
                      <th>סטטוס</th>
                      <th>פרטים / סכום</th>
                      <th>פעולה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drilldownModal.items.map((row) => (
                      <tr
                        key={row.claimId}
                        style={{ cursor: 'pointer' }}
                        onClick={() => handleOpenClaimSafe(row.claimId)}
                      >
                        <td style={{ fontWeight: 800 }}>{row.claimId}</td>
                        <td>{row.clientName}</td>
                        <td dir="ltr" style={{ textAlign: 'right' }}>{row.plate}</td>
                        <td>{row.insCompany}</td>
                        <td><span className="cfc-tag">{row.status}</span></td>
                        <td>
                          {row.amount ? (
                            <strong style={{ color: '#b91c1c' }}>{formatCurrencyDetailed(row.amount)}</strong>
                          ) : (
                            row.subtext || '—'
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="cfc-btn-open-claim"
                            onClick={() => handleOpenClaimSafe(row.claimId)}
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
