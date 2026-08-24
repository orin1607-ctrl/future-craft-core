import { CALL_RESULTS, LEAD_RATINGS, URGENCY_LEVELS } from '@/features/telemarketing/types';
import type { ReportDraft } from '@/features/telemarketing/hooks/useActiveCall';

interface Props {
  draft: ReportDraft;
  onChange: (patch: Partial<ReportDraft>) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}

const chipBase = 'min-h-12 rounded-xl border px-3 py-2 text-sm text-center select-none transition-colors';
const chipInactive = 'border-border bg-background text-foreground';
const chipActive = 'border-primary bg-primary text-primary-foreground font-semibold';

export function CallReportForm({ draft, onChange, onSubmit, submitting, error }: Props) {
  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div>
        <label className="mb-2 block text-sm font-semibold">תוצאת השיחה</label>
        <div className="grid grid-cols-2 gap-2">
          {CALL_RESULTS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onChange({ result: r })}
              className={`${chipBase} ${draft.result === r ? chipActive : chipInactive}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-semibold">דירוג ליד</label>
        <div className="grid grid-cols-4 gap-2">
          {LEAD_RATINGS.map((r) => {
            const active = draft.leadRating === r;
            const colorActive =
              r === 'דחוף'
                ? 'border-destructive bg-destructive text-destructive-foreground font-bold'
                : r === 'חם'
                  ? 'border-orange-500 bg-orange-500 text-white font-bold'
                  : chipActive;
            return (
              <button
                key={r}
                type="button"
                onClick={() => onChange({ leadRating: r })}
                className={`${chipBase} ${active ? colorActive : chipInactive}`}
              >
                {r}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold">מה הלקוח אמר? / סיכום</label>
        <textarea
          value={draft.summary}
          onChange={(e) => onChange({ summary: e.target.value })}
          rows={3}
          className="w-full rounded-xl border border-border bg-background p-3 text-base"
          placeholder="סיכום קצר..."
        />
      </div>

      <label className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-muted/40 p-3">
        <input
          type="checkbox"
          checked={draft.needsFollowUp}
          onChange={(e) => onChange({ needsFollowUp: e.target.checked })}
          className="h-5 w-5"
        />
        <span className="font-semibold">נדרשת המשכיות עם הלקוח</span>
      </label>

      {draft.needsFollowUp && (
        <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <div>
            <label className="mb-1 block text-xs font-semibold">מה צריך לעשות</label>
            <input
              type="text"
              value={draft.nextAction}
              onChange={(e) => onChange({ nextAction: e.target.value })}
              className="min-h-12 w-full rounded-lg border border-border bg-background p-3"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">מי צריך לטפל</label>
            <input
              type="text"
              value={draft.followUpOwner}
              onChange={(e) => onChange({ followUpOwner: e.target.value })}
              className="min-h-12 w-full rounded-lg border border-border bg-background p-3"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold">תאריך לחזרה</label>
              <input
                type="date"
                value={draft.followUpDate}
                onChange={(e) => onChange({ followUpDate: e.target.value })}
                className="min-h-12 w-full rounded-lg border border-border bg-background p-3"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">שעה (אופציונלי)</label>
              <input
                type="time"
                value={draft.followUpTime}
                onChange={(e) => onChange({ followUpTime: e.target.value })}
                className="min-h-12 w-full rounded-lg border border-border bg-background p-3"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">הערה למנהל</label>
            <input
              type="text"
              value={draft.managerNote}
              onChange={(e) => onChange({ managerNote: e.target.value })}
              className="min-h-12 w-full rounded-lg border border-border bg-background p-3"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">רמת דחיפות</label>
            <div className="grid grid-cols-3 gap-2">
              {URGENCY_LEVELS.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => onChange({ followUpUrgency: u })}
                  className={`${chipBase} ${draft.followUpUrgency === u ? chipActive : chipInactive}`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {error && <p className="rounded-lg bg-destructive/10 p-2 text-sm font-semibold text-destructive">{error}</p>}

      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting}
        className="min-h-14 w-full rounded-xl bg-primary py-4 text-lg font-bold text-primary-foreground disabled:opacity-50"
      >
        {submitting ? 'שומר...' : 'שמור וסיים שיחה'}
      </button>
    </div>
  );
}
