/**
 * Saves a quote the claims chat read (approved in its preview card) as a NEW quote of the claim, through the
 * quote calculator's own service — the same rows, totals and versions as saving from the calculator.
 * Existing quotes are never changed. Paint lines are never written here: they come from the paint calculator.
 */
import { supabase } from '@/integrations/supabase/client';
import {
  CORE_CATEGORIES,
  PARTS_GROUP,
  newPartLine,
  newQuoteData,
  newWorkLine,
  type QuoteData,
} from './claimQuoteModel';
import { createClaimQuote, listClaimQuotes, saveClaimQuoteVersion, type ClaimQuoteRow, type QuoteActor } from './claimQuoteService';

export type QuoteEntryWork = { category: string; label: string; pricing: 'hours' | 'global'; hours: number; price: number; note?: string };
export type QuoteEntryPart = { name: string; partType: string; qty: number; price: number; description?: string };
export type QuoteEntryParams = {
  claim_id: string;
  company_name?: string;
  hour_rate: number;
  works: QuoteEntryWork[];
  parts: QuoteEntryPart[];
};

/** Quote data for the approved card: the claim snapshot, every work and part line, nothing for paint. */
export function buildQuoteEntryData(
  claim: Record<string, string | undefined>,
  params: QuoteEntryParams,
  meta: { previewId: string; byName: string; at: string },
): QuoteData {
  const base = newQuoteData(claim);
  const rate = Number(params.hour_rate) > 0 ? Number(params.hour_rate) : base.hourRate;
  const works = (params.works || []).map((w) => newWorkLine(w.category, w.label, rate, {
    pricing: w.pricing,
    hours: Number(w.hours) || 0,
    globalPrice: w.pricing === 'global' ? Number(w.price) || 0 : 0,
    note: w.note || '',
    source: 'manual',
  }));
  const parts = (params.parts || []).map((p) => newPartLine({
    name: p.name,
    partType: p.partType,
    qty: Number(p.qty) > 0 ? Number(p.qty) : 1,
    unitGross: Number(p.price) || 0,
    description: p.description || '',
    // Fasteners and other aids stay with the parts, not with paint materials.
    group: PARTS_GROUP,
  }));
  return {
    ...base,
    hourRate: rate,
    categories: [...new Set([...CORE_CATEGORIES.map((c) => c.key), ...works.map((w) => w.category)])],
    works,
    parts,
    internalNotes: `הוזן מצ׳אט דליה AI לאחר אישור (${meta.byName}). עבודות וחומרי צבע — ממחשבון הצבע בלבד.`,
    // Ties the quote to its approval card, so one card can never create two quotes.
    aiEntry: meta,
  } as QuoteData;
}

/** Creates the quote (once per card) and its first saved version. */
export async function saveQuoteEntry(params: QuoteEntryParams, previewId: string, actor: QuoteActor): Promise<ClaimQuoteRow> {
  const existing = await listClaimQuotes(params.claim_id);
  const same = existing.find((q) => (q.data as unknown as { aiEntry?: { previewId?: string } })?.aiEntry?.previewId === previewId);
  if (same && same.version > 0) return same;
  const { data: row, error } = await supabase.from('claims_records').select('row_data, company_name').eq('id', params.claim_id).maybeSingle();
  if (error || !row) throw new Error('התיק לא נמצא או שאין לך הרשאה אליו');
  const claim = ((row as { row_data?: unknown }).row_data || {}) as Record<string, string | undefined>;
  const data = buildQuoteEntryData(claim, params, { previewId, byName: actor.full_name, at: new Date().toISOString() });
  const company = params.company_name || String((row as { company_name?: string }).company_name || '');
  const created = same || await createClaimQuote(params.claim_id, company, data, actor);
  return saveClaimQuoteVersion(created, data, 'הוזן מצ׳אט דליה AI לאחר אישור המשתמש', actor);
}
