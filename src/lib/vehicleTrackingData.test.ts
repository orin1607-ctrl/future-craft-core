import { describe, expect, it } from 'vitest';
import { calendarDaysLeft, todayIsoDate } from './expiryOfficerApproval';
import {
  EMPTY_TRACKING_FILTERS,
  applySummaryFilter,
  applyTrackingFilters,
  trackingAttentionReasons,
  vehicleNeedsTrackingAttention,
  type TrackingVehicleRow,
} from './vehicleTrackingData';

function shiftIso(days: number): string {
  const today = todayIsoDate();
  const d = new Date(`${today}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function row(partial: Partial<TrackingVehicleRow>): TrackingVehicleRow {
  return {
    id: 'v1',
    license_plate: '1',
    internal_number: '1',
    company_name: 'QA',
    department: null,
    manufacturer: 'x',
    model: 'y',
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
    has_open_alert: true,
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

describe('vehicleNeedsTrackingAttention', () => {
  it('does not treat missing license document alone as dashboard attention', () => {
    const v = row({
      alert_items: [{ kind: 'license', label: 'רישיון', detail: 'חסר', hubLink: '/' }],
      alert_kinds: ['license'],
    });
    expect(vehicleNeedsTrackingAttention(v)).toBe(false);
    expect(trackingAttentionReasons(v)).toEqual([]);
  });

  it('counts expired/upcoming test as attention', () => {
    expect(
      vehicleNeedsTrackingAttention(
        row({
          alert_items: [{ kind: 'test', label: 'טסט', detail: 'פג', hubLink: '/' }],
          alert_kinds: ['test'],
        }),
      ),
    ).toBe(true);
  });

  it('shows expired vs upcoming test from the same attention logic', () => {
    const expiredDate = shiftIso(-1);
    const soonDate = shiftIso(10);
    expect(calendarDaysLeft(expiredDate)).toBe(-1);
    expect(calendarDaysLeft(soonDate)).toBe(10);

    const expired = row({
      test_expiry: expiredDate,
      alert_items: [{ kind: 'test', label: 'טסט', detail: 'פג לפני 1 ימים', hubLink: '/' }],
      alert_kinds: ['test'],
    });
    const soon = row({
      test_expiry: soonDate,
      alert_items: [{ kind: 'test', label: 'טסט', detail: 'עוד 10 ימים', hubLink: '/' }],
      alert_kinds: ['test'],
    });
    expect(trackingAttentionReasons(expired)).toEqual(['טסט פג תוקף']);
    expect(trackingAttentionReasons(soon)).toEqual(['טסט בחודש הקרוב']);
    expect(vehicleNeedsTrackingAttention(expired)).toBe(true);
    expect(vehicleNeedsTrackingAttention(soon)).toBe(true);
  });

  it('keeps one vehicle with several compact reasons', () => {
    const v = row({
      test_expiry: shiftIso(-2),
      insurance_expiry: shiftIso(5),
      has_open_fault: true,
      has_open_defect: true,
      alert_items: [
        { kind: 'test', label: 'טסט', detail: 'פג לפני 2 ימים', hubLink: '/' },
        { kind: 'insurance', label: 'ביטוח', detail: 'עוד 5 ימים', hubLink: '/' },
        { kind: 'fault', label: 'תקלה', detail: 'אור', hubLink: '/' },
      ],
      alert_kinds: ['test', 'insurance', 'fault'],
    });
    const reasons = trackingAttentionReasons(v);
    expect(reasons).toEqual(['טסט פג תוקף', 'ביטוח מתקרב', 'תקלה פתוחה', 'ליקוי פתוח']);
    expect(vehicleNeedsTrackingAttention(v)).toBe(true);
  });

  it('never shows a reason without putting the vehicle in the attention count', () => {
    const samples = [
      row({ in_garage: true }),
      row({ has_active_service: true, in_garage: true }),
      row({ has_open_accident: true }),
    ];
    for (const v of samples) {
      const reasons = trackingAttentionReasons(v);
      expect(reasons.length).toBeGreaterThan(0);
      expect(vehicleNeedsTrackingAttention(v)).toBe(true);
    }
  });
});

describe('department filter + attention', () => {
  it('intersects department with needs-attention without dropping either', () => {
    const maintenanceOk = row({
      id: 'ok',
      department: 'אחזקה',
      has_open_alert: false,
    });
    const maintenanceAttention = row({
      id: 'att',
      department: 'אחזקה',
      in_garage: true,
    });
    const otherAttention = row({
      id: 'oth',
      department: 'ביטחון',
      in_garage: true,
    });
    const none = row({
      id: 'none',
      department: null,
      has_open_alert: false,
    });
    const fleet = [maintenanceOk, maintenanceAttention, otherAttention, none];
    const byDept = applyTrackingFilters(fleet, { ...EMPTY_TRACKING_FILTERS, department: 'אחזקה' });
    expect(byDept.map((v) => v.id).sort()).toEqual(['att', 'ok']);
    const both = applySummaryFilter(byDept, 'attention');
    expect(both.map((v) => v.id)).toEqual(['att']);
    const emptyDept = applyTrackingFilters(fleet, EMPTY_TRACKING_FILTERS);
    expect(emptyDept).toHaveLength(4);
  });
});
