import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { buildAccidentDetailUrl, buildAllAccidentsUrl } from './entityNavContext';
import { accidentBelongsToVehicle, accidentMatchesSearch, findVehicleIdentity } from './accidentListFilter';
import { buildVehicleTrackingAlerts } from './vehicleTrackingAlerts';

describe('task 6 accident navigation', () => {
  it('opens the existing Accidents report by accident_id, not VehicleHub activity', () => {
    const url = buildAccidentDetailUrl('acc-77', { plate: '12-345-67', vehicleId: 'veh-77' });
    expect(url.startsWith('/accidents?')).toBe(true);
    const q = new URLSearchParams(url.split('?')[1]);
    expect(q.get('id')).toBe('acc-77');
    expect(q.get('vehicleId')).toBe('veh-77');
    expect(q.get('plate')).toBe('12-345-67');
    expect(q.get('context')).toBe('vehicle');
    expect(q.get('action')).toBeNull();
    expect(url).not.toContain('hubSection');
    expect(url).not.toContain('/vehicles?');
  });

  it('keeps כל התאונות on the existing Accidents route', () => {
    expect(buildAllAccidentsUrl()).toBe('/accidents');
  });

  it('filters the existing list to the vehicle that opened it', () => {
    const rows = [
      { id: 'a1', vehicle_plate: '12-345-67', description: 'רכב 77' },
      { id: 'a2', vehicle_plate: '99-999-99', description: 'אחר' },
    ];
    expect(rows.filter((a) => accidentBelongsToVehicle(a, '1234567')).map((a) => a.id)).toEqual(['a1']);
    expect(rows.filter((a) => accidentBelongsToVehicle(a, '')).map((a) => a.id)).toEqual(['a1', 'a2']);
  });

  it('searches accidents by plate, internal number, and department of the linked vehicle', () => {
    const accident = { id: 'a1', vehicle_plate: '12-345-67', driver_name: 'דני', description: 'פגוש', claim_number: 'CL-1' };
    const identity = { plate: '12-345-67', internal_number: '77', department: 'לוגיסטיקה' };
    expect(accidentMatchesSearch(accident, '77', identity)).toBe(true);
    expect(accidentMatchesSearch(accident, 'לוגיסטיקה', identity)).toBe(true);
    expect(accidentMatchesSearch(accident, '12-345', identity)).toBe(true);
    expect(accidentMatchesSearch(accident, 'אין', identity)).toBe(false);
    expect(findVehicleIdentity([identity], '1234567')?.internal_number).toBe('77');
  });

  it('builds tracking accident links to /accidents?id= instead of פעילות רכב', () => {
    const items = buildVehicleTrackingAlerts({
      vehicleId: 'veh-77',
      license_plate: '12-345-67',
      test_expiry: null,
      insurance_expiry: null,
      license_doc_url: 'https://example.com/lic.pdf',
      openAccidents: [{ id: 'acc-real', title: 'תאונה', detail: 'פגיעה בפגוש' }],
      has_active_transport: false,
    });
    const accident = items.find((i) => i.kind === 'accident');
    expect(accident?.entityId).toBe('acc-real');
    expect(accident?.hubLink).toContain('/accidents?');
    expect(accident?.hubLink).toContain('id=acc-real');
    expect(accident?.hubLink).not.toContain('hubSection=actions');
    expect(accident?.hubLink).not.toContain('hubTab=accidents');
  });

  it('adds a תאונות hub button without replacing דיווח תאונה', () => {
    const src = readFileSync('src/components/vehicles/VehicleHub.tsx', 'utf8');
    expect(src).toContain("{ label: 'תאונות', path: '/accidents', icon: AlertTriangle }");
    expect(src).toContain("{ label: 'דיווח תאונה', path: '/accidents', icon: AlertTriangle, action: 'new' as const }");
  });

  it('exposes כל התאונות from tracking onto the existing Accidents page', () => {
    const tracking = readFileSync('src/pages/VehicleTracking.tsx', 'utf8');
    const detail = readFileSync('src/components/vehicle-tracking/TrackingVehicleDetail.tsx', 'utf8');
    expect(tracking).toContain('כל התאונות');
    expect(tracking).toContain('buildAllAccidentsUrl');
    expect(detail).toContain('כל התאונות');
    expect(detail).toContain('פתח דוח תאונה');
  });
});
