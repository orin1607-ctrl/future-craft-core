import { useCallback, useEffect, useState } from 'react';
import { getTeamChatsForLead, formatOpenDuration, isChatClosed } from '@/features/telemarketing/services/teamChatService';
import { formatStamp } from '@/features/telemarketing/lib/formatTime';
import { DaliaChatThread } from '@/features/telemarketing/components/DaliaCare/DaliaChatThread';
import { DaliaCareCreateForm } from '@/features/telemarketing/components/DaliaCare/DaliaCareCreateForm';
import { useOptionalTeleOverlayNav, useRegisterTeleCloser } from '@/features/telemarketing/components/Nav/TeleInnerNav';
import type { TeamChat } from '@/features/telemarketing/types';

function chatEvents(chat: TeamChat) {
  const events: { at: string; text: string }[] = [
    { at: chat.openedAt, text: `נפתח 🟣 טיפול צוות דליה: ${chat.careType}` },
  ];
  if (chat.startedAt) events.push({ at: chat.startedAt, text: 'צוות דליה התחיל טיפול' });
  if (chat.firstResponseAt && chat.firstResponseAt !== chat.startedAt) {
    events.push({ at: chat.firstResponseAt, text: 'תגובה ראשונה מצוות דליה' });
  }
  if (chat.status === 'ממתין לנציג') events.push({ at: chat.lastMessageAt || chat.openedAt, text: 'ממתין לנציג' });
  if (chat.status === 'ממתין ללקוח') events.push({ at: chat.lastMessageAt || chat.openedAt, text: 'ממתין ללקוח' });
  if (chat.closedAt) events.push({ at: chat.closedAt, text: `הטיפול נסגר${chat.closingSummary ? `: ${chat.closingSummary}` : ''}` });
  return events.sort((a, b) => a.at.localeCompare(b.at));
}

export function DaliaCareLeadEvents({
  phone,
  companyName,
  contactName,
  email,
  callId,
  followupId,
  lastCallSummary,
  actor,
  ownerAgent,
}: {
  phone: string;
  companyName: string;
  contactName?: string;
  email?: string;
  callId?: string | null;
  followupId?: string | null;
  lastCallSummary?: string;
  actor?: { id: string; displayName: string; isAdmin?: boolean };
  ownerAgent?: { id: string; displayName: string };
}) {
  const [chats, setChats] = useState<TeamChat[]>([]);
  const [open, setOpen] = useState<TeamChat | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const overlayNav = useOptionalTeleOverlayNav();

  const load = async () => {
    setChats(await getTeamChatsForLead(phone, companyName));
  };

  useEffect(() => {
    void load().catch(() => setChats([]));
  }, [phone, companyName]);

  const closeThread = useCallback(() => {
    setOpen(null);
    if (window.history.state?.daliaLeadChat) {
      window.history.replaceState({ ...(window.history.state || {}), daliaLeadChat: false }, '');
    }
  }, []);

  useRegisterTeleCloser(Boolean(open), closeThread);

  useEffect(() => {
    const onPop = () => setOpen(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const openThread = (chat: TeamChat) => {
    window.history.pushState({ daliaLeadChat: chat.id }, '');
    setOpen(chat);
  };

  return (
    <div className="space-y-2 rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-black text-violet-800 dark:text-violet-300">🟣 טיפול צוות דליה</h4>
        {actor && (
          <button type="button" onClick={() => setShowCreate((v) => !v)} className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-bold text-white">
            פנייה חדשה
          </button>
        )}
      </div>
      {chats.length === 0 && <p className="text-xs text-muted-foreground">אין פניות טיפול ללקוח זה</p>}
      <ol className="space-y-2">
        {chats.map((chat) => (
          <li key={chat.id} className="rounded-lg border border-violet-500/20 bg-background p-2 text-xs">
            <p className="font-bold">{chat.careType} · {chat.status} · {formatOpenDuration(chat.openedAt, chat.closedAt)}</p>
            {chatEvents(chat).map((ev) => (
              <p key={`${chat.id}-${ev.at}-${ev.text}`}>{formatStamp(ev.at)} — {ev.text}</p>
            ))}
            <button type="button" onClick={() => openThread(chat)} className="mt-1 font-bold text-violet-700">
              פתח Thread מלא
            </button>
            {isChatClosed(chat.status) && <p className="mt-1 text-muted-foreground">סגור לצמיתות — לטיפול נוסף פותחים Chat חדש</p>}
          </li>
        ))}
      </ol>
      {showCreate && actor && (
        <DaliaCareCreateForm
          agentId={ownerAgent?.id || actor.id}
          agentName={ownerAgent?.displayName || actor.displayName}
          companyName={companyName}
          contactName={contactName}
          phone={phone}
          email={email}
          callId={callId}
          followupId={followupId}
          lastCallSummary={lastCallSummary}
          onCreated={() => {
            setShowCreate(false);
            void load();
          }}
        />
      )}
      {open && actor && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black/50 md:items-center md:justify-center md:p-4" data-testid="dalia-chat-overlay" onClick={closeThread}>
          <div className="flex h-full w-full flex-col bg-card md:max-h-[92vh] md:h-auto md:max-w-lg md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="overflow-y-auto p-5">
              <DaliaChatThread
                chat={open}
                currentUserId={actor.id}
                currentUserName={actor.displayName}
                isAdmin={!!actor.isAdmin}
                onBack={closeThread}
                onHome={() => overlayNav?.goHome()}
                onChanged={() => void load()}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
