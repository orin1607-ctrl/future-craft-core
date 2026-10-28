/**
 * ClaimsFinancialAuditModal.tsx
 *
 * מסך ומודאל בקרה כספית, השוואת דוחות שמאי ותשלומי ביטוח במערכת דליה (STAGING).
 * תומך במצב מרכזי (לכל התביעות הפעילות) ובמצב כרטיס תביעה בודד ("בדיקת דוח שמאי ותשלומים").
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

export interface ClaimSummary {
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
}

export interface ClaimsFinancialAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeClaimId?: string | null;
  claims: ClaimSummary[];
  onSaveClaimFinancials: (claimId: string, updatedFields: Record<string, unknown>) => Promise<boolean>;
  actorName: string;
}

export const ClaimsFinancialAuditModal: React.FC<ClaimsFinancialAuditModalProps> = ({
  isOpen,
  onClose,
  activeClaimId,
  claims,
  onSaveClaimFinancials,
  actorName,
}) => {
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(activeClaimId || null);
  const [activeTab, setActiveTab] = useState<'overview' | 'detail' | 'letter' | 'legal'>('overview');
  const [isScanning, setIsScanning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [scanResults, setScanResults] = useState<Record<string, FinancialComparisonResult>>({});
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  // עריכת שדות תצוגה מקדימה לפני שמירה
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
    if (activeClaimId) {
      setSelectedClaimId(activeClaimId);
      setActiveTab('detail');
    }
  }, [activeClaimId]);

  const showToast = (text: string, type: 'ok' | 'err' = 'ok') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const selectedClaim = useMemo(() => {
    return claims.find((c) => c.id === selectedClaimId) || null;
  }, [claims, selectedClaimId]);

  // סיכום סטטיסטי עבור כלל התביעות הפעילות
  const stats = useMemo(() => {
    let totalDemanded = 0;
    let totalApproved = 0;
    let totalPaid = 0;
    let countDemands = 0;
    let countPayments = 0;

    claims.forEach((c) => {
      const res = scanResults[c.id];
      const dem = res ? res.totalDemanded : parseFloat(c.finAmount || '0') || 0;
      const app = res ? res.totalApproved : parseFloat(c.finApproved || '0') || 0;
      const pd = res ? (res.totalVerifiedPaid > 0 ? res.totalVerifiedPaid : res.totalReportedPaid) : parseFloat(c.finPaid || '0') || 0;

      if (dem > 0) {
        totalDemanded += dem;
        countDemands++;
      }
      if (app > 0) totalApproved += app;
      if (pd > 0) {
        totalPaid += pd;
        countPayments++;
      }
    });

    const totalGap = Math.max(0, totalDemanded - totalPaid);

    return {
      totalClaims: claims.length,
      countDemands,
      countPayments,
      totalDemanded,
      totalApproved,
      totalPaid,
      totalGap,
    };
  }, [claims, scanResults]);

  // הרצת סריקה והשוואה על תביעות קיימות (בדיקה בטוחה בזיכרון)
  const handleScanClaims = async () => {
    setIsScanning(true);
    showToast('מבצע סריקה והשוואה של מסמכי התביעות...');

    try {
      const results: Record<string, FinancialComparisonResult> = {};

      for (const claim of claims) {
        const row = claim.row_data || {};
        const audit = (row.financial_audit as any) || {};

        let demand = audit.our_demand as OurSurveyorReportExtraction | null;
        let counter = (audit.counter_reports && audit.counter_reports[0]) as CounterReportExtraction | null;
        let payment = (audit.payment_notices && audit.payment_notices[0]) as PaymentNoticeExtraction | null;

        // אם אין דוח שמור ב-financial_audit, מחלצים מהערות או מסמכים קיימים
        if (!demand && claim.notes) {
          demand = extractOurSurveyorReport(claim.notes);
        }

        const comp = compareFinancialAudit({
          claimId: claim.id,
          plateNumber: claim.plate,
          ourDemand: demand,
          counterReport: counter,
          paymentNotice: payment,
          verifiedPayments: audit.verified_payments || [],
        });

        results[claim.id] = comp;
      }

      setScanResults(results);
      showToast('הסריקה הושלמה בהצלחה!');
    } catch (err: any) {
      showToast(`שגיאה בסריקה: ${err.message}`, 'err');
    } finally {
      setIsScanning(false);
    }
  };

  // בעת בחירת תביעה ספציפית: הכנת ערכי תצוגה מקדימה לעריכה
  useEffect(() => {
    if (!selectedClaim) return;

    const row = selectedClaim.row_data || {};
    const audit = (row.financial_audit as any) || {};
    const comp = scanResults[selectedClaim.id];

    const currentDemand = comp?.totalDemanded || parseFloat(selectedClaim.finAmount || '0') || 0;
    const currentApproved = comp?.totalApproved || parseFloat(selectedClaim.finApproved || '0') || 0;
    const currentPaid = comp?.totalVerifiedPaid || parseFloat(selectedClaim.finPaid || '0') || 0;
    const currentBalance = currentDemand > 0 ? Math.max(0, currentDemand - currentPaid) : 0;

    setPreviewValues({
      finAmount: currentDemand > 0 ? String(currentDemand) : (selectedClaim.finAmount || ''),
      finApproved: currentApproved > 0 ? String(currentApproved) : (selectedClaim.finApproved || ''),
      finPaid: currentPaid > 0 ? String(currentPaid) : (selectedClaim.finPaid || ''),
      finPayDate: selectedClaim.finPayDate || new Date().toISOString().slice(0, 10),
      finRef: selectedClaim.finRef || '',
      finBalance: String(currentBalance),
      isVerified: Boolean(audit.verified_payments?.some((p: any) => p.verified)),
    });
  }, [selectedClaim, scanResults]);

  // שמירה מאובטחת לכרטיס התביעה
  const handleSaveToClaimCard = async () => {
    if (!selectedClaim) return;
    setIsSaving(true);

    try {
      const dem = parseFloat(previewValues.finAmount) || 0;
      const app = parseFloat(previewValues.finApproved) || 0;
      const pd = parseFloat(previewValues.finPaid) || 0;
      const bal = dem > 0 ? Math.max(0, dem - pd) : 0;

      // בניית רשומת תשלום מאומת אם סומן
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

      // עדכון בטוח של financial_audit
      const updateResult = safelyUpdateFinancialAudit({
        existingRowData: selectedClaim.row_data || {},
        updatedBy: actorName || 'משתמש',
        actionSummary: 'עדכון בקרה כספית ותשלומי ביטוח',
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

      const success = await onSaveClaimFinancials(selectedClaim.id, updatedRowData);
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

  // הפקת טיוטת מכתב השגה למבטחת
  const letterDraftText = useMemo(() => {
    if (!selectedClaim) return '';
    const comp = scanResults[selectedClaim.id];
    const dem = previewValues.finAmount || '0';
    const app = previewValues.finApproved || '0';
    const diff = comp ? comp.differenceDemandVsApproved : Math.max(0, parseFloat(dem) - parseFloat(app));

    return `לכבוד: ${selectedClaim.insCompany || 'מחלקת תביעות ביטוח'}
הנדון: השגה ודרישת הפרשים – תביעה מס' ${selectedClaim.claimNum || selectedClaim.id}
רכב מס': ${selectedClaim.plate} | מבוטח/ת: ${selectedClaim.clientName}

שלום רב,

בהמשך להודעת הסילוק / שומת הבקרה שהתקבלה במשרדנו בגין האירוע הנדון:
דרישת השמאי מטעמנו הועמדה על סך כולל של ${parseFloat(dem).toLocaleString()} ₪ (כולל מע"מ).
בחישוב המבטחת אושר סך של ${parseFloat(app).toLocaleString()} ₪ בלבד, ונוצר פער בלתי מוצדק של ${diff.toLocaleString()} ₪.

מבדיקה פרטנית של הדוחות עולה כי בוצעו ההפחתות הבאות שאינן נתמכות בדין או בעובדות:
${comp?.rows.filter((r) => r.status === 'reduction' || r.status === 'unexplained').map((r) => `• סעיף ${r.category}: הופחתו ${r.diff?.toLocaleString()} ₪ (${r.explanation})`).join('\n') || '• הפחתה שרירותית של שעות עבודה, חלפים וצבע ללא נימוק טכני.'}

לאור האמור לעיל, הנכם נדרשים להעביר את יתרת התשלום בסך ${diff.toLocaleString()} ₪ לחשבון המוסך בתוך 7 ימי עבודה.

בברכה,
מחלקת תביעות – מוסך אורן`;
  }, [selectedClaim, scanResults, previewValues]);

  if (!isOpen) return null;

  return (
    <div className="cfa-modal-overlay" onClick={onClose}>
      <div className="cfa-root" onClick={(e) => e.stopPropagation()}>
        {/* כותרת עליונה */}
        <div className="cfa-header">
          <div>
            <div className="cfa-title">
              <span>⚖️</span>
              <span>בקרה כספית ותשלומי ביטוח</span>
              {selectedClaim && <span style={{ fontSize: 14, color: '#38bdf8' }}>({selectedClaim.id} · {selectedClaim.plate})</span>}
            </div>
            <div className="cfa-subtitle">
              קליטת דוחות שמאי, חילוץ סעיפי נזק, אימות תשלומי מבטחות והשוואת הפרשים
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

        {/* סרגל כרטיסי סטטיסטיקה */}
        <div className="cfa-stats-grid">
          <div className="cfa-stat-card">
            <span className="cfa-stat-label">תביעות פעילות</span>
            <span className="cfa-stat-val primary">{stats.totalClaims}</span>
          </div>
          <div className="cfa-stat-card">
            <span className="cfa-stat-label">סה"כ דרישות שמאים</span>
            <span className="cfa-stat-val">{stats.totalDemanded.toLocaleString()} ₪</span>
          </div>
          <div className="cfa-stat-card">
            <span className="cfa-stat-label">סה"כ אושר ע"י מבטחות</span>
            <span className="cfa-stat-val warning">{stats.totalApproved.toLocaleString()} ₪</span>
          </div>
          <div className="cfa-stat-card">
            <span className="cfa-stat-label">סה"כ שולם בפועל</span>
            <span className="cfa-stat-val success">{stats.totalPaid.toLocaleString()} ₪</span>
          </div>
          <div className="cfa-stat-card">
            <span className="cfa-stat-label">פער כולל לגבייה / השגה</span>
            <span className="cfa-stat-val danger">{stats.totalGap.toLocaleString()} ₪</span>
          </div>
        </div>

        {/* טאבים לניווט */}
        <div className="cfa-nav-tabs">
          <button
            type="button"
            className={`cfa-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            📋 ריכוז תביעות והשוואה
          </button>
          <button
            type="button"
            className={`cfa-tab-btn ${activeTab === 'detail' ? 'active' : ''}`}
            onClick={() => setActiveTab('detail')}
            disabled={!selectedClaim}
          >
            🔍 בדיקת דוח שמאי ותשלומים {selectedClaim ? `(${selectedClaim.id})` : ''}
          </button>
          <button
            type="button"
            className={`cfa-tab-btn ${activeTab === 'letter' ? 'active' : ''}`}
            onClick={() => setActiveTab('letter')}
            disabled={!selectedClaim}
          >
            ✉️ מכתב השגה למבטחת
          </button>
          <button
            type="button"
            className={`cfa-tab-btn ${activeTab === 'legal' ? 'active' : ''}`}
            onClick={() => setActiveTab('legal')}
            disabled={!selectedClaim}
          >
            📁 תיק לטיפול משפטי
          </button>
        </div>

        {/* תוכן ראשי */}
        <div className="cfa-content">
          {activeTab === 'overview' && (
            <>
              <div className="cfa-actions-bar">
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    className="cfa-btn cfa-btn-primary"
                    onClick={handleScanClaims}
                    disabled={isScanning}
                  >
                    {isScanning ? '⏳ סורק מסמכים…' : '🔍 סרוק והשווה תביעות קיימות'}
                  </button>
                </div>
                <div style={{ fontSize: 13, color: '#94a3b8' }}>
                  לחץ על תביעה בטבלה כדי לבדוק את הדוח, לחלץ סעיפים ולעדכן את הכרטיס.
                </div>
              </div>

              <div className="cfa-table-wrapper">
                <table className="cfa-table">
                  <thead>
                    <tr>
                      <th>מס' תביעה</th>
                      <th>רכב</th>
                      <th>לקוח</th>
                      <th>מבטחת</th>
                      <th>דרישת שמאי</th>
                      <th>אישור מבטח</th>
                      <th>שולם</th>
                      <th>הפרש</th>
                      <th>סטטוס בקרה</th>
                      <th>פעולה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {claims.map((claim) => {
                      const res = scanResults[claim.id];
                      const dem = res ? res.totalDemanded : parseFloat(claim.finAmount || '0') || 0;
                      const app = res ? res.totalApproved : parseFloat(claim.finApproved || '0') || 0;
                      const pd = res ? (res.totalVerifiedPaid > 0 ? res.totalVerifiedPaid : res.totalReportedPaid) : parseFloat(claim.finPaid || '0') || 0;
                      const diff = dem > 0 ? Math.round((dem - pd) * 100) / 100 : 0;

                      return (
                        <tr key={claim.id} style={{ cursor: 'pointer' }} onClick={() => { setSelectedClaimId(claim.id); setActiveTab('detail'); }}>
                          <td style={{ fontWeight: 700, color: '#38bdf8' }}>{claim.id}</td>
                          <td>{claim.plate}</td>
                          <td>{claim.clientName}</td>
                          <td>{claim.insCompany || '—'}</td>
                          <td style={{ fontWeight: 700 }}>{dem > 0 ? `${dem.toLocaleString()} ₪` : '—'}</td>
                          <td>{app > 0 ? `${app.toLocaleString()} ₪` : '—'}</td>
                          <td style={{ color: pd > 0 ? '#4ade80' : 'inherit' }}>{pd > 0 ? `${pd.toLocaleString()} ₪` : '—'}</td>
                          <td style={{ fontWeight: 700, color: diff > 0 ? '#f87171' : '#4ade80' }}>
                            {diff > 0 ? `${diff.toLocaleString()} ₪` : (dem > 0 ? 'שולם במלואו' : '—')}
                          </td>
                          <td>
                            {res?.hasUnexplainedDeductions ? (
                              <span className="cfa-badge cfa-badge-unexplained">קיזוז שרירותי</span>
                            ) : res?.hasPartCuts || res?.hasLaborCuts ? (
                              <span className="cfa-badge cfa-badge-reduction">הפחתות שומה</span>
                            ) : dem > 0 && diff <= 0 ? (
                              <span className="cfa-badge cfa-badge-match">תואם מלא</span>
                            ) : (
                              <span className="cfa-badge cfa-badge-missing">ממתין לבדיקה</span>
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="cfa-btn cfa-btn-secondary"
                              style={{ padding: '4px 8px', fontSize: 11 }}
                              onClick={(e) => { e.stopPropagation(); setSelectedClaimId(claim.id); setActiveTab('detail'); }}
                            >
                              בדוק תיק
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeTab === 'detail' && selectedClaim && (
            <div>
              <div className="cfa-actions-bar">
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button
                    type="button"
                    className="cfa-btn cfa-btn-secondary"
                    onClick={() => setActiveTab('overview')}
                  >
                    ← חזרה לריכוז התביעות
                  </button>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#ffffff' }}>
                    תיק {selectedClaim.id} | רכב: {selectedClaim.plate} | מבוטח: {selectedClaim.clientName}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="cfa-btn cfa-btn-primary"
                    onClick={() => setActiveTab('letter')}
                  >
                    ✉️ הכן מכתב השגה
                  </button>
                </div>
              </div>

              {/* טבלת השוואת סעיפים מפורטת */}
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ color: '#38bdf8', marginBottom: 8, fontSize: 14 }}>
                  📊 השוואת סעיפי נזק ואישורים (דוח שמאי מול אישור מבטח מול תשלום)
                </h4>
                <div className="cfa-table-wrapper">
                  <table className="cfa-table">
                    <thead>
                      <tr>
                        <th>סעיף נזק / קיזוז</th>
                        <th>דרישת שמאי</th>
                        <th>אישור מבטח</th>
                        <th>שולם</th>
                        <th>הפרש</th>
                        <th>הסבר וציטוט מהמסמך</th>
                        <th>סטטוס</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scanResults[selectedClaim.id]?.rows.map((row, idx) => (
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
                      )) || (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>
                            טרם בוצעה סריקה עבור תיק זה. הזן את הנתונים בטופס למטה או לחץ "סרוק והשווה".
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* טופס תצוגה מקדימה ואישור הזנת נתונים לכרטיס התביעה */}
              <div style={{ background: '#0f172a', padding: 20, borderRadius: 12, border: '1px solid #1e293b' }}>
                <h4 style={{ color: '#4ade80', marginBottom: 12, fontSize: 14 }}>
                  💾 תצוגה מקדימה ואישור הזנת נתונים לכרטיס התביעה (row_data)
                </h4>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>
                  בדוק את הנתונים שחולצו לפני השמירה. השדות ישולבו בכרטיס התביעה, בדוחות הכספיים ובמנוע ה-AI.
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
                    <label className="cfa-form-label">יתרה לגבייה (₪)</label>
                    <input
                      type="text"
                      className="cfa-input"
                      readOnly
                      style={{ background: '#1e293b', fontWeight: 700, color: '#f87171' }}
                      value={previewValues.finBalance}
                    />
                  </div>
                </div>

                <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                    onClick={handleSaveToClaimCard}
                    disabled={isSaving}
                  >
                    {isSaving ? '⏳ שומר נתונים…' : '💾 אשר והזן נתונים לכרטיס התביעה'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'letter' && selectedClaim && (
            <div>
              <div className="cfa-actions-bar">
                <button type="button" className="cfa-btn cfa-btn-secondary" onClick={() => setActiveTab('detail')}>
                  ← חזרה לפרטי הבקרה
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
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
              </div>

              <div style={{ background: '#0f172a', padding: 20, borderRadius: 12, border: '1px solid #1e293b' }}>
                <h4 style={{ color: '#38bdf8', marginBottom: 12 }}>
                  ✉️ טיוטת מכתב השגה ודרישת הפרשים למבטחת
                </h4>
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

          {activeTab === 'legal' && selectedClaim && (
            <div>
              <div className="cfa-actions-bar">
                <button type="button" className="cfa-btn cfa-btn-secondary" onClick={() => setActiveTab('detail')}>
                  ← חזרה לפרטי הבקרה
                </button>
              </div>

              <div style={{ background: '#0f172a', padding: 20, borderRadius: 12, border: '1px solid #1e293b' }}>
                <h4 style={{ color: '#f87171', marginBottom: 12 }}>
                  📁 תיק מסמכים ונתונים לטיפול משפטי / כתב תביעה
                </h4>
                <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
                  סיכום עובדתי מוכן להעברה לעו"ד עם כל הציטוטים והראיות מהמסמכים בתיק.
                </div>

                <div style={{ background: '#1e293b', padding: 16, borderRadius: 8, fontSize: 13, lineHeight: 1.8 }}>
                  <div><strong>מספר תיק בדליה:</strong> {selectedClaim.id}</div>
                  <div><strong>מספר תביעת ביטוח:</strong> {selectedClaim.claimNum || 'טרם עודכן'}</div>
                  <div><strong>פרטי רכב ולוחית:</strong> {selectedClaim.plate}</div>
                  <div><strong>שם המבוטח / לקוח:</strong> {selectedClaim.clientName}</div>
                  <div><strong>חברת ביטוח נתבעת:</strong> {selectedClaim.insCompany || 'לא צוינה'}</div>
                  <div style={{ margin: '12px 0', borderTop: '1px solid #334155' }} />
                  <div><strong>דרישת שומת שמאי שלנו:</strong> {previewValues.finAmount || '0'} ₪</div>
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
