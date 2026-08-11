import type { RequiredFieldsOverrides } from '@/lib/requiredFieldsSchema';
import { isVehicleHubFieldRequired } from '@/lib/requiredFieldsCompany';
import { daysUntil } from '@/components/vehicles/vehicleHubUtils';

export type InsuranceCoverageStatus = 'valid' | 'expiring' | 'expired' | 'missing';

export type VehicleInsuranceFields = {
  insurance_expiry?: string | null;
  comprehensive_insurance_expiry?: string | null;
  insurance_doc_url?: string | null;
  comprehensive_insurance_doc_url?: string | null;
};

export type InsuranceCoverageEvaluation = {
  mandatory: InsuranceCoverageStatus;
  comprehensive: InsuranceCoverageStatus | 'not_applicable';
  comprehensiveRelevant: boolean;
  missingMandatoryDoc: boolean;
  missingComprehensiveDoc: boolean;
  /** True when expiry is missing, expired, or within 14 days (mandatory or relevant comprehensive). */
  hasCoverageGap: boolean;
  /** True when a required insurance document is missing (not a coverage/expiry issue). */
  hasMissingDocGap: boolean;
  /** Value for gap row "חוסר ביטוח" — coverage only, never doc-only. */
  insuranceGapDisplay: string;
  /** Short label for missing mandatory doc, if applicable. */
  missingMandatoryDocLabel: string | null;
  /** Short label for missing comprehensive doc, if applicable. */
  missingComprehensiveDocLabel: string | null;
};

function coverageStatus(expiry: string | null | undefined): InsuranceCoverageStatus {
  const days = daysUntil(expiry ?? null);
  if (!expiry) return 'missing';
  if (days !== null && days <= 0) return 'expired';
  if (days !== null && days <= 14) return 'expiring';
  return 'valid';
}

function statusDisplay(status: InsuranceCoverageStatus): string {
  switch (status) {
    case 'missing':
      return 'לא הוגדר';
    case 'expired':
      return 'פג תוקף';
    case 'expiring':
      return 'מתקרב לפקיעה';
    default:
      return 'אין';
  }
}

/** Comprehensive block applies when data exists or company marks fields required. */
export function isComprehensiveInsuranceRelevant(
  v: VehicleInsuranceFields,
  overrides: RequiredFieldsOverrides = {},
): boolean {
  if (v.comprehensive_insurance_expiry || v.comprehensive_insurance_doc_url) return true;
  return (
    isVehicleHubFieldRequired('comprehensive_insurance_doc_url', overrides) ||
    isVehicleHubFieldRequired('comprehensive_insurance_expiry', overrides)
  );
}

function isMandatoryDocRequired(
  overrides: RequiredFieldsOverrides,
  requireInsuranceDocs?: boolean,
): boolean {
  return (
    requireInsuranceDocs === true ||
    isVehicleHubFieldRequired('insurance_doc_url', overrides)
  );
}

function isComprehensiveDocRequired(
  v: VehicleInsuranceFields,
  overrides: RequiredFieldsOverrides,
): boolean {
  if (!isComprehensiveInsuranceRelevant(v, overrides)) return false;
  return isVehicleHubFieldRequired('comprehensive_insurance_doc_url', overrides);
}

export function evaluateInsuranceCoverage(
  v: VehicleInsuranceFields,
  overrides: RequiredFieldsOverrides = {},
  options?: { requireInsuranceDocs?: boolean },
): InsuranceCoverageEvaluation {
  const mandatory = coverageStatus(v.insurance_expiry);
  const comprehensiveRelevant = isComprehensiveInsuranceRelevant(v, overrides);
  const comprehensive = comprehensiveRelevant
    ? coverageStatus(v.comprehensive_insurance_expiry)
    : ('not_applicable' as const);

  const mandatoryDocRequired = isMandatoryDocRequired(overrides, options?.requireInsuranceDocs);
  const comprehensiveDocRequired = isComprehensiveDocRequired(v, overrides);

  const missingMandatoryDoc = mandatoryDocRequired && !v.insurance_doc_url;
  const missingComprehensiveDoc = comprehensiveDocRequired && !v.comprehensive_insurance_doc_url;

  const mandatoryCoverageGap =
    mandatory === 'missing' || mandatory === 'expired' || mandatory === 'expiring';
  const comprehensiveCoverageGap =
    comprehensiveRelevant &&
    comprehensive !== 'not_applicable' &&
    (comprehensive === 'missing' || comprehensive === 'expired' || comprehensive === 'expiring');

  const hasCoverageGap = mandatoryCoverageGap || comprehensiveCoverageGap;
  const hasMissingDocGap = missingMandatoryDoc || missingComprehensiveDoc;

  let insuranceGapDisplay = 'אין';
  if (mandatoryCoverageGap) {
    insuranceGapDisplay = statusDisplay(mandatory);
  } else if (comprehensiveCoverageGap && comprehensive !== 'not_applicable') {
    insuranceGapDisplay = `מקיף: ${statusDisplay(comprehensive)}`;
  }

  return {
    mandatory,
    comprehensive,
    comprehensiveRelevant,
    missingMandatoryDoc,
    missingComprehensiveDoc,
    hasCoverageGap,
    hasMissingDocGap,
    insuranceGapDisplay,
    missingMandatoryDocLabel: missingMandatoryDoc ? 'חסר מסמך ביטוח חובה' : null,
    missingComprehensiveDocLabel: missingComprehensiveDoc ? 'חסר מסמך ביטוח מקיף' : null,
  };
}
