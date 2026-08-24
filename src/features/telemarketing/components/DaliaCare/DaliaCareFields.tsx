import { DALIA_CARE_TYPES, URGENCY_LEVELS } from '@/features/telemarketing/types';
import type { UrgencyLevel } from '@/features/telemarketing/types';

export interface DaliaCareDraft {
  needsDaliaCare: boolean;
  daliaCareType: string;
  daliaCareTypeOther: string;
  daliaCareDetail: string;
  daliaCareUrgency: UrgencyLevel;
  daliaCareDueDate: string;
}

export const EMPTY_DALIA_CARE: DaliaCareDraft = {
  needsDaliaCare: false,
  daliaCareType: '',
  daliaCareTypeOther: '',
  daliaCareDetail: '',
  daliaCareUrgency: 'רגיל',
  daliaCareDueDate: '',
};

const chipBase = 'min-h-12 rounded-xl border px-3 py-2 text-sm text-center';
const chipInactive = 'border-border bg-background';
const chipActive = 'border-violet-600 bg-violet-600 text-white font-semibold';

export function DaliaCareFields({
  draft,
  onChange,
}: {
  draft: DaliaCareDraft;
  onChange: (patch: Partial<DaliaCareDraft>) => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-violet-500/40 bg-violet-500/10 p-3">
      <p className="font-black text-violet-800 dark:text-violet-300">🟣 האם נדרש טיפול מצוות דליה?</p>
      <p className="text-xs text-muted-foreground">סגול אינו רמזור ליד. זה בקשה נפרדת לצוות דליה.</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={`${chipBase} ${draft.needsDaliaCare ? chipActive : chipInactive}`} onClick={() => onChange({ needsDaliaCare: true })}>
          כן
        </button>
        <button type="button" className={`${chipBase} ${!draft.needsDaliaCare ? chipActive : chipInactive}`} onClick={() => onChange({ needsDaliaCare: false })}>
          לא
        </button>
      </div>
      {draft.needsDaliaCare && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">סוג הטיפול</p>
          <div className="grid grid-cols-2 gap-2">
            {DALIA_CARE_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => onChange({ daliaCareType: type })}
                className={`${chipBase} ${draft.daliaCareType === type ? chipActive : chipInactive}`}
              >
                {type}
              </button>
            ))}
          </div>
          {draft.daliaCareType === 'אחר' && (
            <input
              placeholder="חובה לפרט"
              value={draft.daliaCareTypeOther}
              onChange={(e) => onChange({ daliaCareTypeOther: e.target.value })}
              className="min-h-12 w-full rounded-lg border border-border bg-background p-3"
            />
          )}
          <label className="block text-sm font-semibold">
            מה צריך לבצע
            <textarea
              value={draft.daliaCareDetail}
              onChange={(e) => onChange({ daliaCareDetail: e.target.value })}
              rows={3}
              className="mt-1 w-full rounded-lg border border-border bg-background p-3"
            />
          </label>
          <div>
            <p className="mb-1 text-xs font-semibold">דחיפות</p>
            <div className="grid grid-cols-3 gap-2">
              {URGENCY_LEVELS.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => onChange({ daliaCareUrgency: u })}
                  className={`${chipBase} ${draft.daliaCareUrgency === u ? chipActive : chipInactive}`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          <label className="block text-xs font-semibold">
            מועד רצוי (אופציונלי)
            <input
              type="date"
              value={draft.daliaCareDueDate}
              onChange={(e) => onChange({ daliaCareDueDate: e.target.value })}
              className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-3"
            />
          </label>
        </div>
      )}
    </div>
  );
}
