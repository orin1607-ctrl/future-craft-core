export type AppRole = 'super_admin' | 'fleet_manager' | 'driver' | 'private_customer';

/** Prefix routes — manager-only modules (drivers redirected to dashboard). */
const MANAGER_PREFIXES = [
  '/vehicles',
  '/drivers',
  '/fleet-managers',
  '/vehicle-tracking',
  '/fleetos-ai',
  '/transport',
  '/customers',
  '/routes',
  '/reports',
  '/alerts',
  '/admin-home',
  '/user-management',
  '/permissions',
  '/dalia-settings',
  '/alert-settings',
  '/approval-settings',
  '/system-logs',
  '/email-templates',
  '/suppliers',
  '/fleet-managers',
];

const SUPER_ADMIN_ONLY = [
  '/admin-home',
  '/user-management',
  '/permissions',
  '/dalia-settings',
  '/dalia-settings/whatsapp',
  '/alert-settings',
  '/approval-settings',
  '/system-logs',
  '/email-templates',
  '/emergency-settings',
];

const FLEET_MANAGER_ROUTES = ['/fleetos-ai'];

export function canAccessRoute(pathname: string, role: AppRole | undefined): boolean {
  if (!role) return false;

  if (role === 'super_admin') return true;

  const path = pathname.split('?')[0];

  if (SUPER_ADMIN_ONLY.some((p) => path === p || path.startsWith(`${p}/`))) {
    return false;
  }

  if (role === 'driver') {
    if (MANAGER_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
      return false;
    }
    return true;
  }

  if (role === 'private_customer') {
    const allowed = ['/dashboard', '/service-orders', '/driver-notifications', '/settings'];
    return allowed.some((p) => path === p || path.startsWith(`${p}/`));
  }

  if (role === 'fleet_manager') {
    if (FLEET_MANAGER_ROUTES.some((p) => path === p || path.startsWith(`${p}/`))) {
      return true;
    }
    return !SUPER_ADMIN_ONLY.some((p) => path === p || path.startsWith(`${p}/`));
  }

  return true;
}
