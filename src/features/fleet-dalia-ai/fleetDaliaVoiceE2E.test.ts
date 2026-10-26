import { describe, expect, it, vi } from 'vitest';
import { FLEET_ACTIONS, getFleetAction } from './actionCatalog';
import { extractQuery, matchIntent } from './intent';
import { executeFleetAction } from './liveReads';
import { planFleetTurn } from './fleetConversation';
import {
  CONTINUOUS_MIC_CONFIG,
  cleanSpokenText,
  pickHebrewVoice,
  speakHebrew,
  stopSpeaking,
} from './speech';

describe('Dalia AI Voice & Barge-in capabilities', () => {
  it('cleans spoken text so TTS does not speak raw markdown, tags, or URLs', () => {
    const raw = 'נמצאו 2 רכבים: [[nav:/vehicles]] • 12-345-67 (טויוטה) **בטיפול** http://example.com';
    const cleaned = cleanSpokenText(raw);
    expect(cleaned).not.toContain('[[nav:');
    expect(cleaned).not.toContain('http://');
    expect(cleaned).not.toContain('**');
    expect(cleaned).toContain('נמצאו 2 רכבים');
    expect(cleaned).toContain('12-345-67');
  });

  it('supports continuous voice microphone configuration', () => {
    expect(CONTINUOUS_MIC_CONFIG.lang).toBe('he-IL');
    expect(CONTINUOUS_MIC_CONFIG.continuous).toBe(true);
    expect(CONTINUOUS_MIC_CONFIG.interimResults).toBe(true);
  });

  it('stops speaking immediately on barge-in / interruption', () => {
    const cancelSpy = vi.fn();
    (global as any).speechSynthesis = {
      cancel: cancelSpy,
      speak: vi.fn(),
      getVoices: () => [],
    };

    stopSpeaking();
    expect(cancelSpy).toHaveBeenCalled();
  });

  it('speaks with Hebrew female voice when available and can fallback if allowed', () => {
    const voices = [
      { lang: 'he-IL', name: 'Microsoft Hila Online', voiceURI: 'hila' },
      { lang: 'he-IL', name: 'Microsoft Asaf Online', voiceURI: 'asaf' },
      { lang: 'en-US', name: 'David', voiceURI: 'david' },
    ] as SpeechSynthesisVoice[];

    const pick = pickHebrewVoice(voices);
    expect(pick.female).toBe(true);
    expect(pick.voice?.name).toBe('Microsoft Hila Online');

    const maleOnly = [{ lang: 'he-IL', name: 'Microsoft Asaf Online', voiceURI: 'asaf' }] as SpeechSynthesisVoice[];
    const fallbackPick = pickHebrewVoice(maleOnly, true);
    expect(fallbackPick.voice?.name).toBe('Microsoft Asaf Online');
  });
});

describe('Dalia AI Fleet Modules and Intent Resolution', () => {
  it('correctly maps user questions to real fleet actions', () => {
    // 1. Vehicles needing treatment this month
    const treatmentIntent = matchIntent('איזה רכבים צריכים טיפול החודש?');
    expect(treatmentIntent.actionId).toBe('vehicles_treatment_soon');

    // 2. Driver licenses expiring
    const licenseIntent = matchIntent('אילו רישיונות נהיגה עומדים לפוג?');
    expect(licenseIntent.actionId).toBe('driver_license_watch');

    // 3. Open vehicle card by plate
    const vehicleIntent = matchIntent('תפתח לי את הכרטיס של רכב 12-345-67');
    expect(vehicleIntent.actionId).toBe('search_vehicles');
    expect(vehicleIntent.query).toContain('12-345-67');

    // 4. Drivers with missing documents
    const missingDocsIntent = matchIntent('תציג לי את הנהגים שיש להם מסמכים חסרים');
    expect(missingDocsIntent.actionId).toBe('drivers_missing_documents');

    // 5. Untreated vehicles report
    const untreatedIntent = matchIntent('תכין לי דוח על רכבים שלא טופלו');
    expect(untreatedIntent.actionId).toBe('report_untreated_vehicles');

    // 6. Navigation to tasks / faults / accidents
    expect(matchIntent('פתח תקלות').actionId).toBe('open_faults');
    expect(matchIntent('פתח תאונות').actionId).toBe('open_accidents');
    expect(matchIntent('פתח הזמנות שירות').actionId).toBe('open_service_orders');
    expect(matchIntent('פתח מסמכים').actionId).toBe('open_documents_screen');
    expect(matchIntent('פתח מעקב נהגים').actionId).toBe('open_driver_tracking');
  });

  it('carries over conversation context across turns', () => {
    const history = [
      { role: 'user' as const, text: 'חפש רכב 12-345-67', actionId: 'search_vehicles' },
      { role: 'assistant' as const, text: 'נמצא רכב 12-345-67 טויוטה' },
    ];

    const followUpPlan = planFleetTurn('ומה הסטטוס שלו?', history);
    expect(followUpPlan).toMatchObject({
      kind: 'read',
      actionId: 'search_vehicles',
    });
  });

  it('enforces multi-tenant isolation and blocks requests without company scope', async () => {
    const res = await executeFleetAction('vehicles_treatment_soon', '', {
      role: 'fleet_manager',
      company: null,
    });
    expect(res.ok).toBe(false);
    expect(res.text).toContain('לבחור חברה');
  });

  it('blocks driver role from accessing manager fleet actions', async () => {
    const res = await executeFleetAction('report_untreated_vehicles', '', {
      role: 'driver',
      company: 'בדיקה',
    });
    expect(res.ok).toBe(false);
    expect(res.text).toContain('מנהל צי');
  });
});
