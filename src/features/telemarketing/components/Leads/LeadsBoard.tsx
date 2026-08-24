import { useEffect, useMemo, useState } from 'react';
import { getLeadStates, getLeadStatusEvents, upsertLeadState } from '@/features/telemarketing/services/leadStateService';
import { getLeadHistory } from '@/features/telemarketing/services/telemarketingService';
import { getWorkSessionsForLead } from '@/features/telemarketing/services/workSessionService';
import { DaliaCareLeadEvents } from '@/features/telemarketing/components/DaliaCare/DaliaCareLeadEvents';
import { LEAD_COLOR_LABEL, LEAD_STATUSES, leadStatusLabel, type LeadColor } from '@/features/telemarketing/lib/leadTraffic';
import type { TelemarketingEmployee, TelemarketingLeadState } from '@/features/telemarketing/types';

const TONE: Record<LeadColor, string> = {
  red: 'border-destructive bg-destructive/10',
  yellow: 'border-amber-500 bg-amber-50 dark:bg-amber-950/30',
  green: 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30',
};

export function LeadsBoard({
  currentEmployee,
  hideEmployeeFilter,
  daliaActor,
}: {
  currentEmployee?: TelemarketingEmployee;
  hideEmployeeFilter?: boolean;
  daliaActor?: { id: string; displayName: string; isAdmin?: boolean };
}) {
  const [items, setItems] = useState<TelemarketingLeadState[]>([]);
  const [color, setColor] = useState<'' | LeadColor>('');
  const [search, setSearch] = useState('');
  const [employee, setEmployee] = useState('');
  const [selected, setSelected] = useState<TelemarketingLeadState | null>(null);

  const load = async () => {
    setItems(await getLeadStates());
  };

  useEffect(() => {
    void load().catch(() => setItems([]));
  }, []);

  const employees = useMemo(() => Array.from(new Set(items.map((i) => i.employeeName).filter(Boolean))) as string[], [items]);
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

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-xl font-black">רמזור לידים</h2>
      <div className="grid gap-2 md:grid-cols-3">
        <input
          placeholder="חיפוש: חברה / איש קשר / טלפון"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-h-12 rounded-lg border border-border bg-background p-2 text-sm md:col-span-3"
        />
        <select value={color} onChange={(e) => setColor(e.target.value as '' | LeadColor)} className="min-h-12 rounded-lg border border-border bg-background p-2 text-sm">
          <option value="">כל הצבעים</option>
          <option value="red">🔴 אדומים</option>
          <option value="yellow">🟡 צהובים</option>
          <option value="green">🟢 ירוקים</option>
        </select>
        {!hideEmployeeFilter && (
          <select value={employee} onChange={(e) => setEmployee(e.target.value)} className="min-h-12 rounded-lg border border-border bg-background p-2 text-sm">
            <option value="">כל הנציגים</option>
            {employees.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        )}
      </div>
      {(['red', 'yellow', 'green'] as LeadColor[]).map((c) => (
        <div key={c}>
          <h3 className="mb-2 font-black">{c === 'red' ? '🔴 אדומים' : c === 'yellow' ? '🟡 צהובים' : '🟢 ירוקים'} ({grouped[c].length})</h3>
          {grouped[c].length === 0 && <p className="mb-3 text-sm text-muted-foreground">אין רשומות</p>}
          <div className="space-y-2">
            {grouped[c].map((item) => (
              <button key={item.id} type="button" onClick={() => setSelected(item)} className={`w-full rounded-xl border p-3 text-right ${TONE[item.leadColor]}`}>
                <p className="font-bold">{item.companyName || 'ללא שם'}</p>
                <p className="text-sm">{item.contactName ? `${item.contactName} · ` : ''}{item.phone || 'אין טלפון'}{item.employeeName ? ` · ${item.employeeName}` : ''}</p>
                <p className="mt-1 text-xs font-semibold">{leadStatusLabel(item.leadStatus)}{item.reason ? ` — ${item.reason}` : ''}</p>
              </button>
            ))}
          </div>
        </div>
      ))}
      {selected && currentEmployee && (
        <LeadDetail
          lead={selected}
          employee={currentEmployee}
          daliaActor={daliaActor || (currentEmployee ? { id: currentEmployee.id, displayName: currentEmployee.displayName } : undefined)}
          onClose={() => setSelected(null)}
          onSaved={async () => {
            await load();
            setSelected(null);
          }}
        />
      )}
      {selected && !currentEmployee && (
        <LeadDetail
          lead={selected}
          daliaActor={daliaActor}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}

function LeadDetail({
  lead,
  employee,
  daliaActor,
  onClose,
  onSaved,
}: {
  lead: TelemarketingLeadState;
  employee?: TelemarketingEmployee;
  daliaActor?: { id: string; displayName: string; isAdmin?: boolean };
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
    if (!employee) return;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="float-left text-2xl text-muted-foreground">×</button>
        <h3 className="mb-2 text-lg font-black">{lead.companyName}</h3>
        <p className="text-sm">{lead.contactName} · {lead.phone}</p>
        <p className="mt-1 font-semibold">{LEAD_COLOR_LABEL[lead.leadColor]} · {leadStatusLabel(lead.leadStatus)}</p>
        {lead.reason && <p className="mt-1 text-sm">סיבה: {lead.reason}</p>}
        <p className="mt-2 text-sm">נציג מטפל: {lead.employeeName || '-'}</p>
        <p className="text-sm">שיחות: {callCount} · זמן עבודה: {Math.round(workSeconds / 60)} דק'</p>
        {lastSummary && <p className="mt-2 text-sm">שיחה אחרונה: {lastSummary}</p>}
        {employee && (
          <div className="mt-3 space-y-2">
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full rounded-lg border border-border p-2" placeholder="סיבה / הערה" />
            <div className="grid grid-cols-3 gap-2">
              <button type="button" disabled={saving} onClick={() => void changeColor('red')} className="min-h-12 rounded-xl bg-destructive text-white font-bold">אדום</button>
              <button type="button" disabled={saving} onClick={() => void changeColor('yellow')} className="min-h-12 rounded-xl bg-amber-400 font-bold">צהוב</button>
              <button type="button" disabled={saving} onClick={() => void changeColor('green')} className="min-h-12 rounded-xl bg-emerald-600 text-white font-bold">ירוק</button>
            </div>
          </div>
        )}
        {events.length > 0 && (
          <div className="mt-4">
            <h4 className="font-bold">היסטוריית שינוי סטטוס</h4>
            <ul className="mt-1 space-y-1 text-xs">
              {events.map((ev, i) => (
                <li key={i}>{ev.changedAt.slice(0, 16).replace('T', ' ')} · {ev.leadColor} · {leadStatusLabel(ev.leadStatus)}{ev.reason ? ` — ${ev.reason}` : ''}</li>
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
