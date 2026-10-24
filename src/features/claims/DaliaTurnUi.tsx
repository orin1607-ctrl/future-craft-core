// Interactive pieces under Dalia's garage voice turns: answer buttons, camera/upload buttons,
// summary cards, reports, the close-case checklist — and the collapsible list drawer.
// Pure presentation: every action goes back to the workspace through callbacks.
import { useMemo, useState } from 'react';
import type { VoiceUi } from './daliaVoiceEngine';
import type { ReportCard, ReportRow } from './daliaReports';

export interface DaliaDrawerData {
  title: string;
  rows: ReportRow[];
  summary?: ReportCard[];
  notes?: string[];
}

function Cards({ cards }: { cards: ReportCard[] }) {
  return (
    <div className="dalia-cards" data-testid="dalia-summary-cards">
      {cards.map((c) => (
        <div key={c.label} className="dalia-card">
          <span className="dalia-card-label">{c.label}</span>
          <strong className="dalia-card-value">{c.value}</strong>
          {c.hint ? <span className="dalia-card-hint">{c.hint}</span> : null}
        </div>
      ))}
    </div>
  );
}

export function DaliaTurnUi({
  ui,
  active,
  onAnswer,
  onUpload,
  onOpenDrawer,
  onRestart,
}: {
  ui: VoiceUi[];
  /** Answer and upload buttons work only on the latest turn. */
  active: boolean;
  onAnswer: (text: string) => void;
  onUpload: (camera: boolean) => void;
  onOpenDrawer: (data: DaliaDrawerData) => void;
  onRestart: (type: 'reports') => void;
}) {
  return (
    <div className="dalia-turn-ui" data-testid="dalia-turn-ui">
      {ui.map((u, idx) => {
        if (u.type === 'choices') {
          return (
            <div key={idx} className="dalia-chips" role="group" aria-label="תשובות מהירות">
              {u.options.map((o) => (
                <button
                  key={o.label}
                  type="button"
                  className="dalia-chip"
                  data-testid="dalia-choice"
                  disabled={!active}
                  onClick={() => onAnswer(o.answer)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          );
        }
        if (u.type === 'upload') {
          return (
            <div key={idx} className="dalia-chips" role="group" aria-label={u.label}>
              <button type="button" className="dalia-chip primary" data-testid="dalia-upload-camera" disabled={!active} onClick={() => onUpload(true)}>
                📷 צלם · {u.label}
              </button>
              <button type="button" className="dalia-chip" data-testid="dalia-upload-file" disabled={!active} onClick={() => onUpload(false)}>
                🖼️ העלה קובץ
              </button>
              {u.skipLabel ? (
                <button type="button" className="dalia-chip" disabled={!active} onClick={() => onAnswer(u.skipAnswer || u.skipLabel!)}>
                  {u.skipLabel}
                </button>
              ) : null}
            </div>
          );
        }
        if (u.type === 'list') {
          return (
            <div key={idx} className="dalia-list-summary" data-testid="dalia-list-summary">
              {u.summary?.length ? <Cards cards={u.summary} /> : null}
              {u.rows.length ? (
                <button
                  type="button"
                  className="dalia-chip primary"
                  data-testid="dalia-open-list"
                  onClick={() => onOpenDrawer({ title: u.title, rows: u.rows, summary: u.summary, notes: u.notes })}
                >
                  📂 הצג את כל {u.title.includes('תיק') ? 'התיקים' : 'הרשומות'} ({u.rows.length})
                </button>
              ) : null}
            </div>
          );
        }
        if (u.type === 'report') {
          const r = u.result;
          return (
            <div key={idx} className="dalia-report" data-testid="dalia-report">
              <div className="dalia-report-head">
                <strong>{r.title}</strong>
                <span>{r.periodLabel}</span>
              </div>
              <Cards cards={r.cards} />
              {r.notes.length ? (
                <ul className="dalia-report-notes">
                  {r.notes.map((n) => <li key={n}>{n}</li>)}
                </ul>
              ) : null}
              <div className="dalia-chips">
                {r.rows.length ? (
                  <button type="button" className="dalia-chip primary" data-testid="dalia-report-details" onClick={() => onOpenDrawer({ title: `${r.title} · ${r.periodLabel}`, rows: r.rows, summary: r.cards })}>
                    📄 הצג פירוט ({r.rows.length})
                  </button>
                ) : null}
                <button type="button" className="dalia-chip" data-testid="dalia-report-refilter" onClick={() => onRestart('reports')}>
                  🔎 שנה סינון
                </button>
              </div>
            </div>
          );
        }
        if (u.type === 'checklist') {
          const icon = { ok: '✅', missing: '❌', ask: '❔', info: 'ℹ️' } as const;
          return (
            <div key={idx} className="dalia-checklist" data-testid="dalia-checklist">
              <strong>{u.title}</strong>
              <ul>
                {u.items.map((it) => (
                  <li key={it.label} className={`state-${it.state}`}>
                    <span aria-hidden="true">{icon[it.state]}</span>
                    <span>{it.label}</span>
                    {it.note ? <small>{it.note}</small> : null}
                  </li>
                ))}
              </ul>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

/** Collapsible list panel between the conversation and the composer — never covers the composer. */
export function DaliaDrawer({
  data,
  onClose,
  onOpenCase,
}: {
  data: DaliaDrawerData;
  onClose: () => void;
  onOpenCase?: (caseId: string) => void;
}) {
  const [filter, setFilter] = useState('');
  const rows = useMemo(() => {
    const q = filter.trim();
    if (!q) return data.rows;
    return data.rows.filter((r) => `${r.title} ${r.subtitle || ''} ${r.amount || ''}`.includes(q));
  }, [data.rows, filter]);
  return (
    <section className="dalia-drawer" data-testid="dalia-drawer" aria-label={data.title}>
      <header className="dalia-drawer-head">
        <strong>{data.title}</strong>
        <span className="dalia-drawer-count">{rows.length} מתוך {data.rows.length}</span>
        <button type="button" className="dalia-drawer-close" data-testid="dalia-drawer-close" onClick={onClose} aria-label="סגור רשימה וחזור לשיחה">
          ✕ סגור רשימה
        </button>
      </header>
      {data.rows.length > 8 ? (
        <input
          className="dalia-drawer-filter"
          data-testid="dalia-drawer-filter"
          placeholder="סינון לפי לקוח, רכב או מספר תיק…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          dir="rtl"
        />
      ) : null}
      <ul className="dalia-drawer-list">
        {rows.map((r) => (
          <li key={r.id} className="dalia-drawer-row">
            <div className="dalia-drawer-row-text">
              <strong>{r.title}</strong>
              {r.subtitle ? <span>{r.subtitle}</span> : null}
            </div>
            {r.amount ? <span className="dalia-drawer-amount">{r.amount}</span> : null}
            {r.caseId && onOpenCase ? (
              <button type="button" className="dalia-chip" data-testid="dalia-open-case" onClick={() => onOpenCase(r.caseId!)}>
                פתח תיק
              </button>
            ) : null}
          </li>
        ))}
        {!rows.length ? <li className="dalia-drawer-empty">אין רשומות מתאימות.</li> : null}
      </ul>
    </section>
  );
}
