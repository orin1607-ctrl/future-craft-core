import { describe, expect, it } from 'vitest';
import {
  extractPlate,
  extractCaseNumber,
  suggestDocumentName,
  searchClaimsTargets,
  searchGarageTargets,
  searchVehicleTargets,
  type VehicleTarget,
} from './shareMultiService';
import type { ClaimRecord } from '@/features/claims/claimsConstants';
import type { GarageCase } from '@/modules/garage-management/garageBook';

describe('shareMultiService tests', () => {
  it('extracts Israeli license plates correctly from text and filenames', () => {
    expect(extractPlate('רישיון רכב 12-345-67')).toBe('12-345-67');
    expect(extractPlate('נזק לרכב 12345678 במוסך')).toBe('123-45-678');
    expect(extractPlate('photo_7347902.jpg')).toBe('73-479-02');
    expect(extractPlate('אין מספר רכב כאן')).toBeNull();
  });

  it('extracts claim numbers and garage case numbers correctly', () => {
    expect(extractCaseNumber('מסמך עבור תביעה DAL-2026-0275')).toBe('DAL-2026-0275');
    expect(extractCaseNumber('כרטיס מוסך GC-1002')).toBe('GC-1002');
    expect(extractCaseNumber('טקסט ללא מספר תיק')).toBeNull();
  });

  it('suggests smart Hebrew document names based on keywords and mime types', () => {
    expect(suggestDocumentName('license_front.jpg', 'image/jpeg')).toBe('צילום רישיון רכב');
    expect(suggestDocumentName('damage_bumper.png', 'image/png')).toBe('תמונת נזק');
    expect(suggestDocumentName('car-part_quote_123.pdf', 'application/pdf')).toBe('הצעת מחיר Car-Part');
    expect(suggestDocumentName('appraisal_report.pdf', 'application/pdf')).toBe('דוח שמאי');
    expect(suggestDocumentName('invoice_final.pdf', 'application/pdf')).toBe('חשבונית תיקון');
    expect(suggestDocumentName('random_file.png', 'image/png', 2)).toBe('תמונה 2');
  });

  it('searches claims targets correctly', () => {
    const claims: ClaimRecord[] = [
      { id: 'c1', claimNum: 'DAL-2026-0275', plate: '73-479-02', clientName: 'רוני אטיאס', insCompany: 'הפניקס', status: 'פתוחה' } as any,
      { id: 'c2', claimNum: 'DAL-2026-0100', plate: '12-345-67', clientName: 'דוד כהן', insCompany: 'מגדל', status: 'בטיפול' } as any,
    ];
    const res = searchClaimsTargets(claims, 'רוני');
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('c1');
    expect(res[0].title).toBe('תביעה DAL-2026-0275');
    expect(res[0].module).toBe('claims');
  });

  it('searches garage targets correctly', () => {
    const cases: GarageCase[] = [
      { id: 'g1', case_number: 'GC-1001', customer_name_snapshot: 'משה לוי', vehicle_plate_snapshot: '55-666-77', status: 'בתיקון' } as any,
      { id: 'g2', case_number: 'GC-2002', customer_name_snapshot: 'ישראל ישראלי', vehicle_plate_snapshot: '88-999-00', status: 'ממתין' } as any,
    ];
    const res = searchGarageTargets(cases, '55-666');
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('g1');
    expect(res[0].title).toBe('כרטיס מוסך GC-1001');
    expect(res[0].module).toBe('garage');
  });

  it('searches vehicles targets correctly', () => {
    const vehicles: VehicleTarget[] = [
      { id: 'v1', license_plate: '11-222-33', manufacturer: 'טויוטה', model: 'קורולה', company_name: 'אורן קאר' },
      { id: 'v2', license_plate: '44-555-66', manufacturer: 'הונדה', model: 'סיוויק', company_name: 'דליה' },
    ];
    const res = searchVehicleTargets(vehicles, 'קורולה');
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('v1');
    expect(res[0].title).toBe('רכב 11-222-33');
    expect(res[0].module).toBe('vehicles');
  });
});
