/**
 * Garage shop tenant helpers.
 * Tenant key = profiles.company_name / get_user_company(), stored as shop_company_name.
 * Do not reuse garage_customers.company_name — that is the customer's legal/business name.
 *
 * Client filters are defense-in-depth. RLS on Staging is the real gate.
 * /garage-management stays super_admin-only until isolation PASS.
 */

export const STAGING_SUPABASE_REF = 'usfeoerkpcafxxlyuldl';
export const PRODUCTION_SUPABASE_REF = 'qasomfndnjuixgjmjwcm';

export type GarageShopScope = {
  role?: string;
  shopCompanyName?: string;
};

export function normalizeShopCompanyName(raw: string | null | undefined): string {
  return String(raw || '').trim();
}

export function garageShopScopeOf(
  user: { role?: string; company_name?: string } | null | undefined,
): GarageShopScope {
  return {
    role: user?.role,
    shopCompanyName: normalizeShopCompanyName(user?.company_name),
  };
}

export function garageShopVisible(
  rowShop: string | null | undefined,
  scope: GarageShopScope | null | undefined,
): boolean {
  if (!scope) return true;
  if (scope.role === 'super_admin') return true;
  if (scope.role !== 'fleet_manager') return false;
  const mine = normalizeShopCompanyName(scope.shopCompanyName);
  const theirs = normalizeShopCompanyName(rowShop);
  return Boolean(mine) && mine === theirs;
}

export function filterGarageByShop<T extends { shop_company_name?: string | null }>(
  rows: T[],
  scope?: GarageShopScope | null,
): T[] {
  if (!scope || scope.role === 'super_admin') return rows;
  return rows.filter((row) => garageShopVisible(row.shop_company_name, scope));
}

export function isGarageShopColumnMissing(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  if (!/shop_company_name/i.test(message)) return false;
  return code === 'PGRST204'
    || code === '42703'
    || /does not exist/i.test(message)
    || /schema cache/i.test(message)
    || /could not find/i.test(message);
}

export function assertStagingSupabaseTarget(urlOrRef: string): void {
  const value = String(urlOrRef || '');
  if (!value) throw new Error('Missing Supabase target');
  if (value.includes(PRODUCTION_SUPABASE_REF) || /dalia-car\.online/i.test(value)) {
    throw new Error('Production target forbidden');
  }
  if (!value.includes(STAGING_SUPABASE_REF)) {
    throw new Error(`Target is not Oren Car PUBLIC STAGING ${STAGING_SUPABASE_REF}`);
  }
}
