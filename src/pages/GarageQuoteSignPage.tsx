import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

interface QuoteWorkRow {
  id?: string;
  part?: string;
  type?: string;
  desc?: string;
  qty?: number;
  price?: number | null;
}

interface QuotePartRow {
  id?: string;
  name?: string;
  sku?: string;
  supplier?: string;
  qty?: number;
  price?: number | null;
}

interface GarageQuotePayload {
  id: string;
  case_id: string;
  case_number: string;
  quote_version: number;
  quote_title: string;
  customer_name: string;
  vehicle_plate: string;
  quote_date: string;
  work_type: string;
  quote_works: QuoteWorkRow[];
  quote_parts: QuotePartRow[];
  priced_subtotal: number;
  priced_lines_count: number;
  unpriced_lines_count: number;
  vat_rate: number;
  vat_mode: 'unspecified' | 'plus_vat' | 'includes_vat';
  damage_photos_attached: boolean;
  damage_photos_count: number;
  quote_notes: string;
  status: 'ready_to_send' | 'sent' | 'signed' | 'superseded' | 'revoked';
  sent_at?: string | null;
  signed_at?: string | null;
  signer_name?: string;
  signature_data_url?: string;
}

export default function GarageQuoteSignPage() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get('t') || searchParams.get('token') || '').trim();
  const autoPrint = searchParams.get('print') === '1';

  const [quote, setQuote] = useState<GarageQuotePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signerName, setSignerName] = useState('');
  const [hasDrawn, setHasDrawn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [signSuccess, setSignSuccess] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  const loadQuote = useCallback(async () => {
    if (!token) {
      setError('חסר קישור מזהה להצעת המחיר.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await (supabase.rpc as any)('get_garage_quote_by_token', {
        p_token: token,
      });
      if (rpcErr || !data) {
        throw new Error(rpcErr?.message || 'לא ניתן לטעון את הצעת המחיר.');
      }
      const q = data as GarageQuotePayload;
      setQuote(q);
      setSignerName(q.signer_name || q.customer_name || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadQuote();
  }, [loadQuote]);

  useEffect(() => {
    if (autoPrint && quote && !loading) {
      const timer = setTimeout(() => {
        try {
          window.print();
        } catch {}
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [autoPrint, quote, loading]);

  const getCanvasPoint = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawingRef.current = true;
    const pt = getCanvasPoint(e);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pt = getCanvasPoint(e);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const stopDrawing = () => {
    drawingRef.current = false;
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    setSubmitError(null);
  };

  const handleSubmitSignature = async () => {
    setSubmitError(null);
    if (!signerName.trim()) {
      setSubmitError('נא להזין את שם החותם.');
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) {
      setSubmitError('נא לחתום בתיבת החתימה באמצעות האצבע או העכבר.');
      return;
    }
    const dataUrl = canvas.toDataURL('image/png');
    setSubmitting(true);
    try {
      const { data, error: signErr } = await (supabase.rpc as any)('sign_garage_quote_by_token', {
        p_token: token,
        p_signer_name: signerName.trim(),
        p_signature_data_url: dataUrl,
      });
      if (signErr || !data) {
        throw new Error(signErr?.message || 'שמירת החתימה נכשלה.');
      }
      setQuote(data as GarageQuotePayload);
      setSignSuccess(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-md w-full">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4" />
          <div className="text-slate-700 font-bold text-lg">טוען הצעת מחיר מאובטחת...</div>
        </div>
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-md w-full border border-red-200" data-testid="garage-quote-error">
          <div className="text-3xl mb-3">⚠️</div>
          <h1 className="text-xl font-bold text-red-700 mb-2">לא ניתן להציג את הצעת המחיר</h1>
          <p className="text-slate-600 text-sm">{error || 'הקישור אינו תקין או שפג תוקפו.'}</p>
        </div>
      </div>
    );
  }

  const works = Array.isArray(quote.quote_works) ? quote.quote_works : [];
  const parts = Array.isArray(quote.quote_parts) ? quote.quote_parts : [];
  const totalLinesCount = works.length + parts.length;
  const pricedSubtotal = Number(quote.priced_subtotal || 0);
  const vatRate = Number(quote.vat_rate || 18);
  const isSigned = quote.status === 'signed';

  return (
    <div dir="rtl" className="min-h-screen bg-slate-100 py-6 px-4 print:bg-white print:p-0" data-testid="garage-quote-sign-page">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #ffffff !important; }
        }
      `}</style>

      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden print:shadow-none print:border-none">
        {/* Top Action Bar (Hidden in Print) */}
        <div className="no-print bg-slate-900 text-white px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span>🔒 מסמך הצעת מחיר מאובטח</span>
            <span className="bg-slate-800 text-blue-300 px-2.5 py-0.5 rounded-full text-xs font-bold border border-slate-700">
              גרסה #{quote.quote_version}
            </span>
            {isSigned ? (
              <span className="bg-emerald-900/80 text-emerald-300 px-2.5 py-0.5 rounded-full text-xs font-bold border border-emerald-600" data-testid="garage-quote-status-signed">
                ✓ נחתם ואושר
              </span>
            ) : (
              <span className="bg-amber-900/80 text-amber-200 px-2.5 py-0.5 rounded-full text-xs font-bold border border-amber-600" data-testid="garage-quote-status-pending">
                ממתין לאישור וחתימת לקוח
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            data-testid="garage-quote-print-btn"
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg transition"
          >
            🖨️ הדפס / הורד הצעת מחיר (PDF)
          </button>
        </div>

        {/* Document Content */}
        <div className="p-6 sm:p-8 space-y-6">
          {/* Header */}
          <div className="border-b-2 border-slate-200 pb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900" data-testid="garage-quote-title">
                {quote.quote_title || 'הצעת מחיר – עבודות פחחות וצבע'}
              </h1>
              {quote.work_type ? (
                <p className="text-slate-600 font-medium mt-1" data-testid="garage-quote-work-type">
                  סוג עבודה: {quote.work_type}
                </p>
              ) : null}
            </div>
            <div className="text-sm bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1 min-w-[210px]">
              <div><strong className="text-slate-600">כרטיס עבודה:</strong> <span className="font-mono font-bold text-slate-900" data-testid="garage-quote-case-number">{quote.case_number}</span></div>
              <div><strong className="text-slate-600">תאריך:</strong> <span className="font-bold text-slate-900" data-testid="garage-quote-date">{quote.quote_date}</span></div>
              <div><strong className="text-slate-600">גרסת הצעה:</strong> <span className="font-bold text-slate-900">#{quote.quote_version}</span></div>
            </div>
          </div>

          {/* Customer & Vehicle Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-blue-50/60 border border-blue-100 rounded-xl p-4">
            <div>
              <div className="text-xs text-slate-500 font-semibold">לכבוד</div>
              <div className="text-lg font-extrabold text-slate-900" data-testid="garage-quote-customer-name">
                {quote.customer_name}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 font-semibold">מספר רכב</div>
              <div className="text-lg font-extrabold font-mono text-slate-900" data-testid="garage-quote-vehicle-plate">
                {quote.vehicle_plate}
              </div>
            </div>
          </div>

          {/* Works Table */}
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 mb-3">
              פירוט העבודות – כל חלק בשורה נפרדת ({works.length} שורות)
            </h2>
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-right border-collapse" data-testid="garage-quote-works-table">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 text-xs sm:text-sm border-b border-slate-200">
                    <th className="py-3 px-3 font-bold w-12">#</th>
                    <th className="py-3 px-4 font-bold">חלק / עבודה</th>
                    <th className="py-3 px-4 font-bold">תיאור מפורט</th>
                    <th className="py-3 px-4 font-bold w-36 text-left">מחיר</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {works.map((w, idx) => {
                    const hasPrice = w.price !== null && w.price !== undefined && String(w.price).trim() !== '';
                    return (
                      <tr key={w.id || idx} className="hover:bg-slate-50/80" data-testid={`garage-quote-work-row-${idx + 1}`}>
                        <td className="py-3.5 px-3 font-bold text-slate-500 align-top">{idx + 1}.</td>
                        <td className="py-3.5 px-4 font-bold text-slate-900 align-top">{w.part || w.type || 'עבודה'}</td>
                        <td className="py-3.5 px-4 text-slate-700 align-top leading-relaxed">{w.desc || '—'}</td>
                        <td className="py-3.5 px-4 text-left align-top font-bold">
                          {hasPrice ? (
                            <span className="text-slate-900 font-extrabold">{Number(w.price).toLocaleString()} ₪</span>
                          ) : (
                            <span className="inline-block bg-amber-50 text-amber-800 border border-amber-300 text-xs font-semibold px-2.5 py-1 rounded-md">
                              ללא מחיר בשלב זה
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Parts Table (if any) */}
          {parts.length > 0 ? (
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 mb-3">
                פירוט חלקי חילוף ({parts.length})
              </h2>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 text-xs sm:text-sm border-b border-slate-200">
                      <th className="py-2.5 px-3 font-bold w-12">#</th>
                      <th className="py-2.5 px-4 font-bold">חלק</th>
                      <th className="py-2.5 px-4 font-bold">כמות</th>
                      <th className="py-2.5 px-4 font-bold text-left">מחיר</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {parts.map((p, idx) => {
                      const hasPrice = p.price !== null && p.price !== undefined && String(p.price).trim() !== '';
                      return (
                        <tr key={p.id || idx}>
                          <td className="py-3 px-3 font-bold text-slate-500">{idx + 1}.</td>
                          <td className="py-3 px-4 font-bold text-slate-900">{p.name}</td>
                          <td className="py-3 px-4 text-slate-700">{p.qty || 1}</td>
                          <td className="py-3 px-4 text-left font-bold">
                            {hasPrice ? `${Number(p.price).toLocaleString()} ₪` : 'ללא מחיר בשלב זה'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {/* Totals & VAT Summary */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3" data-testid="garage-quote-summary-box">
            <div className="flex flex-wrap items-center justify-between gap-2 text-base sm:text-lg font-extrabold text-slate-900">
              <span>
                סכום השורות המתומחרות ({quote.priced_lines_count} מתוך {totalLinesCount} עבודות):
              </span>
              <span className="text-blue-700 text-xl" data-testid="garage-quote-priced-subtotal">
                {pricedSubtotal.toLocaleString()} ₪
              </span>
            </div>

            {quote.unpriced_lines_count > 0 ? (
              <div className="text-xs sm:text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3 font-medium leading-relaxed" data-testid="garage-quote-partial-notice">
                ⚠️ <strong>הבהרה:</strong> סכום השורות המתומחרות ({pricedSubtotal.toLocaleString()} ₪) מתייחס ל-{quote.priced_lines_count} העבודות המתומחרות בלבד, ואינו מהווה מחיר סופי לכל {totalLinesCount} העבודות ({quote.unpriced_lines_count} עבודות מופיעות ללא מחיר בשלב זה).
              </div>
            ) : null}

            <div className="text-xs sm:text-sm text-slate-700 border-t border-slate-200 pt-3 leading-relaxed" data-testid="garage-quote-vat-notice">
              {quote.vat_mode === 'plus_vat' ? (
                <div className="space-y-1">
                  <div>מע"מ ({vatRate}% על השורות המתומחרות): <strong>{Math.round(pricedSubtotal * (vatRate / 100)).toLocaleString()} ₪</strong></div>
                  <div className="font-bold text-slate-900">סה"כ שורות מתומחרות כולל מע"מ ({vatRate}%): {Math.round(pricedSubtotal * (1 + vatRate / 100)).toLocaleString()} ₪</div>
                </div>
              ) : quote.vat_mode === 'includes_vat' ? (
                <div>המחירים המוצגים כוללים מע"מ לפי שיעור המס התקף בישראל ({vatRate}%).</div>
              ) : (
                <div>
                  <strong>מע"מ:</strong> מע"מ, ככל שחל, יחושב לפי שיעור המס התקף בישראל, {vatRate}%, ובהתאם להגדרת המחירים ככוללים או לא כוללים מע"מ.
                </div>
              )}
            </div>
          </div>

          {/* Damage Photos Notice at Bottom of Quote */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-2" data-testid="garage-quote-photos-note">
            <div className="font-bold text-slate-900 text-sm">
              📷 מצורפות תמונות המתעדות את הנזקים ברכב.
            </div>
            {quote.damage_photos_attached && quote.damage_photos_count > 0 ? (
              <div className="text-xs text-emerald-700 font-semibold">
                ✓ צורפו {quote.damage_photos_count} תמונות נזק מתועדות לכרטיס העבודה.
              </div>
            ) : (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 font-medium" data-testid="garage-quote-photos-missing-warning">
                ⚠️ תמונות הנזק טרם הועלו בפועל לכרטיס העבודה – יש לצרף תמונות המתעדות את הנזקים ברכב.
              </div>
            )}
          </div>

          {/* Digital Signature Section */}
          {isSigned ? (
            <div className="border-2 border-emerald-500 bg-emerald-50/50 rounded-xl p-5 space-y-4" data-testid="garage-quote-signed-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-emerald-900 font-extrabold text-lg">
                  ✅ הצעת המחיר אושרה ונחתמה דיגיטלית
                </div>
                <span className="text-xs bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-1 rounded-full font-bold">
                  גרסה #{quote.quote_version} · נעול לשינויים
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-800">
                <div><strong>שם המאשר והחותם:</strong> <span data-testid="garage-quote-signed-by">{quote.signer_name}</span></div>
                <div><strong>מועד החתימה:</strong> <span data-testid="garage-quote-signed-at">{quote.signed_at ? new Date(quote.signed_at).toLocaleString('he-IL') : '—'}</span></div>
              </div>
              {quote.signature_data_url ? (
                <div className="bg-white border border-emerald-200 rounded-xl p-3 inline-block">
                  <div className="text-xs text-slate-500 mb-1">חתימת הלקוח:</div>
                  <img
                    src={quote.signature_data_url}
                    alt="חתימת הלקוח"
                    data-testid="garage-quote-signature-img"
                    className="max-h-28 object-contain"
                  />
                </div>
              ) : null}
              {signSuccess ? (
                <div className="text-sm text-emerald-800 font-bold">
                  תודה! חתימתך נשמרה בהצלחה בכרטיס העבודה {quote.case_number}. באפשרותך להדפיס או לשמור עותק חתום.
                </div>
              ) : null}
            </div>
          ) : (
            <div className="no-print border-2 border-blue-200 bg-blue-50/30 rounded-xl p-5 space-y-4" data-testid="garage-quote-sign-form">
              <h3 className="text-lg font-extrabold text-slate-900">
                ✍️ אישור וחתימת הלקוח על הצעת המחיר
              </h3>
              <p className="text-xs sm:text-sm text-slate-600">
                אנא בדוק את פירוט העבודות והמחירים המופיעים לעיל. לאישור ההצעה (גרסה #{quote.quote_version}), הזן את שמך המלא וחתום באמצעות האצבע (בנייד) או העכבר (במחשב).
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">שם מלא של המאשר:</label>
                <input
                  type="text"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  data-testid="garage-quote-signer-name"
                  placeholder="הזן שם מלא..."
                  className="w-full sm:max-w-sm border border-slate-300 rounded-lg px-3.5 py-2 text-sm font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5 max-w-md">
                  <label className="text-xs font-bold text-slate-700">חתימה דיגיטלית (באצבע או בעכבר):</label>
                  <button
                    type="button"
                    onClick={clearSignature}
                    data-testid="garage-quote-clear-signature"
                    className="text-xs text-slate-600 hover:text-red-600 font-semibold underline"
                  >
                    נקה חתימה
                  </button>
                </div>
                <div className="border-2 border-dashed border-slate-300 rounded-xl bg-white overflow-hidden max-w-md">
                  <canvas
                    ref={canvasRef}
                    width={440}
                    height={160}
                    data-testid="garage-quote-signature-canvas"
                    className="w-full h-40 touch-none cursor-crosshair"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                </div>
              </div>

              {submitError ? (
                <div className="text-xs sm:text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 font-semibold" data-testid="garage-quote-submit-error">
                  ⚠️ {submitError}
                </div>
              ) : null}

              <div className="pt-1">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmitSignature}
                  data-testid="garage-quote-submit-signature-btn"
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-extrabold text-sm sm:text-base px-6 py-3 rounded-xl shadow-md transition"
                >
                  {submitting ? '⏳ שומר חתימה ואישור...' : '✍️ אישור וחתימה על הצעת המחיר'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
