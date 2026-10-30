import React, { useEffect, useId, useRef, useState } from 'react';
import type { ClaimRecord, ClaimsApi } from './claimsService';
import {
  calculateRepairAmount,
  checkPlateMatch,
  parseCleanNumber,
  parseLeviYitzhakText,
  type LeviYitzhakExtractedData,
} from './leviYitzhakParser';

interface Props {
  open: boolean;
  claim: ClaimRecord;
  api: ClaimsApi;
  onClose: () => void;
  onSaved?: (updatedClaim: ClaimRecord) => void;
  toast?: (msg: string, type?: string) => void;
}

export default function LeviYitzhakModal({
  open,
  claim,
  api,
  onClose,
  onSaved,
  toast,
}: Props) {
  const fileInputId = useId();
  const cameraInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedFileId, setUploadedFileId] = useState<string>(claim.leviYitzhakImageUrl || '');
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [plateWarning, setPlateWarning] = useState<string>('');
  const [ocrError, setOcrError] = useState<string>('');
  const [ocrSuccess, setOcrSuccess] = useState<string>('');

  // Existing claim documents for Option 3 (Pick from claim files)
  const [claimDocs, setClaimDocs] = useState<Array<{ id: string; original_name: string; mime_type: string }>>([]);
  const [showDocPicker, setShowDocPicker] = useState(false);

  // Editable vehicle & valuation fields
  const [plate, setPlate] = useState(claim.plate || '');
  const [carMake, setCarMake] = useState(claim.carMake || '');
  const [carModel, setCarModel] = useState(claim.carModel || '');
  const [carYear, setCarYear] = useState(claim.carYear || '');
  const [ramatGimur, setRamatGimur] = useState(claim.ramatGimur || '');
  const [roadDate, setRoadDate] = useState(claim.roadDate || '');
  const [ownershipType, setOwnershipType] = useState(claim.ownershipType || 'פרטית');
  const [mileage, setMileage] = useState(claim.mileage || '');
  const [prevOwners, setPrevOwners] = useState(claim.prevOwners || '');
  const [basicPrice, setBasicPrice] = useState(claim.basicPrice || '');
  const [weightedPrice, setWeightedPrice] = useState(claim.weightedPrice || '');
  const [valuationDate, setValuationDate] = useState(claim.valuationDate || new Date().toLocaleDateString('he-IL'));
  const [valuationSource, setValuationSource] = useState(claim.valuationSource || 'מחירון לוי יצחק');
  const [additionsDeductions, setAdditionsDeductions] = useState(claim.leviYitzhakAdditionsDeductions || '');

  // Repair Calculator
  const [policyPct, setPolicyPct] = useState(claim.repairCalcPolicyPct || '');
  const [thirdPct, setThirdPct] = useState(claim.repairCalcThirdPct || '');

  // Client Quote Integration
  const [showInQuote, setShowInQuote] = useState(claim.showRepairInQuote === 'true');
  const [quoteRoute, setQuoteRoute] = useState<'policy' | 'third_party'>(
    (claim.quoteRepairRoute as 'policy' | 'third_party') || 'policy'
  );

  // Sync state whenever claim changes or modal opens
  useEffect(() => {
    if (open) {
      setPlate(claim.plate || '');
      setCarMake(claim.carMake || '');
      setCarModel(claim.carModel || '');
      setCarYear(claim.carYear || '');
      setRamatGimur(claim.ramatGimur || '');
      setRoadDate(claim.roadDate || '');
      setOwnershipType(claim.ownershipType || 'פרטית');
      setMileage(claim.mileage || '');
      setPrevOwners(claim.prevOwners || '');
      setBasicPrice(claim.basicPrice || '');
      setWeightedPrice(claim.weightedPrice || '');
      setValuationDate(claim.valuationDate || new Date().toLocaleDateString('he-IL'));
      setValuationSource(claim.valuationSource || 'מחירון לוי יצחק');
      setAdditionsDeductions(claim.leviYitzhakAdditionsDeductions || '');
      setPolicyPct(claim.repairCalcPolicyPct || '');
      setThirdPct(claim.repairCalcThirdPct || '');
      setShowInQuote(claim.showRepairInQuote === 'true');
      setQuoteRoute((claim.quoteRepairRoute as 'policy' | 'third_party') || 'policy');
      setSelectedFile(null);
      setPlateWarning('');
      setOcrError('');
      setOcrSuccess('');
      setShowDocPicker(false);

      const initialImage = claim.leviYitzhakImageUrl || claim.leviYitzhakDocId || '';
      setUploadedFileId(initialImage);

      if (initialImage.startsWith('http') || initialImage.startsWith('blob:') || initialImage.startsWith('data:')) {
        setPreviewUrl(initialImage);
      } else if (initialImage) {
        setPreviewUrl('');
        api.invokeDocs('signed_url', { claim_id: claim.id, file_id: initialImage })
          .then((res: any) => {
            if (res?.signed_url || res?.url) setPreviewUrl(res.signed_url || res.url);
          })
          .catch(() => {});
      } else {
        setPreviewUrl('');
      }

      // Load existing claim documents for Option 3 (Pick from gallery)
      api.invokeDocs('list_docs', { claim_id: claim.id })
        .then((res: any) => {
          if (res?.files && Array.isArray(res.files)) {
            setClaimDocs(res.files);
          }
        })
        .catch(() => {});
    }
  }, [open, claim]);

  // Dynamic calculations for repair amounts
  const policyAmount = calculateRepairAmount(weightedPrice, policyPct);
  const thirdAmount = calculateRepairAmount(weightedPrice, thirdPct);

  // Open Levi Itzhak Android App directly to the search-by-plate screen
  const handleOpenApp = () => {
    const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent || '');
    const cleanPlate = (claim.plate || '').replace(/[^0-9]/g, '');

    // Auto-copy vehicle plate to clipboard for 1-tap pasting
    if (cleanPlate && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(cleanPlate).catch(() => {});
      toast?.(`מספר רכב ${claim.plate} הועתק ללוח. פותח את אפליקציית לוי יצחק...`, 'info');
    }

    if (isAndroid) {
      const intentUri =
        'intent://search-by-plate#Intent;scheme=leviios;package=com.levinew.app;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.levinew.app;end';
      window.location.href = intentUri;
    } else {
      window.open('https://play.google.com/store/apps/details?id=com.levinew.app', '_blank', 'noopener,noreferrer');
    }
  };

  // Run AI extraction on a file stored in Supabase Storage
  const runExtraction = async (fileId: string) => {
    setIsProcessing(true);
    setOcrError('');
    setOcrSuccess('');
    setPlateWarning('');

    try {
      // 1. Try server-side AI extraction (Gemini Vision with Levi Itzhak prompt)
      const res = await api.invokeDocs('extract_levi_itzhak', {
        claim_id: claim.id,
        file_id: fileId,
      });

      let extracted: LeviYitzhakExtractedData = {};

      if (res?.success && res.data && Object.keys(res.data).length > 0) {
        extracted = res.data;
      }

      // 2. If any fields are still missing, try secondary regex parsing on rawText
      if (res?.rawText) {
        const regexParsed = parseLeviYitzhakText(res.rawText);
        extracted = {
          plate: extracted.plate || regexParsed.plate,
          carMake: extracted.carMake || regexParsed.carMake,
          carModel: extracted.carModel || regexParsed.carModel,
          carYear: extracted.carYear || regexParsed.carYear,
          ramatGimur: extracted.ramatGimur || regexParsed.ramatGimur,
          roadDate: extracted.roadDate || regexParsed.roadDate,
          ownershipType: extracted.ownershipType || regexParsed.ownershipType,
          mileage: extracted.mileage || regexParsed.mileage,
          prevOwners: extracted.prevOwners || regexParsed.prevOwners,
          basicPrice: extracted.basicPrice || regexParsed.basicPrice,
          additionsDeductions: extracted.additionsDeductions || regexParsed.additionsDeductions,
          weightedPrice: extracted.weightedPrice || regexParsed.weightedPrice,
          valuationDate: extracted.valuationDate || regexParsed.valuationDate,
          valuationSource: extracted.valuationSource || regexParsed.valuationSource || 'מחירון לוי יצחק',
        };
      }

      const hasValues = Boolean(
        extracted.basicPrice ||
        extracted.weightedPrice ||
        extracted.plate ||
        extracted.carModel ||
        extracted.mileage
      );

      if (hasValues) {
        if (extracted.plate) {
          setPlate(extracted.plate);
          const check = checkPlateMatch(extracted.plate, claim.plate);
          if (!check.match && check.warning) {
            setPlateWarning(check.warning);
          }
        }
        if (extracted.carMake) setCarMake(extracted.carMake);
        if (extracted.carModel) setCarModel(extracted.carModel);
        if (extracted.carYear) setCarYear(extracted.carYear);
        if (extracted.ramatGimur) setRamatGimur(extracted.ramatGimur);
        if (extracted.roadDate) setRoadDate(extracted.roadDate);
        if (extracted.ownershipType) setOwnershipType(extracted.ownershipType);
        if (extracted.mileage) setMileage(extracted.mileage);
        if (extracted.prevOwners) setPrevOwners(extracted.prevOwners);
        if (extracted.basicPrice) setBasicPrice(extracted.basicPrice);
        if (extracted.weightedPrice) setWeightedPrice(extracted.weightedPrice);
        if (extracted.valuationDate) setValuationDate(extracted.valuationDate);
        if (extracted.valuationSource) setValuationSource(extracted.valuationSource);
        if (extracted.additionsDeductions) setAdditionsDeductions(extracted.additionsDeductions);

        setOcrSuccess('נתוני המחירון והרכב חולצו בהצלחה באמצעות AI! אנא בדוק, תקן במידת הצורך, ואשר לשמירה.');
        toast?.('נתוני המחירון חולצו בהצלחה באמצעות AI', 'ok');
      } else {
        setOcrError('הקובץ נשמר בהצלחה בתיק התביעה, אך לא זוהו בו נתוני מחירון ברורים. ניתן להזין את הנתונים ידנית או לנסות חילוץ חוזר.');
        toast?.('הקובץ נשמר. ניתן להזין את הנתונים ידנית.', 'info');
      }
    } catch (err: any) {
      console.warn('[LeviYitzhak] AI extraction error:', err);
      const msg = err?.message || 'שגיאת תקשורת עם מנוע ה-AI';
      setOcrError(`חילוץ ה-AI נתקל בשגיאה (${msg}). התמונה נשמרה בתיק — ניתן להזין את הנתונים ידנית או ללחוץ על "נסה שוב".`);
      toast?.('הקובץ נשמר בתיק. ניתן להזין את הנתונים ידנית.', 'info');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle newly selected or dropped local file
  const handleProcessFile = async (file: File) => {
    setSelectedFile(file);
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    setIsProcessing(true);
    setPlateWarning('');
    setOcrError('');
    setOcrSuccess('');

    try {
      // 1. Immediately upload file securely to Supabase Storage with staff_type = 'levi_itzhak'
      const uploadRes = await api.staffUpload(claim.id, '', file, {
        staff_type: 'levi_itzhak',
        staff_title: 'מחירון לוי יצחק',
      });

      if (!uploadRes.success || !uploadRes.file_id) {
        throw new Error(uploadRes.error || 'העלאת הקובץ לאחסון נכשלה');
      }

      const fileId = uploadRes.file_id;
      setUploadedFileId(fileId);

      toast?.('הצילום נשמר באחסון המאובטח של התיק. מפענח באמצעות AI...', 'info');

      // 2. Trigger AI extraction on the stored file
      await runExtraction(fileId);
    } catch (err: any) {
      console.error('[LeviYitzhak] Upload/Process error:', err);
      setIsProcessing(false);
      setOcrError(`שגיאה בשמירת הקובץ באחסון: ${err?.message || err}. ניתן להזין את הנתונים ידנית.`);
      toast?.('שגיאה בשמירת התמונה באחסון', 'err');
    }
  };

  // Handle picking an existing file already in the claim gallery
  const handlePickExistingDoc = async (docId: string) => {
    setShowDocPicker(false);
    setIsProcessing(true);
    setUploadedFileId(docId);
    setSelectedFile(null);
    setPlateWarning('');
    setOcrError('');
    setOcrSuccess('');

    try {
      const suRes = await api.invokeDocs('signed_url', { claim_id: claim.id, file_id: docId });
      if (suRes?.signed_url || suRes?.url) {
        setPreviewUrl(suRes.signed_url || suRes.url);
      }

      toast?.('המסמך שויך למחירון לוי יצחק. מפענח באמצעות AI...', 'info');
      await runExtraction(docId);
    } catch (err: any) {
      setIsProcessing(false);
      setOcrError(`שגיאה בטעינת המסמך: ${err?.message || err}`);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      void handleProcessFile(files[0]);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const finalFileId = uploadedFileId || claim.leviYitzhakImageUrl || '';

      // Build updated claim record with all valuation & repair calculator fields
      const updatedData: Record<string, string> = {
        ...claim,
        plate: plate || claim.plate || '',
        carMake: carMake || claim.carMake || '',
        carModel: carModel || claim.carModel || '',
        carYear: carYear || claim.carYear || '',
        ramatGimur: ramatGimur || '',
        roadDate: roadDate || '',
        ownershipType: ownershipType || '',
        mileage: mileage || '',
        prevOwners: prevOwners || '',
        basicPrice: basicPrice || '',
        weightedPrice: weightedPrice || '',
        valuationDate: valuationDate || '',
        valuationSource: valuationSource || 'מחירון לוי יצחק',
        leviYitzhakAdditionsDeductions: additionsDeductions || '',
        leviYitzhakImageUrl: finalFileId,
        repairCalcPolicyPct: policyPct || '',
        repairCalcPolicyAmount: policyAmount ? String(policyAmount) : '',
        repairCalcThirdPct: thirdPct || '',
        repairCalcThirdAmount: thirdAmount ? String(thirdAmount) : '',
        showRepairInQuote: showInQuote ? 'true' : 'false',
        quoteRepairRoute: quoteRoute,
      };

      const res = await api.saveClaim(updatedData);
      if (!res.success) {
        throw new Error(res.error || 'שגיאה בשמירת נתוני מחירון לוי יצחק');
      }

      await api.logHistory(
        claim.id,
        'עודכן מחירון לוי יצחק ושווי משוקלל',
        `שווי משוקלל: ₪${parseCleanNumber(weightedPrice).toLocaleString()} · תיקון פוליסה: ${policyPct || '0'}% (₪${policyAmount.toLocaleString()}) · צד ג׳: ${thirdPct || '0'}% (₪${thirdAmount.toLocaleString()})`,
        'update'
      );

      toast?.('נתוני מחירון לוי יצחק והשווי המשוקלל נשמרו בהצלחה בתיק', 'ok');
      onSaved?.(updatedData as unknown as ClaimRecord);
      onClose();
    } catch (err: any) {
      console.error('[LeviYitzhak] Save error:', err);
      toast?.(err?.message || 'שגיאה בשמירת המחירון', 'err');
    } finally {
      setIsSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="levi-modal-title"
      dir="rtl"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        backdropFilter: 'blur(3px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) onClose();
      }}
    >
      <div
        data-testid="levi-yitzhak-modal"
        style={{
          backgroundColor: 'var(--bg, #ffffff)',
          color: 'var(--t1, #1e293b)',
          borderRadius: 14,
          boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
          maxWidth: 780,
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid var(--bdr, #e2e8f0)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--bdr, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg2, #f8fafc)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: '#2563eb15',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
              }}
            >
              📊
            </div>
            <div>
              <h2 id="levi-modal-title" style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
                מחירון לוי יצחק ושווי רכב משוקלל
              </h2>
              <div style={{ fontSize: 12, color: 'var(--t3, #64748b)', marginTop: 2 }}>
                תביעה {claim.claimNum || claim.id} · רכב {claim.plate || 'ללא לוחית'}
                {[claim.carMake, claim.carModel].filter(Boolean).length > 0 &&
                  ` (${[claim.carMake, claim.carModel].filter(Boolean).join(' ')})`}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Open in Levi Itzhak Android App */}
            <button
              type="button"
              onClick={handleOpenApp}
              className="btn btn-p btn-sm"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontWeight: 700,
                fontSize: 12,
              }}
              data-testid="btn-open-levi-app-header"
              title="פתח באפליקציית לוי יצחק המותקנת בטלפון"
            >
              <span>📱</span>
              <span>פתח באפליקציה</span>
            </button>

            {/* Open Official Levi Itzhak Website */}
            <a
              href="https://www.levi-itzhak.co.il/"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-g btn-sm"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: 12,
              }}
              data-testid="btn-open-levi-external"
            >
              <span>🌐</span>
              <span>אתר המחירון</span>
            </a>

            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              style={{
                background: 'none',
                border: 'none',
                fontSize: 20,
                cursor: 'pointer',
                color: 'var(--t3, #64748b)',
                padding: 4,
              }}
              aria-label="סגור"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div style={{ padding: 20, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Android App Quick Action & Guidance Banner */}
          <div
            style={{
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: 10,
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
            data-testid="levi-app-workflow-banner"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13.5, color: '#166534' }}>
                <span style={{ fontSize: 18 }}>📱</span>
                <span>פתיחה ישירה באפליקציית לוי יצחק (אנדרואיד)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-p btn-sm"
                  onClick={handleOpenApp}
                  style={{ fontWeight: 700, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  data-testid="btn-open-levi-app"
                >
                  <span>📱</span>
                  <span>פתח באפליקציה</span>
                </button>
                <a
                  href="https://play.google.com/store/apps/details?id=com.levinew.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-g btn-sm"
                  style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                  data-testid="btn-open-levi-playstore"
                >
                  <span>Google Play</span>
                </a>
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: '#15803d', lineHeight: 1.5 }}>
              💡 <strong>איך זה עובד:</strong> לחיצה על ״פתח באפליקציה״ תפתח ישירות את אפליקציית לוי יצחק המותקנת בטלפון ומספר הרכב <strong>{claim.plate || 'התביעה'}</strong> מועתק אוטומטית ללוח להדבקה קלה ← בצע צילום מסך של המחירון ← העלה אותו כאן לחילוץ נתונים אוטומטי ב-AI ושמירה מאובטחת!
            </div>
          </div>

          {/* Plate Mismatch Alert */}
          {plateWarning && (
            <div
              style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #f87171',
                color: '#b91c1c',
                padding: '10px 14px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
              data-testid="levi-plate-warning"
            >
              <span>⚠️</span>
              <span>{plateWarning}</span>
            </div>
          )}

          {/* AI Success Banner */}
          {ocrSuccess && (
            <div
              style={{
                backgroundColor: '#f0fdf4',
                border: '1px solid #86efac',
                color: '#166534',
                padding: '10px 14px',
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
              data-testid="levi-ocr-success-banner"
            >
              <span>✓</span>
              <span>{ocrSuccess}</span>
            </div>
          )}

          {/* AI Error / Notice Banner */}
          {ocrError && (
            <div
              style={{
                backgroundColor: '#fffbeb',
                border: '1px solid #fde68a',
                color: '#92400e',
                padding: '10px 14px',
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 8,
              }}
              data-testid="levi-ocr-error-banner"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>ℹ️</span>
                <span>{ocrError}</span>
              </div>
              {uploadedFileId && (
                <button
                  type="button"
                  className="btn btn-p btn-sm"
                  onClick={() => void runExtraction(uploadedFileId)}
                  disabled={isProcessing}
                  style={{ fontSize: 11.5, padding: '2px 8px' }}
                  data-testid="btn-retry-levi-ocr"
                >
                  🔄 נסה חילוץ מחדש
                </button>
              )}
            </div>
          )}

          {/* Section 1: Upload / Image Input Area (3 Options) */}
          <div
            style={{
              backgroundColor: 'var(--bg2, #f8fafc)',
              border: '1px solid var(--bdr, #e2e8f0)',
              borderRadius: 10,
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>צילום / מסמך מחירון לוי יצחק</div>
              <div style={{ fontSize: 11, color: 'var(--t3, #64748b)' }}>
                3 דרכים: גרירה ישירה · בחירת קובץ/מצלמה · שיוך ממסמכי התיק
              </div>
            </div>

            {/* Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              style={{
                border: `2px dashed ${isDragging ? 'var(--p1, #2563eb)' : 'var(--bdr, #cbd5e1)'}`,
                backgroundColor: isDragging ? 'rgba(37, 99, 235, 0.05)' : 'var(--bg, #ffffff)',
                borderRadius: 8,
                padding: '16px 12px',
                textAlign: 'center',
                transition: 'all 0.15s ease-in-out',
                position: 'relative',
              }}
              data-testid="levi-dropzone"
            >
              {previewUrl ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, textAlign: 'right', flexWrap: 'wrap' }}>
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="לחץ לצפייה במסמך המלא בלשונית חדשה"
                    style={{ textDecoration: 'none', cursor: 'pointer', display: 'flex' }}
                    data-testid="levi-preview-link"
                  >
                    {/\.pdf$/i.test(selectedFile?.name || previewUrl) ? (
                      <div
                        style={{
                          width: 60,
                          height: 60,
                          borderRadius: 6,
                          background: '#fee2e2',
                          color: '#dc2626',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 22,
                          fontWeight: 900,
                        }}
                      >
                        PDF
                      </div>
                    ) : (
                      <img
                        src={previewUrl}
                        alt="מחירון לוי יצחק"
                        style={{
                          width: 68,
                          height: 68,
                          objectFit: 'cover',
                          borderRadius: 6,
                          border: '1px solid var(--bdr, #e2e8f0)',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                        }}
                        data-testid="levi-preview-img"
                      />
                    )}
                  </a>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }} data-testid="levi-file-name-display">
                      {selectedFile ? selectedFile.name : (uploadedFileId ? `צילום שמור בתיק (${uploadedFileId})` : 'צילום מחירון משויך')}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--t3, #64748b)', marginTop: 2 }}>
                      {uploadedFileId ? '✓ מאובטח ב-Storage של דליה' : 'נטען באופן מקומי'}
                    </div>
                    {isProcessing && (
                      <div style={{ fontSize: 11, color: 'var(--p1, #2563eb)', fontWeight: 600, marginTop: 4 }}>
                        ⏳ מפענח נתונים מהמחירון באמצעות מנוע AI...
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {uploadedFileId && !isProcessing && (
                      <button
                        type="button"
                        className="btn btn-g btn-sm"
                        onClick={() => void runExtraction(uploadedFileId)}
                        data-testid="btn-reextract-levi"
                        title="הפעל מחדש את חילוץ הנתונים מהתמונה השמורה"
                      >
                        🔄 חלץ שוב
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-g btn-sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isProcessing || isSaving}
                      data-testid="btn-replace-levi-file"
                    >
                      החלף קובץ
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 28 }}>📂</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    גרור ושחרר צילום מחירון או מסמך לכאן
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--t3, #64748b)' }}>
                    או בחר באחת האפשרויות הבאות:
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <button
                      type="button"
                      className="btn btn-p btn-sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isProcessing || isSaving}
                      data-testid="btn-pick-levi-file"
                    >
                      📁 בחר תמונה / קובץ
                    </button>

                    <label
                      htmlFor={cameraInputId}
                      className="btn btn-g btn-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                    >
                      <span>📷</span>
                      <span>צלם במצלמה</span>
                    </label>

                    {claimDocs.length > 0 && (
                      <button
                        type="button"
                        className="btn btn-g btn-sm"
                        onClick={() => setShowDocPicker((v) => !v)}
                        disabled={isProcessing || isSaving}
                        data-testid="btn-pick-from-claim-docs"
                      >
                        📂 בחר ממסמכי התיק ({claimDocs.length})
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Document Picker Dropdown / Panel for Option 3 */}
              {showDocPicker && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 10,
                    background: 'var(--bg2, #f8fafc)',
                    border: '1px solid var(--bdr, #cbd5e1)',
                    borderRadius: 8,
                    textAlign: 'right',
                    maxHeight: 180,
                    overflowY: 'auto',
                  }}
                  data-testid="levi-existing-docs-list"
                >
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                    בחר מסמך או תמונה קיימת מכרטיס התביעה:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {claimDocs.map((doc) => (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => void handlePickExistingDoc(doc.id)}
                        className="btn btn-g btn-sm"
                        style={{ justifyContent: 'space-between', display: 'flex', width: '100%', fontSize: 11.5 }}
                        data-testid={`claim-doc-item-${doc.id}`}
                      >
                        <span style={{ fontWeight: 600 }}>{doc.original_name}</span>
                        <span style={{ color: 'var(--t3)' }}>שייך למחירון</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Hidden file inputs */}
              <input
                ref={fileInputRef}
                id={fileInputId}
                data-testid="levi-file-input"
                type="file"
                accept="image/*,application/pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const files = e.target.files;
                  if (files && files[0]) void handleProcessFile(files[0]);
                  e.target.value = '';
                }}
              />
              <input
                id={cameraInputId}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const files = e.target.files;
                  if (files && files[0]) void handleProcessFile(files[0]);
                  e.target.value = '';
                }}
              />
            </div>
          </div>

          {/* Section 2: Decoded Vehicle & Valuation Details (Editable) */}
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
              נתוני הרכב ושקלול המחירון (ניתן לבדוק ולתקן לפי הצורך)
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                gap: 12,
              }}
            >
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t3, #64748b)', marginBottom: 4 }}>
                  מספר רישוי
                </label>
                <input
                  type="text"
                  className="fi"
                  value={plate}
                  onChange={(e) => setPlate(e.target.value)}
                  placeholder="למשל 12-345-67"
                  data-testid="levi-in-plate"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t3, #64748b)', marginBottom: 4 }}>
                  יצרן
                </label>
                <input
                  type="text"
                  className="fi"
                  value={carMake}
                  onChange={(e) => setCarMake(e.target.value)}
                  placeholder="יונדאי / טויוטה"
                  data-testid="levi-in-make"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t3, #64748b)', marginBottom: 4 }}>
                  דגם
                </label>
                <input
                  type="text"
                  className="fi"
                  value={carModel}
                  onChange={(e) => setCarModel(e.target.value)}
                  placeholder="איוניק / קורולה"
                  data-testid="levi-in-model"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t3, #64748b)', marginBottom: 4 }}>
                  שנת ייצור
                </label>
                <input
                  type="text"
                  className="fi"
                  value={carYear}
                  onChange={(e) => setCarYear(e.target.value)}
                  placeholder="2021"
                  data-testid="levi-in-year"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t3, #64748b)', marginBottom: 4 }}>
                  רמת גימור
                </label>
                <input
                  type="text"
                  className="fi"
                  value={ramatGimur}
                  onChange={(e) => setRamatGimur(e.target.value)}
                  placeholder="Premium / GLX"
                  data-testid="levi-in-trim"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t3, #64748b)', marginBottom: 4 }}>
                  מועד עלייה לכביש
                </label>
                <input
                  type="text"
                  className="fi"
                  value={roadDate}
                  onChange={(e) => setRoadDate(e.target.value)}
                  placeholder="חודש/שנה (05/2021)"
                  data-testid="levi-in-road-date"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t3, #64748b)', marginBottom: 4 }}>
                  סוג בעלות (מקוריות)
                </label>
                <select
                  className="fi fse"
                  value={ownershipType}
                  onChange={(e) => setOwnershipType(e.target.value)}
                  data-testid="levi-in-ownership"
                >
                  <option value="פרטית">פרטית</option>
                  <option value="ליסינג">ליסינג</option>
                  <option value="השכרה">השכרה</option>
                  <option value="חברה">חברה</option>
                  <option value="ממשלתי">ממשלתי</option>
                  <option value="אחר">אחר</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t3, #64748b)', marginBottom: 4 }}>
                  קילומטראז׳
                </label>
                <input
                  type="text"
                  className="fi"
                  value={mileage}
                  onChange={(e) => setMileage(e.target.value)}
                  placeholder="45000"
                  data-testid="levi-in-km"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t3, #64748b)', marginBottom: 4 }}>
                  בעלויות קודמות (יד)
                </label>
                <input
                  type="text"
                  className="fi"
                  value={prevOwners}
                  onChange={(e) => setPrevOwners(e.target.value)}
                  placeholder="1 / 01"
                  data-testid="levi-in-owners"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t3, #64748b)', marginBottom: 4 }}>
                  מחיר מחירון בסיסי (₪)
                </label>
                <input
                  type="text"
                  className="fi"
                  value={basicPrice}
                  onChange={(e) => setBasicPrice(e.target.value)}
                  placeholder="למשל 95,000"
                  data-testid="levi-in-basic-price"
                />
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t3, #64748b)', marginBottom: 4 }}>
                  תוספות או הפחתות (אחוזים וסכומים)
                </label>
                <input
                  type="text"
                  className="fi"
                  value={additionsDeductions}
                  onChange={(e) => setAdditionsDeductions(e.target.value)}
                  placeholder="למשל: קילומטרז׳ -2.5% · עלייה לכביש +1.5%"
                  data-testid="levi-in-additions"
                />
              </div>

              <div style={{ background: '#2563eb0d', padding: 10, borderRadius: 8, border: '1px solid #2563eb33' }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: 'var(--p1, #2563eb)', marginBottom: 4 }}>
                  ★ שווי רכב משוקלל סופי (₪)
                </label>
                <input
                  type="text"
                  className="fi"
                  style={{ fontWeight: 800, fontSize: 14, color: 'var(--p1, #2563eb)' }}
                  value={weightedPrice}
                  onChange={(e) => setWeightedPrice(e.target.value)}
                  placeholder="למשל 92,500"
                  data-testid="levi-in-weighted-price"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t3, #64748b)', marginBottom: 4 }}>
                  תאריך בדיקה / הפקה
                </label>
                <input
                  type="text"
                  className="fi"
                  value={valuationDate}
                  onChange={(e) => setValuationDate(e.target.value)}
                  placeholder="DD/MM/YYYY"
                  data-testid="levi-in-date"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t3, #64748b)', marginBottom: 4 }}>
                  מקור המידע
                </label>
                <input
                  type="text"
                  className="fi"
                  value={valuationSource}
                  onChange={(e) => setValuationSource(e.target.value)}
                  placeholder="מחירון לוי יצחק"
                  data-testid="levi-in-source"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Repair Percentage Calculator */}
          <div
            style={{
              backgroundColor: 'var(--bg2, #f8fafc)',
              border: '1px solid var(--bdr, #e2e8f0)',
              borderRadius: 10,
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  חישוב סכום תיקון לפי אחוז משווי הרכב
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--t3, #64748b)', marginTop: 2 }}>
                  חישוב דינמי תוך כדי הקלדה לפי שווי משוקלל (₪
                  {parseCleanNumber(weightedPrice).toLocaleString()})
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: 14 }}>
              {/* Policy Route */}
              <div
                style={{
                  background: 'var(--bg, #ffffff)',
                  border: '1px solid var(--bdr, #e2e8f0)',
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#0369a1' }}>
                  מסלול תביעת פוליסה
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ flex: '1 1 120px', minWidth: 100 }}>
                    <label style={{ display: 'block', fontSize: 10.5, color: 'var(--t3, #64748b)', marginBottom: 2 }}>
                      אחוז תיקון חופשי (%)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      max="100"
                      className="fi"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      value={policyPct}
                      onChange={(e) => setPolicyPct(e.target.value)}
                      placeholder="למשל 12.5"
                      data-testid="in-repair-policy-pct"
                    />
                  </div>
                  <div style={{ textAlign: 'left', flex: '0 0 auto', minWidth: 90 }}>
                    <div style={{ fontSize: 10.5, color: 'var(--t3, #64748b)' }}>סכום מחושב</div>
                    <div
                      style={{ fontSize: 15, fontWeight: 800, color: policyAmount ? '#0369a1' : 'var(--t3, #64748b)' }}
                      data-testid="out-repair-policy-amount"
                    >
                      {policyAmount ? `₪${policyAmount.toLocaleString()}` : '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Third-Party Route */}
              <div
                style={{
                  background: 'var(--bg, #ffffff)',
                  border: '1px solid var(--bdr, #e2e8f0)',
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#7c3aed' }}>
                  מסלול תביעת צד ג׳
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ flex: '1 1 120px', minWidth: 100 }}>
                    <label style={{ display: 'block', fontSize: 10.5, color: 'var(--t3, #64748b)', marginBottom: 2 }}>
                      אחוז תיקון חופשי (%)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      max="100"
                      className="fi"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      value={thirdPct}
                      onChange={(e) => setThirdPct(e.target.value)}
                      placeholder="למשל 15"
                      data-testid="in-repair-third-pct"
                    />
                  </div>
                  <div style={{ textAlign: 'left', flex: '0 0 auto', minWidth: 90 }}>
                    <div style={{ fontSize: 10.5, color: 'var(--t3, #64748b)' }}>סכום מחושב</div>
                    <div
                      style={{ fontSize: 15, fontWeight: 800, color: thirdAmount ? '#7c3aed' : 'var(--t3, #64748b)' }}
                      data-testid="out-repair-third-amount"
                    >
                      {thirdAmount ? `₪${thirdAmount.toLocaleString()}` : '—'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Customer Quote Integration Toggle */}
          <div
            style={{
              backgroundColor: showInQuote ? '#ecfdf5' : 'var(--bg2, #f8fafc)',
              border: `1px solid ${showInQuote ? '#a7f3d0' : 'var(--bdr, #e2e8f0)'}`,
              borderRadius: 10,
              padding: 14,
              transition: 'all 0.15s ease-in-out',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: 13.5,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={showInQuote}
                    onChange={(e) => setShowInQuote(e.target.checked)}
                    style={{ width: 18, height: 18 }}
                    data-testid="toggle-show-in-quote"
                  />
                  <span>הצג את סכום התיקון המחושב בהצעת המחיר ללקוח</span>
                </label>
                <div style={{ fontSize: 11.5, color: 'var(--t3, #64748b)', marginTop: 4, marginRight: 28 }}>
                  ברירת מחדל: כבוי (כלי פנימי למחלקת תביעות). בהפעלה יוצג סכום התיקון המחושב עבור המסלול הנבחר בלבד.
                </div>
              </div>

              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: showInQuote ? '#10b981' : '#94a3b8',
                  color: '#ffffff',
                  whiteSpace: 'nowrap',
                }}
              >
                {showInQuote ? 'פעיל בהצעה' : 'כבוי (פנימי)'}
              </span>
            </div>

            {/* Route selector when enabled */}
            {showInQuote && (
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 10,
                  borderTop: '1px solid #a7f3d0',
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 12,
                  fontSize: 12.5,
                }}
              >
                <span style={{ fontWeight: 700 }}>בחר מסלול להצגה בהצעת המחיר:</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="quoteRoute"
                    value="policy"
                    checked={quoteRoute === 'policy'}
                    onChange={() => setQuoteRoute('policy')}
                    data-testid="radio-quote-policy"
                  />
                  <span>
                    מסלול פוליסה ({policyPct || '0'}% — ₪{policyAmount.toLocaleString()})
                  </span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="quoteRoute"
                    value="third_party"
                    checked={quoteRoute === 'third_party'}
                    onChange={() => setQuoteRoute('third_party')}
                    data-testid="radio-quote-third"
                  />
                  <span>
                    מסלול צד ג׳ ({thirdPct || '0'}% — ₪{thirdAmount.toLocaleString()})
                  </span>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--bdr, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg2, #f8fafc)',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--t3, #64748b)' }}>
            {weightedPrice ? `שווי משוקלל סופי: ₪${parseCleanNumber(weightedPrice).toLocaleString()}` : 'טרם הוזן שווי משוקלל'}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-g"
              onClick={onClose}
              disabled={isSaving}
            >
              ביטול
            </button>
            <button
              type="button"
              className="btn btn-p"
              onClick={() => void handleSave()}
              disabled={isSaving || isProcessing}
              style={{ fontWeight: 800, padding: '8px 20px' }}
              data-testid="btn-save-levi-yitzhak"
            >
              {isSaving ? 'שומר במחירון הרכב...' : '✓ אשר ושמור במחירון הרכב'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
