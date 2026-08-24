import { useEffect, useState } from 'react';
import {
  formatOpenDuration,
  getTeamChatById,
  getTeamMessages,
  isChatClosed,
  markTeamChatRead,
  sendTeamMessage,
  updateTeamChatStatus,
} from '@/features/telemarketing/services/teamChatService';
import { TEAM_CHAT_STATUSES } from '@/features/telemarketing/types';
import { TimeStampLines } from '@/features/telemarketing/components/TimeStampMeta';
import { formatStamp } from '@/features/telemarketing/lib/formatTime';
import type { TeamChat, TeamChatMessage, TeamChatStatus } from '@/features/telemarketing/types';

function OpenDurationClock({ openedAt, closedAt }: { openedAt: string; closedAt: string | null }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (closedAt) return;
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [closedAt]);
  return <p className="font-semibold">{formatOpenDuration(openedAt, closedAt)}</p>;
}

export function DaliaChatThread({
  chat,
  currentUserId,
  currentUserName,
  isAdmin,
  onChanged,
}: {
  chat: TeamChat;
  currentUserId: string;
  currentUserName: string;
  isAdmin: boolean;
  onChanged?: () => void;
}) {
  const [local, setLocal] = useState(chat);
  const [messages, setMessages] = useState<TeamChatMessage[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [closingSummary, setClosingSummary] = useState('');
  const closed = isChatClosed(local.status);

  const load = async () => {
    const fresh = await getTeamChatById(chat.id);
    if (fresh) setLocal(fresh);
    setMessages(await getTeamMessages(chat.id));
    await markTeamChatRead(chat.id, currentUserId);
  };

  useEffect(() => {
    setLocal(chat);
    void load().catch((e: unknown) => setError(e instanceof Error ? e.message : 'שגיאה בטעינת הודעות'));
  }, [chat.id]);

  const send = async () => {
    try {
      setError(null);
      await sendTeamMessage({
        chatId: chat.id,
        authorId: currentUserId,
        authorName: currentUserName,
        authorRole: isAdmin ? 'super_admin' : 'telemarketing_agent',
        body: text,
      });
      setText('');
      await load();
      onChanged?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה בשליחה');
    }
  };

  const changeStatus = async (status: TeamChatStatus) => {
    if (status === 'הושלם' && !closingSummary.trim()) {
      setError('חובה לכתוב סיכום טיפול לפני סגירה');
      return;
    }
    try {
      setError(null);
      await updateTeamChatStatus({
        chatId: chat.id,
        status,
        actorId: currentUserId,
        actorName: currentUserName,
        closingSummary,
      });
      await load();
      onChanged?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה בעדכון סטטוס');
    }
  };

  return (
    <div className="space-y-3 text-sm">
      <p className="font-black text-violet-800 dark:text-violet-300">🟣 {local.careType}{local.careTypeOther ? ` — ${local.careTypeOther}` : ''}</p>
      <p>{local.companyName} · {local.contactName} · {local.phone}</p>
      <p>נציג: {local.agentName} · סטטוס: {local.status} · {local.urgency}</p>
      <TimeStampLines startedAt={local.openedAt} endedAt={local.closedAt} employeeName={local.agentName} />
      <OpenDurationClock openedAt={local.openedAt} closedAt={local.closedAt} />
      {local.startedAt && <p className="text-xs">תחילת טיפול: {formatStamp(local.startedAt)}</p>}
      {local.firstResponseAt && <p className="text-xs">תגובה ראשונה: {formatStamp(local.firstResponseAt)}</p>}
      {local.requestDetail && <p>בקשה: {local.requestDetail}</p>}
      {local.lastCallSummary && <p className="text-muted-foreground">סיכום שיחה: {local.lastCallSummary}</p>}
      {local.callId && <p className="text-xs">מקושר לשיחה {local.callId.slice(0, 8)}</p>}
      {local.followupId && <p className="text-xs">מקושר ל-Follow-up {local.followupId.slice(0, 8)}</p>}
      {local.workSessionId && <p className="text-xs">מקושר למשימה {local.workSessionId.slice(0, 8)}</p>}
      {local.closingSummary && <p className="rounded-lg bg-muted p-2">סיכום סגירה: {local.closingSummary}</p>}
      {local.closedAt && local.closedBy && <p className="text-xs">נסגר על ידי: {local.closedBy}</p>}

      <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-border p-3">
        {messages.map((msg) => (
          <div key={msg.id} className={`rounded-lg p-2 ${msg.kind === 'system' ? 'bg-muted text-muted-foreground' : msg.authorId === currentUserId ? 'bg-violet-600/20' : 'bg-background border border-border'}`}>
            <p className="text-xs font-semibold">{msg.authorName} · {formatStamp(msg.createdAt)}</p>
            <p className="whitespace-pre-wrap">{msg.body}</p>
          </div>
        ))}
      </div>

      {!closed && (
        <div className="space-y-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className="min-h-20 w-full rounded-xl border border-border bg-background p-3" placeholder="כתבו הודעה..." />
          <button type="button" onClick={() => void send()} className="min-h-12 w-full rounded-xl bg-violet-700 font-bold text-white">שלח</button>
        </div>
      )}
      {closed && <p className="rounded-lg bg-muted p-3 font-semibold">הפנייה סגורה לקריאה בלבד. לטיפול נוסף יש לפתוח 🟣 Chat חדש.</p>}

      {isAdmin && !closed && (
        <div className="space-y-2 rounded-xl border border-violet-500/30 p-3">
          <p className="font-bold">סטטוס — צוות דליה</p>
          <div className="grid grid-cols-2 gap-2">
            {TEAM_CHAT_STATUSES.filter((s) => s !== 'ארכיון').map((status) => (
              <button key={status} type="button" onClick={() => void changeStatus(status)} className="min-h-12 rounded-lg border border-border px-2 text-sm">
                {status === 'הושלם' ? 'סגור טיפול' : status}
              </button>
            ))}
          </div>
          <textarea value={closingSummary} onChange={(e) => setClosingSummary(e.target.value)} rows={2} className="w-full rounded-lg border border-border p-2" placeholder="סיכום טיפול — חובה בסגירה" />
        </div>
      )}
      {isAdmin && local.status === 'הושלם' && (
        <button type="button" onClick={() => void changeStatus('ארכיון')} className="min-h-12 w-full rounded-xl border border-border font-semibold">
          העבר לארכיון
        </button>
      )}
      {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
    </div>
  );
}
