import { describe, expect, it } from 'vitest';
import { inferTreatmentRequest, isOpenTreatment, treatmentLabelOf } from './treatmentCenter';
import type { ClaimRecord } from './claimsConstants';

describe('inferTreatmentRequest', () => {
  it('maps a missing-license update to driver_license', () => {
    const r = inferTreatmentRequest('חסר רישיון נהיגה', 'צריך שני צדדים');
    expect(r.type).toBe('driver_license');
  });
});

describe('treatmentLabelOf', () => {
  it('does not show missing and received at once', () => {
    const open = { treatmentItem: 'true', action: 'רישיון נהיגה', workStatus: 'waiting_doc', docState: 'missing', done: 'false' } as ClaimRecord;
    const got = { ...open, workStatus: 'doc_received', docState: 'ready' } as ClaimRecord;
    expect(treatmentLabelOf(open)).toBe('חסר: רישיון נהיגה');
    expect(treatmentLabelOf(got)).toBe('התקבל — לבדיקה: רישיון נהיגה');
    expect(treatmentLabelOf(got)).not.toMatch(/חסר/);
  });
  it('closed treatments stay closed', () => {
    const t = { treatmentItem: 'true', action: 'רישיון נהיגה', done: 'true', workStatus: 'done' } as ClaimRecord;
    expect(isOpenTreatment(t)).toBe(false);
    expect(treatmentLabelOf(t)).toBe('רישיון נהיגה');
  });
});
