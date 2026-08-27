import { WORK_TASK_TYPES } from '@/features/telemarketing/types';
import type { WorkDraft } from '@/features/telemarketing/hooks/useActiveWorkSession';
import { DaliaCareFields } from '@/features/telemarketing/components/DaliaCare/DaliaCareFields';

const chipBase = 'min-h-12 rounded-xl border px-3 py-2 text-sm text-center select-none';
const chipInactive = 'border-border bg-background text-foreground';
const chipActive = 'border-primary bg-primary text-primary-foreground font-semibold';

export function WorkReportForm({
  draft,
  onChange,
  onSubmit,
  submitting,
  error,
  locked = false,
}: {
  draft: WorkDraft;
  onChange: (patch: Partial<WorkDraft>) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
  locked?: boolean;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4" data-testid="tele-work-report">
      <p className="text-base font-black">דיווח משימת עבודה</p>
      <div>
        <label className="mb-2 block text-sm font-semibold">סוג המשימה</label>
        <div className="grid grid-cols-2 gap-2">
          {WORK_TASK_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onChange({ taskType: type })}
              className={`${chipBase} ${draft.taskType === type ? chipActive : chipInactive}`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>
      <label className="block text-sm font-semibold">
        מה בוצע
        <textarea
          value={draft.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={3}
          className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-base"
        />
      </label>
      <label className="block text-sm font-semibold">
        הערה קצרה
        <input
          value={draft.note}
          onChange={(e) => onChange({ note: e.target.value })}
          className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-3"
        />
      </label>
      <p className="text-xs font-semibold text-muted-foreground">לקוח קשור — אופציונלי</p>
      <input
        placeholder="שם חברה"
        value={draft.companyName}
        onChange={(e) => onChange({ companyName: e.target.value })}
        className="min-h-12 w-full rounded-lg border border-border bg-background p-3"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          placeholder="איש קשר"
          value={draft.contactName}
          onChange={(e) => onChange({ contactName: e.target.value })}
          className="min-h-12 rounded-lg border border-border bg-background p-3"
        />
        <input
          placeholder="טלפון"
          value={draft.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
          className="min-h-12 rounded-lg border border-border bg-background p-3"
          dir="ltr"
        />
      </div>
      <label className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-muted/40 p-3">
        <input
          type="checkbox"
          checked={draft.needsFollowUp}
          onChange={(e) => onChange({ needsFollowUp: e.target.checked })}
          className="h-5 w-5"
        />
        <span className="font-semibold">נדרשת פעולה נוספת</span>
      </label>
      <DaliaCareFields draft={draft} onChange={onChange} />
      {error && <p className="rounded-lg bg-destructive/10 p-2 text-sm font-semibold text-destructive">{error}</p>}
      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting || locked}
        title={locked ? 'עבור למצב עבודה' : undefined}
        className="min-h-14 w-full rounded-xl bg-sky-700 py-4 text-lg font-bold text-white disabled:opacity-50"
        data-testid="tele-submit-work"
      >
        {submitting ? 'שומר...' : 'שמור משימת עבודה'}
      </button>
    </div>
  );
}
