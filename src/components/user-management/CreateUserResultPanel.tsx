import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CreateUserResultReport = {
  userCreated: boolean;
  userId?: string;
  loginEmail: string;
  codeSaved: boolean;
  hadAccessCode: boolean;
  emailRequested: boolean;
  emailSent: boolean;
  resendStatus: number | null;
  resendError: string | null;
  sentToEmailAt: string | null;
  resendDiagnosis: string | null;
  fromAddress: string | null;
  reusedTestUser?: boolean;
  createError?: string;
  codeError?: string;
};

function StatusRow({
  ok,
  label,
  detail,
  warn,
}: {
  ok: boolean | null;
  label: string;
  detail?: string;
  warn?: boolean;
}) {
  const Icon = ok === null ? AlertCircle : ok ? CheckCircle2 : XCircle;
  const color =
    ok === null ? 'text-amber-600' : ok ? 'text-green-600' : warn ? 'text-amber-600' : 'text-destructive';

  return (
    <div className="flex gap-3 p-3 rounded-lg border bg-card">
      <Icon size={20} className={cn('shrink-0 mt-0.5', color)} />
      <div className="min-w-0 space-y-1">
        <p className="font-medium text-sm">{label}</p>
        {detail && (
          <p className="text-xs text-muted-foreground break-words whitespace-pre-wrap" dir="auto">
            {detail}
          </p>
        )}
      </div>
    </div>
  );
}

interface CreateUserResultPanelProps {
  report: CreateUserResultReport;
}

export default function CreateUserResultPanel({ report }: CreateUserResultPanelProps) {
  const headline = report.emailRequested
    ? report.emailSent
      ? 'המשתמש נוצר והקוד נשלח לאימייל בפועל'
      : 'המשתמש נוצר והקוד נשמר, אבל האימייל לא נשלח'
    : report.userCreated
      ? 'המשתמש נוצר בהצלחה'
      : 'יצירת המשתמש נכשלה';

  const headlineOk = report.userCreated && (!report.emailRequested || report.emailSent);

  return (
    <div className="space-y-4 py-1">
      <div
        className={cn(
          'rounded-xl border p-4',
          headlineOk ? 'bg-green-500/10 border-green-500/30' : 'bg-destructive/10 border-destructive/30',
        )}
      >
        <p className={cn('font-bold text-base', headlineOk ? 'text-green-700 dark:text-green-400' : 'text-destructive')}>
          {headline}
        </p>
        {report.emailRequested && !report.emailSent && report.resendError && (
          <p className="text-sm mt-2 text-destructive break-words">{report.resendError}</p>
        )}
        {report.emailRequested && !report.emailSent && report.resendDiagnosis && (
          <p className="text-sm mt-2 text-amber-700 dark:text-amber-400 break-words">{report.resendDiagnosis}</p>
        )}
      </div>

      <p className="text-sm font-bold text-muted-foreground">פירוט בדיקה</p>

      <div className="space-y-2">
        <StatusRow
          ok={report.userCreated}
          label="1. האם המשתמש נוצר"
          detail={
            report.createError
              ? report.createError
              : report.userCreated
                ? `נוצר בהצלחה · ממתין לאישור${report.reusedTestUser ? ' · אימייל בדיקות קיים — עודכן במקום' : ''}${report.userId ? ` · ID: ${report.userId.slice(0, 8)}…` : ''}`
                : undefined
          }
        />

        <StatusRow
          ok={!report.hadAccessCode ? null : report.codeSaved}
          label="2. האם הקוד נשמר"
          detail={
            report.codeError
              ? report.codeError
              : !report.hadAccessCode
                ? 'לא הוגדר קוד גישה'
                : report.codeSaved
                  ? 'הקוד נשמר ב-DB (user_access_codes)'
                  : 'הקוד לא נשמר'
          }
        />

        <StatusRow
          ok={report.emailRequested ? true : report.hadAccessCode ? false : null}
          label="3. האם הייתה בקשה לשליחת אימייל"
          detail={
            report.emailRequested
              ? `כן — לכתובת ${report.loginEmail || '—'}`
              : report.hadAccessCode
                ? 'לא — הקוד נשמר בלבד'
                : 'לא רלוונטי'
          }
        />

        <StatusRow
          ok={!report.emailRequested ? null : report.emailSent}
          label="4. האם Resend אישר שליחה בפועל"
          detail={
            !report.emailRequested
              ? 'לא בוצעה שליחה'
              : report.emailSent
                ? `כן — Resend החזיר HTTP ${report.resendStatus ?? 200}`
                : `לא — Resend status: ${report.resendStatus ?? '—'}`
          }
        />

        <StatusRow
          ok={!report.emailRequested ? null : !report.resendError}
          label="5. סיבת כשלון מ-Resend (אם יש)"
          detail={report.resendError || (report.emailSent ? 'אין — שליחה הצליחה' : 'לא התקבלה הודעת שגיאה')}
          warn={!!report.resendError && !report.emailSent}
        />

        <StatusRow
          ok={!report.emailRequested ? null : !!report.sentToEmailAt}
          label="6. sent_to_email_at ב-DB"
          detail={
            report.sentToEmailAt
              ? `מלא: ${new Date(report.sentToEmailAt).toLocaleString('he-IL')}`
              : 'ריק (null) — האימייל לא אושר כנשלח'
          }
        />

        <StatusRow
          ok={!report.emailRequested ? null : report.resendDiagnosis ? false : report.emailSent ? true : null}
          label="7. נמען לא מאומת / onboarding@resend.dev"
          detail={
            report.resendDiagnosis ||
            (report.fromAddress?.includes('onboarding@resend.dev')
              ? `שולח: ${report.fromAddress}`
              : report.emailSent
                ? 'לא זוהתה בעיה מסוג זה'
                : 'לא זוהתה בעיה ברורה — בדוק Resend Dashboard')
          }
          warn={!!report.resendDiagnosis}
        />
      </div>
    </div>
  );
}
