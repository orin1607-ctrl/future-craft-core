import { useEffect, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';

const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claims-docs`;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type DocItem = { id: string; label: string; status: string; receivedAt?: string | null };

export default function ClaimsUploadPage() {
  const [params] = useSearchParams();
  const token = params.get('t') || '';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [clientName, setClientName] = useState('');
  const [plate, setPlate] = useState('');
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

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
    setClientName(json.clientName || '');
    setPlate(json.plate || '');
    setDocs(json.docs || []);
    setLoading(false);
  };

  useEffect(() => {
    document.title = 'העלאת מסמכים';
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
    const form = new FormData();
    form.set('action', 'public_upload');
    form.set('token', token);
    form.set('doc_request_id', docId);
    form.set('file', file);
    const res = await fetch(FN, { method: 'POST', headers: pubHeaders, body: form });
    const json = await res.json();
    setBusy(null);
    if (!res.ok || json.success === false) {
      setMsg('ההעלאה נכשלה. נסו שוב.');
      return;
    }
    setMsg('המסמך התקבל. תודה.');
    await load();
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
        <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>דליה · העלאת מסמכים</div>
        {loading ? <div>טוען...</div> : error ? <div style={{ color: '#ef4444' }}>{error}</div> : (
          <>
            <div style={{ color: 'rgba(255,255,255,.65)', marginBottom: 18, lineHeight: 1.5 }}>שלום {clientName}{plate ? ` · רכב ${plate}` : ''}. אנא העלו את המסמכים המבוקשים.</div>
            {msg ? <div style={{ color: '#22c55e', marginBottom: 12, fontWeight: 700 }}>{msg}</div> : null}
            {docs.length === 0 ? <div>אין מסמכים מבוקשים כרגע.</div> : docs.map((d) => (
              <div key={d.id} style={{ background: '#071022', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: 14, marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{d.label}</div>
                <div style={{ fontSize: 13, color: d.status === 'received' ? '#22c55e' : '#f59e0b', margin: '6px 0 10px' }}>{d.status === 'received' ? 'התקבל' : busy === d.id ? 'מעלה את הקובץ…' : 'ממתין להעלאה'}</div>
                {d.status !== 'received' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label style={btnStyle}>
                      {busy === d.id ? 'מעלה...' : 'בחירת קובץ / תמונה'}
                      <input type="file" hidden accept="application/pdf,image/*" disabled={busy === d.id} onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (f) void upload(d.id, f);
                      }} />
                    </label>
                    <label style={{ ...btnStyle, background: '#0f766e' }}>
                      {busy === d.id ? 'מעלה...' : 'צילום מהמצלמה'}
                      <input type="file" hidden accept="image/*" capture="environment" disabled={busy === d.id} onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (f) void upload(d.id, f);
                      }} />
                    </label>
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
