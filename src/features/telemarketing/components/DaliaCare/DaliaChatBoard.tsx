import { useEffect, useMemo, useState } from 'react';
import { getTeamChatBadge, getTeamChatSummary, getTeamChats, isChatClosed, formatOpenDuration } from '@/features/telemarketing/services/teamChatService';
import { DaliaChatThread } from '@/features/telemarketing/components/DaliaCare/DaliaChatThread';
import { DaliaManagerCompose } from '@/features/telemarketing/components/DaliaCare/DaliaManagerCompose';
import { TEAM_CHAT_STATUSES } from '@/features/telemarketing/types';
import { TimeStampMeta } from '@/features/telemarketing/components/TimeStampMeta';
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
}: {
  currentUserId: string;
  currentUserName: string;
  isAdmin: boolean;
  reloadToken?: number;
}) {
  const [items, setItems] = useState<TeamChat[]>([]);
  const [badge, setBadge] = useState({ newCount: 0, unreadCount: 0 });
  const [selected, setSelected] = useState<TeamChat | null>(null);
  const [search, setSearch] = useState('');
  const [employee, setEmployee] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [careType, setCareType] = useState('');
  const [urgency, setUrgency] = useState('');
  const [status, setStatus] = useState('');
  const [summary, setSummary] = useState<TeamChatSummary | null>(null);

  const load = async () => {
    const rows = await getTeamChats();
    setItems(rows);
    setBadge(await getTeamChatBadge(currentUserId, isAdmin ? 'admin' : 'agent'));
    if (isAdmin) setSummary(await getTeamChatSummary());
  };

  useEffect(() => {
    void load().catch(() => setItems([]));
  }, [reloadToken, currentUserId]);

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
                <button key={item.id} type="button" onClick={() => setSelected(item)} className={`w-full rounded-xl border p-3 text-right ${item.status === 'ממתין לנציג' ? 'border-violet-700 bg-violet-600/20 ring-2 ring-violet-500' : 'border-violet-500/30 bg-violet-500/5'}`}>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold">{item.companyName || (item.initiatedBy === 'admin' ? 'פנייה פנימית' : 'ללא לקוח')} · {item.careType}</span>
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
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelected(null)}>
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setSelected(null)} className="float-left text-2xl text-muted-foreground">×</button>
            <DaliaChatThread
              chat={selected}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              isAdmin={isAdmin}
              onChanged={() => {
                void load();
              }}
            />
          </div>
        </div>
      )}
    </section>
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

