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

export function buildVehicleContextUrl(
  path: string,
  ctx: { plate: string; vehicleId?: string; action?: string },
): string {
  const q = new URLSearchParams();
  q.set('plate', ctx.plate);
  if (ctx.vehicleId) q.set('vehicleId', ctx.vehicleId);
  if (ctx.action) q.set('action', ctx.action);
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
  const locked = searchParams.get('context') === 'vehicle' || !!plate;
  return { plate, vehicleId, action, locked };
}

export function readDriverContext(searchParams: URLSearchParams) {
  const driverId = searchParams.get('driverId') || '';
  const driverName = searchParams.get('driverName') || '';
  const locked = searchParams.get('context') === 'driver' || !!driverId;
  return { driverId, driverName, locked };
}

const CONTEXT_KEYS = ['plate', 'vehicleId', 'action', 'context', 'driverId', 'driverName'];

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
