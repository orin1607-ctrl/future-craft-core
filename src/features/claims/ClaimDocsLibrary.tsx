import { useState } from 'react';
import { DOC_LIB_CATEGORIES, DOC_LIB_GROUPS, DOC_LIB_SECTIONS, fileDocBucket, filesForLibCategory, libTypeLabel } from './claimDocLibrary';

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
  onShareTopic: (ids: string[]) => void;
  onRename: (f: LibFile, title: string) => void;
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

export default function ClaimDocsLibrary({
  files, picked, category, thumbs, isImage, fileLabel, onCategory, onToggle, onToggleAll, onPreview, onDownload, onPrint, onShareTopic, onRename,
}: Props) {
  const visible = filesForLibCategory(files, category);
  const visibleDocs = visible.filter((f) => !isImage(f));
  const visiblePhotos = visible.filter(isImage);
  const allSections: Section[] = category === 'all'
    ? DOC_LIB_SECTIONS
      .map((s) => ({ ...s, rows: visible.filter((f) => s.match.includes(fileDocBucket(f))) }))
      .filter((s) => s.rows.length)
    : [{
      key: category,
      label: DOC_LIB_CATEGORIES.find((c) => c.key === category)?.label || 'אחר',
      match: DOC_LIB_SECTIONS.find((s) => s.key === category)?.match || [category],
      rows: visible,
    }];

  const renderSec = (sec: Section) => {
    const images = sec.rows.filter(isImage);
    const docs = sec.rows.filter((f) => !isImage(f));
    const ids = sec.rows.map((f) => f.id);
    return (
      <div key={sec.key} className="doc-lib-sec" data-testid={`docs-sec-${sec.key}`}>
        <div className="doc-lib-sec-h">
          <div className="sdiv-t">{sec.label} · {sec.rows.length}</div>
          <button type="button" className="btn btn-g btn-sm" data-testid={`docs-topic-pick-${sec.key}`} onClick={() => onToggleAll(ids)}>בחר נושא</button>
          <button type="button" className="btn btn-p btn-sm" data-testid={`docs-topic-share-${sec.key}`} onClick={() => onShareTopic(ids)}>שתף נושא זה</button>
        </div>
        {docs.map((f) => (
          <div key={f.id} className="doc-lib-row" data-testid={`doc-file-row`} data-doc-name={f.original_name}>
            <label className="doc-lib-check">
              <input type="checkbox" data-testid={`docs-pick-${f.id}`} checked={picked.includes(f.id)} onChange={() => onToggle(f.id)} />
            </label>
            <div className="doc-lib-main">
              <div className="doc-lib-name">{fileLabel(f)}</div>
              <div className="doc-lib-meta">{libTypeLabel(f)} · {fmtDay(f.created_at)}</div>
            </div>
            <div className="doc-lib-acts">
              <button type="button" className="btn btn-p btn-sm" data-testid={`docs-preview-${f.id}`} onClick={() => onPreview(f, sec.rows)}>Preview</button>
              <button type="button" className="btn btn-g btn-sm" data-testid={`docs-dl-${f.id}`} onClick={() => onDownload(f)}>Download</button>
              <button type="button" className="btn btn-g btn-sm" data-testid={`docs-print-${f.id}`} onClick={() => onPrint(f)}>Print</button>
              <DocRename f={f} label={fileLabel(f)} onRename={onRename} />
            </div>
          </div>
        ))}
        {images.length ? (
          <div className="doc-lib-gal" data-testid={`docs-gal-${sec.key}`}>
            {images.map((f) => (
              <div key={f.id} className="doc-lib-card" data-testid={`docs-img-${f.id}`}>
                <label className="doc-lib-check">
                  <input type="checkbox" data-testid={`docs-pick-${f.id}`} checked={picked.includes(f.id)} onChange={() => onToggle(f.id)} />
                  <span>{fileLabel(f)}</span>
                </label>
                <button type="button" className="doc-lib-thumb" onClick={() => onPreview(f, images)}>
                  {thumbs[f.id] ? <img src={thumbs[f.id]} alt={f.original_name} /> : <span>📷</span>}
                </button>
                <div className="doc-lib-meta">{libTypeLabel(f)} · {fmtDay(f.created_at)}</div>
                <div className="doc-lib-acts">
                  <button type="button" className="btn btn-p btn-sm" data-testid={`docs-preview-${f.id}`} onClick={() => onPreview(f, images)}>Preview</button>
                  <button type="button" className="btn btn-g btn-sm" data-testid={`docs-dl-${f.id}`} onClick={() => onDownload(f)}>Download</button>
                  <button type="button" className="btn btn-g btn-sm" onClick={() => onPrint(f)}>Print</button>
                  <DocRename f={f} label={fileLabel(f)} onRename={onRename} />
                </div>
              </div>
            ))}
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
              >{c.label} ({n})</button>
          );
        })}
      </div>
      <div className="doc-lib-pickbar">
        <button type="button" className="btn btn-g btn-sm" data-testid="docs-lib-all" onClick={() => onToggleAll((category === 'all' ? files : visible).map((f) => f.id))}>{category === 'all' ? 'בחר הכל' : 'בחר את כל המוצגים'}</button>
        <button type="button" className="btn btn-g btn-sm" data-testid="docs-lib-docs" onClick={() => onToggleAll(visibleDocs.map((f) => f.id))}>כל המסמכים בנושא</button>
        <button type="button" className="btn btn-g btn-sm" data-testid="docs-lib-photos" onClick={() => onToggleAll(visiblePhotos.map((f) => f.id))}>כל התמונות בנושא</button>
        <button type="button" className="btn btn-g btn-sm" data-testid="docs-lib-clear" onClick={() => onToggleAll([])}>נקה בחירה</button>
        <span data-testid="docs-lib-count">נבחרו {picked.length} מתוך {files.length}</span>
      </div>
      {!visible.length ? <div className="doc-lib-empty" data-testid="docs-lib-empty">אין קבצים בנושא זה</div> : null}
      {grouped.length
        ? grouped.map((g) => (
          <div key={g.key} className="doc-lib-group" data-testid={`docs-group-${g.key}`}>
            <div className="doc-lib-group-t">{g.label}</div>
            {g.sections.map(renderSec)}
          </div>
        ))
        : allSections.map(renderSec)}
    </div>
  );
}
