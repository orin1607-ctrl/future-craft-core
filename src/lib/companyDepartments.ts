import { supabase } from '@/integrations/supabase/client';
import { applyCompanyScope } from '@/hooks/useCompanyFilter';

/** Collect distinct department names for a company from vehicles.department + import_buffer.departments. */
export async function fetchCompanyDepartments(companyName: string | null | undefined): Promise<string[]> {
  if (!companyName) return [];

  const { data } = await supabase
    .from('vehicles')
    .select('department, import_buffer')
    .eq('company_name', companyName);

  const set = new Set<string>();
  for (const row of data || []) {
    if (row.department?.trim()) set.add(row.department.trim());
    const buf = row.import_buffer as { departments?: string[] } | null;
    for (const d of buf?.departments || []) {
      if (d?.trim()) set.add(d.trim());
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'he'));
}

/** From in-memory vehicle rows (no extra query). */
export function collectDepartmentsFromVehicles(
  vehicles: Array<{ department?: string | null; import_buffer?: unknown; company_name?: string | null }>,
  companyName?: string | null,
): string[] {
  const set = new Set<string>();
  for (const v of vehicles) {
    if (companyName && v.company_name && v.company_name !== companyName) continue;
    if (v.department?.trim()) set.add(v.department.trim());
    const buf = v.import_buffer as { departments?: string[] } | null;
    for (const d of buf?.departments || []) {
      if (d?.trim()) set.add(d.trim());
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'he'));
}

/** Scoped query helper for fleet_manager / super_admin. */
export async function fetchScopedCompanyDepartments(companyFilter: string | null): Promise<string[]> {
  let q = supabase.from('vehicles').select('department, import_buffer, company_name');
  q = applyCompanyScope(q, companyFilter);
  const { data } = await q;
  return collectDepartmentsFromVehicles(data || [], companyFilter || undefined);
}
