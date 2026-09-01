import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ClaimAccidentForm from '@/features/claims/ClaimAccidentForm';
import { EMPTY_INTAKE, customerSteps, type IntakeDraft } from '@/features/claims/claimIntakeModel';
import '@/features/claims/claims-intake.css';

const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claims-intake`;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export default function ClaimsIntakePage() {
  const [params] = useSearchParams();
  const token = params.get('t') || '';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
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
      if (r.json.submitted) { setDone(true); setLoading(false); return; }
      const serverDraft = (r.json.draft && typeof r.json.draft === 'object') ? r.json.draft as IntakeDraft : {};
      const local = cached ? JSON.parse(cached) as IntakeDraft : {};
      const merged: IntakeDraft = { ...EMPTY_INTAKE, ...serverDraft };
      Object.entries(local).forEach(([k, v]) => {
        if (v) merged[k] = v;
      });
      setDraft(merged);
      setLoading(false);
    };
    void boot();
  }, [token]);

  const steps = useMemo(() => customerSteps(draft), [draft.driverDifferent, draft.claimKind]);
  const stepKey = steps[Math.min(step, steps.length - 1)]?.key || 'client';

  const persist = (next: IntakeDraft) => {
    setDraft(next);
    sessionStorage.setItem(`intake-draft-${token}`, JSON.stringify(next));
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void call('public_save_draft', { draft: next });
    }, 700);
  };

  const submit = async () => {
    if (submitting.current || busy) return;
    if (draft.declarationAck !== 'true' || !sig) { setMsg('יש לאשר את ההצהרה ולחתום'); return; }
    submitting.current = true;
    setBusy(true);
    setMsg('');
    const r = await call('public_submit', { draft, signature: sig });
    setBusy(false);
    if (r.json?.submitted) {
      setDone(true);
      sessionStorage.removeItem(`intake-draft-${token}`);
      return;
    }
    submitting.current = false;
    setMsg(r.json?.error === 'already_used' ? 'הדיווח כבר נשלח' : String(r.json?.error || 'השליחה נכשלה'));
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
        <p className="intake-lead">תודה. הצוות ימשיך את הטיפול בתיק.</p>
      </div>
    </div>
  );

  return (
    <div className="intake-page" dir="rtl">
      <div className="intake-brand">
        <div className="intake-mark">ד</div>
        <div>
          <div className="intake-brand-t">דליה</div>
          <div className="intake-brand-s">ניהול תביעות</div>
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
      {msg ? <div className="intake-err">{msg}</div> : null}
      <div className="intake-nav">
        <button type="button" className="btn btn-g" data-testid="intake-back" disabled={step === 0 || busy} onClick={() => setStep((s) => Math.max(0, s - 1))}>חזור</button>
        {stepKey !== 'review' ? (
          <button type="button" className="btn btn-p" data-testid="intake-next" onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}>המשך</button>
        ) : (
          <button type="button" className="btn btn-p" data-testid="intake-submit" disabled={busy} onClick={() => void submit()}>{busy ? 'שולח…' : 'שלח'}</button>
        )}
      </div>
    </div>
  );
}
