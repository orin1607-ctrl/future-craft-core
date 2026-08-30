import { DEFAULT_P177 } from './tags';
import type {
  GpsEventRecord,
  LiveSnapshot,
  PositionSample,
  RawRecord,
  StarlinkAssignment,
  StarlinkDevice,
} from './types';
import { POSITION_RETENTION_MS, RAW_RETENTION_MS } from './types';
import { normalizeUnitKey } from './deviceRegistry';

export interface GpsStore {
  getDeviceByUnit(unitId: string, imei?: string | null): StarlinkDevice | undefined;
  getDeviceByVehicle(vehicleId: string): StarlinkDevice | undefined;
  listDevices(companyName?: string | null): StarlinkDevice[];
  upsertDevice(device: StarlinkDevice): void;
  addAssignment(row: StarlinkAssignment): void;
  listAssignments(companyName?: string | null): StarlinkAssignment[];
  seenDuplicate(deviceId: string, cmd: string, unitRef: string): boolean;
  markDuplicate(deviceId: string, cmd: string, unitRef: string): void;
  getLive(deviceId: string): LiveSnapshot | undefined;
  setLive(live: LiveSnapshot): void;
  listLive(companyName?: string | null): LiveSnapshot[];
  lastPosition(deviceId: string): PositionSample | undefined;
  addPosition(sample: PositionSample): void;
  listPositions(vehicleId: string): PositionSample[];
  addEvent(event: GpsEventRecord): void;
  listEvents(companyName?: string | null): GpsEventRecord[];
  addRaw(row: RawRecord): void;
  listRaw(): RawRecord[];
  getCanMap(vehicleId: string): Record<string, string>;
  setCanMap(vehicleId: string, map: Record<string, string>): void;
  prune(now?: number): void;
}

export class InMemoryGpsStore implements GpsStore {
  devices: StarlinkDevice[] = [];
  assignments: StarlinkAssignment[] = [];
  private dup = new Set<string>();
  live = new Map<string, LiveSnapshot>();
  positions: PositionSample[] = [];
  events: GpsEventRecord[] = [];
  raw: RawRecord[] = [];
  canMaps = new Map<string, Record<string, string>>();

  getDeviceByUnit(unitId: string, imei?: string | null): StarlinkDevice | undefined {
    const key = normalizeUnitKey(unitId, imei);
    return this.devices.find(
      (d) =>
        d.enabled &&
        (normalizeUnitKey(d.unitId, d.imei) === key ||
          d.unitId.toUpperCase() === unitId.toUpperCase() ||
          (!!imei && d.imei === imei)),
    );
  }

  getDeviceByVehicle(vehicleId: string): StarlinkDevice | undefined {
    return this.devices.find((d) => d.enabled && d.vehicleId === vehicleId);
  }

  listDevices(companyName?: string | null): StarlinkDevice[] {
    return this.devices.filter((d) => !companyName || d.companyName === companyName);
  }

  upsertDevice(device: StarlinkDevice): void {
    const i = this.devices.findIndex((d) => d.id === device.id);
    if (i >= 0) this.devices[i] = device;
    else this.devices.push(device);
  }

  addAssignment(row: StarlinkAssignment): void {
    this.assignments.push(row);
  }

  listAssignments(companyName?: string | null): StarlinkAssignment[] {
    return this.assignments.filter((a) => !companyName || a.companyName === companyName);
  }

  seenDuplicate(deviceId: string, cmd: string, unitRef: string): boolean {
    return this.dup.has(`${deviceId}|${cmd}|${unitRef}`);
  }

  markDuplicate(deviceId: string, cmd: string, unitRef: string): void {
    this.dup.add(`${deviceId}|${cmd}|${unitRef}`);
  }

  getLive(deviceId: string): LiveSnapshot | undefined {
    return this.live.get(deviceId);
  }

  setLive(live: LiveSnapshot): void {
    this.live.set(live.deviceId, live);
  }

  listLive(companyName?: string | null): LiveSnapshot[] {
    return [...this.live.values()].filter((l) => !companyName || l.companyName === companyName);
  }

  lastPosition(deviceId: string): PositionSample | undefined {
    const rows = this.positions.filter((p) => p.deviceId === deviceId);
    return rows[rows.length - 1];
  }

  addPosition(sample: PositionSample): void {
    this.positions.push(sample);
  }

  listPositions(vehicleId: string): PositionSample[] {
    return this.positions.filter((p) => p.vehicleId === vehicleId);
  }

  addEvent(event: GpsEventRecord): void {
    this.events.push(event);
  }

  listEvents(companyName?: string | null): GpsEventRecord[] {
    return this.events.filter((e) => !companyName || e.companyName === companyName);
  }

  addRaw(row: RawRecord): void {
    this.raw.push(row);
  }

  listRaw(): RawRecord[] {
    return this.raw;
  }

  getCanMap(vehicleId: string): Record<string, string> {
    return this.canMaps.get(vehicleId) || {};
  }

  setCanMap(vehicleId: string, map: Record<string, string>): void {
    this.canMaps.set(vehicleId, map);
  }

  prune(now = Date.now()): void {
    this.raw = this.raw.filter((r) => Date.parse(r.at) >= now - RAW_RETENTION_MS);
    this.positions = this.positions.filter((p) => Date.parse(p.at) >= now - POSITION_RETENTION_MS);
  }
}

export function seedTestDevice(
  store: InMemoryGpsStore,
  partial: Partial<StarlinkDevice> & Pick<StarlinkDevice, 'unitId' | 'vehicleId' | 'companyName'>,
): StarlinkDevice {
  const device: StarlinkDevice = {
    id: partial.id || `dev-${partial.unitId}`,
    unitId: partial.unitId,
    imei: partial.imei ?? null,
    vehicleId: partial.vehicleId,
    companyName: partial.companyName,
    enabled: partial.enabled ?? true,
    p177: partial.p177 || DEFAULT_P177,
  };
  store.upsertDevice(device);
  return device;
}
