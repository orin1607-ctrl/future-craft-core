import { applyCompanyScope } from '@/hooks/useCompanyFilter';
import { supabase } from '@/integrations/supabase/client';
import type { GpsFreshness, LiveSnapshot } from './types';
import { assignmentOnlyOverlay } from './emptyOverlay';
import type { TelematicsOverlay } from './adapter';

/**
 * Reads gps_live when tables exist. Missing tables → empty overlay (no mock live).
 * Does not run migrations.
 */
export async function loadGpsLiveOverlay(
  companyFilter: string | null,
): Promise<Map<string, TelematicsOverlay>> {
  const out = new Map<string, TelematicsOverlay>();
  try {
    // Tables are proposed — query fails until Owner-approved migration runs.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await applyCompanyScope(
      (supabase as any)
        .from('gps_live')
        .select(
          'vehicle_id, unit_id, imei, last_seen, gps_at, gps_age_sec, freshness, lat, lng, speed_kmh, heading, ignition, engine, motion, odometer, vehicle_voltage, backup_voltage, rpm, can_raw',
        ),
      companyFilter,
    );
    if (error || !data) return out;
    const vehicleIds = (data as Array<Record<string, unknown>>).map((r) => String(r.vehicle_id || '')).filter(Boolean);

    const devicesQ = await applyCompanyScope(
      (supabase as any)
        .from('gps_devices')
        .select('vehicle_id, unit_id, imei')
        .eq('enabled', true),
      companyFilter,
    );

    const posQ = await applyCompanyScope(
      (supabase as any)
        .from('gps_positions')
        .select('vehicle_id, lat, lng')
        .in('vehicle_id', vehicleIds.length ? vehicleIds : ['00000000-0000-0000-0000-000000000000'])
        .order('at', { ascending: true })
        .limit(1500),
      companyFilter,
    );
    const evtQ = await applyCompanyScope(
      (supabase as any)
        .from('gps_events')
        .select('vehicle_id, label_he, at, severity')
        .order('at', { ascending: false })
        .limit(80),
      companyFilter,
    );
    const mapQ = await applyCompanyScope(
      (supabase as any).from('gps_can_maps').select('vehicle_id, cv_tag, label_he'),
      companyFilter,
    );

    const trails = new Map<string, { lat: number; lng: number }[]>();
    for (const p of posQ.data || []) {
      const id = String(p.vehicle_id || '');
      const lat = num(p.lat);
      const lng = num(p.lng);
      if (!id || lat == null || lng == null) continue;
      const arr = trails.get(id) || [];
      arr.push({ lat, lng });
      trails.set(id, arr);
    }
    const eventsByV = new Map<string, { labelHe: string; at: string; severity: string }[]>();
    for (const e of evtQ.data || []) {
      const id = String(e.vehicle_id || '');
      if (!id) continue;
      const arr = eventsByV.get(id) || [];
      if (arr.length < 5) arr.push({ labelHe: String(e.label_he || ''), at: String(e.at || ''), severity: String(e.severity || 'info') });
      eventsByV.set(id, arr);
    }
    const canByV = new Map<string, Record<string, { label: string; value: string }>>();
    for (const m of mapQ.data || []) {
      const id = String(m.vehicle_id || '');
      if (!id) continue;
      const rec = canByV.get(id) || {};
      rec[String(m.cv_tag)] = { label: String(m.label_he), value: '' };
      canByV.set(id, rec);
    }

    for (const row of data as Array<Record<string, unknown>>) {
      const vehicleId = String(row.vehicle_id || '');
      if (!vehicleId) continue;
      const freshness = (row.freshness as GpsFreshness) || 'none';
      const canRaw = (row.can_raw as Record<string, string>) || {};
      const mappedTpl = canByV.get(vehicleId) || {};
      const canMapped: Record<string, { label: string; value: string }> = {};
      for (const [tag, meta] of Object.entries(mappedTpl)) {
        if (canRaw[tag] != null) canMapped[tag] = { label: meta.label, value: canRaw[tag] };
      }
      out.set(vehicleId, {
        live: freshness === 'live',
        freshness,
        lat: num(row.lat),
        lng: num(row.lng),
        speedKmh: num(row.speed_kmh),
        heading: num(row.heading),
        ignition: bool(row.ignition),
        engine: bool(row.engine),
        motion: (row.motion as LiveSnapshot['motion']) ?? null,
        odometer: num(row.odometer),
        odometerDecision: 'skip',
        vehicleVoltage: num(row.vehicle_voltage),
        backupVoltage: num(row.backup_voltage),
        rpm: num(row.rpm),
        lastSeen: str(row.last_seen),
        gpsAt: str(row.gps_at),
        gpsAgeSec: num(row.gps_age_sec),
        imei: str(row.imei),
        unitId: str(row.unit_id),
        trail: trails.get(vehicleId) || [],
        canRaw,
        canMapped,
        events: eventsByV.get(vehicleId) || [],
      });
    }

    for (const d of devicesQ.data || []) {
      const vehicleId = String(d.vehicle_id || '');
      if (!vehicleId) continue;
      const unitId = str(d.unit_id);
      const imei = str(d.imei);
      const existing = out.get(vehicleId);
      if (existing) {
        if (!existing.unitId) existing.unitId = unitId;
        if (!existing.imei) existing.imei = imei;
        continue;
      }
      out.set(vehicleId, assignmentOnlyOverlay(unitId, imei));
    }
  } catch {
    return out;
  }
  return out;
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v == null || v === '') return null;
  return String(v);
}

function bool(v: unknown): boolean | null {
  if (v === true || v === false) return v;
  return null;
}

export function applyOverlayMap(
  vehicles: { id: string }[],
  overlay: Map<string, TelematicsOverlay>,
): Array<{ id: string; telematics?: TelematicsOverlay }> {
  return vehicles.map((v) => {
    const t = overlay.get(v.id);
    return t ? { ...v, telematics: t } : v;
  });
}
