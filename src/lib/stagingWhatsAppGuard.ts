/**
 * Live WhatsApp (Gupshup) is allowed only on the Staging Supabase project.
 * Production projects must never send, even if GUPSHUP_API_KEY exists there.
 */
export const STAGING_SUPABASE_REF = 'usfeoerkpcafxxlyuldl';
export const PRODUCTION_SUPABASE_REFS = ['qasomfndnjuixgjmjwcm', 'kuenhflklivaxrmqbsee'] as const;

export function isStagingWhatsAppAllowed(supabaseUrl: string | undefined | null): boolean {
  const url = supabaseUrl || '';
  if (PRODUCTION_SUPABASE_REFS.some((ref) => url.includes(ref))) return false;
  return url.includes(STAGING_SUPABASE_REF);
}
