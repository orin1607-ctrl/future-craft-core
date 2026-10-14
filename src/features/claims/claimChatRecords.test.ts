// Fictitious data only.
import { describe, expect, it } from 'vitest';
import {
  checkWaRecipient,
  claimPhoneOwners,
  historyRow,
  normalizeDate,
  planReminder,
  planReminderUpdate,
  planTask,
  planWaSchedule,
  reminderRecords,
  resolveWaWhen,
  taskRecords,
  waScheduleRecords,
  withShareLink,
} from '../../../supabase/functions/_shared/claimChatRecords';

// Monday 12/10/2026, 10:00 in Israel.
const NOW = new Date('2026-10-12T07:00:00Z');

describe('history and dates', () => {
  it('writes history in the screen shape (id, claimId, valueBefore/After)', () => {
    const h = historyRow({ claimId: 'C1', action: 'הערה', note: 'טקסט', type: 'ai_note', by: 'בודק', at: 'x' });
    expect(h.claim_id).toBe('C1');
    expect(h.row_data).toMatchObject({ id: h.id, claimId: 'C1', action: 'הערה', note: 'טקסט', type: 'ai_note', valueBefore: '', valueAfter: '', by: 'בודק', at: 'x' });
  });

  it('normalizes dates and rejects impossible ones', () => {
    expect(normalizeDate('5/9/2026')).toBe('2026-09-05');
    expect(normalizeDate('2026-10-13')).toBe('2026-10-13');
    expect(normalizeDate('')).toBe('');
    expect(normalizeDate('31/02/2026')).toBeNull();
  });
});

describe('tasks', () => {
  it('builds the task, history and notification the screen writes', () => {
    const plan = planTask('C1', { action: 'לבקש חשבונית מהמוסך', dueDate: '14/10/2026', owner: 'דנה' }, []);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const r = taskRecords(plan.task, 'בודק', 'at');
    expect(r.task.row_data).toMatchObject({ claimId: 'C1', action: 'לבקש חשבונית מהמוסך', owner: 'דנה', dueDate: '2026-10-14', done: 'false', createdBy: 'בודק', createdAt: 'at' });
    expect(r.history.row_data).toMatchObject({ action: 'משימה נוספה: לבקש חשבונית מהמוסך', type: 'task', valueAfter: 'false' });
    expect(r.notification.row_data).toMatchObject({ type: 'task', message: 'משימה: לבקש חשבונית מהמוסך', read: 'false' });
  });

  it('does not create a duplicate of an open task, but allows one that was closed', () => {
    const open = [{ id: 'TSK-1', action: 'לבקש חשבונית מהמוסך.', done: 'false' }];
    const dup = planTask('C1', { action: '  לבקש  חשבונית מהמוסך ' }, open);
    expect(dup).toMatchObject({ ok: false, duplicateId: 'TSK-1' });
    expect(planTask('C1', { action: 'לבקש חשבונית מהמוסך' }, [{ ...open[0], done: 'true' }]).ok).toBe(true);
  });

  it('rejects an empty task or a bad due date', () => {
    expect(planTask('C1', { action: ' ' }, []).ok).toBe(false);
    expect(planTask('C1', { action: 'x', dueDate: '40/1/2026' }, []).ok).toBe(false);
  });
});

describe('reminders', () => {
  it('builds the reminder and history the screen writes', () => {
    const plan = planReminder('C1', { date: '2026-10-15', note: 'לבדוק תשובת שמאי' }, NOW);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const r = reminderRecords(plan.reminder, 'בודק', 'at');
    expect(r.reminder).toMatchObject({ claim_id: 'C1', action: 'note', row_data: { claimId: 'C1', date: '2026-10-15', note: 'לבדוק תשובת שמאי', owner: 'בודק', sent: 'false' } });
    expect(r.history.row_data).toMatchObject({ action: 'תזכורת נוספה: 2026-10-15', type: 'reminder' });
  });

  it('refuses a past date', () => {
    expect(planReminder('C1', { date: '2026-10-11', note: 'x' }, NOW).ok).toBe(false);
  });

  it('never brings back a cancelled or already-sent reminder', () => {
    expect(planReminderUpdate({ id: 'R', date: '2026-10-20', note: 'x', cancelled: 'true' }, { date: '2026-10-25' }, NOW).ok).toBe(false);
    expect(planReminderUpdate({ id: 'R', date: '2026-10-20', note: 'x', sent: 'true' }, { note: 'y' }, NOW).ok).toBe(false);
  });

  it('changes date or text, or cancels', () => {
    const moved = planReminderUpdate({ id: 'R', date: '2026-10-20', note: 'x' }, { date: '21/10/2026' }, NOW);
    expect(moved).toMatchObject({ ok: true, cancelled: false, next: { date: '2026-10-21', note: 'x' } });
    const cancelled = planReminderUpdate({ id: 'R', date: '2026-10-20', note: 'x' }, { cancel: true }, NOW);
    expect(cancelled).toMatchObject({ ok: true, cancelled: true, next: { cancelled: 'true' } });
    expect(planReminderUpdate({ id: 'R', date: '2026-10-20', note: 'x' }, { date: '2026-10-20' }, NOW).ok).toBe(false);
  });
});

describe('WhatsApp manual schedule', () => {
  it('turns "tomorrow" into tomorrow 09:00 Israel time, and "now" into now', () => {
    const tomorrow = resolveWaWhen({ relative_day: 1 }, NOW);
    expect(tomorrow).toMatchObject({ ok: true, plannedAt: '2026-10-13T06:00:00.000Z' });
    expect(resolveWaWhen({ when: 'now' }, NOW)).toMatchObject({ ok: true, plannedAt: NOW.toISOString(), label: 'עכשיו' });
    expect(resolveWaWhen({ date: '2026-10-12', time: '08:00' }, NOW).ok).toBe(false);
    expect(resolveWaWhen({}, NOW).ok).toBe(false);
  });

  it('builds the same row the WhatsApp modal saves, marked not sent', () => {
    const when = resolveWaWhen({ relative_day: 1, time: '10:30' }, NOW);
    if (!when.ok) throw new Error('when');
    const plan = planWaSchedule('C1', { phone: '050-1234567', body: 'שלום, עדכון בתביעה', contact_name: 'לקוח בדיקה' }, when, []);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const r = waScheduleRecords(plan.wa, 'בודק', 'at');
    expect(r.comm.row_data).toMatchObject({ claimId: 'C1', type: 'wa', phone: '050-1234567', waStatus: 'scheduled_blocked', delivery: 'not_sent', provider: 'none', direction: 'out', plannedAt: when.plannedAt });
    expect(r.history.row_data).toMatchObject({ action: 'תוזמנה WhatsApp (לא נשלחה)', type: 'wa', valueAfter: 'scheduled_blocked' });
  });

  it('refuses a bad phone, an empty message and a duplicate schedule', () => {
    const when = { plannedAt: '2026-10-13T06:00:00.000Z', label: 'x' };
    expect(planWaSchedule('C1', { phone: '123', body: 'x' }, when, []).ok).toBe(false);
    expect(planWaSchedule('C1', { phone: '0501234567', body: ' ' }, when, []).ok).toBe(false);
    const held = [{ id: 'COM-1', waStatus: 'scheduled_blocked', phone: '972501234567', body: 'שלום', plannedAt: when.plannedAt }];
    expect(planWaSchedule('C1', { phone: '050-1234567', body: 'שלום' }, when, held).ok).toBe(false);
  });

  it('puts the secure link into the message', () => {
    expect(withShareLink('הדוח כאן: {link}', 'https://x/s?t=1')).toBe('הדוח כאן: https://x/s?t=1');
    expect(withShareLink('מצורף הדוח', 'https://x/s?t=1')).toBe('מצורף הדוח\nhttps://x/s?t=1');
  });
});

describe('WhatsApp recipient check', () => {
  const claim = { clientName: 'לקוח בדיקה', clientPhone: '050-1111111', surveyor: 'שמאי בדיקה', survPhone: '052-2222222', insRepPhone: '03-3333333' };
  const owners = claimPhoneOwners(claim, [{ full_name: 'עו״ד בדיקה', role: 'עורך דין', phones: ['054-4444444'] }]);

  it('knows whose number each phone on the claim is', () => {
    expect(checkWaRecipient(owners, '0501111111', 'client')).toMatchObject({ ok: true, ownerLabel: 'לקוח (לקוח בדיקה)' });
    expect(checkWaRecipient(owners, '054-4444444', 'lawyer')).toMatchObject({ ok: true, ownerLabel: 'עורך דין (עו״ד בדיקה)' });
  });

  it("refuses the surveyor's number for a message to the client", () => {
    const res = checkWaRecipient(owners, '052-2222222', 'client');
    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toContain('שייך בתיק לשמאי');
  });

  it('warns when the number is not saved on the claim, without refusing', () => {
    expect(checkWaRecipient(owners, '058-9999999', 'client')).toMatchObject({ ok: true, ownerLabel: '', warning: expect.stringContaining('אינו שמור בתיק') });
  });
});

