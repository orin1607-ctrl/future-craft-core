import { supabase } from '@/integrations/supabase/client';

export type ResolvedVehicle = {
  id: string;
  license_plate: string;
  internal_number: string | null;
  manufacturer: string | null;
  model: string | null;
  year?: number | null;
  odometer?: number | null;
  assigned_driver_id: string | null;
  company_name: string | null;
};

export type ResolvedDriver = {
  id: string;
  full_name: string;
  phone: string | null;
};

/** Resolve vehicle by id or plate within company. */
export async function resolveVehicle(opts: {
  vehicleId?: string | null;
  plate?: string | null;
  companyName?: string | null;
}): Promise<ResolvedVehicle | null> {
  let q = supabase
    .from('vehicles')
    .select('id, license_plate, internal_number, manufacturer, model, assigned_driver_id, company_name');
  if (opts.vehicleId) q = q.eq('id', opts.vehicleId);
  else if (opts.plate) q = q.eq('license_plate', opts.plate);
  else return null;
  if (opts.companyName) q = q.eq('company_name', opts.companyName);
  const { data } = await q.maybeSingle();
  return (data as ResolvedVehicle) || null;
}

/** Resolve driver row: prefer drivers.id from assigned_driver_id, else match by name. */
export async function resolveDriver(opts: {
  driverId?: string | null;
  assignedDriverId?: string | null;
  driverName?: string | null;
  companyName?: string | null;
}): Promise<ResolvedDriver | null> {
  if (opts.driverId) {
    const { data } = await supabase
      .from('drivers')
      .select('id, full_name, phone')
      .eq('id', opts.driverId)
      .maybeSingle();
    if (data) return data as ResolvedDriver;
  }
  if (opts.assignedDriverId) {
    const { data } = await supabase
      .from('drivers')
      .select('id, full_name, phone')
      .eq('id', opts.assignedDriverId)
      .maybeSingle();
    if (data) return data as ResolvedDriver;
  }
  if (opts.driverName?.trim()) {
    let q = supabase
      .from('drivers')
      .select('id, full_name, phone')
      .eq('full_name', opts.driverName.trim())
      .limit(1);
    if (opts.companyName) q = q.eq('company_name', opts.companyName);
    const { data } = await q.maybeSingle();
    if (data) return data as ResolvedDriver;
  }
  return null;
}

export async function listDriverVehicles(userId: string, companyName?: string | null) {
  let q = supabase
    .from('vehicles')
    .select('id, license_plate, internal_number, manufacturer, model, year, odometer, assigned_driver_id, company_name')
    .eq('assigned_driver_id', userId);
  if (companyName) q = q.eq('company_name', companyName);
  const { data } = await q;
  return (data || []) as ResolvedVehicle[];
}
