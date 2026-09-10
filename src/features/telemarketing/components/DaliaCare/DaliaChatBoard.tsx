import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { getTeamChatBadge, getTeamChatSummary, getTeamChats, isChatClosed, formatOpenDuration } from '@/features/telemarketing/services/teamChatService';
import { DaliaChatThread } from '@/features/telemarketing/components/DaliaCare/DaliaChatThread';
import { DaliaManagerCompose } from '@/features/telemarketing/components/DaliaCare/DaliaManagerCompose';
import { TEAM_CHAT_STATUSES } from '@/features/telemarketing/types';
import { TimeStampMeta } from '@/features/telemarketing/components/TimeStampMeta';
import { formatLeadTitle } from '@/features/telemarketing/lib/leadLabel';
import { useLeadNumberLookup } from '@/features/telemarketing/hooks/useLeadNumberLookup';
import {
  DALIA_CHAT_PARAM,
  stripDaliaChatSearch,
  withDaliaChatSearch,
  type DaliaChatLocationState,
} from '@/features/telemarketing/lib/daliaChatNav';
import { TeleInnerNav, useOptionalTeleOverlayNav, useRegisterTeleCloser } from '@/features/telemarketing/components/Nav/TeleInnerNav';
import type { TeamChat, TeamChatStatus, TeamChatSummary } from '@/features/telemarketing/types';

const BUCKETS: { id: TeamChatStatus | 'open'; label: string }[] = [
  { id: 'חדש', label: 'חדש' },
  { id: 'בטיפול', label: 'בטיפול' },
  { id: 'ממתין לנציג', label: 'ממתין לנציג' },
  { id: 'ממתין ללקוח', label: 'ממתין ללקוח' },
  { id: 'הושלם', label: 'הושלם' },
  { id: 'ארכיון', label: 'ארכיון' },
];

export function DaliaChatBoard({
  currentUserId,
  currentUserName,
  isAdmin,
  reloadToken,
  onBackToWork,
}: {
  currentUserId: string;
  currentUserName: string;
  isAdmin: boolean;
  reloadToken?: number;
  onBackToWork?: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const selectedId = isAdmin ? searchParams.get(DALIA_CHAT_PARAM) : null;
  const [items, setItems] = useState<TeamChat[]>([]);
  const [badge, setBadge] = useState({ newCount: 0, unreadCount: 0 });
  const [opened, setOpened] = useState<TeamChat | null>(null);
  const [inboxOpen, setInboxOpen] = useState(isAdmin);
  const [search, setSearch] = useState('');
  const [employee, setEmployee] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [careType, setCareType] = useState('');
  const [urgency, setUrgency] = useState('');
  const [status, setStatus] = useState('');
  const [summary, setSummary] = useState<TeamChatSummary | null>(null);
  const lookupLead = useLeadNumberLookup();

  const load = async () => {
    const rows = await getTeamChats();
    setItems(rows);
    setBadge(await getTeamChatBadge(currentUserId, isAdmin ? 'admin' : 'agent'));
    if (isAdmin) setSummary(await getTeamChatSummary());
  };

  useEffect(() => {
    void load().catch(() => setItems([]));
  }, [reloadToken, currentUserId]);

  const overlayNav = useOptionalTeleOverlayNav();
  const closeAdminChat = useCallback(() => {
    setOpened(null);
    navigate(
      {
        pathname: location.pathname,
        search: stripDaliaChatSearch(location.search),
        hash: '',
      },
      { replace: true },
    );
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    if (!selectedId) {
      setOpened(null);
      return;
    }
    const found = items.find((item) => item.id === selectedId);
    if (found) setOpened(found);
  }, [selectedId, items, isAdmin]);

  useEffect(() => {
    if (!opened) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isAdmin) closeAdminChat();
        else if (opened) closeAgentThread();
        else onBackToWork?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [opened, isAdmin, closeAdminChat, onBackToWork]);

  const employees = useMemo(() => Array.from(new Set(items.map((i) => i.agentName))), [items]);
  const types = useMemo(() => Array.from(new Set(items.map((i) => i.careType))), [items]);
  const filtered = items.filter((item) => {
    const q = search.trim().toLowerCase();
    if (q && !`${item.companyName} ${item.contactName ?? ''} ${item.phone} ${item.agentName} ${item.careType} פנייה פנימית`.toLowerCase().includes(q)) return false;
    if (isAdmin && employee && item.agentName !== employee) return false;
    if (fromDate && item.openedAt.slice(0, 10) < fromDate) return false;
    if (toDate && item.openedAt.slice(0, 10) > toDate) return false;
    if (careType && item.careType !== careType) return false;
    if (urgency && item.urgency !== urgency) return false;
    if (status === 'open' && isChatClosed(item.status)) return false;
    if (status === 'closed' && !isChatClosed(item.status)) return false;
    if (status && status !== 'open' && status !== 'closed' && item.status !== status) return false;
    return true;
  });

  const openAdminChat = (item: TeamChat) => {
    setOpened(item);
    const state: DaliaChatLocationState = { daliaChatOpened: true, daliaChatFrom: 'inbox' };
    navigate(
      {
        pathname: location.pathname,
        search: withDaliaChatSearch(location.search, item.id),
        hash: '',
      },
      { state },
    );
  };

  const openAgentChat = (item: TeamChat) => {
    setOpened(item);
  };

  const closeAgentThread = () => {
    setOpened(null);
  };

  useRegisterTeleCloser(Boolean(!isAdmin && onBackToWork), () => onBackToWork?.());
  useRegisterTeleCloser(Boolean(!isAdmin && opened), closeAgentThread);
  useRegisterTeleCloser(Boolean(isAdmin && opened), closeAdminChat);

  const showList = isAdmin || inboxOpen || Boolean(onBackToWork);

  const list = (
        <>
      <div className="grid gap-2 md:grid-cols-3">
        <input placeholder="חיפוש: חברה / איש קשר / טלפון" value={search} onChange={(e) => setSearch(e.target.value)} className="min-h-12 rounded-lg border border-border bg-background p-2 text-sm md:col-span-3" />
        {isAdmin && (
          <select value={employee} onChange={(e) => setEmployee(e.target.value)} className="min-h-12 rounded-lg border border-border bg-background p-2 text-sm">
            <option value="">כל הנציגים</option>
            {employees.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        )}
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="min-h-12 rounded-lg border border-border bg-background p-2 text-sm" />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="min-h-12 rounded-lg border border-border bg-background p-2 text-sm" />
        <select value={careType} onChange={(e) => setCareType(e.target.value)} className="min-h-12 rounded-lg border border-border bg-background p-2 text-sm">
          <option value="">כל סוגי הטיפול</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={urgency} onChange={(e) => setUrgency(e.target.value)} className="min-h-12 rounded-lg border border-border bg-background p-2 text-sm">
          <option value="">כל הדחיפויות</option>
          <option value="רגיל">רגיל</option>
          <option value="חשוב">חשוב</option>
          <option value="דחוף">דחוף</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="min-h-12 rounded-lg border border-border bg-background p-2 text-sm">
          <option value="">כל הסטטוסים</option>
          <option value="open">פתוח</option>
          <option value="closed">סגור</option>
          {TEAM_CHAT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {BUCKETS.filter((b) => isAdmin || b.id !== 'ארכיון').map((bucket) => {
        const rows = filtered.filter((i) => i.status === bucket.id);
        const label = !isAdmin && bucket.id === 'ממתין לנציג' ? 'ממתין לי' : bucket.label;
        return (
          <div key={bucket.id}>
            <h3 className="mb-2 font-black">{label} ({rows.length})</h3>
            {rows.length === 0 && <p className="mb-3 text-sm text-muted-foreground">אין רשומות</p>}
            <div className="space-y-2">
              {rows.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-testid="dalia-chat-row"
                  onClick={() => (isAdmin ? openAdminChat(item) : openAgentChat(item))}
                  className={`w-full rounded-xl border p-3 text-right ${item.status === 'ממתין לנציג' ? 'border-violet-700 bg-violet-600/20 ring-2 ring-violet-500' : 'border-violet-500/30 bg-violet-500/5'}`}
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-bold">{formatLeadTitle(lookupLead(item.phone, item.companyName), item.companyName || (item.initiatedBy === 'admin' ? 'פנייה פנימית' : 'ללא לקוח'))} · {item.careType}</span>
                    {item.unreadCount > 0 && <span className="rounded-full bg-violet-700 px-2 text-xs font-bold text-white">{item.unreadCount}</span>}
                  </div>
                  <p className="text-sm">{isAdmin ? `${item.agentName} · ` : ''}{item.phone || 'ללא טלפון'} · {item.status} · {item.urgency}{item.initiatedBy === 'admin' ? ' · מנהל→עובד' : ''}</p>
                  <TimeStampMeta startedAt={item.openedAt} endedAt={item.closedAt} employeeName={isAdmin ? null : item.agentName} extra={formatOpenDuration(item.openedAt, item.closedAt)} />
                  {item.lastMessagePreview && <p className="mt-1 line-clamp-2 text-xs opacity-80">{item.lastMessagePreview}</p>}
                </button>
              ))}
            </div>
          </div>
        );
      })}
        </>
  );

  if (!isAdmin && onBackToWork) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col bg-background" data-testid="dalia-agent-chat-screen">
        <div className="sticky top-0 z-10 space-y-2 border-b border-border bg-card p-3">
          {!opened && <TeleInnerNav onBack={onBackToWork} onHome={onBackToWork} />}
          <p className="text-center text-sm font-bold">🟣 פניות צוות דליה</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {opened ? (
            <DaliaChatThread
              chat={opened}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              isAdmin={false}
              onBack={closeAgentThread}
              onHome={onBackToWork}
              onChanged={() => {
                void load();
              }}
            />
          ) : (
            list
          )}
        </div>
      </div>
    );
  }

  return (
    <section id="dalia-care" className="space-y-3 rounded-2xl border border-violet-500/40 bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-black">🟣 {isAdmin ? 'טיפול צוות דליה' : 'פניות צוות דליה'}</h2>
        {(badge.newCount > 0 || badge.unreadCount > 0) && (
          <span className="rounded-full bg-violet-700 px-3 py-1 text-sm font-bold text-white">
            🟣 {badge.newCount > 0 ? `${badge.newCount} חדשות` : ''}{badge.newCount > 0 && badge.unreadCount > 0 ? ' · ' : ''}{badge.unreadCount > 0 ? `${badge.unreadCount} הודעות` : ''}
          </span>
        )}
      </div>
      {isAdmin && summary && (
        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          <SummaryChip label="חדשות היום" value={String(summary.newToday)} />
          <SummaryChip label="פתוחות כרגע" value={String(summary.openNow)} />
          <SummaryChip label="נסגרו היום" value={String(summary.closedToday)} />
          <SummaryChip label="ממתין לנציג" value={String(summary.waitingAgent)} />
          <SummaryChip label="ממתין ללקוח" value={String(summary.waitingCustomer)} />
          <SummaryChip label="זמן תגובה ממוצע" value={formatAvg(summary.avgFirstResponseSeconds)} />
          <SummaryChip label="זמן סגירה ממוצע" value={formatAvg(summary.avgCloseSeconds)} />
        </div>
      )}
      {isAdmin && (
        <DaliaManagerCompose
          actorName={currentUserName}
          onCreated={() => {
            void load();
          }}
        />
      )}
      {showList && list}
      {isAdmin && opened && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/50 md:items-center md:justify-center md:p-4"
          data-testid="dalia-chat-overlay"
          onClick={closeAdminChat}
        >
          <div
            className="flex h-full w-full flex-col bg-card md:max-h-[92vh] md:h-auto md:max-w-lg md:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="overflow-y-auto p-5">
              <DaliaChatThread
                chat={opened}
                currentUserId={currentUserId}
                currentUserName={currentUserName}
                isAdmin
                onBack={closeAdminChat}
                onHome={() => overlayNav?.goHome()}
                onChanged={() => {
                  void load();
                }}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function AgentChatEntry({
  currentUserId,
  onOpen,
  reloadToken,
}: {
  currentUserId: string;
  onOpen: () => void;
  reloadToken?: number;
}) {
  const [badge, setBadge] = useState({ newCount: 0, unreadCount: 0 });
  useEffect(() => {
    void getTeamChatBadge(currentUserId, 'agent')
      .then(setBadge)
      .catch(() => setBadge({ newCount: 0, unreadCount: 0 }));
  }, [currentUserId, reloadToken]);
  return (
    <button
      type="button"
      data-testid="dalia-open-inbox"
      onClick={onOpen}
      className="min-h-12 w-full rounded-xl border border-violet-500/40 bg-violet-500/10 px-4 text-right font-bold text-violet-900 dark:text-violet-200"
    >
      🟣 פניות צוות דליה
      {(badge.newCount > 0 || badge.unreadCount > 0) && (
        <span className="mr-2 rounded-full bg-violet-700 px-2 py-0.5 text-xs text-white">
          {badge.newCount > 0 ? `${badge.newCount} חדשות` : ''}{badge.newCount > 0 && badge.unreadCount > 0 ? ' · ' : ''}{badge.unreadCount > 0 ? `${badge.unreadCount} הודעות` : ''}
        </span>
      )}
    </button>
  );
}

function formatAvg(seconds: number | null): string {
  if (seconds == null) return '-';
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} דק'`;
  return `${Math.floor(m / 60)} שעות ${m % 60} דק'`;
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-black">{value}</p>
    </div>
  );
}
