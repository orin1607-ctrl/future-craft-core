export const DRIVER_ASSIGNMENT_EVENT_TYPE = 'driver_assignment';

export type DriverAssignmentHistoryInsert = {
  vehicle_id: string;
  company_name: string;
  event_type: typeof DRIVER_ASSIGNMENT_EVENT_TYPE;
  event_date: string;
  title: string;
  description: string;
  odometer: number | null;
  source: 'driver_assignment';
  created_by: string | null;
  assigned_driver_id: string;
};

export function parseInitialKm(raw: string): { km: number | null; error: string | null } {
  const trimmed = (raw || '').trim();
  if (!trimmed) return { km: null, error: null };
  const digits = trimmed.replace(/[,\s]/g, '');
  if (!/^\d+$/.test(digits)) {
    return { km: null, error: 'קילומטר התחלתי חייב להיות מספר שלם' };
  }
  const km = Number(digits);
  if (!Number.isFinite(km) || km < 0) {
    return { km: null, error: 'קילומטר התחלתי אינו תקין' };
  }
  return { km, error: null };
}

export function buildDriverAssignmentHistoryRow(params: {
  vehicleId: string;
  companyName: string;
  driverId: string;
  driverName: string;
  vehiclePlate: string;
  initialKm: number | null;
  assignedAt?: Date;
  createdBy?: string | null;
}): DriverAssignmentHistoryInsert {
  const assignedAt = params.assignedAt || new Date();
  const kmText =
    params.initialKm === null ? 'לא הוזן' : `${params.initialKm.toLocaleString('he-IL')} ק"מ`;
  return {
    vehicle_id: params.vehicleId,
    company_name: params.companyName,
    event_type: DRIVER_ASSIGNMENT_EVENT_TYPE,
    event_date: assignedAt.toISOString(),
    title: 'הצמדת נהג לרכב',
    description: [
      `נהג: ${params.driverName}`,
      `רכב: ${params.vehiclePlate}`,
      `קילומטר התחלתי: ${kmText}`,
    ].join(' · '),
    odometer: params.initialKm,
    source: 'driver_assignment',
    created_by: params.createdBy || null,
    assigned_driver_id: params.driverId,
  };
}
