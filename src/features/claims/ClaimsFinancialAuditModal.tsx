/**
 * ClaimsFinancialAuditModal.tsx
 *
 * מודול בדיקת דוח שמאי ותשלומים בכרטיס התביעה (STAGING).
 * ממוקד אך ורק בתיק התביעה ובמסמכים של הלקוח הספציפי שנפתח.
 */

import React, { useState, useMemo, useEffect } from 'react';
import './claims-financial-audit.css';
import {
  extractOurSurveyorReport,
  extractCounterSurveyorReport,
  extractPaymentNotice,
  compareFinancialAudit,
  safelyUpdateFinancialAudit,
  type OurSurveyorReportExtraction,
  type CounterReportExtraction,
  type PaymentNoticeExtraction,
  type FinancialComparisonResult,
  type VerifiedPaymentEntry,
} from './claimFinancialDocRead';

export interface ClaimDocFile {
  id: string;
  original_name: string;
  doc_kind?: string;
  mime_type?: string;
  byte_size?: number;
  created_at: string;
  doc_meta?: Record<string, string> | null;
}

export interface ClaimCardData {
  id: string;
  plate: string;
  clientName: string;
  status: string;
  insCompany?: string;
  claimNum?: string;
  row_data?: Record<string, unknown>;
  finAmount?: string;
  finApproved?: string;
  finPaid?: string;
  finPayDate?: string;
  finRef?: string;
  finBalance?: string;
  notes?: string;
}

export interface ClaimsFinancialAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  claim: ClaimCardData;
  files: ClaimDocFile[];
  onSaveClaimFinancials: (claimId: string, updatedFields: Record<string, unknown>) => Promise<boolean>;
  actorName: string;
}

export const ClaimsFinancialAuditModal: React.FC<ClaimsFinancialAuditModalProps> = ({
  isOpen,
  onClose,
  claim,
  files,
  onSaveClaimFinancials,
  actorName,
}) => {
  const [activeTab, setActiveTab] = useState<'audit' | 'docs' | 'letter' | 'legal'>('audit');
  const [isSaving, setIsSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  const showToast = (text: string, type: 'ok' | 'err' = 'ok') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  // איתור מסמכי שומה ותשלום השייכים לתיק זה
  const categorizedFiles = useMemo(() => {
    const surveyorDocs: ClaimDocFile[] = [];
    const paymentDocs: ClaimDocFile[] = [];
    const invoiceDocs: ClaimDocFile[] = [];
    const otherDocs: ClaimDocFile[] = [];

    files.forEach((f) => {
      const name = (f.original_name || '').toLowerCase();
      const kind = (f.doc_kind || '').toLowerCase();
      const staffType = (f.doc_meta?.staff_type || '').toLowerCase();

      if (
        kind.includes('surveyor') ||
        name.includes('שמאי') ||
        name.includes('שומה') ||
        name.startsWith('rcv') ||
        staffType.includes('surveyor')
      ) {
        surveyorDocs.push(f);
      } else if (
        name.includes('תשלום') ||
        name.includes('סילוק') ||
        name.includes('העברה') ||
        kind.includes('payment')
      ) {
        paymentDocs.push(f);
      } else if (
        name.includes('חשבונית') ||
        kind.includes('invoice') ||
        Boolean(f.doc_meta?.invoiceAmount)
      ) {
        invoiceDocs.push(f);
      } else {
        otherDocs.push(f);
      }
    });

    return { surveyorDocs, paymentDocs, invoiceDocs, otherDocs };
  }, [files]);

  // שילוב כל הטקסטים שנקראו מהמסמכים בתיק זה
  const aggregatedText = useMemo(() => {
    const texts: string[] = [];

    // טקסטים שחולצו ב-doc_meta
    files.forEach((f) => {
      const meta = f.doc_meta || {};
      if (meta.read_text) {
        texts.push(`[קובץ: ${f.original_name}]\n${meta.read_text}`);
      }
      if (meta.reportNumber) {
        texts.push(`שמאי: ${meta.surveyorName || 'שמאי'} מס' שומה: ${meta.reportNumber} תאריך: ${meta.reportDate || ''}`);
      }
      if (meta.invoiceAmount) {
        texts.push(`חשבונית תיקון: ${meta.invoiceAmount} ₪ מוסך: ${meta.garageName || ''} תאריך: ${meta.invoiceDate || ''}`);
      }
    });

    // הערות התיק
    if (claim.notes) {
      texts.push(`[הערות תיק]\n${claim.notes}`);
    }

    return texts.join('\n\n');
  }, [files, claim.notes]);

  // חילוץ והשוואה כספית עבור התיק הספציפי
  const comparison: FinancialComparisonResult = useMemo(() => {
    const row = claim.row_data || {};
    const audit = (row.financial_audit as any) || {};

    let ourDemand: OurSurveyorReportExtraction | null = audit.our_demand || null;
    let counterReport: CounterReportExtraction | null = audit.counter_reports?.[0] || null;
    let paymentNotice: PaymentNoticeExtraction | null = audit.payment_notices?.[0] || null;

    // חילוץ בזמן אמת מתוך הטקסטים של מסמכי התיק
    if (aggregatedText.trim()) {
      if (!ourDemand) {
        ourDemand = extractOurSurveyorReport(aggregatedText);
      }
      if (!counterReport && (aggregatedText.includes('נגדי') || aggregatedText.includes('בקרה'))) {
        counterReport = extractCounterSurveyorReport(aggregatedText);
      }
      if (!paymentNotice && (aggregatedText.includes('תשלום') || aggregatedText.includes('סילוק') || aggregatedText.includes('שולם'))) {
        paymentNotice = extractPaymentNotice(aggregatedText);
      }
    }

    return compareFinancialAudit({
      claimId: claim.id,
      plateNumber: claim.plate,
      ourDemand,
      counterReport,
      paymentNotice,
      verifiedPayments: audit.verified_payments || [],
    });
  }, [claim, aggregatedText]);

  // ערכי תצוגה מקדימה לעריכה ואישור
  const [previewValues, setPreviewValues] = useState<{
    finAmount: string;
    finApproved: string;
    finPaid: string;
    finPayDate: string;
    finRef: string;
    finBalance: string;
    isVerified: boolean;
  }>({
    finAmount: '',
    finApproved: '',
    finPaid: '',
    finPayDate: '',
    finRef: '',
    finBalance: '0',
    isVerified: false,
  });

  useEffect(() => {
    const row = claim.row_data || {};
    const audit = (row.financial_audit as any) || {};

    const dem = comparison.totalDemanded > 0 ? comparison.totalDemanded : parseFloat(claim.finAmount || '0') || 0;
    const app = comparison.totalApproved > 0 ? comparison.totalApproved : parseFloat(claim.finApproved || '0') || 0;
    const pd = comparison.totalVerifiedPaid > 0
      ? comparison.totalVerifiedPaid
      : comparison.totalReportedPaid > 0
      ? comparison.totalReportedPaid
      : parseFloat(claim.finPaid || '0') || 0;
    const bal = dem > 0 ? Math.max(0, dem - pd) : 0;

    setPreviewValues({
      finAmount: dem > 0 ? String(dem) : (claim.finAmount || ''),
      finApproved: app > 0 ? String(app) : (claim.finApproved || ''),
      finPaid: pd > 0 ? String(pd) : (claim.finPaid || ''),
      finPayDate: claim.finPayDate || new Date().toISOString().slice(0, 10),
      finRef: claim.finRef || '',
      finBalance: String(bal),
      isVerified: Boolean(audit.verified_payments?.some((p: any) => p.verified)),
    });
  }, [claim, comparison]);

  // שמירה מאובטחת של הנתונים לכרטיס התביעה
  const handleSaveClaimFinancials = async () => {
    setIsSaving(true);
    try {
      const dem = parseFloat(previewValues.finAmount) || 0;
      const app = parseFloat(previewValues.finApproved) || 0;
      const pd = parseFloat(previewValues.finPaid) || 0;
      const bal = dem > 0 ? Math.max(0, dem - pd) : 0;

      const verifiedList: VerifiedPaymentEntry[] = [];
      if (pd > 0) {
        verifiedList.push({
          id: `PAY-${Date.now()}`,
          amount: pd,
          date: previewValues.finPayDate,
          referenceNumber: previewValues.finRef,
          paymentMethod: 'bank_transfer',
          recordedAt: new Date().toISOString(),
          recordedBy: actorName || 'משתמש',
          verified: previewValues.isVerified,
          verifiedAt: previewValues.isVerified ? new Date().toISOString() : undefined,
          verifiedBy: previewValues.isVerified ? (actorName || 'משתמש') : undefined,
        });
      }

      const updateResult = safelyUpdateFinancialAudit({
        existingRowData: claim.row_data || {},
        updatedBy: actorName || 'משתמש',
        actionSummary: 'עדכון בקרה כספית ותשלומי ביטוח מתוך בדיקת דוח שמאי',
        patch: {
          verified_payments: verifiedList,
        },
      });

      if (!updateResult.ok) {
        throw new Error(updateResult.error);
      }

      const updatedRowData = {
        ...updateResult.newRowData,
        finAmount: previewValues.finAmount,
        finApproved: previewValues.finApproved,
        finPaid: previewValues.finPaid,
        finPayDate: previewValues.finPayDate,
        finRef: previewValues.finRef,
        finBalance: String(bal),
      };

      const success = await onSaveClaimFinancials(claim.id, updatedRowData);
      if (success) {
        showToast('הנתונים הכספיים עודכנו בהצלחה בכרטיס התביעה!');
      } else {
        throw new Error('שמירת הנתונים נכשלה בשרת');
      }
    } catch (err: any) {
      showToast(`שגיאה בשמירה: ${err.message}`, 'err');
    } finally {
      setIsSaving(false);
    }
  };

  // הפקת טיוטת מכתב השגה לתיק זה
  const letterDraftText = useMemo(() => {
    const dem = previewValues.finAmount || '0';
    const app = previewValues.finApproved || '0';
    const diff = comparison.differenceDemandVsApproved || Math.max(0, parseFloat(dem) - parseFloat(app));

    return `לכבוד: ${claim.insCompany || 'מחלקת תביעות ביטוח'}
הנדון: השגה ודרישת הפרשים – תביעה מס' ${claim.claimNum || claim.id}
רכב מס': ${claim.plate} | מבוטח/ת: ${claim.clientName}

שלום רב,

בהמשך להודעת הסילוק / שומת הבקרה שהתקבלה במשרדנו בגין האירוע הנדון:
דרישת השמאי מטעמנו הועמדה על סך כולל של ${parseFloat(dem).toLocaleString()} ₪ (כולל מע"מ).
בחישוב המבטחת אושר סך של ${parseFloat(app).toLocaleString()} ₪ בלבד, ונוצר פער של ${diff.toLocaleString()} ₪.

מבדיקה פרטנית של הדוחות עולה כי בוצעו ההפחתות הבאות שאינן נתמכות בדין או בעובדות:
${comparison.rows.filter((r) => r.status === 'reduction' || r.status === 'unexplained').map((r) => `• סעיף ${r.category}: הופחתו ${r.diff?.toLocaleString()} ₪ (${r.explanation})`).join('\n') || '• הפחתה שרירותית של שעות עבודה, חלפים וצבע ללא נימוק טכני.'}

לאור האמור לעיל, הנכם נדרשים להעביר את יתרת התשלום בסך ${diff.toLocaleString()} ₪ לחשבון המוסך בתוך 7 ימי עבודה.

בברכה,
מחלקת תביעות – מוסך אורן`;
  }, [claim, comparison, previewValues]);

  if (!isOpen) return null;

  return (
    <div className="cfa-modal-overlay" onClick={onClose}>
      <div className="cfa-root" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 1180 }}>
        {/* כותרת עליונה ממוקדת בלקוח ובתיק */}
        <div className="cfa-header">
          <div>
            <div className="cfa-title">
              <span>⚖️</span>
              <span>בדיקת דוח שמאי ותשלומים</span>
              <span style={{ fontSize: 15, color: '#38bdf8', marginRight: 10 }}>
                תיק {claim.id} · רכב: {claim.plate}
              </span>
            </div>
            <div className="cfa-subtitle">
              לקוח: <strong>{claim.clientName}</strong> · מבטחת: <strong>{claim.insCompany || 'לא צוינה'}</strong> · תביעה: <strong>{claim.claimNum || 'טרם עודכן'}</strong>
            </div>
          </div>
          <button type="button" className="cfa-close-btn" onClick={onClose} title="סגור">✕</button>
        </div>

        {/* הודעות טוסט */}
        {toastMsg && (
          <div style={{
            background: toastMsg.type === 'ok' ? '#059669' : '#dc2626',
            color: '#fff',
            padding: '8px 20px',
            fontSize: 13,
            fontWeight: 700,
            textAlign: 'center',
          }}>
            {toastMsg.text}
          </div>
        )}

        {/* סרגל כרטיסי סטטיסטיקה ממוקד אך ורק בתיק זה */}
        <div className="cfa-stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="cfa-stat-card">
            <span className="cfa-stat-label">דרישת שומה (שמאי שלנו)</span>
            <span className="cfa-stat-val primary">
              {comparison.totalDemanded > 0 ? `${comparison.totalDemanded.toLocaleString()} ₪` : (claim.finAmount ? `${parseFloat(claim.finAmount).toLocaleString()} ₪` : 'טרם חולץ')}
            </span>
          </div>
          <div className="cfa-stat-card">
            <span className="cfa-stat-label">אושר ע"י הביטוח</span>
            <span className="cfa-stat-val warning">
              {comparison.totalApproved > 0 ? `${comparison.totalApproved.toLocaleString()} ₪` : (claim.finApproved ? `${parseFloat(claim.finApproved).toLocaleString()} ₪` : 'ממתין לתגובה')}
            </span>
          </div>
          <div className="cfa-stat-card">
            <span className="cfa-stat-label">שולם בפועל (מאומת)</span>
            <span className="cfa-stat-val success">
              {previewValues.finPaid ? `${parseFloat(previewValues.finPaid).toLocaleString()} ₪` : '0 ₪'}
            </span>
          </div>
          <div className="cfa-stat-card">
            <span className="cfa-stat-label">יתרה לגבייה / פער השגה</span>
            <span className="cfa-stat-val danger">
              {previewValues.finBalance ? `${parseFloat(previewValues.finBalance).toLocaleString()} ₪` : '0 ₪'}
            </span>
          </div>
        </div>

        {/* טאבים לניווט בתוך התיק */}
        <div className="cfa-nav-tabs">
          <button
            type="button"
            className={`cfa-tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            📊 השוואת סעיפי שומה ותשלומים
          </button>
          <button
            type="button"
            className={`cfa-tab-btn ${activeTab === 'docs' ? 'active' : ''}`}
            onClick={() => setActiveTab('docs')}
          >
            📁 מסמכי השומה בתיק ({categorizedFiles.surveyorDocs.length + categorizedFiles.paymentDocs.length})
          </button>
          <button
            type="button"
            className={`cfa-tab-btn ${activeTab === 'letter' ? 'active' : ''}`}
            onClick={() => setActiveTab('letter')}
          >
            ✉️ טיוטת מכתב השגה למבטחת
          </button>
          <button
            type="button"
            className={`cfa-tab-btn ${activeTab === 'legal' ? 'active' : ''}`}
            onClick={() => setActiveTab('legal')}
          >
            ⚖️ תיק לטיפול משפטי
          </button>
        </div>

        {/* תוכן ראשי */}
        <div className="cfa-content">
          {activeTab === 'audit' && (
            <div>
              {/* טבלת השוואת סעיפים מפורטת */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <h4 style={{ color: '#38bdf8', fontSize: 14, margin: 0 }}>
                    🔍 פירוט סעיפי נזק, אישורי מבטחת, קיזוזים והפרשים
                  </h4>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>
                    מבוסס על מסמכי התיק · כל סכום מלווה בציטוט מקור
                  </span>
                </div>

                <div className="cfa-table-wrapper">
                  <table className="cfa-table">
                    <thead>
                      <tr>
                        <th>סעיף שומה / קיזוז</th>
                        <th>דרישת שמאי שלנו</th>
                        <th>אישור מבטחת</th>
                        <th>שולם</th>
                        <th>הפרש</th>
                        <th>הסבר וציטוט מהמסמך</th>
                        <th>סטטוס</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.rows.length > 0 ? (
                        comparison.rows.map((row, idx) => (
                          <tr key={idx}>
                            <td style={{ fontWeight: 700 }}>{row.category}</td>
                            <td>{row.demanded !== null ? `${row.demanded.toLocaleString()} ₪` : '—'}</td>
                            <td>{row.approved !== null ? `${row.approved.toLocaleString()} ₪` : '—'}</td>
                            <td>{row.paid !== null ? `${row.paid.toLocaleString()} ₪` : '—'}</td>
                            <td style={{ fontWeight: 700, color: (row.diff || 0) > 0 ? '#f87171' : 'inherit' }}>
                              {row.diff !== null && row.diff > 0 ? `${row.diff.toLocaleString()} ₪` : (row.diff === 0 ? '0 ₪' : '—')}
                            </td>
                            <td>
                              <div>{row.explanation}</div>
                              {row.sourceSnippet && (
                                <div className="cfa-citation-box">מקור: "{row.sourceSnippet}"</div>
                              )}
                            </td>
                            <td>
                              <span className={`cfa-badge cfa-badge-${row.status}`}>
                                {row.status === 'match' ? 'תואם' : row.status === 'reduction' ? 'הפחתה' : row.status === 'unexplained' ? 'לא מוסבר' : 'חסר'}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>
                            טרם נקראו נתוני שומה מקובצי התיק. בדוק את לשונית "מסמכי השומה בתיק" או הזן בטופס למטה.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* טופס תצוגה מקדימה ואישור הזנת נתונים לכרטיס התביעה */}
              <div style={{ background: '#0f172a', padding: 20, borderRadius: 12, border: '1px solid #1e293b' }}>
                <h4 style={{ color: '#4ade80', marginBottom: 8, fontSize: 14 }}>
                  💾 אישור והזנת נתונים לכרטיס התביעה של הלקוח ({claim.id})
                </h4>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>
                  הנתונים יישמרו ישירות בכרטיס התביעה (בשדות finAmount, finApproved, finPaid ו-row_data.financial_audit) רק לאחר לחיצה על כפתור השמירה.
                </div>

                <div className="cfa-form-grid">
                  <div className="cfa-form-group">
                    <label className="cfa-form-label">דרישת שמאי כוללת (₪)</label>
                    <input
                      type="number"
                      className="cfa-input"
                      value={previewValues.finAmount}
                      onChange={(e) => setPreviewValues({ ...previewValues, finAmount: e.target.value })}
                    />
                  </div>

                  <div className="cfa-form-group">
                    <label className="cfa-form-label">סכום שאושר ע"י הביטוח (₪)</label>
                    <input
                      type="number"
                      className="cfa-input"
                      value={previewValues.finApproved}
                      onChange={(e) => setPreviewValues({ ...previewValues, finApproved: e.target.value })}
                    />
                  </div>

                  <div className="cfa-form-group">
                    <label className="cfa-form-label">סכום ששולם (₪)</label>
                    <input
                      type="number"
                      className="cfa-input"
                      value={previewValues.finPaid}
                      onChange={(e) => setPreviewValues({ ...previewValues, finPaid: e.target.value })}
                    />
                  </div>

                  <div className="cfa-form-group">
                    <label className="cfa-form-label">תאריך תשלום</label>
                    <input
                      type="date"
                      className="cfa-input"
                      value={previewValues.finPayDate}
                      onChange={(e) => setPreviewValues({ ...previewValues, finPayDate: e.target.value })}
                    />
                  </div>

                  <div className="cfa-form-group">
                    <label className="cfa-form-label">מספר אסמכתא / העברה</label>
                    <input
                      type="text"
                      className="cfa-input"
                      value={previewValues.finRef}
                      onChange={(e) => setPreviewValues({ ...previewValues, finRef: e.target.value })}
                    />
                  </div>

                  <div className="cfa-form-group">
                    <label className="cfa-form-label">יתרה מחושבת לגבייה (₪)</label>
                    <input
                      type="text"
                      className="cfa-input"
                      readOnly
                      style={{ background: '#1e293b', fontWeight: 700, color: '#f87171' }}
                      value={previewValues.finBalance}
                    />
                  </div>
                </div>

                <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#f8fafc' }}>
                    <input
                      type="checkbox"
                      checked={previewValues.isVerified}
                      onChange={(e) => setPreviewValues({ ...previewValues, isVerified: e.target.checked })}
                    />
                    <span>אימות תשלום בפועל (הכסף נקלט בחשבון הבנק, להבדיל מסכום שרק דווח בהודעה)</span>
                  </label>

                  <button
                    type="button"
                    className="cfa-btn cfa-btn-success"
                    onClick={handleSaveClaimFinancials}
                    disabled={isSaving}
                  >
                    {isSaving ? '⏳ שומר נתונים…' : '💾 אשר והזן נתונים לכרטיס התביעה'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'docs' && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ color: '#38bdf8', marginBottom: 6, fontSize: 14 }}>
                  📁 מסמכי שומה, תמונות ותשלומים המצורפים לתיק {claim.id}
                </h4>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  המערכת מציגה את המסמכים הקיימים בתיק זה בלבד ואת מצב קריאתם (PDF דיגיטלי מול תמונות סרוקות).
                </div>
              </div>

              {files.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', background: '#0f172a', borderRadius: 10, color: '#94a3b8' }}>
                  לא נמצאו מסמכים מצורפים לתיק זה.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {files.map((file) => {
                    const isImg = /image\//i.test(file.mime_type || '') || /\.(jpe?g|png)$/i.test(file.original_name);
                    const isPdf = /pdf/i.test(file.mime_type || '') || /\.pdf$/i.test(file.original_name);
                    const meta = file.doc_meta || {};
                    const hasRead = Boolean(meta.read_text || meta.reportNumber || meta.invoiceAmount);

                    return (
                      <div key={file.id} className="cfa-doc-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span>{isPdf ? '📄' : isImg ? '🖼️' : '📎'}</span>
                            <span>{file.original_name}</span>
                            {file.doc_kind && (
                              <span style={{ fontSize: 11, background: '#334155', color: '#cbd5e1', padding: '2px 6px', borderRadius: 4 }}>
                                {file.doc_kind}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 4 }}>
                            גודל: {file.byte_size ? `${Math.round(file.byte_size / 1024)} KB` : '—'} · תאריך צירוף: {new Date(file.created_at).toLocaleDateString('he-IL')}
                            {meta.surveyorName && ` · שמאי: ${meta.surveyorName}`}
                            {meta.reportNumber && ` · שומה מס': ${meta.reportNumber}`}
                            {meta.invoiceAmount && ` · חשבונית: ${meta.invoiceAmount} ₪`}
                          </div>
                          {meta.read_text && (
                            <div className="cfa-citation-box" style={{ maxHeight: 60, overflow: 'hidden' }}>
                              תוכן שחולץ: "{meta.read_text.slice(0, 140)}…"
                            </div>
                          )}
                        </div>

                        <div>
                          {hasRead ? (
                            <span className="cfa-badge cfa-badge-match">קריאה מוכנה</span>
                          ) : isImg ? (
                            <span className="cfa-badge cfa-badge-reduction" title="מסמך תמונה סרוק — דורש OCR">
                              תמונה (נדרש OCR)
                            </span>
                          ) : (
                            <span className="cfa-badge cfa-badge-missing">טרם נקרא</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'letter' && (
            <div>
              <div className="cfa-actions-bar">
                <div style={{ fontSize: 13, color: '#94a3b8' }}>
                  מכתב השגה מותאם אישית לתיק <strong>{claim.id}</strong> (לקוח: {claim.clientName})
                </div>
                <button
                  type="button"
                  className="cfa-btn cfa-btn-primary"
                  onClick={() => {
                    navigator.clipboard.writeText(letterDraftText);
                    showToast('נוסח מכתב ההשגה הועתק ללוח!');
                  }}
                >
                  📋 העתק נוסח מכתב
                </button>
              </div>

              <div style={{ background: '#0f172a', padding: 20, borderRadius: 12, border: '1px solid #1e293b' }}>
                <textarea
                  readOnly
                  rows={16}
                  style={{
                    width: '100%',
                    background: '#1e293b',
                    color: '#f8fafc',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    padding: 16,
                    fontSize: 13,
                    lineHeight: 1.6,
                    fontFamily: 'monospace',
                  }}
                  value={letterDraftText}
                />
              </div>
            </div>
          )}

          {activeTab === 'legal' && (
            <div>
              <div style={{ background: '#0f172a', padding: 20, borderRadius: 12, border: '1px solid #1e293b' }}>
                <h4 style={{ color: '#f87171', marginBottom: 12 }}>
                  ⚖️ סיכום תיק לטיפול משפטי – {claim.clientName} ({claim.id})
                </h4>
                <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
                  סיכום עובדתי מוכן להעברה לעו"ד עם כל הציטוטים והראיות מתוך מסמכי התיק בלבד.
                </div>

                <div style={{ background: '#1e293b', padding: 16, borderRadius: 8, fontSize: 13, lineHeight: 1.8 }}>
                  <div><strong>מספר תיק בדליה:</strong> {claim.id}</div>
                  <div><strong>מספר תביעת ביטוח:</strong> {claim.claimNum || 'טרם עודכן'}</div>
                  <div><strong>פרטי רכב ולוחית:</strong> {claim.plate}</div>
                  <div><strong>שם המבוטח / לקוח:</strong> {claim.clientName}</div>
                  <div><strong>חברת ביטוח נתבעת:</strong> {claim.insCompany || 'לא צוינה'}</div>
                  <div style={{ margin: '12px 0', borderTop: '1px solid #334155' }} />
                  <div><strong>דרישת שומת שמאי מטעמנו:</strong> {previewValues.finAmount || '0'} ₪</div>
                  <div><strong>אישור שומת מבטחת:</strong> {previewValues.finApproved || '0'} ₪</div>
                  <div><strong>סכום ששולם בפועל:</strong> {previewValues.finPaid || '0'} ₪</div>
                  <div style={{ color: '#f87171', fontWeight: 800, fontSize: 15 }}>
                    <strong>יתרת חוב כוללת לתביעה:</strong> {previewValues.finBalance || '0'} ₪
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClaimsFinancialAuditModal;
