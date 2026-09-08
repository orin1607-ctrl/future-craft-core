import { describe, expect, it } from 'vitest';
import { gmailOpenHref, groupMailThreads, isGmailApiId, unifyCorrespondence } from './claimMailThread';

const own = 'yoni122222@gmail.com';

describe('unifyCorrespondence', () => {
  it('dedups the same Gmail message id across import and send journal', () => {
    const unified = unifyCorrespondence(
      [{ id: 'IMP-1', gmail_message_id: 'm1', gmail_thread_id: 't1', from_addr: own, to_addr: 'a@b.com', subject: 'Re', sent_at: '2026-09-01T10:00:00Z', body_text: 'out' }],
      [{ id: 'SND-1', gmail_message_id: 'm1', gmail_thread_id: 't1', to_addr: 'a@b.com', subject: 'Re', sent_at: '2026-09-01T10:00:00Z', send_no: '12' }],
      own,
    );
    expect(unified).toHaveLength(1);
    expect(unified[0].direction).toBe('outgoing');
    expect(unified[0].source).toBe('both');
    expect(unified[0].send_no).toBe('12');
  });

  it('keeps a reply as a new message in the same thread', () => {
    const unified = unifyCorrespondence(
      [
        { id: 'IMP-1', gmail_message_id: 'm1', gmail_thread_id: 't1', from_addr: 'client@x.com', to_addr: own, subject: 'רישיון', sent_at: '2026-09-01T09:00:00Z' },
        { id: 'IMP-2', gmail_message_id: 'm2', gmail_thread_id: 't1', from_addr: 'client@x.com', to_addr: own, subject: 'Re: רישיון', sent_at: '2026-09-01T11:00:00Z' },
      ],
      [{ id: 'SND-1', gmail_message_id: 'm-out', gmail_thread_id: 't1', from_addr: own, to_addr: 'client@x.com', sent_at: '2026-09-01T10:00:00Z' }],
      own,
    );
    expect(unified.map((m) => m.gmail_message_id)).toEqual(['m1', 'm-out', 'm2']);
    expect(unified.map((m) => m.direction)).toEqual(['incoming', 'outgoing', 'incoming']);
    const groups = groupMailThreads(unified);
    expect(groups).toHaveLength(1);
    expect(groups[0].mails.at(-1)?.gmail_message_id).toBe('m2');
  });
});

describe('gmailOpenHref', () => {
  it('prefers a hex thread id and pins the connected mailbox', () => {
    expect(isGmailApiId('1a0818d6107b7ddf')).toBe(true);
    expect(gmailOpenHref({
      threadId: '1a0818d6107b7ddf',
      messageId: '1a08186232cd861d',
      authUser: 'yoni122222@gmail.com',
    })).toBe('https://mail.google.com/mail/?authuser=yoni122222%40gmail.com#all/1a0818d6107b7ddf');
  });

  it('falls back to a hex message id when thread is missing', () => {
    expect(gmailOpenHref({ messageId: '1a08186232cd861d' })).toBe('https://mail.google.com/mail/#all/1a08186232cd861d');
  });

  it('does not guess from internal ids or subject-like values', () => {
    expect(isGmailApiId('IMP-1')).toBe(false);
    expect(isGmailApiId('GOS-1788879446190-8ZZN12')).toBe(false);
    expect(isGmailApiId('DAL-2026-0214')).toBe(false);
    expect(gmailOpenHref({ threadId: 'IMP-1', messageId: 'GOS-1' })).toBeNull();
    expect(gmailOpenHref({ threadId: 'Re: רישיון', messageId: 'client@x.com' })).toBeNull();
  });
});
