/** Staging-only gate for Fleet Dalia AI. Production is a deny-list, never a client target. */
export const STAGING_PROJECT_ID = 'usfeoerkpcafxxlyuldl';
export const PRODUCTION_PROJECT_ID = 'qasomfndnjuixgjmjwcm';
export const KILL_SWITCH_KEY = 'fleet-dalia-ai';

export function killSwitchOff(): boolean {
  try {
    return localStorage.getItem(KILL_SWITCH_KEY) === 'off';
  } catch {
    return false;
  }
}

export function isFleetDaliaAiEnabled(opts?: { projectId?: string; killed?: boolean }): boolean {
  const projectId = opts && 'projectId' in opts
    ? opts.projectId
    : (import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined);
  const killed = opts && 'killed' in opts ? !!opts.killed : killSwitchOff();
  if (killed) return false;
  return projectId === STAGING_PROJECT_ID;
}

export function assertStagingReadTarget(url: string | undefined): void {
  if (!url || !url.includes(STAGING_PROJECT_ID) || url.includes(PRODUCTION_PROJECT_ID)) {
    throw new Error('דליה AI לצי נעצרה: היעד אינו Supabase של סביבת הבדיקות');
  }
}

/** Reads require one company. Super-admin "all companies" is not used here. */
export function guardCompany(role: string | undefined, company: string | null | undefined): string | null {
  if (role !== 'super_admin' && role !== 'fleet_manager') return null;
  const name = company?.trim();
  if (!name) return null;
  return name;
}
