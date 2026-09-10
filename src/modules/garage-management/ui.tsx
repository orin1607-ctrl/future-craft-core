import { useEffect, useRef, type ReactNode } from 'react';
import type { GarageCase } from './types';
import { STATUS_META } from './logic';

export function Shell({
  title,
  sub,
  onBack,
  extra,
  pin,
  children,
  footer,
}: {
  title: string;
  sub?: string;
  onBack?: () => void;
  extra?: ReactNode;
  pin?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      <header className="app-header">
        <div className="top-row">
          {onBack ? (
            <button type="button" className="back" onClick={onBack} aria-label="חזרה">
              →
            </button>
          ) : (
            <span style={{ width: 30 }} />
          )}
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div className="app-title">{title}</div>
            {sub ? <div className="app-sub">{sub}</div> : null}
          </div>
          <div style={{ width: 30, display: 'flex', justifyContent: 'center' }}>{extra}</div>
        </div>
        {pin}
      </header>
      <div className="app-body">{children}</div>
      {footer ? <div className="app-footer">{footer}</div> : null}
    </>
  );
}

export function StatusPin({ c, meta }: { c: GarageCase; meta?: string }) {
  const st = STATUS_META[c.status];
  return (
    <div className="status-pin">
      <div>
        <div className="case-no">
          {c.customer.companyName || c.customer.name} · {c.vehicle.plate}
        </div>
        <div className="case-meta">{meta || `${c.worker} · נפתח ${c.openedAt.slice(5).replace('-', '/')}`}</div>
      </div>
      <span className={`badge ${st.badge}`}>{st.label}</span>
    </div>
  );
}

export function IdPin({ c }: { c: GarageCase }) {
  const current = c.orders[0];
  return (
    <div className="id-pin">
      <div className="id-row">
        <span>חברה / לקוח</span>
        <b>{c.customer.companyName || c.customer.name}</b>
      </div>
      <div className="id-grid">
        <div>
          <span>מס' רכב</span>
          <b>{c.vehicle.plate}</b>
        </div>
        <div>
          <span>סוג רכב</span>
          <b>{c.vehicle.type || '—'}</b>
        </div>
        <div>
          <span>מס' תיק</span>
          <b>#{c.number}</b>
        </div>
        <div>
          <span>יצרן / דגם</span>
          <b>
            {c.vehicle.manufacturer} {c.vehicle.model}
          </b>
        </div>
        <div>
          <span>מס' הזמנה</span>
          <b className={current ? undefined : 'muted'}>{current ? `${current.number} (V${current.version})` : 'טרם התקבל'}</b>
        </div>
        <div>
          <span>עובד</span>
          <b>{c.worker}</b>
        </div>
        <div>
          <span>תאריך</span>
          <b>{c.openedAt.split('-').reverse().join('/')}</b>
        </div>
        <div>
          <span>סטטוס</span>
          <b>{STATUS_META[c.status].label}</b>
        </div>
      </div>
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  textarea,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
  type?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </div>
  );
}

export function HiddenCapture({
  id,
  onFile,
}: {
  id: string;
  onFile: (file: File) => void;
}) {
  return (
    <input
      id={id}
      className="hidden-file"
      type="file"
      accept="image/*"
      capture="environment"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) onFile(file);
        e.target.value = '';
      }}
    />
  );
}

export function SignaturePad({
  value,
  onChange,
}: {
  value?: string;
  onChange: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * 2;
      canvas.height = rect.height * 2;
      ctx.scale(2, 2);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      if (value) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
        img.src = value;
      }
    };
    resize();
  }, [value]);

  const pos = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <canvas
      ref={canvasRef}
      className="signpad"
      onPointerDown={(e) => {
        drawing.current = true;
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        const p = pos(e);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drawing.current) return;
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        const p = pos(e);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }}
      onPointerUp={() => {
        drawing.current = false;
        const canvas = canvasRef.current;
        if (canvas) onChange(canvas.toDataURL('image/png'));
      }}
    />
  );
}
