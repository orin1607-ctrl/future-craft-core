import { describe, expect, it } from 'vitest';
import { FLEET_ACTIONS, FLEET_CATEGORIES, REPORT_TYPE_LABELS, actionsForCategory } from './actionCatalog';
import { executeFleetAction } from './liveReads';
import { extractQuery, matchIntent } from './intent';
import { GARAGE_MIC, pickHebrewVoice, speakHebrew } from './speech';
import {
  PRODUCTION_PROJECT_ID,
  STAGING_PROJECT_ID,
  assertStagingReadTarget,
  guardCompany,
  isFleetDaliaAiEnabled,
} from './stagingGate';

describe('fleet dalia staging gate', () => {
  it('turns on only for the staging project', () => {
    expect(isFleetDaliaAiEnabled({ projectId: STAGING_PROJECT_ID, killed: false })).toBe(true);
    expect(isFleetDaliaAiEnabled({ projectId: PRODUCTION_PROJECT_ID, killed: false })).toBe(false);
    expect(isFleetDaliaAiEnabled({ projectId: STAGING_PROJECT_ID, killed: true })).toBe(false);
    expect(isFleetDaliaAiEnabled({ projectId: undefined, killed: false })).toBe(false);
  });

  it('refuses a production or unknown supabase url', () => {
    expect(() => assertStagingReadTarget(`https://${STAGING_PROJECT_ID}.supabase.co`)).not.toThrow();
    expect(() => assertStagingReadTarget(`https://${PRODUCTION_PROJECT_ID}.supabase.co`)).toThrow(/בדיקות/);
    expect(() => assertStagingReadTarget(undefined)).toThrow(/בדיקות/);
  });

  it('requires one company and a manager role', () => {
    expect(guardCompany('fleet_manager', '  אורן  ')).toBe('אורן');
    expect(guardCompany('super_admin', 'דליה')).toBe('דליה');
    expect(guardCompany('super_admin', null)).toBeNull();
    expect(guardCompany('fleet_manager', '')).toBeNull();
    expect(guardCompany('driver', 'אורן')).toBeNull();
    expect(guardCompany('business_customer', 'אורן')).toBeNull();
  });
});

describe('fleet dalia catalog', () => {
  it('keeps every write action disabled', () => {
    const writes = FLEET_ACTIONS.filter((action) => action.mode === 'write');
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.every((action) => action.enabled === false && action.needsConfirm)).toBe(true);
  });

  it('covers the report types that exist on the reports screen', () => {
    expect(REPORT_TYPE_LABELS).toContain('טסטים');
    expect(REPORT_TYPE_LABELS).toContain('סיכום לפי ספקים');
    expect(REPORT_TYPE_LABELS).toHaveLength(13);
  });
});

describe('fleet dalia intent', () => {
  it('maps a plate search to the vehicle read action', () => {
    const intent = matchIntent('חפש רכב 12-345-67');
    expect(intent.actionId).toBe('search_vehicles');
    expect(intent.query).toContain('12-345-67');
    expect(extractQuery('חפש נהג יוסי כהן')).toContain('יוסי');
  });

  it('answers the fleet questions from existing read actions', () => {
    expect(matchIntent('כמה רכבים יש בחברה?').actionId).toBe('vehicle_status_counts');
    expect(matchIntent('אילו רכבים צריכים טיפול?').actionId).toBe('tracking_attention');
    expect(matchIntent('אילו רישיונות נהיגה עומדים לפוג?').actionId).toBe('driver_license_watch');
    expect(matchIntent('אילו משימות פתוחות?').actionId).toBe('open_tasks');
    expect(matchIntent('הצג לי נתונים של רכב 12-345-67').actionId).toBe('search_vehicles');
    expect(matchIntent('אילו התראות דורשות טיפול?').actionId).toBe('open_alerts_screen');
  });

  it('does not treat a category name as a write', () => {
    const intent = matchIntent('רכבים');
    expect(intent.category).toBe('vehicles');
    expect(intent.actionId).toBeNull();
    expect(matchIntent('מעקב רכבים').actionId).toBe('tracking_summary');
    expect(matchIntent('מעקב נהגים').category).toBe('driver_tracking');
  });
});

describe('fleet dalia voice', () => {
  it('uses the garage microphone language and does not speak a male Hebrew voice', () => {
    expect(GARAGE_MIC).toEqual({ lang: 'he-IL', interimResults: false, maxAlternatives: 1 });
    const female = [
      { lang: 'he-IL', name: 'Microsoft David', voiceURI: 'david' },
      { lang: 'he-IL', name: 'Microsoft Hila', voiceURI: 'hila' },
    ] as SpeechSynthesisVoice[];
    expect(pickHebrewVoice(female).voice?.name).toBe('Microsoft Hila');
    const maleOnly = [{ lang: 'he-IL', name: 'Microsoft Asaf', voiceURI: 'asaf' }] as SpeechSynthesisVoice[];
    expect(speakHebrew('שלום', maleOnly).spoken).toBe(false);
    expect(speakHebrew('שלום', maleOnly).voice).toBeNull();
  });
});

describe('fleet dalia buttons and hebrew', () => {
  it('opens every real action from its category and from its Hebrew phrase', () => {
    expect(FLEET_CATEGORIES).toHaveLength(7);
    for (const category of FLEET_CATEGORIES) {
      const actions = actionsForCategory(category.id);
      if (category.id === 'chat') {
        expect(actions).toHaveLength(0);
        continue;
      }
      expect(actions.length).toBeGreaterThan(0);
      for (const action of actions) {
        expect(action.source.length).toBeGreaterThan(3);
        if (!action.enabled || action.phrases.length === 0) continue;
        expect(matchIntent(action.phrases[0]).actionId).toBe(action.id);
      }
    }
  });
});

describe('fleet dalia company isolation', () => {
  it('blocks a read when the role or the company is missing', async () => {
    const driver = await executeFleetAction('search_vehicles', '12-345-67', { role: 'driver', company: 'Staging QA' });
    const missing = await executeFleetAction('report_counts', '', { role: 'super_admin', company: null });
    const write = await executeFleetAction('vehicle_quick_fault', '', { role: 'fleet_manager', company: 'Staging QA' });
    expect(driver.ok).toBe(false);
    expect(driver.text).toMatch(/מנהל צי/);
    expect(missing.ok).toBe(false);
    expect(write.ok).toBe(false);
    expect(write.text).toMatch(/כבויה/);
  });
});
