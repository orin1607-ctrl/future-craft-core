import { useEffect, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CLAIM_DOC_TYPES } from '@/features/claims/claimsConstants';
import SignaturePad from '@/features/claims/SignaturePad';
import { buildLetterPdf } from '@/features/claims/letterPdf';

const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claims-docs`;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type Letter = {
  title?: string;
  date?: string;
  to?: string;
  subject?: string;
  body?: string;
  needsSignature?: boolean;
  kind?: string;
  allowUpload?: boolean;
};

type DocItem = {
  id: string;
  label: string;
  status: string;
  receivedAt?: string | null;
  docKey?: string;
  uploadedCount?: number;
  allowMultiple?: boolean;
  isForm?: boolean;
  formDownload?: boolean;
  formDownloadUrl?: string | null;
  formFileName?: string;
  letter?: Letter | null;
};

export default function ClaimsUploadPage() {
  const [params] = useSearchParams();
  const token = params.get('t') || '';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [claimId, setClaimId] = useState('');
  const [claimStatus, setClaimStatus] = useState('');
  const [completed, setCompleted] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [clientName, setClientName] = useState('');
  const [plate, setPlate] = useState('');
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [sigs, setSigs] = useState<Record<string, string>>({});

  const pubHeaders = { apikey: KEY, Authorization: `Bearer ${KEY}` };

  const load = async () => {
    if (!token) { setError('קישור לא תקין'); setLoading(false); return; }
    const res = await fetch(`${FN}?action=public_get&token=${encodeURIComponent(token)}`, { headers: pubHeaders });
    const json = await res.json();
    if (!res.ok || json.success === false) {
      setError(json.error === 'expired' ? 'הקישור פג תוקף' : json.error === 'revoked' ? 'הקישור בוטל' : 'קישור לא תקין');
      setLoading(false);
      return;
    }
    setClaimId(json.claimId || '');
    setClaimStatus(json.claimStatus || '');
    const docList: DocItem[] = json.docs || [];
    setDocs(docList);
    const pendingCount = docList.filter((d: DocItem) => d.status !== 'received').length;
    if (json.claimStatus === 'תביעה חדשה – התקבלה' && pendingCount === 0) {
      setCompleted(true);
    }
    setClientName(json.clientName || '');
    setPlate(json.plate || '');
    setLoading(false);
  };

  useEffect(() => {
    document.title = 'דליה – העלאת מסמכים וטפסים לתביעה';
    document.documentElement.lang = 'he';
    document.documentElement.dir = 'rtl';
    document.body.classList.add('claims-public-page');
    return () => document.body.classList.remove('claims-public-page');
  }, []);

  useEffect(() => {
    void load();
  }, [token]);

  const upload = async (docId: string, file: File) => {
    setBusy(docId);
    setMsg('');
    setErrMsg('');
    try {
      const form = new FormData();
      form.set('action', 'public_upload');
      form.set('token', token);
      form.set('doc_request_id', docId);
      form.set('file', file);
      const res = await fetch(FN, { method: 'POST', headers: pubHeaders, body: form });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        setErrMsg('ההעלאה נכשלה. נא לבדוק את הקובץ ולנסות שוב.');
        return;
      }
      setMsg('הקובץ התקבל ונשמר בתיק בהצלחה.');
      await load();
    } finally {
      setBusy(null);
    }
  };

  const submitSigned = async (d: DocItem) => {
    const letter = d.letter;
    if (!letter) return;
    if (letter.needsSignature && !sigs[d.id]) {
      setErrMsg('נא לחתום במקום המיועד לפני שליחה.');
      return;
    }
    setBusy(d.id);
    try {
      const pdf = await buildLetterPdf({
        title: letter.title || d.label,
        date: letter.date || '',
        to: letter.to || clientName,
        subject: letter.subject || d.label,
        body: letter.body || '',
        clientName,
        plate,
        signaturePng: sigs[d.id],
        fileName: `${d.label}-חתום.pdf`,
      });
      await upload(d.id, pdf);
    } catch {
      setBusy(null);
      setErrMsg('הפקת המסמך נכשלה. נסו שוב.');
    }
  };

  const waiting = docs.filter((d) => d.status !== 'received');
  const received = docs.filter((d) => d.status === 'received');

  const handleFinishSubmission = async () => {
    if (completing) return;
    setMsg('');
    setErrMsg('');
    if (waiting.length > 0) {
      setErrMsg(`נא להשלים את העלאת כל המסמכים והטפסים לפני שליחת התביעה (חסרים: ${waiting.map((w) => w.label).join(', ')})`);
      return;
    }
    setCompleting(true);
    try {
      const res = await fetch(FN, {
        method: 'POST',
        headers: { ...pubHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'public_complete_submission', token }),
      });
      const json = await res.json();
      setCompleting(false);
      if (!res.ok || !json.success) {
        if (json.error === 'missing_documents' && Array.isArray(json.missing)) {
          setErrMsg(`עדיין חסרים מסמכים: ${json.missing.join(', ')}`);
        } else {
          setErrMsg('שליחת התביעה נכשלה. נא לנסות שוב.');
        }
        return;
      }
      setClaimStatus(json.status || 'תביעה חדשה – התקבלה');
      setCompleted(true);
    } catch {
      setCompleting(false);
      setErrMsg('שגיאת תקשורת. נא לנסות שוב.');
    }
  };

  const btnStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    width: '100%',
    background: '#1d4ed8',
    padding: '12px 16px',
    borderRadius: 10,
    cursor: 'pointer',
    fontSize: 16,
    fontWeight: 800,
    textAlign: 'center',
  };

  return (
    <div className="claims-upload-page" dir="rtl" style={{ minHeight: '100dvh', background: '#04091a', color: '#fff', fontFamily: 'Heebo, sans-serif', padding: 20, overflowX: 'hidden' }}>
      <style>{`.claims-public-page [aria-label="סגור"], .claims-public-page [aria-label="מצב כהה"], .claims-public-page [aria-label="מצב בהיר"] { display: none !important; }`}</style>
      <div style={{ maxWidth: 520, margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 20 }}>ד</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>דליה – תביעת רכב</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.65)' }}>
              {claimId ? `תיק ${claimId} · העלאת מסמכים וטפסים` : 'העלאת מסמכים וטפסים'}
            </div>
          </div>
        </div>
        {loading ? <div>טוען...</div> : error ? <div data-testid="cust-upload-error" style={{ color: '#ef4444' }}>{error}</div> : completed ? (
          <div data-testid="cust-claim-completed" style={{ background: '#071022', border: '2px solid #22c55e', borderRadius: 14, padding: 22, marginTop: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 38, marginBottom: 8 }}>✅</div>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: '#22c55e', margin: '0 0 8px' }}>
              תביעה חדשה – התקבלה
            </h2>
            {claimId ? (
              <div style={{ fontSize: 15, fontWeight: 800, color: '#93c5fd', marginBottom: 10 }}>
                מספר תיק דליה: {claimId}
              </div>
            ) : null}
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,.85)', lineHeight: 1.6, margin: 0 }}>
              תודה {clientName}. השאלון החתום, כל המסמכים וכל הטפסים החתומים התקבלו ונשמרו בתיק התביעה. צוות דליה ממשיך כעת בטיפול בתיק מול חברת הביטוח.
            </p>
          </div>
        ) : (
          <>
            <div style={{ color: 'rgba(255,255,255,.75)', marginBottom: 10, lineHeight: 1.5 }}>
              שלום {clientName}{plate ? ` · רכב ${plate}` : ''}. אנא השלימו את המסמכים והטפסים המופיעים מטה, ובסיום לחצו על <b>"סיים ושלח את התביעה"</b>.
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.6)', marginBottom: 14 }}>
              {waiting.length} ממתינים להשלמה · {received.length} התקבלו
            </div>
            {msg ? <div data-testid="cust-upload-msg" style={{ color: '#22c55e', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', padding: '10px 12px', borderRadius: 8, marginBottom: 12, fontWeight: 700 }}>{msg}</div> : null}
            {errMsg ? <div data-testid="cust-upload-err" style={{ color: '#f87171', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', padding: '10px 12px', borderRadius: 8, marginBottom: 12, fontWeight: 700 }}>{errMsg}</div> : null}
            {docs.length === 0 ? <div>אין בקשות פתוחות כרגע.</div> : docs.map((d) => {
              const type = CLAIM_DOC_TYPES.find((t) => t.key === d.docKey || t.label === d.label);
              const multi = d.allowMultiple === true || type?.group === true;
              const isForm = Boolean(d.isForm || d.formDownloadUrl || type?.formLater);
              const stillNeed = d.status !== 'received' || multi;
              const letter = d.letter;
              return (
              <div key={d.id} data-testid={`cust-doc-${d.id}`} style={{ background: '#071022', border: isForm ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid rgba(255,255,255,.12)', borderRadius: 12, padding: 14, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{d.label}</div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: isForm ? 'rgba(2, 132, 199, 0.25)' : 'rgba(59, 130, 246, 0.2)', color: isForm ? '#38bdf8' : '#93c5fd' }}>
                    {isForm ? 'טופס למילוי וחתימה' : 'מסמך להעלאה'}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: d.status === 'received' ? '#22c55e' : '#f59e0b', margin: '6px 0 10px', fontWeight: 700 }}>
                  {d.status === 'received' ? `✓ התקבל${d.uploadedCount ? ` (${d.uploadedCount} קבצים)` : ''}` : busy === d.id ? 'מעלה קובץ…' : isForm ? 'ממתין להורדת הטופס והעלאתו חתום' : 'ממתין להעלאת המסמך'}
                </div>
                {letter?.body ? (
                  <div data-testid={`cust-letter-${d.id}`} style={{ background: '#fff', color: '#0f172a', borderRadius: 8, padding: 14, marginBottom: 12, textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#64748b' }}>תאריך {letter.date || '—'}</div>
                    <div style={{ fontWeight: 800, marginTop: 6 }}>לכבוד {letter.to || clientName}</div>
                    <div style={{ fontWeight: 700, margin: '8px 0' }}>הנדון: {letter.subject || d.label}</div>
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55, fontSize: 14 }}>{letter.body}</div>
                    {letter?.needsSignature && stillNeed ? (
                      <div style={{ marginTop: 12 }} data-testid={`cust-sign-${d.id}`}>
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>חתימה במקום המתאים</div>
                        <SignaturePad testId={`cust-sign-pad-${d.id}`} onChange={(v) => setSigs((p) => ({ ...p, [d.id]: v }))} />
                        <button type="button" data-testid={`cust-sign-send-${d.id}`} style={{ ...btnStyle, marginTop: 10, border: 0, color: '#fff' }} disabled={busy === d.id} onClick={() => void submitSigned(d)}>
                          {busy === d.id ? 'שולח…' : 'חתום ושלח'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {d.formDownloadUrl ? (
                  <div style={{ marginBottom: 10 }}>
                    <a
                      href={d.formDownloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={d.formFileName || d.label}
                      style={{
                        ...btnStyle,
                        background: '#0284c7',
                        color: '#fff',
                        textDecoration: 'none',
                        fontSize: 15,
                        fontWeight: 800,
                      }}
                      data-testid={`cust-download-form-${d.id}`}
                    >
                      📥 פתח / הורד טופס ({d.formFileName || d.label})
                    </a>
                  </div>
                ) : isForm ? (
                  <div data-testid={`cust-form-hold-${d.id}`} style={{ fontSize: 13, color: '#fbbf24', marginBottom: 10 }}>
                    העלו כאן את הטופס המלא והחתום ({d.label}).
                  </div>
                ) : null}
                {(stillNeed || isForm) && letter?.allowUpload !== false && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label
                      style={{ ...btnStyle, background: isForm ? '#2563eb' : '#1d4ed8' }}
                      data-testid={isForm ? `cust-upload-signed-form-${d.id}` : `cust-upload-doc-${d.id}`}
                    >
                      {busy === d.id
                        ? 'מעלה...'
                        : isForm
                        ? (d.status === 'received' ? '📤 החלף / העלה טופס חתום נוסף' : '📤 העלה טופס חתום')
                        : (multi ? '📤 בחירת קובץ / תמונות' : '📤 בחירת קובץ / תמונה')}
                      <input type="file" hidden multiple={multi} accept="application/pdf,image/*" disabled={busy === d.id} onChange={(e) => {
                        const list = Array.from(e.target.files || []);
                        e.target.value = '';
                        void (async () => {
                          for (const f of list) await upload(d.id, f);
                        })();
                      }} />
                    </label>
                    {stillNeed ? (
                      <label style={{ ...btnStyle, background: '#0f766e', minHeight: 42, fontSize: 14 }}>
                        {busy === d.id ? 'מעלה...' : isForm ? '📷 צילום הטופס החתום מהמצלמה' : '📷 צילום מהמצלמה'}
                        <input type="file" hidden accept="image/*" capture="environment" disabled={busy === d.id} onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (f) void upload(d.id, f);
                        }} />
                      </label>
                    ) : null}
                  </div>
                )}
              </div>
              );
            })}

            {docs.length > 0 && (
              <div style={{ marginTop: 20, padding: 16, background: '#071022', border: waiting.length === 0 ? '2px solid #22c55e' : '1px solid rgba(255,255,255,0.18)', borderRadius: 14 }}>
                <div style={{ fontSize: 14, color: waiting.length === 0 ? '#4ade80' : 'rgba(255,255,255,0.75)', marginBottom: 10, fontWeight: 700, textAlign: 'center' }}>
                  {waiting.length === 0
                    ? 'כל המסמכים והטפסים הועלו! לחצו על הכפתור מטה לסיום ושליחת התביעה.'
                    : `נותרו ${waiting.length} פריטים להשלמה לפני שליחה סופית של התביעה.`}
                </div>
                <button
                  type="button"
                  data-testid="cust-finish-submit-claim"
                  disabled={completing || busy !== null}
                  onClick={() => void handleFinishSubmission()}
                  style={{
                    ...btnStyle,
                    background: waiting.length === 0 ? '#16a34a' : '#334155',
                    color: '#fff',
                    border: 'none',
                    fontSize: 17,
                    fontWeight: 900,
                    minHeight: 54,
                  }}
                >
                  {completing ? 'שולח ומעדכן תיק...' : '✅ סיים ושלח את התביעה'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
