import { RAW_RETENTION_MS } from './types';
import type { IngestResult, LiveSnapshot, StarlinkDevice } from './types';
import { DEFAULT_P177 } from './tags';

export const STAGING_REF = 'usfeoerkpcafxxlyuldl';
export const PROD_REF = 'qasomfndnjuixgjmjwcm';

export function assertStagingUrl(url: string) {
  if (url.includes(PROD_REF)) throw new Error('refused: production supabase');
  if (!url.includes(STAGING_REF)) throw new Error('refused: supabase URL is not Staging');
}

export function liveToGpsLiveRow(live: LiveSnapshot) {
  return {
    device_id: live.deviceId,
    vehicle_id: live.vehicleId,
    company_name: live.companyName,
    unit_id: live.unitId,
    imei: live.imei,
    last_seen: live.lastSeen,
    last_seq: live.lastSeq,
    last_cmd: live.lastCmd,
    gps_at: live.gpsAt,
    gps_age_sec: live.gpsAgeSec,
    freshness: live.freshness,
    lat: live.lat,
    lng: live.lng,
    speed_knots: live.speedKnots,
    speed_kmh: live.speedKmh,
    heading: live.heading,
    ignition: live.ignition,
    engine: live.engine,
    motion: live.motion,
    odometer: live.odometer,
    odometer_decision: live.odometerDecision,
    vehicle_voltage: live.vehicleVoltage,
    backup_voltage: live.backupVoltage,
    rpm: live.rpm,
    engine_hours: live.engineHours,
    fuel: live.fuel,
    driver_id_erm: live.driverId,
    can_raw: live.canRaw,
    tags: live.tags,
    updated_at: live.lastSeen,
  };
}

/** Writes only gps_*. Never faults / accidents / expenses / vehicles. */
export async function persistIngestResult(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  result: IngestResult,
  rawLine: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (result.businessWrites.length > 0) {
    return { ok: false, reason: 'business_write_blocked' };
  }
  if (result.reason === 'partial' || result.reason === 'empty') return { ok: true };

  const rawIns = await db.from('gps_raw').insert({
    device_id: result.live?.deviceId ?? null,
    company_name: result.live?.companyName ?? null,
    raw: String(rawLine || '').slice(0, 2000),
    reason: result.reason,
  });
  if (rawIns.error) return { ok: false, reason: rawIns.error.message };

  if (!result.accepted || !result.live || result.reason === 'duplicate') return { ok: true };

  const liveIns = await db.from('gps_live').upsert(liveToGpsLiveRow(result.live), { onConflict: 'device_id' });
  if (liveIns.error) return { ok: false, reason: liveIns.error.message };

  if (result.sampled && result.live.lat != null && result.live.lng != null) {
    const posIns = await db.from('gps_positions').insert({
      device_id: result.live.deviceId,
      vehicle_id: result.live.vehicleId,
      company_name: result.live.companyName,
      lat: result.live.lat,
      lng: result.live.lng,
      speed_kmh: result.live.speedKmh,
      heading: result.live.heading,
      at: result.live.gpsAt || result.live.lastSeen,
    });
    if (posIns.error) return { ok: false, reason: posIns.error.message };
  }

  if (result.event) {
    const ev = result.event;
    const evIns = await db.from('gps_events').insert({
      device_id: ev.deviceId,
      vehicle_id: ev.vehicleId,
      company_name: ev.companyName,
      eid: ev.eid,
      event_key: ev.key,
      label_he: ev.labelHe,
      severity: ev.severity,
      at: ev.at,
      tags: ev.tags,
    });
    if (evIns.error) return { ok: false, reason: evIns.error.message };
  }

  return { ok: true };
}

export async function pruneGpsRaw(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  now = Date.now(),
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const cutoff = new Date(now - RAW_RETENTION_MS).toISOString();
  const del = await db.from('gps_raw').delete().lt('at', cutoff);
  if (del.error) return { ok: false, reason: del.error.message };
  return { ok: true };
}

export function rowToDevice(row: {
  id: string;
  unit_id: string;
  imei?: string | null;
  vehicle_id: string;
  company_name: string;
  enabled: boolean;
  p177?: string | null;
}): StarlinkDevice {
  return {
    id: row.id,
    unitId: row.unit_id,
    imei: row.imei ?? null,
    vehicleId: row.vehicle_id,
    companyName: row.company_name,
    enabled: row.enabled,
    p177: row.p177 || DEFAULT_P177,
  };
}

