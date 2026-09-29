import { describe, expect, it } from 'vitest';
import { buildMailView, mailSnippet, mailViewCounts, rowMatches, sectionOf } from './claimMailView';
import type { AlertContext } from '@/features/claims/claimWorkAlerts';

const own = 'dalia@example.com';
const claim = { id: 'C1', status: 'בטיפול' } as never;
const NOW = new Date('2026-09-28T09:00:00Z').getTime();

function ctx(extra: Partial<AlertContext> = {}): AlertContext {
  return { tasks: [], notifs: [], gmailPending: [], scheduledFollowups: [], ...extra };
}

const imports = [
  { id: 'i1', gmail_message_id: 'a1', gmail_thread_id: 'T1', subject: 'בקשת מסמכים', from_addr: 'מגדלור <ins@example.com>', to_addr: own, sent_at: '2026-09-20T08:00:00Z', body_text: 'נבקש רישיון נהיגה\n> ציטוט ישן' },
  { id: 'i2', gmail_message_id: 'a3', gmail_thread_id: 'T1', subject: 'Re: בקשת מסמכים', from_addr: 'ins@example.com', to_addr: own, sent_at: '2026-09-27T08:00:00Z', body_text: 'עדיין חסר טופס' },
  { id: 'i3', gmail_message_id: 'b1', gmail_thread_id: 'T2', subject: 'עדכון', from_addr: 'avi@example.com', to_addr: own, sent_at: '2026-09-10T08:00:00Z', body_text: 'לידיעה' },
];
const sends = [
  { id: 's1', gmail_message_id: 'a2', gmail_thread_id: 'T1', subject: 'Re: בקשת מסמכים', to_addr: 'ins@example.com', sent_at: '2026-09-21T08:00:00Z', file_names: ['x.pdf'] },
  { id: 's2', gmail_message_id: 'c1', gmail_thread_id: 'T3', subject: 'דוח שמאי', to_addr: 'avi@example.com', sent_at: '2026-09-25T08:00:00Z', track_status: 'waiting_reply', track_due: '2026-09-27T08:00:00Z' },
];

describe('buildMailView — display only over existing rows', () => {
  const base = { claim, imports, sends, ownMailbox: own, contacts: [], files: [{ gmail_message_id: 'a1' }, { gmail_message_id: 'a1' }], now: NOW };

  it('keeps every mail exactly once (same unify + thread grouping)', () => {
    const v = buildMailView({ ...base, ctx: ctx() });
    const ids = v.threads.flatMap((t) => t.mails.map((r) => r.mail.gmail_message_id)).sort();
    expect(ids).toEqual(['a1', 'a2', 'a3', 'b1', 'c1']);
    expect(v.total).toBe(5);
    expect(v.threads.map((t) => t.key).sort()).toEqual(['T1', 'T2', 'T3']);
  });

  it('marks "needs action" only from untreatedMailIds, and a reply after our mail as reply', () => {
    const v = buildMailView({ ...base, ctx: ctx({ tasks: [{ id: 't', claimId: 'C1', gmailMessageId: 'a3', done: 'false' } as never] }) });
    const t1 = v.threads.find((t) => t.key === 'T1')!;
    expect(t1.mails.find((r) => r.mail.gmail_message_id === 'a3')!.state).toBe('reply');
    expect(t1.mails.find((r) => r.mail.gmail_message_id === 'a1')!.state).toBe('received');
    expect(t1.state).toBe('act');
    expect(sectionOf(t1)).toBe('act');
  });

  it('shows "handled" after קראתי (tableAlert off) without changing anything', () => {
    const v = buildMailView({ ...base, ctx: ctx({ tasks: [{ id: 't', claimId: 'C1', gmailMessageId: 'a3', tableAlert: 'off', done: 'false' } as never] }) });
    const row = v.threads.find((t) => t.key === 'T1')!.mails.find((r) => r.mail.gmail_message_id === 'a3')!;
    expect(row.state).toBe('handled');
  });

  it('reads waiting/overdue from the send journal tracking fields', () => {
    const v = buildMailView({ ...base, ctx: ctx() });
    const t3 = v.threads.find((t) => t.key === 'T3')!;
    expect(t3.last.state).toBe('overdue');
    expect(t3.state).toBe('overdue');
    const later = buildMailView({ ...base, ctx: ctx(), now: new Date('2026-09-26T00:00:00Z').getTime() });
    expect(later.threads.find((t) => t.key === 'T3')!.state).toBe('wait');
  });

  it('counts attachments from claim files by gmail_message_id, then file_names', () => {
    const v = buildMailView({ ...base, ctx: ctx() });
    const rows = v.threads.flatMap((t) => t.mails);
    expect(rows.find((r) => r.mail.gmail_message_id === 'a1')!.attachCount).toBe(2);
    expect(rows.find((r) => r.mail.gmail_message_id === 'a2')!.attachCount).toBe(1);
  });

  it('reports untreated ids that are not in the list', () => {
    const v = buildMailView({ ...base, ctx: ctx({ notifs: [{ id: 'n', claimId: 'C1', type: 'gmail_auto', read: 'false', gmail_message_id: 'zz' } as never] }) });
    expect(v.missingNeedIds).toEqual(['zz']);
  });

  it('filters by direction, need and query without dropping data', () => {
    const v = buildMailView({ ...base, ctx: ctx() });
    const rows = v.threads.flatMap((t) => t.mails);
    expect(rows.filter((r) => rowMatches(r, 'in', '')).length).toBe(3);
    expect(rows.filter((r) => rowMatches(r, 'out', '')).length).toBe(2);
    expect(rows.filter((r) => rowMatches(r, 'all', 'שמאי')).length).toBe(1);
    const c = mailViewCounts(v.threads, NOW);
    expect(c.total).toBe(5);
    expect(c.incoming + c.outgoing).toBe(5);
  });
});

describe('mailSnippet', () => {
  it('drops the quoted original and collapses whitespace', () => {
    expect(mailSnippet('שלום\n\nמצורף\n> ישן')).toBe('שלום מצורף');
  });
});
