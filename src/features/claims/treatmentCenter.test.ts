import { describe, expect, it } from 'vitest';
import { filesForTreatment, inferTreatmentRequest, isOpenTreatment, liveRecurringForTreatment, recurringForTreatment, treatmentLabelOf } from './treatmentCenter';
import type { ClaimRecord } from './claimsConstants';

describe('recurringForTreatment', () => {
  it('keeps recurring on the same treatment and ignores follow-up/scheduled', () => {
    const rows = [
      { id: 'A', status: 'scheduled', mail_kind: 'email_repeat', purpose: 'recurring_send', treatment_task_id: 'TSK-1' },
      { id: 'B', status: 'scheduled', mail_kind: 'email_repeat', purpose: 'recurring_send', treatment_task_id: 'TSK-2' },
      { id: 'C', status: 'scheduled', mail_kind: 'email_once', purpose: '', treatment_task_id: 'TSK-1' },
      { id: 'D', status: 'cancelled', mail_kind: 'email_repeat', purpose: 'recurring_send', treatment_task_id: 'TSK-1' },
    ];
    expect(recurringForTreatment(rows, 'TSK-1').map((r) => r.id)).toEqual(['A', 'D']);
    expect(liveRecurringForTreatment(rows, 'TSK-1').map((r) => r.id)).toEqual(['A']);
    expect(recurringForTreatment(rows, 'TSK-2').map((r) => r.id)).toEqual(['B']);
  });

  it('does not list claim-level recurring on a treatment', () => {
    const rows = [
      { id: 'CLAIM', status: 'scheduled', mail_kind: 'email_repeat', purpose: 'recurring_send', treatment_task_id: '' },
      { id: 'SCHED', status: 'scheduled', mail_kind: 'email_once', purpose: 'scheduled_send', treatment_task_id: 'TSK-1' },
    ];
    expect(recurringForTreatment(rows, 'TSK-1').map((r) => r.id)).toEqual([]);
    expect(liveRecurringForTreatment(rows, 'TSK-1')).toEqual([]);
  });
});

describe('inferTreatmentRequest', () => {
  it('maps a missing-license update to driver_license', () => {
    const r = inferTreatmentRequest('חסר רישיון נהיגה', 'צריך שני צדדים');
    expect(r.type).toBe('driver_license');
  });
});

describe('filesForTreatment', () => {
  it('binds the customer license by readyFileId and staff type', () => {
    const t = { treatmentItem: 'true', requestType: 'driver_license', readyFileId: 'CDM-1' } as ClaimRecord;
    const files = [
      { id: 'CDM-1', original_name: 'license.png', doc_meta: { staff_type: 'driver_license' } },
      { id: 'CDM-2', original_name: 'other.pdf', doc_meta: { staff_type: 'surveyor_report' } },
    ];
    expect(filesForTreatment(t, files).map((f) => f.id)).toEqual(['CDM-1']);
  });
  it('also matches the existing license_driver doc key to driver_license', () => {
    const t = { treatmentItem: 'true', requestType: 'license_driver' } as ClaimRecord;
    const files = [{ id: 'CDM-3', original_name: 'license.png', doc_kind: 'driver_license', doc_meta: { staff_type: 'driver_license' } }];
    expect(filesForTreatment(t, files).map((f) => f.id)).toEqual(['CDM-3']);
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
