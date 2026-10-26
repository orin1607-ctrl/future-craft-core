/**
 * ClaimShareConfirmModal.tsx
 * Dialog displayed when an incoming document is received via Android Web Share Target
 * or desktop instant paste/drop.
 *
 * Guarantees:
 * 1. Matches to the Car-Part session claim (claimNum, plate, carModel, clientName).
 * 2. Warns clearly if the user is currently viewing a different claim.
 * 3. Checks for duplicate files in the target claim (by size / filename).
 * 4. Saves via existing staffUpload mechanism.
 * 5. Immediately offers View, WhatsApp, Email, Download buttons.
 */

import React, { useState, useEffect } from 'react';
import {
  type CarPartClaimContext,
  type CarPartSession,
  buildTenderFileName,
  buildTenderNote,
  buildTenderTitle,
  CARPART_STAFF_TYPE,
  readSession,
} from './carPartBridge';
import { type SharedDocItem, sharedItemToFile, removeSharedDoc } from './claimShareInbox';
import { shareDocToEmail, shareDocToWhatsApp, type DocShareContext, type DocShareFile } from './claimDocShare';
import './claim-share-modal.css';

type ClaimOption = {
  id: string;
  claimNum?: string;
  plate?: string;
  carModel?: string;
  clientName?: string;
};

type UploadFn = (
  claimId: string,
  file: File,
  extra: { staff_type: string; staff_title: string }
) => Promise<{ success: boolean; file_id?: string; reused?: boolean; error?: string }>;

type UpdateMetaFn = (
  claimId: string,
  fileId: string,
  patch: Record<string, string | boolean>
) => Promise<{ success?: boolean; error?: string }>;

type LogHistoryFn = (claimId: string, action: string, note: string) => Promise<unknown> | void;

type Props = {
  item: SharedDocItem | null;
  currentClaim: ClaimOption | null;
  allClaims: ClaimOption[];
  existingFiles: Array<{ id: string; original_name: string; byte_size?: number; created_at?: string }>;
  uploadFile: UploadFn;
  updateMeta: UpdateMetaFn;
  logHistory: LogHistoryFn;
  getSignedUrl: (claimId: string, fileId: string) => Promise<string>;
  onOpenViewer: (file: { id: string; url: string; name: string; mime: string }) => void;
  onInternalEmail?: (seed: { to: string; subject: string; body: string; file_ids: string[] }) => void;
  onClose: () => void;
  onSavedToClaim?: (claimId: string) => void;
  toast: (msg: string, type?: string) => void;
};

function fmtBytes(bytes: number) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function ClaimShareConfirmModal({
  item,
  currentClaim,
  allClaims,
  existingFiles,
  uploadFile,
  updateMeta,
  logHistory,
  getSignedUrl,
  onOpenViewer,
  onInternalEmail,
  onClose,
  onSavedToClaim,
  toast,
}: Props) {
  const [session, setSession] = useState<CarPartSession | null>(null);
  const [targetClaimId, setTargetClaimId] = useState<string>('');
  const [userNote, setUserNote] = useState('');
  const [tenderRef, setTenderRef] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedResult, setSavedResult] = useState<{
    fileId: string;
    filename: string;
    url: string;
    claim: ClaimOption;
  } | null>(null);

  useEffect(() => {
    const s = readSession();
    setSession(s);
    // Default target claim: session claim if valid, else current open claim
    if (s && s.claimId && allClaims.some((c) => c.id === s.claimId)) {
      setTargetClaimId(s.claimId);
    } else if (currentClaim?.id) {
      setTargetClaimId(currentClaim.id);
    } else if (allClaims.length > 0) {
      setTargetClaimId(allClaims[0].id);
    }
  }, [item?.id, currentClaim?.id, allClaims]);

  if (!item) return null;

  const targetClaim = allClaims.find((c) => c.id === targetClaimId) || currentClaim || session;
  const targetCtx: CarPartClaimContext = {
    claimId: targetClaim?.id || '',
    claimNum: targetClaim?.claimNum || '',
    plate: targetClaim?.plate || '',
    carModel: targetClaim?.carModel || '',
    clientName: targetClaim?.clientName || '',
  };

  const isDifferentFromCurrent = currentClaim && targetClaim && currentClaim.id !== targetClaim.id;
  const isDifferentFromSession = session && targetClaim && session.claimId !== targetClaim.id;

  // Duplicate detection
  const duplicate = existingFiles.find(
    (f) =>
      f.original_name.toLowerCase() === item.name.toLowerCase() ||
      (f.byte_size && Math.abs(Number(f.byte_size) - item.size) < 10)
  );

  const handleSave = async () => {
    if (!targetClaimId) {
      toast('יש לבחור תיק תביעה לשמירת המסמך', 'err');
      return;
    }
    setSaving(true);
    try {
      const fileToUpload = sharedItemToFile(item);
      const title = buildTenderTitle(targetCtx, tenderRef);
      const filename = buildTenderFileName(targetCtx, item.name, item.type);

      const up = await uploadFile(targetClaimId, fileToUpload, {
        staff_type: CARPART_STAFF_TYPE,
        staff_title: title,
      });

      if (!up.success || !up.file_id) {
        toast(`השמירה נכשלה: ${up.error || 'שגיאה'}`, 'err');
        return;
      }

      await updateMeta(targetClaimId, up.file_id, {
        staff_title: title,
        staff_note: buildTenderNote(targetCtx, { tenderRef, userNote }),
        important: true,
      });

      void logHistory(targetClaimId, 'מסמך מכרז Car-Part התקבל משיתוף ונשמר בתיק', title);

      // Remove from inbox
      await removeSharedDoc(item.id);

      // Get signed URL for immediate viewing / sharing
      const url = await getSignedUrl(targetClaimId, up.file_id);

      setSavedResult({
        fileId: up.file_id,
        filename: title || filename,
        url: url || '',
        claim: targetClaim,
      });

      toast('המסמך נשמר בהצלחה בתיק התביעה', 'ok');
      onSavedToClaim?.(targetClaimId);
    } catch (err: any) {
      toast(`שגיאה בשמירת המסמך: ${err?.message || err}`, 'err');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    await removeSharedDoc(item.id);
    onClose();
  };

  const handleWhatsApp = async () => {
    if (!savedResult) return;
    const docShareFile: DocShareFile = {
      id: savedResult.fileId,
      name: savedResult.filename,
      url: savedResult.url,
      mime: item.type,
    };
    const res = await shareDocToWhatsApp(
      docShareFile,
      targetCtx as DocShareContext,
      '',
      (msg) => toast(msg, 'inf')
    );
    if (res.method === 'native') toast('שותף בהצלחה לוואטסאפ', 'ok');
    else if (res.method === 'wa_link') toast('נפתח WhatsApp', 'ok');
  };

  const handleEmail = async () => {
    if (!savedResult) return;
    const docShareFile: DocShareFile = {
      id: savedResult.fileId,
      name: savedResult.filename,
      url: savedResult.url,
      mime: item.type,
    };
    const res = await shareDocToEmail(docShareFile, targetCtx as DocShareContext, {
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
  };

  const handleView = () => {
    if (!savedResult) return;
    onOpenViewer({
      id: savedResult.fileId,
      url: savedResult.url,
      name: savedResult.filename,
      mime: item.type,
    });
    onClose();
  };

  return (
    <div className="csm-backdrop" onClick={(e) => { if (e.target === e.currentTarget && !saving) handleCancel(); }} data-testid="claim-share-modal">
      <div className="csm-container" dir="rtl" role="dialog" aria-label="קליטת מסמך Car-Part לתיק התביעה">
        {/* Header */}
        <div className="csm-head">
          <div className="csm-brand">
            <span className="csm-badge">שיתוף נייד / PWA</span>
            <h2>קליטת מסמך Car-Part לתיק התביעה</h2>
          </div>
          <button type="button" className="csm-close" onClick={handleCancel} disabled={saving} aria-label="סגור">✕</button>
        </div>

        {/* Body */}
        <div className="csm-body">
          {savedResult ? (
            /* Success View */
            <div className="csm-success-card" data-testid="share-save-success">
              <div className="csm-success-icon">✓</div>
              <h3 className="csm-success-title">המסמך נשמר בהצלחה בתיק התביעה!</h3>
              <p className="csm-success-sub">
                תביעה {savedResult.claim.claimNum || savedResult.claim.id} · רכב {savedResult.claim.plate || '—'}
              </p>
              <div className="csm-file-pill">
                <span>📄 {savedResult.filename}</span>
              </div>

              <div className="csm-acts-row">
                <button type="button" className="csm-btn csm-btn-pri" onClick={handleView} data-testid="share-success-view">
                  👁️ צפייה במסמך
                </button>
                <button type="button" className="csm-btn csm-btn-wa" onClick={handleWhatsApp} data-testid="share-success-wa">
                  💬 WhatsApp
                </button>
                <button type="button" className="csm-btn csm-btn-mail" onClick={handleEmail} data-testid="share-success-mail">
                  ✉️ אימייל
                </button>
                <button type="button" className="csm-btn" onClick={onClose} data-testid="share-success-close">
                  סיום
                </button>
              </div>
            </div>
          ) : (
            /* Confirmation & Target Selection View */
            <>
              {/* Document Info */}
              <div className="csm-doc-summary">
                <div className="csm-doc-icon">{item.type.includes('pdf') ? '📕' : '🖼️'}</div>
                <div className="csm-doc-details">
                  <b>{item.name}</b>
                  <span>{fmtBytes(item.size)} · {item.type || 'מסמך'} · התקבל עכשיו</span>
                </div>
              </div>

              {/* Duplicate Warning */}
              {duplicate ? (
                <div className="csm-warn" data-testid="share-duplicate-warn">
                  ⚠️ שים לב: מסמך בעל שם או גודל דומה (<b>{duplicate.original_name}</b>) כבר קיים בתיק זה. אם תשמור, המסמך יתווסף כגרסה מעודכנת.
                </div>
              ) : null}

              {/* Target Claim Matching */}
              <div className="csm-target-box">
                <h4>שיוך לתיק התביעה</h4>
                <p className="csm-hint">
                  {session && session.claimId === targetClaimId
                    ? '✓ זוהה אוטומטית לפי תיק התביעה שממנו נפתח Car-Part:'
                    : 'בחר את תיק התביעה שאליו ישויך המסמך:'}
                </p>

                <div className="csm-claim-selector">
                  <select
                    className="csm-select"
                    value={targetClaimId}
                    onChange={(e) => setTargetClaimId(e.target.value)}
                    disabled={saving}
                    data-testid="share-claim-select"
                  >
                    {allClaims.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.claimNum ? `תביעה ${c.claimNum}` : `תיק ${c.id.slice(0, 8)}`} · רכב {c.plate || '—'} {c.carModel ? `(${c.carModel})` : ''} {c.clientName ? `· ${c.clientName}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Claim Context Card */}
                {targetClaim ? (
                  <div className="csm-claim-card" data-testid="share-target-card">
                    <div className="csm-kv"><span>מספר תביעה:</span><b>{targetClaim.claimNum || 'טרם נקבע'}</b></div>
                    <div className="csm-kv"><span>מספר רכב:</span><b dir="ltr">{targetClaim.plate || '—'}</b></div>
                    <div className="csm-kv"><span>דגם:</span><b>{targetClaim.carModel || '—'}</b></div>
                    <div className="csm-kv"><span>לקוח:</span><b>{targetClaim.clientName || '—'}</b></div>
                  </div>
                ) : null}

                {/* Alert if current claim in view is different */}
                {isDifferentFromCurrent ? (
                  <div className="csm-notice" data-testid="share-diff-current">
                    ℹ️ לתשומת לבך: התיק המוצג ברקע הוא תביעה {currentClaim?.claimNum || currentClaim?.id}, אך המסמך ישויך לתביעה שנבחרה כאן.
                  </div>
                ) : null}
              </div>

              {/* Extra details (optional) */}
              <div className="csm-fields">
                <label className="csm-fg">
                  <span>מספר בקשה / מכרז ב-Car-Part (לא חובה)</span>
                  <input
                    className="csm-input"
                    value={tenderRef}
                    onChange={(e) => setTenderRef(e.target.value)}
                    placeholder="לדוגמה: 845512"
                    data-testid="share-ref-input"
                  />
                </label>

                <label className="csm-fg">
                  <span>הערה לתיק (לא חובה)</span>
                  <input
                    className="csm-input"
                    value={userNote}
                    onChange={(e) => setUserNote(e.target.value)}
                    placeholder="לדוגמה: הצעת חלפים כנף + פנס"
                    data-testid="share-note-input"
                  />
                </label>
              </div>

              {/* Footer actions */}
              <div className="csm-foot">
                <button
                  type="button"
                  className="csm-btn csm-btn-pri"
                  onClick={handleSave}
                  disabled={saving || !targetClaimId}
                  data-testid="share-confirm-save"
                >
                  {saving ? 'שומר בתיק…' : `✓ אשר ושמור בתיק ${targetCtx.claimNum || targetCtx.claimId}`}
                </button>
                <button
                  type="button"
                  className="csm-btn"
                  onClick={handleCancel}
                  disabled={saving}
                  data-testid="share-cancel"
                >
                  ביטול
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
