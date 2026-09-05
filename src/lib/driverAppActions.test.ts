import { describe, expect, it } from 'vitest';
import {
  DRIVER_APP_ACTIONS,
  defaultActionSetting,
  findActionByRoute,
  isDriverRouteVisible,
  mergeActionSettings,
} from './driverAppActions';

describe('driver app action catalog', () => {
  it('covers the live driver dashboard and sidebar routes', () => {
    const keys = DRIVER_APP_ACTIONS.map((a) => a.key);
    expect(keys).toEqual([
      'fault',
      'accident',
      'service_order',
      'emergency',
      'expenses',
      'history',
      'work_schedule',
      'declarations',
      'handover',
      'driver_notifications',
    ]);
  });

  it('maps both work-schedule routes to one action', () => {
    expect(findActionByRoute('/driver-schedule')?.key).toBe('work_schedule');
    expect(findActionByRoute('/work-orders')?.key).toBe('work_schedule');
  });

  it('uses only real urgency values from each form', () => {
    const fault = DRIVER_APP_ACTIONS.find((a) => a.key === 'fault')!;
    expect(fault.conditions?.options.map((o) => o.value)).toEqual(['normal', 'urgent', 'critical']);
    const service = DRIVER_APP_ACTIONS.find((a) => a.key === 'service_order')!;
    expect(service.conditions?.options.map((o) => o.value)).toEqual(['normal', 'urgent']);
    expect(DRIVER_APP_ACTIONS.find((a) => a.key === 'accident')!.conditions).toBeNull();
    expect(DRIVER_APP_ACTIONS.find((a) => a.key === 'emergency')!.conditions).toBeNull();
  });
});

describe('mergeActionSettings', () => {
  it('fills defaults when a company has no saved rows', () => {
    const merged = mergeActionSettings([]);
    expect(merged.fault.visible_to_driver).toBe(true);
    expect(merged.fault.email_to_fleet_managers).toBe(true);
    expect(merged.fault.condition_values).toEqual(['urgent', 'critical']);
    expect(merged.emergency.email_enabled).toBe(false);
    expect(merged.expenses.email_enabled).toBe(false);
  });

  it('keeps company A settings from leaking into company B', () => {
    const companyA = mergeActionSettings([
      { action_key: 'fault', visible_to_driver: false, email_extra: 'a@example.com' },
    ]);
    const companyB = mergeActionSettings([]);
    expect(companyA.fault.visible_to_driver).toBe(false);
    expect(companyA.fault.email_extra).toBe('a@example.com');
    expect(companyB.fault.visible_to_driver).toBe(true);
    expect(companyB.fault.email_extra).toBe('');
  });
});

describe('isDriverRouteVisible', () => {
  it('never hides the dashboard', () => {
    const hiddenAll = mergeActionSettings(
      DRIVER_APP_ACTIONS.map((a) => ({ action_key: a.key, visible_to_driver: false })),
    );
    expect(isDriverRouteVisible('/dashboard', hiddenAll)).toBe(true);
    expect(isDriverRouteVisible('/faults', hiddenAll)).toBe(false);
    expect(isDriverRouteVisible('/unknown-route', hiddenAll)).toBe(true);
  });

  it('hides every route of a multi-route action together', () => {
    const merged = mergeActionSettings([{ action_key: 'work_schedule', visible_to_driver: false }]);
    expect(isDriverRouteVisible('/driver-schedule', merged)).toBe(false);
    expect(isDriverRouteVisible('/work-orders', merged)).toBe(false);
  });
});
