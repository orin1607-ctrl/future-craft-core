import { useEffect, useState } from 'react';
import { getLeadHistory } from '@/features/telemarketing/services/telemarketingService';
import { PlayRecordingButton } from '@/features/telemarketing/components/AdminDashboard/PlayRecordingButton';
import type { FollowUpWorkItem, TelemarketingCall } from '@/features/telemarketing/types';

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '-';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function LeadTimeline({
  followUp,
  onStartReturn,
  showStartButton,
}: {
  followUp: FollowUpWorkItem;
  onStartReturn?: (item: FollowUpWorkItem) => void;
  showStartButton?: boolean;
}) {
  const [history, setHistory] = useState<TelemarketingCall[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getLeadHistory(followUp.phone, followUp.companyName).then((rows) => {
      if (!cancelled) {
        setHistory(rows);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [followUp.phone, followUp.companyName]);

  return (
    <div className="space-y-3 text-sm">
      <dl className="grid grid-cols-2 gap-2">
        <Field label="חברה" value={followUp.companyName} />
        <Field label="איש קשר" value={followUp.contactName} />
        <Field label="טלפון" value={followUp.phone} />
        <Field label="נציג" value={followUp.employeeName} />
        <Field label="מועד חזרה" value={`${followUp.dueDate}${followUp.dueTime ? ` ${followUp.dueTime}` : ''}`} />
        <Field label="דחיפות" value={followUp.urgency} />
        <Field label="תוצאה אחרונה" value={followUp.lastResult ?? undefined} />
      </dl>
      {followUp.lastSummary && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground">סיכום השיחה האחרונה</p>
          <p>{followUp.lastSummary}</p>
        </div>
      )}
      {followUp.actionNeeded && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground">מה צריך לבצע</p>
          <p className="font-semibold">{followUp.actionNeeded}</p>
        </div>
      )}

      <div>
        <h4 className="mb-2 font-bold">היסטוריית שיחות</h4>
        {loading && <p className="text-muted-foreground">טוען היסטוריה...</p>}
        {!loading && history.length === 0 && <p className="text-muted-foreground">אין שיחות קודמות</p>}
        <ol className="space-y-2">
          {history.map((c, index) => (
            <li key={c.id} className="rounded-xl border border-border bg-background p-3">
              <p className="font-bold">
                שיחה {index + 1} · {c.startedAt.slice(0, 10)} · {c.employeeName}
              </p>
              <p className="text-muted-foreground">
                {new Date(c.startedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                {c.endedAt
                  ? ` - ${new Date(c.endedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`
                  : ''}{' '}
                · משך {formatDuration(c.durationSeconds)} · {c.result || 'ללא תוצאה'}
              </p>
              {c.summary && <p className="mt-1">{c.summary}</p>}
              {c.recordingStatus === 'ready' && c.recordingPath && (
                <div className="mt-2">
                  <PlayRecordingButton path={c.recordingPath} />
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>

      {showStartButton && followUp.status === 'open' && onStartReturn && (
        <button
          type="button"
          onClick={() => onStartReturn(followUp)}
          className="flex min-h-14 w-full items-center justify-center rounded-xl bg-emerald-600 py-4 text-lg font-bold text-white"
        >
          התחל שיחת חזרה
        </button>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
