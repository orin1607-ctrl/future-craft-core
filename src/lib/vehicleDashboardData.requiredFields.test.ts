import { describe, expect, it } from 'vitest';
import { buildMissingDocuments, buildInsuranceGaps } from './vehicleDashboardData';
import { fieldConfigId } from './requiredFieldsSchema';
import type { VehicleHubVehicle } from '@/components/vehicles/VehicleHub';

const baseVehicle = {
  id: '1',
  license_plate: '12-345-67',
  company_name: 'Demo Co',
  license_doc_url: '',
  insurance_doc_url: '',
  comprehensive_insurance_doc_url: '',
  test_expiry: null,
  insurance_expiry: null,
  comprehensive_insurance_expiry: null,
} as unknown as VehicleHubVehicle;

describe('vehicleDashboardData required-fields gating', () => {
  it('does not list optional docs as missing', () => {
    const overrides = {
      [fieldConfigId('vehicles', 'comprehensive_insurance_file_name')]: false,
      [fieldConfigId('vehicles', 'comprehensive_insurance_doc_link')]: false,
    };
    const missing = buildMissingDocuments(baseVehicle, overrides);
    expect(missing.find((m) => m.fieldKey === 'comprehensive_insurance_doc_url')).toBeUndefined();
  });

  it('lists license as missing only when required', () => {
    const optional = buildMissingDocuments(baseVehicle, {});
    expect(optional.find((m) => m.fieldKey === 'license_doc_url')).toBeUndefined();

    const required = buildMissingDocuments(baseVehicle, {
      [fieldConfigId('vehicles', 'license_file_name')]: true,
    });
    expect(required.find((m) => m.fieldKey === 'license_doc_url')).toBeTruthy();
  });

  it('skips insurance gaps when not required for company', () => {
    const gaps = buildInsuranceGaps(
      {
        ...baseVehicle,
        insurance_expiry: null,
        comprehensive_insurance_expiry: null,
      } as VehicleHubVehicle,
      null,
      {
        [fieldConfigId('vehicles', 'comprehensive_insurance_file_name')]: false,
        [fieldConfigId('vehicles', 'comprehensive_insurance_doc_link')]: false,
        [fieldConfigId('vehicles', 'comprehensive_insurance_end')]: false,
      },
    );
    expect(gaps.find((g) => g.label.includes('מקיף'))).toBeUndefined();
  });
});
