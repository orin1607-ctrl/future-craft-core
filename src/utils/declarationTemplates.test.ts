import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DECLARATION_BODY,
  renderDeclarationTemplate,
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

describe('canManageDeclarationTemplates', () => {
  it('allows fleet_manager and super_admin only', () => {
    expect(canManageDeclarationTemplates('fleet_manager')).toBe(true);
    expect(canManageDeclarationTemplates('super_admin')).toBe(true);
    expect(canManageDeclarationTemplates('driver')).toBe(false);
    expect(canManageDeclarationTemplates('private_customer')).toBe(false);
    expect(canManageDeclarationTemplates(null)).toBe(false);
  });
});
