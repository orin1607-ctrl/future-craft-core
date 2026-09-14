import { describe, expect, it } from 'vitest';
import { canAccessRoute } from '@/lib/routeAccess';
import {
  assertStagingSupabaseTarget,
  filterGarageByShop,
  garageShopScopeOf,
  garageShopVisible,
  isGarageShopColumnMissing,
  normalizeShopCompanyName,
  PRODUCTION_SUPABASE_REF,
  STAGING_SUPABASE_REF,
} from './garageTenant';

describe('garage tenant helpers', () => {
  it('normalizes shop names without touching customer company_name semantics', () => {
    expect(normalizeShopCompanyName('  מוסך אורן  ')).toBe('מוסך אורן');
    expect(normalizeShopCompanyName(null)).toBe('');
    expect(garageShopScopeOf({ role: 'fleet_manager', company_name: '  מוסך אורן  ' })).toEqual({
      role: 'fleet_manager',
      shopCompanyName: 'מוסך אורן',
    });
  });

  it('lets super_admin see every shop, including empty tenant rows', () => {
    const admin = garageShopScopeOf({ role: 'super_admin', company_name: 'מטה' });
    expect(garageShopVisible('מוסך א', admin)).toBe(true);
    expect(garageShopVisible('', admin)).toBe(true);
    expect(garageShopVisible('מוסך ב', admin)).toBe(true);
  });

  it('lets a fleet manager see only the same shop, never another shop or empty rows', () => {
    const shopA = garageShopScopeOf({ role: 'fleet_manager', company_name: 'מוסך א' });
    const shopB = garageShopScopeOf({ role: 'fleet_manager', company_name: 'מוסך ב' });
    const noCompany = garageShopScopeOf({ role: 'fleet_manager', company_name: '' });
    expect(garageShopVisible('מוסך א', shopA)).toBe(true);
    expect(garageShopVisible('מוסך ב', shopA)).toBe(false);
    expect(garageShopVisible('', shopA)).toBe(false);
    expect(garageShopVisible('מוסך א', shopB)).toBe(false);
    expect(garageShopVisible('מוסך א', noCompany)).toBe(false);
    expect(filterGarageByShop([
      { id: '1', shop_company_name: 'מוסך א' },
      { id: '2', shop_company_name: 'מוסך ב' },
      { id: '3', shop_company_name: '' },
    ], shopA).map((row) => row.id)).toEqual(['1']);
  });

  it('does not hide rows when the caller did not pass a shop scope', () => {
    expect(filterGarageByShop([
      { id: '1', shop_company_name: 'מוסך א' },
      { id: '2', shop_company_name: 'מוסך ב' },
    ]).map((row) => row.id)).toEqual(['1', '2']);
  });

  it('detects a missing shop_company_name column without treating it as a missing table', () => {
    expect(isGarageShopColumnMissing({
      code: 'PGRST204',
      message: "Could not find the 'shop_company_name' column of 'garage_customers' in the schema cache",
    })).toBe(true);
    expect(isGarageShopColumnMissing({
      code: '42703',
      message: 'column garage_customers.shop_company_name does not exist',
    })).toBe(true);
    expect(isGarageShopColumnMissing({
      code: 'PGRST205',
      message: "Could not find the table 'public.garage_cases'",
    })).toBe(false);
    expect(isGarageShopColumnMissing({
      code: 'PGRST204',
      message: "Could not find the 'default_workflow' column of 'garage_customers' in the schema cache",
    })).toBe(false);
  });

  it('refuses Production Supabase and accepts only the verified Staging ref', () => {
    expect(() => assertStagingSupabaseTarget(`https://${STAGING_SUPABASE_REF}.supabase.co`)).not.toThrow();
    expect(() => assertStagingSupabaseTarget(STAGING_SUPABASE_REF)).not.toThrow();
    expect(() => assertStagingSupabaseTarget(`https://${PRODUCTION_SUPABASE_REF}.supabase.co`)).toThrow(/Production/);
    expect(() => assertStagingSupabaseTarget('https://dalia-car.online')).toThrow(/Production/);
    expect(() => assertStagingSupabaseTarget('https://other.supabase.co')).toThrow(/PUBLIC STAGING/);
  });

  it('opens /garage-management only for garage-ops fleet_manager, not every fleet_manager', () => {
    expect(canAccessRoute('/garage-management', 'fleet_manager')).toBe(false);
    expect(canAccessRoute('/garage-management', 'fleet_manager', { garageOps: true })).toBe(true);
    expect(canAccessRoute('/garage-management', 'super_admin')).toBe(true);
    expect(canAccessRoute('/garage', 'fleet_manager')).toBe(true);
  });
});
