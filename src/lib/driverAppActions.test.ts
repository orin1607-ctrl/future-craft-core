import { describe, expect, it } from 'vitest';
import {
  DRIVER_APP_ACTIONS,
  collectStoredRecipients,
  conditionMatches,
  defaultActionSetting,
  emptyCompanyDriverAppConfig,
  findActionByRoute,
  isDriverRouteVisible,
  mergeActionSettings,
  safetyCriticalActions,
} from './driverAppActions';

describe('driver app action catalog', () => {
  it('covers the live driver dashboard, sidebar, mobile, and inline buttons', () => {
    const keys = DRIVER_APP_ACTIONS.map((a) => a.key);
    expect(keys).toEqual([
      'fault',
      'accident',
      'service_order',
      'emergency',
      'whatsapp_contact',
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
    expect(merged.fault.email_to_fleet_managers).toBe(true);
    expect(merged.fault.email_to_company_contact).toBe(false);
    expect(merged.fault.condition_values).toEqual(['urgent', 'critical']);
    expect(merged.emergency.email_enabled).toBe(false);
    expect(merged.expenses.email_enabled).toBe(false);
    expect(merged.whatsapp_contact.visible_to_driver).toBe(true);
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

describe('collectStoredRecipients', () => {
  it('supports multiple email and WhatsApp destinations', () => {
    const setting = {
      ...defaultActionSetting(DRIVER_APP_ACTIONS.find((a) => a.key === 'fault')!),
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
        dalia_service_enabled: true,
        contact_email: 'owner@example.com',
        contact_whatsapp: '972502222222',
      },
      dalia: { email: 'dalia@example.com', whatsapp: '972503333333' },
    });
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
      ...defaultActionSetting(DRIVER_APP_ACTIONS.find((a) => a.key === 'fault')!),
      email_enabled: true,
      email_to_dalia: true,
      whatsapp_enabled: true,
      whatsapp_to_dalia: true,
    };
    const targets = collectStoredRecipients({
      setting,
      companyConfig: { ...emptyCompanyDriverAppConfig(), dalia_service_enabled: false },
      dalia: { email: 'dalia@example.com', whatsapp: '972503333333' },
    });
    expect(targets.some((t) => t.key === 'dalia')).toBe(false);
    expect(targets.some((t) => t.key === 'fleet_managers')).toBe(true);
  });

  it('does not invent a company-contact destination when none is configured', () => {
    const setting = {
      ...defaultActionSetting(DRIVER_APP_ACTIONS.find((a) => a.key === 'fault')!),
      email_enabled: true,
      email_to_company_contact: true,
    };
    const targets = collectStoredRecipients({
      setting,
      companyConfig: emptyCompanyDriverAppConfig(),
      dalia: { email: '', whatsapp: '' },
    });
    expect(targets.some((t) => t.key === 'company_contact')).toBe(false);
  });
});

describe('conditionMatches', () => {
  it('honors by_value urgency without inventing extra conditions', () => {
    const setting = mergeActionSettings([])['fault'];
    expect(conditionMatches(setting, 'urgent')).toBe(true);
    expect(conditionMatches(setting, 'normal')).toBe(false);
    expect(conditionMatches({ ...setting, condition_mode: 'all' }, 'normal')).toBe(true);
  });
});
