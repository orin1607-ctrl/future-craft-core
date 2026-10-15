import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TrackingFleetList from '@/components/vehicle-tracking/TrackingFleetList';
import type { TrackingVehicleRow } from '@/lib/vehicleTrackingData';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function row(partial: Partial<TrackingVehicleRow>): TrackingVehicleRow {
  return {
    id: 'v1',
    license_plate: '11-111-11',
    internal_number: '7',
    company_name: 'QA',
    department: null,
    manufacturer: 'יונדאי',
    model: 'i20',
    year: 2022,
    driver_name: null,
    status: 'active',
    status_text: 'פעיל',
    current_location: '—',
    odometer: 0,
    service_status: null,
    in_garage: false,
    days_in_garage: 0,
    has_open_fault: false,
    has_open_defect: false,
    has_open_accident: false,
    has_open_alert: false,
    has_active_service: false,
    has_active_transport: false,
    test_expiry: null,
    insurance_expiry: null,
    insurance_alerts_enabled: true,
    insurance_alerts_red_enabled: true,
    alert_items: [],
    alert_kinds: [],
    ...partial,
  };
}

function AlertsProbe() {
  const loc = useLocation();
  return <div data-testid="alerts-page">{`${loc.pathname}${loc.search}`}</div>;
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function renderList(rows: TrackingVehicleRow[], onOpen = vi.fn()) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <MemoryRouter initialEntries={['/vehicle-tracking']}>
        <Routes>
          <Route path="/vehicle-tracking" element={<TrackingFleetList rows={rows} total={rows.length} onOpen={onOpen} />} />
          <Route path="/alerts" element={<AlertsProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return onOpen;
}

const lights = (scope: ParentNode = document) =>
  Array.from(scope.querySelectorAll<HTMLElement>('[data-testid="officer-alert-light"]'));

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  });
}

function linkByText(text: string) {
  return Array.from(document.querySelectorAll('a')).find((a) => a.textContent?.trim() === text) || null;
}

const lit = row({
  id: 'lit',
  license_plate: '22-222-22',
  officer_alert: { windowDays: 30, alerts: [{ id: 'a1', dueDate: '2026-10-10', daysLeft: -5 }] },
});
const plain = row({ id: 'plain', license_plate: '33-333-33' });

describe('vehicle tracking list — officer alert light', () => {
  it('shows one red light on desktop and on mobile only for the vehicle with an alert', () => {
    renderList([lit, plain]);
    expect(lights()).toHaveLength(2);
    const table = document.querySelector('table')!;
    expect(lights(table)).toHaveLength(1);
    const plainRow = Array.from(table.querySelectorAll('tr')).find((tr) => tr.textContent?.includes('33-333-33'))!;
    expect(lights(plainRow)).toHaveLength(0);
    expect(lights()[0].querySelector('.bg-destructive')).not.toBeNull();
    expect(lights()[0].outerHTML).not.toContain('animate');
  });

  it('shows no light when the vehicle has no due officer alert', () => {
    renderList([plain, row({ id: 'n2', officer_alert: null })]);
    expect(lights()).toHaveLength(0);
  });

  it('shows the count when a vehicle has several open alerts', () => {
    renderList([
      row({
        officer_alert: {
          windowDays: 30,
          alerts: [
            { id: 'a', dueDate: '2026-10-14', daysLeft: -1 },
            { id: 'b', dueDate: '2026-10-25', daysLeft: 10 },
          ],
        },
      }),
    ]);
    expect(lights()[0].textContent).toBe('2');
  });

  it('opens a panel with the overdue days and a link to all officer alerts without opening the vehicle', () => {
    const onOpen = renderList([lit]);
    click(lights(document.querySelector('table')!)[0]);
    expect(onOpen).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('באיחור 5 ימים');
    expect(document.body.textContent).toContain('מועד: 10/10/2026');
    const link = linkByText('לכל ההתראות');
    expect(link?.getAttribute('href')).toBe('/alerts?category=officer&scope=all');
    click(link!);
    expect(onOpen).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="alerts-page"]')?.textContent).toBe('/alerts?category=officer&scope=all');
  });

  it('the mobile light opens the panel without opening the vehicle card', () => {
    const onOpen = renderList([lit]);
    click(lights()[1]);
    expect(onOpen).not.toHaveBeenCalled();
    expect(linkByText('לכל ההתראות')).not.toBeNull();
  });

  it('keeps the existing row behaviour: clicking the plate still opens the vehicle', () => {
    const onOpen = renderList([lit]);
    const cell = Array.from(document.querySelectorAll('table td')).find((td) => td.textContent?.includes('22-222-22'))!;
    click(cell);
    expect(onOpen).toHaveBeenCalledWith('lit');
  });
});
