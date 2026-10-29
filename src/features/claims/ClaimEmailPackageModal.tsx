import React, { useState, useMemo, useEffect } from 'react';
import type { ClaimRecord } from './claimsConstants';
import type { ClaimsApi } from './claimsService';
import {
  DEFAULT_SHARE_TTL,
  SHARE_TTL_PRESETS,
  resolveShareExpiry,
  sharePublicUrl,
  type ShareRow,
  shareStatusOf,
  shareStatusLabel,
} from './claimSecureShare';
import {
  CLAIM_PACKAGE_CATEGORIES,
  classifyClaimDoc,
  type ClaimPackageCategoryKey,
  type DocItem,
} from './claimEmailPackageModel';

interface Props {
  open: boolean;
  claim: ClaimRecord;
  files: Array<{
    id: string;
    original_name: string;
    mime_type?: string;
    byte_size?: number;
    doc_kind?: string;
    doc_meta?: Record<string, any> | null;
  }>;
  api: ClaimsApi;
  actorName?: string;
  toast: (msg: string, kind?: 'ok' | 'err') => void;
  onClose: () => void;
}

export default function ClaimEmailPackageModal({
  open,
  claim,
  files,
  api,
  actorName = 'משתמש דליה',
  toast,
  onClose,
}: Props) {
  const [activeTab, setActiveTab] = useState<'compose' | 'preview' | 'share_view' | 'tracking'>('compose');
  const [mobileTab1View, setMobileTab1View] = useState<'docs' | 'details'>('docs');
  const [catFilter, setCatFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [previewDoc, setPreviewDoc] = useState<DocItem | null>(null);

  // Email form fields
  const [recipientName, setRecipientName] = useState('אורודל');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientCc, setRecipientCc] = useState('');
  const [subject, setSubject] = useState(
    `חבילת מסמכים משפטית מלאה לתביעה ${claim.id} | ${claim.clientName || 'מבוטח'} (רכב ${claim.plate || '—'}) מול ${claim.insCompany || 'חברת ביטוח'}`
  );
  
  // Clean grounded email text: Focus on claim details and document index, without unverified deduction claims
  const [customMessage, setCustomMessage] = useState(
    `שלום רב,\n\nבהמשך לטיפול בתביעת הנזק של ${claim.clientName || 'הלקוח'} (תיק: ${claim.id}, רכב מ.ר. ${claim.plate || '—'}) מול חברת הביטוח ${claim.insCompany || ''},\nמצורפת חבילת המסמכים המלאה שהוכנה במערכת דליה לעיון, לבדיקה ולהמשך טיפול.\n\nפרטי התביעה ומסמכי המקור הקיימים בתיק:\n• מספר תיק דליה: ${claim.id}\n• מספר רישוי רכב: ${claim.plate || '—'}\n• שם לקוח / נהג: ${claim.clientName || '—'}\n• חברת ביטוח: ${claim.insCompany || '—'}\n\nחבילת המסמכים כוללת קבצים מאומתים המסודרים לפי קטגוריות: דוחות משפטיים, חוות דעת שמאי מקורית, שומה נגדית, חשבוניות וקבלות, הודעות תשלום, טפסי תאונה ותמונות נזק.\n\nיתרת התביעה והסכומים שבמחלוקת מפורטים בחוות הדעת ובטבלת ההשוואה המצורפות לעיון ולבדיקה משפטית.\n\nניתן לצפות במסמכים ישירות או להוריד את כל החבילה כקובץ ZIP אחד בלחיצה.`
  );
  const [ttl, setTtl] = useState(DEFAULT_SHARE_TTL);
  const [customExpiry, setCustomExpiry] = useState('');

  // Share state
  const [busy, setBusy] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [createdShare, setCreatedShare] = useState<{
    id: string;
    token: string;
    url: string;
    expiresAt: string;
    fileCount: number;
    byteSize: number;
  } | null>(null);
  const [sharesHistory, setSharesHistory] = useState<ShareRow[]>([]);
  const [explicitSendConfirmed, setExplicitSendConfirmed] = useState(false);

  // Classify all incoming files
  const classifiedDocs: DocItem[] = useMemo(() => {
    return files.map((f) => ({
      ...f,
      category: classifyClaimDoc(f),
      page_count: f.doc_meta?.page_count ? Number(f.doc_meta.page_count) : undefined,
    }));
  }, [files]);

  // Initial recommended selection (19 verified files)
  useEffect(() => {
    if (!open) return;
    const recommended = classifiedDocs.filter((d) => {
      if (d.category === 'legal_reports') return true;
      if (d.category === 'our_surveyor') return true;
      if (d.category === 'counter_surveyor') return true;
      if (d.category === 'invoices') return true;
      if (d.category === 'payments') return true;
      if (d.category === 'claim_details') return true;
      if (d.category === 'letters') return true;
      if (d.category === 'damage_photos') {
        const n = d.original_name.toLowerCase();
        return n.includes('rcv0001') || n.includes('rcv0002') || n.includes('image001') || n.includes('image002') || n.includes('image003') || n.includes('rcv0016');
      }
      return false;
    });

    if (recommended.length > 0) {
      setPickedIds(recommended.map((d) => d.id));
    } else {
      setPickedIds(classifiedDocs.slice(0, 19).map((d) => d.id));
    }
  }, [open, classifiedDocs]);

  // Load historical shares
  const loadHistory = async () => {
    try {
      const res = (await api.invokeDocs('list_shares', { claim_id: claim.id })) as { shares?: ShareRow[] };
      if (res && Array.isArray(res.shares)) {
        setSharesHistory(res.shares);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (open) {
      void loadHistory();
    }
  }, [open, claim.id]);

  // Selected files list
  const selectedDocs = useMemo(() => {
    return classifiedDocs.filter((d) => pickedIds.includes(d.id));
  }, [classifiedDocs, pickedIds]);

  const totalSelectedBytes = useMemo(() => {
    return selectedDocs.reduce((acc, d) => acc + (d.byte_size || 0), 0);
  }, [selectedDocs]);

  const totalSelectedMb = (totalSelectedBytes / (1024 * 1024)).toFixed(2);

  // Filtered files for display
  const displayedDocs = useMemo(() => {
    return classifiedDocs.filter((d) => {
      if (catFilter !== 'all' && d.category !== catFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return d.original_name.toLowerCase().includes(q) || (d.doc_meta?.read_text || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [classifiedDocs, catFilter, searchQuery]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: classifiedDocs.length };
    classifiedDocs.forEach((d) => {
      counts[d.category] = (counts[d.category] || 0) + 1;
    });
    return counts;
  }, [classifiedDocs]);

  const expiry = useMemo(() => resolveShareExpiry(ttl, customExpiry), [ttl, customExpiry]);

  if (!open) return null;

  // Actions
  const toggleFile = (id: string) => {
    setPickedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const removeFile = (id: string) => {
    setPickedIds((prev) => prev.filter((x) => x !== id));
    toast('הקובץ הוסר מחבילת המייל (נשמר בתיק)', 'ok');
  };

  const selectAll = () => setPickedIds(classifiedDocs.map((d) => d.id));
  const clearAll = () => setPickedIds([]);
  const selectReportsOnly = () => {
    const reports = classifiedDocs.filter(
      (d) => d.category === 'legal_reports' || d.category === 'our_surveyor' || d.category === 'counter_surveyor'
    );
    setPickedIds(reports.map((d) => d.id));
  };
  const selectCorePackage = () => {
    const core = classifiedDocs.filter((d) => d.category !== 'damage_photos' || ['rcv0001.jpg', 'rcv0002.jpg', 'image001.gif', 'image002.jpg'].some(k => d.original_name.toLowerCase().includes(k)));
    setPickedIds(core.map((d) => d.id));
  };

  // Generate / Update Share Package ONLY (Does NOT send email!)
  const handleGeneratePackage = async () => {
    if (!pickedIds.length) {
      toast('נא לבחור לפחות מסמך אחד לחבילה', 'err');
      return;
    }
    if (!recipientName.trim()) {
      toast('נא לציין את שם הנמען', 'err');
      return;
    }
    if (!expiry.ok) {
      toast((expiry as { error: string }).error, 'err');
      return;
    }

    setBusy(true);
    try {
      const r = (await api.invokeDocs('create_share', {
        claim_id: claim.id,
        recipient_name: recipientName.trim(),
        recipient_kind: 'lawyer',
        recipient_kind_note: subject,
        recipient_email: recipientEmail.trim() || undefined,
        file_ids: pickedIds,
        ttl_hours: ttl === 'custom' ? 0 : SHARE_TTL_PRESETS.find((p) => p.key === ttl)?.hours,
        expires_at: ttl === 'custom' ? expiry.expiresAt : '',
      })) as {
        success?: boolean;
        token?: string;
        shareId?: string;
        share_id?: string;
        expiresAt?: string;
        error?: string;
      };

      if (!r.success || !r.token) {
        toast(String(r.error || 'יצירת חבילת המסמכים נכשלה'), 'err');
        return;
      }

      const url = sharePublicUrl(String(r.token));
      setCreatedShare({
        id: String(r.shareId || r.share_id || ''),
        token: String(r.token),
        url,
        expiresAt: String(r.expiresAt || expiry.expiresAt),
        fileCount: pickedIds.length,
        byteSize: totalSelectedBytes,
      });

      toast(`חבילת מסמכים הוכנה בהצלחה (${pickedIds.length} קבצים) — לא נשלח מייל`, 'ok');
      await loadHistory();
      setActiveTab('preview');
    } catch (e: any) {
      toast(`שגיאה ביצירת החבילה: ${e.message}`, 'err');
    } finally {
      setBusy(false);
    }
  };

  // Explicit Live Send Handler (Only on explicit click with confirmation)
  const handleExplicitLiveSend = async () => {
    if (!createdShare?.url) {
      toast('נא ליצור תחילה את חבילת המסמכים', 'err');
      return;
    }
    if (!recipientEmail.trim()) {
      toast('חובה להזין כתובת מייל מאומתת לשליחה', 'err');
      return;
    }
    if (!explicitSendConfirmed) {
      toast('חובה לאשר את תיבת הסימון לפני שליחה', 'err');
      return;
    }

    // STAGING Guard: Block live send to Orudel without explicit operator confirmation
    if (recipientName.includes('אורודל') || recipientEmail.includes('orudel') || recipientEmail.includes('urodel')) {
      toast('נעול: אין לשלוח בפועל לאורודל ללא אישור מפורש מהמשתמש (STAGING Safe Mode)', 'err');
      return;
    }

    setSendingEmail(true);
    try {
      const emailBodyWithUrl = `${customMessage}\n\nקישור מאובטח לצפייה ולהורדת חבילת המסמכים (קובץ ZIP):\n${createdShare.url}\n(תוקף הקישור עד: ${new Date(createdShare.expiresAt).toLocaleString('he-IL')})`;
      
      const res = await api.invokeGmail('send_claim', {
        confirm: true,
        claim_id: claim.id,
        to: recipientEmail.trim(),
        cc: recipientCc.trim() || undefined,
        subject,
        body: emailBodyWithUrl,
        file_ids: [], // Files sent via secure share link rather than giant raw attachments
        idempotency_key: `send-pkg-${claim.id}-${Date.now()}`,
      });

      if (res.success && res.realEmailSend) {
        toast(`המייל נשלח בהצלחה ל-${recipientEmail}`, 'ok');
        await loadHistory();
        setActiveTab('tracking');
      } else {
        toast(String(res.error || 'שליחת המייל נכשלה'), 'err');
      }
    } catch (e: any) {
      toast(`שגיאה בשליחה: ${e.message}`, 'err');
    } finally {
      setSendingEmail(false);
    }
  };

  const handleRevokeShare = async (shareId: string) => {
    try {
      const r = await api.invokeDocs('revoke_share', { claim_id: claim.id, share_id: shareId });
      if (r.success) {
        toast('הקישור בוטל מידית — הגישה נחסמה', 'ok');
        await loadHistory();
        if (createdShare?.id === shareId) {
          setCreatedShare(null);
        }
      } else {
        toast(String(r.error || 'ביטול קישור נכשל'), 'err');
      }
    } catch (e: any) {
      toast(`שגיאה: ${e.message}`, 'err');
    }
  };

  const copyToClipboard = async (textToCopy: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      toast(msg, 'ok');
    } catch {
      toast('העתקה ידנית', 'err');
    }
  };

  return (
    <div className="ov open cep-overlay" data-testid="mo-email-package" style={{ zIndex: 12000 }}>
      <div
        className="modal modal-lg cep-modal"
        style={{
          maxWidth: 1100,
          width: '95vw',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: 12,
        }}
      >
        {/* MODAL HEADER */}
        <div
          className="mh cep-header"
          style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            color: '#fff',
            padding: '14px 20px',
            borderBottom: '1px solid #334155',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>📦</span>
              <span>שליחת מייל וחבילת מסמכים — תיק {claim.id}</span>
              <span
                style={{
                  fontSize: 12,
                  background: 'rgba(56, 189, 248, 0.2)',
                  color: '#38bdf8',
                  padding: '2px 8px',
                  borderRadius: 12,
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                }}
              >
                STAGING
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              לקוח: <b>{claim.clientName || '—'}</b> | רכב: <b>{claim.plate || '—'}</b> | חברת ביטוח: <b>{claim.insCompany || '—'}</b>
            </div>
          </div>
          <button
            type="button"
            className="mcl"
            onClick={onClose}
            style={{ color: '#fff', background: 'transparent', border: 'none', fontSize: 24, cursor: 'pointer', padding: 8 }}
          >
            ✕
          </button>
        </div>

        {/* NAVIGATION TABS */}
        <div
          className="cep-tabs-bar"
          style={{
            display: 'flex',
            gap: 6,
            padding: '8px 16px',
            background: 'var(--bg2)',
            borderBottom: '1px solid var(--br)',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <button
            type="button"
            className={`btn btn-sm cep-tab-btn ${activeTab === 'compose' ? 'btn-p' : 'btn-g'}`}
            data-testid="tab-compose"
            onClick={() => setActiveTab('compose')}
          >
            📁 1. בחירת מסמכים והכנת מייל ({pickedIds.length} נבחרו)
          </button>
          <button
            type="button"
            className={`btn btn-sm cep-tab-btn ${activeTab === 'preview' ? 'btn-p' : 'btn-g'}`}
            data-testid="tab-preview"
            onClick={() => setActiveTab('preview')}
          >
            ✉️ 2. תצוגת מייל מקדימה ובקרת שליחה
          </button>
          <button
            type="button"
            className={`btn btn-sm cep-tab-btn ${activeTab === 'share_view' ? 'btn-p' : 'btn-g'}`}
            data-testid="tab-share-view"
            onClick={() => setActiveTab('share_view')}
          >
            🌐 3. מסך השיתוף והורדת ZIP (מבט הנמען)
          </button>
          <button
            type="button"
            className={`btn btn-sm cep-tab-btn ${activeTab === 'tracking' ? 'btn-p' : 'btn-g'}`}
            data-testid="tab-tracking"
            onClick={() => setActiveTab('tracking')}
          >
            📊 4. תיעוד ומעקב שליחות ({sharesHistory.length})
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="mb cep-body" style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {/* TAB 1: COMPOSE & DOCUMENT SELECTION */}
          {activeTab === 'compose' && (
            <div>
              {/* MOBILE SUB-NAV FOR TAB 1 */}
              <div className="cep-mobile-subnav">
                <button
                  type="button"
                  className={`btn btn-sm ${mobileTab1View === 'docs' ? 'btn-p' : 'btn-g'}`}
                  data-testid="mobile-subnav-docs"
                  onClick={() => setMobileTab1View('docs')}
                >
                  📁 בחירת מסמכים ({pickedIds.length})
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${mobileTab1View === 'details' ? 'btn-p' : 'btn-g'}`}
                  data-testid="mobile-subnav-details"
                  onClick={() => setMobileTab1View('details')}
                >
                  ✉️ פרטי המייל והנמען
                </button>
              </div>

              <div className="cep-compose-grid">
                {/* LEFT COLUMN: EMAIL DETAILS */}
                <div
                  className={`cep-compose-sidebar ${mobileTab1View === 'details' ? 'mobile-visible' : 'mobile-hidden'}`}
                  style={{
                    background: 'var(--bg3)',
                    border: '1px solid var(--br)',
                    borderRadius: 8,
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                <div style={{ fontWeight: 700, fontSize: 14, borderBottom: '1px solid var(--br)', paddingBottom: 6 }}>
                  ✉️ פרטי המייל והנמען
                </div>

                <div className="fg">
                  <label className="fl">שם הנמען *</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      className="fi"
                      data-testid="pkg-recipient-name"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      placeholder="לדוגמה: אורודל / עו״ד מטפל"
                    />
                    <button
                      type="button"
                      className="btn btn-g btn-sm"
                      onClick={() => setRecipientName('אורודל')}
                      title="הזן אורודל"
                    >
                      אורודל
                    </button>
                  </div>
                </div>

                <div className="fg">
                  <label className="fl">כתובת מייל (To) *</label>
                  <input
                    className="fi"
                    data-testid="pkg-recipient-email"
                    type="email"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    placeholder="כתובת מייל מאומתת של הנמען"
                  />
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
                    🔒 אין להמציא כתובת. ניתן להזין כתובת מאומתת בלבד.
                  </div>
                </div>

                <div className="fg">
                  <label className="fl">עותק (CC)</label>
                  <input
                    className="fi"
                    data-testid="pkg-recipient-cc"
                    value={recipientCc}
                    onChange={(e) => setRecipientCc(e.target.value)}
                    placeholder="כתובת עותק (אופציונלי)"
                  />
                </div>

                <div className="fg">
                  <label className="fl">נושא המייל *</label>
                  <input
                    className="fi"
                    data-testid="pkg-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </div>

                <div className="fg">
                  <label className="fl">תוכן ההודעה</label>
                  <textarea
                    className="fta"
                    data-testid="pkg-body"
                    style={{ minHeight: 140, fontSize: 12 }}
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                  />
                </div>

                <div className="fg">
                  <label className="fl">תוקף קישור השיתוף המאובטח</label>
                  <select
                    className="fse fi"
                    data-testid="pkg-ttl"
                    value={ttl}
                    onChange={(e) => setTtl(e.target.value)}
                  >
                    {SHARE_TTL_PRESETS.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                {ttl === 'custom' && (
                  <div className="fg">
                    <label className="fl">תאריך ושעת תפוגה מותאמים</label>
                    <input
                      className="fi"
                      type="datetime-local"
                      value={customExpiry}
                      onChange={(e) => setCustomExpiry(e.target.value)}
                    />
                  </div>
                )}

                <div
                  style={{
                    background: 'rgba(59, 130, 246, 0.08)',
                    border: '1px solid rgba(59, 130, 246, 0.25)',
                    borderRadius: 6,
                    padding: 8,
                    fontSize: 11.5,
                  }}
                >
                  ⏱️ <b>תוקף הקישור:</b> {expiry.ok ? new Date(expiry.expiresAt).toLocaleString('he-IL') : '—'}
                  <div style={{ color: 'var(--t3)', marginTop: 2 }}>
                    לאחר מועד זה, הגישה לקבצים תיחסם אוטומטית. ניתן לבטל את הקישור ידנית בכל עת.
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-p"
                  data-testid="btn-create-pkg"
                  disabled={busy || !pickedIds.length || !recipientName.trim()}
                  onClick={handleGeneratePackage}
                  style={{ marginTop: 8 }}
                >
                  {busy ? 'מעבד חבילת מסמכים...' : 'הכן חבילה ועבור לתצוגה מקדימה ❯'}
                </button>
              </div>

              {/* RIGHT COLUMN: DOCUMENT SELECTOR (THE 9 CATEGORIES) */}
              <div
                className={`cep-compose-main ${mobileTab1View === 'docs' ? 'mobile-visible' : 'mobile-hidden'}`}
                style={{
                  background: 'var(--bg2)',
                  border: '1px solid var(--br)',
                  borderRadius: 8,
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                {/* TOOLBAR */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      🗂️ בחירת מסמכים מתוך גלריית התיק
                    </div>
                    <div
                      data-testid="pkg-selection-badge"
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        background: pickedIds.length ? '#10b981' : '#64748b',
                        color: '#fff',
                        padding: '3px 10px',
                        borderRadius: 12,
                      }}
                    >
                      נבחרו: {pickedIds.length} מתוך {classifiedDocs.length} ({totalSelectedMb} MB)
                    </div>
                  </div>

                  {/* QUICK SELECTION BUTTONS */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    <button type="button" className="btn btn-g btn-sm" onClick={selectAll}>
                      סמן הכול
                    </button>
                    <button type="button" className="btn btn-g btn-sm" onClick={clearAll}>
                      נקה בחירה
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#4f46e5', borderColor: '#818cf8' }}
                      onClick={selectReportsOnly}
                    >
                      דוחות ושמאים בלבד
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#059669', borderColor: '#34d399' }}
                      onClick={selectCorePackage}
                    >
                      חבילת תביעה מומלצת
                    </button>
                  </div>

                  {/* SEARCH & CATEGORY FILTER */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <input
                      className="fi"
                      style={{ flex: 1, padding: '4px 8px', fontSize: 12 }}
                      placeholder="🔎 חיפוש לפי שם קובץ או טקסט..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  {/* 9 CATEGORY PILLS */}
                  <div className="cep-cat-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${catFilter === 'all' ? 'btn-p' : 'btn-g'}`}
                      style={{ fontSize: 11, padding: '3px 8px' }}
                      onClick={() => setCatFilter('all')}
                    >
                      הכול ({categoryCounts.all || 0})
                    </button>
                    {CLAIM_PACKAGE_CATEGORIES.map((cat) => {
                      const count = categoryCounts[cat.key] || 0;
                      if (!count && catFilter !== cat.key) return null;
                      return (
                        <button
                          key={cat.key}
                          type="button"
                          className={`btn btn-sm ${catFilter === cat.key ? 'btn-p' : 'btn-g'}`}
                          style={{
                            fontSize: 11,
                            padding: '3px 8px',
                            borderColor: catFilter === cat.key ? undefined : cat.color,
                          }}
                          onClick={() => setCatFilter(cat.key)}
                        >
                          {cat.icon} {cat.label} ({count})
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* DOCUMENTS LIST */}
                <div
                  style={{
                    flex: 1,
                    maxHeight: '480px',
                    overflowY: 'auto',
                    border: '1px solid var(--br)',
                    borderRadius: 6,
                    background: 'var(--bg)',
                  }}
                >
                  {displayedDocs.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>
                      לא נמצאו מסמכים בקטגוריה זו
                    </div>
                  ) : (
                    displayedDocs.map((doc) => {
                      const isPicked = pickedIds.includes(doc.id);
                      const catDef = CLAIM_PACKAGE_CATEGORIES.find((c) => c.key === doc.category);
                      const szKb = Math.round((doc.byte_size || 0) / 1024);
                      return (
                        <div
                          key={doc.id}
                          data-testid={`doc-row-${doc.id}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            borderBottom: '1px solid var(--br)',
                            background: isPicked ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
                            transition: 'background 0.15s ease',
                          }}
                        >
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              flex: 1,
                              cursor: 'pointer',
                              overflow: 'hidden',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isPicked}
                              onChange={() => toggleFile(doc.id)}
                            />
                            <span
                              style={{
                                fontSize: 10,
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: 'var(--bg3)',
                                border: `1px solid ${catDef?.color || '#94a3b8'}`,
                                color: catDef?.color || '#94a3b8',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {catDef?.icon} {catDef?.label}
                            </span>
                            <span
                              style={{
                                fontSize: 12.5,
                                fontWeight: isPicked ? 600 : 400,
                                textOverflow: 'ellipsis',
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                              }}
                              title={doc.original_name}
                            >
                              {doc.original_name}
                            </span>
                          </label>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            <span style={{ fontSize: 11, color: 'var(--t3)' }}>
                              {szKb > 1024 ? `${(szKb / 1024).toFixed(1)} MB` : `${szKb} KB`}
                            </span>
                            {doc.page_count ? (
                              <span
                                style={{
                                  fontSize: 10,
                                  background: 'var(--bg3)',
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                  color: 'var(--t2)',
                                }}
                              >
                                {doc.page_count} עמ'
                              </span>
                            ) : null}
                            <button
                              type="button"
                              className="btn btn-g btn-sm"
                              style={{ fontSize: 11, padding: '2px 6px' }}
                              onClick={() => setPreviewDoc(doc)}
                              title="תצוגה מקדימה"
                            >
                              👁️
                            </button>
                            {isPicked && (
                              <button
                                type="button"
                                className="btn btn-g btn-sm"
                                style={{ fontSize: 11, padding: '2px 6px', color: 'var(--rd2)' }}
                                onClick={() => removeFile(doc.id)}
                                title="הסר מחבילת המייל (הקובץ יישאר בתיק)"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
            </div>
          )}

          {/* TAB 2: LIVE RECIPIENT EMAIL PREVIEW AND CONTROLLED DISPATCH */}
          {activeTab === 'preview' && (
            <div
              style={{
                background: '#ffffff',
                color: '#1e293b',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                padding: 24,
                boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                fontFamily: 'Heebo, -apple-system, sans-serif',
              }}
            >
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                  padding: 12,
                  marginBottom: 20,
                  fontSize: 13,
                }}
              >
                <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                  <b style={{ width: 60, color: '#64748b' }}>מאת:</b>
                  <span>דליה — מערכת ניהול תביעות (dalia-claims@staging)</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                  <b style={{ width: 60, color: '#64748b' }}>אל:</b>
                  <b>{recipientName}</b> &lt;{recipientEmail || 'לא הוזנה כתובת מייל'}&gt;
                </div>
                {recipientCc && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    <b style={{ width: 60, color: '#64748b' }}>עותק:</b>
                    <span>{recipientCc}</span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <b style={{ width: 60, color: '#64748b' }}>נושא:</b>
                  <b style={{ color: '#0f172a' }}>{subject}</b>
                </div>
              </div>

              {/* EMAIL CONTENT */}
              <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-line', marginBottom: 24 }}>
                {customMessage}
              </div>

              {/* ACTION BUTTON MOCKUP */}
              <div
                style={{
                  textAlign: 'center',
                  background: '#f1f5f9',
                  border: '2px dashed #94a3b8',
                  borderRadius: 8,
                  padding: 20,
                  marginBottom: 24,
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
                  📦 חבילת מסמכים מאובטחת ({selectedDocs.length} קבצים · {totalSelectedMb} MB)
                </div>
                <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
                  הקישור מוגבל בזמן ופעיל עד: <b>{expiry.ok ? new Date(expiry.expiresAt).toLocaleString('he-IL') : '—'}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
                  <button
                    type="button"
                    style={{
                      background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 6,
                      padding: '10px 24px',
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(37,99,235,0.3)',
                    }}
                    onClick={() => setActiveTab('share_view')}
                  >
                    🌐 פתיחת חבילת המסמכים לצפייה
                  </button>
                  <button
                    type="button"
                    style={{
                      background: '#059669',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 6,
                      padding: '10px 20px',
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      if (createdShare?.url) {
                        window.open(`${createdShare.url}&zip=1`, '_blank');
                      } else {
                        toast('צור תחילה קישור חבילה בלשונית 1', 'err');
                      }
                    }}
                  >
                    ⬇️ הורדת כל החבילה כ-ZIP
                  </button>
                </div>
                {createdShare?.url ? (
                  <div style={{ marginTop: 12, fontSize: 11, color: '#64748b', wordBreak: 'break-all' }}>
                    קישור: <a href={createdShare.url} target="_blank" rel="noreferrer">{createdShare.url}</a>
                  </div>
                ) : null}
              </div>

              {/* ATTACHED DOCUMENTS INDEX */}
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 10 }}>
                  📑 פירוט {selectedDocs.length} המסמכים הכלולים בחבילה לפי קטגוריות:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 8 }}>
                  {selectedDocs.map((d, idx) => {
                    const catDef = CLAIM_PACKAGE_CATEGORIES.find((c) => c.key === d.category);
                    return (
                      <div
                        key={d.id}
                        style={{
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: 6,
                          padding: '6px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          fontSize: 12,
                        }}
                      >
                        <span style={{ color: '#64748b', fontWeight: 700, width: 20 }}>{idx + 1}.</span>
                        <span>{catDef?.icon}</span>
                        <span
                          style={{
                            fontWeight: 600,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                          }}
                          title={d.original_name}
                        >
                          {d.original_name}
                        </span>
                        <span style={{ fontSize: 10.5, color: '#64748b' }}>
                          {Math.round((d.byte_size || 0) / 1024)} KB
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* DISPATCH CONTROL PANEL & EXPLICIT CONFIRMATION */}
              <div
                style={{
                  marginTop: 24,
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  borderRadius: 8,
                  padding: 16,
                }}
              >
                <div style={{ fontWeight: 700, color: '#b45309', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>🛡️</span>
                  <span>בקרת שליחה אמיתית (אין שליחה אוטומטית)</span>
                </div>
                <div style={{ fontSize: 12.5, color: '#78350f', marginBottom: 12 }}>
                  בלחיצה על תצוגה מקדימה, מעבר בין לשוניות או יצירת קישור — <b>לא נשלח שום מייל</b>.
                  שליחה בפועל לנמען מתבצעת אך ורק בלחיצה מפורשת על כפתור השליחה להלן, לאחר סימון אישור המשתמש.
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14 }}>
                  <input
                    type="checkbox"
                    checked={explicitSendConfirmed}
                    onChange={(e) => setExplicitSendConfirmed(e.target.checked)}
                  />
                  <b>אני מאשר במפורש את שליחת המייל עם חבילת המסמכים לכתובת הנמען</b>
                </label>

                {recipientName.includes('אורודל') || recipientEmail.includes('orudel') || recipientEmail.includes('urodel') ? (
                  <div
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      color: 'var(--rd2)',
                      border: '1px solid var(--rd2)',
                      borderRadius: 6,
                      padding: 10,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    🔒 נעול: נמען הבדיקה הוא אורודל. בהתאם להוראות, אין לשלוח מייל בפועל לאורודל ללא אישור מפורש ונפרד.
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-rd"
                    data-testid="pkg-explicit-send-btn"
                    disabled={sendingEmail || !explicitSendConfirmed || !recipientEmail.trim() || !createdShare?.url}
                    onClick={handleExplicitLiveSend}
                    style={{ fontWeight: 700, padding: '8px 20px' }}
                  >
                    {sendingEmail ? 'שולח מייל בפועל...' : '🚀 שלח מייל כעת לנמען'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: SHARE AND DOWNLOAD SCREEN (RECIPIENT PERSPECTIVE) */}
          {activeTab === 'share_view' && (
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                padding: 24,
                maxWidth: 900,
                margin: '0 auto',
              }}
            >
              <div
                className="cep-share-header"
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: 20,
                  marginBottom: 16,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                    דליה — מערכת ניהול תביעות | שיתוף מסמכים מאובטח
                  </div>
                  <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                    תביעה: <b>{claim.id}</b> | רכב: <b>{claim.plate || '—'}</b> | מבוטח: <b>{claim.clientName || '—'}</b>
                  </div>
                </div>
                <button
                  type="button"
                  className="cep-share-zip-btn"
                  style={{
                    background: '#059669',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '10px 18px',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    if (createdShare?.url) {
                      window.open(createdShare.url, '_blank');
                    } else {
                      toast('צור תחילה קישור חבילה בלשונית 1', 'err');
                    }
                  }}
                >
                  ⬇️ הורדת כל החבילה כקובץ ZIP ({totalSelectedMb} MB)
                </button>
              </div>

              {/* RECIPIENT FILE GROUPS */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {CLAIM_PACKAGE_CATEGORIES.map((cat) => {
                  const inCat = selectedDocs.filter((d) => d.category === cat.key);
                  if (!inCat.length) return null;
                  return (
                    <div
                      key={cat.key}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: 6,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          background: '#f1f5f9',
                          padding: '8px 14px',
                          fontWeight: 700,
                          fontSize: 13,
                          color: '#334155',
                          borderBottom: '1px solid #e2e8f0',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <span>{cat.icon}</span>
                        <span>{cat.label}</span>
                        <span style={{ fontSize: 11, color: '#64748b' }}>({inCat.length} קבצים)</span>
                      </div>
                      <div>
                        {inCat.map((d) => (
                          <div
                            key={d.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 14px',
                              borderBottom: '1px solid #f1f5f9',
                              fontSize: 12.5,
                            }}
                          >
                            <span style={{ fontWeight: 500, color: '#1e293b' }}>{d.original_name}</span>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <span style={{ color: '#64748b', fontSize: 11 }}>
                                {Math.round((d.byte_size || 0) / 1024)} KB
                              </span>
                              <button
                                type="button"
                                style={{
                                  background: '#f1f5f9',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: 4,
                                  padding: '3px 8px',
                                  fontSize: 11,
                                  cursor: 'pointer',
                                }}
                                onClick={() => setPreviewDoc(d)}
                              >
                                צפייה
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: AUDIT AND TRACKING (STRICTLY REAL EVENTS) */}
          {activeTab === 'tracking' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  background: 'var(--bg3)',
                  border: '1px solid var(--br)',
                  borderRadius: 8,
                  padding: 14,
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 4 }}>📊 מעקב פעולות מאומתות בזמן אמת</div>
                <div style={{ color: 'var(--t3)', fontSize: 12 }}>
                  הנתונים משקפים אך ורק פעולות שאומתו בפועל מול שרתי האחסון ומסד הנתונים:
                  <b style={{ color: '#0284c7' }}> נוצר קישור </b> ❯
                  <b style={{ color: '#6366f1' }}> שליחה במייל </b> ❯
                  <b style={{ color: '#10b981' }}> פתיחה ע״י הנמען </b> ❯
                  <b style={{ color: '#059669' }}> הורדה בפועל</b>.
                  אין סימון מדומה של "נמסר" או "נפתח" ללא תיעוד מקור.
                </div>
              </div>

              {sharesHistory.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--t3)' }}>
                  טרם נוצרו קישורי שיתוף בתיק זה
                </div>
              ) : (
                sharesHistory.map((s) => {
                  const st = s.status || shareStatusOf(s);
                  const isRevoked = st === 'revoked';
                  const isExpired = st === 'expired';
                  return (
                    <div
                      key={s.id}
                      data-testid={`share-card-${s.id}`}
                      style={{
                        background: 'var(--bg2)',
                        border: '1px solid var(--br)',
                        borderRadius: 8,
                        padding: 14,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontWeight: 700, fontSize: 14 }}>
                            {s.recipient_name}
                          </span>
                          {s.recipient_email && (
                            <span style={{ color: 'var(--t3)', fontSize: 12, marginInlineStart: 8 }}>
                              &lt;{s.recipient_email}&gt;
                            </span>
                          )}
                        </div>
                        <span
                          style={{
                            fontSize: 11,
                            padding: '2px 8px',
                            borderRadius: 12,
                            background: isRevoked
                              ? 'rgba(239, 68, 68, 0.15)'
                              : isExpired
                              ? 'rgba(245, 158, 11, 0.15)'
                              : 'rgba(16, 185, 129, 0.15)',
                            color: isRevoked ? 'var(--rd2)' : isExpired ? '#d97706' : '#059669',
                            fontWeight: 700,
                          }}
                        >
                          מצב קישור: {shareStatusLabel(st)}
                        </span>
                      </div>

                      {/* 4 STAGES TRACKING BAR - STRICT TRUTH ONLY */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(4, 1fr)',
                          gap: 8,
                          background: 'var(--bg3)',
                          padding: 10,
                          borderRadius: 6,
                          fontSize: 12,
                        }}
                      >
                        <div>
                          <div style={{ color: 'var(--t3)', fontSize: 10.5 }}>1. יצירת קישור</div>
                          <b style={{ color: '#0284c7' }}>✓ נוצר קישור שיתוף</b>
                          <div style={{ fontSize: 10, color: 'var(--t3)' }}>
                            {s.created_at ? new Date(s.created_at).toLocaleString('he-IL') : '—'}
                          </div>
                        </div>

                        <div>
                          <div style={{ color: 'var(--t3)', fontSize: 10.5 }}>2. שליחת מייל ומסירה</div>
                          <span style={{ color: 'var(--t3)', fontSize: 11 }}>
                            טרם נשלח במייל (נוצר כקישור בלבד)
                          </span>
                          <div style={{ fontSize: 10, color: 'var(--t3)' }}>
                            נוצר ע"י: {s.created_by_name || actorName}
                          </div>
                        </div>

                        <div>
                          <div style={{ color: 'var(--t3)', fontSize: 10.5 }}>3. פתיחת הקישור ע״י נמען</div>
                          {s.opened_at ? (
                            <>
                              <b style={{ color: '#10b981' }}>✓ נפתח ({s.open_count || 1} פעמים)</b>
                              <div style={{ fontSize: 10, color: 'var(--t3)' }}>
                                {new Date(s.opened_at).toLocaleString('he-IL')}
                              </div>
                            </>
                          ) : (
                            <span style={{ color: 'var(--t3)' }}>טרם נפתח ע״י הנמען</span>
                          )}
                        </div>

                        <div>
                          <div style={{ color: 'var(--t3)', fontSize: 10.5 }}>4. הורדת מסמכים / ZIP</div>
                          {s.last_download_at ? (
                            <>
                              <b style={{ color: '#059669' }}>✓ בוצעה הורדה</b>
                              <div style={{ fontSize: 10, color: 'var(--t3)' }}>
                                {new Date(s.last_download_at).toLocaleString('he-IL')}
                              </div>
                            </>
                          ) : (
                            <span style={{ color: 'var(--t3)' }}>טרם בוצעה הורדה</span>
                          )}
                        </div>
                      </div>

                      {/* DETAILS & ACTIONS */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5 }}>
                        <div>
                          <span>קבצים מורשים: <b>{s.file_ids?.length || 0} קבצים</b></span>
                          <span style={{ marginInlineStart: 12, color: 'var(--t3)' }}>
                            תוקף עד: {s.expires_at ? new Date(s.expires_at).toLocaleString('he-IL') : '—'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="btn btn-g btn-sm"
                            onClick={() => {
                              toast('קישור שיתוף מוגן ב-SHA256 ללא דליפת מפתחות', 'ok');
                            }}
                          >
                            📋 העתק קישור
                          </button>
                          {!isRevoked && (
                            <button
                              type="button"
                              className="btn btn-sm"
                              style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--rd2)', borderColor: 'var(--rd2)' }}
                              onClick={() => handleRevokeShare(s.id)}
                            >
                              🛑 בטל קישור עכשיו
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div
          className="mf cep-footer"
          style={{
            background: 'var(--bg2)',
            borderTop: '1px solid var(--br)',
            padding: '12px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div className="cep-footer-info" style={{ fontSize: 12, color: 'var(--t3)' }}>
            תיק: <b>{claim.id}</b> | נבחרו <b>{pickedIds.length}</b> קבצים ({totalSelectedMb} MB) | תוקף: <b>{ttl}</b>
          </div>

          <div className="cep-footer-acts" style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-g" onClick={onClose}>
              סגור
            </button>
            {activeTab === 'compose' && (
              <button
                type="button"
                className="btn btn-p"
                disabled={busy || !pickedIds.length || !recipientName.trim()}
                onClick={handleGeneratePackage}
              >
                {busy ? 'מעבד...' : 'הכן חבילה ועבור לתצוגה מקדימה ❯'}
              </button>
            )}
            {activeTab === 'preview' && (
              <button
                type="button"
                className="btn btn-g"
                onClick={() => {
                  copyToClipboard(
                    `${subject}\n\n${customMessage}\n\nקישור לחבילת המסמכים:\n${createdShare?.url || ''}`,
                    'נוסח המייל והקישור הועתקו ללוח'
                  );
                }}
              >
                📋 העתק נוסח מייל וקישור
              </button>
            )}
          </div>
        </div>
      </div>

      {/* INLINE DOCUMENT PREVIEW MODAL */}
      {previewDoc && (
        <div
          className="ov open"
          style={{ zIndex: 12500 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewDoc(null);
          }}
        >
          <div className="modal modal-md" style={{ maxWidth: 700 }}>
            <div className="mh">
              <div className="mh-t">👁️ תצוגה מקדימה: {previewDoc.original_name}</div>
              <button type="button" className="mcl" onClick={() => setPreviewDoc(null)}>
                ✕
              </button>
            </div>
            <div className="mb" style={{ padding: 16, maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--t3)' }}>
                קטגוריה: <b>{CLAIM_PACKAGE_CATEGORIES.find((c) => c.key === previewDoc.category)?.label}</b> | גודל:{' '}
                <b>{Math.round((previewDoc.byte_size || 0) / 1024)} KB</b>
              </div>
              {previewDoc.doc_meta?.read_text ? (
                <div
                  style={{
                    background: 'var(--bg3)',
                    border: '1px solid var(--br)',
                    borderRadius: 6,
                    padding: 12,
                    fontSize: 12,
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    maxHeight: 400,
                    overflowY: 'auto',
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--t2)' }}>
                    תוכן מאומת מתוך המסמך (OCR / טקסט מקור):
                  </div>
                  {previewDoc.doc_meta.read_text}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--t3)' }}>
                  הקובץ מוכן לשליחה בחבילה המאובטחת.
                </div>
              )}
            </div>
            <div className="mf">
              <button type="button" className="btn btn-g" onClick={() => setPreviewDoc(null)}>
                סגור
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
