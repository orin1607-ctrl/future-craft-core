/**
 * Driver-event WhatsApp uses the existing Production Gupshup connection
 * (same secrets as send-whatsapp-message). Staging Pages must not send.
 */
export const STAGING_SUPABASE_REF = 'usfeoerkpcafxxlyuldl';
export const PRODUCTION_SUPABASE_REF = 'qasomfndnjuixgjmjwcm';
export const PRODUCTION_SUPABASE_REFS = ['qasomfndnjuixgjmjwcm', 'kuenhflklivaxrmqbsee'] as const;

/** Staging-only helper kept for tests; Production driver-area uses isDriverEventWhatsAppAllowed. */
export function isStagingWhatsAppAllowed(supabaseUrl: string | undefined | null): boolean {
  const url = supabaseUrl || '';
  if (PRODUCTION_SUPABASE_REFS.some((ref) => url.includes(ref))) return false;
  return url.includes(STAGING_SUPABASE_REF);
}

/** Live Production (dalia-new) may send via existing Gupshup. No other project. */
export function isDriverEventWhatsAppAllowed(supabaseUrl: string | undefined | null): boolean {
  const url = supabaseUrl || '';
  return url.includes(PRODUCTION_SUPABASE_REF);
}
