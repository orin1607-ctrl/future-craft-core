/**
 * claimQuoteService.ts
 * Storage for claim quotes. Every save updates the live quote and inserts an immutable version row,
 * so earlier versions are never overwritten. STAGING tables: claim_quotes, claim_quote_versions, claim_quote_library.
 */
import { supabase } from '@/integrations/supabase/client';
import { computeTotals, type LibraryItem, type QuoteData, type QuoteTotals } from './claimQuoteModel';

export type ClaimQuoteRow = {
  id: string;
  claim_id: string;
  quote_no: number;
  title: string;
  status: string;
  data: QuoteData;
  totals: QuoteTotals;
  total_amount: number;
  version: number;
  company_name: string | null;
  created_by_name: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export type ClaimQuoteVersionRow = {
  id: string;
  quote_id: string;
  claim_id: string;
  version: number;
  data: QuoteData;
  totals: QuoteTotals;
  total_amount: number;
  change_note: string;
  created_by_name: string | null;
  created_at: string;
};

export type QuoteActor = { id: string; full_name: string };

function tbl(name: string) {
  return supabase.from(name as never);
}

function fail(error: unknown): never {
  const msg = (error as { message?: string } | null)?.message || String(error || 'שגיאה');
  throw new Error(msg);
}

export async function listClaimQuotes(claimId: string): Promise<ClaimQuoteRow[]> {
  const { data, error } = await tbl('claim_quotes').select('*').eq('claim_id', claimId).order('quote_no', { ascending: false });
  if (error) fail(error);
  return (data || []) as unknown as ClaimQuoteRow[];
}

export async function listQuoteVersions(quoteId: string): Promise<ClaimQuoteVersionRow[]> {
  const { data, error } = await tbl('claim_quote_versions').select('*').eq('quote_id', quoteId).order('version', { ascending: false });
  if (error) fail(error);
  return (data || []) as unknown as ClaimQuoteVersionRow[];
}

/** Creates the quote row (version 0 = not saved yet). quote_no is per claim. */
export async function createClaimQuote(claimId: string, companyName: string, data: QuoteData, actor: QuoteActor): Promise<ClaimQuoteRow> {
  const existing = await listClaimQuotes(claimId);
  const quoteNo = existing.reduce((m, q) => Math.max(m, q.quote_no), 0) + 1;
  const totals = computeTotals(data);
  const { data: row, error } = await tbl('claim_quotes').insert({
    claim_id: claimId,
    quote_no: quoteNo,
    title: `הצעת מחיר ${quoteNo}`,
    status: 'draft',
    data,
    totals,
    total_amount: totals.total,
    version: 0,
    company_name: companyName || null,
    created_by: actor.id,
    created_by_name: actor.full_name,
    updated_by: actor.id,
    updated_by_name: actor.full_name,
  } as never).select('*').single();
  if (error) fail(error);
  return row as unknown as ClaimQuoteRow;
}

/** Saves a new version: live row updated, version row inserted (never updated or deleted). */
export async function saveClaimQuoteVersion(quote: ClaimQuoteRow, data: QuoteData, changeNote: string, actor: QuoteActor): Promise<ClaimQuoteRow> {
  const totals = computeTotals(data);
  const version = (quote.version || 0) + 1;
  const { error: vErr } = await tbl('claim_quote_versions').insert({
    quote_id: quote.id,
    claim_id: quote.claim_id,
    version,
    data,
    totals,
    total_amount: totals.total,
    change_note: changeNote,
    created_by: actor.id,
    created_by_name: actor.full_name,
  } as never);
  if (vErr) fail(vErr);
  const { data: row, error } = await tbl('claim_quotes').update({
    data,
    totals,
    total_amount: totals.total,
    version,
    status: 'saved',
    updated_by: actor.id,
    updated_by_name: actor.full_name,
    updated_at: new Date().toISOString(),
  } as never).eq('id', quote.id).select('*').single();
  if (error) fail(error);
  return row as unknown as ClaimQuoteRow;
}

/** Records generated documents / send actions on the live row without creating a new price version. */
export async function patchClaimQuoteData(quote: ClaimQuoteRow, data: QuoteData, actor: QuoteActor): Promise<ClaimQuoteRow> {
  const { data: row, error } = await tbl('claim_quotes').update({
    data,
    updated_by: actor.id,
    updated_by_name: actor.full_name,
    updated_at: new Date().toISOString(),
  } as never).eq('id', quote.id).select('*').single();
  if (error) fail(error);
  return row as unknown as ClaimQuoteRow;
}

/** The shop's own saved items plus shared ones (company ''), so libraries of different shops never mix. */
export async function loadQuoteLibrary(companyName = ''): Promise<LibraryItem[]> {
  const companies = [...new Set(['', companyName || ''])];
  const { data, error } = await tbl('claim_quote_library')
    .select('id, kind, category, label, default_hours, default_price')
    .in('company_name', companies)
    .order('label');
  if (error) return [];
  return (data || []) as unknown as LibraryItem[];
}

/** Adds a job / part name for reuse in later quotes. Duplicates are ignored. */
export async function addQuoteLibraryItem(item: LibraryItem, companyName: string, actor: QuoteActor) {
  const label = item.label.trim();
  if (!label) return;
  await tbl('claim_quote_library').upsert({
    company_name: companyName || '',
    kind: item.kind,
    category: item.category,
    label,
    default_hours: item.default_hours ?? null,
    default_price: item.default_price ?? null,
    created_by: actor.id,
    created_by_name: actor.full_name,
  } as never, { onConflict: 'company_name,kind,category,label', ignoreDuplicates: true });
}
