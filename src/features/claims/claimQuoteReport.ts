/**
 * claimQuoteReport.ts
 * Supplier-invoice and quote report rows: per claim and customer, the parts with quantities,
 * supplier purchase cost, customer sale price and the difference. Pure — the caller loads the quotes.
 */
import { partGroupOf, partPricing, round2, type QuoteData } from './claimQuoteModel';

export type QuoteReportSource = {
  id: string;
  claim_id: string;
  quote_no: number;
  version: number;
  updated_at: string;
  data: QuoteData;
};

export type QuoteReportClaim = { id: string; clientName: string; plate: string; claimNum: string };

export type QuoteReportPart = {
  name: string;
  sku: string;
  group: string;
  qty: number;
  unitNet: number;
  unitGross: number;
  supplierCost: number;
  sale: number;
  diff: number;
  invoiceName: string;
  included: boolean;
};

export type QuoteReportInvoice = { docId: string; fileName: string; uploadedAt: string; lines: number; linkedParts: number; claimCheck: string };

export type QuoteReportRow = {
  quoteId: string;
  claimId: string;
  clientName: string;
  plate: string;
  claimNum: string;
  quoteNo: number;
  version: number;
  updatedAt: string;
  invoices: QuoteReportInvoice[];
  parts: QuoteReportPart[];
  supplierCost: number;
  sale: number;
  diff: number;
};

/**
 * One row per saved quote of a known (not deleted) claim. Each quote only reads its own data,
 * so parts and invoices never mix between claims. Invoices are de-duplicated by document.
 */
export function buildQuoteReport(quotes: QuoteReportSource[], claims: QuoteReportClaim[]): QuoteReportRow[] {
  const byId = new Map(claims.map((c) => [c.id, c]));
  const rows: QuoteReportRow[] = [];
  for (const q of quotes) {
    const c = byId.get(q.claim_id);
    if (!c || !q.version) continue;
    const d = q.data || ({} as QuoteData);
    const allParts = Array.isArray(d.parts) ? d.parts : [];
    const parts: QuoteReportPart[] = allParts
      .filter((p) => (p.name || '').trim() || p.unitGross || p.unitNet)
      .map((p) => {
        const pr = partPricing(p);
        const sale = p.included ? pr.final : 0;
        const supplierCost = p.included ? pr.netCost : 0;
        return {
          name: p.name || '—',
          sku: p.sku || '',
          group: partGroupOf(p),
          qty: Number(p.qty) || 0,
          unitNet: Number(p.unitNet) || 0,
          unitGross: Number(p.unitGross) || 0,
          supplierCost,
          sale,
          diff: round2(sale - supplierCost),
          invoiceName: p.invoiceName || '',
          included: !!p.included,
        };
      });
    const seen = new Set<string>();
    const invoices: QuoteReportInvoice[] = [];
    for (const inv of Array.isArray(d.invoices) ? d.invoices : []) {
      const key = inv.docId || inv.sha;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      invoices.push({
        docId: inv.docId,
        fileName: inv.fileName,
        uploadedAt: inv.uploadedAt,
        lines: (inv.lines || []).length,
        linkedParts: allParts.filter((p) => p.invoiceDocId === inv.docId).length,
        claimCheck: inv.claimCheck || '',
      });
    }
    const supplierCost = round2(parts.reduce((s, p) => s + p.supplierCost, 0));
    const sale = round2(parts.reduce((s, p) => s + p.sale, 0));
    rows.push({
      quoteId: q.id,
      claimId: q.claim_id,
      clientName: c.clientName,
      plate: c.plate,
      claimNum: c.claimNum,
      quoteNo: q.quote_no,
      version: q.version,
      updatedAt: q.updated_at,
      invoices,
      parts,
      supplierCost,
      sale,
      diff: round2(sale - supplierCost),
    });
  }
  return rows.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

/** Totals over the rows; invoices are counted once per claim even if several quotes link the same file. */
export function quoteReportTotals(rows: QuoteReportRow[]) {
  const invoiceKeys = new Set<string>();
  for (const r of rows) for (const inv of r.invoices) invoiceKeys.add(`${r.claimId}|${inv.docId}`);
  const supplierCost = round2(rows.reduce((s, r) => s + r.supplierCost, 0));
  const sale = round2(rows.reduce((s, r) => s + r.sale, 0));
  return { quotes: rows.length, claims: new Set(rows.map((r) => r.claimId)).size, invoices: invoiceKeys.size, supplierCost, sale, diff: round2(sale - supplierCost) };
}
