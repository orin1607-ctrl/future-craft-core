import { useState } from 'react';
import { DEFAULT_INSPECTION_CHECKLIST } from '@/lib/vehicleListDefaults';
import { TRI_FORM_DOWNLOAD_LABEL } from '@/lib/triInspectionFormModel';
import { buildTriInspectionFormPdf } from '@/lib/triInspectionFormPdf';

function sampleSignature(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 120;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#1e3a8a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(24, 78);
  ctx.bezierCurveTo(80, 20, 140, 110, 200, 48);
  ctx.bezierCurveTo(240, 16, 280, 90, 330, 40);
  ctx.stroke();
  return canvas.toDataURL('image/png');
}

/**
 * Staging visual check for the tri/semi download button and PDF.
 * Open: /dev/tri-form-download
 */
export default function DevTriFormDownloadPreview() {
  const [busy, setBusy] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [error, setError] = useState('');

  const download = async () => {
    setBusy(true);
    setError('');
    try {
      const file = await buildTriInspectionFormPdf({
        plate: '12-345-67',
        internalNumber: 'OC-17',
        year: 2019,
        inspectionDate: '2026-08-14',
        nextDueDate: '2026-11-14',
        inspectorName: 'קצין בדיקה',
        overallStatus: 'passed',
        notes: 'קילומטראז׳: 120000\nהרכב נבדק בחניון. אין הערות נוספות מעבר לסעיף הבלמים.',
        signatureSrc: sampleSignature(),
        items: DEFAULT_INSPECTION_CHECKLIST.map((name) => ({
          item_name: name,
          status: name === 'בלמים' ? 'defect' : 'ok',
          notes: name === 'בלמים' ? 'רעש בצד ימין בזמן בלימה' : '',
        })),
        tasks: [{ title: 'בדיקת בלמים', description: 'רעש בצד ימין בזמן בלימה', status: 'open' }],
      });
      const url = URL.createObjectURL(file);
      setPdfUrl(url);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ההורדה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6" dir="rtl">
      <h1 className="text-2xl font-bold mb-2">דוחות · ביקורות קצין רכב · תלת/חצי</h1>
      <p className="text-sm text-muted-foreground mb-4">תצוגת בדיקה באתר הלא פעיל. לא נשמר למסד.</p>
      <div className="card-elevated max-w-xl flex items-center justify-between gap-4">
        <div>
          <p className="font-bold">12-345-67</p>
          <p className="text-sm text-muted-foreground">תלת/חצי שנתית · 14.8.2026 · תקין</p>
        </div>
        <div className="flex flex-col items-start gap-2">
          <button type="button" className="font-bold text-primary underline" data-testid="open-inspection-link">
            פתח ביקורת
          </button>
          <button
            type="button"
            data-testid="download-tri-form"
            className="inline-flex items-center px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-bold disabled:opacity-60"
            disabled={busy}
            onClick={() => { void download(); }}
          >
            {busy ? 'מוריד...' : TRI_FORM_DOWNLOAD_LABEL}
          </button>
        </div>
      </div>
      {error && <p className="text-destructive mt-4">{error}</p>}
      {pdfUrl && (
        <iframe title="טופס תלת חצי" src={pdfUrl} className="mt-6 w-full h-[80vh] border border-border rounded-xl bg-white" />
      )}
    </div>
  );
}
