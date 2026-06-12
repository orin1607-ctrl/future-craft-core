import { useCallback, useMemo } from 'react';

import { useSearchParams } from 'react-router-dom';



export function normalizePlate(plate: string): string {

  return plate.replace(/[-\s]/g, '').toUpperCase();

}



export function plateMatches(

  recordPlate: string | null | undefined,

  contextPlate: string | null | undefined,

): boolean {

  if (!recordPlate || !contextPlate) return false;

  const a = normalizePlate(recordPlate);

  const b = normalizePlate(contextPlate);

  return a.includes(b) || b.includes(a);

}



/** Deep-link back to vehicle hub card on /vehicles */

export function buildVehicleHubUrl(vehicleId: string): string {

  const q = new URLSearchParams();

  q.set('vehicleId', vehicleId);

  q.set('view', 'hub');

  return `/vehicles?${q.toString()}`;

}



const FLEETOS_HUB_PENDING_KEY = 'dalia_fleetos_hub_pending_v1';

const FLEETOS_HUB_NAV_KEY = 'dalia_fleetos_hub_nav_v1';

const FLEETOS_HUB_TTL_MS = 120_000;



type FleetOSHubPending = {

  vehicleId?: string;

  vehicle?: Record<string, unknown>;

  at?: number;

};



function readFleetOSHubPending(): FleetOSHubPending | null {

  try {

    const raw = sessionStorage.getItem(FLEETOS_HUB_PENDING_KEY);

    if (!raw) return null;

    return JSON.parse(raw) as FleetOSHubPending;

  } catch {

    return null;

  }

}



function isValidFleetOSHubPending(parsed: FleetOSHubPending, expectedVehicleId: string): boolean {

  if (parsed.vehicleId !== expectedVehicleId) return false;

  if (!parsed.vehicle || typeof parsed.at !== 'number') return false;

  if (Date.now() - parsed.at > FLEETOS_HUB_TTL_MS) return false;

  return true;

}



/** FleetOS → /vehicles hub: persist row when router state may be lost on route change. */

export function stashFleetOSHubVehicle(vehicleId: string, vehicle: Record<string, unknown>): void {

  try {

    sessionStorage.setItem(

      FLEETOS_HUB_PENDING_KEY,

      JSON.stringify({ vehicleId, vehicle, at: Date.now() }),

    );

  } catch {

    /* ignore quota / private mode */

  }

}



/** Read pending hub row without removing (safe for React Strict Mode double effects). */

export function peekFleetOSHubVehicle(expectedVehicleId: string): Record<string, unknown> | null {

  const parsed = readFleetOSHubPending();

  if (!parsed || !isValidFleetOSHubPending(parsed, expectedVehicleId)) return null;

  return parsed.vehicle ?? null;

}



/** @deprecated Prefer peek + clearFleetOSHubPending after hub opens successfully. */

export function consumeFleetOSHubVehicle(expectedVehicleId: string): Record<string, unknown> | null {

  const row = peekFleetOSHubVehicle(expectedVehicleId);

  if (row) clearFleetOSHubPending();

  return row;

}



export function clearFleetOSHubPending(): void {

  try {

    sessionStorage.removeItem(FLEETOS_HUB_PENDING_KEY);

  } catch {

    /* ignore */

  }

}



export function markFleetOSHubNavigation(vehicleId: string, returnPath = '/fleetos-ai'): void {

  try {

    sessionStorage.setItem(FLEETOS_HUB_NAV_KEY, JSON.stringify({ vehicleId, returnPath, at: Date.now() }));

  } catch {

    /* ignore */

  }

}



export function clearFleetOSHubNavigation(): void {

  try {

    sessionStorage.removeItem(FLEETOS_HUB_NAV_KEY);

  } catch {

    /* ignore */

  }

}



export function isFleetOSHubNavigationActive(vehicleId?: string): boolean {

  try {

    const raw = sessionStorage.getItem(FLEETOS_HUB_NAV_KEY);

    if (!raw) return false;

    const parsed = JSON.parse(raw) as { vehicleId?: string; at?: number };

    if (typeof parsed.at !== 'number' || Date.now() - parsed.at > FLEETOS_HUB_TTL_MS) return false;

    if (vehicleId && parsed.vehicleId !== vehicleId) return false;

    return true;

  } catch {

    return false;

  }

}



export function getFleetOSReturnPath(): string | null {

  try {

    const raw = sessionStorage.getItem(FLEETOS_HUB_NAV_KEY);

    if (!raw) return null;

    const parsed = JSON.parse(raw) as { returnPath?: string; at?: number };

    if (typeof parsed.at !== 'number' || Date.now() - parsed.at > FLEETOS_HUB_TTL_MS) return null;

    return parsed.returnPath || '/fleetos-ai';

  } catch {

    return null;

  }

}



export function buildDriverDashboardUrl(ctx: { driverId: string; driverName?: string }): string {

  const q = new URLSearchParams();

  q.set('driverId', ctx.driverId);

  if (ctx.driverName) q.set('driverName', ctx.driverName);

  q.set('context', 'driver');

  return `/dashboard?${q.toString()}`;

}



export type VehicleContextParams = {
  plate: string;
  vehicleId?: string;
  action?: string;
  tab?: string;
  company?: string;
  internal?: string;
  driver?: string;
};

export function buildVehicleContextUrl(path: string, ctx: VehicleContextParams): string {
  const q = new URLSearchParams();
  q.set('plate', ctx.plate);
  if (ctx.vehicleId) q.set('vehicleId', ctx.vehicleId);
  if (ctx.action) q.set('action', ctx.action);
  if (ctx.tab) q.set('tab', ctx.tab);
  if (ctx.company) q.set('company', ctx.company);
  if (ctx.internal) q.set('internal', ctx.internal);
  if (ctx.driver) q.set('driver', ctx.driver);
  q.set('context', 'vehicle');
  return `${path}?${q.toString()}`;
}



export function buildDriverContextUrl(

  path: string,

  ctx: { driverId: string; driverName?: string },

): string {

  const q = new URLSearchParams();

  q.set('driverId', ctx.driverId);

  if (ctx.driverName) q.set('driverName', ctx.driverName);

  q.set('context', 'driver');

  return `${path}?${q.toString()}`;

}



export function readVehicleContext(searchParams: URLSearchParams) {
  const plate = searchParams.get('plate') || '';
  const vehicleId = searchParams.get('vehicleId') || '';
  const action = searchParams.get('action') || '';
  const company = searchParams.get('company') || '';
  const internal = searchParams.get('internal') || '';
  const driver = searchParams.get('driver') || '';
  const locked = searchParams.get('context') === 'vehicle';
  return { plate, vehicleId, action, company, internal, driver, locked, fromHub: locked };
}



export function readDriverContext(searchParams: URLSearchParams) {

  const driverId = searchParams.get('driverId') || '';

  const driverName = searchParams.get('driverName') || '';

  const locked = searchParams.get('context') === 'driver' || !!driverId;

  return { driverId, driverName, locked };

}



const CONTEXT_KEYS = [
  'plate',
  'vehicleId',
  'action',
  'context',
  'driverId',
  'driverName',
  'company',
  'internal',
  'driver',
];



export function useVehicleUrlContext() {

  const [searchParams, setSearchParams] = useSearchParams();

  const ctx = useMemo(() => readVehicleContext(searchParams), [searchParams]);

  const clearContext = useCallback(() => {

    const next = new URLSearchParams(searchParams);

    CONTEXT_KEYS.forEach((k) => next.delete(k));

    setSearchParams(next, { replace: true });

  }, [searchParams, setSearchParams]);

  return { ...ctx, clearContext };

}



/** True when page was opened from vehicle hub (scoped context). */

export function isVehicleScopedContext(ctx: {

  locked?: boolean;

  plate?: string;

  vehicleId?: string;

}): boolean {

  return !!(ctx.locked && ctx.plate);

}



export function useDriverUrlContext() {

  const [searchParams, setSearchParams] = useSearchParams();

  const ctx = useMemo(() => readDriverContext(searchParams), [searchParams]);

  const clearContext = useCallback(() => {

    const next = new URLSearchParams(searchParams);

    CONTEXT_KEYS.forEach((k) => next.delete(k));

    setSearchParams(next, { replace: true });

  }, [searchParams, setSearchParams]);

  return { ...ctx, clearContext };

}


