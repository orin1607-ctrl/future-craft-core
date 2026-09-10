/**
 * Staging ERM TCP listener. Default bind 127.0.0.1 — no public port unless
 * FLEETOS_GPS_PUBLIC=1 is set after Owner approval.
 * Writes only gps_* on Staging. Refuses Production.
 *
 * npx vite-node src/modules/fleetos/starlink/runListener.ts
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { ingestStarlinkLine } from './ingest';
import { startStarlinkListener } from './listener';
import { persistIngestResult, pruneGpsRaw, rowToDevice, assertStagingUrl, STAGING_REF, PROD_REF } from './persistIngest';
import { InMemoryGpsStore } from './store';
import type { LiveSnapshot } from './types';

const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const PORT = Number(process.env.FLEETOS_GPS_PORT || 5055);
const wantPublic = process.env.FLEETOS_GPS_PUBLIC === '1';
const host = wantPublic ? process.env.FLEETOS_GPS_BIND || '0.0.0.0' : '127.0.0.1';

function loadServiceRole(): string {
  const fromEnv = process.env.FLEETOS_GPS_SERVICE_ROLE || '';
  if (fromEnv) return fromEnv;
  const keysRaw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, {
    encoding: 'utf8',
  });
  const keys = JSON.parse(keysRaw);
  return (
    keys.find((k: { name: string; type?: string }) => k.name === 'service_role' && k.type === 'legacy')?.api_key ||
    keys.find((k: { name: string }) => k.name === 'service_role')?.api_key
  );
}

function logSafe(event: Record<string, unknown>) {
  const copy = { ...event };
  delete copy.raw;
  delete copy.serviceRole;
  delete copy.key;
  delete copy.token;
  console.log(JSON.stringify({ at: new Date().toISOString(), ...copy }));
}

assertStagingUrl(STAGING_URL);
if (STAGING_REF === PROD_REF) throw new Error('refused: production');
if (wantPublic && process.env.FLEETOS_GPS_OWNER_OK !== '1') {
  throw new Error('refused: public bind also requires FLEETOS_GPS_OWNER_OK=1');
}

const serviceRole = loadServiceRole();
if (!serviceRole) throw new Error('missing Staging service role');
const admin = createClient(STAGING_URL, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });

const store = new InMemoryGpsStore();

async function refreshDevices() {
  const { data, error } = await admin
    .from('gps_devices')
    .select('id, unit_id, imei, vehicle_id, company_name, enabled, p177');
  if (error) {
    logSafe({ event: 'device_refresh_fail', err: error.message });
    return;
  }
  store.devices = [];
  for (const row of data || []) {
    store.upsertDevice(rowToDevice(row));
  }
  const maps = await admin.from('gps_can_maps').select('vehicle_id, cv_tag, label_he');
  if (!maps.error) {
    const byV = new Map<string, Record<string, string>>();
    for (const m of maps.data || []) {
      const id = String(m.vehicle_id || '');
      if (!id) continue;
      const rec = byV.get(id) || {};
      rec[String(m.cv_tag)] = String(m.label_he);
      byV.set(id, rec);
    }
    for (const [id, rec] of byV) store.setCanMap(id, rec);
  }
}

async function hydrateLive() {
  const { data } = await admin.from('gps_live').select('device_id, last_cmd, last_seq, odometer, lat, lng, last_seen, vehicle_id, company_name, unit_id, imei, freshness, heading, ignition, engine, motion, speed_kmh');
  for (const row of data || []) {
    if (row.device_id && row.last_cmd && row.last_seq) {
      store.markDuplicate(row.device_id, row.last_cmd, row.last_seq);
    }
    if (row.lat != null && row.lng != null) {
      store.addPosition({
        id: `boot-${row.device_id}`,
        deviceId: row.device_id,
        vehicleId: row.vehicle_id,
        companyName: row.company_name,
        lat: row.lat,
        lng: row.lng,
        speedKmh: row.speed_kmh ?? null,
        heading: row.heading ?? null,
        at: row.last_seen,
      });
    }
    if (row.device_id) {
      const live: LiveSnapshot = {
        deviceId: row.device_id,
        vehicleId: row.vehicle_id,
        companyName: row.company_name,
        unitId: row.unit_id,
        imei: row.imei ?? null,
        lastSeen: row.last_seen,
        lastSeq: row.last_seq || '',
        lastCmd: row.last_cmd || '',
        gpsAt: null,
        gpsAgeSec: null,
        freshness: (row.freshness as LiveSnapshot['freshness']) || 'none',
        lat: row.lat,
        lng: row.lng,
        speedKnots: null,
        speedKmh: row.speed_kmh ?? null,
        heading: row.heading ?? null,
        ignition: row.ignition ?? null,
        engine: row.engine ?? null,
        motion: row.motion ?? null,
        odometer: row.odometer == null ? null : Number(row.odometer),
        odometerDecision: 'skip',
        vehicleVoltage: null,
        backupVoltage: null,
        rpm: null,
        engineHours: null,
        fuel: null,
        driverId: null,
        canRaw: {},
        canMapped: {},
        tags: {},
      };
      store.setLive(live);
    }
  }
}

await refreshDevices();
await hydrateLive();

const handle = await startStarlinkListener(store, {
  host,
  port: PORT,
  onResult: (r, line) => {
    persistIngestResult(admin, r, line).then((p) => {
      logSafe({
        event: 'ingest',
        reason: r.reason,
        accepted: r.accepted,
        ack: Boolean(r.ack),
        unitId: r.live?.unitId || null,
        vehicleId: r.live?.vehicleId || null,
        persist: p.ok,
        persistErr: p.ok ? null : p.reason,
      });
    });
  },
});

logSafe({
  event: 'listen',
  host: handle.host,
  port: handle.port,
  public: wantPublic,
  devices: store.listDevices().length,
});

setInterval(() => {
  refreshDevices().catch((e) => logSafe({ event: 'refresh_err', err: String(e) }));
}, 30_000);

setInterval(() => {
  pruneGpsRaw(admin).catch((e) => logSafe({ event: 'prune_err', err: String(e) }));
}, 60 * 60 * 1000);

const shutdown = () => {
  logSafe({ event: 'shutdown' });
  handle.close().finally(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
