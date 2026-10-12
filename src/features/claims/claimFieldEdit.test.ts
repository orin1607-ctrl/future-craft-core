// Fictitious claim data only.
import { describe, expect, it } from 'vitest';
import {
  CLAIM_EDIT_FIELDS,
  applyClaimFieldEdit,
  describeChanges,
  planClaimFieldEdit,
  resolveField,
} from '../../../supabase/functions/_shared/claimFieldEdit';

const claim = {
  id: 'DAL-QA-TEST-0001',
  claimNum: 'OLD-123',
  eventDate: '2026-09-01',
  plate: '11-222-33',
  insCompany: 'הראל',
  company_name: '',
  clientName: 'לקוח בדיקה',
  notes: 'הערה קיימת שלא נוגעים בה',
  finApproved: '1000',
  finPaid: '200',
  finBalance: '800',
  status: 'חדש',
};

describe('claim field edits — what can be edited', () => {
  it('covers the claim form fields the user asked for, and not status or notes', () => {
    for (const key of ['claimNum', 'eventDate', 'plate', 'insCompany', 'policyNum', 'thirdParty', 'thirdPlate', 'surveyor', 'clientName']) {
      expect(CLAIM_EDIT_FIELDS[key]).toBeDefined();
    }
    for (const key of ['status', 'notes', 'nextDate', 'nextAction', 'id', 'deletedAt']) {
      expect(CLAIM_EDIT_FIELDS[key]).toBeUndefined();
    }
  });

  it('understands Hebrew field names', () => {
    expect(resolveField('מספר תביעה בחברת הביטוח')).toBe('claimNum');
    expect(resolveField('תאריך תאונה')).toBe('eventDate');
    expect(resolveField('מספר רכב')).toBe('plate');
    expect(resolveField('חברת ביטוח')).toBe('insCompany');
    expect(resolveField('סטטוס')).toBeNull();
  });
});

describe('planClaimFieldEdit', () => {
  it('shows the current value next to the new one for each requested field', () => {
    const plan = planClaimFieldEdit(claim, [
      { field: 'מספר תביעה', value: 'NEW-987' },
      { field: 'תאריך תאונה', value: '05/09/2026' },
    ]);
    expect(plan.errors).toEqual([]);
    expect(plan.changes).toEqual([
      expect.objectContaining({ field: 'claimNum', before: 'OLD-123', after: 'NEW-987' }),
      expect.objectContaining({ field: 'eventDate', before: '2026-09-01', after: '2026-09-05' }),
    ]);
    const lines = describeChanges(plan.changes);
    expect(lines[0]).toContain('ערך נוכחי: OLD-123');
    expect(lines[0]).toContain('ערך חדש: NEW-987');
  });

  it('marks fields that drive mail matching', () => {
    const plan = planClaimFieldEdit(claim, [{ field: 'plate', value: '44-555-66' }, { field: 'policyNum', value: 'P-1' }]);
    expect(plan.changes.find((c) => c.field === 'plate')?.risk).toContain('שיוך מיילים');
    expect(plan.changes.find((c) => c.field === 'policyNum')?.risk).toBeUndefined();
  });

  it('rejects unknown fields, empty values and bad formats instead of guessing', () => {
    const plan = planClaimFieldEdit(claim, [
      { field: 'status', value: 'סגור' },
      { field: 'claimNum', value: '   ' },
      { field: 'eventDate', value: '31/02/2026' },
      { field: 'plate', value: '12' },
      { field: 'clientEmail', value: 'not-an-email' },
      { field: 'claimKind', value: 'משהו אחר' },
    ]);
    expect(plan.changes).toEqual([]);
    expect(plan.errors).toHaveLength(6);
  });

  it('skips a value that is already in the claim, and a field asked twice', () => {
    const plan = planClaimFieldEdit(claim, [
      { field: 'insCompany', value: 'הראל' },
      { field: 'claimNum', value: 'A-1' },
      { field: 'claimNum', value: 'A-2' },
    ]);
    expect(plan.unchanged).toEqual(['חברת ביטוח']);
    expect(plan.changes.map((c) => c.after)).toEqual(['A-1']);
    expect(plan.errors[0]).toContain('יותר מפעם אחת');
  });
});

describe('applyClaimFieldEdit', () => {
  const meta = { nowHe: '12.10.2026, 10:00:00', actorName: 'בודק' };

  it('changes only the requested fields and keeps everything else', () => {
    const plan = planClaimFieldEdit(claim, [{ field: 'claimNum', value: 'NEW-987' }, { field: 'plate', value: '44-555-66' }]);
    const out = applyClaimFieldEdit(claim, plan.changes, meta);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.rowData).toMatchObject({ claimNum: 'NEW-987', plate: '44-555-66', notes: claim.notes, status: 'חדש', eventDate: '2026-09-01', updatedByName: 'בודק' });
    expect(out.columns).toEqual({ plate: '44-555-66' });
  });

  it('keeps the synced columns the way the edit form does', () => {
    const named = applyClaimFieldEdit(claim, planClaimFieldEdit(claim, [{ field: 'clientName', value: 'שם מתוקן' }]).changes, meta);
    expect(named.ok && named.columns).toEqual({ client_name: 'שם מתוקן' });
    const ins = applyClaimFieldEdit(claim, planClaimFieldEdit(claim, [{ field: 'insCompany', value: 'מגדל' }]).changes, meta);
    expect(ins.ok && ins.columns).toEqual({ company_name: 'מגדל' });
    const withCompany = { ...claim, company_name: 'צי רכב בדיקה' };
    const kept = applyClaimFieldEdit(withCompany, planClaimFieldEdit(withCompany, [{ field: 'insCompany', value: 'מגדל' }]).changes, meta);
    expect(kept.ok && kept.columns).toEqual({ company_name: 'צי רכב בדיקה' });
  });

  it('recalculates the balance when paid or approved amounts change', () => {
    const out = applyClaimFieldEdit(claim, planClaimFieldEdit(claim, [{ field: 'finPaid', value: '₪ 450' }]).changes, meta);
    expect(out.ok && out.rowData).toMatchObject({ finPaid: '450', finBalance: '550' });
  });

  it('refuses when the claim changed since the approval card was made', () => {
    const plan = planClaimFieldEdit(claim, [{ field: 'claimNum', value: 'NEW-987' }]);
    const changedMeanwhile = { ...claim, claimNum: 'SOMEONE-ELSE' };
    const out = applyClaimFieldEdit(changedMeanwhile, plan.changes, meta);
    expect(out).toEqual({ ok: false, stale: ['מספר תביעה בחברת הביטוח'] });
  });
});
