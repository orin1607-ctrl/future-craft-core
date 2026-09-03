import { describe, expect, it } from 'vitest';
import { matchIncomingMail, type MatchClaim } from '../../../supabase/functions/claims-gmail/matchIncoming';

const a: MatchClaim = {
  id: 'DAL-QA-WORKER-001',
  claimNum: 'DAL-2026-0099',
  plate: '12345678',
  eventDate: '2026-01-15',
  threads: ['thread-test-a'],
};
const b: MatchClaim = {
  id: 'DAL-2026-0018',
  claimNum: 'DAL-2026-0018',
  plate: '12345678',
  eventDate: '2026-02-01',
  threads: ['thread-test-b'],
};
const uniquePlate: MatchClaim = {
  id: 'DAL-QA-WORKER-001',
  claimNum: 'DAL-2026-0099',
  plate: '87654321',
  threads: [],
};

describe('matchIncomingMail — existing matcher, no guess', () => {
  it('binds by existing Thread ID', () => {
    const r = matchIncomingMail({ messageId: 'm1', threadId: 'thread-test-a', subject: 'שלום' }, [a, b]);
    expect(r.decision).toBe('auto');
    expect(r.via).toBe('thread');
    expect(r.claimId).toBe('DAL-QA-WORKER-001');
  });

  it('binds by unique claim number', () => {
    const r = matchIncomingMail({
      messageId: 'm2',
      subject: 'השלמת מסמכים DAL-2026-0099',
      body: 'נא להעביר רישיון נהיגה',
    }, [a, b]);
    expect(r.decision).toBe('auto');
    expect(r.via).toBe('claim_number');
    expect(r.claimId).toBe('DAL-QA-WORKER-001');
  });

  it('binds by unique plate only when one claim owns it', () => {
    const r = matchIncomingMail({
      messageId: 'm3',
      subject: 'עדכון',
      body: 'רכב 87-654-321 נא חשבונית מוסך',
    }, [uniquePlate, b]);
    expect(r.decision).toBe('auto');
    expect(r.via).toBe('plate_unique');
    expect(r.claimId).toBe('DAL-QA-WORKER-001');
  });

  it('sends ambiguous plate to Review and does not guess', () => {
    const r = matchIncomingMail({
      messageId: 'm4',
      subject: 'עדכון',
      body: 'רכב 12-345-678 נא מסמך',
    }, [a, b]);
    expect(r.decision).toBe('needs_review');
    expect(r.via).toBe('plate_ambiguous');
    expect(r.claimId).toBeUndefined();
    expect(r.candidates.sort()).toEqual(['DAL-2026-0018', 'DAL-QA-WORKER-001']);
  });

  it('does not auto-bind when thread conflicts with another claim number', () => {
    const r = matchIncomingMail({
      messageId: 'm5',
      threadId: 'thread-test-a',
      subject: 'סתירה DAL-2026-0018',
    }, [a, b]);
    expect(r.decision).toBe('needs_review');
    expect(r.via).toBe('thread_vs_claim');
    expect(r.claimId).toBeUndefined();
  });
});
