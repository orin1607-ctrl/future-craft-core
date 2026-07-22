import { Eye, X, FileText } from 'lucide-react';
import { resolveStoredDeclarationText } from '@/utils/declarationTemplates';

export interface DeclarationPreviewData {
  driver_name: string;
  id_number?: string | null;
  license_number?: string | null;
  company_name?: string | null;
  declaration_text?: string | null;
  status?: string;
  signature_url?: string | null;
  created_at?: string;
}

function resolvePreviewText(d: DeclarationPreviewData): string {
  return resolveStoredDeclarationText(d.declaration_text, {
    driver_name: d.driver_name,
    id_number: d.id_number,
    license_number: d.license_number,
    company_name: d.company_name,
    date: d.created_at
      ? new Date(d.created_at).toLocaleDateString('he-IL')
      : new Date().toLocaleDateString('he-IL'),
  });
}

interface DeclarationPreviewModalProps {
  declaration: DeclarationPreviewData;
  onClose: () => void;
}

/** Shows the declaration exactly as the driver will see it when signing. */
export default function DeclarationPreviewModal({ declaration, onClose }: DeclarationPreviewModalProps) {
  const displayText = resolvePreviewText(declaration);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="תצוגה מקדימה של התצהיר"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-background border border-border shadow-xl"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-background/95 backdrop-blur">
          <div className="flex items-center gap-2">
            <Eye size={20} className="text-primary" />
            <h2 className="text-lg font-bold">תצוגה מקדימה</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-muted min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="סגור"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            כך ייראה התצהיר לנהג לפני החתימה (כולל הנתונים שהוחלפו).
          </p>

          <div className="flex items-center gap-3">
            <FileText size={24} className="text-primary" />
            <h3 className="text-xl font-bold">תצהיר בעל רישיון נהיגה</h3>
          </div>

          <div className="p-4 rounded-xl bg-muted/30 border border-border">
            <p className="font-bold text-lg mb-1">{declaration.driver_name}</p>
            <p className="text-sm text-muted-foreground">
              ת.ז: {declaration.id_number || '—'} | רישיון: {declaration.license_number || '—'}
            </p>
            {declaration.company_name && (
              <p className="text-sm text-muted-foreground mt-1">{declaration.company_name}</p>
            )}
          </div>

          <div className="p-4 rounded-xl border border-border bg-card text-sm leading-7 whitespace-pre-line">
            {displayText}
          </div>

          {declaration.signature_url ? (
            <div className="p-4 rounded-xl border border-border bg-white">
              <p className="text-sm text-muted-foreground mb-2">חתימת הנהג:</p>
              <img src={declaration.signature_url} alt="חתימה" className="h-20 rounded border bg-white p-1" />
            </div>
          ) : (
            <div className="p-4 rounded-xl border-2 border-dashed border-input bg-muted/20 text-center text-muted-foreground text-sm">
              כאן הנהג יחתום דיגיטלית
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-base font-bold"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}
