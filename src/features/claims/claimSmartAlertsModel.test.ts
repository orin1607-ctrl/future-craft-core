// src/features/claims/claimSmartAlertsModel.test.ts
import { describe, it, expect } from 'vitest';
import {
  evaluateClaimAlerts,
  buildAllSmartAlerts,
  analyzeRecurringDeductions,
  analyzeCycleTimes,
  analyzeCashForecast,
  analyzeClaimProfitability,
  auditDataQuality,
  generateDailyAiBriefing,
} from './claimSmartAlertsModel';
import { buildClaimFinancialRow } from './claimFinancialReportsCenterModel';

describe('claimSmartAlertsModel', () => {
  const sampleOverdueClaim = buildClaimFinancialRow({
    id: 'DAL-OVERDUE-01',
    plate: '1234567',
    clientName: 'משה כהן',
    claimNum: 'CLM-01',
    insCompany: 'הראל',
    status: 'בטיפול',
    createdAt: '2026-08-01',
    row_data: {
      finAmount: '20000',
      finApproved: '18000',
      finPaid: '5000',
      eventDate: '2026-08-01',
      lastTreatmentAt: '2026-08-10',
      lastTreatmentAction: 'נשלחה תזכורת',
      assigned_to_name: 'יוסי כהן',
    },
  });

  describe('evaluateClaimAlerts', () => {
    it('generates overdue debt, partial payment, and stale claim alerts', () => {
      const alerts = evaluateClaimAlerts(sampleOverdueClaim, { id: 'DAL-OVERDUE-01', row_data: {} }, 14);
      expect(alerts.length).toBeGreaterThanOrEqual(2);

      const debtAlert = alerts.find((a) => a.kind === 'overdue_debt');
      expect(debtAlert).toBeDefined();
      expect(debtAlert?.amount).toBe(13000); // 18000 approved - 5000 paid
      expect(debtAlert?.severity).toBe('red'); // Over 60 days

      const partialAlert = alerts.find((a) => a.kind === 'partial_payment');
      expect(partialAlert).toBeDefined();
      expect(partialAlert?.amount).toBe(13000);

      const staleAlert = alerts.find((a) => a.kind === 'stale_claim');
      expect(staleAlert).toBeDefined();
      expect(staleAlert?.severity).toBe('red'); // Inactive > 30 days
    });

    it('generates missing document alert when demand exists without surveyor report', () => {
      const claimNoDoc = buildClaimFinancialRow({
        id: 'DAL-NODOC-02',
        plate: '7654321',
        clientName: 'שרה לוי',
        insCompany: 'מגדל',
        status: 'פתוח',
        row_data: { finAmount: '12000' },
      });

      const alerts = evaluateClaimAlerts(claimNoDoc, { id: 'DAL-NODOC-02', row_data: {} });
      const docAlert = alerts.find((a) => a.kind === 'missing_document');
      expect(docAlert).toBeDefined();
      expect(docAlert?.missingDocName).toBe('דוח שמאי רכב');
    });

    it('generates data anomaly alert when insurance company is missing', () => {
      const claimNoIns = buildClaimFinancialRow({
        id: 'DAL-NOINS-03',
        plate: '5554433',
        clientName: 'חיים אברהם',
        status: 'בטיפול',
        row_data: { finAmount: '15000' },
      });

      const alerts = evaluateClaimAlerts(claimNoIns, { id: 'DAL-NOINS-03', row_data: {} });
      const anomaly = alerts.find((a) => a.kind === 'data_anomaly');
      expect(anomaly).toBeDefined();
      expect(anomaly?.title).toContain('ללא חברת ביטוח');
    });
  });

  describe('buildAllSmartAlerts & Summary', () => {
    it('aggregates alerts and summary metrics correctly', () => {
      const { alerts, summary } = buildAllSmartAlerts([sampleOverdueClaim], [{ id: 'DAL-OVERDUE-01' }]);
      expect(alerts.length).toBeGreaterThan(0);
      expect(summary.overdueDebtsCount).toBe(1);
      expect(summary.overdueDebtsAmount).toBe(13000);
      expect(summary.partialPaymentsCount).toBe(1);
      expect(summary.partialPaymentsBalance).toBe(13000);
      expect(summary.criticalRedCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('analyzeRecurringDeductions', () => {
    it('aggregates repeated cuts by insurer and category', () => {
      const claimWithCuts = buildClaimFinancialRow({
        id: 'DAL-CUT-01',
        plate: '1122334',
        insCompany: 'הפניקס',
        row_data: {
          financial_audit: {
            latest_comparison: {
              totalDemanded: 10000,
              totalApproved: 8000,
              totalReportedPaid: 8000,
              deductionsSummary: [
                { id: 'D1', amount: 1500, category: 'deductible', reason: 'השתתפות עצמית' },
                { id: 'D2', amount: 500, category: 'labor_cut', reason: 'הפחתת שעתון פחחות' },
              ],
            },
          },
        },
      });

      const recurring = analyzeRecurringDeductions([claimWithCuts]);
      expect(recurring).toHaveLength(2);
      expect(recurring[0].insurerName).toBe('הפניקס');
      expect(recurring.some((r) => r.category === 'deductible' && r.totalAmount === 1500)).toBe(true);
      expect(recurring.some((r) => r.category === 'labor_cut' && r.totalAmount === 500)).toBe(true);
    });
  });

  describe('analyzeCashForecast', () => {
    it('classifies debt balances strictly by aging and committed dates', () => {
      const forecast = analyzeCashForecast([sampleOverdueClaim]);
      expect(forecast).toHaveLength(4);
      // sampleOverdueClaim is >60 days old, should fall into delayed bucket
      const delayed = forecast.find((b) => b.bucketLabel.includes('מעוכבים'));
      expect(delayed?.expectedAmount).toBe(13000);
      expect(delayed?.claimsCount).toBe(1);
    });
  });

  describe('analyzeClaimProfitability', () => {
    it('calculates profit when supplier cost is present, or marks as incalculable', () => {
      const quotesMap = new Map([
        ['DAL-OVERDUE-01', { totalAmount: 18000, supplierCost: 10000 }],
      ]);

      const prof = analyzeClaimProfitability([sampleOverdueClaim], quotesMap);
      expect(prof).toHaveLength(1);
      // customerIncome for DAL-OVERDUE-01 is 5000 paid
      expect(prof[0].isCalculable).toBe(true);
      expect(prof[0].supplierCost).toBe(10000);
      expect(prof[0].grossProfit).toBe(5000 - 10000); // -5000 until full balance collected
    });

    it('marks profitability as incalculable when cost data is missing (no guessing)', () => {
      const prof = analyzeClaimProfitability([sampleOverdueClaim], new Map());
      expect(prof[0].isCalculable).toBe(false);
      expect(prof[0].statusNote).toContain('חסרים נתוני עלות');
    });
  });

  describe('generateDailyAiBriefing', () => {
    it('generates rich executive summary text for management', () => {
      const { alerts, summary } = buildAllSmartAlerts([sampleOverdueClaim], [{ id: 'DAL-OVERDUE-01' }]);
      const briefing = generateDailyAiBriefing(summary, alerts);
      expect(briefing).toContain('תדריך מנהלים יומי');
      expect(briefing).toContain('חובות באיחור');
      expect(briefing).toContain('DAL-OVERDUE-01');
      expect(briefing).toContain('13,000');
    });
  });
});
