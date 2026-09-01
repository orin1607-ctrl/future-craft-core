import { useEffect, useRef } from 'react';

type Props = {
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
};

export default function SignaturePad({ onChange, disabled }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  const init = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 320;
    const cssH = canvas.clientHeight || 160;
    canvas.width = Math.floor(cssW * ratio);
    canvas.height = Math.floor(cssH * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(ratio, ratio);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  useEffect(() => {
    init();
    const onResize = () => init();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="sig-canvas"
        data-testid="intake-signature"
        style={{ width: '100%', height: 160, touchAction: 'none', border: '1px solid #cbd5e1', borderRadius: 12, background: '#fff' }}
        onPointerDown={(e) => {
          if (disabled) return;
          drawing.current = true;
          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
          const ctx = canvasRef.current?.getContext('2d');
          const p = pos(e);
          ctx?.beginPath();
          ctx?.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current || disabled) return;
          const ctx = canvasRef.current?.getContext('2d');
          const p = pos(e);
          ctx?.lineTo(p.x, p.y);
          ctx?.stroke();
        }}
        onPointerUp={() => {
          drawing.current = false;
          const canvas = canvasRef.current;
          if (canvas) onChange(canvas.toDataURL('image/png'));
        }}
      />
      <button type="button" className="btn btn-g btn-sm" style={{ marginTop: 8 }} disabled={disabled} onClick={() => { init(); onChange(''); }}>נקה חתימה</button>
    </div>
  );
}
