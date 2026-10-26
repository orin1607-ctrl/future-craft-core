/**
 * CarPartPanel.tsx
 * "Car-Part – מכרז חלקי חילוף" workspace inside a claim card (STAGING).
 * Opens Car-Part in a side window with the user's own subscription, remembers the claim,
 * and saves the produced tender document into this claim's documents (existing claims-docs upload).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CARPART_FIND_PARTS_URL,
  CARPART_REQUESTS_URL,
  CARPART_STAFF_TYPE,
  buildTenderFileName,
  buildTenderNote,
  buildTenderTitle,
  carPartFiles,
  carPartWindowFeatures,
  carPartWindowName,
  clearSession,
  isAcceptedTenderFile,
  readSession,
  rememberSession,
  type CarPartClaimContext,
  type CarPartFileLike,
} from './carPartBridge';
import './carpart.css';

type UploadResult = { success: boolean; file_id?: string; reused?: boolean; error?: string };

type Props = {
  ctx: CarPartClaimContext;
  files: CarPartFileLike[];
  uploadFile: (file: File, extra: { staff_type: string; staff_title: string }) => Promise<UploadResult>;
  updateMeta: (fileId: string, patch: Record<string, string | boolean>) => Promise<{ success?: boolean; error?: string }>;
  logHistory: (action: string, note: string) => Promise<unknown> | void;
  onOpenFile: (fileId: string) => void;
  onDownloadFile: (fileId: string) => void;
  onSaved: () => void;
  onClose: () => void;
  toast: (msg: string, type?: string) => void;
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export default function CarPartPanel({ ctx, files, uploadFile, updateMeta, logHistory, onOpenFile, onDownloadFile, onSaved, onClose, toast }: Props) {
  const winRef = useRef<Window | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [opened, setOpened] = useState(() => readSession()?.claimId === ctx.claimId);
  const [otherSession] = useState(() => {
    const s = readSession();
    return s && s.claimId !== ctx.claimId ? s : null;
  });
  const [pending, setPending] = useState<File | null>(null);
  const [tenderRef, setTenderRef] = useState('');
  const [userNote, setUserNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [copied, setCopied] = useState(false);
  const saved = carPartFiles(files);

  const copyPlate = useCallback(async () => {
    if (!ctx.plate) return false;
    try {
      await navigator.clipboard.writeText(ctx.plate.replace(/\D/g, '') || ctx.plate);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
      return true;
    } catch {
      return false;
    }
  }, [ctx.plate]);

  const openCarPart = useCallback(async (url: string) => {
    rememberSession(ctx);
    setOpened(true);
    const name = carPartWindowName(ctx.claimId);
    const w = window.open(url, name, carPartWindowFeatures(window.screen?.availWidth || 0, window.screen?.availHeight || 0));
    if (!w) {
      toast('הדפדפן חסם את החלון — אפשרו חלונות קופצים לאתר זה ונסו שוב', 'err');
      return;
    }
    // Keep our handle but cut Car-Part's access back to this page (no reverse tab-nabbing).
    try { w.opener = null; } catch { /* ignore */ }
    winRef.current = w;
    try { w.focus(); } catch { /* ignore */ }
    const ok = await copyPlate();
    toast(ok ? `Car-Part נפתח · מספר הרכב ${ctx.plate} הועתק — הדביקו בשדה "מספר רישוי"` : 'Car-Part נפתח בחלון נפרד', 'inf');
    void logHistory('Car-Part נפתח מהתיק', `רכב ${ctx.plate || '—'} · תביעה ${ctx.claimNum || ctx.claimId}`);
  }, [ctx, copyPlate, logHistory, toast]);

  const pickFile = (f: File | null | undefined) => {
    if (!f) return;
    if (!isAcceptedTenderFile(f.name, f.type)) {
      toast('ניתן לשמור PDF או תמונה (PNG/JPG) בלבד', 'err');
      return;
    }
    setPending(f);
  };

  // Paste a screenshot / file straight from the clipboard while the panel is open.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files || [])[0];
      if (f) { e.preventDefault(); pickFile(f); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const now = new Date();
      const stored = new File([pending], buildTenderFileName(ctx, pending.name, pending.type, now), { type: pending.type || 'application/pdf' });
      const title = buildTenderTitle(ctx, tenderRef);
      const up = await uploadFile(stored, { staff_type: CARPART_STAFF_TYPE, staff_title: title });
      if (!up.success || !up.file_id) {
        toast(`השמירה נכשלה: ${up.error || 'שגיאה'}`, 'err');
        return;
      }
      const meta = await updateMeta(up.file_id, {
        staff_title: title,
        staff_note: buildTenderNote(ctx, { tenderRef, userNote, savedAt: now }),
        important: true,
      });
      if (meta && meta.success === false) toast('הקובץ נשמר, אך פרטי השיוך לא עודכנו', 'err');
      void logHistory('מסמך מכרז Car-Part נשמר בתיק', title);
      toast(up.reused ? 'המסמך כבר קיים בתיק — פרטי השיוך עודכנו' : 'מסמך המכרז נשמר בתיק התביעה');
      setPending(null);
      setTenderRef('');
      setUserNote('');
      clearSession();
      setOpened(false);
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cp-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} data-testid="carpart-panel">
      <div className="cp-root" dir="rtl" role="dialog" aria-label="Car-Part – מכרז חלקי חילוף">
        <div className="cp-head">
          <div className="cp-brand">
            <div className="tb-logo"><span className="tba">דליה</span><span className="tbb">ניהול תביעות</span></div>
            <div>
              <div className="cp-title">Car-Part – מכרז חלקי חילוף</div>
              <div className="cp-sub">המכרז נפתח במנוי Car-Part שלכם · המסמך נשמר ומשויך לתיק זה</div>
            </div>
          </div>
          <button type="button" className="cp-close" onClick={onClose} aria-label="סגור" data-testid="carpart-close">✕</button>
        </div>

        <div className="cp-body">
          <section className="cp-card cp-claim" data-testid="carpart-claim-ctx">
            <div className="cp-kv"><span>מספר תביעה</span><b>{ctx.claimNum || 'טרם התקבל'}</b></div>
            <div className="cp-kv"><span>מספר רכב</span><b dir="ltr">{ctx.plate || '—'}</b></div>
            <div className="cp-kv"><span>דגם</span><b>{ctx.carModel || '—'}</b></div>
            <div className="cp-kv"><span>לקוח</span><b>{ctx.clientName || '—'}</b></div>
            <div className="cp-kv"><span>מזהה תיק</span><b dir="ltr">{ctx.claimId}</b></div>
          </section>

          <section className="cp-card">
            <h3>1 · פתיחת מכרז ב-Car-Part</h3>
            <p className="cp-help">
              Car-Part ייפתח בחלון צדדי. בכניסה הראשונה מתחברים עם שם המשתמש והסיסמה של המנוי — הדפדפן זוכר את החיבור.
              מספר הרכב מועתק אוטומטית, כך שרק מדביקים אותו בשדה "מספר רישוי".
            </p>
            <div className="cp-acts">
              <button type="button" className="cp-btn cp-pri" data-testid="carpart-open" onClick={() => void openCarPart(CARPART_FIND_PARTS_URL)}>🔧 פתח מכרז חלקים ב-Car-Part</button>
              <button type="button" className="cp-btn" data-testid="carpart-open-requests" onClick={() => void openCarPart(CARPART_REQUESTS_URL)}>📋 הבקשות שלי / תשובות ספקים</button>
              {ctx.plate ? (
                <button type="button" className="cp-btn" data-testid="carpart-copy-plate" onClick={() => void copyPlate()}>{copied ? '✓ הועתק' : `העתק מספר רכב ${ctx.plate}`}</button>
              ) : null}
            </div>
            {opened ? <div className="cp-live" data-testid="carpart-session-live">✓ Car-Part נפתח מתיק זה — המערכת זוכרת את השיוך לתביעה {ctx.claimNum || ctx.claimId}</div> : null}
            {!opened && otherSession ? (
              <div className="cp-warn" data-testid="carpart-other-session">
                שימו לב: Car-Part נפתח לאחרונה מתיק אחר (תביעה {otherSession.claimNum || otherSession.claimId} · רכב {otherSession.plate || '—'}). מסמך שיישמר כאן ישויך לתיק הפתוח עכשיו.
              </div>
            ) : null}
          </section>

          <section className="cp-card">
            <h3>2 · שמירת מסמך המכרז בתיק</h3>
            <p className="cp-help">
              ב-Car-Part לוחצים "הדפס" על הבקשה / הצעות המחיר ובוחרים <b>"שמור כ-PDF"</b>. אחר כך גוררים את הקובץ לכאן (או בוחרים / מדביקים Ctrl+V).
              המסמך יישמר בגלריית המסמכים של התיק עם מספר התביעה ומספר הרכב.
            </p>
            <div
              className={`cp-drop ${drag ? 'on' : ''} ${pending ? 'has' : ''}`}
              data-testid="carpart-drop"
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files?.[0]); }}
              onClick={() => inputRef.current?.click()}
            >
              {pending ? (
                <>
                  <b>📄 {pending.name}</b>
                  <span>יישמר בשם: <bdi dir="ltr">{buildTenderFileName(ctx, pending.name, pending.type)}</bdi></span>
                </>
              ) : (
                <>
                  <b>גררו לכאן את קובץ המכרז מ-Car-Part</b>
                  <span>PDF / PNG / JPG · או לחצו לבחירת קובץ</span>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf,image/png,image/jpeg,image/webp"
                hidden
                data-testid="carpart-file-input"
                onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }}
              />
            </div>
            <div className="cp-row">
              <label className="cp-fg">
                <span>מספר בקשה ב-Car-Part (לא חובה)</span>
                <input className="cp-in" value={tenderRef} onChange={(e) => setTenderRef(e.target.value)} placeholder="לדוגמה 845512" data-testid="carpart-ref" />
              </label>
              <label className="cp-fg cp-grow">
                <span>הערה פנימית (לא חובה)</span>
                <input className="cp-in" value={userNote} onChange={(e) => setUserNote(e.target.value)} placeholder="למשל: כנף קדמית + פנס ימין" data-testid="carpart-note" />
              </label>
            </div>
            <div className="cp-acts">
              <button type="button" className="cp-btn cp-ok" disabled={!pending || busy} data-testid="carpart-save" onClick={() => void save()}>
                {busy ? 'שומר…' : `💾 שמור בתיק ${ctx.claimNum || ctx.claimId}`}
              </button>
              {pending ? <button type="button" className="cp-btn" onClick={() => setPending(null)} disabled={busy}>בטל</button> : null}
            </div>
          </section>

          <section className="cp-card" data-testid="carpart-saved-list">
            <h3>מסמכי Car-Part בתיק ({saved.length})</h3>
            {saved.length ? (
              <ul className="cp-list">
                {saved.map((f) => (
                  <li key={f.id} data-testid={`carpart-file-${f.id}`}>
                    <div className="cp-li-main">
                      <b>{f.doc_meta?.staff_title || f.original_name}</b>
                      <span><bdi dir="ltr">{f.original_name}</bdi> · {fmtDate(f.created_at)}</span>
                    </div>
                    <div className="cp-li-acts">
                      <button type="button" className="cp-btn cp-sm" onClick={() => onOpenFile(f.id)}>צפייה</button>
                      <button type="button" className="cp-btn cp-sm" onClick={() => onDownloadFile(f.id)}>הורדה</button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="cp-empty">עדיין לא נשמרו מסמכי Car-Part בתיק זה.</div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
