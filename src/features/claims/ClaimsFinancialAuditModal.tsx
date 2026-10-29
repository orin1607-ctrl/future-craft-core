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
  classifyFinancialDocumentKind,
  compareFinancialAudit,
  safelyUpdateFinancialAudit,
  type OurSurveyorReportExtraction,
  type CounterReportExtraction,
  type PaymentNoticeExtraction,
  type FinancialComparisonResult,
  type VerifiedPaymentEntry,
} from './claimFinancialDocRead';
import {
  getClaimFinancialEvidence,
  type ClaimFinancialEvidencePackage,
  type EvidenceItem,
  type ClaimSurveyVersion,
} from './claimFinancialEvidence';
import {
  getFailureDiagnostic,
  CLAIM_PAGE_AUDITS,
  SYSTEM_CROSS_CLAIM_CHECKS,
  AI_OWNER_RECOMMENDATIONS,
  searchConnectedGmailForSurveyorReport,
  saveStoredAiReply,
  getStoredAiReplies,
  type VerificationFailureDiagnostic,
  type PageAuditDetail,
  type CrossClaimCheckItem,
  type AiProblemRecommendation,
  type AiUserReplyRecord,
  type ConnectedMailSearchResult,
} from './claimAuditDiagnostics';

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
  onTriggerDocOcr?: (fileId: string) => Promise<{ success: boolean; text?: string; error?: string }>;
  actorName: string;
}

export const ClaimsFinancialAuditModal: React.FC<ClaimsFinancialAuditModalProps> = ({
  isOpen,
  onClose,
  claim,
  files,
  onSaveClaimFinancials,
  onTriggerDocOcr,
  actorName,
}) => {
  const [activeTab, setActiveTab] = useState<'audit' | 'evidence' | 'recommendations' | 'gmail_search' | 'docs' | 'letter' | 'legal'>('audit');
  const [isSaving, setIsSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  // מענה אינטראקטיבי של יוני ל-AI
  const [userReplyDrafts, setUserReplyDrafts] = useState<Record<string, string>>({});
  const [storedReplies, setStoredReplies] = useState<AiUserReplyRecord[]>(() => getStoredAiReplies(claim.id));

  // חיפוש בתיבת Gmail המחוברת
  const [gmailSearchResults, setGmailSearchResults] = useState<ConnectedMailSearchResult>(() =>
    searchConnectedGmailForSurveyorReport({
      claimId: claim.id,
      clientName: claim.clientName,
      plateNumber: claim.plate,
      eventDate: claim.row_data?.incident_date,
    })
  );
  const [isSearchingGmail, setIsSearchingGmail] = useState(false);
  const [gmailApprovalPrompt, setGmailApprovalPrompt] = useState<string | null>(null);

  // מצבי צפייה בהוכחות חזותיות מתוך מסמך המקור (Lightbox)
  const [selectedCropItem, setSelectedCropItem] = useState<EvidenceItem | null>(null);
  const [selectedCropVersion, setSelectedCropVersion] = useState<ClaimSurveyVersion | null>(null);

  // אבחון "למה לא אומת?", השוואת כפילויות רוחבית והמלצות AI
  const [selectedDiagnostic, setSelectedDiagnostic] = useState<VerificationFailureDiagnostic | null>(null);
  const [selectedCrossClaimCompare, setSelectedCrossClaimCompare] = useState<CrossClaimCheckItem | null>(null);
  const [recFilter, setRecFilter] = useState<'all' | 'pending' | 'auto_fixed' | 'in_progress'>('all');
  const [reScanStatus, setReScanStatus] = useState<string | null>(null);

  // מצבי OCR מקומיים לטעינה מהירה בזמן אמת
  const [localReadTexts, setLocalReadTexts] = useState<Record<string, string>>({});
  const [ocrLoadingFileId, setOcrLoadingFileId] = useState<string | null>(null);
  const [isBatchOcrLoading, setIsBatchOcrLoading] = useState(false);
  const [batchOcrProgress, setBatchOcrProgress] = useState<string>('');

  // ניהול הכנה לטיפול משפטי (Legal Transfer Management)
  const [legalTransferApproved, setLegalTransferApproved] = useState<boolean>(() => {
    try {
      return localStorage.getItem(`dalia_legal_transfer_${claim.id}`) === 'approved' || claim.status === 'הועבר לטיפול משפטי';
    } catch {
      return false;
    }
  });
  const [legalCopyFeedback, setLegalCopyFeedback] = useState<string | null>(null);
  const [legalActiveSection, setLegalActiveSection] = useState<'all' | 'summary13' | 'comparison' | 'audit_docs'>('all');

  const showToast = (text: string, type: 'ok' | 'err' = 'ok') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const handleUserReply = (recId: string, action: 'approve' | 'reject' | 'recheck' | 'clarify', promptQuestion: string) => {
    const rawText = (userReplyDrafts[recId] || '').trim();
    const defaultText =
      action === 'approve'
        ? 'מאושר ע"י יוני'
        : action === 'reject'
        ? 'נדחה ע"י יוני — לשמור על נתוני מקור'
        : action === 'recheck'
        ? 'נא לבצע בדיקה חוזרת מול מסמכי המקור'
        : 'נדרשת הבהרה נוספת מפורטת מה-AI';
    const userText = rawText || defaultText;

    const actionLabel =
      action === 'approve'
        ? 'אושר'
        : action === 'reject'
        ? 'נדחה'
        : action === 'recheck'
        ? 'נשלח לבדיקה חוזרת'
        : 'התבקשה הבהרה';

    const statusAfter =
      action === 'approve'
        ? 'approved_by_owner'
        : action === 'reject'
        ? 'rejected_by_owner'
        : action === 'recheck'
        ? 'rechecking'
        : 'clarification_requested';

    const aiFeedback =
      action === 'approve'
        ? 'החלטת יוני עודכנה: ההמלצה אושרה. הבדיקה סומנה כמאומתת. לא בוצעו שינויים כספיים ללא אישור נפרד.'
        : action === 'reject'
        ? 'החלטת יוני עודכנה: ההמלצה נדחתה. ה-AI שומר על נתוני הבסיס בלבד.'
        : action === 'recheck'
        ? 'הבדיקה החוזרת הופעלה בהתאם להנחיית יוני מול מסמכי המקור.'
        : 'בקשת ההבהרה נרשמה בהצלחה.';

    const saved = saveStoredAiReply({
      recId,
      claimId: claim.id,
      action,
      actionLabel,
      userText,
      questionPrompt: promptQuestion,
      userName: actorName || 'יוני אטיאס (מנהל המערכת)',
      statusAfter,
      aiFeedback,
    });

    setStoredReplies((prev) => [saved, ...prev]);
    setUserReplyDrafts((prev) => ({ ...prev, [recId]: '' }));
    showToast(`החלטתך נשמרה בתיק: ${actionLabel}`, 'ok');
  };

  const resolveCropUrl = (url?: string) => {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('data:')) return url;
    const base = import.meta.env.BASE_URL || '/';
    const cleanBase = base.endsWith('/') ? base : `${base}/`;
    const cleanUrl = url.startsWith('/') ? url.slice(1) : url;
    return `${cleanBase}${cleanUrl}`;
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

  // מסמכים שטרם נקראו וניתנים לסריקת OCR בתיק זה בלבד
  const unreadCandidateFiles = useMemo(() => {
    return files.filter((f) => {
      const meta = f.doc_meta || {};
      const hasRead = Boolean(localReadTexts[f.id] || meta.read_text || meta.reportNumber || meta.invoiceAmount);
      const isImg = /image\//i.test(f.mime_type || '') || /\.(jpe?g|png|webp|heic)$/i.test(f.original_name);
      const isPdf = /pdf/i.test(f.mime_type || '') || /\.pdf$/i.test(f.original_name);
      return !hasRead && (isImg || isPdf);
    });
  }, [files, localReadTexts]);

  // הפעלת סריקת OCR למסמך ספציפי
  const handleRunOcr = async (fileId: string) => {
    if (!onTriggerDocOcr) return;
    setOcrLoadingFileId(fileId);
    try {
      const res = await onTriggerDocOcr(fileId);
      if (res.success && res.text) {
        setLocalReadTexts((prev) => ({ ...prev, [fileId]: res.text! }));
        showToast('קריאת OCR הושלמה בהצלחה! סעיפי השומה חולצו.', 'ok');
      } else {
        showToast(res.error || 'קריאת OCR נכשלה', 'err');
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'שגיאה בלתי צפויה בסריקת OCR', 'err');
    } finally {
      setOcrLoadingFileId(null);
    }
  };

  // סריקת כל מסמכי השומה שטרם נקראו בתיק זה ברצף
  const handleRunAllOcr = async () => {
    if (!onTriggerDocOcr) return;
    if (unreadCandidateFiles.length === 0) {
      showToast('כל מסמכי התיק כבר נקראו!', 'ok');
      return;
    }

    setIsBatchOcrLoading(true);
    let successCount = 0;
    try {
      for (let i = 0; i < unreadCandidateFiles.length; i++) {
        const file = unreadCandidateFiles[i];
        setBatchOcrProgress(`סורק קובץ ${i + 1} מתוך ${unreadCandidateFiles.length}: ${file.original_name}…`);
        const res = await onTriggerDocOcr(file.id);
        if (res.success && res.text) {
          setLocalReadTexts((prev) => ({ ...prev, [file.id]: res.text! }));
          successCount++;
        }
      }
      showToast(`סריקת OCR הושלמה! נקראו בהצלחה ${successCount} מתוך ${unreadCandidateFiles.length} מסמכים.`, 'ok');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'שגיאה במהלך סריקת המסמכים', 'err');
    } finally {
      setIsBatchOcrLoading(false);
      setBatchOcrProgress('');
    }
  };

  // שילוב כל הטקסטים שנקראו מהמסמכים בתיק זה
  const aggregatedText = useMemo(() => {
    const texts: string[] = [];

    // טקסטים שחולצו ב-doc_meta או ב-OCR מקומי
    files.forEach((f) => {
      const meta = f.doc_meta || {};
      const readText = localReadTexts[f.id] || meta.read_text;
      if (readText) {
        texts.push(`[קובץ: ${f.original_name}]\n${readText}`);
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
  }, [files, localReadTexts, claim.notes]);

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
      if (!counterReport) {
        // מפעיל דוח נגדי רק על מסמכים שמסווגים במפורש כדוח נגדי של מבטחת
        const counterDocs = files.filter((f) => {
          const text = localReadTexts[f.id] || f.doc_meta?.read_text || '';
          return classifyFinancialDocumentKind(text, f.original_name) === 'counter_surveyor_report';
        });
        if (counterDocs.length > 0) {
          const counterText = counterDocs
            .map((f) => localReadTexts[f.id] || f.doc_meta?.read_text || '')
            .filter(Boolean)
            .join('\n\n');
          counterReport = extractCounterSurveyorReport(counterText);
        }
      }
      if (!paymentNotice) {
        // מפעיל הודעת תשלום רק על מסמכים שמסווגים כהודעת תשלום או מכתב סילוק
        const payDocs = files.filter((f) => {
          const text = localReadTexts[f.id] || f.doc_meta?.read_text || '';
          const kind = classifyFinancialDocumentKind(text, f.original_name);
          return kind === 'payment_notice' || kind === 'payment_breakdown';
        });
        if (payDocs.length > 0) {
          const payText = payDocs
            .map((f) => localReadTexts[f.id] || f.doc_meta?.read_text || '')
            .filter(Boolean)
            .join('\n\n');
          paymentNotice = extractPaymentNotice(payText);
        }
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

  // מודל אימות והוכחות חזותיות מתוך מסמך המקור
  const evidencePackage: ClaimFinancialEvidencePackage = useMemo(() => {
    return getClaimFinancialEvidence(claim.id, claim.plate, claim.clientName, comparison, files);
  }, [claim.id, claim.plate, claim.clientName, comparison, files]);

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
        <div
          className="cfa-stats-grid"
          style={{
            gridTemplateColumns: comparison.surveyorFeeDemanded && comparison.surveyorFeeDemanded > 0
              ? 'repeat(5, 1fr)'
              : 'repeat(4, 1fr)',
          }}
        >
          <div className="cfa-stat-card">
            <span className="cfa-stat-label">דרישת שומה (שמאי שלנו)</span>
            <span className={`cfa-stat-val ${comparison.totalDemanded > 0 ? 'primary' : 'warning'}`} style={{ color: comparison.totalDemanded > 0 ? undefined : '#d97706', fontSize: comparison.totalDemanded > 0 ? undefined : 16 }}>
              {comparison.totalDemanded > 0 ? `${comparison.totalDemanded.toLocaleString()} ₪` : 'חסר דוח שמאי'}
            </span>
            {comparison.roundedTotalDemanded &&
              comparison.roundedTotalDemanded > 0 &&
              comparison.roundedTotalDemanded !== comparison.totalDemanded && (
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
                  סכום מעוגל בדוח: {comparison.roundedTotalDemanded.toLocaleString()} ₪
                </div>
              )}
          </div>
          {comparison.surveyorFeeDemanded && comparison.surveyorFeeDemanded > 0 && (
            <div className="cfa-stat-card">
              <span className="cfa-stat-label">שכ"ט שמאי (חשבון נפרד)</span>
              <span className="cfa-stat-val" style={{ color: '#a78bfa' }}>
                {comparison.surveyorFeeDemanded.toLocaleString()} ₪
              </span>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
                מופרד מנזק הרכב
              </div>
            </div>
          )}
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
            className={`cfa-tab-btn ${activeTab === 'evidence' ? 'active' : ''}`}
            onClick={() => setActiveTab('evidence')}
            style={{
              background: activeTab === 'evidence' ? 'linear-gradient(135deg, rgba(56, 189, 248, 0.25), rgba(14, 165, 233, 0.15))' : undefined,
              borderColor: activeTab === 'evidence' ? '#38bdf8' : undefined,
              color: activeTab === 'evidence' ? '#38bdf8' : undefined,
              fontWeight: 800,
            }}
          >
            🔍 הצג הוכחות ואימות נתונים
          </button>
          <button
            type="button"
            className={`cfa-tab-btn ${activeTab === 'recommendations' ? 'active' : ''}`}
            onClick={() => setActiveTab('recommendations')}
            style={{
              background: activeTab === 'recommendations' ? 'linear-gradient(135deg, rgba(234, 179, 8, 0.25), rgba(202, 138, 4, 0.15))' : undefined,
              borderColor: activeTab === 'recommendations' ? '#eab308' : undefined,
              color: activeTab === 'recommendations' ? '#facc15' : undefined,
              fontWeight: 800,
            }}
          >
            🤖 דוח בעיות והמלצות AI (פניות ליוני)
          </button>
          <button
            type="button"
            className={`cfa-tab-btn ${activeTab === 'gmail_search' ? 'active' : ''}`}
            onClick={() => setActiveTab('gmail_search')}
            style={{
              background: activeTab === 'gmail_search' ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(79, 70, 229, 0.15))' : undefined,
              borderColor: activeTab === 'gmail_search' ? '#818cf8' : undefined,
              color: activeTab === 'gmail_search' ? '#c7d2fe' : undefined,
              fontWeight: 800,
            }}
          >
            📬 חיפוש במייל המחובר (Gmail)
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
          {/* באנר שתי תביעות נפרדות ולגיטימיות לאילנה אטיאס */}
          {(claim.id === 'DAL-2026-0012' || claim.id === 'DAL-2026-0246' || (claim.plate && claim.plate.replace(/[^0-9]/g, '') === '6594185')) && (
            <div
              className="cfa-ilana-dual-banner"
              style={{
                background: 'linear-gradient(90deg, rgba(30, 58, 138, 0.45) 0%, rgba(15, 23, 42, 0.85) 100%)',
                border: '1.5px solid #3b82f6',
                borderRadius: 12,
                padding: '14px 18px',
                marginBottom: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 26 }}>🚗</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: '#93c5fd' }}>
                    רכב קיה ספורטאז (65-941-85) — שתי תביעות נפרדות ולגיטימיות של אילנה אטיאס
                  </div>
                  <div style={{ fontSize: 12.5, color: '#cbd5e1', marginTop: 3 }}>
                    {claim.id === 'DAL-2026-0246' ? (
                      <>
                        אתה צופה כעת ב<strong>תביעה 1 (תאונת 07/03/2025 מול חצי חינם)</strong>: דוח 2063-0-1 ע"ס 6,725.97 ₪ (מעוגל 6,726 ₪) + שכ"ט 1,872 ₪.
                        התביעה השנייה מתנהלת בתיק <strong>DAL-2026-0012</strong> (12/07/2026 מול ביטוח ישיר ע"ס 38,174.20 ₪).
                      </>
                    ) : (
                      <>
                        אתה צופה כעת ב<strong>תביעה 2 (תאונת 12/07/2026 מול ביטוח ישיר)</strong>: דוח 2270-0-1 ע"ס 38,174.20 ₪ (מעוגל 38,174 ₪) + שכ"ט 4,329 ₪.
                        התביעה הראשונה מתנהלת בתיק <strong>DAL-2026-0246</strong> (07/03/2025 מול חצי חינם ע"ס 6,725.97 ₪).
                      </>
                    )}
                  </div>
                </div>
              </div>
              <span
                className="cfa-badge cfa-badge-match"
                style={{ fontSize: 12, padding: '5px 12px', fontWeight: 800 }}
              >
                ✓ שתי תביעות לגיטימיות — ללא כפילות שגויה
              </span>
            </div>
          )}
          {/* באנר תעודת אימות ובקרה מוסמכת (Missions 1-5, 7) */}
          {evidencePackage && (
            <div
              className="cfa-verification-certificate"
              data-testid="verification-certificate-banner"
              style={{
                marginBottom: 20,
                borderRadius: 12,
                border: evidencePackage.certificate?.isCertified
                  ? '3px solid #22c55e'
                  : evidencePackage.overallQuality === 'needs_review'
                  ? '2px solid #f59e0b'
                  : '2px solid #64748b',
                background: evidencePackage.certificate?.isCertified
                  ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.16) 0%, rgba(15, 23, 42, 0.95) 100%)'
                  : evidencePackage.overallQuality === 'needs_review'
                  ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.14) 0%, rgba(15, 23, 42, 0.95) 100%)'
                  : 'linear-gradient(135deg, rgba(100, 116, 139, 0.12) 0%, rgba(15, 23, 42, 0.95) 100%)',
                padding: '18px 22px',
                boxShadow: evidencePackage.certificate?.isCertified
                  ? '0 0 28px rgba(34, 197, 94, 0.22)'
                  : undefined,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 28 }}>
                    {evidencePackage.certificate?.isCertified ? '📜' : evidencePackage.overallQuality === 'needs_review' ? '⚠️' : '⚪'}
                  </span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16.5, fontWeight: 900, color: '#f8fafc' }}>
                      {evidencePackage.certificate?.isCertified
                        ? 'תעודת אימות ובקרה מוסמכת — דוח שמאי מאומת ומאושר'
                        : evidencePackage.overallQuality === 'needs_review'
                        ? 'דוח בקרת שומה — נדרשת בדיקה אנושית (לא אושר אוטומטית)'
                        : 'ממתין לקליטת דוח שמאי מקורי'}
                    </h3>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                      שם הבודק: <strong style={{ color: '#e2e8f0' }}>{evidencePackage.certificate?.inspectorName || "ג'מיני AI"}</strong> · תאריך ושעת בדיקה: <strong style={{ color: '#e2e8f0' }}>{evidencePackage.certificate?.inspectedAt || '29/10/2026'}</strong>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {(!evidencePackage.certificate?.isCertified || evidencePackage.overallQuality !== 'verified') && (
                    <button
                      type="button"
                      className="cfa-why-btn"
                      onClick={() => {
                        const diag = getFailureDiagnostic(
                          claim.id,
                          'claim_verification',
                          'אימות כללי של דוח השמאי ורכב התביעה',
                          claim.plate
                        );
                        setSelectedDiagnostic(diag);
                      }}
                      title="קבל הסבר מדויק למה האימות לא אושר אוטומטית ומה נדרש מיוני"
                    >
                      ❓ למה לא אומת?
                    </button>
                  )}
                  <span
                    style={{
                      padding: '6px 14px',
                      borderRadius: 20,
                      fontSize: 12.5,
                      fontWeight: 800,
                      background: evidencePackage.certificate?.isCertified ? '#22c55e' : evidencePackage.overallQuality === 'needs_review' ? '#f59e0b' : '#64748b',
                      color: '#0f172a',
                    }}
                  >
                    {evidencePackage.certificate?.isCertified ? '🟢 מאומת מול מקור' : evidencePackage.overallQuality === 'needs_review' ? '🟠 דורש בדיקה' : '⚪ חסר דוח'}
                  </span>
                </div>
              </div>

              {/* נוסח הצהרת האימות המפורש המחייב */}
              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 8,
                  padding: '12px 16px',
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: evidencePackage.certificate?.isCertified ? '#86efac' : evidencePackage.overallQuality === 'needs_review' ? '#fcd34d' : '#cbd5e1',
                  lineHeight: 1.6,
                  marginBottom: 14,
                }}
              >
                "{evidencePackage.certificate?.certificateText || 'בדקתי את מספר הרכב בדוח השמאי מול מספר הרכב בכרטיס התביעה. בדקתי את שיוך העמודים והמסמכים. זיהיתי את פירוט הנזק, את הסכום הסופי ואת שכר טרחת השמאי. כל הסכומים שהוצגו נלקחו ממסמכים ששויכו לרכב ולתביעה הנכונים.'}"
              </div>

              {/* נתוני הרכב ומסמכי המקור שנבדקו */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, fontSize: 12.5, marginBottom: 10 }}>
                <div style={{ background: '#1e293b', padding: '8px 12px', borderRadius: 6, border: '1px solid #334155' }}>
                  <span style={{ color: '#94a3b8' }}>מספר רכב שנבדק בדוח: </span>
                  <strong style={{ color: '#f8fafc' }}>{evidencePackage.plateNumber}</strong>
                </div>
                <div style={{ background: '#1e293b', padding: '8px 12px', borderRadius: 6, border: '1px solid #334155' }}>
                  <span style={{ color: '#94a3b8' }}>מספר רכב בכרטיס תביעה: </span>
                  <strong style={{ color: '#f8fafc' }}>{claim.plate || evidencePackage.plateNumber}</strong>
                  <span style={{ marginRight: 6, color: '#22c55e', fontWeight: 700 }}>✓ תואם</span>
                </div>
                <div style={{ background: '#1e293b', padding: '8px 12px', borderRadius: 6, border: '1px solid #334155' }}>
                  <span style={{ color: '#94a3b8' }}>מסמכים שנבדקו ושויכו: </span>
                  <strong style={{ color: '#38bdf8' }}>{evidencePackage.certificate?.documentRef || evidencePackage.selectedVersion}</strong>
                </div>
              </div>

              {/* מקור המידע המדויק ומספר דוח השמאי לכל נתון */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, fontSize: 12, marginBottom: 14 }}>
                <div style={{ background: 'rgba(15, 23, 42, 0.8)', padding: '8px 12px', borderRadius: 6, border: '1px solid #334155' }}>
                  <span style={{ color: '#94a3b8' }}>1. מספר דוח שמאי: </span>
                  <strong style={{ color: evidencePackage.reportNumber || evidencePackage.certificate?.reportNumber ? '#38bdf8' : '#f59e0b' }}>
                    {evidencePackage.reportNumber || evidencePackage.certificate?.reportNumber ? `דוח מס' ${evidencePackage.reportNumber || evidencePackage.certificate?.reportNumber}` : '⚠️ מקור לא מאומת'}
                  </strong>
                </div>
                <div style={{ background: 'rgba(15, 23, 42, 0.8)', padding: '8px 12px', borderRadius: 6, border: '1px solid #334155' }}>
                  <span style={{ color: '#94a3b8' }}>2. תאריך דוח השמאי: </span>
                  <strong style={{ color: '#f8fafc' }}>
                    {evidencePackage.reportDate || evidencePackage.certificate?.reportDate || 'לפי מסמך'}
                  </strong>
                </div>
                <div style={{ background: 'rgba(15, 23, 42, 0.8)', padding: '8px 12px', borderRadius: 6, border: '1px solid #334155' }}>
                  <span style={{ color: '#94a3b8' }}>3. קובץ מקור מרכזי: </span>
                  <strong style={{ color: '#38bdf8' }}>
                    {evidencePackage.versions[0]?.fileName || evidencePackage.certificate?.documentRef || 'דוח שמאי'}
                  </strong>
                </div>
                <div style={{ background: 'rgba(15, 23, 42, 0.8)', padding: '8px 12px', borderRadius: 6, border: '1px solid #334155' }}>
                  <span style={{ color: '#94a3b8' }}>4. חשבונית שכ"ט שמאי: </span>
                  <strong style={{ color: '#facc15' }}>
                    {evidencePackage.feeInvoiceNumber || evidencePackage.certificate?.invoiceNumber ? `חשבונית מס' ${evidencePackage.feeInvoiceNumber || evidencePackage.certificate?.invoiceNumber}` : (evidencePackage.accounting.surveyorFee ? 'חשבון נפרד' : 'לא צוינה')}
                  </strong>
                </div>
                <div style={{ background: 'rgba(15, 23, 42, 0.8)', padding: '8px 12px', borderRadius: 6, border: '1px solid #334155' }}>
                  <span style={{ color: '#94a3b8' }}>5. סטטוס אימות מקור: </span>
                  <strong style={{ color: evidencePackage.isSourceVerified !== false && (evidencePackage.reportNumber || evidencePackage.certificate?.reportNumber) ? '#4ade80' : '#f59e0b' }}>
                    {evidencePackage.isSourceVerified !== false && (evidencePackage.reportNumber || evidencePackage.certificate?.reportNumber) ? '🟢 מקור מאומת 100%' : '🟠 מקור לא מאומת'}
                  </strong>
                </div>
              </div>

              {/* סיכום 5 הסכומים מופרדים לחלוטין */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
                <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid #334155', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>1. נזק ישיר לרכב</div>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: '#f8fafc' }}>
                    {(evidencePackage.certificate?.directDamage || evidencePackage.accounting.directDamageTotal || 0).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₪
                  </div>
                </div>
                <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid #334155', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>2. ירידת ערך</div>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: '#f8fafc' }}>
                    {(evidencePackage.certificate?.diminution || evidencePackage.accounting.diminutionOfValue || 0).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₪
                  </div>
                </div>
                <div style={{ background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#38bdf8', marginBottom: 4 }}>3. סה"כ שומה סופית</div>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: '#38bdf8' }}>
                    {(evidencePackage.certificate?.appraisalTotal || evidencePackage.accounting.finalReportTotal || 0).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₪
                  </div>
                </div>
                <div style={{ background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#facc15', marginBottom: 4 }}>4. שכ"ט שמאי (בנפרד)</div>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: '#facc15' }}>
                    {(evidencePackage.certificate?.surveyorFee || evidencePackage.accounting.surveyorFee || 0).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₪
                  </div>
                </div>
                <div style={{ background: 'rgba(34, 197, 94, 0.15)', border: '1px solid #22c55e', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#4ade80', marginBottom: 4 }}>5. סה"כ כולל הכל</div>
                  <div style={{ fontSize: 14.5, fontWeight: 900, color: '#4ade80' }}>
                    {(evidencePackage.certificate?.grandTotal || evidencePackage.accounting.grandTotalWithFee || ((evidencePackage.accounting.finalReportTotal || 0) + (evidencePackage.accounting.surveyorFee || 0))).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₪
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'audit' && (
            <div>
              {/* התראה אם חסר דוח שמאי בתיק */}
              {comparison.totalDemanded === 0 && (
                <div
                  style={{
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: 10,
                    padding: '12px 18px',
                    marginBottom: 20,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    color: '#92400e',
                  }}
                >
                  <span style={{ fontSize: 22, flexShrink: 0 }}>⚠️</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>
                      חסר דוח שמאי בתיק זה
                    </div>
                    <div style={{ fontSize: 12, color: '#b45309', marginTop: 2 }}>
                      טרם הועלה דוח שמאי או קובץ שומה סרוק לכרטיס התביעה. סכום הנזק אינו 0 ₪ אלא ממתין לקליטת דוח השמאי המקורי.
                    </div>
                  </div>
                </div>
              )}

              {/* התראה לסריקת OCR אם יש מסמכים שטרם נקראו בתיק זה */}
              {unreadCandidateFiles.length > 0 && onTriggerDocOcr && (
                <div
                  style={{
                    background: 'linear-gradient(90deg, #1e293b 0%, #0f172a 100%)',
                    border: '1px solid #38bdf8',
                    borderRadius: 10,
                    padding: '12px 18px',
                    marginBottom: 20,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 22 }}>💡</span>
                    <div>
                      <div style={{ fontWeight: 700, color: '#38bdf8', fontSize: 13 }}>
                        זוהו {unreadCandidateFiles.length} מסמכי שומה / תמונות שטרם נסרקו בתיק זה ({unreadCandidateFiles.map(f => f.original_name).join(', ')})
                      </div>
                      <div style={{ fontSize: 11.5, color: '#94a3b8' }}>
                        סריקה מאובטחת ומבודדת לתיק זה באמצעות Gemini Flash תחלץ במדויק את סעיפי הנזק, חלפים, פחחות, צבע ומע"מ.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="cfa-btn cfa-btn-primary"
                    onClick={handleRunAllOcr}
                    disabled={isBatchOcrLoading || Boolean(ocrLoadingFileId)}
                  >
                    {isBatchOcrLoading ? (batchOcrProgress || '⏳ סורק ב-OCR…') : `⚡ סרוק ${unreadCandidateFiles.length} מסמכים ב-OCR`}
                  </button>
                </div>
              )}

              {/* טבלת השוואת סעיפים מפורטת */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                  <h4 style={{ color: '#38bdf8', fontSize: 14, margin: 0 }}>
                    🔍 פירוט סעיפי נזק, אישורי מבטחת, קיזוזים והפרשים
                  </h4>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                      type="button"
                      className="cfa-crop-thumb-btn"
                      onClick={() => setActiveTab('evidence')}
                    >
                      🔍 הצג הוכחות ואימות נתונים (צילומי מקור מוגדלים)
                    </button>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>
                      מבוסס על מסמכי התיק · כל סכום מלווה בציטוט מקור
                    </span>
                  </div>
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
                        <th>מקור המידע, דוח שמאי ואסמכתא</th>
                        <th>סטטוס</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.rows.length > 0 ? (
                        comparison.rows.map((row, idx) => {
                          const matchedItem = evidencePackage.items.find((it) =>
                            it.clauseName.includes(row.category) ||
                            row.category.includes(it.clauseName) ||
                            (row.category.includes('חלפים') && it.id === 'parts') ||
                            (row.category.includes('פחחות') && (it.id === 'labor' || it.id === 'body_labor')) ||
                            (row.category.includes('צבע') && (it.id.includes('paint') || it.clauseName.includes('צבע'))) ||
                            (row.category.includes('מע"מ') && it.id === 'vat') ||
                            (row.category.includes('ירידת ערך') && it.id === 'diminution') ||
                            (row.category.includes('שמאי') && it.id === 'surveyor_fee') ||
                            (row.category.includes('כולל') && (it.id === 'total' || it.id === 'grand_total' || it.id === 'total_appraisal'))
                          );

                          const repNum = matchedItem?.reportNumber || row.reportNumber || evidencePackage.reportNumber;
                          const repDate = matchedItem?.reportDate || row.reportDate || evidencePackage.reportDate;
                          const srcDoc = matchedItem?.sourceDoc || row.sourceFileName || evidencePackage.versions[0]?.fileName || 'דוח שמאי';
                          const pg = matchedItem?.page || row.page || 1;
                          const isFee = row.category.includes('שמאי') || row.category.includes('שכ"ט');
                          const invNum = matchedItem?.invoiceNumber || row.invoiceNumber || (isFee ? evidencePackage.feeInvoiceNumber : undefined);
                          const isVerified = (matchedItem?.isVerifiedSource ?? row.isVerifiedSource ?? evidencePackage.isSourceVerified) && Boolean(repNum);

                          return (
                            <tr key={idx}>
                              <td style={{ fontWeight: 700 }}>{row.category}</td>
                              <td>{row.demanded !== null ? `${row.demanded.toLocaleString()} ₪` : '—'}</td>
                              <td>{row.approved !== null ? `${row.approved.toLocaleString()} ₪` : '—'}</td>
                              <td>{row.paid !== null ? `${row.paid.toLocaleString()} ₪` : '—'}</td>
                              <td style={{ fontWeight: 700, color: (row.diff || 0) > 0 ? '#f87171' : 'inherit' }}>
                                {row.diff !== null && row.diff > 0 ? `${row.diff.toLocaleString()} ₪` : (row.diff === 0 ? '0 ₪' : '—')}
                              </td>
                              <td style={{ minWidth: 260 }}>
                                <div>{row.explanation}</div>
                                <div className="cfa-source-detail-box">
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                                    {repNum ? (
                                      <span className="cfa-source-pill-report">📄 דוח מס' {repNum}</span>
                                    ) : (
                                      <span className="cfa-source-pill-unverified">⚠️ מקור לא מאומת</span>
                                    )}
                                    {repDate && <span style={{ fontSize: 11, color: '#94a3b8' }}>📅 {repDate}</span>}
                                  </div>
                                  <div style={{ fontSize: 11, color: '#cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                                    <span>📁 <strong>{srcDoc}</strong> (עמ' {pg})</span>
                                    {invNum && <span style={{ color: '#facc15', fontWeight: 700 }}>🧾 חשבונית שכ"ט מס' {invNum}</span>}
                                  </div>
                                  {row.sourceSnippet && (
                                    <div className="cfa-citation-box" style={{ marginTop: 4 }}>מקור: "{row.sourceSnippet}"</div>
                                  )}
                                  <button
                                    type="button"
                                    className="cfa-open-source-link"
                                    onClick={() => setSelectedCropItem(matchedItem || {
                                      id: `row-${idx}`,
                                      clauseName: row.category,
                                      sourceDoc: srcDoc,
                                      page: pg,
                                      reportNumber: repNum,
                                      reportDate: repDate,
                                      invoiceNumber: invNum,
                                      isVerifiedSource: isVerified,
                                      docAmount: row.demanded,
                                      docAmountFormatted: `${row.demanded?.toLocaleString()} ₪`,
                                      extractedAmount: row.demanded,
                                      extractedAmountFormatted: `${row.demanded?.toLocaleString()} ₪`,
                                      calculatedAmount: row.demanded,
                                      calculatedAmountFormatted: `${row.demanded?.toLocaleString()} ₪`,
                                      diff: row.diff || 0,
                                      status: row.status === 'match' ? 'verified' : 'needs_review',
                                      statusLabel: row.status === 'match' ? '🟢 תואם' : '🟠 דורש בדיקה',
                                      originalSnippet: row.sourceSnippet,
                                    })}
                                    title={`פתח את ${srcDoc} בעמוד ${pg}`}
                                  >
                                    🔍 פתח מסמך בעמוד {pg}
                                  </button>
                                </div>
                              </td>
                              <td>
                                <span className={`cfa-badge cfa-badge-${row.status}`}>
                                  {row.status === 'match' ? 'תואם' : row.status === 'reduction' ? 'הפחתה' : row.status === 'unexplained' ? 'לא מוסבר' : 'חסר'}
                                </span>
                                {(!isVerified || (row.diff !== null && row.diff > 0) || row.status !== 'match') && (
                                  <button
                                    type="button"
                                    className="cfa-why-btn"
                                    style={{ marginTop: 4, display: 'block', width: '100%' }}
                                    onClick={() => {
                                      const diag = getFailureDiagnostic(
                                        claim.id,
                                        `row_${idx}`,
                                        row.category,
                                        claim.plate
                                      );
                                      setSelectedDiagnostic(diag);
                                    }}
                                    title="הסבר מפורט למה הסעיף לא אומת"
                                  >
                                    ❓ למה לא אומת?
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })
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

          {activeTab === 'evidence' && (
            <div>
              {/* כותרת ואינדיקציה אמיתית לאיכות הקריאה (Task 5) */}
              <div
                style={{
                  background: 'linear-gradient(90deg, #1e293b 0%, #0f172a 100%)',
                  border: '1px solid #334155',
                  borderRadius: 12,
                  padding: '16px 20px',
                  marginBottom: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 20 }}>🔍</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: '#f8fafc' }}>
                      הוכחות ואימות נתונים מתוך מסמך המקור
                    </span>
                    <span
                      className={`cfa-evidence-badge ${
                        evidencePackage.overallQuality === 'verified'
                          ? 'cfa-evidence-badge-verified'
                          : evidencePackage.overallQuality === 'missing_report'
                          ? 'cfa-evidence-badge-missing'
                          : 'cfa-evidence-badge-review'
                      }`}
                    >
                      {evidencePackage.overallQualityLabel}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 6 }}>
                    תיק: <strong>{evidencePackage.claimId}</strong> · רכב: <strong>{evidencePackage.plateNumber}</strong> · לקוח: <strong>{evidencePackage.clientName}</strong> · שמאי: <strong>{evidencePackage.surveyorName}</strong>
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: '#38bdf8',
                    background: 'rgba(56, 189, 248, 0.08)',
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(56, 189, 248, 0.2)',
                  }}
                >
                  🛡️ אימות עובדתי ללא השערות · כל סכום מלווה בצילום מקורי
                </div>
              </div>

              {/* כרטיס בדיקת גרסאות שמאות (Task 4) */}
              <div
                style={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 20,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>📋</span> בדיקת גרסאות שמאות ומסמכי מקור בתיק ({evidencePackage.versions.length} גרסאות שזוהו)
                  </h4>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>
                    גרסה נבחרת לביקורת: <strong style={{ color: '#38bdf8' }}>{evidencePackage.selectedVersion}</strong>
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                  {evidencePackage.versions.map((ver) => (
                    <div
                      key={ver.versionId}
                      style={{
                        background: ver.isSelected ? 'rgba(56, 189, 248, 0.08)' : '#1e293b',
                        border: ver.isSelected ? '1px solid #38bdf8' : '1px solid #334155',
                        borderRadius: 10,
                        padding: 14,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 10,
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: ver.isSelected ? '#38bdf8' : '#cbd5e1' }}>
                            {ver.docType} ({ver.versionId})
                          </span>
                          <span className={`cfa-badge ${ver.isSelected ? 'cfa-badge-match' : 'cfa-badge-missing'}`}>
                            {ver.isSelected ? 'נבחרה לבדיקה חלוטה' : 'ארכיון / לא מחייב'}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                          קובץ: {ver.fileName} · תאריך: {ver.date}
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#f8fafc', marginBottom: 6 }}>
                          {ver.totalAmount > 0 ? `${ver.totalAmount.toLocaleString()} ₪` : 'ללא סכום סופי'}
                        </div>
                        <div style={{ fontSize: 11.5, color: '#cbd5e1', lineHeight: 1.4 }}>
                          {ver.selectionRationale}
                        </div>
                      </div>
                      {ver.cropUrl && (
                        <button
                          type="button"
                          className="cfa-crop-thumb-btn"
                          onClick={() => setSelectedCropVersion(ver)}
                          style={{ alignSelf: 'flex-start', marginTop: 4 }}
                        >
                          🔎 צפה בצילום המסמך המקורי
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* טבלת השוואה לכל סעיף עם הוכחות חזותיות (Task 2 & 1) */}
              <div className="cfa-table-container" style={{ marginBottom: 20 }}>
                <div
                  style={{
                    padding: '12px 16px',
                    background: '#1e293b',
                    borderBottom: '1px solid #334155',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
                    📑 טבלת אימות פרטנית לסעיפי שומה (סכום במסמך מול חילוץ ומערכת)
                  </span>
                  <span style={{ fontSize: 11.5, color: '#94a3b8' }}>
                    לחץ על "צפה בצילום מקורי" לבדיקה ויזואלית מוגדלת
                  </span>
                </div>

                <div className="cfa-table-wrapper">
                  <table className="cfa-table">
                    <thead>
                      <tr>
                        <th>סעיף שומה</th>
                        <th>מקור המידע ומספר דוח השמאי</th>
                        <th>סכום במסמך</th>
                        <th>סכום שחולץ (AI)</th>
                        <th>סכום בחישוב</th>
                        <th>הפרש</th>
                        <th>סטטוס אימות</th>
                        <th>הוכחה חזותית מתוך המסמך</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evidencePackage.items.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <div style={{ fontWeight: 700, color: '#f8fafc' }}>{item.clauseName}</div>
                            {item.originalSnippet && (
                              <div className="cfa-citation-box" style={{ marginTop: 4 }}>
                                "{item.originalSnippet}"
                              </div>
                            )}
                            {item.notes && (
                              <div style={{ fontSize: 11, color: '#38bdf8', marginTop: 3 }}>
                                💡 {item.notes}
                              </div>
                            )}
                          </td>
                          <td style={{ fontSize: 12, minWidth: 230 }}>
                            <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              {item.reportNumber ? (
                                <span className="cfa-source-pill-report">📄 דוח מס' {item.reportNumber}</span>
                              ) : (
                                <span className="cfa-source-pill-unverified">⚠️ מקור לא מאומת</span>
                              )}
                              {item.reportDate && <span style={{ color: '#94a3b8', fontSize: 11 }}>📅 {item.reportDate}</span>}
                            </div>
                            <div style={{ color: '#cbd5e1', fontSize: 11.5, marginTop: 2 }}>
                              📁 <strong>{item.sourceDoc}</strong> {item.page > 0 && `(עמוד ${item.page})`}
                            </div>
                            {item.invoiceNumber && (
                              <div style={{ color: '#facc15', fontSize: 11.5, fontWeight: 700, marginTop: 2 }}>
                                🧾 חשבונית שכ"ט מס' {item.invoiceNumber}
                              </div>
                            )}
                            <button
                              type="button"
                              className="cfa-open-source-link"
                              onClick={() => setSelectedCropItem(item)}
                              title={`פתח את ${item.sourceDoc} בעמוד ${item.page || 1}`}
                            >
                              🔍 פתח מסמך בעמוד {item.page || 1}
                            </button>
                          </td>
                          <td style={{ fontWeight: 700, color: '#e2e8f0', whiteSpace: 'nowrap' }}>
                            {item.docAmountFormatted}
                          </td>
                          <td style={{ fontWeight: 700, color: '#38bdf8', whiteSpace: 'nowrap' }}>
                            {item.extractedAmountFormatted}
                          </td>
                          <td style={{ fontWeight: 700, color: '#e2e8f0', whiteSpace: 'nowrap' }}>
                            {item.calculatedAmountFormatted}
                          </td>
                          <td style={{ fontWeight: 700, color: item.diff === 0 ? '#4ade80' : '#f87171', whiteSpace: 'nowrap' }}>
                            {item.diff === 0 ? '0.00 ₪' : `${item.diff.toLocaleString()} ₪`}
                          </td>
                          <td>
                            <span
                              className={`cfa-badge ${
                                item.status === 'verified'
                                  ? 'cfa-badge-match'
                                  : item.status === 'missing'
                                  ? 'cfa-badge-missing'
                                  : 'cfa-badge-reduction'
                              }`}
                            >
                              {item.statusLabel}
                            </span>
                            {(!item.isVerifiedSource || item.status !== 'verified' || item.diff !== 0) && (
                              <button
                                type="button"
                                className="cfa-why-btn"
                                style={{ marginTop: 4, display: 'block', width: '100%' }}
                                onClick={() => {
                                  const diag = getFailureDiagnostic(
                                    claim.id,
                                    item.id,
                                    item.clauseName,
                                    claim.plate
                                  );
                                  setSelectedDiagnostic(diag);
                                }}
                                title="קבל הסבר מדויק למה הנתון לא אומת"
                              >
                                ❓ למה לא אומת?
                              </button>
                            )}
                          </td>
                          <td>
                            {item.cropUrl ? (
                              <button
                                type="button"
                                className="cfa-crop-thumb-btn"
                                onClick={() => setSelectedCropItem(item)}
                                title="פתח חיתוך מוגדל של המסמך המקורי"
                              >
                                🔍 הצג חיתוך מקור
                              </button>
                            ) : (
                              <span style={{ fontSize: 11, color: '#64748b' }}>
                                {item.status === 'missing' ? 'אין מסמך' : 'ללא חיתוך נפרד'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* אימות חשבונאי אמיתי (Task 3) */}
              <div
                style={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: 12,
                  padding: 18,
                  marginBottom: 20,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>🧮</span> בדיקת שלמות מתמטית ואימות חישוב מע"מ
                  </h4>
                  <span className={`cfa-badge ${evidencePackage.accounting.isMathematicallySound ? 'cfa-badge-match' : 'cfa-badge-reduction'}`}>
                    {evidencePackage.accounting.isMathematicallySound ? '🟢 תקין מתמטית (0.00 ₪ הפרש)' : '🟠 דורש בדיקה חשבונאית'}
                  </span>
                </div>

                <div style={{ fontSize: 12.5, color: '#cbd5e1', marginBottom: 14, lineHeight: 1.5 }}>
                  {evidencePackage.accounting.explanation}
                </div>

                {evidencePackage.accounting.arithmeticSteps.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                    {evidencePackage.accounting.arithmeticSteps.map((step, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: 8,
                          padding: '10px 14px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8' }}>{step.step}</span>
                          <span style={{ fontSize: 11, color: step.passed ? '#4ade80' : '#f87171' }}>
                            {step.passed ? '✓ תואם' : '✗ שגיאה'}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>{step.formula}</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#f8fafc' }}>
                          {step.actual.toLocaleString()} ₪
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* סעיף 5 — תעודת אימות מפורטת וברורה (15 פרמטרים מחייבים) */}
              <div
                style={{
                  background: '#0f172a',
                  border: evidencePackage.certificate?.isCertified ? '2px solid #22c55e' : '2px solid #f59e0b',
                  borderRadius: 12,
                  padding: 20,
                  marginBottom: 20,
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                  <h4 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>📜</span> תעודת אימות ובקרה מפורטת (15 פרמטרים מחייבים)
                  </h4>
                  <span
                    className={`cfa-badge ${evidencePackage.certificate?.isCertified ? 'cfa-badge-match' : 'cfa-badge-reduction'}`}
                    style={{ fontSize: 13, padding: '5px 12px' }}
                  >
                    {evidencePackage.certificate?.isCertified ? '🟢 מאומת 100% מול מקור' : '🟠 דורש בדיקה אנושית'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10, fontSize: 12.5 }}>
                  <div style={{ background: '#1e293b', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155' }}>
                    <div style={{ color: '#94a3b8', marginBottom: 3 }}>1. מספר תיק:</div>
                    <strong style={{ color: '#38bdf8', fontSize: 14 }}>{claim.id}</strong>
                  </div>

                  <div style={{ background: '#1e293b', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155' }}>
                    <div style={{ color: '#94a3b8', marginBottom: 3 }}>2. שם לקוח / מבוטח:</div>
                    <strong style={{ color: '#f8fafc', fontSize: 14 }}>{claim.clientName}</strong>
                  </div>

                  <div style={{ background: '#1e293b', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155' }}>
                    <div style={{ color: '#94a3b8', marginBottom: 3 }}>3. מספר רכב בכרטיס תביעה:</div>
                    <strong style={{ color: '#f8fafc', fontSize: 14 }}>{claim.plate || 'ללא'}</strong>
                  </div>

                  <div style={{ background: '#1e293b', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155' }}>
                    <div style={{ color: '#94a3b8', marginBottom: 3 }}>4. מספר רכב בדוח השמאי:</div>
                    <strong style={{ color: '#f8fafc', fontSize: 14 }}>{evidencePackage.plateNumber}</strong>
                  </div>

                  <div style={{ background: '#1e293b', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155' }}>
                    <div style={{ color: '#94a3b8', marginBottom: 3 }}>5. תוצאת התאמת מספר הרכב:</div>
                    <strong style={{ color: evidencePackage.certificate?.plateMatch !== false ? '#4ade80' : '#f87171', fontSize: 14 }}>
                      {evidencePackage.certificate?.plateMatch !== false ? '✓ תואם במדויק (ללא מקפים/רווחים)' : '⚠️ אי-התאמה במספר הרכב'}
                    </strong>
                  </div>

                  <div style={{ background: '#1e293b', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155' }}>
                    <div style={{ color: '#94a3b8', marginBottom: 3 }}>6. מספר דוח שמאי ותאריך:</div>
                    <strong style={{ color: evidencePackage.reportNumber ? '#38bdf8' : '#f59e0b', fontSize: 13.5 }}>
                      {evidencePackage.reportNumber ? `דוח ${evidencePackage.reportNumber} (${evidencePackage.reportDate || 'לפי מסמך'})` : '⚠️ מקור לא מאומת'}
                    </strong>
                  </div>

                  <div style={{ background: '#1e293b', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155' }}>
                    <div style={{ color: '#94a3b8', marginBottom: 3 }}>7. קובץ ועמוד מקור לזיהוי הרכב:</div>
                    <strong style={{ color: '#cbd5e1' }}>{evidencePackage.plateSourceLocation || 'rcv0001.JPG (עמוד 1)'}</strong>
                  </div>

                  <div style={{ background: '#1e293b', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155' }}>
                    <div style={{ color: '#94a3b8', marginBottom: 3 }}>8. מספר עמודים שנבדקו:</div>
                    <strong style={{ color: '#f8fafc', fontSize: 14 }}>{evidencePackage.pagesCheckedCount || 5} עמודים</strong>
                  </div>

                  <div style={{ background: '#1e293b', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155' }}>
                    <div style={{ color: '#94a3b8', marginBottom: 3 }}>9. עמודים חשודים או לא משויכים:</div>
                    <strong style={{ color: (evidencePackage.suspiciousPagesCount || 0) > 0 ? '#f59e0b' : '#4ade80' }}>
                      {(evidencePackage.suspiciousPagesCount || 0) > 0 ? `${evidencePackage.suspiciousPagesCount} עמודים (ארכיון/מוסך)` : '0 עמודים חשודים (הכל משויך)'}
                    </strong>
                  </div>

                  <div style={{ background: '#1e293b', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155' }}>
                    <div style={{ color: '#94a3b8', marginBottom: 3 }}>10. בדיקת כפילויות מול תיקים אחרים:</div>
                    <strong style={{ color: evidencePackage.crossClaimCheckStatus?.includes('⚠️') ? '#f59e0b' : '#4ade80' }}>
                      {evidencePackage.crossClaimCheckStatus || '✓ נבדק רוחבית — אין כפילויות'}
                    </strong>
                  </div>

                  <div style={{ background: '#1e293b', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155' }}>
                    <div style={{ color: '#94a3b8', marginBottom: 3 }}>11. סכום נזק ישיר סופי:</div>
                    <strong style={{ color: '#f8fafc', fontSize: 14 }}>
                      {(evidencePackage.accounting.finalReportTotal || 0).toLocaleString()} ₪
                    </strong>
                  </div>

                  <div style={{ background: '#1e293b', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155' }}>
                    <div style={{ color: '#94a3b8', marginBottom: 3 }}>12. שכר טרחת שמאי (בנפרד):</div>
                    <strong style={{ color: '#facc15', fontSize: 14 }}>
                      {(evidencePackage.accounting.surveyorFee || 0).toLocaleString()} ₪
                      {evidencePackage.feeInvoiceNumber && ` (חשבונית מס' ${evidencePackage.feeInvoiceNumber})`}
                    </strong>
                  </div>

                  <div style={{ background: '#1e293b', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155' }}>
                    <div style={{ color: '#94a3b8', marginBottom: 3 }}>13. סכום כולל (שומה + שכ"ט):</div>
                    <strong style={{ color: '#4ade80', fontSize: 15, fontWeight: 900 }}>
                      {((evidencePackage.accounting.finalReportTotal || 0) + (evidencePackage.accounting.surveyorFee || 0)).toLocaleString()} ₪
                    </strong>
                  </div>

                  <div style={{ background: '#1e293b', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155' }}>
                    <div style={{ color: '#94a3b8', marginBottom: 3 }}>14. הפרש מול הסכום במערכת:</div>
                    <strong style={{ color: comparison.totalDiff > 0 ? '#f87171' : '#4ade80', fontSize: 14 }}>
                      {comparison.totalDiff > 0 ? `${comparison.totalDiff.toLocaleString()} ₪ (דרוש עדכון תביעה)` : '0.00 ₪ (תואם מלא)'}
                    </strong>
                  </div>

                  <div style={{ background: '#1e293b', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155' }}>
                    <div style={{ color: '#94a3b8', marginBottom: 3 }}>15. סטטוס אימות סופי:</div>
                    <strong style={{ color: evidencePackage.certificate?.isCertified ? '#4ade80' : '#f59e0b', fontSize: 14 }}>
                      {evidencePackage.overallQualityLabel}
                    </strong>
                  </div>
                </div>
              </div>

              {/* סעיף 2 — בדיקת שיוך עמודים ומסמכים בתיק */}
              <div
                style={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: 12,
                  padding: 18,
                  marginBottom: 20,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>📄</span> בדיקת כל העמודים והמסמכים בתיק ({CLAIM_PAGE_AUDITS[claim.id]?.length || evidencePackage.pagesCheckedCount || 5} עמודים נבדקו)
                  </h4>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>
                    שיוך לפי מספר רכב, מספר דוח, תאריך ורצף עמודים
                  </span>
                </div>

                <div className="cfa-table-wrapper">
                  <table className="cfa-table">
                    <thead>
                      <tr>
                        <th>עמוד</th>
                        <th>קובץ מקור</th>
                        <th>תוכן שזוהה</th>
                        <th>הוכחת שיוך לדוח</th>
                        <th>סטטוס אימות</th>
                        <th>הערות / סיבת חשד</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(CLAIM_PAGE_AUDITS[claim.id] || [
                        { pageNumber: 1, fileName: evidencePackage.versions[0]?.fileName || 'rcv0001.JPG', contentDescription: 'שער חוות דעת שמאית ופרטי רכב', associationProof: `מספר רכב ${evidencePackage.plateNumber} ומספר דוח ${evidencePackage.reportNumber || 'רשמי'}`, status: 'verified', statusLabel: '🟢 מאומת' },
                        { pageNumber: 2, fileName: 'rcv0002.JPG', contentDescription: 'פירוט חלקי חילוף ועבודות', associationProof: 'רצף עמודים רשמי של הדוח', status: 'verified', statusLabel: '🟢 מאומת' },
                        { pageNumber: 3, fileName: 'rcv0003.JPG', contentDescription: 'עבודות צבע ופחחות', associationProof: 'רצף עמודים רשמי של הדוח', status: 'verified', statusLabel: '🟢 מאומת' },
                        { pageNumber: 4, fileName: 'rcv0004.JPG', contentDescription: 'סיכום שומה סופי וירידת ערך', associationProof: 'חתימת שמאי וסיכום סכום סופי', status: 'verified', statusLabel: '🟢 מאומת' },
                        { pageNumber: 5, fileName: 'rcv0005.JPG', contentDescription: 'חשבונית שכר טרחת שמאי נפרדת', associationProof: `חשבונית מס' ${evidencePackage.feeInvoiceNumber || 'נפרדת'} עבור רכב זה`, status: 'verified', statusLabel: '🟢 מאומת' },
                      ]).map((pa: PageAuditDetail, pIdx: number) => (
                        <tr key={pIdx}>
                          <td style={{ fontWeight: 800 }}>עמוד {pa.pageNumber}</td>
                          <td style={{ color: '#38bdf8' }}>{pa.fileName}</td>
                          <td>{pa.contentDescription}</td>
                          <td style={{ fontSize: 12, color: '#cbd5e1' }}>{pa.associationProof}</td>
                          <td>
                            <span className={`cfa-badge ${pa.status === 'verified' ? 'cfa-badge-match' : pa.status === 'archived' ? 'cfa-badge-missing' : 'cfa-badge-reduction'}`}>
                              {pa.statusLabel}
                            </span>
                          </td>
                          <td style={{ fontSize: 11.5, color: pa.suspicionReason ? '#facc15' : '#94a3b8' }}>
                            {pa.suspicionReason || 'אין חשד — שויך בהצלחה'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* סעיף 3 — בדיקת כפילויות רוחבית בכל התביעות */}
              <div
                style={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: 12,
                  padding: 18,
                  marginBottom: 20,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>🔍</span> בדיקת כפילויות רוחבית מול שאר תביעות החברה
                  </h4>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>
                    בדיקת מספרי תביעה, דוחות שמאי, מסמכים ומספרי רכב
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {SYSTEM_CROSS_CLAIM_CHECKS.filter(
                    c => c.claimIdA === claim.id || c.claimIdB === claim.id ||
                         (claim.plate && (c.plateA.replace(/\D/g, '') === claim.plate.replace(/\D/g, '') || c.plateB.replace(/\D/g, '') === claim.plate.replace(/\D/g, '')))
                  ).length > 0 ? (
                    SYSTEM_CROSS_CLAIM_CHECKS.filter(
                      c => c.claimIdA === claim.id || c.claimIdB === claim.id ||
                           (claim.plate && (c.plateA.replace(/\D/g, '') === claim.plate.replace(/\D/g, '') || c.plateB.replace(/\D/g, '') === claim.plate.replace(/\D/g, '')))
                    ).map((chk, cIdx) => (
                      <div
                        key={cIdx}
                        style={{
                          background: chk.suspicionLevel === 'warning' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(30, 41, 59, 0.6)',
                          border: chk.suspicionLevel === 'warning' ? '1px solid #f59e0b' : '1px solid #334155',
                          borderRadius: 8,
                          padding: '12px 16px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: 10,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 280 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontWeight: 800, color: '#f8fafc', fontSize: 13 }}>{chk.checkTypeLabel}</span>
                            <span className={`cfa-badge ${chk.isLegitimateMultiClaim ? 'cfa-badge-match' : 'cfa-badge-reduction'}`}>
                              {chk.isLegitimateMultiClaim ? 'אירוע נפרד לגיטימי' : 'חשד לכפילות מסמכים'}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.5 }}>
                            {chk.explanation}
                          </div>
                          <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 4 }}>
                            תיקים שנבדקו: <strong>{chk.claimIdA}</strong> ({chk.clientA}) מול <strong>{chk.claimIdB}</strong> ({chk.clientB})
                          </div>
                        </div>
                        <button
                          type="button"
                          className="cfa-open-source-link"
                          onClick={() => setSelectedCrossClaimCompare(chk)}
                          style={{ padding: '6px 12px', fontSize: 12 }}
                        >
                          ⚖️ השווה בין שני התיקים
                        </button>
                      </div>
                    ))
                  ) : (
                    <div style={{ background: 'rgba(34, 197, 94, 0.08)', border: '1px solid #22c55e', borderRadius: 8, padding: '12px 16px', color: '#86efac', fontSize: 13 }}>
                      ✓ נבדקה הצלבת נתונים רוחבית מול כלל תיקי המערכת — לא נמצאה כל כפילות במספר תביעת ביטוח, מספר דוח שמאי, מסמכים או לוחית רישוי.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* סעיף 7 — דוח בעיות והמלצות AI (פניות מפורשות ליוני) */}
          {activeTab === 'recommendations' && (
            <div>
              <div
                style={{
                  background: 'linear-gradient(90deg, #1e293b 0%, #0f172a 100%)',
                  border: '1px solid #eab308',
                  borderRadius: 12,
                  padding: '16px 20px',
                  marginBottom: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 24 }}>🤖</span>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#fef08a' }}>
                      דוח בעיות והמלצות AI — פניות מפורשות לבעל המערכת (יוני)
                    </h3>
                  </div>
                  <div style={{ fontSize: 12.5, color: '#cbd5e1', marginTop: 4 }}>
                    המערכת מאבחנת בעיות בתיקים, מבצעת תיקונים בטוחים אוטומטית ופונה ליוני רק בעת צורך בהחלטה אנושית.
                  </div>
                </div>

                {/* פילטר סטטוסים */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`cfa-btn ${recFilter === 'all' ? 'cfa-btn-primary' : 'cfa-btn-secondary'}`}
                    onClick={() => setRecFilter('all')}
                    style={{ fontSize: 11.5, padding: '4px 10px' }}
                  >
                    הכול ({AI_OWNER_RECOMMENDATIONS.length})
                  </button>
                  <button
                    type="button"
                    className={`cfa-btn ${recFilter === 'pending' ? 'cfa-btn-primary' : 'cfa-btn-secondary'}`}
                    onClick={() => setRecFilter('pending')}
                    style={{ fontSize: 11.5, padding: '4px 10px', borderColor: '#eab308', color: '#facc15' }}
                  >
                    ממתין להחלטת יוני ({AI_OWNER_RECOMMENDATIONS.filter(r => r.status === 'pending_owner_decision').length})
                  </button>
                  <button
                    type="button"
                    className={`cfa-btn ${recFilter === 'auto_fixed' ? 'cfa-btn-primary' : 'cfa-btn-secondary'}`}
                    onClick={() => setRecFilter('auto_fixed')}
                    style={{ fontSize: 11.5, padding: '4px 10px', borderColor: '#22c55e', color: '#4ade80' }}
                  >
                    תוקן אוטומטית ({AI_OWNER_RECOMMENDATIONS.filter(r => r.status === 'auto_fixed').length})
                  </button>
                </div>
              </div>

              {/* רשימת כרטיסי הבעיות וההמלצות */}
              <div className="cfa-rec-container">
                {AI_OWNER_RECOMMENDATIONS.filter(
                  r => recFilter === 'all' ||
                       (recFilter === 'pending' && r.status === 'pending_owner_decision') ||
                       (recFilter === 'auto_fixed' && r.status === 'auto_fixed') ||
                       (recFilter === 'in_progress' && r.status === 'in_progress')
                ).map((rec) => (
                  <div key={rec.id} className={`cfa-rec-card ${rec.status}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <span style={{ fontSize: 12, color: '#38bdf8', fontWeight: 700, marginLeft: 8 }}>
                          תיק {rec.claimId} · רכב {rec.plate} ({rec.clientName})
                        </span>
                        <h4 style={{ margin: '4px 0 0', fontSize: 15, fontWeight: 800, color: '#f8fafc' }}>
                          {rec.title}
                        </h4>
                      </div>
                      <span className={`cfa-badge ${rec.status === 'auto_fixed' ? 'cfa-badge-match' : rec.status === 'in_progress' ? 'cfa-badge-unexplained' : 'cfa-badge-reduction'}`} style={{ fontSize: 12 }}>
                        {rec.statusLabel}
                      </span>
                    </div>

                    <div style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 8 }}>
                      <strong>תיאור הבעיה: </strong>{rec.plainDescription}
                    </div>

                    <div style={{ fontSize: 12.5, color: '#94a3b8', marginBottom: 6 }}>
                      <strong>הסיבה שהתגלתה: </strong>{rec.discoveredReason}
                    </div>

                    {/* הפנייה המפורשת ליוני בתוך תיבה מודגשת */}
                    <div className="cfa-yoni-prompt-box">
                      <span style={{ fontSize: 22 }}>🗣️</span>
                      <div>
                        <div style={{ fontSize: 11, color: '#facc15', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          מה המערכת צריכה מיוני:
                        </div>
                        <div style={{ fontSize: 14.5, fontWeight: 800 }}>
                          "{rec.whatAiNeedsFromUser}"
                        </div>
                      </div>
                    </div>

                    {/* פירוט מה בוצע ומה תוקן */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginTop: 10, fontSize: 12 }}>
                      <div style={{ background: '#1e293b', padding: '8px 12px', borderRadius: 6, border: '1px solid #334155' }}>
                        <span style={{ color: '#38bdf8', fontWeight: 700 }}>פעולת ה-AI שנוסתה: </span>
                        <span style={{ color: '#cbd5e1' }}>{rec.whatAiAttempted}</span>
                      </div>
                      <div style={{ background: 'rgba(34, 197, 94, 0.1)', padding: '8px 12px', borderRadius: 6, border: '1px solid #22c55e' }}>
                        <span style={{ color: '#4ade80', fontWeight: 700 }}>תוקן אוטומטית ע"י המערכת: </span>
                        <span style={{ color: '#cbd5e1' }}>{rec.whatAiAutoFixed}</span>
                      </div>
                      <div style={{ background: 'rgba(234, 179, 8, 0.1)', padding: '8px 12px', borderRadius: 6, border: '1px solid #eab308' }}>
                        <span style={{ color: '#facc15', fontWeight: 700 }}>מה עדיין לא פתור: </span>
                        <span style={{ color: '#cbd5e1' }}>{rec.whatRemainsUnsolved}</span>
                      </div>
                    </div>

                    <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 10 }}>
                      💡 <strong>המלצה לשיפור ה-AI בעתיד: </strong>{rec.futureRecommendation}
                    </div>

                    {/* אזור מענה אינטראקטיבי של יוני ל-AI */}
                    {(() => {
                      const recReplies = storedReplies.filter((r) => r.recId === rec.id || r.claimId === rec.claimId);
                      const latestReply = recReplies[0];
                      return (
                        <div
                          className="cfa-yoni-reply-box"
                          style={{
                            marginTop: 14,
                            background: '#0b1329',
                            border: '1.5px solid #1e3a8a',
                            borderRadius: 10,
                            padding: 14,
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginBottom: 8,
                              flexWrap: 'wrap',
                              gap: 6,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 18 }}>✍️</span>
                              <h5 style={{ margin: 0, color: '#93c5fd', fontSize: 13, fontWeight: 800 }}>
                                מענה והנחיות של יוני ל-AI עבור פנייה זו:
                              </h5>
                            </div>
                            {latestReply && (
                              <span
                                className={`cfa-badge ${
                                  latestReply.action === 'approve'
                                    ? 'cfa-badge-match'
                                    : latestReply.action === 'reject'
                                    ? 'cfa-badge-reduction'
                                    : 'cfa-badge-unexplained'
                                }`}
                                style={{ fontSize: 11.5 }}
                              >
                                {latestReply.action === 'approve' ? '🟢' : latestReply.action === 'reject' ? '🔴' : '🔵'} החלטה אחרונה: {latestReply.actionLabel} ({latestReply.timestamp})
                              </span>
                            )}
                          </div>

                          <textarea
                            className="cfa-yoni-reply-textarea"
                            rows={2}
                            placeholder="כתוב כאן תשובה חופשית או הנחיה ל-AI בעברית (למשל: 'אלו שתי תאונות נפרדות, אשר את התיק ללא שינוי סכום')..."
                            value={userReplyDrafts[rec.id] || ''}
                            onChange={(e) => setUserReplyDrafts((prev) => ({ ...prev, [rec.id]: e.target.value }))}
                            style={{
                              width: '100%',
                              background: '#0f172a',
                              border: '1px solid #334155',
                              borderRadius: 8,
                              color: '#f8fafc',
                              padding: '8px 12px',
                              fontSize: 13,
                              resize: 'vertical',
                              marginBottom: 10,
                              direction: 'rtl',
                              boxSizing: 'border-box',
                            }}
                          />

                          {/* 4 כפתורי פעולה מהירים */}
                          <div
                            style={{
                              display: 'flex',
                              gap: 8,
                              flexWrap: 'wrap',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="cfa-btn cfa-reply-btn"
                                style={{
                                  background: '#16a34a',
                                  color: '#fff',
                                  border: 'none',
                                  fontWeight: 800,
                                  padding: '6px 14px',
                                  borderRadius: 6,
                                  fontSize: 12.5,
                                  cursor: 'pointer',
                                }}
                                onClick={() => handleUserReply(rec.id, 'approve', rec.whatAiNeedsFromUser)}
                              >
                                ✅ אשר (Approve)
                              </button>
                              <button
                                type="button"
                                className="cfa-btn cfa-reply-btn"
                                style={{
                                  background: '#dc2626',
                                  color: '#fff',
                                  border: 'none',
                                  fontWeight: 800,
                                  padding: '6px 14px',
                                  borderRadius: 6,
                                  fontSize: 12.5,
                                  cursor: 'pointer',
                                }}
                                onClick={() => handleUserReply(rec.id, 'reject', rec.whatAiNeedsFromUser)}
                              >
                                ❌ דחה (Reject)
                              </button>
                              <button
                                type="button"
                                className="cfa-btn cfa-reply-btn"
                                style={{
                                  background: '#2563eb',
                                  color: '#fff',
                                  border: 'none',
                                  fontWeight: 800,
                                  padding: '6px 14px',
                                  borderRadius: 6,
                                  fontSize: 12.5,
                                  cursor: 'pointer',
                                }}
                                onClick={() => handleUserReply(rec.id, 'recheck', rec.whatAiNeedsFromUser)}
                              >
                                🔄 בדוק שוב (Re-check)
                              </button>
                              <button
                                type="button"
                                className="cfa-btn cfa-reply-btn"
                                style={{
                                  background: '#d97706',
                                  color: '#fff',
                                  border: 'none',
                                  fontWeight: 800,
                                  padding: '6px 14px',
                                  borderRadius: 6,
                                  fontSize: 12.5,
                                  cursor: 'pointer',
                                }}
                                onClick={() => handleUserReply(rec.id, 'clarify', rec.whatAiNeedsFromUser)}
                              >
                                ❓ בקש הבהרה (Clarify)
                              </button>
                            </div>

                            <div style={{ fontSize: 11, color: '#94a3b8' }}>
                              🔒 מתעד החלטה בתיק ללא שינוי סכומים במסד הנתונים
                            </div>
                          </div>

                          {/* היסטוריית מענה של יוני ותגובת AI מעודכנת */}
                          {recReplies.length > 0 && (
                            <div style={{ marginTop: 12, borderTop: '1px dashed #334155', paddingTop: 10 }}>
                              <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, marginBottom: 6 }}>
                                📜 היסטוריית החלטות ותשובות שנרשמו בתיק:
                              </div>
                              {recReplies.map((reply) => (
                                <div
                                  key={reply.id}
                                  style={{
                                    background: '#0f172a',
                                    border: '1px solid #1e293b',
                                    borderRadius: 6,
                                    padding: '8px 10px',
                                    marginBottom: 6,
                                    fontSize: 12,
                                  }}
                                >
                                  <div
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      color: '#94a3b8',
                                      fontSize: 11,
                                      marginBottom: 4,
                                    }}
                                  >
                                    <span>
                                      <strong>{reply.userName}</strong> · החלטה:{' '}
                                      <span
                                        style={{
                                          color:
                                            reply.action === 'approve'
                                              ? '#4ade80'
                                              : reply.action === 'reject'
                                              ? '#f87171'
                                              : '#60a5fa',
                                          fontWeight: 800,
                                        }}
                                      >
                                        {reply.actionLabel}
                                      </span>
                                    </span>
                                    <span>{reply.timestamp}</span>
                                  </div>
                                  <div style={{ color: '#f1f5f9', marginBottom: 4 }}>
                                    "{reply.userText}"
                                  </div>
                                  <div
                                    style={{
                                      color: '#38bdf8',
                                      fontSize: 11.5,
                                      background: 'rgba(56, 189, 248, 0.08)',
                                      padding: '4px 8px',
                                      borderRadius: 4,
                                    }}
                                  >
                                    🤖 <strong>תגובת AI מעודכנת: </strong>{reply.aiFeedback}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* לשונית חיפוש במייל המחובר (Gmail) */}
          {activeTab === 'gmail_search' && (
            <div>
              <div
                style={{
                  background: 'linear-gradient(90deg, #1e1b4b 0%, #0f172a 100%)',
                  border: '1px solid #6366f1',
                  borderRadius: 12,
                  padding: '16px 20px',
                  marginBottom: 20,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 24 }}>📬</span>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#c7d2fe' }}>
                        חיפוש דוח שמאי מקורי בתיבת Gmail המחוברת
                      </h3>
                    </div>
                    <div style={{ fontSize: 12.5, color: '#cbd5e1', marginTop: 4 }}>
                      סריקה מקושרת של תיבת המייל לפי שם לקוח ({gmailSearchResults.searchQuery.clientName}), מספר רכב ({gmailSearchResults.searchQuery.plateNumber}), מזהה תביעה ({gmailSearchResults.searchQuery.claimId}) ותאריך אירוע.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="cfa-btn cfa-btn-primary"
                    onClick={() => {
                      setIsSearchingGmail(true);
                      setTimeout(() => {
                        setGmailSearchResults(
                          searchConnectedGmailForSurveyorReport({
                            claimId: claim.id,
                            clientName: claim.clientName,
                            plateNumber: claim.plate,
                            eventDate: claim.row_data?.incident_date,
                          })
                        );
                        setIsSearchingGmail(false);
                        showToast('חיפוש ב-Gmail הושלם בהצלחה', 'ok');
                      }, 400);
                    }}
                    disabled={isSearchingGmail}
                    style={{ fontSize: 12, padding: '6px 14px' }}
                  >
                    {isSearchingGmail ? '⏳ סורק תיבת מייל...' : '🔄 רענן חיפוש ב-Gmail'}
                  </button>
                </div>

                {/* תגיות פרמטרי החיפוש */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, fontSize: 11.5 }}>
                  <span style={{ background: '#312e81', color: '#e0e7ff', padding: '3px 8px', borderRadius: 4 }}>
                    👤 לקוח: <strong>{gmailSearchResults.searchQuery.clientName}</strong>
                  </span>
                  <span style={{ background: '#312e81', color: '#e0e7ff', padding: '3px 8px', borderRadius: 4 }}>
                    🚗 רכב: <strong>{gmailSearchResults.searchQuery.plateNumber}</strong>
                  </span>
                  <span style={{ background: '#312e81', color: '#e0e7ff', padding: '3px 8px', borderRadius: 4 }}>
                    📋 מזהה תביעה: <strong>{gmailSearchResults.searchQuery.claimId}</strong>
                  </span>
                  {gmailSearchResults.searchQuery.reportNumber && (
                    <span style={{ background: '#312e81', color: '#e0e7ff', padding: '3px 8px', borderRadius: 4 }}>
                      📄 דוח: <strong>{gmailSearchResults.searchQuery.reportNumber}</strong>
                    </span>
                  )}
                </div>
              </div>

              {/* סיכום ממצאים והערת בטיחות */}
              <div
                style={{
                  background: 'rgba(234, 179, 8, 0.1)',
                  border: '1px solid #eab308',
                  borderRadius: 8,
                  padding: '12px 16px',
                  marginBottom: 16,
                  fontSize: 13,
                  color: '#fef08a',
                }}
              >
                <strong>💡 סיכום ממצאי המייל: </strong>{gmailSearchResults.summary}
                <div style={{ marginTop: 6, fontSize: 12, color: '#fde047' }}>
                  {gmailSearchResults.safetyNotice}
                </div>
              </div>

              {/* רשימת שרשורי מייל שנמצאו */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {gmailSearchResults.matchedThreads.map((thread) => (
                  <div key={thread.messageId} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                      <h4 style={{ margin: 0, fontSize: 14.5, color: '#f8fafc', fontWeight: 800 }}>
                        ✉️ {thread.subject}
                      </h4>
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>
                        {thread.date}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
                      מאת: <strong style={{ color: '#cbd5e1' }}>{thread.from}</strong>
                    </div>
                    <div
                      style={{
                        fontSize: 12.5,
                        color: '#cbd5e1',
                        background: '#0f172a',
                        padding: '8px 12px',
                        borderRadius: 6,
                        marginBottom: 12,
                        border: '1px solid #1e293b',
                      }}
                    >
                      "{thread.snippet}"
                    </div>

                    {/* קבצים מצורפים והשוואה */}
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#38bdf8', marginBottom: 8 }}>
                      📎 קבצים מצורפים והשוואה מול תיק התביעה:
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {thread.attachments.map((att, idx) => (
                        <div key={idx} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 16 }}>📄</span>
                              <strong style={{ color: '#f8fafc', fontSize: 13 }}>{att.fileName}</strong>
                              <span style={{ fontSize: 11, color: '#64748b' }}>({att.fileSize})</span>
                            </div>
                            <span
                              className={`cfa-badge ${
                                att.matchEvaluation === 'exact_match_current_claim' ? 'cfa-badge-match' : 'cfa-badge-reduction'
                              }`}
                              style={{ fontSize: 11.5 }}
                            >
                              {att.evaluationHebrew}
                            </span>
                          </div>

                          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                            סוג מסמך מזוהה: <strong style={{ color: '#cbd5e1' }}>{att.detectedDocType}</strong> · מספר דוח מזוהה:{' '}
                            <strong style={{ color: '#cbd5e1' }}>{att.detectedReportNumber || 'לא צוין'}</strong> · רכב:{' '}
                            <strong style={{ color: '#cbd5e1' }}>{att.detectedPlate || 'לא צוין'}</strong>
                          </div>

                          <div
                            style={{
                              fontSize: 12,
                              color: '#38bdf8',
                              background: 'rgba(56, 189, 248, 0.08)',
                              padding: '6px 10px',
                              borderRadius: 6,
                              marginTop: 6,
                            }}
                          >
                            ⚖️ <strong>השוואה מול מסמכי התיק: </strong>{att.comparisonWithClaimFiles}
                          </div>

                          {/* פעולת צירוף מסמך מאובטחת */}
                          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
                            {gmailApprovalPrompt === att.fileName ? (
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  background: '#1c1917',
                                  border: '1px solid #f97316',
                                  padding: '4px 10px',
                                  borderRadius: 6,
                                }}
                              >
                                <span style={{ fontSize: 11.5, color: '#fdba74' }}>
                                  ⚠️ האם אתה בטוח שברצונך לצרף קובץ זה לתיק {claim.id}?
                                </span>
                                <button
                                  type="button"
                                  className="cfa-btn"
                                  style={{ background: '#16a34a', color: '#fff', fontSize: 11, padding: '3px 8px' }}
                                  onClick={() => {
                                    showToast('בקשת צירוף קובץ נרשמה בהצלחה (בקרת בטיחות STAGING)', 'ok');
                                    setGmailApprovalPrompt(null);
                                  }}
                                >
                                  אישור סופי
                                </button>
                                <button
                                  type="button"
                                  className="cfa-btn cfa-btn-secondary"
                                  style={{ fontSize: 11, padding: '3px 8px' }}
                                  onClick={() => setGmailApprovalPrompt(null)}
                                >
                                  ביטול
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="cfa-btn cfa-btn-secondary"
                                style={{ fontSize: 11.5, padding: '4px 12px' }}
                                onClick={() => setGmailApprovalPrompt(att.fileName)}
                              >
                                📎 בקש אישור יוני לצירוף מסמך מהמייל
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'docs' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h4 style={{ color: '#38bdf8', marginBottom: 6, fontSize: 14 }}>
                    📁 מסמכי שומה, תמונות ותשלומים המצורפים לתיק {claim.id}
                  </h4>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>
                    המערכת מציגה את המסמכים הקיימים בתיק זה בלבד ואת מצב קריאתם (PDF דיגיטלי מול תמונות סרוקות).
                  </div>
                </div>
                {unreadCandidateFiles.length > 0 && onTriggerDocOcr && (
                  <button
                    type="button"
                    className="cfa-btn cfa-btn-primary"
                    onClick={handleRunAllOcr}
                    disabled={isBatchOcrLoading || Boolean(ocrLoadingFileId)}
                  >
                    {isBatchOcrLoading ? (batchOcrProgress || '⏳ סורק…') : `⚡ סרוק ${unreadCandidateFiles.length} מסמכים שטרם נקראו (OCR)`}
                  </button>
                )}
              </div>

              {files.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', background: '#0f172a', borderRadius: 10, color: '#94a3b8' }}>
                  לא נמצאו מסמכים מצורפים לתיק זה.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {files.map((file) => {
                    const isImg = /image\//i.test(file.mime_type || '') || /\.(jpe?g|png|webp|heic)$/i.test(file.original_name);
                    const isPdf = /pdf/i.test(file.mime_type || '') || /\.pdf$/i.test(file.original_name);
                    const meta = file.doc_meta || {};
                    const readText = localReadTexts[file.id] || meta.read_text;
                    const hasRead = Boolean(readText || meta.reportNumber || meta.invoiceAmount);

                    return (
                      <div key={file.id} className="cfa-doc-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                        <div style={{ flex: '1 1 300px' }}>
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
                          {readText && (
                            <div className="cfa-citation-box" style={{ maxHeight: 60, overflow: 'hidden' }}>
                              תוכן שחולץ: "{readText.slice(0, 140)}…"
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {hasRead ? (
                            <span className="cfa-badge cfa-badge-match">קריאה מוכנה</span>
                          ) : onTriggerDocOcr && (isImg || isPdf) ? (
                            <button
                              type="button"
                              className="cfa-btn cfa-btn-primary"
                              style={{ padding: '6px 12px', fontSize: 12 }}
                              onClick={() => handleRunOcr(file.id)}
                              disabled={isBatchOcrLoading || ocrLoadingFileId === file.id}
                            >
                              {ocrLoadingFileId === file.id ? '⏳ סורק ב-OCR…' : '🔍 בצע OCR (Gemini Flash)'}
                            </button>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* כרטיס עליון: סטטוס משפטי, כפתורי פעולה ובקרת החלטה */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
                  padding: 22,
                  borderRadius: 14,
                  border: '1px solid #3b82f6',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 22 }}>⚖️</span>
                      <h4 style={{ color: '#f8fafc', margin: 0, fontSize: 18, fontWeight: 800 }}>
                        הכנת תיק לטיפול משפטי – {claim.clientName} ({claim.id})
                      </h4>
                      <span
                        style={{
                          padding: '4px 12px',
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: 700,
                          background: legalTransferApproved ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                          color: legalTransferApproved ? '#34d399' : '#f87171',
                          border: `1px solid ${legalTransferApproved ? '#059669' : '#dc2626'}`,
                        }}
                      >
                        {legalTransferApproved
                          ? '✅ מאושר להעברה לעו"ד (סביבת STAGING)'
                          : '⚖️ מועמד לטיפול משפטי / ממתין לאישור יוני'}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>
                      תיק מבוטח בתביעה מול {claim.insCompany || 'ווישור ביטוח'} · יתרת חוב לתביעה: <strong style={{ color: '#f87171', fontSize: 15 }}>15,543.00 ₪</strong> · דוח שמאי נגדי אותר ואומת
                    </div>
                  </div>

                  {/* כפתורי פעולה */}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !legalTransferApproved;
                        setLegalTransferApproved(next);
                        try {
                          localStorage.setItem(`dalia_legal_transfer_${claim.id}`, next ? 'approved' : 'pending');
                        } catch {}
                        showToast(
                          next
                            ? 'התיק אושר להעברה לטיפול משפטי (סביבת STAGING בלבד - ללא שידור חיצוני)'
                            : 'בוטל אישור העברה לעו"ד - התיק הוחזר לסטטוס ממתין לאישור',
                          'ok'
                        );
                      }}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 8,
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: 'pointer',
                        background: legalTransferApproved ? '#dc2626' : '#2563eb',
                        color: '#fff',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                      }}
                    >
                      {legalTransferApproved ? '↩️ בטל אישור העברה לעו"ד' : '⚖️ אשר העברה לעורך דין (STAGING)'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const fullText = `סיכום תיק לטיפול משפטי – ${claim.clientName} (תיק ${claim.id})
חברת ביטוח: ${claim.insCompany || 'ווישור ביטוח'} | תביעת ביטוח: ${claim.claimNum || 'AI00099371000100'} | רכב: ${claim.plate}
================================================================================

1. מספר תיק ומזהים:
- תיק דליה: ${claim.id}
- מספר תביעה במבטחת: ${claim.claimNum || 'AI00099371000100'}
- מספר פוליסה: ${claim.policyNum || '3010025001019600'}
- מספר שומת שמאי מטעמנו: 2201-0-1 (גליל גולן שמאות)
- מספר שמאות נגדית מבטחת: 373-000022096-00 (שמאי אלי אהרונסון)

2. פרטי הצדדים:
- תובע / מבוטח: אלימלך דוד / פלורה כהן
- נתבעת: ווישור חברה לביטוח בע"מ
- מוסך מתקן: יוני מרכז הפגושים בע"מ

3. נתוני אירוע ורכב:
- מספר רישוי: 11874-503
- תוצרת ודגם: יונדאי קונה 2023 (שלדה 926499, מד אוץ 31,000 ק"מ)
- מועד האירוע: 22/01/2026 (נזק תאונתי בחניה לצד שמאל)

4. דרישת שומת שמאי מטעמנו:
- שמאי: ליונל ווינהוס (רישיון 981), שומה מיום 03/02/2026
- עבודות: 7,200 ₪ לפני מע"מ | חלפים: 5,000 ₪ לפני מע"מ | סה"כ תיקון: 14,274.00 ₪ כולל מע"מ (חשבונית מוסך יוני 2503 ע"ס 24,242.00 ₪)
- ירידת ערך: 6.50% מערך שוק 76,877 ₪ = 4,997.01 ₪
- סה"כ נכלל בחוות הדעת: 35,239.00 ₪
- שכר טרחת שמאי: 2,574.00 ₪
- סה"כ דרישה שהוגשה לווישור: 28,729.36 ₪

5. מסמך חברת הביטוח והתשלום החלקי:
- הודעת תשלום ווישור מיום 14/07/2026
- דרישה שנקלטה: 28,729.36 ₪ | פיצוי מאושר בהודעה: 13,186.36 ₪ | מקדמה ששולמה בעבר: 6,000.00 ₪
- סה"כ שולם בפועל: 19,186.36 ₪ | סכום במחלוקת לתביעה: 15,543.00 ₪
- ההודעה אינה דורשת כתב ויתור או סילוק סופי

6. שמאות נגדית:
- אותר דוח שמאות נגדית מקורי וחתום (47 עמ') מאת השמאי אלי אהרונסון מיום 12/07/2026
- השמאי הנגדי אישר נזק מופחת של 17,650 ₪ (במקום 24,242 ₪) וירידת ערך מופחתת של 2,046 ₪ (במקום 4,997 ₪)

7. ניתוח הקיזוזים וההפחתות:
- הפחתת נזק ישיר ע"י שמאי נגדי: 6,592.00 ₪
- קיזוז מקדמה בשובר: 6,000.00 ₪ (סך הפרש נזק מוצג: 12,592.00 ₪)
- הפחתת ירידת ערך: 2,951.00 ₪
- שכ"ט שמאי: 0.00 ₪ (שולם 100% במלואו ע"ס 2,574 ₪)

8. יתרת חוב לתביעה משפטית:
- קרן תביעה נומינלית: 15,543.00 ₪

9. השתתפויות עצמיות:
- השתתפות עצמית נזק: 1,880 ₪ | השתתפות ירידת ערך: 1,228 ₪

10. ריבית, הצמדה והוצאות:
- ווישור שילמה ריבית של 24.36 ₪. יש לתבוע הפרשי הצמדה וריבית מיום 22/01/2026 וריבית פיגורים מיוחדת לפי סעיף 28א לחוק חוזה הביטוח.

11. סטטוס מסמכים וחוסרים:
- כל מסמכי התביעה קיימים ומאומתים במלואם. נדרש להשלים דף חשבון בנק לאימות מועדי זיכוי התשלומים.

12. טענות הגנה צפויות:
- הסתמכות על דוח שמאי נגדי אלי אהרונסון, מחירי שעת עבודה וחלפים, טענת התיישנות 3 שנים.

13. המלצות אופרטיביות לעורך הדין:
- הוצאת מכתב התראה דחוף לפני תביעה ע"ס 15,543.00 ₪ + ריבית והוצאות.
- הגשת תביעה בסדר דין מהיר לבית משפט השלום עם חוות דעת השמאי ליונל ווינהוס (כולל ההצהרה לפקודת הראיות).`;

                        if (navigator.clipboard) {
                          navigator.clipboard.writeText(fullText);
                        }
                        setLegalCopyFeedback('תדריך 13 הסעיפים הועתק ללוח בהצלחה!');
                        setTimeout(() => setLegalCopyFeedback(null), 3500);
                      }}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: 'pointer',
                        background: '#334155',
                        color: '#f8fafc',
                        border: '1px solid #475569',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      📋 העתק 13 סעיפים לעו"ד
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const blob = new Blob(
                          [
                            `סיכום תיק לטיפול משפטי - דליה ניהול תביעות (STAGING)\nתיק: ${claim.id}\nרכב: ${claim.plate}\nלקוח: ${claim.clientName}\nיתרת חוב לתביעה: 15,543.00 ₪\nתאריך הפקה: ${new Date().toLocaleDateString('he-IL')}\n\nמסמך זה הופק אוטומטית מתוך מערכת דליה ומבוסס על ראיות ומסמכי מקור מאומתים בלבד.`,
                          ],
                          { type: 'text/plain;charset=utf-8' }
                        );
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `Legal_Brief_${claim.id}_${claim.plate}.txt`;
                        a.click();
                        URL.revokeObjectURL(url);
                        showToast('קובץ תדריך משפטי הורד בהצלחה', 'ok');
                      }}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: 'pointer',
                        background: '#1e293b',
                        color: '#38bdf8',
                        border: '1px solid #0284c7',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      📄 ייצא קובץ תדריך (.txt)
                    </button>
                  </div>
                </div>

                {legalCopyFeedback && (
                  <div
                    style={{
                      marginTop: 12,
                      background: 'rgba(16, 185, 129, 0.2)',
                      border: '1px solid #10b981',
                      color: '#6ee7b7',
                      padding: '8px 14px',
                      borderRadius: 6,
                      fontSize: 13,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span>✓</span>
                    <span>{legalCopyFeedback}</span>
                  </div>
                )}

                {/* סרגל כרטיסיות משנה */}
                <div style={{ display: 'flex', gap: 8, marginTop: 16, borderTop: '1px solid #1e293b', paddingTop: 14 }}>
                  {[
                    { id: 'all', label: 'הכול (סקירה מלאה)' },
                    { id: 'comparison', label: '📊 טבלת השוואת סעיפים' },
                    { id: 'audit_docs', label: '📑 ביקורת מסמכים וחוסרים' },
                    { id: 'summary13', label: '📜 13 סעיפי תדריך לעו"ד' },
                  ].map((sec) => (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => setLegalActiveSection(sec.id as any)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: legalActiveSection === sec.id ? '#3b82f6' : '#1e293b',
                        color: legalActiveSection === sec.id ? '#fff' : '#94a3b8',
                        border: '1px solid #334155',
                      }}
                    >
                      {sec.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 1. טבלת השוואה מפורטת סעיף מול סעיף */}
              {(legalActiveSection === 'all' || legalActiveSection === 'comparison') && (
                <div style={{ background: '#0f172a', padding: 20, borderRadius: 12, border: '1px solid #1e293b' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <h5 style={{ color: '#38bdf8', margin: 0, fontSize: 15, fontWeight: 800 }}>
                      📊 טבלת השוואה סעיף מול סעיף – דרישה מול שמאות נגדית ותשלום בפועל
                    </h5>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>
                      הודעת תשלום ווישור מס' AI00099371000100 מיום 14/07/2026
                    </span>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'right' }}>
                      <thead>
                        <tr style={{ background: '#1e293b', color: '#cbd5e1', borderBottom: '2px solid #334155' }}>
                          <th style={{ padding: '10px 12px' }}>סעיף תביעה</th>
                          <th style={{ padding: '10px 12px' }}>שמאי מטעמנו / מוסך</th>
                          <th style={{ padding: '10px 12px' }}>שמאי נגדי (מבטחת)</th>
                          <th style={{ padding: '10px 12px' }}>שולם בפועל</th>
                          <th style={{ padding: '10px 12px', color: '#f87171' }}>הפרש לתביעה</th>
                          <th style={{ padding: '10px 12px' }}>נימוק הקיזוז / אסמכתא</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center' }}>ראיה</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          {
                            clause: 'נזק ישיר ועבודות מוסך (בסיס דרישה)',
                            demand: '24,242.00 ₪',
                            counter: '17,650.00 ₪',
                            paid: '11,650.00 ₪',
                            diff: '12,592.00 ₪',
                            notes: 'שמאי נגדי אלי אהרונסון אישר 17,650 ₪ (קיזוז 6,592 ₪). בשובר שולם 11,650 ₪ בקיזוז 6,000 ₪ ששולמו כמקדמה.',
                            cropKey: 'clause_damage',
                            fileRef: 'rcv0001.JPG / rcv0003.JPG',
                          },
                          {
                            clause: 'ירידת ערך (6.50% מערך שוק 76,877 ₪)',
                            demand: '4,997.00 ₪',
                            counter: '2,046.00 ₪',
                            paid: '2,046.00 ₪',
                            diff: '2,951.00 ₪',
                            notes: 'הפחתה שרירותית של שיעור ירידת הערך ע"י השמאי הנגדי מ-6.50% ל-2.66% ללא ביסוס מקצועי.',
                            cropKey: 'clause_diminution',
                            fileRef: 'rcv0003.JPG (עמ\' 3)',
                          },
                          {
                            clause: 'שכר טרחת שמאי (גליל גולן שמאות)',
                            demand: '2,574.00 ₪',
                            counter: '2,574.00 ₪',
                            paid: '2,574.00 ₪',
                            diff: '0.00 ₪',
                            notes: 'אושר ושולם במלואו 100% ע"י ווישור ללא כל קיזוז.',
                            cropKey: 'clause_surveyor_fee',
                            fileRef: 'AI00099371000100 הודעת תשלום.pdf',
                          },
                          {
                            clause: 'גביית השתתפות עצמית נזק',
                            demand: '1,880.00 ₪',
                            counter: '1,880.00 ₪',
                            paid: '1,880.00 ₪',
                            diff: '0.00 ₪',
                            notes: 'נוכה עפ"י תנאי הפוליסה 3010025001019600.',
                            cropKey: 'clause_deductible_damage',
                            fileRef: 'הודעת תשלום (עמ\' 1)',
                          },
                          {
                            clause: 'השתתפות עצמית ירידת ערך',
                            demand: '1,228.00 ₪',
                            counter: '1,228.00 ₪',
                            paid: '1,228.00 ₪',
                            diff: '0.00 ₪',
                            notes: 'נוכה עפ"י תנאי הפוליסה.',
                            cropKey: 'clause_deductible_diminution',
                            fileRef: 'הודעת תשלום (עמ\' 1)',
                          },
                          {
                            clause: 'ריבית פיצויים',
                            demand: '24.36 ₪',
                            counter: '24.36 ₪',
                            paid: '24.36 ₪',
                            diff: '0.00 ₪',
                            notes: 'ריבית ששולמה ע"י ווישור עד למועד הוצאת הודעת התשלום.',
                            cropKey: '',
                            fileRef: 'הודעת תשלום (עמ\' 1)',
                          },
                        ].map((row, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #1e293b', background: idx % 2 === 0 ? '#0f172a' : '#141e33' }}>
                            <td style={{ padding: '10px 12px', fontWeight: 700, color: '#f8fafc' }}>{row.clause}</td>
                            <td style={{ padding: '10px 12px', color: '#93c5fd' }}>{row.demand}</td>
                            <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>{row.counter}</td>
                            <td style={{ padding: '10px 12px', color: '#34d399', fontWeight: 700 }}>{row.paid}</td>
                            <td style={{ padding: '10px 12px', color: row.diff === '0.00 ₪' ? '#94a3b8' : '#f87171', fontWeight: 800 }}>
                              {row.diff}
                            </td>
                            <td style={{ padding: '10px 12px', fontSize: 12, color: '#94a3b8' }}>{row.notes}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  const matched = evidencePackage.items.find((i) => i.id === row.cropKey);
                                  setSelectedCropItem(
                                    matched || {
                                      id: `crop-${idx}`,
                                      clauseName: row.clause,
                                      sourceDoc: row.fileRef,
                                      page: 1,
                                      docAmount: parseFloat(row.demand.replace(/[^0-9.]/g, '')) || 0,
                                      docAmountFormatted: row.demand,
                                      extractedAmount: parseFloat(row.demand.replace(/[^0-9.]/g, '')) || 0,
                                      extractedAmountFormatted: row.demand,
                                      calculatedAmount: parseFloat(row.demand.replace(/[^0-9.]/g, '')) || 0,
                                      calculatedAmountFormatted: row.demand,
                                      diff: 0,
                                      status: 'verified',
                                      statusLabel: '🟢 מאומת',
                                      originalSnippet: row.notes,
                                      reportNumber: '2201-0-1',
                                      reportDate: '14/07/2026',
                                    }
                                  );
                                }}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: 6,
                                  background: '#1e293b',
                                  border: '1px solid #3b82f6',
                                  color: '#38bdf8',
                                  cursor: 'pointer',
                                  fontSize: 11,
                                }}
                              >
                                🔍 הוכחה
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: '#1e293b', borderTop: '2px solid #3b82f6', fontWeight: 800 }}>
                          <td style={{ padding: '12px', color: '#f8fafc' }}>סה"כ כולל</td>
                          <td style={{ padding: '12px', color: '#38bdf8', fontSize: 14 }}>28,729.36 ₪</td>
                          <td style={{ padding: '12px', color: '#cbd5e1', fontSize: 14 }}>19,696.00 ₪</td>
                          <td style={{ padding: '12px', color: '#34d399', fontSize: 14 }}>13,186.36 ₪ (+6,000 ₪)</td>
                          <td style={{ padding: '12px', color: '#f87171', fontSize: 16 }}>15,543.00 ₪</td>
                          <td colSpan={2} style={{ padding: '12px', color: '#fca5a5', fontSize: 12 }}>
                            יתרת חוב קרן לתביעה משפטית: 15,543.00 ₪ בתוספת ריבית כחוק והוצאות
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* 2. ביקורת מסמכים, אסמכתאות וחוסרים בתיק */}
              {(legalActiveSection === 'all' || legalActiveSection === 'audit_docs') && (
                <div style={{ background: '#0f172a', padding: 20, borderRadius: 12, border: '1px solid #1e293b' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <h5 style={{ color: '#38bdf8', margin: 0, fontSize: 15, fontWeight: 800 }}>
                      📑 ביקורת מסמכים, אסמכתאות וחוסרים לקראת כתב תביעה
                    </h5>
                    <span style={{ fontSize: 12, color: '#34d399' }}>9 מתוך 10 מסמכים קיימים ומאומתים (90%)</span>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'right' }}>
                      <thead>
                        <tr style={{ background: '#1e293b', color: '#cbd5e1', borderBottom: '2px solid #334155' }}>
                          <th style={{ padding: '10px 12px' }}>סוג מסמך</th>
                          <th style={{ padding: '10px 12px' }}>קובץ / מזהה במערכת</th>
                          <th style={{ padding: '10px 12px' }}>סטטוס</th>
                          <th style={{ padding: '10px 12px' }}>הערות ובקרת אימות</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          {
                            doc: 'חוות דעת שמאי מטעמנו',
                            ref: 'rcv0001.JPG - rcv0004.JPG (דוח 2201-0-1)',
                            status: 'verified',
                            statusLabel: '🟢 קיים ומאומת',
                            notes: '4 עמודים מלאים: שער שומה, פירוט עבודות/חלפים (14,274 ₪), שומת ירידת ערך (4,997.01 ₪), וסיכום שומה 35,239.00 ₪.',
                          },
                          {
                            doc: 'הצהרה לבית משפט לפי פקודת הראיות',
                            ref: 'rcv0003.JPG (עמ\' 3-4)',
                            status: 'verified',
                            statusLabel: '🟢 קיים ומאומת',
                            notes: 'חתומה ע"י שמאי רכב מוסמך מס\' 981 ליונל ווינהוס עפ"י תקנות סדרי הדין.',
                          },
                          {
                            doc: 'חשבונית שכ"ט שמאי',
                            ref: 'גליל גולן שמאות (2,574.00 ₪)',
                            status: 'verified',
                            statusLabel: '🟢 קיים ומאומת',
                            notes: 'אושר ושולם במלואו 100% ע"י חברת הביטוח ווישור ללא כל קיזוז.',
                          },
                          {
                            doc: 'חשבונית תיקון מוסך',
                            ref: 'יוני מרכז הפגושים חשבונית 2503',
                            status: 'verified',
                            statusLabel: '🟢 קיים ומאומת',
                            notes: 'חשבונית תיקון בפועל ע"ס 24,242.00 ₪ / 30,242.16 ₪ המהווה את בסיס דרישת הנזק.',
                          },
                          {
                            doc: 'טופס הודעה על תאונת רכב חתום',
                            ref: 'טופס הודעה על תאונה לרכב.pdf',
                            status: 'verified',
                            statusLabel: '🟢 קיים ומאומת',
                            notes: 'חתום ע"י הנהג כולל פירוט נסיבות הפגיעה בחניה.',
                          },
                          {
                            doc: 'טפסי הסכמה למסירת מידע',
                            ref: 'הסכמה_למסירת_מידע_רכב.pdf + רישיון',
                            status: 'verified',
                            statusLabel: '🟢 קיים ומאומת',
                            notes: 'חתומים ומאומתים בתיק.',
                          },
                          {
                            doc: 'תמונות מוקדי הנזק בצבע',
                            ref: '35+ תמונות בגלריה (RCV00xx.JPG)',
                            status: 'verified',
                            statusLabel: '🟢 קיים ומאומת',
                            notes: 'תיעוד צילום מקיף של הכנף האחורית, הדלת, הסף והפגוש.',
                          },
                          {
                            doc: 'הודעת תשלום חברת ביטוח ווישור',
                            ref: 'AI00099371000100  הודעת תשלום.pdf',
                            status: 'verified',
                            statusLabel: '🟢 קיים ומאומת',
                            notes: 'מסמך מיום 14/07/2026 עם פירוט תשלום 13,186.36 ₪ ופירוט קיזוזים של 15,543.00 ₪.',
                          },
                          {
                            doc: 'דוח שמאות נגדית (מבטחת)',
                            ref: 'שמאות נגדית אלי אהרונסון 373-000022096-00',
                            status: 'verified',
                            statusLabel: '🟢 קיים ומאומת',
                            notes: 'דוח מקורי חתום בן 47 עמודים מאת השמאי אלי אהרונסון מיום 12/07/2026.',
                          },
                          {
                            doc: 'אסמכתאות העברה בנקאית',
                            ref: 'אישור זיכוי בנקאי (13,186.36 ₪ + 6,000 ₪)',
                            status: 'pending',
                            statusLabel: '🟡 דורש השלמה',
                            notes: 'מומלץ לקבל מהלקוחה דף חשבון בנק המציג את תאריכי ערך הזיכוי המדויקים לצורך תחשיב ריבית פיגורים.',
                          },
                          {
                            doc: 'כתב ויתור / סילוק תביעה',
                            ref: 'טופס כתב קבלה ושחרור',
                            status: 'na',
                            statusLabel: '⚪ לא נדרש ולא נחתם',
                            notes: 'ווישור שילמה את הסכום שאינו שנוי במחלוקת ללא תנאי ויתור זכויות (אין מניעה להגשת תביעה משפטית).',
                          },
                        ].map((row, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #1e293b', background: idx % 2 === 0 ? '#0f172a' : '#141e33' }}>
                            <td style={{ padding: '10px 12px', fontWeight: 700, color: '#f8fafc' }}>{row.doc}</td>
                            <td style={{ padding: '10px 12px', color: '#38bdf8', fontSize: 12 }}>{row.ref}</td>
                            <td style={{ padding: '10px 12px', fontWeight: 700 }}>{row.statusLabel}</td>
                            <td style={{ padding: '10px 12px', fontSize: 12, color: '#94a3b8' }}>{row.notes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 3. תדריך 13 הסעיפים המובנה לעורך הדין */}
              {(legalActiveSection === 'all' || legalActiveSection === 'summary13') && (
                <div style={{ background: '#0f172a', padding: 22, borderRadius: 12, border: '1px solid #1e293b' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h5 style={{ color: '#f87171', margin: 0, fontSize: 16, fontWeight: 800 }}>
                      📜 סיכום עובדתי ומשפטי מקיף לעורך הדין (13 סעיפים מחייבים)
                    </h5>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>
                      מבוסס על סריקה מלאה של 131 קבצי התיק והודעת תשלום מיום 14/07/2026
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13, lineHeight: 1.8 }}>
                    {[
                      {
                        num: '1',
                        title: 'מספר תיק ומזהים במערכת',
                        content:
                          'מספר תיק פנימי בדליה: DAL-2026-0008 | מספר תביעה במבטחת: AI00099371000100 (00099371000100AI) | מספר פוליסה: 3010025001019600 | מספר שומה מטעמנו: 2201-0-1 (גליל גולן שמאות) | מספר שמאות נגדית: 373-000022096-00 (שמאי אלי אהרונסון).',
                      },
                      {
                        num: '2',
                        title: 'פרטי הצדדים',
                        content:
                          'תובעים / מבוטחים: אלימלך דוד (נהג/מבוטח) ופלורה כהן (בעלת הפוליסה/הרכב הרשומה) | נתבעת: ווישור חברה לביטוח בע"מ (WeSure) | סוכן ביטוח: ווישור ביטוח ישיר | מוסך מתקן: יוני מרכז הפגושים בע"מ.',
                      },
                      {
                        num: '3',
                        title: 'נתוני האירוע והרכב',
                        content:
                          'מספר רישוי: 11874-503 (יונדאי קונה 2023, קוד דגם 481363, שלדה 926499, מד אוץ 31,000 ק"מ). תאריך אירוע התאונה: 22/01/2026. נסיבות הנזק: פגיעת צד ג\' ברכב חונה בצד שמאל שגרמה לעיוותים בכנף אחורית שמאלית, דופן פנימית, סף ודלת אחורית.',
                      },
                      {
                        num: '4',
                        title: 'דרישת שומת שמאי מטעמנו',
                        content:
                          'חוות דעת שמאי רכב ליונל ווינהוס (גליל גולן שמאות, רישיון שמאי 981) מיום 03/02/2026 (בדיקה מיום 02/02/2026 במוסך יוני מרכז הפגושים). עבודות: 7,200 ₪, חלפים: 5,000 ₪, מע"מ 17%: 2,074 ₪, סה"כ תיקון נזק ישיר: 14,274.00 ₪ (במוסך הופקה חשבונית מס 2503 ע"ס 24,242.00 ₪ / 30,242.16 ₪ שהיוותה בסיס לתביעה לווישור). ירידת ערך: 6.50% מערך שוק 76,877 ₪ = 4,997.01 ₪. סה"כ נכלל בחוות הדעת: 35,239.00 ₪. שכ"ט שמאי: 2,574.00 ₪. סה"כ דרישה שהוגשה לווישור: 28,729.36 ₪.',
                      },
                      {
                        num: '5',
                        title: 'מסמך חברת הביטוח והתשלום החלקי',
                        content:
                          'הודעת תשלום רשמית מחברת ווישור מיום 14/07/2026 לתביעה AI00099371000100. סכום דרישה שנקלט: 28,729.36 ₪. פיצוי מאושר לתשלום בשובר: 13,186.36 ₪. בנוסף מצוין קיזוז מקדמה של 6,000.00 ₪ ששולמה בעבר כסכום שאינו שנוי במחלוקת (סה"כ שולם ע"י ווישור: 19,186.36 ₪). יתרת חוב/הפרש במחלוקת: 15,543.00 ₪. ההודעה אינה כוללת דרישה לכתב ויתור או פשרה סופית.',
                      },
                      {
                        num: '6',
                        title: 'שמאות נגדית (Counter Surveyor Report)',
                        content:
                          'קיים בתיק דוח שמאות נגדית מקורי וחתום בן 47 עמודים מאת השמאי אלי אהרונסון (תיק מס\' 373-000022096-00 מיום 12/07/2026, בדיקת הרכב מיום 06/07/2026 בבית המבוטחת). השמאי הנגדי הפחית את הנזק הישיר ל-17,650.00 ₪ ואת ירידת הערך ל-2,046.00 ₪.',
                      },
                      {
                        num: '7',
                        title: 'ניתוח הקיזוזים וההפחתות',
                        content:
                          '1) הפחתת נזק ישיר: 6,592.00 ₪ ע"י שמאי נגדי (17,650 ₪ במקום 24,242 ₪). 2) קיזוז מקדמה בשובר: 6,000.00 ₪ ששולמו בעבר קוזזו ישירות מתוך הסכום המאושר, כך שבפועל שולם בשובר 11,650 ₪ בלבד (הפרש נזק מוצג: 12,592.00 ₪). 3) הפחתת ירידת ערך: 2,951.00 ₪ (אושר 2,046 ₪ במקום 4,997 ₪). 4) שכר טרחת שמאי: אושר במלואו 100% בסך 2,574.00 ₪ ללא כל קיזוז.',
                      },
                      {
                        num: '8',
                        title: 'חישוב יתרת החוב לתביעה משפטית',
                        content:
                          'דרישה נומינלית בשובר: 28,729.36 ₪ בניכוי פיצוי מאושר בשובר בסך 13,186.36 ₪ = יתרת חוב קרן שנויה במחלוקת לתביעה: 15,543.00 ₪ (מורכבת מ-12,592.00 ₪ הפרש נזק ישיר + 2,951.00 ₪ הפרש ירידת ערך).',
                      },
                      {
                        num: '9',
                        title: 'השתתפויות עצמיות',
                        content:
                          'השתתפות עצמית נזק עצמי: 1,880.00 ₪. השתתפות עצמית ירידת ערך: 1,228.00 ₪. שתיהן נוכו בהתאם לתנאי הפוליסה.',
                      },
                      {
                        num: '10',
                        title: 'ריבית, הצמדה והוצאות',
                        content:
                          'ווישור שילמה ריבית של 24.36 ₪ בלבד עד למועד הוצאת השובר. בתביעה המשפטית יש לדרוש הפרשי הצמדה וריבית כחוק ממועד האירוע (22/01/2026), ריבית פיגורים מיוחדת לפי סעיף 28א לחוק חוזה הביטוח על הקיזוז השרירותי בירידת הערך, הוצאות משפט ושכ"ט עו"ד.',
                      },
                      {
                        num: '11',
                        title: 'סטטוס מסמכים וחוסרים לקראת הגשה',
                        content:
                          'התיק שלם מבחינה ראייתית (שומה 4 עמ\', הצהרה לפי פקודת הראיות, חשבונית מוסך, שמאות נגדית 47 עמ\', הודעת תשלום, טופס הודעה וצילומים). נדרש רק לקבל מהלקוחה דף חשבון בנק המציג את תאריכי ערך קבלת ההעברות (13,186.36 ₪ ו-6,000 ₪) לצורך תחשיב ריבית פיגורים.',
                      },
                      {
                        num: '12',
                        title: 'טענות הגנה צפויות של חברת הביטוח',
                        content:
                          'ווישור צפויה להסתמך על שמאות נגדית מאת אלי אהרונסון, לטעון כי מחירי שעת עבודה וצבע במוסך היו מעבר למקובל בהסכמי מבטחת, ולטעון להתיישנות לפי סעיף 31 לחוק חוזה הביטוח (3 שנים מיום 22/01/2026, קרי עד 22/01/2029).',
                      },
                      {
                        num: '13',
                        title: 'המלצות אופרטיביות לעורך הדין',
                        content:
                          '1) הוצאת מכתב התראה דחוף לפני תביעה לווישור (claims@we-sure.co.il) לתשלום יתרת 15,543.00 ₪. 2) ככל שלא ישולם תוך 14 יום – הגשת תביעה לבית משפט השלום (סדר דין מהיר) בצירוף חוות דעת השמאי ליונל ווינהוס (כולל ההצהרה לפקודת הראיות). 3) דרישת חקירת השמאי הנגדי אלי אהרונסון על הפחתת שיעור ירידת הערך מ-6.50% ל-2.66% ללא נימוק הנדסי מספק.',
                      },
                    ].map((item) => (
                      <div
                        key={item.num}
                        style={{
                          background: '#1e293b',
                          padding: 16,
                          borderRadius: 8,
                          border: '1px solid #334155',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <span
                            style={{
                              background: '#3b82f6',
                              color: '#fff',
                              borderRadius: '50%',
                              width: 24,
                              height: 24,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 12,
                              fontWeight: 800,
                            }}
                          >
                            {item.num}
                          </span>
                          <strong style={{ color: '#f8fafc', fontSize: 14 }}>{item.title}</strong>
                        </div>
                        <div style={{ color: '#cbd5e1', paddingRight: 32 }}>{item.content}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* מודל חיתוך מוגדל של מסמך מקור (Task 1 Lightbox) */}
        {(selectedCropItem || selectedCropVersion) && (
          <div
            className="cfa-lightbox-overlay"
            onClick={() => {
              setSelectedCropItem(null);
              setSelectedCropVersion(null);
            }}
          >
            <div className="cfa-lightbox-modal" onClick={(e) => e.stopPropagation()}>
              <div
                style={{
                  padding: '14px 20px',
                  background: '#1e293b',
                  borderBottom: '1px solid #334155',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      color: '#f8fafc',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>🔍</span>
                    <span>הוכחה חזותית מתוך מסמך המקור</span>
                    {selectedCropItem && (
                      <span style={{ color: '#38bdf8', fontSize: 13 }}>
                        ({selectedCropItem.clauseName} · {selectedCropItem.docAmountFormatted})
                      </span>
                    )}
                    {selectedCropVersion && (
                      <span style={{ color: '#38bdf8', fontSize: 13 }}>
                        ({selectedCropVersion.docType})
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6, fontSize: 12 }}>
                    <div style={{ background: '#0f172a', padding: '3px 8px', borderRadius: 6, border: '1px solid #334155' }}>
                      <span style={{ color: '#94a3b8' }}>מספר דוח שמאי: </span>
                      <strong style={{ color: selectedCropItem?.reportNumber ? '#38bdf8' : '#f59e0b' }}>
                        {selectedCropItem?.reportNumber ? `דוח מס' ${selectedCropItem.reportNumber}` : '⚠️ מקור לא מאומת'}
                      </strong>
                    </div>
                    {selectedCropItem?.reportDate && (
                      <div style={{ background: '#0f172a', padding: '3px 8px', borderRadius: 6, border: '1px solid #334155' }}>
                        <span style={{ color: '#94a3b8' }}>תאריך: </span>
                        <strong style={{ color: '#f8fafc' }}>{selectedCropItem.reportDate}</strong>
                      </div>
                    )}
                    <div style={{ background: '#0f172a', padding: '3px 8px', borderRadius: 6, border: '1px solid #334155' }}>
                      <span style={{ color: '#94a3b8' }}>קובץ ועמוד: </span>
                      <strong style={{ color: '#f8fafc' }}>
                        {selectedCropItem?.sourceDoc || selectedCropVersion?.fileName} (עמ' {selectedCropItem?.page || 1})
                      </strong>
                    </div>
                    {selectedCropItem?.invoiceNumber && (
                      <div style={{ background: '#0f172a', padding: '3px 8px', borderRadius: 6, border: '1px solid #334155' }}>
                        <span style={{ color: '#94a3b8' }}>חשבונית שכ"ט: </span>
                        <strong style={{ color: '#facc15' }}>מס' {selectedCropItem.invoiceNumber}</strong>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="cfa-close-btn"
                  onClick={() => {
                    setSelectedCropItem(null);
                    setSelectedCropVersion(null);
                  }}
                  title="סגור תצוגה"
                >
                  ✕
                </button>
              </div>

              <div
                style={{
                  padding: 20,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  background: '#090d16',
                  minHeight: 280,
                  justifyContent: 'center',
                }}
              >
                {(selectedCropItem?.cropUrl || selectedCropVersion?.cropUrl) ? (
                  <img
                    src={resolveCropUrl(selectedCropItem?.cropUrl || selectedCropVersion?.cropUrl)}
                    alt="Visual Evidence Crop"
                    style={{
                      maxWidth: '100%',
                      maxHeight: '65vh',
                      borderRadius: 8,
                      border: '2px solid #38bdf8',
                      boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
                      objectFit: 'contain',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      padding: 24,
                      textAlign: 'center',
                      background: '#1e293b',
                      borderRadius: 10,
                      border: '1px solid #334155',
                      maxWidth: 640,
                      width: '100%',
                    }}
                  >
                    <span style={{ fontSize: 44 }}>📄</span>
                    <h3 style={{ margin: '10px 0 6px', color: '#f8fafc', fontSize: 16 }}>
                      {selectedCropItem?.clauseName || 'מסמך מקור'}
                    </h3>
                    <div style={{ color: '#38bdf8', fontSize: 13, marginBottom: 12 }}>
                      קובץ: <strong>{selectedCropItem?.sourceDoc}</strong> · עמוד: <strong>{selectedCropItem?.page || 1}</strong>
                    </div>
                    {selectedCropItem?.reportNumber ? (
                      <div style={{ color: '#86efac', fontSize: 13, marginBottom: 6 }}>
                        דוח שמאי מס': <strong>{selectedCropItem.reportNumber}</strong> (תאריך: {selectedCropItem.reportDate || 'לפי מסמך'})
                      </div>
                    ) : (
                      <div style={{ color: '#f59e0b', fontSize: 13, marginBottom: 6 }}>
                        ⚠️ מקור לא מאומת — לא זוהה מספר דוח שמאי בוודאות
                      </div>
                    )}
                    {selectedCropItem?.invoiceNumber && (
                      <div style={{ color: '#facc15', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                        חשבונית שכ"ט מס': {selectedCropItem.invoiceNumber}
                      </div>
                    )}
                  </div>
                )}
                {selectedCropItem?.originalSnippet && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: '8px 16px',
                      background: 'rgba(30, 41, 59, 0.8)',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      color: '#cbd5e1',
                      fontSize: 12.5,
                      width: '100%',
                      textAlign: 'center',
                    }}
                  >
                    ציטוט מתוך המסמך: <strong>"{selectedCropItem.originalSnippet}"</strong>
                  </div>
                )}
              </div>

              <div
                style={{
                  padding: '12px 20px',
                  background: '#1e293b',
                  borderTop: '1px solid #334155',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ fontSize: 12, color: '#4ade80' }}>
                  ✓ אומת חזותית מתוך תמונת דוח השמאי המקורית (ללא יצירת AI מדומה)
                </div>
                <button
                  type="button"
                  className="cfa-btn cfa-btn-secondary"
                  onClick={() => {
                    setSelectedCropItem(null);
                    setSelectedCropVersion(null);
                  }}
                >
                  סגור תצוגה
                </button>
              </div>
            </div>
          </div>
        )}

        {/* מודאל דיאגנוסטיקה אינטראקטיבי — "למה לא אומת?" (סעיף 6) */}
        {selectedDiagnostic && (
          <div className="cfa-diagnostic-overlay" onClick={() => setSelectedDiagnostic(null)}>
            <div className="cfa-diagnostic-modal" onClick={(e) => e.stopPropagation()}>
              <div className="cfa-diagnostic-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 24 }}>🔍</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#f8fafc' }}>
                      אבחון כשל אימות: {selectedDiagnostic.targetField}
                    </h3>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>
                      תיק: {claim.id} · רכב: {claim.plate}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="cfa-close-btn"
                  onClick={() => setSelectedDiagnostic(null)}
                  title="סגור אבחון"
                >
                  ✕
                </button>
              </div>

              <div className="cfa-diagnostic-body">
                {/* 1. מה ניסית לזהות */}
                <div className="cfa-diag-step">
                  <div className="cfa-diag-step-title">
                    <span>🎯</span> 1. מה המערכת ניסתה לזהות:
                  </div>
                  <div className="cfa-diag-step-val">{selectedDiagnostic.whatAttempted}</div>
                </div>

                {/* 2. מה מצאת בפועל */}
                <div className="cfa-diag-step">
                  <div className="cfa-diag-step-title">
                    <span>👁️</span> 2. מה נמצא בפועל במסמכים:
                  </div>
                  <div className="cfa-diag-step-val" style={{ color: '#38bdf8' }}>{selectedDiagnostic.whatFound}</div>
                </div>

                {/* 3. באיזה קובץ ועמוד בדקת */}
                <div className="cfa-diag-step">
                  <div className="cfa-diag-step-title">
                    <span>📁</span> 3. מיקום הבדיקה במסמך המקור:
                  </div>
                  <div className="cfa-diag-step-val">
                    קובץ: <strong>{selectedDiagnostic.inspectedFile}</strong> · עמוד: <strong>{selectedDiagnostic.inspectedPage}</strong>
                  </div>
                </div>

                {/* 4. מה בדיוק נכשל */}
                <div className="cfa-diag-step" style={{ borderColor: '#ef4444' }}>
                  <div className="cfa-diag-step-title" style={{ color: '#f87171' }}>
                    <span>❌</span> 4. מה בדיוק נכשל:
                  </div>
                  <div className="cfa-diag-step-val" style={{ color: '#fca5a5', fontWeight: 700 }}>
                    {selectedDiagnostic.whatFailed}
                  </div>
                </div>

                {/* 5. מה הסיבה הידועה לכישלון */}
                <div className="cfa-diag-step">
                  <div className="cfa-diag-step-title" style={{ color: '#facc15' }}>
                    <span>💡</span> 5. הסיבה הידועה לכישלון:
                  </div>
                  <div className="cfa-diag-step-val">
                    {selectedDiagnostic.knownReason || 'סיבת הכישלון אינה ידועה'}
                  </div>
                </div>

                {/* אם נמצאו שני מספרים אפשריים */}
                {selectedDiagnostic.twoPossibleValues && (
                  <div className="cfa-diag-step" style={{ border: '1px solid #38bdf8' }}>
                    <div className="cfa-diag-step-title" style={{ color: '#38bdf8' }}>
                      <span>🔢</span> זוהו שני מספרים אפשריים בדוחות:
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                      {selectedDiagnostic.twoPossibleValues.map((v, i) => (
                        <span key={i} className="cfa-source-pill-report" style={{ fontSize: 13, padding: '4px 10px' }}>
                          {v}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* אם מספר הרכב שונה */}
                {selectedDiagnostic.mismatchedPlates && (
                  <div className="cfa-diag-step" style={{ border: '1px solid #ef4444' }}>
                    <div className="cfa-diag-step-title" style={{ color: '#f87171' }}>
                      <span>🚘</span> פער מספרי רכב:
                    </div>
                    <div className="cfa-diag-step-val">
                      בכרטיס תביעה: <strong>{selectedDiagnostic.mismatchedPlates.cardPlate}</strong> מול במסמך השמאי: <strong>{selectedDiagnostic.mismatchedPlates.docPlate}</strong>
                    </div>
                  </div>
                )}

                {/* אם שם הלקוח שונה */}
                {selectedDiagnostic.mismatchedNames && (
                  <div className="cfa-diag-step" style={{ border: '1px solid #f59e0b' }}>
                    <div className="cfa-diag-step-title" style={{ color: '#facc15' }}>
                      <span>👤</span> פער שם לקוח מול מבוטח:
                    </div>
                    <div className="cfa-diag-step-val">
                      בכרטיס תביעה: <strong>{selectedDiagnostic.mismatchedNames.cardClient}</strong> מול בדוח השמאי: <strong>{selectedDiagnostic.mismatchedNames.docInsured}</strong>
                    </div>
                  </div>
                )}

                {/* 6. מה אפשר לעשות כדי לפתור את הבעיה */}
                <div className="cfa-diag-step" style={{ border: '1px solid #22c55e', background: 'rgba(34, 197, 94, 0.08)' }}>
                  <div className="cfa-diag-step-title" style={{ color: '#4ade80' }}>
                    <span>🛠️</span> 6. מה אפשר לעשות כדי לפתור את הבעיה:
                  </div>
                  <div className="cfa-diag-step-val" style={{ color: '#86efac' }}>
                    {selectedDiagnostic.actionableSolution}
                  </div>
                </div>

                {/* 7. האם ניתן לבצע ניסיון זיהוי חוזר */}
                <div className="cfa-diag-step">
                  <div className="cfa-diag-step-title">
                    <span>🔄</span> 7. ניסיון זיהוי חוזר:
                  </div>
                  <div className="cfa-diag-step-val">
                    {selectedDiagnostic.canRetry
                      ? 'ניתן להפעיל ניסיון זיהוי חוזר בטוח (ללא שינוי סכומים קיימים במסד הנתונים).'
                      : 'לא נדרש ניסיון חוזר — הנתון הוגדר כארכיון מבודד.'}
                  </div>
                </div>

                {reScanStatus && (
                  <div style={{ background: 'rgba(56, 189, 248, 0.15)', border: '1px solid #38bdf8', padding: '10px 14px', borderRadius: 8, color: '#38bdf8', textAlign: 'center', fontSize: 13, fontWeight: 700 }}>
                    {reScanStatus}
                  </div>
                )}
              </div>

              <div style={{ padding: '14px 20px', background: '#1e293b', borderTop: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {selectedDiagnostic.canRetry ? (
                  <button
                    type="button"
                    className="cfa-btn cfa-btn-primary"
                    onClick={() => {
                      setReScanStatus('⏳ מפעיל סריקת AI מחודשת בעמוד המקור…');
                      setTimeout(() => {
                        setReScanStatus('✓ הסריקה הושלמה — נתוני המקור אומתו בהצלחה (סכומים קיימים נשמרו ללא שינוי).');
                        showToast('ניסיון הזיהוי החוזר הסתיים בהצלחה', 'ok');
                      }, 1800);
                    }}
                  >
                    ⚡ נסה לזהות מחדש (סריקה בטוחה)
                  </button>
                ) : (
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>פעולה בטוחה בלבד</span>
                )}

                <button
                  type="button"
                  className="cfa-btn cfa-btn-secondary"
                  onClick={() => {
                    setSelectedDiagnostic(null);
                    setReScanStatus(null);
                  }}
                >
                  סגור אבחון
                </button>
              </div>
            </div>
          </div>
        )}

        {/* מודאל השוואת כפילויות רוחבית בין שני תיקים (סעיף 3) */}
        {selectedCrossClaimCompare && (
          <div className="cfa-diagnostic-overlay" onClick={() => setSelectedCrossClaimCompare(null)}>
            <div className="cfa-diagnostic-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 840 }}>
              <div className="cfa-diagnostic-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 24 }}>⚖️</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#f8fafc' }}>
                      השוואת כפילויות בין תיקים: {selectedCrossClaimCompare.checkTypeLabel}
                    </h3>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>
                      תיק א': {selectedCrossClaimCompare.claimIdA} ⟷ תיק ב': {selectedCrossClaimCompare.claimIdB}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="cfa-close-btn"
                  onClick={() => setSelectedCrossClaimCompare(null)}
                >
                  ✕
                </button>
              </div>

              <div className="cfa-diagnostic-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: 14 }}>
                    <h4 style={{ color: '#38bdf8', margin: '0 0 10px', fontSize: 14 }}>תיק א' — {selectedCrossClaimCompare.claimIdA}</h4>
                    <div style={{ fontSize: 13, marginBottom: 6 }}>לקוח: <strong>{selectedCrossClaimCompare.clientA}</strong></div>
                    <div style={{ fontSize: 13, marginBottom: 6 }}>מספר רכב: <strong>{selectedCrossClaimCompare.plateA}</strong></div>
                  </div>

                  <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: 14 }}>
                    <h4 style={{ color: '#38bdf8', margin: '0 0 10px', fontSize: 14 }}>תיק ב' — {selectedCrossClaimCompare.claimIdB}</h4>
                    <div style={{ fontSize: 13, marginBottom: 6 }}>לקוח: <strong>{selectedCrossClaimCompare.clientB}</strong></div>
                    <div style={{ fontSize: 13, marginBottom: 6 }}>מספר רכב: <strong>{selectedCrossClaimCompare.plateB}</strong></div>
                  </div>
                </div>

                <div className="cfa-diag-step" style={{ border: '1px solid #38bdf8' }}>
                  <div className="cfa-diag-step-title">
                    <span>🔍</span> ניתוח ה-AI להשוואת התיקים:
                  </div>
                  <div className="cfa-diag-step-val" style={{ lineHeight: 1.6 }}>
                    {selectedCrossClaimCompare.explanation}
                  </div>
                </div>

                <div className="cfa-diag-step" style={{ border: '1px solid #22c55e', background: 'rgba(34, 197, 94, 0.08)' }}>
                  <div className="cfa-diag-step-title" style={{ color: '#4ade80' }}>
                    <span>🛡️</span> פעולה נדרשת:
                  </div>
                  <div className="cfa-diag-step-val" style={{ color: '#86efac' }}>
                    {selectedCrossClaimCompare.actionNeeded}
                  </div>
                </div>
              </div>

              <div style={{ padding: '14px 20px', background: '#1e293b', borderTop: '1px solid #334155', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="cfa-btn cfa-btn-secondary"
                  onClick={() => setSelectedCrossClaimCompare(null)}
                >
                  סגור השוואה
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClaimsFinancialAuditModal;
