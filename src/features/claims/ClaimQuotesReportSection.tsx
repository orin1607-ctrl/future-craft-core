/**
 * ClaimQuotesReportSection.tsx
 * Reports: supplier invoices and quotes per claim and customer — parts, quantities,
 * supplier purchase cost vs customer sale price, and the difference. Internal report.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ClaimRecord } from './claimsConstants';
import { formatIls } from './claimQuoteModel';
import { buildQuoteReport, quoteReportTotals, type QuoteReportSource } from './claimQuoteReport';

export default function ClaimQuotesReportSection({ claims, onOpenClaim }: { claims: ClaimRecord[]; onOpenClaim: (id: string) => void }) {
  const [quotes, setQuotes] = useState<QuoteReportSource[] | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let live = true;
    supabase
      .from('claim_quotes' as never)
      .select('id, claim_id, quote_no, version, updated_at, data')
      .order('updated_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (!live) return;
        if (err) setError(err.message);
        setQuotes(((data || []) as unknown) as QuoteReportSource[]);
      });
    return () => { live = false; };
  }, []);

  const rows = useMemo(() => {
    const index = claims.map((c) => ({ id: c.id, clientName: c.clientName || '', plate: c.plate || '', claimNum: c.claimNum || '' }));
    const all = buildQuoteReport(quotes || [], index);
    const q = search.trim();
    return q ? all.filter((r) => [r.clientName, r.plate, r.claimNum, r.claimId].some((v) => String(v || '').includes(q))) : all;
  }, [quotes, claims, search]);
  const totals = useMemo(() => quoteReportTotals(rows), [rows]);

  const kpi = (label: string, value: string, tone = '') => (
    <div className="cqr-kpi"><span>{label}</span><b className={tone}>{value}</b></div>
  );

  return (
    <section className="cqr" data-testid="claim-quotes-report">
      <div className="cqr-head">
        <div>
          <h3>🧾 חשבוניות ספקים והצעות מחיר — עלות מול מכירה</h3>
          <div className="cqr-sub">לפי תיק תביעה ולקוח · נתונים פנימיים (מחירי ספק לא נשלחים ללקוח)</div>
        </div>
        <input className="fi cqr-search" placeholder="חיפוש לקוח / רכב / תביעה" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="claim-quotes-report-search" />
      </div>
      {error && <div className="empty">שגיאה בטעינת הצעות המחיר: {error}</div>}
      {quotes === null ? <div className="empty">טוען הצעות מחיר…</div> : (
        <>
          <div className="cqr-kpis" data-testid="claim-quotes-report-kpis">
            {kpi('תיקים עם הצעה', String(totals.claims))}
            {kpi('הצעות שמורות', String(totals.quotes))}
            {kpi('חשבוניות ספקים', String(totals.invoices))}
            {kpi('עלות קנייה מספקים', formatIls(totals.supplierCost))}
            {kpi('מחיר מכירה ללקוח', formatIls(totals.sale))}
            {kpi('הפרש (רווח גולמי)', formatIls(totals.diff), totals.diff < 0 ? 'cqr-neg' : 'cqr-pos')}
          </div>
          {!rows.length ? <div className="empty">אין הצעות מחיר שמורות{search ? ' שתואמות לחיפוש' : ''}.</div> : (
            <div className="cqr-list">
              {rows.map((r) => (
                <div className="cqr-row" key={r.quoteId} data-testid={`claim-quotes-report-row-${r.claimId}`}>
                  <button type="button" className="cqr-row-head" aria-expanded={!!open[r.quoteId]} onClick={() => setOpen((o) => ({ ...o, [r.quoteId]: !o[r.quoteId] }))}>
                    <span className="cqr-who">
                      <b>{r.clientName || 'ללא שם'}</b>
                      <small>רכב {r.plate || '—'} · תביעה {r.claimNum || '—'} · הצעה {r.quoteNo} (גרסה {r.version}) · {r.invoices.length} חשבוניות</small>
                    </span>
                    <span className="cqr-nums">
                      <span>קנייה {formatIls(r.supplierCost)}</span>
                      <span>מכירה {formatIls(r.sale)}</span>
                      <b className={r.diff < 0 ? 'cqr-neg' : 'cqr-pos'}>הפרש {formatIls(r.diff)}</b>
                    </span>
                  </button>
                  {open[r.quoteId] && (
                    <div className="cqr-detail">
                      {r.invoices.length > 0 && (
                        <div className="cqr-invs">
                          {r.invoices.map((inv) => (
                            <span key={inv.docId} className="cqr-inv">🧾 {inv.fileName} · {inv.linkedParts} חלקים מקושרים{inv.claimCheck === 'other' ? ' · ⚠ מזכירה תיק אחר' : inv.claimCheck === 'match' ? ' · ✓ תואמת לתיק' : ''}</span>
                          ))}
                        </div>
                      )}
                      <div className="cqr-table-wrap">
                        <table className="cqr-table">
                          <thead>
                            <tr><th>פריט</th><th>קטגוריה</th><th>מק״ט</th><th>כמות</th><th>נטו ספק ליח׳</th><th>ברוטו ליח׳</th><th>עלות קנייה</th><th>מכירה ללקוח</th><th>הפרש</th><th>חשבונית</th></tr>
                          </thead>
                          <tbody>
                            {r.parts.map((p, i) => (
                              <tr key={i} className={p.included ? '' : 'cqr-excluded'}>
                                <td>{p.name}{p.included ? '' : ' (לא כלול)'}</td><td>{p.group}</td><td dir="ltr">{p.sku || '—'}</td><td>{p.qty}</td>
                                <td>{formatIls(p.unitNet)}</td><td>{formatIls(p.unitGross)}</td>
                                <td>{formatIls(p.supplierCost)}</td><td>{formatIls(p.sale)}</td>
                                <td className={p.diff < 0 ? 'cqr-neg' : ''}>{formatIls(p.diff)}</td><td className="cqr-file" title={p.invoiceName}>{p.invoiceName || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <button type="button" className="btn btn-g btn-sm" onClick={() => onOpenClaim(r.claimId)}>פתח תיק</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
