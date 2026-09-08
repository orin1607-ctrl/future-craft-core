import { describe, expect, it } from 'vitest';
import {
  ACCIDENT_NOTICE_FIELDS,
  EMPTY_INTAKE,
  customerSteps,
  displayDriverName,
  intakeFromClaim,
  mergeIntakeToClaim,
  toggleCsv,
} from './claimIntakeModel';

describe('accident notice field catalog', () => {
  it('maps every form field onto EMPTY_INTAKE so no schema migration is required', () => {
    const missing = ACCIDENT_NOTICE_FIELDS.filter((f) => !(f.key in EMPTY_INTAKE)).map((f) => f.key);
    expect(missing).toEqual([]);
  });

  it('always shows driver, third-party, declaration and review steps', () => {
    expect(customerSteps().map((s) => s.key)).toEqual(['client', 'driver', 'event', 'third', 'sign', 'review']);
  });
});

describe('intakeFromClaim autofill', () => {
  it('reuses client / vehicle / claim fields and fills reporter + mobile + driver defaults', () => {
    const d = intakeFromClaim({
      clientName: 'ישראל ישראלי',
      clientPhone: '0501112222',
      clientEmail: 'a@b.c',
      clientId: '123456789',
      clientAddress: 'הרצל 1',
      plate: '12-345-67',
      carMake: 'טויוטה',
      carModel: 'קורולה',
      insCompany: 'הראל',
      policyNum: 'P-9',
      claimNum: 'C-1',
      eventDate: '2026-09-01',
      surveyor: 'שמאי דוד',
    });
    expect(d.clientName).toBe('ישראל ישראלי');
    expect(d.phoneMobile).toBe('0501112222');
    expect(d.reporterName).toBe('ישראל ישראלי');
    expect(d.reporterPhone).toBe('0501112222');
    expect(d.addressStreet).toBe('הרצל 1');
    expect(d.driverName).toBe('ישראל ישראלי');
    expect(d.driverId).toBe('123456789');
    expect(d.surveyorName).toBe('שמאי דוד');
    expect(d.declarationDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(displayDriverName(d)).toBe('ישראל ישראלי');
  });

  it('does not invent a second driver when a different driver is already stored', () => {
    const d = intakeFromClaim({
      clientName: 'ישראל ישראלי',
      driverName: 'דנה כהן',
      driverDifferent: 'true',
      clientPhone: '0501112222',
    });
    expect(d.driverDifferent).toBe('true');
    expect(d.driverName).toBe('דנה כהן');
    expect(d.reporterName).toBe('ישראל ישראלי');
  });
});

describe('mergeIntakeToClaim', () => {
  it('persists new form keys on the same claim row_data without dropping existing staff fields', () => {
    const merged = mergeIntakeToClaim(
      { id: 'DAL-2026-0999', notes: 'פנימי', surveyor: 'שמאי קיים', thirdEmail: 't@x.com' },
      {
        ...EMPTY_INTAKE,
        clientName: 'לקוח בדיקה',
        phoneMobile: '0520000000',
        journalNumber: 'J-88',
        fireDept: 'true',
        tripPurpose: 'work_to',
        thirdClaimAgainstMe: 'true',
        witness1Name: 'עד א',
        thirdAddress: 'אלנבי 10',
        agentName: 'סוכן ראובן',
        policyValidUntil: '2027-01-01',
      },
    );
    expect(merged.id).toBe('DAL-2026-0999');
    expect(merged.notes).toBe('פנימי');
    expect(merged.surveyor).toBe('שמאי קיים');
    expect(merged.thirdEmail).toBe('t@x.com');
    expect(merged.clientPhone).toBe('0520000000');
    expect(merged.journalNumber).toBe('J-88');
    expect(merged.fireDept).toBe('true');
    expect(merged.tripPurpose).toBe('work_to');
    expect(merged.thirdClaimAgainstMe).toBe('true');
    expect(merged.witness1Name).toBe('עד א');
    expect(merged.thirdAddress).toBe('אלנבי 10');
    expect(merged.agentName).toBe('סוכן ראובן');
    expect(merged.policyValidUntil).toBe('2027-01-01');
    expect(merged.thirdParty).toBe('');
  });
});

describe('toggleCsv', () => {
  it('adds and removes damage zones without duplicates', () => {
    expect(toggleCsv('', 'חזית')).toBe('חזית');
    expect(toggleCsv('חזית,אחור', 'חזית')).toBe('אחור');
  });
});
