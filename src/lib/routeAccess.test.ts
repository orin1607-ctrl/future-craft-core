import { describe, expect, it } from 'vitest';
import { canAccessRoute } from './routeAccess';

describe('routeAccess', () => {
  it('super_admin can access all manager routes', () => {
    expect(canAccessRoute('/dalia-settings', 'super_admin')).toBe(true);
    expect(canAccessRoute('/vehicles', 'super_admin')).toBe(true);
  });

  it('driver cannot access manager modules', () => {
    expect(canAccessRoute('/vehicles', 'driver')).toBe(false);
    expect(canAccessRoute('/user-management', 'driver')).toBe(false);
    expect(canAccessRoute('/faults', 'driver')).toBe(true);
  });

  it('fleet_manager cannot access super admin settings', () => {
    expect(canAccessRoute('/dalia-settings', 'fleet_manager')).toBe(false);
    expect(canAccessRoute('/ai-marketing', 'fleet_manager')).toBe(false);
    expect(canAccessRoute('/fleetos-ai', 'fleet_manager')).toBe(true);
  });

  it('super_admin can access ai-marketing', () => {
    expect(canAccessRoute('/ai-marketing', 'super_admin')).toBe(true);
  });

  it('legacy /dalia-crm redirects via route (super_admin)', () => {
    expect(canAccessRoute('/dalia-crm', 'super_admin')).toBe(true);
    expect(canAccessRoute('/dalia-crm', 'fleet_manager')).toBe(false);
  });

  it('required-fields admin is super_admin only', () => {
    expect(canAccessRoute('/required-fields', 'super_admin')).toBe(true);
    expect(canAccessRoute('/required-fields', 'fleet_manager')).toBe(false);
    expect(canAccessRoute('/admin/modules/vehicles/required-fields', 'super_admin')).toBe(true);
    expect(canAccessRoute('/admin/modules/vehicles/required-fields', 'fleet_manager')).toBe(false);
  });

  it('claims route requires grant, not role', () => {
    expect(canAccessRoute('/claims', 'super_admin')).toBe(true);
    expect(canAccessRoute('/claims', 'fleet_manager')).toBe(false);
    expect(canAccessRoute('/claims', 'fleet_manager', { hasClaimsAccess: true })).toBe(true);
    expect(canAccessRoute('/claims', 'driver')).toBe(false);
    expect(canAccessRoute('/claims', 'driver', { hasClaimsAccess: true })).toBe(true);
  });

  it('claims worker is limited to Claims (not driver modules)', () => {
    const extras = { hasClaimsAccess: true, claimsWorkerOnly: true };
    expect(canAccessRoute('/claims', 'driver', extras)).toBe(true);
    expect(canAccessRoute('/dashboard', 'driver', extras)).toBe(true);
    expect(canAccessRoute('/settings', 'driver', extras)).toBe(true);
    expect(canAccessRoute('/faults', 'driver', extras)).toBe(false);
    expect(canAccessRoute('/vehicles', 'driver', extras)).toBe(false);
    expect(canAccessRoute('/accidents', 'driver', extras)).toBe(false);
  });

  it('telemarketing agent is limited to caller home', () => {
    expect(canAccessRoute('/telemarketing', 'telemarketing_agent')).toBe(true);
    expect(canAccessRoute('/dashboard', 'telemarketing_agent')).toBe(true);
    expect(canAccessRoute('/telemarketing/admin', 'telemarketing_agent')).toBe(false);
    expect(canAccessRoute('/vehicles', 'telemarketing_agent')).toBe(false);
    expect(canAccessRoute('/telemarketing/admin', 'super_admin')).toBe(true);
    expect(canAccessRoute('/telemarketing/admin', 'fleet_manager')).toBe(false);
  });
});
