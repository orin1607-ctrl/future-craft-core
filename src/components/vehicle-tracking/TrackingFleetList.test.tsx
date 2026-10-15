import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import TrackingFleetList from '@/components/vehicle-tracking/TrackingFleetList';
import type { TrackingVehicleRow } from '@/lib/vehicleTrackingData';

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
    notes: null,
    ...partial,
  };
}

function AlertsProbe() {
  const loc = useLocation();
  return <div data-testid="alerts-page">{`${loc.pathname}${loc.search}`}</div>;
}

function renderList(rows: TrackingVehicleRow[], onOpen = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/vehicle-tracking']}>
      <Routes>
        <Route path="/vehicle-tracking" element={<TrackingFleetList rows={rows} total={rows.length} onOpen={onOpen} />} />
        <Route path="/alerts" element={<AlertsProbe />} />
      </Routes>
    </MemoryRouter>,
  );
  return onOpen;
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
    const lights = screen.getAllByTestId('officer-alert-light');
    // One in the desktop table, one in the mobile card.
    expect(lights).toHaveLength(2);
    const table = screen.getByRole('table');
    expect(within(table).getAllByTestId('officer-alert-light')).toHaveLength(1);
    const plainRow = within(table).getByText('33-333-33').closest('tr')!;
    expect(within(plainRow).queryByTestId('officer-alert-light')).toBeNull();
    expect(lights[0].querySelector('.bg-destructive')).not.toBeNull();
    expect(lights[0].outerHTML).not.toContain('animate');
  });

  it('shows no light when the vehicle has no due officer alert', () => {
    renderList([plain, row({ id: 'n2', officer_alert: null })]);
    expect(screen.queryByTestId('officer-alert-light')).toBeNull();
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
    expect(screen.getAllByTestId('officer-alert-light')[0]).toHaveTextContent('2');
  });

  it('opens a panel with the overdue days and a link to all officer alerts without opening the vehicle', () => {
    const onOpen = renderList([lit]);
    const light = within(screen.getByRole('table')).getByTestId('officer-alert-light');
    fireEvent.click(light);
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByText('באיחור 5 ימים')).toBeInTheDocument();
    expect(screen.getByText('מועד: 10/10/2026')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'לכל ההתראות' });
    expect(link).toHaveAttribute('href', '/alerts?category=officer&scope=all');
    fireEvent.click(link);
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByTestId('alerts-page')).toHaveTextContent('/alerts?category=officer&scope=all');
  });

  it('the mobile light opens the panel without opening the vehicle card', () => {
    const onOpen = renderList([lit]);
    const mobileLight = screen.getAllByTestId('officer-alert-light')[1];
    fireEvent.click(mobileLight);
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'לכל ההתראות' })).toBeInTheDocument();
  });

  it('keeps the existing row behaviour: clicking the plate still opens the vehicle', () => {
    const onOpen = renderList([lit]);
    fireEvent.click(within(screen.getByRole('table')).getByText('22-222-22'));
    expect(onOpen).toHaveBeenCalledWith('lit');
  });
});
