import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  buildDocShareMessage,
  buildDocShareTitle,
  canShareFile,
  formatWhatsAppPhone,
  isMobileDevice,
  shareDocToEmail,
  shareDocToWhatsApp,
  type DocShareContext,
  type DocShareFile,
} from './claimDocShare';

describe('claimDocShare unit tests', () => {
  const dummyCtx: DocShareContext = {
    claimId: 'claim-1234-abcd',
    claimNum: 'CLM-2026-99',
    plate: '12-345-67',
    carModel: 'Toyota Corolla 2022',
    clientName: 'ישראל ישראלי',
  };

  const dummyDoc: DocShareFile = {
    id: 'f-1',
    name: 'הצעת מחיר חלפים Car-Part.pdf',
    url: 'https://storage.example.com/claims/f-1.pdf',
    mime: 'application/pdf',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('buildDocShareTitle includes claim number and vehicle plate', () => {
    const title = buildDocShareTitle(dummyDoc, dummyCtx);
    expect(title).toContain('CLM-2026-99');
    expect(title).toContain('12-345-67');
    expect(title).toContain('הצעת מחיר חלפים Car-Part.pdf');
  });

  it('buildDocShareMessage constructs a helpful message in Hebrew', () => {
    const msg = buildDocShareMessage(dummyDoc, dummyCtx);
    expect(msg).toContain('שלום,');
    expect(msg).toContain('מצורף מסמך: הצעת מחיר חלפים Car-Part.pdf');
    expect(msg).toContain('CLM-2026-99');
    expect(msg).toContain('12-345-67');
    expect(msg).toContain('Toyota Corolla 2022');
    expect(msg).toContain('דליה ניהול תביעות');
  });

  it('formats Israeli phones into international WhatsApp format', () => {
    expect(formatWhatsAppPhone('050-123-4567')).toBe('972501234567');
    expect(formatWhatsAppPhone('0541112233')).toBe('972541112233');
    expect(formatWhatsAppPhone('+972509998877')).toBe('972509998877');
  });

  it('detects desktop vs mobile via user-agent', () => {
    expect(isMobileDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')).toBe(false);
    expect(isMobileDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36')).toBe(true);
    expect(isMobileDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15')).toBe(true);
  });

  it('canShareFile handles missing navigator / canShare gracefully', () => {
    const file = new File(['dummy'], 'test.pdf', { type: 'application/pdf' });
    // In node/vitest environment, navigator.canShare is undefined
    expect(canShareFile(file)).toBe(false);
  });

  it('shareDocToWhatsApp falls back to wa.me link with encoded phone and message', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    const res = await shareDocToWhatsApp(dummyDoc, dummyCtx, '0501234567');
    expect(res.success).toBe(true);
    expect(res.method).toBe('wa_link');
    expect(openSpy).toHaveBeenCalled();
    const openedUrl = openSpy.mock.calls[0][0] as string;
    expect(openedUrl).toContain('https://wa.me/972501234567');
    expect(openedUrl).toContain(encodeURIComponent('CLM-2026-99'));
  });

  it('shareDocToEmail uses internal compose handler when provided', async () => {
    const composeSpy = vi.fn();
    const res = await shareDocToEmail(dummyDoc, dummyCtx, {
      onInternalCompose: composeSpy,
    });
    expect(res.success).toBe(true);
    expect(res.method).toBe('internal');
    expect(composeSpy).toHaveBeenCalledTimes(1);
    expect(composeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        file_ids: ['f-1'],
        subject: expect.stringContaining('CLM-2026-99'),
      })
    );
  });

  it('shareDocToEmail falls back to mailto when no internal composer is provided', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    const res = await shareDocToEmail(dummyDoc, dummyCtx);
    expect(res.success).toBe(true);
    expect(res.method).toBe('mailto');
    expect(openSpy).toHaveBeenCalled();
    const openedUrl = openSpy.mock.calls[0][0] as string;
    expect(openedUrl).toContain('mailto:');
    expect(openedUrl).toContain(encodeURIComponent('CLM-2026-99'));
  });
});
