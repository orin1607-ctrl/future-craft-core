import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings2, ShieldAlert, Car, Wrench, IdCard, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  type HomeAlertPrefs,
  type HomeAlertSlotPrefs,
  type HomeAlertSlotType,
  HOME_ALERT_SLOT_LABELS,
  DEFAULT_HOME_ALERT_PREFS,
} from '@/hooks/useHomeAlertPrefs';
import { loadFleetAlertSlotSummaries, type FleetAlertSlotSummary } from '@/lib/fleetAlerts';

const SLOT_ICONS: Record<HomeAlertSlotType, typeof Car> = {
  test: Car,
  insurance: ShieldAlert,
  service: Wrench,
  comprehensive_insurance: ShieldAlert,
  license: IdCard,
  fault: Wrench,
  service_order: Briefcase,
};

const severityBorder: Record<FleetAlertSlotSummary['severity'], string> = {
  critical: 'border-destructive/50 bg-destructive/5',
  warning: 'border-amber-500/40 bg-amber-500/5',
  info: 'border-border bg-card',
};

function AlertSlotCard({ summary, loading }: { summary: FleetAlertSlotSummary; loading: boolean }) {
  const Icon = SLOT_ICONS[summary.type];
  return (
    <Link
      to={summary.link}
      className={`card-elevated block p-4 min-h-[100px] border-2 transition-colors hover:border-primary/40 ${severityBorder[summary.severity]}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Icon size={20} className="text-primary shrink-0" />
          <span className="font-bold text-sm">{summary.label}</span>
        </div>
        <span className="text-2xl font-black text-primary">{loading ? '…' : summary.count}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-snug">{loading ? 'טוען…' : summary.subtitle}</p>
    </Link>
  );
}

function SlotEditor({
  index,
  slot,
  onChange,
}: {
  index: number;
  slot: HomeAlertSlotPrefs;
  onChange: (next: HomeAlertSlotPrefs) => void;
}) {
  const types = Object.keys(HOME_ALERT_SLOT_LABELS) as HomeAlertSlotType[];

  return (
    <div className="card-elevated p-4 space-y-3">
      <p className="font-bold text-sm">התראה {index + 1}</p>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">סוג התראה</label>
        <select
          value={slot.type}
          onChange={(e) => onChange({ ...slot, type: e.target.value as HomeAlertSlotType })}
          className="w-full p-3 rounded-xl border-2 border-input bg-background text-sm"
        >
          {types.map((t) => (
            <option key={t} value={t}>
              {HOME_ALERT_SLOT_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">ימים מראש</label>
        <input
          type="number"
          min={1}
          max={365}
          value={slot.daysBefore}
          onChange={(e) => onChange({ ...slot, daysBefore: Math.max(1, Number(e.target.value) || 30) })}
          className="w-full p-3 rounded-xl border-2 border-input bg-background text-sm"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">תאריך יעד (אופציונלי)</label>
        <input
          type="date"
          value={slot.targetDate || ''}
          onChange={(e) => onChange({ ...slot, targetDate: e.target.value || undefined })}
          className="w-full p-3 rounded-xl border-2 border-input bg-background text-sm"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">שעת התראה (אופציונלי)</label>
        <input
          type="time"
          value={slot.alertTime || ''}
          onChange={(e) => onChange({ ...slot, alertTime: e.target.value || undefined })}
          className="w-full p-3 rounded-xl border-2 border-input bg-background text-sm"
        />
      </div>
    </div>
  );
}

export default function HomeAlertsWidget({
  companyFilter,
  prefs,
  onPrefsChange,
}: {
  companyFilter: string | null;
  prefs: HomeAlertPrefs;
  onPrefsChange: (next: HomeAlertPrefs) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [summaries, setSummaries] = useState<FleetAlertSlotSummary[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<HomeAlertPrefs>(prefs);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadFleetAlertSlotSummaries(companyFilter, [...prefs.slots])
      .then((data) => {
        if (!cancelled) setSummaries(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyFilter, prefs]);

  useEffect(() => {
    if (settingsOpen) setDraft(prefs);
  }, [settingsOpen, prefs]);

  const saveSettings = () => {
    onPrefsChange(draft);
    setSettingsOpen(false);
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <ShieldAlert size={20} className="text-primary" />
          התראות צי
        </h2>
        <Button type="button" variant="outline" size="sm" onClick={() => setSettingsOpen(true)} className="gap-1.5">
          <Settings2 size={16} />
          הגדרות
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {summaries.map((s) => (
          <AlertSlotCard key={s.type + s.label} summary={s} loading={loading} />
        ))}
      </div>

      <div className="text-center">
        <Link to="/alerts" className="text-sm text-primary font-medium hover:underline">
          צפה בכל ההתראות →
        </Link>
      </div>

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>הגדרות התראות דשבורד</SheetTitle>
            <SheetDescription>בחר 3 התראות שיוצגו בדשבורד הראשי. ההעדפות נשמרות במכשיר זה בלבד.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-4 pb-6">
            {draft.slots.map((slot, i) => (
              <SlotEditor
                key={i}
                index={i}
                slot={slot}
                onChange={(next) => {
                  const slots = [...draft.slots] as HomeAlertPrefs['slots'];
                  slots[i] = next;
                  setDraft({ slots });
                }}
              />
            ))}
            <div className="flex flex-col sm:flex-row gap-2">
              <Button type="button" className="flex-1" onClick={saveSettings}>
                שמור
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setDraft(DEFAULT_HOME_ALERT_PREFS)}
              >
                איפוס לברירת מחדל
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
