// src/features/claims/claimFinancialReportsCenterModel.test.ts
import { describe, it, expect } from 'vitest';
import {
  normalizeInsurerName,
  parseFinancialNum,
  buildClaimFinancialRow,
  compute15FinancialKpis,
  computeInsurersSummary,
  filterFinancialRows,
  exportFinancialToCsv,
  getAgingBucket,
  formatCurrencyOrMissing,
} from './claimFinancialReportsCenterModel';

describe('claimFinancialReportsCenterModel', () => {
  describe('normalizeInsurerName', () => {
    it('normalizes known insurer name variants', () => {
      expect(normalizeInsurerName('הראל ביטוח')).toBe('הראל');
      expect(normalizeInsurerName(' הראל ')).toBe('הראל');
      expect(normalizeInsurerName('ליברה ')).toBe('ליברה');
      expect(normalizeInsurerName('אילון')).toBe('איילון');
      expect(normalizeInsurerName('איילון')).toBe('איילון');
      expect(normalizeInsurerName('פניקס חברה לביטוח')).toBe('הפניקס');
      expect(normalizeInsurerName('מגדל')).toBe('מגדל');
      expect(normalizeInsurerName('כלל')).toBe('כלל');
      expect(normalizeInsurerName('ביטוח ישיר')).toBe('ביטוח ישיר');
      expect(normalizeInsurerName('AIG')).toBe('AIG');
      expect(normalizeInsurerName('שלמה SIXT')).toBe('שלמה SIXT');
      expect(normalizeInsurerName('WeSure')).toBe('WeSure');
      expect(normalizeInsurerName('')).toBe('ללא חברה');
      expect(normalizeInsurerName(null)).toBe('ללא חברה');
    });
  });

  describe('parseFinancialNum', () => {
    it('parses valid numeric values and strips formatting', () => {
      expect(parseFinancialNum(1234.56)).toBe(1234.56);
      expect(parseFinancialNum('12,345 ₪')).toBe(12345);
      expect(parseFinancialNum(' ₪ 5,000.50 ')).toBe(5000.5);
    });

    it('returns null for missing or invalid values (never zero)', () => {
      expect(parseFinancialNum(null)).toBeNull();
      expect(parseFinancialNum(undefined)).toBeNull();
      expect(parseFinancialNum('')).toBeNull();
      expect(parseFinancialNum('—')).toBeNull();
      expect(parseFinancialNum('אין נתון')).toBeNull();
      expect(parseFinancialNum('טרם אומת')).toBeNull();
    });
  });

  describe('getAgingBucket', () => {
    it('returns correct bucket for day ranges', () => {
      expect(getAgingBucket(10)).toBe('0-30');
      expect(getAgingBucket(30)).toBe('0-30');
      expect(getAgingBucket(45)).toBe('31-60');
      expect(getAgingBucket(60)).toBe('31-60');
      expect(getAgingBucket(75)).toBe('61-90');
      expect(getAgingBucket(90)).toBe('61-90');
      expect(getAgingBucket(120)).toBe('90+');
      expect(getAgingBucket(null)).toBe('none');
    });
  });

  describe('formatCurrencyOrMissing', () => {
    it('formats number with currency symbol', () => {
      expect(formatCurrencyOrMissing(5000)).toBe('₪5,000');
    });

    it('returns placeholder when null or undefined', () => {
      expect(formatCurrencyOrMissing(null)).toBe('אין נתון');
      expect(formatCurrencyOrMissing(undefined, 'טרם אומת')).toBe('טרם אומת');
    });
  });

  describe('buildClaimFinancialRow & Double-Counting Prevention', () => {
    it('handles claim with rich financial audit without double counting', () => {
      const sampleClaim = {
        id: 'DAL-TEST-100',
        plate: '1234567',
        clientName: 'ישראל ישראלי',
        claimNum: 'CLM-001',
        insCompany: 'הראל ביטוח',
        status: 'בטיפול',
        row_data: {
          financial_audit: {
            our_demand: {
              totalDemanded: { amount: 25000, confidence: 'high' },
              reportDate: '01/10/2026',
            },
            counter_reports: [
              {
                totalApproved: { amount: 20000, confidence: 'high' },
                deductions: [{ amount: 5000, reason: 'הפחתת שמאי נגדי', category: 'damage_cut' }],
              },
            ],
            payment_notices: [
              {
                totalPaid: { amount: 15000, confidence: 'high' },
                noticeDate: '15/10/2026',
                disputedDifference: { amount: 5000 },
              },
            ],
            latest_comparison: {
              totalDemanded: 25000,
              totalApproved: 20000,
              totalReportedPaid: 15000,
              totalUnpaid: 5000,
              deductionsSummary: [
                { id: 'D1', amount: 5000, reason: 'השתתפות עצמית', category: 'deductible' },
              ],
            },
          },
        },
      };

      const quote = { totalAmount: 22000, version: 1 };
      const row = buildClaimFinancialRow(sampleClaim, quote);

      expect(row.insCompany).toBe('הראל');
      expect(row.demandAmount).toBe(25000);
      expect(row.quoteAmount).toBe(22000); // Distinct quote amount
      expect(row.approvedAmount).toBe(20000);
      expect(row.paidAmount).toBe(15000);
      expect(row.deductionsAmount).toBe(5000);
      expect(row.debtAmount).toBe(5000); // 20000 approved - 15000 paid
      expect(row.disputedAmount).toBe(5000);
      expect(row.paymentStatus).toBe('partial');
    });

    it('handles claim with no financial data displaying null and unverified', () => {
      const emptyClaim = {
        id: 'DAL-EMPTY',
        plate: '9999999',
        clientName: 'ללא נתונים',
        status: 'חדש',
      };

      const row = buildClaimFinancialRow(emptyClaim);
      expect(row.demandAmount).toBeNull();
      expect(row.approvedAmount).toBeNull();
      expect(row.paidAmount).toBeNull();
      expect(row.debtAmount).toBeNull();
      expect(row.paymentStatus).toBe('no_data');
      expect(row.hasUnverifiedWarning).toBe(false);
    });
  });

  describe('compute15FinancialKpis', () => {
    it('computes all 15 KPI cards correctly', () => {
      const rows = [
        buildClaimFinancialRow({
          id: 'C1',
          plate: '111',
          clientName: 'לקוח 1',
          insCompany: 'הפניקס',
          status: 'פתוח',
          row_data: { finAmount: '10000', finApproved: '8000', finPaid: '8000' },
        }),
        buildClaimFinancialRow({
          id: 'C2',
          plate: '222',
          clientName: 'לקוח 2',
          insCompany: 'מגדל',
          status: 'בטיפול',
          row_data: { finAmount: '20000', finApproved: '15000', finPaid: '5000', legalFirm: 'עו״ד לוי' },
        }),
        buildClaimFinancialRow({
          id: 'C3',
          plate: '333',
          clientName: 'לקוח 3',
          insCompany: 'כלל',
          status: 'הסתיים',
          row_data: { finAmount: '5000' }, // Unpaid! Closed status != paid
        }),
      ];

      const kpis = compute15FinancialKpis(rows);
      expect(kpis).toHaveLength(15);

      const findKpi = (id: string) => kpis.find((k) => k.id === id)!;

      // 1. Demands
      expect(findKpi('kpi-1-demands').numericValue).toBe(35000);
      // 4. Demands to insurers
      expect(findKpi('kpi-4-demands-insurers').numericValue).toBe(35000);
      // 5. Approved
      expect(findKpi('kpi-5-approved').numericValue).toBe(23000);
      // 6. Paid
      expect(findKpi('kpi-6-paid').numericValue).toBe(13000);
      // 7. Open debt (C2 debt is 15000 - 5000 = 10000; C3 demand is 5000 unpaid)
      expect(findKpi('kpi-7-debt').numericValue).toBe(15000);
      // 10. Legal (C2 has 20000)
      expect(findKpi('kpi-10-legal').numericValue).toBe(20000);
      // 11. Open claims (C1 and C2 are open, C3 is closed)
      expect(findKpi('kpi-11-open-claims').numericValue).toBe(2);
      // 12. Fully paid (C1 paid 8000 out of 8000)
      expect(findKpi('kpi-12-paid-full').numericValue).toBe(1);
      // 13. Partially paid (C2 paid 5000 out of 15000)
      expect(findKpi('kpi-13-paid-partial').numericValue).toBe(1);
      // 14. Unpaid (C3 has demand 5000 and 0 paid)
      expect(findKpi('kpi-14-unpaid').numericValue).toBe(1);
    });
  });

  describe('computeInsurersSummary & CSV Export', () => {
    it('aggregates data by normalized insurer and exports valid CSV with BOM', () => {
      const rows = [
        buildClaimFinancialRow({
          id: 'C1',
          plate: '111',
          insCompany: 'הראל',
          row_data: { finAmount: '10000', finApproved: '10000', finPaid: '6000' },
        }),
        buildClaimFinancialRow({
          id: 'C2',
          plate: '222',
          insCompany: 'הראל ביטוח', // Should group under הראל!
          row_data: { finAmount: '5000', finApproved: '5000', finPaid: '5000' },
        }),
      ];

      const insurers = computeInsurersSummary(rows);
      expect(insurers).toHaveLength(1);
      expect(insurers[0].insurerName).toBe('הראל');
      expect(insurers[0].claimsCount).toBe(2);
      expect(insurers[0].totalDemanded).toBe(15000);
      expect(insurers[0].totalApproved).toBe(15000);
      expect(insurers[0].totalPaid).toBe(11000);
      expect(insurers[0].totalDebt).toBe(4000);

      const kpis = compute15FinancialKpis(rows);
      const csv = exportFinancialToCsv(rows, kpis, insurers);
      expect(csv.startsWith('\uFEFF')).toBe(true);
      expect(csv).toContain('מרכז דוחות כספיים - תביעות וביטוח');
      expect(csv).toContain('"הראל"');
      expect(csv).toContain('15000');
    });
  });
});
