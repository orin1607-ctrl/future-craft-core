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
    expect(canAccessRoute('/expiry-approvals', 'driver')).toBe(false);
    expect(canAccessRoute('/faults', 'driver')).toBe(true);
  });

  it('fleet_manager can access expiry approval list', () => {
    expect(canAccessRoute('/expiry-approvals', 'fleet_manager')).toBe(true);
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

  it('security center is super_admin only', () => {
    expect(canAccessRoute('/security-center', 'super_admin')).toBe(true);
    expect(canAccessRoute('/security-center', 'fleet_manager')).toBe(false);
    expect(canAccessRoute('/security-center', 'driver')).toBe(false);
    expect(canAccessRoute('/security-center', 'private_customer')).toBe(false);
  });

  it('telemarketing_agent can only access telemarketing agent screen', () => {
    expect(canAccessRoute('/telemarketing', 'telemarketing_agent')).toBe(true);
    expect(canAccessRoute('/dashboard', 'telemarketing_agent')).toBe(true);
    expect(canAccessRoute('/telemarketing/admin', 'telemarketing_agent')).toBe(false);
    expect(canAccessRoute('/user-management', 'telemarketing_agent')).toBe(false);
    expect(canAccessRoute('/vehicles', 'telemarketing_agent')).toBe(false);
    expect(canAccessRoute('/dalia-settings', 'telemarketing_agent')).toBe(false);
  });

  it('fleet_manager cannot access telemarketing admin', () => {
    expect(canAccessRoute('/telemarketing/admin', 'fleet_manager')).toBe(false);
  });
});
