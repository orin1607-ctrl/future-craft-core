/**
 * Garage-ops is a foundation/default for an existing fleet_manager.
 * Not a new app_role. Sentinel lives on profiles.job_title (same pattern as garage_photographer).
 */

export const GARAGE_OPS_JOB_TITLE = 'garage_ops';
export const GARAGE_OPS_LABEL = 'מנהל מוסך';
export const FLEET_FOUNDATION_LABEL = 'מנהל צי רכב';

export const GARAGE_OPS_CORE_MODULE_PATHS = [
  '/garage-management',
  '/claims',
  '/reports',
] as const;

export const GARAGE_OPS_ALWAYS_VISIBLE_PATHS = [
  '/dashboard',
  ...GARAGE_OPS_CORE_MODULE_PATHS,
] as const;

export type FleetFoundation = 'fleet' | 'garage_ops';

export function isGarageOpsJobTitle(jobTitle?: string | null): boolean {
  return String(jobTitle || '').trim() === GARAGE_OPS_JOB_TITLE;
}

export function fleetFoundationLabel(foundation: FleetFoundation | string | null | undefined): string {
  return foundation === 'garage_ops' ? GARAGE_OPS_LABEL : FLEET_FOUNDATION_LABEL;
}

export function garageOpsDefaultHiddenButtons(allManageablePaths: string[]): string[] {
  const keep = new Set<string>(GARAGE_OPS_ALWAYS_VISIBLE_PATHS);
  return [...new Set(allManageablePaths)].filter((path) => !keep.has(path));
}

/**
 * Regular fleet_manager: company hidden_buttons only (empty = show everything, as today).
 * Garage-ops with empty company list: start from the three core modules.
 * Once super_admin saves any hidden_buttons for the company, that list wins.
 */
export function effectiveHiddenButtonsForUser(opts: {
  garageOps: boolean;
  companyHidden: string[] | null | undefined;
  allManageablePaths: string[];
}): string[] {
  const company = Array.isArray(opts.companyHidden) ? opts.companyHidden : [];
  if (!opts.garageOps) return company;
  if (company.length > 0) return company;
  return garageOpsDefaultHiddenButtons(opts.allManageablePaths);
}

export function isGarageOpsCorePath(path: string): boolean {
  const clean = path.split('?')[0];
  return (GARAGE_OPS_CORE_MODULE_PATHS as readonly string[]).some(
    (p) => clean === p || clean.startsWith(`${p}/`),
  );
}
