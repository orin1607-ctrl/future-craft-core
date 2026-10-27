import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ClaimRecord } from '../claimsConstants';
import { checkSharedFile, matchSharedFile, shareNote, SHARE_NOTE_TAG } from './shareMatch';
import { DB_NAME, SHARE_PATH, STORE, isExpiredBatch, BATCH_MAX_AGE_MS } from './shareStore';
import { isShareTargetEnabled, SHARE_MANIFEST_FILE, SHARE_SW_FILE } from './registerShareTarget';
import { STAGING_PROJECT_ID, PRODUCTION_PROJECT_ID } from '@/features/fleet-dalia-ai/stagingGate';
import { isShareInboxPath, postLoginPathForRole } from '@/lib/postLoginHome';

const claims: ClaimRecord[] = [
  { id: 'DAL-QA-0001', claimNum: 'CLM-778812', plate: '12-345-67', eventDate: '2026-10-01', clientName: 'לקוח א' },
  { id: 'DAL-QA-0002', claimNum: '', plate: '98-765-43', eventDate: '2026-09-10', clientName: 'לקוח ב' },
  { id: 'DAL-QA-0003', claimNum: '', plate: '98-765-43', eventDate: '2026-10-20', clientName: 'לקוח ב' },
];

describe('matchSharedFile', () => {
  it('Car-Part PDF with a plate that belongs to one claim → auto', () => {
    const r = matchSharedFile({ name: 'tender.pdf', text: 'Car-Part מכרז חלקים רכב 1234567 טויוטה' }, claims);
    expect(r.decision).toBe('auto');
    expect(r.claimId).toBe('DAL-QA-0001');
  });

  it('claim number in the document → auto', () => {
    const r = matchSharedFile({ name: 'invoice.pdf', text: 'חשבונית 5521 תביעה CLM-778812' }, claims);
    expect(r).toMatchObject({ decision: 'auto', claimId: 'DAL-QA-0001' });
  });

  it('plate on two claims and no date → user picks, both offered', () => {
    const r = matchSharedFile({ name: 'quote.pdf', text: 'רכב 98-765-43' }, claims);
    expect(r.decision).toBe('needs_review');
    expect(r.candidates.sort()).toEqual(['DAL-QA-0002', 'DAL-QA-0003']);
  });

  it('plates from two different claims → never auto', () => {
    const r = matchSharedFile({ name: 'x.pdf', text: 'רכב 12-345-67 מול רכב 98-765-43' }, claims);
    expect(r.decision).toBe('needs_review');
  });

  it('damage photo with no text → user picks', () => {
    const r = matchSharedFile({ name: 'IMG-20261027-WA0012.jpg' }, claims);
    expect(r).toMatchObject({ decision: 'needs_review', candidates: [] });
  });

  it('a WhatsApp/camera file name date is not read as a plate', () => {
    const withPlateLikeDate: ClaimRecord[] = [{ id: 'DAL-QA-0009', plate: '20261027' }];
    expect(matchSharedFile({ name: 'IMG-20261027-WA0012.jpg' }, withPlateLikeDate).decision).toBe('needs_review');
  });

  it('a meaningful file name can identify the claim', () => {
    expect(matchSharedFile({ name: 'שומה 1234567.pdf' }, claims)).toMatchObject({ decision: 'auto', claimId: 'DAL-QA-0001' });
  });

  it('text shared with the files is used too', () => {
    expect(matchSharedFile({ name: 'a.jpg', sharedText: 'תיק CLM-778812' }, claims).claimId).toBe('DAL-QA-0001');
  });
});

describe('checkSharedFile', () => {
  it('accepts PDF and photos', () => {
    expect(checkSharedFile({ name: 'a.pdf', type: 'application/pdf', size: 10 })).toEqual({ ok: true, isPdf: true });
    expect(checkSharedFile({ name: 'a.jpg', type: 'image/jpeg', size: 10 })).toEqual({ ok: true, isPdf: false });
    expect(checkSharedFile({ name: 'a.heic', type: '', size: 10 })).toEqual({ ok: true, isPdf: false });
  });

  it('rejects other types, empty and oversized files', () => {
    expect(checkSharedFile({ name: 'a.docx', type: 'application/msword', size: 10 }).ok).toBe(false);
    expect(checkSharedFile({ name: 'a.pdf', type: 'application/pdf', size: 0 }).ok).toBe(false);
    expect(checkSharedFile({ name: 'a.pdf', type: 'application/pdf', size: 16 * 1024 * 1024 }).ok).toBe(false);
  });
});

describe('shareNote', () => {
  it('tags the document source', () => {
    expect(shareNote(true, 'מספר תביעה חד-משמעי')).toContain(SHARE_NOTE_TAG);
    expect(shareNote(false, '')).toContain('שויך ידנית');
  });
});

describe('staging gate', () => {
  it('only the Staging project, and the kill switch wins', () => {
    expect(isShareTargetEnabled({ projectId: STAGING_PROJECT_ID, killed: false })).toBe(true);
    expect(isShareTargetEnabled({ projectId: PRODUCTION_PROJECT_ID, killed: false })).toBe(false);
    expect(isShareTargetEnabled({ projectId: undefined, killed: false })).toBe(false);
    expect(isShareTargetEnabled({ projectId: STAGING_PROJECT_ID, killed: true })).toBe(false);
  });
});

describe('device store', () => {
  it('drops batches older than the limit', () => {
    const now = 1_000_000_000_000;
    expect(isExpiredBatch({ createdAt: now - 1000 }, now)).toBe(false);
    expect(isExpiredBatch({ createdAt: now - BATCH_MAX_AGE_MS - 1 }, now)).toBe(true);
  });
});

describe('service worker and manifest stay in step with the app', () => {
  const pub = (f: string) => readFileSync(resolve(__dirname, '../../../../public', f), 'utf8');

  it('worker uses the same IndexedDB names and share path', () => {
    const sw = pub(SHARE_SW_FILE);
    expect(sw).toContain(`const DB_NAME = '${DB_NAME}'`);
    expect(sw).toContain(`const STORE = '${STORE}'`);
    expect(sw).toContain(`const SHARE_PATH = '${SHARE_PATH}'`);
  });

  it('manifest posts multiple files to the share page', () => {
    const m = JSON.parse(pub(SHARE_MANIFEST_FILE));
    expect(m.share_target.action).toBe(`./${SHARE_PATH}`);
    expect(m.share_target.method).toBe('POST');
    expect(m.share_target.enctype).toBe('multipart/form-data');
    expect(m.share_target.params.files[0].accept).toEqual(expect.arrayContaining(['image/*', 'application/pdf']));
    expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  });
});

describe('login keeps the share page', () => {
  it('claims-only workers return to the shared files', () => {
    expect(isShareInboxPath('/claims/share?batch=S1')).toBe(true);
    expect(isShareInboxPath('/claims/shared')).toBe(false);
    expect(postLoginPathForRole('driver', '/claims/share?batch=S1', { claimsWorkerOnly: true })).toBe('/claims/share?batch=S1');
    expect(postLoginPathForRole('driver', '/dashboard', { claimsWorkerOnly: true })).toBe('/claims');
  });
});
