import { describe, expect, it } from 'vitest';
import {
  parseRequiredFieldsStore,
  resolveCompanyOverrides,
  isFieldRequiredForCompany,
  isVehicleHubFieldRequired,
  patchCompanyField,
  serializeRequiredFieldsStore,
} from './requiredFieldsCompany';
import { fieldConfigId } from './requiredFieldsSchema';

describe('requiredFieldsCompany', () => {
  it('parses legacy flat map as legacy fallback', () => {
    const store = parseRequiredFieldsStore({
      [fieldConfigId('vehicles', 'vehicle_plate')]: true,
      [fieldConfigId('vehicles', 'comprehensive_insurance_file_name')]: false,
    });
    expect(store.byCompany).toEqual({});
    expect(store.legacy[fieldConfigId('vehicles', 'vehicle_plate')]).toBe(true);
    expect(store.legacy[fieldConfigId('vehicles', 'comprehensive_insurance_file_name')]).toBe(false);
  });

  it('resolves per-company overrides over legacy', () => {
    const store = parseRequiredFieldsStore({
      version: 2,
      legacy: { [fieldConfigId('vehicles', 'comprehensive_insurance_file_name')]: true },
      byCompany: {
        Alpha: { [fieldConfigId('vehicles', 'comprehensive_insurance_file_name')]: false },
      },
    });
    expect(resolveCompanyOverrides(store, 'Alpha')[fieldConfigId('vehicles', 'comprehensive_insurance_file_name')]).toBe(
      false,
    );
    expect(resolveCompanyOverrides(store, 'Beta')[fieldConfigId('vehicles', 'comprehensive_insurance_file_name')]).toBe(
      true,
    );
    expect(isFieldRequiredForCompany('vehicles', 'comprehensive_insurance_file_name', store, 'Alpha')).toBe(false);
    expect(isFieldRequiredForCompany('vehicles', 'comprehensive_insurance_file_name', store, 'Beta')).toBe(true);
  });

  it('treats hub comprehensive doc as not required when settings mark optional', () => {
    const overrides = {
      [fieldConfigId('vehicles', 'comprehensive_insurance_file_name')]: false,
      [fieldConfigId('vehicles', 'comprehensive_insurance_doc_link')]: false,
    };
    expect(isVehicleHubFieldRequired('comprehensive_insurance_doc_url', overrides)).toBe(false);
    expect(isVehicleHubFieldRequired('license_doc_url', overrides)).toBe(false);
  });

  it('marks hub license required when either file or link is required', () => {
    expect(
      isVehicleHubFieldRequired('license_doc_url', {
        [fieldConfigId('vehicles', 'license_file_name')]: true,
      }),
    ).toBe(true);
  });

  it('patches company without mutating other companies', () => {
    const store = parseRequiredFieldsStore({
      version: 2,
      legacy: {},
      byCompany: {
        A: { [fieldConfigId('vehicles', 'vehicle_plate')]: true },
      },
    });
    const next = patchCompanyField(store, 'B', 'vehicles', 'manufacturer', true);
    expect(next.byCompany.A[fieldConfigId('vehicles', 'vehicle_plate')]).toBe(true);
    expect(next.byCompany.B[fieldConfigId('vehicles', 'manufacturer')]).toBe(true);
    expect(serializeRequiredFieldsStore(next).version).toBe(2);
  });
});
