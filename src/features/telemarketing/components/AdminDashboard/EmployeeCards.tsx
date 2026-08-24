import type { AgentPerformance } from '@/features/telemarketing/types';

interface Props {
  agents: AgentPerformance[];
  selectedAgent?: string | null;
  onSelectAgent: (employeeName: string | null) => void;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${m} דק'`;
}

export function EmployeeCards({ agents, selectedAgent, onSelectAgent }: Props) {
  if (agents.length === 0) {
    return <p className="text-sm text-muted-foreground">אין עדיין נתוני עובדים</p>;
  }

  return (
    <div className="space-y-2">
      <h3 className="text-lg font-bold">כרטיסי עובדים</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((a) => {
          const active = selectedAgent === a.employeeName;
          return (
            <button
              key={a.employeeId || a.employeeName}
              type="button"
              onClick={() => onSelectAgent(active ? null : a.employeeName)}
              className={`rounded-2xl border p-4 text-right transition ${
                active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-primary/50'
              }`}
            >
              <p className="font-bold">{a.employeeName}</p>
              {a.employeeCode && (
                <p className={`text-xs ${active ? 'opacity-80' : 'text-muted-foreground'}`}>{a.employeeCode}</p>
              )}
              <div className={`mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs ${active ? 'opacity-90' : 'text-muted-foreground'}`}>
                <span>שיחות היום: {a.callsToday}</span>
                <span>נענו: {a.answeredToday}</span>
                <span>לידים חמים: {a.hotLeads}</span>
                <span>Follow-ups: {a.followUpsOpen}</span>
                <span>זמן שיחה: {formatDuration(a.totalCallDurationSeconds)}</span>
                <span>ממוצע: {formatDuration(a.avgCallDurationSeconds)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
