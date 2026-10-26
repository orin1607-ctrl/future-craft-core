import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { answerFleetTurn, planFleetTurn } from './fleetConversation';

describe('fleet conversation stays read-only and off claims', () => {
  it('does not mention the claims AI function', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/features/fleet-dalia-ai/fleetConversation.ts'), 'utf8');
    expect(source.includes('help-ai-chat')).toBe(false);
    expect(source.includes('/api/ai/chat')).toBe(false);
  });

  it('plans fleet reads and blocks writes and claims', () => {
    expect(planFleetTurn('כמה רכבים יש בחברה?')).toEqual({
      kind: 'read',
      actionId: 'vehicle_status_counts',
      query: expect.any(String),
    });
    expect(planFleetTurn('פתח תקלה').kind).toBe('blocked-write');
    expect(planFleetTurn('תפתחי תביעה DAL-2026-0001').kind).toBe('outside-fleet');
    expect(planFleetTurn('ומה עם הרישיון', [
      { role: 'user', text: 'חפש רכב 12-345-67', actionId: 'search_vehicles' },
    ])).toMatchObject({ kind: 'read', actionId: 'search_vehicles' });
  });

  it('refuses a write and a driver without calling another service', async () => {
    const write = await answerFleetTurn('פתח תקלה', [], { role: 'fleet_manager', company: 'בדיקה' });
    const driver = await answerFleetTurn('כמה רכבים יש', [], { role: 'driver', company: 'בדיקה' });
    expect(write.ok).toBe(false);
    expect(write.text).toMatch(/כתיבה/);
    expect(driver.ok).toBe(false);
    expect(driver.text).toMatch(/מנהל צי/);
  });
});
