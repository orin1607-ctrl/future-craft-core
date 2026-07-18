import { CheckCircle2, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatIsraelDateTime } from '@/lib/incidentEventNumber';

export type IncidentSubmitSuccessProps = {
  kind: 'fault' | 'accident';
  eventNumber: string;
  createdAt?: string | null;
  statusLabel?: string;
  viewPath: string;
  onClose: () => void;
  whatsappPreview?: string;
  emailSubject?: string;
  emailHtml?: string;
  showNotifyPreview?: boolean;
};

export default function IncidentSubmitSuccess({
  kind,
  eventNumber,
  createdAt,
  statusLabel = 'חדש',
  viewPath,
  onClose,
  whatsappPreview,
  emailSubject,
  emailHtml,
  showNotifyPreview = true,
}: IncidentSubmitSuccessProps) {
  const title = kind === 'fault' ? 'דיווח התקלה התקבל' : 'דיווח התאונה התקבל';

  return (
    <div className="animate-fade-in space-y-5">
      <div className="card-elevated text-center py-8 px-4">
        <CheckCircle2 className="mx-auto text-primary mb-3" size={48} />
        <h1 className="text-2xl font-bold mb-2">{title}</h1>
        <p className="text-muted-foreground mb-4">נציג יחזור אליך בהקדם.</p>
        <div className="rounded-2xl bg-muted/40 p-4 text-right space-y-2 max-w-md mx-auto">
          <p>
            <span className="text-muted-foreground">מספר אירוע: </span>
            <span className="font-bold text-lg tracking-wide">{eventNumber}</span>
          </p>
          <p>
            <span className="text-muted-foreground">תאריך ושעה: </span>
            {formatIsraelDateTime(createdAt)}
          </p>
          <p>
            <span className="text-muted-foreground">סטטוס: </span>
            {statusLabel}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
          <Link
            to={viewPath}
            className="inline-flex items-center justify-center gap-2 min-h-[48px] px-5 rounded-xl bg-primary text-primary-foreground font-medium"
          >
            צפייה באירוע <ExternalLink size={18} />
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] px-5 rounded-xl border-2 border-input font-medium"
          >
            סיום
          </button>
        </div>
      </div>

      {showNotifyPreview && (whatsappPreview || emailHtml) && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold">תצוגה מקדימה של התראות (לא נשלח)</h2>
          <p className="text-sm text-muted-foreground">
            שליחה אמיתית למייל/WhatsApp כבויה בבדיקה. לאחר אישורך ניתן להפעיל שליחת Staging.
          </p>
          {whatsappPreview && (
            <div className="card-elevated">
              <p className="font-semibold mb-2">WhatsApp Preview</p>
              <pre className="whitespace-pre-wrap text-sm bg-muted/30 rounded-xl p-4 text-right" dir="rtl">
                {whatsappPreview}
              </pre>
            </div>
          )}
          {emailSubject && (
            <div className="card-elevated">
              <p className="font-semibold mb-1">Email Preview</p>
              <p className="text-sm text-muted-foreground mb-2">נושא: {emailSubject}</p>
              {emailHtml && (
                <div
                  className="rounded-xl border border-border p-4 bg-background text-sm"
                  dangerouslySetInnerHTML={{ __html: emailHtml }}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
