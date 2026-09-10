import { applyCompanyScope } from '@/hooks/useCompanyFilter';
import { supabase } from '@/integrations/supabase/client';
import type { LiveSnapshot } from './types';
import { assignmentOnlyOverlay } from './emptyOverlay';
import type { TelematicsOverlay } from './adapter';
import {
  commStatusFromLastSeen,
  dataOriginFromUnit,
  freshnessNow,
  gpsQualityFromTags,
  odometerSourceLabel,
} from './origin';

const LIVE_SELECT = [
  'vehicle_id',
  'unit_id',
  'imei',
  'last_seen',
  'gps_at',
  'gps_age_sec',
  'freshness',
  'lat',
  'lng',
  'speed_kmh',
  'heading',
  'ignition',
  'engine',
  'motion',
  'odometer',
  'odometer_decision',
  'vehicle_voltage',
  'backup_voltage',
  'rpm',
  'engine_hours',
  'fuel',
  'driver_id_erm',
  'can_raw',
  'tags',
].join(', ');

/**
 * Reads gps_live when tables exist. Missing tables → empty overlay (no mock live).
 * Recomputes Online/Stale from last_seen so a stored row is never "Live" by existence.
 */
export async function loadGpsLiveOverlay(
  companyFilter: string | null,
): Promise<Map<string, TelematicsOverlay>> {
  const out = new Map<string, TelematicsOverlay>();
  const now = Date.now();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await applyCompanyScope(
      (supabase as any).from('gps_live').select(LIVE_SELECT),
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
      if (arr.length < 5) {
        arr.push({
          labelHe: String(e.label_he || ''),
          at: String(e.at || ''),
          severity: String(e.severity || 'info'),
        });
      }
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
      const lat = num(row.lat);
      const lng = num(row.lng);
      const lastSeen = str(row.last_seen);
      const gpsAt = str(row.gps_at);
      const gpsAgeSec = num(row.gps_age_sec);
      const freshness = freshnessNow(lat, lng, gpsAgeSec, gpsAt, lastSeen, now);
      const unitId = str(row.unit_id);
      const origin = dataOriginFromUnit(unitId);
      const tags = (row.tags as Record<string, string | null>) || {};
      const quality = gpsQualityFromTags(tags);
      const odo = num(row.odometer);
      const odoSrc = odometerSourceLabel(odo != null);
      const canRaw = (row.can_raw as Record<string, string>) || {};
      const mappedTpl = canByV.get(vehicleId) || {};
      const canMapped: Record<string, { label: string; value: string }> = {};
      for (const [tag, meta] of Object.entries(mappedTpl)) {
        if (canRaw[tag] != null) canMapped[tag] = { label: meta.label, value: canRaw[tag] };
      }
      out.set(vehicleId, {
        live: freshness === 'live' && origin !== 'qa',
        freshness,
        commStatus: commStatusFromLastSeen(lastSeen, now),
        dataOrigin: origin,
        lat,
        lng,
        speedKmh: num(row.speed_kmh),
        heading: num(row.heading),
        ignition: bool(row.ignition),
        engine: bool(row.engine),
        motion: (row.motion as LiveSnapshot['motion']) ?? null,
        odometer: odo,
        odometerDecision: (row.odometer_decision as LiveSnapshot['odometerDecision']) || 'skip',
        odometerSourceTag: odoSrc.tag,
        odometerGpsVsCan: odoSrc.gpsVsCan,
        vehicleVoltage: num(row.vehicle_voltage),
        backupVoltage: num(row.backup_voltage),
        rpm: num(row.rpm),
        engineHours: num(row.engine_hours),
        fuel: num(row.fuel),
        driverId: str(row.driver_id_erm),
        altitude: quality.altitude,
        satellites: quality.satellites,
        hdop: quality.hdop,
        gpsFix: quality.gpsFix,
        idlingSec: quality.idlingSec,
        lastSeen,
        gpsAt,
        gpsAgeSec,
        imei: str(row.imei),
        unitId,
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

/** Hide historical unknown_device rows once the Unit ID has an enabled gps_devices mapping. */
export function excludeMappedUnknownDevices<T extends { unitHint: string | null }>(
  rows: T[],
  assignedUnitIds: Iterable<string | null | undefined>,
): T[] {
  const mapped = new Set(
    [...assignedUnitIds]
      .map((u) => String(u || '').trim().toUpperCase())
      .filter(Boolean),
  );
  if (mapped.size === 0) return rows;
  return rows.filter((row) => {
    const hint = String(row.unitHint || '').trim().toUpperCase();
    if (!hint) return true;
    return !mapped.has(hint);
  });
}

export async function loadUnknownGpsRaw(
  limit = 8,
  companyFilter: string | null = null,
): Promise<Array<{ id: string; at: string; raw: string; unitHint: string | null }>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('gps_raw')
      .select('id, at, raw, reason')
      .eq('reason', 'unknown_device')
      .order('at', { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    const rows = (data as Array<{ id: string; at: string; raw: string }>).map((row) => ({
      id: row.id,
      at: row.at,
      raw: row.raw,
      unitHint: unitHintFromRaw(row.raw),
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const devicesQ = await applyCompanyScope(
      (supabase as any).from('gps_devices').select('unit_id').eq('enabled', true),
      companyFilter,
    );
    const assigned = ((devicesQ.data || []) as Array<{ unit_id?: string | null }>).map((d) => d.unit_id);
    return excludeMappedUnknownDevices(rows, assigned);
  } catch {
    return [];
  }
}

export function unitHintFromRaw(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /\$SLU([^,*]+)/i.exec(raw);
  return m ? m[1] : null;
}
