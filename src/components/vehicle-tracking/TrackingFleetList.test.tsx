import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TrackingFleetList from './TrackingFleetList';
import type { TrackingVehicleRow } from '@/lib/vehicleTrackingData';
import type { VehicleOfficerAlertLight } from '@/lib/vehicleOfficerAlertLight';

function row(id: string, plate: string, officer_alert: VehicleOfficerAlertLight | null): TrackingVehicleRow {
  return {
    id,
    license_plate: plate,
    internal_number: '—',
    company_name: 'בארי',
    department: null,
    manufacturer: 'טויוטה',
    model: 'קורולה',
    year: 2020,
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
    officer_alert,
  };
}

const yellow: VehicleOfficerAlertLight = {
  windowDays: 30,
  color: 'yellow',
  alerts: [{ id: 'i1', kind: 'inspection', label: 'ביקורת קצין רכב', dueDate: '2026-11-18', daysLeft: 20, level: 'due_soon', link: '/vehicle-inspections?inspectionId=i1' }],
};
const red: VehicleOfficerAlertLight = {
  windowDays: 30,
  color: 'red',
  alerts: [
    { id: 'a1', kind: 'officer_alert', label: 'בדיקת מטף', dueDate: '2026-10-20', daysLeft: -9, level: 'overdue', link: '/alerts?category=officer&scope=all' },
    { id: 'i2', kind: 'inspection', label: 'ביקורת קצין רכב', dueDate: '2026-11-10', daysLeft: 12, level: 'due_soon', link: '/vehicle-inspections?inspectionId=i2' },
  ],
};

describe('TrackingFleetList officer light', () => {
  const renderList = () =>
    render(
      <MemoryRouter>
        <TrackingFleetList
          rows={[row('v0', '11-111-11', null), row('v1', '22-222-22', yellow), row('v2', '33-333-33', red)]}
          total={3}
          onOpen={vi.fn()}
        />
      </MemoryRouter>,
    );

  it('no light without an open action; yellow and red follow the actions', () => {
    renderList();
    const lights = screen.getAllByTestId('officer-alert-light');
    // Desktop table + mobile card render each light once: 2 lit vehicles x 2.
    expect(lights).toHaveLength(4);
    expect(lights.map((l) => l.dataset.lightColor).sort()).toEqual(['red', 'red', 'yellow', 'yellow']);
  });

  it('clicking the light lists the actions behind it with type, date and days, without opening the vehicle', () => {
    const onOpen = vi.fn();
    render(
      <MemoryRouter>
        <TrackingFleetList rows={[row('v2', '33-333-33', red)]} total={1} onOpen={onOpen} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getAllByTestId('officer-alert-light')[0]);
    const entries = screen.getAllByTestId('officer-alert-entry');
    expect(entries).toHaveLength(2);
    expect(within(entries[0]).getByText('בדיקת מטף')).toBeTruthy();
    expect(entries[0].textContent).toContain('20/10/2026');
    expect(entries[0].textContent).toContain('באיחור 9 ימים');
    expect(entries[1].textContent).toContain('עוד 12 ימים');
    expect(onOpen).not.toHaveBeenCalled();
  });
});
