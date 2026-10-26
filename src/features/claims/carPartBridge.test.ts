import { describe, expect, it } from 'vitest';
import {
  CARPART_NOTE_TAG,
  CARPART_TITLE_PREFIX,
  SESSION_MAX_AGE_MS,
  buildTenderFileName,
  buildTenderNote,
  buildTenderTitle,
  carPartFiles,
  carPartWindowName,
  clearSession,
  contextFromClaim,
  isAcceptedTenderFile,
  isCarPartFile,
  readSession,
  rememberSession,
} from './carPartBridge';

const ctx = { claimId: 'CLM-123', claimNum: '2026-555', plate: '12-345-67', carModel: 'Toyota Corolla', clientName: 'ישראל ישראלי' };

function memStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

describe('carPartBridge', () => {
  it('builds the claim context from a claim record', () => {
    expect(contextFromClaim({ id: 'CLM-1', claimNum: ' 77 ', plate: '1234567', carMake: 'Mazda', carModel: '3', clientName: 'דנה' }))
      .toEqual({ claimId: 'CLM-1', claimNum: '77', plate: '1234567', carModel: 'Mazda 3', clientName: 'דנה' });
  });

  it('title and note carry claim number and vehicle', () => {
    const t = buildTenderTitle(ctx, '845512');
    expect(t.startsWith(CARPART_TITLE_PREFIX)).toBe(true);
    expect(t).toContain('תביעה 2026-555');
    expect(t).toContain('רכב 12-345-67');
    expect(t).toContain('בקשה 845512');
    expect(t.length).toBeLessThanOrEqual(120);
    const n = buildTenderNote(ctx, { tenderRef: '845512', savedAt: new Date('2026-10-26T10:00:00Z') });
    expect(n.startsWith(CARPART_NOTE_TAG)).toBe(true);
    expect(n).toContain('מזהה תיק: CLM-123');
    expect(n).toContain('מספר רכב: 12-345-67');
    expect(n.length).toBeLessThanOrEqual(500);
  });

  it('falls back to the claim id when there is no claim number yet', () => {
    expect(buildTenderTitle({ ...ctx, claimNum: '' })).toContain('תביעה CLM-123');
  });

  it('file name is safe and tied to claim + plate + date', () => {
    const name = buildTenderFileName(ctx, 'print report.PDF', 'application/pdf', new Date('2026-10-26T10:00:00Z'));
    expect(name).toBe('CarPart-מכרז-2026-555-1234567-2026-10-26.pdf');
    expect(buildTenderFileName({ ...ctx, plate: '' }, 'x', 'image/png', new Date('2026-10-26T10:00:00Z'))).toBe('CarPart-מכרז-2026-555-2026-10-26.png');
  });

  it('accepts PDF and images only', () => {
    expect(isAcceptedTenderFile('a.pdf', '')).toBe(true);
    expect(isAcceptedTenderFile('a', 'image/jpeg')).toBe(true);
    expect(isAcceptedTenderFile('a.exe', 'application/octet-stream')).toBe(false);
    expect(isAcceptedTenderFile('a.docx', '')).toBe(false);
  });

  it('lists only Car-Part documents of the claim, newest first', () => {
    const files = [
      { id: '1', original_name: 'license.pdf', created_at: '2026-10-01', doc_meta: { staff_type: 'vehicle_license' } },
      { id: '2', original_name: 'CarPart-מכרז-1-2.pdf', created_at: '2026-10-02', doc_meta: null },
      { id: '3', original_name: 'x.pdf', created_at: '2026-10-03', doc_meta: { staff_title: `${CARPART_TITLE_PREFIX} · תביעה 1` } },
      { id: '4', original_name: 'y.pdf', created_at: '2026-10-04', doc_meta: { staff_note: `${CARPART_NOTE_TAG}\n...` } },
    ];
    expect(isCarPartFile(files[0])).toBe(false);
    expect(carPartFiles(files).map((f) => f.id)).toEqual(['4', '3', '2']);
  });

  it('remembers which claim Car-Part was opened from, and expires', () => {
    const store = memStore();
    const t0 = new Date('2026-10-26T08:00:00Z');
    rememberSession(ctx, t0, store);
    expect(readSession(new Date(t0.getTime() + 60_000), store)?.claimId).toBe('CLM-123');
    expect(readSession(new Date(t0.getTime() + SESSION_MAX_AGE_MS + 1), store)).toBeNull();
    clearSession(store);
    expect(readSession(t0, store)).toBeNull();
  });

  it('never stores credentials in the session', () => {
    const store = memStore();
    rememberSession(ctx, new Date(), store);
    const raw = store.getItem('dalia.claims.carpart.session.v1') || '';
    expect(raw).not.toMatch(/password|סיסמ/i);
  });

  it('window name is stable per claim', () => {
    expect(carPartWindowName('CLM-123')).toBe('carpart_CLM_123');
  });
});
