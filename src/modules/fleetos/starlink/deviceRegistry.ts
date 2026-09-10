import type { StarlinkAssignment, StarlinkDevice } from './types';

export type AssignFail =
  | 'duplicate_device'
  | 'duplicate_vehicle'
  | 'company_mismatch'
  | 'missing_id'
  | 'same_device';

export function normalizeUnitKey(unitId: string | null | undefined, imei?: string | null): string {
  const u = (unitId || '').trim().toUpperCase();
  const i = (imei || '').trim();
  return u || i;
}

export function planAssignDevice(input: {
  devices: StarlinkDevice[];
  vehicleId: string;
  companyName: string;
  unitId: string;
  imei?: string | null;
  p177: string;
  nowIso: string;
}): { ok: true; device: StarlinkDevice; history: StarlinkAssignment } | { ok: false; reason: AssignFail } {
  const unitKey = normalizeUnitKey(input.unitId, input.imei);
  if (!unitKey || !input.vehicleId) return { ok: false, reason: 'missing_id' };

  const active = input.devices.filter((d) => d.enabled);
  if (active.some((d) => d.vehicleId === input.vehicleId)) {
    return { ok: false, reason: 'duplicate_vehicle' };
  }
  if (
    active.some(
      (d) =>
        normalizeUnitKey(d.unitId, d.imei) === unitKey ||
        (input.imei && d.imei && d.imei === input.imei),
    )
  ) {
    return { ok: false, reason: 'duplicate_device' };
  }

  const device: StarlinkDevice = {
    id: `dev-${unitKey}`,
    unitId: (input.unitId || '').trim().toUpperCase() || unitKey,
    imei: input.imei?.trim() || null,
    vehicleId: input.vehicleId,
    companyName: input.companyName,
    enabled: true,
    p177: input.p177,
  };
  return {
    ok: true,
    device,
    history: {
      id: `asg-${device.id}-${Date.parse(input.nowIso)}`,
      deviceId: device.id,
      vehicleId: input.vehicleId,
      companyName: input.companyName,
      action: 'assign',
      at: input.nowIso,
    },
  };
}

export function planUnassignDevice(
  device: StarlinkDevice,
  nowIso: string,
): { device: StarlinkDevice; history: StarlinkAssignment } {
  return {
    device: { ...device, enabled: false },
    history: {
      id: `asg-${device.id}-off-${Date.parse(nowIso)}`,
      deviceId: device.id,
      vehicleId: device.vehicleId,
      companyName: device.companyName,
      action: 'unassign',
      at: nowIso,
    },
  };
}

export function planReplaceDevice(input: {
  devices: StarlinkDevice[];
  vehicleId: string;
  companyName: string;
  unitId: string;
  imei?: string | null;
  p177: string;
  nowIso: string;
}):
  | {
      ok: true;
      unassigned: StarlinkDevice | null;
      device: StarlinkDevice;
      history: StarlinkAssignment[];
    }
  | { ok: false; reason: AssignFail } {
  const current = input.devices.find((d) => d.enabled && d.vehicleId === input.vehicleId) || null;
  const rest = input.devices.filter((d) => d !== current);
  const planned = planAssignDevice({ ...input, devices: rest });
  if (!planned.ok) return planned;
  const history: StarlinkAssignment[] = [];
  let unassigned: StarlinkDevice | null = null;
  if (current) {
    if (normalizeUnitKey(current.unitId, current.imei) === normalizeUnitKey(input.unitId, input.imei)) {
      return { ok: false, reason: 'same_device' };
    }
    const u = planUnassignDevice(current, input.nowIso);
    unassigned = u.device;
    history.push(u.history);
  }
  history.push({
    ...planned.history,
    action: 'replace',
    previousVehicleId: current?.vehicleId ?? null,
  });
  return { ok: true, unassigned, device: planned.device, history };
}

export function assertSameCompany(vehicleCompany: string, actorCompany: string | null, isSuperAdmin: boolean): boolean {
  if (isSuperAdmin) return true;
  if (!actorCompany) return false;
  return vehicleCompany === actorCompany;
}
