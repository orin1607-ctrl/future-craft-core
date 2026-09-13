import { describe, expect, it } from 'vitest';
import { extractGmIds, extractPriceCandidates, matchIncomingGarage, type MatchCase } from '../../../supabase/functions/garage-gmail/matchIncoming';

const cases: MatchCase[] = [
  { id: 'c1', caseNumber: 'GM-2026-0006', plate: '5555555', customerName: 'אלדן', threads: ['th-1'] },
  { id: 'c2', caseNumber: 'GM-2026-0005', plate: '37681603', customerName: 'אברהמי', workOrderNumber: 'WO-99' },
];

describe('garage matchIncoming', () => {
  it('auto-matches unique case number', () => {
    const r = matchIncomingGarage({ messageId: 'm1', subject: 'הצעת מחיר GM-2026-0006' }, cases);
    expect(r.decision).toBe('auto');
    expect(r.caseId).toBe('c1');
    expect(r.via).toBe('case_number');
  });

  it('does not guess when two plates match', () => {
    const two: MatchCase[] = [
      { id: 'a', caseNumber: 'GM-2026-0001', plate: '1111111' },
      { id: 'b', caseNumber: 'GM-2026-0002', plate: '1111111' },
    ];
    const r = matchIncomingGarage({ messageId: 'm2', subject: 'רכב 1111111' }, two);
    expect(r.decision).toBe('needs_review');
    expect(r.via).toBe('plate_ambiguous');
  });

  it('auto-matches unique thread', () => {
    const r = matchIncomingGarage({ messageId: 'm3', threadId: 'th-1', subject: 'Re: hello' }, cases);
    expect(r.decision).toBe('auto');
    expect(r.caseId).toBe('c1');
  });

  it('extracts GM ids', () => {
    expect(extractGmIds('תיק GM-2026-0006 וגם gm-2026-0005')).toEqual(['GM-2026-0006', 'GM-2026-0005']);
  });

  it('extracts price candidates without approving', () => {
    expect(extractPriceCandidates('סה״כ 1,250 ₪')).toContain(1250);
  });
});
