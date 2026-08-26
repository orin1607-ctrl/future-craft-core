import { CALL_RESULTS, LEAD_RATINGS, URGENCY_LEVELS } from '@/features/telemarketing/types';
import type { ReportDraft } from '@/features/telemarketing/hooks/useActiveCall';
import { LEAD_COLOR_LABEL, LEAD_STATUSES, keepsContinuedTreatment, suggestedLeadTraffic, type LeadColor } from '@/features/telemarketing/lib/leadTraffic';
import { DaliaCareFields } from '@/features/telemarketing/components/DaliaCare/DaliaCareFields';
import { formatLeadTitle } from '@/features/telemarketing/lib/leadLabel';

interface Props {
  draft: ReportDraft;
  onChange: (patch: Partial<ReportDraft>) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
  leadNumber?: string | null;
  companyName?: string | null;
}

const chipBase = 'min-h-12 rounded-xl border px-3 py-2 text-sm text-center select-none transition-colors';
const chipInactive = 'border-border bg-background text-foreground';
const chipActive = 'border-primary bg-primary text-primary-foreground font-semibold';

export function CallReportForm({ draft, onChange, onSubmit, submitting, error, leadNumber, companyName }: Props) {
  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
      {leadNumber && (
        <p className="text-center text-lg font-black" data-testid="tele-lead-number">{formatLeadTitle(leadNumber, companyName)}</p>
      )}
      <div>
        <label className="mb-2 block text-sm font-semibold">תוצאת השיחה</label>
        <div className="grid grid-cols-2 gap-2">
          {CALL_RESULTS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                const suggested = suggestedLeadTraffic(r, draft.needsFollowUp);
                const continued = keepsContinuedTreatment(r);
                onChange({
                  result: r,
                  leadColor: suggested.color,
                  leadStatus: suggested.status,
                  leadColorTouched: false,
                  needsFollowUp: continued ? true : draft.needsFollowUp,
                  followUpDate: continued && !draft.followUpDate ? new Date().toISOString().slice(0, 10) : draft.followUpDate,
                  nextAction: continued && !draft.nextAction ? 'המשך טיפול — אין מענה' : draft.nextAction,
                });
              }}
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

      <div>
        <label className="mb-2 block text-sm font-semibold">רמזור ליד</label>
        <p className="mb-2 text-xs text-muted-foreground">לא ענה לא הופך לאדום. אדום רק בסגירה מפורשת.</p>
        <div className="grid grid-cols-3 gap-2">
          {(['red', 'yellow', 'green'] as LeadColor[]).map((color) => (
            <button
              key={color}
              type="button"
              onClick={() =>
                onChange({
                  leadColor: color,
                  leadStatus: LEAD_STATUSES[color][0].id,
                  leadColorTouched: true,
                  needsFollowUp: color === 'red' ? false : draft.needsFollowUp,
                })
              }
              className={`${chipBase} ${
                draft.leadColor === color
                  ? color === 'red'
                    ? 'border-destructive bg-destructive text-white font-black'
                    : color === 'green'
                      ? 'border-emerald-600 bg-emerald-600 text-white font-black'
                      : 'border-amber-500 bg-amber-400 font-black text-black'
                  : chipInactive
              }`}
            >
              {color === 'red' ? '🔴 אדום' : color === 'yellow' ? '🟡 צהוב' : '🟢 ירוק'}
            </button>
          ))}
        </div>
        {draft.leadColor && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {LEAD_STATUSES[draft.leadColor].map((status) => (
              <button
                key={status.id}
                type="button"
                onClick={() => onChange({ leadStatus: status.id, leadColorTouched: true })}
                className={`${chipBase} ${draft.leadStatus === status.id ? chipActive : chipInactive}`}
              >
                {status.label}
              </button>
            ))}
          </div>
        )}
        {draft.leadColor === 'red' && (
          <div className="mt-3 space-y-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
            <label className="block text-sm font-semibold">
              סיבת סגירה (חובה)
              <textarea
                value={draft.closeReason}
                onChange={(e) => onChange({ closeReason: e.target.value })}
                rows={2}
                className="mt-1 w-full rounded-lg border border-border bg-background p-3"
                placeholder="לדוגמה: עובד עם ספק קבוע ולא רוצה הצעה"
              />
            </label>
            <label className="flex min-h-12 items-center gap-3">
              <input
                type="checkbox"
                checked={draft.closeOpenFollowUps}
                onChange={(e) => onChange({ closeOpenFollowUps: e.target.checked })}
                className="h-5 w-5"
              />
              <span className="text-sm font-semibold">סגור Follow-up פתוח — אין צורך לחזור</span>
            </label>
          </div>
        )}
        {draft.leadColor && <p className="mt-1 text-xs text-muted-foreground">{LEAD_COLOR_LABEL[draft.leadColor]}</p>}
      </div>

      {draft.leadColor !== 'red' && (
      <label className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-muted/40 p-3">
        <input
          type="checkbox"
          checked={draft.needsFollowUp}
          onChange={(e) => onChange({ needsFollowUp: e.target.checked })}
          className="h-5 w-5"
        />
        <span className="font-semibold">נדרשת המשכיות עם הלקוח</span>
      </label>
      )}

      {draft.leadColor !== 'red' && draft.needsFollowUp && (
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

      <DaliaCareFields
        draft={draft}
        onChange={onChange}
      />

      {error && <p className="rounded-lg bg-destructive/10 p-2 text-sm font-semibold text-destructive">{error}</p>}

      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting}
        className="min-h-14 w-full rounded-xl bg-primary py-4 text-lg font-bold text-primary-foreground disabled:opacity-50"
        data-testid="tele-submit-report"
      >
        {submitting ? 'שומר...' : 'שמור וסיים שיחה'}
      </button>
    </div>
  );
}
