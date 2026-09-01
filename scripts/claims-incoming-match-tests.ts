/**
 * Local matcher tests TEST A–E. No Gmail, no DB writes.
 * npx --yes tsx scripts/claims-incoming-match-tests.ts
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { matchIncomingMail, type MatchClaim, type MatchMail } from '../supabase/functions/claims-gmail/matchIncoming.ts';

const OUT = join(process.cwd(), 'docs/audit-reports/claims-incoming-gmail-2026-09-01');
mkdirSync(OUT, { recursive: true });

const c18: MatchClaim = {
  id: 'DAL-2026-0018',
  claimNum: 'DAL-2026-0018',
  plate: '12345678',
  eventDate: '2026-08-01',
  threads: ['thread-18'],
};
const c19: MatchClaim = {
  id: 'DAL-2026-0019',
  claimNum: 'DAL-2026-0019',
  plate: '87654321',
  eventDate: '2026-08-02',
  threads: ['thread-19'],
};
const samePlateA: MatchClaim = { ...c18, plate: '11122233', eventDate: '2026-03-10' };
const samePlateB: MatchClaim = { ...c19, plate: '11122233', eventDate: '2026-07-20' };

const rows: Array<{ id: string; ok: boolean; got?: unknown; want?: unknown }> = [];
function rec(id: string, mail: MatchMail, claims: MatchClaim[], want: { decision: string; claimId?: string }) {
  const got = matchIncomingMail(mail, claims);
  const ok = got.decision === want.decision && (want.claimId ? got.claimId === want.claimId : !got.claimId);
  rows.push({ id, ok, got, want });
  console.log(ok ? 'PASS' : 'FAIL', id, JSON.stringify({ decision: got.decision, claimId: got.claimId, via: got.via, reason: got.reason }));
}

rec('TEST-A-claim-number', {
  messageId: 'a',
  subject: 'התייחסות לתביעה DAL-2026-0018',
  body: 'שלום',
}, [c18, c19], { decision: 'auto', claimId: 'DAL-2026-0018' });

rec('TEST-B-thread', {
  messageId: 'b',
  threadId: 'thread-18',
  subject: 'Re: המשך',
  body: 'reply',
}, [c18, c19], { decision: 'auto', claimId: 'DAL-2026-0018' });

rec('TEST-B-thread-contradiction', {
  messageId: 'b2',
  threadId: 'thread-18',
  subject: 'DAL-2026-0019',
  body: 'סתירה',
}, [c18, c19], { decision: 'needs_review' });

rec('TEST-C-plate-date', {
  messageId: 'c',
  subject: 'רכב 11-122-233',
  body: 'תאריך אירוע 10.03.2026',
}, [samePlateA, samePlateB], { decision: 'auto', claimId: 'DAL-2026-0018' });

rec('TEST-C-unique-plate', {
  messageId: 'c2',
  subject: 'לוחית 12-345-678',
  body: 'בדיקה',
}, [c18, c19], { decision: 'auto', claimId: 'DAL-2026-0018' });

rec('TEST-D-plate-ambiguous', {
  messageId: 'd',
  subject: 'רכב 11122233',
  body: 'אין תאריך ואין מספר תביעה',
}, [samePlateA, samePlateB], { decision: 'needs_review' });

rec('TEST-E-claim-vs-plate', {
  messageId: 'e',
  subject: 'DAL-2026-0018 רכב 87-654-321',
  body: 'סתירה',
}, [c18, c19], { decision: 'needs_review' });

rec('TEST-name-only-no-guess', {
  messageId: 'n',
  subject: 'עבור ישראל ישראלי',
  body: 'שם בלבד',
  from: 'insurer@example.com',
}, [{ ...c18, clientName: 'ישראל ישראלי' }, c19], { decision: 'needs_review' });

const ok = rows.every((r) => r.ok);
writeFileSync(join(OUT, 'match-tests.json'), JSON.stringify({ ok, rows }, null, 2), 'utf8');
if (!ok) process.exit(1);
