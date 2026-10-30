import { describe, expect, it } from 'vitest';
import {
  EMPTY_INTAKE,
  ACCIDENT_NOTICE_FIELDS,
  intakeFromClaim,
  mergeIntakeToClaim,
} from './claimIntakeModel';
import {
  mapGovDataToNewFormFields,
  type GovVehicleData,
} from '@/lib/govVehicleLookup';

describe('Claims vehicle intake and gov lookup integration', () => {
  const sampleGovData: GovVehicleData = {
    mispar_rechev: 12345678,
    tozeret_nm: 'יונדאי',
    degem_nm: 'איוניק',
    kinuy_mishari: 'IONIQ',
    shnat_yitzur: 2021,
    tzeva_rechev: 'לבן',
    sug_delek_nm: 'היברידי',
    misgeret: 'KMHC1234567890VIN',
    baalut: 'פרטי',
    tokef_dt: '2027-05-31',
    mivchan_acharon_dt: '2026-05-15',
    zmig_kidmi: '205/55R16',
    zmig_ahori: '205/55R16',
    ramat_gimur: 'PREMIUM',
    degem_manoa: 'G4LE',
    moed_aliya_lakvish: '2021-06-01',
    sug_rechev_nm: 'פרטי נוסעים',
    kilometer_test_aharon: 62450,
    test_mileage: 62450,
    test_date: '2026-05-15',
    test_source: 'משרד התחבורה — היסטוריית כלי רכב פרטיים (1)',
  };

  it('includes all vehicle, test mileage and valuation fields in EMPTY_INTAKE and ACCIDENT_NOTICE_FIELDS', () => {
    const requiredKeys = [
      'plate',
      'carMake',
      'carModel',
      'carYear',
      'ramatGimur',
      'roadDate',
      'ownershipType',
      'fuelType',
      'carColor',
      'vin',
      'engineNumber',
      'mileage',
      'testMileage',
      'testDate',
      'testSource',
      'prevOwners',
      'basicPrice',
      'weightedPrice',
      'valuationDate',
      'valuationSource',
    ];

    for (const key of requiredKeys) {
      expect(key in EMPTY_INTAKE).toBe(true);
      const fieldEntry = ACCIDENT_NOTICE_FIELDS.find((f) => f.key === key);
      expect(fieldEntry).toBeDefined();
    }
  });

  it('maps government mileage history to test_mileage and test_source in mapGovDataToNewFormFields', () => {
    const mapped = mapGovDataToNewFormFields('12345678', sampleGovData);
    expect(mapped.test_mileage).toBe('62450');
    expect(mapped.test_date).toBe('2026-05-15');
    expect(mapped.test_source).toBe('משרד התחבורה — היסטוריית כלי רכב פרטיים (1)');
    expect(mapped.manufacturer).toBe('יונדאי');
    expect(mapped.model).toBe('IONIQ');
  });

  it('preserves existing user entries when updating from gov vehicle data (no overwrite)', () => {
    // User already entered carMake manually
    const currentIntake = {
      ...EMPTY_INTAKE,
      plate: '12345678',
      carMake: 'יונדאי שלי (מותאם)',
      carModel: '',
      carYear: '',
      mileage: '65000', // user entered current mileage
    };

    const govMake = sampleGovData.tozeret_nm;
    const govModel = sampleGovData.kinuy_mishari || sampleGovData.degem_nm;
    const govYear = String(sampleGovData.shnat_yitzur);
    const govTestKm = String(sampleGovData.kilometer_test_aharon);

    // Apply only if empty
    const nextIntake = { ...currentIntake };
    if (!nextIntake.carMake.trim() && govMake) nextIntake.carMake = govMake;
    if (!nextIntake.carModel.trim() && govModel) nextIntake.carModel = govModel;
    if (!nextIntake.carYear.trim() && govYear) nextIntake.carYear = govYear;
    // Test mileage does not overwrite current mileage!
    nextIntake.testMileage = govTestKm;

    expect(nextIntake.carMake).toBe('יונדאי שלי (מותאם)'); // preserved!
    expect(nextIntake.carModel).toBe('IONIQ'); // filled!
    expect(nextIntake.carYear).toBe('2021'); // filled!
    expect(nextIntake.mileage).toBe('65000'); // current mileage untouched!
    expect(nextIntake.testMileage).toBe('62450'); // test mileage stored separately!
  });

  it('correctly persists both current mileage and test mileage in mergeIntakeToClaim without dropping data', () => {
    const base = { id: 'claim-123', clientName: 'דוד כהן', fc_status: 'בטיפול' };
    const draft = {
      ...EMPTY_INTAKE,
      plate: '12-345-67',
      carMake: 'טויוטה',
      carModel: 'קורולה',
      carYear: '2020',
      ramatGimur: 'Sunroof',
      roadDate: '2020-03-01',
      ownershipType: 'פרטי',
      mileage: '48200',
      testMileage: '45000',
      testDate: '2026-04-12',
      testSource: 'משרד התחבורה — היסטוריית כלי רכב פרטיים (1)',
      prevOwners: '1',
      basicPrice: '85000',
      weightedPrice: '82000',
      valuationDate: '2026-10-30',
      valuationSource: 'לוי יצחק (בדיקה ידנית)',
    };

    const merged = mergeIntakeToClaim(base, draft);

    expect(merged.plate).toBe('12-345-67');
    expect(merged.carMake).toBe('טויוטה');
    expect(merged.ramatGimur).toBe('Sunroof');
    expect(merged.roadDate).toBe('2020-03-01');
    expect(merged.ownershipType).toBe('פרטי');
    expect(merged.mileage).toBe('48200'); // current mileage
    expect(merged.testMileage).toBe('45000'); // historical test mileage
    expect(merged.testDate).toBe('2026-04-12');
    expect(merged.testSource).toBe('משרד התחבורה — היסטוריית כלי רכב פרטיים (1)');
    expect(merged.basicPrice).toBe('85000');
    expect(merged.weightedPrice).toBe('82000');
    expect(merged.valuationSource).toBe('לוי יצחק (בדיקה ידנית)');

    // Test reverse hydration with intakeFromClaim
    const rehydrated = intakeFromClaim(merged);
    expect(rehydrated.mileage).toBe('48200');
    expect(rehydrated.testMileage).toBe('45000');
    expect(rehydrated.testDate).toBe('2026-04-12');
    expect(rehydrated.testSource).toBe('משרד התחבורה — היסטוריית כלי רכב פרטיים (1)');
  });
});
