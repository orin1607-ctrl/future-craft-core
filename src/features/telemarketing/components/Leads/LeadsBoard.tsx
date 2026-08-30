import { useCallback, useEffect, useMemo, useState } from 'react';
import { getLeadStates, getLeadStatusEvents, upsertLeadState } from '@/features/telemarketing/services/leadStateService';
import { getFollowUpWorkItems, getLeadHistory } from '@/features/telemarketing/services/telemarketingService';
import { getWorkSessionsForLead } from '@/features/telemarketing/services/workSessionService';
import { FollowUpBoard, dueCount } from '@/features/telemarketing/components/FollowUp/FollowUpBoard';
import { DaliaCareLeadEvents } from '@/features/telemarketing/components/DaliaCare/DaliaCareLeadEvents';
import { TimeStampMeta } from '@/features/telemarketing/components/TimeStampMeta';
import { formatStamp } from '@/features/telemarketing/lib/formatTime';
import { formatLeadTitle } from '@/features/telemarketing/lib/leadLabel';
import { LEAD_COLOR_LABEL, LEAD_STATUSES, leadStatusLabel, type LeadColor } from '@/features/telemarketing/lib/leadTraffic';
import {
  colorFilterForView,
  colorsToRender,
  DEFAULT_LEAD_BOARD_VIEW,
  followUpBucketForView,
  isFollowUpBoardView,
  type LeadBoardView,
} from '@/features/telemarketing/lib/leadBoardView';
import { TeleInnerNav, useRegisterTeleCloser } from '@/features/telemarketing/components/Nav/TeleInnerNav';
import type { FollowUpWorkItem, TelemarketingEmployee, TelemarketingLeadState } from '@/features/telemarketing/types';

const TONE: Record<LeadColor, string> = {
  red: 'border-destructive bg-destructive/10',
  yellow: 'border-amber-500 bg-amber-50 dark:bg-amber-950/30',
  green: 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30',
};

export function LeadsBoard({
  currentEmployee,
  hideEmployeeFilter,
  daliaActor,
  readOnly = false,
  onStartReturn,
  startLocked = false,
  reloadToken,
  embedFollowUp = false,
}: {
  currentEmployee?: TelemarketingEmployee;
  hideEmployeeFilter?: boolean;
  daliaActor?: { id: string; displayName: string; isAdmin?: boolean };
  readOnly?: boolean;
  onStartReturn?: (item: FollowUpWorkItem) => void;
  startLocked?: boolean;
  reloadToken?: number;
  /** Agent home: follow-up lives in this board. Admin keeps its own FollowUpBoard. */
  embedFollowUp?: boolean;
}) {
  const [items, setItems] = useState<TelemarketingLeadState[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpWorkItem[]>([]);
  const [view, setView] = useState<LeadBoardView>(DEFAULT_LEAD_BOARD_VIEW);
  const [search, setSearch] = useState('');
  const [employee, setEmployee] = useState('');
  const [selected, setSelected] = useState<TelemarketingLeadState | null>(null);
  const closeSelected = useCallback(() => setSelected(null), []);
  useRegisterTeleCloser(Boolean(selected), closeSelected);

  const load = async () => {
    const states = await getLeadStates();
    setItems(states);
    if (embedFollowUp) {
      const fus = await getFollowUpWorkItems().catch(() => [] as FollowUpWorkItem[]);
      setFollowUps(fus);
    } else {
      setFollowUps([]);
    }
  };

  useEffect(() => {
    void load().catch(() => {
      setItems([]);
      setFollowUps([]);
    });
  }, [reloadToken]);

  const employees = useMemo(() => Array.from(new Set(items.map((i) => i.employeeName).filter(Boolean))) as string[], [items]);
  const color = colorFilterForView(view);
  const showFollowUps = embedFollowUp && isFollowUpBoardView(view);
  const filtered = items.filter((item) => {
    if (color && item.leadColor !== color) return false;
    if (!hideEmployeeFilter && employee && item.employeeName !== employee) return false;
    const q = search.trim().toLowerCase();
    if (q) {
      const hay = `${item.companyName} ${item.contactName ?? ''} ${item.phone}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const grouped = {
    red: filtered.filter((i) => i.leadColor === 'red'),
    yellow: filtered.filter((i) => i.leadColor === 'yellow'),
    green: filtered.filter((i) => i.leadColor === 'green'),
  };
  const due = dueCount(followUps);
  const chipClass = (active: boolean) =>
    `min-h-12 rounded-xl px-3 text-sm font-black ${active ? 'bg-primary text-primary-foreground' : 'border border-border bg-background'}`;

  return (
    <section
      id={embedFollowUp ? 'my-followups' : undefined}
      data-testid={embedFollowUp ? 'tele-continue-treatment' : 'tele-leads-board'}
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
    >
      <h2 className="text-xl font-black">רמזור לידים</h2>
      <p className="text-xs text-muted-foreground">
        {embedFollowUp
          ? 'צהוב / אדום / ירוק מגיעים מרמזור הליד. «המשך טיפול» ו«לחזור היום» מגיעים מ-Follow-up פתוח — אותו אזור, שני מקורות אמת.'
          : 'צהוב — בתהליך · אדום — סגור · ירוק — הצלחה. ברירת המחדל: צהוב.'}
      </p>
      <div className="flex flex-wrap gap-2" data-testid="tele-lead-board-filters">
        <button type="button" data-testid="tele-lead-filter-yellow" className={chipClass(view === 'yellow')} onClick={() => setView('yellow')}>
          🟡 צהובים
        </button>
        <button type="button" data-testid="tele-lead-filter-red" className={chipClass(view === 'red')} onClick={() => setView('red')}>
          🔴 אדומים
        </button>
        <button type="button" data-testid="tele-lead-filter-green" className={chipClass(view === 'green')} onClick={() => setView('green')}>
          🟢 ירוקים
        </button>
        {embedFollowUp && (
          <>
            <button type="button" data-testid="tele-lead-filter-followup" className={chipClass(view === 'followup')} onClick={() => setView('followup')}>
              📅 המשך טיפול{due > 0 ? ` (${due})` : ''}
            </button>
            <button type="button" data-testid="tele-lead-filter-today" className={chipClass(view === 'today')} onClick={() => setView('today')}>
              לחזור היום
            </button>
          </>
        )}
        <button type="button" data-testid="tele-lead-filter-all" className={chipClass(view === 'all')} onClick={() => setView('all')}>
          הכול
        </button>
      </div>
      {!showFollowUps && (
      <div className="grid gap-2 md:grid-cols-3">
        <input
          placeholder="חיפוש: חברה / איש קשר / טלפון"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-h-12 rounded-lg border border-border bg-background p-2 text-sm md:col-span-3"
        />
        {!hideEmployeeFilter && (
          <select value={employee} onChange={(e) => setEmployee(e.target.value)} className="min-h-12 rounded-lg border border-border bg-background p-2 text-sm">
            <option value="">כל הנציגים</option>
            {employees.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        )}
      </div>
      )}
      {showFollowUps ? (
        <FollowUpBoard
          key={view}
          items={followUps}
          hideEmployeeFilter={hideEmployeeFilter}
          allowStartReturn={Boolean(onStartReturn)}
          startLocked={startLocked}
          onStartReturn={onStartReturn}
          actor={currentEmployee ? { id: currentEmployee.id, displayName: currentEmployee.displayName } : daliaActor}
          initialBucket={followUpBucketForView(view)}
        />
      ) : (
        <>
          {view === 'yellow' && grouped.yellow.length === 0 && due > 0 && (
            <p className="rounded-xl border border-amber-400/40 bg-amber-50 p-3 text-sm font-semibold dark:bg-amber-950/30">
              אין לידים צהובים ברמזור. יש {due} להמשך טיפול / לחזור היום — לחצו «המשך טיפול» או «לחזור היום».
            </p>
          )}
          {colorsToRender(view).map((c) => (
        <div key={c}>
          <h3 className="mb-2 font-black">{c === 'red' ? '🔴 אדומים' : c === 'yellow' ? '🟡 צהובים' : '🟢 ירוקים'} ({grouped[c].length})</h3>
          {grouped[c].length === 0 && <p className="mb-3 text-sm text-muted-foreground">אין רשומות</p>}
          <div className="space-y-2">
            {grouped[c].map((item) => (
              <button key={item.id} type="button" data-testid="lead-board-item" onClick={() => setSelected(item)} className={`w-full rounded-xl border p-3 text-right ${TONE[item.leadColor]}`}>
                <p className="font-bold">{formatLeadTitle(item.leadNumber, item.companyName)}</p>
                <p className="text-sm">{item.contactName ? `${item.contactName} · ` : ''}{item.phone || 'אין טלפון'}{item.employeeName ? ` · ${item.employeeName}` : ''}</p>
                <p className="mt-1 text-xs font-semibold">{leadStatusLabel(item.leadStatus)}{item.reason ? ` — ${item.reason}` : ''}</p>
                <TimeStampMeta startedAt={item.lastCallAt || item.changedAt} employeeName={item.employeeName} extra={item.lastCallAt ? 'שיחה אחרונה' : 'עודכן'} />
              </button>
            ))}
          </div>
        </div>
          ))}
        </>
      )}
      {selected && currentEmployee && (
        <LeadDetail
          lead={selected}
          employee={currentEmployee}
          daliaActor={daliaActor || (currentEmployee ? { id: currentEmployee.id, displayName: currentEmployee.displayName } : undefined)}
          readOnly={readOnly}
          onClose={closeSelected}
          onSaved={async () => {
            await load();
            closeSelected();
          }}
        />
      )}
      {selected && !currentEmployee && (
        <LeadDetail
          lead={selected}
          daliaActor={daliaActor}
          readOnly={readOnly}
          onClose={closeSelected}
        />
      )}
    </section>
  );
}

function LeadDetail({
  lead,
  employee,
  daliaActor,
  readOnly,
  onClose,
  onSaved,
}: {
  lead: TelemarketingLeadState;
  employee?: TelemarketingEmployee;
  daliaActor?: { id: string; displayName: string; isAdmin?: boolean };
  readOnly?: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [callCount, setCallCount] = useState(0);
  const [workSeconds, setWorkSeconds] = useState(0);
  const [lastSummary, setLastSummary] = useState('');
  const [events, setEvents] = useState<{ leadColor: string; leadStatus: string; reason: string | null; changedAt: string }[]>([]);
  const [reason, setReason] = useState(lead.reason || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getLeadHistory(lead.phone, lead.companyName).then((rows) => {
      setCallCount(rows.length);
      const last = rows[rows.length - 1];
      setLastSummary(last?.summary || last?.result || '');
    });
    void getWorkSessionsForLead(lead.phone, lead.companyName).then((rows) => {
      setWorkSeconds(rows.reduce((sum, row) => sum + (row.durationSeconds || 0), 0));
    });
    void getLeadStatusEvents(lead.leadKey).then(setEvents);
  }, [lead]);

  const changeColor = async (color: LeadColor) => {
    if (!employee || readOnly) return;
    if (color === 'red' && !reason.trim()) {
      return;
    }
    setSaving(true);
    try {
      await upsertLeadState({
        phone: lead.phone,
        companyName: lead.companyName,
        contactName: lead.contactName,
        employeeId: employee.id,
        employeeName: employee.displayName,
        color,
        status: LEAD_STATUSES[color][0].id,
        reason,
      });
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" data-testid="tele-internal-card" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <TeleInnerNav onBack={onClose} />
        <h3 className="mb-2 text-lg font-black">{formatLeadTitle(lead.leadNumber, lead.companyName)}</h3>
        <p className="text-sm">{lead.contactName} · {lead.phone}</p>
        <p className="mt-1 font-semibold">{LEAD_COLOR_LABEL[lead.leadColor]} · {leadStatusLabel(lead.leadStatus)}</p>
        {lead.reason && <p className="mt-1 text-sm">סיבה: {lead.reason}</p>}
        <p className="mt-2 text-sm">נציג מטפל: {lead.employeeName || '-'}</p>
        <TimeStampMeta startedAt={lead.changedAt} extra="עדכון אחרון" />
        {lead.lastCallAt && <TimeStampMeta startedAt={lead.lastCallAt} extra="שיחה אחרונה" />}
        <p className="text-sm">שיחות: {callCount} · זמן עבודה: {Math.round(workSeconds / 60)} דק'</p>
        {lastSummary && <p className="mt-2 text-sm">שיחה אחרונה: {lastSummary}</p>}
        {employee && (
          <div className="mt-3 space-y-2">
            <textarea value={reason} onChange={(e) => !readOnly && setReason(e.target.value)} rows={2} className="w-full rounded-lg border border-border p-2" placeholder="סיבה / הערה" disabled={readOnly} />
            <div className="grid grid-cols-3 gap-2">
              <button type="button" disabled={saving || readOnly} title={readOnly ? 'עבור למצב עבודה' : undefined} onClick={() => void changeColor('red')} className="min-h-12 rounded-xl bg-destructive text-white font-bold disabled:opacity-50">אדום</button>
              <button type="button" disabled={saving || readOnly} title={readOnly ? 'עבור למצב עבודה' : undefined} onClick={() => void changeColor('yellow')} className="min-h-12 rounded-xl bg-amber-400 font-bold disabled:opacity-50">צהוב</button>
              <button type="button" disabled={saving || readOnly} title={readOnly ? 'עבור למצב עבודה' : undefined} onClick={() => void changeColor('green')} className="min-h-12 rounded-xl bg-emerald-600 text-white font-bold disabled:opacity-50">ירוק</button>
            </div>
            {readOnly && <p className="text-sm font-semibold text-amber-800">מצב בדיקה — שינוי רמזור חסום.</p>}
          </div>
        )}
        {events.length > 0 && (
          <div className="mt-4">
            <h4 className="font-bold">היסטוריית שינוי סטטוס</h4>
            <ul className="mt-1 space-y-1 text-xs">
              {events.map((ev, i) => (
                <li key={i}>{formatStamp(ev.changedAt)} · {ev.leadColor} · {leadStatusLabel(ev.leadStatus)}{ev.reason ? ` — ${ev.reason}` : ''}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-4">
          <DaliaCareLeadEvents
            phone={lead.phone}
            companyName={lead.companyName}
            contactName={lead.contactName}
            lastCallSummary={lastSummary || lead.reason || undefined}
            actor={daliaActor || (employee ? { id: employee.id, displayName: employee.displayName } : lead.employeeId ? { id: lead.employeeId, displayName: lead.employeeName || '' } : undefined)}
            ownerAgent={lead.employeeId ? { id: lead.employeeId, displayName: lead.employeeName || '' } : undefined}
          />
        </div>
      </div>
    </div>
  );
}
