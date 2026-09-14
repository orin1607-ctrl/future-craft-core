import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canAccessRoute } from '@/lib/routeAccess';

const proposal = readFileSync('src/modules/garage-management/garage-tenant-isolation.staging.proposal.sql', 'utf8');
const precheck = readFileSync('src/modules/garage-management/garage-tenant-isolation.staging.precheck.sql', 'utf8');
const rollback = readFileSync('src/modules/garage-management/garage-tenant-isolation.staging.rollback.sql', 'utf8');

function uncommented(sql: string) {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

describe('garage tenant isolation proposal contract', () => {
  it('stays on Staging, does not rewrite garage_is_staff, Claims, or Gmail', () => {
    const body = uncommented(proposal);
    expect(proposal).toContain('usfeoerkpcafxxlyuldl');
    expect(proposal).toContain('shop_company_name');
    expect(body).not.toMatch(/CREATE OR REPLACE FUNCTION public\.garage_is_staff/);
    expect(body).not.toContain('claims-gmail');
    expect(body).not.toContain('claims_records');
    expect(body).not.toContain('yoni122222@gmail.com');
    expect(body).not.toContain('qasomfndnjuixgjmjwcm');
    expect(body).not.toContain('dalia-car.online');
  });

  it('fail-closes Storage INSERT to a visible case UUID path prefix', () => {
    expect(proposal).toContain("split_part(name, '/', 1)");
    expect(proposal).toContain('garage_media_storage_insert');
    expect(proposal).toContain('bucket_id = \'garage-media\'');
    expect(proposal).not.toMatch(/has_role\(auth\.uid\(\), 'fleet_manager'[\s\S]{0,80}WITH CHECK/);
  });

  it('enforces customer/vehicle/case shop with composite FKs and inherit trigger', () => {
    expect(proposal).toContain('garage_vehicles_customer_shop_fkey');
    expect(proposal).toContain('garage_cases_customer_shop_fkey');
    expect(proposal).toContain('garage_cases_vehicle_shop_fkey');
    expect(proposal).toContain('NEW.shop_company_name := parent_shop');
    expect(proposal).toContain('HAVING count(DISTINCT opener_shop) = 1');
    expect(proposal).not.toContain('ORDER BY customer_id, created_at');
  });

  it('keeps precheck read-only and rollback surgical', () => {
    const precheckBody = precheck.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
    expect(precheckBody).toMatch(/^\s*WITH\b/);
    expect(precheckBody).not.toMatch(/(^|[\s;])(ALTER|INSERT|DELETE|CREATE|DROP|GRANT|REVOKE)\b/i);
    expect(rollback).toContain('garage_is_staff(auth.uid())');
    expect(rollback).toContain('DROP FUNCTION IF EXISTS public.garage_shop_visible(text)');
    expect(rollback).toContain('shop_company_name columns in place');
  });

  it('does not open /garage-management to a regular fleet_manager', () => {
    expect(canAccessRoute('/garage-management', 'fleet_manager')).toBe(false);
    expect(canAccessRoute('/garage-management', 'fleet_manager', { garageOps: true })).toBe(true);
    expect(canAccessRoute('/garage-management', 'super_admin')).toBe(true);
  });
});
