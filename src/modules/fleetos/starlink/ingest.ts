import { buildAck } from './ack';
import { isValidLatLng, parseDecimalDegrees, parseSignedNmea } from './coords';
import { ERM_EVENTS, isSignificantEvent, padEventId } from './events';
import { parseOdometerTag, shouldApplyTelematicsOdometer } from './odometerGuard';
import { parseStarlinkMessage } from './parseMessage';
import { shouldSamplePosition } from './sampling';
import { isCanTag } from './tags';
import type { GpsStore } from './store';
import type {
  GpsEventRecord,
  GpsFreshness,
  IngestResult,
  LiveSnapshot,
  MotionState,
  PositionSample,
} from './types';
import { MAX_MESSAGE_BYTES, STALE_GPS_SECONDS } from './types';

function parseStarlinkDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!/^\d{12}$/.test(s)) return null;
  const yy = Number(s.slice(0, 2));
  const year = yy >= 70 ? 1900 + yy : 2000 + yy;
  const iso = `${year}-${s.slice(2, 4)}-${s.slice(4, 6)}T${s.slice(6, 8)}:${s.slice(8, 10)}:${s.slice(10, 12)}Z`;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? iso : null;
}

function parseFlag(raw: string | null | undefined): boolean | null {
  if (raw == null || raw === '') return null;
  if (raw === '1' || raw.toLowerCase() === 'on') return true;
  if (raw === '0' || raw.toLowerCase() === 'off') return false;
  return null;
}

function parseNum(raw: string | null | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function knotsToKmh(knots: number | null): number | null {
  if (knots == null) return null;
  return Math.round(knots * 1.852 * 10) / 10;
}

function freshnessFor(
  lat: number | null,
  lng: number | null,
  gpsAgeSec: number | null,
): GpsFreshness {
  if (!isValidLatLng(lat, lng)) return 'none';
  if (gpsAgeSec != null && gpsAgeSec > STALE_GPS_SECONDS) return 'stale';
  return 'live';
}

function motionOf(
  drv: boolean | null,
  speedKmh: number | null,
  ign: boolean | null,
): MotionState {
  if (drv === true) return 'driving';
  if (drv === false) return 'stopped';
  if (speedKmh != null) return speedKmh >= 5 ? 'driving' : 'stopped';
  if (ign === false) return 'stopped';
  return null;
}

let seqCounter = 0;
function nid(prefix: string): string {
  seqCounter += 1;
  return `${prefix}-${Date.now()}-${seqCounter}`;
}

function emptyResult(
  reason: IngestResult['reason'],
  extra?: Partial<IngestResult>,
): IngestResult {
  return {
    accepted: false,
    reason,
    ack: null,
    live: null,
    sampled: false,
    event: null,
    businessWrites: [],
    ...extra,
  };
}

export function ingestStarlinkLine(
  store: GpsStore,
  line: string,
  now = new Date(),
): IngestResult {
  const nowIso = now.toISOString();
  if (!line || !line.trim()) return emptyResult('empty');
  if (new TextEncoder().encode(line).length > MAX_MESSAGE_BYTES) {
    store.addRaw({ id: nid('raw'), deviceId: null, companyName: null, at: nowIso, raw: line.slice(0, 200), reason: 'too_long' });
    return emptyResult('malformed');
  }

  const peek = parseStarlinkMessage(line, '');
  if ('error' in peek && peek.error === 'partial') return emptyResult('partial');
  if ('error' in peek && peek.error === 'malformed') {
    store.addRaw({ id: nid('raw'), deviceId: null, companyName: null, at: nowIso, raw: line, reason: 'malformed' });
    return emptyResult('malformed');
  }
  if ('error' in peek && peek.error === 'checksum') {
    store.addRaw({ id: nid('raw'), deviceId: null, companyName: null, at: nowIso, raw: line, reason: 'checksum' });
    return emptyResult('checksum');
  }

  const unitId = 'error' in peek ? '' : peek.unitId;
  const imeiGuess = 'error' in peek ? null : peek.tags.IMEI;
  const device = store.getDeviceByUnit(unitId, imeiGuess);
  if (!device) {
    store.addRaw({ id: nid('raw'), deviceId: null, companyName: null, at: nowIso, raw: line, reason: 'unknown_device' });
    return emptyResult('unknown_device');
  }
  if (!device.enabled) return emptyResult('disabled');

  const parsed = parseStarlinkMessage(line, device.p177);
  if ('error' in parsed) {
    store.addRaw({ id: nid('raw'), deviceId: device.id, companyName: device.companyName, at: nowIso, raw: line, reason: parsed.error });
    return emptyResult(parsed.error === 'checksum' ? 'checksum' : parsed.error === 'partial' ? 'partial' : 'malformed');
  }
  if (parsed.header !== 'SLU') return emptyResult('malformed');

  if (store.seenDuplicate(device.id, parsed.cmd, parsed.unitRef)) {
    return {
      accepted: true,
      reason: 'duplicate',
      ack: buildAck(parsed.unitId, parsed.unitRef),
      live: store.getLive(device.id) || null,
      sampled: false,
      event: null,
      businessWrites: [],
    };
  }
  store.markDuplicate(device.id, parsed.cmd, parsed.unitRef);

  const tags = parsed.tags;
  const lat = tags.LTDD ? parseDecimalDegrees(tags.LTDD, true) : parseSignedNmea(tags.LAT, true);
  const lng = tags.LGDD ? parseDecimalDegrees(tags.LGDD, false) : parseSignedNmea(tags.LONG, false);
  const gpsAt = parseStarlinkDate(tags.PDT || tags.EDT);
  const pas = parseNum(tags.PAS);
  const pam = parseNum(tags.PAM);
  const gpsAgeSec =
    pas != null ? pas : pam != null ? pam * 60 : gpsAt ? Math.max(0, (now.getTime() - Date.parse(gpsAt)) / 1000) : null;

  const prev = store.getLive(device.id);
  const eid = padEventId(tags.EID);
  let ignition = parseFlag(tags.IGN ?? tags.IN8);
  if (ignition == null && eid === '04') ignition = true;
  if (ignition == null && eid === '05') ignition = false;
  if (ignition == null) ignition = prev?.ignition ?? null;

  let engine = parseFlag(tags.ENG);
  if (engine == null && eid === '24') engine = true;
  if (engine == null && eid === '25') engine = false;
  if (engine == null) engine = prev?.engine ?? null;

  const speedKnots = tags.SPD != null ? parseNum(tags.SPD) : null;
  const speedKmh = tags.SPDK != null ? parseNum(tags.SPDK) : knotsToKmh(speedKnots);
  const heading = parseNum(tags.HEAD);
  const drv = parseFlag(tags.DRV);
  const motion = motionOf(drv, speedKmh, ignition);

  const odoIncoming = parseOdometerTag(tags.ODO);
  const odo = shouldApplyTelematicsOdometer(prev?.odometer ?? null, odoIncoming);

  const vinNum = parseNum(tags.VIN);
  const vehicleVoltage = vinNum != null && (tags.VIN || '').length <= 8 ? vinNum : prev?.vehicleVoltage ?? null;
  const backupVoltage = parseNum(tags.VBAT);
  const rpm = parseNum(tags.RPM);
  const engineHours = parseNum(tags.DUR) ?? parseNum(tags.TDUR);
  const fuel = parseNum(tags.CFL);
  const driverId = tags.DID || tags.DAL || null;
  const imei = tags.IMEI || device.imei;

  const canRaw: Record<string, string> = { ...(prev?.canRaw || {}) };
  const canMap = store.getCanMap(device.vehicleId);
  const canMapped: Record<string, { label: string; value: string }> = { ...(prev?.canMapped || {}) };
  for (const [tag, value] of Object.entries(tags)) {
    if (!value || !isCanTag(tag)) continue;
    canRaw[tag.toUpperCase()] = value;
    const label = canMap[tag.toUpperCase()];
    if (label) canMapped[tag.toUpperCase()] = { label, value };
  }

  const fresh = freshnessFor(lat, lng, gpsAgeSec);
  const live: LiveSnapshot = {
    deviceId: device.id,
    vehicleId: device.vehicleId,
    companyName: device.companyName,
    unitId: parsed.unitId,
    imei,
    lastSeen: nowIso,
    lastSeq: parsed.unitRef,
    lastCmd: parsed.cmd,
    gpsAt,
    gpsAgeSec: gpsAgeSec == null ? null : Math.round(gpsAgeSec),
    freshness: fresh,
    lat: isValidLatLng(lat, lng) ? lat : null,
    lng: isValidLatLng(lat, lng) ? lng : null,
    speedKnots,
    speedKmh,
    heading,
    ignition,
    engine,
    motion,
    odometer: odo.decision === 'apply' ? odo.value : prev?.odometer ?? null,
    odometerDecision: odo.decision,
    vehicleVoltage,
    backupVoltage,
    rpm,
    engineHours,
    fuel,
    driverId,
    canRaw,
    canMapped,
    tags,
  };
  store.setLive(live);

  let sampled = false;
  if (fresh !== 'none' && live.lat != null && live.lng != null) {
    const nextPos = { lat: live.lat, lng: live.lng, heading, at: gpsAt || nowIso };
    if (shouldSamplePosition(store.lastPosition(device.id) || null, nextPos)) {
      const sample: PositionSample = {
        id: nid('pos'),
        deviceId: device.id,
        vehicleId: device.vehicleId,
        companyName: device.companyName,
        lat: live.lat,
        lng: live.lng,
        speedKmh,
        heading,
        at: nextPos.at,
      };
      store.addPosition(sample);
      sampled = true;
    }
  }

  let event: GpsEventRecord | null = null;
  if (isSignificantEvent(eid) && eid) {
    const meta = ERM_EVENTS[eid] || { key: 'other', labelHe: `אירוע ${eid}`, severity: 'info' as const };
    event = {
      id: nid('evt'),
      deviceId: device.id,
      vehicleId: device.vehicleId,
      companyName: device.companyName,
      eid,
      key: meta.key,
      labelHe: meta.labelHe,
      severity: meta.severity,
      at: gpsAt || nowIso,
      tags,
    };
    store.addEvent(event);
  }

  store.addRaw({
    id: nid('raw'),
    deviceId: device.id,
    companyName: device.companyName,
    at: nowIso,
    raw: line,
    reason: 'ok',
  });
  store.prune(now.getTime());

  return {
    accepted: true,
    reason: 'ok',
    ack: buildAck(parsed.unitId, parsed.unitRef),
    live,
    sampled,
    event,
    businessWrites: [],
  };
}
