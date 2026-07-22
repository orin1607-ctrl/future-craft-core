import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DECLARATION_BODY,
  renderDeclarationTemplate,
  resolveStoredDeclarationText,
  canManageDeclarationTemplates,
} from '@/utils/declarationTemplates';

describe('renderDeclarationTemplate', () => {
  it('replaces {{placeholders}}', () => {
    const out = renderDeclarationTemplate('נהג {{driver_name}} ת.ז {{id_number}}', {
      driver_name: 'משה',
      id_number: '123',
    });
    expect(out).toBe('נהג משה ת.ז 123');
  });

  it('replaces legacy ______ and {ID}', () => {
    expect(renderDeclarationTemplate('מספר ______', { id_number: '999' })).toBe('מספר 999');
    expect(renderDeclarationTemplate('מספר {ID}', { id_number: '999' })).toBe('מספר 999');
  });

  it('keeps unknown placeholders for future fields', () => {
    expect(renderDeclarationTemplate('שלום {{vehicle_plate}}', {})).toBe('שלום {{vehicle_plate}}');
  });

  it('default body contains id_number token', () => {
    expect(DEFAULT_DECLARATION_BODY).toContain('{{id_number}}');
  });
});

describe('resolveStoredDeclarationText', () => {
  it('uses stored snapshot and never falls back to hardcoded seed', () => {
    const custom = 'נוסח מותאם אישית [[MARKER]] {{id_number}}';
    const out = resolveStoredDeclarationText(custom, { id_number: '111' });
    expect(out).toContain('[[MARKER]]');
    expect(out).toContain('111');
    expect(out).not.toContain('לא נתגלו אצלי');
  });

  it('does not inject DEFAULT_DECLARATION_BODY when snapshot missing', () => {
    const out = resolveStoredDeclarationText('', {});
    expect(out).toContain('חסר נוסח תצהיר');
    expect(out).not.toContain(DEFAULT_DECLARATION_BODY.slice(0, 20));
  });
});

describe('canManageDeclarationTemplates', () => {
  it('allows fleet_manager and super_admin only', () => {
    expect(canManageDeclarationTemplates('fleet_manager')).toBe(true);
    expect(canManageDeclarationTemplates('super_admin')).toBe(true);
    expect(canManageDeclarationTemplates('driver')).toBe(false);
    expect(canManageDeclarationTemplates('private_customer')).toBe(false);
    expect(canManageDeclarationTemplates(null)).toBe(false);
  });
});
