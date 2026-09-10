import type { FollowUpGroups } from '@/features/telemarketing/hooks/useFollowUps';
import type { TelemarketingFollowUp } from '@/features/telemarketing/types';
import { formatLeadTitle } from '@/features/telemarketing/lib/leadLabel';

interface Props {
  groups: FollowUpGroups;
  onMarkDone: (followUpId: string) => void;
}

function Section({
  title,
  items,
  tone,
  onMarkDone,
}: {
  title: string;
  items: TelemarketingFollowUp[];
  tone: string;
  onMarkDone?: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-4">
      <h4 className={`mb-2 text-sm font-bold ${tone}`}>
        {title} ({items.length})
      </h4>
      <div className="space-y-2">
        {items.map((f) => (
          <div key={f.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
            <div className="min-w-0 text-sm">
              <p className="font-semibold truncate">{formatLeadTitle(f.leadNumber, f.companyName)}</p>
              <p className="text-muted-foreground">
                {f.actionNeeded} · {f.dueDate}
                {f.dueTime ? ` ${f.dueTime}` : ''} {f.owner ? `· ${f.owner}` : ''}
              </p>
            </div>
            {onMarkDone && (
              <button
                type="button"
                onClick={() => onMarkDone(f.id)}
                className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
              >
                סמן כהושלם
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function FollowUpsPanel({ groups, onMarkDone }: Props) {
  const empty =
    groups.urgent.length + groups.late.length + groups.today.length + groups.future.length + groups.done.length === 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="mb-3 text-lg font-bold">לקוחות להמשך טיפול</h3>
      <Section title="דחוף" items={groups.urgent} tone="text-destructive" onMarkDone={onMarkDone} />
      <Section title="באיחור" items={groups.late} tone="text-destructive" onMarkDone={onMarkDone} />
      <Section title="היום" items={groups.today} tone="text-amber-600" onMarkDone={onMarkDone} />
      <Section title="עתידי" items={groups.future} tone="text-muted-foreground" onMarkDone={onMarkDone} />
      <Section title="הושלם" items={groups.done} tone="text-emerald-600" />
      {empty && <p className="text-sm text-muted-foreground">אין Follow-ups כרגע</p>}
    </div>
  );
}
