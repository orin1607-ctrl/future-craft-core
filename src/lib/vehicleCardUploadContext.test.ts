import { describe, expect, it } from 'vitest';
import { resolveVehicleCardUploadFields } from './vehicleCardUploadContext';

describe('resolveVehicleCardUploadFields', () => {
  it('prefers form field company over company_name and user company', () => {
    const values: Record<string, string> = {
      vehicle_plate: '12-345-67',
      company: 'קיבוץ בארי',
      company_name: 'wrong',
      vehicle_id: 'uuid-1',
    };
    const got = resolveVehicleCardUploadFields((n) => values[n] || '', 'Dalia');
    expect(got.formCompany).toBe('קיבוץ בארי');
    expect(got.plate).toBe('1234567');
    expect(got.rawPlate).toBe('12-345-67');
    expect(got.vehicleId).toBe('uuid-1');
  });

  it('falls back to company_name then user company', () => {
    expect(resolveVehicleCardUploadFields(() => '', 'QA Co').formCompany).toBe('QA Co');
    expect(
      resolveVehicleCardUploadFields((n) => (n === 'company_name' ? 'FromName' : ''), 'QA Co').formCompany,
    ).toBe('FromName');
  });

  it('uses vehicle placeholder plate when empty', () => {
    expect(resolveVehicleCardUploadFields(() => '', null).plate).toBe('vehicle');
  });
});
