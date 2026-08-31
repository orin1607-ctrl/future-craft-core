export type AppRole = 'super_admin' | 'fleet_manager' | 'driver' | 'private_customer' | 'business_customer' | 'telemarketing_agent';

/** Prefix routes — manager-only modules (drivers redirected to dashboard). */
const MANAGER_PREFIXES = [
  '/vehicles',
  '/drivers',
  '/fleet-managers',
  '/vehicle-tracking',
  '/fleetos-ai',
  '/ai-marketing',
  '/dalia-crm',
  '/transport',
  '/customers',
  '/telemarketing',
  '/routes',
  '/reports',
  '/alerts',
  '/expiry-approvals',
  '/admin-home',
  '/user-management',
  '/permissions',
  '/dalia-settings',
  '/alert-settings',
  '/approval-settings',
  '/system-logs',
  '/security-center',
  '/email-templates',
  '/suppliers',
  '/fleet-managers',
];

const SUPER_ADMIN_ONLY = [
  '/ai-marketing',
  '/dalia-crm',
  '/admin-home',
  '/user-management',
  '/permissions',
  '/dalia-settings',
  '/dalia-settings/whatsapp',
  '/alert-settings',
  '/approval-settings',
  '/system-logs',
  '/security-center',
  '/email-templates',
  '/required-fields',
  '/admin/modules',
  '/emergency-settings',
  '/telemarketing/admin',
];

const FLEET_MANAGER_ROUTES = ['/fleetos-ai'];

export function canAccessRoute(
  pathname: string,
  role: AppRole | undefined,
  extras?: { hasClaimsAccess?: boolean },
): boolean {
  if (!role) return false;

  const path = pathname.split('?')[0];
  if (path === '/claims' || path.startsWith('/claims/')) {
    return role === 'super_admin' || !!extras?.hasClaimsAccess;
  }

  if (role === 'super_admin') return true;

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

  if (role === 'telemarketing_agent') {
    return path === '/telemarketing' || path === '/dashboard';
  }

  if (role === 'fleet_manager') {
    if (FLEET_MANAGER_ROUTES.some((p) => path === p || path.startsWith(`${p}/`))) {
      return true;
    }
    return !SUPER_ADMIN_ONLY.some((p) => path === p || path.startsWith(`${p}/`));
  }

  return true;
}
