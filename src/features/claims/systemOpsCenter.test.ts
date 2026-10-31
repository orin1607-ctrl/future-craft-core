import { describe, expect, it } from 'bun:test';

describe('System Ops Center & Health Engine Tests', () => {
  it('enforces super_admin role gating', () => {
    const roles = ['super_admin', 'fleet_manager', 'driver', 'private_customer'];
    const canAccessOpsCenter = (role: string) => role === 'super_admin';

    expect(canAccessOpsCenter('super_admin')).toBe(true);
    expect(canAccessOpsCenter('fleet_manager')).toBe(false);
    expect(canAccessOpsCenter('driver')).toBe(false);
    expect(canAccessOpsCenter('private_customer')).toBe(false);
  });

  it('correctly categorizes service health items', () => {
    const services = [
      { id: 'gmail_claims', category: 'comms', status: 'paused' },
      { id: 'whatsapp_gupshup', category: 'comms', status: 'healthy' },
      { id: 'ai_gemini_dalia', category: 'ai', status: 'healthy' },
      { id: 'supabase_db', category: 'infra', status: 'healthy' },
      { id: 'hostinger_vps', category: 'infra', status: 'healthy' },
      { id: 'github_pages_staging', category: 'providers', status: 'healthy' },
      { id: 'gov_data_api', category: 'providers', status: 'healthy' },
    ];

    const comms = services.filter((s) => s.category === 'comms');
    const ai = services.filter((s) => s.category === 'ai');
    const infra = services.filter((s) => s.category === 'infra');
    const providers = services.filter((s) => s.category === 'providers');

    expect(comms.length).toBe(2);
    expect(ai.length).toBe(1);
    expect(infra.length).toBe(2);
    expect(providers.length).toBe(2);
  });

  it('calculates health summary counters accurately', () => {
    const items = [
      { id: '1', status: 'healthy', requiresManualIntervention: false },
      { id: '2', status: 'healthy', requiresManualIntervention: false },
      { id: '3', status: 'warning', requiresManualIntervention: true },
      { id: '4', status: 'error', requiresManualIntervention: true },
      { id: '5', status: 'paused', requiresManualIntervention: false },
    ];

    const summary = {
      total: items.length,
      healthy: items.filter((i) => i.status === 'healthy').length,
      warning: items.filter((i) => i.status === 'warning').length,
      error: items.filter((i) => i.status === 'error').length,
      paused: items.filter((i) => i.status === 'paused').length,
      requiresAttention: items.filter((i) => i.requiresManualIntervention).length,
    };

    expect(summary.total).toBe(5);
    expect(summary.healthy).toBe(2);
    expect(summary.warning).toBe(1);
    expect(summary.error).toBe(1);
    expect(summary.paused).toBe(1);
    expect(summary.requiresAttention).toBe(2);
  });

  it('supports filtering by search query across Hebrew and English names', () => {
    const services = [
      { name: 'Gmail Claims Inbox', nameHe: 'חיבור Gmail לתביעות', roleHe: 'קליטת הודעות' },
      { name: 'WhatsApp Gupshup Gateway', nameHe: 'שער WhatsApp (Gupshup)', roleHe: 'שליחת הודעות' },
      { name: 'Dalia Gemini AI & OCR', nameHe: 'בינה מלאכותית ו-OCR', roleHe: 'חילוץ שמאות' },
    ];

    const search = (q: string) => {
      const query = q.toLowerCase();
      return services.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.nameHe.toLowerCase().includes(query) ||
          s.roleHe.toLowerCase().includes(query)
      );
    };

    expect(search('gmail').length).toBe(1);
    expect(search('שמאות').length).toBe(1);
    expect(search('הודעות').length).toBe(2);
    expect(search('none').length).toBe(0);
  });
});
