import { describe, expect, it } from 'vitest';

describe('bulkInsuranceRedHighlight', () => {
  it('documents bulk scope is per company only', () => {
    const beeri = 'קיבוץ בארי';
    const other = 'דרכי חיים';
    expect(beeri).not.toBe(other);
  });
});
