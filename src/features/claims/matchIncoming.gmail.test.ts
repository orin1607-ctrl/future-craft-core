import { describe, expect, it } from 'vitest';
import { classifySentAttachment, matchIncomingMail, suggestReply, type MatchClaim } from '../../../supabase/functions/claims-gmail/matchIncoming';

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
  it('does not guess אלי אטיאס by client name alone', () => {
    const named: MatchClaim = {
      id: 'DAL-2026-0098',
      claimNum: 'DAL-2026-0098',
      clientName: 'אלי אטיאס',
      plate: '11111111',
    };
    const r = matchIncomingMail({
      messageId: 'eli-name-only',
      subject: 'אלי אטיאס',
      body: 'שלום אלי אטיאס',
      from: 'someone@example.com',
    }, [named]);
    expect(r.decision).toBe('needs_review');
    expect(r.claimId).toBeUndefined();
    expect(r.candidates).toEqual([]);
  });

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

  it('binds by TEST claim id when it appears in the mail', () => {
    const r = matchIncomingMail({
      messageId: 'm2b',
      subject: 'TEST inbound',
      body: 'נא להעביר רישיון נהיגה לתיק DAL-QA-WORKER-001',
    }, [a, b]);
    expect(r.decision).toBe('auto');
    expect(r.via).toBe('claim_number');
    expect(r.claimId).toBe('DAL-QA-WORKER-001');
  });

  it('sends conflicting claim numbers to Review and does not guess', () => {
    const r = matchIncomingMail({
      messageId: 'm2c',
      subject: 'DAL-QA-WORKER-001 וגם DAL-2026-0018',
      body: 'נא מסמך',
    }, [a, b]);
    expect(r.decision).toBe('needs_review');
    expect(r.via).toBe('claim_number');
    expect(r.claimId).toBeUndefined();
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

describe('classifySentAttachment — preview only, no guess', () => {
  const auto = matchIncomingMail({ messageId: 's1', subject: 'DAL-QA-WORKER-001 מסמכים' }, [a, b]);
  it('marks an existing filename on the matched claim as already in claim', () => {
    const r = classifySentAttachment({
      filename: 'license.pdf',
      match: auto,
      claimDocs: [{ original_name: 'license.pdf', gmail_attachment_id: 'att-1' }],
    });
    expect(r.status).toBe('already_in_claim');
  });
  it('does not take a file from another claim — unmatched claim docs are not consulted', () => {
    const r = classifySentAttachment({
      filename: 'other-claim.pdf',
      match: auto,
      claimDocs: [{ original_name: 'license.pdf' }],
    });
    expect(r.status).toBe('certain_new');
  });
  it('sends generic filenames to Review', () => {
    const r = classifySentAttachment({
      filename: 'image.jpg',
      match: auto,
      claimDocs: [],
    });
    expect(r.status).toBe('needs_review');
  });
  it('sends ambiguous match to Review and does not attach', () => {
    const amb = matchIncomingMail({
      messageId: 's2',
      subject: 'DAL-QA-WORKER-001 וגם DAL-2026-0018',
    }, [a, b]);
    const r = classifySentAttachment({
      filename: 'policy.pdf',
      match: amb,
      claimDocs: [{ original_name: 'policy.pdf' }],
    });
    expect(r.status).toBe('needs_review');
  });
});

describe('suggestReply — draft only, no auto-send', () => {
  it('offers the existing license on the same claim and reports a missing garage invoice', () => {
    const r = suggestReply('נא להעביר רישיון נהיגה וחשבונית מוסך', [
      { id: 'CDM-LICENSE', staff_type: 'driver_license', original_name: 'license.pdf' },
    ]);
    expect(r.attachments.map((x) => x.id)).toEqual(['CDM-LICENSE']);
    expect(r.missing).toContain('חשבונית מוסך');
    expect(r.ok).toBe(false);
  });
  it('prepares a draft for an info request without attaching files', () => {
    const r = suggestReply('נבקש לדעת מה הסטטוס', []);
    expect(r.ok).toBe(true);
    expect(r.attachments).toEqual([]);
    expect(r.requested).toContain('בקשת מידע');
  });
});
