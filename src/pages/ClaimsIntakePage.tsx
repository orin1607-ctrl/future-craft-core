import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ClaimAccidentForm from '@/features/claims/ClaimAccidentForm';
import { CLAIM_KINDS } from '@/features/claims/claimsConstants';
import { EMPTY_INTAKE, customerSteps, type IntakeDraft } from '@/features/claims/claimIntakeModel';
import { buildSignedOpeningFormPdf, fileToBase64 } from '@/features/claims/signedClaimPdf';
import '@/features/claims/claims-intake.css';

const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claims-intake`;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const ERROR_MESSAGES_HE: Record<string, string> = {
  kind_required: 'נא לבחור את סוג התביעה (הפעלת פוליסה או תביעת צד ג׳)',
  event_date_required: 'נא להזין את תאריך התאונה',
  client_name_required: 'נא להזין את שם המבוטח',
  plate_required: 'נא להזין את מספר הרישוי של הרכב',
  declaration_required: 'נא לאשר את הצהרת המבוטח',
  signature_required: 'נא לחתום בתיבת החתימה',
  email_invalid: 'כתובת הדואר האלקטרוני אינה תקינה',
  already_used: 'הדיווח כבר נשלח',
  expired: 'הקישור פג תוקף',
  revoked: 'הקישור בוטל ואינו פעיל',
};

export default function ClaimsIntakePage() {
  const [params] = useSearchParams();
  const token = params.get('t') || '';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [uploadUrl, setUploadUrl] = useState('');
  const [claimId, setClaimId] = useState('');
  const [draft, setDraft] = useState<IntakeDraft>({ ...EMPTY_INTAKE });
  const [step, setStep] = useState(0);
  const [sig, setSig] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const saveTimer = useRef<number | null>(null);
  const submitting = useRef(false);

  const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    const res = await fetch(FN, { method: 'POST', headers, body: JSON.stringify({ action, token, ...extra }) });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  };

  useEffect(() => {
    document.title = 'הודעה על תאונת רכב';
    const boot = async () => {
      if (!token) { setError('קישור לא תקין'); setLoading(false); return; }
      const cached = sessionStorage.getItem(`intake-draft-${token}`);
      const r = await call('public_get');
      if (!r.json?.success) {
        setError(r.json?.error === 'expired' ? 'הקישור פג תוקף' : r.json?.error === 'already_used' || r.json?.error === 'revoked' ? 'הקישור אינו פעיל' : 'קישור לא תקין');
        setLoading(false);
        return;
      }
      if (r.json.claimId) setClaimId(String(r.json.claimId));
      if (r.json.submitted) {
        setDone(true);
        if (r.json.upload_url) setUploadUrl(String(r.json.upload_url));
        setLoading(false);
        return;
      }
      const serverDraft = (r.json.draft && typeof r.json.draft === 'object') ? r.json.draft as IntakeDraft : {};
      const local = cached ? JSON.parse(cached) as IntakeDraft : {};
      const merged: IntakeDraft = { ...EMPTY_INTAKE };
      Object.entries(serverDraft).forEach(([k, v]) => {
        if (typeof v === 'string' && v.trim() !== '') merged[k] = v;
      });
      Object.entries(local).forEach(([k, v]) => {
        if (typeof v === 'string' && v.trim() !== '') merged[k] = v;
      });
      if (!merged.claimKind || merged.claimKind === 'תביעה במסגרת פוליסת הלקוח') {
        merged.claimKind = CLAIM_KINDS[0];
      }
      setDraft(merged);
      setLoading(false);
    };
    void boot();
  }, [token]);

  const steps = useMemo(() => customerSteps(draft), [draft]);
  const stepKey = steps[Math.min(step, steps.length - 1)]?.key || 'client';

  const persist = (next: IntakeDraft) => {
    const normalized: IntakeDraft = {
      ...next,
      claimKind: (!next.claimKind || next.claimKind === 'תביעה במסגרת פוליסת הלקוח') ? CLAIM_KINDS[0] : next.claimKind,
    };
    setDraft(normalized);
    if (msg) setMsg('');
    sessionStorage.setItem(`intake-draft-${token}`, JSON.stringify(normalized));
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void call('public_save_draft', { draft: normalized });
    }, 700);
  };

  const validateStep = (key: string): string => {
    if (key === 'client') {
      if (!String(draft.claimKind || '').trim()) return ERROR_MESSAGES_HE.kind_required;
      if (!String(draft.clientName || '').trim()) return ERROR_MESSAGES_HE.client_name_required;
      if (!String(draft.phoneMobile || draft.clientPhone || '').trim()) return 'נא להזין מספר טלפון נייד';
      if (!String(draft.plate || '').trim()) return ERROR_MESSAGES_HE.plate_required;
    }
    if (key === 'event') {
      if (!String(draft.eventDate || '').trim()) return ERROR_MESSAGES_HE.event_date_required;
    }
    if (key === 'sign') {
      if (draft.declarationAck !== 'true') return ERROR_MESSAGES_HE.declaration_required;
      if (!sig) return ERROR_MESSAGES_HE.signature_required;
    }
    return '';
  };

  const handleNextStep = () => {
    const stepErr = validateStep(stepKey);
    if (stepErr) {
      setMsg(stepErr);
      return;
    }
    setMsg('');
    setStep((s) => Math.min(steps.length - 1, s + 1));
  };

  const submit = async () => {
    if (submitting.current || busy) return;
    const normalizedDraft: IntakeDraft = {
      ...draft,
      claimKind: (!draft.claimKind || draft.claimKind === 'תביעה במסגרת פוליסת הלקוח') ? CLAIM_KINDS[0] : draft.claimKind,
    };
    if (!String(normalizedDraft.clientName || '').trim()) { setMsg(ERROR_MESSAGES_HE.client_name_required); return; }
    if (!String(normalizedDraft.plate || '').trim()) { setMsg(ERROR_MESSAGES_HE.plate_required); return; }
    if (!String(normalizedDraft.eventDate || '').trim()) { setMsg(ERROR_MESSAGES_HE.event_date_required); return; }
    if (normalizedDraft.declarationAck !== 'true' || !sig) { setMsg('יש לאשר את ההצהרה ולחתום'); return; }
    submitting.current = true;
    setBusy(true);
    setMsg('');
    const signedAt = new Date().toLocaleString('he-IL', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    let signedPdf: string | undefined;
    try {
      const pdf = await buildSignedOpeningFormPdf({
        clientName: normalizedDraft.clientName,
        plate: normalizedDraft.plate,
        eventDate: normalizedDraft.eventDate,
        eventLocation: [normalizedDraft.eventPlace, normalizedDraft.eventCity, normalizedDraft.eventStreet].filter(Boolean).join(', '),
        eventDesc: normalizedDraft.eventDesc || normalizedDraft.damageDesc || '',
        signaturePng: sig,
        claimNum: claimId || normalizedDraft.claimNum || 'טרם התקבל',
        claimId: claimId || undefined,
        signedAt,
        draft: normalizedDraft,
      });
      signedPdf = await fileToBase64(pdf);
    } catch {
      submitting.current = false;
      setBusy(false);
      setMsg('יצירת ה-PDF המלא נכשלה. לא נשלח טופס בלי PDF חתום.');
      return;
    }
    if (!signedPdf) {
      submitting.current = false;
      setBusy(false);
      setMsg('יצירת ה-PDF המלא נכשלה. לא נשלח טופס בלי PDF חתום.');
      return;
    }
    const r = await call('public_submit', { draft: normalizedDraft, signature: sig, signed_pdf_base64: signedPdf });
    setBusy(false);
    if (r.json?.submitted) {
      setDone(true);
      if (r.json.upload_url) {
        const u = String(r.json.upload_url);
        setUploadUrl(u);
        window.setTimeout(() => {
          try {
            window.location.assign(u);
          } catch {
            window.location.href = u;
          }
        }, 500);
      }
      sessionStorage.removeItem(`intake-draft-${token}`);
      return;
    }
    submitting.current = false;
    const rawErr = String(r.json?.error || '');
    setMsg(ERROR_MESSAGES_HE[rawErr] || 'שמירת השאלון נכשלה. אנא בדקו את כל שדות החובה ונסו שוב.');
  };

  if (loading) return <div className="intake-page" dir="rtl">טוען…</div>;
  if (error) return (
    <div className="intake-page" dir="rtl">
      <div className="intake-brand"><div className="intake-mark">ד</div><div><div className="intake-brand-t">דליה</div><div className="intake-brand-s">ניהול תביעות</div></div></div>
      <h1>הודעה על תאונת רכב</h1>
      <p className="intake-err">{error}</p>
    </div>
  );
  if (done) return (
    <div className="intake-page" dir="rtl" data-testid="intake-success">
      <div className="intake-brand"><div className="intake-mark">ד</div><div><div className="intake-brand-t">דליה</div><div className="intake-brand-s">ניהול תביעות</div></div></div>
      <div className="intake-card">
        <h1 className="intake-ok">הדיווח התקבל בהצלחה</h1>
        {claimId ? <div style={{ fontSize: 14, fontWeight: 700, color: '#1e3a5f', marginBottom: 8 }}>מספר תיק: {claimId}</div> : null}
        {uploadUrl ? (
          <div style={{ marginTop: 24, padding: 20, background: 'rgba(37, 99, 235, 0.08)', borderRadius: 12, border: '1.5px solid rgba(37, 99, 235, 0.3)', textAlign: 'center' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 8px', color: '#1d4ed8' }}>
              השלב הבא: העלאת מסמכים וטפסים לתביעה
            </h2>
            <p style={{ fontSize: 14, color: '#374151', margin: '0 0 16px', lineHeight: 1.5 }}>
              מעביר אותך כעת באופן אוטומטי למסך העלאת המסמכים והטפסים שנבחרו עבור התיק...
            </p>
            <a
              href={uploadUrl}
              className="btn btn-p"
              data-testid="intake-continue-to-docs"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '14px 20px', fontSize: 16, textDecoration: 'none', borderRadius: 8, fontWeight: 800, background: '#2563eb', color: '#fff', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)' }}
            >
              המשך מיד להעלאת מסמכים 📎
            </a>
          </div>
        ) : (
          <div style={{ marginTop: 20, padding: 18, background: 'rgba(16, 185, 129, 0.08)', borderRadius: 12, border: '1.5px solid rgba(16, 185, 129, 0.3)', textAlign: 'center' }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 6px', color: '#059669' }}>
              שאלון פתיחת התביעה הושלם
            </h2>
            <p style={{ fontSize: 14, color: '#374151', margin: 0, lineHeight: 1.6 }}>
              תודה. שאלון פתיחת התביעה נחתם והתקבל בהצלחה. לא נדרשו מסמכים נוספים עבור תיק זה, וצוות המוסך ימשיך את הטיפול מול חברת הביטוח.
            </p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="intake-page" dir="rtl">
      <div className="intake-brand">
        <div className="intake-mark">ד</div>
        <div>
          <div className="intake-brand-t">דליה – תביעת רכב</div>
          <div className="intake-brand-s">{claimId ? `תיק ${claimId} · ניהול תביעות` : 'ניהול תביעות'}</div>
        </div>
      </div>
      <h1>הודעה על תאונת רכב</h1>
      <p className="intake-lead">מלאו את הפרטים בשלבים קצרים. אפשר לחזור אחורה בכל שלב.</p>
      <div className="intake-progress" data-testid="intake-progress">
        <div className="intake-dots">
          {steps.map((s, i) => <span key={s.key} className={`intake-dot ${i <= step ? 'on' : ''}`} />)}
        </div>
        <div>שלב {step + 1} מתוך {steps.length} · {steps[step]?.label}</div>
      </div>
      <div className="intake-card">
        <ClaimAccidentForm
          mode="customer"
          value={draft}
          onChange={persist}
          stepKey={stepKey}
          onSignature={setSig}
          signatureSet={!!sig}
        />
      </div>
      {msg ? <div className="intake-err" data-testid="intake-error-msg">{msg}</div> : null}
      <div className="intake-nav">
        <button type="button" className="btn btn-g" data-testid="intake-back" disabled={step === 0 || busy} onClick={() => { setMsg(''); setStep((s) => Math.max(0, s - 1)); }}>חזור</button>
        {stepKey !== 'review' ? (
          <button type="button" className="btn btn-p" data-testid="intake-next" onClick={handleNextStep}>המשך</button>
        ) : (
          <button type="button" className="btn btn-p" data-testid="intake-submit" disabled={busy} onClick={() => void submit()}>{busy ? 'שולח…' : 'שלח'}</button>
        )}
      </div>
    </div>
  );
}
