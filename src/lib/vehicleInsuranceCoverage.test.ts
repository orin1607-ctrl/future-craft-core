import { describe, expect, it } from 'vitest';
import { fieldConfigId } from '@/lib/requiredFieldsSchema';
import { evaluateInsuranceCoverage, isComprehensiveInsuranceRelevant } from './vehicleInsuranceCoverage';

const futureExpiry = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return d.toISOString().slice(0, 10);
};

describe('vehicleInsuranceCoverage', () => {
  it('valid mandatory insurance with doc — no coverage gap', () => {
    const r = evaluateInsuranceCoverage(
      {
        insurance_expiry: futureExpiry(),
        insurance_doc_url: 'https://x/doc.pdf',
        comprehensive_insurance_expiry: null,
        comprehensive_insurance_doc_url: null,
      },
      {},
    );
    expect(r.hasCoverageGap).toBe(false);
    expect(r.insuranceGapDisplay).toBe('אין');
    expect(r.missingMandatoryDoc).toBe(false);
  });

  it('valid mandatory date without doc — doc gap only, not coverage gap', () => {
    const r = evaluateInsuranceCoverage(
      {
        insurance_expiry: futureExpiry(),
        insurance_doc_url: null,
        comprehensive_insurance_expiry: null,
        comprehensive_insurance_doc_url: null,
      },
      {},
    );
    expect(r.hasCoverageGap).toBe(false);
    expect(r.insuranceGapDisplay).toBe('אין');
    expect(r.missingMandatoryDoc).toBe(false);
    expect(r.hasMissingDocGap).toBe(false);
  });

  it('valid mandatory date without doc when required — missing doc label', () => {
    const overrides = {
      [fieldConfigId('vehicles', 'mandatory_insurance_doc_link')]: true,
    };
    const r = evaluateInsuranceCoverage(
      {
        insurance_expiry: futureExpiry(),
        insurance_doc_url: null,
      },
      overrides,
    );
    expect(r.hasCoverageGap).toBe(false);
    expect(r.missingMandatoryDoc).toBe(true);
    expect(r.missingMandatoryDocLabel).toBe('חסר מסמך ביטוח חובה');
  });

  it('no comprehensive configured — no comprehensive doc gap', () => {
    const v = {
      insurance_expiry: futureExpiry(),
      insurance_doc_url: 'x',
      comprehensive_insurance_expiry: null,
      comprehensive_insurance_doc_url: null,
    };
    expect(isComprehensiveInsuranceRelevant(v, {})).toBe(false);
    const r = evaluateInsuranceCoverage(v, {});
    expect(r.missingComprehensiveDoc).toBe(false);
  });

  it('expired mandatory insurance — coverage gap', () => {
    const r = evaluateInsuranceCoverage({
      insurance_expiry: '2020-01-01',
      insurance_doc_url: 'x',
    });
    expect(r.hasCoverageGap).toBe(true);
    expect(r.insuranceGapDisplay).toBe('פג תוקף');
  });

  it('require_insurance_docs company flag marks missing mandatory doc', () => {
    const r = evaluateInsuranceCoverage(
      { insurance_expiry: futureExpiry(), insurance_doc_url: null },
      {},
      { requireInsuranceDocs: true },
    );
    expect(r.missingMandatoryDoc).toBe(true);
    expect(r.hasCoverageGap).toBe(false);
  });
});
