import type { AppRole } from '@/contexts/AuthContext';
import type { DaliaRole } from './fleetosTypes';

/** Map existing Dalia app roles to FleetOS visibility roles — no new auth roles. */
export function mapAppRoleToFleetOS(role: AppRole | undefined): DaliaRole {
  switch (role) {
    case 'super_admin':
      return 'super_admin';
    case 'fleet_manager':
      return 'fleet_admin';
    case 'driver':
      return 'driver';
    case 'private_customer':
    case 'business_customer':
      return 'customer';
    default:
      return 'manager';
  }
}

export function canAccessFleetOS(role: AppRole | undefined): boolean {
  return role === 'super_admin' || role === 'fleet_manager';
}
