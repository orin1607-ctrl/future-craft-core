import { useState } from 'react';
import { FileText } from 'lucide-react';
import { DocumentCard, DocumentGallery, DocumentPreviewDialog } from '@/components/documents/DocumentViewer';

const storageBase = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/documents/qa-samples`;

const SAMPLES = {
  pdf: {
    url: `${storageBase}/sample.pdf`,
    name: 'qa-sample.pdf',
    label: 'PDF — רישיון נהיגה',
  },
  jpg: {
    url: `${storageBase}/sample.jpg`,
    name: 'qa-sample.jpg',
    label: 'JPG — ביטוח חובה',
  },
  png: {
    url: `${storageBase}/sample.png`,
    name: 'qa-sample.png',
    label: 'PNG — טסט',
  },
};

/** תצוגת QA — רכיבי מסמך (ללא התחברות) */
export default function DevDocumentUxPreview() {
  const [preview, setPreview] = useState<{ url: string; fileName: string } | null>(null);

  return (
    <div className="min-h-screen bg-background p-4 max-w-3xl mx-auto space-y-4" dir="rtl">
      <div className="bg-emerald-700 text-white text-center text-xs font-bold py-2 px-3 rounded-lg">
        QA Preview — תצוגת מסמכים · Staging UI · commit 5413c88
      </div>
      <h1 className="page-header flex items-center gap-3 !mb-2">
        <FileText size={28} /> מסמכים — תצוגת QA
      </h1>
      <p className="text-muted-foreground text-sm mb-2">Thumbnail / PDF icon / שם קובץ / צפייה / הורדה</p>

      <DocumentCard url={SAMPLES.pdf.url} fileName={SAMPLES.pdf.name} label={SAMPLES.pdf.label} />
      <DocumentCard url={SAMPLES.jpg.url} fileName={SAMPLES.jpg.name} label={SAMPLES.jpg.label} />
      <DocumentCard url={SAMPLES.png.url} fileName={SAMPLES.png.name} label={SAMPLES.png.label} />

      <DocumentGallery urls={[SAMPLES.jpg.url, SAMPLES.png.url]} title="גלריית תמונות (תקלה / תאונה)" />

      <button
        type="button"
        className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-medium"
        onClick={() => setPreview({ url: SAMPLES.pdf.url, fileName: SAMPLES.pdf.name })}
      >
        פתח תצוגת PDF מלאה
      </button>

      <DocumentPreviewDialog
        open={!!preview}
        url={preview?.url ?? null}
        fileName={preview?.fileName}
        onOpenChange={(open) => { if (!open) setPreview(null); }}
      />
    </div>
  );
}
