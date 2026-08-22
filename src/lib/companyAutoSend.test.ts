import { describe, expect, it } from 'vitest';
import {
  applyAutomaticSendGates,
  companyAutoSendConfigKey,
  DEFAULT_COMPANY_AUTO_SEND,
  normalizeCompanyAutoSend,
} from './companyAutoSend';

describe('companyAutoSend', () => {
  it('defaults missing config to automatic ON', () => {
    expect(normalizeCompanyAutoSend(null)).toEqual(DEFAULT_COMPANY_AUTO_SEND);
    expect(normalizeCompanyAutoSend({})).toEqual(DEFAULT_COMPANY_AUTO_SEND);
  });

  it('treats explicit false as OFF', () => {
    expect(normalizeCompanyAutoSend({ emailAutomatic: false, whatsappAutomatic: false })).toEqual({
      emailAutomatic: false,
      whatsappAutomatic: false,
    });
  });

  it('keeps in-app alerts on when automatic email/whatsapp are off', () => {
    const gated = applyAutomaticSendGates(
      { email: true, whatsapp: true, inApp: true },
      { emailAutomatic: false, whatsappAutomatic: false },
    );
    expect(gated).toEqual({ email: false, whatsapp: false, inApp: true });
  });

  it('does not invent automatic send when the channel was already off', () => {
    const gated = applyAutomaticSendGates(
      { email: false, whatsapp: false, inApp: true },
      { emailAutomatic: true, whatsappAutomatic: true },
    );
    expect(gated).toEqual({ email: false, whatsapp: false, inApp: true });
  });

  it('scopes storage keys per company', () => {
    expect(companyAutoSendConfigKey('קיבוץ בארי')).toBe('company_auto_send:קיבוץ בארי');
    expect(companyAutoSendConfigKey('QA-A')).not.toBe(companyAutoSendConfigKey('QA-B'));
  });
});
