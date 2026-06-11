import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import {
  ALERT_OPTIONS,
  DEFAULT_PREFS,
  type AlertTypeKey,
  type FleetOSDashboardPrefs,
} from './fleetosTypes';
import { useFleetOSPrefs } from './useFleetOSPrefs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface Props {
  userId: string;
}

function SlotButton({
  index,
  label,
  onEdit,
}: {
  index: number;
  label: string;
  onEdit: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="w-full flex items-center gap-3 p-4 rounded-xl border border-border bg-background hover:bg-muted/40 transition-colors text-right"
    >
      <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-black flex items-center justify-center shrink-0">
        {index + 1}
      </span>
      <span className="flex-1 font-semibold text-foreground">{label}</span>
      <ChevronDown size={16} className="text-muted-foreground" />
    </button>
  );
}

export default function FleetOSDashboardPreferences({ userId }: Props) {
  const { prefs, setPrefs } = useFleetOSPrefs(userId);
  const [pickerSlot, setPickerSlot] = useState<0 | 1 | 2 | null>(null);

  const setAlert = (slot: 0 | 1 | 2, key: AlertTypeKey) => {
    const next = [...prefs.alerts] as [AlertTypeKey, AlertTypeKey, AlertTypeKey];
    next[slot] = key;
    setPrefs({ ...prefs, alerts: next });
  };

  const alertLabel = (k: AlertTypeKey) => ALERT_OPTIONS.find((o) => o.key === k)?.label ?? k;

  const handleSave = () => {
    toast.success('העדפות FleetOS נשמרו');
  };

  return (
    <div id="fleetos-alerts" className="scroll-mt-24">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
          <Check size={22} className="text-primary" />
        </div>
        <div className="text-right flex-1">
          <h2 className="text-lg font-bold">FleetOS AI — התראות בדשבורד</h2>
          <p className="text-sm text-muted-foreground">
            בחר 3 סוגי התראות שיוצגו במסך מצב הצי. נשמר בפרופיל המקומי.
          </p>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        {([0, 1, 2] as const).map((i) => (
          <SlotButton
            key={i}
            index={i}
            label={alertLabel(prefs.alerts[i])}
            onEdit={() => setPickerSlot(i)}
          />
        ))}
      </div>

      <p className="text-xs text-muted-foreground mb-4">
        KPI עליון קבוע: רכבים פעילים · מנוע מונע (בשטח) · במוסך — מחושב מנתוני דליה.
      </p>

      <button
        type="button"
        onClick={handleSave}
        className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold"
      >
        שמור העדפות FleetOS
      </button>

      <Dialog open={pickerSlot !== null} onOpenChange={(o) => !o && setPickerSlot(null)}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>בחר התראה {pickerSlot !== null ? pickerSlot + 1 : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 max-h-[60vh] overflow-y-auto">
            {ALERT_OPTIONS.map((opt) => {
              const isSelected = pickerSlot !== null && prefs.alerts[pickerSlot] === opt.key;
              const isDisabled =
                pickerSlot !== null &&
                prefs.alerts.some((a, i) => i !== pickerSlot && a === opt.key);
              return (
                <button
                  key={opt.key}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => {
                    if (pickerSlot === null) return;
                    setAlert(pickerSlot, opt.key);
                    setPickerSlot(null);
                  }}
                  className={cn(
                    'w-full text-right px-4 py-3 rounded-lg border text-sm font-medium transition-colors',
                    isSelected && 'border-primary bg-primary/5',
                    !isSelected && 'border-border hover:bg-muted/50',
                    isDisabled && 'opacity-40 cursor-not-allowed',
                  )}
                >
                  {opt.label}
                  {isDisabled && <span className="text-xs text-muted-foreground mr-2">(נבחר)</span>}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { DEFAULT_PREFS };
