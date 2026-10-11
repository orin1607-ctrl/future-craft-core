import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ClaimWhatsAppDueList from './ClaimWhatsAppDueList';
import {
  fillWaPlaceholders,
  findHeldDuplicate,
  isWaReady,
  israelLocalToUtc,
  normalizeWaPhone,
  suggestWaPlan,
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

  it('suggests the client document text and a future Israel morning', () => {
    const plan = suggestWaPlan(
      { id: 'DAL-1', status: 'ממתין למסמכים', clientName: 'דנה', claimNum: 'DAL-1', nextDate: '' },
      [{ full_name: 'דנה', role: 'client', phone: '0501234567' }],
      new Date('2026-10-11T06:00:00.000Z'),
    );
    expect(plan.templateKey).toBe('wa_docs');
    expect(plan.phone).toBe('0501234567');
    expect(plan.body).toContain('דנה');
    expect(plan.date).toBe('2026-10-12');
    expect(plan.time).toBe('09:00');
    expect(israelLocalToUtc(plan.date, plan.time, new Date('2026-10-11T06:00:00.000Z')).ok).toBe(true);
  });

  it('shows a due alert with the prepared recipient and text, and does not treat the open as sent', () => {
    const onOpened = vi.fn();
    const onMarkSent = vi.fn();
    const now = new Date('2026-10-11T07:00:00.000Z');
    render(
      <ClaimWhatsAppDueList
        now={now}
        onOpened={onOpened}
        onMarkSent={onMarkSent}
        rows={[
          { id: 'COM-DUE', claimId: 'DAL-1', claimLabel: 'DAL-1', contactName: 'דנה', phone: '0501234567', body: 'שלום דנה', waStatus: 'scheduled_blocked', plannedAt: '2026-10-11T06:30:00.000Z' },
          { id: 'COM-LATER', phone: '0501234567', body: 'מחר', waStatus: 'scheduled_blocked', plannedAt: '2026-10-12T06:30:00.000Z' },
          { id: 'COM-MARKED', phone: '0501234567', body: 'כבר', waStatus: 'marked_sent_by_user', plannedAt: '2026-10-11T06:00:00.000Z' },
        ]}
      />,
    );
    expect(screen.getByTestId('wa-due-banner').textContent).toContain('מוכנה לשליחה');
    const link = screen.getByTestId('wa-due-open-COM-DUE');
    expect(link.getAttribute('href')).toBe('https://wa.me/972501234567?text=%D7%A9%D7%9C%D7%95%D7%9D%20%D7%93%D7%A0%D7%94');
    expect(screen.queryByTestId('wa-due-COM-LATER')).toBeNull();
    expect(screen.queryByTestId('wa-due-COM-MARKED')).toBeNull();
    fireEvent.click(link);
    expect(onOpened).toHaveBeenCalledTimes(1);
    expect(onMarkSent).not.toHaveBeenCalled();
    expect(isWaReady({ waStatus: 'opened_not_sent', plannedAt: '2026-10-11T06:30:00.000Z' }, now)).toBe(false);
    expect(isWaReady({ waStatus: 'marked_sent_by_user', plannedAt: '2026-10-11T06:00:00.000Z' }, now)).toBe(false);
    expect(isWaReady({ waStatus: 'scheduled_blocked', plannedAt: '2026-10-11T06:30:00.000Z' }, now)).toBe(true);
    expect(waCountsAsSent('marked_sent_by_user')).toBe(false);
    expect(waStatusLabel('marked_sent_by_user')).toContain('ידנית');
  });
});
