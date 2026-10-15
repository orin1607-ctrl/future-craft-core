import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import DriverAlertDot from './DriverAlertDot';
import type { DriverAlertItem } from '@/lib/driverTrackingData';

function makeAlert(partial: Partial<DriverAlertItem> = {}): DriverAlertItem {
  return {
    id: 'alt-1',
    kind: 'license',
    label: 'תוקף רישיון נהיגה',
    detail: 'עוד 10 ימים',
    openedAt: '2026-10-01',
    dueAt: '2026-10-25',
    state: 'open',
    daysLeft: 10,
    urgent: true,
    hubLink: '/drivers?driverId=d1',
    ...partial,
  };
}

describe('DriverAlertDot component', () => {
  let host: HTMLElement | null = null;
  let root: Root | null = null;

  const renderDot = (alerts: DriverAlertItem[] | null | undefined, driverId = 'd1') => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <MemoryRouter>
          <DriverAlertDot alerts={alerts} driverId={driverId} />
        </MemoryRouter>,
      );
    });
  };

  const cleanup = () => {
    if (root && host) {
      act(() => root!.unmount());
      host.remove();
    }
    root = null;
    host = null;
  };

  it('renders nothing when alerts list is empty or null', () => {
    renderDot([]);
    expect(document.querySelector('[data-testid="driver-alert-dot"]')).toBeNull();
    cleanup();

    renderDot(null);
    expect(document.querySelector('[data-testid="driver-alert-dot"]')).toBeNull();
    cleanup();
  });

  it('renders nothing when no alert is urgent (e.g. 31 days ahead or completed)', () => {
    const nonUrgent = [
      makeAlert({ urgent: false, daysLeft: 31 }),
      makeAlert({ urgent: false, state: 'completed', daysLeft: -2 }),
    ];
    renderDot(nonUrgent);
    expect(document.querySelector('[data-testid="driver-alert-dot"]')).toBeNull();
    cleanup();
  });

  it('shows single red dot for a single urgent alert (e.g. within 30 days or overdue)', () => {
    renderDot([makeAlert({ urgent: true, daysLeft: 5 })]);
    const dot = document.querySelector('[data-testid="driver-alert-dot"]');
    expect(dot).not.toBeNull();
    expect(dot?.querySelector('.bg-destructive')).not.toBeNull();
    // Does not show number when count is 1
    expect(dot?.textContent?.trim()).toBe('');
    cleanup();
  });

  it('shows exactly one red dot with count when multiple alerts exist for the same driver', () => {
    const multi = [
      makeAlert({ id: 'a1', label: 'תוקף רישיון', urgent: true, daysLeft: 5 }),
      makeAlert({ id: 'a2', label: 'הדרכת בטיחות', urgent: true, daysLeft: -2 }),
    ];
    renderDot(multi);
    const dot = document.querySelector('[data-testid="driver-alert-dot"]');
    expect(dot).not.toBeNull();
    // Only one dot element is rendered
    expect(document.querySelectorAll('[data-testid="driver-alert-dot"]')).toHaveLength(1);
    expect(dot?.textContent?.trim()).toBe('2');
    cleanup();
  });

  it('includes accessible title and aria-label', () => {
    renderDot([makeAlert({ label: 'רישיון נהיגה', urgent: true, daysLeft: 3 })]);
    const dot = document.querySelector('[data-testid="driver-alert-dot"]');
    expect(dot?.getAttribute('aria-label')).toContain('קיימת התראה קרובה או באיחור');
    cleanup();
  });
});
