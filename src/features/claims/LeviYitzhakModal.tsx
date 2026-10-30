import React, { useEffect, useId, useRef, useState } from 'react';
import type { ClaimRecord, ClaimsApi } from './claimsService';
import { extractClaimDocumentText } from './claimDocumentRead';
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
  const [previewUrl, setPreviewUrl] = useState<string>(claim.leviYitzhakImageUrl || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [plateWarning, setPlateWarning] = useState<string>('');

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
      const initialImage = claim.leviYitzhakImageUrl || claim.leviYitzhakDocId || '';
      if (initialImage.startsWith('http') || initialImage.startsWith('blob:') || initialImage.startsWith('data:')) {
        setPreviewUrl(initialImage);
      } else if (initialImage) {
        setPreviewUrl('');
        api.invokeDocs('signed_url', { claim_id: claim.id, file_id: initialImage })
          .then((res: any) => {
            if (res?.url) setPreviewUrl(res.url);
          })
          .catch(() => {});
      } else {
        setPreviewUrl('');
      }
      setSelectedFile(null);
      setPlateWarning('');
    }
  }, [open, claim]);

  // Dynamic calculations for repair amounts
  const policyAmount = calculateRepairAmount(weightedPrice, policyPct);
  const thirdAmount = calculateRepairAmount(weightedPrice, thirdPct);

  // Open Levi Itzhak Android App directly to the search-by-plate screen
  // Uses official verified BROWSABLE scheme: leviios://search-by-plate (package: com.levinew.app)
  // Auto-copies clean vehicle plate to clipboard for 1-tap pasting
  const handleOpenApp = () => {
    const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent || '');
    const cleanPlate = (claim.plate || '').replace(/[^0-9]/g, '');

    // Auto-copy vehicle plate to clipboard for 1-tap pasting
    if (cleanPlate && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(cleanPlate).catch(() => {});
      toast?.(`מספר רכב ${claim.plate} הועתק ללוח. פותח את אפליקציית לוי יצחק...`, 'info');
    }

    if (isAndroid) {
      // Android Chrome Intent with verified BROWSABLE scheme 'leviios' targeting 'search-by-plate' screen
      // If app is installed: launches directly into search-by-plate screen without Play Store step
      // If app is not installed: falls back to Google Play Store
      const intentUri =
        'intent://search-by-plate#Intent;scheme=leviios;package=com.levinew.app;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.levinew.app;end';
      window.location.href = intentUri;
    } else {
      window.open('https://play.google.com/store/apps/details?id=com.levinew.app', '_blank', 'noopener,noreferrer');
    }
  };

  // Handle uploaded or dropped file
  const handleProcessFile = async (file: File) => {
    setSelectedFile(file);
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    setIsProcessing(true);
    setPlateWarning('');

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const extracted = await extractClaimDocumentText({
        bytes,
        mimeType: file.type,
        fileName: file.name,
      });

      if (extracted.text) {
        const parsed: LeviYitzhakExtractedData = parseLeviYitzhakText(extracted.text);

        // Check plate mismatch
        if (parsed.plate) {
          const check = checkPlateMatch(parsed.plate, claim.plate);
          if (!check.match && check.warning) {
            setPlateWarning(check.warning);
          }
        }

        // Autofill fields without destroying existing user inputs if unparsed
        if (parsed.plate && !plate) setPlate(parsed.plate);
        if (parsed.carMake && !carMake) setCarMake(parsed.carMake);
        if (parsed.carModel && !carModel) setCarModel(parsed.carModel);
        if (parsed.carYear && !carYear) setCarYear(parsed.carYear);
        if (parsed.ramatGimur && !ramatGimur) setRamatGimur(parsed.ramatGimur);
        if (parsed.roadDate && !roadDate) setRoadDate(parsed.roadDate);
        if (parsed.ownershipType) setOwnershipType(parsed.ownershipType);
        if (parsed.mileage && !mileage) setMileage(parsed.mileage);
        if (parsed.prevOwners && !prevOwners) setPrevOwners(parsed.prevOwners);
        if (parsed.basicPrice) setBasicPrice(parsed.basicPrice);
        if (parsed.weightedPrice) setWeightedPrice(parsed.weightedPrice);
        if (parsed.valuationDate) setValuationDate(parsed.valuationDate);
        if (parsed.valuationSource) setValuationSource(parsed.valuationSource);
        if (parsed.additionsDeductions) setAdditionsDeductions(parsed.additionsDeductions);

        toast?.('נתוני המחירון נקראו בהצלחה מהקובץ', 'ok');
      } else {
        toast?.('הקובץ נטען. לא זוהה טקסט אוטומטי — ניתן להזין את הנתונים ידנית.', 'info');
      }
    } catch (err: any) {
      console.warn('[LeviYitzhak] Document read failed, fallback to manual:', err);
      toast?.('הקובץ נטען. ניתן להמשיך בהזנה ידנית.', 'info');
    } finally {
      setIsProcessing(false);
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
      let finalImageUrl = claim.leviYitzhakImageUrl || '';

      // Upload file to claims storage if newly selected
      if (selectedFile) {
        const uploadRes = await api.staffUpload(claim.id, '', selectedFile, {
          staff_type: 'levi_itzhak',
          staff_title: 'מחירון לוי יצחק',
        });
        if (uploadRes.success && uploadRes.file_id) {
          finalImageUrl = uploadRes.file_id;
        }
      }

      // Build updated claim record
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
        leviYitzhakImageUrl: finalImageUrl,
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

      toast?.('נתוני מחירון לוי יצחק ושווי משוקלל נשמרו בהצלחה', 'ok');
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
                <span>פתיחה באפליקציית לוי יצחק (אנדרואיד)</span>
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
                  <span>פתח באפליקציית לוי יצחק</span>
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
              💡 <strong>איך זה עובד בטלפון:</strong> לחץ על ״פתח באפליקציית לוי יצחק״ ← האפליקציה נפתחת ישירות במסך ״הקלד מספר רישוי״ ומספר הרכב <strong>{claim.plate || 'התביעה'}</strong> מועתק אוטומטית ללוח להדבקה מהירה ← בצע צילום מסך של המחירון בחינם ← העלה או שתף אותו כאן לדליה לחילוץ אוטומטי של המחירון והשקלול!
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

          {/* Section 1: Upload / Image Input Area (3 Options) */}
          <div
            style={{
              backgroundColor: 'var(--bg2, #f8fafc)',
              border: '1px solid var(--bdr, #e2e8f0)',
              borderRadius: 10,
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>צילום / מסמך מחירון לוי יצחק</div>
              <div style={{ fontSize: 11, color: 'var(--t3, #64748b)' }}>
                3 דרכים: שיתוף לדליה · גרירה ישירה · בחירת קובץ
              </div>
            </div>

            {/* Option A info callout */}
            <div
              style={{
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: 11.5,
                color: '#1e40af',
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>📲</span>
              <span>
                <strong>אפשרות א׳ (שיתוף לדליה):</strong> ניתן לשלוח צילום מ-WhatsApp/גלריה דרך ״שתף לדליה״ ולבחור יעד ״מחירון לוי יצחק״.
              </span>
            </div>

            {/* Dropzone (Option B & C) */}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, textAlign: 'right' }}>
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="לחץ לצפייה במסמך המלא בלשונית חדשה"
                    style={{ textDecoration: 'none', cursor: 'pointer', display: 'flex' }}
                  >
                    {/\.pdf$/i.test(selectedFile?.name || previewUrl) ? (
                      <div
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: 6,
                          background: '#fee2e2',
                          color: '#dc2626',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 24,
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
                          width: 64,
                          height: 64,
                          objectFit: 'cover',
                          borderRadius: 6,
                          border: '1px solid var(--bdr, #e2e8f0)',
                        }}
                      />
                    )}
                  </a>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, truncate: true }}>
                      {selectedFile ? selectedFile.name : 'צילום מחירון משויך לתיק'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--t3, #64748b)', marginTop: 2 }}>
                      {selectedFile ? `${(selectedFile.size / 1024).toFixed(0)} KB · קובץ חדש` : 'שמור במסמכי התביעה'}
                    </div>
                    {isProcessing && (
                      <div style={{ fontSize: 11, color: 'var(--p1, #2563eb)', fontWeight: 600, marginTop: 4 }}>
                        ⏳ מפענח נתונים מהמחירון באמצעות AI...
                      </div>
                    )}
                  </div>
                  <div>
                    <button
                      type="button"
                      className="btn btn-g btn-sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isProcessing || isSaving}
                    >
                      החלף קובץ
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 28 }}>📂</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    גרור ושחרר תמונה או מסמך PDF לכאן
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--t3, #64748b)' }}>או בחר קובץ מהמכשיר</div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button
                      type="button"
                      className="btn btn-p btn-sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isProcessing || isSaving}
                      data-testid="btn-pick-levi-file"
                    >
                      📁 בחר תמונה או קובץ
                    </button>

                    <label
                      htmlFor={cameraInputId}
                      className="btn btn-g btn-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                    >
                      <span>📷</span>
                      <span>צלם במצלמה</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Hidden file inputs */}
              <input
                ref={fileInputRef}
                id={fileInputId}
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
              נתוני הרכב ושקלול המחירון
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
                  תאריך הפקה
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 10.5, color: 'var(--t3, #64748b)', marginBottom: 2 }}>
                      אחוז תיקון חופשי (%)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      max="100"
                      className="fi"
                      value={policyPct}
                      onChange={(e) => setPolicyPct(e.target.value)}
                      placeholder="למשל 12.5"
                      data-testid="in-repair-policy-pct"
                    />
                  </div>
                  <div style={{ textAlign: 'left', minWidth: 100 }}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 10.5, color: 'var(--t3, #64748b)', marginBottom: 2 }}>
                      אחוז תיקון חופשי (%)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      max="100"
                      className="fi"
                      value={thirdPct}
                      onChange={(e) => setThirdPct(e.target.value)}
                      placeholder="למשל 15"
                      data-testid="in-repair-third-pct"
                    />
                  </div>
                  <div style={{ textAlign: 'left', minWidth: 100 }}>
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
                  gap: 20,
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
