import type { FleetOSAlertRow, FleetOSVehicleRow } from '@/modules/fleetos/fleetosData';
import { DEFAULT_PREFS, type FleetOSDashboardPrefs, type FleetOSKpiSnapshot } from '@/modules/fleetos/fleetosTypes';

export const PREVIEW_FLEETOS_KPIS: FleetOSKpiSnapshot = {
  vehicles_active: 12,
  vehicles_idling: 9,
  vehicles_in_garage: 2,
  total: 15,
};

export const PREVIEW_FLEETOS_VEHICLES: FleetOSVehicleRow[] = [
  {
    id: 'preview-v1',
    plate: '12-345-67',
    internal_number: 'D-101',
    company_name: 'דליה תפעול',
    make: 'טויוטה',
    model: 'קורולה',
    driver_name: 'אבי כהן',
    status: 'driving',
    status_text: 'פעיל',
    location: 'תל אביב',
    odometer: 84210,
    fault_count: 0,
    in_garage: false,
  },
  {
    id: 'preview-v2',
    plate: '98-765-43',
    internal_number: 'D-102',
    company_name: 'דליה תפעול',
    make: 'מאזדה',
    model: '3',
    driver_name: 'דנה לוי',
    status: 'fault',
    status_text: 'תקלה',
    location: 'חיפה',
    odometer: 120400,
    fault_count: 1,
    in_garage: false,
  },
  {
    id: 'preview-v3',
    plate: '11-222-33',
    internal_number: 'D-103',
    make: 'קיה',
    model: 'ספורטז\'',
    driver_name: 'יוסי מזרחי',
    status: 'stopped',
    status_text: 'במוסך',
    location: 'מוסך מרכזי',
    odometer: 55600,
    fault_count: 0,
    in_garage: true,
  },
  {
    id: 'preview-v4',
    plate: '77-888-99',
    internal_number: 'D-104',
    make: 'יונדאי',
    model: 'איוניק',
    driver_name: 'מיכל בר',
    status: 'offline',
    status_text: 'לא פעיל',
    location: '—',
    odometer: 30100,
    fault_count: 0,
    in_garage: false,
  },
  {
    id: 'preview-v5',
    plate: '55-444-22',
    internal_number: 'D-105',
    make: 'סקודה',
    model: 'אוקטביה',
    driver_name: undefined,
    status: 'driving',
    status_text: 'פעיל',
    location: 'באר שבע',
    odometer: 45100,
    fault_count: 0,
    in_garage: false,
  },
];

export const PREVIEW_FLEETOS_ALERTS: FleetOSAlertRow[] = [
  {
    id: 'a1',
    type: 'fault_active',
    vehicle_plate: '98-765-43',
    message: 'תקלת מנוע — דחוף',
    severity: 'critical',
    created_at: new Date().toISOString(),
  },
  {
    id: 'a2',
    type: 'service_due',
    vehicle_plate: '12-345-67',
    message: 'טיפול 10,000 ק"מ מתקרב',
    severity: 'warning',
    created_at: new Date().toISOString(),
  },
  {
    id: 'a3',
    type: 'in_garage',
    vehicle_plate: '11-222-33',
    message: 'רכב במוסך',
    severity: 'info',
    created_at: new Date().toISOString(),
  },
];

export const PREVIEW_FLEETOS_PREFS: FleetOSDashboardPrefs = DEFAULT_PREFS;

export const PREVIEW_FLEETOS_USER_ID = 'dev-fleetos-preview-user';
