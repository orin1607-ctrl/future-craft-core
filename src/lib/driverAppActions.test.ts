import { describe, expect, it } from 'vitest';
import {
  DRIVER_APP_ACTIONS,
  collectStoredRecipients,
  conditionMatches,
  defaultActionSetting,
  emptyCompanyDriverAppConfig,
  findActionByRoute,
  isDriverRouteVisible,
  isVisibilityAction,
  mergeActionSettings,
  resolveDriverEventKey,
  safetyCriticalActions,
} from './driverAppActions';

describe('driver app action catalog', () => {
  it('covers driver buttons plus routing-only urgent fault', () => {
    const keys = DRIVER_APP_ACTIONS.map((a) => a.key);
    expect(keys).toEqual([
      'fault',
      'fault_urgent',
      'accident',
      'service_order',
      'emergency',
      'whatsapp_contact',
      'expenses',
      'history',
      'work_schedule',
      'documents',
      'odometer',
      'declarations',
      'handover',
      'driver_notifications',
    ]);
    expect(isVisibilityAction(DRIVER_APP_ACTIONS.find((a) => a.key === 'fault')!)).toBe(true);
    expect(isVisibilityAction(DRIVER_APP_ACTIONS.find((a) => a.key === 'fault_urgent')!)).toBe(false);
  });

  it('maps both work-schedule routes to one action', () => {
    expect(findActionByRoute('/driver-schedule')?.key).toBe('work_schedule');
    expect(findActionByRoute('/work-orders')?.key).toBe('work_schedule');
    expect(findActionByRoute('/odometer')?.key).toBe('odometer');
    expect(findActionByRoute('/documents')?.key).toBe('documents');
  });

  it('routes urgent faults to the dedicated notification profile', () => {
    expect(resolveDriverEventKey('fault', 'normal')).toBe('fault');
    expect(resolveDriverEventKey('fault', 'urgent')).toBe('fault_urgent');
    expect(resolveDriverEventKey('fault', 'critical')).toBe('fault_urgent');
    expect(resolveDriverEventKey('accident')).toBe('accident');
  });

  it('marks emergency contact surfaces as safety-critical without blocking hide', () => {
    const criticalKeys = safetyCriticalActions().map((a) => a.key);
    expect(criticalKeys).toEqual(['emergency', 'whatsapp_contact']);
    expect(DRIVER_APP_ACTIONS.find((a) => a.key === 'emergency')!.safetyWarning).toContain('חירום');
    expect(defaultActionSetting(DRIVER_APP_ACTIONS.find((a) => a.key === 'emergency')!).visible_to_driver).toBe(true);
  });
});

describe('mergeActionSettings', () => {
  it('fills defaults when a company has no saved rows', () => {
    const merged = mergeActionSettings([]);
    expect(merged.fault.visible_to_driver).toBe(true);
    expect(merged.fault.in_app_to_fleet_managers).toBe(true);
    expect(merged.fault.email_enabled).toBe(false);
    expect(merged.fault_urgent.email_to_fleet_managers).toBe(true);
    expect(merged.emergency.in_app_enabled).toBe(true);
    expect(merged.expenses.in_app_to_fleet_managers).toBe(true);
    expect(merged.whatsapp_contact.visible_to_driver).toBe(true);
    expect(merged.odometer.visible_to_driver).toBe(true);
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
    expect(isDriverRouteVisible('/odometer', hiddenAll)).toBe(false);
    expect(isDriverRouteVisible('/unknown-route', hiddenAll)).toBe(true);
  });

  it('hides every route of a multi-route action together', () => {
    const merged = mergeActionSettings([{ action_key: 'work_schedule', visible_to_driver: false }]);
    expect(isDriverRouteVisible('/driver-schedule', merged)).toBe(false);
    expect(isDriverRouteVisible('/work-orders', merged)).toBe(false);
  });
});

describe('collectStoredRecipients', () => {
  it('supports in-app, email and WhatsApp destinations', () => {
    const setting = {
      ...defaultActionSetting(DRIVER_APP_ACTIONS.find((a) => a.key === 'accident')!),
      in_app_enabled: true,
      in_app_to_fleet_managers: true,
      in_app_to_company_contact: true,
      email_enabled: true,
      email_to_fleet_managers: true,
      email_to_company_contact: true,
      email_to_dalia: true,
      email_extra: 'extra@example.com',
      whatsapp_enabled: true,
      whatsapp_to_fleet_managers: true,
      whatsapp_to_company_contact: true,
      whatsapp_to_dalia: true,
      whatsapp_extra: '972501111111',
    };
    const targets = collectStoredRecipients({
      setting,
      companyConfig: {
        ...emptyCompanyDriverAppConfig(),
        dalia_service_enabled: true,
        contact_email: 'owner@example.com',
        contact_whatsapp: '972502222222',
      },
      dalia: { contact_name: 'דליה', email: 'dalia@example.com', whatsapp: '972503333333', phone: '03-0000000' },
    });
    expect(targets.filter((t) => t.channel === 'in_app').map((t) => t.key)).toEqual([
      'fleet_managers',
      'company_contact',
    ]);
    expect(targets.filter((t) => t.channel === 'email').map((t) => t.key)).toEqual([
      'fleet_managers',
      'company_contact',
      'dalia',
      'extra',
    ]);
    expect(targets.filter((t) => t.channel === 'whatsapp').map((t) => t.key)).toEqual([
      'fleet_managers',
      'company_contact',
      'dalia',
      'extra',
    ]);
  });

  it('does not target Dalia when the company Dalia service is OFF', () => {
    const setting = {
      ...defaultActionSetting(DRIVER_APP_ACTIONS.find((a) => a.key === 'accident')!),
      email_enabled: true,
      email_to_dalia: true,
      whatsapp_enabled: true,
      whatsapp_to_dalia: true,
    };
    const targets = collectStoredRecipients({
      setting,
      companyConfig: { ...emptyCompanyDriverAppConfig(), dalia_service_enabled: false },
      dalia: { contact_name: '', email: 'dalia@example.com', whatsapp: '972503333333', phone: '' },
    });
    expect(targets.some((t) => t.key === 'dalia')).toBe(false);
    expect(targets.some((t) => t.key === 'fleet_managers')).toBe(true);
  });

  it('does not invent a company-contact destination when none is configured', () => {
    const setting = {
      ...defaultActionSetting(DRIVER_APP_ACTIONS.find((a) => a.key === 'accident')!),
      email_enabled: true,
      email_to_company_contact: true,
    };
    const targets = collectStoredRecipients({
      setting,
      companyConfig: emptyCompanyDriverAppConfig(),
      dalia: { contact_name: '', email: '', whatsapp: '', phone: '' },
    });
    expect(targets.some((t) => t.key === 'company_contact' && t.channel === 'email')).toBe(false);
  });
});

describe('conditionMatches', () => {
  it('defaults fault routing to all values after the urgent split', () => {
    const setting = mergeActionSettings([])['fault'];
    expect(conditionMatches(setting, 'normal')).toBe(true);
    expect(conditionMatches(setting, 'urgent')).toBe(true);
  });
});
