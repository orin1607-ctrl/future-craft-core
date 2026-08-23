import { supabase } from '@/integrations/supabase/client';
import { applyCompanyScope } from '@/hooks/useCompanyFilter';

/** One shared company vocabulary: vehicles.department + import_buffer + drivers.department. */
export function mergeDepartmentNames(...lists: Array<Iterable<string | null | undefined>>): string[] {
  const set = new Set<string>();
  for (const list of lists) {
    for (const d of list) {
      const t = String(d || '').trim();
      if (t) set.add(t);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'he'));
}

function namesFromVehicleRows(
  rows: Array<{ department?: string | null; import_buffer?: unknown }>,
): string[] {
  const names: string[] = [];
  for (const row of rows) {
    if (row.department?.trim()) names.push(row.department.trim());
    const buf = row.import_buffer as { departments?: string[] } | null;
    for (const d of buf?.departments || []) {
      if (d?.trim()) names.push(d.trim());
    }
  }
  return names;
}

/** Collect distinct department names for a company from vehicles + drivers (same list). */
export async function fetchCompanyDepartments(companyName: string | null | undefined): Promise<string[]> {
  if (!companyName) return [];

  const [vRes, dRes] = await Promise.all([
    supabase.from('vehicles').select('department, import_buffer').eq('company_name', companyName),
    supabase.from('drivers').select('department').eq('company_name', companyName),
  ]);

  return mergeDepartmentNames(
    namesFromVehicleRows(vRes.data || []),
    (dRes.data || []).map((r) => r.department),
  );
}

/** From in-memory vehicle rows (no extra query). */
export function collectDepartmentsFromVehicles(
  vehicles: Array<{ department?: string | null; import_buffer?: unknown; company_name?: string | null }>,
  companyName?: string | null,
): string[] {
  return mergeDepartmentNames(
    namesFromVehicleRows(
      vehicles.filter((v) => !companyName || !v.company_name || v.company_name === companyName),
    ),
  );
}

/** Scoped query helper for fleet_manager / super_admin. */
export async function fetchScopedCompanyDepartments(companyFilter: string | null): Promise<string[]> {
  let vq = supabase.from('vehicles').select('department, import_buffer, company_name');
  vq = applyCompanyScope(vq, companyFilter);
  let dq = supabase.from('drivers').select('department, company_name');
  dq = applyCompanyScope(dq, companyFilter);
  const [vRes, dRes] = await Promise.all([vq, dq]);
  return mergeDepartmentNames(
    collectDepartmentsFromVehicles(vRes.data || [], companyFilter || undefined),
    (dRes.data || [])
      .filter((d) => !companyFilter || d.company_name === companyFilter)
      .map((d) => d.department),
  );
}
