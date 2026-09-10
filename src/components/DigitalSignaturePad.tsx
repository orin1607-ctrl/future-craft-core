import { useCallback, useEffect, useRef, useState } from 'react';

type Props = {
  onChange: (dataUrl: string, hasStroke: boolean) => void;
  disabled?: boolean;
  testId?: string;
};

/**
 * Mouse (desktop) and finger/stylus (mobile) signature pad.
 * While the pointer is down on the canvas, page scrolling is locked.
 */
export default function DigitalSignaturePad({
  onChange,
  disabled,
  testId = 'digital-signature-pad',
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasStroke = useRef(false);
  const [drawingUi, setDrawingUi] = useState(false);

  const init = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 320;
    const cssH = canvas.clientHeight || 180;
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
    hasStroke.current = false;
  }, []);

  useEffect(() => {
    init();
    const onResize = () => init();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [init]);

  useEffect(() => {
    if (!drawingUi) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    const prevTouch = body.style.touchAction;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.touchAction = 'none';
    const blockScroll = (e: TouchEvent) => {
      if (drawing.current) e.preventDefault();
    };
    document.addEventListener('touchmove', blockScroll, { passive: false });
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
      body.style.touchAction = prevTouch;
      document.removeEventListener('touchmove', blockScroll);
    };
  }, [drawingUi]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const emit = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(hasStroke.current ? canvas.toDataURL('image/png') : '', hasStroke.current);
  };

  return (
    <div data-testid={testId} className="space-y-2">
      <div
        className="rounded-xl border-2 border-input bg-white overflow-hidden"
        style={{ touchAction: 'none', overscrollBehavior: 'none' }}
      >
        <canvas
          ref={canvasRef}
          className="block w-full touch-none"
          style={{ height: 180, touchAction: 'none', background: '#fff', cursor: disabled ? 'not-allowed' : 'crosshair' }}
          onPointerDown={(e) => {
            if (disabled) return;
            e.preventDefault();
            drawing.current = true;
            setDrawingUi(true);
            (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
            const ctx = canvasRef.current?.getContext('2d');
            const p = pos(e);
            ctx?.beginPath();
            ctx?.moveTo(p.x, p.y);
          }}
          onPointerMove={(e) => {
            if (!drawing.current || disabled) return;
            e.preventDefault();
            const ctx = canvasRef.current?.getContext('2d');
            const p = pos(e);
            ctx?.lineTo(p.x, p.y);
            ctx?.stroke();
            hasStroke.current = true;
          }}
          onPointerUp={() => {
            drawing.current = false;
            setDrawingUi(false);
            emit();
          }}
          onPointerCancel={() => {
            drawing.current = false;
            setDrawingUi(false);
            emit();
          }}
        />
      </div>
      <button
        type="button"
        disabled={disabled}
        className="text-sm text-primary font-medium underline min-h-[44px]"
        onClick={() => {
          init();
          onChange('', false);
        }}
      >
        נקה חתימה
      </button>
    </div>
  );
}
