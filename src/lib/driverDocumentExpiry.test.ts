import { describe, expect, it } from 'vitest';
import {
  addYearsToDate,
  computeExpiryFromValidity,
  documentExpiryStatus,
  documentExpiryStatusLabel,
} from './driverDocumentExpiry';

describe('driverDocumentExpiry', () => {
  it('adds 3 years for traffic info example', () => {
    expect(addYearsToDate('2023-08-10', 3)).toBe('2026-08-10');
  });

  it('adds 5 years for health declaration example', () => {
    expect(addYearsToDate('2021-08-10', 5)).toBe('2026-08-10');
  });

  it('computeExpiryFromValidity returns null without years', () => {
    expect(computeExpiryFromValidity('2023-01-01', null)).toBeNull();
  });

  it('documentExpiryStatus labels', () => {
    const far = new Date();
    far.setFullYear(far.getFullYear() + 2);
    expect(documentExpiryStatus(far.toISOString().split('T')[0])).toBe('valid');
    expect(documentExpiryStatusLabel('valid')).toBe('תקף');
  });
});
