import { DOC_LIB_CATEGORIES, DOC_LIB_SECTIONS, fileDocBucket, filesForLibCategory, libTypeLabel } from './claimDocLibrary';

export type LibFile = {
  id: string;
  original_name: string;
  mime_type?: string;
  created_at?: string;
  source?: string;
  doc_kind?: string;
  doc_meta?: Record<string, string> | null;
};

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
};

function fmtDay(iso?: string) {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  return new Date(t).toLocaleDateString('he-IL');
}

export default function ClaimDocsLibrary({
  files, picked, category, thumbs, isImage, fileLabel, onCategory, onToggle, onToggleAll, onPreview, onDownload,
}: Props) {
  const visible = filesForLibCategory(files, category);
  const sections = category === 'all' || category === 'surveyor'
    ? DOC_LIB_SECTIONS.filter((s) => (category === 'surveyor' ? s.match[0].startsWith('surveyor') : true))
      .map((s) => ({ ...s, rows: visible.filter((f) => s.match.includes(fileDocBucket(f))) }))
      .filter((s) => s.rows.length)
    : [{ key: category, label: DOC_LIB_CATEGORIES.find((c) => c.key === category)?.label || 'אחר', match: [category], rows: visible }];

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
            >{c.label}{c.key !== 'all' ? ` (${n})` : ` (${files.length})`}</button>
          );
        })}
      </div>
      <div className="doc-lib-pickbar">
        <button type="button" className="btn btn-g btn-sm" data-testid="docs-lib-all" onClick={() => onToggleAll(visible.map((f) => f.id))}>בחר את כל המוצגים</button>
        <button type="button" className="btn btn-g btn-sm" data-testid="docs-lib-clear" onClick={() => onToggleAll([])}>נקה בחירה</button>
        <span data-testid="docs-lib-count">נבחרו {picked.length} מתוך {files.length}</span>
      </div>
      {!visible.length ? <div className="doc-lib-empty" data-testid="docs-lib-empty">אין קבצים בקטגוריה זו</div> : null}
      {sections.map((sec) => {
        const images = sec.rows.filter(isImage);
        const docs = sec.rows.filter((f) => !isImage(f));
        return (
          <div key={sec.key} className="doc-lib-sec" data-testid={`docs-sec-${sec.key}`}>
            <div className="sdiv"><div className="sdiv-t">{sec.label} · {sec.rows.length}</div><div className="sdiv-l" /></div>
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
                      <button type="button" className="btn btn-p btn-sm" onClick={() => onPreview(f, images)}>Preview</button>
                      <button type="button" className="btn btn-g btn-sm" onClick={() => onDownload(f)}>Download</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
