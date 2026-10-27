/**
 * Writes an approved quote import into the claim's current quote. Staging tables only, via the existing quote service.
 */
import { supabase } from '@/integrations/supabase/client';
import { normalizeQuoteData, type QuoteData } from './claimQuoteModel';
import { mergeClaimQuoteImport, type ParsedQuoteImport, type QuoteImportChange } from './claimQuoteImport';
import { createClaimQuote, listClaimQuotes, saveClaimQuoteVersion, type QuoteActor } from './claimQuoteService';

export async function applyClaimQuoteImport(input: {
  claimId: string;
  parsed: ParsedQuoteImport;
  companyName?: string | null;
  actor: QuoteActor;
}): Promise<{ quoteNo: number; version: number; changes: QuoteImportChange[] }> {
  const existing = await listClaimQuotes(input.claimId);
  const current = existing[0] || null;
  let claim: Record<string, string | undefined> = {};
  const { data: row } = await supabase.from('claims_records').select('row_data').eq('id', input.claimId).maybeSingle();
  if (row && typeof (row as { row_data?: unknown }).row_data === 'object') {
    claim = (row as { row_data: Record<string, string | undefined> }).row_data;
  }
  const base = normalizeQuoteData(current?.data as Partial<QuoteData> | undefined, claim);
  const { next, changes } = mergeClaimQuoteImport(base, input.parsed);
  const note = 'ייבוא מהצ׳אט של דליה בתיק. מחשבון הצבע לא שונה.';
  if (!current) {
    const created = await createClaimQuote(input.claimId, input.companyName || '', next, input.actor);
    const saved = await saveClaimQuoteVersion(created, next, note, input.actor);
    return { quoteNo: saved.quote_no, version: saved.version, changes };
  }
  const saved = await saveClaimQuoteVersion(current, next, note, input.actor);
  return { quoteNo: saved.quote_no, version: saved.version, changes };
}
