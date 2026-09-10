import { useCallback, useEffect, useState } from 'react';
import { listAssignableAgents } from '@/features/telemarketing/services/leadDirectoryService';
import { previewStuckAction } from '@/features/telemarketing/services/stuckActionService';
import { deriveAgentNowStatus, type AgentNowStatus } from '@/features/telemarketing/lib/agentNowStatus';
import { formatStamp } from '@/features/telemarketing/lib/formatTime';

const REFRESH_MS = 60000;

export function AgentNowStatusPanel({ reloadToken }: { reloadToken?: number }) {
  const [rows, setRows] = useState<AgentNowStatus[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const agents = await listAssignableAgents();
      const next: AgentNowStatus[] = [];
      for (const agent of agents) {
        next.push(deriveAgentNowStatus(await previewStuckAction(agent.id)));
      }
      setRows(next);
      setUpdatedAt(new Date());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בטעינת מצב עובדים');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  useEffect(() => {
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const selected = rows.find((row) => row.employeeId === selectedId) || null;

  return (
    <section data-testid="tele-agent-now-status" className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-black">מצב עכשיו</h3>
          <p className="text-xs text-muted-foreground">
            צפייה בלבד מנתוני שיחה / דיווח / נעילת ליד קיימים. לא משנה את העובדת.
            {updatedAt ? ` · עודכן ${updatedAt.toLocaleTimeString('he-IL')}` : ''}
          </p>
        </div>
        <button
          type="button"
          data-testid="tele-agent-now-refresh"
          onClick={() => void load()}
          className="min-h-12 rounded-xl border border-border px-4 text-sm font-black"
        >
          רענון מצב
        </button>
      </div>
      {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <button
            key={row.employeeId}
            type="button"
            data-testid={`tele-agent-now-${row.employeeId}`}
            onClick={() => setSelectedId(selectedId === row.employeeId ? null : row.employeeId)}
            className={`rounded-xl border p-3 text-right ${selectedId === row.employeeId ? 'border-primary bg-primary/10' : 'border-border'}`}
          >
            <p className="font-black">{row.employeeName}</p>
            <p className="text-sm font-semibold">{row.label}</p>
            {row.companyName ? (
              <p className="text-xs text-muted-foreground">
                {row.leadNumber ? `#${row.leadNumber} · ` : ''}{row.companyName}
              </p>
            ) : null}
          </button>
        ))}
      </div>
      {selected && (
        <div data-testid="tele-agent-now-detail" className="space-y-1 rounded-xl border border-border bg-background p-3 text-sm">
          <p className="font-black">{selected.employeeName}</p>
          <p>מצב: {selected.label}</p>
          {selected.leadNumber ? <p>מספר ליד: {selected.leadNumber}</p> : null}
          {selected.companyName ? <p>חברה: {selected.companyName}</p> : null}
          {selected.activityStartedAt ? <p>תחילת פעילות: {formatStamp(selected.activityStartedAt)}</p> : null}
          {selected.callStartedAt ? <p>תחילת שיחה: {formatStamp(selected.callStartedAt)}</p> : null}
          {selected.reportStartedAt ? <p>שלב דיווח מ: {formatStamp(selected.reportStartedAt)}</p> : null}
          {selected.kind === 'idle' ? <p>אין פעולת עבודה פעילה לפי השיחות / המשימות / הנעילות הקיימות.</p> : null}
        </div>
      )}
    </section>
  );
}
