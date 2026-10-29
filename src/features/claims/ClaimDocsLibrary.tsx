import ClaimImage from './ClaimImage';
import { useState } from 'react';
import { DOC_LIB_CATEGORIES, DOC_LIB_GROUPS, DOC_LIB_SECTIONS, fileDocBucket, filesForLibCategory, isTrashedLibFile, libTypeLabel } from './claimDocLibrary';
import { documentReadCaption } from './claimDocumentRead';
import { NOT_READ_LABEL, documentLabel } from '../../../supabase/functions/_shared/claimDocumentLabel';

export type LibFile = {
  id: string;
  original_name: string;
  mime_type?: string;
  created_at?: string;
  source?: string;
  doc_kind?: string;
  doc_meta?: Record<string, string> | null;
};

type Section = { key: string; label: string; match: string[]; rows: LibFile[] };

type Props = {
  files: LibFile[];
  picked: string[];
  category: string;
  thumbs: Record<string, string>;
  isImage: (f: LibFile) => boolean;
  fileLabel: (f: LibFile) => string;
  onCategory: (key: string) => void;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
  onPreview: (f: LibFile, list: LibFile[]) => void;
  onDownload: (f: LibFile) => void;
  onPrint: (f: LibFile) => void;
  onWhatsApp?: (f: LibFile) => void;
  onEmail?: (f: LibFile) => void;
  onShareTopic: (ids: string[]) => void;
  onRename: (f: LibFile, title: string) => void;
  onPrepareRead?: (f: LibFile) => string | Promise<string>;
  onTrash?: (f: LibFile) => void | Promise<void>;
  onRestore?: (f: LibFile) => void | Promise<void>;
  onTrashBatch?: (ids: string[]) => void | Promise<void>;
  onRestoreBatch?: (ids: string[]) => void | Promise<void>;
};

function fmtDay(iso?: string) {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  return new Date(t).toLocaleDateString('he-IL');
}

function DocRename({ f, label, onRename }: { f: LibFile; label: string; onRename: (f: LibFile, title: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(label);
  const [err, setErr] = useState('');
  return (
    <div className="doc-lib-rename" data-testid={`docs-rename-wrap-${f.id}`}>
      <button type="button" className="btn btn-g btn-sm" data-testid={`docs-rename-${f.id}`} onClick={() => { setTitle(label); setErr(''); setOpen((v) => !v); }}>עריכת שם מסמך</button>
      {open ? (
        <div data-testid={`docs-rename-form-${f.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6, minWidth: 180 }}>
          <label className="fl" htmlFor={`doc_rename_${f.id}`}>שם המסמך</label>
          <input
            className="fi"
            id={`doc_rename_${f.id}`}
            data-testid={`docs-rename-input-${f.id}`}
            value={title}
            maxLength={120}
            placeholder="חובה — שם ברור למסמך"
            onChange={(e) => setTitle(e.target.value)}
          />
          {err ? <div style={{ color: 'var(--rd2)', fontSize: 11 }}>{err}</div> : null}
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn btn-p btn-sm" data-testid={`docs-rename-save-${f.id}`} onClick={() => {
              const next = title.replace(/\s+/g, ' ').trim();
              if (!next) { setErr('חובה לתת שם למסמך'); return; }
              onRename(f, next);
              setOpen(false);
            }}>שמור שם</button>
            <button type="button" className="btn btn-g btn-sm" onClick={() => setOpen(false)}>ביטול</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DocumentReadNote({ f, onPrepareRead }: { f: LibFile; onPrepareRead?: (f: LibFile) => string | Promise<string> }) {
  const [plan, setPlan] = useState('');
  const caption = documentReadCaption(f.doc_meta);
  const label = documentLabel(f.doc_meta);
  if (!caption && !onPrepareRead) return null;
  return (
    <div className="doc-lib-read" data-testid={`doc-read-${f.id}`} style={{ fontSize: 11, color: 'var(--t2)', marginTop: 4 }}>
      {!label ? (
        <div data-testid={`doc-read-status-${f.id}`}>סטטוס קריאה: {NOT_READ_LABEL}</div>
      ) : null}
      {label ? (
        <div data-testid={`doc-read-label-${f.id}`} style={{ fontWeight: 600, color: label.needsReview ? 'hsl(var(--warning))' : 'var(--t)' }}>
          {[label.statusLabel, label.docType, label.description].filter((v, i, a) => v && a.indexOf(v) === i).join(' · ')}
        </div>
      ) : null}
      {caption ? <div>{caption.summary}</div> : null}
      {caption ? <div>{caption.details}</div> : null}
      {caption ? <div>{caption.source}</div> : null}
      {onPrepareRead ? (
        <button
          type="button"
          data-testid={`doc-read-prepare-${f.id}`}
          onClick={() => {
            const result = onPrepareRead(f);
            if (typeof result === 'string') setPlan(result);
            else void result.then(setPlan);
          }}
        >
          הכן לקריאה
        </button>
      ) : null}
      {plan ? <div data-testid={`doc-read-plan-${f.id}`}>{plan}</div> : null}
    </div>
  );
}

export default function ClaimDocsLibrary({
  files, picked, category, thumbs, isImage, fileLabel, onCategory, onToggle, onToggleAll, onPreview, onDownload, onPrint, onWhatsApp, onEmail, onShareTopic, onRename, onPrepareRead, onTrash, onRestore, onTrashBatch, onRestoreBatch,
}: Props) {
  const [confirmTrashFiles, setConfirmTrashFiles] = useState<LibFile[] | null>(null);

  const visible = filesForLibCategory(files, category);
  const visibleDocs = visible.filter((f) => !isImage(f));
  const visiblePhotos = visible.filter(isImage);
  const isTrashCat = category === 'trash';

  const allSections: Section[] = category === 'all'
    ? DOC_LIB_SECTIONS
      .filter((s) => s.key !== 'trash')
      .map((s) => ({ ...s, rows: visible.filter((f) => s.match.includes(fileDocBucket(f))) }))
      .filter((s) => s.rows.length)
    : [{
      key: category,
      label: DOC_LIB_CATEGORIES.find((c) => c.key === category)?.label || 'אחר',
      match: DOC_LIB_SECTIONS.find((s) => s.key === category)?.match || [category],
      rows: visible,
    }];

  const isSurveyorCritical = (f: LibFile) => {
    const bucket = fileDocBucket(f);
    const kind = String(f.doc_kind || '');
    const meta = f.doc_meta || {};
    return (
      bucket === 'surveyor_reports' ||
      kind === 'surveyor_report' ||
      kind === 'surveyor_attachment' ||
      meta.staff_type === 'surveyor_report'
    );
  };

  const handleConfirmTrash = () => {
    if (!confirmTrashFiles || !confirmTrashFiles.length) return;
    if (confirmTrashFiles.length === 1 && onTrash) {
      void onTrash(confirmTrashFiles[0]);
    } else if (onTrashBatch) {
      void onTrashBatch(confirmTrashFiles.map((x) => x.id));
    }
    setConfirmTrashFiles(null);
  };

  const renderSec = (sec: Section) => {
    const images = sec.rows.filter(isImage);
    const docs = sec.rows.filter((f) => !isImage(f));
    const ids = sec.rows.map((f) => f.id);
    return (
      <div key={sec.key} className="doc-lib-sec" data-testid={`docs-sec-${sec.key}`}>
        <div className="doc-lib-sec-h">
          <div className="sdiv-t">{sec.label} · {sec.rows.length}</div>
          <button type="button" className="btn btn-g btn-sm" data-testid={`docs-topic-pick-${sec.key}`} onClick={() => onToggleAll(ids)}>בחר נושא</button>
          {!isTrashCat && (
            <button type="button" className="btn btn-p btn-sm" data-testid={`docs-topic-share-${sec.key}`} onClick={() => onShareTopic(ids)}>שתף נושא זה</button>
          )}
        </div>
        {docs.map((f) => {
          const trashed = isTrashedLibFile(f);
          return (
            <div key={f.id} className="doc-lib-row" data-testid={`doc-file-row`} data-doc-name={f.original_name}>
              <label className="doc-lib-check">
                <input type="checkbox" data-testid={`docs-pick-${f.id}`} checked={picked.includes(f.id)} onChange={() => onToggle(f.id)} />
              </label>
              <div className="doc-lib-main">
                <div className="doc-lib-name">{fileLabel(f)}</div>
                <div className="doc-lib-meta">
                  {trashed ? (
                    <span style={{ color: '#f87171', fontWeight: 600 }}>
                      🗑️ נמחק ע"י {f.doc_meta?.trashed_by_name || 'עובד'} · בתאריך {fmtDay(f.doc_meta?.trashed_at)}
                    </span>
                  ) : (
                    <>{libTypeLabel(f)} · {fmtDay(f.created_at)}</>
                  )}
                </div>
                {!trashed && <DocumentReadNote f={f} onPrepareRead={onPrepareRead} />}
              </div>
              <div className="doc-lib-acts" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" className="btn btn-p btn-sm" data-testid={`docs-preview-${f.id}`} onClick={() => onPreview(f, sec.rows)}>👁️ צפייה</button>
                {!trashed && onWhatsApp && (
                  <button type="button" className="btn btn-sm" data-testid={`docs-wa-${f.id}`} style={{ background: 'rgba(37, 211, 102, 0.16)', color: '#4ade80', borderColor: 'rgba(37, 211, 102, 0.4)' }} onClick={() => onWhatsApp(f)}>💬 WhatsApp</button>
                )}
                {!trashed && onEmail && (
                  <button type="button" className="btn btn-sm" data-testid={`docs-email-${f.id}`} style={{ background: 'rgba(59, 130, 246, 0.16)', color: '#60a5fa', borderColor: 'rgba(59, 130, 246, 0.4)' }} onClick={() => onEmail(f)}>✉️ אימייל</button>
                )}
                <button type="button" className="btn btn-g btn-sm" data-testid={`docs-dl-${f.id}`} onClick={() => onDownload(f)}>📥 הורדה</button>
                <button type="button" className="btn btn-g btn-sm" data-testid={`docs-print-${f.id}`} onClick={() => onPrint(f)}>🖨️ Print</button>
                {!trashed && <DocRename f={f} label={fileLabel(f)} onRename={onRename} />}
                {trashed ? (
                  onRestore && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      data-testid={`docs-restore-${f.id}`}
                      style={{ background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', borderColor: '#22c55e', fontWeight: 700 }}
                      onClick={() => onRestore(f)}
                    >
                      ♻️ שחזר מסל מחזור
                    </button>
                  )
                ) : (
                  onTrash && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      data-testid={`docs-trash-${f.id}`}
                      style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                      onClick={() => setConfirmTrashFiles([f])}
                    >
                      🗑️ מחק
                    </button>
                  )
                )}
              </div>
            </div>
          );
        })}
        {images.length ? (
          <div className="doc-lib-gal" data-testid={`docs-gal-${sec.key}`}>
            {images.map((f) => {
              const trashed = isTrashedLibFile(f);
              return (
                <div key={f.id} className="doc-lib-card" data-testid={`docs-img-${f.id}`}>
                  <label className="doc-lib-check">
                    <input type="checkbox" data-testid={`docs-pick-${f.id}`} checked={picked.includes(f.id)} onChange={() => onToggle(f.id)} />
                    <span>{fileLabel(f)}</span>
                  </label>
                  <button type="button" className="doc-lib-thumb" onClick={() => onPreview(f, images)}>
                    {thumbs[f.id] ? <ClaimImage src={thumbs[f.id]} alt={f.original_name} mime={f.mime_type} /> : <span>📷</span>}
                  </button>
                  <div className="doc-lib-meta">
                    {trashed ? (
                      <span style={{ color: '#f87171', fontSize: 11, fontWeight: 600 }}>
                        🗑️ נמחק ע"י {f.doc_meta?.trashed_by_name || 'עובד'}
                      </span>
                    ) : (
                      <>{libTypeLabel(f)} · {fmtDay(f.created_at)}</>
                    )}
                  </div>
                  {!trashed && <DocumentReadNote f={f} onPrepareRead={onPrepareRead} />}
                  <div className="doc-lib-acts" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <button type="button" className="btn btn-p btn-sm" data-testid={`docs-preview-${f.id}`} onClick={() => onPreview(f, images)}>👁️ צפייה</button>
                    {!trashed && onWhatsApp && (
                      <button type="button" className="btn btn-sm" data-testid={`docs-wa-${f.id}`} style={{ background: 'rgba(37, 211, 102, 0.16)', color: '#4ade80', borderColor: 'rgba(37, 211, 102, 0.4)' }} onClick={() => onWhatsApp(f)}>💬 WhatsApp</button>
                    )}
                    {!trashed && onEmail && (
                      <button type="button" className="btn btn-sm" data-testid={`docs-email-${f.id}`} style={{ background: 'rgba(59, 130, 246, 0.16)', color: '#60a5fa', borderColor: 'rgba(59, 130, 246, 0.4)' }} onClick={() => onEmail(f)}>✉️ אימייל</button>
                    )}
                    <button type="button" className="btn btn-g btn-sm" data-testid={`docs-dl-${f.id}`} onClick={() => onDownload(f)}>📥 הורדה</button>
                    <button type="button" className="btn btn-g btn-sm" onClick={() => onPrint(f)}>🖨️ Print</button>
                    {!trashed && <DocRename f={f} label={fileLabel(f)} onRename={onRename} />}
                    {trashed ? (
                      onRestore && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          data-testid={`docs-restore-${f.id}`}
                          style={{ background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', borderColor: '#22c55e', fontWeight: 700 }}
                          onClick={() => onRestore(f)}
                        >
                          ♻️ שחזר
                        </button>
                      )
                    ) : (
                      onTrash && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          data-testid={`docs-trash-${f.id}`}
                          style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                          onClick={() => setConfirmTrashFiles([f])}
                        >
                          🗑️ מחק
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  };

  const grouped = category === 'all'
    ? DOC_LIB_GROUPS
      .map((g) => ({ ...g, sections: allSections.filter((s) => g.keys.includes(s.key)) }))
      .filter((g) => g.sections.length)
    : [];

  const pickedFiles = files.filter((f) => picked.includes(f.id));
  const hasCriticalInConfirm = (confirmTrashFiles || []).some(isSurveyorCritical);

  return (
    <div className="doc-lib" data-testid="docs-library">
      <div className="doc-lib-cats" data-testid="docs-lib-cats">
        {DOC_LIB_CATEGORIES.map((c) => {
          const n = filesForLibCategory(files, c.key).length;
          return (
            <button
              key={c.key}
              type="button"
              className={`doc-lib-cat ${category === c.key ? 'act' : ''}`}
              data-testid={`docs-cat-${c.key}`}
              onClick={() => onCategory(c.key)}
            >
              {c.label} ({n})
            </button>
          );
        })}
      </div>

      <div className="doc-lib-pickbar" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-g btn-sm" data-testid="docs-lib-all" onClick={() => onToggleAll((category === 'all' ? files.filter((f) => !isTrashedLibFile(f)) : visible).map((f) => f.id))}>
          {category === 'all' ? 'בחר הכל' : 'בחר את כל המוצגים'}
        </button>
        <button type="button" className="btn btn-g btn-sm" data-testid="docs-lib-docs" onClick={() => onToggleAll(visibleDocs.map((f) => f.id))}>כל המסמכים בנושא</button>
        <button type="button" className="btn btn-g btn-sm" data-testid="docs-lib-photos" onClick={() => onToggleAll(visiblePhotos.map((f) => f.id))}>כל התמונות בנושא</button>
        <button type="button" className="btn btn-g btn-sm" data-testid="docs-lib-clear" onClick={() => onToggleAll([])}>נקה בחירה</button>
        
        {isTrashCat && picked.length > 0 && onRestoreBatch && (
          <button
            type="button"
            className="btn btn-sm"
            data-testid="docs-lib-restore-picked"
            style={{ background: 'rgba(34, 197, 94, 0.25)', color: '#4ade80', borderColor: '#22c55e', fontWeight: 700 }}
            onClick={() => void onRestoreBatch(picked)}
          >
            ♻️ שחזר נבחרים ({picked.length})
          </button>
        )}

        {!isTrashCat && picked.length > 0 && onTrashBatch && (
          <button
            type="button"
            className="btn btn-sm"
            data-testid="docs-lib-trash-picked"
            style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.5)', fontWeight: 700 }}
            onClick={() => setConfirmTrashFiles(pickedFiles)}
          >
            🗑️ העבר לסל מחזור ({picked.length})
          </button>
        )}

        <span data-testid="docs-lib-count">נבחרו {picked.length} מתוך {visible.length}</span>
      </div>

      {isTrashCat && (
        <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#fca5a5' }}>
          🗑️ <strong>סל מחזור קבצים ומסמכים:</strong> קבצים אלו הוסרו מהגלריה הפעילה אך נשמרים במלואם. ניתן לשחזר כל קובץ או תמונה בלחיצת כפתור אחת.
        </div>
      )}

      {!visible.length ? <div className="doc-lib-empty" data-testid="docs-lib-empty">{isTrashCat ? 'סל המחזור ריק' : 'אין קבצים בנושא זה'}</div> : null}

      {grouped.length
        ? grouped.map((g) => (
          <div key={g.key} className="doc-lib-group" data-testid={`docs-group-${g.key}`}>
            <div className="doc-lib-group-t">{g.label}</div>
            {g.sections.map(renderSec)}
          </div>
        ))
        : allSections.map(renderSec)}

      {/* מודאל אישור מחיקה רכה לסל מחזור עם אזהרה חמורה לדוחות שמאי וראיות */}
      {confirmTrashFiles && (
        <div
          data-testid="trash-confirm-modal"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            style={{
              background: '#0f172a',
              border: hasCriticalInConfirm ? '2px solid #ef4444' : '1px solid #334155',
              borderRadius: 12,
              padding: 24,
              maxWidth: 520,
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 24 }}>{hasCriticalInConfirm ? '⚠️' : '🗑️'}</span>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: hasCriticalInConfirm ? '#f87171' : '#f8fafc' }}>
                {hasCriticalInConfirm ? 'אזהרה קריטית: מחיקת דוח שמאי / מסמך ראיה' : 'העברה לסל מחזור'}
              </h3>
            </div>

            {hasCriticalInConfirm ? (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 16,
                  color: '#fca5a5',
                  fontSize: 13.5,
                  lineHeight: 1.5,
                }}
              >
                ⚠️ <strong>שים לב:</strong> קובץ זה מוגדר כדוח שמאי או משמש ראיה לחישוב הנזק. העברתו לסל המחזור עלולה להשפיע על אימות השומה והתביעה. האם להמשיך?
              </div>
            ) : (
              <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 16, lineHeight: 1.5 }}>
                האם להעביר {confirmTrashFiles.length === 1 ? `את הקובץ "${confirmTrashFiles[0].original_name}"` : `${confirmTrashFiles.length} קבצים`} לסל המחזור?
                <br />
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  (הקבצים לא יימחקו מהשרת וניתן לשחזר אותם בכל עת מתוך לשונית '🗑️ סל מחזור')
                </span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn btn-g"
                data-testid="cancel-trash-btn"
                onClick={() => setConfirmTrashFiles(null)}
              >
                ביטול
              </button>
              <button
                type="button"
                className="btn"
                data-testid="confirm-trash-btn"
                style={{ background: '#ef4444', color: '#fff', borderColor: '#dc2626', fontWeight: 700 }}
                onClick={handleConfirmTrash}
              >
                🗑️ אשר העברה לסל מחזור
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
