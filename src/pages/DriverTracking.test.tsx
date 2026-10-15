import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DriverTracking from '@/pages/DriverTracking';
import { assembleDriverTrackingRows } from '@/lib/driverTrackingData';
import { DEFAULT_ALERT_THRESHOLDS } from '@/lib/vehicleTrackingAlerts';

vi.mock('@/hooks/useCompanyFilter', () => ({
  useCompanyFilter: () => 'בארי',
}));

vi.mock('@/lib/driverTrackingLoad', () => ({
  loadDriverTrackingRows: vi.fn(),
}));

import { loadDriverTrackingRows } from '@/lib/driverTrackingLoad';

const rows = assembleDriverTrackingRows({
  drivers: [
    {
      id: 'd1',
      full_name: 'יוסי לוי',
      id_number: '100',
      phone: '050',
      department: 'הסעות',
      company_name: 'בארי',
      status: 'active',
      license_number: 'L-1',
      license_types: ['B'],
      license_expiry: '2026-11-01',
      exam_expiry: null,
      last_exam_date: null,
    },
    {
      id: 'd2',
      full_name: 'דנה כהן',
      id_number: '200',
      phone: null,
      department: 'מחסן',
      company_name: 'בארי',
      status: 'active',
      license_number: null,
      license_types: [],
      license_expiry: '2026-10-01',
      exam_expiry: null,
      last_exam_date: null,
    },
  ],
  vehicles: [],
  exams: [],
  practicalExams: [],
  healthDeclarations: [],
  declarations: [],
  assignments: [],
  documents: [],
  documentRequests: [],
  today: '2026-10-15',
  thresholdsByCompany: new Map([['בארי', { ...DEFAULT_ALERT_THRESHOLDS, firstDays: 30 }]]),
});

function clickButton(container: HTMLElement, name: string) {
  const button = [...container.querySelectorAll('button')].find((el) => el.textContent?.includes(name));
  if (!button) throw new Error(`missing button ${name}`);
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('DriverTracking screen', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.mocked(loadDriverTrackingRows).mockResolvedValue(rows);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  it('filters the list, opens a driver, and shows an overdue alert outside history', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/driver-tracking']}>
          <DriverTracking />
        </MemoryRouter>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('מעקב נהגים');
    expect(container.textContent).toContain('יוסי לוי');
    expect(container.textContent).toContain('דנה כהן');
    expect(container.querySelector('.text-destructive')).toBeTruthy();

    await act(async () => {
      clickButton(container, 'סינון מתקדם');
    });
    const search = container.querySelector('input[placeholder="שם, מספר עובד או רכב"]') as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      valueSetter?.call(search, '200');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      clickButton(container, 'החל סינון');
    });

    expect(container.textContent).not.toContain('יוסי לוי');
    expect(container.textContent).toContain('דנה כהן');

    await act(async () => {
      clickButton(container, 'פתח מעקב');
    });
    expect(container.textContent).toContain('תאונות ואירועים');
    expect(container.textContent).toContain('לא קיים');
    expect(container.textContent).toContain('לא עודכן');

    await act(async () => {
      clickButton(container, 'היסטוריה');
    });
    expect(container.textContent).toContain('אין היסטוריה');

    await act(async () => {
      clickButton(container, 'התראות פתוחות');
    });
    expect(container.textContent).toContain('ימים באיחור');
    expect(container.textContent).not.toContain('הושלם');

    root.unmount();
    container.remove();
  });
});
