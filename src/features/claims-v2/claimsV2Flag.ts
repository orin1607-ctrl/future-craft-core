/** The new claims UI exists only on the STAGING Supabase project. Production builds never enable it. */
export const CLAIMS_V2_STAGING_REF = 'usfeoerkpcafxxlyuldl';

export const CLAIMS_V2_PATH = '/claims/new-ui';

export function isClaimsV2Enabled(projectId: string | undefined = import.meta.env.VITE_SUPABASE_PROJECT_ID): boolean {
  return String(projectId || '').trim() === CLAIMS_V2_STAGING_REF;
}
