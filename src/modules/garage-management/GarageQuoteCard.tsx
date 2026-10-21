import React, { useEffect, useState } from 'react';
import {
  DEFAULT_YONI_BRANDING,
  DEFAULT_YONI_LOGO_SVG,
  buildGarageQuotePdfFile,
  buildGarageQuotePngFile,
  downloadFileInBrowser,
  getQuoteFileName,
  loadGarageShopBranding,
  resolveShopBranding,
  saveGarageShopBranding,
  shareGarageQuoteFileNative,
  type GarageQuoteCardData,
  type GarageShopBranding,
} from './garageQuoteDoc';
import { uploadGarageMedia } from './garageMedia';
import { sendGarageMail } from './garageMail';

interface GarageQuoteCardProps {
  quote: GarageQuoteCardData;
  onOpenGarageCase?: (caseId: string) => void;
  compact?: boolean;
}

export function GarageQuoteCard({ quote, onOpenGarageCase, compact = false }: GarageQuoteCardProps) {
  const [branding, setBranding] = useState<GarageShopBranding>(() =>
    resolveShopBranding(quote.shop_branding || DEFAULT_YONI_BRANDING),
  );
  const [includeDamagePhotos, setIncludeDamagePhotos] = useState<boolean>(
    Boolean(quote.damage_photos_attached && quote.damage_photos_count > 0),
  );
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [statusToast, setStatusToast] = useState<{ type: 'ok' | 'info' | 'warn'; text: string } | null>(null);

  // Modals state
  const [shareFallbackModal, setShareFallbackModal] = useState<{
    open: boolean;
    reason: string;
    fileType: 'pdf' | 'png';
    file: File | null;
  }>({ open: false, reason: '', fileType: 'pdf', file: null });

  const [whatsAppModalOpen, setWhatsAppModalOpen] = useState(false);
  const [waPhone, setWaPhone] = useState(quote.customer_phone || quote.recipient_phone || '');

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState(quote.customer_email || quote.recipient_email || '');
  const [emailCc, setEmailCc] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailResultMsg, setEmailResultMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [brandingModalOpen, setBrandingModalOpen] = useState(false);
  const [brandingDraft, setBrandingDraft] = useState<GarageShopBranding>(branding);
  const [savingBranding, setSavingBranding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadGarageShopBranding(quote.shop_branding?.shop_company_name || '').then((loaded) => {
      if (!cancelled) {
        setBranding(loaded);
        setBrandingDraft(loaded);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [quote.shop_branding?.shop_company_name]);

  const effectiveQuote: GarageQuoteCardData = {
    ...quote,
    shop_branding: branding,
  };

  const signHref = quote.quote_token ? `/garage-quote?t=${quote.quote_token}` : '';
  const fullSignUrl = signHref
    ? `${window.location.origin}${window.location.pathname.replace(/\/+$/, '')}${signHref}`
    : '';

  const openEmailDraftModal = () => {
    const subj = `${quote.quote_title || 'הצעת מחיר – עבודות פחחות וצבע'} | ${branding.shop_title} | רכב ${quote.vehicle_plate}`;
    const lines = [
      `שלום ${quote.customer_name || ''},`,
      '',
      `מצורפת הצעת מחיר מס׳ ${quote.case_number} (גרסה #${quote.quote_version || 1}) מאת ${branding.shop_title} עבור רכב מס׳ ${quote.vehicle_plate}.`,
      `סכום השורות המתומחרות: ${Number(quote.priced_subtotal || 0).toLocaleString()} ₪${quote.unpriced_lines_count > 0 ? ` (קיימות ${quote.unpriced_lines_count} שורות ללא מחיר בשלב זה)` : ''}.`,
      fullSignUrl ? `\nלצפייה בהצעת המחיר ולאישור בחתימה דיגיטלית:\n${fullSignUrl}` : '',
      '',
      `בברכה,`,
      branding.shop_title,
      branding.phone ? `טלפון: ${branding.phone}` : '',
    ].filter((l) => l !== undefined);
    setEmailSubject(subj);
    setEmailBody(lines.join('\n'));
    setEmailResultMsg(null);
    setEmailModalOpen(true);
  };

  const handleDownloadPdf = async () => {
    setBusyAction('pdf');
    setStatusToast(null);
    try {
      const pdfFile = await buildGarageQuotePdfFile(effectiveQuote, {
        includeDamagePhotos,
        brandingOverride: branding,
      });
      downloadFileInBrowser(pdfFile);
      setStatusToast({
        type: 'ok',
        text: `✓ קובץ ה-PDF המעוצב (${pdfFile.name}) הורד בהצלחה למכשיר.`,
      });
    } catch (err) {
      setStatusToast({
        type: 'warn',
        text: `שגיאה בהפקת PDF: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleDownloadPng = async () => {
    setBusyAction('png');
    setStatusToast(null);
    try {
      const pngFile = await buildGarageQuotePngFile(effectiveQuote, {
        includeDamagePhotos,
        brandingOverride: branding,
      });
      downloadFileInBrowser(pngFile);
      setStatusToast({
        type: 'ok',
        text: `✓ תמונת הצעת המחיר (${pngFile.name}) הורדה בהצלחה למכשיר.`,
      });
    } catch (err) {
      setStatusToast({
        type: 'warn',
        text: `שגיאה בהפקת תמונה: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleNativeShare = async (fileType: 'pdf' | 'png' = 'pdf') => {
    setBusyAction(`share-${fileType}`);
    setStatusToast(null);
    try {
      const file =
        fileType === 'png'
          ? await buildGarageQuotePngFile(effectiveQuote, { includeDamagePhotos, brandingOverride: branding })
          : await buildGarageQuotePdfFile(effectiveQuote, { includeDamagePhotos, brandingOverride: branding });

      const res = await shareGarageQuoteFileNative(file, effectiveQuote);
      if (res.shared) {
        setStatusToast({
          type: 'ok',
          text: `✓ חלונית השיתוף של המכשיר נפתחה עם קובץ ההצעה (${file.name}).`,
        });
      } else if (res.mode === 'fallback_needed') {
        setShareFallbackModal({
          open: true,
          reason: res.reason || 'שיתוף קובץ ישיר אינו נתמך בדפדפן זה. ניתן להוריד את הקובץ ולשתף ידנית.',
          fileType,
          file,
        });
      }
    } catch (err) {
      setStatusToast({
        type: 'warn',
        text: `שגיאה בהכנת קובץ לשיתוף: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handlePrint = () => {
    if (signHref) {
      window.open(`${signHref}${signHref.includes('?') ? '&' : '?'}print=1`, '_blank', 'noopener,noreferrer');
    } else {
      window.print();
    }
  };

  const handleOpenWorkCard = () => {
    if (onOpenGarageCase && quote.case_id) {
      onOpenGarageCase(quote.case_id);
    } else if (quote.case_id) {
      window.location.hash = `#/garage-management/${quote.case_id}`;
    }
  };

  const handleApproveAndSendEmail = async () => {
    const cleanTo = emailTo.trim();
    if (!cleanTo || !cleanTo.includes('@')) {
      setEmailResultMsg({ ok: false, text: 'נא להזין כתובת אימייל תקינה של הנמען.' });
      return;
    }
    setEmailSending(true);
    setEmailResultMsg(null);
    try {
      // 1. Generate the branded PDF File
      const pdfFile = await buildGarageQuotePdfFile(effectiveQuote, {
        includeDamagePhotos,
        brandingOverride: branding,
      });

      // 2. Upload the generated PDF to garage_media on this work card so it is archived & attachable
      let mediaIds: string[] = [];
      if (quote.case_id) {
        try {
          const buf = await pdfFile.arrayBuffer();
          const uploaded = await uploadGarageMedia({
            garageCaseId: quote.case_id,
            category: 'quotes',
            title: `${quote.quote_title || 'הצעת מחיר'} – ${quote.case_number}`,
            fileName: pdfFile.name,
            mimeType: 'application/pdf',
            bytes: buf,
          });
          if (uploaded?.id) {
            mediaIds = [uploaded.id];
          }
        } catch (upErr) {
          console.warn('Could not upload quote PDF to garage_media before mail send:', upErr);
        }
      }

      // 3. Try sending via connected garage-gmail
      if (quote.case_id) {
        const sent = await sendGarageMail({
          caseId: quote.case_id,
          to: cleanTo,
          cc: emailCc.trim(),
          subject: emailSubject.trim(),
          body: emailBody.trim(),
          mediaIds,
          kind: 'quote',
        });

        if (sent.ok && sent.realEmailSend) {
          setEmailResultMsg({
            ok: true,
            text: `✅ האימייל נשלח בהצלחה ל-${cleanTo} מתיבת המוסך עם קובץ ההצעה (${pdfFile.name})!`,
          });
          return;
        }
      }

      // 4. Fallback if garage-gmail OAuth is not currently connected: download the PDF and open mail client draft
      downloadFileInBrowser(pdfFile);
      const mailtoUrl = `mailto:${encodeURIComponent(cleanTo)}?${emailCc.trim() ? `cc=${encodeURIComponent(emailCc.trim())}&` : ''}subject=${encodeURIComponent(emailSubject.trim())}&body=${encodeURIComponent(emailBody.trim())}`;
      window.open(mailtoUrl, '_blank');
      setEmailResultMsg({
        ok: true,
        text: `✅ קובץ ה-PDF המעוצב (${pdfFile.name}) הורד למכשיר ונפתחה טיוטת האימייל ל-${cleanTo} לאישור ושליחה.`,
      });
    } catch (err) {
      setEmailResultMsg({
        ok: false,
        text: `שגיאה בשליחת האימייל: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setEmailSending(false);
    }
  };

  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setBrandingDraft((prev) => ({ ...prev, logo_url: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSaveBranding = async () => {
    setSavingBranding(true);
    try {
      const saved = await saveGarageShopBranding(brandingDraft);
      setBranding(saved);
      setBrandingModalOpen(false);
      setStatusToast({
        type: 'ok',
        text: `✓ מיתוג המוסך ("${saved.shop_title}") נשמר ועודכן בהצעת המחיר.`,
      });
    } catch (err) {
      setStatusToast({
        type: 'warn',
        text: `שגיאה בשמירת מיתוג: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setSavingBranding(false);
    }
  };

  const works = Array.isArray(quote.quote_works) ? quote.quote_works : [];
  const parts = Array.isArray(quote.quote_parts) ? quote.quote_parts : [];
  const isSigned = quote.status === 'signed' || Boolean(quote.signature_data_url);

  return (
    <div
      dir="rtl"
      className="garage-quote-chat-card"
      data-testid="garage-quote-card"
      style={{
        marginTop: 12,
        background: '#ffffff',
        color: '#0f172a',
        borderRadius: 14,
        border: '2px solid #cbd5e1',
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.18)',
        overflow: 'hidden',
        fontFamily: 'Heebo, Arial, sans-serif',
      }}
    >
      {/* 1. Branded Garage Header (Never Dalia — Always the Garage's own branding!) */}
      <div
        data-testid="garage-quote-card-header"
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: '#ffffff',
          padding: '14px 16px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          borderBottom: '3px solid #0284c7',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img
            src={branding.logo_url || DEFAULT_YONI_LOGO_SVG}
            alt={branding.shop_title}
            data-testid="garage-quote-card-logo"
            style={{
              height: 48,
              width: 'auto',
              maxWidth: 140,
              objectFit: 'contain',
              borderRadius: 8,
              background: '#0f172a',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              padding: 2,
            }}
          />
          <div>
            <div
              data-testid="garage-quote-card-shop-title"
              style={{ fontSize: '1.1rem', fontWeight: 900, color: '#ffffff', lineHeight: 1.2 }}
            >
              {branding.shop_title || 'מוסך יוני – פחחות וצבע לרכב'}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#38bdf8', fontWeight: 700, marginTop: 2 }}>
              {branding.subtitle || 'מומחים לפחחות, צבע ושיקום רכב'}
            </div>
            {(branding.phone || branding.email || branding.address || branding.business_id) ? (
              <div style={{ fontSize: '0.72rem', color: '#cbd5e1', marginTop: 3 }}>
                {[
                  branding.phone ? `טל׳: ${branding.phone}` : '',
                  branding.email ? `דוא״ל: ${branding.email}` : '',
                  branding.address ? branding.address : '',
                  branding.business_id ? `ח.פ./ע.מ.: ${branding.business_id}` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: '0.74rem',
              fontWeight: 800,
              padding: '4px 10px',
              borderRadius: 999,
              background: isSigned ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
              color: isSigned ? '#6ee7b7' : '#fde68a',
              border: `1px solid ${isSigned ? '#10b981' : '#f59e0b'}`,
            }}
          >
            {isSigned ? '✓ נחתם דיגיטלית' : `גרסה #${quote.quote_version || 1} · מוכן לשליחה`}
          </span>
          <button
            type="button"
            onClick={() => {
              setBrandingDraft(branding);
              setBrandingModalOpen(true);
            }}
            data-testid="garage-quote-card-branding-btn"
            title="הגדרות מיתוג ולוגו המוסך"
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#e2e8f0',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              borderRadius: 8,
              padding: '5px 10px',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ⚙️ מיתוג המוסך
          </button>
        </div>
      </div>

      {/* 2. Quote Metadata & Customer/Vehicle Banner */}
      <div style={{ padding: '14px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div>
            <div
              data-testid="garage-quote-card-title"
              style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0f172a' }}
            >
              {quote.quote_title || 'הצעת מחיר – עבודות פחחות וצבע'}
            </div>
            {quote.work_type ? (
              <div style={{ fontSize: '0.82rem', color: '#475569', fontWeight: 600, marginTop: 2 }}>
                סוג עבודה: {quote.work_type}
              </div>
            ) : null}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#334155', textAlign: 'left', fontWeight: 700 }}>
            <div>כרטיס עבודה: <span style={{ fontFamily: 'monospace', fontWeight: 900 }}>{quote.case_number}</span></div>
            <div>תאריך: {quote.quote_date}</div>
          </div>
        </div>

        <div
          style={{
            marginTop: 10,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 10,
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: 10,
            padding: '8px 12px',
          }}
        >
          <div>
            <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700 }}>לכבוד (לקוח)</div>
            <div data-testid="garage-quote-card-customer" style={{ fontSize: '0.92rem', fontWeight: 900, color: '#0f172a' }}>
              {quote.customer_name}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700 }}>מספר רכב</div>
            <div data-testid="garage-quote-card-plate" style={{ fontSize: '0.92rem', fontWeight: 900, fontFamily: 'monospace', color: '#0f172a' }}>
              {quote.vehicle_plate}{quote.vehicle_label ? ` (${quote.vehicle_label})` : ''}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Works Breakdown Table */}
      {!compact && (
        <div style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>
            🛠️ פירוט העבודות ({works.length} שורות):
          </div>
          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'right' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', color: '#334155', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '8px 8px', width: 28 }}>#</th>
                  <th style={{ padding: '8px 10px' }}>חלק / עבודה</th>
                  <th style={{ padding: '8px 10px' }}>תיאור</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', width: 115 }}>מחיר</th>
                </tr>
              </thead>
              <tbody>
                {works.map((w, idx) => {
                  const hasPrice = w.price !== null && w.price !== undefined && String(w.price).trim() !== '' && !w.unpriced;
                  return (
                    <tr key={w.id || idx} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                      <td style={{ padding: '8px', fontWeight: 700, color: '#64748b', verticalAlign: 'top' }}>{idx + 1}.</td>
                      <td style={{ padding: '8px 10px', fontWeight: 800, color: '#0f172a', verticalAlign: 'top' }}>{w.part || w.type || 'עבודה'}</td>
                      <td style={{ padding: '8px 10px', color: '#334155', verticalAlign: 'top', lineHeight: 1.4 }}>{w.desc || '—'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 800, verticalAlign: 'top' }}>
                        {hasPrice ? (
                          <span style={{ color: '#0f172a' }}>{((Number(w.price) || 0) * (Number(w.qty) || 1)).toLocaleString()} ₪</span>
                        ) : (
                          <span
                            style={{
                              display: 'inline-block',
                              background: '#fffbeb',
                              color: '#92400e',
                              border: '1px solid #fcd34d',
                              fontSize: '0.72rem',
                              padding: '2px 6px',
                              borderRadius: 6,
                              fontWeight: 700,
                            }}
                          >
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

          {/* Parts Table if any */}
          {parts.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>
                🔩 חלקי חילוף ({parts.length}):
              </div>
              {parts.map((p, idx) => (
                <div key={p.id || idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '4px 8px', background: '#f8fafc', borderRadius: 6, marginBottom: 4 }}>
                  <span>{p.name} × {p.qty || 1}</span>
                  <strong>{p.supplier === 'customer' ? 'מסופק ע"י לקוח' : `${((Number(p.price) || 0) * (Number(p.qty) || 1)).toLocaleString()} ₪`}</strong>
                </div>
              ))}
            </div>
          )}

          {/* Totals & VAT Summary */}
          <div
            style={{
              marginTop: 12,
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: 10,
              padding: '10px 14px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 900, fontSize: '0.95rem', color: '#0f172a' }}>
              <span>סה"כ עבור {quote.priced_lines_count} השורות המתומחרות בלבד:</span>
              <span data-testid="garage-quote-card-subtotal" style={{ fontSize: '1.1rem', color: '#0284c7' }}>
                {Number(quote.priced_subtotal || 0).toLocaleString()} ₪
              </span>
            </div>
            {quote.unpriced_lines_count > 0 && (
              <div style={{ fontSize: '0.76rem', color: '#b45309', fontWeight: 700, marginTop: 4 }}>
                ⚠️ סכום הביניים מתייחס ל-{quote.priced_lines_count} העבודות המתומחרות בלבד ואינו סופי ({quote.unpriced_lines_count} שורות מוגדרות "ללא מחיר בשלב זה").
              </div>
            )}
            <div style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600, marginTop: 4 }}>
              מע"מ ({quote.vat_rate || 18}%): מע"מ, ככל שחל, יחושב לפי שיעור המס התקף בישראל, <strong>18%</strong>, ובהתאם להגדרת המחירים ככוללים או לא כוללים מע"מ.
            </div>
          </div>

          {/* Optional Toggle for Damage Photos */}
          <div
            style={{
              marginTop: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#f1f5f9',
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: '0.8rem',
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 700, color: '#1e293b' }}>
              <input
                type="checkbox"
                checked={includeDamagePhotos}
                onChange={(e) => setIncludeDamagePhotos(e.target.checked)}
                data-testid="garage-quote-card-toggle-photos"
                style={{ width: 16, height: 16, accentColor: '#0284c7', cursor: 'pointer' }}
              />
              <span>
                📷 צרף תמונות נזק וסעיף תיעוד להצעת המחיר
                {quote.damage_photos_count > 0 ? ` (${quote.damage_photos_count} תמונות שמורות בתיק)` : ' (טרם הועלו תמונות נזק בתיק)'}
              </span>
            </label>
          </div>
        </div>
      )}

      {/* 4. Action Buttons Bar (PDF, Share, Share Image, WhatsApp, Email, Print, Open Case) */}
      <div
        data-testid="garage-quote-card-actions"
        style={{
          padding: '12px 16px',
          background: '#f1f5f9',
          borderTop: '1px solid #e2e8f0',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
          gap: 8,
        }}
      >
        {/* 1. Download PDF */}
        <button
          type="button"
          onClick={() => void handleDownloadPdf()}
          disabled={busyAction !== null}
          data-testid="garage-quote-card-download-pdf"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '9px 12px',
            borderRadius: 9,
            background: '#0f172a',
            color: '#ffffff',
            border: 'none',
            fontWeight: 800,
            fontSize: '0.82rem',
            cursor: 'pointer',
            minHeight: 40,
          }}
        >
          {busyAction === 'pdf' ? '⏳ מפיק PDF...' : '📄 הורדת PDF'}
        </button>

        {/* 2. Native Phone Share (PDF File) */}
        <button
          type="button"
          onClick={() => void handleNativeShare('pdf')}
          disabled={busyAction !== null}
          data-testid="garage-quote-card-share"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '9px 12px',
            borderRadius: 9,
            background: '#0284c7',
            color: '#ffffff',
            border: 'none',
            fontWeight: 800,
            fontSize: '0.82rem',
            cursor: 'pointer',
            minHeight: 40,
          }}
        >
          {busyAction === 'share-pdf' ? '⏳ מכין קובץ...' : '📤 שיתוף'}
        </button>

        {/* 2b. Share as Image */}
        <button
          type="button"
          onClick={() => void handleNativeShare('png')}
          disabled={busyAction !== null}
          data-testid="garage-quote-card-share-image"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '9px 12px',
            borderRadius: 9,
            background: '#ffffff',
            color: '#0f172a',
            border: '1.5px solid #cbd5e1',
            fontWeight: 800,
            fontSize: '0.82rem',
            cursor: 'pointer',
            minHeight: 40,
          }}
        >
          {busyAction === 'share-png' ? '⏳ מכין תמונה...' : '🖼️ שיתוף כתמונה'}
        </button>

        {/* 3. Send via WhatsApp */}
        <button
          type="button"
          onClick={() => setWhatsAppModalOpen(true)}
          disabled={busyAction !== null}
          data-testid="garage-quote-card-whatsapp"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '9px 12px',
            borderRadius: 9,
            background: '#16a34a',
            color: '#ffffff',
            border: 'none',
            fontWeight: 800,
            fontSize: '0.82rem',
            cursor: 'pointer',
            minHeight: 40,
          }}
        >
          💬 שליחה בוואטסאפ
        </button>

        {/* 4. Send via Email (Draft with User Approval) */}
        <button
          type="button"
          onClick={openEmailDraftModal}
          disabled={busyAction !== null}
          data-testid="garage-quote-card-email"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '9px 12px',
            borderRadius: 9,
            background: '#2563eb',
            color: '#ffffff',
            border: 'none',
            fontWeight: 800,
            fontSize: '0.82rem',
            cursor: 'pointer',
            minHeight: 40,
          }}
        >
          ✉️ שליחה באימייל
        </button>

        {/* 5. Print */}
        <button
          type="button"
          onClick={handlePrint}
          data-testid="garage-quote-card-print"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '9px 12px',
            borderRadius: 9,
            background: '#ffffff',
            color: '#0f172a',
            border: '1.5px solid #cbd5e1',
            fontWeight: 800,
            fontSize: '0.82rem',
            cursor: 'pointer',
            minHeight: 40,
          }}
        >
          🖨️ הדפסה
        </button>

        {/* 6. Open Work Card */}
        <button
          type="button"
          onClick={handleOpenWorkCard}
          data-testid="garage-quote-card-open-case"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '9px 12px',
            borderRadius: 9,
            background: '#ffffff',
            color: '#0284c7',
            border: '1.5px solid #0284c7',
            fontWeight: 800,
            fontSize: '0.82rem',
            cursor: 'pointer',
            minHeight: 40,
          }}
        >
          🚗 פתיחת כרטיס העבודה
        </button>
      </div>

      {/* Status Toast */}
      {statusToast && (
        <div
          data-testid="garage-quote-card-toast"
          style={{
            padding: '8px 16px',
            background: statusToast.type === 'ok' ? '#ecfdf5' : statusToast.type === 'warn' ? '#fef2f2' : '#eff6ff',
            color: statusToast.type === 'ok' ? '#065f46' : statusToast.type === 'warn' ? '#991b1b' : '#1e40af',
            borderTop: '1px solid #e2e8f0',
            fontSize: '0.8rem',
            fontWeight: 700,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{statusToast.text}</span>
          <button
            type="button"
            onClick={() => setStatusToast(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 900, color: 'inherit' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Modal 1: Native Share Fallback Modal (when navigator.canShare({files}) is unsupported on desktop) */}
      {shareFallbackModal.open && (
        <div
          data-testid="garage-quote-share-fallback-modal"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.72)',
            zIndex: 100000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setShareFallbackModal((prev) => ({ ...prev, open: false }))}
        >
          <div
            style={{
              background: '#ffffff',
              color: '#0f172a',
              borderRadius: 14,
              maxWidth: 440,
              width: '100%',
              padding: 20,
              boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900 }}>📤 שיתוף קובץ הצעת המחיר</h3>
              <button
                type="button"
                data-testid="garage-quote-share-fallback-close"
                onClick={() => setShareFallbackModal((prev) => ({ ...prev, open: false }))}
                style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: '0.84rem', color: '#475569', lineHeight: 1.5, margin: '0 0 12px' }}>
              {shareFallbackModal.reason}
            </p>
            <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 10, padding: 12, marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#0f172a' }}>
                📎 קובץ מוכן: {shareFallbackModal.file?.name || getQuoteFileName(effectiveQuote, shareFallbackModal.fileType)}
              </div>
              <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 2 }}>
                מותג: {branding.shop_title} · כרטיס {quote.case_number}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                data-testid="garage-quote-fallback-download-pdf"
                onClick={() => {
                  if (shareFallbackModal.file) {
                    downloadFileInBrowser(shareFallbackModal.file);
                  } else {
                    void handleDownloadPdf();
                  }
                }}
                style={{
                  padding: '10px 14px',
                  borderRadius: 9,
                  background: '#0f172a',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                📥 הורד קובץ ({shareFallbackModal.fileType.toUpperCase()}) לשיתוף ידני
              </button>
              <button
                type="button"
                data-testid="garage-quote-fallback-download-png"
                onClick={() => void handleDownloadPng()}
                style={{
                  padding: '10px 14px',
                  borderRadius: 9,
                  background: '#f1f5f9',
                  color: '#0f172a',
                  border: '1px solid #cbd5e1',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                🖼️ הורד כתמונה (PNG) לשיתוף בוואטסאפ
              </button>
              <button
                type="button"
                onClick={() => {
                  setShareFallbackModal((prev) => ({ ...prev, open: false }));
                  setWhatsAppModalOpen(true);
                }}
                style={{
                  padding: '10px 14px',
                  borderRadius: 9,
                  background: '#16a34a',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                💬 המשך לשליחה בוואטסאפ
              </button>
              <button
                type="button"
                onClick={() => {
                  setShareFallbackModal((prev) => ({ ...prev, open: false }));
                  openEmailDraftModal();
                }}
                style={{
                  padding: '10px 14px',
                  borderRadius: 9,
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                ✉️ המשך לשליחה באימייל
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: WhatsApp Share & Approval Modal */}
      {whatsAppModalOpen && (
        <div
          data-testid="garage-quote-whatsapp-modal"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.72)',
            zIndex: 100000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setWhatsAppModalOpen(false)}
        >
          <div
            style={{
              background: '#ffffff',
              color: '#0f172a',
              borderRadius: 14,
              maxWidth: 460,
              width: '100%',
              padding: 20,
              boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: '#15803d' }}>
                💬 שליחת הצעת מחיר בוואטסאפ (באישור המשתמש)
              </h3>
              <button
                type="button"
                data-testid="garage-quote-wa-modal-close"
                onClick={() => setWhatsAppModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: '0.82rem', color: '#334155', marginBottom: 12, lineHeight: 1.5 }}>
              בחר כיצד לשתף את הצעת המחיר של <strong>{quote.customer_name}</strong> (רכב <strong>{quote.vehicle_plate}</strong>) מטעם <strong>{branding.shop_title}</strong>. השליחה מתבצעת רק לאחר בחירת הנמען ואישורך:
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                type="button"
                data-testid="garage-quote-wa-native-file-btn"
                onClick={async () => {
                  const file = await buildGarageQuotePdfFile(effectiveQuote, {
                    includeDamagePhotos,
                    brandingOverride: branding,
                  });
                  const shared = await shareGarageQuoteFileNative(file, effectiveQuote);
                  if (!shared.shared && shared.mode === 'fallback_needed') {
                    downloadFileInBrowser(file);
                    setStatusToast({
                      type: 'info',
                      text: `קובץ ה-PDF (${file.name}) הורד למכשיר. כעת ניתן לצרף אותו בוואטסאפ.`,
                    });
                  }
                }}
                style={{
                  padding: '11px 14px',
                  borderRadius: 10,
                  background: '#16a34a',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: '0.86rem',
                  cursor: 'pointer',
                }}
              >
                📤 שתף קובץ PDF ישירות לוואטסאפ (מובייל / שיתוף מובנה)
              </button>

              <button
                type="button"
                data-testid="garage-quote-wa-native-image-btn"
                onClick={async () => {
                  const file = await buildGarageQuotePngFile(effectiveQuote, {
                    includeDamagePhotos,
                    brandingOverride: branding,
                  });
                  const shared = await shareGarageQuoteFileNative(file, effectiveQuote);
                  if (!shared.shared && shared.mode === 'fallback_needed') {
                    downloadFileInBrowser(file);
                  }
                }}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: '#f0fdf4',
                  color: '#166534',
                  border: '1.5px solid #86efac',
                  fontWeight: 800,
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                }}
              >
                🖼️ שתף הצעת מחיר כתמונה (PNG) לוואטסאפ
              </button>

              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10, marginTop: 4 }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  מספר טלפון של הנמען (אופציונלי — ניתן גם לבחור איש קשר ישירות בוואטסאפ):
                </label>
                <input
                  type="tel"
                  value={waPhone}
                  onChange={(e) => setWaPhone(e.target.value)}
                  placeholder="לדוגמה: 050-1234567"
                  data-testid="garage-quote-wa-phone-input"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.88rem',
                    marginBottom: 8,
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  type="button"
                  data-testid="garage-quote-wa-open-btn"
                  onClick={async () => {
                    const pdfFile = await buildGarageQuotePdfFile(effectiveQuote, {
                      includeDamagePhotos,
                      brandingOverride: branding,
                    });
                    downloadFileInBrowser(pdfFile);
                    const cleanDigits = waPhone.replace(/\D/g, '');
                    const intlPhone = cleanDigits.startsWith('0') ? `972${cleanDigits.slice(1)}` : cleanDigits;
                    const msgLines = [
                      `שלום ${quote.customer_name || ''},`,
                      `מצורפת הצעת מחיר (${quote.case_number}) מאת *${branding.shop_title}* עבור רכב *${quote.vehicle_plate}*.`,
                      `סה"כ עבור ${quote.priced_lines_count} השורות המתומחרות: *${Number(quote.priced_subtotal || 0).toLocaleString()} ₪*${quote.unpriced_lines_count > 0 ? ` (${quote.unpriced_lines_count} שורות ללא מחיר בשלב זה)` : ''}.`,
                      fullSignUrl ? `לצפייה בהצעה המלאה ולאישור בחתימה דיגיטלית:\n${fullSignUrl}` : '',
                    ]
                      .filter(Boolean)
                      .join('\n');
                    const waUrl = intlPhone
                      ? `https://wa.me/${intlPhone}?text=${encodeURIComponent(msgLines)}`
                      : `https://wa.me/?text=${encodeURIComponent(msgLines)}`;
                    window.open(waUrl, '_blank', 'noopener,noreferrer');
                    setWhatsAppModalOpen(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 9,
                    background: '#0f172a',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 800,
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                  }}
                >
                  📥 הורד PDF ופתח שיחת וואטסאפ לאישור ושליחה
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Email Draft & Explicit Approval Modal */}
      {emailModalOpen && (
        <div
          data-testid="garage-quote-email-modal"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.72)',
            zIndex: 100000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setEmailModalOpen(false)}
        >
          <div
            style={{
              background: '#ffffff',
              color: '#0f172a',
              borderRadius: 14,
              maxWidth: 500,
              width: '100%',
              padding: 20,
              boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: '#1d4ed8' }}>
                ✉️ טיוטת אימייל לאישור לפני שליחה
              </h3>
              <button
                type="button"
                data-testid="garage-quote-email-modal-close"
                onClick={() => setEmailModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div
              data-testid="garage-quote-email-attachment-badge"
              style={{
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: '0.8rem',
                fontWeight: 700,
                color: '#1e40af',
                marginBottom: 12,
              }}
            >
              📎 קובץ מצורף לטיוטה: <strong>{getQuoteFileName(effectiveQuote, 'pdf')}</strong> (מותג: {branding.shop_title})
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  אל (כתובת אימייל נמען):
                </label>
                <input
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="client@example.com"
                  data-testid="garage-quote-email-to-input"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.86rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  עותק (CC - אופציונלי):
                </label>
                <input
                  type="email"
                  value={emailCc}
                  onChange={(e) => setEmailCc(e.target.value)}
                  placeholder="cc@example.com"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.84rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  נושא ההודעה:
                </label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  data-testid="garage-quote-email-subject-input"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.86rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  תוכן ההודעה:
                </label>
                <textarea
                  rows={5}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  data-testid="garage-quote-email-body-input"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.84rem',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {emailResultMsg && (
                <div
                  data-testid="garage-quote-email-result"
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: emailResultMsg.ok ? '#ecfdf5' : '#fef2f2',
                    color: emailResultMsg.ok ? '#065f46' : '#991b1b',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                  }}
                >
                  {emailResultMsg.text}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  disabled={emailSending}
                  onClick={() => void handleApproveAndSendEmail()}
                  data-testid="garage-quote-email-approve-send-btn"
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: 9,
                    background: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 800,
                    fontSize: '0.86rem',
                    cursor: 'pointer',
                  }}
                >
                  {emailSending ? '⏳ שולח אימייל...' : '✅ אשר ושלח אימייל עם קובץ ההצעה'}
                </button>
                <button
                  type="button"
                  onClick={() => setEmailModalOpen(false)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 9,
                    background: '#f1f5f9',
                    color: '#334155',
                    border: '1px solid #cbd5e1',
                    fontWeight: 700,
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                  }}
                >
                  ביטול
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Per-Garage Branding Settings Modal */}
      {brandingModalOpen && (
        <div
          data-testid="garage-branding-modal"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.72)',
            zIndex: 100000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setBrandingModalOpen(false)}
        >
          <div
            style={{
              background: '#ffffff',
              color: '#0f172a',
              borderRadius: 14,
              maxWidth: 480,
              width: '100%',
              padding: 20,
              boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900 }}>
                ⚙️ הגדרות מיתוג אישי למוסך
              </h3>
              <button
                type="button"
                onClick={() => setBrandingModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: '0.78rem', color: '#475569', margin: '0 0 12px', lineHeight: 1.4 }}>
              פרטי המוסך והלוגו מופיעים בראש כל הצעת מחיר, קובץ PDF, תמונה והדפסה של המוסך שלך בלבד.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>
                  כותרת המוסך בהצעת המחיר:
                </label>
                <input
                  type="text"
                  data-testid="garage-branding-title-input"
                  value={brandingDraft.shop_title}
                  onChange={(e) => setBrandingDraft((prev) => ({ ...prev, shop_title: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>
                  תת-כותרת / תחום התמחות:
                </label>
                <input
                  type="text"
                  value={brandingDraft.subtitle}
                  onChange={(e) => setBrandingDraft((prev) => ({ ...prev, subtitle: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>
                    טלפון המוסך:
                  </label>
                  <input
                    type="text"
                    data-testid="garage-branding-phone-input"
                    value={brandingDraft.phone}
                    onChange={(e) => setBrandingDraft((prev) => ({ ...prev, phone: e.target.value }))}
                    placeholder="050-0000000"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>
                    ח.פ. / עוסק מורשה:
                  </label>
                  <input
                    type="text"
                    value={brandingDraft.business_id}
                    onChange={(e) => setBrandingDraft((prev) => ({ ...prev, business_id: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>
                    דוא"ל המוסך:
                  </label>
                  <input
                    type="email"
                    value={brandingDraft.email}
                    onChange={(e) => setBrandingDraft((prev) => ({ ...prev, email: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>
                    כתובת המוסך:
                  </label>
                  <input
                    type="text"
                    value={brandingDraft.address}
                    onChange={(e) => setBrandingDraft((prev) => ({ ...prev, address: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>
                  לוגו המוסך (העלאת קובץ תמונה):
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <img
                    src={brandingDraft.logo_url || DEFAULT_YONI_LOGO_SVG}
                    alt="לוגו"
                    style={{ height: 44, width: 'auto', borderRadius: 6, background: '#0f172a', padding: 4 }}
                  />
                  <label
                    style={{
                      padding: '7px 12px',
                      borderRadius: 8,
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    📤 העלה לוגו מותאם
                    <input type="file" accept="image/*" onChange={handleLogoFileUpload} style={{ display: 'none' }} />
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  disabled={savingBranding}
                  onClick={() => void handleSaveBranding()}
                  data-testid="garage-branding-save-btn"
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: 9,
                    background: '#0f172a',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {savingBranding ? 'שומר...' : '💾 שמור מיתוג המוסך'}
                </button>
                <button
                  type="button"
                  onClick={() => setBrandingModalOpen(false)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 9,
                    background: '#f1f5f9',
                    color: '#334155',
                    border: '1px solid #cbd5e1',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  ביטול
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
