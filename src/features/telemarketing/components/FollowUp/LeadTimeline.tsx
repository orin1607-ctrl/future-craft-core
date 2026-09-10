import { useEffect, useState } from 'react';
import { getLeadHistory } from '@/features/telemarketing/services/telemarketingService';
import { getWorkSessionsForLead } from '@/features/telemarketing/services/workSessionService';
import { PlayRecordingButton } from '@/features/telemarketing/components/AdminDashboard/PlayRecordingButton';
import { DaliaCareLeadEvents } from '@/features/telemarketing/components/DaliaCare/DaliaCareLeadEvents';
import { TimeStampLines } from '@/features/telemarketing/components/TimeStampMeta';
import { formatStamp } from '@/features/telemarketing/lib/formatTime';
import { formatLeadTitle } from '@/features/telemarketing/lib/leadLabel';
import type { FollowUpWorkItem, TelemarketingCall, TelemarketingWorkSession } from '@/features/telemarketing/types';

export function LeadTimeline({
  followUp,
  onStartReturn,
  showStartButton,
  startLocked,
  actor,
}: {
  followUp: FollowUpWorkItem;
  onStartReturn?: (item: FollowUpWorkItem) => void;
  showStartButton?: boolean;
  startLocked?: boolean;
  actor?: { id: string; displayName: string; isAdmin?: boolean };
}) {
  const [history, setHistory] = useState<TelemarketingCall[]>([]);
  const [work, setWork] = useState<TelemarketingWorkSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      getLeadHistory(followUp.phone, followUp.companyName),
      getWorkSessionsForLead(followUp.phone, followUp.companyName),
    ]).then(([calls, sessions]) => {
      if (!cancelled) {
        setHistory(calls);
        setWork(sessions);
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
        <Field label="מספר ליד" value={followUp.leadNumber ? `#${followUp.leadNumber}` : undefined} />
        <Field label="חברה" value={followUp.companyName} />
        <Field label="איש קשר" value={followUp.contactName} />
        <Field label="טלפון" value={followUp.phone} />
        <Field label="נציג" value={followUp.employeeName} />
        <Field label="נוצר" value={formatStamp(followUp.createdAt)} />
        <Field label="מועד חזרה" value={`${followUp.dueDate}${followUp.dueTime ? ` ${followUp.dueTime}` : ''}`} />
        {followUp.completedAt && <Field label="הושלם" value={formatStamp(followUp.completedAt)} />}
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
                שיחה {index + 1} · {formatLeadTitle(c.leadNumber || followUp.leadNumber, c.companyName)} · {c.result || 'ללא תוצאה'}
              </p>
              <TimeStampLines startedAt={c.startedAt} endedAt={c.endedAt} durationSeconds={c.durationSeconds} employeeName={c.employeeName} />
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

      {work.length > 0 && (
        <div>
          <h4 className="mb-2 font-bold">משימות עבודה על הלקוח</h4>
          <ol className="space-y-2">
            {work.map((session) => (
              <li key={session.id} className="rounded-xl border border-border bg-background p-3">
                <p className="font-bold">{session.taskType || 'משימה'}</p>
                <TimeStampLines startedAt={session.startedAt} endedAt={session.endedAt} durationSeconds={session.durationSeconds} employeeName={session.employeeName} />
                {session.description && <p className="mt-1">{session.description}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}

      <DaliaCareLeadEvents
        phone={followUp.phone}
        companyName={followUp.companyName}
        contactName={followUp.contactName}
        callId={followUp.callId}
        followupId={followUp.id}
        lastCallSummary={followUp.lastSummary || undefined}
        actor={actor || { id: followUp.employeeId, displayName: followUp.employeeName, isAdmin: false }}
        ownerAgent={{ id: followUp.employeeId, displayName: followUp.employeeName }}
      />

      {showStartButton && followUp.status === 'open' && onStartReturn && (
        <button
          type="button"
          data-testid="tele-continue-lead"
          onClick={() => onStartReturn(followUp)}
          disabled={startLocked}
          title={startLocked ? 'עבור למצב עבודה' : undefined}
          className="flex min-h-14 w-full items-center justify-center rounded-xl bg-emerald-600 py-4 text-lg font-bold text-white disabled:opacity-50"
        >
          {startLocked ? 'התחל המשך טיפול — עבור למצב עבודה' : 'התחל המשך טיפול'}
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
