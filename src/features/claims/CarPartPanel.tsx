/**
 * CarPartPanel.tsx
 * Car-Part parts tender integration panel inside Dalia Claims module.
 *
 * Requirements:
 * - Clear section: "שמירת הצעות מחיר לתיק התביעה"
 * - Immediate success message: "המסמך נשמר בהצלחה בתיק התביעה"
 * - 4 immediate actions: View (👁️), WhatsApp (💬), Email (✉️), Download (📥)
 * - Desktop quick paste (Ctrl+V & Clipboard API)
 * - Duplicate warning before overwrite
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CARPART_STAFF_TYPE,
  buildTenderFileName,
  buildTenderNote,
  buildTenderTitle,
  carPartFiles,
  carPartWindowFeatures,
  carPartWindowName,
  clearSession,
  getCarPartRequestsUrl,
  getCarPartTenderUrl,
  isAcceptedTenderFile,
  isCarPartMobileClient,
  readSession,
  rememberSession,
  type CarPartClaimContext,
  type CarPartFileLike,
} from './carPartBridge';
import {
  shareDocToEmail,
  shareDocToWhatsApp,
  type DocShareContext,
  type DocShareFile,
} from './claimDocShare';
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
  getFileSignedUrl?: (fileId: string) => Promise<string>;
  onInternalEmail?: (seed: { to: string; subject: string; body: string; file_ids: string[] }) => void;
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

export default function CarPartPanel({
  ctx,
  files,
  uploadFile,
  updateMeta,
  logHistory,
  onOpenFile,
  onDownloadFile,
  getFileSignedUrl,
  onInternalEmail,
  onSaved,
  onClose,
  toast,
}: Props) {
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
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<{ id: string; title: string } | null>(null);
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

  const openCarPart = useCallback(async (targetType: 'tender' | 'requests') => {
    rememberSession(ctx);
    setOpened(true);

    const isMobile = isCarPartMobileClient();
    const url = targetType === 'tender' ? getCarPartTenderUrl(isMobile) : getCarPartRequestsUrl(isMobile);
    const name = carPartWindowName(ctx.claimId);
    const features = carPartWindowFeatures(window.screen?.availWidth || 0, window.screen?.availHeight || 0, isMobile);

    const w = features ? window.open(url, name, features) : window.open(url, '_blank');
    if (!w) {
      toast('הדפדפן חסם את החלון — אפשרו חלונות קופצים לאתר זה ונסו שוב', 'err');
      return;
    }
    try { w.opener = null; } catch { /* ignore */ }
    winRef.current = w;
    try { w.focus(); } catch { /* ignore */ }

    const ok = await copyPlate();
    toast(ok ? `Car-Part נפתח · מספר הרכב ${ctx.plate} הועתק — הדביקו בשדה "מספר רישוי"` : 'Car-Part נפתח', 'inf');
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

  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          for (const type of item.types) {
            if (type.startsWith('image/') || type === 'application/pdf') {
              const blob = await item.getType(type);
              const ext = type.includes('pdf') ? 'pdf' : type.replace('image/', '') || 'png';
              const f = new File([blob], `carpart_clipboard_${Date.now()}.${ext}`, { type });
              pickFile(f);
              toast('הקובץ נדבק מהלוח בהצלחה', 'ok');
              return;
            }
          }
        }
      }
    } catch {
      // ignore
    }
    inputRef.current?.click();
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files || [])[0];
      if (f) {
        e.preventDefault();
        pickFile(f);
        toast(`הקובץ ${f.name} נקלט מהלוח`, 'ok');
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
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

      setLastSaved({ id: up.file_id, title });
      toast('המסמך נשמר בהצלחה בתיק התביעה', 'ok');
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

  const shareWhatsApp = async (f: CarPartFileLike) => {
    if (sharingId) return;
    setSharingId(f.id);
    try {
      const url = getFileSignedUrl ? await getFileSignedUrl(f.id) : '';
      const docShareFile: DocShareFile = {
        id: f.id,
        name: f.doc_meta?.staff_title || f.original_name,
        url: url || '',
        mime: f.mime_type,
      };
      const res = await shareDocToWhatsApp(
        docShareFile,
        ctx as DocShareContext,
        '',
        (msg) => toast(msg, 'inf')
      );
      if (res.method === 'native') toast('שותף בהצלחה לוואטסאפ', 'ok');
      else if (res.method === 'wa_link') toast('נפתח WhatsApp', 'ok');
    } catch {
      toast('השיתוף לוואטסאפ נכשל', 'err');
    } finally {
      setSharingId(null);
    }
  };

  const shareEmail = async (f: CarPartFileLike) => {
    if (sharingId) return;
    setSharingId(f.id);
    try {
      const url = getFileSignedUrl ? await getFileSignedUrl(f.id) : '';
      const docShareFile: DocShareFile = {
        id: f.id,
        name: f.doc_meta?.staff_title || f.original_name,
        url: url || '',
        mime: f.mime_type,
      };
      const res = await shareDocToEmail(docShareFile, ctx as DocShareContext, {
        onInternalCompose: onInternalEmail,
      });
      if (res.method === 'internal') {
        toast('נפתח עורך המייל עם הקובץ המצורף', 'ok');
        onClose();
      } else if (res.method === 'native') {
        toast('שותף בהצלחה לאימייל', 'ok');
      } else {
        toast('נפתחה תוכנת האימייל', 'ok');
      }
    } catch {
      toast('השליחה לאימייל נכשלה', 'err');
    } finally {
      setSharingId(null);
    }
  };

  // Duplicate check
  const duplicate = pending ? files.find((f) => f.original_name.toLowerCase() === pending.name.toLowerCase()) : null;

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
              Car-Part ייפתח בהתאמה למכשיר (מובייל בטלפון, חלון צדדי במחשב).
              מספר הרכב מועתק אוטומטית, כך שרק מדביקים אותו בשדה "מספר רישוי".
            </p>
            <div className="cp-acts">
              <button type="button" className="cp-btn cp-pri" data-testid="carpart-open" onClick={() => void openCarPart('tender')}>🔧 פתח מכרז חלקים ב-Car-Part</button>
              <button type="button" className="cp-btn" data-testid="carpart-open-requests" onClick={() => void openCarPart('requests')}>📋 הבקשות שלי / תשובות ספקים</button>
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

          {/* Section 2: שמירת הצעות מחיר לתיק התביעה */}
          <section className="cp-card" data-testid="carpart-intake-section">
            <h3>שמירת הצעות מחיר לתיק התביעה</h3>
            <p className="cp-help">
              ב-Car-Part לוחצים "הדפס" ובוחרים <b>"שמור כ-PDF"</b>. 
              במחשב ניתן לגרור לכאן, ללחוץ לבחירה או להדביק ב-<b>Ctrl+V</b>. 
              בטלפון ניתן ללחוץ על "שתף" ולבחור <b>"דליה"</b>.
            </p>

            {/* Success notification banner */}
            {lastSaved ? (
              <div className="cp-success-banner" data-testid="carpart-success-banner">
                <div className="cp-sb-title">✓ המסמך נשמר בהצלחה בתיק התביעה</div>
                <div className="cp-sb-name">{lastSaved.title}</div>
                <div className="cp-sb-acts">
                  <button type="button" className="cp-btn cp-sm cp-btn-view" data-testid="carpart-last-view" onClick={() => onOpenFile(lastSaved.id)}>👁️ צפייה</button>
                  <button type="button" className="cp-btn cp-sm cp-btn-wa" data-testid="carpart-last-wa" onClick={() => {
                    const f = saved.find((x) => x.id === lastSaved.id) || { id: lastSaved.id, original_name: lastSaved.title, created_at: new Date().toISOString() };
                    void shareWhatsApp(f as any);
                  }}>💬 WhatsApp</button>
                  <button type="button" className="cp-btn cp-sm cp-btn-mail" data-testid="carpart-last-mail" onClick={() => {
                    const f = saved.find((x) => x.id === lastSaved.id) || { id: lastSaved.id, original_name: lastSaved.title, created_at: new Date().toISOString() };
                    void shareEmail(f as any);
                  }}>✉️ אימייל</button>
                  <button type="button" className="cp-btn cp-sm" data-testid="carpart-last-dl" onClick={() => onDownloadFile(lastSaved.id)}>📥 הורדה</button>
                </div>
              </div>
            ) : null}

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
                  <span>PDF / PNG / JPG · או לחצו לבחירת קובץ מהמכשיר</span>
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

            <div className="cp-drop-acts">
              <button type="button" className="cp-btn cp-sm" data-testid="carpart-paste-btn" onClick={(e) => { e.stopPropagation(); void handlePasteClipboard(); }}>
                📋 הדבק מהלוח (Ctrl+V)
              </button>
              <button type="button" className="cp-btn cp-sm" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
                📁 בחר קובץ מהמחשב
              </button>
            </div>

            {duplicate ? (
              <div className="cp-warn" data-testid="carpart-dup-warn">
                ⚠️ שים לב: מסמך בשם <b>{duplicate.original_name}</b> כבר קיים בתיק זה. השמירה תעדכן אותו.
              </div>
            ) : null}

            <div className="cp-row" style={{ marginTop: 10 }}>
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
                  <li key={f.id} data-testid={`carpart-file-${f.id}`} className="cp-item-row">
                    <div className="cp-li-main">
                      <b>{f.doc_meta?.staff_title || f.original_name}</b>
                      <span><bdi dir="ltr">{f.original_name}</bdi> · {fmtDate(f.created_at)}</span>
                    </div>
                    <div className="cp-li-acts">
                      <button type="button" className="cp-btn cp-sm cp-btn-view" data-testid={`carpart-view-${f.id}`} onClick={() => onOpenFile(f.id)}>
                        👁️ צפייה
                      </button>
                      <button type="button" className="cp-btn cp-sm cp-btn-wa" data-testid={`carpart-wa-${f.id}`} onClick={() => void shareWhatsApp(f)} disabled={sharingId === f.id}>
                        💬 WhatsApp
                      </button>
                      <button type="button" className="cp-btn cp-sm cp-btn-mail" data-testid={`carpart-email-${f.id}`} onClick={() => void shareEmail(f)} disabled={sharingId === f.id}>
                        ✉️ אימייל
                      </button>
                      <button type="button" className="cp-btn cp-sm" data-testid={`carpart-dl-${f.id}`} onClick={() => onDownloadFile(f.id)}>
                        📥 הורדה
                      </button>
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
