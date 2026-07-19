import { allocateIncidentEventNumber, israelNowIso } from '@/lib/incidentEventNumber';
import { resolveDriver, resolveVehicle } from '@/lib/incidentResolve';
import { dispatchIncidentNotifications } from '@/lib/incidentNotify';
import { supabase } from '@/integrations/supabase/client';
import { faultTypeDisplay } from '@/lib/faultTypes';

type AuthUser = {
  id: string;
  role?: string;
  company_name?: string;
  full_name?: string;
  phone?: string;
};

export async function createFaultIncident(opts: {
  user: AuthUser;
  vehiclePlate: string;
  vehicleId?: string | null;
  driverName: string;
  driverId?: string | null;
  faultType: string;
  faultTypeOther?: string;
  description: string;
  urgency: string;
  notes?: string;
  images?: string[];
  dryRunNotify?: boolean;
}) {
  const company = opts.user.company_name || '';
  const vehicle = await resolveVehicle({
    vehicleId: opts.vehicleId,
    plate: opts.vehiclePlate,
    companyName: company,
  });
  const driver = await resolveDriver({
    driverId: opts.driverId,
    assignedDriverId: vehicle?.assigned_driver_id,
    driverName: opts.driverName,
    companyName: company,
  });

  const eventNumber = await allocateIncidentEventNumber(company, 'FLT');
  const nowIso = israelNowIso();

  const insertPayload: Record<string, unknown> = {
    vehicle_plate: opts.vehiclePlate || vehicle?.license_plate || '',
    driver_name: opts.driverName || driver?.full_name || '',
    fault_type: opts.faultType,
    fault_type_other: opts.faultType === 'אחר' ? opts.faultTypeOther || '' : '',
    description: opts.description,
    urgency: opts.urgency,
    notes: opts.notes || '',
    images: opts.images?.length ? JSON.stringify(opts.images) : '',
    status: 'opened',
    company_name: company,
    created_by: opts.user.id,
    opened_by_role: opts.user.role || '',
    event_number: eventNumber,
    serial_id: eventNumber,
    vehicle_id: vehicle?.id || opts.vehicleId || null,
    driver_id: driver?.id || null,
    reporter_phone: opts.user.phone || driver?.phone || '',
    date: nowIso,
  };

  const { data, error } = await supabase.from('faults').insert(insertPayload).select('*').single();
  if (error) return { error, data: null, notify: null };

  // Notify is best-effort — never fail the saved incident
  let notify = null;
  try {
    notify = await dispatchIncidentNotifications({
      kind: 'fault',
      record: {
        ...data,
        vehicle_internal_number: vehicle?.internal_number || null,
        fault_type: data.fault_type,
        fault_type_other: data.fault_type_other,
        status: data.status,
      },
      dryRun: opts.dryRunNotify === true,
    });
  } catch (e) {
    console.error('fault notify soft-fail', e);
    notify = { notifyError: e instanceof Error ? e.message : 'notify failed' } as never;
  }

  return { error: null, data, notify, vehicle, displayType: faultTypeDisplay(opts.faultType, opts.faultTypeOther) };
}

export async function createAccidentIncident(opts: {
  user: AuthUser;
  vehiclePlate: string;
  vehicleId?: string | null;
  driverName: string;
  driverId?: string | null;
  location?: string;
  description: string;
  hasInsurance?: boolean;
  thirdParty?: boolean;
  estimatedCost?: number;
  notes?: string;
  images?: string[];
  dryRunNotify?: boolean;
}) {
  const company = opts.user.company_name || '';
  const vehicle = await resolveVehicle({
    vehicleId: opts.vehicleId,
    plate: opts.vehiclePlate,
    companyName: company,
  });
  const driver = await resolveDriver({
    driverId: opts.driverId,
    assignedDriverId: vehicle?.assigned_driver_id,
    driverName: opts.driverName,
    companyName: company,
  });

  const eventNumber = await allocateIncidentEventNumber(company, 'ACC');
  const nowIso = israelNowIso();

  const insertPayload: Record<string, unknown> = {
    vehicle_plate: opts.vehiclePlate || vehicle?.license_plate || '',
    driver_name: opts.driverName || driver?.full_name || '',
    location: opts.location || '',
    description: opts.description,
    has_insurance: !!opts.hasInsurance,
    third_party: !!opts.thirdParty,
    estimated_cost: opts.estimatedCost || 0,
    notes: opts.notes || '',
    images: opts.images?.length ? JSON.stringify(opts.images) : '',
    status: 'open',
    company_name: company,
    created_by: opts.user.id,
    opened_by_role: opts.user.role || '',
    event_number: eventNumber,
    vehicle_id: vehicle?.id || opts.vehicleId || null,
    driver_id: driver?.id || null,
    reporter_phone: opts.user.phone || driver?.phone || '',
    date: nowIso,
  };

  const { data, error } = await supabase.from('accidents').insert(insertPayload).select('*').single();
  if (error) return { error, data: null, notify: null };

  let notify = null;
  try {
    notify = await dispatchIncidentNotifications({
      kind: 'accident',
      record: {
        ...data,
        vehicle_internal_number: vehicle?.internal_number || null,
        status: data.status,
      },
      dryRun: opts.dryRunNotify === true,
    });
  } catch (e) {
    console.error('accident notify soft-fail', e);
    notify = { notifyError: e instanceof Error ? e.message : 'notify failed' } as never;
  }

  return { error: null, data, notify, vehicle };
}
