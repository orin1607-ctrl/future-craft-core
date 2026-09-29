import { useEffect, useRef, useState, type ReactNode } from 'react';

export const LOCK_HINT = 'לא מחובר עדיין בממשק החדש – הפעולה זמינה בממשק הקיים';

/** A write/send action shown in its final place but not connected in stage 1. */
export function Locked({ label, className = 'v2-btn sm', title }: { label: ReactNode; className?: string; title?: string }) {
  return (
    <button type="button" className={`${className} v2-locked`} disabled aria-disabled="true" title={title || LOCK_HINT}>
      {label}<span className="v2-lock" aria-hidden>🔒</span>
    </button>
  );
}

export type MenuItem =
  | { kind: 'action'; label: string; onClick: () => void; hint?: string }
  | { kind: 'locked'; label: string; hint?: string }
  | { kind: 'sep' }
  | { kind: 'title'; label: string };

export function Menu({ label, items, align = 'start', buttonClass = 'v2-btn sm', testId }: {
  label: ReactNode; items: MenuItem[]; align?: 'start' | 'end'; buttonClass?: string; testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="v2-menu-wrap" ref={ref}>
      <button type="button" className={buttonClass} aria-expanded={open} aria-haspopup="menu" data-testid={testId} onClick={() => setOpen((v) => !v)}>{label}</button>
      {open ? (
        <div className={`v2-menu ${align}`} role="menu">
          {items.map((it, i) => {
            if (it.kind === 'sep') return <hr key={i} />;
            if (it.kind === 'title') return <div key={i} className="v2-menu-title">{it.label}</div>;
            if (it.kind === 'locked') {
              return (
                <button key={i} type="button" role="menuitem" disabled title={it.hint || LOCK_HINT} className="v2-locked">
                  <span>{it.label}</span><span className="v2-lock" aria-hidden>🔒</span>
                </button>
              );
            }
            return (
              <button key={i} type="button" role="menuitem" title={it.hint} onClick={() => { setOpen(false); it.onClick(); }}>
                <span>{it.label}</span>
              </button>
            );
          })}
          <div className="v2-menu-foot">🔒 = לא מחובר עדיין (זמין בממשק הקיים)</div>
        </div>
      ) : null}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="v2-ov" role="dialog" aria-label={title} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`v2-dialog${wide ? ' wide' : ''}`}>
        <div className="v2-dh"><h3>{title}</h3><button type="button" className="v2-btn ghost sm" onClick={onClose} aria-label="סגור">✕</button></div>
        <div className="v2-db">{children}</div>
        {footer ? <div className="v2-df">{footer}</div> : null}
      </div>
    </div>
  );
}

/** Clipboard only – never sends anything. */
export function CopyButton({ text, label = 'העתק', className = 'v2-btn sm' }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={className} disabled={!text} onClick={() => {
      void navigator.clipboard?.writeText(text).then(() => { setDone(true); window.setTimeout(() => setDone(false), 1600); }).catch(() => undefined);
    }}>{done ? 'הועתק ✓' : label}</button>
  );
}
