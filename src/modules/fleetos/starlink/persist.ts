import { applyCompanyScope } from '@/hooks/useCompanyFilter';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_P177 } from './tags';
import { planAssignDevice, planReplaceDevice, planUnassignDevice } from './deviceRegistry';
import type { StarlinkDevice } from './types';

type GpsDeviceRow = {
  id: string;
  unit_id: string;
  imei: string | null;
  vehicle_id: string;
  company_name: string;
  enabled: boolean;
  p177: string;
};

function db() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase as any;
}

function toDevice(row: GpsDeviceRow): StarlinkDevice {
  return {
    id: row.id,
    unitId: row.unit_id,
    imei: row.imei,
    vehicleId: row.vehicle_id,
    companyName: row.company_name,
    enabled: row.enabled,
    p177: row.p177 || DEFAULT_P177,
  };
}

export async function gpsTablesReady(): Promise<boolean> {
  const { error } = await db().from('gps_devices').select('id').limit(1);
  return !error;
}

export async function loadGpsDevices(companyFilter: string | null): Promise<StarlinkDevice[]> {
  const { data, error } = await applyCompanyScope(
    db().from('gps_devices').select('id, unit_id, imei, vehicle_id, company_name, enabled, p177'),
    companyFilter,
  );
  if (error || !data) return [];
  return (data as GpsDeviceRow[]).map(toDevice);
}

export async function persistAssignDevice(input: {
  vehicleId: string;
  companyName: string;
  unitId: string;
  imei?: string | null;
  replace?: boolean;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { data, error } = await db()
    .from('gps_devices')
    .select('id, unit_id, imei, vehicle_id, company_name, enabled, p177');
  if (error) return { ok: false, reason: error.message };
  const devices = ((data || []) as GpsDeviceRow[]).map(toDevice);
  const nowIso = new Date().toISOString();
  const planned = input.replace
    ? planReplaceDevice({
        devices,
        vehicleId: input.vehicleId,
        companyName: input.companyName,
        unitId: input.unitId,
        imei: input.imei,
        p177: DEFAULT_P177,
        nowIso,
      })
    : planAssignDevice({
        devices,
        vehicleId: input.vehicleId,
        companyName: input.companyName,
        unitId: input.unitId,
        imei: input.imei,
        p177: DEFAULT_P177,
        nowIso,
      });
  if (!planned.ok) return planned;

  if ('unassigned' in planned && planned.unassigned) {
    const off = await db()
      .from('gps_devices')
      .update({ enabled: false, updated_at: nowIso })
      .eq('id', planned.unassigned.id);
    if (off.error) return { ok: false, reason: off.error.message };
    const histOff = await db().from('gps_device_assignments').insert({
      device_id: planned.unassigned.id,
      vehicle_id: planned.unassigned.vehicleId,
      company_name: planned.unassigned.companyName,
      action: 'unassign',
    });
    if (histOff.error) return { ok: false, reason: histOff.error.message };
  }

  const insert = await db()
    .from('gps_devices')
    .insert({
      unit_id: planned.device.unitId,
      imei: planned.device.imei,
      vehicle_id: planned.device.vehicleId,
      company_name: planned.device.companyName,
      enabled: true,
      p177: planned.device.p177,
    })
    .select('id')
    .single();
  if (insert.error) return { ok: false, reason: insert.error.message };

  const hist = await db().from('gps_device_assignments').insert({
    device_id: insert.data.id,
    vehicle_id: planned.device.vehicleId,
    company_name: planned.device.companyName,
    action: input.replace ? 'replace' : 'assign',
    previous_vehicle_id: 'unassigned' in planned ? planned.unassigned?.vehicleId ?? null : null,
  });
  if (hist.error) return { ok: false, reason: hist.error.message };
  return { ok: true };
}

export async function persistUnassignDevice(vehicleId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { data, error } = await db()
    .from('gps_devices')
    .select('id, unit_id, imei, vehicle_id, company_name, enabled, p177')
    .eq('vehicle_id', vehicleId)
    .eq('enabled', true)
    .maybeSingle();
  if (error) return { ok: false, reason: error.message };
  if (!data) return { ok: false, reason: 'not_found' };
  const off = planUnassignDevice(toDevice(data as GpsDeviceRow), new Date().toISOString());
  const upd = await db()
    .from('gps_devices')
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq('id', off.device.id);
  if (upd.error) return { ok: false, reason: upd.error.message };
  const hist = await db().from('gps_device_assignments').insert({
    device_id: off.device.id,
    vehicle_id: off.history.vehicleId,
    company_name: off.history.companyName,
    action: 'unassign',
  });
  if (hist.error) return { ok: false, reason: hist.error.message };
  return { ok: true };
}
