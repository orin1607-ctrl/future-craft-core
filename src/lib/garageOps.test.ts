import { describe, expect, it } from 'vitest';
import { ROLE_MAP, USER_TYPE_LABELS } from './userManagementSchema';
import { canAccessRoute } from './routeAccess';
import {
  GARAGE_OPS_CORE_MODULE_PATHS,
  GARAGE_OPS_JOB_TITLE,
  GARAGE_OPS_LABEL,
  effectiveHiddenButtonsForUser,
  fleetFoundationLabel,
  garageOpsDefaultHiddenButtons,
  isGarageOpsJobTitle,
} from './garageOps';

describe('garage ops foundation (existing fleet_manager)', () => {
  it('does not add a new user type or app_role', () => {
    expect(ROLE_MAP.fleet_manager).toBe('fleet_manager');
    expect(USER_TYPE_LABELS.fleet_manager).toBe('מנהל צי רכב');
    expect((USER_TYPE_LABELS as Record<string, string>).garage_manager).toBeUndefined();
    expect((ROLE_MAP as Record<string, string>).garage_manager).toBeUndefined();
  });

  it('marks garage-ops only via the existing job_title sentinel', () => {
    expect(isGarageOpsJobTitle(GARAGE_OPS_JOB_TITLE)).toBe(true);
    expect(isGarageOpsJobTitle('מנהל צי')).toBe(false);
    expect(isGarageOpsJobTitle('garage_photographer')).toBe(false);
    expect(fleetFoundationLabel('garage_ops')).toBe(GARAGE_OPS_LABEL);
    expect(fleetFoundationLabel('fleet')).toBe('מנהל צי רכב');
  });

  it('keeps regular fleet_manager on company hidden_buttons only', () => {
    expect(effectiveHiddenButtonsForUser({
      garageOps: false,
      companyHidden: [],
      allManageablePaths: ['/vehicles', '/garage-management', '/claims', '/reports'],
    })).toEqual([]);
    expect(effectiveHiddenButtonsForUser({
      garageOps: false,
      companyHidden: ['/reports'],
      allManageablePaths: ['/vehicles', '/reports'],
    })).toEqual(['/reports']);
  });

  it('defaults garage-ops to garage + claims + reports when the company list is empty', () => {
    const hidden = garageOpsDefaultHiddenButtons([
      '/dashboard',
      '/vehicles',
      '/drivers',
      '/garage-management',
      '/claims',
      '/reports',
      '/fleet-managers',
    ]);
    expect(hidden.sort()).toEqual(['/drivers', '/fleet-managers', '/vehicles']);
    expect(GARAGE_OPS_CORE_MODULE_PATHS).toEqual(['/garage-management', '/claims', '/reports']);
    expect(effectiveHiddenButtonsForUser({
      garageOps: true,
      companyHidden: [],
      allManageablePaths: ['/vehicles', '/garage-management', '/claims', '/reports'],
    })).toEqual(['/vehicles']);
  });

  it('lets company hidden_buttons override the garage-ops default without changing regular fleet', () => {
    expect(effectiveHiddenButtonsForUser({
      garageOps: true,
      companyHidden: ['/claims', '/vehicles'],
      allManageablePaths: ['/vehicles', '/garage-management', '/claims', '/reports'],
    })).toEqual(['/claims', '/vehicles']);
  });

  it('opens /garage-management only for garage-ops fleet_manager, not every fleet_manager', () => {
    expect(canAccessRoute('/garage-management', 'fleet_manager')).toBe(false);
    expect(canAccessRoute('/garage-management', 'fleet_manager', { garageOps: true })).toBe(true);
    expect(canAccessRoute('/garage-management/case-1', 'fleet_manager', { garageOps: true })).toBe(true);
    expect(canAccessRoute('/garage-management', 'driver', { garageOps: true })).toBe(false);
    expect(canAccessRoute('/garage-management', 'super_admin')).toBe(true);
    expect(canAccessRoute('/claims', 'fleet_manager', { garageOps: true })).toBe(false);
    expect(canAccessRoute('/claims', 'fleet_manager', { garageOps: true, hasClaimsAccess: true })).toBe(true);
  });
});
