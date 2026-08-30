import type { DaliaRole } from '../fleetosTypes';

export type MotionState = 'driving' | 'stopped' | null;
export type GpsFreshness = 'live' | 'stale' | 'none';
export type OdometerDecision = 'apply' | 'reject_decrease' | 'reject_jump' | 'skip';

export interface StarlinkDevice {
  id: string;
  unitId: string;
  imei: string | null;
  vehicleId: string;
  companyName: string;
  enabled: boolean;
  p177: string;
}

export interface StarlinkAssignment {
  id: string;
  deviceId: string;
  vehicleId: string;
  companyName: string;
  action: 'assign' | 'unassign' | 'replace';
  at: string;
  previousVehicleId?: string | null;
}

export interface ParsedStarlinkMessage {
  raw: string;
  header: 'SLU' | 'SRV';
  unitId: string;
  cmd: string;
  unitRef: string;
  dataFields: string[];
  checksum: string;
  checksumOk: boolean;
  tags: Record<string, string | null>;
  unknownTags: Record<string, string>;
}

export interface LiveSnapshot {
  deviceId: string;
  vehicleId: string;
  companyName: string;
  unitId: string;
  imei: string | null;
  lastSeen: string;
  lastSeq: string;
  lastCmd: string;
  gpsAt: string | null;
  gpsAgeSec: number | null;
  freshness: GpsFreshness;
  lat: number | null;
  lng: number | null;
  speedKnots: number | null;
  speedKmh: number | null;
  heading: number | null;
  ignition: boolean | null;
  engine: boolean | null;
  motion: MotionState;
  odometer: number | null;
  odometerDecision: OdometerDecision;
  vehicleVoltage: number | null;
  backupVoltage: number | null;
  rpm: number | null;
  engineHours: number | null;
  fuel: number | null;
  driverId: string | null;
  canRaw: Record<string, string>;
  canMapped: Record<string, { label: string; value: string }>;
  tags: Record<string, string | null>;
}

export interface PositionSample {
  id: string;
  deviceId: string;
  vehicleId: string;
  companyName: string;
  lat: number;
  lng: number;
  speedKmh: number | null;
  heading: number | null;
  at: string;
}

export interface GpsEventRecord {
  id: string;
  deviceId: string;
  vehicleId: string;
  companyName: string;
  eid: string;
  key: string;
  labelHe: string;
  severity: 'critical' | 'warning' | 'info';
  at: string;
  tags: Record<string, string | null>;
}

export interface RawRecord {
  id: string;
  deviceId: string | null;
  companyName: string | null;
  at: string;
  raw: string;
  reason: string;
}

export interface IngestResult {
  accepted: boolean;
  reason:
    | 'ok'
    | 'checksum'
    | 'partial'
    | 'malformed'
    | 'unknown_device'
    | 'disabled'
    | 'duplicate'
    | 'empty';
  ack: string | null;
  live: LiveSnapshot | null;
  sampled: boolean;
  event: GpsEventRecord | null;
  /** Always empty — ERM must not write Dalia business tables. */
  businessWrites: string[];
}

export function canManageGpsDevices(role: DaliaRole): boolean {
  return role === 'super_admin' || role === 'fleet_admin';
}

export const STALE_GPS_SECONDS = 5 * 60;
export const ODOMETER_JUMP_KM = 100;
export const SAMPLE_MIN_SECONDS = 30;
export const SAMPLE_DISTANCE_M = 100;
export const SAMPLE_HEADING_DEG = 25;
export const RAW_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
export const POSITION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const MAX_MESSAGE_BYTES = 1024;
export const NO_COMM_SECONDS = 15 * 60;
