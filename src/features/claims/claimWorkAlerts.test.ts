import { describe, expect, it } from 'vitest';
import {
  buildClaimRowAlerts,
  canMarkMailTaskDone,
  countUntreatedMails,
  customerTaskHistoryAction,
  detectMailRequests,
  followupDaysPreset,
  followupWaitDaysFromRow,
  inferRecipientKind,
  isOpenCustomerTask,
  isRecurringMailFollowup,
  isScheduledOnceMail,
  mailActionLabel,
  mailLooksInbound,
  normalizeRecurringDays,
  recurringDaysPreset,
  recurringLabel,
  mailShowsTreatment,
  normalizeFollowupDays,
} from './claimWorkAlerts';
import type { ClaimRecord } from './claimsConstants';

const claim = { id: 'DAL-QA-A', clientName: 'A', nextDate: '', status: 'בטיפול' } as ClaimRecord;
const other = { id: 'DAL-QA-B', clientName: 'B', nextDate: '', status: 'בטיפול' } as ClaimRecord;

describe('detectMailRequests', () => {
  it('identifies an insurer document request', () => {
    const found = detectMailRequests('נא להעביר רישיון נהיגה וחשבונית מוסך');
    expect(found.map((x) => x.type).sort()).toEqual(['driver_license', 'garage_invoice']);
  });
  it('does not guess on a vague update', () => {
    expect(detectMailRequests('עדכון כללי לגבי התיק').length).toBe(0);
  });
  it('identifies info, reply, approve and reject without guessing docs', () => {
    expect(detectMailRequests('נבקש לדעת מה הסכום שאושר').map((x) => x.type)).toContain('info');
    expect(detectMailRequests('נא להגיב למייל זה').map((x) => x.type)).toContain('reply');
    expect(detectMailRequests('אושרה התביעה לתשלום').map((x) => x.type)).toContain('approve');
    expect(detectMailRequests('התביעה נדחתה על ידי החברה').map((x) => x.type)).toContain('reject');
  });
});

describe('mailShowsTreatment', () => {
  const own = 'yoni122222@gmail.com';
  it('shows treatment for a real insurer From', () => {
    expect(mailShowsTreatment('insurer@example.com', own, 'עדכון')).toBe(true);
    expect(mailLooksInbound('insurer@example.com', own)).toBe(true);
  });
  it('shows treatment for self-mailbox TEST that asks for a document', () => {
    expect(mailLooksInbound(`Yoni <${own}>`, own)).toBe(false);
    expect(mailShowsTreatment(`Yoni <${own}>`, own, 'נא להעביר רישיון נהיגה')).toBe(true);
  });
  it('does not treat a self-mailbox note with no request as inbound work', () => {
    expect(mailShowsTreatment(`Yoni <${own}>`, own, 'תזכורת פנימית בלבד')).toBe(false);
  });
});

describe('buildClaimRowAlerts', () => {
  it('shows only actionable labels, not diary or umbrella chips', () => {
    const alerts = buildClaimRowAlerts({ ...claim, nextDate: '2026-09-20' } as ClaimRecord, {
      tasks: [
        { id: 't1', claimId: 'DAL-QA-A', audience: 'customer', customerStatus: 'sent', done: 'false' } as ClaimRecord,
        { id: 't2', claimId: 'DAL-QA-A', gmailMessageId: 'm1', requestKind: 'doc', docState: 'missing', done: 'false' } as ClaimRecord,
      ],
      notifs: [{ id: 'n1', claimId: 'DAL-QA-A', type: 'gmail_auto', read: 'false', gmail_message_id: 'm1' } as ClaimRecord],
      gmailPending: [],
      scheduledFollowups: [{ claim_id: 'DAL-QA-A', status: 'scheduled', purpose: 'scheduled_send' }],
    });
    const labels = alerts.map((a) => a.label);
    expect(labels).toContain('מייל חדש');
    expect(labels).toContain('ממתין ללקוח');
    expect(labels).not.toContain('נדרש טיפול');
    expect(labels).not.toContain('טיפול לפי יומן');
    expect(labels).not.toContain('מייל מתוזמן');
    expect(labels).not.toContain('חברת הביטוח ביקשה מסמך');
    expect(labels).not.toContain('חסר מסמך');
    expect(labels.filter((x) => x === 'מייל חדש').length).toBe(1);
  });

  it('hides a dismissed mail without treating the mail as done', () => {
    const ctx = {
      tasks: [{ id: 't2', claimId: 'DAL-QA-A', gmailMessageId: 'm1', done: 'false', tableAlert: 'off' } as ClaimRecord],
      notifs: [{ id: 'n1', claimId: 'DAL-QA-A', type: 'gmail_auto', read: 'true', gmail_message_id: 'm1' } as ClaimRecord],
      gmailPending: [] as Array<Record<string, unknown>>,
      scheduledFollowups: [],
    };
    expect(countUntreatedMails(claim, ctx)).toBe(0);
    expect(buildClaimRowAlerts(claim, ctx).map((a) => a.label)).not.toContain('מייל חדש');
  });

  it('does not list a treatment-bound mail as a separate mail label', () => {
    const alerts = buildClaimRowAlerts(claim, {
      tasks: [{
        id: 'TSK-1',
        claimId: 'DAL-QA-A',
        treatmentItem: 'true',
        kind: 'treatment_item',
        action: 'רישיון נהיגה',
        gmailMessageId: 'm9',
        done: 'false',
        workStatus: 'waiting_reply',
      } as ClaimRecord],
      notifs: [],
      gmailPending: [],
      scheduledFollowups: [],
    });
    expect(alerts.map((a) => a.key)).toEqual(['treat_TSK-1']);
    expect(alerts.some((a) => a.key === 'mail_action')).toBe(false);
  });

  it('counts distinct untreated mails 2 → 1 → 0 without treating read as done', () => {
    const two = {
      tasks: [
        { id: 't1', claimId: 'DAL-QA-A', gmailMessageId: 'm1', requestKind: 'doc', docState: 'missing', done: 'false' } as ClaimRecord,
        { id: 't2', claimId: 'DAL-QA-A', gmailMessageId: 'm2', requestKind: 'reply', done: 'false' } as ClaimRecord,
      ],
      notifs: [{ id: 'n1', claimId: 'DAL-QA-A', type: 'gmail_auto', read: 'true' } as ClaimRecord],
      gmailPending: [] as Array<Record<string, unknown>>,
      scheduledFollowups: [],
    };
    expect(countUntreatedMails(claim, two)).toBe(2);
    expect(buildClaimRowAlerts(claim, two).map((a) => a.label)).toContain('2 מיילים דורשים טיפול');
    const one = {
      ...two,
      tasks: [
        { ...two.tasks[0], done: 'true' } as ClaimRecord,
        two.tasks[1],
      ],
    };
    expect(countUntreatedMails(claim, one)).toBe(1);
    expect(buildClaimRowAlerts(claim, one).map((a) => a.label)).toContain('מייל חדש');
    const zero = { ...two, tasks: two.tasks.map((t) => ({ ...t, done: 'true' }) as ClaimRecord) };
    expect(countUntreatedMails(claim, zero)).toBe(0);
    expect(buildClaimRowAlerts(claim, zero).map((a) => a.label)).not.toContain('מייל חדש');
    expect(buildClaimRowAlerts(claim, zero).map((a) => a.label)).not.toContain('2 מיילים דורשים טיפול');
  });

  it('blocks marking done when a required document is missing', () => {
    expect(canMarkMailTaskDone({ docState: 'missing' }, 'done').ok).toBe(false);
    expect(canMarkMailTaskDone({ docState: 'awaiting_signature' }, 'done').ok).toBe(false);
    expect(canMarkMailTaskDone({ docState: 'missing' }, 'doc_not_needed').ok).toBe(true);
    expect(canMarkMailTaskDone({ docState: 'ready' }, 'done').ok).toBe(true);
  });

  it('isolates alerts between two claims', () => {
    const ctx = {
      tasks: [{ id: 't1', claimId: 'DAL-QA-A', audience: 'customer', customerStatus: 'pending', done: 'false' } as ClaimRecord],
      notifs: [{ id: 'n1', claimId: 'DAL-QA-A', type: 'gmail_auto', read: 'false' } as ClaimRecord],
      gmailPending: [] as Array<Record<string, unknown>>,
      scheduledFollowups: [{ claim_id: 'DAL-QA-A', status: 'scheduled' }],
    };
    const a = buildClaimRowAlerts(claim, ctx).map((x) => x.label);
    const b = buildClaimRowAlerts(other, ctx).map((x) => x.label);
    expect(a).toContain('משימה ללקוח');
    expect(b).not.toContain('משימה ללקוח');
    expect(b).not.toContain('מייל חדש');
    expect(a).not.toContain('נדרש טיפול');
  });
});

describe('customer helpers', () => {
  it('keeps pending customer tasks open', () => {
    expect(isOpenCustomerTask({ id: '1', audience: 'customer', customerStatus: 'pending', done: 'false' } as ClaimRecord)).toBe(true);
    expect(isOpenCustomerTask({ id: '1', audience: 'customer', customerStatus: 'cancelled', done: 'true' } as ClaimRecord)).toBe(false);
  });
  it('records create vs send history', () => {
    const created = customerTaskHistoryAction(null, { id: '1', audience: 'customer', customerKind: 'send_doc', requestText: 'שלח רישיון', channel: 'email' } as ClaimRecord);
    expect(created.action).toBe('משימה ללקוח נוצרה');
    const sent = customerTaskHistoryAction(
      { id: '1', audience: 'customer', customerStatus: 'pending' } as ClaimRecord,
      { id: '1', audience: 'customer', customerStatus: 'sent', requestText: 'שלח רישיון' } as ClaimRecord,
    );
    expect(sent.action).toBe('משימה נשלחה');
  });
  it('infers client vs insurer recipient', () => {
    expect(inferRecipientKind('a@client.com', { clientEmail: 'a@client.com', insEmail: 'ins@co.com' })).toBe('client');
    expect(inferRecipientKind('ins@co.com', { clientEmail: 'a@client.com', insEmail: 'ins@co.com' })).toBe('insurer');
  });
});

describe('followup day presets', () => {
  it('keeps 3/4/5/7 as named presets and anything else as אחר', () => {
    expect(normalizeFollowupDays(4)).toBe(4);
    expect(followupDaysPreset(3)).toBe(3);
    expect(followupDaysPreset(4)).toBe(4);
    expect(followupDaysPreset(5)).toBe(5);
    expect(followupDaysPreset(7)).toBe(7);
    expect(followupDaysPreset(9)).toBe('other');
    expect(normalizeFollowupDays(0)).toBe(3);
    expect(normalizeFollowupDays(99)).toBe(30);
  });
  it('restores wait days from stored row_data first', () => {
    expect(followupWaitDaysFromRow({ wait_days: '4' })).toBe(4);
    expect(followupWaitDaysFromRow({ wait_days: '9' })).toBe(9);
    expect(followupWaitDaysFromRow({ repeat_every_days: '7' })).toBe(7);
  });
});

describe('recurring day presets', () => {
  it('keeps 1/2/3 as named frequencies and anything else as אחר', () => {
    expect(normalizeRecurringDays(1)).toBe(1);
    expect(recurringDaysPreset(1)).toBe(1);
    expect(recurringDaysPreset(2)).toBe(2);
    expect(recurringDaysPreset(3)).toBe(3);
    expect(recurringDaysPreset(8)).toBe('other');
    expect(normalizeRecurringDays(0)).toBe(1);
    expect(recurringLabel(1)).toBe('כל יום');
    expect(recurringLabel(2)).toBe('כל יומיים');
    expect(recurringLabel(3)).toBe('כל 3 ימים');
    expect(recurringLabel(8)).toBe('כל 8 ימים');
  });
});

describe('scheduled once mail', () => {
  it('recognizes scheduled_send and not follow-up', () => {
    expect(isScheduledOnceMail('scheduled_send')).toBe(true);
    expect(isScheduledOnceMail('recurring_send')).toBe(false);
    expect(isScheduledOnceMail('')).toBe(false);
    expect(isScheduledOnceMail(undefined)).toBe(false);
  });
  it('labels only an active recurring followup as מייל מתמשך', () => {
    expect(isRecurringMailFollowup({ mail_kind: 'email_repeat' })).toBe(true);
    expect(isRecurringMailFollowup({ purpose: 'recurring_send' })).toBe(true);
    expect(isRecurringMailFollowup({ purpose: 'scheduled_send' })).toBe(false);
    const withRecurring = buildClaimRowAlerts(claim, {
      tasks: [],
      notifs: [],
      gmailPending: [],
      scheduledFollowups: [{ id: 'fu1', claim_id: 'DAL-QA-A', status: 'scheduled', mail_kind: 'email_repeat', purpose: 'recurring_send' }],
    }).map((a) => a.label);
    expect(withRecurring).not.toContain('מייל מתמשך');
    expect(withRecurring).not.toContain('טיפול לפי יומן');
    const withScheduled = buildClaimRowAlerts(claim, {
      tasks: [],
      notifs: [],
      gmailPending: [],
      scheduledFollowups: [{ id: 'fu2', claim_id: 'DAL-QA-A', status: 'scheduled', purpose: 'scheduled_send' }],
    }).map((a) => a.label);
    expect(withScheduled).not.toContain('מייל מתוזמן');
    const none = buildClaimRowAlerts(claim, {
      tasks: [],
      notifs: [],
      gmailPending: [],
      scheduledFollowups: [{ id: 'fu3', claim_id: 'DAL-QA-A', status: 'cancelled', mail_kind: 'email_repeat', purpose: 'recurring_send' }],
    }).map((a) => a.label);
    expect(none).not.toContain('מייל מתמשך');
    expect(mailActionLabel(1)).toBe('מייל חדש');
    expect(mailActionLabel(2)).toBe('2 מיילים דורשים טיפול');
  });

  it('shows no table label when the claim only has a diary nextDate', () => {
    const alerts = buildClaimRowAlerts({ ...claim, nextDate: '2026-09-20', status: 'בטיפול' } as ClaimRecord, {
      tasks: [],
      notifs: [],
      gmailPending: [],
      scheduledFollowups: [],
    });
    expect(alerts).toEqual([]);
  });

  it('hides a closed treatment and keeps a keep-mail label', () => {
    const closed = buildClaimRowAlerts(claim, {
      tasks: [{
        id: 'TSK-DONE',
        claimId: 'DAL-QA-A',
        treatmentItem: 'true',
        kind: 'treatment_item',
        action: 'רישיון נהיגה',
        done: 'true',
        workStatus: 'done',
      } as ClaimRecord],
      notifs: [],
      gmailPending: [],
      scheduledFollowups: [],
    });
    expect(closed.some((a) => a.key.startsWith('treat_'))).toBe(false);
    const kept = buildClaimRowAlerts(claim, {
      tasks: [{ id: 't2', claimId: 'DAL-QA-A', gmailMessageId: 'm1', done: 'false', tableAlert: 'keep' } as ClaimRecord],
      notifs: [],
      gmailPending: [],
      scheduledFollowups: [],
    });
    expect(kept.map((a) => a.key)).toContain('mail_action');
    expect(kept.find((a) => a.key === 'mail_action')?.why).toContain('מייל חדש');
  });

  it('opens a treatment label with the exact task id', () => {
    const alerts = buildClaimRowAlerts(claim, {
      tasks: [{
        id: 'TSK-LIC',
        claimId: 'DAL-QA-A',
        treatmentItem: 'true',
        kind: 'treatment_item',
        action: 'רישיון נהיגה',
        workStatus: 'waiting_doc',
        docState: 'missing',
        done: 'false',
      } as ClaimRecord],
      notifs: [],
      gmailPending: [],
      scheduledFollowups: [],
    });
    const treat = alerts.find((a) => a.key === 'treat_TSK-LIC');
    expect(treat?.label).toBe('חסר: רישיון נהיגה');
    expect(treat?.taskId).toBe('TSK-LIC');
    expect(alerts.filter((a) => a.label.includes('חסר מסמך')).length).toBe(0);
  });
});
