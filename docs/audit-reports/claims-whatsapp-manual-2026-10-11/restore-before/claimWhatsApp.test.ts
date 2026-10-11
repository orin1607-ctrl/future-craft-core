import { describe, expect, it } from 'vitest';
import {
  fillWaPlaceholders,
  findHeldDuplicate,
  israelLocalToUtc,
  normalizeWaPhone,
  waCountsAsSent,
  waMeHref,
  waPhoneError,
  waStatusLabel,
} from './claimWhatsApp';

describe('claims WhatsApp dry-run', () => {
  it('fills a draft from claim fields the same way mail templates do', () => {
    const text = fillWaPlaceholders('שלום {{clientName}}, תביעה {{claimNum}}', {
      clientName: 'דנה',
      claimNum: 'DAL-1',
    });
    expect(text).toBe('שלום דנה, תביעה DAL-1');
  });

  it('normalizes an Israeli mobile and refuses a short number', () => {
    expect(normalizeWaPhone('050-123-4567')).toBe('972501234567');
    expect(waPhoneError('123')).toBe('מספר WhatsApp לא תקין');
    expect(waPhoneError('0501234567')).toBe('');
  });

  it('builds a wa.me link and never treats an open as sent', () => {
    expect(waMeHref('0501234567', 'שלום')).toBe('https://wa.me/972501234567?text=%D7%A9%D7%9C%D7%95%D7%9D');
    expect(waCountsAsSent('opened_not_sent')).toBe(false);
    expect(waCountsAsSent('scheduled_blocked')).toBe(false);
    expect(waStatusLabel('opened_not_sent')).toContain('לא סומן כנשלח');
  });

  it('rejects a past Israel time and accepts a future one', () => {
    const now = new Date('2026-10-11T06:00:00.000Z');
    expect(israelLocalToUtc('2026-10-11', '08:00', now).ok).toBe(false);
    const next = israelLocalToUtc('2026-10-12', '09:30', now);
    expect(next.ok).toBe(true);
    if (next.ok) expect(next.runAtIso.startsWith('2026-10-12T06:30')).toBe(true);
  });

  it('blocks a duplicate held schedule and allows a different time', () => {
    const rows = [{
      id: 'COM-1',
      waStatus: 'scheduled_blocked',
      phone: '972501234567',
      body: 'שלום',
      plannedAt: '2026-10-12T06:30:00.000Z',
    }];
    expect(findHeldDuplicate(rows, '0501234567', 'שלום', '2026-10-12T06:30:00.000Z')).toBe(true);
    expect(findHeldDuplicate(rows, '0501234567', 'שלום', '2026-10-12T07:30:00.000Z')).toBe(false);
    expect(findHeldDuplicate(rows, '0501234567', 'שלום', '2026-10-12T06:30:00.000Z', 'COM-1')).toBe(false);
  });
});
